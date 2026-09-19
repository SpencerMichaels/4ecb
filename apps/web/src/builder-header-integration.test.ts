import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);
const iconSource = readFileSync(new URL("./Icon.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

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

  it("shows save state with distinct icons while keeping its message accessible", () => {
    const tabsBar = source.slice(
      source.indexOf('<div className="builder-tabs-bar">'),
      source.indexOf('<div className="builder-workspace"'),
    );

    expect(source).toContain('if (phase === "saved") return "save-check"');
    expect(source).toContain('if (phase === "failed") return "save-off"');
    expect(source).toContain('return "save-pen"');
    expect(iconSource).toContain('"save-check": SaveCheck');
    expect(iconSource).toContain('"save-pen": SavePen');
    expect(iconSource).toContain('"save-off": SaveOff');
    expect(tabsBar).toContain("title={saveState.message}");
    expect(tabsBar).toContain(
      '<span className="visually-hidden">{saveState.message}</span>',
    );
    expect(tabsBar).toContain(
      'role={saveState.phase === "failed" ? "alert" : "status"}',
    );
    expect(tabsBar).toContain(
      'saveState.phase === "failed" ? "assertive" : "polite"',
    );
    expect(tabsBar).not.toContain("            {saveState.message}");
    expect(styles).toMatch(/\.save-saved\s*\{[^}]*color: var\(--success\)/);
    expect(styles).toMatch(/\.save-saving\s*\{[^}]*color: var\(--accent\)/);
    expect(styles).toMatch(/\.save-failed\s*\{[^}]*color: var\(--danger\)/);
  });
});
