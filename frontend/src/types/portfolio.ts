export interface ExposureBucket {
  amount: number;
  weight: number;
}

export interface PortfolioSettingsInput {
  netLiquidation: number;
  baseCurrency: string;
  fxToUsd: number;
  moderateUtilization: number;
  criticalUtilization: number;
}

export interface PortfolioPositionInput {
  symbol: string;
  assetClass: "stock" | "equity_option" | "future_option" | "cash" | string;
  strategy?: string | null;
  quantity?: number | null;
  price?: number | null;
  buyingPowerUsed?: number | null;
  countsTowardBuyingPower?: boolean | null;
}

export interface PortfolioSummaryRequest {
  settings: PortfolioSettingsInput;
  positions: PortfolioPositionInput[];
}

export interface PortfolioSummary {
  netLiquidationUsd: number;
  moderateBuyingPower: number;
  criticalBuyingPower: number;
  usedBuyingPower: number;
  remainingModerateBuyingPower: number;
  cash: number;
  assetAllocation: Record<string, ExposureBucket>;
  underlyingExposure: Record<string, ExposureBucket>;
}
