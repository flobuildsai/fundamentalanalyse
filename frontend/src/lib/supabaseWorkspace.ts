import type { User } from "@supabase/supabase-js";

import type { Analysis, Assumptions, GrowthSource } from "../types/analysis";
import type { Json } from "../types/supabase";
import { DEFAULT_WATCHLIST, type WorkspaceState } from "./workspace";
import { isSupabaseConfigured, getSupabase } from "./supabaseClient";

const DEFAULT_WORKSPACE_NAME = "Default";

export interface CloudSession {
  configured: boolean;
  user: User | null;
}

export interface RemoteWorkspace {
  workspaceId: string;
  isEmpty: boolean;
  state: WorkspaceState;
}

type WatchlistRow = {
  ticker: string;
  sort_order: number;
};

type AssumptionRow = {
  ticker: string;
  required_return: number | string;
  estimated_growth: number | string;
  growth_source: string;
};

type NoteRow = {
  ticker: string;
  body: string;
};

type SnapshotRow = {
  ticker: string;
  analysis: Json;
};

function assertSupabase() {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }
  return supabase;
}

function normalizeTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase();
  return /^[A-Z0-9._-]{1,12}$/.test(ticker) ? ticker : null;
}

function isGrowthSource(value: unknown): value is GrowthSource {
  return value === "manual" || value === "zacks" || value === "analyst";
}

function rowToAssumptions(row: AssumptionRow): Assumptions | null {
  const requiredReturn = Number(row.required_return);
  const estimatedGrowth = Number(row.estimated_growth);
  if (!Number.isFinite(requiredReturn) || !Number.isFinite(estimatedGrowth)) {
    return null;
  }

  return {
    requiredReturn,
    estimatedGrowth,
    growthSource: isGrowthSource(row.growth_source) ? row.growth_source : "analyst",
    marginOfSafetyTarget: 0.3,
    exitMultiple: null,
    currentEPSOverride: null,
  };
}

function requireUser(user: User | null): User {
  if (!user) throw new Error("Bitte zuerst bei Supabase anmelden.");
  return user;
}

export async function getCloudSession(): Promise<CloudSession> {
  const supabase = getSupabase();
  if (!supabase) return { configured: false, user: null };

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  return {
    configured: isSupabaseConfigured,
    user: data.session?.user ?? null,
  };
}

export function subscribeToAuth(
  onChange: (session: CloudSession) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    onChange({ configured: false, user: null });
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange({ configured: true, user: session?.user ?? null });
  });

  return () => data.subscription.unsubscribe();
}

export async function sendMagicLink(email: string): Promise<void> {
  const supabase = assertSupabase();
  const redirectTo = window.location.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOutFromSupabase(): Promise<void> {
  const supabase = assertSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function ensureDefaultWorkspace(user: User): Promise<string> {
  const supabase = assertSupabase();
  const existing = await supabase
    .from("workspaces")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", DEFAULT_WORKSPACE_NAME)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id as string;

  const created = await supabase
    .from("workspaces")
    .insert({ user_id: user.id, name: DEFAULT_WORKSPACE_NAME })
    .select("id")
    .single();

  if (created.error) throw created.error;
  return created.data.id as string;
}

export async function loadRemoteWorkspace(
  user: User | null,
): Promise<RemoteWorkspace> {
  const currentUser = requireUser(user);
  const supabase = assertSupabase();
  const workspaceId = await ensureDefaultWorkspace(currentUser);

  const [watchlistResult, assumptionsResult, notesResult] = await Promise.all([
    supabase
      .from("watchlist_items")
      .select("ticker, sort_order")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assumptions")
      .select("ticker, required_return, estimated_growth, growth_source")
      .eq("user_id", currentUser.id),
    supabase.from("notes").select("ticker, body").eq("user_id", currentUser.id),
  ]);

  if (watchlistResult.error) throw watchlistResult.error;
  if (assumptionsResult.error) throw assumptionsResult.error;
  if (notesResult.error) throw notesResult.error;

  const rawWatchlist = (watchlistResult.data ?? []) as WatchlistRow[];
  const rawAssumptions = (assumptionsResult.data ?? []) as AssumptionRow[];
  const rawNotes = (notesResult.data ?? []) as NoteRow[];

  const watchlist = rawWatchlist
    .map((row) => normalizeTicker(row.ticker))
    .filter((ticker): ticker is string => ticker !== null);

  const assumptionsByTicker: Record<string, Assumptions> = {};
  for (const row of rawAssumptions) {
    const ticker = normalizeTicker(row.ticker);
    const assumptions = rowToAssumptions(row);
    if (ticker && assumptions) assumptionsByTicker[ticker] = assumptions;
  }

  const notesByTicker: Record<string, string> = {};
  for (const row of rawNotes) {
    const ticker = normalizeTicker(row.ticker);
    if (ticker) notesByTicker[ticker] = row.body.slice(0, 3000);
  }

  return {
    workspaceId,
    isEmpty: rawWatchlist.length === 0 && rawAssumptions.length === 0 && rawNotes.length === 0,
    state: {
      watchlist: watchlist.length ? watchlist : DEFAULT_WATCHLIST,
      assumptionsByTicker,
      notesByTicker,
    },
  };
}

export async function saveRemoteWorkspace(
  user: User | null,
  state: WorkspaceState,
): Promise<void> {
  const currentUser = requireUser(user);
  const supabase = assertSupabase();
  const workspaceId = await ensureDefaultWorkspace(currentUser);
  const watchlist = Array.from(new Set(state.watchlist.map(normalizeTicker))).filter(
    (ticker): ticker is string => ticker !== null,
  );

  const deleteWatchlist = await supabase
    .from("watchlist_items")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", currentUser.id);
  if (deleteWatchlist.error) throw deleteWatchlist.error;

  if (watchlist.length) {
    const insertWatchlist = await supabase.from("watchlist_items").insert(
      watchlist.map((ticker, index) => ({
        workspace_id: workspaceId,
        user_id: currentUser.id,
        ticker,
        sort_order: index,
      })),
    );
    if (insertWatchlist.error) throw insertWatchlist.error;
  }

  const deleteAssumptions = await supabase
    .from("assumptions")
    .delete()
    .eq("user_id", currentUser.id);
  if (deleteAssumptions.error) throw deleteAssumptions.error;

  const assumptionRows = Object.entries(state.assumptionsByTicker)
    .map(([ticker, assumptions]) => {
      const symbol = normalizeTicker(ticker);
      if (!symbol) return null;
      return {
        user_id: currentUser.id,
        ticker: symbol,
        required_return: assumptions.requiredReturn,
        estimated_growth: assumptions.estimatedGrowth,
        growth_source: assumptions.growthSource,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (assumptionRows.length) {
    const insertAssumptions = await supabase
      .from("assumptions")
      .insert(assumptionRows);
    if (insertAssumptions.error) throw insertAssumptions.error;
  }

  const deleteNotes = await supabase
    .from("notes")
    .delete()
    .eq("user_id", currentUser.id);
  if (deleteNotes.error) throw deleteNotes.error;

  const noteRows = Object.entries(state.notesByTicker)
    .map(([ticker, body]) => {
      const symbol = normalizeTicker(ticker);
      if (!symbol) return null;
      return {
        user_id: currentUser.id,
        ticker: symbol,
        body: body.slice(0, 3000),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (noteRows.length) {
    const insertNotes = await supabase.from("notes").insert(noteRows);
    if (insertNotes.error) throw insertNotes.error;
  }
}

export async function saveAnalysisSnapshot(
  user: User | null,
  analysis: Analysis,
): Promise<void> {
  const currentUser = requireUser(user);
  const supabase = assertSupabase();
  const insert = await supabase.from("analysis_snapshots").insert({
    user_id: currentUser.id,
    ticker: analysis.ticker,
    company_name: analysis.companyName,
    currency: analysis.currency,
    data_source: analysis.dataSource ?? null,
    current_price: analysis.currentPrice,
    intrinsic_value: analysis.valuation.intrinsicValue,
    decision_rating: analysis.decision.rating,
    analysis: analysis as unknown as Json,
  });

  if (insert.error) throw insert.error;
}

export async function loadLatestAnalysisSnapshots(
  user: User | null,
  tickers: string[],
): Promise<Record<string, Analysis>> {
  requireUser(user);
  const supabase = assertSupabase();
  const symbols = Array.from(
    new Set(tickers.map(normalizeTicker).filter((ticker): ticker is string => ticker !== null)),
  );
  if (!symbols.length) return {};

  const result = await supabase
    .from("analysis_snapshots")
    .select("ticker, analysis")
    .in("ticker", symbols)
    .order("created_at", { ascending: false })
    .limit(Math.max(20, symbols.length * 4));

  if (result.error) throw result.error;

  const analyses: Record<string, Analysis> = {};
  for (const row of (result.data ?? []) as SnapshotRow[]) {
    const ticker = normalizeTicker(row.ticker);
    if (!ticker || analyses[ticker]) continue;
    if (row.analysis && typeof row.analysis === "object") {
      analyses[ticker] = row.analysis as unknown as Analysis;
    }
  }

  return analyses;
}
