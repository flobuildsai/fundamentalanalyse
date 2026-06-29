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

export function LoadingSkeleton() {
  return (
    <div className="mt-8 space-y-6">
      <div className="skeleton-panel h-48 rounded-[var(--radius-card)]" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="skeleton-panel h-72 rounded-[var(--radius-card)]" />
        <div className="skeleton-panel h-72 rounded-[var(--radius-card)]" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="skeleton-panel h-56 rounded-[var(--radius-card)]" />
        <div className="skeleton-panel h-56 rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
