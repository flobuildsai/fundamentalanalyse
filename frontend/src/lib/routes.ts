export type AppRoute = "analysis" | "screener" | "regime" | "setups" | "watchlist";

const ROUTE_PATHS: Record<AppRoute, string> = {
  analysis: "/app",
  screener: "/app/screener",
  regime: "/app/regime",
  setups: "/app/setups",
  watchlist: "/app/watchlist",
};

export function appRouteFromPath(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/app/screener") return "screener";
  if (normalized === "/app/regime") return "regime";
  if (normalized === "/app/setups") return "setups";
  if (normalized === "/app/watchlist") return "watchlist";
  return "analysis";
}

export function pathForAppRoute(route: AppRoute): string {
  return ROUTE_PATHS[route];
}
