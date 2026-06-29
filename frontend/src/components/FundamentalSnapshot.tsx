import type { ReactNode } from "react";
import type { Analysis, AvgRow, GrowthRow, GrowthValue } from "../types/analysis";
import { compactMoney, growth, money, pct, ratio } from "../lib/format";

type Tone = "good" | "warn" | "bad" | "neutral";

function toneClass(tone: Tone): string {
  if (tone === "good") return "text-[var(--color-positive)] bg-[var(--color-positive)]/10";
  if (tone === "bad") return "text-[var(--color-negative)] bg-[var(--color-negative)]/9";
  if (tone === "warn") return "text-[var(--color-amber)] bg-[var(--color-amber)]/12";
  return "text-[var(--color-ink-secondary)] bg-white/42";
}

function signalFromPercent(value: number | null | undefined): Tone {
  if (value === null || value === undefined || Number.isNaN(value)) return "neutral";
  if (value >= 0.12) return "good";
  if (value >= 0.03) return "warn";
  return "bad";
}

function signalFromGrowth(value: GrowthValue): Tone {
  if (typeof value !== "number") return "neutral";
  if (value >= 0.08) return "good";
  if (value >= 0) return "warn";
  return "bad";
}

function signalFromDebt(value: number | null | undefined): Tone {
  if (value === null || value === undefined || Number.isNaN(value)) return "neutral";
  if (value <= 3) return "good";
  if (value <= 6) return "warn";
  return "bad";
}

function latest(row: AvgRow): number | null {
  return row.y1;
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl bg-white/30 px-3 py-2 ring-1 ring-white/48">
      <div className="text-[11px] font-medium text-[var(--color-ink-tertiary)]">
        {label}
      </div>
      <div
        className={`tnum mt-1 inline-flex max-w-full rounded-[var(--radius-pill)] px-2.5 py-1 text-sm font-semibold ${toneClass(tone)}`}
      >
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <article className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
        <span className="text-xs text-[var(--color-ink-tertiary)]">{subtitle}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{children}</div>
    </article>
  );
}

export function FundamentalSnapshot({ analysis }: { analysis: Analysis }) {
  const g = analysis.growth;
  const p = analysis.profitability;
  const m = analysis.margins;
  const d = analysis.debt;
  const b = analysis.balance;
  const dividend = analysis.dividend;
  const growthMetric = (row: GrowthRow) => row.y5;
  const sharesGrowth = growthMetric(g.sharesOutstanding);
  const sourceLabel =
    analysis.dataSource === "fmp"
      ? "FMP"
      : analysis.dataSource === "sec"
        ? "SEC"
        : "Fallback";

  return (
    <section className="grid gap-4 xl:grid-cols-4">
      <Panel title="Wachstum" subtitle="5J / 1J">
        <Stat
          label="Umsatz 5J"
          value={growth(growthMetric(g.revenue))}
          tone={signalFromGrowth(growthMetric(g.revenue))}
        />
        <Stat
          label="FCF 5J"
          value={growth(growthMetric(g.fcf))}
          tone={signalFromGrowth(growthMetric(g.fcf))}
        />
        <Stat
          label="EPS 1J"
          value={growth(g.eps.y1)}
          tone={signalFromGrowth(g.eps.y1)}
        />
        <Stat
          label="Shares 5J"
          value={growth(sharesGrowth)}
          tone={
            typeof sharesGrowth === "number" &&
            sharesGrowth <= 0
              ? "good"
              : "warn"
          }
        />
      </Panel>

      <Panel title="Profitabilität" subtitle={sourceLabel}>
        <Stat
          label="ROIC"
          value={pct(latest(p.roic))}
          tone={signalFromPercent(latest(p.roic))}
        />
        <Stat
          label="WACC"
          value={pct(latest(p.wacc))}
          tone={latest(p.wacc) === null ? "neutral" : "warn"}
        />
        <Stat
          label="Net Margin"
          value={pct(latest(m.netMargin))}
          tone={signalFromPercent(latest(m.netMargin))}
        />
        <Stat
          label="FCF Margin"
          value={pct(latest(m.fcfMargin))}
          tone={signalFromPercent(latest(m.fcfMargin))}
        />
      </Panel>

      <Panel title="Bilanz" subtitle="Risiko">
        <Stat
          label="Debt / FCF"
          value={ratio(d.debtToFcf)}
          tone={signalFromDebt(d.debtToFcf)}
        />
        <Stat
          label="Interest Cover"
          value={ratio(d.interestCoverage)}
          tone={
            d.interestCoverage === null
              ? "neutral"
              : d.interestCoverage >= 5
                ? "good"
                : d.interestCoverage >= 3
                  ? "warn"
                  : "bad"
          }
        />
        <Stat
          label="Net Debt"
          value={compactMoney(latest(b.netDebt), analysis.currency)}
          tone={latest(b.netDebt) !== null && latest(b.netDebt)! <= 0 ? "good" : "warn"}
        />
        <Stat
          label="Cash / Aktie"
          value={money(b.cashPerShare, analysis.currency)}
          tone="neutral"
        />
      </Panel>

      <Panel title="Ausschüttung" subtitle="Kapital">
        <Stat
          label="Div.-Rendite"
          value={pct(dividend.yield)}
          tone={dividend.yield === null ? "neutral" : dividend.yield > 0.04 ? "good" : "warn"}
        />
        <Stat
          label="Payout"
          value={pct(latest(dividend.payoutRatio))}
          tone={
            latest(dividend.payoutRatio) === null
              ? "neutral"
              : latest(dividend.payoutRatio)! <= 0.6
                ? "good"
                : "warn"
          }
        />
        <Stat
          label="Cash"
          value={compactMoney(latest(b.cashAndInvestments), analysis.currency)}
          tone="neutral"
        />
        <Stat
          label="Equity"
          value={compactMoney(latest(b.totalEquity), analysis.currency)}
          tone="neutral"
        />
      </Panel>
    </section>
  );
}
