import { describe, expect, it } from "vitest";

import {
  clampPortraitCrop,
  initialPortraitCrop,
  maximumCropSize,
} from "./portrait-image";

describe("portrait crop geometry", () => {
  it("starts with the largest centered square that fits the image", () => {
    expect(initialPortraitCrop(1200, 800)).toEqual({
      x: 0.5,
      y: 0.5,
      size: 2 / 3,
    });
    expect(initialPortraitCrop(800, 1200)).toEqual({
      x: 0.5,
      y: 0.5,
      size: 1,
    });
    expect(maximumCropSize(800, 1200)).toBe(1);
  });

  it("keeps zoomed crops inside landscape and portrait sources", () => {
    expect(clampPortraitCrop({ x: 0, y: 1, size: 0.5 }, 1200, 800)).toEqual({
      x: 0.25,
      y: 0.625,
      size: 0.5,
    });
    expect(clampPortraitCrop({ x: 1, y: 0, size: 0.8 }, 800, 1200)).toEqual({
      x: 0.6,
      y: 0.8 / 3,
      size: 0.8,
    });
  });

  it("clamps excessive zoom and zoom-out requests", () => {
    expect(clampPortraitCrop({ x: 0.5, y: 0.5, size: 2 }, 1000, 500).size).toBe(
      0.5,
    );
    expect(clampPortraitCrop({ x: 0.5, y: 0.5, size: 0 }, 1000, 500).size).toBe(
      0.5 / 12,
    );
  });
});
