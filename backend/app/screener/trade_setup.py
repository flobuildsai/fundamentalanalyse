"""Trade setup and ATR helpers for screener candidates."""

from __future__ import annotations

import math

import pandas as pd

from app.screener.schemas import MarketRegime, TradeSetup


def atr14(frame: pd.DataFrame) -> float | None:
    """Compute 14-day average true range from OHLC data."""

    required = {"High", "Low", "Close"}
    if not required.issubset(set(frame.columns)) or len(frame) < 14:
        return None
    high = frame["High"].astype(float)
    low = frame["Low"].astype(float)
    close = frame["Close"].astype(float)
    prev_close = close.shift(1)
    true_range = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    value = float(true_range.tail(14).mean())
    return round(value, 4) if math.isfinite(value) else None


def build_long_trade_setup(
    *,
    ticker: str,
    entry: float,
    atr: float | None,
    intrinsic_value: float | None,
    portfolio_value: float,
    base_risk_pct: float,
    market_regime: MarketRegime,
) -> TradeSetup:
    """Build Florian-format long setup using VIX gate and 2x ATR stop."""

    warnings: list[str] = []
    if not market_regime.allow_new_entries:
        warnings.append("VIX-Gate blockiert neue Entries.")
    if atr is None or atr <= 0:
        warnings.append("ATR nicht verfügbar; Stop und Shares nicht belastbar.")
        return TradeSetup(
            ticker=ticker,
            direction="long",
            entry=entry,
            stop=None,
            target=intrinsic_value,
            shares=0,
            dollar_risk=0.0,
            portfolio_pct=0.0,
            risk_reward=None,
            catalysts=[],
            warnings=warnings,
        )

    stop = round(entry - 2 * atr, 2)
    risk_per_share = max(entry - stop, 0.0)
    target_2r = round(entry + 2 * risk_per_share, 2)
    target = target_2r
    risk_reward = 2.0 if risk_per_share > 0 else None
    risk_budget = portfolio_value * base_risk_pct * market_regime.size_multiplier
    max_position_value = portfolio_value * 0.05

    if risk_per_share <= 0 or not market_regime.allow_new_entries:
        shares = 0
    else:
        shares_by_risk = math.floor(risk_budget / risk_per_share)
        shares_by_cap = math.floor(max_position_value / entry) if entry > 0 else 0
        shares = max(0, min(shares_by_risk, shares_by_cap))

    dollar_risk = round(shares * risk_per_share, 2)
    portfolio_pct = round((shares * entry / portfolio_value) if portfolio_value > 0 else 0.0, 6)
    if intrinsic_value is not None and intrinsic_value < target_2r:
        warnings.append("Intrinsic Value liegt unter dem 2R-Ziel; Ziel konservativ prüfen.")

    return TradeSetup(
        ticker=ticker,
        direction="long",
        entry=round(entry, 2),
        stop=stop,
        target=target,
        shares=shares,
        dollar_risk=dollar_risk,
        portfolio_pct=portfolio_pct,
        risk_reward=risk_reward,
        catalysts=[],
        warnings=warnings,
    )
