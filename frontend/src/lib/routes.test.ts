import { describe, expect, it } from "vitest";

import { appRouteFromPath, pathForAppRoute } from "./routes";

describe("app routing", () => {
  it("maps canonical subpage paths to focused app routes", () => {
    expect(appRouteFromPath("/app")).toBe("analysis");
    expect(appRouteFromPath("/app/optionen")).toBe("options");
    expect(appRouteFromPath("/app/watchlist")).toBe("watchlist");
  });

  it("keeps the previous English options path as a compatibility alias", () => {
    expect(appRouteFromPath("/app/options")).toBe("options");
  });

  it("keeps unknown or retired app paths safely on the analysis page", () => {
    expect(appRouteFromPath("/app/not-a-page")).toBe("analysis");
    expect(appRouteFromPath("/app/screener")).toBe("analysis");
    expect(appRouteFromPath("/app/regime")).toBe("analysis");
    expect(appRouteFromPath("/app/setups")).toBe("analysis");
    expect(appRouteFromPath("/app/portfolio")).toBe("analysis");
    expect(appRouteFromPath("/")).toBe("analysis");
  });

  it("generates stable paths for app nav items", () => {
    expect(pathForAppRoute("analysis")).toBe("/app");
    expect(pathForAppRoute("options")).toBe("/app/optionen");
    expect(pathForAppRoute("watchlist")).toBe("/app/watchlist");
  });
});
