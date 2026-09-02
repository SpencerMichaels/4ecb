import { describe, expect, it } from "vitest";

import { applyThemePreference, parseThemePreference } from "./theme";

describe("theme preference", () => {
  it("accepts only explicit light and dark overrides", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("unknown")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("leaves system preference to CSS and applies explicit overrides", () => {
    const root = {
      dataset: {} as Record<string, string | undefined>,
      style: { colorScheme: "" },
    } as unknown as HTMLElement;
    applyThemePreference(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    applyThemePreference(root, "system");
    expect(root.dataset.theme).toBeUndefined();
    expect(root.style.colorScheme).toBe("light dark");
  });
});
