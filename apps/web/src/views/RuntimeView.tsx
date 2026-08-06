import { useEffect, useState } from "react";
import { Activity, CheckCircle2, X } from "lucide-react";
import { api } from "../api";
import type { RuntimeDoctor } from "../types";
import { EmptyState, type Loadable } from "./shared";

export function RuntimeView() {
  const [doctor, setDoctor] = useState<Loadable<RuntimeDoctor>>({ data: null, loading: true, error: null });

  useEffect(() => {
    void loadDoctor();
  }, []);

  async function loadDoctor() {
    setDoctor((current) => ({ ...current, loading: true, error: null }));
    try {
      setDoctor({ data: await api.runtimeDoctor(), loading: false, error: null });
    } catch (requestError) {
      setDoctor({
        data: null,
        loading: false,
        error: requestError instanceof Error ? requestError.message : "Could not run app checks"
      });
    }
  }

  const summary = doctor.data?.summary ?? "warn";
  const summaryCopy = {
    ok: { title: "Runtime ready", detail: "Storage and optional app services are ready." },
    warn: { title: "Runtime needs attention", detail: "One or more optional features may be unavailable." },
    error: { title: "Runtime blocked", detail: "A required app resource is unavailable." }
  }[summary];

  return (
    <section className="runtime-view">
      <div className={`runtime-summary ${summary}`}>
        <div>
          <span className="eyebrow">Diagnostics</span>
          <h2>{doctor.loading ? "Checking this installation" : summaryCopy.title}</h2>
          <p>{doctor.error ?? summaryCopy.detail}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void loadDoctor()}>
          <Activity size={17} /> Run checks
        </button>
      </div>

      <div className="doctor-grid">
        {(doctor.data?.checks ?? []).map((check) => {
          const StatusIcon = check.status === "ok" ? CheckCircle2 : check.status === "error" ? X : Activity;
          return (
            <article className="doctor-card" key={check.id}>
              <div className="doctor-card-heading">
                <StatusIcon size={18} aria-hidden="true" />
                <span className={`status-pill ${check.status}`}>{check.status}</span>
              </div>
              <h3>{check.label}</h3>
              <p>{check.detail}</p>
              {check.action && <small>{check.action}</small>}
            </article>
          );
        })}
      </div>

      {!doctor.loading && !doctor.error && doctor.data?.checks.length === 0 && (
        <EmptyState title="No checks returned" detail="The backend responded without diagnostic details." />
      )}
    </section>
  );
}
