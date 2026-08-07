import { readJson } from "../db/index.js";
import { detectGrammar } from "./grammar.js";
import { termsFromOcrElements } from "./ocrTerms.js";

export type ResourceImageRow = {
  id: number;
  resource_id: number | null;
  file_path: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  ocr_text: string | null;
  ocr_elements_json: string;
  created_at: string;
  updated_at: string;
};

export function mapResourceImage(row: ResourceImageRow) {
  return {
    id: row.id,
    resourceId: row.resource_id,
    filePath: row.file_path,
    imageUrl: uploadUrl(row.file_path),
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    ocrText: row.ocr_text,
    ocrElements: readJson<unknown[]>(row.ocr_elements_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function analyzeResourceImage(row: ResourceImageRow) {
  const image = mapResourceImage(row);
  const terms = termsFromOcrElements(image.ocrElements).map((term) => ({
    ...term,
    sourceImageId: image.id
  }));
  const grammarMatches = detectGrammar(image.ocrText ?? "", image.ocrElements).map((match) => ({
    ...match,
    sourceImageId: image.id
  }));

  return { image, terms, grammarMatches };
}

export function mapResourceImageSummary(row: ResourceImageRow) {
  const analysis = analyzeResourceImage(row);
  return {
    id: analysis.image.id,
    resourceId: analysis.image.resourceId,
    filePath: analysis.image.filePath,
    imageUrl: analysis.image.imageUrl,
    originalName: analysis.image.originalName,
    mimeType: analysis.image.mimeType,
    sizeBytes: analysis.image.sizeBytes,
    ocrTextPreview: (analysis.image.ocrText ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    termCount: analysis.terms.length,
    grammarCount: analysis.grammarMatches.length,
    createdAt: analysis.image.createdAt,
    updatedAt: analysis.image.updatedAt
  };
}

function uploadUrl(filePath: string) {
  const encodedPath = filePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/uploads/${encodedPath}`;
}
