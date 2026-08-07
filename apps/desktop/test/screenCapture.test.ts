import { describe, expect, it } from "vitest";
import { captureSize, selectCaptureSource } from "../src/screenCapture.js";

describe("screen capture selection", () => {
  it("requests physical display pixels at the active scale factor", () => {
    expect(captureSize({ size: { width: 1440, height: 900 }, scaleFactor: 2 })).toEqual({
      width: 2880,
      height: 1800
    });
  });

  it("selects the source with the matching display id", () => {
    const sources = [{ display_id: "22", name: "secondary" }, { display_id: "11", name: "primary" }];
    expect(selectCaptureSource(sources, { id: 11 }, [{ id: 11 }, { id: 22 }])?.name).toBe("primary");
  });

  it("falls back to display order when a platform omits source ids", () => {
    const sources = [{ display_id: "", name: "primary" }, { display_id: "", name: "secondary" }];
    expect(selectCaptureSource(sources, { id: 22 }, [{ id: 11 }, { id: 22 }])?.name).toBe("secondary");
  });
});
