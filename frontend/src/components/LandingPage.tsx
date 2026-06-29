import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { SyncStatus } from "./SyncPanel";

interface AuthCardProps {
  user: User | null;
  status: SyncStatus;
  message: string | null;
  onSendMagicLink: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onOpenWorkspace: () => void;
}

interface LandingPageProps extends AuthCardProps {
  onEnterDemo: () => void;
}

function ArrowGlyph() {
  return (
    <span className="landing-button-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <path d="M6 14 14 6" />
        <path d="M8 6h6v6" />
      </svg>
    </span>
  );
}

function LogoMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M32 15 49 47H15Z" />
        <path d="M32 27 40 42H24Z" />
      </svg>
    </span>
  );
}

function AuthCard({
  user,
  status,
  message,
  onSendMagicLink,
  onSignOut,
  onOpenWorkspace,
}: AuthCardProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    if (!emailIsValid || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await onSendMagicLink(email.trim());
      setNotice("Magic Link ist unterwegs. Danach öffnet sich dein Workspace automatisch.");
    } catch {
      setNotice("Login-Link konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await onSignOut();
      setNotice("Abgemeldet. Dein lokaler Workspace bleibt erhalten.");
    } catch {
      setNotice("Abmelden fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="landing-auth-shell" id="auth">
      <div className="landing-auth-core">
        <div className="landing-auth-status">
          <span />
          {status === "disabled"
            ? "Lokaler Modus"
            : user
              ? "Supabase verbunden"
              : "Supabase Auth"}
        </div>
        <h2>{user ? "Workspace ist bereit." : "Ein Login für Watchlist, Notizen und Snapshots."}</h2>
        <p>
          {user
            ? "Deine Analysen werden mit Supabase synchronisiert und stehen nach dem Login wieder bereit."
            : "Melde dich per Magic Link an. Kein Passwort, keine Reibung, sauberer Sync über RLS-geschützte Tabellen."}
        </p>

        {user ? (
          <div className="landing-auth-user">
            <div>
              <span>Angemeldet als</span>
              <strong>{user.email ?? user.id}</strong>
            </div>
            <button type="button" onClick={onOpenWorkspace} className="landing-button primary">
              Workspace öffnen
              <ArrowGlyph />
            </button>
            <button type="button" onClick={signOut} disabled={busy} className="landing-button subtle">
              Abmelden
            </button>
          </div>
        ) : (
          <form
            className="landing-auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="landing-email">E-Mail</label>
            <div className="landing-email-shell">
              <input
                id="landing-email"
                value={email}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@domain.de"
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" disabled={!emailIsValid || busy}>
                {busy ? "Sendet" : "Magic Link"}
              </button>
            </div>
          </form>
        )}

        {(notice || message) && <div className="landing-auth-notice">{notice ?? message}</div>}
      </div>
    </aside>
  );
}

function ProductPreview() {
  return (
    <div className="landing-product-shell" aria-label="Produktvorschau Fundamental-Analyst">
      <div className="landing-product-core">
        <div className="preview-topbar">
          <div>
            <span>Watchlist live</span>
            <strong>6 FMP-Pro Ticker</strong>
          </div>
          <div className="preview-status">Analyst EPS</div>
        </div>

        <div className="preview-grid">
          <div className="preview-card main">
            <div className="preview-label">Innerer Wert</div>
            <div className="preview-price">133 $</div>
            <div className="preview-chip negative">AAPL 113,9 % über Wert</div>
            <div className="preview-bars">
              <span style={{ width: "88%" }} />
              <span style={{ width: "64%" }} />
              <span style={{ width: "42%" }} />
            </div>
          </div>
          <div className="preview-card">
            <div className="preview-label">Qualität</div>
            <div className="preview-metric">ROIC 52,0 %</div>
            <div className="preview-metric muted">WACC 9,5 %</div>
          </div>
          <div className="preview-card dark">
            <div className="preview-label">Decision</div>
            <div className="preview-score">64</div>
            <div className="preview-chip">Watch</div>
          </div>
        </div>

        <div className="preview-ticker-row">
          {["AA", "AAPL", "MSFT", "NVDA", "TSLA", "KO"].map((ticker) => (
            <span key={ticker}>{ticker}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage({
  user,
  status,
  message,
  onSendMagicLink,
  onSignOut,
  onEnterDemo,
  onOpenWorkspace,
}: LandingPageProps) {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="Fundamental-Analyst Start">
          <LogoMark />
          <span>Fundamental-Analyst</span>
        </a>
        <nav aria-label="Landing Navigation">
          <a href="#produkt">Produkt</a>
          <a href="#workflow">Workflow</a>
          <a href="#auth">Login</a>
        </nav>
        <button type="button" onClick={user ? onOpenWorkspace : onEnterDemo}>
          {user ? "Workspace" : "Demo"}
        </button>
      </header>

      <main id="top">
        <section className="landing-hero" id="produkt">
          <div className="landing-hero-copy reveal-up">
            <div className="landing-eyebrow">FMP-Pro · SEC EDGAR · Supabase Sync</div>
            <h1>Ruhig analysieren. Klar entscheiden.</h1>
            <p>
              Fundamental-Analyst bündelt inneren Wert, Sicherheitsmarge, Qualität,
              Bilanzrisiko und Analystenwachstum in einem Premium-Workspace für
              langfristige Aktienanalyse.
            </p>
            <div className="landing-actions">
              <a href="#auth" className="landing-button primary">
                Kostenlos anmelden
                <ArrowGlyph />
              </a>
              <button type="button" onClick={onEnterDemo} className="landing-button secondary">
                Demo ansehen
              </button>
            </div>
            <div className="landing-proof">
              <span>10J Fundamentaldaten</span>
              <span>SEC Filing-Check</span>
              <span>ROIC / WACC</span>
            </div>
          </div>

          <div className="reveal-up delay-1">
            <ProductPreview />
          </div>
        </section>

        <section className="landing-metrics reveal-up" aria-label="Produktmetriken">
          <article>
            <span>6</span>
            <p>Start-Ticker werden direkt als Watchlist analysiert.</p>
          </article>
          <article>
            <span>10J</span>
            <p>Historische Reihen für Wachstum, Margen, Cashflow und Bilanz.</p>
          </article>
          <article>
            <span>1</span>
            <p>Workspace für Watchlist, Annahmen, Notizen und Snapshots.</p>
          </article>
        </section>

        <section className="landing-section" id="workflow">
          <div className="landing-section-copy reveal-up">
            <div className="landing-eyebrow">Workflow statt Tabellenchaos</div>
            <h2>Vom Spreadsheet zur Investment-These.</h2>
            <p>
              Die App übernimmt die Logik deines Google Sheets, aber macht
              Quellen, Annahmen und Warnsignale so sichtbar, dass du schneller
              zu einer sauberen These kommst.
            </p>
          </div>
          <div className="landing-feature-grid">
            {[
              ["Bewertung", "Normalisiertes EPS, effektives KGV und Sicherheitsmargen statt blindem Multiple."],
              ["Qualität", "ROIC gegen WACC, Margen und Kapitalrendite direkt im Kontext."],
              ["Bilanz", "Debt/FCF, Net Debt, Cash pro Aktie und Zinsdeckung mit Provenance."],
              ["Sync", "Supabase speichert Watchlist, Annahmen, Notizen und Snapshots pro User."],
            ].map(([title, copy], index) => (
              <article className="landing-feature reveal-up" style={{ animationDelay: `${index * 90}ms` }} key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-auth-section">
          <div className="landing-section-copy reveal-up">
            <div className="landing-eyebrow">Private Workspace</div>
            <h2>Einloggen, analysieren, wiederkommen.</h2>
            <p>
              Supabase Auth gibt dir einen echten Nutzer-Workspace, ohne das
              Tool mit Accounts, Passwörtern und unnötigem Ballast zu überladen.
            </p>
          </div>
          <AuthCard
            user={user}
            status={status}
            message={message}
            onSendMagicLink={onSendMagicLink}
            onSignOut={onSignOut}
            onOpenWorkspace={onOpenWorkspace}
          />
        </section>
      </main>
    </div>
  );
}
