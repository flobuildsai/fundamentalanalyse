import { useEffect, useMemo, useState } from "react";

import { AnalyzeError, calculatePortfolioSummary } from "../api/client";
import { compactMoney, money, pct } from "../lib/format";
import type {
  PortfolioPositionInput,
  PortfolioSettingsInput,
  PortfolioSummary,
} from "../types/portfolio";

const EMPTY_POSITIONS: PortfolioPositionInput[] = [];

const TEMPLATE_POSITIONS: PortfolioPositionInput[] = [
  { symbol: "AAPL", assetClass: "stock", strategy: "direct", quantity: 25, price: 214.05 },
  { symbol: "MSCI", assetClass: "stock", strategy: "direct", quantity: 10, price: 552.79 },
  { symbol: "META", assetClass: "stock", strategy: "direct", quantity: 50, price: 128.3 },
  { symbol: "GOOGL", assetClass: "stock", strategy: "direct", quantity: 50, price: 190 },
  { symbol: "AAPL", assetClass: "equity_option", strategy: "bull_put_spread", buyingPowerUsed: 1_000 },
  { symbol: "CMG", assetClass: "equity_option", strategy: "short_put", buyingPowerUsed: 4_000 },
  { symbol: "EW", assetClass: "equity_option", strategy: "cash_secured_put", buyingPowerUsed: 7_500 },
  { symbol: "BA", assetClass: "equity_option", strategy: "bear_call_spread", buyingPowerUsed: 2_000 },
  { symbol: "NG", assetClass: "future_option", strategy: "bear_call_spread", buyingPowerUsed: 2_500 },
  { symbol: "SB", assetClass: "future_option", strategy: "bull_put_spread", buyingPowerUsed: 2_240 },
];

const DEFAULT_SETTINGS: PortfolioSettingsInput = {
  netLiquidation: 25_000,
  baseCurrency: "USD",
  fxToUsd: 1,
  moderateUtilization: 1.25,
  criticalUtilization: 2,
};

const TEMPLATE_SETTINGS: PortfolioSettingsInput = {
  netLiquidation: 50_000,
  baseCurrency: "EUR",
  fxToUsd: 1.14038,
  moderateUtilization: 1.25,
  criticalUtilization: 2,
};

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

function Input({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-[1rem] bg-white/58 px-3 py-2 text-sm font-semibold text-[var(--color-ink)] ring-1 ring-white/70 outline-none focus:ring-[var(--color-sage)]"
      />
    </label>
  );
}

function allocationEntries(summary: PortfolioSummary | null) {
  return Object.entries(summary?.assetAllocation ?? {}).sort((a, b) => b[1].amount - a[1].amount);
}

function exposureEntries(summary: PortfolioSummary | null) {
  return Object.entries(summary?.underlyingExposure ?? {}).sort((a, b) => b[1].amount - a[1].amount);
}

export function PortfolioPanel() {
  const [settings, setSettings] = useState<PortfolioSettingsInput>(DEFAULT_SETTINGS);
  const [positions, setPositions] = useState<PortfolioPositionInput[]>(EMPTY_POSITIONS);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exposureCount = useMemo(() => positions.length, [positions]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    calculatePortfolioSummary({ settings, positions })
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof AnalyzeError
            ? "Portfolio-Rechner konnte das Backend nicht erreichen."
            : "Portfolio-Rechner konnte nicht geladen werden.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settings, positions]);

  return (
    <section className="space-y-6">
      <div className="glass-strong rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
              Native Portfolio Engine
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-ink)]">
              Kaufkraft, Cash und Exposure ohne Spreadsheet
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-secondary)]">
              Die Seite nutzt jetzt unsere eigene Backend-Logik. Das Template ist nur ein Strategy-Fixture;
              echte Persistenz/Import kommt als nächster DB-Schritt.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSettings(DEFAULT_SETTINGS);
                setPositions(EMPTY_POSITIONS);
              }}
              className="rounded-[var(--radius-pill)] bg-white/58 px-4 py-2 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/70"
            >
              Leer starten
            </button>
            <button
              type="button"
              onClick={() => {
                setSettings(TEMPLATE_SETTINGS);
                setPositions(TEMPLATE_POSITIONS);
              }}
              className="rounded-[var(--radius-pill)] bg-[var(--color-ink)] px-4 py-2 text-xs font-semibold text-[var(--color-paper)]"
            >
              Strategie-Template laden
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Input
            label="Net Liquidation"
            value={settings.netLiquidation}
            onChange={(netLiquidation) => setSettings((current) => ({ ...current, netLiquidation }))}
          />
          <Input
            label="FX zu USD"
            value={settings.fxToUsd}
            onChange={(fxToUsd) => setSettings((current) => ({ ...current, fxToUsd }))}
          />
          <Input
            label="Moderate Auslastung"
            value={settings.moderateUtilization}
            onChange={(moderateUtilization) => setSettings((current) => ({ ...current, moderateUtilization }))}
          />
          <Input
            label="Kritische Auslastung"
            value={settings.criticalUtilization}
            onChange={(criticalUtilization) => setSettings((current) => ({ ...current, criticalUtilization }))}
          />
        </div>
      </div>

      {error && <div className="card p-5 text-sm font-semibold text-[var(--color-negative)]">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Net Liq USD" value={compactMoney(summary?.netLiquidationUsd, "USD", 1)} />
        <Metric label="Used BP" value={compactMoney(summary?.usedBuyingPower, "USD", 1)} />
        <Metric label="Remaining BP" value={compactMoney(summary?.remainingModerateBuyingPower, "USD", 1)} />
        <Metric label="Cash" value={compactMoney(summary?.cash, "USD", 1)} />
        <Metric label="Moderate BP" value={compactMoney(summary?.moderateBuyingPower, "USD", 1)} />
        <Metric label="Positionen" value={loading ? "…" : String(exposureCount)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">Asset Allocation</h3>
          <div className="mt-4 space-y-3">
            {allocationEntries(summary).map(([label, bucket]) => (
              <div key={label} className="rounded-[1rem] bg-white/38 p-3 ring-1 ring-white/58">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-[var(--color-ink)]">{label}</span>
                  <span className="tnum text-[var(--color-ink-secondary)]">{money(bucket.amount, "USD", 0)} · {pct(bucket.weight)}</span>
                </div>
              </div>
            ))}
            {!allocationEntries(summary).length && <p className="text-sm text-[var(--color-ink-tertiary)]">Noch keine Allokation.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">Underlying Exposure</h3>
          <div className="mt-4 space-y-3">
            {exposureEntries(summary).slice(0, 8).map(([symbol, bucket]) => (
              <div key={symbol} className="flex items-center justify-between rounded-[1rem] bg-white/38 p-3 text-sm ring-1 ring-white/58">
                <span className="font-semibold text-[var(--color-ink)]">{symbol}</span>
                <span className="tnum text-[var(--color-ink-secondary)]">{money(bucket.amount, "USD", 0)} · {pct(bucket.weight)}</span>
              </div>
            ))}
            {!exposureEntries(summary).length && <p className="text-sm text-[var(--color-ink-tertiary)]">Keine Einzelpositionen hinterlegt.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
