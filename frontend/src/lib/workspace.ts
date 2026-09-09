import type { Assumptions, GrowthSource } from "../types/analysis";

const STORAGE_KEY = "fundamental-analyst:workspace:v2";
const LEGACY_STORAGE_KEYS = ["fundamental-analyst:workspace:v1"];
export const DEFAULT_WATCHLIST = ["AA", "AAPL", "MSFT", "NVDA", "TSLA", "KO"];

export interface WorkspaceState {
  watchlist: string[];
  assumptionsByTicker: Record<string, Assumptions>;
  notesByTicker: Record<string, string>;
}

const DEFAULT_WORKSPACE: WorkspaceState = {
  watchlist: DEFAULT_WATCHLIST,
  assumptionsByTicker: {},
  notesByTicker: {},
};

function isGrowthSource(value: unknown): value is GrowthSource {
  return value === "manual" || value === "zacks" || value === "analyst";
}

export function normalizeAssumptions(
  value: unknown,
  options: { migrateLegacyZacks?: boolean } = {},
): Assumptions | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Assumptions>;
  if (
    typeof candidate.requiredReturn !== "number" ||
    typeof candidate.estimatedGrowth !== "number"
  ) {
    return null;
  }

  const growthSource =
    options.migrateLegacyZacks && candidate.growthSource === "zacks"
      ? "analyst"
      : candidate.growthSource;

  return {
    requiredReturn: candidate.requiredReturn,
    estimatedGrowth: candidate.estimatedGrowth,
    growthSource: isGrowthSource(growthSource) ? growthSource : "analyst",
    marginOfSafetyTarget:
      typeof candidate.marginOfSafetyTarget === "number"
        ? Math.min(Math.max(candidate.marginOfSafetyTarget, 0), 0.9)
        : 0.3,
    exitMultiple:
      typeof candidate.exitMultiple === "number" && candidate.exitMultiple > 0
        ? candidate.exitMultiple
        : null,
    currentEPSOverride:
      typeof candidate.currentEPSOverride === "number" &&
      candidate.currentEPSOverride > 0
        ? candidate.currentEPSOverride
        : null,
  };
}

function normalizeTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase();
  return /^[A-Z0-9._-]{1,12}$/.test(ticker) ? ticker : null;
}

function isTicker(value: string | null): value is string {
  return value !== null;
}

export function loadWorkspace(): WorkspaceState {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;

  try {
    let isLegacy = false;
    let raw = window.localStorage.getItem(STORAGE_KEY);
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      if (raw) break;
      raw = window.localStorage.getItem(legacyKey);
      isLegacy = Boolean(raw);
    }
    if (!raw) return DEFAULT_WORKSPACE;
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;

    const watchlist =
      Array.isArray(parsed.watchlist)
        ? Array.from(
            new Set(parsed.watchlist.map(normalizeTicker).filter(isTicker)),
          )
        : DEFAULT_WORKSPACE.watchlist;

    const assumptionsByTicker: Record<string, Assumptions> = {};
    if (
      parsed.assumptionsByTicker &&
      typeof parsed.assumptionsByTicker === "object"
    ) {
      for (const [ticker, assumptions] of Object.entries(parsed.assumptionsByTicker)) {
        const symbol = normalizeTicker(ticker);
        const normalized = normalizeAssumptions(assumptions, {
          migrateLegacyZacks: isLegacy,
        });
        if (symbol && normalized) assumptionsByTicker[symbol] = normalized;
      }
    }

    const notesByTicker: Record<string, string> = {};
    if (parsed.notesByTicker && typeof parsed.notesByTicker === "object") {
      for (const [ticker, note] of Object.entries(parsed.notesByTicker)) {
        const symbol = normalizeTicker(ticker);
        if (symbol && typeof note === "string") notesByTicker[symbol] = note.slice(0, 3000);
      }
    }

    const migratedWatchlist =
      watchlist.length === 1 &&
      watchlist[0] === "AA" &&
      (isLegacy || Object.keys(notesByTicker).length === 0)
        ? DEFAULT_WORKSPACE.watchlist
        : watchlist;

    return {
      watchlist: migratedWatchlist.length
        ? migratedWatchlist
        : DEFAULT_WORKSPACE.watchlist,
      assumptionsByTicker,
      notesByTicker,
    };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
