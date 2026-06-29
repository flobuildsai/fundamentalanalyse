# DeltaValue — Daten-Mapping & Quellen

> Ziel: Jedes Feld im API-Vertrag (`Analysis`) auf seine **Original-Quelle** (DeltaValue-Sheet) und unsere **neuen Quellen** (FMP primär, Yahoo Fallback) abbilden. So weiß das Backend genau, welcher Endpoint welches Feld füllt und welche realistisch `null` bleiben.

## So funktioniert das Original (analysiert)

Das DeltaValue-Sheet ist eine **3-Quellen-Maschine**:

1. **GuruFocus** (kostenpflichtig, manuell ins `Import`-Sheet kopiert) → **alle Fundamentaldaten**, 10 Jahre + TTM, als komma-separierte Strings. GuruFocus liefert sogar **ROIC und WACC fertig berechnet** — das ist der Clou des Originals.
2. **GOOGLEFINANCE** (live) → aktueller Kurs, Beta, Firmenname.
3. **Zacks** (manuell abgelesen) → Analysten-Langfristwachstum, das der Nutzer von Hand in „Geschätztes Wachstum" (C50) einträgt. Das Sheet **verlinkt** Zacks nur, zieht nicht automatisch.

Jede Datenzeile im Hauptblatt holt sich ihren Wert per
`LOOKUP(Jahr, Import!2:2, INDIRECT(... MATCH("<GuruFocus-Label>", Import!A:A) ...))`.

## Unsere Strategie: „wie DeltaValue oder besser"

- **FMP als Primärquelle** (du hast den Key). Deckt fast alles ab, was GuruFocus liefert — inkl. ROIC. WACC liefert FMP **nicht** als fertige Reihe → wir berechnen es selbst (siehe unten) statt es wie das Original einfach einzukaufen. Damit sind wir gleichwertig.
- **Yahoo (yfinance) als Fallback** ohne Key — füllt das Meiste, lässt ROIC/WACC/Interest-Coverage aber `null`.
- **Zacks-Wachstum** → ersetzt durch den **Annahmen-Slider** (manuelle Eingabe wie im Original) **plus** optional FMP-Analystenschätzung als Vorbelegung. Das bildet den Original-Workflow 1:1 nach.

---

## Feld-für-Feld-Mapping

Legende Verfügbarkeit: ✅ direkt · 🟡 berechenbar aus anderen Feldern · ❌ nicht verfügbar (→ `null`)

### Header / Kurs

| Analysis-Feld | Original (Sheet) | GuruFocus-Label | FMP-Quelle | Yahoo |
|---|---|---|---|---|
| `currentPrice` | GOOGLEFINANCE | — | `/quote` → `price` | ✅ `info.currentPrice` |
| `currentPE` | GuruFocus akt. | `Valuation Ratios Pe Ratio` (letzte) | `/quote` → `pe` | ✅ `info.trailingPE` |
| `historicalPE` | `MEDIAN` der PE-Reihe | `Annuals Valuation Ratios Pe Ratio` | 🟡 Median(Kurs/EPS je Jahr) aus `/ratios` `priceEarningsRatio` | 🟡 selbst rechnen |
| `beta` | GOOGLEFINANCE beta | — | `/profile` → `beta` | ✅ `info.beta` |
| `companyName` | GOOGLEFINANCE name | — | `/profile` → `companyName` | ✅ `info.longName` |
| `currency` | — | — | `/profile` → `currency` | ✅ `info.currency` |

### Wachstum (Jahresreihen → CAGR)

| Analysis-Feld | GuruFocus-Label | FMP-Endpoint/Feld | Yahoo |
|---|---|---|---|
| `growth.revenue` | `Annuals Income Statement Revenue` | `/income-statement` → `revenue` | ✅ `income_stmt` Total Revenue |
| `growth.eps` | `Per Share Data Array Earnings Per Share (Diluted)` | `/income-statement` → `epsdiluted` | ✅ `income_stmt` Diluted EPS |
| `growth.fcf` | `Cashflow Statement Free Cash Flow` | `/cash-flow-statement` → `freeCashFlow` | 🟡 OpCF − CapEx |
| `growth.bookValuePerShare` | `Per Share Data Array Book Value Per Share` | 🟡 `/balance-sheet` totalEquity / shares | 🟡 selbst rechnen |
| `growth.sharesOutstanding` | `Valuation And Quality Shares Outstanding (Eop)` | `/income-statement` → `weightedAverageShsOutDil` | ✅ shares |
| `growth.operatingCashflow` | `Cashflow Statement Cash Flow From Operations` | `/cash-flow-statement` → `operatingCashFlow` | ✅ `cashflow` |

### Profitabilität (Ø-Reihen)

| Analysis-Feld | GuruFocus-Label | FMP | Yahoo |
|---|---|---|---|
| `profitability.netIncome` | `Income Statement Net Income` | `/income-statement` → `netIncome` | ✅ |
| `profitability.roic` | `Common Size Ratios Roic %` ✅fertig | `/key-metrics` → `roic` ✅ | ❌ → `null` |
| `profitability.roe` | `Common Size Ratios Roe %` | `/ratios` → `returnOnEquity` ✅ | 🟡 NI/Equity |
| `profitability.wacc` | `Common Size Ratios Wacc %` ✅fertig | ❌ → **selbst berechnen** (CAPM, s.u.) | ❌ → `null` |
| `valueCreating` | ROIC>WACC letztes Jahr | aus obigem | nur wenn beide vorhanden |

### Schulden

| Analysis-Feld | GuruFocus-Label | FMP | Yahoo |
|---|---|---|---|
| `debt.longTermDebt` | `Balance Sheet Long-term Debt` | `/balance-sheet` → `longTermDebt` | ✅ |
| `debt.debtToFcf` | berechnet (Schulden/Ø2J-FCF) | 🟡 aus obigem | 🟡 |
| `debt.interestCoverage` | `Valuation And Quality Interest Coverage` | `/ratios` → `interestCoverage` ✅ | ❌ → `null` |

### Dividende

| Analysis-Feld | GuruFocus-Label | FMP | Yahoo |
|---|---|---|---|
| `dividend.dividend` | `Per Share Data Array Dividends Per Share` | `/key-metrics` → `dividendPerShare` | ✅ |
| `dividend.yield` | berechnet (letzte Div/Kurs) | 🟡 | ✅ |
| `dividend.payoutRatio` | `Common Size Ratios Dividend Payout Ratio` | `/ratios` → `payoutRatio` ✅ | 🟡 |

### Bewertung (Engine — quellenunabhängig)

`valuation.*` wird **immer in unserer Engine gerechnet** (valuation.py), nicht vom Provider geliefert. Inputs: `currentEPS` (= letzter EPS), `historicalPE`, `currentPrice` + Annahmen (Slider).

| Analysis-Feld | GuruFocus-Label (für `cashPerShare`) | FMP |
|---|---|---|
| `valuation.*` Cash je Aktie | `Balance Sheet Cash, Cash Equivalents, Marketable Securities` | `/balance-sheet` → `cashAndShortTermInvestments` / shares |

---

## WACC selbst berechnen (FMP/Yahoo, da nicht fertig geliefert)

GuruFocus lieferte WACC fertig — wir bauen es nach (CAPM), damit wir **gleichwertig oder besser** sind:

```
Cost of Equity (CAPM) = riskFree + beta × marketPremium      (riskFree≈4.3%, premium≈5%)
Cost of Debt          = interestExpense / totalDebt × (1 − taxRate)
WACC = E/(E+D) × CostEquity + D/(E+D) × CostDebt
       E = Marktkap., D = Gesamtschulden
```
FMP liefert alle Inputs (`/profile` beta, `/income-statement` interestExpense + incomeTaxExpense, `/balance-sheet` totalDebt, `/quote` marketCap). Wenn ein Input fehlt → `wacc=null`. **Konstanten (riskFree, premium) als Env konfigurierbar.**

---

## „Besser als DeltaValue" — konkrete Upgrades

Da wir FMP + eigene Engine haben, statt manuellem GuruFocus-Copy-paste:

1. **Vollautomatisch** statt Strings ins Sheet kopieren — Ticker eingeben reicht.
2. **WACC selbst gerechnet & transparent** (Formel sichtbar) statt Blackbox-Wert.
3. **Analysten-Wachstum optional aus FMP** (`/analyst-estimates` → `estimatedEpsGrowth`) als Slider-Vorbelegung — ersetzt den manuellen Zacks-Schritt, lässt ihn aber editierbar.
4. **Mehrere Szenarien** über die Slider (Original: nur ein fixer Wert).
5. **Live-Kurs** statt 20-Min-verzögertem GOOGLEFINANCE.

---

## FMP-Endpoints (Sammelliste für Codex)

Pro Ticker, `?period=annual&limit=11` für 10J+TTM:
- `/api/v3/profile/{t}` — name, currency, beta, sector
- `/api/v3/quote/{t}` — price, pe, marketCap, eps
- `/api/v3/income-statement/{t}` — revenue, epsdiluted, netIncome, interestExpense, incomeTaxExpense, weightedAverageShsOutDil
- `/api/v3/balance-sheet-statement/{t}` — longTermDebt, totalDebt, totalStockholdersEquity, cashAndShortTermInvestments
- `/api/v3/cash-flow-statement/{t}` — operatingCashFlow, freeCashFlow, capitalExpenditure
- `/api/v3/ratios/{t}` — returnOnEquity, interestCoverage, payoutRatio, priceEarningsRatio
- `/api/v3/key-metrics/{t}` — roic, dividendPerShare, bookValuePerShare
- `/api/v3/analyst-estimates/{t}` — estimatedEpsGrowth (optional, Slider-Default)

> **API-Key:** `FMP_API_KEY` in `backend/.env` (NICHT committen). `DATA_PROVIDER=fmp` aktiviert FMP, sonst `yahoo`.

---

## ENTSCHEIDUNG: Fehlende Felder + Kennzeichnung (verbindlich)

**Strategie:** FMP berechnet fehlende Felder wo sinnvoll (ROE/BVPS/FCF/WACC aus Rohdaten);
Yahoo-Fallback lässt nicht-lieferbare Felder `null` („—"). **Jeder Wert wird mit seiner
Herkunft gekennzeichnet** — das ist Pflicht, damit klar ist was hart aus der Quelle kommt
und was unsere Rechnung ist.

### Provenance-Flag (NEU im Vertrag — additiv, optional)

Jedes potenziell berechnete Feld bekommt einen Herkunfts-Marker. Umsetzung:
ein paralleles `provenance`-Objekt in `Analysis`, das pro Feldpfad einen dieser Werte trägt:

| Wert | Bedeutung | UI-Kennzeichnung |
|---|---|---|
| `reported` | direkt vom Provider geliefert | (kein Marker) |
| `computed` | von uns aus Rohdaten berechnet (z.B. WACC per CAPM, BVPS = Equity/Shares) | kleines „ƒ" + Tooltip „berechnet: <Formel>" |
| `estimated` | Schätzung/Annahme (z.B. Analysten-Wachstum als Slider-Default) | kleines „~" + Tooltip |
| `unavailable` | Quelle liefert nicht, nicht berechenbar → Feld ist `null` | „—" in Grau |

```jsonc
// additiv in der Analysis-Antwort:
"provenance": {
  "profitability.wacc": "computed",
  "profitability.roic": "reported",
  "profitability.roe":  "computed",
  "growth.fcf":         "computed",
  "dividend.yield":     "computed",
  "assumptions.estimatedGrowth": "estimated"
},
"dataSource": "fmp"   // "fmp" | "sec" | "yahoo"  — welche Primärquelle aktiv war
```

Felder ohne Eintrag in `provenance` gelten als `reported`. Das Flag ist **optional/additiv** —
bricht den bestehenden Vertrag nicht; Frontend-Mock ohne `provenance` rendert weiter ohne Marker.

### Pro Provider

- **FMP:** Reihenfolge je Feld = (1) direkt liefern → `reported`; (2) sonst aus Rohdaten
  berechnen → `computed`; (3) sonst `null` → `unavailable`.
- **SEC:** offizielle `companyfacts` fuer US-Filing-Reihen → `reported`; einfache
  Ableitungen wie FCF, BVPS, ROE, Payout Ratio und Interest Coverage → `computed`;
  Live-Kurs, Beta, Analystenwachstum, ROIC und WACC werden nicht von SEC geliefert.
- **Yahoo:** (1) direkt → `reported`; (2) einfache Ableitungen (FCF=OpCF−CapEx, ROE=NI/Equity)
  → `computed`; (3) ROIC/WACC/InterestCoverage bleiben `null` → `unavailable`. Yahoo NICHT
  mit fragwürdigen Schätzungen aufblähen.
