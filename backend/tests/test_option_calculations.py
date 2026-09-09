from __future__ import annotations

from datetime import date

import pytest

from app.options.calculations import OptionTradeInput, calculate_option_trade


def test_calculates_cash_secured_put_metrics_without_spreadsheet_dependency() -> None:
    trade = OptionTradeInput(
        strategy_kind="cash_secured_put",
        underlying="V",
        opened_at=date(2026, 5, 6),
        expiry=date(2026, 6, 5),
        underlying_price=319.19,
        short_strike=310,
        premium=4.15,
        fees=0.02,
        contracts=1,
        multiplier=100,
        buyback_target_pct=0.20,
    )

    result = calculate_option_trade(trade)

    assert result.dte == 30
    assert result.distance_to_price_pct == pytest.approx(0.0287916288)
    assert result.net_premium == pytest.approx(4.13)
    assert result.capital_at_risk_per_share == pytest.approx(305.87)
    assert result.return_on_risk == pytest.approx(0.01350246837)
    assert result.annualization_multiplier == pytest.approx(12.16666667)
    assert result.annualized_return == pytest.approx(0.1642800318)
    assert result.total_premium == pytest.approx(413)
    assert result.total_risk == pytest.approx(30_587)
    assert result.breakeven == pytest.approx(305.87)
    assert result.buyback_target_price == pytest.approx(0.83)
    assert result.status == "open"
    assert result.data_quality == "ok"


def test_calculates_vertical_spread_metrics() -> None:
    bull_put = calculate_option_trade(
        OptionTradeInput(
            strategy_kind="bull_put_spread",
            underlying="V",
            opened_at=date(2026, 5, 6),
            expiry=date(2026, 6, 5),
            underlying_price=319.19,
            short_strike=310,
            long_strike=300,
            premium=1.00,
            fees=0.02,
        )
    )
    bear_call = calculate_option_trade(
        OptionTradeInput(
            strategy_kind="bear_call_spread",
            underlying="V",
            opened_at=date(2026, 5, 6),
            expiry=date(2026, 6, 5),
            underlying_price=319.19,
            short_strike=330,
            long_strike=340,
            premium=0.70,
            fees=0.02,
        )
    )

    assert bull_put.spread_width == pytest.approx(10)
    assert bull_put.net_premium == pytest.approx(0.98)
    assert bull_put.capital_at_risk_per_share == pytest.approx(9.02)
    assert bull_put.breakeven == pytest.approx(309.02)
    assert bull_put.total_premium == pytest.approx(98)
    assert bull_put.total_risk == pytest.approx(902)

    assert bear_call.spread_width == pytest.approx(10)
    assert bear_call.net_premium == pytest.approx(0.68)
    assert bear_call.capital_at_risk_per_share == pytest.approx(9.32)
    assert bear_call.breakeven == pytest.approx(330.68)
    assert bear_call.total_premium == pytest.approx(68)
    assert bear_call.total_risk == pytest.approx(932)
    assert bull_put.distance_to_price_pct == pytest.approx(0.0287916288)
    assert bear_call.distance_to_price_pct == pytest.approx(0.0338669758)


def test_calculates_realized_return_for_valid_closed_trade() -> None:
    result = calculate_option_trade(
        OptionTradeInput(
            strategy_kind="cash_secured_put",
            underlying="V",
            opened_at=date(2026, 5, 6),
            expiry=date(2026, 6, 5),
            underlying_price=319.19,
            short_strike=310,
            premium=4.15,
            fees=0.02,
            closed_at=date(2026, 5, 20),
            actual_buyback_price=0.83,
        )
    )

    assert result.status == "closed"
    assert result.data_quality == "ok"
    assert result.realized_annualized_return == pytest.approx(0.2812819639)


def test_marks_placeholder_close_dates_without_trusting_dirty_history() -> None:
    result = calculate_option_trade(
        OptionTradeInput(
            strategy_kind="cash_secured_put",
            underlying="FTNT",
            opened_at=date(2026, 1, 6),
            expiry=date(2026, 1, 30),
            underlying_price=79.05,
            short_strike=74,
            premium=0.49,
            fees=0.02,
            closed_at=date(2025, 11, 1),
            actual_buyback_price=0.45,
        )
    )

    assert result.data_quality == "placeholder_or_invalid"
    assert result.status == "invalid"
    assert "closed_at_before_opened_at" in result.warnings
    assert result.realized_annualized_return is None


def test_rejects_invalid_option_inputs() -> None:
    with pytest.raises(ValueError, match="expiry"):
        OptionTradeInput(
            strategy_kind="cash_secured_put",
            underlying="V",
            opened_at=date(2026, 6, 5),
            expiry=date(2026, 5, 6),
            underlying_price=319.19,
            short_strike=310,
            premium=4.15,
        )

    with pytest.raises(ValueError, match="long_strike"):
        OptionTradeInput(
            strategy_kind="bull_put_spread",
            underlying="V",
            opened_at=date(2026, 5, 6),
            expiry=date(2026, 6, 5),
            underlying_price=319.19,
            short_strike=310,
            premium=1.0,
        )
