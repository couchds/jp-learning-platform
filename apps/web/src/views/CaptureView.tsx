import { useEffect, useState } from "react";
import { Crosshair, FileImage, Monitor, Upload } from "lucide-react";
import { api } from "../api";
import { ResourcePicker } from "../components/ResourcePicker";
import { getDesktopBridge } from "../desktop";
import type { OcrResult, Resource, ResourceTerm } from "../types";
import { EmptyState } from "./shared";

export function CaptureView({ onChange }: { onChange: () => void }) {
  const bridge = getDesktopBridge();
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [trackedTerms, setTrackedTerms] = useState<ResourceTerm[]>([]);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.resources("?limit=200")
      .then((response) => {
        setResources(response.items);
        setSelectedResourceId(response.items[0]?.id ?? null);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Could not load your library");
      });
  }, []);

  async function captureScreen() {
    if (!bridge) return;
    setCapturing(true);
    setMessage(null);
    setError(null);
    try {
      const response = await bridge.capture();
      if (!response.ok) throw new Error(response.error ?? "Screen capture is unavailable");
      setMessage("Select the Japanese text you want to capture.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start screen capture");
    } finally {
      setCapturing(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (selectedResourceId) {
        const response = await api.ocrResourceImage(selectedResourceId, file, true);
        setResult(response.ocr);
        setTrackedTerms(response.trackedTerms);
        setMessage(response.trackedTerms.length
          ? `Added ${response.trackedTerms.length} suggested term${response.trackedTerms.length === 1 ? "" : "s"} to this resource.`
          : "Capture complete. No new terms were found.");
        onChange();
      } else {
        setResult(await api.ocrImage(file));
        setTrackedTerms([]);
        setMessage("Capture complete.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read this image");
    } finally {
      setBusy(false);
    }
  }

  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const terms = trackedTerms.length ? trackedTerms : result?.terms ?? [];

  return (
    <section className="capture-layout simplified-capture">
      {bridge && (
        <section className="panel screen-capture-panel">
          <div className="capture-symbol"><Monitor size={28} aria-hidden="true" /></div>
          <div>
            <span className="eyebrow">Desktop</span>
            <h2>Capture from your screen</h2>
            <p>Works over games, videos, documents, and websites.</p>
          </div>
          <button className="primary-button capture-button" type="button" disabled={capturing} onClick={() => void captureScreen()}>
            <Crosshair size={18} /> {capturing ? "Opening..." : "Capture screen"}
          </button>
        </section>
      )}

      <section className="panel upload-panel">
        <FileImage size={26} aria-hidden="true" />
        <div>
          <span className="eyebrow">Image</span>
          <h2>{bridge ? "Use an image instead" : "Upload a screenshot"}</h2>
          <p>Choose a screenshot or cropped image containing Japanese text.</p>
        </div>
        <label>
          Save terms to
          <ResourcePicker value={selectedResourceId} allowNone onChange={(id, resource) => {
            setSelectedResourceId(id);
            if (resource) setResources((current) => [...new Map([...current, resource].map((item) => [item.id, item])).values()]);
          }} />
        </label>
        <label className="file-button">
          <Upload size={18} />
          {busy ? "Reading image..." : "Choose image"}
          <input type="file" accept="image/*" disabled={busy} onChange={(event) => void upload(event.target.files?.[0])} />
        </label>
        {selectedResource && <p className="helper-text">New terms will be saved to {selectedResource.name}.</p>}
      </section>

      {(message || error) && (
        <div className={error ? "capture-notice error" : "capture-notice success"} role={error ? "alert" : "status"}>
          {error ?? message}
        </div>
      )}

      <section className="panel capture-results">
        <div className="panel-heading"><h2>Latest result</h2>{result && <span>{terms.length} suggested terms</span>}</div>
        {!result ? (
          <EmptyState title="No image read yet" detail="Your latest text and suggested terms will appear here." />
        ) : (
          <>
            <pre className="ocr-text">{result.rawText}</pre>
            <div className="term-suggestion-grid">
              {terms.map((term, index) => (
                <article className="term-card" key={`${term.text}-${index}`}>
                  <span>{term.termType}</span>
                  <strong>{term.text}</strong>
                  <small>{term.reading || term.meaning || "From this capture"}</small>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
