import { describe, expect, it, vi } from "vitest";

import {
  hasVerticalOverflow,
  observeVerticalOverflow,
} from "./useVerticalOverflow";

describe("vertical overflow measurement", () => {
  it("reports only vertical overflow", () => {
    expect(hasVerticalOverflow({ clientHeight: 200, scrollHeight: 201 })).toBe(
      true,
    );
    expect(
      hasVerticalOverflow({
        clientHeight: 200,
        scrollHeight: 200,
        clientWidth: 200,
        scrollWidth: 800,
      } as HTMLElement),
    ).toBe(false);
  });

  it("remeasures container and content resizes and disconnects cleanly", () => {
    const container = {
      clientHeight: 200,
      scrollHeight: 180,
    } as HTMLElement;
    const content = {} as Element;
    const observed: Element[] = [];
    const disconnect = vi.fn();
    let resizeCallback: ResizeObserverCallback | undefined;

    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe(target: Element) {
        observed.push(target);
      }

      disconnect() {
        disconnect();
      }
    }

    const changes: boolean[] = [];
    const cleanup = observeVerticalOverflow(
      container,
      content,
      (value) => changes.push(value),
      TestResizeObserver as unknown as typeof ResizeObserver,
    );

    expect(changes).toEqual([false]);
    expect(observed).toEqual([container, content]);

    Object.assign(container, { scrollHeight: 260 });
    resizeCallback?.([], {} as ResizeObserver);
    Object.assign(container, { scrollHeight: 200 });
    resizeCallback?.([], {} as ResizeObserver);

    expect(changes).toEqual([false, true, false]);

    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
