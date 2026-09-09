import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AnalyzeError, analyze, calculateOptionTrade } from "../api/client";
import {
  createOptionJournalEntry,
  deleteRemoteOptionEntry,
  loadLocalOptionJournal,
  loadRemoteOptionJournal,
  removeLocalOptionEntry,
  saveLocalOptionJournal,
  saveRemoteOptionEntry,
  upsertLocalOptionEntry,
} from "../lib/optionsJournal";
import { money, pct } from "../lib/format";
import type {
  OptionJournalEntry,
  OptionStrategyKind,
  OptionTradeMetrics,
  OptionTradeRequest,
} from "../types/options";

const STRATEGIES: Array<{ value: OptionStrategyKind; label: string; hint: string }> = [
  { value: "cash_secured_put", label: "Cash Secured Put", hint: "Investment-Put" },
  { value: "short_put", label: "Short Put", hint: "Cashflow-Put" },
  { value: "covered_call", label: "Covered Call", hint: "Bestand absichern" },
  { value: "bull_put_spread", label: "Bull Put Spread", hint: "Definierter Put-Risk" },
  { value: "bear_call_spread", label: "Bear Call Spread", hint: "Definierter Call-Risk" },
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
  closedAt: null,
  actualBuybackPrice: null,
};

function NumericInput({
  label,
  value,
  onChange,
  step = "0.01",
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="option-input"
      />
    </label>
  );
}

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}) {
  return (
    <NumericInput
      label={label}
      value={value == null ? null : value * 100}
      onChange={(next) => onChange(next == null ? null : next / 100)}
      step="1"
    />
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
        className="option-input"
      />
    </label>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="option-metric">
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

function defaultLongStrike(strategy: OptionStrategyKind, shortStrike: number) {
  if (strategy === "bull_put_spread") return shortStrike - 10;
  if (strategy === "bear_call_spread") return shortStrike + 10;
  return null;
}

function strikeStep(price: number) {
  if (price >= 100) return 5;
  if (price >= 25) return 2.5;
  return 1;
}

function suggestedShortStrike(strategy: OptionStrategyKind, price: number) {
  const step = strikeStep(price);
  const target =
    strategy === "covered_call" || strategy === "bear_call_spread"
      ? price * 1.05
      : price * 0.95;
  const rounded =
    strategy === "covered_call" || strategy === "bear_call_spread"
      ? Math.ceil(target / step) * step
      : Math.floor(target / step) * step;
  return Number(Math.max(step, rounded).toFixed(2));
}

function statusLabel(metrics: OptionTradeMetrics | null) {
  if (!metrics) return "—";
  if (metrics.status === "closed") return "Geschlossen";
  if (metrics.status === "invalid") return "Prüfen";
  return "Offen";
}

function signalClass(metrics: OptionTradeMetrics | null) {
  if (!metrics) return "";
  if (metrics.status === "invalid") return "danger";
  if (metrics.annualizedReturn >= 0.18 && metrics.distanceToPricePct >= 0.03) return "strong";
  if (metrics.annualizedReturn >= 0.12) return "watch";
  return "";
}

function mergeJournalEntries(
  current: OptionJournalEntry[],
  incoming: OptionJournalEntry[],
): OptionJournalEntry[] {
  const entries = new Map<string, OptionJournalEntry>();
  for (const entry of current) entries.set(entry.id, entry);
  for (const entry of incoming) entries.set(entry.id, entry);
  return Array.from(entries.values()).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

function strategyLabel(kind: OptionStrategyKind) {
  return STRATEGIES.find((strategy) => strategy.value === kind)?.label ?? kind;
}

function JournalRow({
  entry,
  onLoad,
  onRemove,
}: {
  entry: OptionJournalEntry;
  onLoad: (entry: OptionJournalEntry) => void;
  onRemove: (entry: OptionJournalEntry) => void;
}) {
  return (
    <article className="option-journal-row">
      <button type="button" onClick={() => onLoad(entry)}>
        <span>
          <strong>{entry.request.underlying}</strong>
          <small>{strategyLabel(entry.request.strategyKind)}</small>
        </span>
        <span className="tnum">{pct(entry.metrics.annualizedReturn)}</span>
        <span className="tnum">{money(entry.metrics.totalRisk, "USD", 0)}</span>
        <span>{entry.metrics.status === "closed" ? "Closed" : entry.metrics.status === "invalid" ? "Check" : "Open"}</span>
      </button>
      <button type="button" aria-label={`${entry.request.underlying} entfernen`} onClick={() => onRemove(entry)} />
    </article>
  );
}

export function OptionsPanel({ user = null }: { user?: User | null }) {
  const [trade, setTrade] = useState<OptionTradeRequest>(DEFAULT_TRADE);
  const [metrics, setMetrics] = useState<OptionTradeMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journal, setJournal] = useState<OptionJournalEntry[]>(loadLocalOptionJournal);
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalMessage, setJournalMessage] = useState<string | null>(null);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [tickerMessage, setTickerMessage] = useState<string | null>(null);

  const sanitizedTrade = useMemo<OptionTradeRequest>(() => {
    const next = { ...trade };
    if (!needsLongStrike(next.strategyKind)) next.longStrike = null;
    if (!next.closedAt) next.actualBuybackPrice = null;
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
            ? "Bitte Eingaben prüfen. Das Backend hat den Trade nicht akzeptiert."
            : "Optionenrechner konnte nicht geladen werden.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sanitizedTrade]);

  useEffect(() => {
    saveLocalOptionJournal(journal);
  }, [journal]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setJournalBusy(true);
    loadRemoteOptionJournal(user)
      .then((remoteEntries) => {
        if (cancelled) return;
        setJournal((current) => mergeJournalEntries(current, remoteEntries));
        setJournalMessage("Optionen-Journal aus Supabase geladen.");
      })
      .catch(() => {
        if (!cancelled) {
          setJournalMessage("Lokal aktiv. Supabase-Journal wartet auf Migration/Auth.");
        }
      })
      .finally(() => {
        if (!cancelled) setJournalBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveTrade = async () => {
    if (!metrics || loading) return;
    const entry = createOptionJournalEntry(sanitizedTrade, metrics);
    setJournal((current) => upsertLocalOptionEntry(current, entry));
    setJournalMessage("Trade lokal gespeichert.");

    if (!user) return;

    setJournalBusy(true);
    try {
      const synced = await saveRemoteOptionEntry(user, entry);
      setJournal((current) => upsertLocalOptionEntry(current, synced));
      setJournalMessage("Trade in Supabase gespeichert.");
    } catch {
      setJournalMessage("Lokal gespeichert. Cloud-Sync wartet auf Supabase-Migration.");
    } finally {
      setJournalBusy(false);
    }
  };

  const loadEntry = (entry: OptionJournalEntry) => {
    setTrade(entry.request);
    setMetrics(entry.metrics);
    setJournalMessage(`${entry.request.underlying} ins Setup geladen.`);
  };

  const removeEntry = async (entry: OptionJournalEntry) => {
    setJournal((current) => removeLocalOptionEntry(current, entry.id));
    setJournalMessage("Trade aus lokalem Journal entfernt.");
    if (!user) return;
    try {
      await deleteRemoteOptionEntry(user, entry.id);
      setJournalMessage("Trade aus Supabase entfernt.");
    } catch {
      setJournalMessage("Lokal entfernt. Cloud-Löschung konnte nicht bestätigt werden.");
    }
  };

  const applySuggestedStrike = (price = trade.underlyingPrice) => {
    if (!price || price <= 0) return;
    const shortStrike = suggestedShortStrike(trade.strategyKind, price);
    setTrade((current) => ({
      ...current,
      shortStrike,
      longStrike: needsLongStrike(current.strategyKind)
        ? defaultLongStrike(current.strategyKind, shortStrike)
        : null,
    }));
  };

  const loadUnderlying = async () => {
    const symbol = trade.underlying.trim().toUpperCase();
    if (!symbol) {
      setTickerMessage("Ticker fehlt.");
      return;
    }
    setTickerLoading(true);
    setTickerMessage(null);
    try {
      const result = await analyze(symbol);
      const shortStrike = suggestedShortStrike(trade.strategyKind, result.currentPrice);
      setTrade((current) => ({
        ...current,
        underlying: result.ticker,
        underlyingPrice: result.currentPrice,
        shortStrike,
        longStrike: needsLongStrike(current.strategyKind)
          ? defaultLongStrike(current.strategyKind, shortStrike)
          : null,
      }));
      setTickerMessage(`${result.companyName} geladen · Kurs ${money(result.currentPrice, result.currency, 2)}`);
    } catch (err) {
      setTickerMessage(
        err instanceof AnalyzeError && err.code === "ticker_not_found"
          ? "Ticker nicht gefunden."
          : "Kurs konnte gerade nicht geladen werden.",
      );
    } finally {
      setTickerLoading(false);
    }
  };

  const journalStats = useMemo(() => {
    const closed = journal.filter((entry) => entry.metrics.status === "closed").length;
    const totalPremium = journal.reduce((sum, entry) => sum + entry.metrics.totalPremium, 0);
    const totalRisk = journal.reduce((sum, entry) => sum + entry.metrics.totalRisk, 0);
    const avgAnnualized =
      journal.length === 0
        ? null
        : journal.reduce((sum, entry) => sum + entry.metrics.annualizedReturn, 0) /
          journal.length;
    return { closed, totalPremium, totalRisk, avgAnnualized };
  }, [journal]);

  return (
    <section className="space-y-6">
      <div className="option-desk">
        <div className="option-desk-top">
          <div className="min-w-0">
            <p className="origin-eyebrow">Trade Setup</p>
            <h2>Optionen-Rechner</h2>
          </div>
          <button
            type="button"
            onClick={() => setTrade(DEFAULT_TRADE)}
            className="option-reset"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={saveTrade}
            className="option-save"
            disabled={!metrics || loading || journalBusy}
          >
            Speichern
          </button>
        </div>

        <div className="option-desk-grid">
          <div className="option-form">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-tertiary)]">
                Strategie
              </span>
              <div className="options-strategy-grid" role="radiogroup" aria-label="Optionenstrategie">
                {STRATEGIES.map((strategy) => (
                  <button
                    key={strategy.value}
                    type="button"
                    role="radio"
                    aria-checked={trade.strategyKind === strategy.value}
                    className={trade.strategyKind === strategy.value ? "active" : undefined}
                    onClick={() =>
                      setTrade((current) => ({
                        ...current,
                        strategyKind: strategy.value,
                        longStrike: needsLongStrike(strategy.value)
                          ? current.longStrike ?? defaultLongStrike(strategy.value, current.shortStrike)
                          : null,
                      }))
                    }
                  >
                    <span>{strategy.label}</span>
                    <small>{strategy.hint}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="option-underlying-panel">
              <label className="option-underlying-main">
                <span>Aktie</span>
                <input
                  value={trade.underlying}
                  onChange={(event) =>
                    setTrade((current) => ({
                      ...current,
                      underlying: event.target.value.toUpperCase(),
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void loadUnderlying();
                  }}
                  aria-label="Aktienticker"
                />
              </label>
              <label className="option-underlying-price">
                <span>Kurs</span>
                <input
                  type="number"
                  step="0.01"
                  value={trade.underlyingPrice}
                  onChange={(event) =>
                    setTrade((current) => ({
                      ...current,
                      underlyingPrice: Number(event.target.value),
                    }))
                  }
                  aria-label="Aktueller Aktienkurs"
                />
              </label>
              <div className="option-underlying-actions">
                <button type="button" onClick={loadUnderlying} disabled={tickerLoading}>
                  {tickerLoading ? "Lädt" : "Kurs laden"}
                </button>
                <button
                  type="button"
                  onClick={() => applySuggestedStrike()}
                  disabled={!trade.underlyingPrice}
                >
                  5% OTM
                </button>
              </div>
              {tickerMessage && <p className="option-helper">{tickerMessage}</p>}
            </div>

            <div className="option-field-grid">
              <DateInput label="Open" value={trade.openedAt} onChange={(openedAt) => setTrade((current) => ({ ...current, openedAt: openedAt ?? current.openedAt }))} />
              <DateInput label="Expiry" value={trade.expiry} onChange={(expiry) => setTrade((current) => ({ ...current, expiry: expiry ?? current.expiry }))} />
              <NumericInput label="Short Strike" value={trade.shortStrike} onChange={(shortStrike) => setTrade((current) => ({ ...current, shortStrike: shortStrike ?? 0 }))} />
              {needsLongStrike(trade.strategyKind) && (
                <NumericInput label="Long Strike" value={trade.longStrike ?? null} onChange={(longStrike) => setTrade((current) => ({ ...current, longStrike }))} />
              )}
              <NumericInput label="Prämie" value={trade.premium} onChange={(premium) => setTrade((current) => ({ ...current, premium: premium ?? 0 }))} />
              <NumericInput label="Gebühren" value={trade.fees ?? 0} onChange={(fees) => setTrade((current) => ({ ...current, fees: fees ?? 0 }))} />
              <NumericInput label="Kontrakte" value={trade.contracts ?? 1} onChange={(contracts) => setTrade((current) => ({ ...current, contracts: contracts ?? 1 }))} step="1" />
              <NumericInput label="Multiplier" value={trade.multiplier ?? 100} onChange={(multiplier) => setTrade((current) => ({ ...current, multiplier: multiplier ?? 100 }))} step="1" />
              <PercentInput label="Rückkaufziel" value={trade.buybackTargetPct ?? 0.2} onChange={(buybackTargetPct) => setTrade((current) => ({ ...current, buybackTargetPct: buybackTargetPct ?? 0 }))} />
            </div>

            <div className="option-close-grid">
              <DateInput label="Close optional" value={trade.closedAt ?? null} onChange={(closedAt) => setTrade((current) => ({ ...current, closedAt, actualBuybackPrice: closedAt ? current.actualBuybackPrice : null }))} />
              <NumericInput label="Rückkaufpreis" value={trade.actualBuybackPrice ?? null} onChange={(actualBuybackPrice) => setTrade((current) => ({ ...current, actualBuybackPrice }))} />
            </div>
          </div>

          <aside className={`option-signal ${signalClass(metrics)}`}>
            <div>
              <p className="origin-eyebrow">Return</p>
              <strong className="tnum">{loading ? "…" : pct(metrics?.annualizedReturn)}</strong>
              <span>{statusLabel(metrics)}</span>
            </div>
            <dl>
              <div>
                <dt>OTM-Abstand</dt>
                <dd className="tnum">{pct(metrics?.distanceToPricePct, true)}</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd className="tnum">{money(metrics?.totalRisk, "USD", 0)}</dd>
              </div>
              <div>
                <dt>Premium</dt>
                <dd className="tnum">{money(metrics?.totalPremium, "USD", 0)}</dd>
              </div>
              <div>
                <dt>Breakeven</dt>
                <dd className="tnum">{money(metrics?.breakeven, "USD", 2)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>

      {error && <div className="card p-5 text-sm font-semibold text-[var(--color-negative)]">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <Metric label="DTE" value={loading ? "…" : `${metrics?.dte ?? "—"}`} />
        <Metric label="OTM-Abstand" value={pct(metrics?.distanceToPricePct, true)} />
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
            <Metric label="Realisiert p.a." value={pct(metrics?.realizedAnnualizedReturn)} />
          </div>
        </section>
        <section className="card p-5">
          <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">Datenqualität</h3>
          <div className="mt-4 rounded-[1.25rem] bg-white/42 p-4 ring-1 ring-white/62">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {metrics?.dataQuality === "ok" ? "OK" : "Close-Daten prüfen"}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-secondary)]">
              {metrics?.warnings.length
                ? metrics.warnings.join(", ")
                : "Keine Warnungen. Realisierte Rendite wird erst berechnet, wenn valide Close-Daten vorhanden sind."}
            </p>
          </div>
        </section>
      </div>

      <section className="option-journal">
        <div className="option-journal-header">
          <div>
            <p className="origin-eyebrow">Journal</p>
            <h3>Gespeicherte Trades</h3>
          </div>
          {journalMessage && <span>{journalMessage}</span>}
        </div>

        <div className="option-journal-stats">
          <Metric label="Trades" value={`${journal.length}`} />
          <Metric label="Closed" value={`${journalStats.closed}`} />
          <Metric label="Premium" value={money(journalStats.totalPremium, "USD", 0)} />
          <Metric label="Risk" value={money(journalStats.totalRisk, "USD", 0)} />
          <Metric label="Ø p.a." value={pct(journalStats.avgAnnualized)} />
        </div>

        <div className="option-journal-list">
          {journal.length === 0 ? (
            <div className="option-journal-empty">
              Noch kein Trade gespeichert.
            </div>
          ) : (
            journal
              .slice(0, 8)
              .map((entry) => (
                <JournalRow
                  key={entry.id}
                  entry={entry}
                  onLoad={loadEntry}
                  onRemove={removeEntry}
                />
              ))
          )}
        </div>
      </section>
    </section>
  );
}
