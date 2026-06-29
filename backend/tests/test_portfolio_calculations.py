from __future__ import annotations

import pytest

from app.portfolio.calculations import (
    PortfolioPosition,
    PortfolioSettings,
    calculate_portfolio_summary,
)


def test_calculates_buying_power_cash_and_allocations_without_spreadsheet_dependency() -> None:
    settings = PortfolioSettings(
        net_liquidation=50_000,
        base_currency="EUR",
        fx_to_usd=1.14038,
        moderate_utilization=1.25,
        critical_utilization=2.0,
    )
    positions = [
        PortfolioPosition(symbol="AAPL", asset_class="stock", strategy="direct", quantity=25, price=214.05),
        PortfolioPosition(symbol="MSCI", asset_class="stock", strategy="direct", quantity=10, price=552.79),
        PortfolioPosition(symbol="META", asset_class="stock", strategy="direct", quantity=50, price=128.30),
        PortfolioPosition(symbol="GOOGL", asset_class="stock", strategy="direct", quantity=50, price=190.00),
        PortfolioPosition(symbol="AAPL", asset_class="equity_option", strategy="bull_put_spread", buying_power_used=1_000),
        PortfolioPosition(symbol="CMG", asset_class="equity_option", strategy="short_put", buying_power_used=4_000),
        PortfolioPosition(symbol="EW", asset_class="equity_option", strategy="cash_secured_put", buying_power_used=7_500),
        PortfolioPosition(symbol="BA", asset_class="equity_option", strategy="bear_call_spread", buying_power_used=2_000),
        PortfolioPosition(symbol="NG", asset_class="future_option", strategy="bear_call_spread", buying_power_used=2_500),
        PortfolioPosition(symbol="SB", asset_class="future_option", strategy="bull_put_spread", buying_power_used=2_240),
    ]

    summary = calculate_portfolio_summary(settings, positions)

    assert summary.net_liquidation_usd == pytest.approx(57_019)
    assert summary.moderate_buying_power == pytest.approx(71_273.75)
    assert summary.critical_buying_power == pytest.approx(114_038)
    assert summary.used_buying_power == pytest.approx(39_294.15)
    assert summary.remaining_moderate_buying_power == pytest.approx(31_979.60)
    assert summary.cash == pytest.approx(10_984.85)

    assert summary.asset_allocation["stock"].amount == pytest.approx(26_794.15)
    assert summary.asset_allocation["stock"].weight == pytest.approx(0.4699161683)
    assert summary.asset_allocation["equity_option"].amount == pytest.approx(14_500)
    assert summary.asset_allocation["future_option"].amount == pytest.approx(4_740)
    assert summary.asset_allocation["cash"].amount == pytest.approx(10_984.85)

    assert summary.underlying_exposure["AAPL"].amount == pytest.approx(6_351.25)
    assert summary.underlying_exposure["AAPL"].weight == pytest.approx(0.1113883092)


def test_rejects_invalid_portfolio_inputs() -> None:
    with pytest.raises(ValueError, match="net_liquidation"):
        PortfolioSettings(net_liquidation=0)

    with pytest.raises(ValueError, match="symbol"):
        PortfolioPosition(symbol="", asset_class="stock", quantity=1, price=10)

    with pytest.raises(ValueError, match="amount"):
        PortfolioPosition(symbol="AAPL", asset_class="stock")
