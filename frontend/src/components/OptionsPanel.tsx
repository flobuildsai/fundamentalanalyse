import { useEffect, useMemo, useState } from "react";

import { AnalyzeError, calculateOptionTrade } from "../api/client";
import { money, pct } from "../lib/format";
import type { OptionStrategyKind, OptionTradeMetrics, OptionTradeRequest } from "../types/options";

const STRATEGIES: Array<{ value: OptionStrategyKind; label: string }> = [
  { value: "cash_secured_put", label: "Cash Secured Put" },
  { value: "short_put", label: "Short Put" },
  { value: "covered_call", label: "Covered Call" },
  { value: "bull_put_spread", label: "Bull Put Spread" },
  { value: "bear_call_spread", label: "Bear Call Spread" },
];

const DEFAULT_TRADE: OptionTradeRequest = {
  strategyKind: "cash_secured_put",
  underlying: "V",
  openedAt: "2026-05-06",
  expiry: "2026-06-05",
  underlyingPrice: 319.19,
  shortStrike: 310,
  premium: 4.15,
  fees: 0.02,
  contracts: 1,
  multiplier: 100,
  buybackTargetPct: 0.2,
};

function NumericInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
        {label}
      </span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="mt-2 w-full rounded-[1rem] bg-white/58 px-3 py-2 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/70 outline-none focus:ring-[var(--color-sage)]"
      />
    </label>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-[1rem] bg-white/58 px-3 py-2 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/70 outline-none focus:ring-[var(--color-sage)]"
      />
    </label>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (value: string | null) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
        {label}
      </span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="mt-2 w-full rounded-[1rem] bg-white/58 px-3 py-2 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/70 outline-none focus:ring-[var(--color-sage)]"
      />
    </label>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="rounded-[1.25rem] bg-white/42 p-4 ring-1 ring-white/62">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
        {label}
      </p>
      <div className="tnum mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
        {value}
      </div>
      {detail && <p className="mt-1 text-xs text-[var(--color-ink-tertiary)]">{detail}</p>}
    </article>
  );
}

function needsLongStrike(strategy: OptionStrategyKind) {
  return strategy === "bull_put_spread" || strategy === "bear_call_spread";
}

export function OptionsPanel() {
  const [trade, setTrade] = useState<OptionTradeRequest>(DEFAULT_TRADE);
  const [metrics, setMetrics] = useState<OptionTradeMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sanitizedTrade = useMemo<OptionTradeRequest>(() => {
    const next = { ...trade };
    if (!needsLongStrike(next.strategyKind)) next.longStrike = null;
    return next;
  }, [trade]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    calculateOptionTrade(sanitizedTrade)
      .then((result) => {
        if (!cancelled) setMetrics(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setMetrics(null);
        setError(
          err instanceof AnalyzeError
            ? "Optionsrechner konnte das Backend nicht erreichen oder Eingaben sind ungültig."
            : "Optionsrechner konnte nicht geladen werden.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sanitizedTrade]);

  return (
    <section className="space-y-6">
      <div className="glass-strong rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
              Native Options Engine
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
              Prämie, Risiko und annualisierte Rendite
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-secondary)]">
              Die Options-Formeln laufen jetzt in unserer App. Kein Spreadsheet, keine Google-Funktion,
              nur reproduzierbare Backend-Rechnung.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTrade(DEFAULT_TRADE)}
            className="rounded-[var(--radius-pill)] bg-white/58 px-4 py-2 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/70"
          >
            Template zurücksetzen
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <label className="block md:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
              Strategie
            </span>
            <select
              value={trade.strategyKind}
              onChange={(event) =>
                setTrade((current) => ({
                  ...current,
                  strategyKind: event.target.value as OptionStrategyKind,
                  longStrike: needsLongStrike(event.target.value as OptionStrategyKind) ? current.longStrike ?? current.shortStrike - 10 : null,
                }))
              }
              className="mt-2 w-full rounded-[1rem] bg-white/58 px-3 py-2 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/70 outline-none focus:ring-[var(--color-sage)]"
            >
              {STRATEGIES.map((strategy) => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </label>
          <TextInput label="Underlying" value={trade.underlying} onChange={(underlying) => setTrade((current) => ({ ...current, underlying: underlying.toUpperCase() }))} />
          <NumericInput label="Underlying Price" value={trade.underlyingPrice} onChange={(underlyingPrice) => setTrade((current) => ({ ...current, underlyingPrice: underlyingPrice ?? 0 }))} />
          <DateInput label="Open" value={trade.openedAt} onChange={(openedAt) => setTrade((current) => ({ ...current, openedAt: openedAt ?? current.openedAt }))} />
          <DateInput label="Expiry" value={trade.expiry} onChange={(expiry) => setTrade((current) => ({ ...current, expiry: expiry ?? current.expiry }))} />
          <NumericInput label="Short Strike" value={trade.shortStrike} onChange={(shortStrike) => setTrade((current) => ({ ...current, shortStrike: shortStrike ?? 0 }))} />
          <NumericInput label="Long Strike" value={trade.longStrike ?? null} onChange={(longStrike) => setTrade((current) => ({ ...current, longStrike }))} />
          <NumericInput label="Premium" value={trade.premium} onChange={(premium) => setTrade((current) => ({ ...current, premium: premium ?? 0 }))} />
          <NumericInput label="Fees" value={trade.fees ?? 0} onChange={(fees) => setTrade((current) => ({ ...current, fees: fees ?? 0 }))} />
          <NumericInput label="Contracts" value={trade.contracts ?? 1} onChange={(contracts) => setTrade((current) => ({ ...current, contracts: contracts ?? 1 }))} />
          <NumericInput label="Buyback %" value={trade.buybackTargetPct ?? 0.2} onChange={(buybackTargetPct) => setTrade((current) => ({ ...current, buybackTargetPct: buybackTargetPct ?? 0 }))} />
        </div>
      </div>

      {error && <div className="card p-5 text-sm font-semibold text-[var(--color-negative)]">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="DTE" value={loading ? "…" : `${metrics?.dte ?? "—"}`} />
        <Metric label="Net Premium" value={money(metrics?.netPremium, "USD", 2)} />
        <Metric label="Risk / Share" value={money(metrics?.capitalAtRiskPerShare, "USD", 2)} />
        <Metric label="Ann. Return" value={pct(metrics?.annualizedReturn)} />
        <Metric label="Total Premium" value={money(metrics?.totalPremium, "USD", 0)} />
        <Metric label="Total Risk" value={money(metrics?.totalRisk, "USD", 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">Setup-Kennzahlen</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="Return on Risk" value={pct(metrics?.returnOnRisk)} />
            <Metric label="Breakeven" value={money(metrics?.breakeven, "USD", 2)} />
            <Metric label="Spread Width" value={metrics?.spreadWidth == null ? "—" : money(metrics.spreadWidth, "USD", 2)} />
            <Metric label="Buyback Target" value={money(metrics?.buybackTargetPrice, "USD", 2)} />
          </div>
        </section>
        <section className="card p-5">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">Datenqualität</h3>
          <div className="mt-4 rounded-[1.25rem] bg-white/42 p-4 ring-1 ring-white/62">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {metrics?.dataQuality === "ok" ? "OK" : "Placeholder / ungültige Historie"}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-secondary)]">
              {metrics?.warnings.length
                ? metrics.warnings.join(", ")
                : "Keine Warnungen. Realisierte Rendite wird erst berechnet, wenn valide Close-Daten vorhanden sind."}
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
