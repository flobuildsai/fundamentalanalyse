export type OptionStrategyKind =
  | "cash_secured_put"
  | "short_put"
  | "covered_call"
  | "bull_put_spread"
  | "bear_call_spread";

export interface OptionTradeRequest {
  strategyKind: OptionStrategyKind;
  underlying: string;
  openedAt: string;
  expiry: string;
  underlyingPrice: number;
  shortStrike: number;
  premium: number;
  fees?: number;
  longStrike?: number | null;
  contracts?: number;
  multiplier?: number;
  buybackTargetPct?: number;
  closedAt?: string | null;
  actualBuybackPrice?: number | null;
}

export interface OptionTradeMetrics {
  dte: number;
  distanceToPricePct: number;
  spreadWidth: number | null;
  netPremium: number;
  capitalAtRiskPerShare: number;
  returnOnRisk: number;
  annualizationMultiplier: number;
  annualizedReturn: number;
  totalPremium: number;
  totalRisk: number;
  breakeven: number;
  buybackTargetPrice: number;
  realizedAnnualizedReturn: number | null;
  status: "open" | "closed" | "invalid" | string;
  dataQuality: "ok" | "placeholder_or_invalid" | string;
  warnings: string[];
}

export interface OptionJournalEntry {
  id: string;
  request: OptionTradeRequest;
  metrics: OptionTradeMetrics;
  createdAt: string;
  updatedAt: string;
  source: "local" | "supabase";
}
