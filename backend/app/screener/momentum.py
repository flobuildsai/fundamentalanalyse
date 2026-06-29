"""Momentum calculations for the S&P 500 screener."""

from __future__ import annotations

import pandas as pd

from app.screener.schemas import MomentumMetrics


def _ret(closes: pd.Series, days: int, end_offset: int = 0) -> float | None:
    if len(closes) <= days + end_offset:
        return None
    end_idx = len(closes) - 1 - end_offset
    start_idx = end_idx - days
    start = float(closes.iloc[start_idx])
    end = float(closes.iloc[end_idx])
    if start == 0:
        return None
    return end / start - 1


def _above_ma(closes: pd.Series, window: int) -> bool | None:
    if len(closes) < window:
        return None
    latest = float(closes.iloc[-1])
    ma = float(closes.tail(window).mean())
    return latest > ma


def compute_momentum_metrics(
    closes: pd.Series,
    spy_closes: pd.Series | None,
) -> MomentumMetrics:
    """Compute raw momentum features from daily close series."""

    clean = closes.dropna().astype(float)
    spy = spy_closes.dropna().astype(float) if spy_closes is not None else None
    ret_3m = _ret(clean, 63)
    ret_6m = _ret(clean, 126)
    ret_12m_ex_1m = _ret(clean, 231, end_offset=21)
    spy_3m = _ret(spy, 63) if spy is not None else None
    relative = ret_3m - spy_3m if ret_3m is not None and spy_3m is not None else None
    return MomentumMetrics(
        ret_3m=ret_3m,
        ret_6m=ret_6m,
        ret_12m_ex_1m=ret_12m_ex_1m,
        relative_strength_spy_3m=relative,
        above_50dma=_above_ma(clean, 50),
        above_200dma=_above_ma(clean, 200),
        momentum_score=None,
    )


def _percentile_scores(values: dict[str, float | None]) -> dict[str, float | None]:
    finite = sorted((value, key) for key, value in values.items() if value is not None)
    if not finite:
        return {key: None for key in values}
    if len(finite) == 1:
        return {finite[0][1]: 100.0, **{key: None for key, value in values.items() if value is None}}
    scores: dict[str, float | None] = {key: None for key in values}
    denom = len(finite) - 1
    for rank, (_value, key) in enumerate(finite):
        scores[key] = rank / denom * 100
    return scores


def _trend_points(value: bool | None) -> float:
    if value is None:
        return 50.0
    return 100.0 if value else 0.0


def score_momentum_percentiles(metrics_by_ticker: dict[str, MomentumMetrics]) -> dict[str, MomentumMetrics]:
    """Attach a 0..100 score using cross-sectional percentile ranks."""

    p12 = _percentile_scores({k: v.ret_12m_ex_1m for k, v in metrics_by_ticker.items()})
    p6 = _percentile_scores({k: v.ret_6m for k, v in metrics_by_ticker.items()})
    p3 = _percentile_scores({k: v.ret_3m for k, v in metrics_by_ticker.items()})
    prs = _percentile_scores({k: v.relative_strength_spy_3m for k, v in metrics_by_ticker.items()})

    scored: dict[str, MomentumMetrics] = {}
    for ticker, metrics in metrics_by_ticker.items():
        score = (
            (p12[ticker] if p12[ticker] is not None else 50.0) * 0.30
            + (p6[ticker] if p6[ticker] is not None else 50.0) * 0.25
            + (p3[ticker] if p3[ticker] is not None else 50.0) * 0.20
            + (prs[ticker] if prs[ticker] is not None else 50.0) * 0.15
            + _trend_points(metrics.above_50dma) * 0.05
            + _trend_points(metrics.above_200dma) * 0.05
        )
        scored[ticker] = metrics.model_copy(update={"momentum_score": round(score, 2)})
    return scored
