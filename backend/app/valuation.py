"""DeltaValue valuation formulas ported from docs/valuation-spec.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from math import isfinite, nan, pow
from typing import Literal, TypeVar

GrowthValue = float | Literal["neg."]
DataSource = Literal["fmp", "sec", "yahoo"]
ProvenanceValue = Literal["reported", "computed", "estimated", "unavailable"]
GrowthSource = Literal["manual", "zacks", "analyst"]
GuardrailSeverity = Literal["info", "warning", "danger"]
Confidence = Literal["high", "medium", "low"]
EpsBasis = Literal["latest", "normalized", "unavailable"]
PeBasis = Literal["historical", "capped", "cyclical_cap", "unavailable"]
T = TypeVar("T")


@dataclass(frozen=True)
class YearPoint:
    """A numeric value assigned to one fiscal/calendar year."""

    year: int
    value: float


@dataclass(frozen=True)
class ValuationAssumptions:
    """Assumptions from the original sheet cells C49/C50."""

    required_return: float = 0.15
    estimated_growth: float = 0.125
    growth_source: GrowthSource = "analyst"


DEFAULT_ASSUMPTIONS = ValuationAssumptions()


@dataclass(frozen=True)
class RawFinancials:
    """Provider-normalized annual financial data.

    Series must be sorted ascending. Missing provider fields stay empty and are
    later rendered as "neg." for growth rows or null for average rows.
    """

    ticker: str
    company_name: str
    currency: str
    as_of: datetime
    current_price: float
    current_pe: float
    historical_pe: float
    beta: float
    analyst_growth: float | None = None
    analyst_growth_horizon_years: int | None = None
    analyst_forward_eps: float | None = None
    data_source: DataSource | None = None
    provenance: dict[str, ProvenanceValue] = field(default_factory=dict)
    revenue: list[YearPoint] = field(default_factory=list)
    eps: list[YearPoint] = field(default_factory=list)
    fcf: list[YearPoint] = field(default_factory=list)
    book_value_per_share: list[YearPoint] = field(default_factory=list)
    shares_outstanding: list[YearPoint] = field(default_factory=list)
    operating_cashflow: list[YearPoint] = field(default_factory=list)
    net_income: list[YearPoint] = field(default_factory=list)
    gross_profit: list[YearPoint] = field(default_factory=list)
    operating_income: list[YearPoint] = field(default_factory=list)
    capital_expenditure: list[YearPoint] = field(default_factory=list)
    roic: list[YearPoint] = field(default_factory=list)
    roe: list[YearPoint] = field(default_factory=list)
    wacc: list[YearPoint] = field(default_factory=list)
    long_term_debt: list[YearPoint] = field(default_factory=list)
    total_debt: list[YearPoint] = field(default_factory=list)
    cash_and_investments: list[YearPoint] = field(default_factory=list)
    total_equity: list[YearPoint] = field(default_factory=list)
    interest_coverage: list[YearPoint] = field(default_factory=list)
    dividend: list[YearPoint] = field(default_factory=list)
    payout_ratio: list[YearPoint] = field(default_factory=list)


@dataclass(frozen=True)
class GrowthRow:
    """Growth columns for 10/7/5/3/1 years."""

    y10: GrowthValue
    y7: GrowthValue
    y5: GrowthValue
    y3: GrowthValue
    y1: GrowthValue


@dataclass(frozen=True)
class AvgRow:
    """Average columns for 10/7/5/3/1 years."""

    y10: float | None
    y7: float | None
    y5: float | None
    y3: float | None
    y1: float | None


@dataclass(frozen=True)
class MarginOfSafetyStep:
    """One margin-of-safety target price."""

    discount: float
    price: float


@dataclass(frozen=True)
class ValuationWarning:
    """Actionable warning emitted by the valuation guardrail layer."""

    code: str
    severity: GuardrailSeverity
    title: str
    detail: str


@dataclass(frozen=True)
class ValuationGuardrails:
    """Diagnostics explaining how the valuation inputs were made safer."""

    confidence: Confidence
    is_cyclical: bool
    eps_basis: EpsBasis
    pe_basis: PeBasis
    normalized_eps: float | None
    normalized_fcf_per_share: float | None
    raw_historical_pe: float
    effective_pe: float
    warnings: list[ValuationWarning]


@dataclass(frozen=True)
class Valuation:
    """Core valuation block from sheet rows 49-65."""

    current_eps: float
    estimated_growth: float
    historical_pe: float
    future_eps: float
    future_price: float
    intrinsic_value: float | None
    current_price: float
    difference: float | None
    margin_of_safety: list[MarginOfSafetyStep]
    guardrails: ValuationGuardrails


def _last(items: list[T]) -> T | None:
    return items[-1] if items else None


def _from_end(series: list[YearPoint], offset_from_end: int) -> float | None:
    idx = len(series) - 1 - offset_from_end
    return series[idx].value if idx >= 0 else None


def cagr(series: list[YearPoint], years: int) -> GrowthValue:
    """Return CAGR over n years using the spreadsheet's "neg." rules."""

    end_point = _last(series)
    end = end_point.value if end_point else None
    start = _from_end(series, years)
    if end is None or start is None:
        return "neg."
    if not end > 0:
        return "neg."
    if start == 0:
        return "neg."
    ratio = end / start
    if ratio <= 0:
        return "neg."
    return pow(ratio, 1 / years) - 1


def yoy_growth(series: list[YearPoint]) -> GrowthValue:
    """Return one-year growth using the spreadsheet's G-column formula."""

    end_point = _last(series)
    end = end_point.value if end_point else None
    prev = _from_end(series, 1)
    if end is None or prev is None:
        return "neg."
    if not end > 0 or prev == 0:
        return "neg."
    growth = end / prev - 1
    if growth < -1:
        return "neg."
    return growth


def avg_last(series: list[YearPoint], years: int) -> float | None:
    """Average the last n entries, matching Sheet AVERAGE over available cells."""

    slice_start = max(0, len(series) - years)
    values = series[slice_start:]
    if not values:
        return None
    return sum(point.value for point in values) / len(values)


def median(values: list[float]) -> float:
    """Return Sheet-compatible median, or NaN for an empty list."""

    sorted_values = sorted(values)
    count = len(sorted_values)
    if count == 0:
        return nan
    mid = count // 2
    if count % 2:
        return sorted_values[mid]
    return (sorted_values[mid - 1] + sorted_values[mid]) / 2


def _avg(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _finite_positive(value: float | None) -> float | None:
    if value is None or not isfinite(value) or value <= 0:
        return None
    return value


def _last_values(series: list[YearPoint], years: int) -> list[float]:
    return [point.value for point in series[-years:]]


def _aligned_ratio_series(
    numerator: list[YearPoint],
    denominator: list[YearPoint],
) -> list[float]:
    denominator_by_year = {point.year: point.value for point in denominator}
    values: list[float] = []
    for point in numerator:
        denom = denominator_by_year.get(point.year)
        if denom not in (None, 0):
            values.append(point.value / denom)
    return values


def _normalized_eps(raw: RawFinancials) -> float | None:
    recent_eps = _last_values(raw.eps, 5)
    recent_average = _avg(recent_eps)
    if recent_average is not None and recent_average > 0:
        return recent_average

    positive_recent = [value for value in _last_values(raw.eps, 7) if value > 0]
    return median(positive_recent) if positive_recent else None


def _normalized_fcf_per_share(raw: RawFinancials) -> float | None:
    per_share_values = _aligned_ratio_series(raw.fcf, raw.shares_outstanding)
    recent_average = _avg(per_share_values[-5:])
    return recent_average if recent_average is not None and isfinite(recent_average) else None


def _build_guardrails(raw: RawFinancials) -> tuple[float, float, ValuationGuardrails]:
    latest_eps = last_value(raw.eps)
    normalized_eps = _normalized_eps(raw)
    normalized_fcf_per_share = _normalized_fcf_per_share(raw)

    recent_eps = _last_values(raw.eps, 10)
    recent_fcf = _last_values(raw.fcf, 10)
    negative_eps_years = sum(1 for value in recent_eps if value <= 0)
    negative_fcf_years = sum(1 for value in recent_fcf if value <= 0)
    positive_eps = [value for value in recent_eps if value > 0]
    positive_eps_median = median(positive_eps) if positive_eps else None
    latest_eps_is_peak = (
        latest_eps is not None
        and positive_eps_median is not None
        and latest_eps > positive_eps_median * 1.75
    )

    is_cyclical = (
        negative_eps_years >= 2
        or negative_fcf_years >= 3
        or latest_eps_is_peak
    )

    warnings: list[ValuationWarning] = []
    if len(raw.eps) < 5:
        warnings.append(
            ValuationWarning(
                code="short_eps_history",
                severity="warning",
                title="Kurze EPS-Historie",
                detail="Weniger als fünf EPS-Jahre machen die Multiple-Bewertung fragiler.",
            )
        )
    if is_cyclical:
        warnings.append(
            ValuationWarning(
                code="cyclical_earnings",
                severity="warning",
                title="Zyklische Gewinne",
                detail="Mehrere Verlustjahre oder ein auffälliges Peak-EPS wurden erkannt.",
            )
        )

    eps_basis: EpsBasis = "latest"
    valuation_eps = latest_eps if latest_eps is not None else 0.0
    if latest_eps is None:
        eps_basis = "unavailable"
        valuation_eps = 0.0
    elif normalized_eps is not None and (
        latest_eps <= 0 or (is_cyclical and latest_eps > normalized_eps * 1.25)
    ):
        eps_basis = "normalized"
        valuation_eps = normalized_eps
        warnings.append(
            ValuationWarning(
                code="normalized_eps_used",
                severity="info",
                title="Normalisiertes EPS verwendet",
                detail="Die Bewertung nutzt ein geglättetes EPS statt des letzten Jahreswerts.",
            )
        )

    raw_historical_pe = raw.historical_pe if isfinite(raw.historical_pe) else 0.0
    effective_pe = _finite_positive(raw_historical_pe)
    pe_basis: PeBasis = "historical" if effective_pe is not None else "unavailable"
    if effective_pe is None:
        effective_pe = _finite_positive(raw.current_pe) or 0.0
        pe_basis = "historical" if effective_pe > 0 else "unavailable"

    if effective_pe > 35:
        effective_pe = 35.0
        pe_basis = "capped"
        warnings.append(
            ValuationWarning(
                code="pe_outlier_capped",
                severity="warning",
                title="KGV-Ausreißer gedeckelt",
                detail="Ein extrem hohes historisches KGV wurde für die Bewertung begrenzt.",
            )
        )
    if is_cyclical and effective_pe > 18:
        effective_pe = 18.0
        pe_basis = "cyclical_cap"
        warnings.append(
            ValuationWarning(
                code="cyclical_pe_cap",
                severity="warning",
                title="Zykliker-KGV gedeckelt",
                detail="Bei zyklischen Gewinnen wird kein hohes historisches Multiple blind übernommen.",
            )
        )

    confidence_score = 100
    if raw.data_source != "fmp":
        confidence_score -= 15
    if len(raw.eps) < 5:
        confidence_score -= 25
    if is_cyclical:
        confidence_score -= 20
    if pe_basis in ("capped", "cyclical_cap"):
        confidence_score -= 10
    if eps_basis == "unavailable" or effective_pe <= 0:
        confidence_score -= 35
    confidence: Confidence = (
        "high" if confidence_score >= 75 else "medium" if confidence_score >= 50 else "low"
    )

    guardrails = ValuationGuardrails(
        confidence=confidence,
        is_cyclical=is_cyclical,
        eps_basis=eps_basis,
        pe_basis=pe_basis,
        normalized_eps=normalized_eps,
        normalized_fcf_per_share=normalized_fcf_per_share,
        raw_historical_pe=raw_historical_pe,
        effective_pe=effective_pe,
        warnings=warnings,
    )
    return valuation_eps, effective_pe, guardrails


def growth_row(series: list[YearPoint]) -> GrowthRow:
    """Build 10/7/5/3/1 growth columns for a series."""

    return GrowthRow(
        y10=cagr(series, 10),
        y7=cagr(series, 7),
        y5=cagr(series, 5),
        y3=cagr(series, 3),
        y1=yoy_growth(series),
    )


def avg_row(series: list[YearPoint]) -> AvgRow:
    """Build 10/7/5/3/1 average columns for a series."""

    last_point = _last(series)
    return AvgRow(
        y10=avg_last(series, 10),
        y7=avg_last(series, 7),
        y5=avg_last(series, 5),
        y3=avg_last(series, 3),
        y1=last_point.value if last_point else None,
    )


def compute_valuation(
    input_data: RawFinancials,
    assumptions: ValuationAssumptions = DEFAULT_ASSUMPTIONS,
) -> Valuation:
    """Compute the sheet valuation with trader-grade input guardrails."""

    required_return = assumptions.required_return
    estimated_growth = assumptions.estimated_growth
    current_eps, historical_pe, guardrails = _build_guardrails(input_data)

    future_eps = current_eps * pow(1 + estimated_growth, 10)
    future_price = future_eps * historical_pe

    discounted = future_price / pow(1 + required_return, 10)
    intrinsic_value = None if discounted < 0 else discounted

    difference: float | None = None
    if intrinsic_value is not None and intrinsic_value != 0:
        difference = 1 - input_data.current_price / intrinsic_value

    margin_of_safety = [
        MarginOfSafetyStep(
            discount=discount,
            price=nan if intrinsic_value is None else intrinsic_value * (1 - discount),
        )
        for discount in [0.5, 0.4, 0.3, 0.2, 0.1]
    ]

    return Valuation(
        current_eps=current_eps,
        estimated_growth=estimated_growth,
        historical_pe=historical_pe,
        future_eps=future_eps,
        future_price=future_price,
        intrinsic_value=intrinsic_value,
        current_price=input_data.current_price,
        difference=difference,
        margin_of_safety=margin_of_safety,
        guardrails=guardrails,
    )


def last_value(series: list[YearPoint]) -> float | None:
    """Expose last value for service-layer formulas."""

    point = _last(series)
    return point.value if point else None
