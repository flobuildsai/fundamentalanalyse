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
  { route: "analysis", label: "Home", icon: <HomeIcon /> },
  { route: "screener", label: "Screener", icon: <ChartIcon /> },
  { route: "regime", label: "Risk", icon: <PieIcon /> },
  { route: "setups", label: "Setups", icon: <BinocularsIcon /> },
  { route: "portfolio", label: "Portfolio", icon: <BarsIcon /> },
];

const SERVICE_ITEMS: Array<{ route: AppRoute; label: string; icon: ReactNode }> = [
  { route: "options", label: "Options", icon: <TrendIcon /> },
  { route: "watchlist", label: "Watchlist", icon: <ListIcon /> },
];

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

function ChartIcon() {
  return (
    <IconFrame>
      <path d="M4 19h16M6 16V9m6 7V5m6 11v-5" />
    </IconFrame>
  );
}

function PieIcon() {
  return (
    <IconFrame>
      <path d="M12 4v8l7-3.5A8 8 0 1 1 12 4z" />
      <path d="M12 12h8" />
    </IconFrame>
  );
}

function BinocularsIcon() {
  return (
    <IconFrame>
      <path d="M6 9h4v9H5a3 3 0 0 1-3-3v-2a4 4 0 0 1 4-4zm8 0h4a4 4 0 0 1 4 4v2a3 3 0 0 1-3 3h-5z" />
      <path d="M10 9V6h4v3" />
    </IconFrame>
  );
}

function BarsIcon() {
  return (
    <IconFrame>
      <path d="M5 20V10m7 10V4m7 16v-7" />
      <path d="M3 20h18" />
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
    <div className="origin-logo-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
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

function TopAction({ label, children, primary = false }: { label: string; children: ReactNode; primary?: boolean }) {
  return (
    <button type="button" className={`origin-top-action ${primary ? "primary" : ""}`} aria-label={label}>
      {children}
    </button>
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
    <div className="origin-app-shell">
      <aside className="origin-sidebar">
        <button type="button" onClick={onHome} className="origin-brand" aria-label="Startseite öffnen">
          <LogoMark />
          <span>DeltaValue</span>
        </button>

        <NavGroup title="Research" items={TRACK_ITEMS} activeRoute={activeRoute} onNavigate={onNavigate} />
        <NavGroup title="Tools" items={SERVICE_ITEMS} activeRoute={activeRoute} onNavigate={onNavigate} />

        <button type="button" className="origin-ai-button">
          <span>✦</span>
          <span>Ask anything</span>
        </button>
      </aside>

      <div className="origin-workspace">
        <header className="origin-topbar">
          <h1>Good afternoon</h1>
          <div className="origin-topbar-actions">
            {mockBadge && <span className="origin-pill">Demo</span>}
            <div className="origin-sync-control">{syncControls}</div>
            <TopAction label="Rewards" primary>🎁</TopAction>
            <TopAction label="Account">♙</TopAction>
            <TopAction label="Add">＋</TopAction>
            <TopAction label="Help">?</TopAction>
            <TopAction label="Settings">⚙</TopAction>
          </div>
        </header>

        <main className="origin-main">{children}</main>
      </div>
    </div>
  );
}
