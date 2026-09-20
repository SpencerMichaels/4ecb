import { describe, expect, it, vi } from "vitest";

import {
  focusMainContent,
  shouldFocusMainContentAfterRouteChange,
} from "./route-focus";

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

describe("route focus policy", () => {
  it("preserves focus and scroll when swapping Equipment views", () => {
    const inventory = {
      page: "characters" as const,
      characterId: "one",
      mode: "edit" as const,
      builder: { workspace: "equipment" as const },
    };
    const loadout = {
      ...inventory,
      builder: { workspace: "equipment" as const, loadout: true },
    };

    expect(shouldFocusMainContentAfterRouteChange(inventory, loadout)).toBe(
      false,
    );
    expect(shouldFocusMainContentAfterRouteChange(loadout, inventory)).toBe(
      false,
    );
  });

  it("retains main-landmark focus for major navigation", () => {
    const equipment = {
      page: "characters" as const,
      characterId: "one",
      mode: "edit" as const,
      builder: { workspace: "equipment" as const },
    };

    expect(
      shouldFocusMainContentAfterRouteChange(equipment, {
        ...equipment,
        builder: { workspace: "shop" },
      }),
    ).toBe(true);
    expect(
      shouldFocusMainContentAfterRouteChange(equipment, {
        ...equipment,
        characterId: "two",
      }),
    ).toBe(true);
  });
});
