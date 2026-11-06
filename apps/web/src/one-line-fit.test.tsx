// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SheetFamiliarCard } from "@4ecb/sheet-model";

import { FamiliarCard } from "./FamiliarCard";
import {
  MIN_ONE_LINE_FIT_PX,
  ONE_LINE_FIT_CLASS,
  ONE_LINE_TRUNCATED_CLASS,
  ONE_LINE_WRAPPED_CLASS,
  fitOneLineText,
  fittingOneLineSize,
  oneLineFitFloor,
} from "./one-line-fit";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A laid-out element whose unwrapped text is `perPixel` px wide per px of
 *  font size, in a `width`-px box; `natural` is its stylesheet font size. */
function textBox(perPixel: number, width: number, natural = 16): HTMLElement {
  const element = document.createElement("span");
  element.className = ONE_LINE_FIT_CLASS;
  element.getClientRects = () => [{}] as unknown as DOMRectList;
  const size = () =>
    element.style.fontSize === ""
      ? natural
      : Number.parseFloat(element.style.fontSize);
  Object.defineProperty(element, "scrollWidth", {
    get: () => size() * perPixel,
  });
  Object.defineProperty(element, "clientWidth", {
    get: () => Math.min(width, size() * perPixel),
  });
  return element;
}

function computedFontSize(px: number) {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    fontSize: `${px}px`,
  } as CSSStyleDeclaration);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("one-line fit", () => {
  it("finds the largest size that fits, never below the minimum", () => {
    expect(fittingOneLineSize((size) => size * 5, 200, 27, 18)).toBe(27);
    const fitted = fittingOneLineSize((size) => size * 10, 220, 27, 18);
    expect(fitted).toBeLessThanOrEqual(22);
    expect(fitted).toBeGreaterThan(21.75);
    expect(fittingOneLineSize((size) => size * 100, 220, 27, 18)).toBe(18);
  });

  it("leaves text that fits at its stylesheet size", () => {
    const element = textBox(5, 100);
    fitOneLineText(element);
    expect(element.style.fontSize).toBe("");
    expect(element.classList.contains(ONE_LINE_WRAPPED_CLASS)).toBe(false);
  });

  it("shrinks a long speed to fit its width instead of wrapping", () => {
    // "6, climb 6 (spider climb)": 160 px wide at 16 px in a 100 px tile.
    computedFontSize(16);
    const element = textBox(10, 100);
    fitOneLineText(element);
    const size = Number.parseFloat(element.style.fontSize);
    expect(size).toBeLessThanOrEqual(10);
    expect(size).toBeGreaterThan(9.5);
    expect(element.classList.contains(ONE_LINE_WRAPPED_CLASS)).toBe(false);
  });

  it("wraps only when the 6pt floor still overflows", () => {
    computedFontSize(16);
    const element = textBox(20, 100);
    fitOneLineText(element);
    expect(element.style.fontSize).toBe(`${MIN_ONE_LINE_FIT_PX}px`);
    expect(element.classList.contains(ONE_LINE_WRAPPED_CLASS)).toBe(true);
    // A later, wider layout starts again from the stylesheet size.
    vi.restoreAllMocks();
    const wide = textBox(5, 100);
    wide.style.fontSize = "8px";
    wide.classList.add(ONE_LINE_WRAPPED_CLASS);
    fitOneLineText(wide);
    expect(wide.style.fontSize).toBe("");
    expect(wide.classList.contains(ONE_LINE_WRAPPED_CLASS)).toBe(false);
  });

  it("reads a per-element floor and may truncate instead of wrapping", () => {
    expect(oneLineFitFloor(undefined, 16)).toBe(MIN_ONE_LINE_FIT_PX);
    expect(oneLineFitFloor("9pt", 16)).toBe(12);
    expect(oneLineFitFloor("10px", 16)).toBe(10);
    expect(oneLineFitFloor("0.75em", 16)).toBe(12);
    expect(oneLineFitFloor("20px", 16)).toBe(16);
    expect(oneLineFitFloor("small", 16)).toBe(MIN_ONE_LINE_FIT_PX);
    computedFontSize(16);
    const element = textBox(20, 100);
    element.dataset.fitMin = "9pt";
    element.dataset.fitOverflow = "ellipsis";
    fitOneLineText(element);
    expect(element.style.fontSize).toBe("12px");
    expect(element.classList.contains(ONE_LINE_TRUNCATED_CLASS)).toBe(true);
    expect(element.classList.contains(ONE_LINE_WRAPPED_CLASS)).toBe(false);
  });

  it("fits a companion card's speed whenever the card lays out", () => {
    const card: SheetFamiliarCard = {
      kind: "familiar",
      id: "FAMILIAR_SPIDER",
      name: "Test Spiderling",
      size: "Tiny",
      tier: "Heroic Tier",
      speed: "6, climb 6 (spider climb)",
      defenses: { ac: 15, fortitude: 13, reflex: 15, will: 13 },
      hitPoints: 1,
      source: "Test Book",
    };
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const fitted: Element[] = [];
    const prototype = HTMLElement.prototype;
    const rects = vi
      .spyOn(prototype, "getClientRects")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains(ONE_LINE_FIT_CLASS)) fitted.push(this);
        return [{ top: 0, bottom: 10 }] as unknown as DOMRectList;
      });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<FamiliarCard card={card} layout="panel" />));
    expect(rects).toHaveBeenCalled();
    expect(fitted.map((element) => element.textContent)).toContain(
      "6, climb 6 (spider climb)",
    );
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
