from __future__ import annotations

import pytest

from app.valuation import (
    RawFinancials,
    ValuationAssumptions,
    YearPoint,
    avg_last,
    cagr,
    compute_valuation,
    median,
    yoy_growth,
)


def test_median_matches_sheet() -> None:
    assert median([1, 2, 3]) == 2
    assert median([1, 2, 3, 4]) == 2.5


def test_yoy_growth_revenue_matches_reference(alcoa_raw: RawFinancials) -> None:
    assert yoy_growth(alcoa_raw.revenue) == pytest.approx(0.07868852459, abs=1e-8)


def test_cagr_revenue_10yr_matches_reference(alcoa_raw: RawFinancials) -> None:
    assert cagr(alcoa_raw.revenue, 10) == pytest.approx(0.01369691788, abs=1e-8)


def test_cagr_eps_10yr_returns_neg_when_start_is_negative(alcoa_raw: RawFinancials) -> None:
    assert cagr(alcoa_raw.eps, 10) == "neg."


def test_avg_last_matches_reference(alcoa_raw: RawFinancials) -> None:
    assert avg_last(alcoa_raw.revenue, 1) == pytest.approx(12831, abs=1e-6)
    assert avg_last(alcoa_raw.revenue, 2) == pytest.approx((11895 + 12831) / 2, abs=1e-6)


def test_yoy_growth_returns_neg_when_growth_below_minus_one() -> None:
    series = [YearPoint(2024, -1), YearPoint(2025, 1)]
    assert yoy_growth(series) == "neg."


def test_alcoa_valuation_applies_cyclical_guardrails(alcoa_raw: RawFinancials) -> None:
    valuation = compute_valuation(
        alcoa_raw,
        ValuationAssumptions(required_return=0.15, estimated_growth=0.125),
    )

    assert valuation.current_eps == pytest.approx(0.512)
    assert valuation.historical_pe == 18.0
    assert valuation.guardrails.confidence == "medium"
    assert valuation.guardrails.eps_basis == "normalized"
    assert valuation.guardrails.pe_basis == "cyclical_cap"
    assert [warning.code for warning in valuation.guardrails.warnings] == [
        "cyclical_earnings",
        "normalized_eps_used",
        "cyclical_pe_cap",
    ]
    assert round(valuation.future_eps, 4) == 1.6626
    assert round(valuation.future_price, 4) == 29.9273
    assert round(valuation.intrinsic_value or 0, 4) == 7.3976
    assert round(valuation.difference or 0, 4) == -6.3132
    assert [round(step.price, 2) for step in valuation.margin_of_safety] == [
        3.70,
        4.44,
        5.18,
        5.92,
        6.66,
    ]


def test_valuation_accepts_sheet_style_eps_and_exit_multiple_overrides(
    alcoa_raw: RawFinancials,
) -> None:
    valuation = compute_valuation(
        alcoa_raw,
        ValuationAssumptions(
            required_return=0.15,
            estimated_growth=0.12,
            margin_of_safety_target=0.30,
            current_eps_override=10.81,
            exit_multiple=24.0,
        ),
    )

    assert valuation.current_eps == pytest.approx(10.81)
    assert valuation.historical_pe == pytest.approx(24.0)
    assert valuation.guardrails.eps_basis == "manual"
    assert valuation.guardrails.pe_basis == "manual"
    assert round(valuation.future_eps, 4) == 33.5742
    assert round(valuation.future_price, 4) == 805.7813
    assert round(valuation.intrinsic_value or 0, 4) == 199.1768
    assert round(valuation.target_buy_price or 0, 4) == 139.4238
    assert round(valuation.expected_annual_return or 0, 4) == 0.3101
    assert round(valuation.implied_growth or 0, 4) == -0.0169
