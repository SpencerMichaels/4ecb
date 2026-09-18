import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations = styles.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  )?.[1];

  expect(declarations).toBeDefined();
  return declarations ?? "";
}

describe("character editor tab overflow", () => {
  it("keeps the workspace tabs horizontally responsive without vertical scrolling", () => {
    const workspaceTabs = declarationsFor(".builder-tabs");

    expect(workspaceTabs).toContain("overflow-x: auto");
    expect(workspaceTabs).toContain("overflow-y: hidden");
  });

  it("preserves the separate level-choice tab overflow behavior", () => {
    const levelChoiceTabs = declarationsFor(".level-choice-tabs");

    expect(levelChoiceTabs).toContain("overflow-x: auto");
    expect(levelChoiceTabs).not.toContain("overflow-y: hidden");
  });
});
