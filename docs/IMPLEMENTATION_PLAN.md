# DeltaValue → Web-App: Implementierungsplan

> **Scope-Regel:** **Florian (mit Hermes) baut NUR das Frontend.** **Codex baut das Backend** (Datenanbindung + Bewertungs-Engine + API). Die einzige Verbindung zwischen beiden ist der **API-Vertrag** in Abschnitt 4. Solange beide Seiten gegen diesen Vertrag bauen, passt alles zusammen.

**Goal:** Den Google-Sheets "DeltaValue Value-Rechner v3.0.8" in eine echte Web-App umbauen: Ticker eingeben → Live-Fundamentaldaten ziehen → innerer Wert (DCF) + Margin of Safety werden berechnet und im Apple-Design angezeigt.

**Architektur:** Klare Trennung. **Backend (Codex, FastAPI/Python):** zieht Fundamentaldaten von einem austauschbaren Provider, portiert die Sheet-Formeln, liefert ein fertiges `Analysis`-JSON. **Frontend (Florian, Vite+React+TS+Tailwind):** rendert dieses JSON im Apple-Look, rechnet selbst NICHTS Finanzielles. Schnittstelle = `GET /api/analyze/{ticker}`.

**Tech Stack:** Frontend = Vite + React 19 + TypeScript + Tailwind v4. Backend = FastAPI + httpx + Pydantic. Datenquelle = Provider-Interface (Yahoo/yfinance als Gratis-Default, FMP als Drop-in). Tests = Vitest (FE), pytest (BE).

---

## 1. Was das Original-Tool kann (analysiert)

Der DeltaValue-Rechner ist ein **Value-Investing-/DCF-Bewertungstool** (Buffett/Graham-Stil). Eingabe: Ticker. Ausgabe: innerer Wert je Aktie + Über-/Unterbewertung + Sicherheitspuffer. Aufbau im Sheet:

| Block | Inhalt |
|---|---|
| Header | Ticker, Firmenname (GOOGLEFINANCE name), aktueller Kurs, akt. KGV, hist. 10yr KGV, 5yr Beta |
| Qualität / Wachstum | CAGR 10/7/5/3/1 J für: Umsatz, EPS, FCF, Buchwert/Aktie, Aktienanzahl |
| Management & Profitabilität | Net Income, ROIC, ROE, WACC (Ø 10/7/5/3/1 J). Signal: ROIC > WACC |
| Schulden | Langfr. Schulden, Schulden/FCF, Interest Coverage |
| Gewinn- & Cashflow | EPS, FCF, Operating-CF-Wachstum |
| Dividende | Dividende, Rendite, Ausschüttungsquote |
| **Bewertung (Kern)** | eEPS = EPS×(1+g)^10 → Kurs in 10J = eEPS×hist.KGV → innerer Wert = abgezinst mit geforderter Rendite → Differenz zum Kurs → MoS-Tabelle (50/40/30/20/10 %) |

**Verifizierte Formel-Kette (Alcoa-Originalwerte, dienen als Backend-Testfälle):**
- eEPS = `4.37 × 1.125^10` = **14.19** (Sheet C53)
- Kurs in 10J = `14.19 × 26.36` = **374.07** (C54)
- Innerer Wert = `374.07 / 1.15^10` = **92.46** (C58)
- Differenz = `1 − 54.10/92.46` = **41.49 % unterbewertet** (C61)
- MoS = 46.23 / 55.48 / 64.72 / 73.97 / 83.22 (C65:G65)

Default-Annahmen: geforderte Rendite **15 %** (C49), geschätztes Wachstum **12,5 %** (C50). Beide im UI editierbar.

---

## 2. Scope-Split

### Florian / Hermes → FRONTEND
- Komplettes UI im Apple-Design (Abschnitt 6).
- Ticker-Suche, Lade-/Fehlerzustände.
- Anzeige aller Analyse-Blöcke + interaktive Annahmen-Slider (Rendite/Wachstum) → triggert neuen API-Call.
- Baut zunächst gegen **Mock-JSON** (Abschnitt 5), das exakt dem Vertrag folgt → unabhängig von Codex lauffähig.

### Codex → BACKEND
- `FinancialDataProvider`-Interface + Yahoo-Default + FMP-Adapter.
- Bewertungs-Engine: 1:1-Port der Sheet-Formeln (Referenz: `docs/valuation-spec.ts`).
- `GET /api/analyze/{ticker}` liefert `Analysis`-JSON (Vertrag Abschnitt 4).
- pytest gegen die Alcoa-Werte aus Abschnitt 1.

### Gemeinsam / fix
- **Der API-Vertrag (Abschnitt 4) ist eingefroren.** Änderungen nur abgestimmt. Beide Seiten generieren ihre Typen daraus.

---

## 3. Projektstruktur

```
~/deltavalue-app/
├── docs/
│   ├── IMPLEMENTATION_PLAN.md      (dieses Dokument, kopiert)
│   ├── valuation-spec.ts           (Referenz-Engine für Codex, getestet)
│   └── CODEX_BRIEFING.md           (Auftrag an Codex)
├── frontend/                       ← Florian
│   ├── src/
│   │   ├── types/analysis.ts       (der Vertrag als TS-Typen — single source)
│   │   ├── api/client.ts           (fetch /api/analyze/{ticker}, Mock-Switch)
│   │   ├── mocks/alcoa.json         (Mock-Antwort nach Vertrag)
│   │   ├── components/…            (Apple-UI, Abschnitt 6)
│   │   └── App.tsx
│   └── …
└── backend/                        ← Codex
    └── (FastAPI app, Codex strukturiert selbst)
```

---

## 4. API-Vertrag (EINGEFROREN) — `GET /api/analyze/{ticker}`

Antwort `200`: ein `Analysis`-Objekt. Alle Geldwerte in Firmenwährung, Wachstums-/Quoten-Felder als **Dezimal** (0.0787 = 7,87 %). Wachstumswerte können den String `"neg."` sein, wenn nicht berechenbar (exakt wie Sheet).

```jsonc
{
  "ticker": "AA",
  "companyName": "Alcoa Corp",
  "currency": "USD",
  "asOf": "2026-06-28T16:00:00Z",
  "currentPrice": 54.1,
  "currentPE": 0.0,
  "historicalPE": 26.36,
  "beta": 1.56,

  "growth": {
    // jede Reihe: { y10, y7, y5, y3, y1 } — number | "neg."
    "revenue":           { "y10": 0.0137, "y7": -0.0062, "y5": 0.0668, "y3": 0.0101, "y1": 0.0787 },
    "eps":               { "y10": "neg.", "y7": 0.1852,  "y5": "neg.", "y3": "neg.", "y1": 15.81 },
    "fcf":               { "y10": 0.016,  "y7": 0.419,   "y5": 0.691,  "y3": 0.184,  "y1": 12.5 },
    "bookValuePerShare": { "y10": -0.077, "y7": -0.038,  "y5": 0.055,  "y3": -0.068, "y1": 0.165 },
    "sharesOutstanding": { "y10": 0.037,  "y7": 0.052,   "y5": 0.072,  "y3": 0.141,  "y1": 0.018 },
    "operatingCashflow": { "y10": 0.031,  "y7": 0.149,   "y5": 0.246,  "y3": 0.13,   "y1": 0.905 }
  },

  "profitability": {
    // jede Reihe: { y10, y7, y5, y3, y1 } — number | null
    "netIncome": { "y10": -29.4, "y7": -60.43, "y5": 174.4, "y3": 188.67, "y1": 1157 },
    "roic":      { "y10": 0.036, "y7": 0.029,  "y5": 0.028, "y3": 0.017,  "y1": 0.065 },
    "roe":       { "y10": -0.007,"y7": -0.017, "y5": 0.032, "y3": 0.026,  "y1": 0.205 },
    "wacc":      { "y10": 0.12,  "y7": 0.133,  "y5": 0.145, "y3": 0.134,  "y1": 0.132 }
  },
  "valueCreating": false,            // ROIC(letztes J) > WACC(letztes J)

  "debt": {
    "longTermDebt":     { "y10": 1904.7, "y7": 2062, "y5": 2034.4, "y3": 2213.33, "y1": 2438 },
    "debtToFcf":        8.01,          // letzte Schulden / Ø der letzten 2 FCF
    "interestCoverage": 4.8
  },

  "dividend": {
    "dividend":    { "y10": 0.17, "y7": 0.243, "y5": 0.34, "y3": 0.4, "y1": 0.4 },
    "yield":       null,              // letzte Div / aktueller Kurs (null wenn 0)
    "payoutRatio": { "y10": 0.083,"y7": 0.125,"y5": 0.125,"y3": 0.201,"y1": 0.106 }
  },

  // Jahresreihen für Charts/Detailtabellen (aufsteigend)
  "series": {
    "years":   [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],
    "revenue": [11199,9318,11652,13403,10433,9286,12152,12451,10551,11895,12831],
    "eps":     [-4.731,-2.19,1.49,1.33,-6.07,-0.91,2.26,-0.68,-3.65,0.26,4.37],
    "fcf":     [484,-715,819,49,307,41,530,342,-440,42,567]
    // … weitere Reihen analog optional
  },

  "assumptions": { "requiredReturn": 0.15, "estimatedGrowth": 0.125 },

  "valuation": {
    "currentEPS": 4.37,
    "estimatedGrowth": 0.125,
    "historicalPE": 26.36,
    "futureEPS": 14.19,
    "futurePrice": 374.07,
    "intrinsicValue": 92.46,         // null falls negativ ("n/a")
    "currentPrice": 54.1,
    "difference": 0.4149,            // >0 = unterbewertet (Upside)
    "marginOfSafety": [
      { "discount": 0.5, "price": 46.23 },
      { "discount": 0.4, "price": 55.48 },
      { "discount": 0.3, "price": 64.72 },
      { "discount": 0.2, "price": 73.97 },
      { "discount": 0.1, "price": 83.22 }
    ]
  }
}
```

**Annahmen überschreiben:** `GET /api/analyze/{ticker}?requiredReturn=0.12&estimatedGrowth=0.10` → Backend rechnet die `valuation` mit diesen Werten neu. Default = 0.15 / 0.125.

**Fehler:** `404` `{ "error": "ticker_not_found", "ticker": "XYZ" }` · `502` `{ "error": "provider_unavailable" }` · `429` bei Rate-Limit. Frontend zeigt für jeden Fall einen eigenen Zustand.

---

## 5. Frontend-Aufgaben (Florian / Hermes) — bite-sized

### Task F1: Vertrag als TS-Typen
- Create: `frontend/src/types/analysis.ts`
- Inhalt: Interfaces `Analysis`, `GrowthRow`, `AvgRow`, `Valuation` exakt nach Abschnitt 4. `GrowthValue = number | "neg."`.
- Verify: `npx tsc --noEmit` läuft fehlerfrei.

### Task F2: Mock-Antwort
- Create: `frontend/src/mocks/alcoa.json` — die JSON aus Abschnitt 4 (vollständig).
- Verify: Import in einer Testdatei type-checkt gegen `Analysis`.

### Task F3: API-Client mit Mock-Switch
- Create: `frontend/src/api/client.ts`
- `analyze(ticker, assumptions?)`: wenn `import.meta.env.VITE_USE_MOCK === "true"` → liefert `alcoa.json`, sonst `fetch(`${VITE_API_BASE}/api/analyze/${ticker}?…`)`.
- `.env.development`: `VITE_USE_MOCK=true`, `VITE_API_BASE=http://localhost:8000`.
- Verify: Komponente lädt Mock ohne Backend.

### Task F4: Tailwind v4 + Apple-Theme einrichten
- Modify: `frontend/src/index.css` (Tailwind import), `vite.config.ts` (@tailwindcss/postcss).
- Theme-Tokens (Abschnitt 6): Farben, Radius, Schatten, SF-Font-Stack.
- Verify: `npm run dev`, eine Test-Card rendert im Look.

### Task F5–F11: Komponenten (je 1 Datei, siehe Abschnitt 6)
F5 `TickerSearch`, F6 `ValuationHero`, F7 `MarginOfSafetyBar`, F8 `GrowthSection` (Heatmap), F9 `ProfitabilitySection` (+ROIC/WACC-Badge), F10 `DebtSection` + `DividendSection`, F11 `AssumptionControls` (Slider → re-fetch).

### Task F12: App-Verdrahtung + Zustände
- Modify: `frontend/src/App.tsx` — Suche → Loading → Render bzw. Fehlerzustände (404/502/429).
- Verify: Mock-Durchlauf end-to-end im Browser.

### Task F13: Smoke-Test
- Create: `frontend/src/api/client.test.ts` — Mock-Pfad liefert valides `Analysis`.
- Verify: `npx vitest run`.

---

## 6. Apple-Design-Spezifikation

**Prinzip:** ruhig, hochwertig, viel Weißraum — nicht das bunte Excel-Heatmap-Chaos. Apple HIG / iCloud-/Stocks-App-Ästhetik.

**Tokens:**
- Font: `-apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif`. Große Zahlen in `font-variant-numeric: tabular-nums`.
- Hintergrund: `#F5F5F7` (light) bzw. `#000` (dark). Cards: `#FFFFFF` / `#1C1C1E`.
- Akzent: System-Blau `#0071E3`. Positiv (unterbewertet/Upside): `#34C759` (grün). Negativ: `#FF3B30` (rot). Neutral-Text: `#1D1D1F`, sekundär `#86868B`.
- Radius: Cards `20px`, Buttons/Pills `12px`. Schatten: `0 4px 24px rgba(0,0,0,0.06)`, weich.
- Spacing: 8-pt-Grid. Großzügige Paddings (24–32px in Cards).
- Bewegung: sanfte `ease-out` Transitions 200–300ms; Zahlen können beim Laden hochzählen (optional).

**Layout (Desktop, zentrierte Spalte max-w ~960px):**
1. **Suchleiste** oben mittig: großes abgerundetes Eingabefeld mit Lupe, Ticker eingeben.
2. **Header-Zeile:** Firmenname groß, Ticker als graue Pille, daneben aktueller Kurs; rechts kleine Stat-Pills (KGV, hist. KGV, Beta).
3. **Hero-Card „Innerer Wert":** dominante große Zahl (intrinsicValue), darunter aktueller Kurs, und ein farbiges Badge „**41,5 % unterbewertet**" (grün) bzw. „überbewertet" (rot). Subtiler Verlauf im Hintergrund.
4. **Margin-of-Safety-Leiste:** 5 Pills (50→10 %) mit Zielpreisen; aktueller Kurs als Markierung darauf, damit man sieht, in welcher Sicherheitszone man kauft.
5. **Annahmen-Controls:** zwei elegante Slider (Geforderte Rendite, Geschätztes Wachstum) — verändert Hero live (re-fetch oder, falls Engine-Werte mitgeliefert, clientseitige Reskalierung; Default: re-fetch).
6. **Sektions-Cards** (je eine Card, dezente Trennlinien): Wachstum, Profitabilität (mit grünem „wertschaffend"-Badge wenn ROIC>WACC), Schulden, Dividende. Heatmap nur als **dezente** farbige Punkte/Hintergründe (Apple-Pastell), nicht knallig. `"neg."` als schlichtes graues Label.
7. **Mobile:** Cards stapeln, Hero bleibt oben, Slider als Bottom-Sheet-tauglich.

**Was wir vom Original NICHT übernehmen:** grelle Rot/Grün-Vollflächen, Gitterlinien-Optik, Excel-Spaltenköpfe. Stattdessen Karten, Typo-Hierarchie, Luft.

---

## 7. Backend-Aufgaben (Codex) — Kurzfassung (Details: docs/CODEX_BRIEFING.md)

1. `FinancialDataProvider`-Protokoll: `get_fundamentals(ticker) -> RawFinancials`.
2. `YahooProvider` (yfinance) als Default; `FmpProvider` (httpx + `FMP_API_KEY`) als Drop-in, per `DATA_PROVIDER` env umschaltbar.
3. Engine: 1:1-Port von `docs/valuation-spec.ts` nach Python. CAGR/yoy/avg/median/computeValuation exakt wie dort.
4. Mapping RawFinancials → `Analysis` (Vertrag Abschnitt 4).
5. FastAPI: `GET /api/analyze/{ticker}` (+ optionale Query-Annahmen), CORS für `localhost:5173`.
6. pytest: Engine gegen Alcoa-Werte (intrinsic 92.46, diff 0.4149, eEPS 14.19, MoS-Stufen). `/api/analyze/AAPL` Integrationstest (Live).

---

## 8. Reihenfolge / Integration

1. **Parallel & unabhängig:** Florian baut FE gegen Mock (Tasks F1–F13). Codex baut BE (Tasks 1–6). Niemand wartet.
2. **Integration:** `VITE_USE_MOCK=false`, `VITE_API_BASE` auf Codex-Backend. Ein echter Ticker durchklicken.
3. **Abnahme:** Alcoa-Werte stimmen mit Original-Sheet überein; ein Live-Ticker (z. B. AAPL) liefert plausible Bewertung; alle Fehlerzustände greifen.

---

## 9. Risiken & offene Punkte

- **Datenqualität Yahoo:** ROIC/WACC liefert yfinance nicht direkt → Codex muss sie berechnen (ROIC = NOPAT/InvCapital; WACC approximieren) oder Felder als `null` lassen. FMP liefert ROIC fertig. **Empfehlung:** Felder, die der Provider nicht hat, als `null` zurückgeben statt zu raten; UI zeigt „—".
- **Hist. 10yr KGV:** im Sheet teils manuell. Codex: Median der jährlichen KGV (Kurs/EPS) der letzten 10 J; bei negativem EPS-Jahr ausschließen.
- **Annahmen-Slider:** entscheidet, ob re-fetch (einfach, Default) oder client-seitige Neuberechnung (schneller, aber dann lebt ein Teil der Engine doch im FE). **Default laut Scope: re-fetch**, Engine bleibt komplett im Backend.
- **TTM vs. Fiskaljahr:** letzter Reihen-Punkt sollte konsistent TTM oder letztes FY sein — Codex dokumentiert, was geliefert wird, FE labelt es entsprechend.
- **Währung:** `currency`-Feld nutzen, Beträge nicht hart als $ formatieren.

---

## 10. Nächste Schritte

1. Florian segnet diesen Plan + den API-Vertrag (Abschnitt 4) ab.
2. Hermes legt `docs/valuation-spec.ts`, `docs/CODEX_BRIEFING.md` und `frontend/src/types/analysis.ts` + Mock an (Vertrag fixieren).
3. Florian/Hermes starten Frontend-Tasks F1–F13. Parallel: Codex-Briefing an Codex übergeben.
