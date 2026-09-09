export function EmptyState() {
  return (
    <div className="fade-in mt-16 flex flex-col items-center text-center">
      <div className="glass-strong flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--color-ink)]">
        <svg viewBox="0 0 64 64" className="h-9 w-9">
          <path
            d="M32 16 L48 46 H16 Z"
            fill="none"
            stroke="#fff"
            strokeWidth="4"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-[var(--color-ink)]">
        Fundamental-Analyst
      </h2>
      <p className="mt-2 max-w-md text-[var(--color-ink-secondary)]">
        Lade eine Aktie, um inneren Wert, Szenarien, Datenqualität,
        Profitabilität und Margin of Safety zu vergleichen.
      </p>
    </div>
  );
}

export function ErrorState({
  code,
  ticker,
}: {
  code: string;
  ticker?: string;
}) {
  const messages: Record<string, string> = {
    ticker_not_found: `Für „${ticker}“ wurden keine Daten gefunden.`,
    provider_unavailable:
      "Die Datenquelle ist gerade nicht erreichbar. Versuch es gleich nochmal.",
    rate_limited:
      "Zu viele Anfragen — kurz warten und erneut versuchen.",
  };
  return (
    <div className="card fade-in mt-12 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-negative)]/10">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-[var(--color-negative)]"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        >
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
          <path d="M10.3 4.6 2.7 18a1.6 1.6 0 0 0 1.4 2.4h15.8a1.6 1.6 0 0 0 1.4-2.4L13.7 4.6a1.95 1.95 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <p className="mt-4 text-[var(--color-ink)]">
        {messages[code] ?? "Etwas ist schiefgelaufen."}
      </p>
    </div>
  );
}

export function ResearchStartPanel({
  ticker,
  loading,
  errorCode,
  errorTicker,
  quickTickers,
  onSelect,
}: {
  ticker: string | null;
  loading: boolean;
  errorCode?: string;
  errorTicker?: string;
  quickTickers: string[];
  onSelect: (ticker: string) => void;
}) {
  const messages: Record<string, string> = {
    ticker_not_found: `Keine Daten für ${errorTicker ?? ticker ?? "diesen Ticker"}.`,
    provider_unavailable: "Datenquelle gerade nicht erreichbar.",
    rate_limited: "Rate Limit erreicht. Kurz warten.",
  };
  const status = errorCode
    ? messages[errorCode] ?? "Analyse konnte nicht geladen werden."
    : loading
      ? `${ticker ?? "Ticker"} wird geladen`
      : "Ticker eingeben oder Watchlist öffnen";
  const title = errorCode
    ? "Daten prüfen"
    : loading
      ? "Live-Daten laden"
      : "Analyse starten";

  return (
    <section className="research-start-panel" aria-live="polite">
      <div className="research-start-copy">
        <p className="origin-eyebrow">Research Status</p>
        <div className="research-start-heading">
          <h2>{title}</h2>
          {ticker && <span>{ticker}</span>}
        </div>
        <p>
          {status}. Bewertung, Qualität, Bilanz und Datenquelle werden in
          einem fokussierten Score zusammengeführt.
        </p>
      </div>

      <div className="research-start-grid">
        <div>
          <span>Quelle</span>
          <strong>FMP Pro / SEC</strong>
        </div>
        <div>
          <span>Historie</span>
          <strong>10J Reihen</strong>
        </div>
        <div>
          <span>Modell</span>
          <strong>EPS x KGV</strong>
        </div>
      </div>

      <div className="research-start-tickers" aria-label="Schnelle Ticker">
        {quickTickers.map((item) => (
          <button key={item} type="button" onClick={() => onSelect(item)}>
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="loading-research-skeleton">
      <div className="loading-skeleton-title">
        <div className="skeleton-panel line w-64" />
        <div className="skeleton-panel line w-28" />
      </div>

      <div className="loading-skeleton-grid">
        <div className="skeleton-panel loading-card-main">
          <div className="skeleton-panel pill" />
          <div className="skeleton-panel number" />
          <div className="skeleton-panel line w-80" />
          <div className="loading-skeleton-metrics">
            <div className="skeleton-panel metric" />
            <div className="skeleton-panel metric" />
            <div className="skeleton-panel metric" />
            <div className="skeleton-panel metric" />
          </div>
        </div>
        <div className="skeleton-panel loading-card-side">
          <div className="skeleton-panel score" />
          <div className="skeleton-panel line w-40" />
          <div className="skeleton-panel line w-56" />
          <div className="skeleton-panel line w-52" />
          <div className="skeleton-panel line w-48" />
        </div>
      </div>

      <div className="loading-skeleton-mini">
        <div className="skeleton-panel mini" />
        <div className="skeleton-panel mini" />
        <div className="skeleton-panel mini" />
        <div className="skeleton-panel mini" />
      </div>
    </div>
  );
}
