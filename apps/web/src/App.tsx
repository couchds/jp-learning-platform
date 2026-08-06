import { useEffect, useState } from "react";
import { Brain, ClipboardList, Crosshair, Database, Gauge, Home, Mic, Pencil, RotateCcw, Search, Trophy, Wrench, Boxes } from "lucide-react";
import { api } from "./api";
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
import { RuntimeView } from "./views/RuntimeView";
import { SpeechView } from "./views/SpeechView";
import { TrackerView } from "./views/TrackerView";
import { ReviewView } from "./views/ReviewView";
import { emptyDashboard, type Loadable, type View } from "./views/shared";

type NavItem = { id: View; label: string; icon: typeof Gauge };
const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: "Overview", items: [{ id: "home", label: "Home", icon: Home }, { id: "dashboard", label: "Dashboard", icon: Gauge }, { id: "profile", label: "Profile", icon: Brain }] },
  { label: "Library", items: [{ id: "database", label: "Database", icon: Database }, { id: "resources", label: "Resources", icon: Boxes }, { id: "lookup", label: "Lookup", icon: Search }] },
  { label: "Practice", items: [{ id: "capture", label: "Capture", icon: Crosshair }, { id: "tracker", label: "Tracker", icon: ClipboardList }, { id: "quiz", label: "Quiz", icon: Trophy }, { id: "review", label: "Review", icon: RotateCcw }] },
  { label: "Tools", items: [{ id: "runtime", label: "Runtime", icon: Wrench }, { id: "draw", label: "Draw", icon: Pencil }, { id: "speech", label: "Speech", icon: Mic }] }
];
const navItems = navGroups.flatMap((group) => group.items);
const viewRoutes: Record<View, string> = { home: "/", dashboard: "/dashboard", database: "/database", profile: "/profile", capture: "/capture", runtime: "/runtime", resources: "/resources", tracker: "/tracker", quiz: "/quiz", review: "/review", lookup: "/lookup", draw: "/draw", speech: "/speech" };
const routeViews = new Map(Object.entries(viewRoutes).map(([view, route]) => [route, view as View]));
const viewSummaries: Record<View, string> = {
  home: "Capture, collect, and review from your study workspace.", dashboard: "A quick read on resources, captures, and reviews.", database: "Browse imported kanji, words, sentences, and relation data.", profile: "Track knowledge growth, XP, and kanji relationships.", capture: "Run OCR tools and attach captures to study resources.", runtime: "Check service readiness, platform permissions, and companion tools.", resources: "Create and organize the media you are studying from.", tracker: "Add dictionary-backed words or custom terms to a resource.", quiz: "Practice resource vocabulary with quick recall sessions.", review: "Work through vocabulary and kanji that are due now.", lookup: "Search kanji and word data, then mark what you know.", draw: "Draw kanji and inspect recognition candidates.", speech: "Inspect pronunciation tooling and training commands."
};

export function App() {
  const view = routeViews.get(window.location.pathname) ?? "home";
  const [dashboard, setDashboard] = useState<Loadable<Dashboard>>({ data: null, loading: true, error: null });
  async function refreshDashboard() {
    setDashboard((current) => ({ ...current, loading: true, error: null }));
    try { setDashboard({ data: await api.dashboard(), loading: false, error: null }); }
    catch (error) { setDashboard({ data: emptyDashboard, loading: false, error: error instanceof Error ? error.message : "Could not load dashboard" }); }
  }
  useEffect(() => { void refreshDashboard(); }, []);
  const activeTitle = navItems.find((item) => item.id === view)?.label ?? "Dashboard";
  const navigate = (target: View) => window.location.assign(viewRoutes[target]);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand"><div className="brand-mark">日</div><div><strong>Yomunami</strong><span>Japanese study desk</span></div></div>
      <nav className="nav-list" aria-label="Main sections">{navGroups.map((group) => <div className="nav-section" role="group" aria-label={group.label} key={group.label}><span className="nav-section-label">{group.label}</span><div className="nav-section-items">{group.items.map((item) => { const Icon = item.icon; const active = view === item.id; return <a key={item.id} className={active ? "nav-button active" : "nav-button"} href={viewRoutes[item.id]} aria-current={active ? "page" : undefined}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></a>; })}</div></div>)}</nav>
    </aside>
    <main className="workspace" id="main-content">
      <header className="topbar"><div className="topbar-copy"><span className="eyebrow">Japanese learning</span><h1>{activeTitle}</h1><p className="topbar-subtitle">{viewSummaries[view]}</p></div></header>
      {view === "home" && <HomeView onNavigate={navigate} />}
      {view === "dashboard" && <DashboardView state={dashboard} onRefresh={() => void refreshDashboard()} />}
      {view === "database" && <DatabaseView />}{view === "profile" && <ProfileView />}
      {view === "capture" && <CaptureView onChange={() => void refreshDashboard()} onNavigate={navigate} />}
      {view === "runtime" && <RuntimeView />}{view === "resources" && <ResourcesView onChange={() => void refreshDashboard()} />}
      {view === "tracker" && <TrackerView onChange={() => void refreshDashboard()} />}{view === "quiz" && <QuizView />}
      {view === "review" && <ReviewView />}{view === "lookup" && <LookupView />}{view === "draw" && <DrawView />}{view === "speech" && <SpeechView />}
    </main>
  </div>;
}
