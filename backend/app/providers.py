"""Financial data providers for FMP, SEC EDGAR, and Yahoo Finance."""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol, Sequence

import httpx

from app.valuation import ProvenanceValue, RawFinancials, YearPoint, median

_API_KEY_PARAM_RE = re.compile(r"(?i)(apikey=)[^&\s\"'<>)]*")
_FMP_RATE_LIMIT_STATUS_CODES = {402, 429}
_FMP_RATE_LIMIT_BACKOFF_SECONDS = (0.25, 0.75)
_FMP_CACHE_VERSION = 4
_FMP_DEFAULT_CACHE_TTL_SECONDS = 1800.0
_FMP_DEFAULT_REQUEST_DELAY_MS = 100.0
_FMP_DEFAULT_TIMEOUT_SECONDS = 12.0
_SEC_COMPANY_TICKERS_CACHE_VERSION = 1
_SEC_DEFAULT_COMPANY_TICKERS_TTL_SECONDS = 604800.0
_SEC_DEFAULT_TIMEOUT_SECONDS = 12.0
_SEC_ANNUAL_FORMS = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"}
_SEC_DEFAULT_USER_AGENT = "Fundamental-Analyst/1.0 contact@example.com"
_FMP_SERIES_FIELDS = (
    "revenue",
    "eps",
    "fcf",
    "book_value_per_share",
    "shares_outstanding",
    "operating_cashflow",
    "net_income",
    "gross_profit",
    "operating_income",
    "capital_expenditure",
    "roic",
    "roe",
    "wacc",
    "long_term_debt",
    "total_debt",
    "cash_and_investments",
    "total_equity",
    "interest_coverage",
    "dividend",
    "payout_ratio",
)
_LOCAL_ENV_LOADED = False


class ProviderError(Exception):
    """Base class for provider failures."""


class TickerNotFound(ProviderError):
    """Raised when a provider cannot find the requested ticker."""

    def __init__(self, ticker: str) -> None:
        self.ticker = ticker
        super().__init__(f"Ticker not found: {ticker}")


class ProviderUnavailable(ProviderError):
    """Raised for transient upstream provider failures."""


class RateLimited(ProviderError):
    """Raised when an upstream provider returns a rate-limit signal."""


class MissingApiKey(ProviderUnavailable):
    """Raised when FMP is selected without FMP_API_KEY."""


class FinancialDataProvider(Protocol):
    """Provider contract used by the FastAPI route."""

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        """Fetch and normalize annual financial data for a ticker."""


def _clean_ticker(ticker: str) -> str:
    return ticker.strip().upper()


def _is_rate_limited(exc: BaseException) -> bool:
    message = str(exc).lower()
    return "429" in message or "rate limit" in message or "too many requests" in message


def _finite_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _normalize_label(value: Any) -> str:
    return "".join(char.lower() for char in str(value) if char.isalnum())


def _column_year(column: Any) -> int | None:
    year = getattr(column, "year", None)
    if isinstance(year, int):
        return year
    match = re.search(r"(19|20)\d{2}", str(column))
    return int(match.group(0)) if match else None


def _year_points(values: dict[int, float]) -> list[YearPoint]:
    return [YearPoint(year=year, value=value) for year, value in sorted(values.items())]


def _series_map(series: list[YearPoint]) -> dict[int, float]:
    return {point.year: point.value for point in series}


def _divide_series(
    numerator: list[YearPoint],
    denominator: list[YearPoint],
) -> list[YearPoint]:
    denominator_by_year = _series_map(denominator)
    values: dict[int, float] = {}
    for point in numerator:
        denom = denominator_by_year.get(point.year)
        if denom not in (None, 0):
            values[point.year] = point.value / denom
    return _year_points(values)


def _combine_series(
    left: list[YearPoint],
    right: list[YearPoint],
    *,
    subtract_right: bool = False,
) -> list[YearPoint]:
    right_by_year = _series_map(right)
    values: dict[int, float] = {}
    for point in left:
        other = right_by_year.get(point.year)
        if other is not None:
            values[point.year] = point.value - other if subtract_right else point.value + other
    return _year_points(values)


def _free_cash_flow_series(
    operating_cashflow: list[YearPoint],
    capital_expenditure: list[YearPoint],
) -> list[YearPoint]:
    capex_by_year = _series_map(capital_expenditure)
    values: dict[int, float] = {}
    for point in operating_cashflow:
        capex = capex_by_year.get(point.year)
        if capex is None:
            continue
        values[point.year] = point.value + capex if capex < 0 else point.value - capex
    return _year_points(values)


def _safe_get(mapping: Any, keys: Sequence[str]) -> Any:
    for key in keys:
        try:
            if isinstance(mapping, dict) and key in mapping:
                return mapping[key]
            if hasattr(mapping, "get"):
                value = mapping.get(key)
                if value is not None:
                    return value
        except Exception:
            continue
    return None


def _first_record(data: Any) -> dict[str, Any] | None:
    if not isinstance(data, list) or not data:
        return None
    first = data[0]
    return first if isinstance(first, dict) else None


def _env_float(name: str, default: float) -> float:
    value = _finite_float(os.getenv(name))
    return default if value is None else value


def _load_local_env() -> None:
    """Load backend/.env for local runs without overriding real environment vars."""

    global _LOCAL_ENV_LOADED
    if _LOCAL_ENV_LOADED:
        return
    _LOCAL_ENV_LOADED = True

    env_path = Path(__file__).resolve().parents[1] / ".env"
    try:
        lines = env_path.read_text().splitlines()
    except OSError:
        return

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        cleaned_value = value.strip().strip("'\"")
        os.environ[key] = cleaned_value


def _default_fmp_cache_dir() -> Path:
    return Path(__file__).resolve().parents[1] / ".cache" / "fmp"


def _default_sec_cache_dir() -> Path:
    return Path(__file__).resolve().parents[1] / ".cache" / "sec"


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _series_to_cache(series: list[YearPoint]) -> list[dict[str, float | int]]:
    return [{"year": point.year, "value": point.value} for point in series]


def _series_from_cache(data: Any) -> list[YearPoint]:
    if not isinstance(data, list):
        return []

    values: list[YearPoint] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            year = int(item.get("year"))
        except (TypeError, ValueError):
            continue
        numeric = _finite_float(item.get("value"))
        if numeric is not None:
            values.append(YearPoint(year=year, value=numeric))
    return sorted(values, key=lambda point: point.year)


def _raw_to_cache_payload(raw: RawFinancials) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ticker": raw.ticker,
        "company_name": raw.company_name,
        "currency": raw.currency,
        "as_of": raw.as_of.isoformat(),
        "current_price": raw.current_price,
        "current_pe": raw.current_pe,
        "historical_pe": raw.historical_pe,
        "beta": raw.beta,
        "analyst_growth": raw.analyst_growth,
        "analyst_growth_horizon_years": raw.analyst_growth_horizon_years,
        "analyst_forward_eps": raw.analyst_forward_eps,
        "data_source": raw.data_source,
        "provenance": dict(raw.provenance),
    }
    for field_name in _FMP_SERIES_FIELDS:
        payload[field_name] = _series_to_cache(getattr(raw, field_name))
    return payload


def _raw_from_cache_payload(payload: Any) -> RawFinancials | None:
    if not isinstance(payload, dict):
        return None

    as_of = _parse_datetime(payload.get("as_of"))
    current_price = _finite_float(payload.get("current_price"))
    current_pe = _finite_float(payload.get("current_pe"))
    historical_pe = _finite_float(payload.get("historical_pe"))
    beta = _finite_float(payload.get("beta"))
    if None in (as_of, current_price, current_pe, historical_pe, beta):
        return None

    raw_kwargs: dict[str, Any] = {
        "ticker": str(payload.get("ticker") or ""),
        "company_name": str(payload.get("company_name") or ""),
        "currency": str(payload.get("currency") or "USD"),
        "as_of": as_of,
        "current_price": current_price,
        "current_pe": current_pe,
        "historical_pe": historical_pe,
        "beta": beta,
        "analyst_growth": _finite_float(payload.get("analyst_growth")),
        "analyst_growth_horizon_years": (
            int(payload["analyst_growth_horizon_years"])
            if isinstance(payload.get("analyst_growth_horizon_years"), int)
            else None
        ),
        "analyst_forward_eps": _finite_float(payload.get("analyst_forward_eps")),
        "data_source": payload.get("data_source"),
        "provenance": payload.get("provenance") if isinstance(payload.get("provenance"), dict) else {},
    }
    if not raw_kwargs["ticker"] or not raw_kwargs["company_name"]:
        return None

    for field_name in _FMP_SERIES_FIELDS:
        raw_kwargs[field_name] = _series_from_cache(payload.get(field_name))

    return RawFinancials(**raw_kwargs)


class FmpRawCache:
    """Small JSON cache for normalized FMP fundamentals."""

    def __init__(self, ttl_seconds: float, cache_dir: Path) -> None:
        self.ttl_seconds = max(0.0, ttl_seconds)
        self.cache_dir = cache_dir

    def get(self, symbol: str) -> RawFinancials | None:
        if self.ttl_seconds <= 0:
            return None

        path = self._path(symbol)
        try:
            envelope = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return None

        if not isinstance(envelope, dict) or envelope.get("version") != _FMP_CACHE_VERSION:
            return None

        cached_at = _parse_datetime(envelope.get("cached_at"))
        if cached_at is None:
            return None
        age = (datetime.now(UTC) - cached_at).total_seconds()
        if age > self.ttl_seconds:
            return None

        return _raw_from_cache_payload(envelope.get("raw"))

    def set(self, symbol: str, raw: RawFinancials) -> None:
        if self.ttl_seconds <= 0:
            return

        envelope = {
            "version": _FMP_CACHE_VERSION,
            "cached_at": datetime.now(UTC).isoformat(),
            "raw": _raw_to_cache_payload(raw),
        }
        path = self._path(symbol)
        tmp_path = path.with_suffix(".tmp")
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            tmp_path.write_text(json.dumps(envelope, indent=2, sort_keys=True))
            tmp_path.replace(path)
        except OSError:
            return

    def _path(self, symbol: str) -> Path:
        safe_symbol = re.sub(r"[^A-Z0-9._-]", "_", _clean_ticker(symbol))
        return self.cache_dir / f"{safe_symbol}.json"


class SecCompanyTickerCache:
    """Small JSON cache for the official SEC ticker-to-CIK mapping."""

    def __init__(self, ttl_seconds: float, cache_dir: Path) -> None:
        self.ttl_seconds = max(0.0, ttl_seconds)
        self.cache_dir = cache_dir

    def get(self) -> dict[str, dict[str, Any]] | None:
        if self.ttl_seconds <= 0:
            return None

        try:
            envelope = json.loads(self._path().read_text())
        except (OSError, json.JSONDecodeError):
            return None

        if (
            not isinstance(envelope, dict)
            or envelope.get("version") != _SEC_COMPANY_TICKERS_CACHE_VERSION
        ):
            return None

        cached_at = _parse_datetime(envelope.get("cached_at"))
        data = envelope.get("data")
        if cached_at is None or not isinstance(data, dict):
            return None
        age = (datetime.now(UTC) - cached_at).total_seconds()
        if age > self.ttl_seconds:
            return None

        return data

    def set(self, data: dict[str, dict[str, Any]]) -> None:
        if self.ttl_seconds <= 0:
            return

        envelope = {
            "version": _SEC_COMPANY_TICKERS_CACHE_VERSION,
            "cached_at": datetime.now(UTC).isoformat(),
            "data": data,
        }
        path = self._path()
        tmp_path = path.with_suffix(".tmp")
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            tmp_path.write_text(json.dumps(envelope, indent=2, sort_keys=True))
            tmp_path.replace(path)
        except OSError:
            return

    def _path(self) -> Path:
        return self.cache_dir / "company_tickers.json"


def _redact(text: object, api_key: str | None = None) -> str:
    redacted = str(text)
    if api_key:
        redacted = redacted.replace(api_key, "***")
    return _API_KEY_PARAM_RE.sub(r"\1***", redacted)


def _records_by_year(records: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    values: dict[int, dict[str, Any]] = {}
    for record in records:
        year = _record_year(record)
        if year is not None:
            values[year] = record
    return values


def _tax_rate_from_income(record: dict[str, Any]) -> float | None:
    income_tax = _finite_float(record.get("incomeTaxExpense"))
    if income_tax is None:
        tax_rate = _finite_float(record.get("taxRate"))
        if tax_rate is None:
            return None
        return max(0.0, min(1.0, tax_rate))

    pretax_income = _finite_float(record.get("incomeBeforeTax"))
    if pretax_income is None:
        net_income = _finite_float(record.get("netIncome"))
        if net_income is None:
            return None
        pretax_income = net_income + income_tax
    if pretax_income == 0:
        return None

    return max(0.0, min(1.0, income_tax / pretax_income))


def _wacc_series(
    income: list[dict[str, Any]],
    balance: list[dict[str, Any]],
    *,
    beta: float | None,
    market_cap: float | None,
    risk_free_rate: float,
    market_premium: float,
) -> list[YearPoint]:
    if beta is None or market_cap is None or market_cap <= 0:
        return []

    cost_of_equity = risk_free_rate + beta * market_premium
    income_by_year = _records_by_year(income)
    values: dict[int, float] = {}

    for balance_record in balance:
        year = _record_year(balance_record)
        income_record = income_by_year.get(year) if year is not None else None
        if year is None or income_record is None:
            continue

        total_debt = _finite_float(_safe_get(balance_record, ["totalDebt", "longTermDebt"]))
        book_equity = _finite_float(
            _safe_get(balance_record, ["totalStockholdersEquity", "totalEquity"])
        )
        tax_rate = _tax_rate_from_income(income_record)
        if total_debt is None or book_equity is None or tax_rate is None:
            continue

        total_capital = market_cap + total_debt
        if total_capital <= 0:
            continue

        if total_debt == 0:
            cost_of_debt = 0.0
        else:
            interest_expense = _finite_float(income_record.get("interestExpense"))
            if interest_expense is None:
                continue
            cost_of_debt = abs(interest_expense) / total_debt * (1 - tax_rate)

        values[year] = (
            market_cap / total_capital * cost_of_equity
            + total_debt / total_capital * cost_of_debt
        )

    return _year_points(values)


def _statement_from_row(statement: Any, aliases: Sequence[str]) -> list[YearPoint]:
    if statement is None or getattr(statement, "empty", True):
        return []

    normalized_aliases = {_normalize_label(alias) for alias in aliases}
    for label in list(getattr(statement, "index", [])):
        if _normalize_label(label) not in normalized_aliases:
            continue
        row = statement.loc[label]
        values: dict[int, float] = {}
        for column, value in row.items():
            year = _column_year(column)
            numeric = _finite_float(value)
            if year is not None and numeric is not None:
                values[year] = numeric
        return _year_points(values)
    return []


def _get_statement(ticker_obj: Any, names: Sequence[str]) -> Any:
    for name in names:
        try:
            candidate = getattr(ticker_obj, name)
            statement = candidate() if callable(candidate) else candidate
        except Exception:
            continue
        if statement is not None and not getattr(statement, "empty", True):
            return statement
    return None


def _latest_close(ticker_obj: Any) -> float | None:
    try:
        history = ticker_obj.history(period="5d", interval="1d", auto_adjust=False)
    except Exception:
        return None
    if history is None or getattr(history, "empty", True) or "Close" not in history:
        return None
    close = history["Close"].dropna()
    if close.empty:
        return None
    return _finite_float(close.iloc[-1])


def _historical_pe_from_yahoo(ticker_obj: Any, eps: list[YearPoint], current_pe: float) -> float:
    pe_values: list[float] = []
    try:
        history = ticker_obj.history(period="11y", interval="1mo", auto_adjust=False)
    except Exception:
        history = None

    if history is not None and not getattr(history, "empty", True) and "Close" in history:
        closes = history["Close"].dropna()
        for point in eps:
            if point.value <= 0:
                continue
            try:
                year_closes = closes[closes.index.year == point.year]
            except Exception:
                year_closes = []
            if len(year_closes) == 0:
                continue
            price = _finite_float(year_closes.iloc[-1])
            if price is not None and price > 0:
                pe_values.append(price / point.value)

    if pe_values:
        return median(pe_values)
    return current_pe if current_pe > 0 else 0.0


def _dividends_by_year(ticker_obj: Any, years: Sequence[int]) -> list[YearPoint]:
    try:
        dividends = ticker_obj.dividends
    except Exception:
        return []
    if dividends is None or getattr(dividends, "empty", True):
        return []

    values: dict[int, float] = {}
    allowed_years = set(years)
    for timestamp, value in dividends.items():
        year = _column_year(timestamp)
        numeric = _finite_float(value)
        if year is None or numeric is None:
            continue
        if allowed_years and year not in allowed_years:
            continue
        values[year] = values.get(year, 0.0) + numeric
    return _year_points(values)


class YahooProvider:
    """Yahoo Finance provider backed by yfinance. This is the default provider."""

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        symbol = _clean_ticker(ticker)
        try:
            return await asyncio.to_thread(self._get_fundamentals_sync, symbol)
        except (TickerNotFound, RateLimited):
            raise
        except Exception as exc:
            if _is_rate_limited(exc):
                raise RateLimited(str(exc)) from exc
            raise ProviderUnavailable(str(exc)) from exc

    def _get_fundamentals_sync(self, symbol: str) -> RawFinancials:
        try:
            import yfinance as yf
        except ImportError as exc:
            raise ProviderUnavailable("yfinance is not installed") from exc

        ticker_obj = yf.Ticker(symbol)
        info: dict[str, Any] = {}
        try:
            fetched_info = ticker_obj.info
            if isinstance(fetched_info, dict):
                info = fetched_info
        except Exception as exc:
            if _is_rate_limited(exc):
                raise RateLimited(str(exc)) from exc

        try:
            fast_info = ticker_obj.fast_info
        except Exception:
            fast_info = {}

        current_price = _finite_float(
            _safe_get(fast_info, ["last_price", "lastPrice", "regularMarketPrice"])
        )
        if current_price is None:
            current_price = _finite_float(_safe_get(info, ["currentPrice", "regularMarketPrice"]))
        if current_price is None:
            current_price = _latest_close(ticker_obj)

        income = _get_statement(ticker_obj, ["income_stmt", "financials", "get_income_stmt"])
        balance = _get_statement(ticker_obj, ["balance_sheet", "get_balance_sheet"])
        cashflow = _get_statement(ticker_obj, ["cash_flow", "cashflow", "get_cash_flow"])

        revenue = _statement_from_row(income, ["Total Revenue"])
        net_income = _statement_from_row(income, ["Net Income", "Net Income Common Stockholders"])
        gross_profit = _statement_from_row(income, ["Gross Profit"])
        operating_income = _statement_from_row(
            income,
            ["Operating Income", "Operating Income Loss"],
        )
        average_shares = _statement_from_row(
            income,
            ["Diluted Average Shares", "Basic Average Shares", "Weighted Average Shs Out Dil"],
        )
        eps = _statement_from_row(income, ["Diluted EPS", "Basic EPS"])
        if not eps:
            eps = _divide_series(net_income, average_shares)

        operating_cashflow = _statement_from_row(
            cashflow,
            ["Operating Cash Flow", "Total Cash From Operating Activities"],
        )
        fcf = _statement_from_row(cashflow, ["Free Cash Flow"])
        fcf_provenance = "reported" if fcf else "unavailable"
        if not fcf:
            capital_expenditure = _statement_from_row(
                cashflow,
                ["Capital Expenditure", "Capital Expenditures"],
            )
            fcf = _free_cash_flow_series(operating_cashflow, capital_expenditure)
            fcf_provenance = "computed" if fcf else "unavailable"
        else:
            capital_expenditure = _statement_from_row(
                cashflow,
                ["Capital Expenditure", "Capital Expenditures"],
            )

        shares_outstanding = _statement_from_row(
            balance,
            ["Ordinary Shares Number", "Share Issued", "Common Stock Shares Outstanding"],
        )
        if not shares_outstanding:
            shares_outstanding = average_shares

        equity = _statement_from_row(
            balance,
            ["Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest"],
        )
        book_value_per_share = _divide_series(equity, shares_outstanding)
        book_value_provenance = "computed" if book_value_per_share else "unavailable"
        roe = _divide_series(net_income, equity)
        roe_provenance = "computed" if roe else "unavailable"

        long_term_debt = _statement_from_row(
            balance,
            ["Long Term Debt", "Long Term Debt And Capital Lease Obligation"],
        )
        total_debt = _statement_from_row(
            balance,
            ["Total Debt", "Total Debt And Capital Lease Obligation"],
        )
        if not total_debt:
            total_debt = long_term_debt
        cash_and_investments = _statement_from_row(
            balance,
            [
                "Cash And Cash Equivalents",
                "Cash Cash Equivalents And Short Term Investments",
                "Cash And Short Term Investments",
            ],
        )

        years = [point.year for point in revenue or eps or fcf]
        dividend = _dividends_by_year(ticker_obj, years)
        payout_ratio = _divide_series(dividend, eps)

        latest_eps = eps[-1].value if eps else None
        current_pe = _finite_float(_safe_get(info, ["trailingPE"]))
        if current_pe is None and current_price is not None and latest_eps not in (None, 0):
            current_pe = current_price / latest_eps if latest_eps and latest_eps > 0 else 0.0

        if current_price is None or current_price <= 0:
            raise TickerNotFound(symbol)
        if not any([revenue, eps, fcf, net_income]):
            raise TickerNotFound(symbol)

        historical_pe = _historical_pe_from_yahoo(ticker_obj, eps, current_pe or 0.0)

        currency = str(
            _safe_get(fast_info, ["currency"])
            or _safe_get(info, ["currency", "financialCurrency"])
            or "USD"
        )
        company_name = str(_safe_get(info, ["longName", "shortName"]) or symbol)
        beta = _finite_float(_safe_get(info, ["beta"])) or 0.0

        return RawFinancials(
            ticker=symbol,
            company_name=company_name,
            currency=currency,
            as_of=datetime.now(UTC),
            current_price=current_price,
            current_pe=current_pe or 0.0,
            historical_pe=historical_pe,
            beta=beta,
            data_source="yahoo",
            provenance={
                "historicalPE": "computed",
                "growth.bookValuePerShare": book_value_provenance,
                "growth.fcf": fcf_provenance,
                "profitability.grossMargin": (
                    "computed" if gross_profit and revenue else "unavailable"
                ),
                "profitability.operatingMargin": (
                    "computed" if operating_income and revenue else "unavailable"
                ),
                "profitability.netMargin": (
                    "computed" if net_income and revenue else "unavailable"
                ),
                "profitability.fcfMargin": "computed" if fcf and revenue else "unavailable",
                "profitability.roic": "unavailable",
                "profitability.roe": roe_provenance,
                "profitability.wacc": "unavailable",
                "balance.totalDebt": "reported" if total_debt else "unavailable",
                "balance.cashAndInvestments": (
                    "reported" if cash_and_investments else "unavailable"
                ),
                "balance.totalEquity": "reported" if equity else "unavailable",
                "balance.netDebt": (
                    "computed" if total_debt and cash_and_investments else "unavailable"
                ),
                "debt.interestCoverage": "unavailable",
            },
            revenue=revenue,
            eps=eps,
            fcf=fcf,
            book_value_per_share=book_value_per_share,
            shares_outstanding=shares_outstanding,
            operating_cashflow=operating_cashflow,
            net_income=net_income,
            gross_profit=gross_profit,
            operating_income=operating_income,
            capital_expenditure=capital_expenditure,
            roic=[],
            roe=roe,
            wacc=[],
            long_term_debt=long_term_debt,
            total_debt=total_debt,
            cash_and_investments=cash_and_investments,
            total_equity=equity,
            interest_coverage=[],
            dividend=dividend,
            payout_ratio=payout_ratio,
        )


def _sec_cik(value: Any) -> str | None:
    try:
        cik = int(value)
    except (TypeError, ValueError):
        return None
    if cik <= 0:
        return None
    return f"{cik:010d}"


def _sec_ticker_mapping(data: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(data, dict):
        return {}

    mapping: dict[str, dict[str, Any]] = {}
    for item in data.values():
        if not isinstance(item, dict):
            continue
        ticker = _clean_ticker(str(item.get("ticker") or ""))
        cik = _sec_cik(item.get("cik_str"))
        if not ticker or cik is None:
            continue
        mapping[ticker] = {
            "cik": cik,
            "title": str(item.get("title") or ticker),
        }
    return mapping


def _sec_is_annual_record(record: Any) -> bool:
    if not isinstance(record, dict):
        return False

    form = str(record.get("form") or "").upper()
    if form not in _SEC_ANNUAL_FORMS:
        return False

    period = str(record.get("fp") or "").upper()
    return period in {"", "FY"}


def _sec_record_year(record: dict[str, Any]) -> int | None:
    raw_year = record.get("fy")
    try:
        year = int(raw_year)
    except (TypeError, ValueError):
        year = _column_year(record.get("end"))
    return year


def _sec_matching_units(
    units: dict[str, Any],
    preferred_units: Sequence[str],
) -> list[str]:
    unit_names = list(units.keys())
    if not preferred_units:
        return unit_names

    selected: list[str] = []
    normalized_preferences = [unit.lower() for unit in preferred_units]
    for preference in normalized_preferences:
        for unit in unit_names:
            if unit.lower() == preference and unit not in selected:
                selected.append(unit)
    for preference in normalized_preferences:
        for unit in unit_names:
            if preference in unit.lower() and unit not in selected:
                selected.append(unit)
    return selected


def _sec_annual_series(
    us_gaap: dict[str, Any],
    concepts: Sequence[str],
    *,
    units: Sequence[str] = ("USD",),
) -> list[YearPoint]:
    values: dict[int, tuple[int, str, float]] = {}

    for concept_priority, concept in enumerate(concepts):
        concept_data = us_gaap.get(concept)
        if not isinstance(concept_data, dict):
            continue
        unit_map = concept_data.get("units")
        if not isinstance(unit_map, dict):
            continue

        for unit in _sec_matching_units(unit_map, units):
            records = unit_map.get(unit)
            if not isinstance(records, list):
                continue
            for record in records:
                if not _sec_is_annual_record(record):
                    continue
                year = _sec_record_year(record)
                value = _finite_float(record.get("val"))
                if year is None or value is None:
                    continue
                filed = str(record.get("filed") or "")
                current = values.get(year)
                if (
                    current is None
                    or concept_priority < current[0]
                    or (concept_priority == current[0] and filed > current[1])
                ):
                    values[year] = (concept_priority, filed, value)

    return _year_points({year: value for year, (_, _, value) in values.items()})


def _limit_series(series: list[YearPoint], limit: int = 11) -> list[YearPoint]:
    return series[-limit:]


def _abs_series(series: list[YearPoint]) -> list[YearPoint]:
    return [YearPoint(year=point.year, value=abs(point.value)) for point in series]


def _sec_interest_coverage_series(
    operating_income: list[YearPoint],
    interest_expense: list[YearPoint],
) -> list[YearPoint]:
    interest_by_year = _series_map(interest_expense)
    values: dict[int, float] = {}
    for point in operating_income:
        interest = interest_by_year.get(point.year)
        if interest not in (None, 0):
            values[point.year] = point.value / abs(interest)
    return _year_points(values)


def _sec_us_gaap(companyfacts: Any) -> dict[str, Any]:
    if not isinstance(companyfacts, dict):
        return {}
    facts = companyfacts.get("facts")
    if not isinstance(facts, dict):
        return {}
    us_gaap = facts.get("us-gaap")
    return us_gaap if isinstance(us_gaap, dict) else {}


def _sec_raw_from_companyfacts(
    symbol: str,
    ticker_entry: dict[str, Any],
    companyfacts: Any,
    market_raw: RawFinancials,
) -> RawFinancials:
    us_gaap = _sec_us_gaap(companyfacts)
    if not us_gaap:
        raise TickerNotFound(symbol)

    revenue = _sec_annual_series(
        us_gaap,
        [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues",
            "SalesRevenueNet",
            "SalesRevenueGoodsNet",
        ],
    )
    net_income = _sec_annual_series(us_gaap, ["NetIncomeLoss"])
    gross_profit = _sec_annual_series(us_gaap, ["GrossProfit"])
    operating_income = _sec_annual_series(
        us_gaap,
        ["OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
    )
    eps = _sec_annual_series(
        us_gaap,
        ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
        units=("USD/shares", "USD per shares"),
    )
    shares = _sec_annual_series(
        us_gaap,
        [
            "WeightedAverageNumberOfDilutedSharesOutstanding",
            "WeightedAverageNumberOfSharesOutstandingBasic",
            "CommonStocksIncludingAdditionalPaidInCapitalMember",
        ],
        units=("shares",),
    )
    operating_cashflow = _sec_annual_series(
        us_gaap,
        [
            "NetCashProvidedByUsedInOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        ],
    )
    capital_expenditure = _sec_annual_series(
        us_gaap,
        [
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsToAcquireProductiveAssets",
            "CapitalExpendituresIncurredButNotYetPaid",
        ],
    )
    fcf = _free_cash_flow_series(operating_cashflow, capital_expenditure)

    equity = _sec_annual_series(
        us_gaap,
        [
            "StockholdersEquity",
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            "PartnersCapital",
        ],
    )
    book_value_per_share = _divide_series(equity, shares)
    roe = _divide_series(net_income, equity)

    cash = _sec_annual_series(
        us_gaap,
        [
            "CashAndCashEquivalentsAtCarryingValue",
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        ],
    )
    short_term_investments = _sec_annual_series(
        us_gaap,
        ["ShortTermInvestments", "MarketableSecuritiesCurrent"],
    )
    cash_and_investments = _sec_annual_series(
        us_gaap,
        [
            "CashCashEquivalentsAndShortTermInvestments",
            "CashAndShortTermInvestments",
        ],
    )
    if not cash_and_investments:
        cash_and_investments = (
            _combine_series(cash, short_term_investments)
            if short_term_investments
            else cash
        )

    long_term_debt = _sec_annual_series(
        us_gaap,
        [
            "LongTermDebtNoncurrent",
            "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
            "LongTermDebtAndCapitalLeaseObligations",
            "LongTermDebt",
        ],
    )
    current_debt = _sec_annual_series(
        us_gaap,
        [
            "ShortTermBorrowings",
            "ShortTermDebtCurrent",
            "LongTermDebtCurrent",
            "LongTermDebtAndFinanceLeaseObligationsCurrent",
            "CurrentPortionOfLongTermDebt",
        ],
    )
    total_debt = _sec_annual_series(
        us_gaap,
        [
            "DebtCurrentAndNoncurrent",
            "LongTermDebtAndFinanceLeaseObligations",
            "ShortTermBorrowingsAndLongTermDebtCurrentAndLongTermDebtNoncurrent",
        ],
    )
    if not total_debt:
        total_debt = (
            _combine_series(long_term_debt, current_debt)
            if current_debt
            else long_term_debt
        )

    interest_expense = _abs_series(
        _sec_annual_series(
            us_gaap,
            ["InterestExpenseNonOperating", "InterestExpense"],
        )
    )
    interest_coverage = _sec_interest_coverage_series(operating_income, interest_expense)

    dividends_paid = _abs_series(
        _sec_annual_series(
            us_gaap,
            ["PaymentsOfDividendsCommonStock", "DividendsCommonStockCash"],
        )
    )
    dividend = _divide_series(dividends_paid, shares)
    payout_ratio = _divide_series(dividend, eps)

    if not any([revenue, eps, fcf, net_income]):
        raise TickerNotFound(symbol)

    company_name = str(
        (companyfacts.get("entityName") if isinstance(companyfacts, dict) else None)
        or ticker_entry.get("title")
        or market_raw.company_name
        or symbol
    )

    series_fields = {
        "revenue": revenue,
        "eps": eps,
        "fcf": fcf,
        "book_value_per_share": book_value_per_share,
        "shares_outstanding": shares,
        "operating_cashflow": operating_cashflow,
        "net_income": net_income,
        "gross_profit": gross_profit,
        "operating_income": operating_income,
        "capital_expenditure": capital_expenditure,
        "roe": roe,
        "long_term_debt": long_term_debt,
        "total_debt": total_debt,
        "cash_and_investments": cash_and_investments,
        "total_equity": equity,
        "interest_coverage": interest_coverage,
        "dividend": dividend,
        "payout_ratio": payout_ratio,
    }
    limited = {name: _limit_series(series) for name, series in series_fields.items()}

    return RawFinancials(
        ticker=symbol,
        company_name=company_name,
        currency=market_raw.currency,
        as_of=datetime.now(UTC),
        current_price=market_raw.current_price,
        current_pe=market_raw.current_pe,
        historical_pe=market_raw.historical_pe,
        beta=market_raw.beta,
        analyst_growth=market_raw.analyst_growth,
        analyst_growth_horizon_years=market_raw.analyst_growth_horizon_years,
        analyst_forward_eps=market_raw.analyst_forward_eps,
        data_source="sec",
        provenance={
            "currentPrice": market_raw.provenance.get("currentPrice", "reported"),
            "currentPE": market_raw.provenance.get("currentPE", "reported"),
            "historicalPE": market_raw.provenance.get("historicalPE", "computed"),
            "beta": market_raw.provenance.get("beta", "reported"),
            "source.secCompanyFacts": "reported",
            "growthEstimate": (
                "estimated" if market_raw.analyst_growth is not None else "unavailable"
            ),
            "growth.revenue": "reported" if revenue else "unavailable",
            "growth.eps": "reported" if eps else "unavailable",
            "growth.bookValuePerShare": (
                "computed" if book_value_per_share else "unavailable"
            ),
            "growth.fcf": "computed" if fcf else "unavailable",
            "growth.sharesOutstanding": "reported" if shares else "unavailable",
            "growth.operatingCashflow": (
                "reported" if operating_cashflow else "unavailable"
            ),
            "profitability.netIncome": "reported" if net_income else "unavailable",
            "profitability.grossMargin": (
                "computed" if gross_profit and revenue else "unavailable"
            ),
            "profitability.operatingMargin": (
                "computed" if operating_income and revenue else "unavailable"
            ),
            "profitability.netMargin": (
                "computed" if net_income and revenue else "unavailable"
            ),
            "profitability.fcfMargin": "computed" if fcf and revenue else "unavailable",
            "profitability.roic": "unavailable",
            "profitability.roe": "computed" if roe else "unavailable",
            "profitability.wacc": "unavailable",
            "debt.longTermDebt": "reported" if long_term_debt else "unavailable",
            "balance.totalDebt": "reported" if total_debt else "unavailable",
            "balance.cashAndInvestments": (
                "reported" if cash_and_investments else "unavailable"
            ),
            "balance.totalEquity": "reported" if equity else "unavailable",
            "balance.netDebt": (
                "computed" if total_debt and cash_and_investments else "unavailable"
            ),
            "debt.interestCoverage": "computed" if interest_coverage else "unavailable",
            "dividend.dividend": "computed" if dividend else "unavailable",
            "dividend.payoutRatio": "computed" if payout_ratio else "unavailable",
        },
        revenue=limited["revenue"],
        eps=limited["eps"],
        fcf=limited["fcf"],
        book_value_per_share=limited["book_value_per_share"],
        shares_outstanding=limited["shares_outstanding"],
        operating_cashflow=limited["operating_cashflow"],
        net_income=limited["net_income"],
        gross_profit=limited["gross_profit"],
        operating_income=limited["operating_income"],
        capital_expenditure=limited["capital_expenditure"],
        roic=[],
        roe=limited["roe"],
        wacc=[],
        long_term_debt=limited["long_term_debt"],
        total_debt=limited["total_debt"],
        cash_and_investments=limited["cash_and_investments"],
        total_equity=limited["total_equity"],
        interest_coverage=limited["interest_coverage"],
        dividend=limited["dividend"],
        payout_ratio=limited["payout_ratio"],
    )


class SecProvider:
    """SEC EDGAR companyfacts provider enriched with Yahoo market data."""

    def __init__(
        self,
        market_provider: FinancialDataProvider | None = None,
        base_url: str | None = None,
        company_tickers_url: str | None = None,
        *,
        user_agent: str | None = None,
        cache_ttl_seconds: float | None = None,
        cache_dir: str | Path | None = None,
        strict: bool = False,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.market_provider = market_provider or YahooProvider()
        self.base_url = (base_url or "https://data.sec.gov").rstrip("/")
        self.company_tickers_url = (
            company_tickers_url or "https://www.sec.gov/files/company_tickers.json"
        )
        self.user_agent = (
            user_agent
            or os.getenv("SEC_USER_AGENT")
            or _SEC_DEFAULT_USER_AGENT
        ).strip()
        self.timeout_seconds = max(
            1.0,
            _env_float("SEC_HTTP_TIMEOUT_SECONDS", _SEC_DEFAULT_TIMEOUT_SECONDS),
        )
        ttl_seconds = (
            _env_float(
                "SEC_COMPANY_TICKERS_TTL_SECONDS",
                _SEC_DEFAULT_COMPANY_TICKERS_TTL_SECONDS,
            )
            if cache_ttl_seconds is None
            else cache_ttl_seconds
        )
        env_cache_dir = os.getenv("SEC_CACHE_DIR")
        resolved_cache_dir = cache_dir or env_cache_dir or _default_sec_cache_dir()
        self.cache = SecCompanyTickerCache(
            ttl_seconds=ttl_seconds,
            cache_dir=Path(resolved_cache_dir),
        )
        self.strict = strict
        self.transport = transport

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        symbol = _clean_ticker(ticker)
        market_raw = await self.market_provider.get_fundamentals(symbol)
        try:
            return await self._get_sec_fundamentals(symbol, market_raw)
        except (TickerNotFound, RateLimited, ProviderUnavailable):
            if self.strict:
                raise
            return market_raw

    async def _get_sec_fundamentals(
        self,
        symbol: str,
        market_raw: RawFinancials,
    ) -> RawFinancials:
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout_seconds),
                headers=headers,
                transport=self.transport,
            ) as client:
                mapping = await self._ticker_mapping(client)
                ticker_entry = mapping.get(symbol)
                if ticker_entry is None:
                    raise TickerNotFound(symbol)

                cik = ticker_entry["cik"]
                companyfacts = await self._get_json(
                    client,
                    f"{self.base_url}/api/xbrl/companyfacts/CIK{cik}.json",
                )
        except (TickerNotFound, RateLimited, ProviderUnavailable):
            raise
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(str(exc)) from None

        return _sec_raw_from_companyfacts(symbol, ticker_entry, companyfacts, market_raw)

    async def _ticker_mapping(
        self,
        client: httpx.AsyncClient,
    ) -> dict[str, dict[str, Any]]:
        cached = self.cache.get()
        if cached is not None:
            return cached

        payload = await self._get_json(client, self.company_tickers_url)
        mapping = _sec_ticker_mapping(payload)
        if not mapping:
            raise ProviderUnavailable("SEC ticker mapping could not be parsed")
        self.cache.set(mapping)
        return mapping

    async def _get_json(self, client: httpx.AsyncClient, url: str) -> Any:
        response = await client.get(url)
        if response.status_code == 404:
            raise TickerNotFound(url)
        if response.status_code == 429:
            raise RateLimited(f"SEC rate limit reached for {url}")
        if response.status_code == 403:
            raise ProviderUnavailable(
                "SEC rejected the request; configure SEC_USER_AGENT with contact info"
            )
        if response.status_code >= 500:
            raise ProviderUnavailable(f"SEC returned {response.status_code} for {url}")
        response.raise_for_status()
        return response.json()


class FmpProvider:
    """Financial Modeling Prep provider selected with DATA_PROVIDER=fmp."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        *,
        risk_free_rate: float | None = None,
        market_premium: float | None = None,
        cache_ttl_seconds: float | None = None,
        cache_dir: str | Path | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key or os.getenv("FMP_API_KEY")
        self.base_url = (base_url or "https://financialmodelingprep.com/stable").rstrip("/")
        self.risk_free_rate = (
            _env_float("RISK_FREE_RATE", 0.043)
            if risk_free_rate is None
            else risk_free_rate
        )
        self.market_premium = (
            _env_float("MARKET_PREMIUM", 0.05)
            if market_premium is None
            else market_premium
        )
        self.request_delay_seconds = (
            max(0.0, _env_float("FMP_REQUEST_DELAY_MS", _FMP_DEFAULT_REQUEST_DELAY_MS))
            / 1000
        )
        self.timeout_seconds = max(
            1.0,
            _env_float("FMP_HTTP_TIMEOUT_SECONDS", _FMP_DEFAULT_TIMEOUT_SECONDS),
        )
        ttl_seconds = (
            _env_float("FMP_CACHE_TTL_SECONDS", _FMP_DEFAULT_CACHE_TTL_SECONDS)
            if cache_ttl_seconds is None
            else cache_ttl_seconds
        )
        env_cache_dir = os.getenv("FMP_CACHE_DIR")
        resolved_cache_dir = cache_dir or env_cache_dir or _default_fmp_cache_dir()
        self.cache = FmpRawCache(ttl_seconds=ttl_seconds, cache_dir=Path(resolved_cache_dir))
        self.transport = transport
        if not self.api_key:
            raise MissingApiKey("FMP_API_KEY is required when DATA_PROVIDER=fmp")

    async def _get(
        self,
        client: httpx.AsyncClient,
        path: str,
        params: dict[str, Any],
        *,
        allow_empty: bool = False,
    ) -> Any:
        symbol = str(params.get("symbol", ""))
        endpoint_url = f"{self.base_url}/{path.lstrip('/')}"
        request_params = {**params, "apikey": self.api_key}

        for attempt in range(len(_FMP_RATE_LIMIT_BACKOFF_SECONDS) + 1):
            response = await client.get(endpoint_url, params=request_params)
            if response.status_code not in _FMP_RATE_LIMIT_STATUS_CODES:
                break
            if attempt < len(_FMP_RATE_LIMIT_BACKOFF_SECONDS):
                await asyncio.sleep(_FMP_RATE_LIMIT_BACKOFF_SECONDS[attempt])
                continue
            message = f"FMP rate limit reached ({response.status_code}) for {response.url}"
            raise RateLimited(_redact(message, self.api_key))

        body = response.text.lower()
        if (
            response.status_code == 401
            or "invalid api key" in body
            or "invalid api_key" in body
        ):
            raise ProviderUnavailable(_redact("FMP API key was rejected", self.api_key))
        if response.status_code == 403 and "legacy endpoint" in body:
            raise ProviderUnavailable(_redact("FMP legacy endpoint rejected", self.api_key))
        if response.status_code >= 500:
            message = f"FMP returned {response.status_code} for {response.url}"
            raise ProviderUnavailable(_redact(message, self.api_key))
        if response.status_code == 404:
            raise TickerNotFound(_redact(symbol, self.api_key))
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and data.get("Error Message"):
            raise ProviderUnavailable(_redact(data["Error Message"], self.api_key))
        if data == [] and not allow_empty:
            raise TickerNotFound(_redact(symbol, self.api_key))
        return data

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        symbol = _clean_ticker(ticker)
        cached = self.cache.get(symbol)
        if cached is not None:
            return cached

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout_seconds),
                transport=self.transport,
            ) as client:
                endpoints: list[tuple[str, dict[str, Any], bool]] = [
                    ("profile", {"symbol": symbol}, True),
                    ("quote", {"symbol": symbol}, True),
                    (
                        "income-statement",
                        {"symbol": symbol, "period": "annual", "limit": 11},
                        False,
                    ),
                    (
                        "balance-sheet-statement",
                        {"symbol": symbol, "period": "annual", "limit": 11},
                        False,
                    ),
                    (
                        "cash-flow-statement",
                        {"symbol": symbol, "period": "annual", "limit": 11},
                        False,
                    ),
                    ("ratios", {"symbol": symbol, "period": "annual", "limit": 11}, False),
                    ("key-metrics", {"symbol": symbol, "period": "annual", "limit": 11}, False),
                    (
                        "analyst-estimates",
                        {"symbol": symbol, "period": "annual", "limit": 6},
                        True,
                    ),
                ]
                endpoint_data: list[Any] = []
                for index, (path, params, required) in enumerate(endpoints):
                    try:
                        endpoint_data.append(
                            await self._get(
                                client,
                                path,
                                params,
                                allow_empty=not required,
                            )
                        )
                    except RateLimited:
                        if required:
                            raise
                        endpoint_data.append([])
                    if index < len(endpoints) - 1 and self.request_delay_seconds > 0:
                        await asyncio.sleep(self.request_delay_seconds)

                (
                    profile_data,
                    quote_data,
                    income_data,
                    balance_data,
                    cashflow_data,
                    ratios_data,
                    metrics_data,
                    analyst_estimates_data,
                ) = endpoint_data
        except (TickerNotFound, RateLimited, ProviderUnavailable):
            raise
        except httpx.HTTPStatusError as exc:
            message = _redact(str(exc), self.api_key)
            if exc.response.status_code in _FMP_RATE_LIMIT_STATUS_CODES:
                raise RateLimited(message) from None
            raise ProviderUnavailable(message) from None
        except httpx.HTTPError as exc:
            raise ProviderUnavailable(_redact(str(exc), self.api_key)) from None

        profile = _first_record(profile_data)
        quote = _first_record(quote_data)
        if profile is None or quote is None:
            raise TickerNotFound(_redact(symbol, self.api_key))

        income = _ascending_records(income_data)
        balance = _ascending_records(balance_data)
        cashflow = _ascending_records(cashflow_data)
        ratios = _ascending_records(ratios_data)
        metrics = _ascending_records(metrics_data)
        analyst_estimates = _ascending_records(analyst_estimates_data)

        revenue = _records_series(income, ["revenue"])
        net_income = _records_series(income, ["netIncome"])
        gross_profit = _records_series(income, ["grossProfit"])
        operating_income = _records_series(income, ["operatingIncome"])
        eps = _records_series(income, ["epsdiluted", "eps"])
        operating_cashflow = _records_series(cashflow, ["operatingCashFlow"])
        fcf = _records_series(cashflow, ["freeCashFlow"])
        capital_expenditure = _records_series(cashflow, ["capitalExpenditure"])
        fcf_provenance = "reported" if fcf else "unavailable"
        if not fcf:
            fcf = _free_cash_flow_series(operating_cashflow, capital_expenditure)
            fcf_provenance = "computed" if fcf else "unavailable"
        shares = _records_series(income, ["weightedAverageShsOutDil", "weightedAverageShsOut"])
        equity = _records_series(balance, ["totalStockholdersEquity", "totalEquity"])
        book_value_per_share = _records_series(metrics, ["shareholdersEquityPerShare"])
        if not book_value_per_share:
            book_value_per_share = _records_series(ratios, ["shareholdersEquityPerShare"])
        book_value_provenance = "reported" if book_value_per_share else "unavailable"
        if not book_value_per_share:
            book_value_per_share = _divide_series(equity, shares)
            book_value_provenance = "computed" if book_value_per_share else "unavailable"
        long_term_debt = _records_series(balance, ["longTermDebt"])
        total_debt = _records_series(balance, ["totalDebt"])
        if not total_debt:
            total_debt = long_term_debt
        cash_and_investments = _records_series(
            balance,
            ["cashAndShortTermInvestments", "cashAndCashEquivalents"],
        )
        dividend = _records_series(metrics, ["dividendPerShare"])
        payout_ratio = _records_series(ratios, ["dividendPayoutRatio"])
        roe = _records_series(ratios, ["returnOnEquity"])
        roe_provenance = "reported" if roe else "unavailable"
        if not roe:
            roe = _divide_series(net_income, equity)
            roe_provenance = "computed" if roe else "unavailable"
        roic = _records_series(metrics, ["returnOnInvestedCapital"])
        interest_coverage, interest_coverage_provenance = _interest_coverage_series(
            _records_series(ratios, ["interestCoverageRatio"]),
            income,
        )
        beta = _finite_float(profile.get("beta"))
        market_cap = _finite_float(quote.get("marketCap"))
        wacc = _wacc_series(
            income,
            balance,
            beta=beta,
            market_cap=market_cap,
            risk_free_rate=self.risk_free_rate,
            market_premium=self.market_premium,
        )

        current_price = _finite_float(quote.get("price"))
        if current_price is None or current_price <= 0:
            raise TickerNotFound(_redact(symbol, self.api_key))

        latest_eps = eps[-1].value if eps else None
        current_pe = _finite_float(quote.get("pe"))
        if current_pe is None and latest_eps not in (None, 0):
            current_pe = current_price / latest_eps if latest_eps and latest_eps > 0 else 0.0

        eps_by_year = _series_map(eps)
        pe_values: list[float] = []
        for point in _records_series(ratios, ["priceToEarningsRatio"]):
            eps_value = eps_by_year.get(point.year)
            if eps_value is not None and eps_value <= 0:
                continue
            if point.value > 0:
                pe_values.append(point.value)
        historical_pe = median(pe_values) if pe_values else current_pe
        historical_pe_value = (
            historical_pe
            if historical_pe is not None and math.isfinite(historical_pe)
            else 0.0
        )
        analyst_growth, analyst_horizon_years, analyst_forward_eps = (
            _analyst_growth_estimate(analyst_estimates, eps)
        )

        raw = RawFinancials(
            ticker=symbol,
            company_name=str(profile.get("companyName") or symbol),
            currency=str(profile.get("currency") or "USD"),
            as_of=datetime.now(UTC),
            current_price=current_price,
            current_pe=current_pe or 0.0,
            historical_pe=historical_pe_value,
            beta=beta or 0.0,
            analyst_growth=analyst_growth,
            analyst_growth_horizon_years=analyst_horizon_years,
            analyst_forward_eps=analyst_forward_eps,
            data_source="fmp",
            provenance={
                "currentPrice": "reported",
                "currentPE": "reported" if current_pe is not None else "unavailable",
                "historicalPE": "computed" if pe_values else "unavailable",
                "beta": "reported" if beta is not None else "unavailable",
                "growthEstimate": "estimated" if analyst_growth is not None else "unavailable",
                "growth.revenue": "reported" if revenue else "unavailable",
                "growth.eps": "reported" if eps else "unavailable",
                "growth.bookValuePerShare": book_value_provenance,
                "growth.fcf": fcf_provenance,
                "growth.sharesOutstanding": "reported" if shares else "unavailable",
                "growth.operatingCashflow": "reported" if operating_cashflow else "unavailable",
                "profitability.netIncome": "reported" if net_income else "unavailable",
                "profitability.grossMargin": (
                    "computed" if gross_profit and revenue else "unavailable"
                ),
                "profitability.operatingMargin": (
                    "computed" if operating_income and revenue else "unavailable"
                ),
                "profitability.netMargin": (
                    "computed" if net_income and revenue else "unavailable"
                ),
                "profitability.fcfMargin": "computed" if fcf and revenue else "unavailable",
                "profitability.roic": "reported" if roic else "unavailable",
                "profitability.roe": roe_provenance,
                "profitability.wacc": "computed" if wacc else "unavailable",
                "debt.longTermDebt": "reported" if long_term_debt else "unavailable",
                "balance.totalDebt": "reported" if total_debt else "unavailable",
                "balance.cashAndInvestments": (
                    "reported" if cash_and_investments else "unavailable"
                ),
                "balance.totalEquity": "reported" if equity else "unavailable",
                "balance.netDebt": (
                    "computed" if total_debt and cash_and_investments else "unavailable"
                ),
                "debt.interestCoverage": interest_coverage_provenance,
                "dividend.dividend": "reported" if dividend else "unavailable",
                "dividend.payoutRatio": "reported" if payout_ratio else "unavailable",
            },
            revenue=revenue,
            eps=eps,
            fcf=fcf,
            book_value_per_share=book_value_per_share,
            shares_outstanding=shares,
            operating_cashflow=operating_cashflow,
            net_income=net_income,
            gross_profit=gross_profit,
            operating_income=operating_income,
            capital_expenditure=capital_expenditure,
            roic=roic,
            roe=roe,
            wacc=wacc,
            long_term_debt=long_term_debt,
            total_debt=total_debt,
            cash_and_investments=cash_and_investments,
            total_equity=equity,
            interest_coverage=interest_coverage,
            dividend=dividend,
            payout_ratio=payout_ratio,
        )
        self.cache.set(symbol, raw)
        return raw


class FallbackProvider:
    """Use a primary paid provider, then fall back to Yahoo on transient failures."""

    def __init__(
        self,
        primary: FinancialDataProvider,
        fallback: FinancialDataProvider,
    ) -> None:
        self.primary = primary
        self.fallback = fallback

    async def get_fundamentals(self, ticker: str) -> RawFinancials:
        try:
            return await self.primary.get_fundamentals(ticker)
        except (RateLimited, ProviderUnavailable):
            return await self.fallback.get_fundamentals(ticker)


def _ascending_records(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, list):
        return []
    records = [record for record in data if isinstance(record, dict)]
    return sorted(records, key=lambda record: str(record.get("date") or record.get("calendarYear") or ""))


def _record_year(record: dict[str, Any]) -> int | None:
    raw_year = record.get("calendarYear") or record.get("date")
    return _column_year(raw_year)


def _records_series(records: list[dict[str, Any]], keys: Sequence[str]) -> list[YearPoint]:
    values: dict[int, float] = {}
    for record in records:
        year = _record_year(record)
        if year is None:
            continue
        for key in keys:
            numeric = _finite_float(record.get(key))
            if numeric is not None:
                values[year] = numeric
                break
    return _year_points(values)


def _interest_coverage_series(
    reported: list[YearPoint],
    income_records: list[dict[str, Any]],
) -> tuple[list[YearPoint], ProvenanceValue]:
    computed_values: dict[int, float] = {}
    for record in income_records:
        year = _record_year(record)
        interest_expense = _finite_float(record.get("interestExpense"))
        if year is None or interest_expense in (None, 0):
            continue

        ebit = _finite_float(record.get("ebit"))
        if ebit is None:
            ebit = _finite_float(record.get("operatingIncome"))
        if ebit is None:
            pretax_income = _finite_float(record.get("incomeBeforeTax"))
            if pretax_income is not None:
                ebit = pretax_income + abs(interest_expense)
        if ebit is None:
            continue

        computed_values[year] = ebit / abs(interest_expense)

    computed = _year_points(computed_values)
    filtered_reported = [point for point in reported if point.value != 0]
    if not reported:
        return (computed, "computed") if computed else ([], "unavailable")
    if not computed:
        if filtered_reported:
            return filtered_reported, "reported"
        return [], "unavailable"

    values = {point.year: point.value for point in filtered_reported}
    changed = len(filtered_reported) != len(reported)
    for point in computed:
        if point.year not in values:
            values[point.year] = point.value
            changed = True

    return _year_points(values), "computed" if changed else "reported"


def _analyst_growth_estimate(
    records: list[dict[str, Any]],
    eps: list[YearPoint],
) -> tuple[float | None, int | None, float | None]:
    latest_eps_point = eps[-1] if eps else None
    if latest_eps_point is None or latest_eps_point.value <= 0:
        return None, None, None

    estimate_points = _records_series(
        records,
        [
            "estimatedEpsAvg",
            "estimatedEPSAvg",
            "epsAvg",
            "epsEstimatedAvg",
            "estimatedEps",
            "eps",
        ],
    )
    future_points = [
        point
        for point in estimate_points
        if point.year > latest_eps_point.year and point.value > 0
    ]
    if not future_points:
        return None, None, None

    target = future_points[-1]
    horizon_years = max(1, target.year - latest_eps_point.year)
    raw_growth = math.pow(target.value / latest_eps_point.value, 1 / horizon_years) - 1
    if not math.isfinite(raw_growth):
        return None, None, None

    conservative_growth = max(-0.10, min(0.30, raw_growth))
    return conservative_growth, horizon_years, target.value


def create_provider() -> FinancialDataProvider:
    """Create the configured financial data provider."""

    _load_local_env()
    configured_provider = os.getenv("DATA_PROVIDER")
    provider = (
        configured_provider
        or ("fmp" if os.getenv("FMP_API_KEY") else "yahoo")
    ).strip().lower()
    if provider == "fmp":
        primary = FmpProvider()
        allow_fallback = os.getenv("ALLOW_YAHOO_FALLBACK", "true").strip().lower()
        if allow_fallback in {"1", "true", "yes"}:
            return FallbackProvider(primary, SecProvider(YahooProvider()))
        return primary
    if provider == "sec":
        strict = os.getenv("SEC_STRICT", "false").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        return SecProvider(YahooProvider(), strict=strict)
    if provider == "yahoo":
        return YahooProvider()
    raise ProviderUnavailable(f"Unsupported DATA_PROVIDER: {provider}")
