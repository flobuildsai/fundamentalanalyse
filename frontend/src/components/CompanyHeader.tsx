import type { Analysis } from "../types/analysis";
import { money, num } from "../lib/format";

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-white/34 px-3.5 py-2.5 text-right ring-1 ring-white/52">
      <span className="text-[11px] font-medium text-[var(--color-ink-tertiary)]">
        {label}
      </span>
      <span className="tnum mt-1 block text-sm font-semibold text-[var(--color-ink)]">
        {value}
      </span>
    </div>
  );
}

export function CompanyHeader({ a }: { a: Analysis }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="max-w-4xl text-balance text-3xl font-semibold leading-none text-[var(--color-ink)] sm:text-4xl">
            {a.companyName}
          </h1>
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-card-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-[var(--color-hairline)]">
            {a.ticker}
          </span>
          {a.dataSource && (
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-positive)]/12 px-2.5 py-1 text-xs font-semibold uppercase text-[var(--color-positive)] ring-1 ring-[var(--color-positive)]/20">
              Live · {a.dataSource}
            </span>
          )}
        </div>
        <div className="tnum mt-2 text-2xl font-medium text-[var(--color-ink-secondary)]">
          {money(a.currentPrice, a.currency)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <StatPill label="KGV akt." value={num(a.currentPE, 1)} />
        <StatPill label="KGV hist." value={num(a.historicalPE, 1)} />
        <StatPill label="KGV eff." value={num(a.valuation.guardrails.effectivePE, 1)} />
        <StatPill label="Beta (5J)" value={num(a.beta, 2)} />
      </div>
    </div>
  );
}
