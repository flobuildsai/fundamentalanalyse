# Fundamental-Analyst

Umbau des Google-Sheets *DeltaValue Value-Rechner v3.0.8* in ein echtes
Fundamental-Analyse-Dashboard im Apple-Design.

Aktueller Fokus: echte Fundamentaldaten, konservative Bewertungs-Guardrails,
Decision-Score, Watchlist, pro Aktie gespeicherte Annahmen und Notizen.

## Struktur
- `frontend/` — Vite + React + TS + Tailwind v4. **Fundamental-Analyst UI.**
- `backend/`  — FastAPI. Datenanbindung + Bewertungs-Engine. **Baut Codex.**
- `docs/`     — Plan, API-Vertrag, Engine-Referenz, Codex-Briefing.

## Frontend starten
```bash
cd frontend
npm install
npm run dev        # läuft gegen Demo-Mock (VITE_USE_MOCK=true)
```
Ticker `AA` (Alcoa) ist im Demo-Modus hinterlegt.

## Schnittstelle
`GET /api/analyze/{ticker}` → `Analysis`-JSON. Definiert in
`docs/IMPLEMENTATION_PLAN.md` §4 und `frontend/src/types/analysis.ts`.
Beispielantwort: `frontend/src/mocks/alcoa.json`.

## Für Codex
Siehe `docs/CODEX_BRIEFING.md` + `docs/valuation-spec.ts` (getestete Engine-Referenz).
