import { useMemo, useState } from "react";

import { AnalyzeError, runSp500Screener } from "../api/client";
import type { ScreenerParams, ScreenerResponse, ScreenerRow } from "../types/screener";
import { money, pct } from "../lib/format";

const SORTS: Array<{ value: NonNullable<ScreenerParams["sort"]>; label: string }> = [
  { value: "composite", label: "Composite" },
  { value: "margin", label: "Marge" },
  { value: "momentum", label: "Momentum" },
  { value: "quality", label: "Qualität" },
  { value: "debt", label: "Debt" },
];

interface Props {
  onOpenAnalysis: (ticker: string) => void;
  onAddToWatchlist: (ticker: string) => void;
}

function scoreClass(score: number): string {
  if (score >= 75) return "text-[var(--color-positive)]";
  if (score >= 55) return "text-[var(--color-accent)]";
  if (score >= 35) return "text-[var(--color-amber)]";
  return "text-[var(--color-negative)]";
}

function gateLabel(gate: ScreenerResponse["marketRegime"]["gate"]): string {
  if (gate === "normal") return "Normal";
  if (gate === "reduced") return "Reduziert";
  if (gate === "blocked") return "Blockiert";
  return "Unklar";
}

function RowCard({
  row,
  onOpenAnalysis,
  onAddToWatchlist,
}: {
  row: ScreenerRow;
  onOpenAnalysis: (ticker: string) => void;
  onAddToWatchlist: (ticker: string) => void;
}) {
  return (
    <article className="rounded-[1.5rem] bg-white/42 p-4 ring-1 ring-white/62">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
              {row.ticker}
            </h3>
            <span className="rounded-[var(--radius-pill)] bg-white/58 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-tertiary)] ring-1 ring-white/70">
              {row.dataSource ?? "data"}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
            {row.companyName} {row.sector ? `· ${row.sector}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className={`tnum text-3xl font-semibold ${scoreClass(row.compositeScore)}`}>
            {Math.round(row.compositeScore)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
            Composite
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Metric label="Kurs" value={money(row.currentPrice)} />
        <Metric label="Marge" value={pct(row.marginOfSafety, true)} />
        <Metric label="Momentum" value={row.momentum.momentumScore === null ? "—" : `${Math.round(row.momentum.momentumScore)}`} />
        <Metric label="Setup" value={row.tradeSetup ? `${row.tradeSetup.shares} Shares` : "—"} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenAnalysis(row.ticker)}
          className="rounded-[var(--radius-pill)] bg-[var(--color-ink)] px-4 py-2 text-xs font-semibold text-[var(--color-paper)]"
        >
          Analyse öffnen
        </button>
        <button
          type="button"
          onClick={() => onAddToWatchlist(row.ticker)}
          className="rounded-[var(--radius-pill)] bg-white/58 px-4 py-2 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/70"
        >
          Zur Watchlist
        </button>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] bg-white/38 px-3 py-2 ring-1 ring-white/56">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-tertiary)]">
        {label}
      </div>
      <div className="tnum mt-1 text-sm font-semibold text-[var(--color-ink)]">{value}</div>
    </div>
  );
}

export function ScreenerPanel({ onOpenAnalysis, onAddToWatchlist }: Props) {
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState<NonNullable<ScreenerParams["sort"]>>("composite");
  const [response, setResponse] = useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topRows = useMemo(() => response?.rows.slice(0, 3) ?? [], [response]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runSp500Screener({ limit, sort, portfolioValue: 25_000, baseRiskPct: 0.01 });
      setResponse(result);
    } catch (e) {
      if (e instanceof AnalyzeError && e.code === "rate_limited") {
        setError("FMP-Rate-Limit erreicht. Bitte später erneut probieren oder Limit reduzieren.");
      } else {
        setError("Screener konnte nicht geladen werden. Prüfe Backend und Datenprovider.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="glass-strong rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
              Scan Controls
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
              Batch-Scan ohne Auto-Overload
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-ink-secondary)]">
              Startet bewusst manuell und limitiert, damit FMP-Quota und UI ruhig bleiben.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[10, 25, 50].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLimit(value)}
                className={`rounded-[var(--radius-pill)] px-4 py-2 text-xs font-semibold ${
                  limit === value ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "bg-white/54 text-[var(--color-ink-secondary)] ring-1 ring-white/70"
                }`}
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="rounded-[var(--radius-pill)] bg-[var(--color-moss)] px-5 py-2 text-xs font-semibold text-[var(--color-paper)] disabled:opacity-60"
            >
              {loading ? "Scan läuft" : "S&P 500 Scan starten"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SORTS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSort(item.value)}
              className={`rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold ${
                sort === item.value ? "bg-white/80 text-[var(--color-ink)]" : "text-[var(--color-ink-secondary)] hover:bg-white/42"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="card p-5 text-sm font-semibold text-[var(--color-negative)]">{error}</div>}

      {response && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Metric label="Market Gate" value={gateLabel(response.marketRegime.gate)} />
            <Metric label="VIX" value={response.marketRegime.vix === null ? "—" : response.marketRegime.vix.toFixed(1)} />
            <Metric label="Rows" value={`${response.count}`} />
          </div>
          {topRows.map((row) => (
            <RowCard
              key={row.ticker}
              row={row}
              onOpenAnalysis={onOpenAnalysis}
              onAddToWatchlist={onAddToWatchlist}
            />
          ))}
          {response.rows.length > topRows.length && (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                  <thead className="text-left text-xs uppercase tracking-[0.14em] text-[var(--color-ink-tertiary)]">
                    <tr>
                      {['Ticker', 'Company', 'Composite', 'Marge', 'Momentum', 'Score', 'Setup'].map((head) => (
                        <th key={head} className="px-4 py-3 font-semibold">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {response.rows.slice(3).map((row) => (
                      <tr key={row.ticker} className="border-t border-white/60">
                        <td className="px-4 py-3 font-semibold text-[var(--color-ink)]">{row.ticker}</td>
                        <td className="px-4 py-3 text-[var(--color-ink-secondary)]">{row.companyName}</td>
                        <td className="tnum px-4 py-3 font-semibold">{Math.round(row.compositeScore)}</td>
                        <td className="tnum px-4 py-3">{pct(row.marginOfSafety, true)}</td>
                        <td className="tnum px-4 py-3">{row.momentum.momentumScore === null ? "—" : Math.round(row.momentum.momentumScore)}</td>
                        <td className="tnum px-4 py-3">{row.decisionScore}</td>
                        <td className="px-4 py-3">{row.tradeSetup ? `${row.tradeSetup.shares} Shares` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
