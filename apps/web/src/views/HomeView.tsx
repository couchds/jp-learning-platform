import { ArrowRight, BookOpen, Crosshair, RotateCcw, Search } from "lucide-react";
import type { Dashboard } from "../types";
import { EmptyState, emptyDashboard, type Loadable, type View } from "./shared";

export function HomeView({ dashboard, onNavigate }: { dashboard: Loadable<Dashboard>; onNavigate: (view: View) => void }) {
  const data = dashboard.data ?? emptyDashboard;
  const actions = [
    {
      view: "capture" as const,
      icon: Crosshair,
      title: "Capture from your screen",
      detail: data.counts.images ? `${data.counts.images} captures saved so far` : "Save your first word or kanji"
    },
    {
      view: "review" as const,
      icon: RotateCcw,
      title: data.counts.dueReviews ? `Review ${data.counts.dueReviews} due item${data.counts.dueReviews === 1 ? "" : "s"}` : "Review what you know",
      detail: data.counts.dueReviews ? "A short session is ready" : "Nothing is overdue"
    },
    {
      view: "lookup" as const,
      icon: Search,
      title: "Look something up",
      detail: "Search by Japanese, reading, or meaning"
    }
  ];

  return (
    <section className="home-view">
      {dashboard.error && <p className="error-text" role="alert">{dashboard.error}</p>}
      <section className="panel today-actions" aria-labelledby="next-action-title">
        <div className="panel-heading">
          <div><span className="eyebrow">Next up</span><h2 id="next-action-title">What would you like to do?</h2></div>
        </div>
        <div className="today-action-list">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button type="button" className="today-action" key={action.view} onClick={() => onNavigate(action.view)}>
                <span className="today-action-icon"><Icon size={20} aria-hidden="true" /></span>
                <span><strong>{action.title}</strong><small>{action.detail}</small></span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel recent-study" aria-labelledby="recent-study-title">
        <div className="panel-heading">
          <div><span className="eyebrow">Library</span><h2 id="recent-study-title">Recently studied</h2></div>
          <button className="secondary-button compact-button" type="button" onClick={() => onNavigate("resources")}>
            <BookOpen size={16} /> View library
          </button>
        </div>
        {dashboard.loading && !dashboard.data ? (
          <EmptyState title="Loading your day" detail="Reading your recent activity." />
        ) : data.recentResources.length === 0 ? (
          <EmptyState title="Nothing here yet" detail="Add what you are studying to build your library." />
        ) : (
          <div className="recent-study-list">
            {data.recentResources.slice(0, 5).map((resource) => (
              <button className="recent-study-row" type="button" key={resource.id} onClick={() => onNavigate("tracker")}>
                <span><strong>{resource.name}</strong><small>{resource.type.replaceAll("_", " ")}</small></span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
