"""Mapping from normalized provider data to the Analysis API contract."""

from __future__ import annotations

from math import isfinite

from app import schemas
from app.valuation import (
    AvgRow,
    GrowthRow,
    RawFinancials,
    Valuation,
    ValuationGuardrails,
    ValuationAssumptions,
    ValuationWarning,
    YearPoint,
    avg_last,
    avg_row,
    compute_valuation,
    growth_row,
    last_value,
)


def _growth(row: GrowthRow) -> schemas.GrowthRow:
    return schemas.GrowthRow(y10=row.y10, y7=row.y7, y5=row.y5, y3=row.y3, y1=row.y1)


def _avg(row: AvgRow) -> schemas.AvgRow:
    return schemas.AvgRow(y10=row.y10, y7=row.y7, y5=row.y5, y3=row.y3, y1=row.y1)


def _finite_number(value: float, fallback: float = 0.0) -> float:
    return value if isfinite(value) else fallback


def _resolve_assumptions(
    raw: RawFinancials,
    assumptions: ValuationAssumptions,
) -> ValuationAssumptions:
    if assumptions.growth_source == "analyst" and raw.analyst_growth is not None:
        return ValuationAssumptions(
            required_return=assumptions.required_return,
            estimated_growth=raw.analyst_growth,
            growth_source="analyst",
        )
    return assumptions


def _valuation(value: Valuation) -> schemas.Valuation:
    return schemas.Valuation(
        current_eps=value.current_eps,
        estimated_growth=value.estimated_growth,
        historical_pe=value.historical_pe,
        future_eps=value.future_eps,
        future_price=value.future_price,
        intrinsic_value=value.intrinsic_value,
        current_price=value.current_price,
        difference=value.difference,
        margin_of_safety=[
            schemas.MarginOfSafetyStep(
                discount=step.discount,
                price=_finite_number(step.price),
            )
            for step in value.margin_of_safety
        ],
        guardrails=_guardrails(value.guardrails),
    )


def _warning(value: ValuationWarning) -> schemas.ValuationWarning:
    return schemas.ValuationWarning(
        code=value.code,
        severity=value.severity,
        title=value.title,
        detail=value.detail,
    )


def _guardrails(value: ValuationGuardrails) -> schemas.ValuationGuardrails:
    return schemas.ValuationGuardrails(
        confidence=value.confidence,
        is_cyclical=value.is_cyclical,
        eps_basis=value.eps_basis,
        pe_basis=value.pe_basis,
        normalized_eps=value.normalized_eps,
        normalized_fcf_per_share=value.normalized_fcf_per_share,
        raw_historical_pe=value.raw_historical_pe,
        effective_pe=value.effective_pe,
        warnings=[_warning(warning) for warning in value.warnings],
    )


def _series_values_for_years(
    series: list[YearPoint],
    years: list[int],
) -> list[float] | None:
    by_year = {point.year: point.value for point in series}
    if not years or any(year not in by_year for year in years):
        return None
    return [by_year[year] for year in years]


def _latest_year(series_collection: list[list[YearPoint]]) -> int | None:
    latest: int | None = None
    for series in series_collection:
        if series:
            year = series[-1].year
            latest = year if latest is None else max(latest, year)
    return latest


def _latest_value_for_year(series: list[YearPoint], year: int | None) -> float | None:
    if year is None or not series:
        return None
    latest = series[-1]
    return latest.value if latest.year == year else None


def _ratio_series(
    numerator: list[YearPoint],
    denominator: list[YearPoint],
) -> list[YearPoint]:
    denominator_by_year = {point.year: point.value for point in denominator}
    values: list[YearPoint] = []
    for point in numerator:
        denom = denominator_by_year.get(point.year)
        if denom not in (None, 0):
            values.append(YearPoint(year=point.year, value=point.value / denom))
    return values


def _subtract_series(
    left: list[YearPoint],
    right: list[YearPoint],
) -> list[YearPoint]:
    right_by_year = {point.year: point.value for point in right}
    values: list[YearPoint] = []
    for point in left:
        other = right_by_year.get(point.year)
        if other is not None:
            values.append(YearPoint(year=point.year, value=point.value - other))
    return values


def _series(raw: RawFinancials) -> schemas.Series | None:
    candidates = [
        raw.revenue,
        raw.eps,
        raw.fcf,
        raw.net_income,
        raw.total_debt,
        raw.cash_and_investments,
    ]
    base = max(candidates, key=len, default=[])
    if not base:
        return None

    years = [point.year for point in base]
    return schemas.Series(
        years=years,
        revenue=_series_values_for_years(raw.revenue, years),
        eps=_series_values_for_years(raw.eps, years),
        fcf=_series_values_for_years(raw.fcf, years),
        book_value_per_share=_series_values_for_years(raw.book_value_per_share, years),
        shares_outstanding=_series_values_for_years(raw.shares_outstanding, years),
        operating_cashflow=_series_values_for_years(raw.operating_cashflow, years),
        net_income=_series_values_for_years(raw.net_income, years),
        gross_profit=_series_values_for_years(raw.gross_profit, years),
        operating_income=_series_values_for_years(raw.operating_income, years),
        capital_expenditure=_series_values_for_years(raw.capital_expenditure, years),
        roic=_series_values_for_years(raw.roic, years),
        wacc=_series_values_for_years(raw.wacc, years),
        interest_coverage=_series_values_for_years(raw.interest_coverage, years),
        total_debt=_series_values_for_years(raw.total_debt, years),
        cash_and_investments=_series_values_for_years(raw.cash_and_investments, years),
        total_equity=_series_values_for_years(raw.total_equity, years),
    )


def _provenance(
    raw: RawFinancials,
    *,
    debt_to_fcf: float | None,
    dividend_yield: float | None,
    value_creating: bool | None,
    debt_to_equity: float | None,
    cash_per_share: float | None,
    interest_coverage: float | None,
) -> dict[str, schemas.ProvenanceValue] | None:
    if raw.data_source is None and not raw.provenance:
        return None

    provenance: dict[str, schemas.ProvenanceValue] = dict(raw.provenance)
    if raw.data_source is not None:
        provenance.setdefault(
            "debt.debtToFcf",
            "computed" if debt_to_fcf is not None else "unavailable",
        )
        provenance.setdefault(
            "dividend.yield",
            "computed" if dividend_yield is not None else "unavailable",
        )
        provenance.setdefault(
            "valueCreating",
            "computed" if value_creating is not None else "unavailable",
        )
        provenance.setdefault(
            "balance.debtToEquity",
            "computed" if debt_to_equity is not None else "unavailable",
        )
        provenance.setdefault(
            "balance.cashPerShare",
            "computed" if cash_per_share is not None else "unavailable",
        )
        if interest_coverage is None:
            provenance["debt.interestCoverage"] = "unavailable"
        else:
            provenance.setdefault("debt.interestCoverage", "computed")
        provenance.setdefault("assumptions.estimatedGrowth", "estimated")

    return provenance or None


def _growth_estimate(
    raw: RawFinancials,
    assumptions: ValuationAssumptions,
) -> schemas.GrowthEstimate:
    if raw.analyst_growth is not None:
        horizon = raw.analyst_growth_horizon_years
        detail = (
            f"Aus FMP-Analysten-EPS über {horizon} Jahr(e) abgeleitet."
            if horizon
            else "Aus FMP-Analysten-EPS abgeleitet."
        )
        return schemas.GrowthEstimate(
            source="analyst",
            estimated_growth=raw.analyst_growth,
            horizon_years=raw.analyst_growth_horizon_years,
            forward_eps=raw.analyst_forward_eps,
            detail=detail,
        )

    return schemas.GrowthEstimate(
        source=assumptions.growth_source,
        estimated_growth=assumptions.estimated_growth,
        horizon_years=None,
        forward_eps=None,
        detail="Keine belastbare Analysten-EPS-Schätzung verfügbar; Annahme bleibt editierbar.",
    )


def _clamp_score(score: int) -> int:
    return max(0, min(100, score))


def _decision(
    *,
    raw: RawFinancials,
    valuation: Valuation,
    debt_to_fcf: float | None,
    interest_coverage: float | None,
    value_creating: bool | None,
) -> schemas.Decision:
    difference = valuation.difference
    score = 50
    reasons: list[str] = []

    if difference is None:
        valuation_signal: schemas.DecisionSignal = "unknown"
        score -= 20
        reasons.append("Innerer Wert ist nicht belastbar berechenbar.")
    elif difference >= 0.30:
        valuation_signal = "strong"
        score += 25
        reasons.append("Hohe Sicherheitsmarge zum berechneten inneren Wert.")
    elif difference >= 0.10:
        valuation_signal = "ok"
        score += 14
        reasons.append("Moderate Unterbewertung gegenüber dem inneren Wert.")
    elif difference >= -0.10:
        valuation_signal = "ok"
        reasons.append("Bewertung liegt grob im fairen Bereich.")
    else:
        valuation_signal = "weak"
        score -= 20
        reasons.append("Aktueller Kurs liegt klar über dem berechneten inneren Wert.")

    if value_creating is True:
        quality_signal: schemas.DecisionSignal = "strong"
        score += 16
        reasons.append("ROIC liegt über WACC, das Geschäft schafft Wert.")
    elif value_creating is False:
        quality_signal = "weak"
        score -= 16
        reasons.append("ROIC liegt nicht über WACC, Qualität ist kritisch.")
    else:
        quality_signal = "unknown"
        score -= 8
        reasons.append("ROIC/WACC fehlen, Qualitätsurteil bleibt eingeschränkt.")

    if debt_to_fcf is None and interest_coverage is None:
        debt_signal: schemas.DecisionSignal = "unknown"
        score -= 6
        reasons.append("Schuldentragfähigkeit ist nicht vollständig belegt.")
    elif (
        (debt_to_fcf is not None and debt_to_fcf <= 3)
        and (interest_coverage is None or interest_coverage >= 5)
    ):
        debt_signal = "strong"
        score += 10
        reasons.append("Schulden wirken im Verhältnis zum Free Cashflow tragbar.")
    elif (
        (debt_to_fcf is not None and debt_to_fcf > 6)
        or (interest_coverage is not None and interest_coverage < 3)
    ):
        debt_signal = "weak"
        score -= 14
        reasons.append("Schulden oder Zinsdeckung verlangen erhöhte Vorsicht.")
    else:
        debt_signal = "ok"
        reasons.append("Schuldenlage ist weder klarer Vorteil noch klarer Ausschluss.")

    if raw.data_source == "fmp" and valuation.guardrails.confidence != "low":
        data_signal: schemas.DecisionSignal = "strong"
        score += 8
    elif valuation.guardrails.confidence == "low":
        data_signal = "weak"
        score -= 14
        reasons.append("Daten- und Bewertungsvertrauen ist niedrig.")
    else:
        data_signal = "ok"
        score -= 4
        reasons.append("Yahoo-Fallback liefert weniger belastbare Detaildaten als FMP.")

    if valuation.guardrails.is_cyclical:
        score -= 8
        reasons.append("Zyklische Gewinne reduzieren die Aussagekraft der Multiple-Bewertung.")

    final_score = _clamp_score(score)
    if valuation.guardrails.confidence == "low" or valuation_signal == "unknown":
        rating: schemas.DecisionRating = "incomplete"
        label = "Nur Watchlist"
        summary = "Erst Datenlage oder Bewertungsbasis verbessern, bevor daraus eine These wird."
    elif final_score >= 75:
        rating = "prime"
        label = "Prüfenswert"
        summary = "Bewertung, Qualität und Bilanz sprechen zusammen für eine nähere Analyse."
    elif final_score >= 55:
        rating = "watch"
        label = "Beobachten"
        summary = "Interessant, aber noch nicht sauber genug für eine starke These."
    elif final_score >= 35:
        rating = "neutral"
        label = "Neutral"
        summary = "Chance und Risiko halten sich aktuell ungefähr die Waage."
    else:
        rating = "avoid"
        label = "Meiden"
        summary = "Die Kombination aus Bewertung, Qualität oder Bilanz ist aktuell unattraktiv."

    return schemas.Decision(
        rating=rating,
        label=label,
        score=final_score,
        summary=summary,
        valuation_signal=valuation_signal,
        quality_signal=quality_signal,
        debt_signal=debt_signal,
        data_signal=data_signal,
        reasons=reasons[:5],
    )


def build_analysis(
    raw: RawFinancials,
    assumptions: ValuationAssumptions,
) -> schemas.Analysis:
    """Build the public Analysis response from provider-normalized financials."""

    resolved_assumptions = _resolve_assumptions(raw, assumptions)
    total_debt_series = raw.total_debt or raw.long_term_debt
    total_debt_last = last_value(total_debt_series)
    cash_last = last_value(raw.cash_and_investments)
    equity_last = last_value(raw.total_equity)
    shares_last = last_value(raw.shares_outstanding)
    net_debt = _subtract_series(total_debt_series, raw.cash_and_investments)
    debt_to_equity = (
        total_debt_last / equity_last
        if total_debt_last is not None and equity_last not in (None, 0)
        else None
    )
    cash_per_share = (
        cash_last / shares_last
        if cash_last is not None and shares_last not in (None, 0)
        else None
    )
    fcf_avg2 = avg_last(raw.fcf, 2)
    debt_to_fcf = (
        total_debt_last / fcf_avg2
        if total_debt_last is not None and fcf_avg2 not in (None, 0)
        else None
    )

    dividend_last = last_value(raw.dividend)
    dividend_yield = (
        dividend_last / raw.current_price
        if dividend_last is not None and raw.current_price != 0
        else None
    )

    roic_last = last_value(raw.roic)
    wacc_last = last_value(raw.wacc)
    value_creating = (
        roic_last > wacc_last
        if roic_last is not None and wacc_last is not None
        else None
    )
    latest_financial_year = _latest_year(
        [raw.revenue, raw.eps, raw.net_income, raw.fcf, total_debt_series],
    )
    latest_interest_coverage = _latest_value_for_year(
        raw.interest_coverage,
        latest_financial_year,
    )

    valuation = compute_valuation(raw, resolved_assumptions)

    return schemas.Analysis(
        ticker=raw.ticker,
        company_name=raw.company_name,
        currency=raw.currency,
        as_of=raw.as_of,
        current_price=raw.current_price,
        current_pe=raw.current_pe,
        historical_pe=raw.historical_pe,
        beta=raw.beta,
        growth=schemas.Growth(
            revenue=_growth(growth_row(raw.revenue)),
            eps=_growth(growth_row(raw.eps)),
            fcf=_growth(growth_row(raw.fcf)),
            book_value_per_share=_growth(growth_row(raw.book_value_per_share)),
            shares_outstanding=_growth(growth_row(raw.shares_outstanding)),
            operating_cashflow=_growth(growth_row(raw.operating_cashflow)),
        ),
        profitability=schemas.Profitability(
            net_income=_avg(avg_row(raw.net_income)),
            roic=_avg(avg_row(raw.roic)),
            roe=_avg(avg_row(raw.roe)),
            wacc=_avg(avg_row(raw.wacc)),
        ),
        margins=schemas.Margins(
            gross_margin=_avg(avg_row(_ratio_series(raw.gross_profit, raw.revenue))),
            operating_margin=_avg(avg_row(_ratio_series(raw.operating_income, raw.revenue))),
            net_margin=_avg(avg_row(_ratio_series(raw.net_income, raw.revenue))),
            fcf_margin=_avg(avg_row(_ratio_series(raw.fcf, raw.revenue))),
        ),
        value_creating=value_creating,
        debt=schemas.Debt(
            long_term_debt=_avg(avg_row(raw.long_term_debt)),
            debt_to_fcf=debt_to_fcf,
            interest_coverage=latest_interest_coverage,
        ),
        balance=schemas.Balance(
            total_debt=_avg(avg_row(total_debt_series)),
            cash_and_investments=_avg(avg_row(raw.cash_and_investments)),
            net_debt=_avg(avg_row(net_debt)),
            total_equity=_avg(avg_row(raw.total_equity)),
            debt_to_equity=debt_to_equity,
            cash_per_share=cash_per_share,
        ),
        dividend=schemas.Dividend(
            dividend=_avg(avg_row(raw.dividend)),
            yield_=dividend_yield,
            payout_ratio=_avg(avg_row(raw.payout_ratio)),
        ),
        series=_series(raw),
        assumptions=schemas.Assumptions(
            required_return=resolved_assumptions.required_return,
            estimated_growth=resolved_assumptions.estimated_growth,
            growth_source=resolved_assumptions.growth_source,
        ),
        growth_estimate=_growth_estimate(raw, resolved_assumptions),
        valuation=_valuation(valuation),
        decision=_decision(
            raw=raw,
            valuation=valuation,
            debt_to_fcf=debt_to_fcf,
            interest_coverage=latest_interest_coverage,
            value_creating=value_creating,
        ),
        data_source=raw.data_source,
        provenance=_provenance(
            raw,
            debt_to_fcf=debt_to_fcf,
            dividend_yield=dividend_yield,
            value_creating=value_creating,
            debt_to_equity=debt_to_equity,
            cash_per_share=cash_per_share,
            interest_coverage=latest_interest_coverage,
        ),
    )


def to_response_payload(analysis: schemas.Analysis) -> dict[str, object]:
    """Dump the response while omitting absent optional chart series only."""

    payload = analysis.model_dump(by_alias=True, mode="json")
    if payload.get("cached") is None:
        payload.pop("cached", None)
    if payload.get("dataSource") is None:
        payload.pop("dataSource", None)
    if not payload.get("provenance"):
        payload.pop("provenance", None)
    series = payload.get("series")
    if isinstance(series, dict):
        payload["series"] = {key: value for key, value in series.items() if value is not None}
    return payload
