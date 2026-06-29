import { useMemo, useState } from "react";

import type { Analysis } from "../types/analysis";
import { money, pct } from "../lib/format";

const QUICK_TICKERS = ["AA", "AAPL", "MSFT", "NVDA", "TSLA", "KO"];

type SortMode = "rank" | "margin" | "score" | "quality" | "debt" | "data";

interface SortOption {
  mode: SortMode;
  label: string;
  shortLabel: string;
}

interface WatchlistMetrics {
  margin: number | null;
  score: number | null;
  qualitySpread: number | null;
  debtToFcf: number | null;
  debtSignal: number | null;
  dataSignal: number;
  rank: number | null;
}

interface RankedTicker {
  ticker: string;
  analysis: Analysis | undefined;
  loading: boolean;
  metrics: WatchlistMetrics;
  sortValue: number | null;
}

const SORT_OPTIONS: SortOption[] = [
  { mode: "rank", label: "Bestes Setup", shortLabel: "Setup" },
  { mode: "margin", label: "Sicherheitsmarge", shortLabel: "Marge" },
  { mode: "score", label: "Score", shortLabel: "Score" },
  { mode: "quality", label: "ROIC-Spread", shortLabel: "Qualität" },
  { mode: "debt", label: "Schuldenrisiko", shortLabel: "Schulden" },
  { mode: "data", label: "Datenqualität", shortLabel: "Daten" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | null | undefined): number | null {
  return value === null || value === undefined || Number.isNaN(value) ? null : value;
}

function sourceScore(source: Analysis["dataSource"]): number {
  if (source === "fmp") return 100;
  if (source === "sec") return 84;
  if (source === "yahoo") return 55;
  return 20;
}

function dataLabel(source: Analysis["dataSource"]): string {
  if (source === "fmp") return "FMP Pro";
  if (source === "sec") return "SEC";
  if (source === "yahoo") return "Yahoo";
  return "offen";
}

function debtSignal(analysis: Analysis): number | null {
  const debtToFcf = finite(analysis.debt.debtToFcf);
  if (debtToFcf !== null) {
    if (debtToFcf <= 0) return 100;
    if (debtToFcf <= 3) return 100 - debtToFcf * 6;
    if (debtToFcf <= 7) return 82 - (debtToFcf - 3) * 12;
    return clamp(34 - (debtToFcf - 7) * 5, 0, 34);
  }

  const coverage = finite(analysis.debt.interestCoverage);
  if (coverage !== null) {
    if (coverage >= 12) return 92;
    if (coverage >= 6) return 76;
    if (coverage >= 3) return 54;
    return 22;
  }

  const debtToEquity = finite(analysis.balance.debtToEquity);
  if (debtToEquity !== null) {
    if (debtToEquity <= 0.5) return 88;
    if (debtToEquity <= 1.5) return 72;
    if (debtToEquity <= 3) return 46;
    return 20;
  }

  return null;
}

function watchlistMetrics(analysis: Analysis | undefined): WatchlistMetrics {
  if (!analysis) {
    return {
      margin: null,
      score: null,
      qualitySpread: null,
      debtToFcf: null,
      debtSignal: null,
      dataSignal: 0,
      rank: null,
    };
  }

  const margin = finite(analysis.valuation.difference);
  const score = finite(analysis.decision.score);
  const roic = finite(analysis.profitability.roic.y1);
  const wacc = finite(analysis.profitability.wacc.y1);
  const qualitySpread = roic !== null && wacc !== null ? roic - wacc : null;
  const currentDebtSignal = debtSignal(analysis);
  const dataSignal = sourceScore(analysis.dataSource);

  const valueScore = margin === null ? 35 : clamp(55 + margin * 100, 0, 100);
  const qualityScore =
    qualitySpread === null ? 35 : clamp(52 + qualitySpread * 260, 0, 100);
  const balanceScore = currentDebtSignal ?? 40;
  const decisionScore = score ?? 35;
  const rank =
    decisionScore * 0.34 +
    valueScore * 0.24 +
    qualityScore * 0.22 +
    balanceScore * 0.12 +
    dataSignal * 0.08;

  return {
    margin,
    score,
    qualitySpread,
    debtToFcf: finite(analysis.debt.debtToFcf),
    debtSignal: currentDebtSignal,
    dataSignal,
    rank,
  };
}

function metricForMode(metrics: WatchlistMetrics, mode: SortMode): number | null {
  if (mode === "rank") return metrics.rank;
  if (mode === "margin") return metrics.margin;
  if (mode === "score") return metrics.score;
  if (mode === "quality") return metrics.qualitySpread;
  if (mode === "debt") return metrics.debtSignal;
  return metrics.dataSignal;
}

function formatRank(value: number | null): string {
  if (value === null) return "—";
  return Math.round(value).toLocaleString("de-DE");
}

function metricLabel(item: RankedTicker, mode: SortMode): string {
  const { analysis, metrics } = item;
  if (!analysis) return item.loading ? "lädt" : "offen";
  if (mode === "rank") return `${formatRank(metrics.rank)} Setup`;
  if (mode === "margin") return pct(metrics.margin, true);
  if (mode === "score") return `${formatRank(metrics.score)} Score`;
  if (mode === "quality") return pct(metrics.qualitySpread, true);
  if (mode === "debt") {
    if (metrics.debtToFcf !== null) return `${metrics.debtToFcf.toLocaleString("de-DE", { maximumFractionDigits: 1 })}× FCF`;
    return `${formatRank(metrics.debtSignal)} Risiko`;
  }
  return dataLabel(analysis.dataSource);
}

function selectedSortLabel(mode: SortMode): string {
  return SORT_OPTIONS.find((option) => option.mode === mode)?.label ?? "Bestes Setup";
}

interface Props {
  tickers: string[];
  analyses: Record<string, Analysis>;
  selectedTicker: string | null;
  loadingTickers: string[];
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  onAnalyzeAll: () => void;
}

export function WatchlistPanel({
  tickers,
  analyses,
  selectedTicker,
  loadingTickers,
  onSelect,
  onRemove,
  onAnalyzeAll,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const mergedTickers = tickers;
  const selectedAnalysis = selectedTicker ? analyses[selectedTicker] : null;
  const loadedCount = mergedTickers.filter((ticker) => analyses[ticker]).length;
  const fmpCount = mergedTickers.filter(
    (ticker) => analyses[ticker]?.dataSource === "fmp",
  ).length;
  const secCount = mergedTickers.filter(
    (ticker) => analyses[ticker]?.dataSource === "sec",
  ).length;
  const rankedTickers = useMemo<RankedTicker[]>(
    () =>
      mergedTickers
        .map((ticker) => {
          const analysis = analyses[ticker];
          const metrics = watchlistMetrics(analysis);
          return {
            ticker,
            analysis,
            loading: loadingTickers.includes(ticker),
            metrics,
            sortValue: metricForMode(metrics, sortMode),
          };
        })
        .sort((left, right) => {
          const leftLoaded = left.analysis ? 1 : 0;
          const rightLoaded = right.analysis ? 1 : 0;
          if (leftLoaded !== rightLoaded) return rightLoaded - leftLoaded;

          const leftValue = left.sortValue;
          const rightValue = right.sortValue;
          if (leftValue === null && rightValue === null) {
            return mergedTickers.indexOf(left.ticker) - mergedTickers.indexOf(right.ticker);
          }
          if (leftValue === null) return 1;
          if (rightValue === null) return -1;
          if (rightValue !== leftValue) return rightValue - leftValue;
          return mergedTickers.indexOf(left.ticker) - mergedTickers.indexOf(right.ticker);
        }),
    [analyses, loadingTickers, mergedTickers, sortMode],
  );
  const topCandidate = rankedTickers.find((item) => item.analysis);

  return (
    <section className="glass-strong rounded-[var(--radius-card)] px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="premium-transition flex min-w-0 items-center gap-3 rounded-[1.35rem] px-2 py-2 text-left hover:bg-white/34"
          aria-expanded={expanded}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                d="M5 12h14M12 5v14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--color-ink)]">
              Watchlist
            </span>
            <span className="block truncate text-xs text-[var(--color-ink-tertiary)]">
              {selectedAnalysis
                ? `${selectedAnalysis.ticker} · ${money(
                    selectedAnalysis.currentPrice,
                    selectedAnalysis.currency,
                  )}`
                : `${loadedCount}/${tickers.length} analysiert · ${selectedSortLabel(
                    sortMode,
                  )}`}
            </span>
          </span>
        </button>

        <div className="scrollbar-soft flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 xl:pb-0">
          {rankedTickers.map((item) => {
            const { ticker, analysis, loading } = item;
            const active = selectedTicker === ticker;

            return (
              <button
                key={ticker}
                type="button"
                onClick={() => onSelect(ticker)}
                className={`tnum premium-transition inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2 text-xs font-semibold ring-1 ${
                  active
                    ? "bg-[var(--color-ink)] text-white ring-[var(--color-ink)]"
                    : "bg-white/42 text-[var(--color-ink-secondary)] ring-white/62 hover:-translate-y-0.5 hover:bg-white/76 hover:text-[var(--color-accent)]"
                }`}
              >
                {ticker}
                {loading && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                )}
                {analysis && (
                  <span
                    className={
                      active ? "text-white/68" : "text-[var(--color-ink-tertiary)]"
                    }
                  >
                    {metricLabel(item, sortMode)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onAnalyzeAll}
            className="premium-transition rounded-[var(--radius-pill)] bg-[var(--color-ink)] px-3 py-2 text-xs font-semibold text-white ring-1 ring-[var(--color-ink)] hover:-translate-y-0.5 active:scale-[0.98]"
          >
            Alle laden
          </button>
          {QUICK_TICKERS.map((ticker) => (
            <button
              key={ticker}
              type="button"
              onClick={() => onSelect(ticker)}
              className="tnum premium-transition rounded-[var(--radius-pill)] bg-white/50 px-3 py-2 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/70 hover:-translate-y-0.5 hover:bg-white/80 hover:text-[var(--color-accent)] active:scale-[0.98]"
            >
              {ticker}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="premium-transition rounded-[var(--radius-pill)] bg-white/62 px-3 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-white/78 hover:bg-white/88"
          >
            {expanded ? "Schließen" : "Details"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-white/38 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 px-2 text-xs text-[var(--color-ink-tertiary)]">
          Sortiert nach{" "}
          <span className="font-semibold text-[var(--color-ink-secondary)]">
            {selectedSortLabel(sortMode)}
          </span>
          {topCandidate?.analysis && (
            <span className="tnum ml-2 text-[var(--color-ink-tertiary)]">
              Top: {topCandidate.ticker} · {metricLabel(topCandidate, sortMode)}
            </span>
          )}
        </div>
        <div
          className="scrollbar-soft flex gap-2 overflow-x-auto pb-1 lg:pb-0"
          role="tablist"
          aria-label="Watchlist sortieren"
        >
          {SORT_OPTIONS.map((option) => {
            const active = sortMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setSortMode(option.mode)}
                aria-pressed={active}
                className={`premium-transition shrink-0 rounded-[var(--radius-pill)] px-3 py-2 text-xs font-semibold ring-1 ${
                  active
                    ? "bg-[var(--color-ink)] text-white ring-[var(--color-ink)]"
                    : "bg-white/42 text-[var(--color-ink-secondary)] ring-white/62 hover:bg-white/78 hover:text-[var(--color-accent)]"
                }`}
              >
                {option.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rankedTickers.map((item) => {
              const { ticker, analysis, loading, metrics } = item;
              const active = selectedTicker === ticker;
              const positive = (analysis?.valuation.difference ?? 0) >= 0;

              return (
                <article
                  key={ticker}
                  className={`premium-transition w-full rounded-[1.35rem] px-4 py-3 text-left ring-1 ${
                    active
                      ? "bg-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_14px_34px_rgba(40,55,78,0.11)] ring-white/80"
                      : "bg-white/30 ring-white/45 hover:-translate-y-0.5 hover:bg-white/58"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelect(ticker)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="tnum text-sm font-semibold text-[var(--color-ink)]">
                            {ticker}
                          </span>
                          {loading && (
                            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
                          )}
                        {analysis?.dataSource && (
                          <span className="rounded-full bg-white/58 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-ink-tertiary)]">
                            {analysis.dataSource}
                          </span>
                        )}
                        </div>
                        <div className="mt-1 truncate text-xs text-[var(--color-ink-tertiary)]">
                          {analysis?.companyName ?? "Zum Laden antippen"}
                        </div>
                      </div>
                    </button>
                    <div className="text-right">
                      <div className="tnum text-sm font-semibold text-[var(--color-ink)]">
                        {analysis
                          ? money(analysis.currentPrice, analysis.currency)
                          : "—"}
                      </div>
                      <div
                        className={`tnum mt-1 text-xs font-semibold ${
                          positive
                            ? "text-[var(--color-positive)]"
                            : "text-[var(--color-negative)]"
                        }`}
                      >
                        {analysis
                          ? pct(analysis.valuation.difference, true)
                          : "bereit"}
                      </div>
                    </div>
                    {tickers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemove(ticker)}
                        aria-label={`${ticker} entfernen`}
                        className="premium-transition -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-tertiary)] hover:bg-white/62 hover:text-[var(--color-negative)]"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            d="M6 6l8 8M14 6l-8 8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                  {analysis && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--color-ink-secondary)] sm:grid-cols-5">
                      <span className="tnum rounded-xl bg-white/42 px-2 py-1">
                        Setup {formatRank(metrics.rank)}
                      </span>
                      <span className="tnum rounded-xl bg-white/42 px-2 py-1">
                        Marge {pct(metrics.margin, true)}
                      </span>
                      <span className="tnum rounded-xl bg-white/42 px-2 py-1">
                        Spread {pct(metrics.qualitySpread, true)}
                      </span>
                      <span className="tnum rounded-xl bg-white/42 px-2 py-1">
                        Debt{" "}
                        {metrics.debtToFcf !== null
                          ? `${metrics.debtToFcf.toLocaleString("de-DE", {
                              maximumFractionDigits: 1,
                            })}×`
                          : formatRank(metrics.debtSignal)}
                      </span>
                      <span className="tnum rounded-xl bg-white/42 px-2 py-1">
                        {dataLabel(analysis.dataSource)}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 px-2 text-xs text-[var(--color-ink-tertiary)]">
        <span>{loadedCount}/{tickers.length} analysiert</span>
        <span>·</span>
        <span>{fmpCount} FMP-Pro</span>
        {secCount > 0 && (
          <>
            <span>·</span>
            <span>{secCount} SEC</span>
          </>
        )}
        {loadingTickers.length > 0 && (
          <>
            <span>·</span>
            <span className="tnum">{loadingTickers.length} lädt</span>
          </>
        )}
      </div>
    </section>
  );
}
