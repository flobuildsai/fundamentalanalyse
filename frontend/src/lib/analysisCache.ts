import type { Analysis } from "../types/analysis";

const STORAGE_KEY = "fundamental-analyst:analysis-cache:v2";
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24;

interface CacheEntry {
  storedAt: string;
  analysis: Analysis;
}

function readCache(): Record<string, CacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, CacheEntry>)
      : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

function isFresh(entry: CacheEntry): boolean {
  const time = Date.parse(entry.storedAt);
  return Number.isFinite(time) && Date.now() - time <= MAX_CACHE_AGE_MS;
}

export function loadCachedAnalyses(tickers: string[]): Record<string, Analysis> {
  const cache = readCache();
  const analyses: Record<string, Analysis> = {};

  for (const ticker of tickers) {
    const symbol = ticker.trim().toUpperCase();
    const entry = cache[symbol];
    if (entry && isFresh(entry)) analyses[symbol] = entry.analysis;
  }

  return analyses;
}

export function saveCachedAnalysis(analysis: Analysis): void {
  const cache = readCache();
  cache[analysis.ticker] = {
    storedAt: new Date().toISOString(),
    analysis,
  };
  writeCache(cache);
}

export function removeCachedAnalysis(ticker: string): void {
  const symbol = ticker.trim().toUpperCase();
  const cache = readCache();
  delete cache[symbol];
  writeCache(cache);
}
