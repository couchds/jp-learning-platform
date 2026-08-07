import { useEffect, useState } from "react";
import { BookOpen, Crosshair, Home, RotateCcw, Search, Settings } from "lucide-react";
import { api } from "./api";
import { getDesktopBridge, type DesktopCaptureResult } from "./desktop";
import type { Dashboard } from "./types";
import { CaptureView } from "./views/CaptureView";
import { DashboardView } from "./views/DashboardView";
import { DatabaseView } from "./views/DatabaseView";
import { DrawView } from "./views/DrawView";
import { HomeView } from "./views/HomeView";
import { LookupView } from "./views/LookupView";
import { ProfileView } from "./views/ProfileView";
import { QuizView } from "./views/QuizView";
import { ResourcesView } from "./views/ResourcesView";
import { ReviewView } from "./views/ReviewView";
import { RuntimeView } from "./views/RuntimeView";
import { SettingsView } from "./views/SettingsView";
import { SpeechView } from "./views/SpeechView";
import { TrackerView } from "./views/TrackerView";
import { emptyDashboard, type Loadable, type View } from "./views/shared";

const navItems = [
  { id: "home", label: "Today", icon: Home },
  { id: "capture", label: "Capture", icon: Crosshair },
  { id: "resources", label: "Library", icon: BookOpen },
  { id: "review", label: "Review", icon: RotateCcw },
  { id: "lookup", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings }
] satisfies Array<{ id: View; label: string; icon: typeof Home }>;

const viewRoutes: Record<View, string> = {
  home: "/",
  dashboard: "/dashboard",
  database: "/database",
  profile: "/profile",
  capture: "/capture",
  runtime: "/runtime",
  resources: "/resources",
  tracker: "/tracker",
  quiz: "/quiz",
  review: "/review",
  lookup: "/lookup",
  draw: "/draw",
  speech: "/speech",
  settings: "/settings"
};

const routeViews = new Map(Object.entries(viewRoutes).map(([view, route]) => [route, view as View]));
const viewLabels: Record<View, string> = {
  home: "Today",
  dashboard: "Progress",
  database: "Dictionary data",
  profile: "Learning profile",
  capture: "Capture",
  runtime: "Runtime details",
  resources: "Library",
  tracker: "Resource terms",
  quiz: "Quiz",
  review: "Review",
  lookup: "Search",
  draw: "Handwriting",
  speech: "Pronunciation",
  settings: "Settings"
};
const viewSummaries: Record<View, string> = {
  home: "Pick up where you left off.",
  dashboard: "Your recent learning activity and progress.",
  database: "Manage the local dictionaries used by search.",
  profile: "Explore what you have seen and learned.",
  capture: "Turn Japanese on your screen into study material.",
  runtime: "Detailed diagnostics for this installation.",
  resources: "The games, books, shows, and sites you are studying.",
  tracker: "Words and kanji collected from a resource.",
  quiz: "Practice material from one resource.",
  review: "Strengthen words and kanji that are due.",
  lookup: "Find a word or kanji and add it to your learning history.",
  draw: "Find kanji by drawing them.",
  speech: "Practice and inspect pronunciation.",
  settings: "App health, your data, and advanced tools."
};

export function App() {
  const [view, setView] = useState<View>(() => viewFromLocation());
  const [dashboard, setDashboard] = useState<Loadable<Dashboard>>({ data: null, loading: true, error: null });
  const [desktopCapture, setDesktopCapture] = useState<DesktopCaptureResult | null>(null);

  async function refreshDashboard() {
    setDashboard((current) => ({ ...current, loading: true, error: null }));
    try {
      setDashboard({ data: await api.dashboard(), loading: false, error: null });
    } catch (error) {
      setDashboard({
        data: emptyDashboard,
        loading: false,
        error: error instanceof Error ? error.message : "Could not load your learning summary"
      });
    }
  }

  useEffect(() => {
    void refreshDashboard();
  }, []);

  useEffect(() => {
    const syncView = () => setView(viewFromLocation());
    window.addEventListener("popstate", syncView);
    window.addEventListener("hashchange", syncView);
    return () => {
      window.removeEventListener("popstate", syncView);
      window.removeEventListener("hashchange", syncView);
    };
  }, []);

  const navigate = (target: View) => {
    const route = viewRoutes[target];
    if (window.location.protocol === "file:") window.location.hash = route;
    else window.history.pushState(null, "", route);
    setView(target);
  };

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onCaptureReady((result) => {
      setDesktopCapture(result);
      navigate("capture");
    });
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">{"\u65e5"}</div>
          <div><strong>Kakomu</strong><span>Japanese learning</span></div>
        </div>
        <nav className="nav-list" aria-label="Main sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <a
                key={item.id}
                className={active ? "nav-button active" : "nav-button"}
                href={window.location.protocol === "file:" ? `#${viewRoutes[item.id]}` : viewRoutes[item.id]}
                aria-current={active ? "page" : undefined}
                onClick={(event) => { event.preventDefault(); navigate(item.id); }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>
      <main className="workspace" id="main-content">
        <header className="topbar">
          <div className="topbar-copy">
            <h1>{viewLabels[view]}</h1>
            <p className="topbar-subtitle">{viewSummaries[view]}</p>
          </div>
        </header>
        {view === "home" && <HomeView dashboard={dashboard} onNavigate={navigate} />}
        {view === "dashboard" && <DashboardView state={dashboard} onRefresh={() => void refreshDashboard()} />}
        {view === "database" && <DatabaseView />}
        {view === "profile" && <ProfileView />}
        {view === "capture" && <CaptureView desktopCapture={desktopCapture} onChange={() => void refreshDashboard()} />}
        {view === "runtime" && <RuntimeView />}
        {view === "resources" && <ResourcesView onChange={() => void refreshDashboard()} />}
        {view === "tracker" && <TrackerView onChange={() => void refreshDashboard()} />}
        {view === "quiz" && <QuizView />}
        {view === "review" && <ReviewView />}
        {view === "lookup" && <LookupView />}
        {view === "draw" && <DrawView />}
        {view === "speech" && <SpeechView />}
        {view === "settings" && <SettingsView />}
      </main>
    </div>
  );
}

function viewFromLocation(): View {
  const route = window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : window.location.pathname;
  return routeViews.get(route) ?? "home";
}
