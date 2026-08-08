import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileImage, Languages, Trash2 } from "lucide-react";
import { api } from "../api";
import type { DetectedTerm, ResourceImageDetail, ResourceImageSummary } from "../types";
import { EmptyState, type Loadable } from "../views/shared";

export function ResourceImageBrowser({
  resourceId,
  images,
  onDelete
}: {
  resourceId: number;
  images: ResourceImageSummary[];
  onDelete: (imageId: number) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(images[0]?.id ?? null);
  const [detail, setDetail] = useState<Loadable<ResourceImageDetail>>({ data: null, loading: false, error: null });
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setSelectedId(images[0]?.id ?? null);
  }, [resourceId]);

  useEffect(() => {
    setSelectedId((current) => images.some((image) => image.id === current) ? current : images[0]?.id ?? null);
    let cancelled = false;
    void Promise.all(images.map(async (image) => [image.id, await api.assetUrl(image.imageUrl)] as const))
      .then((entries) => {
        if (!cancelled) setImageUrls(Object.fromEntries(entries));
      });
    return () => { cancelled = true; };
  }, [images]);

  useEffect(() => {
    if (!selectedId) {
      setDetail({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setDetail((current) => ({ ...current, loading: true, error: null }));
    void api.resourceImage(resourceId, selectedId)
      .then((response) => {
        if (!cancelled) setDetail({ data: response, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setDetail({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Could not load this image"
          });
        }
      });
    return () => { cancelled = true; };
  }, [resourceId, selectedId]);

  const selectedIndex = Math.max(0, images.findIndex((image) => image.id === selectedId));
  const selectedSummary = images[selectedIndex];
  const savedTermKeys = useMemo(
    () => new Set((detail.data?.savedTerms ?? []).map(termKey)),
    [detail.data?.savedTerms]
  );
  const savedGrammarKeys = useMemo(
    () => new Set((detail.data?.savedGrammar ?? []).map((match) => `${match.conceptId}:${match.matchedText}`)),
    [detail.data?.savedGrammar]
  );

  function move(offset: number) {
    const next = images[selectedIndex + offset];
    if (next) setSelectedId(next.id);
  }

  async function deleteSelected() {
    if (!selectedId || !window.confirm("Delete this saved image? Saved grammar from this image will be removed; tracked words remain in the resource.")) return;
    setDeleting(true);
    try {
      await onDelete(selectedId);
    } finally {
      setDeleting(false);
    }
  }

  if (!images.length) {
    return <EmptyState title="No saved images" detail="Images read from Capture will appear here." />;
  }

  return (
    <section className="resource-image-library" aria-labelledby="resource-images-title">
      <div className="section-subheading resource-image-heading">
        <div>
          <h3 id="resource-images-title">Saved images</h3>
          <span>{images.length} capture{images.length === 1 ? "" : "s"}</span>
        </div>
        <div className="resource-image-controls">
          <button type="button" className="icon-button" aria-label="Previous image" title="Previous image" disabled={selectedIndex === 0} onClick={() => move(-1)}>
            <ChevronLeft size={18} />
          </button>
          <strong>Image {selectedIndex + 1} of {images.length}</strong>
          <button type="button" className="icon-button" aria-label="Next image" title="Next image" disabled={selectedIndex === images.length - 1} onClick={() => move(1)}>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="icon-button danger" aria-label="Delete image" title="Delete image" disabled={deleting} onClick={() => void deleteSelected()}>
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      <div className="resource-image-browser">
        <div className="resource-image-viewer">
          <div className="resource-image-stage">
            {selectedSummary && imageUrls[selectedSummary.id] ? (
              <img src={imageUrls[selectedSummary.id]} alt={`Saved capture ${selectedIndex + 1}`} />
            ) : (
              <FileImage size={30} aria-hidden="true" />
            )}
          </div>
          <div className="resource-image-meta">
            <span>{selectedSummary ? formatCaptureDate(selectedSummary.createdAt) : ""}</span>
            <span>{selectedSummary?.ocrTextPreview || "No text recognized"}</span>
          </div>
          <div className="resource-image-thumbnails" aria-label="Saved image thumbnails">
            {images.map((image, index) => (
              <button
                type="button"
                className={image.id === selectedId ? "active" : ""}
                aria-label={`Show image ${index + 1}`}
                aria-current={image.id === selectedId ? "true" : undefined}
                onClick={() => setSelectedId(image.id)}
                key={image.id}
              >
                {imageUrls[image.id] ? <img src={imageUrls[image.id]} alt="" /> : <FileImage size={20} aria-hidden="true" />}
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="resource-image-analysis" aria-live="polite">
          {detail.loading && !detail.data ? (
            <EmptyState title="Reading image details" detail="Loading detected words and grammar." />
          ) : detail.error ? (
            <p className="error-text" role="alert">{detail.error}</p>
          ) : detail.data ? (
            <>
              <AnalysisHeading icon={<FileImage size={17} />} title="Words" count={detail.data.terms.length} />
              {detail.data.terms.length ? (
                <div className="image-term-list">
                  {detail.data.terms.map((term) => (
                    <div className="image-term-row" key={termKey(term)}>
                      <div className="image-term-copy">
                        <div className="image-term-primary">
                          <strong lang="ja">{term.text}</strong>
                          {term.reading && term.reading !== term.text && <span lang="ja">{term.reading}</span>}
                        </div>
                        <small className={term.meaning ? "" : "image-term-missing"}>
                          {term.meaning || "Definition unavailable"}
                        </small>
                      </div>
                      {savedTermKeys.has(termKey(term)) && <span className="saved-badge"><Check size={12} /> Saved</span>}
                    </div>
                  ))}
                </div>
              ) : <p className="image-analysis-empty">No words detected in this image.</p>}

              <AnalysisHeading icon={<Languages size={17} />} title="Grammar" count={detail.data.grammarMatches.length} />
              {detail.data.grammarMatches.length ? (
                <div className="image-grammar-list">
                  {detail.data.grammarMatches.map((match) => (
                    <div className="image-grammar-row" key={match.matchId}>
                      <div><strong>{match.title}</strong><span>{match.jlptLevel}</span></div>
                      <p><mark lang="ja">{match.matchedText}</mark> {match.pattern}</p>
                      <small>{match.explanation}</small>
                      {savedGrammarKeys.has(`${match.conceptId}:${match.matchedText}`) && <span className="saved-badge"><Check size={12} /> Saved</span>}
                    </div>
                  ))}
                </div>
              ) : <p className="image-analysis-empty">No grammar patterns detected in this image.</p>}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AnalysisHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return <div className="image-analysis-heading">{icon}<h4>{title}</h4><span>{count}</span></div>;
}

function termKey(term: Pick<DetectedTerm, "termType" | "text">) {
  return `${term.termType}:${term.text}`;
}

function formatCaptureDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
