from __future__ import annotations

import asyncio
import copy
import sys
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import app.providers as providers
import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_provider
from app.providers import (
    FallbackProvider,
    FmpProvider,
    ProviderUnavailable,
    RateLimited,
    SecProvider,
    TickerNotFound,
    YahooProvider,
)
from app.service import build_analysis, to_response_payload
from app.valuation import RawFinancials, ValuationAssumptions


@pytest.fixture(autouse=True)
def _speed_up_fmp_provider_tests(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FMP_REQUEST_DELAY_MS", "0")
    monkeypatch.setenv("FMP_CACHE_TTL_SECONDS", "0")
    monkeypatch.setattr(
        providers,
        "_FMP_RATE_LIMIT_BACKOFF_SECONDS",
        (0.0, 0.0, 0.0),
    )


def _fmp_payloads() -> dict[str, list[dict[str, Any]]]:
    return {
        "profile": [
            {"companyName": "Test Corp", "currency": "USD", "beta": 1.2},
        ],
        "quote": [
            {"price": 100.0, "pe": 18.0, "marketCap": 1500.0},
        ],
        "income-statement": [
            {
                "date": "2025-12-31",
                "calendarYear": "2025",
                "revenue": 1100.0,
                "epsdiluted": 5.0,
                "netIncome": 80.0,
                "interestExpense": 40.0,
                "incomeTaxExpense": 20.0,
                "incomeBeforeTax": 100.0,
                "weightedAverageShsOutDil": 100.0,
            },
            {
                "date": "2024-12-31",
                "calendarYear": "2024",
                "revenue": 1000.0,
                "epsdiluted": -1.0,
                "netIncome": 50.0,
                "interestExpense": 30.0,
                "incomeTaxExpense": 10.0,
                "incomeBeforeTax": 60.0,
                "weightedAverageShsOutDil": 100.0,
            },
        ],
        "balance-sheet-statement": [
            {
                "date": "2025-12-31",
                "calendarYear": "2025",
                "longTermDebt": 450.0,
                "totalDebt": 500.0,
                "totalStockholdersEquity": 1000.0,
                "cashAndShortTermInvestments": 120.0,
            },
            {
                "date": "2024-12-31",
                "calendarYear": "2024",
                "longTermDebt": 400.0,
                "totalDebt": 400.0,
                "totalStockholdersEquity": 900.0,
                "cashAndShortTermInvestments": 100.0,
            },
        ],
        "cash-flow-statement": [
            {
                "date": "2025-12-31",
                "calendarYear": "2025",
                "operatingCashFlow": 400.0,
                "capitalExpenditure": 100.0,
            },
            {
                "date": "2024-12-31",
                "calendarYear": "2024",
                "operatingCashFlow": 300.0,
                "capitalExpenditure": -50.0,
            },
        ],
        "ratios": [
            {
                "date": "2025-12-31",
                "calendarYear": "2025",
                "interestCoverageRatio": 8.0,
                "dividendPayoutRatio": 0.25,
                "priceToEarningsRatio": 15.0,
            },
            {
                "date": "2024-12-31",
                "calendarYear": "2024",
                "interestCoverageRatio": 6.0,
                "dividendPayoutRatio": 0.20,
                "priceToEarningsRatio": 100.0,
            },
        ],
        "key-metrics": [
            {
                "date": "2025-12-31",
                "calendarYear": "2025",
                "returnOnInvestedCapital": 0.12,
                "shareholdersEquityPerShare": 10.0,
                "dividendPerShare": 1.0,
            },
            {
                "date": "2024-12-31",
                "calendarYear": "2024",
                "returnOnInvestedCapital": 0.10,
                "shareholdersEquityPerShare": 9.0,
                "dividendPerShare": 0.8,
            },
        ],
        "analyst-estimates": [
            {
                "date": "2026-12-31",
                "calendarYear": "2026",
                "estimatedEpsAvg": 5.8,
            },
            {
                "date": "2027-12-31",
                "calendarYear": "2027",
                "estimatedEpsAvg": 6.4,
            },
        ],
    }


def _fmp_transport(payloads: dict[str, list[dict[str, Any]]]) -> httpx.MockTransport:
    async def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.split("/stable/", maxsplit=1)[1]
        assert request.url.params["apikey"] == "test-key"
        assert request.url.params["symbol"] == "TEST"
        assert "TEST" not in path
        if path not in ("profile", "quote"):
            assert request.url.params["period"] == "annual"
            expected_limit = "6" if path == "analyst-estimates" else "11"
            assert request.url.params["limit"] == expected_limit
        return httpx.Response(200, json=payloads[path])

    return httpx.MockTransport(handler)


class _MarketProvider:
    def __init__(self, raw: RawFinancials) -> None:
        self.raw = raw
        self.calls = 0

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        self.calls += 1
        return RawFinancials(
            ticker=ticker.strip().upper(),
            company_name=self.raw.company_name,
            currency=self.raw.currency,
            as_of=self.raw.as_of,
            current_price=self.raw.current_price,
            current_pe=self.raw.current_pe,
            historical_pe=self.raw.historical_pe,
            beta=self.raw.beta,
            analyst_growth=self.raw.analyst_growth,
            analyst_growth_horizon_years=self.raw.analyst_growth_horizon_years,
            analyst_forward_eps=self.raw.analyst_forward_eps,
            data_source=self.raw.data_source,
            provenance=dict(self.raw.provenance),
        )


def _market_raw() -> RawFinancials:
    return RawFinancials(
        ticker="AAPL",
        company_name="Market Apple",
        currency="USD",
        as_of=datetime.now(UTC),
        current_price=100.0,
        current_pe=20.0,
        historical_pe=18.0,
        beta=1.2,
        analyst_growth=0.10,
        analyst_growth_horizon_years=2,
        analyst_forward_eps=7.5,
        data_source="yahoo",
        provenance={
            "currentPrice": "reported",
            "currentPE": "reported",
            "historicalPE": "computed",
            "beta": "reported",
        },
    )


def _sec_companyfacts_payload() -> dict[str, Any]:
    def fact(unit: str, first: float, second: float) -> dict[str, Any]:
        return {
            "units": {
                unit: [
                    {
                        "fy": 2024,
                        "fp": "FY",
                        "form": "10-K",
                        "filed": "2025-01-31",
                        "val": first,
                    },
                    {
                        "fy": 2025,
                        "fp": "FY",
                        "form": "10-K",
                        "filed": "2026-01-31",
                        "val": second,
                    },
                ]
            }
        }

    return {
        "cik": 320193,
        "entityName": "Apple Inc.",
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": fact(
                    "USD",
                    1000.0,
                    1100.0,
                ),
                "NetIncomeLoss": fact("USD", 80.0, 90.0),
                "GrossProfit": fact("USD", 300.0, 330.0),
                "OperatingIncomeLoss": fact("USD", 120.0, 150.0),
                "EarningsPerShareDiluted": fact("USD/shares", 5.0, 6.0),
                "WeightedAverageNumberOfDilutedSharesOutstanding": fact(
                    "shares",
                    100.0,
                    100.0,
                ),
                "NetCashProvidedByUsedInOperatingActivities": fact(
                    "USD",
                    200.0,
                    240.0,
                ),
                "PaymentsToAcquirePropertyPlantAndEquipment": fact(
                    "USD",
                    50.0,
                    60.0,
                ),
                "StockholdersEquity": fact("USD", 500.0, 550.0),
                "CashAndCashEquivalentsAtCarryingValue": fact("USD", 90.0, 110.0),
                "LongTermDebtNoncurrent": fact("USD", 400.0, 420.0),
                "InterestExpenseNonOperating": fact("USD", 20.0, 25.0),
                "PaymentsOfDividendsCommonStock": fact("USD", 30.0, 36.0),
            }
        },
    }


def _sec_transport(
    *,
    ticker_payload: Any | None = None,
    companyfacts_payload: Any | None = None,
) -> httpx.MockTransport:
    if ticker_payload is None:
        ticker_payload = {
            "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}
        }
    if companyfacts_payload is None:
        companyfacts_payload = _sec_companyfacts_payload()

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["user-agent"] == "Test Product test@example.com"
        if request.url.host == "www.sec.gov":
            return httpx.Response(200, json=ticker_payload)
        if request.url.path.endswith("/CIK0000320193.json"):
            return httpx.Response(200, json=companyfacts_payload)
        return httpx.Response(404, json={"error": "not found"})

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_fmp_provider_maps_reported_and_computed_fields() -> None:
    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        risk_free_rate=0.04,
        market_premium=0.05,
        transport=_fmp_transport(_fmp_payloads()),
    )

    raw = await provider.get_fundamentals("test")

    expected_wacc = 1500 / 2000 * (0.04 + 1.2 * 0.05) + 500 / 2000 * (
        40 / 500 * (1 - 0.20)
    )
    assert raw.data_source == "fmp"
    assert [point.year for point in raw.revenue] == [2024, 2025]
    assert raw.current_price == 100.0
    assert raw.historical_pe == 15.0
    assert raw.roic[-1].value == 0.12
    assert raw.wacc[-1].value == pytest.approx(expected_wacc)
    assert raw.analyst_growth == pytest.approx((6.4 / 5.0) ** (1 / 2) - 1)
    assert raw.analyst_growth_horizon_years == 2
    assert raw.analyst_forward_eps == 6.4
    assert raw.interest_coverage[-1].value == 8.0
    assert raw.payout_ratio[-1].value == 0.25
    assert raw.fcf[-1].value == 300.0
    assert raw.book_value_per_share[-1].value == 10.0
    assert raw.roe[-1].value == 0.08

    analysis = build_analysis(raw, ValuationAssumptions())
    payload = to_response_payload(analysis)
    provenance = payload["provenance"]

    assert payload["dataSource"] == "fmp"
    assert payload["valueCreating"] is True
    assert provenance["profitability.roic"] == "reported"
    assert provenance["profitability.wacc"] == "computed"
    assert provenance["growthEstimate"] == "estimated"
    assert provenance["debt.interestCoverage"] == "reported"
    assert provenance["growth.fcf"] == "computed"
    assert provenance["growth.bookValuePerShare"] == "reported"
    assert provenance["profitability.roe"] == "computed"
    assert provenance["valueCreating"] == "computed"

    analyst_payload = to_response_payload(
        build_analysis(
            raw,
            ValuationAssumptions(estimated_growth=0.01, growth_source="analyst"),
        )
    )
    assert analyst_payload["assumptions"]["growthSource"] == "analyst"
    assert analyst_payload["assumptions"]["estimatedGrowth"] == pytest.approx(
        raw.analyst_growth
    )
    assert analyst_payload["growthEstimate"]["forwardEPS"] == 6.4


@pytest.mark.asyncio
async def test_sec_provider_maps_companyfacts_and_keeps_market_fields() -> None:
    market = _MarketProvider(_market_raw())
    provider = SecProvider(
        market,
        base_url="https://data.sec.test",
        company_tickers_url="https://www.sec.gov/files/company_tickers.json",
        user_agent="Test Product test@example.com",
        cache_ttl_seconds=0,
        transport=_sec_transport(),
    )

    raw = await provider.get_fundamentals("aapl")
    payload = to_response_payload(build_analysis(raw, ValuationAssumptions()))

    assert market.calls == 1
    assert raw.data_source == "sec"
    assert raw.company_name == "Apple Inc."
    assert raw.current_price == 100.0
    assert raw.current_pe == 20.0
    assert raw.beta == 1.2
    assert [point.year for point in raw.revenue] == [2024, 2025]
    assert raw.revenue[-1].value == 1100.0
    assert raw.eps[-1].value == 6.0
    assert raw.fcf[-1].value == 180.0
    assert raw.book_value_per_share[-1].value == 5.5
    assert raw.interest_coverage[-1].value == pytest.approx(6.0)
    assert raw.dividend[-1].value == pytest.approx(0.36)
    assert raw.payout_ratio[-1].value == pytest.approx(0.06)

    assert payload["dataSource"] == "sec"
    assert payload["provenance"]["source.secCompanyFacts"] == "reported"
    assert payload["provenance"]["growth.revenue"] == "reported"
    assert payload["provenance"]["growth.fcf"] == "computed"
    assert payload["provenance"]["debt.interestCoverage"] == "computed"
    assert payload["provenance"]["profitability.roic"] == "unavailable"
    assert payload["provenance"]["profitability.wacc"] == "unavailable"
    assert payload["series"]["revenue"] == [1000.0, 1100.0]


@pytest.mark.asyncio
async def test_sec_provider_falls_back_to_market_data_for_non_sec_ticker() -> None:
    market = _MarketProvider(_market_raw())
    provider = SecProvider(
        market,
        base_url="https://data.sec.test",
        company_tickers_url="https://www.sec.gov/files/company_tickers.json",
        user_agent="Test Product test@example.com",
        cache_ttl_seconds=0,
        transport=_sec_transport(ticker_payload={}),
    )

    raw = await provider.get_fundamentals("TSLA")

    assert market.calls == 1
    assert raw.ticker == "TSLA"
    assert raw.data_source == "yahoo"


@pytest.mark.asyncio
async def test_fmp_provider_computes_interest_coverage_when_reported_ratio_is_zero() -> None:
    payloads = copy.deepcopy(_fmp_payloads())
    for row in payloads["ratios"]:
        row["interestCoverageRatio"] = 0.0
    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        transport=_fmp_transport(payloads),
    )

    raw = await provider.get_fundamentals("test")
    payload = to_response_payload(build_analysis(raw, ValuationAssumptions()))

    assert raw.interest_coverage[-1].value == pytest.approx(3.5)
    assert payload["debt"]["interestCoverage"] == pytest.approx(3.5)
    assert payload["provenance"]["debt.interestCoverage"] == "computed"


@pytest.mark.asyncio
async def test_fmp_provider_does_not_use_stale_interest_coverage_as_current() -> None:
    payloads = copy.deepcopy(_fmp_payloads())
    payloads["ratios"][0]["interestCoverageRatio"] = 0.0
    payloads["income-statement"][0].pop("interestExpense")
    payloads["income-statement"][0].pop("incomeBeforeTax")
    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        transport=_fmp_transport(payloads),
    )

    raw = await provider.get_fundamentals("test")
    payload = to_response_payload(build_analysis(raw, ValuationAssumptions()))

    assert raw.interest_coverage[-1].year == 2024
    assert payload["debt"]["interestCoverage"] is None
    assert payload["provenance"]["debt.interestCoverage"] == "unavailable"


@pytest.mark.asyncio
async def test_fmp_provider_marks_wacc_unavailable_when_inputs_are_missing() -> None:
    payloads = copy.deepcopy(_fmp_payloads())
    payloads["quote"][0].pop("marketCap")
    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        transport=_fmp_transport(payloads),
    )

    raw = await provider.get_fundamentals("TEST")
    payload = to_response_payload(build_analysis(raw, ValuationAssumptions()))

    assert raw.wacc == []
    assert payload["profitability"]["wacc"]["y1"] is None
    assert payload["valueCreating"] is None
    assert payload["provenance"]["profitability.wacc"] == "unavailable"
    assert payload["provenance"]["valueCreating"] == "unavailable"


@pytest.mark.asyncio
async def test_fmp_provider_fetches_sequentially_and_retries_transient_402() -> None:
    payloads = _fmp_payloads()
    request_order: list[str] = []
    attempts: dict[str, int] = {}
    active_requests = 0
    max_active_requests = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active_requests, max_active_requests
        path = request.url.path.split("/stable/", maxsplit=1)[1]
        request_order.append(path)
        attempts[path] = attempts.get(path, 0) + 1
        active_requests += 1
        max_active_requests = max(max_active_requests, active_requests)
        try:
            await asyncio.sleep(0)
            if active_requests > 1:
                return httpx.Response(402, text="Payment Required")
            if path == "income-statement" and attempts[path] == 1:
                return httpx.Response(402, text="Payment Required")
            return httpx.Response(200, json=payloads[path])
        finally:
            active_requests -= 1

    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        transport=httpx.MockTransport(handler),
    )

    raw = await provider.get_fundamentals("TEST")

    assert raw.current_price == 100.0
    assert max_active_requests == 1
    assert attempts["income-statement"] == 2
    assert request_order == [
        "profile",
        "quote",
        "income-statement",
        "income-statement",
        "balance-sheet-statement",
        "cash-flow-statement",
        "ratios",
        "key-metrics",
        "analyst-estimates",
    ]


@pytest.mark.asyncio
async def test_fmp_provider_uses_cache_on_second_ticker_fetch(tmp_path: Path) -> None:
    payloads = _fmp_payloads()
    request_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        path = request.url.path.split("/stable/", maxsplit=1)[1]
        return httpx.Response(200, json=payloads[path])

    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        cache_ttl_seconds=1800,
        cache_dir=tmp_path,
        transport=httpx.MockTransport(handler),
    )

    first = await provider.get_fundamentals("TEST")
    first_request_count = request_count
    second = await provider.get_fundamentals("TEST")

    assert first_request_count == 8
    assert request_count == first_request_count
    assert second == first


@pytest.mark.asyncio
async def test_fmp_provider_reuses_cached_raw_data_for_slider_assumption_changes(
    tmp_path: Path,
) -> None:
    payloads = _fmp_payloads()
    request_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        path = request.url.path.split("/stable/", maxsplit=1)[1]
        return httpx.Response(200, json=payloads[path])

    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        cache_ttl_seconds=1800,
        cache_dir=tmp_path,
        transport=httpx.MockTransport(handler),
    )

    raw = await provider.get_fundamentals("TEST")
    first_request_count = request_count
    default_payload = to_response_payload(build_analysis(raw, ValuationAssumptions()))

    cached_raw = await provider.get_fundamentals("TEST")
    changed_payload = to_response_payload(
        build_analysis(
            cached_raw,
            ValuationAssumptions(
                required_return=0.12,
                estimated_growth=0.10,
                growth_source="manual",
            ),
        )
    )

    assert request_count == first_request_count
    assert changed_payload["assumptions"] == {
        "requiredReturn": 0.12,
        "estimatedGrowth": 0.1,
        "growthSource": "manual",
    }
    assert changed_payload["valuation"]["estimatedGrowth"] == 0.1
    assert changed_payload["valuation"]["futureEPS"] != default_payload["valuation"]["futureEPS"]


def test_analyze_returns_partial_fmp_analysis_when_optional_fundamentals_rate_limit() -> None:
    payloads = _fmp_payloads()
    attempts: dict[str, int] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.split("/stable/", maxsplit=1)[1]
        attempts[path] = attempts.get(path, 0) + 1
        if path == "cash-flow-statement":
            return httpx.Response(402, text="Payment Required")
        return httpx.Response(200, json=payloads[path])

    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        cache_ttl_seconds=0,
        transport=httpx.MockTransport(handler),
    )
    app.dependency_overrides[get_provider] = lambda: provider
    client = TestClient(app)
    try:
        response = client.get("/api/analyze/TEST")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["ticker"] == "TEST"
    assert payload["companyName"] == "Test Corp"
    assert payload["currentPrice"] == 100.0
    assert payload["dataSource"] == "fmp"
    assert payload["growth"]["fcf"] == {
        "y10": "neg.",
        "y7": "neg.",
        "y5": "neg.",
        "y3": "neg.",
        "y1": "neg.",
    }
    assert "fcf" not in payload["series"]
    assert payload["provenance"]["growth.fcf"] == "unavailable"
    assert payload["provenance"]["growth.operatingCashflow"] == "unavailable"
    assert attempts["cash-flow-statement"] == 4


@pytest.mark.asyncio
async def test_fmp_provider_redacts_api_key_from_provider_errors() -> None:
    secret_key = "test-secret-key"

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["apikey"] == secret_key
        return httpx.Response(500, text=f"upstream failed with apikey={secret_key}")

    provider = FmpProvider(
        api_key=secret_key,
        base_url="https://fmp.test/stable",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(ProviderUnavailable) as exc_info:
        await provider.get_fundamentals("TEST")

    message = str(exc_info.value)
    assert secret_key not in message
    assert "apikey=***" in message


@pytest.mark.asyncio
async def test_fmp_provider_reads_stable_field_names() -> None:
    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        transport=_fmp_transport(_fmp_payloads()),
    )

    raw = await provider.get_fundamentals("TEST")

    assert raw.roic[-1].value == 0.12
    assert raw.interest_coverage[-1].value == 8.0
    assert raw.historical_pe == 15.0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "body", "expected_error"),
    [
        (403, "Legacy Endpoint. Please use stable endpoints.", ProviderUnavailable),
        (401, "Invalid API key", ProviderUnavailable),
        (429, "Too many requests", RateLimited),
    ],
)
async def test_fmp_provider_classifies_upstream_errors(
    status_code: int,
    body: str,
    expected_error: type[Exception],
) -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, text=body)

    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(expected_error):
        await provider.get_fundamentals("TEST")


@pytest.mark.asyncio
async def test_fallback_provider_uses_yahoo_only_for_transient_primary_errors() -> None:
    class PrimaryProvider:
        async def get_fundamentals(self, ticker: str) -> RawFinancials:
            raise RateLimited(f"rate limited for {ticker}")

    class Fallback:
        ticker: str | None = None

        async def get_fundamentals(self, ticker: str) -> RawFinancials:
            self.ticker = ticker
            return RawFinancials(
                ticker=ticker,
                company_name="Fallback Corp",
                currency="USD",
                as_of=datetime.now(UTC),
                current_price=10.0,
                current_pe=12.0,
                historical_pe=11.0,
                beta=1.0,
                data_source="yahoo",
            )

    fallback = Fallback()
    provider = FallbackProvider(PrimaryProvider(), fallback)

    raw = await provider.get_fundamentals("TEST")

    assert raw.data_source == "yahoo"
    assert raw.company_name == "Fallback Corp"
    assert fallback.ticker == "TEST"


@pytest.mark.asyncio
async def test_fallback_provider_does_not_hide_unknown_tickers() -> None:
    class PrimaryProvider:
        async def get_fundamentals(self, ticker: str) -> RawFinancials:
            raise TickerNotFound(ticker)

    class Fallback:
        async def get_fundamentals(self, ticker: str) -> RawFinancials:
            raise AssertionError(f"fallback should not run for {ticker}")

    provider = FallbackProvider(PrimaryProvider(), Fallback())

    with pytest.raises(TickerNotFound):
        await provider.get_fundamentals("NOPE")


@pytest.mark.asyncio
async def test_fmp_provider_treats_empty_arrays_as_ticker_not_found() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    provider = FmpProvider(
        api_key="test-key",
        base_url="https://fmp.test/stable",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(TickerNotFound):
        await provider.get_fundamentals("TEST")


def _statement(rows: dict[str, list[float]]) -> pd.DataFrame:
    columns = [pd.Timestamp("2024-12-31"), pd.Timestamp("2025-12-31")]
    return pd.DataFrame(rows, index=columns).T


@pytest.mark.asyncio
async def test_yahoo_provider_keeps_roic_wacc_and_interest_coverage_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeTicker:
        info = {
            "currentPrice": 100.0,
            "trailingPE": 20.0,
            "longName": "Yahoo Test Corp",
            "currency": "USD",
            "beta": 1.1,
        }
        fast_info = {"last_price": 100.0, "currency": "USD"}
        income_stmt = _statement(
            {
                "Total Revenue": [1000.0, 1100.0],
                "Net Income": [70.0, 80.0],
                "Diluted EPS": [4.0, 5.0],
                "Diluted Average Shares": [100.0, 100.0],
            }
        )
        balance_sheet = _statement(
            {
                "Stockholders Equity": [900.0, 1000.0],
                "Ordinary Shares Number": [100.0, 100.0],
                "Long Term Debt": [400.0, 450.0],
            }
        )
        cash_flow = _statement(
            {
                "Operating Cash Flow": [300.0, 400.0],
                "Capital Expenditure": [50.0, 100.0],
            }
        )
        dividends = pd.Series(dtype=float)

        def history(self, **_: object) -> pd.DataFrame:
            return pd.DataFrame()

    monkeypatch.setitem(sys.modules, "yfinance", SimpleNamespace(Ticker=lambda _: FakeTicker()))

    raw = await YahooProvider().get_fundamentals("YHOO")
    payload = to_response_payload(build_analysis(raw, ValuationAssumptions()))

    assert raw.data_source == "yahoo"
    assert raw.roic == []
    assert raw.wacc == []
    assert raw.interest_coverage == []
    assert raw.fcf[-1].value == 300.0
    assert raw.roe[-1].value == 0.08
    assert payload["valueCreating"] is None
    assert payload["profitability"]["roic"]["y1"] is None
    assert payload["profitability"]["wacc"]["y1"] is None
    assert payload["debt"]["interestCoverage"] is None
    assert payload["provenance"]["profitability.roic"] == "unavailable"
    assert payload["provenance"]["profitability.wacc"] == "unavailable"
    assert payload["provenance"]["debt.interestCoverage"] == "unavailable"
    assert payload["provenance"]["growth.fcf"] == "computed"
    assert payload["provenance"]["profitability.roe"] == "computed"
    assert payload["provenance"]["valueCreating"] == "unavailable"
