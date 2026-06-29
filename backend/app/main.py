"""FastAPI entrypoint for the DeltaValue backend."""

from __future__ import annotations

from fastapi import Depends, FastAPI, Query
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
    allow_methods=["GET"],
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
