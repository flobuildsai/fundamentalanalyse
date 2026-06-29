import type { Analysis } from "../types/analysis";
import { compactMoney, money, pct } from "../lib/format";

interface ChartSeries {
  label: string;
  values: number[];
  color: string;
  format: (value: number) => string;
}

function pointsFor(values: number[], min: number, max: number): string {
  if (values.length === 1) return `0,40 100,40`;
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 74 - ((value - min) / range) * 58;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function TrendCard({
  title,
  years,
  series,
}: {
  title: string;
  years: number[];
  series: ChartSeries[];
}) {
  const allValues = series.flatMap((item) => item.values);
  if (!years.length || !allValues.length) return null;

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const latestYear = years[years.length - 1];

  return (
    <article className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-ink)]">
            {title}
          </h3>
          <p className="mt-1 text-xs text-[var(--color-ink-tertiary)]">
            {years[0]} bis {latestYear}
          </p>
        </div>
        <div className="text-right">
          {series.map((item) => (
            <div key={item.label} className="tnum text-xs font-semibold">
              <span style={{ color: item.color }}>{item.label}</span>{" "}
              <span className="text-[var(--color-ink)]">
                {item.format(item.values[item.values.length - 1])}
              </span>
            </div>
          ))}
        </div>
      </div>

      <svg
        viewBox="0 0 100 80"
        className="mt-5 h-36 w-full overflow-visible"
        role="img"
        aria-label={`${title} Verlauf`}
        preserveAspectRatio="none"
      >
        <path
          d="M0 74H100"
          stroke="rgba(17,19,24,0.08)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M0 45H100"
          stroke="rgba(17,19,24,0.05)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M0 16H100"
          stroke="rgba(17,19,24,0.05)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {series.map((item) => (
          <polyline
            key={item.label}
            points={pointsFor(item.values, min, max)}
            fill="none"
            stroke={item.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </article>
  );
}

function aligned(
  years: number[] | undefined,
  values: number[] | undefined,
): { years: number[]; values: number[] } {
  if (!years?.length || !values?.length || years.length !== values.length) {
    return { years: [], values: [] };
  }
  return { years, values };
}

export function HistoricalTrends({ analysis }: { analysis: Analysis }) {
  const series = analysis.series;
  if (!series?.years?.length) return null;

  const revenue = aligned(series.years, series.revenue);
  const eps = aligned(series.years, series.eps);
  const fcf = aligned(series.years, series.fcf);
  const roic = aligned(series.years, series.roic);
  const wacc = aligned(series.years, series.wacc);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">
            Historische Entwicklung
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
            FMP-Pro-Reihen als schnelle Plausibilitätsprüfung.
          </p>
        </div>
        <span className="rounded-[var(--radius-pill)] bg-white/44 px-3 py-1 text-xs font-semibold text-[var(--color-ink-tertiary)] ring-1 ring-white/60">
          {series.years.length} Datenpunkte
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendCard
          title="Umsatz"
          years={revenue.years}
          series={[
            {
              label: "Revenue",
              values: revenue.values,
              color: "var(--color-accent)",
              format: (value) => compactMoney(value, analysis.currency, 1),
            },
          ]}
        />
        <TrendCard
          title="EPS"
          years={eps.years}
          series={[
            {
              label: "EPS",
              values: eps.values,
              color: "var(--color-positive)",
              format: (value) => money(value, analysis.currency),
            },
          ]}
        />
        <TrendCard
          title="Free Cashflow"
          years={fcf.years}
          series={[
            {
              label: "FCF",
              values: fcf.values,
              color: "var(--color-ink)",
              format: (value) => compactMoney(value, analysis.currency, 1),
            },
          ]}
        />
        <TrendCard
          title="ROIC gegen WACC"
          years={roic.years.length ? roic.years : wacc.years}
          series={[
            ...(roic.values.length
              ? [
                  {
                    label: "ROIC",
                    values: roic.values,
                    color: "var(--color-positive)",
                    format: pct,
                  },
                ]
              : []),
            ...(wacc.values.length
              ? [
                  {
                    label: "WACC",
                    values: wacc.values,
                    color: "var(--color-amber)",
                    format: pct,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </section>
  );
}
