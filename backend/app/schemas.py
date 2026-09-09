"""Pydantic models matching frontend/src/types/analysis.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GrowthValue = float | Literal["neg."]
DataSource = Literal["fmp", "sec", "yahoo"]
ProvenanceValue = Literal["reported", "computed", "estimated", "unavailable"]
GrowthSource = Literal["manual", "zacks", "analyst"]
GuardrailSeverity = Literal["info", "warning", "danger"]
Confidence = Literal["high", "medium", "low"]
EpsBasis = Literal["latest", "normalized", "manual", "unavailable"]
PeBasis = Literal["historical", "manual", "capped", "cyclical_cap", "unavailable"]
DecisionRating = Literal["prime", "watch", "neutral", "avoid", "incomplete"]
DecisionSignal = Literal["strong", "ok", "weak", "unknown"]


def to_camel(value: str) -> str:
    """Convert snake_case fields to the frontend's camelCase contract."""

    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ContractModel(BaseModel):
    """Base model with camelCase aliases enabled."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class GrowthRow(ContractModel):
    y10: GrowthValue
    y7: GrowthValue
    y5: GrowthValue
    y3: GrowthValue
    y1: GrowthValue


class AvgRow(ContractModel):
    y10: float | None
    y7: float | None
    y5: float | None
    y3: float | None
    y1: float | None


class MarginOfSafetyStep(ContractModel):
    discount: float
    price: float


class ValuationWarning(ContractModel):
    code: str
    severity: GuardrailSeverity
    title: str
    detail: str


class ValuationGuardrails(ContractModel):
    confidence: Confidence
    is_cyclical: bool
    eps_basis: EpsBasis
    pe_basis: PeBasis
    normalized_eps: float | None = Field(alias="normalizedEPS")
    normalized_fcf_per_share: float | None
    raw_historical_pe: float = Field(alias="rawHistoricalPE")
    effective_pe: float = Field(alias="effectivePE")
    warnings: list[ValuationWarning]


class Valuation(ContractModel):
    current_eps: float = Field(alias="currentEPS")
    estimated_growth: float
    historical_pe: float = Field(alias="historicalPE")
    future_eps: float = Field(alias="futureEPS")
    future_price: float
    intrinsic_value: float | None
    current_price: float
    difference: float | None
    target_buy_price: float | None
    expected_annual_return: float | None
    implied_growth: float | None
    margin_of_safety: list[MarginOfSafetyStep]
    guardrails: ValuationGuardrails


class Assumptions(ContractModel):
    required_return: float
    estimated_growth: float
    growth_source: GrowthSource = "analyst"
    margin_of_safety_target: float = 0.30
    exit_multiple: float | None = None
    current_eps_override: float | None = Field(default=None, alias="currentEPSOverride")


class GrowthEstimate(ContractModel):
    source: GrowthSource
    estimated_growth: float | None
    horizon_years: int | None = None
    forward_eps: float | None = Field(default=None, alias="forwardEPS")
    detail: str


class Growth(ContractModel):
    revenue: GrowthRow
    eps: GrowthRow
    fcf: GrowthRow
    book_value_per_share: GrowthRow
    shares_outstanding: GrowthRow
    operating_cashflow: GrowthRow


class Profitability(ContractModel):
    net_income: AvgRow
    roic: AvgRow
    roe: AvgRow
    wacc: AvgRow


class Margins(ContractModel):
    gross_margin: AvgRow
    operating_margin: AvgRow
    net_margin: AvgRow
    fcf_margin: AvgRow


class Debt(ContractModel):
    long_term_debt: AvgRow
    debt_to_fcf: float | None
    interest_coverage: float | None


class Balance(ContractModel):
    total_debt: AvgRow
    cash_and_investments: AvgRow
    net_debt: AvgRow
    total_equity: AvgRow
    debt_to_equity: float | None
    cash_per_share: float | None


class Dividend(ContractModel):
    dividend: AvgRow
    yield_: float | None = Field(alias="yield")
    payout_ratio: AvgRow


class Series(ContractModel):
    years: list[int]
    revenue: list[float] | None = None
    eps: list[float] | None = None
    fcf: list[float] | None = None
    book_value_per_share: list[float] | None = None
    shares_outstanding: list[float] | None = None
    operating_cashflow: list[float] | None = None
    net_income: list[float] | None = None
    gross_profit: list[float] | None = None
    operating_income: list[float] | None = None
    capital_expenditure: list[float] | None = None
    roic: list[float] | None = None
    wacc: list[float] | None = None
    interest_coverage: list[float] | None = None
    total_debt: list[float] | None = None
    cash_and_investments: list[float] | None = None
    total_equity: list[float] | None = None


class Decision(ContractModel):
    rating: DecisionRating
    label: str
    score: int
    summary: str
    valuation_signal: DecisionSignal
    quality_signal: DecisionSignal
    debt_signal: DecisionSignal
    data_signal: DecisionSignal
    reasons: list[str]


class Analysis(ContractModel):
    ticker: str
    company_name: str
    currency: str
    as_of: datetime
    current_price: float
    current_pe: float = Field(alias="currentPE")
    historical_pe: float = Field(alias="historicalPE")
    beta: float
    cached: bool | None = None
    growth: Growth
    profitability: Profitability
    margins: Margins
    value_creating: bool | None
    debt: Debt
    balance: Balance
    dividend: Dividend
    series: Series | None = None
    assumptions: Assumptions
    growth_estimate: GrowthEstimate | None = None
    valuation: Valuation
    decision: Decision
    data_source: DataSource | None = None
    provenance: dict[str, ProvenanceValue] | None = None
