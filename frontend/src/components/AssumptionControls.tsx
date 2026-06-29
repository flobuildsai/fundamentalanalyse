import type { Analysis, Assumptions, GrowthSource } from "../types/analysis";
import { pct } from "../lib/format";

interface Props {
  value: Assumptions;
  analysis?: Analysis;
  onChange: (a: Assumptions) => void;
}

const SOURCE_OPTIONS: Array<{ value: GrowthSource; label: string }> = [
  { value: "zacks", label: "Zacks" },
  { value: "analyst", label: "Analysten" },
  { value: "manual", label: "Manuell" },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="glass-soft flex-1 rounded-2xl px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-[var(--color-ink-secondary)]">
          {label}
        </span>
        <span className="tnum text-sm font-semibold text-[var(--color-ink)]">
          {pct(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}

export function AssumptionControls({ value, analysis, onChange }: Props) {
  const growthPercent = Number((value.estimatedGrowth * 100).toFixed(1));
  const analystGrowth = analysis?.growthEstimate?.estimatedGrowth ?? null;

  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Annahmen</h2>
      <p className="mt-1 text-xs text-[var(--color-ink-tertiary)]">
        Quelle und Renditeforderung für diese Aktie.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Slider
          label="Geforderte Jahresrendite"
          value={value.requiredReturn}
          min={0.05}
          max={0.25}
          step={0.005}
          onChange={(requiredReturn) => onChange({ ...value, requiredReturn })}
        />
        <Slider
          label="Wachstum"
          value={value.estimatedGrowth}
          min={-0.1}
          max={0.3}
          step={0.005}
          onChange={(estimatedGrowth) =>
            onChange({ ...value, estimatedGrowth, growthSource: "manual" })
          }
        />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px]">
        <div className="glass-soft rounded-2xl p-1">
          <div className="grid grid-cols-3 gap-1">
            {SOURCE_OPTIONS.map((option) => {
              const active = value.growthSource === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      growthSource: option.value,
                      estimatedGrowth:
                        option.value === "analyst" && analystGrowth !== null
                          ? analystGrowth
                          : value.estimatedGrowth,
                    })
                  }
                  className={`premium-transition min-h-10 rounded-[1.15rem] px-2 text-sm font-semibold ${
                    active
                      ? "bg-white/84 text-[var(--color-ink)] shadow-[0_8px_24px_rgba(30,40,58,0.10)]"
                      : "text-[var(--color-ink-secondary)] hover:bg-white/46"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="glass-soft flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4">
          <span className="text-xs font-medium text-[var(--color-ink-tertiary)]">
            %
          </span>
          <input
            type="number"
            min={-10}
            max={30}
            step={0.5}
            value={growthPercent}
            onChange={(event) =>
              onChange({
                ...value,
                estimatedGrowth: Number(event.target.value) / 100,
                growthSource: "manual",
              })
            }
            className="tnum w-full bg-transparent text-right text-sm font-semibold text-[var(--color-ink)] outline-none"
          />
        </label>
      </div>
      <div className="mt-3 rounded-2xl bg-white/28 px-4 py-3 text-xs leading-5 text-[var(--color-ink-secondary)] ring-1 ring-white/46">
        {analystGrowth !== null ? (
          <>
            FMP-Analystenwert:{" "}
            <span className="tnum font-semibold text-[var(--color-ink)]">
              {pct(analystGrowth)}
            </span>
            {analysis?.growthEstimate?.horizonYears
              ? ` · ${analysis.growthEstimate.horizonYears}J EPS-Horizont`
              : ""}
          </>
        ) : (
          "Kein belastbarer Analystenwert verfügbar; nutze manuelle Annahmen."
        )}
      </div>
    </section>
  );
}
