from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_portfolio_summary_endpoint_returns_native_exposure_contract() -> None:
    response = client.post(
        "/api/portfolio/summary",
        json={
            "settings": {
                "netLiquidation": 50_000,
                "baseCurrency": "EUR",
                "fxToUsd": 1.14038,
                "moderateUtilization": 1.25,
                "criticalUtilization": 2.0,
            },
            "positions": [
                {"symbol": "AAPL", "assetClass": "stock", "strategy": "direct", "quantity": 25, "price": 214.05},
                {"symbol": "MSCI", "assetClass": "stock", "strategy": "direct", "quantity": 10, "price": 552.79},
                {"symbol": "META", "assetClass": "stock", "strategy": "direct", "quantity": 50, "price": 128.30},
                {"symbol": "GOOGL", "assetClass": "stock", "strategy": "direct", "quantity": 50, "price": 190.00},
                {"symbol": "AAPL", "assetClass": "equity_option", "strategy": "bull_put_spread", "buyingPowerUsed": 1_000},
                {"symbol": "CMG", "assetClass": "equity_option", "strategy": "short_put", "buyingPowerUsed": 4_000},
                {"symbol": "EW", "assetClass": "equity_option", "strategy": "cash_secured_put", "buyingPowerUsed": 7_500},
                {"symbol": "BA", "assetClass": "equity_option", "strategy": "bear_call_spread", "buyingPowerUsed": 2_000},
                {"symbol": "NG", "assetClass": "future_option", "strategy": "bear_call_spread", "buyingPowerUsed": 2_500},
                {"symbol": "SB", "assetClass": "future_option", "strategy": "bull_put_spread", "buyingPowerUsed": 2_240},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["netLiquidationUsd"] == 57_019
    assert payload["moderateBuyingPower"] == 71_273.75
    assert payload["criticalBuyingPower"] == 114_038
    assert payload["usedBuyingPower"] == 39_294.15
    assert payload["remainingModerateBuyingPower"] == 31_979.6
    assert payload["assetAllocation"]["stock"]["amount"] == 26_794.15
    assert payload["assetAllocation"]["equity_option"]["amount"] == 14_500
    assert payload["underlyingExposure"]["AAPL"]["amount"] == 6_351.25


def test_option_calculate_endpoint_returns_native_strategy_metrics() -> None:
    response = client.post(
        "/api/options/calculate",
        json={
            "strategyKind": "cash_secured_put",
            "underlying": "V",
            "openedAt": "2026-05-06",
            "expiry": "2026-06-05",
            "underlyingPrice": 319.19,
            "shortStrike": 310,
            "premium": 4.15,
            "fees": 0.02,
            "contracts": 1,
            "multiplier": 100,
            "buybackTargetPct": 0.20,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dte"] == 30
    assert payload["netPremium"] == 4.13
    assert payload["capitalAtRiskPerShare"] == 305.87
    assert payload["returnOnRisk"] == 0.01350246837
    assert payload["annualizedReturn"] == 0.1642800318
    assert payload["totalPremium"] == 413
    assert payload["totalRisk"] == 30_587
    assert payload["breakeven"] == 305.87
    assert payload["dataQuality"] == "ok"


def test_option_calculate_endpoint_marks_dirty_close_data() -> None:
    response = client.post(
        "/api/options/calculate",
        json={
            "strategyKind": "cash_secured_put",
            "underlying": "FTNT",
            "openedAt": "2026-01-06",
            "expiry": "2026-01-30",
            "underlyingPrice": 79.05,
            "shortStrike": 74,
            "premium": 0.49,
            "fees": 0.02,
            "closedAt": "2025-11-01",
            "actualBuybackPrice": 0.45,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataQuality"] == "placeholder_or_invalid"
    assert payload["realizedAnnualizedReturn"] is None
    assert "closed_at_before_opened_at" in payload["warnings"]
