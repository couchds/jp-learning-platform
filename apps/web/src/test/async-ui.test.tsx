import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "../components/Pagination";
import { ResourcePicker } from "../components/ResourcePicker";
import { useAsyncTask } from "../hooks/useAsyncTask";

function TaskHarness() {
  const task = useAsyncTask();
  const [complete, setComplete] = useState(false);
  return <><button disabled={task.running} onClick={() => void task.run(async () => { throw new Error("No connection"); })}>Fail</button><button disabled={task.running} onClick={() => void task.run(async () => { setComplete(true); })}>Pass</button>{task.error && <span role="alert">{task.error}</span>}{complete && <span>complete</span>}</>;
}

describe("shared async UI", () => {
  it("surfaces recoverable request errors and can run again", async () => {
    render(<TaskHarness />);
    fireEvent.click(screen.getByText("Fail"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection");
    fireEvent.click(screen.getByText("Pass"));
    expect(await screen.findByText("complete")).toBeInTheDocument();
  });

  it("paginates datasets above previous hard-coded limits", () => {
    const onChange = vi.fn();
    render(<Pagination limit={24} offset={72} total={131} onChange={onChange} />);
    expect(screen.getByText("73-96 of 131")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onChange).toHaveBeenCalledWith(96);
  });

  it("loads and selects resources beyond the first selector page", async () => {
    const resources = Array.from({ length: 60 }, (_, index) => ({ id: index + 1, name: `Resource ${index + 1}`, type: "book", status: "in_progress", description: null, difficultyLevel: null, coverImagePath: null, tags: [], createdAt: "", updatedAt: "" }));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 25);
      return new Response(JSON.stringify({ items: resources.slice(offset, offset + limit), page: { limit, offset, total: resources.length } }), { status: 200 });
    }));
    const onChange = vi.fn();
    render(<ResourcePicker value={null} onChange={onChange} />);
    await screen.findByText("25 of 60");
    fireEvent.click(screen.getByText("Load more"));
    await screen.findByText("50 of 60");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "40" } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(40, expect.objectContaining({ name: "Resource 40" })));
    vi.unstubAllGlobals();
  });
});
