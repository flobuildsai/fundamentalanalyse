export type AppRoute =
  | "analysis"
  | "screener"
  | "regime"
  | "setups"
  | "portfolio"
  | "options"
  | "watchlist";

const ROUTE_PATHS: Record<AppRoute, string> = {
  analysis: "/app",
  screener: "/app/screener",
  regime: "/app/regime",
  setups: "/app/setups",
  portfolio: "/app/portfolio",
  options: "/app/options",
  watchlist: "/app/watchlist",
};

export function appRouteFromPath(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/app/screener") return "screener";
  if (normalized === "/app/regime") return "regime";
  if (normalized === "/app/setups") return "setups";
  if (normalized === "/app/portfolio") return "portfolio";
  if (normalized === "/app/options") return "options";
  if (normalized === "/app/watchlist") return "watchlist";
  return "analysis";
}

export function pathForAppRoute(route: AppRoute): string {
  return ROUTE_PATHS[route];
}
