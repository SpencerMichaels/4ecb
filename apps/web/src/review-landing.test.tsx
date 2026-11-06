// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChoiceAccordionItem } from "./ChoiceAccordionItem";
import {
  startReviewLanding,
  useReviewLanding,
  type LandingEnvironment,
  type ReviewLanding,
} from "./review-landing";

// jsdom has no layout or frames: run frames by hand and record scrolls.
let frames: (() => void)[] = [];
const environment = (): LandingEnvironment => ({
  document,
  requestFrame: (callback) => frames.push(callback),
  cancelFrame: () => undefined,
});
function runFrames(count = 1): void {
  for (let index = 0; index < count; index += 1) {
    const due = frames;
    frames = [];
    due.forEach((callback) => callback());
  }
}
const scrolled: { id: string; block: unknown }[] = [];

beforeEach(() => {
  frames = [];
  scrolled.length = 0;
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value(this: HTMLElement, options?: ScrollIntoViewOptions) {
      scrolled.push({ id: this.id, block: options?.block });
    },
  });
});

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});
function render(node: React.ReactNode): void {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

const landing = (overrides: Partial<ReviewLanding> = {}): ReviewLanding => ({
  elementIds: ["step-2", "flow", "panel"],
  block: "start",
  focus: true,
  request: 1,
  ...overrides,
});

describe("startReviewLanding", () => {
  it("lands on the exact element after the route's focus, and focuses it without scrolling", () => {
    document.body.innerHTML = `<main id="main-content" tabindex="-1"><section id="flow"><section id="step-2" tabindex="-1"></section></section></main>`;
    const settled = vi.fn();
    const focus = vi.spyOn(window.HTMLElement.prototype, "focus");
    startReviewLanding(landing(), settled, environment());
    // The route focuses the main landmark in the same commit; landing runs
    // from the next frame, so its focus wins.
    document.getElementById("main-content")!.focus();
    runFrames();
    expect(scrolled).toEqual([{ id: "step-2", block: "start" }]);
    expect(document.activeElement?.id).toBe("step-2");
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(settled).toHaveBeenCalledOnce();
    runFrames(3);
    expect(scrolled).toHaveLength(1);
    focus.mockRestore();
  });

  it("waits for the element (an accordion still opening), then falls back to its group", () => {
    document.body.innerHTML = `<div hidden><section id="step-2"></section></div><section id="flow" tabindex="-1"></section>`;
    startReviewLanding(landing(), () => undefined, environment());
    runFrames(10);
    expect(scrolled).toEqual([]);
    runFrames(40);
    expect(scrolled).toEqual([{ id: "flow", block: "start" }]);
  });

  it("doesn't scroll once the user has moved on before it could land", () => {
    document.body.innerHTML = `<div hidden><section id="step-2"></section></div>`;
    const settled = vi.fn();
    startReviewLanding(landing(), settled, environment());
    runFrames(5);
    window.dispatchEvent(new Event("wheel"));
    expect(settled).toHaveBeenCalledOnce();
    document.querySelector("[hidden]")!.removeAttribute("hidden");
    runFrames(5);
    expect(scrolled).toEqual([]);
  });

  it("only scrolls (no focus) for a pick that opened a later step", () => {
    document.body.innerHTML = `<button id="pick">Pick</button><section id="step-2" tabindex="-1"></section>`;
    document.getElementById("pick")!.focus();
    startReviewLanding(
      landing({ focus: false, elementIds: ["step-2"] }),
      () => undefined,
      environment(),
    );
    runFrames();
    expect(scrolled).toEqual([{ id: "step-2", block: "start" }]);
    expect(document.activeElement?.id).toBe("pick");
  });
});

describe("useReviewLanding", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) =>
      frames.push(callback),
    );
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  // A Build tab in miniature: Review opens the folded accordion item and
  // lands on step 2 once the level is evaluated.
  function Tab({ ready }: { readonly ready: boolean }) {
    const [open, setOpen] = useState(false);
    const [target, setTarget] = useState<ReviewLanding>();
    useReviewLanding(target, ready, () => setTarget(undefined));
    return (
      <>
        <button
          id="review"
          type="button"
          onClick={() => {
            setOpen(true);
            setTarget(landing({ elementIds: ["step-2", "flow"] }));
          }}
        >
          Review
        </button>
        <button id="other" type="button">
          Other tab
        </button>
        <ChoiceAccordionItem
          open={open}
          title="Hybrid Talent"
          picks=""
          onToggle={() => setOpen((value) => !value)}
        >
          <section id="flow">
            <section id="step-2" tabIndex={-1}>
              <h5>Hybrid Talent</h5>
            </section>
          </section>
        </ChoiceAccordionItem>
      </>
    );
  }

  it("expands, scrolls and focuses only after Review, once ready", () => {
    render(<Tab ready={false} />);
    // Ordinary rendering never scrolls.
    runFrames(5);
    expect(scrolled).toEqual([]);
    act(() => document.getElementById("review")!.click());
    expect(document.getElementById("step-2")).not.toBeNull();
    runFrames(5);
    expect(scrolled).toEqual([]);
    act(() => root!.render(<Tab ready />));
    runFrames();
    expect(scrolled).toEqual([{ id: "step-2", block: "start" }]);
    expect(document.activeElement?.id).toBe("step-2");
  });
});
