"""Price-history helpers for screener momentum and risk."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Iterable

import pandas as pd
import yfinance as yf

from app.screener.schemas import MarketRegime


def fetch_price_history(tickers: Iterable[str], period: str = "15mo") -> dict[str, pd.DataFrame]:
    """Fetch daily OHLCV history keyed by ticker.

    Uses yfinance to avoid spending FMP fundamental quota for momentum/ATR.
    """

    symbols = [ticker.strip().upper() for ticker in tickers if ticker.strip()]
    if not symbols:
        return {}
    data = yf.download(
        symbols,
        period=period,
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=True,
        group_by="ticker",
    )
    if data.empty:
        return {}

    if len(symbols) == 1:
        return {symbols[0]: data.dropna(how="all")}

    result: dict[str, pd.DataFrame] = {}
    for symbol in symbols:
        if symbol in data.columns.get_level_values(0):
            frame = data[symbol].dropna(how="all")
            if not frame.empty:
                result[symbol] = frame
    return result


def close_series(frame: pd.DataFrame) -> pd.Series:
    """Return adjusted close when available, otherwise close."""

    if isinstance(frame.columns, pd.MultiIndex):
        tickers = frame.columns.get_level_values(0).unique()
        if len(tickers) == 1:
            frame = frame.xs(str(tickers[0]), axis=1, level=0, drop_level=True)

    if "Adj Close" in frame and frame["Adj Close"].notna().any():
        return frame["Adj Close"].dropna()
    if "Close" in frame:
        return frame["Close"].dropna()
    return pd.Series(dtype=float)


def market_regime_from_vix(vix: float | None) -> MarketRegime:
    """Convert VIX level to Florian's entry gate."""

    if vix is None:
        return MarketRegime(
            vix=None,
            gate="unknown",
            allow_new_entries=True,
            size_multiplier=0.5,
            notes=["VIX nicht verfügbar; Positionsgröße konservativ halbieren."],
        )
    if vix > 30:
        return MarketRegime(
            vix=vix,
            gate="blocked",
            allow_new_entries=False,
            size_multiplier=0.0,
            notes=["VIX > 30: keine neuen Entries."],
        )
    if vix >= 20:
        return MarketRegime(
            vix=vix,
            gate="reduced",
            allow_new_entries=True,
            size_multiplier=0.6,
            notes=["VIX 20–30: neue Entries nur mit 60% Positionsgröße."],
        )
    return MarketRegime(
        vix=vix,
        gate="normal",
        allow_new_entries=True,
        size_multiplier=1.0,
        notes=["VIX < 20: normale Positionsgröße erlaubt."],
    )


def fetch_market_regime() -> MarketRegime:
    """Fetch latest VIX and return the entry gate."""

    try:
        frame = fetch_price_history(["^VIX"], period="1mo").get("^VIX")
        if frame is None or frame.empty:
            return market_regime_from_vix(None)
        closes = close_series(frame)
        latest = float(closes.iloc[-1]) if not closes.empty else None
        return market_regime_from_vix(latest)
    except Exception:
        return market_regime_from_vix(None)


def now_utc() -> datetime:
    return datetime.now(UTC)
