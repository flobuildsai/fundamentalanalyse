from __future__ import annotations

from pathlib import Path

from app.screener import universe
from app.screener.universe import load_sp500_universe, normalize_ticker, parse_sp500_rows


def test_normalize_ticker_converts_dot_classes_for_yfinance() -> None:
    assert normalize_ticker("BRK.B") == "BRK-B"
    assert normalize_ticker(" bf.b ") == "BF-B"
    assert normalize_ticker("AAPL") == "AAPL"


def test_parse_sp500_rows_keeps_ticker_company_and_sector() -> None:
    rows = parse_sp500_rows(
        [
            {"Symbol": "AAPL", "Security": "Apple Inc.", "GICS Sector": "Information Technology", "GICS Sub-Industry": "Hardware"},
            {"Symbol": "BRK.B", "Security": "Berkshire Hathaway", "GICS Sector": "Financials", "GICS Sub-Industry": "Holding"},
        ]
    )

    assert rows[0].ticker == "AAPL"
    assert rows[0].company == "Apple Inc."
    assert rows[0].sector == "Information Technology"
    assert rows[1].ticker == "BRK-B"


def test_load_sp500_universe_does_not_fail_when_runtime_cache_is_unwritable(monkeypatch) -> None:
    rows = [
        universe.UniverseMember(ticker=f"T{i}", company=f"Company {i}")
        for i in range(101)
    ]

    monkeypatch.setattr(universe, "_fetch_datahub_members", lambda: rows)

    def raise_os_error(_cache_path: Path, _members: list[universe.UniverseMember]) -> None:
        raise OSError("read-only filesystem")

    monkeypatch.setattr(universe, "_write_cache", raise_os_error)

    assert load_sp500_universe(Path("/tmp/does-not-matter/sp500.json")) == rows
