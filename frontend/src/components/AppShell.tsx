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

const TRACK_ITEMS: Array<{ route: AppRoute; label: string; icon: ReactNode }> = [
  { route: "analysis", label: "Analyse", icon: <HomeIcon /> },
  { route: "watchlist", label: "Watchlist", icon: <ListIcon /> },
];

const SERVICE_ITEMS: Array<{ route: AppRoute; label: string; icon: ReactNode }> = [
  { route: "options", label: "Optionen", icon: <TrendIcon /> },
];

const ROUTE_META: Record<AppRoute, { title: string; detail: string }> = {
  analysis: {
    title: "Research Desk",
    detail: "Fair Value, Qualität und Bilanzrisiko für die aktive Aktie.",
  },
  options: {
    title: "Optionen",
    detail: "Prämie, Break-even, Risiko und Rendite sauber rechnen.",
  },
  watchlist: {
    title: "Watchlist",
    detail: "Sortieren, vergleichen, öffnen.",
  },
};

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg className="origin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <IconFrame>
      <path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z" />
    </IconFrame>
  );
}

function TrendIcon() {
  return (
    <IconFrame>
      <path d="m4 16 5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </IconFrame>
  );
}

function ListIcon() {
  return (
    <IconFrame>
      <path d="M7 6h13M7 12h13M7 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </IconFrame>
  );
}

function LogoMark() {
  return (
    <svg className="origin-logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 5 27 26H5Z" />
      <path d="M16 13 21 23H11Z" />
    </svg>
  );
}

function NavGroup({
  title,
  items,
  activeRoute,
  onNavigate,
}: {
  title: string;
  items: Array<{ route: AppRoute; label: string; icon: ReactNode }>;
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}) {
  return (
    <div className="origin-nav-group">
      <p>{title}</p>
      <div className="origin-nav-list">
        {items.map((item) => {
          const active = item.route === activeRoute;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => onNavigate(item.route)}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
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
  const routeMeta = ROUTE_META[activeRoute];

  return (
    <div className="origin-app-shell">
      <aside className="origin-sidebar">
        <button type="button" onClick={onHome} className="origin-brand" aria-label="Startseite öffnen">
          <LogoMark />
          <span>Fundamental-Analyst</span>
        </button>

        <NavGroup title="Research" items={TRACK_ITEMS} activeRoute={activeRoute} onNavigate={onNavigate} />
        <NavGroup title="Tools" items={SERVICE_ITEMS} activeRoute={activeRoute} onNavigate={onNavigate} />
      </aside>

      <div className="origin-workspace">
        <header className="origin-topbar">
          <div className="origin-topbar-title">
            <h1>{routeMeta.title}</h1>
            <p>{routeMeta.detail}</p>
          </div>
          <div className="origin-topbar-actions">
            {mockBadge && <span className="origin-pill">Demo</span>}
            <span className="origin-data-pill">FMP Pro</span>
            <span className="origin-data-pill">SEC</span>
            <div className="origin-sync-control">{syncControls}</div>
          </div>
        </header>

        <main className="origin-main">{children}</main>
      </div>
    </div>
  );
}
