import type {
  Analysis,
  DecisionSignal,
  GuardrailSeverity,
} from "../types/analysis";
import { money, num, pct } from "../lib/format";

const SIGNAL_LABEL: Record<DecisionSignal, string> = {
  strong: "stark",
  ok: "solide",
  weak: "schwach",
  unknown: "offen",
};

function signalClass(signal: DecisionSignal): string {
  if (signal === "strong") {
    return "bg-[var(--color-positive)]/12 text-[var(--color-positive)] ring-[var(--color-positive)]/18";
  }
  if (signal === "weak") {
    return "bg-[var(--color-negative)]/10 text-[var(--color-negative)] ring-[var(--color-negative)]/16";
  }
  if (signal === "unknown") {
    return "bg-[var(--color-amber)]/12 text-[var(--color-amber)] ring-[var(--color-amber)]/16";
  }
  return "bg-white/52 text-[var(--color-ink-secondary)] ring-white/72";
}

function scoreColor(score: number): string {
  if (score >= 75) return "var(--color-positive)";
  if (score >= 55) return "var(--color-accent)";
  if (score >= 35) return "var(--color-amber)";
  return "var(--color-negative)";
}

function severityClass(severity: GuardrailSeverity): string {
  if (severity === "danger") {
    return "border-[var(--color-negative)]/16 bg-[var(--color-negative)]/8";
  }
  if (severity === "warning") {
    return "border-[var(--color-amber)]/16 bg-[var(--color-amber)]/10";
  }
  return "border-white/56 bg-white/34";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] bg-white/34 px-4 py-3 ring-1 ring-white/56">
      <div className="text-xs font-medium text-[var(--color-ink-tertiary)]">
        {label}
      </div>
      <div className="tnum mt-1 text-base font-semibold text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}

function SignalTile({
  label,
  signal,
}: {
  label: string;
  signal: DecisionSignal;
}) {
  return (
    <div className="rounded-[1.25rem] bg-white/30 px-3 py-3 ring-1 ring-white/48">
      <div className="text-[11px] font-medium text-[var(--color-ink-tertiary)]">
        {label}
      </div>
      <div
        className={`mt-2 inline-flex rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-semibold ring-1 ${signalClass(
          signal,
        )}`}
      >
        {SIGNAL_LABEL[signal]}
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score);

  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full p-1.5"
      style={{
        background: `conic-gradient(${color} ${score * 3.6}deg, rgba(17,19,24,0.08) 0deg)`,
      }}
      aria-label={`Decision Score ${score} von 100`}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white/74 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <span className="tnum text-3xl font-semibold leading-none text-[var(--color-ink)]">
          {score}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase text-[var(--color-ink-tertiary)]">
          Score
        </span>
      </div>
    </div>
  );
}

export function InvestmentCockpit({ analysis }: { analysis: Analysis }) {
  const { decision, valuation } = analysis;
  const guardrails = valuation.guardrails;
  const intrinsicValue = valuation.intrinsicValue;
  const difference = valuation.difference;
  const hasValue = intrinsicValue !== null && difference !== null;
  const undervalued = (difference ?? 0) > 0;
  const accent = undervalued ? "var(--color-positive)" : "var(--color-negative)";
  const distance = hasValue ? Math.min(100, Math.abs(difference) * 100) : 0;
  const epsLabel =
    guardrails.epsBasis === "normalized" ? "EPS normalisiert" : "EPS aktuell";
  const peLabel =
    guardrails.peBasis === "historical" ? "KGV historisch" : "KGV effektiv";
  const visibleWarnings = guardrails.warnings.slice(0, 2);
  const visibleReasons = decision.reasons.slice(0, 4);

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
      <article
        className="glass-strong relative overflow-hidden rounded-[2rem] p-6 sm:p-8"
        style={{
          backgroundImage: hasValue
            ? `linear-gradient(135deg, rgba(255,255,255,0.86), rgba(255,255,255,0.48)), radial-gradient(80% 72% at 100% 0%, ${
                undervalued
                  ? "rgba(47,191,113,0.16)"
                  : "rgba(255,69,58,0.13)"
              } 0%, rgba(255,255,255,0) 66%)`
            : undefined,
        }}
      >
        <div className="relative z-[1] flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-white/56 px-3 py-1 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/72">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              Innerer Wert
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-3">
              <h2 className="tnum text-6xl font-semibold leading-none text-[var(--color-ink)] sm:text-7xl">
                {intrinsicValue === null
                  ? "n/a"
                  : money(intrinsicValue, analysis.currency)}
              </h2>
              {hasValue && (
                <span
                  className="mb-1.5 inline-flex rounded-[var(--radius-pill)] px-3.5 py-1.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]"
                  style={{ background: accent }}
                >
                  {pct(Math.abs(difference))}{" "}
                  {undervalued ? "unter Wert" : "über Wert"}
                </span>
              )}
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--color-ink-secondary)]">
              {decision.summary}
            </p>
          </div>

          <div className="rounded-[1.5rem] bg-white/38 px-4 py-3 text-right ring-1 ring-white/60">
            <div className="text-xs font-medium text-[var(--color-ink-tertiary)]">
              Marktpreis
            </div>
            <div className="tnum mt-1 text-2xl font-semibold text-[var(--color-ink)]">
              {money(analysis.currentPrice, analysis.currency)}
            </div>
          </div>
        </div>

        <div className="relative z-[1] mt-7">
          <div className="flex items-center justify-between gap-4 text-xs font-semibold text-[var(--color-ink-tertiary)]">
            <span>Sicherheitsmarge</span>
            <span className="tnum">{hasValue ? pct(difference, true) : "offen"}</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/58 ring-1 ring-white/70">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-premium)]"
              style={{
                width: `${distance}%`,
                background: hasValue ? accent : "var(--color-ink-tertiary)",
              }}
            />
          </div>
        </div>

        <div className="relative z-[1] mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field
            label={epsLabel}
            value={money(
              guardrails.epsBasis === "normalized"
                ? guardrails.normalizedEPS
                : valuation.currentEPS,
              analysis.currency,
            )}
          />
          <Field label={peLabel} value={`${num(guardrails.effectivePE, 1)}×`} />
          <Field
            label="eEPS in 10J"
            value={money(valuation.futureEPS, analysis.currency)}
          />
          <Field
            label="Kurs in 10J"
            value={money(valuation.futurePrice, analysis.currency)}
          />
        </div>
      </article>

      <aside className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <ScoreRing score={decision.score} />
          <div className="min-w-0 pt-1">
            <div className="text-xs font-semibold uppercase text-[var(--color-ink-tertiary)]">
              Entscheidung
            </div>
            <h2 className="mt-1 text-2xl font-semibold leading-tight text-[var(--color-ink)]">
              {decision.label}
            </h2>
            <div className="mt-2 inline-flex rounded-[var(--radius-pill)] bg-white/52 px-3 py-1 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/72">
              Vertrauen: {guardrails.confidence}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <SignalTile label="Bewertung" signal={decision.valuationSignal} />
          <SignalTile label="Qualität" signal={decision.qualitySignal} />
          <SignalTile label="Bilanz" signal={decision.debtSignal} />
          <SignalTile label="Daten" signal={decision.dataSignal} />
        </div>

        <div className="mt-5 space-y-2">
          {visibleReasons.map((reason) => (
            <div
              key={reason}
              className="rounded-[1.15rem] bg-white/30 px-3.5 py-2.5 text-sm leading-5 text-[var(--color-ink-secondary)] ring-1 ring-white/46"
            >
              {reason}
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          {visibleWarnings.length ? (
            visibleWarnings.map((warning) => (
              <div
                key={warning.code}
                className={`rounded-[1.15rem] border px-3.5 py-2.5 ${severityClass(
                  warning.severity,
                )}`}
              >
                <div className="text-sm font-semibold text-[var(--color-ink)]">
                  {warning.title}
                </div>
                <div className="mt-1 text-xs leading-5 text-[var(--color-ink-secondary)]">
                  {warning.detail}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.15rem] bg-white/28 px-3.5 py-2.5 text-sm text-[var(--color-ink-secondary)] ring-1 ring-white/46">
              Keine harten Bewertungswarnungen.
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
