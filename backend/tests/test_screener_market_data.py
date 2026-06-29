from __future__ import annotations

import pandas as pd

from app.screener.market_data import close_series, market_regime_from_vix


def test_close_series_handles_single_symbol_multiindex_columns() -> None:
    columns = pd.MultiIndex.from_product([["^VIX"], ["Open", "High", "Low", "Close", "Adj Close", "Volume"]])
    frame = pd.DataFrame([[1.0, 2.0, 0.5, 1.5, 1.6, 0]], columns=columns)

    assert close_series(frame).to_list() == [1.6]


def test_market_regime_from_vix_applies_florian_gates() -> None:
    assert market_regime_from_vix(18).gate == "normal"
    assert market_regime_from_vix(25).size_multiplier == 0.6
    assert market_regime_from_vix(31).allow_new_entries is False
    assert market_regime_from_vix(None).gate == "unknown"
