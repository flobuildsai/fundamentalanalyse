import { describe, it, expect } from "vitest";
import {
  cagr,
  yoyGrowth,
  avgLast,
  median,
  computeValuation,
  type YearPoint,
  type FinancialInput,
} from "./valuation";

/**
 * Fixtures aus dem Original-Sheet (Alcoa Corp, "aa").
 * Jahresreihen aufsteigend; die letzten 4 Punkte entsprechen den
 * Sheet-Spalten O,P,Q,R (2019..TTM).  Quelle: ausgelesene Zellen H..R.
 */

// EPS Zeile 11/34: H..R = -4.731,-2.19,1.49,1.33,-6.07,-0.91,2.26,-0.68,-3.65,0.26,4.37
const eps: YearPoint[] = [
  { year: 2015, value: -4.731 },
  { year: 2016, value: -2.19 },
  { year: 2017, value: 1.49 },
  { year: 2018, value: 1.33 },
  { year: 2019, value: -6.07 },
  { year: 2020, value: -0.91 },
  { year: 2021, value: 2.26 },
  { year: 2022, value: -0.68 },
  { year: 2023, value: -3.65 },
  { year: 2024, value: 0.26 },
  { year: 2025, value: 4.37 }, // R11 = aktueller EPS
];

// Revenue Zeile 10: H..R = 11199,9318,11652,13403,10433,9286,12152,12451,10551,11895,12831
const revenue: YearPoint[] = [
  11199, 9318, 11652, 13403, 10433, 9286, 12152, 12451, 10551, 11895, 12831,
].map((value, i) => ({ year: 2015 + i, value }));

describe("Helper-Funktionen", () => {
  it("median wie Sheet MEDIAN", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("yoyGrowth Revenue (R/Q-1) ≈ 7.87%", () => {
    // R10/Q10-1 = 12831/11895-1
    expect(yoyGrowth(revenue) as number).toBeCloseTo(0.07868852459, 8);
  });

  it("cagr Revenue 10yr ≈ 1.37%", () => {
    // (12831/11199)^(1/10)-1
    expect(cagr(revenue, 10) as number).toBeCloseTo(0.01369691788, 8);
  });

  it('cagr EPS 10yr = "neg." (Startwert negativ)', () => {
    // Sheet zeigt "neg." weil R11>0 aber (R/H)^(1/10) mit H<0 -> error
    expect(cagr(eps, 10)).toBe("neg.");
  });

  it("avgLast funktioniert", () => {
    expect(avgLast(revenue, 1)).toBeCloseTo(12831, 6);
    expect(avgLast(revenue, 2)).toBeCloseTo((11895 + 12831) / 2, 6);
  });
});

describe("Bewertung (Kern) — Alcoa-Originalwerte", () => {
  const input: Partial<FinancialInput> = {
    eps,
    historicalPE: 26.36, // C52 / F4
    currentPrice: 54.1, // F58
  };

  const val = computeValuation(input as FinancialInput, {
    requiredReturn: 0.15,
    estimatedGrowth: 0.125,
  });

  it("futureEPS (eEPS) ≈ 14.19  (C53)", () => {
    // 4.37 * 1.125^10
    expect(val.futureEPS).toBeCloseTo(14.19079288, 5);
  });

  it("futurePrice ≈ 374.07  (C54)", () => {
    expect(val.futurePrice).toBeCloseTo(374.0693004, 4);
  });

  it("intrinsicValue ≈ 92.46  (C58)  ← der Beweis", () => {
    expect(val.intrinsicValue!).toBeCloseTo(92.46421008, 5);
  });

  it("difference ≈ 41.49% unterbewertet  (C61)", () => {
    expect(val.difference!).toBeCloseTo(0.4149087527, 6);
  });

  it("Margin of Safety Stufen ≈ 46.23 / 55.48 / 64.72 / 73.97 / 83.22", () => {
    const prices = val.marginOfSafety.map((m) => m.price);
    expect(prices[0]).toBeCloseTo(46.23210504, 5); // 50%
    expect(prices[1]).toBeCloseTo(55.47852605, 5); // 40%
    expect(prices[2]).toBeCloseTo(64.72494705, 5); // 30%
    expect(prices[3]).toBeCloseTo(73.97136806, 5); // 20%
    expect(prices[4]).toBeCloseTo(83.21778907, 5); // 10%
  });
});
