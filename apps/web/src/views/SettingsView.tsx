import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, CircleAlert, Database, FolderOpen, RefreshCw } from "lucide-react";
import { BackupPanel } from "../components/BackupPanel";
import { getDesktopBridge, type DesktopRuntime, type DesktopService } from "../desktop";

export function SettingsView() {
  const bridge = getDesktopBridge();
  const [runtime, setRuntime] = useState<DesktopRuntime | null>(null);
  const [services, setServices] = useState<DesktopService[]>([]);
  const [loading, setLoading] = useState(Boolean(bridge));
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void Promise.all([bridge.getRuntime(), bridge.getServices()])
      .then(([nextRuntime, nextServices]) => {
        if (!active) return;
        setRuntime(nextRuntime);
        setServices(nextServices);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not read app status");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = bridge.onServicesChanged((nextServices) => setServices(nextServices));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  async function restartServices() {
    if (!bridge) return;
    setRestarting(true);
    setError(null);
    try {
      setServices(await bridge.restartServices());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not restart app services");
    } finally {
      setRestarting(false);
    }
  }

  const healthy = services.filter((service) => service.status === "running").length;
  const needsAttention = services.some((service) => service.status === "failed" || service.status === "unavailable");

  return (
    <section className="settings-view">
      <section className="panel app-status-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">App status</span><h2>{bridge ? "Desktop app" : "Web app"}</h2></div>
          {runtime && <span>Version {runtime.version}</span>}
        </div>
        {bridge ? (
          <>
            <div className={needsAttention ? "app-health attention" : "app-health ready"}>
              {needsAttention ? <CircleAlert size={22} /> : <CheckCircle2 size={22} />}
              <div>
                <strong>{loading ? "Checking app services" : needsAttention ? "Some features need attention" : "Everything is ready"}</strong>
                <span>{loading ? "" : `${healthy} of ${services.length} app services running`}</span>
              </div>
            </div>
            <div className="service-list">
              {services.map((service) => (
                <div className="service-row" key={service.id}>
                  <span className={`service-dot ${service.status}`} aria-hidden="true" />
                  <div><strong>{service.label}</strong><small>{friendlyServiceStatus(service)}</small></div>
                </div>
              ))}
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="button-row">
              <button className="secondary-button" type="button" disabled={restarting} onClick={() => void restartServices()}>
                <RefreshCw size={16} /> {restarting ? "Restarting..." : "Restart app services"}
              </button>
              <button className="secondary-button" type="button" onClick={() => void bridge.openDataFolder()}>
                <FolderOpen size={16} /> Open data folder
              </button>
            </div>
          </>
        ) : (
          <div className="app-health ready">
            <CheckCircle2 size={22} />
            <div><strong>Connected to Yomunami</strong><span>App services are managed outside this browser.</span></div>
          </div>
        )}
      </section>

      <BackupPanel />

      <section className="panel advanced-links">
        <div className="panel-heading"><div><span className="eyebrow">Advanced</span><h2>Learning data</h2></div></div>
        <a className="settings-link" href={bridge ? "#/database" : "/database"}><Database size={19} /><span><strong>Dictionary data</strong><small>Imports, local dictionaries, and kanji graph</small></span></a>
        <a className="settings-link" href={bridge ? "#/profile" : "/profile"}><BookOpen size={19} /><span><strong>Learning profile</strong><small>Knowledge history and progress details</small></span></a>
      </section>
    </section>
  );
}

function friendlyServiceStatus(service: DesktopService) {
  if (service.status === "running") return "Ready";
  if (service.status === "starting") return "Starting";
  if (service.status === "stopped") return "Stopped";
  return service.detail || "Unavailable";
}
