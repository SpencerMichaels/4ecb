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

describe("builder header layout", () => {
  it("keeps the desktop header wide and shallow with distinct clusters", () => {
    expect(declarationsFor(".builder-heading")).toContain(
      "grid-template-columns: minmax(17rem, auto) minmax(34rem, 1fr)",
    );
    expect(declarationsFor(".builder-header-stat-groups")).toContain(
      "minmax(4.5rem, 0.6fr)",
    );
    expect(declarationsFor(".builder-header-stat-cluster")).toContain(
      "border-top: 3px solid",
    );
    expect(styles).not.toContain(
      ".builder-header-vitals .builder-header-stat dd",
    );
    expect(declarationsFor(".builder-tabs-bar")).not.toContain("border-top");
  });

  it("centers each ability pair while fixing its label and value columns", () => {
    const abilityStat = declarationsFor(
      ".builder-header-abilities .builder-header-stat",
    );

    expect(abilityStat).toContain("grid-template-columns: 1.7rem 1.25rem");
    expect(declarationsFor(".builder-header-stat")).toContain(
      "justify-content: center",
    );
    expect(abilityStat).toContain("justify-items: start");
  });

  it("stacks the identity and status surfaces at responsive breakpoints", () => {
    expect(styles).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*?\.builder-heading\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
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
