import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = ["./styles/primitives.css", "./styles.css"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\\n");

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations = styles.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  )?.[1];

  expect(declarations).toBeDefined();
  return declarations ?? "";
}

describe("builder header layout", () => {
  it("keeps the desktop header wide and shallow with distinct clusters", () => {
    expect(declarationsFor(".builder-heading")).toContain(
      "grid-template-columns: minmax(0, 19rem) minmax(0, 1fr)",
    );
    expect(declarationsFor(".builder-header-stat-groups")).toContain(
      "minmax(15rem, 4fr) minmax(15rem, 4fr) minmax(4.6rem, 1fr)",
    );
    expect(declarationsFor(".builder-character-heading")).toContain(
      "min-width: 0",
    );
    expect(declarationsFor(".builder-character-name input")).toContain(
      "inline-size: 100%",
    );
    expect(styles).not.toContain(
      ".builder-header-vitals .builder-header-stat dd",
    );
    expect(declarationsFor(".builder-tabs-bar")).not.toContain("border-top");
  });

  it("shows ability scores as compact shared stat tiles", () => {
    expect(
      declarationsFor(
        ".builder-header-stats .stat-tiles-compact .stat-tile dd",
      ),
    ).toContain("font-size: 1.4em");
    expect(styles).not.toContain(".builder-header-stat-cluster");
  });

  it("stacks the identity and status surfaces at responsive breakpoints", () => {
    expect(styles).toMatch(
      /@media \(max-width: 63rem\)[\s\S]*?\.builder-heading\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(styles).not.toContain("@media (max-width: 70rem)");
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
