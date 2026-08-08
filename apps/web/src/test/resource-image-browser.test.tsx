import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ResourceImageBrowser } from "../components/ResourceImageBrowser";
import type { ResourceImageDetail, ResourceImageSummary } from "../types";

vi.mock("../api", () => ({
  api: {
    assetUrl: vi.fn(),
    resourceImage: vi.fn()
  }
}));

const images: ResourceImageSummary[] = [
  imageSummary(12, "木立の間に家が見える。", 3, 2),
  imageSummary(11, "毎日、日本語を勉強しています。", 2, 1)
];

describe("resource image browser", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("flips between images and shows analysis for the selected capture", async () => {
    vi.mocked(api.assetUrl).mockImplementation(async (path) => `http://127.0.0.1:3001${path}`);
    vi.mocked(api.resourceImage).mockImplementation(async (_resourceId, imageId) => imageDetail(imageId));

    render(<ResourceImageBrowser resourceId={4} images={images} onDelete={vi.fn()} />);

    expect(await screen.findByText("木立")).toBeInTheDocument();
    expect(screen.getByText("Between")).toBeInTheDocument();
    expect(screen.getByText("grove")).toBeInTheDocument();
    expect(screen.getByText("Image 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));

    expect(await screen.findByText("日本語")).toBeInTheDocument();
    expect(screen.getByText("Ongoing action or state")).toBeInTheDocument();
    expect(screen.getByText("Japanese language")).toBeInTheDocument();
    expect(screen.getByText("Image 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Saved capture 2" })).toBeInTheDocument();
  });

  it("deletes the selected image after confirmation", async () => {
    vi.mocked(api.assetUrl).mockImplementation(async (path) => path);
    vi.mocked(api.resourceImage).mockImplementation(async (_resourceId, imageId) => imageDetail(imageId));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(<ResourceImageBrowser resourceId={4} images={images} onDelete={onDelete} />);
    await screen.findByText("木立");
    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(12));
  });

  it("opens a full-screen viewer with zoom and keyboard navigation", async () => {
    vi.mocked(api.assetUrl).mockImplementation(async (path) => path);
    vi.mocked(api.resourceImage).mockImplementation(async (_resourceId, imageId) => imageDetail(imageId));

    render(<ResourceImageBrowser resourceId={4} images={images} onDelete={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Expand saved image 1" }));

    let dialog = screen.getByRole("dialog", { name: "Saved capture 1 viewer" });
    expect(within(dialog).getByRole("img", { name: "Saved capture 1 enlarged" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(dialog).getByRole("button", { name: "Zoom in" }));
    expect(within(dialog).getByText("150%")).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "Saved capture 1 enlarged" })).toHaveStyle({ width: "150%" });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    dialog = await screen.findByRole("dialog", { name: "Saved capture 2 viewer" });
    await waitFor(() => expect(within(dialog).getByText("100%")).toBeInTheDocument());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
  });
});

function imageSummary(id: number, text: string, termCount: number, grammarCount: number): ResourceImageSummary {
  return {
    id,
    resourceId: 4,
    filePath: `resources/4/${id}.png`,
    imageUrl: `/uploads/resources/4/${id}.png`,
    originalName: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: 100,
    ocrTextPreview: text,
    termCount,
    grammarCount,
    createdAt: `2026-08-0${id === 12 ? 7 : 6}T12:00:00.000Z`,
    updatedAt: "2026-08-07T12:00:00.000Z"
  };
}

function imageDetail(id: number): ResourceImageDetail {
  const newer = id === 12;
  const text = newer ? "木立の間に家が見える。" : "毎日、日本語を勉強しています。";
  const term = {
    termType: "word" as const,
    text: newer ? "木立" : "日本語",
    reading: newer ? "こだち" : "にほんご",
    meaning: newer ? "grove" : "Japanese language",
    source: "ocr",
    sourceImageId: id,
    frequency: 1,
    notes: null
  };
  const grammar = {
    matchId: newer ? "aida:2:5" : "te-iru:8:13",
    conceptId: newer ? "aida" : "te-iru",
    title: newer ? "Between" : "Ongoing action or state",
    pattern: newer ? "N no aida ni" : "-te iru",
    explanation: newer ? "Places something between other things." : "Describes an action in progress.",
    jlptLevel: "N5" as const,
    matchedText: newer ? "間に" : "ています",
    sentence: text,
    start: 0,
    end: 2,
    confidence: 0.95,
    sourceImageId: id
  };

  return {
    image: {
      id,
      resourceId: 4,
      filePath: `resources/4/${id}.png`,
      imageUrl: `/uploads/resources/4/${id}.png`,
      originalName: `${id}.png`,
      mimeType: "image/png",
      sizeBytes: 100,
      ocrText: text,
      ocrElements: [],
      createdAt: "2026-08-07T12:00:00.000Z",
      updatedAt: "2026-08-07T12:00:00.000Z"
    },
    terms: [term],
    grammarMatches: [grammar],
    savedTerms: newer ? [{
      id: 1,
      resourceId: 4,
      ...term,
      createdAt: "2026-08-07T12:00:00.000Z",
      updatedAt: "2026-08-07T12:00:00.000Z"
    }] : [],
    savedGrammar: []
  };
}
