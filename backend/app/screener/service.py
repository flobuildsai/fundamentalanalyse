"""Screener ranking service combining DeltaValue analysis, momentum, and setup sizing."""

from __future__ import annotations

from typing import Protocol

import pandas as pd

from app.cache import RawFinancialsCache
from app.providers import FinancialDataProvider, ProviderError
from app.screener.market_data import close_series, fetch_market_regime, fetch_price_history, now_utc
from app.screener.momentum import compute_momentum_metrics, score_momentum_percentiles
from app.screener.schemas import MarketRegime, MomentumMetrics, ScreenerResponse, ScreenerRow
from app.screener.trade_setup import atr14, build_long_trade_setup
from app.screener.universe import UniverseMember, load_sp500_universe
from app.service import build_analysis
from app.valuation import ValuationAssumptions


class ScreenerServiceProtocol(Protocol):
    async def run_sp500(
        self,
        *,
        limit: int,
        symbols: list[str] | None,
        portfolio_value: float,
        base_risk_pct: float,
        sort: str,
    ) -> ScreenerResponse: ...


_SOURCE_SCORE = {"fmp": 100.0, "sec": 84.0, "yahoo": 55.0, None: 20.0}


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _finite(value: float | int | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(numeric):
        return None
    return numeric


def _value_score(margin: float | None) -> float:
    if margin is None:
        return 35.0
    return _clamp(55.0 + margin * 100.0)


def _quality_score(spread: float | None) -> float:
    if spread is None:
        return 35.0
    return _clamp(52.0 + spread * 260.0)


def _composite_score(
    *,
    decision_score: int,
    momentum_score: float | None,
    margin: float | None,
    quality_spread: float | None,
    data_source: str | None,
) -> float:
    score = (
        decision_score * 0.40
        + (momentum_score if momentum_score is not None else 50.0) * 0.25
        + _value_score(margin) * 0.20
        + _quality_score(quality_spread) * 0.10
        + _SOURCE_SCORE.get(data_source, 20.0) * 0.05
    )
    return round(_clamp(score), 2)


def _provider_cache_key(provider: FinancialDataProvider) -> str:
    return provider.__class__.__name__


def _members_for_symbols(symbols: list[str]) -> list[UniverseMember]:
    return [UniverseMember(ticker=symbol.strip().upper(), company=symbol.strip().upper()) for symbol in symbols if symbol.strip()]


class ScreenerService:
    def __init__(self, provider: FinancialDataProvider, raw_cache: RawFinancialsCache) -> None:
        self.provider = provider
        self.raw_cache = raw_cache

    async def run_sp500(
        self,
        *,
        limit: int,
        symbols: list[str] | None,
        portfolio_value: float,
        base_risk_pct: float,
        sort: str,
    ) -> ScreenerResponse:
        limit = max(1, min(limit, 100))
        members = _members_for_symbols(symbols) if symbols else load_sp500_universe()
        members = members[:limit]
        tickers = [member.ticker for member in members]
        sector_by_ticker = {member.ticker: member.sector for member in members}

        market_regime = fetch_market_regime()
        histories = fetch_price_history([*tickers, "SPY"], period="15mo")
        spy_close = close_series(histories["SPY"]) if "SPY" in histories else None
        raw_momentum: dict[str, MomentumMetrics] = {}
        for ticker in tickers:
            frame = histories.get(ticker)
            closes = close_series(frame) if frame is not None else pd.Series(dtype=float)
            raw_momentum[ticker] = compute_momentum_metrics(closes, spy_close)
        momentum_by_ticker = score_momentum_percentiles(raw_momentum)

        rows: list[ScreenerRow] = []
        errors: list[dict[str, str]] = []
        for ticker in tickers:
            try:
                raw, cached = await self.raw_cache.get_or_fetch(
                    _provider_cache_key(self.provider),
                    ticker,
                    lambda ticker=ticker: self.provider.get_fundamentals(ticker),
                )
                analysis = build_analysis(raw, ValuationAssumptions())
            except ProviderError as exc:
                errors.append({"ticker": ticker, "error": exc.__class__.__name__})
                continue
            except Exception as exc:
                errors.append({"ticker": ticker, "error": exc.__class__.__name__})
                continue

            roic = _finite(analysis.profitability.roic.y1)
            wacc = _finite(analysis.profitability.wacc.y1)
            quality_spread = roic - wacc if roic is not None and wacc is not None else None
            momentum = momentum_by_ticker.get(ticker) or MomentumMetrics()
            composite = _composite_score(
                decision_score=analysis.decision.score,
                momentum_score=momentum.momentum_score,
                margin=analysis.valuation.difference,
                quality_spread=quality_spread,
                data_source=analysis.data_source,
            )
            frame = histories.get(ticker)
            setup = build_long_trade_setup(
                ticker=ticker,
                entry=analysis.current_price,
                atr=atr14(frame) if frame is not None else None,
                intrinsic_value=analysis.valuation.intrinsic_value,
                portfolio_value=portfolio_value,
                base_risk_pct=base_risk_pct,
                market_regime=market_regime,
            )
            warnings = [warning.title for warning in analysis.valuation.guardrails.warnings]
            rows.append(
                ScreenerRow(
                    ticker=analysis.ticker,
                    company_name=analysis.company_name,
                    sector=sector_by_ticker.get(ticker),
                    current_price=analysis.current_price,
                    data_source=analysis.data_source,
                    cached=cached,
                    intrinsic_value=analysis.valuation.intrinsic_value,
                    margin_of_safety=analysis.valuation.difference,
                    decision_score=analysis.decision.score,
                    decision_rating=analysis.decision.rating,
                    quality_spread=quality_spread,
                    debt_to_fcf=analysis.debt.debt_to_fcf,
                    data_signal=analysis.decision.data_signal,
                    momentum=momentum,
                    composite_score=composite,
                    trade_setup=setup,
                    warnings=warnings,
                )
            )

        rows.sort(key=lambda row: _sort_key(row, sort), reverse=True)
        return ScreenerResponse(
            as_of=now_utc(),
            universe="custom" if symbols else "sp500",
            count=len(rows),
            market_regime=market_regime,
            rows=rows,
            errors=errors,
        )


def _sort_key(row: ScreenerRow, sort: str) -> float:
    if sort == "margin":
        return row.margin_of_safety if row.margin_of_safety is not None else -999.0
    if sort == "momentum":
        return row.momentum.momentum_score if row.momentum.momentum_score is not None else -1.0
    if sort == "quality":
        return row.quality_spread if row.quality_spread is not None else -999.0
    if sort == "debt":
        return -(row.debt_to_fcf if row.debt_to_fcf is not None else 999.0)
    return row.composite_score
