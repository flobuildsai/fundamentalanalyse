import type { Analysis, DecisionSignal, GuardrailSeverity } from "../types/analysis";
import { money, num, pct } from "../lib/format";

const SIGNAL_LABEL: Record<DecisionSignal, string> = {
  strong: "stark",
  ok: "ok",
  weak: "schwach",
  unknown: "offen",
};

function signalClass(signal: DecisionSignal): string {
  if (signal === "strong") return "bg-[var(--color-positive)]/12 text-[var(--color-positive)]";
  if (signal === "weak") return "bg-[var(--color-negative)]/10 text-[var(--color-negative)]";
  if (signal === "unknown") return "bg-[var(--color-amber)]/14 text-[var(--color-amber)]";
  return "bg-white/54 text-[var(--color-ink-secondary)]";
}

function severityClass(severity: GuardrailSeverity): string {
  if (severity === "danger") return "border-[var(--color-negative)]/18 bg-[var(--color-negative)]/8";
  if (severity === "warning") return "border-[var(--color-amber)]/18 bg-[var(--color-amber)]/10";
  return "border-white/55 bg-white/32";
}

function SignalPill({ label, signal }: { label: string; signal: DecisionSignal }) {
  return (
    <div className="glass-soft rounded-2xl px-3 py-2">
      <div className="text-[11px] font-medium text-[var(--color-ink-tertiary)]">
        {label}
      </div>
      <div
        className={`mt-1 inline-flex rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-semibold ${signalClass(signal)}`}
      >
        {SIGNAL_LABEL[signal]}
      </div>
    </div>
  );
}

export function DecisionPanel({ analysis }: { analysis: Analysis }) {
  const { decision, valuation } = analysis;
  const guardrails = valuation.guardrails;
  const scoreColor =
    decision.score >= 75
      ? "var(--color-positive)"
      : decision.score >= 55
        ? "var(--color-accent)"
        : decision.score >= 35
          ? "var(--color-amber)"
          : "var(--color-negative)";

  return (
    <section className="card overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="glass-strong flex flex-col justify-between rounded-[var(--radius-card)] p-6 sm:p-8">
          <div>
            <span className="rounded-[var(--radius-pill)] bg-white/54 px-3 py-1 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/70">
              Decision
            </span>
            <div className="tnum mt-6 text-6xl font-semibold leading-none text-[var(--color-ink)]">
              {decision.score}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/56">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${decision.score}%`,
                  background: scoreColor,
                }}
              />
            </div>
          </div>
          <div className="mt-8">
            <h2 className="text-2xl font-semibold text-[var(--color-ink)]">
              {decision.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-secondary)]">
              {decision.summary}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <div className="grid gap-3 sm:grid-cols-4">
            <SignalPill label="Bewertung" signal={decision.valuationSignal} />
            <SignalPill label="Qualität" signal={decision.qualitySignal} />
            <SignalPill label="Bilanz" signal={decision.debtSignal} />
            <SignalPill label="Daten" signal={decision.dataSignal} />
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/34 px-4 py-3 ring-1 ring-white/54">
              <div className="text-xs text-[var(--color-ink-tertiary)]">
                EPS-Basis
              </div>
              <div className="tnum mt-1 text-sm font-semibold text-[var(--color-ink)]">
                {guardrails.epsBasis === "normalized"
                  ? money(guardrails.normalizedEPS, analysis.currency)
                  : money(valuation.currentEPS, analysis.currency)}
              </div>
            </div>
            <div className="rounded-2xl bg-white/34 px-4 py-3 ring-1 ring-white/54">
              <div className="text-xs text-[var(--color-ink-tertiary)]">
                KGV-Basis
              </div>
              <div className="tnum mt-1 text-sm font-semibold text-[var(--color-ink)]">
                {num(guardrails.effectivePE, 1)}×
              </div>
            </div>
            <div className="rounded-2xl bg-white/34 px-4 py-3 ring-1 ring-white/54">
              <div className="text-xs text-[var(--color-ink-tertiary)]">
                Sicherheitsmarge
              </div>
              <div className="tnum mt-1 text-sm font-semibold text-[var(--color-ink)]">
                {pct(valuation.difference, true)}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="space-y-2">
              {decision.reasons.map((reason) => (
                <div
                  key={reason}
                  className="rounded-2xl bg-white/30 px-4 py-3 text-sm leading-5 text-[var(--color-ink-secondary)] ring-1 ring-white/50"
                >
                  {reason}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {guardrails.warnings.length ? (
                guardrails.warnings.map((warning) => (
                  <div
                    key={warning.code}
                    className={`rounded-2xl border px-4 py-3 ${severityClass(warning.severity)}`}
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
                <div className="rounded-2xl bg-white/30 px-4 py-3 text-sm text-[var(--color-ink-secondary)] ring-1 ring-white/50">
                  Keine harten Bewertungswarnungen.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
