from __future__ import annotations

import pandas as pd

from app.screener.schemas import MarketRegime
from app.screener.trade_setup import atr14, build_long_trade_setup


def test_atr14_computes_average_true_range() -> None:
    frame = pd.DataFrame(
        {
            "High": [12.0] * 20,
            "Low": [10.0] * 20,
            "Close": [11.0] * 20,
        }
    )

    assert atr14(frame) == 2.0


def test_build_long_trade_setup_respects_position_cap() -> None:
    regime = MarketRegime(vix=18.0, gate="normal", allow_new_entries=True, size_multiplier=1.0, notes=[])

    setup = build_long_trade_setup(
        ticker="AAPL",
        entry=100.0,
        atr=2.0,
        intrinsic_value=120.0,
        portfolio_value=25_000.0,
        base_risk_pct=0.01,
        market_regime=regime,
    )

    assert setup.stop == 96.0
    assert setup.target == 108.0
    assert setup.shares == 12
    assert setup.dollar_risk == 48.0
    assert round(setup.portfolio_pct, 4) == 0.048
    assert setup.risk_reward == 2.0


def test_build_long_trade_setup_blocks_new_entries_when_vix_gate_blocks() -> None:
    regime = MarketRegime(vix=32.0, gate="blocked", allow_new_entries=False, size_multiplier=0.0, notes=[])

    setup = build_long_trade_setup(
        ticker="AAPL",
        entry=100.0,
        atr=2.0,
        intrinsic_value=120.0,
        portfolio_value=25_000.0,
        base_risk_pct=0.01,
        market_regime=regime,
    )

    assert setup.shares == 0
    assert setup.dollar_risk == 0.0
    assert any("VIX" in warning for warning in setup.warnings)
