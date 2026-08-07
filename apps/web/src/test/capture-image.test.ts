import { describe, expect, it } from "vitest";
import { selectionFromPoints, selectionPixels } from "../captureImage";

describe("capture selection geometry", () => {
  it("normalizes reverse drags into a top-left selection", () => {
    expect(selectionFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.6000000000000001,
      height: 0.6
    });
  });

  it("ignores accidental clicks and clamps points to the image", () => {
    expect(selectionFromPoints({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.505 })).toBeNull();
    expect(selectionFromPoints({ x: -1, y: 0.25 }, { x: 2, y: 0.75 })).toEqual({
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.5
    });
  });

  it("maps normalized selections to bounded image pixels", () => {
    expect(selectionPixels({ x: 0.25, y: 0.2, width: 0.5, height: 0.4 }, 1920, 1080)).toEqual({
      x: 480,
      y: 216,
      width: 960,
      height: 432
    });
  });
});
