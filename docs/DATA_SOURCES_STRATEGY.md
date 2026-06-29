# Fundamental-Analyst Datenquellen-Strategie

Stand: 2026-06-28

## Befund aus dem Google Sheet

Das verlinkte Google Sheet ist kein reiner Google-Finance-Rechner. Der XLSX-Export
zeigt vier Blätter: `DeltaValue Value Rechner`, `Import`, `Data`, `Sheet7`.

Die eigentliche Quelle für fast alle Fundamentaldaten ist das Blatt `Import`.
Dort liegen GuruFocus-artige Labelreihen wie:

- `Annuals Income Statement Revenue`
- `Annuals Per Share Data Array Earnings Per Share (Diluted)`
- `Annuals Cashflow Statement Free Cash Flow`
- `Annuals Common Size Ratios Roic %`
- `Annuals Common Size Ratios Wacc %`
- `Annuals Valuation And Quality Interest Coverage`
- `Annuals Gurufocus Rankings ...`

Das Blatt `Data` normalisiert diese Importdaten. Der Hauptrechner greift dann
auf `Import`/`Data` zu und berechnet Wachstumsraten, Durchschnittswerte,
Schuldenquoten, Dividendendaten und die Bewertung.

`GOOGLEFINANCE` wird nur fuer Live-nahe Felder genutzt:

- Firmenname
- Beta
- aktueller Kurs

`Zacks` ist im Sheet nur ein Link zur manuellen Plausibilisierung der
Wachstumsannahme. Es ist kein automatischer Datenfeed im Sheet.

## Konsequenz

FMP ist nicht "alles", aber fuer das aktuelle Produkt die beste einfache
Primaerquelle, weil es die noetigen Statements, Ratios, Key Metrics, Quote und
Profile in einer API liefert. Mit Free-Tier-Limits ist FMP allerdings nicht
robust genug fuer Watchlists oder viele Ticker auf einmal.

## Anbieter-Research vom 2026-06-28

FMP Pricing/Docs zeigen:

- Basic/Free: 250 Calls pro Tag, eher nur zum Testen.
- Starter: 19 USD/Monat bei jaehrlicher Abrechnung, 300 Calls/Minute,
  5 Jahre Historie, US Coverage, Annual Fundamentals/Ratios.
- Premium: 49 USD/Monat bei jaehrlicher Abrechnung, 750 Calls/Minute,
  30 Jahre Historie, UK/Canada Coverage, Full Fundamentals/Ratios.
- Ultimate: 99 USD/Monat bei jaehrlicher Abrechnung, 3000 Calls/Minute,
  Global Coverage, Bulk/Batch und weitere Datensaetze.

Fuer dieses Produkt ist Starter nur dann sinnvoll, wenn zuerst US-Aktien und
5-Jahres-Logik reichen. Fuer den Spreadsheet-Nachbau mit 7-10 Jahresreihen,
Watchlists und Qualitaetskennzahlen ist Premium die realistische FMP-Stufe.

EODHD Pricing zeigt:

- Fundamentals Data Feed: 59.99 EUR/Monat.
- All-in-One: 99.99 EUR/Monat.
- Free: 20 API Calls/Tag.
- Die Seite bewirbt Fundamentaldaten fuer mehr als 120.000 Aktien/ETFs/Fonds.

EODHD ist der beste guenstigere Kandidat, falls FMP Premium zu teuer oder fuer
bestimmte Felder unzureichend ist. Dafuer braucht das Backend aber einen
zweiten Provider-Adapter und einen Feld-fuer-Feld-Test gegen AA, AAPL, NVDA,
KO und ein paar zyklische/finanzielle Aktien.

Alpha Vantage zeigt:

- Free-Limit: 25 API Requests/Tag.
- Premium beginnt bei groesserer API-Nutzung; die Docs liefern Income Statement,
  Balance Sheet, Cash Flow, Company Overview und Earnings Estimates.

Alpha Vantage ist guenstiger/leicht erreichbar, aber nicht die beste Primaerquelle
fuer dieses Tool, weil viele Qualitaets-/Ratio-Felder selbst berechnet werden
muessen und das Free-Limit fuer Watchlists praktisch unbrauchbar ist.

Yahoo ist kein guter finaler Fundamental-Provider. Es ist ein Notfall-Fallback:
brauchbar fuer Preis, Basis-Statements, FCF/BVPS/ROE-Ableitungen; schwach fuer
ROIC, WACC, Interest Coverage, Analystenwachstum und Datenherkunft.

Zacks sollte nicht gescraped werden. Die Terms of Service untersagen automatisierte
Datenerhebung/Scraping ausdruecklich. Zacks kann als Link oder manueller
Input bleiben, aber nicht als Backend-Datenquelle.

SEC `companyfacts` ist die sauberste kostenlose Zusatzquelle fuer US-Aktien:
legal, offiziell, granular und historisch. Sie ist aber roh, US-only, ohne
Live-Kurse, ohne fertige GuruFocus-Qualitaetskennzahlen und braucht XBRL-Mapping.

Alpha Vantage kann Statements schnell liefern, ersetzt GuruFocus aber nicht
vollstaendig. ROIC, WACC, Interest Coverage, Quality-Rankings und saubere
Plausibilitaet muessen weiterhin berechnet oder anders bezogen werden.

## Empfohlene Architektur

Kurzfristig:

1. FMP bleibt Primaerprovider.
2. Backend faellt bei FMP-Rate-Limits oder Provider-Ausfall zuerst auf SEC
   `companyfacts` plus Yahoo-Marktdaten zurueck.
3. Yahoo bleibt der letzte Notfall-Fallback, wenn SEC fuer den Ticker keine
   verwertbaren US-Filing-Daten liefert.
4. Die UI zeigt klar, ob FMP, SEC oder nur eingeschraenkte Fallback-Daten aktiv
   sind.
5. Fehlende Felder werden nicht geraten, sondern als `unavailable` markiert.
6. Wichtige berechenbare Felder werden aus Rohdaten abgeleitet: Margins,
   Cash/Net Debt, Debt/Equity, Cash per Share, WACC, ROE, FCF.

Mittelfristig:

1. SEC-Provider weiter ausbauen, vor allem fuer mehr XBRL-Konzepte und Edge
   Cases wie Banken, ADRs und geaenderte Fiskaljahre.
2. Optionalen Import fuer GuruFocus/CSV/XLSX erlauben, damit Nutzer ihre bezahlten
   Daten legal einspielen koennen.
3. Provider-Score pro Feld anzeigen: reported, computed, estimated, unavailable.
4. Watchlist-Batch-Modus mit Cache, Rate-Limit-Schutz und Priorisierung.

Nicht empfohlen:

- Zacks/GuruFocus/SeekingAlpha/TIKR im Backend scrapen.
- Yahoo als alleinige Quelle verkaufen.
- "Perfekte" Datenqualitaet suggerieren, wenn der Provider nur Teilwerte liefert.

## Zwei Vercel-Projekte

Der aktuelle Split ist fuer den Moment vertretbar:

- Frontend: Vite/React als statische App.
- Backend: Python/FastAPI als API-Service.

Vorteile:

- klare Runtime-Trennung
- weniger Vercel-Konfigurationsmagie
- Backend-Secrets bleiben nur im Backend-Projekt
- Frontend kann separat redeployed werden

Nachteile:

- zwei Deployments
- zwei Domains
- CORS/API-URL-Konfiguration
- mehr Env-Verwaltung

Langfristig kann ein konsolidiertes Vercel-Setup sauberer sein, wenn die
Projektstruktur stabil ist. Fuer die aktuelle Produktphase ist der Split
akzeptabel, aber nicht das Endziel.
