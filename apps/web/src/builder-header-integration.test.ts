import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);

describe("builder header integration", () => {
  it("renders key statistics from the effective-level evaluation", () => {
    expect(source).toContain(
      "const currentEvaluation = evaluationAtHorizon(\n    currentEvaluationResult,\n    build?.effectiveLevel,\n  );",
    );
    expect(source).toContain(
      "<BuilderHeaderStats evaluation={currentEvaluation} />",
    );
    expect(source).not.toContain(
      "<BuilderHeaderStats evaluation={planningEvaluation}",
    );
    expect(source).not.toContain(
      "<BuilderHeaderStats evaluation={selectedLevelEvaluation}",
    );
  });

  it("keeps sheet navigation and compact history controls in the tab bar", () => {
    const tabsBar = source.slice(
      source.indexOf('<div className="builder-tabs-bar">'),
      source.indexOf('<div className="builder-workspace"'),
    );

    expect(tabsBar).toContain("Character sheet");
    expect(tabsBar).toContain('aria-label="Builder status"');
    expect(tabsBar).toContain('aria-label="Undo"');
    expect(tabsBar).toContain('title="Undo"');
    expect(tabsBar).toContain('aria-label="Redo"');
    expect(tabsBar).toContain('title="Redo"');
    expect(tabsBar).not.toContain('<div className="builder-actions">');
  });
});
