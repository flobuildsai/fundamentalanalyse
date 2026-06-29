"""FastAPI entrypoint for the DeltaValue backend."""

from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.cache import RawFinancialsCache
from app.providers import (
    FinancialDataProvider,
    ProviderUnavailable,
    RateLimited,
    TickerNotFound,
    create_provider,
)
from app.options.calculations import OptionTradeInput, calculate_option_trade
from app.options.schemas import OptionTradeRequest, OptionTradeResponse
from app.portfolio.calculations import (
    PortfolioPosition,
    PortfolioSettings,
    calculate_portfolio_summary,
)
from app.portfolio.schemas import (
    ExposureBucketPayload,
    PortfolioSummaryPayload,
    PortfolioSummaryRequest,
)
from app.screener.service import ScreenerService, ScreenerServiceProtocol
from app.service import build_analysis, to_response_payload
from app.valuation import GrowthSource, ValuationAssumptions

app = FastAPI(title="Fundamental-Analyst Backend")
_raw_cache = RawFinancialsCache()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_origin_regex=(
        r"https://.*\.vercel\.app|"
        r"http://(localhost|127\.0\.0\.1):\d+"
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def get_provider() -> FinancialDataProvider:
    """FastAPI dependency for provider selection."""

    return create_provider()


def get_raw_cache() -> RawFinancialsCache:
    """FastAPI dependency for API-level RawFinancials caching."""

    return _raw_cache


def get_screener_service(
    provider: FinancialDataProvider = Depends(get_provider),
    raw_cache: RawFinancialsCache = Depends(get_raw_cache),
) -> ScreenerServiceProtocol:
    """FastAPI dependency for S&P 500 screener orchestration."""

    return ScreenerService(provider, raw_cache)


def _provider_cache_key(provider: FinancialDataProvider) -> str:
    return provider.__class__.__name__


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Lightweight health check for local and Vercel previews."""

    return {"status": "ok"}


@app.get("/api/analyze/{ticker}", response_model=None)
async def analyze_ticker(
    ticker: str,
    required_return: float = Query(0.15, alias="requiredReturn", gt=-1),
    estimated_growth: float = Query(0.125, alias="estimatedGrowth"),
    growth_source: GrowthSource = Query("analyst", alias="growthSource"),
    provider: FinancialDataProvider = Depends(get_provider),
    raw_cache: RawFinancialsCache = Depends(get_raw_cache),
) -> dict[str, object] | JSONResponse:
    """Fetch fundamentals, run the valuation engine, and return Analysis JSON."""

    symbol = ticker.strip().upper()
    assumptions = ValuationAssumptions(
        required_return=required_return,
        estimated_growth=estimated_growth,
        growth_source=growth_source,
    )
    try:
        raw, cached = await raw_cache.get_or_fetch(
            _provider_cache_key(provider),
            symbol,
            lambda: provider.get_fundamentals(symbol),
        )
        analysis = build_analysis(raw, assumptions)
    except TickerNotFound:
        return JSONResponse(
            status_code=404,
            content={"error": "ticker_not_found", "ticker": symbol},
        )
    except RateLimited:
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "message": (
                    "FMP-Rate-Limit erreicht, bitte später erneut versuchen "
                    "oder FMP-Plan upgraden."
                ),
            },
        )
    except ProviderUnavailable:
        return JSONResponse(status_code=502, content={"error": "provider_unavailable"})

    payload = to_response_payload(analysis)
    payload["cached"] = cached
    return payload


@app.get("/api/screener/sp500", response_model=None)
async def screen_sp500(
    limit: int = Query(25, ge=1, le=100),
    portfolio_value: float = Query(25_000.0, alias="portfolioValue", gt=0),
    base_risk_pct: float = Query(0.01, alias="baseRiskPct", gt=0, le=0.05),
    sort: str = Query("composite"),
    symbols: str | None = Query(None),
    screener: ScreenerServiceProtocol = Depends(get_screener_service),
) -> dict[str, object]:
    """Run a limited S&P 500/custom-symbol research screener."""

    parsed_symbols = (
        [symbol.strip().upper() for symbol in symbols.split(",") if symbol.strip()]
        if symbols
        else None
    )
    response = await screener.run_sp500(
        limit=limit,
        symbols=parsed_symbols,
        portfolio_value=portfolio_value,
        base_risk_pct=base_risk_pct,
        sort=sort,
    )
    return response.model_dump(by_alias=True, mode="json")


def _rounded(value: float, places: int = 10) -> float:
    return round(float(value), places)


@app.post("/api/portfolio/summary", response_model=None)
async def portfolio_summary(request: PortfolioSummaryRequest) -> dict[str, object]:
    """Calculate portfolio exposure and buying-power summary from native inputs."""

    try:
        settings = PortfolioSettings(
            net_liquidation=request.settings.net_liquidation,
            base_currency=request.settings.base_currency,
            fx_to_usd=request.settings.fx_to_usd,
            moderate_utilization=request.settings.moderate_utilization,
            critical_utilization=request.settings.critical_utilization,
        )
        positions = [
            PortfolioPosition(
                symbol=position.symbol,
                asset_class=position.asset_class,
                strategy=position.strategy,
                quantity=position.quantity,
                price=position.price,
                buying_power_used=position.buying_power_used,
                counts_toward_buying_power=position.counts_toward_buying_power,
            )
            for position in request.positions
        ]
        summary = calculate_portfolio_summary(settings, positions)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    payload = PortfolioSummaryPayload(
        net_liquidation_usd=_rounded(summary.net_liquidation_usd),
        moderate_buying_power=_rounded(summary.moderate_buying_power),
        critical_buying_power=_rounded(summary.critical_buying_power),
        used_buying_power=_rounded(summary.used_buying_power),
        remaining_moderate_buying_power=_rounded(summary.remaining_moderate_buying_power),
        cash=_rounded(summary.cash),
        asset_allocation={
            key: ExposureBucketPayload(amount=_rounded(bucket.amount), weight=_rounded(bucket.weight))
            for key, bucket in summary.asset_allocation.items()
        },
        underlying_exposure={
            key: ExposureBucketPayload(amount=_rounded(bucket.amount), weight=_rounded(bucket.weight))
            for key, bucket in summary.underlying_exposure.items()
        },
    )
    return payload.model_dump(by_alias=True, mode="json")


@app.post("/api/options/calculate", response_model=None)
async def options_calculate(request: OptionTradeRequest) -> dict[str, object]:
    """Calculate option setup metrics from native inputs."""

    try:
        metrics = calculate_option_trade(
            OptionTradeInput(
                strategy_kind=request.strategy_kind,
                underlying=request.underlying,
                opened_at=request.opened_at,
                expiry=request.expiry,
                underlying_price=request.underlying_price,
                short_strike=request.short_strike,
                premium=request.premium,
                fees=request.fees,
                long_strike=request.long_strike,
                contracts=request.contracts,
                multiplier=request.multiplier,
                buyback_target_pct=request.buyback_target_pct,
                closed_at=request.closed_at,
                actual_buyback_price=request.actual_buyback_price,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    payload = OptionTradeResponse(
        dte=metrics.dte,
        spread_width=None if metrics.spread_width is None else _rounded(metrics.spread_width),
        net_premium=_rounded(metrics.net_premium),
        capital_at_risk_per_share=_rounded(metrics.capital_at_risk_per_share),
        return_on_risk=_rounded(metrics.return_on_risk, 11),
        annualization_multiplier=_rounded(metrics.annualization_multiplier, 8),
        annualized_return=_rounded(metrics.annualized_return, 10),
        total_premium=_rounded(metrics.total_premium),
        total_risk=_rounded(metrics.total_risk),
        breakeven=_rounded(metrics.breakeven),
        buyback_target_price=_rounded(metrics.buyback_target_price),
        realized_annualized_return=(
            None
            if metrics.realized_annualized_return is None
            else _rounded(metrics.realized_annualized_return, 10)
        ),
        data_quality=metrics.data_quality,
        warnings=metrics.warnings,
    )
    return payload.model_dump(by_alias=True, mode="json")
