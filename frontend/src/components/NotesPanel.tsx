export function NotesPanel({
  ticker,
  value,
  onChange,
}: {
  ticker: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="card p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">
            Notizen
          </h2>
          <p className="mt-1 text-xs text-[var(--color-ink-tertiary)]">
            Investment-Memo für {ticker}.
          </p>
        </div>
        <span className="tnum rounded-[var(--radius-pill)] bg-white/52 px-3 py-1 text-xs font-semibold text-[var(--color-ink-tertiary)] ring-1 ring-white/70">
          {value.length}/3000
        </span>
      </div>
      <textarea
        value={value}
        maxLength={3000}
        onChange={(event) => onChange(event.target.value)}
        placeholder="These, Risiken, nächster Check..."
        className="mt-5 min-h-36 w-full resize-y rounded-[1.35rem] border border-white/58 bg-white/34 px-4 py-3 text-sm leading-6 text-[var(--color-ink)] outline-none backdrop-blur placeholder:text-[var(--color-ink-tertiary)] focus:border-[var(--color-accent)]/35 focus:bg-white/58"
      />
    </section>
  );
}
