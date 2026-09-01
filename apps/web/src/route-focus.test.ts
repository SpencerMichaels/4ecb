import { describe, expect, it, vi } from "vitest";

import { focusMainContent } from "./route-focus";

describe("route focus management", () => {
  it("moves programmatic focus to the main landmark", () => {
    const focus = vi.fn();
    const main = { tabIndex: 0, focus };
    const getElementById = vi.fn((id: string) =>
      id === "main-content" ? main : null,
    );
    expect(focusMainContent({ getElementById })).toBe(true);
    expect(getElementById).toHaveBeenCalledWith("main-content");
    expect(main.tabIndex).toBe(-1);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does nothing while a route has no main landmark", () => {
    expect(focusMainContent({ getElementById: () => null })).toBe(false);
  });
});
