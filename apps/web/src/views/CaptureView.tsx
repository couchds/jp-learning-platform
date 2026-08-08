import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Check, Crosshair, Crop, FileImage, Languages, Monitor, RotateCcw, ScanText, Upload, X } from "lucide-react";
import { api } from "../api";
import { captureToFile, fileToCapture, selectionFromPoints, type CapturePoint, type CaptureSelection } from "../captureImage";
import { ResourcePicker } from "../components/ResourcePicker";
import { getDesktopBridge, type DesktopCapture, type DesktopCaptureResult } from "../desktop";
import type { GrammarMatch, OcrResult, Resource, ResourceImage, ResourceTerm, SavedGrammar } from "../types";
import { EmptyState } from "./shared";

type SuggestedTerm = NonNullable<OcrResult["terms"]>[number];
type SuggestedGrammar = NonNullable<OcrResult["grammarMatches"]>[number];

const STRONG_GRAMMAR_CONFIDENCE = 0.85;

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
  const [savedImage, setSavedImage] = useState<ResourceImage | null>(null);
  const [savedTerms, setSavedTerms] = useState<ResourceTerm[]>([]);
  const [savedGrammar, setSavedGrammar] = useState<SavedGrammar[]>([]);
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [selectedGrammar, setSelectedGrammar] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingGrammar, setSavingGrammar] = useState(false);
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
  const grammarMatches = useMemo<SuggestedGrammar[]>(() => result?.grammarMatches ?? [], [result]);
  const strongGrammar = useMemo(
    () => grammarMatches.filter((match) => match.confidence >= STRONG_GRAMMAR_CONFIDENCE),
    [grammarMatches]
  );
  const possibleGrammar = useMemo(
    () => grammarMatches.filter((match) => match.confidence < STRONG_GRAMMAR_CONFIDENCE),
    [grammarMatches]
  );
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
      let nextResult: OcrResult;
      let nextImage: ResourceImage | null = null;
      if (selectedResourceId) {
        const response = await api.ocrResourceImage(selectedResourceId, file, false);
        nextResult = response.ocr;
        nextImage = response.image;
      } else {
        nextResult = await api.ocrImage(file);
      }
      setResult(nextResult);
      setSavedImage(nextImage);
      setSavedTerms([]);
      setSavedGrammar([]);
      setSelectedTerms(new Set((nextResult.terms ?? []).map(termKey)));
      setSelectedGrammar(new Set(
        (nextResult.grammarMatches ?? [])
          .filter((match) => match.confidence >= STRONG_GRAMMAR_CONFIDENCE)
          .map((match) => match.matchId)
      ));
      const savedNotice = nextImage ? `Image saved to ${selectedResource?.name ?? "this resource"}. ` : "";
      setMessage(`${savedNotice}${nextResult.rawText.trim()
        ? selectedResourceId && ((nextResult.terms?.length ?? 0) + (nextResult.grammarMatches?.length ?? 0) > 0)
          ? "Review the vocabulary and grammar below."
          : "Text found."
        : "No Japanese text was found in this area."}`);
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

  async function saveSelectedGrammar() {
    if (!selectedResourceId) return;
    const matches = grammarMatches.filter((match) => selectedGrammar.has(match.matchId));
    if (!matches.length) return;
    setSavingGrammar(true);
    clearNotices();
    try {
      const response = await api.addResourceGrammar(selectedResourceId, matches);
      setSavedGrammar(response.items);
      setMessage(`Saved ${response.items.length} grammar match${response.items.length === 1 ? "" : "es"} to ${selectedResource?.name ?? "this resource"}.`);
      onChange();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save these grammar matches");
    } finally {
      setSavingGrammar(false);
    }
  }

  function openEditor(capture: DesktopCapture) {
    setImage(capture);
    setSelection(null);
    setDraftSelection(null);
    setResult(null);
    setSavedImage(null);
    setSavedTerms([]);
    setSavedGrammar([]);
    setSelectedTerms(new Set());
    setSelectedGrammar(new Set());
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

  function toggleGrammar(match: SuggestedGrammar) {
    setSelectedGrammar((current) => {
      const next = new Set(current);
      if (next.has(match.matchId)) next.delete(match.matchId);
      else next.add(match.matchId);
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
                <p>Kakomu will return here so you can crop and review the result.</p>
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
              {result && grammarMatches.map((match) => match.bbox && (
                <div
                  className={match.confidence >= STRONG_GRAMMAR_CONFIDENCE ? "grammar-highlight strong" : "grammar-highlight possible"}
                  style={grammarBoxStyle(match, result, selection)}
                  aria-hidden="true"
                  key={match.matchId}
                />
              ))}
            </div>
            <aside className="capture-editor-tools">
              <div className="capture-source"><Monitor size={18} /><div><strong>{image.sourceName}</strong><span>{image.width} x {image.height}</span></div></div>
              <p>Drag over the text you want. Leave the image unselected to read everything.</p>
              <label>
                Save image to
                <ResourcePicker value={selectedResourceId} allowNone onChange={(id, resource) => {
                  setSelectedResourceId(id);
                  if (resource) setResources((current) => [...new Map([...current, resource].map((item) => [item.id, item])).values()]);
                }} />
              </label>
              <div className="capture-editor-actions">
                <button className="primary-button" type="button" disabled={busy} onClick={() => void readImage()}>
                  <ScanText size={18} /> {captureActionLabel(busy, Boolean(selection), Boolean(selectedResourceId))}
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
          {result && <span>{savedImage ? "Image saved | " : ""}{suggestions.length} terms | {grammarMatches.length} grammar</span>}
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
                        <div className="term-card-definition">
                          {term.reading && term.reading !== term.text && <small lang="ja">{term.reading}</small>}
                          <small className={term.meaning ? "" : "term-definition-missing"}>
                            {term.meaning || "Definition unavailable"}
                          </small>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {savedTerms.length > 0 && <p className="helper-text">These terms are now available in Library and Review.</p>}
              </div>
            )}
            {result.rawText.trim() && (
              <div className="grammar-review">
                <div className="term-review-heading">
                  <div className="grammar-review-title">
                    <Languages size={19} aria-hidden="true" />
                    <div><h3>Grammar</h3><span>{selectedResourceId ? "Save the patterns you want to remember." : "Choose a resource above to save grammar."}</span></div>
                  </div>
                  {selectedResourceId && grammarMatches.length > 0 && (
                    <button
                      className="primary-button"
                      type="button"
                      disabled={savingGrammar || selectedGrammar.size === 0}
                      onClick={() => void saveSelectedGrammar()}
                    >
                      <Check size={17} /> {savingGrammar ? "Saving..." : `Save ${selectedGrammar.size} grammar match${selectedGrammar.size === 1 ? "" : "es"}`}
                    </button>
                  )}
                </div>
                {strongGrammar.length > 0 ? (
                  <div className="grammar-match-list">
                    {strongGrammar.map((match) => (
                      <GrammarMatchRow
                        checked={selectedGrammar.has(match.matchId)}
                        match={match}
                        onToggle={() => toggleGrammar(match)}
                        key={match.matchId}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="grammar-empty">No clear grammar patterns were found in this capture.</p>
                )}
                {possibleGrammar.length > 0 && (
                  <details className="possible-grammar">
                    <summary>{possibleGrammar.length} possible match{possibleGrammar.length === 1 ? "" : "es"}</summary>
                    <div className="grammar-match-list">
                      {possibleGrammar.map((match) => (
                        <GrammarMatchRow
                          checked={selectedGrammar.has(match.matchId)}
                          match={match}
                          onToggle={() => toggleGrammar(match)}
                          possible
                          key={match.matchId}
                        />
                      ))}
                    </div>
                  </details>
                )}
                {savedGrammar.length > 0 && <p className="helper-text">These grammar examples are now available in Library.</p>}
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}

function GrammarMatchRow({
  checked,
  match,
  onToggle,
  possible = false
}: {
  checked: boolean;
  match: GrammarMatch;
  onToggle: () => void;
  possible?: boolean;
}) {
  return (
    <label className={checked ? "grammar-match-row selected" : "grammar-match-row"}>
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="grammar-match-copy">
        <span className="grammar-match-heading">
          <strong>{match.title}</strong>
          <span className="grammar-level">{match.jlptLevel}</span>
          {possible && <span className="grammar-confidence">Possible</span>}
        </span>
        <span><mark>{match.matchedText}</mark> · {match.pattern}</span>
        <small>{match.explanation}</small>
      </span>
    </label>
  );
}

function termKey(term: SuggestedTerm) {
  return `${term.termType}:${term.text}`;
}

function captureActionLabel(busy: boolean, selected: boolean, savingImage: boolean) {
  if (busy) return savingImage ? "Saving and reading..." : "Reading...";
  if (savingImage) return selected ? "Save and read selection" : "Save and read image";
  return selected ? "Read selected area" : "Read full image";
}

function selectionStyle(selection: CaptureSelection) {
  return {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.width * 100}%`,
    height: `${selection.height * 100}%`
  };
}

function grammarBoxStyle(match: GrammarMatch, result: OcrResult, selection: CaptureSelection | null) {
  if (!match.bbox || !result.imageWidth || !result.imageHeight) return undefined;
  const region = selection ?? { x: 0, y: 0, width: 1, height: 1 };
  const x = clampUnit(match.bbox.x / result.imageWidth);
  const y = clampUnit(match.bbox.y / result.imageHeight);
  const width = Math.min(clampUnit(match.bbox.width / result.imageWidth), 1 - x);
  const height = Math.min(clampUnit(match.bbox.height / result.imageHeight), 1 - y);
  return {
    left: `${(region.x + x * region.width) * 100}%`,
    top: `${(region.y + y * region.height) * 100}%`,
    width: `${width * region.width * 100}%`,
    height: `${height * region.height * 100}%`
  };
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}
