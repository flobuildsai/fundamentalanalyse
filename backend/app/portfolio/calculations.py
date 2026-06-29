"""Native portfolio exposure and buying-power calculations.

These helpers intentionally do not depend on Google Sheets. Spreadsheet examples are
used only as regression fixtures in tests.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class PortfolioSettings:
    """Portfolio-level assumptions for buying-power calculations."""

    net_liquidation: float
    base_currency: str = "USD"
    fx_to_usd: float = 1.0
    moderate_utilization: float = 1.25
    critical_utilization: float = 2.0

    def __post_init__(self) -> None:
        if self.net_liquidation <= 0:
            raise ValueError("net_liquidation must be positive")
        if self.fx_to_usd <= 0:
            raise ValueError("fx_to_usd must be positive")
        if self.moderate_utilization <= 0:
            raise ValueError("moderate_utilization must be positive")
        if self.critical_utilization < self.moderate_utilization:
            raise ValueError("critical_utilization must be >= moderate_utilization")


@dataclass(frozen=True)
class PortfolioPosition:
    """A position input for exposure calculations."""

    symbol: str
    asset_class: str
    strategy: str | None = None
    quantity: float | None = None
    price: float | None = None
    buying_power_used: float | None = None
    counts_toward_buying_power: bool | None = None

    def __post_init__(self) -> None:
        if not self.symbol.strip():
            raise ValueError("symbol is required")
        if not self.asset_class.strip():
            raise ValueError("asset_class is required")
        if self.buying_power_used is not None and self.buying_power_used < 0:
            raise ValueError("buying_power_used must be non-negative")
        if self.buying_power_used is None:
            if self.quantity is None or self.price is None:
                raise ValueError("amount requires buying_power_used or quantity * price")
            if self.quantity < 0 or self.price < 0:
                raise ValueError("quantity and price must be non-negative")

    @property
    def normalized_symbol(self) -> str:
        return self.symbol.strip().upper()

    @property
    def normalized_asset_class(self) -> str:
        return self.asset_class.strip().lower()

    @property
    def normalized_strategy(self) -> str:
        return (self.strategy or "").strip().lower()

    @property
    def amount(self) -> float:
        if self.buying_power_used is not None:
            return float(self.buying_power_used)
        assert self.quantity is not None and self.price is not None
        return float(self.quantity * self.price)

    @property
    def included_in_used_buying_power(self) -> bool:
        if self.counts_toward_buying_power is not None:
            return self.counts_toward_buying_power
        if self.normalized_asset_class == "future_option":
            return False
        if self.normalized_strategy == "bear_call_spread":
            return False
        return True


@dataclass(frozen=True)
class ExposureBucket:
    """Aggregated exposure amount and portfolio weight."""

    amount: float
    weight: float


@dataclass(frozen=True)
class PortfolioSummary:
    """Computed portfolio summary."""

    net_liquidation_usd: float
    moderate_buying_power: float
    critical_buying_power: float
    used_buying_power: float
    remaining_moderate_buying_power: float
    cash: float
    asset_allocation: dict[str, ExposureBucket]
    underlying_exposure: dict[str, ExposureBucket]


def _bucketize(amounts: dict[str, float], denominator: float) -> dict[str, ExposureBucket]:
    return {
        key: ExposureBucket(amount=amount, weight=amount / denominator if denominator else 0.0)
        for key, amount in amounts.items()
    }


def calculate_portfolio_summary(
    settings: PortfolioSettings,
    positions: list[PortfolioPosition],
) -> PortfolioSummary:
    """Calculate buying power, cash and exposure from native position inputs."""

    net_liquidation_usd = settings.net_liquidation * settings.fx_to_usd
    moderate_buying_power = net_liquidation_usd * settings.moderate_utilization
    critical_buying_power = net_liquidation_usd * settings.critical_utilization

    asset_amounts: dict[str, float] = defaultdict(float)
    underlying_amounts: dict[str, float] = defaultdict(float)

    for position in positions:
        amount = position.amount
        asset_amounts[position.normalized_asset_class] += amount
        underlying_amounts[position.normalized_symbol] += amount

    total_exposure = sum(asset_amounts.values())
    used_buying_power = sum(
        position.amount for position in positions if position.included_in_used_buying_power
    )
    cash = net_liquidation_usd - total_exposure
    asset_amounts["cash"] += cash

    return PortfolioSummary(
        net_liquidation_usd=net_liquidation_usd,
        moderate_buying_power=moderate_buying_power,
        critical_buying_power=critical_buying_power,
        used_buying_power=used_buying_power,
        remaining_moderate_buying_power=moderate_buying_power - used_buying_power,
        cash=cash,
        asset_allocation=_bucketize(dict(asset_amounts), net_liquidation_usd),
        underlying_exposure=_bucketize(dict(underlying_amounts), net_liquidation_usd),
    )
