from __future__ import annotations

import pandas as pd

from app.screener.momentum import compute_momentum_metrics, score_momentum_percentiles


def test_compute_momentum_metrics_uses_12m_excluding_last_month() -> None:
    closes = pd.Series([100.0 + i for i in range(260)])
    spy = pd.Series([100.0 + i * 0.5 for i in range(260)])

    metrics = compute_momentum_metrics(closes, spy)

    assert metrics.ret_3m is not None and metrics.ret_3m > 0
    assert metrics.ret_6m is not None and metrics.ret_6m > metrics.ret_3m
    expected_12m_ex_1m = closes.iloc[-22] / closes.iloc[-253] - 1
    assert round(metrics.ret_12m_ex_1m or 0, 8) == round(expected_12m_ex_1m, 8)
    assert metrics.relative_strength_spy_3m is not None
    assert metrics.above_50dma is True
    assert metrics.above_200dma is True


def test_score_momentum_percentiles_assigns_high_score_to_leader() -> None:
    rows = {
        "AAA": compute_momentum_metrics(pd.Series([100.0 + i for i in range(260)]), None),
        "BBB": compute_momentum_metrics(pd.Series([100.0 - i * 0.1 for i in range(260)]), None),
    }

    scored = score_momentum_percentiles(rows)

    assert scored["AAA"].momentum_score is not None
    assert scored["BBB"].momentum_score is not None
    assert scored["AAA"].momentum_score > scored["BBB"].momentum_score
