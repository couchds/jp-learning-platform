import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    dashboard: vi.fn()
  }
}));

describe("learner app shell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    vi.mocked(api.dashboard).mockResolvedValue({
      counts: { resources: 1, kanji: 12, words: 20, images: 3, pronunciationRecordings: 0, dueReviews: 2 },
      recentResources: [{ id: 1, name: "Yotsuba", type: "manga", status: "active", updated_at: "2026-08-06" }]
    });
  });

  it("keeps persistent navigation focused on learner tasks", async () => {
    render(<App />);
    const navigation = screen.getByRole("navigation", { name: "Main sections" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Today",
      "Capture",
      "Library",
      "Review",
      "Search",
      "Settings"
    ]);
    expect(within(navigation).queryByText("Runtime")).not.toBeInTheDocument();
    expect(await screen.findByText("Review 2 due items")).toBeInTheDocument();
    fireEvent.click(within(navigation).getByText("Library"));
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/resources");
  });
});
