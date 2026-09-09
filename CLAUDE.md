# Fundamental-Analyst (deltavalue-app)

Investment-Decision-Tool für fundamentale Investoren, die zusätzlich Optionen handeln.
Ersetzt drei Google-Sheets von DeltaValue (Value-Rechner v4.0.1, Portfolio Tool v1.0.5, Optionstool v8.0)
durch eine Web-App – und geht darüber hinaus (Screener, Trade-Setups, KI). Ziel: erst für den Owner
perfekt, dann als SaaS verkaufen → **alles muss pro User konfigurierbar sein**, keine hardcodierten Portfolio-Werte.

Workflow: `Ticker → Fundamentaldaten → Quality/Decision-Score → Fair Value → Optionsstrategie → Portfolio-Risiko`

## Struktur

- `frontend/` – Vite + React 19 + TypeScript + Tailwind v4. Dark „Origin"-Dashboard-Look (siehe `src/components/AppShell.tsx`).
- `backend/` – FastAPI (Python 3.13). Datenprovider (FMP primär, SEC + Yahoo Fallback), Bewertungs-Engine, Screener, Options-/Portfolio-Rechner.
- `supabase/migrations/` – Schema: workspaces, watchlist_items, assumptions, notes, analysis_snapshots, valuation_profiles, portfolio_settings, portfolio_positions, option_strategy_templates, option_trades. RLS pro User.
- `docs/` – `IMPLEMENTATION_PLAN.md` (API-Vertrag §4, **eingefroren**), `DATA_MAPPING.md`, `DATA_SOURCES_STRATEGY.md`, `valuation-spec.ts` (getestete Referenz-Engine, Wahrheit für Formeln).

## Backend-Endpunkte

| Route | Zweck | Code |
|---|---|---|
| `GET /api/health` | Healthcheck | `app/main.py` |
| `GET /api/analyze/{ticker}` | Fundamentaldaten + Bewertung → `Analysis` | `service.py`, `valuation.py`, `providers.py` |
| `GET /api/screener/sp500` | S&P-500-Screener mit Momentum + Trade-Setup | `app/screener/*` |
| `POST /api/options/calculate` | Optionsstrategie-Rechner | `app/options/calculations.py` |
| `POST /api/portfolio/summary` | Auslastung, Kaufkraft, Allokation, FX | `app/portfolio/calculations.py` |

Frontend-Zugriff ausschließlich über `frontend/src/api/client.ts`; Typen in `frontend/src/types/*.ts` spiegeln die Pydantic-Schemas.
Routing: `/` Landing, `/app` Dashboard (`frontend/src/lib/routes.ts`). Provider-Antworten werden 30 min gecacht (Memory + `backend/.cache/fmp/`).

## Befehle

```bash
# Backend
cd backend && source .venv/bin/activate
pytest                                   # muss grün sein (57 Tests, ~1 s)
uvicorn app.main:app --port 8000

# Frontend
cd frontend && npm install
npm run dev                              # http://localhost:5173, VITE_USE_MOCK=false → gegen :8000
npm run lint && npm run build            # vor jedem Commit
```

Env: `backend/.env` (FMP_API_KEY, DATA_PROVIDER=fmp), `frontend/.env.development` (VITE_API_BASE, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY). **Niemals Secrets committen** – `.env*` ist ignoriert, nur `.env.example` und die Vite-Dateien mit Publishable Key sind getrackt.

## Regeln

- API-Vertrag `GET /api/analyze/{ticker}` → `Analysis` (`frontend/src/types/analysis.ts`) nur additiv erweitern, nie Felder umbenennen.
- Bewertungslogik: Änderungen zuerst in `docs/valuation-spec.ts` + Test, dann in `backend/app/valuation.py` spiegeln.
- Neue Berechnungen immer mit pytest-Tests (TDD wie in `backend/tests/`).
- Konservative Guardrails beibehalten (Margin of Safety, Wachstums-Caps). Keine Anlageberatungs-Sprache im UI.
- Persistenz nur über Supabase (`frontend/src/lib/supabaseWorkspace.ts`), pro User via RLS. Kein LocalStorage für Nutzerdaten.
- Sprache im UI: Deutsch. Code/Kommentare: Englisch.
- Commits: kleine, thematische Commits; `pytest` + `npm run build` grün vor Push.

## Feature-Status (Sept 2026)

Vorhanden: Fundamental-Snapshot (10J), Fair Value (EPS × Exit-KGV, geforderte Rendite, MoS), impliziertes Wachstum, Szenarien, Decision-Score, Data-Quality-Panel, Watchlist, Notizen, Screener + Momentum + Trade-Setup, Portfolio (Depotstand, Auslastung moderat/kritisch, Kaufkraft, FX), Options-Rechner (Investment-Put, Cashflow-Put, Covered Call, Bull-Put-Spread, Bear-Call-Spread; DTE, annualisierte Rendite, 20 %-Rückkaufregel, Earnings-Warnung), Options-Journal.

Offen (Reihenfolge):
1. SMA200/SMA100-Trend + R² im Fundamental-Panel (aus dem Value-Rechner-Sheet).
2. EPS-Bereinigung als KI-Feature in der App (Prompt-Logik aus Sheet „LLM-Prompts": Sondereffekte, 10 %-Wesentlichkeitsschwelle, Quellenpflicht) statt Copy-Paste-Link.
3. Portfolio-Settings-Onboarding für neue User (Depotstand, Währung, Auslastungsgrenzen) – Voraussetzung für Multi-User/SaaS.
4. Futureoptionen (FOP-Multiplier-Tabelle aus Portfolio-Sheet).
5. Auth-Flow + Landing polish, dann Vercel-Deploy (Frontend + Backend `vercel.json` vorhanden).
