from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.cache import RawFinancialsCache
from app.main import app, get_provider, get_raw_cache
from app.providers import ProviderUnavailable, RateLimited, TickerNotFound
from app.schemas import Analysis
from app.valuation import RawFinancials


class StubProvider:
    def __init__(self, raw: RawFinancials | None = None, exc: Exception | None = None) -> None:
        self.raw = raw
        self.exc = exc

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        if self.exc is not None:
            raise self.exc
        if self.raw is None:
            raise AssertionError("StubProvider requires raw data or an exception")
        return self.raw


def _client(provider: StubProvider) -> TestClient:
    cache = RawFinancialsCache(ttl_seconds=0)
    app.dependency_overrides[get_provider] = lambda: provider
    app.dependency_overrides[get_raw_cache] = lambda: cache
    return TestClient(app)


def _cleanup_overrides() -> None:
    app.dependency_overrides.clear()


def _assert_same_keys(actual: Any, expected: Any) -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict)
        assert set(actual.keys()) == set(expected.keys())
        for key, expected_value in expected.items():
            _assert_same_keys(actual[key], expected_value)
    elif isinstance(expected, list) and expected and actual:
        _assert_same_keys(actual[0], expected[0])


def test_analyze_returns_contract_shape(alcoa_raw: RawFinancials) -> None:
    client = _client(StubProvider(raw=alcoa_raw))
    try:
        response = client.get("/api/analyze/aa")
    finally:
        _cleanup_overrides()

    assert response.status_code == 200
    payload = response.json()
    Analysis.model_validate(payload)
    assert payload["cached"] is False

    mock_path = Path(__file__).parents[2] / "frontend" / "src" / "mocks" / "alcoa.json"
    expected = json.loads(mock_path.read_text())
    _assert_same_keys(payload, expected)


def test_health_returns_ok() -> None:
    client = TestClient(app)
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_recomputes_valuation_from_query_assumptions(alcoa_raw: RawFinancials) -> None:
    client = _client(StubProvider(raw=alcoa_raw))
    try:
        response = client.get(
            "/api/analyze/AA",
            params={"requiredReturn": "0.12", "estimatedGrowth": "0.10"},
        )
    finally:
        _cleanup_overrides()

    assert response.status_code == 200
    payload = response.json()
    assert payload["assumptions"] == {
        "requiredReturn": 0.12,
        "estimatedGrowth": 0.1,
        "growthSource": "analyst",
    }
    assert payload["valuation"]["estimatedGrowth"] == 0.1
    assert round(payload["valuation"]["futureEPS"], 4) == 1.328


def test_analyze_preserves_growth_source_query(alcoa_raw: RawFinancials) -> None:
    client = _client(StubProvider(raw=alcoa_raw))
    try:
        response = client.get(
            "/api/analyze/AA",
            params={"growthSource": "manual"},
        )
    finally:
        _cleanup_overrides()

    assert response.status_code == 200
    assert response.json()["assumptions"]["growthSource"] == "manual"


def test_ticker_not_found_error_shape() -> None:
    client = _client(StubProvider(exc=TickerNotFound("NOPE")))
    try:
        response = client.get("/api/analyze/NOPE")
    finally:
        _cleanup_overrides()

    assert response.status_code == 404
    assert response.json() == {"error": "ticker_not_found", "ticker": "NOPE"}


def test_provider_unavailable_error_shape() -> None:
    client = _client(StubProvider(exc=ProviderUnavailable("down")))
    try:
        response = client.get("/api/analyze/AAPL")
    finally:
        _cleanup_overrides()

    assert response.status_code == 502
    assert response.json() == {"error": "provider_unavailable"}


def test_rate_limited_error_shape() -> None:
    client = _client(StubProvider(exc=RateLimited("slow down")))
    try:
        response = client.get("/api/analyze/AAPL")
    finally:
        _cleanup_overrides()

    assert response.status_code == 429
    assert response.json() == {
        "error": "rate_limited",
        "message": "FMP-Rate-Limit erreicht, bitte später erneut versuchen oder FMP-Plan upgraden.",
    }


class CountingProvider:
    def __init__(self, raw: RawFinancials, delay_seconds: float = 0.0) -> None:
        self.raw = raw
        self.delay_seconds = delay_seconds
        self.calls = 0

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        self.calls += 1
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)
        return self.raw


def _cached_client(provider: CountingProvider) -> tuple[TestClient, RawFinancialsCache]:
    cache = RawFinancialsCache(ttl_seconds=1800)
    app.dependency_overrides[get_provider] = lambda: provider
    app.dependency_overrides[get_raw_cache] = lambda: cache
    return TestClient(app), cache


def test_analyze_reuses_cached_raw_data_on_second_request(alcoa_raw: RawFinancials) -> None:
    provider = CountingProvider(alcoa_raw)
    client, _ = _cached_client(provider)
    try:
        first = client.get("/api/analyze/AA")
        second = client.get("/api/analyze/AA")
    finally:
        _cleanup_overrides()

    assert first.status_code == 200
    assert second.status_code == 200
    assert provider.calls == 1
    assert first.json()["cached"] is False
    assert second.json()["cached"] is True


def test_analyze_recomputes_slider_assumptions_from_cached_raw_data(
    alcoa_raw: RawFinancials,
) -> None:
    provider = CountingProvider(alcoa_raw)
    client, _ = _cached_client(provider)
    try:
        first = client.get("/api/analyze/AA")
        second = client.get(
            "/api/analyze/AA",
            params={"requiredReturn": "0.12", "estimatedGrowth": "0.10"},
        )
    finally:
        _cleanup_overrides()

    first_payload = first.json()
    second_payload = second.json()

    assert provider.calls == 1
    assert second_payload["cached"] is True
    assert second_payload["assumptions"] == {
        "requiredReturn": 0.12,
        "estimatedGrowth": 0.1,
        "growthSource": "analyst",
    }
    assert second_payload["valuation"]["futureEPS"] != first_payload["valuation"]["futureEPS"]


@pytest.mark.asyncio
async def test_analyze_single_flight_collapses_concurrent_same_ticker_fetches(
    alcoa_raw: RawFinancials,
) -> None:
    provider = CountingProvider(alcoa_raw, delay_seconds=0.05)
    cache = RawFinancialsCache(ttl_seconds=1800)
    app.dependency_overrides[get_provider] = lambda: provider
    app.dependency_overrides[get_raw_cache] = lambda: cache

    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            first, second = await asyncio.gather(
                client.get("/api/analyze/AA"),
                client.get("/api/analyze/AA"),
            )
    finally:
        _cleanup_overrides()

    assert first.status_code == 200
    assert second.status_code == 200
    assert provider.calls == 1
    assert sorted([first.json()["cached"], second.json()["cached"]]) == [False, True]
