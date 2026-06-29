"""API schemas for native option calculations."""

from __future__ import annotations

from datetime import date

from pydantic import Field

from app.options.calculations import OptionStrategyKind
from app.schemas import ContractModel


class OptionTradeRequest(ContractModel):
    strategy_kind: OptionStrategyKind
    underlying: str
    opened_at: date
    expiry: date
    underlying_price: float = Field(gt=0)
    short_strike: float = Field(gt=0)
    premium: float = Field(gt=0)
    fees: float = Field(default=0.0, ge=0)
    long_strike: float | None = Field(default=None, gt=0)
    contracts: float = Field(default=1.0, gt=0)
    multiplier: float = Field(default=100.0, gt=0)
    buyback_target_pct: float = Field(default=0.20, ge=0, le=1)
    closed_at: date | None = None
    actual_buyback_price: float | None = Field(default=None, ge=0)


class OptionTradeResponse(ContractModel):
    dte: int
    spread_width: float | None
    net_premium: float
    capital_at_risk_per_share: float
    return_on_risk: float
    annualization_multiplier: float
    annualized_return: float
    total_premium: float
    total_risk: float
    breakeven: float
    buyback_target_price: float
    realized_annualized_return: float | None
    data_quality: str
    warnings: list[str]
