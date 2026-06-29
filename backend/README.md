# DeltaValue Backend

FastAPI backend for `GET /api/analyze/{ticker}`. It fetches normalized
fundamentals, runs the DeltaValue valuation formulas, and returns the frozen
`Analysis` JSON contract used by the frontend.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Run tests

```bash
pytest
```

## Start the API

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then call:

```bash
curl http://localhost:8000/api/analyze/AAPL
```

## Environment

- `DATA_PROVIDER=yahoo` selects Yahoo Finance via `yfinance`. This is the
  default and does not need an API key.
- `DATA_PROVIDER=fmp` selects Financial Modeling Prep as the primary provider.
- `DATA_PROVIDER=sec` selects SEC EDGAR `companyfacts` for official US filing
  fundamentals and uses Yahoo only for market data such as price, beta, and
  current P/E.
- `FMP_API_KEY=...` is required when `DATA_PROVIDER=fmp`.
- `ALLOW_YAHOO_FALLBACK=true` lets the API fall back to Yahoo when FMP is rate
  limited or temporarily unavailable. With the SEC layer enabled, the fallback
  path is FMP -> SEC companyfacts + Yahoo market data -> Yahoo market data.
  Unknown tickers are not hidden by the FMP fallback.
- `RISK_FREE_RATE=0.043` configures the risk-free rate used for FMP WACC.
- `MARKET_PREMIUM=0.05` configures the market-risk premium used for FMP WACC.
- `CACHE_TTL_SECONDS=1800` caches normalized provider fundamentals in memory per
  provider/ticker for 30 minutes. Slider assumption changes reuse these
  fundamentals and recompute valuation locally.
- `FMP_REQUEST_DELAY_MS=100` spaces FMP endpoint calls sequentially. The
  default is tuned for the FMP paid tiers; raise it if you hit upstream limits.
- `FMP_CACHE_TTL_SECONDS=1800` additionally caches normalized FMP fundamentals
  on disk per ticker for 30 minutes. Set it to `0` to disable the disk cache.
- `FMP_HTTP_TIMEOUT_SECONDS=30` controls the per-request HTTP timeout used with
  FMP retries and backoff.
- `FMP_CACHE_DIR=...` optionally overrides the persistent JSON cache directory.
  By default the backend writes to `backend/.cache/fmp/`.
- `SEC_USER_AGENT=...` configures the User-Agent sent to `sec.gov`. Use a
  product name plus contact email, as requested by SEC fair-access guidance.
- `SEC_COMPANY_TICKERS_TTL_SECONDS=604800` caches the SEC ticker-to-CIK map for
  seven days.
- `SEC_HTTP_TIMEOUT_SECONDS=12` controls SEC request timeout.
- `SEC_STRICT=false` lets `DATA_PROVIDER=sec` return Yahoo-only data when a
  ticker is not covered by SEC. Set it to `true` to fail instead.

To activate FMP locally, create `backend/.env` from `.env.example` and set your
key:

```env
FMP_API_KEY=your-fmp-key
DATA_PROVIDER=fmp
RISK_FREE_RATE=0.043
MARKET_PREMIUM=0.05
CACHE_TTL_SECONDS=1800
FMP_REQUEST_DELAY_MS=100
FMP_CACHE_TTL_SECONDS=1800
FMP_HTTP_TIMEOUT_SECONDS=30
SEC_USER_AGENT=Fundamental-Analyst your-email@example.com
```

`backend/.env` is loaded automatically for local API runs without overriding
real shell or Vercel environment variables. On Vercel, set the same variables in
the Vercel project settings; local `.env` files are intentionally ignored for
deployments.

FMP is the full-data provider. It maps price and market cap from `/quote`,
company metadata and beta from `/profile`, annual statements from
`/income-statement`, `/balance-sheet-statement`, `/cash-flow-statement`, ratios
from `/ratios`, and ROIC/dividend/BVPS metrics from `/key-metrics`.

When FMP is selected through `create_provider()`, Yahoo is used only as an
availability fallback for provider failures or rate limits. The first fallback
attempt uses official SEC EDGAR `companyfacts` for US filing fundamentals and
Yahoo only for market data. The response still keeps `dataSource` and
`provenance` explicit, so the frontend can show when the analysis is based on
FMP, SEC filings, or limited Yahoo fallback data.

SEC does not provide live prices, beta, analyst estimates, ready-made ROIC, or
WACC. The backend therefore uses SEC for official annual statement rows such as
revenue, EPS, operating cash flow, capex/FCF, net income, equity, debt, cash,
interest expense, and dividends. It computes simple ratios such as FCF, BVPS,
ROE, payout ratio, and interest coverage where the raw XBRL facts support that.
ROIC and WACC remain `null`/`unavailable` in SEC mode instead of being guessed.

FMP does not return WACC as a ready-made field. The backend computes it with:

```text
Cost of Equity = RISK_FREE_RATE + beta * MARKET_PREMIUM
Cost of Debt   = interestExpense / totalDebt * (1 - taxRate)
WACC           = E/(E+D) * Cost of Equity + D/(E+D) * Cost of Debt
E = marketCap, D = totalDebt
```

`taxRate` comes from `incomeTaxExpense / incomeBeforeTax`, with a fallback to
`incomeTaxExpense / (netIncome + incomeTaxExpense)` when FMP omits pretax
income. If a required input is missing, WACC is returned as `null` and marked
`unavailable` in `provenance`.

Provider responses are cached after normalization as raw `RawFinancials`, not
as a finished `Analysis` response. Repeating the same provider/ticker within
`CACHE_TTL_SECONDS`, including changing `requiredReturn` or `estimatedGrowth`,
reuses cached fundamentals and recomputes valuation locally. Concurrent
requests for the same provider/ticker share one in-flight fetch. FMP also has a
persistent JSON cache controlled by `FMP_CACHE_TTL_SECONDS`, so warm restarts can
avoid upstream calls too.

For the first uncached load, FMP endpoints are fetched sequentially. `profile`
and `quote` are required. Annual fundamentals endpoints are treated as optional
under rate limiting: if `income-statement`, `balance-sheet-statement`,
`cash-flow-statement`, `ratios`, or `key-metrics` still returns `402`/`429`
after retries, the backend returns a partial analysis with the missing fields
marked `unavailable` in `provenance`.

Yahoo returns annual fiscal-year statement data from the latest available
filings. It does not reliably provide WACC, ROIC, or interest coverage, so those
fields are returned as `null` and marked `unavailable` instead of being guessed.
Simple derivations such as FCF, BVPS, ROE, dividend yield, and debt-to-FCF are
marked `computed`.

## Valuation guardrails

The original sheet formula is still the base model, but the production API now
adds guardrails before returning a decision:

- cyclicals with repeated EPS/FCF losses use normalized EPS instead of blindly
  projecting a peak year;
- extreme historical P/E values are capped, with stricter caps for cyclicals;
- every response includes `valuation.guardrails` with confidence, EPS basis,
  effective P/E, raw historical P/E, and warnings;
- `decision` summarizes valuation, quality, balance sheet, and data reliability
  into an explainable score. It is an analysis aid, not investment advice.
