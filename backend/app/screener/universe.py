"""Universe loading utilities for the S&P 500 screener."""

from __future__ import annotations

import csv
import json
import urllib.request
from io import StringIO
from pathlib import Path
from typing import Any

from app.screener.schemas import UniverseMember

_DATAHUB_SP500_CSV = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"
_DEFAULT_CACHE = Path(__file__).resolve().parents[2] / ".cache" / "universe" / "sp500.json"
_MIN_REAL_UNIVERSE_SIZE = 100

_FALLBACK_ROWS = [
    {"Symbol": "AAPL", "Security": "Apple Inc.", "GICS Sector": "Information Technology", "GICS Sub-Industry": "Technology Hardware"},
    {"Symbol": "MSFT", "Security": "Microsoft Corporation", "GICS Sector": "Information Technology", "GICS Sub-Industry": "Systems Software"},
    {"Symbol": "NVDA", "Security": "NVIDIA Corporation", "GICS Sector": "Information Technology", "GICS Sub-Industry": "Semiconductors"},
    {"Symbol": "KO", "Security": "The Coca-Cola Company", "GICS Sector": "Consumer Staples", "GICS Sub-Industry": "Soft Drinks"},
    {"Symbol": "TSLA", "Security": "Tesla, Inc.", "GICS Sector": "Consumer Discretionary", "GICS Sub-Industry": "Automobiles"},
]


def normalize_ticker(symbol: str) -> str:
    """Normalize S&P symbols to the Yahoo/yfinance dash convention."""

    return symbol.strip().upper().replace(".", "-")


def _field(row: dict[str, Any], *names: str) -> str | None:
    for name in names:
        value = row.get(name)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def parse_sp500_rows(rows: list[dict[str, Any]]) -> list[UniverseMember]:
    """Parse CSV/Wikipedia-style rows into normalized universe members."""

    members: list[UniverseMember] = []
    for row in rows:
        symbol = _field(row, "Symbol", "Ticker", "ticker")
        company = _field(row, "Security", "Company", "company")
        if not symbol or not company:
            continue
        members.append(
            UniverseMember(
                ticker=normalize_ticker(symbol),
                company=company,
                sector=_field(row, "GICS Sector", "Sector", "sector"),
                industry=_field(row, "GICS Sub-Industry", "Industry", "industry"),
            )
        )
    return members


def _read_cache(cache_path: Path) -> list[UniverseMember] | None:
    try:
        raw = json.loads(cache_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, list):
        return None
    members = [UniverseMember.model_validate(item) for item in raw]
    return members if len(members) >= _MIN_REAL_UNIVERSE_SIZE else None


def _write_cache(cache_path: Path, members: list[UniverseMember]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps([member.model_dump(by_alias=True) for member in members], indent=2),
    )


def _fetch_datahub_members() -> list[UniverseMember]:
    request = urllib.request.Request(
        _DATAHUB_SP500_CSV,
        headers={"User-Agent": "Fundamental-Analyst/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        text = response.read().decode("utf-8")
    rows = list(csv.DictReader(StringIO(text)))
    return parse_sp500_rows(rows)


def load_sp500_universe(cache_path: Path = _DEFAULT_CACHE) -> list[UniverseMember]:
    """Load S&P 500 members from cache/CSV with a small offline fallback."""

    cached = _read_cache(cache_path)
    if cached:
        return cached

    try:
        members = _fetch_datahub_members()
    except Exception:
        members = parse_sp500_rows(_FALLBACK_ROWS)

    if not members:
        members = parse_sp500_rows(_FALLBACK_ROWS)
    if len(members) >= _MIN_REAL_UNIVERSE_SIZE:
        try:
            _write_cache(cache_path, members)
        except OSError:
            pass
    return members
