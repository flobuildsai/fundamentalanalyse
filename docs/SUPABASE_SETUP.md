# Fundamental-Analyst Supabase Setup

Stand: 2026-06-28

## Zielbild

Supabase ist die persistente Produktschicht, nicht der Ersatz fuer die
Analyse-Engine.

- Frontend bleibt lokal-first und synchronisiert optional.
- FastAPI bleibt Provider-/Valuation-Backend.
- Supabase speichert Workspace-Daten, Auth, Snapshots und spaeter Provider-Cache.

## Projekt

- Name: `fundamental-analyst`
- Project ID / Ref: `yhdblgvclqbzudceifrs`
- Region: `eu-west-1`
- URL: `https://yhdblgvclqbzudceifrs.supabase.co`
- Organisation: `aplfgzenqqndweiunqfc`

## Tabellen

Die Migration `supabase/migrations/20260628175613_fundamental_analyst_workspace.sql`
legt an:

- `public.workspaces`
- `public.watchlist_items`
- `public.assumptions`
- `public.notes`
- `public.analysis_snapshots`
- `private.provider_cache`

Alle Public-Tabellen haben RLS. Userdaten sind nur fuer den jeweiligen
authentifizierten Nutzer sichtbar. `private.provider_cache` ist nur fuer
`service_role` vorgesehen und darf nie im Browser verwendet werden.

## Frontend-Env

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
```

Ohne diese Variablen bleibt die App voll funktionsfaehig und speichert lokal im
Browser. Mit Env und Login synchronisiert sie:

- Watchlist
- Annahmen
- Notizen
- Analyse-Snapshots

## Vercel

Im Frontend-Projekt muessen gesetzt werden:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Status: Beide Variablen sind in Vercel fuer `Production` und `Preview` gesetzt.

Im Backend-Projekt spaeter optional:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Der Service-Role-Key gehoert ausschliesslich ins Backend und niemals ins
Frontend.

## Anwendung der Migration

Nach Erstellung des Supabase-Projekts:

1. Projekt-ID ermitteln.
2. Migration per Supabase MCP anwenden.
3. Security Advisors ausfuehren.
4. Project URL und Publishable Key ins Frontend setzen.
5. Frontend neu deployen.

Status: Migrationen sind angewendet, Security Advisors sind sauber, Frontend ist
neu deployed.

## Auth Redirects

Magic Links nutzen `window.location.origin` als Redirect. In Supabase muss unter
`Authentication > URL Configuration` die produktive Vercel-URL erlaubt sein:

- Site URL: `https://frontend-five-nu-79.vercel.app`
- Additional Redirect URLs:
  - `https://frontend-five-nu-79.vercel.app`
  - `http://localhost:5173`
  - `http://localhost:5174`

Die Supabase-MCP-Werkzeuge koennen diese Auth-URL-Konfiguration aktuell nicht
setzen; das ist der einzige verbleibende Dashboard-Schritt fuer Magic Links.
