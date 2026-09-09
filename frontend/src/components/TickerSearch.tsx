import { useState } from "react";

interface Props {
  onSearch: (ticker: string) => void;
  loading: boolean;
  placeholder?: string;
}

export function TickerSearch({ onSearch, loading, placeholder = "Ticker eingeben" }: Props) {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSearch(value.trim());
      }}
      className="ticker-search-form"
    >
      <div className="ticker-search">
        <svg
          className="ticker-search-icon"
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
          placeholder={placeholder}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="ticker-search-input tnum"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="ticker-search-button"
        >
          <span>{loading ? "Lädt…" : "Analysieren"}</span>
          <span className="ticker-search-button-icon">
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
