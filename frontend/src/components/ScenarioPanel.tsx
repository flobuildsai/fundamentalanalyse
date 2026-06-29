import type { Analysis, Assumptions } from "../types/analysis";
import { money, pct } from "../lib/format";

interface Scenario {
  name: string;
  note: string;
  assumptions: Assumptions;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function intrinsicValue(analysis: Analysis, assumptions: Assumptions): number | null {
  const futureEPS =
    analysis.valuation.currentEPS * Math.pow(1 + assumptions.estimatedGrowth, 10);
  const futurePrice = futureEPS * analysis.valuation.historicalPE;
  const discounted = futurePrice / Math.pow(1 + assumptions.requiredReturn, 10);
  return discounted < 0 ? null : discounted;
}

export function ScenarioPanel({
  analysis,
  assumptions,
}: {
  analysis: Analysis;
  assumptions: Assumptions;
}) {
  const scenarios: Scenario[] = [
    {
      name: "Bear",
      note: "niedrigeres Wachstum, höhere Renditeforderung",
      assumptions: {
        requiredReturn: clamp(assumptions.requiredReturn + 0.03, 0.01, 0.35),
        estimatedGrowth: clamp(assumptions.estimatedGrowth - 0.05, -0.2, 0.5),
        growthSource: assumptions.growthSource,
      },
    },
    {
      name: "Base",
      note: "aktuelle Annahmen",
      assumptions,
    },
    {
      name: "Bull",
      note: "höheres Wachstum, niedrigere Renditeforderung",
      assumptions: {
        requiredReturn: clamp(assumptions.requiredReturn - 0.02, 0.01, 0.35),
        estimatedGrowth: clamp(assumptions.estimatedGrowth + 0.05, -0.2, 0.5),
        growthSource: assumptions.growthSource,
      },
    },
  ];

  return (
    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">
            Szenarien
          </h2>
          <p className="mt-1 text-xs text-[var(--color-ink-tertiary)]">
            Die Sheet-Logik wird gegen drei Annahmenbänder gerechnet.
          </p>
        </div>
        <span className="tnum text-xs font-semibold text-[var(--color-ink-tertiary)]">
          EPS × Wachstum × hist. KGV ÷ Rendite
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {scenarios.map((scenario) => {
          const intrinsic = intrinsicValue(analysis, scenario.assumptions);
          const difference =
            intrinsic !== null && intrinsic !== 0
              ? 1 - analysis.currentPrice / intrinsic
              : null;
          const positive = (difference ?? 0) >= 0;

          return (
            <article
              key={scenario.name}
              className="glass-soft premium-transition rounded-[1.55rem] p-4 hover:-translate-y-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-ink)]">
                    {scenario.name}
                  </h3>
                  <p className="mt-1 text-xs leading-snug text-[var(--color-ink-tertiary)]">
                    {scenario.note}
                  </p>
                </div>
                <span
                  className={`tnum rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] ${
                    positive
                      ? "bg-[var(--color-positive)]/12 text-[var(--color-positive)]"
                      : "bg-[var(--color-negative)]/10 text-[var(--color-negative)]"
                  }`}
                >
                  {pct(difference, true)}
                </span>
              </div>
              <div className="tnum mt-6 text-3xl font-semibold text-[var(--color-ink)]">
                {money(intrinsic, analysis.currency)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--color-ink-secondary)]">
                <span className="rounded-xl bg-white/38 px-2 py-1">
                  Rendite {pct(scenario.assumptions.requiredReturn)}
                </span>
                <span className="rounded-xl bg-white/38 px-2 py-1">
                  Wachstum {pct(scenario.assumptions.estimatedGrowth)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
