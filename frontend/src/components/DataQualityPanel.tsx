import type { Analysis } from "../types/analysis";
import { pct } from "../lib/format";

function StatusLine({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "bg-[var(--color-positive)]/12 text-[var(--color-positive)]"
      : tone === "warn"
        ? "bg-[var(--color-amber)]/14 text-[var(--color-amber)]"
        : "bg-[var(--color-card-muted)] text-[var(--color-ink-secondary)]";

  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/48 px-1 py-3 first:border-t-0">
      <span className="text-sm text-[var(--color-ink-secondary)]">{label}</span>
      <span
        className={`max-w-[58%] rounded-[var(--radius-pill)] px-3 py-1 text-right text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

export function DataQualityPanel({ analysis }: { analysis: Analysis }) {
  const source = analysis.dataSource ?? "mock";
  const hasRoic = analysis.profitability.roic.y1 !== null;
  const hasWacc = analysis.profitability.wacc.y1 !== null;
  const hasInterestCoverage = analysis.debt.interestCoverage !== null;
  const provenance = analysis.provenance ?? {};
  const guardrails = analysis.valuation.guardrails;
  const fundamentalsLabel =
    source === "fmp"
      ? "FMP aktiv"
      : source === "sec"
        ? "SEC EDGAR offiziell"
        : "eingeschränkter Fallback";
  const fundamentalsTone = source === "fmp" || source === "sec" ? "good" : "warn";
  const sourceLabel =
    analysis.assumptions.growthSource === "zacks"
      ? "Zacks"
      : analysis.assumptions.growthSource === "analyst"
        ? "Analysten"
        : "Manuell";

  return (
    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">
            Datenqualität
          </h2>
          <p className="mt-1 text-xs text-[var(--color-ink-tertiary)]">
            Abgleich der wichtigsten Spreadsheet-Quellen.
          </p>
        </div>
        <span className="rounded-[var(--radius-pill)] bg-white/52 px-3 py-1 text-xs font-semibold uppercase text-[var(--color-ink-tertiary)] ring-1 ring-white/70">
          {source}
        </span>
      </div>

      <div className="mt-5">
        <StatusLine
          label="Historische Fundamentaldaten"
          value={fundamentalsLabel}
          tone={fundamentalsTone}
        />
        <StatusLine
          label="ROIC"
          value={hasRoic ? provenance["profitability.roic"] ?? "reported" : "nicht verfügbar"}
          tone={hasRoic ? "good" : "warn"}
        />
        <StatusLine
          label="WACC"
          value={hasWacc ? provenance["profitability.wacc"] ?? "computed" : "nicht verfügbar"}
          tone={hasWacc ? "good" : "warn"}
        />
        <StatusLine
          label="Interest Coverage"
          value={hasInterestCoverage ? "vorhanden" : "nicht verfügbar"}
          tone={hasInterestCoverage ? "good" : "warn"}
        />
        <StatusLine
          label="Wachstumsquelle"
          value={
            analysis.growthEstimate?.estimatedGrowth !== null &&
            analysis.growthEstimate?.estimatedGrowth !== undefined
              ? `${sourceLabel} · ${pct(analysis.growthEstimate.estimatedGrowth)}`
              : `${sourceLabel} · offen`
          }
          tone={analysis.assumptions.growthSource === "analyst" ? "good" : "neutral"}
        />
        <StatusLine
          label="Analysten-EPS"
          value={provenance["growthEstimate"] ?? "nicht verfügbar"}
          tone={provenance["growthEstimate"] === "estimated" ? "good" : "warn"}
        />
        <StatusLine
          label="Bewertungsbasis"
          value={
            guardrails.epsBasis === "normalized"
              ? "normalisiertes EPS"
              : guardrails.epsBasis === "latest"
                ? "letztes EPS"
                : "nicht belastbar"
          }
          tone={guardrails.epsBasis === "normalized" ? "warn" : "neutral"}
        />
        <StatusLine
          label="Response-Cache"
          value={analysis.cached ? "aus Cache" : "frisch geladen"}
          tone={analysis.cached ? "neutral" : "good"}
        />
      </div>
    </section>
  );
}
