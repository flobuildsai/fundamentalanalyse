import type { Valuation } from "../types/analysis";
import { money, pct } from "../lib/format";

interface Props {
  valuation: Valuation;
  currency: string;
}

export function ValuationHero({ valuation: v, currency }: Props) {
  const undervalued = (v.difference ?? 0) > 0;
  const naValue = v.intrinsicValue === null;
  const accent = undervalued ? "var(--color-positive)" : "var(--color-negative)";
  const epsLabel =
    v.guardrails.epsBasis === "normalized" ? "EPS normalisiert" : "Akt. EPS";
  const peLabel =
    v.guardrails.peBasis === "historical" ? "KGV hist." : "KGV effektiv";

  return (
    <div
      className="glass-strong relative overflow-hidden rounded-[2.25rem] p-7 sm:p-10"
      style={{
        backgroundImage: naValue
          ? undefined
          : `linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.42)), radial-gradient(95% 80% at 100% 0%, ${
              undervalued ? "rgba(47,191,113,0.14)" : "rgba(255,69,58,0.12)"
            } 0%, rgba(255,255,255,0) 62%)`,
      }}
    >
      <span className="rounded-[var(--radius-pill)] bg-white/52 px-3 py-1 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/70">
        Innerer Wert je Aktie
      </span>

      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <span className="tnum text-6xl font-semibold leading-none text-[var(--color-ink)] sm:text-8xl">
          {naValue ? "n/a" : money(v.intrinsicValue, currency)}
        </span>
        {!naValue && (
          <span
            className="mb-2 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3.5 py-1.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
            style={{ background: accent }}
          >
            {pct(Math.abs(v.difference ?? 0))}{" "}
            {undervalued ? "unterbewertet" : "überbewertet"}
          </span>
        )}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <Field label="Aktueller Kurs" value={money(v.currentPrice, currency)} />
        <Field label={epsLabel} value={money(v.currentEPS, currency)} />
        <Field label={peLabel} value={`${v.historicalPE.toLocaleString("de-DE", {
          maximumFractionDigits: 1,
        })}×`} />
        <Field label="eEPS (in 10J)" value={money(v.futureEPS, currency)} />
        <Field label="Kurs in 10J" value={money(v.futurePrice, currency)} />
        <Field label="Zielkaufpreis" value={money(v.targetBuyPrice, currency)} />
        <Field label="Modellrendite" value={pct(v.expectedAnnualReturn)} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-soft flex min-h-20 flex-col justify-center rounded-2xl px-4 py-3">
      <span className="text-xs text-[var(--color-ink-tertiary)]">{label}</span>
      <span className="tnum mt-1 text-base font-semibold text-[var(--color-ink)]">
        {value}
      </span>
    </div>
  );
}
