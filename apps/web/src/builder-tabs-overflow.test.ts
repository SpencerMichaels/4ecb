import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

const styles = appStyles;

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declarations = styles.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  )?.[1];

  expect(declarations).toBeDefined();
  return declarations ?? "";
}

const editor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);

describe("character editor tab overflow", () => {
  it("keeps the workspace tabs horizontally responsive without vertical scrolling", () => {
    const workspaceTabs = declarationsFor(".builder-tabs");

    // Only a fallback: icon-only tabs fit down to about a 29rem window.
    expect(workspaceTabs).toContain("overflow-x: auto");
    expect(workspaceTabs).toContain("overflow-y: hidden");
  });

  it("preserves the separate level-choice tab overflow behavior", () => {
    const levelChoiceTabs = declarationsFor(".level-choice-tabs");

    expect(levelChoiceTabs).toContain("overflow-x: auto");
    expect(levelChoiceTabs).not.toContain("overflow-y: hidden");
  });
});

describe("icon-only builder tabs", () => {
  const tabs = editor.slice(
    editor.indexOf('className="builder-tabs"'),
    editor.indexOf('<div aria-label="Builder status"'),
  );
  const labels = [
    "Build",
    "Overview",
    "Details",
    "Loadout",
    "Inventory",
    "Shop",
    "Rituals",
    "Retraining",
  ];

  it("gives every tab a label span and the same name as its tooltip", () => {
    expect(tabs.match(/role="tab"/g)).toHaveLength(labels.length);
    for (const label of labels) {
      expect(tabs).toContain(
        `<span className="builder-tab-label">${label}</span>`,
      );
      expect(tabs).toMatch(
        new RegExp(
          `role="tab"\\s+title="${label}"[\\s\\S]*?<span className="builder-tab-label">${label}</span>`,
        ),
      );
    }
  });

  it("drops the unselected labels when the tabs' own width can't hold them", () => {
    expect(declarationsFor(".builder-tabs")).toContain(
      "container: builder-tabs / inline-size",
    );
    // The tabs grow from the width the icon-only strip needs.
    expect(declarationsFor(".builder-tabs")).toContain("flex: 1 1 26.5rem");
    const compact = styles.slice(
      styles.indexOf("@container builder-tabs (max-width: 53rem) {") + 1,
    );
    // Visually hidden, so screen readers keep the name.
    expect(compact).toMatch(
      /^[^@]*:not\(\[aria-selected="true"\]\)\s*\.builder-tab-label\s*\{[^}]*clip-path: inset\(50%\);[^}]*position: absolute;/,
    );
    expect(compact.slice(0, compact.indexOf("\n}\n"))).not.toContain(
      "display: none",
    );
  });

  it("wraps the status buttons above the tabs, at the right, before the tabs scroll", () => {
    const bar = declarationsFor(".builder-tabs-bar");
    expect(bar).toContain("flex-wrap: wrap-reverse");
    expect(declarationsFor(".builder-tabs-bar > .builder-status")).toContain(
      "margin-inline-start: auto",
    );
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.builder-tabs-bar\s*\{[^}]*flex-wrap: nowrap;/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.builder-tabs\s*\{[^}]*flex: none;/,
    );
  });
});
