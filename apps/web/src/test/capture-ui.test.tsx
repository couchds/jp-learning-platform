import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { captureToFile } from "../captureImage";
import type { DesktopCapture, DesktopService, YomunamiDesktopBridge } from "../desktop";
import { CaptureView } from "../views/CaptureView";

vi.mock("../api", () => ({
  api: {
    resources: vi.fn(),
    ocrResourceImage: vi.fn(),
    ocrImage: vi.fn(),
    addResourceTerms: vi.fn()
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
    window.yomunamiDesktop = desktopBridge();
  });

  afterEach(() => {
    cleanup();
    delete window.yomunamiDesktop;
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
        rawText: "日本語",
        elements: [],
        terms: [
          { termType: "word", text: "日本語", reading: "にほんご", meaning: "Japanese", source: "ocr", sourceImageId: 12, frequency: 1, notes: null },
          { termType: "kanji", text: "日", reading: null, meaning: null, source: "ocr", sourceImageId: 12, frequency: 1, notes: null }
        ]
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

    render(<CaptureView desktopCapture={{ ok: true, capture }} onChange={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Read full image" }));
    expect(await screen.findByRole("button", { name: "Save 2" })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save 1" }));

    await waitFor(() => expect(api.addResourceTerms).toHaveBeenCalledWith(7, [expect.objectContaining({ text: "日本語" })]));
    expect(screen.getByText("Saved 1 term to Persona 5.")).toBeInTheDocument();
    expect(captureToFile).toHaveBeenCalledWith(capture, null);
  });
});

function desktopBridge(): YomunamiDesktopBridge {
  return {
    getRuntime: async () => ({ apiUrl: "http://127.0.0.1:4000", apiToken: "token", version: "0.7.0", platform: "win32", isDesktop: true }),
    getServices: async () => [] as DesktopService[],
    restartServices: async () => [],
    capture: async () => ({ ok: true, capture }),
    openDataFolder: async () => undefined,
    onServicesChanged: () => () => undefined,
    onCaptureReady: () => () => undefined
  };
}
