/**
 * DeltaValue — API-Vertrag (Frontend-Sicht).
 * Single source of truth für die Form der `/api/analyze/{ticker}`-Antwort.
 * MUSS mit dem Backend (Codex) übereinstimmen. Siehe docs/IMPLEMENTATION_PLAN.md §4.
 *
 * Konventionen:
 *  - Geldwerte in `currency` (nicht hart als $ formatieren).
 *  - Wachstums-/Quotenfelder als Dezimal (0.0787 = 7,87 %).
 *  - Wachstumswerte können "neg." sein, wenn nicht berechenbar (wie im Sheet).
 *  - Profitabilitäts-/Schuldenwerte können null sein, wenn der Provider sie nicht liefert.
 */

export type GrowthValue = number | "neg.";
export type GrowthSource = "manual" | "zacks" | "analyst";
export type GuardrailSeverity = "info" | "warning" | "danger";
export type Confidence = "high" | "medium" | "low";
export type DecisionSignal = "strong" | "ok" | "weak" | "unknown";

/** Wachstumszeile: CAGR über 10/7/5/3 Jahre + 1-Jahres-Wachstum. */
export interface GrowthRow {
  y10: GrowthValue;
  y7: GrowthValue;
  y5: GrowthValue;
  y3: GrowthValue;
  y1: GrowthValue;
}

/** Durchschnittszeile (Profitabilität, Schulden, Dividende). */
export interface AvgRow {
  y10: number | null;
  y7: number | null;
  y5: number | null;
  y3: number | null;
  y1: number | null;
}

export interface MarginOfSafetyStep {
  /** 0.5 = 50 % Sicherheitsabschlag. */
  discount: number;
  /** Zielkaufpreis = innerer Wert × (1 − discount). */
  price: number;
}

export interface Valuation {
  currentEPS: number;
  estimatedGrowth: number;
  historicalPE: number;
  futureEPS: number;
  futurePrice: number;
  /** Innerer Wert je Aktie heute. null = "n/a" (negativ). */
  intrinsicValue: number | null;
  currentPrice: number;
  /** 1 − Kurs/innererWert. >0 = unterbewertet (Upside). null wenn nicht berechenbar. */
  difference: number | null;
  /** Zielkaufpreis auf Basis der frei wählbaren Sicherheitsmarge. */
  targetBuyPrice: number | null;
  /** Erwartete jährliche Rendite bis zum modellierten Kurs in 10 Jahren. */
  expectedAnnualReturn: number | null;
  /** Wachstum, das der aktuelle Kurs bei Renditeforderung und Exit-KGV einpreist. */
  impliedGrowth: number | null;
  marginOfSafety: MarginOfSafetyStep[];
  guardrails: ValuationGuardrails;
}

export interface Assumptions {
  requiredReturn: number;
  estimatedGrowth: number;
  growthSource: GrowthSource;
  marginOfSafetyTarget: number;
  exitMultiple?: number | null;
  currentEPSOverride?: number | null;
}

export interface GrowthEstimate {
  source: GrowthSource;
  estimatedGrowth: number | null;
  horizonYears: number | null;
  forwardEPS: number | null;
  detail: string;
}

export interface ValuationWarning {
  code: string;
  severity: GuardrailSeverity;
  title: string;
  detail: string;
}

export interface ValuationGuardrails {
  confidence: Confidence;
  isCyclical: boolean;
  epsBasis: "latest" | "normalized" | "manual" | "unavailable";
  peBasis: "historical" | "manual" | "capped" | "cyclical_cap" | "unavailable";
  normalizedEPS: number | null;
  normalizedFcfPerShare: number | null;
  rawHistoricalPE: number;
  effectivePE: number;
  warnings: ValuationWarning[];
}

export interface Decision {
  rating: "prime" | "watch" | "neutral" | "avoid" | "incomplete";
  label: string;
  score: number;
  summary: string;
  valuationSignal: DecisionSignal;
  qualitySignal: DecisionSignal;
  debtSignal: DecisionSignal;
  dataSignal: DecisionSignal;
  reasons: string[];
}

/** Optionale Jahresreihen für Charts/Detailtabellen (aufsteigend). */
export interface Series {
  years: number[];
  revenue?: number[];
  eps?: number[];
  fcf?: number[];
  bookValuePerShare?: number[];
  sharesOutstanding?: number[];
  operatingCashflow?: number[];
  netIncome?: number[];
  grossProfit?: number[];
  operatingIncome?: number[];
  capitalExpenditure?: number[];
  roic?: number[];
  wacc?: number[];
  interestCoverage?: number[];
  totalDebt?: number[];
  cashAndInvestments?: number[];
  totalEquity?: number[];
}

export interface Analysis {
  ticker: string;
  companyName: string;
  currency: string;
  /** ISO-Zeitstempel der Datenaktualität. */
  asOf: string;

  currentPrice: number;
  currentPE: number;
  historicalPE: number;
  beta: number;
  cached?: boolean;

  growth: {
    revenue: GrowthRow;
    eps: GrowthRow;
    fcf: GrowthRow;
    bookValuePerShare: GrowthRow;
    sharesOutstanding: GrowthRow;
    operatingCashflow: GrowthRow;
  };

  profitability: {
    netIncome: AvgRow;
    roic: AvgRow;
    roe: AvgRow;
    wacc: AvgRow;
  };
  margins: {
    grossMargin: AvgRow;
    operatingMargin: AvgRow;
    netMargin: AvgRow;
    fcfMargin: AvgRow;
  };
  /** ROIC(letztes Jahr) > WACC(letztes Jahr) → wertschaffend. */
  valueCreating: boolean | null;

  debt: {
    longTermDebt: AvgRow;
    /** Letzte Schulden / Ø der letzten 2 FCF. */
    debtToFcf: number | null;
    interestCoverage: number | null;
  };

  balance: {
    totalDebt: AvgRow;
    cashAndInvestments: AvgRow;
    netDebt: AvgRow;
    totalEquity: AvgRow;
    debtToEquity: number | null;
    cashPerShare: number | null;
  };

  dividend: {
    dividend: AvgRow;
    /** Letzte Dividende / aktueller Kurs. null wenn keine Dividende. */
    yield: number | null;
    payoutRatio: AvgRow;
  };

  series?: Series;
  assumptions: Assumptions;
  growthEstimate?: GrowthEstimate | null;
  valuation: Valuation;
  decision: Decision;
  dataSource?: "fmp" | "sec" | "yahoo";
  provenance?: Record<
    string,
    "reported" | "computed" | "estimated" | "unavailable"
  >;
}

/** Fehlerantworten des Backends. */
export interface ApiError {
  error: "ticker_not_found" | "provider_unavailable" | "rate_limited" | string;
  ticker?: string;
}
