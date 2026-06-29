from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app, get_screener_service
from app.screener.schemas import MarketRegime, MomentumMetrics, ScreenerResponse, ScreenerRow, TradeSetup


class StubScreenerService:
    async def run_sp500(
        self,
        *,
        limit: int,
        symbols: list[str] | None,
        portfolio_value: float,
        base_risk_pct: float,
        sort: str,
    ) -> ScreenerResponse:
        return ScreenerResponse(
            as_of=datetime(2026, 6, 28, 12, 0, tzinfo=UTC),
            universe="custom" if symbols else "sp500",
            count=1,
            market_regime=MarketRegime(
                vix=18.0,
                gate="normal",
                allow_new_entries=True,
                size_multiplier=1.0,
                notes=["VIX < 20: normale Positionsgröße erlaubt."],
            ),
            rows=[
                ScreenerRow(
                    ticker="AAPL",
                    company_name="Apple Inc.",
                    sector="Information Technology",
                    current_price=100.0,
                    data_source="fmp",
                    cached=False,
                    intrinsic_value=130.0,
                    margin_of_safety=0.3,
                    decision_score=80,
                    decision_rating="prime",
                    quality_spread=0.1,
                    debt_to_fcf=1.2,
                    data_signal="strong",
                    momentum=MomentumMetrics(momentum_score=75.0),
                    composite_score=79.5,
                    trade_setup=TradeSetup(
                        ticker="AAPL",
                        direction="long",
                        entry=100.0,
                        stop=96.0,
                        target=108.0,
                        shares=12,
                        dollar_risk=48.0,
                        portfolio_pct=0.048,
                        risk_reward=2.0,
                        catalysts=[],
                        warnings=[],
                    ),
                    warnings=[],
                )
            ],
            errors=[],
        )


def test_screener_endpoint_returns_contract_payload() -> None:
    app.dependency_overrides[get_screener_service] = lambda: StubScreenerService()
    client = TestClient(app)
    try:
        response = client.get("/api/screener/sp500", params={"limit": "5", "symbols": "AAPL, MSFT"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["universe"] == "custom"
    assert payload["marketRegime"]["gate"] == "normal"
    assert payload["rows"][0]["ticker"] == "AAPL"
    assert payload["rows"][0]["momentum"]["momentumScore"] == 75.0
    assert payload["rows"][0]["tradeSetup"]["shares"] == 12
