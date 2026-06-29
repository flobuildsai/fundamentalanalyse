import type { ReactNode } from "react";
import type { GrowthRow, AvgRow, GrowthValue } from "../types/analysis";
import { growth, heatClass } from "../lib/format";

const COLS: { key: keyof GrowthRow; label: string }[] = [
  { key: "y10", label: "10 J" },
  { key: "y7", label: "7 J" },
  { key: "y5", label: "5 J" },
  { key: "y3", label: "3 J" },
  { key: "y1", label: "1 J" },
];

export function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">
            {title}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-ink-tertiary)]">
            10/7/5/3/1 Jahre, aus dem Spreadsheet-Modell verdichtet.
          </p>
        </div>
        {badge ?? (
          <span className="rounded-[var(--radius-pill)] bg-white/42 px-3 py-1 text-xs font-semibold text-[var(--color-ink-tertiary)] ring-1 ring-white/60">
            Verlauf
          </span>
        )}
      </div>
      <div className="scrollbar-soft mt-4 overflow-x-auto px-2 pb-4 sm:px-4">
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-y-1">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] w-[34%] px-4 py-2 text-left text-xs font-medium text-[var(--color-ink-tertiary)] backdrop-blur-xl" />
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className="px-2 py-2 text-right text-xs font-semibold text-[var(--color-ink-tertiary)]"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

/** Wachstumszeile mit dezenter Heatmap. */
export function GrowthTableRow({
  label,
  row,
}: {
  label: string;
  row: GrowthRow;
}) {
  return (
    <tr>
      <td className="sticky left-0 z-[1] rounded-l-[1rem] bg-white/30 px-4 py-2.5 text-sm font-semibold leading-tight text-[var(--color-ink)] ring-1 ring-white/42 backdrop-blur-xl">
        <span className="line-clamp-2">{label}</span>
      </td>
      {COLS.map((c) => {
        const val = row[c.key] as GrowthValue;
        return (
          <td key={c.key} className="px-1.5 py-1.5">
            <div
              className={`tnum rounded-xl px-2 py-1.5 text-right text-sm font-medium ${heatClass(
                val,
              )} ${val === "neg." ? "text-[var(--color-ink-tertiary)]" : "text-[var(--color-ink)]"}`}
            >
              {growth(val)}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

/** Durchschnitts-/Wertzeile, optional als Prozent. */
export function AvgTableRow({
  label,
  row,
  format,
}: {
  label: string;
  row: AvgRow;
  format: (v: number | null) => string;
}) {
  return (
    <tr>
      <td className="sticky left-0 z-[1] rounded-l-[1rem] bg-white/30 px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/42 backdrop-blur-xl">
        <span className="line-clamp-2">{label}</span>
      </td>
      {COLS.map((c) => {
        const value = row[c.key];
        return (
          <td key={c.key} className="px-1.5 py-1.5">
            <div
              className={`tnum rounded-xl bg-white/28 px-2 py-1.5 text-right text-sm font-medium ring-1 ring-white/34 ${
                value === null
                  ? "text-[var(--color-ink-tertiary)]"
                  : "text-[var(--color-ink)]"
              }`}
            >
              {format(value)}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
