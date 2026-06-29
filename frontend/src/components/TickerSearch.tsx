import { useState } from "react";

interface Props {
  onSearch: (ticker: string) => void;
  loading: boolean;
}

export function TickerSearch({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSearch(value.trim());
      }}
      className="w-full"
    >
      <div className="relative flex items-center rounded-[2rem] bg-white/35 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_18px_54px_rgba(38,48,66,0.13)] ring-1 ring-white/70">
        <svg
          className="pointer-events-none absolute left-6 h-5 w-5 text-[var(--color-ink-tertiary)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="Ticker eingeben"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="tnum w-full rounded-[calc(2rem-0.375rem)] border-0 bg-white/58 py-4 pl-13 pr-36 text-lg font-medium text-[var(--color-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none backdrop-blur-xl transition-[background,box-shadow] duration-500 ease-[var(--ease-premium)] placeholder:text-[var(--color-ink-tertiary)] focus:bg-white/76 focus:ring-4 focus:ring-[var(--color-accent)]/15"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="group absolute right-3 inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-ink)] py-2 pl-5 pr-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_24px_rgba(17,19,24,0.18)] transition duration-500 ease-[var(--ease-premium)] hover:translate-y-[-1px] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
        >
          <span>{loading ? "Lädt…" : "Analysieren"}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 transition duration-500 ease-[var(--ease-premium)] group-hover:translate-x-0.5">
            <svg
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M6 14 14 6" />
              <path d="M8 6h6v6" />
            </svg>
          </span>
        </button>
      </div>
    </form>
  );
}
