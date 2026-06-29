import type { ReactNode } from "react";

import type { AppRoute } from "../lib/routes";

interface AppShellProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onHome: () => void;
  syncControls: ReactNode;
  mockBadge?: boolean;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ route: AppRoute; label: string }> = [
  { route: "analysis", label: "Analyse" },
  { route: "screener", label: "Screener" },
  { route: "regime", label: "Regime" },
  { route: "setups", label: "Setups" },
  { route: "portfolio", label: "Portfolio" },
  { route: "options", label: "Optionen" },
  { route: "watchlist", label: "Watchlist" },
];

function LogoMark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
      <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden="true">
        <path
          d="M32 16 L48 46 H16 Z"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function AppShell({
  activeRoute,
  onNavigate,
  onHome,
  syncControls,
  mockBadge = false,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-[100dvh] px-3 py-4 sm:px-5">
      <header className="sticky top-4 z-20 mx-auto max-w-[1280px]">
        <nav className="glass-strong flex flex-wrap items-center gap-2 rounded-[var(--radius-pill)] px-2.5 py-2 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={onHome}
            className="flex items-center gap-2 rounded-[var(--radius-pill)] pr-2 text-left"
            aria-label="Startseite öffnen"
          >
            <LogoMark />
            <span className="hidden shrink-0 whitespace-nowrap text-sm font-semibold text-[var(--color-ink)] sm:inline-flex">
              Fundamental-Analyst
            </span>
          </button>

          <div className="order-3 flex w-full gap-1 overflow-x-auto rounded-[var(--radius-pill)] bg-white/38 p-1 ring-1 ring-white/58 md:order-none md:w-auto md:overflow-visible">
            {NAV_ITEMS.map((item) => {
              const active = item.route === activeRoute;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  aria-current={active ? "page" : undefined}
                  className={`premium-transition shrink-0 rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold ${
                    active
                      ? "bg-[var(--color-ink)] text-[var(--color-paper)] shadow-[0_8px_20px_rgba(25,22,15,0.16)]"
                      : "text-[var(--color-ink-secondary)] hover:bg-white/72 hover:text-[var(--color-ink)]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onHome}
              className="premium-transition hidden rounded-[var(--radius-pill)] bg-white/48 px-3 py-1 text-xs font-semibold text-[var(--color-ink-secondary)] ring-1 ring-white/60 hover:bg-white/78 lg:inline-flex"
            >
              Startseite
            </button>
            {syncControls}
            {mockBadge && (
              <span className="whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--color-amber)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--color-amber)]">
                <span className="hidden sm:inline">Demo-Daten</span>
                <span className="sm:hidden">Demo</span>
              </span>
            )}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1280px] pb-24 pt-10 sm:pt-12">{children}</main>
    </div>
  );
}
