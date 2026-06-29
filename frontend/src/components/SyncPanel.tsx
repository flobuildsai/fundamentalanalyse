import { useState } from "react";
import type { User } from "@supabase/supabase-js";

export type SyncStatus =
  | "disabled"
  | "signed-out"
  | "syncing"
  | "synced"
  | "error";

interface Props {
  status: SyncStatus;
  user: User | null;
  message: string | null;
  onSendMagicLink: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

function statusLabel(status: SyncStatus, user: User | null): string {
  if (status === "disabled") return "Sync lokal";
  if (status === "syncing") return "Sync läuft";
  if (status === "error") return "Sync prüfen";
  if (user) return "Sync aktiv";
  return "Sync anmelden";
}

function statusTone(status: SyncStatus, user: User | null): string {
  if (status === "synced" && user) {
    return "bg-[var(--color-positive)]/12 text-[var(--color-positive)]";
  }
  if (status === "syncing") {
    return "bg-[var(--color-accent)]/12 text-[var(--color-accent)]";
  }
  if (status === "error") {
    return "bg-[var(--color-negative)]/12 text-[var(--color-negative)]";
  }
  return "bg-white/52 text-[var(--color-ink-secondary)]";
}

export function SyncPanel({
  status,
  user,
  message,
  onSendMagicLink,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setNotice(null);
    try {
      await onSendMagicLink(value);
      setNotice("Magic Link gesendet. Danach synchronisiert die App automatisch.");
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
      setNotice("Abgemeldet. Workspace bleibt lokal erhalten.");
    } catch {
      setNotice("Abmelden fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`premium-transition whitespace-nowrap rounded-[var(--radius-pill)] px-3 py-1 text-xs font-semibold ring-1 ring-white/65 hover:bg-white/78 ${statusTone(
          status,
          user,
        )}`}
      >
        {statusLabel(status, user)}
      </button>

      {open && (
        <div className="glass-strong absolute right-0 top-11 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-[1.5rem] p-4 text-sm shadow-[var(--shadow-float)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--color-ink)]">
                Supabase Sync
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--color-ink-tertiary)]">
                Watchlist, Annahmen, Notizen und Snapshots.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="premium-transition flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-tertiary)] hover:bg-white/60"
              aria-label="Sync schließen"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M6 6l8 8M14 6l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
          </div>

          {status === "disabled" ? (
            <p className="mt-4 rounded-[1rem] bg-white/42 px-3 py-2 text-xs leading-5 text-[var(--color-ink-secondary)]">
              Supabase-Umgebungsvariablen fehlen. Die App speichert bis dahin
              sicher im Browser.
            </p>
          ) : user ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-[1rem] bg-white/42 px-3 py-2">
                <p className="text-xs text-[var(--color-ink-tertiary)]">
                  Angemeldet
                </p>
                <p className="truncate font-semibold text-[var(--color-ink)]">
                  {user.email ?? user.id}
                </p>
              </div>
              <button
                type="button"
                onClick={signOut}
                disabled={busy}
                className="premium-transition w-full rounded-[var(--radius-pill)] bg-white/62 px-4 py-2 text-xs font-semibold text-[var(--color-ink)] ring-1 ring-white/72 hover:bg-white/88 disabled:opacity-60"
              >
                Abmelden
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <input
                value={email}
                type="email"
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder="E-Mail"
                className="w-full rounded-[var(--radius-pill)] border border-white/58 bg-white/42 px-4 py-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-tertiary)] focus:border-[var(--color-accent)]/40"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || !email.trim()}
                className="premium-transition w-full rounded-[var(--radius-pill)] bg-[var(--color-ink)] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(12,16,22,0.16)] hover:-translate-y-0.5 disabled:opacity-60"
              >
                Magic Link senden
              </button>
            </div>
          )}

          {(notice || message) && (
            <p className="mt-3 text-xs leading-5 text-[var(--color-ink-tertiary)]">
              {notice ?? message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
