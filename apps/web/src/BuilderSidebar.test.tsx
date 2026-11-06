// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILDER_SIDEBAR_RAIL_QUERY, BuilderSidebar } from "./BuilderSidebar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = () => void;

/** A controllable matchMedia: `narrow` decides the rail query's match. */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const state = { narrow: initial };
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === BUILDER_SIDEBAR_RAIL_QUERY && state.narrow;
    },
    media: query,
    addEventListener: (_: string, listener: Listener) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) =>
      listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  return {
    set(narrow: boolean) {
      state.narrow = narrow;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

/** The drawer around the sidebar carries the open state. */
function drawerOpen(panel: HTMLElement): boolean {
  return (
    panel.parentElement?.classList.contains("builder-sidebar-drawer-open") ===
    true
  );
}

describe("BuilderSidebar drawer", () => {
  let container: HTMLDivElement;
  let outside: HTMLButtonElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    outside = document.createElement("button");
    outside.textContent = "Outside";
    document.body.append(container, outside);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    outside.remove();
  });

  function render() {
    act(() =>
      root.render(
        createElement(
          BuilderSidebar,
          null,
          createElement("button", { type: "button" }, "Inside"),
          createElement(
            "dialog",
            { open: true },
            createElement("input", { "aria-label": "In dialog" }),
          ),
        ),
      ),
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      "button.builder-sidebar-rail",
    );
    const panel = container.querySelector<HTMLElement>("aside");
    if (toggle === null || panel === null) throw new Error("not rendered");
    return { toggle, panel };
  }

  function click(element: Element) {
    act(() => {
      element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      if (element instanceof HTMLElement) element.click();
    });
  }

  function press(element: Element, key: string) {
    act(() => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
      );
    });
  }

  it("is a disclosure button controlling the labelled sidebar region", () => {
    installMatchMedia(true);
    const { toggle, panel } = render();
    expect(panel.getAttribute("aria-label")).toBe("Character");
    expect(toggle.getAttribute("aria-label")).toBe("Character sidebar");
    // The strip is the drawer's right edge, right after the sidebar.
    expect(panel.nextElementSibling).toBe(toggle);
    expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(drawerOpen(panel)).toBe(false);
  });

  it("opens on the rail button, moves focus in, and the button closes it", () => {
    installMatchMedia(true);
    const { toggle, panel } = render();
    toggle.focus();
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(drawerOpen(panel)).toBe(true);
    expect(document.activeElement).toBe(panel);
    // Clicking inside keeps it open.
    click(panel.querySelector("button") as HTMLButtonElement);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("closes on Esc and returns focus to the rail button", () => {
    installMatchMedia(true);
    const { toggle, panel } = render();
    click(toggle);
    const inside = panel.querySelector("button") as HTMLButtonElement;
    inside.focus();
    press(inside, "Escape");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("leaves Esc inside a dialog opened from the sidebar to that dialog", () => {
    installMatchMedia(true);
    const { toggle, panel } = render();
    click(toggle);
    press(panel.querySelector("dialog input") as HTMLInputElement, "Escape");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on a click outside, leaving focus where the click lands", () => {
    installMatchMedia(true);
    const { toggle } = render();
    click(toggle);
    outside.focus();
    click(outside);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
  });

  it("stays docked on wide windows, ignoring Esc and outside clicks", () => {
    installMatchMedia(false);
    const { toggle, panel } = render();
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(drawerOpen(panel)).toBe(false);
    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    act(() => {
      outside.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(false);
  });

  it("docks again, closed, when the window widens", () => {
    const media = installMatchMedia(true);
    const { toggle, panel } = render();
    click(toggle);
    media.set(false);
    expect(drawerOpen(panel)).toBe(false);
    media.set(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
