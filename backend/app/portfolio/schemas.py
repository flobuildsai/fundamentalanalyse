"""API schemas for native portfolio calculations."""

from __future__ import annotations

from pydantic import Field

from app.schemas import ContractModel


class PortfolioSettingsPayload(ContractModel):
    net_liquidation: float = Field(gt=0)
    base_currency: str = "USD"
    fx_to_usd: float = Field(default=1.0, gt=0)
    moderate_utilization: float = Field(default=1.25, gt=0)
    critical_utilization: float = Field(default=2.0, gt=0)


class PortfolioPositionPayload(ContractModel):
    symbol: str
    asset_class: str
    strategy: str | None = None
    quantity: float | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0)
    buying_power_used: float | None = Field(default=None, ge=0)
    counts_toward_buying_power: bool | None = None


class PortfolioSummaryRequest(ContractModel):
    settings: PortfolioSettingsPayload
    positions: list[PortfolioPositionPayload]


class ExposureBucketPayload(ContractModel):
    amount: float
    weight: float


class PortfolioSummaryPayload(ContractModel):
    net_liquidation_usd: float
    moderate_buying_power: float
    critical_buying_power: float
    used_buying_power: float
    remaining_moderate_buying_power: float
    cash: float
    asset_allocation: dict[str, ExposureBucketPayload]
    underlying_exposure: dict[str, ExposureBucketPayload]
