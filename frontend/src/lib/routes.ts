export type AppRoute =
  | "analysis"
  | "options"
  | "watchlist";

const ROUTE_PATHS: Record<AppRoute, string> = {
  analysis: "/app",
  options: "/app/optionen",
  watchlist: "/app/watchlist",
};

export function appRouteFromPath(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/app/optionen") return "options";
  if (normalized === "/app/options") return "options";
  if (normalized === "/app/watchlist") return "watchlist";
  return "analysis";
}

export function pathForAppRoute(route: AppRoute): string {
  return ROUTE_PATHS[route];
}
