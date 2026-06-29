"""Pydantic schemas for the research screener API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas import ContractModel, DataSource, DecisionRating, DecisionSignal


class MomentumMetrics(ContractModel):
    ret_3m: float | None = None
    ret_6m: float | None = None
    ret_12m_ex_1m: float | None = None
    relative_strength_spy_3m: float | None = None
    above_50dma: bool | None = None
    above_200dma: bool | None = None
    momentum_score: float | None = None


class MarketRegime(ContractModel):
    vix: float | None = None
    gate: Literal["normal", "reduced", "blocked", "unknown"]
    allow_new_entries: bool
    size_multiplier: float
    notes: list[str]


class TradeSetup(ContractModel):
    ticker: str
    direction: Literal["long", "short_research"]
    entry: float
    stop: float | None
    target: float | None
    shares: int
    dollar_risk: float
    portfolio_pct: float
    risk_reward: float | None
    catalysts: list[str]
    warnings: list[str]


class UniverseMember(ContractModel):
    ticker: str
    company: str
    sector: str | None = None
    industry: str | None = None


class ScreenerRow(ContractModel):
    ticker: str
    company_name: str
    sector: str | None = None
    current_price: float
    data_source: DataSource | None = None
    cached: bool | None = None
    intrinsic_value: float | None = None
    margin_of_safety: float | None = None
    decision_score: int
    decision_rating: DecisionRating
    quality_spread: float | None = None
    debt_to_fcf: float | None = None
    data_signal: DecisionSignal
    momentum: MomentumMetrics
    composite_score: float
    trade_setup: TradeSetup | None = None
    warnings: list[str]


class ScreenerResponse(ContractModel):
    as_of: datetime
    universe: str
    count: int
    market_regime: MarketRegime
    rows: list[ScreenerRow]
    errors: list[dict[str, str]]
