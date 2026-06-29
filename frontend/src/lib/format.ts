import type { GrowthValue } from "../types/analysis";

/** Prozent aus Dezimal: 0.0787 -> "+7,9 %". `signed` für +/- Vorzeichen. */
export function pct(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const p = value * 100;
  const sign = signed && p > 0 ? "+" : "";
  return `${sign}${p.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

/** Wachstumswert (number | "neg.") darstellen. */
export function growth(value: GrowthValue | null | undefined): string {
  if (value === "neg.") return "neg.";
  if (value === null || value === undefined) return "—";
  return pct(value, true);
}

/** Geldbetrag in der gegebenen Währung. */
export function money(
  value: number | null | undefined,
  currency = "USD",
  digits = 2,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Große Zahl ohne Währungssymbol (z. B. Net Income in Mio.). */
export function num(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function compactNum(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString("de-DE", {
      maximumFractionDigits: digits,
    })} Mrd.`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("de-DE", {
      maximumFractionDigits: digits,
    })} Mio.`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toLocaleString("de-DE", {
      maximumFractionDigits: digits,
    })} Tsd.`;
  }
  return num(value, digits);
}

export function compactMoney(
  value: number | null | undefined,
  currency = "USD",
  digits = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${prefix}${compactNum(value, digits)}`;
}

/** Faktor: 8.01 -> "8,0×". */
export function ratio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}×`;
}

/** Heatmap-Klasse aus einem Wachstumswert (dezent, Apple-Pastell). */
export function heatClass(value: GrowthValue | null | undefined): string {
  if (value === "neg." || value === null || value === undefined) return "heat-neutral";
  if (value >= 0.15) return "heat-pos-strong";
  if (value > 0) return "heat-pos";
  if (value <= -0.15) return "heat-neg-strong";
  return "heat-neg";
}
