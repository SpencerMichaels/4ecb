import { useEffect, useRef } from "react";

/**
 * Where an issue's Review lands: the element that shows the choice needing
 * attention. `elementIds` are tried in order (the exact choice first, then
 * whatever holds it), so a choice the page shows only as part of a group
 * still lands on that group instead of nowhere.
 */
export interface ReviewLanding {
  readonly elementIds: readonly string[];
  /** "start" puts a section's heading at the top with its table below;
   *  "nearest" moves a row only as far as needed. */
  readonly block: "start" | "nearest";
  /** Move keyboard focus to the landed element (or `focusSelector` in it).
   *  Review does; a pick that opens a later step only scrolls. */
  readonly focus: boolean;
  readonly focusSelector?: string;
  /** Changes on each request, so the same target can be reviewed again. */
  readonly request: number;
}

/** Frames to wait for the exact element before trying the next id. */
const FALLBACK_FRAMES = 30;
/** Input that means the user has moved on: don't scroll for them. */
const USER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

export interface LandingEnvironment {
  readonly document: Document;
  readonly requestFrame: (callback: () => void) => number;
  readonly cancelFrame: (handle: number) => void;
}

const browserEnvironment = (): LandingEnvironment => ({
  document,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
});

function shown(element: HTMLElement): boolean {
  return element.isConnected && element.closest("[hidden]") === null;
}

/**
 * Scrolls `landing` into view, waiting a few frames for an element that is
 * still rendering (an accordion item opening) before falling back to the
 * next id, and moves focus there with `preventScroll`. It runs from an
 * animation frame, after the route's own focus of the main landmark, so the
 * page jumps once. Input before it lands (the user moved on) cancels it.
 * Calls `onSettled` when done; returns a cleanup.
 */
export function startReviewLanding(
  landing: ReviewLanding,
  onSettled: () => void,
  environment: LandingEnvironment = browserEnvironment(),
): () => void {
  const { document: doc, requestFrame, cancelFrame } = environment;
  let frame: number | undefined;
  let stopped = false;
  let waited = 0;
  let index = 0;
  const detach = () => {
    stopped = true;
    if (frame !== undefined) cancelFrame(frame);
    for (const type of USER_INPUT)
      doc.defaultView?.removeEventListener(type, stop, true);
  };
  function stop() {
    if (stopped) return;
    detach();
    onSettled();
  }
  for (const type of USER_INPUT)
    doc.defaultView?.addEventListener(type, stop, {
      capture: true,
      passive: true,
    });
  const tick = () => {
    frame = undefined;
    if (stopped) return;
    const id = landing.elementIds[index];
    if (id === undefined) {
      stop();
      return;
    }
    const element = doc.getElementById(id);
    if (element === null || !shown(element)) {
      waited += 1;
      if (waited >= FALLBACK_FRAMES) {
        index += 1;
        waited = 0;
      }
      frame = requestFrame(tick);
      return;
    }
    element.scrollIntoView?.({ block: landing.block });
    if (landing.focus)
      (landing.focusSelector === undefined
        ? element
        : (element.querySelector<HTMLElement>(landing.focusSelector) ?? element)
      ).focus({ preventScroll: true });
    stop();
  };
  frame = requestFrame(tick);
  return () => {
    if (!stopped) detach();
  };
}

/**
 * Lands on `landing` once `ready`: the surface shows its final content
 * (on the Build tab, the level's evaluation with full candidate lists, which
 * a Review from another tab must wait for: the tables fill in and push a
 * later step down). Once per request; `onSettled` clears it. Ordinary
 * navigation passes no landing, so it never scrolls.
 */
export function useReviewLanding(
  landing: ReviewLanding | undefined,
  ready: boolean,
  onSettled: () => void,
): void {
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const request = landing === undefined || !ready ? undefined : landing;
  const key =
    request === undefined
      ? undefined
      : `${request.request}:${request.elementIds.join(" ")}`;
  const current = useRef(request);
  current.current = request;
  useEffect(() => {
    const active = current.current;
    if (key === undefined || active === undefined) return;
    return startReviewLanding(active, () => settled.current());
  }, [key]);
}
