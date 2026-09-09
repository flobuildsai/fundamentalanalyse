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
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const mergedTickers = tickers;
  const loadedCount = mergedTickers.filter((ticker) => analyses[ticker]).length;
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
    <section className="watchlist-panel">
      <div className="watchlist-toolbar">
        <div className="watchlist-title">
          <p>Watchlist</p>
          <h2>
            {loadedCount}/{tickers.length} geladen
          </h2>
        </div>

        <div className="watchlist-actions">
          <div className="watchlist-sort" aria-label="Watchlist sortieren">
            {SORT_OPTIONS.map((option) => {
              const active = sortMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => setSortMode(option.mode)}
                  aria-pressed={active}
                  className={active ? "active" : undefined}
                >
                  {option.shortLabel}
                </button>
              );
            })}
          </div>

          <button type="button" onClick={onAnalyzeAll} className="watchlist-primary">
            Alle laden
          </button>
        </div>
      </div>

      <div className="watchlist-strip">
        <span>Sort: {selectedSortLabel(sortMode)}</span>
        {topCandidate?.analysis && (
          <span className="tnum">
            Top {topCandidate.ticker} · {metricLabel(topCandidate, sortMode)}
          </span>
        )}
        {loadingTickers.length > 0 && (
          <span className="tnum">{loadingTickers.length} lädt</span>
        )}
      </div>

      <div className="watchlist-quick">
        {QUICK_TICKERS.map((ticker) => (
          <button key={ticker} type="button" onClick={() => onSelect(ticker)}>
            {ticker}
          </button>
        ))}
      </div>

      <div className="watchlist-table" role="table" aria-label="Watchlist">
        <div className="watchlist-row watchlist-head" role="row">
          <span>Ticker</span>
          <span>Kurs</span>
          <span>Marge</span>
          <span>Score</span>
          <span>ROIC-WACC</span>
          <span>Debt</span>
          <span>Daten</span>
          <span />
        </div>

        {rankedTickers.map((item) => {
          const { ticker, analysis, loading, metrics } = item;
          const active = selectedTicker === ticker;
          const margin = analysis?.valuation.difference ?? null;
          const positive = (margin ?? 0) >= 0;

          return (
            <div
              key={ticker}
              className={`watchlist-row ${active ? "active" : ""}`}
              role="row"
            >
              <button
                type="button"
                onClick={() => onSelect(ticker)}
                className="watchlist-company"
              >
                <span className="tnum">
                  {ticker}
                  {loading && <i />}
                </span>
                <small>{analysis?.companyName ?? "Tippen zum Laden"}</small>
              </button>

              <span className="tnum">
                {analysis ? money(analysis.currentPrice, analysis.currency) : "—"}
              </span>

              <span className={`tnum ${positive ? "positive" : "negative"}`}>
                {analysis ? pct(metrics.margin, true) : "—"}
              </span>

              <span className="tnum">{analysis ? formatRank(metrics.score) : "—"}</span>
              <span className="tnum">
                {analysis ? pct(metrics.qualitySpread, true) : "—"}
              </span>
              <span className="tnum">
                {analysis
                  ? metrics.debtToFcf !== null
                    ? `${metrics.debtToFcf.toLocaleString("de-DE", {
                        maximumFractionDigits: 1,
                      })}×`
                    : formatRank(metrics.debtSignal)
                  : "—"}
              </span>
              <span>{analysis ? dataLabel(analysis.dataSource) : "offen"}</span>

              <span className="watchlist-row-actions">
                {tickers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(ticker)}
                    aria-label={`${ticker} entfernen`}
                  >
                    Entfernen
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
