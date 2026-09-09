import type { Valuation } from "../types/analysis";
import { money, pct } from "../lib/format";

interface Props {
  valuation: Valuation;
  currency: string;
}

/**
 * Margin-of-Safety-Leiste: 5 Zielpreise (50→10 % Abschlag).
 * Der aktuelle Kurs wird als Marker eingeblendet, damit man sieht,
 * in welcher Sicherheitszone man kauft.
 */
export function MarginOfSafetyBar({ valuation: v, currency }: Props) {
  if (v.intrinsicValue === null) return null;
  const steps = v.marginOfSafety;

  return (
    <section className="card p-6 sm:p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">
          Margin of Safety
        </h2>
        <span className="text-xs text-[var(--color-ink-tertiary)]">
          Zielkaufpreise mit Sicherheitsabschlag
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {steps.map((s) => {
          const reached = v.currentPrice <= s.price;
          return (
            <div
              key={s.discount}
              className={`premium-transition flex flex-col items-center rounded-2xl px-3 py-4 text-center ring-1 ${
                reached ? "ring-[rgba(47,191,113,0.24)]" : "ring-white/50"
              }`}
              style={{
                boxShadow: reached
                  ? "inset 0 1px 0 rgba(255,255,255,0.72), 0 14px 34px rgba(47,191,113,0.11)"
                  : "inset 0 1px 0 rgba(255,255,255,0.58)",
                background: reached ? "rgba(47,191,113,0.09)" : "rgba(255,255,255,0.34)",
              }}
            >
              <span className="text-xs font-medium text-[var(--color-ink-tertiary)]">
                −{Math.round(s.discount * 100)} %
              </span>
              <span className="tnum mt-1 text-lg font-semibold text-[var(--color-ink)]">
                {money(s.price, currency)}
              </span>
              {reached && (
                <span className="mt-1 text-[10px] font-semibold uppercase text-[var(--color-positive)]">
                  erreicht
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-[var(--color-ink-tertiary)]">
        Aktueller Kurs {money(v.currentPrice, currency)} —{" "}
        {v.currentPrice <= steps[0].price
          ? "tief in der Sicherheitszone."
          : v.currentPrice <= steps[4].price
            ? "innerhalb der Sicherheitszone."
            : "über allen Sicherheitsstufen."}
        {v.targetBuyPrice !== null
          ? ` Zielkaufpreis ${money(v.targetBuyPrice, currency)}.`
          : ""}
        {v.impliedGrowth !== null
          ? ` Eingepreistes Wachstum ${pct(v.impliedGrowth)}.`
          : ""}
      </p>
    </section>
  );
}
