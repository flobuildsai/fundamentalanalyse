import type { User } from "@supabase/supabase-js";

import type {
  OptionJournalEntry,
  OptionStrategyKind,
  OptionTradeMetrics,
  OptionTradeRequest,
} from "../types/options";
import type { Database } from "../types/supabase";
import { getSupabase } from "./supabaseClient";
import { ensureDefaultWorkspace } from "./supabaseWorkspace";

const STORAGE_KEY = "fundamental-analyst:options-journal:v1";

type OptionTradeRow = Database["public"]["Tables"]["option_trades"]["Row"];
type OptionTradeInsert = Database["public"]["Tables"]["option_trades"]["Insert"];

function nowIso() {
  return new Date().toISOString();
}

function isStrategyKind(value: unknown): value is OptionStrategyKind {
  return (
    value === "cash_secured_put" ||
    value === "short_put" ||
    value === "covered_call" ||
    value === "bull_put_spread" ||
    value === "bear_call_spread"
  );
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizeTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase();
  return /^[A-Z0-9._-]{1,16}$/.test(ticker) ? ticker : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeRequest(value: unknown): OptionTradeRequest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OptionTradeRequest>;
  const strategyKind = candidate.strategyKind;
  const underlying = normalizeTicker(candidate.underlying);
  const openedAt = normalizeDate(candidate.openedAt);
  const expiry = normalizeDate(candidate.expiry);
  const underlyingPrice = numberOrNull(candidate.underlyingPrice);
  const shortStrike = numberOrNull(candidate.shortStrike);
  const premium = numberOrNull(candidate.premium);
  if (
    !isStrategyKind(strategyKind) ||
    !underlying ||
    !openedAt ||
    !expiry ||
    underlyingPrice === null ||
    shortStrike === null ||
    premium === null
  ) {
    return null;
  }

  return {
    strategyKind,
    underlying,
    openedAt,
    expiry,
    underlyingPrice,
    shortStrike,
    premium,
    fees: numberOrNull(candidate.fees) ?? 0,
    longStrike: numberOrNull(candidate.longStrike),
    contracts: numberOrNull(candidate.contracts) ?? 1,
    multiplier: numberOrNull(candidate.multiplier) ?? 100,
    buybackTargetPct: numberOrNull(candidate.buybackTargetPct) ?? 0.2,
    closedAt: normalizeDate(candidate.closedAt) ?? null,
    actualBuybackPrice: numberOrNull(candidate.actualBuybackPrice),
  };
}

function normalizeMetrics(value: unknown): OptionTradeMetrics | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OptionTradeMetrics>;
  const dte = numberOrNull(candidate.dte);
  const distanceToPricePct = numberOrNull(candidate.distanceToPricePct);
  const netPremium = numberOrNull(candidate.netPremium);
  const capitalAtRiskPerShare = numberOrNull(candidate.capitalAtRiskPerShare);
  const returnOnRisk = numberOrNull(candidate.returnOnRisk);
  const annualizationMultiplier = numberOrNull(candidate.annualizationMultiplier);
  const annualizedReturn = numberOrNull(candidate.annualizedReturn);
  const totalPremium = numberOrNull(candidate.totalPremium);
  const totalRisk = numberOrNull(candidate.totalRisk);
  const breakeven = numberOrNull(candidate.breakeven);
  const buybackTargetPrice = numberOrNull(candidate.buybackTargetPrice);

  if (
    dte === null ||
    distanceToPricePct === null ||
    netPremium === null ||
    capitalAtRiskPerShare === null ||
    returnOnRisk === null ||
    annualizationMultiplier === null ||
    annualizedReturn === null ||
    totalPremium === null ||
    totalRisk === null ||
    breakeven === null ||
    buybackTargetPrice === null
  ) {
    return null;
  }

  return {
    dte,
    distanceToPricePct,
    spreadWidth: numberOrNull(candidate.spreadWidth),
    netPremium,
    capitalAtRiskPerShare,
    returnOnRisk,
    annualizationMultiplier,
    annualizedReturn,
    totalPremium,
    totalRisk,
    breakeven,
    buybackTargetPrice,
    realizedAnnualizedReturn: numberOrNull(candidate.realizedAnnualizedReturn),
    status: typeof candidate.status === "string" ? candidate.status : "open",
    dataQuality:
      typeof candidate.dataQuality === "string" ? candidate.dataQuality : "ok",
    warnings: Array.isArray(candidate.warnings)
      ? candidate.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };
}

function normalizeEntry(value: unknown): OptionJournalEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OptionJournalEntry>;
  if (typeof candidate.id !== "string" || !candidate.id) return null;
  const request = normalizeRequest(candidate.request);
  const metrics = normalizeMetrics(candidate.metrics);
  if (!request || !metrics) return null;
  return {
    id: candidate.id,
    request,
    metrics,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : nowIso(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
    source: candidate.source === "supabase" ? "supabase" : "local",
  };
}

function sortEntries(entries: OptionJournalEntry[]): OptionJournalEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function createOptionJournalEntry(
  request: OptionTradeRequest,
  metrics: OptionTradeMetrics,
): OptionJournalEntry {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    request,
    metrics,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "local",
  };
}

export function loadLocalOptionJournal(): OptionJournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortEntries(
      parsed
        .map(normalizeEntry)
        .filter((entry): entry is OptionJournalEntry => entry !== null),
    );
  } catch {
    return [];
  }
}

export function saveLocalOptionJournal(entries: OptionJournalEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sortEntries(entries)));
}

export function upsertLocalOptionEntry(
  entries: OptionJournalEntry[],
  entry: OptionJournalEntry,
): OptionJournalEntry[] {
  const withoutCurrent = entries.filter((current) => current.id !== entry.id);
  return sortEntries([entry, ...withoutCurrent]).slice(0, 80);
}

export function removeLocalOptionEntry(
  entries: OptionJournalEntry[],
  id: string,
): OptionJournalEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

function rowToEntry(row: OptionTradeRow): OptionJournalEntry | null {
  const strategyKind = row.strategy_kind;
  const underlying = normalizeTicker(row.underlying);
  if (!isStrategyKind(strategyKind) || !underlying) return null;

  const request: OptionTradeRequest = {
    strategyKind,
    underlying,
    openedAt: row.opened_at,
    expiry: row.expiry,
    underlyingPrice: Number(row.underlying_price_open ?? 0),
    shortStrike: Number(row.short_strike),
    premium: Number(row.premium),
    fees: Number(row.fees ?? 0),
    longStrike: row.long_strike == null ? null : Number(row.long_strike),
    contracts: Number(row.contracts ?? 1),
    multiplier: Number(row.multiplier ?? 100),
    buybackTargetPct: Number(row.buyback_target_pct ?? 0.2),
    closedAt: row.closed_at,
    actualBuybackPrice:
      row.actual_buyback_price == null ? null : Number(row.actual_buyback_price),
  };

  const metrics: OptionTradeMetrics = {
    dte: Math.max(
      0,
      Math.round(
        (Date.parse(row.expiry) - Date.parse(row.opened_at)) / 86_400_000,
      ),
    ),
    distanceToPricePct: Number(row.distance_to_price_pct ?? 0),
    spreadWidth: row.spread_width == null ? null : Number(row.spread_width),
    netPremium: Number(row.net_premium ?? row.premium),
    capitalAtRiskPerShare: Number(row.capital_at_risk_per_share ?? 0),
    returnOnRisk: Number(row.return_on_risk ?? 0),
    annualizationMultiplier: 0,
    annualizedReturn: Number(row.annualized_return ?? 0),
    totalPremium: Number(row.total_premium ?? 0),
    totalRisk: Number(row.total_risk ?? row.capital_at_risk ?? 0),
    breakeven: Number(row.breakeven ?? 0),
    buybackTargetPrice: Number(row.buyback_target_price ?? 0),
    realizedAnnualizedReturn:
      row.realized_annualized_return == null
        ? null
        : Number(row.realized_annualized_return),
    status: row.status,
    dataQuality: row.data_quality,
    warnings: row.data_quality === "ok" ? [] : [row.data_quality],
  };

  return {
    id: row.id,
    request,
    metrics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: "supabase",
  };
}

function entryToRow(
  user: User,
  workspaceId: string,
  entry: OptionJournalEntry,
): OptionTradeInsert {
  const request = entry.request;
  const metrics = entry.metrics;
  return {
    id: entry.id,
    workspace_id: workspaceId,
    user_id: user.id,
    strategy_kind: request.strategyKind,
    underlying: request.underlying.trim().toUpperCase(),
    opened_at: request.openedAt,
    expiry: request.expiry,
    underlying_price_open: request.underlyingPrice,
    short_strike: request.shortStrike,
    long_strike: request.longStrike ?? null,
    spread_width: metrics.spreadWidth,
    contracts: request.contracts ?? 1,
    multiplier: request.multiplier ?? 100,
    premium: request.premium,
    fees: request.fees ?? 0,
    net_premium: metrics.netPremium,
    total_premium: metrics.totalPremium,
    total_risk: metrics.totalRisk,
    distance_to_price_pct: metrics.distanceToPricePct,
    capital_at_risk: metrics.totalRisk,
    capital_at_risk_per_share: metrics.capitalAtRiskPerShare,
    return_on_risk: metrics.returnOnRisk,
    annualized_return: metrics.annualizedReturn,
    breakeven: metrics.breakeven,
    buyback_target_pct: request.buybackTargetPct ?? 0.2,
    buyback_target_price: metrics.buybackTargetPrice,
    closed_at: request.closedAt ?? null,
    actual_buyback_price: request.actualBuybackPrice ?? null,
    realized_annualized_return: metrics.realizedAnnualizedReturn,
    status:
      metrics.status === "closed" || metrics.status === "invalid"
        ? metrics.status
        : "open",
    data_quality:
      metrics.dataQuality === "ok" || metrics.dataQuality === "placeholder_or_invalid"
        ? metrics.dataQuality
        : "warning",
    source: entry.source,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export async function loadRemoteOptionJournal(user: User): Promise<OptionJournalEntry[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const workspaceId = await ensureDefaultWorkspace(user);
  const result = await supabase
    .from("option_trades")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("opened_at", { ascending: false })
    .limit(80);
  if (result.error) throw result.error;
  return sortEntries(
    (result.data ?? [])
      .map(rowToEntry)
      .filter((entry): entry is OptionJournalEntry => entry !== null),
  );
}

export async function saveRemoteOptionEntry(
  user: User,
  entry: OptionJournalEntry,
): Promise<OptionJournalEntry> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const workspaceId = await ensureDefaultWorkspace(user);
  const syncedEntry: OptionJournalEntry = {
    ...entry,
    source: "supabase",
    updatedAt: nowIso(),
  };
  const result = await supabase
    .from("option_trades")
    .upsert(entryToRow(user, workspaceId, syncedEntry), { onConflict: "id" })
    .select("*")
    .single();
  if (result.error) throw result.error;
  return rowToEntry(result.data as OptionTradeRow) ?? syncedEntry;
}

export async function deleteRemoteOptionEntry(user: User, id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const result = await supabase
    .from("option_trades")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (result.error) throw result.error;
}
