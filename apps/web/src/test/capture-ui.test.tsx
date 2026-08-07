import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { captureToFile } from "../captureImage";
import type { DesktopCapture, DesktopService, KakomuDesktopBridge } from "../desktop";
import { CaptureView } from "../views/CaptureView";

vi.mock("../api", () => ({
  api: {
    resources: vi.fn(),
    ocrResourceImage: vi.fn(),
    ocrImage: vi.fn(),
    addResourceTerms: vi.fn(),
    addResourceGrammar: vi.fn()
  }
}));

vi.mock("../captureImage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../captureImage")>();
  return {
    ...original,
    captureToFile: vi.fn(async () => new File(["capture"], "capture.png", { type: "image/png" }))
  };
});

const capture: DesktopCapture = {
  dataUrl: "data:image/png;base64,capture",
  width: 1280,
  height: 720,
  displayId: "1",
  sourceName: "Main display"
};

const resource = {
  id: 7,
  name: "Persona 5",
  type: "game",
  status: "active",
  description: null,
  coverImagePath: null,
  difficultyLevel: null,
  tags: [],
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z"
};

describe("integrated desktop OCR", () => {
  beforeEach(() => {
    vi.mocked(api.resources).mockResolvedValue({ items: [resource], page: { limit: 200, offset: 0, total: 1 } });
    window.kakomuDesktop = desktopBridge();
  });

  afterEach(() => {
    cleanup();
    delete window.kakomuDesktop;
    vi.clearAllMocks();
  });

  it("opens a captured screen in the in-app crop editor", async () => {
    render(<CaptureView onChange={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Capture screen" }));

    expect(await screen.findByRole("img", { name: "Screen capture preview" })).toBeInTheDocument();
    expect(screen.getByText("Main display")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read full image" })).toBeInTheDocument();
  });

  it("reviews suggestions and saves only checked terms", async () => {
    vi.mocked(api.ocrResourceImage).mockResolvedValue({
      image: { id: 12 },
      trackedTerms: [],
      ocr: {
        rawText: "日本語を勉強しています",
        elements: [],
        terms: [
          { termType: "word", text: "日本語", reading: "にほんご", meaning: "Japanese", source: "ocr", sourceImageId: 12, frequency: 1, notes: null },
          { termType: "kanji", text: "日", reading: null, meaning: null, source: "ocr", sourceImageId: 12, frequency: 1, notes: null }
        ],
        grammarMatches: [{
          matchId: "te-iru:6:10",
          conceptId: "te-iru",
          title: "Ongoing action or state",
          pattern: "-te iru / -de iru",
          explanation: "Describes an action in progress or a continuing state.",
          jlptLevel: "N5",
          matchedText: "ています",
          sentence: "日本語を勉強しています",
          start: 6,
          end: 10,
          confidence: 0.94,
          sourceImageId: 12,
          bbox: { x: 100, y: 30, width: 90, height: 28 }
        }],
        imageWidth: 1280,
        imageHeight: 720
      }
    });
    vi.mocked(api.addResourceTerms).mockResolvedValue({
      terms: [{
        id: 22,
        resourceId: 7,
        termType: "word",
        text: "日本語",
        reading: "にほんご",
        meaning: "Japanese",
        source: "ocr",
        sourceImageId: 12,
        frequency: 1,
        notes: null,
        createdAt: "2026-08-07T00:00:00.000Z",
        updatedAt: "2026-08-07T00:00:00.000Z"
      }]
    });
    vi.mocked(api.addResourceGrammar).mockResolvedValue({
      items: [{
        id: 31,
        resourceId: 7,
        conceptId: "te-iru",
        title: "Ongoing action or state",
        pattern: "-te iru / -de iru",
        explanation: "Describes an action in progress or a continuing state.",
        jlptLevel: "N5",
        matchedText: "ています",
        sentence: "日本語を勉強しています",
        confidence: 0.94,
        sourceImageId: 12,
        frequency: 1,
        createdAt: "2026-08-07T00:00:00.000Z",
        updatedAt: "2026-08-07T00:00:00.000Z"
      }]
    });

    render(<CaptureView desktopCapture={{ ok: true, capture }} onChange={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Read full image" }));
    expect(await screen.findByRole("button", { name: "Save 2" })).toBeInTheDocument();
    expect(screen.getByText("Ongoing action or state")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 1 grammar match" })).toBeInTheDocument();
    expect(document.querySelector(".grammar-highlight")).toBeInTheDocument();

    const termCheckboxes = document.querySelectorAll(".term-card input");
    fireEvent.click(termCheckboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save 1" }));

    await waitFor(() => expect(api.addResourceTerms).toHaveBeenCalledWith(7, [expect.objectContaining({ text: "日本語" })]));
    expect(screen.getByText("Saved 1 term to Persona 5.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 grammar match" }));
    await waitFor(() => expect(api.addResourceGrammar).toHaveBeenCalledWith(7, [expect.objectContaining({ conceptId: "te-iru" })]));
    expect(screen.getByText("Saved 1 grammar match to Persona 5.")).toBeInTheDocument();
    expect(captureToFile).toHaveBeenCalledWith(capture, null);
  });
});

function desktopBridge(): KakomuDesktopBridge {
  return {
    getRuntime: async () => ({ apiUrl: "http://127.0.0.1:4000", apiToken: "token", version: "0.8.1", platform: "win32", isDesktop: true }),
    getServices: async () => [] as DesktopService[],
    restartServices: async () => [],
    capture: async () => ({ ok: true, capture }),
    openDataFolder: async () => undefined,
    onServicesChanged: () => () => undefined,
    onCaptureReady: () => () => undefined
  };
}
