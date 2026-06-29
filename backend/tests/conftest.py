from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.valuation import RawFinancials, YearPoint


@pytest.fixture
def alcoa_raw() -> RawFinancials:
    eps = [
        YearPoint(2015, -4.731),
        YearPoint(2016, -2.19),
        YearPoint(2017, 1.49),
        YearPoint(2018, 1.33),
        YearPoint(2019, -6.07),
        YearPoint(2020, -0.91),
        YearPoint(2021, 2.26),
        YearPoint(2022, -0.68),
        YearPoint(2023, -3.65),
        YearPoint(2024, 0.26),
        YearPoint(2025, 4.37),
    ]
    revenue = [
        YearPoint(2015 + i, value)
        for i, value in enumerate(
            [11199, 9318, 11652, 13403, 10433, 9286, 12152, 12451, 10551, 11895, 12831]
        )
    ]
    fcf = [
        YearPoint(2015 + i, value)
        for i, value in enumerate([484, -715, 819, 49, 307, 41, 530, 342, -440, 42, 567])
    ]
    net_income = [
        YearPoint(2015 + i, value)
        for i, value in enumerate([-863, -400, 279, 250, -1125, -170, 429, -123, -651, 60, 1157])
    ]
    return RawFinancials(
        ticker="AA",
        company_name="Alcoa Corp",
        currency="USD",
        as_of=datetime(2026, 6, 28, 16, 0, tzinfo=UTC),
        current_price=54.1,
        current_pe=12.38,
        historical_pe=26.36,
        beta=1.56,
        revenue=revenue,
        eps=eps,
        fcf=fcf,
        net_income=net_income,
    )
