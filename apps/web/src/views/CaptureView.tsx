import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Check, Crosshair, Crop, FileImage, Monitor, RotateCcw, ScanText, Upload, X } from "lucide-react";
import { api } from "../api";
import { captureToFile, fileToCapture, selectionFromPoints, type CapturePoint, type CaptureSelection } from "../captureImage";
import { ResourcePicker } from "../components/ResourcePicker";
import { getDesktopBridge, type DesktopCapture, type DesktopCaptureResult } from "../desktop";
import type { OcrResult, Resource, ResourceTerm } from "../types";
import { EmptyState } from "./shared";

type SuggestedTerm = NonNullable<OcrResult["terms"]>[number];

export function CaptureView({
  desktopCapture,
  onChange
}: {
  desktopCapture?: DesktopCaptureResult | null;
  onChange: () => void;
}) {
  const bridge = getDesktopBridge();
  const editorRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<CapturePoint | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [image, setImage] = useState<DesktopCapture | null>(null);
  const [selection, setSelection] = useState<CaptureSelection | null>(null);
  const [draftSelection, setDraftSelection] = useState<CaptureSelection | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [savedTerms, setSavedTerms] = useState<ResourceTerm[]>([]);
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    if (!desktopCapture) return;
    if (desktopCapture.capture) openEditor(desktopCapture.capture);
    else if (!desktopCapture.ok) setError(desktopCapture.error ?? "Screen capture is unavailable.");
  }, [desktopCapture]);

  const suggestions = useMemo<SuggestedTerm[]>(() => result?.terms ?? [], [result]);
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const activeSelection = draftSelection ?? selection;

  async function captureScreen() {
    if (!bridge) return;
    setCapturing(true);
    clearNotices();
    try {
      const response = await bridge.capture();
      if (!response.ok || !response.capture) throw new Error(response.error ?? "Screen capture is unavailable");
      openEditor(response.capture);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not capture this screen");
    } finally {
      setCapturing(false);
    }
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    clearNotices();
    setBusy(true);
    try {
      openEditor(await fileToCapture(file));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not open this image");
    } finally {
      setBusy(false);
    }
  }

  async function readImage() {
    if (!image) return;
    setBusy(true);
    clearNotices();
    try {
      const file = await captureToFile(image, selection);
      const nextResult = selectedResourceId
        ? (await api.ocrResourceImage(selectedResourceId, file, false)).ocr
        : await api.ocrImage(file);
      setResult(nextResult);
      setSavedTerms([]);
      setSelectedTerms(new Set((nextResult.terms ?? []).map(termKey)));
      setMessage(nextResult.rawText.trim()
        ? selectedResourceId && nextResult.terms?.length
          ? "Text found. Review the suggestions before saving them."
          : "Text found."
        : "No Japanese text was found in this area.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not read this image");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelectedTerms() {
    if (!selectedResourceId) return;
    const terms = suggestions.filter((term) => selectedTerms.has(termKey(term)));
    if (!terms.length) return;
    setSaving(true);
    clearNotices();
    try {
      const response = await api.addResourceTerms(selectedResourceId, terms);
      setSavedTerms(response.terms);
      setMessage(`Saved ${response.terms.length} term${response.terms.length === 1 ? "" : "s"} to ${selectedResource?.name ?? "this resource"}.`);
      onChange();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save these terms");
    } finally {
      setSaving(false);
    }
  }

  function openEditor(capture: DesktopCapture) {
    setImage(capture);
    setSelection(null);
    setDraftSelection(null);
    setResult(null);
    setSavedTerms([]);
    setSelectedTerms(new Set());
    clearNotices();
  }

  function clearNotices() {
    setMessage(null);
    setError(null);
  }

  function pointerPoint(event: PointerEvent<HTMLDivElement>): CapturePoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height
    };
  }

  function beginSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = pointerPoint(event);
    setDraftSelection(null);
  }

  function moveSelection(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    setDraftSelection(selectionFromPoints(dragStart.current, pointerPoint(event)));
  }

  function finishSelection(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const nextSelection = selectionFromPoints(dragStart.current, pointerPoint(event));
    dragStart.current = null;
    setSelection(nextSelection);
    setDraftSelection(null);
  }

  function toggleTerm(term: SuggestedTerm) {
    const key = termKey(term);
    setSelectedTerms((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="capture-layout simplified-capture">
      {!image ? (
        <>
          {bridge && (
            <section className="panel screen-capture-panel">
              <div className="capture-symbol"><Monitor size={28} aria-hidden="true" /></div>
              <div>
                <span className="eyebrow">Desktop</span>
                <h2>Capture from your screen</h2>
                <p>Yomunami will return here so you can crop and review the result.</p>
              </div>
              <button className="primary-button capture-button" type="button" disabled={capturing} onClick={() => void captureScreen()}>
                <Crosshair size={18} /> {capturing ? "Capturing..." : "Capture screen"}
              </button>
            </section>
          )}

          <section className="panel upload-panel">
            <FileImage size={26} aria-hidden="true" />
            <div>
              <span className="eyebrow">Image</span>
              <h2>{bridge ? "Use an image instead" : "Upload a screenshot"}</h2>
              <p>Choose an image, then crop it before running text recognition.</p>
            </div>
            <label className="file-button">
              <Upload size={18} />
              {busy ? "Opening image..." : "Choose image"}
              <input type="file" accept="image/*" disabled={busy} onChange={(event) => void chooseImage(event.target.files?.[0])} />
            </label>
          </section>
        </>
      ) : (
        <section className="panel capture-editor" ref={editorRef}>
          <div className="panel-heading capture-editor-heading">
            <div><span className="eyebrow">Crop image</span><h2>Select the Japanese text</h2></div>
            <button className="icon-button" type="button" title="Close image" aria-label="Close image" onClick={() => setImage(null)}><X size={18} /></button>
          </div>
          <div className="capture-editor-grid">
            <div
              className="capture-stage"
              style={{ aspectRatio: `${image.width} / ${image.height}` }}
              onPointerDown={beginSelection}
              onPointerMove={moveSelection}
              onPointerUp={finishSelection}
              onPointerCancel={() => { dragStart.current = null; setDraftSelection(null); }}
            >
              <img src={image.dataUrl} alt="Screen capture preview" draggable={false} />
              {activeSelection && <div className="capture-selection" style={selectionStyle(activeSelection)} aria-hidden="true" />}
            </div>
            <aside className="capture-editor-tools">
              <div className="capture-source"><Monitor size={18} /><div><strong>{image.sourceName}</strong><span>{image.width} x {image.height}</span></div></div>
              <p>Drag over the text you want. Leave the image unselected to read everything.</p>
              <label>
                Save terms to
                <ResourcePicker value={selectedResourceId} allowNone onChange={(id, resource) => {
                  setSelectedResourceId(id);
                  if (resource) setResources((current) => [...new Map([...current, resource].map((item) => [item.id, item])).values()]);
                }} />
              </label>
              <div className="capture-editor-actions">
                <button className="primary-button" type="button" disabled={busy} onClick={() => void readImage()}>
                  <ScanText size={18} /> {busy ? "Reading..." : selection ? "Read selected area" : "Read full image"}
                </button>
                {selection && <button className="secondary-button" type="button" onClick={() => setSelection(null)}><Crop size={17} /> Clear selection</button>}
                {bridge && <button className="secondary-button" type="button" disabled={capturing} onClick={() => void captureScreen()}><RotateCcw size={17} /> Retake</button>}
              </div>
            </aside>
          </div>
        </section>
      )}

      {(message || error) && (
        <div className={error ? "capture-notice error" : "capture-notice success"} role={error ? "alert" : "status"}>
          {error ?? message}
        </div>
      )}

      <section className="panel capture-results">
        <div className="panel-heading">
          <h2>Recognized text</h2>
          {result && <span>{suggestions.length} suggested terms</span>}
        </div>
        {!result ? (
          <EmptyState title="No image read yet" detail="Capture or choose an image, select the text, and run recognition." />
        ) : (
          <>
            <pre className="ocr-text">{result.rawText || "No text found"}</pre>
            {suggestions.length > 0 && (
              <div className="term-review">
                <div className="term-review-heading">
                  <div><strong>Suggestions</strong><span>{selectedResourceId ? "Choose what to save." : "Choose a resource above to save terms."}</span></div>
                  {selectedResourceId && (
                    <button className="primary-button" type="button" disabled={saving || selectedTerms.size === 0} onClick={() => void saveSelectedTerms()}>
                      <Check size={17} /> {saving ? "Saving..." : `Save ${selectedTerms.size}`}
                    </button>
                  )}
                </div>
                <div className="term-suggestion-grid">
                  {suggestions.map((term) => {
                    const key = termKey(term);
                    const checked = selectedTerms.has(key);
                    return (
                      <label className={checked ? "term-card selectable selected" : "term-card selectable"} key={key}>
                        <input type="checkbox" checked={checked} onChange={() => toggleTerm(term)} />
                        <span>{term.termType}</span>
                        <strong>{term.text}</strong>
                        <small>{term.reading || term.meaning || "From this capture"}</small>
                      </label>
                    );
                  })}
                </div>
                {savedTerms.length > 0 && <p className="helper-text">These terms are now available in Library and Review.</p>}
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}

function termKey(term: SuggestedTerm) {
  return `${term.termType}:${term.text}`;
}

function selectionStyle(selection: CaptureSelection) {
  return {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.width * 100}%`,
    height: `${selection.height * 100}%`
  };
}
