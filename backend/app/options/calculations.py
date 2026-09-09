"""Native option strategy calculations.

The formulas are implemented directly in Python so the app does not depend on
Google Sheets for option setup or trade-journal math.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

OptionStrategyKind = Literal[
    "cash_secured_put",
    "short_put",
    "covered_call",
    "bull_put_spread",
    "bear_call_spread",
]

PUT_STRATEGIES = {"cash_secured_put", "short_put", "bull_put_spread"}
CALL_STRATEGIES = {"covered_call", "bear_call_spread"}
SPREAD_STRATEGIES = {"bull_put_spread", "bear_call_spread"}


@dataclass(frozen=True)
class OptionTradeInput:
    """Inputs needed to evaluate an option trade setup."""

    strategy_kind: OptionStrategyKind
    underlying: str
    opened_at: date
    expiry: date
    underlying_price: float
    short_strike: float
    premium: float
    fees: float = 0.0
    long_strike: float | None = None
    contracts: float = 1.0
    multiplier: float = 100.0
    buyback_target_pct: float = 0.20
    closed_at: date | None = None
    actual_buyback_price: float | None = None

    def __post_init__(self) -> None:
        if not self.underlying.strip():
            raise ValueError("underlying is required")
        if self.expiry <= self.opened_at:
            raise ValueError("expiry must be after opened_at")
        if self.underlying_price <= 0:
            raise ValueError("underlying_price must be positive")
        if self.short_strike <= 0:
            raise ValueError("short_strike must be positive")
        if self.premium <= 0:
            raise ValueError("premium must be positive")
        if self.fees < 0:
            raise ValueError("fees must be non-negative")
        if self.contracts <= 0:
            raise ValueError("contracts must be positive")
        if self.multiplier <= 0:
            raise ValueError("multiplier must be positive")
        if not 0 <= self.buyback_target_pct <= 1:
            raise ValueError("buyback_target_pct must be between 0 and 1")
        if self.strategy_kind in SPREAD_STRATEGIES and self.long_strike is None:
            raise ValueError("long_strike is required for spread strategies")
        if self.long_strike is not None and self.long_strike <= 0:
            raise ValueError("long_strike must be positive")
        if self.actual_buyback_price is not None and self.actual_buyback_price < 0:
            raise ValueError("actual_buyback_price must be non-negative")


@dataclass(frozen=True)
class OptionTradeMetrics:
    """Computed option trade metrics."""

    dte: int
    distance_to_price_pct: float
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
    status: Literal["open", "closed", "invalid"]
    data_quality: Literal["ok", "placeholder_or_invalid"]
    warnings: list[str]


def _spread_width(trade: OptionTradeInput) -> float | None:
    if trade.strategy_kind not in SPREAD_STRATEGIES:
        return None
    assert trade.long_strike is not None
    return abs(trade.long_strike - trade.short_strike)


def _capital_at_risk_per_share(trade: OptionTradeInput, net_premium: float) -> float:
    width = _spread_width(trade)
    if width is not None:
        return width - net_premium
    return trade.short_strike - net_premium


def _breakeven(trade: OptionTradeInput, net_premium: float) -> float:
    if trade.strategy_kind in PUT_STRATEGIES:
        return trade.short_strike - net_premium
    if trade.strategy_kind in CALL_STRATEGIES:
        return trade.short_strike + net_premium
    raise ValueError(f"Unsupported strategy_kind: {trade.strategy_kind}")


def _distance_to_price_pct(trade: OptionTradeInput) -> float:
    if trade.strategy_kind in PUT_STRATEGIES:
        return (trade.underlying_price - trade.short_strike) / trade.underlying_price
    if trade.strategy_kind in CALL_STRATEGIES:
        return (trade.short_strike - trade.underlying_price) / trade.underlying_price
    raise ValueError(f"Unsupported strategy_kind: {trade.strategy_kind}")


def _realized_annualized_return(
    trade: OptionTradeInput,
    capital_at_risk_per_share: float,
    warnings: list[str],
) -> float | None:
    if trade.closed_at is None or trade.actual_buyback_price is None:
        return None
    if trade.closed_at < trade.opened_at:
        warnings.append("closed_at_before_opened_at")
        return None
    days_held = (trade.closed_at - trade.opened_at).days
    if days_held <= 0:
        warnings.append("non_positive_holding_period")
        return None
    realized_profit_per_share = trade.premium - trade.fees - trade.actual_buyback_price
    return (realized_profit_per_share / capital_at_risk_per_share) * (365 / days_held)


def _status(trade: OptionTradeInput, realized_return: float | None, warnings: list[str]) -> Literal["open", "closed", "invalid"]:
    if warnings:
        return "invalid"
    if trade.closed_at is not None or trade.actual_buyback_price is not None:
        return "closed" if realized_return is not None else "invalid"
    return "open"


def calculate_option_trade(trade: OptionTradeInput) -> OptionTradeMetrics:
    """Calculate setup, risk and annualized-return metrics for an option trade."""

    dte = (trade.expiry - trade.opened_at).days
    net_premium = trade.premium - trade.fees
    capital_at_risk_per_share = _capital_at_risk_per_share(trade, net_premium)
    if capital_at_risk_per_share <= 0:
        raise ValueError("capital_at_risk_per_share must be positive")

    return_on_risk = net_premium / capital_at_risk_per_share
    annualization_multiplier = 365 / dte
    annualized_return = return_on_risk * annualization_multiplier
    total_premium = net_premium * trade.contracts * trade.multiplier
    total_risk = capital_at_risk_per_share * trade.contracts * trade.multiplier
    warnings: list[str] = []
    realized_return = _realized_annualized_return(trade, capital_at_risk_per_share, warnings)
    status = _status(trade, realized_return, warnings)

    return OptionTradeMetrics(
        dte=dte,
        distance_to_price_pct=_distance_to_price_pct(trade),
        spread_width=_spread_width(trade),
        net_premium=net_premium,
        capital_at_risk_per_share=capital_at_risk_per_share,
        return_on_risk=return_on_risk,
        annualization_multiplier=annualization_multiplier,
        annualized_return=annualized_return,
        total_premium=total_premium,
        total_risk=total_risk,
        breakeven=_breakeven(trade, net_premium),
        buyback_target_price=trade.premium * trade.buyback_target_pct,
        realized_annualized_return=realized_return,
        status=status,
        data_quality="placeholder_or_invalid" if warnings else "ok",
        warnings=warnings,
    )
