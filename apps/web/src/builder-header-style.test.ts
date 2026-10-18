import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = ["./styles/primitives.css", "./styles.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\\n");

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations = styles.match(
    new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`),
  )?.[1];

  expect(declarations).toBeDefined();
  return declarations ?? "";
}

describe("builder character sidebar layout", () => {
  it("puts a sticky character sidebar beside every builder workspace", () => {
    expect(declarationsFor(".builder-layout")).toContain(
      "grid-template-columns: var(--builder-sidebar-width) minmax(0, 1fr)",
    );
    expect(declarationsFor(".builder-sidebar")).toContain("position: sticky");
    expect(declarationsFor(".builder-sidebar-identity")).toContain(
      "align-items: center",
    );
    expect(declarationsFor(".builder-character-name input")).toContain(
      "inline-size: 100%",
    );
    expect(styles).not.toContain(".builder-header-stat");
    expect(declarationsFor(".builder-tabs-bar")).not.toContain("border-top");
  });

  it("arranges stats like the printed Play-data card", () => {
    expect(declarationsFor(".builder-character-stat-row")).toContain(
      "grid-template-columns: 1fr 1fr 2.2fr",
    );
    expect(
      declarationsFor(
        ".builder-character-stats .stat-tiles-compact .stat-tile dd",
      ),
    ).toContain("font-size: 1.4em");
  });

  it("keeps detail panes one card wide and folds the sidebar on narrow windows", () => {
    expect(declarationsFor(".level-choice-workspace")).toContain(
      "grid-template-columns: minmax(0, 1fr) var(--panel-card-width)",
    );
    expect(styles).toMatch(
      /@media \(max-width: 63rem\)[\s\S]*?\.builder-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.builder-tabs-bar\s*\{[^}]*flex-direction: column/,
    );
  });

  it("keeps the expanded top-level navigation compact", () => {
    expect(
      declarationsFor(".builder-tabs :is(button, .builder-tab)"),
    ).toContain("padding: 0.65rem");
  });
});
