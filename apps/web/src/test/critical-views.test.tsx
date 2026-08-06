import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { CaptureView } from "../views/CaptureView";
import { QuizView } from "../views/QuizView";
import { ResourcesView } from "../views/ResourcesView";
import { TrackerView } from "../views/TrackerView";

vi.mock("../api", () => ({
  api: {
    resources: vi.fn(),
    desktopOverlayStatus: vi.fn(),
    ocrHealth: vi.fn()
  }
}));

const emptyResources = { items: [], page: { limit: 25, offset: 0, total: 0 } };

describe("critical routed view states", () => {
  beforeEach(() => {
    vi.mocked(api.resources).mockResolvedValue(emptyResources);
    vi.mocked(api.desktopOverlayStatus).mockResolvedValue({ available: false } as never);
    vi.mocked(api.ocrHealth).mockResolvedValue({ service: "ocr", url: "", available: false });
  });

  it("shows resource loading failures without losing the create form", async () => {
    vi.mocked(api.resources).mockRejectedValue(new Error("Database unavailable"));
    render(<ResourcesView onChange={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByText("Add Resource")).toBeInTheDocument();
  });

  it("shows explicit empty tracker and quiz states", async () => {
    const tracker = render(<TrackerView onChange={() => undefined} />);
    expect(await screen.findByText("Pick a resource")).toBeInTheDocument();
    tracker.unmount();
    render(<QuizView />);
    expect(await screen.findByText("Choose a resource")).toBeInTheDocument();
  });

  it("keeps capture usable when local companion services are unavailable", async () => {
    render(<CaptureView onChange={() => undefined} onNavigate={() => undefined} />);
    expect(await screen.findByText("Screenshot OCR")).toBeInTheDocument();
    expect(screen.getByText("Choose image")).toBeInTheDocument();
  });
});
