import type { Analysis } from "../types/analysis";
import {
  Section,
  GrowthTableRow,
  AvgTableRow,
} from "./MetricSection";
import { pct, compactNum, ratio, money, compactMoney } from "../lib/format";

export function GrowthSection({ a }: { a: Analysis }) {
  const g = a.growth;
  return (
    <Section title="Wachstum">
      <GrowthTableRow label="Umsatz" row={g.revenue} />
      <GrowthTableRow label="Gewinn je Aktie (EPS)" row={g.eps} />
      <GrowthTableRow label="Free Cashflow" row={g.fcf} />
      <GrowthTableRow label="Operating Cashflow" row={g.operatingCashflow} />
      <GrowthTableRow label="Buchwert je Aktie" row={g.bookValuePerShare} />
      <GrowthTableRow label="Umlaufende Aktien" row={g.sharesOutstanding} />
    </Section>
  );
}

export function ProfitabilitySection({ a }: { a: Analysis }) {
  const p = a.profitability;
  const badgeText =
    a.valueCreating === null
      ? "ROIC/WACC nicht verfügbar"
      : a.valueCreating
        ? "wertschaffend · ROIC > WACC"
        : "ROIC ≤ WACC";
  const badge = (
    <span
      className="rounded-[var(--radius-pill)] px-3 py-1 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
      style={{
        background:
          a.valueCreating === true
            ? "var(--color-positive)"
            : a.valueCreating === false
              ? "var(--color-negative)"
              : "var(--color-ink-tertiary)",
      }}
    >
      {badgeText}
    </span>
  );
  return (
    <Section title="Profitabilität" badge={badge}>
      <AvgTableRow
        label="Net Income"
        row={p.netIncome}
        format={(v) => compactNum(v, 1)}
      />
      <AvgTableRow label="Bruttomarge" row={a.margins.grossMargin} format={(v) => pct(v)} />
      <AvgTableRow label="Operative Marge" row={a.margins.operatingMargin} format={(v) => pct(v)} />
      <AvgTableRow label="Nettomarge" row={a.margins.netMargin} format={(v) => pct(v)} />
      <AvgTableRow label="FCF-Marge" row={a.margins.fcfMargin} format={(v) => pct(v)} />
      <AvgTableRow label="ROIC" row={p.roic} format={(v) => pct(v)} />
      <AvgTableRow label="ROE" row={p.roe} format={(v) => pct(v)} />
      <AvgTableRow label="WACC" row={p.wacc} format={(v) => pct(v)} />
    </Section>
  );
}

export function DebtSection({ a }: { a: Analysis }) {
  const d = a.debt;
  const b = a.balance;
  return (
    <Section title="Schulden">
      <AvgTableRow
        label="Gesamtschulden"
        row={b.totalDebt}
        format={(v) => compactMoney(v, a.currency)}
      />
      <AvgTableRow
        label="Cash & Investments"
        row={b.cashAndInvestments}
        format={(v) => compactMoney(v, a.currency)}
      />
      <AvgTableRow
        label="Net Debt"
        row={b.netDebt}
        format={(v) => compactMoney(v, a.currency)}
      />
      <tr>
        <td className="sticky left-0 z-[1] rounded-l-[1rem] bg-white/30 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/42 backdrop-blur-xl">
          Schulden / Free Cashflow
        </td>
        <td
          colSpan={5}
          className="px-1.5 py-1.5"
        >
          <div className="tnum rounded-xl bg-white/28 px-3 py-1.5 text-right text-sm font-medium text-[var(--color-ink)] ring-1 ring-white/34">
            {ratio(d.debtToFcf)}
          </div>
        </td>
      </tr>
      <tr>
        <td className="sticky left-0 z-[1] rounded-l-[1rem] bg-white/30 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/42 backdrop-blur-xl">
          Debt / Equity
        </td>
        <td
          colSpan={5}
          className="px-1.5 py-1.5"
        >
          <div className="tnum rounded-xl bg-white/28 px-3 py-1.5 text-right text-sm font-medium text-[var(--color-ink)] ring-1 ring-white/34">
            {ratio(b.debtToEquity)}
          </div>
        </td>
      </tr>
      <tr>
        <td className="sticky left-0 z-[1] rounded-l-[1rem] bg-white/30 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/42 backdrop-blur-xl">
          Interest Coverage
        </td>
        <td
          colSpan={5}
          className="px-1.5 py-1.5"
        >
          <div className="tnum rounded-xl bg-white/28 px-3 py-1.5 text-right text-sm font-medium text-[var(--color-ink)] ring-1 ring-white/34">
            {ratio(d.interestCoverage)}
          </div>
        </td>
      </tr>
    </Section>
  );
}

export function DividendSection({ a }: { a: Analysis }) {
  const d = a.dividend;
  return (
    <Section title="Dividende">
      <AvgTableRow
        label="Dividende je Aktie"
        row={d.dividend}
        format={(v) => money(v, a.currency)}
      />
      <AvgTableRow
        label="Ausschüttungsquote"
        row={d.payoutRatio}
        format={(v) => pct(v)}
      />
      <tr>
        <td className="sticky left-0 z-[1] rounded-l-[1rem] bg-white/30 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/42 backdrop-blur-xl">
          Dividendenrendite
        </td>
        <td
          colSpan={5}
          className="px-1.5 py-1.5"
        >
          <div className="tnum rounded-xl bg-white/28 px-3 py-1.5 text-right text-sm font-medium text-[var(--color-ink)] ring-1 ring-white/34">
            {pct(d.yield)}
          </div>
        </td>
      </tr>
    </Section>
  );
}
