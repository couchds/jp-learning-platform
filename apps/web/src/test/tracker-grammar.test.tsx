import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { TrackerView } from "../views/TrackerView";

vi.mock("../api", () => ({
  api: {
    resources: vi.fn(),
    resource: vi.fn(),
    resourceGrammar: vi.fn(),
    words: vi.fn(),
    addResourceTerm: vi.fn(),
    addResourceWord: vi.fn()
  }
}));

const resource = {
  id: 4,
  name: "Reading practice",
  type: "book",
  status: "in_progress",
  description: null,
  difficultyLevel: "N5",
  coverImagePath: null,
  tags: [],
  createdAt: "2026-08-07T00:00:00.000Z",
  updatedAt: "2026-08-07T00:00:00.000Z"
};

describe("resource grammar library", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows saved grammar evidence separately from terms", async () => {
    vi.mocked(api.resources).mockResolvedValue({ items: [resource], page: { limit: 1, offset: 0, total: 1 } });
    vi.mocked(api.resource).mockResolvedValue({
      resource,
      kanji: [],
      words: [],
      customVocabulary: [],
      terms: [],
      images: []
    });
    vi.mocked(api.resourceGrammar).mockResolvedValue({
      items: [{
        id: 9,
        resourceId: 4,
        conceptId: "te-iru",
        title: "Ongoing action or state",
        pattern: "-te iru / -de iru",
        explanation: "Describes an action in progress or a state that continues from an earlier action.",
        jlptLevel: "N5",
        matchedText: "ています",
        sentence: "毎日、日本語を勉強しています。",
        sourceImageId: 12,
        confidence: 0.96,
        frequency: 1,
        createdAt: "2026-08-07T00:00:00.000Z",
        updatedAt: "2026-08-07T00:00:00.000Z"
      }]
    });

    render(<TrackerView onChange={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "Grammar examples" })).toBeInTheDocument();
    expect(screen.getByText("Ongoing action or state")).toBeInTheDocument();
    expect(screen.getByText("毎日、日本語を勉強しています。")).toBeInTheDocument();
    expect(screen.queryByText("Nothing tracked yet")).not.toBeInTheDocument();
  });
});
