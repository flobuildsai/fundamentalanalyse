import type { Analysis, Decision, DecisionSignal } from "./analysis";

type DataSource = Analysis["dataSource"];
type DecisionRating = Decision["rating"];

export interface MomentumMetrics {
  ret3m: number | null;
  ret6m: number | null;
  ret12mEx1m: number | null;
  relativeStrengthSpy3m: number | null;
  above50dma: boolean | null;
  above200dma: boolean | null;
  momentumScore: number | null;
}

export interface MarketRegime {
  vix: number | null;
  gate: "normal" | "reduced" | "blocked" | "unknown";
  allowNewEntries: boolean;
  sizeMultiplier: number;
  notes: string[];
}

export interface TradeSetup {
  ticker: string;
  direction: "long" | "short_research";
  entry: number;
  stop: number | null;
  target: number | null;
  shares: number;
  dollarRisk: number;
  portfolioPct: number;
  riskReward: number | null;
  catalysts: string[];
  warnings: string[];
}

export interface ScreenerRow {
  ticker: string;
  companyName: string;
  sector: string | null;
  currentPrice: number;
  dataSource: DataSource | null;
  cached: boolean | null;
  intrinsicValue: number | null;
  marginOfSafety: number | null;
  decisionScore: number;
  decisionRating: DecisionRating;
  qualitySpread: number | null;
  debtToFcf: number | null;
  dataSignal: DecisionSignal;
  momentum: MomentumMetrics;
  compositeScore: number;
  tradeSetup: TradeSetup | null;
  warnings: string[];
}

export interface ScreenerResponse {
  asOf: string;
  universe: string;
  count: number;
  marketRegime: MarketRegime;
  rows: ScreenerRow[];
  errors: Array<{ ticker?: string; error: string }>;
}

export interface ScreenerParams {
  limit?: number;
  portfolioValue?: number;
  baseRiskPct?: number;
  sort?: "composite" | "margin" | "momentum" | "quality" | "debt";
  symbols?: string[];
}
