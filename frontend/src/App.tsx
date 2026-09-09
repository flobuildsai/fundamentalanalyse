import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Analysis, Assumptions } from "./types/analysis";
import { analyze, AnalyzeError, isMock } from "./api/client";
import { TickerSearch } from "./components/TickerSearch";
import { CompanyHeader } from "./components/CompanyHeader";
import { MarginOfSafetyBar } from "./components/MarginOfSafetyBar";
import { AssumptionControls } from "./components/AssumptionControls";
import { WatchlistPanel } from "./components/WatchlistPanel";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { DataQualityPanel } from "./components/DataQualityPanel";
import { NotesPanel } from "./components/NotesPanel";
import { FundamentalSnapshot } from "./components/FundamentalSnapshot";
import { HistoricalTrends } from "./components/HistoricalTrends";
import { InvestmentCockpit } from "./components/InvestmentCockpit";
import { LandingPage } from "./components/LandingPage";
import { AppShell } from "./components/AppShell";
import { PageHeader } from "./components/PageHeader";
import { OptionsPanel } from "./components/OptionsPanel";
import { SyncPanel, type SyncStatus } from "./components/SyncPanel";
import { loadWorkspace, saveWorkspace } from "./lib/workspace";
import {
  getCloudSession,
  loadLatestAnalysisSnapshots,
  loadRemoteWorkspace,
  saveAnalysisSnapshot,
  saveRemoteWorkspace,
  sendMagicLink,
  signOutFromSupabase,
  subscribeToAuth,
} from "./lib/supabaseWorkspace";
import {
  loadCachedAnalyses,
  removeCachedAnalysis,
  saveCachedAnalysis,
} from "./lib/analysisCache";
import {
  appRouteFromPath,
  pathForAppRoute,
  type AppRoute,
} from "./lib/routes";
import {
  GrowthSection,
  ProfitabilitySection,
  DebtSection,
  DividendSection,
} from "./components/DataSections";
import { ErrorState, ResearchStartPanel } from "./components/States";

const DEFAULT_ASSUMPTIONS: Assumptions = {
  requiredReturn: 0.15,
  estimatedGrowth: 0.125,
  growthSource: "analyst",
  marginOfSafetyTarget: 0.3,
  exitMultiple: null,
  currentEPSOverride: null,
};
const START_TICKER = "AA";

export default function App() {
  const [initialWorkspace] = useState(loadWorkspace);
  const [workspaceOpen, setWorkspaceOpen] = useState(
    () => window.location.pathname.startsWith("/app") || window.location.hash === "#workspace",
  );
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() =>
    appRouteFromPath(window.location.pathname),
  );
  const initialTicker = initialWorkspace.watchlist[0] ?? START_TICKER;
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>(() =>
    loadCachedAnalyses(initialWorkspace.watchlist),
  );
  const [watchlist, setWatchlist] = useState<string[]>(
    initialWorkspace.watchlist,
  );
  const [assumptionsByTicker, setAssumptionsByTicker] = useState<
    Record<string, Assumptions>
  >(initialWorkspace.assumptionsByTicker);
  const [notesByTicker, setNotesByTicker] = useState<Record<string, string>>(
    initialWorkspace.notesByTicker,
  );
  const [selectedTicker, setSelectedTicker] = useState<string | null>(initialTicker);
  const [loadingTickers, setLoadingTickers] = useState<string[]>([]);
  const [error, setError] = useState<{ code: string; ticker?: string } | null>(
    null,
  );
  const [assumptions, setAssumptions] = useState<Assumptions>(
    initialWorkspace.assumptionsByTicker[initialTicker] ??
      DEFAULT_ASSUMPTIONS,
  );
  const [syncUser, setSyncUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("disabled");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const didStart = useRef(false);
  const didLoadRemote = useRef(false);
  const syncUserRef = useRef<User | null>(null);
  const analysesRef = useRef(analyses);
  const loadingTickersRef = useRef(loadingTickers);
  const workspaceRef = useRef({
    watchlist,
    assumptionsByTicker,
    notesByTicker,
  });

  const activeAnalysis = selectedTicker ? analyses[selectedTicker] : null;
  const activeNotes = selectedTicker ? notesByTicker[selectedTicker] ?? "" : "";
  const loading = loadingTickers.length > 0;

  const run = useCallback(
    async (
      ticker: string,
      a: Assumptions,
      options: { select?: boolean } = {},
    ) => {
      const shouldSelect = options.select ?? true;
      const symbol = ticker.trim().toUpperCase();
      setLoadingTickers((current) =>
        current.includes(symbol) ? current : [...current, symbol],
      );
      if (shouldSelect) setSelectedTicker(symbol);
      if (shouldSelect) setError(null);
      setWatchlist((current) =>
        current.includes(symbol) ? current : [symbol, ...current],
      );
      setAssumptionsByTicker((current) => ({
        ...current,
        [symbol]: a,
      }));
      try {
        const result = await analyze(symbol, a);
        saveCachedAnalysis(result);
        setAnalyses((current) => ({
          ...current,
          [result.ticker]: result,
        }));
        setAssumptionsByTicker((current) => ({
          ...current,
          [result.ticker]: result.assumptions,
        }));
        if (shouldSelect) {
          setSelectedTicker(result.ticker);
          setAssumptions(result.assumptions);
        }
        if (syncUserRef.current && didLoadRemote.current) {
          saveAnalysisSnapshot(syncUserRef.current, result).catch(() => {
            setSyncStatus("error");
            setSyncMessage("Snapshot konnte nicht gespeichert werden.");
          });
        }
      } catch (e) {
        if (shouldSelect) {
          if (e instanceof AnalyzeError) {
            setError({ code: e.code, ticker: e.ticker });
          } else {
            setError({ code: "provider_unavailable" });
          }
        }
      } finally {
        setLoadingTickers((current) => current.filter((item) => item !== symbol));
      }
    },
    [],
  );

  useEffect(() => {
    syncUserRef.current = syncUser;
  }, [syncUser]);

  useEffect(() => {
    analysesRef.current = analyses;
  }, [analyses]);

  useEffect(() => {
    loadingTickersRef.current = loadingTickers;
  }, [loadingTickers]);

  useEffect(() => {
    workspaceRef.current = { watchlist, assumptionsByTicker, notesByTicker };
  }, [watchlist, assumptionsByTicker, notesByTicker]);

  useEffect(() => {
    let active = true;

    getCloudSession()
      .then((session) => {
        if (!active) return;
        setSyncUser(session.user);
        setSyncStatus(
          session.configured ? (session.user ? "syncing" : "signed-out") : "disabled",
        );
      })
      .catch(() => {
        if (!active) return;
        setSyncStatus("error");
        setSyncMessage("Supabase-Session konnte nicht gelesen werden.");
      });

    const unsubscribe = subscribeToAuth((session) => {
      setSyncUser(session.user);
      setSyncStatus(
        session.configured ? (session.user ? "syncing" : "signed-out") : "disabled",
      );
      if (!session.user) didLoadRemote.current = false;
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (didStart.current) return;
    didStart.current = true;
    run(
      initialTicker,
      initialWorkspace.assumptionsByTicker[initialTicker] ??
        DEFAULT_ASSUMPTIONS,
    );
  }, [initialTicker, initialWorkspace, run]);

  useEffect(() => {
    if (syncUser) setWorkspaceOpen(true);
  }, [syncUser]);

  useEffect(() => {
    saveWorkspace({ watchlist, assumptionsByTicker, notesByTicker });
  }, [watchlist, assumptionsByTicker, notesByTicker]);

  useEffect(() => {
    if (!syncUser) return;

    let cancelled = false;
    const localState = workspaceRef.current;
    setSyncStatus("syncing");
    setSyncMessage(null);

    loadRemoteWorkspace(syncUser)
      .then(async (remote) => {
        if (cancelled) return;

        if (remote.isEmpty) {
          await saveRemoteWorkspace(syncUser, localState);
          didLoadRemote.current = true;
          setSyncStatus("synced");
          setSyncMessage("Lokaler Workspace wurde in Supabase gespeichert.");
          return;
        }

        didLoadRemote.current = true;
        setWatchlist(remote.state.watchlist);
        setAssumptionsByTicker(remote.state.assumptionsByTicker);
        setNotesByTicker(remote.state.notesByTicker);
        const nextTicker = remote.state.watchlist[0] ?? START_TICKER;
        const nextAssumptions =
          remote.state.assumptionsByTicker[nextTicker] ?? DEFAULT_ASSUMPTIONS;
        setSelectedTicker(nextTicker);
        setAssumptions(nextAssumptions);
        setSyncStatus("synced");
        setSyncMessage("Workspace aus Supabase geladen.");

        loadLatestAnalysisSnapshots(syncUser, remote.state.watchlist)
          .then((snapshotAnalyses) => {
            if (cancelled) return;
            for (const analysis of Object.values(snapshotAnalyses)) {
              saveCachedAnalysis(analysis);
            }
            setAnalyses((current) => ({ ...snapshotAnalyses, ...current }));
          })
          .catch(() => {
            if (cancelled) return;
            setSyncStatus("error");
            setSyncMessage("Analyse-Snapshots konnten nicht geladen werden.");
          });

        if (!analysesRef.current[nextTicker]) run(nextTicker, nextAssumptions);
      })
      .catch(() => {
        if (cancelled) return;
        setSyncStatus("error");
        setSyncMessage("Supabase-Workspace konnte nicht geladen werden.");
      });

    return () => {
      cancelled = true;
    };
  }, [syncUser, run]);

  useEffect(() => {
    if (!syncUser || !didLoadRemote.current) return;

    const timer = window.setTimeout(() => {
      setSyncStatus("syncing");
      saveRemoteWorkspace(syncUser, {
        watchlist,
        assumptionsByTicker,
        notesByTicker,
      })
        .then(() => {
          setSyncStatus("synced");
          setSyncMessage("Workspace synchronisiert.");
        })
        .catch(() => {
          setSyncStatus("error");
          setSyncMessage("Workspace konnte nicht synchronisiert werden.");
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [watchlist, assumptionsByTicker, notesByTicker, syncUser]);

  const onAnalyzeWatchlist = useCallback(() => {
    const pending = watchlist.filter(
      (ticker) =>
        !analysesRef.current[ticker] &&
        !loadingTickersRef.current.includes(ticker),
    );
    for (const ticker of pending.slice(0, 8)) {
      run(ticker, assumptionsByTicker[ticker] ?? DEFAULT_ASSUMPTIONS, {
        select: false,
      });
    }
  }, [assumptionsByTicker, run, watchlist]);

  const onSearch = (ticker: string) => {
    const symbol = ticker.trim().toUpperCase();
    const nextAssumptions = assumptionsByTicker[symbol] ?? DEFAULT_ASSUMPTIONS;
    setAssumptions(nextAssumptions);
    run(symbol, nextAssumptions);
  };

  const onSelectTicker = (ticker: string) => {
    const symbol = ticker.trim().toUpperCase();
    const nextAssumptions = assumptionsByTicker[symbol] ?? DEFAULT_ASSUMPTIONS;
    setAssumptions(nextAssumptions);
    if (analyses[symbol]) {
      setSelectedTicker(symbol);
      setError(null);
      return;
    }
    run(symbol, nextAssumptions);
  };

  const onAssumptions = (a: Assumptions) => {
    setAssumptions(a);
    if (!selectedTicker) return;
    setAssumptionsByTicker((current) => ({
      ...current,
      [selectedTicker]: a,
    }));
    run(selectedTicker, a);
  };

  const onRemoveTicker = (ticker: string) => {
    const symbol = ticker.trim().toUpperCase();
    const nextWatchlist = watchlist.filter((item) => item !== symbol);

    setWatchlist(nextWatchlist);
    setAnalyses((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    removeCachedAnalysis(symbol);
    setAssumptionsByTicker((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setNotesByTicker((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });

    if (selectedTicker === symbol) {
      const nextTicker = nextWatchlist[0] ?? null;
      setSelectedTicker(nextTicker);
      if (nextTicker) {
        const nextAssumptions =
          assumptionsByTicker[nextTicker] ?? DEFAULT_ASSUMPTIONS;
        setAssumptions(nextAssumptions);
        if (!analyses[nextTicker]) run(nextTicker, nextAssumptions);
      }
    }
  };

  const onNotes = (note: string) => {
    if (!selectedTicker) return;
    setNotesByTicker((current) => ({
      ...current,
      [selectedTicker]: note,
    }));
  };

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = appRouteFromPath(window.location.pathname);
      setActiveRoute(nextRoute);
      setWorkspaceOpen(window.location.pathname.startsWith("/app"));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!workspaceOpen) return;
    const canonicalPath = pathForAppRoute(activeRoute);
    if (
      window.location.pathname.startsWith("/app") &&
      window.location.pathname !== canonicalPath
    ) {
      window.history.replaceState(null, "", canonicalPath);
    }
  }, [activeRoute, workspaceOpen]);

  const openRoute = (route: AppRoute, replace = false) => {
    const path = pathForAppRoute(route);
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    setActiveRoute(route);
    setWorkspaceOpen(true);
  };

  const openLanding = () => {
    window.history.pushState(null, "", "/");
    setWorkspaceOpen(false);
  };

  if (!workspaceOpen) {
    return (
      <LandingPage
        status={syncStatus}
        user={syncUser}
        message={syncMessage}
        onSendMagicLink={sendMagicLink}
        onSignOut={signOutFromSupabase}
        onEnterDemo={() => {
          openRoute("analysis", true);
        }}
        onOpenWorkspace={() => {
          openRoute("analysis", true);
        }}
      />
    );
  }

  const syncControls = (
    <SyncPanel
      status={syncStatus}
      user={syncUser}
      message={syncMessage}
      onSendMagicLink={sendMagicLink}
      onSignOut={signOutFromSupabase}
    />
  );

  const quickTickers = Array.from(new Set([...watchlist, "AA", "AAPL", "MSFT", "NVDA", "TSLA", "KO"])).slice(0, 6);

  const analysisDetail = (
    <div className="mt-5 min-w-0">
      {!activeAnalysis && (
        <ResearchStartPanel
          ticker={selectedTicker}
          loading={loading}
          errorCode={error?.code}
          errorTicker={error?.ticker}
          quickTickers={quickTickers}
          onSelect={onSelectTicker}
        />
      )}

      {activeAnalysis && (
        <div className="fade-in space-y-6">
          {error && <ErrorState code={error.code} ticker={error.ticker} />}
          <CompanyHeader a={activeAnalysis} />
          <InvestmentCockpit analysis={activeAnalysis} />
          <FundamentalSnapshot analysis={activeAnalysis} />
          <HistoricalTrends analysis={activeAnalysis} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <AssumptionControls
              value={assumptions}
              analysis={activeAnalysis}
              onChange={onAssumptions}
            />
            <DataQualityPanel analysis={activeAnalysis} />
          </div>
          <ScenarioPanel analysis={activeAnalysis} assumptions={assumptions} />
          <MarginOfSafetyBar
            valuation={activeAnalysis.valuation}
            currency={activeAnalysis.currency}
          />
          <GrowthSection a={activeAnalysis} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ProfitabilitySection a={activeAnalysis} />
            <DebtSection a={activeAnalysis} />
          </div>
          <DividendSection a={activeAnalysis} />
          <NotesPanel
            ticker={activeAnalysis.ticker}
            value={activeNotes}
            onChange={onNotes}
          />

          <p className="pt-4 text-center text-xs text-[var(--color-ink-tertiary)]">
            Stand {new Date(activeAnalysis.asOf).toLocaleDateString("de-DE")} ·
            Keine Anlageberatung. Angaben ohne Gewähr.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      activeRoute={activeRoute}
      onNavigate={openRoute}
      onHome={openLanding}
      syncControls={syncControls}
      mockBadge={isMock}
    >
      {activeRoute === "analysis" && (
        <>
          {activeAnalysis ? (
            <section className="analysis-command-strip">
              <div>
                <p className="origin-eyebrow">Analyse</p>
                <strong>Neue Aktie prüfen</strong>
              </div>
              <TickerSearch
                onSearch={onSearch}
                loading={loading}
                placeholder={
                  loading && selectedTicker
                    ? `${selectedTicker} wird geladen`
                    : "Ticker eingeben"
                }
              />
            </section>
          ) : (
            <PageHeader
              eyebrow="Analyse"
              title="Aktie prüfen"
              action={
                <TickerSearch
                  onSearch={onSearch}
                  loading={loading}
                  placeholder={
                    loading && selectedTicker
                      ? `${selectedTicker} wird geladen`
                      : "Ticker eingeben"
                  }
                />
              }
            >
              Wert, Qualität und Bilanz in einer ruhigen Ansicht.
            </PageHeader>
          )}
          {analysisDetail}
        </>
      )}

      {activeRoute === "options" && (
        <div className="space-y-6">
          <OptionsPanel user={syncUser} />
        </div>
      )}

      {activeRoute === "watchlist" && (
        <div className="space-y-6">
          <WatchlistPanel
            tickers={watchlist}
            analyses={analyses}
            selectedTicker={selectedTicker}
            loadingTickers={loadingTickers}
            onSelect={(ticker) => {
              onSelectTicker(ticker);
              openRoute("analysis");
            }}
            onRemove={onRemoveTicker}
            onAnalyzeAll={onAnalyzeWatchlist}
          />
        </div>
      )}
    </AppShell>
  );
}
