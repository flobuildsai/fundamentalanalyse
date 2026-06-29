import { describe, expect, it } from "vitest";

import { appRouteFromPath, pathForAppRoute } from "./routes";

describe("app routing", () => {
  it("maps canonical subpage paths to focused app routes", () => {
    expect(appRouteFromPath("/app")).toBe("analysis");
    expect(appRouteFromPath("/app/screener")).toBe("screener");
    expect(appRouteFromPath("/app/regime")).toBe("regime");
    expect(appRouteFromPath("/app/setups")).toBe("setups");
    expect(appRouteFromPath("/app/watchlist")).toBe("watchlist");
  });

  it("keeps unknown app paths safely on the analysis page", () => {
    expect(appRouteFromPath("/app/not-a-page")).toBe("analysis");
    expect(appRouteFromPath("/")).toBe("analysis");
  });

  it("generates stable paths for app nav items", () => {
    expect(pathForAppRoute("analysis")).toBe("/app");
    expect(pathForAppRoute("screener")).toBe("/app/screener");
    expect(pathForAppRoute("regime")).toBe("/app/regime");
    expect(pathForAppRoute("setups")).toBe("/app/setups");
    expect(pathForAppRoute("watchlist")).toBe("/app/watchlist");
  });
});
