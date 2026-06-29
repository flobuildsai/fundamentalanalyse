import type { Analysis, Assumptions, ApiError } from "../types/analysis";
import type { OptionTradeMetrics, OptionTradeRequest } from "../types/options";
import type { PortfolioSummary, PortfolioSummaryRequest } from "../types/portfolio";
import type { ScreenerParams, ScreenerResponse } from "../types/screener";
import alcoaMock from "../mocks/alcoa.json";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const API_TIMEOUT_MS = 35_000;

export class AnalyzeError extends Error {
  code: ApiError["error"];
  ticker?: string;
  constructor(code: ApiError["error"], ticker?: string) {
    super(code);
    this.name = "AnalyzeError";
    this.code = code;
    this.ticker = ticker;
  }
}

/** Recompute valuation client-side from a base analysis (used for live slider feedback on the mock). */
function rescale(base: Analysis, a: Assumptions): Analysis {
  const { requiredReturn: r, estimatedGrowth: g } = a;
  const eps = base.valuation.currentEPS;
  const pe = base.valuation.historicalPE;
  const futureEPS = eps * Math.pow(1 + g, 10);
  const futurePrice = futureEPS * pe;
  const discounted = futurePrice / Math.pow(1 + r, 10);
  const intrinsicValue = discounted < 0 ? null : discounted;
  const difference =
    intrinsicValue && intrinsicValue !== 0
      ? 1 - base.currentPrice / intrinsicValue
      : null;
  const marginOfSafety = [0.5, 0.4, 0.3, 0.2, 0.1].map((discount) => ({
    discount,
    price: intrinsicValue === null ? NaN : intrinsicValue * (1 - discount),
  }));
  return {
    ...base,
    assumptions: a,
    valuation: {
      ...base.valuation,
      estimatedGrowth: g,
      futureEPS,
      futurePrice,
      intrinsicValue,
      difference,
      marginOfSafety,
    },
  };
}

export async function analyze(
  ticker: string,
  assumptions?: Assumptions,
): Promise<Analysis> {
  const t = ticker.trim().toUpperCase();
  if (!t) throw new AnalyzeError("ticker_not_found", ticker);

  if (USE_MOCK) {
    await new Promise((res) => setTimeout(res, 650)); // realistisches Laden
    if (t !== "AA" && t !== "ALCOA") {
      // Mock: nur AA bekannt — andere Ticker -> recogniseable demo behaviour
      throw new AnalyzeError("ticker_not_found", t);
    }
    const base = alcoaMock as unknown as Analysis;
    return assumptions ? rescale(base, assumptions) : base;
  }

  const params = new URLSearchParams();
  if (assumptions) {
    params.set("requiredReturn", String(assumptions.requiredReturn));
    params.set("estimatedGrowth", String(assumptions.estimatedGrowth));
    params.set("growthSource", assumptions.growthSource);
  }
  const qs = params.toString();
  const url = `${API_BASE}/api/analyze/${encodeURIComponent(t)}${qs ? `?${qs}` : ""}`;

  let res: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch {
    throw new AnalyzeError("provider_unavailable", t);
  } finally {
    window.clearTimeout(timer);
  }
  if (res.ok) return (await res.json()) as Analysis;

  let body: ApiError | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* ignore */
  }
  if (res.status === 404) throw new AnalyzeError("ticker_not_found", t);
  if (res.status === 429) throw new AnalyzeError("rate_limited", t);
  throw new AnalyzeError(body?.error ?? "provider_unavailable", t);
}

export async function runSp500Screener(
  params: ScreenerParams = {},
): Promise<ScreenerResponse> {
  if (USE_MOCK) {
    throw new AnalyzeError("provider_unavailable");
  }

  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.portfolioValue) search.set("portfolioValue", String(params.portfolioValue));
  if (params.baseRiskPct) search.set("baseRiskPct", String(params.baseRiskPct));
  if (params.sort) search.set("sort", params.sort);
  if (params.symbols?.length) search.set("symbols", params.symbols.join(","));
  const qs = search.toString();
  const url = `${API_BASE}/api/screener/sp500${qs ? `?${qs}` : ""}`;

  let res: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch {
    throw new AnalyzeError("provider_unavailable");
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    throw new AnalyzeError(res.status === 429 ? "rate_limited" : "provider_unavailable");
  }
  return (await res.json()) as ScreenerResponse;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  if (USE_MOCK) {
    throw new AnalyzeError("provider_unavailable");
  }

  let res: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new AnalyzeError("provider_unavailable");
  } finally {
    window.clearTimeout(timer);
  }

  if (!res.ok) {
    throw new AnalyzeError(res.status === 429 ? "rate_limited" : "provider_unavailable");
  }
  return (await res.json()) as T;
}

export async function calculatePortfolioSummary(
  request: PortfolioSummaryRequest,
): Promise<PortfolioSummary> {
  return postJson<PortfolioSummary>("/api/portfolio/summary", request);
}

export async function calculateOptionTrade(
  request: OptionTradeRequest,
): Promise<OptionTradeMetrics> {
  return postJson<OptionTradeMetrics>("/api/options/calculate", request);
}

export const isMock = USE_MOCK;
