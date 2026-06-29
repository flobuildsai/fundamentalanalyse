# Codex-Briefing: DeltaValue Backend

> **An:** Codex / GPT-5.5
> **Von:** Frontend-Team (Florian + Hermes)
> **Status:** Frontend wird parallel gegen den Mock gebaut. Du baust das Backend gegen denselben Vertrag. Niemand wartet.

## Dein Auftrag in einem Satz

Baue ein **FastAPI-Backend**, das `GET /api/analyze/{ticker}` bedient: zieh Live-Fundamentaldaten, portiere die DeltaValue-Bewertungsformeln und liefere exakt das `Analysis`-JSON aus dem Vertrag.

## Der Vertrag (EINGEFROREN)

Die genaue Antwortform steht in **`docs/IMPLEMENTATION_PLAN.md` §4** und als TypeScript in **`frontend/src/types/analysis.ts`**. Eine vollständige Beispielantwort liegt als **`frontend/src/mocks/alcoa.json`**. Dein JSON muss strukturell identisch sein. Generiere deine Pydantic-Modelle aus diesem Vertrag.

## Die Bewertungs-Engine (REFERENZ — 1:1 portieren)

**`docs/valuation-spec.ts`** ist die getestete Referenz-Implementierung der Sheet-Formeln. Portiere sie 1:1 nach Python. **`docs/valuation-spec.test.ts`** enthält die Sollwerte. Deine pytest-Tests MÜSSEN diese Alcoa-Werte treffen:

| Größe | Sollwert | Formel |
|---|---|---|
| futureEPS (eEPS) | **14.1908** | `currentEPS × (1+g)^10` |
| futurePrice | **374.0693** | `eEPS × historicalPE` |
| intrinsicValue | **92.4642** | `futurePrice / (1+r)^10`; <0 → null |
| difference | **0.4149** | `1 − currentPrice/intrinsicValue` |
| MoS (50/40/30/20/10 %) | 46.23 / 55.48 / 64.72 / 73.97 / 83.22 | `intrinsic × (1−d)` |

Default-Annahmen: `requiredReturn=0.15`, `estimatedGrowth=0.125`. Beide als Query-Parameter überschreibbar: `?requiredReturn=0.12&estimatedGrowth=0.10` → `valuation` neu rechnen.

**Formel-Eigenheiten exakt übernehmen** (siehe valuation-spec.ts):
- CAGR: `"neg."` wenn Endwert ≤ 0 oder Startwert = 0 oder Ratio ≤ 0.
- 1-Jahres-Wachstum: `"neg."` wenn `g < −1`.
- Jahresreihen aufsteigend, letzter Punkt = aktuellster (TTM oder letztes FY — dokumentiere, was du lieferst).

## Datenanbindung (austauschbar bauen)

Definiere ein **`FinancialDataProvider`-Protokoll**: `get_fundamentals(ticker) -> RawFinancials`. Zwei Implementierungen:

1. **`YahooProvider`** (yfinance) — Default, gratis, kein Key. Lauffähig out-of-the-box.
2. **`FmpProvider`** (httpx + `FMP_API_KEY`) — Drop-in für bessere Daten.

Umschaltbar per Env `DATA_PROVIDER=yahoo|fmp`.

**Felder, die der Provider nicht liefert (z. B. ROIC/WACC bei Yahoo): als `null` zurückgeben, NICHT raten.** Das Frontend zeigt dann "—". FMP liefert ROIC fertig; Yahoo musst du ggf. berechnen (ROIC = NOPAT/InvestedCapital) oder null lassen.

- **Hist. 10yr KGV:** Median der jährlichen Kurs/EPS der letzten 10 J, Jahre mit negativem EPS ausschließen.

## API

- `GET /api/analyze/{ticker}` → 200 `Analysis` | 404 `{"error":"ticker_not_found","ticker":...}` | 502 `{"error":"provider_unavailable"}` | 429 `{"error":"rate_limited"}`.
- CORS: erlaube `http://localhost:5173` (Vite-Dev) und `http://localhost:4173` (Vite-Preview).
- Server auf Port **8000** (Frontend erwartet `VITE_API_BASE=http://localhost:8000`).

## Definition of Done

- [ ] `pytest` grün, inkl. Alcoa-Engine-Werte oben.
- [ ] `GET /api/analyze/AAPL` liefert validen `Analysis`-Body mit Live-Daten.
- [ ] Yahoo-Default ohne API-Key lauffähig; FMP per Env aktivierbar.
- [ ] Antwort validiert gegen `frontend/src/types/analysis.ts` (gleiche Felder/Typen wie `alcoa.json`).
- [ ] Fehlerfälle (unbekannter Ticker, Provider down) liefern die definierten Error-Bodies.

## Nicht dein Scope

UI, Styling, alles unter `frontend/`. Das macht das Frontend-Team. Fass den Vertrag (`types/analysis.ts`, `§4`) nicht einseitig an — Änderungen nur abgestimmt.
