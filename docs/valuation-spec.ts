/**
 * DeltaValue Bewertungs-Engine
 * ----------------------------
 * 1:1-Port der Formeln aus dem Original-Spreadsheet
 * "DeltaValue Value-Rechner v3.0.8".
 *
 * Konventionen wie im Sheet:
 *  - Jahresreihen sind aufsteigend sortiert (ältestes Jahr zuerst, letztes = neuestes).
 *  - "neg." statt einer Zahl, wenn ein Wachstum nicht sinnvoll berechenbar ist
 *    (Endwert <= 0), exakt wie die IFERROR/IF(R>0,...,"neg.")-Logik im Sheet.
 */

export type GrowthValue = number | "neg.";

export interface YearPoint {
  year: number;
  value: number;
}

/** Eingabedaten, die der Provider (Yahoo/FMP) liefern muss. Jahresreihen aufsteigend. */
export interface FinancialInput {
  ticker: string;
  companyName: string;
  currentPrice: number;          // aktueller Aktienkurs  (Sheet F58)
  historicalPE: number;          // hist. 10yr Median KGV  (Sheet C52/F4)
  beta: number;                  // 5yr Beta               (Sheet G4)
  cashPerShare: number;          // Cash & Equiv je Aktie  (Sheet C55)

  // Jahresreihen (aufsteigend, idealerweise 10 Jahre + TTM als letzter Punkt)
  revenue: YearPoint[];          // Umsatz                 (Zeile 10)
  eps: YearPoint[];              // Gewinn je Aktie        (Zeile 11/34)
  fcf: YearPoint[];              // Free Cashflow          (Zeile 12/35)
  bookValuePerShare: YearPoint[];// Buchwert je Aktie      (Zeile 13)
  sharesOutstanding: YearPoint[];// Umlaufende Aktien      (Zeile 14)
  operatingCashflow: YearPoint[];// Operating Cashflow     (Zeile 36)

  netIncome: YearPoint[];        // Net Income             (Zeile 19)
  roic: YearPoint[];             // ROIC (Dezimal)         (Zeile 20)
  roe: YearPoint[];              // ROE  (Dezimal)         (Zeile 21)
  wacc: YearPoint[];             // WACC (Dezimal)         (Zeile 22)

  longTermDebt: YearPoint[];     // Langfr. Schulden       (Zeile 27)
  interestCoverage: YearPoint[]; // Interest Coverage      (Zeile 29)

  dividend: YearPoint[];         // Dividende je Aktie     (Zeile 41)
  payoutRatio: YearPoint[];      // Ausschüttungsquote     (Zeile 43)
}

/** Annahmen für die Bewertung (Sheet C49/C50). */
export interface ValuationAssumptions {
  requiredReturn: number;   // C49, z.B. 0.15
  estimatedGrowth: number;  // C50, z.B. 0.125
}

export const DEFAULT_ASSUMPTIONS: ValuationAssumptions = {
  requiredReturn: 0.15,
  estimatedGrowth: 0.125,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const last = <T,>(arr: T[]): T | undefined => arr[arr.length - 1];

/** Wert eines Jahresoffsets vom Ende her (0 = letztes Jahr). */
function fromEnd(series: YearPoint[], offsetFromEnd: number): number | undefined {
  const idx = series.length - 1 - offsetFromEnd;
  return idx >= 0 ? series[idx]?.value : undefined;
}

/**
 * CAGR über n Jahre, exakt wie das Sheet:
 *   =IFERROR(IF(R>0,(((R/start)^(1/n))-1),"neg."),"neg.")
 * R = letzter Wert, start = Wert n Jahre vorher.
 * Für n=1 nutzt das Sheet eine andere Form (siehe yoyGrowth).
 */
export function cagr(series: YearPoint[], years: number): GrowthValue {
  const end = last(series)?.value;
  const start = fromEnd(series, years);
  if (end === undefined || start === undefined) return "neg.";
  if (!(end > 0)) return "neg.";
  if (start === 0) return "neg.";
  const ratio = end / start;
  if (ratio <= 0) return "neg.";
  return Math.pow(ratio, 1 / years) - 1;
}

/**
 * 1-Jahres-Wachstum (Sheet G-Spalte):
 *   =IF(R>0,IF(R/Q-1<-1,"neg.",R/Q-1),"neg.")
 */
export function yoyGrowth(series: YearPoint[]): GrowthValue {
  const end = last(series)?.value;
  const prev = fromEnd(series, 1);
  if (end === undefined || prev === undefined) return "neg.";
  if (!(end > 0) || prev === 0) return "neg.";
  const g = end / prev - 1;
  if (g < -1) return "neg.";
  return g;
}

/** Durchschnitt der letzten n Jahre (Sheet AVERAGE(...) für Profitabilität). */
export function avgLast(series: YearPoint[], years: number): number | null {
  const slice = series.slice(Math.max(0, series.length - years));
  if (slice.length === 0) return null;
  const sum = slice.reduce((a, p) => a + p.value, 0);
  return sum / slice.length;
}

/** Median (Sheet MEDIAN). */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Wachstumsspalten 10/7/5/3/1 Jahre für eine Reihe. */
export interface GrowthRow {
  y10: GrowthValue;
  y7: GrowthValue;
  y5: GrowthValue;
  y3: GrowthValue;
  y1: GrowthValue;
}

export function growthRow(series: YearPoint[]): GrowthRow {
  return {
    y10: cagr(series, 10),
    y7: cagr(series, 7),
    y5: cagr(series, 5),
    y3: cagr(series, 3),
    y1: yoyGrowth(series),
  };
}

/** Durchschnittszeilen 10/7/5/3/1 (Profitabilität, Schulden). */
export interface AvgRow {
  y10: number | null;
  y7: number | null;
  y5: number | null;
  y3: number | null;
  y1: number | null;
}

export function avgRow(series: YearPoint[]): AvgRow {
  return {
    y10: avgLast(series, 10),
    y7: avgLast(series, 7),
    y5: avgLast(series, 5),
    y3: avgLast(series, 3),
    y1: last(series)?.value ?? null,
  };
}

// ---------------------------------------------------------------------------
// Bewertung (Kern) — Sheet-Zeilen 49-65
// ---------------------------------------------------------------------------

export interface Valuation {
  estimatedGrowth: number;       // C50
  historicalPE: number;          // C52
  currentEPS: number;            // R11
  futureEPS: number;             // C53 = EPS*(1+g)^10
  futurePrice: number;           // C54 = eEPS * PE
  intrinsicValue: number | null; // C58 = futurePrice / (1+r)^10  ("n/a" -> null)
  currentPrice: number;          // F58
  /** Differenz: 1 - price/intrinsic. >0 = unterbewertet (Upside). */
  difference: number | null;     // C61
  marginOfSafety: { discount: number; price: number }[]; // C64:G65
}

export function computeValuation(
  input: FinancialInput,
  assumptions: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
): Valuation {
  const { requiredReturn: r, estimatedGrowth: g } = assumptions;
  const currentEPS = last(input.eps)?.value ?? 0;
  const pe = input.historicalPE;

  const futureEPS = currentEPS * Math.pow(1 + g, 10);     // C53
  const futurePrice = futureEPS * pe;                     // C54

  // C58: =IF(C54/(1+C49)^10<0,"n/a", ...)
  const discounted = futurePrice / Math.pow(1 + r, 10);
  const intrinsicValue = discounted < 0 ? null : discounted;

  // C61: =IFERROR(1 - F58/C58,"n/a")
  let difference: number | null = null;
  if (intrinsicValue !== null && intrinsicValue !== 0) {
    difference = 1 - input.currentPrice / intrinsicValue;
  }

  // Margin of Safety C64:G65  (50/40/30/20/10 %)
  const discounts = [0.5, 0.4, 0.3, 0.2, 0.1];
  const marginOfSafety = discounts.map((d) => ({
    discount: d,
    price: intrinsicValue === null ? NaN : intrinsicValue * (1 - d),
  }));

  return {
    estimatedGrowth: g,
    historicalPE: pe,
    currentEPS,
    futureEPS,
    futurePrice,
    intrinsicValue,
    currentPrice: input.currentPrice,
    difference,
    marginOfSafety,
  };
}

// ---------------------------------------------------------------------------
// Komplette Analyse (alle Blöcke des Hauptblatts)
// ---------------------------------------------------------------------------

export interface Analysis {
  ticker: string;
  companyName: string;
  currentPrice: number;
  historicalPE: number;
  beta: number;

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
  /** ROIC > WACC im letzten Jahr = wertschaffend (Burggraben-Signal). */
  valueCreating: boolean;
  debt: {
    longTermDebt: AvgRow;
    /** Schulden / FCF letztes Jahr (Sheet C28: R27/AVERAGE(Q12:R12)). */
    debtToFcf: number | null;
    interestCoverage: number | null;
  };
  dividend: {
    dividend: AvgRow;
    yield: number | null;       // C42: R41/C4
    payoutRatio: AvgRow;
  };
  valuation: Valuation;
}

export function analyze(
  input: FinancialInput,
  assumptions: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
): Analysis {
  const lastRoic = last(input.roic)?.value ?? 0;
  const lastWacc = last(input.wacc)?.value ?? 0;

  // Schulden / FCF (Sheet C28): R27 / AVERAGE(Q12:R12) = letzte Schulden / Mittel der letzten 2 FCF
  const ltdLast = last(input.longTermDebt)?.value;
  const fcfAvg2 = avgLast(input.fcf, 2);
  const debtToFcf =
    ltdLast !== undefined && fcfAvg2 !== null && fcfAvg2 !== 0
      ? ltdLast / fcfAvg2
      : null;

  const lastDiv = last(input.dividend)?.value;
  const divYield =
    lastDiv !== undefined && input.currentPrice !== 0
      ? lastDiv / input.currentPrice
      : null;

  return {
    ticker: input.ticker,
    companyName: input.companyName,
    currentPrice: input.currentPrice,
    historicalPE: input.historicalPE,
    beta: input.beta,
    growth: {
      revenue: growthRow(input.revenue),
      eps: growthRow(input.eps),
      fcf: growthRow(input.fcf),
      bookValuePerShare: growthRow(input.bookValuePerShare),
      sharesOutstanding: growthRow(input.sharesOutstanding),
      operatingCashflow: growthRow(input.operatingCashflow),
    },
    profitability: {
      netIncome: avgRow(input.netIncome),
      roic: avgRow(input.roic),
      roe: avgRow(input.roe),
      wacc: avgRow(input.wacc),
    },
    valueCreating: lastRoic > lastWacc,
    debt: {
      longTermDebt: avgRow(input.longTermDebt),
      debtToFcf,
      interestCoverage: last(input.interestCoverage)?.value ?? null,
    },
    dividend: {
      dividend: avgRow(input.dividend),
      yield: divYield,
      payoutRatio: avgRow(input.payoutRatio),
    },
    valuation: computeValuation(input, assumptions),
  };
}
