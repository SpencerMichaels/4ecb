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

  it("shows only nonzero builder health counts as labeled icon indicators", () => {
    const tabsBar = source.slice(
      source.indexOf('<div className="builder-tabs-bar">'),
      source.indexOf('<div className="builder-workspace"'),
    );

    expect(tabsBar).toContain("{totalUnresolved > 0 ? (");
    expect(tabsBar).toContain("{warningCount > 0 ? (");
    expect(tabsBar).toContain("{errorCount > 0 ? (");
    expect(tabsBar).toContain("{houseRuleCount > 0 ? (");
    expect(tabsBar).toContain('<Icon name="circle-help" />');
    expect(tabsBar).toContain('<Icon name="warning" />');
    expect(tabsBar).toContain('<Icon name="circle-x" />');
    expect(tabsBar).toContain('<Icon name="house" />');
    expect(tabsBar).toContain("aria-label={`${totalUnresolved} unresolved");
    expect(tabsBar).toContain("aria-label={`${warningCount}");
    expect(tabsBar).toContain(
      '<span aria-hidden="true">{totalUnresolved}</span>',
    );
    expect(tabsBar).toContain('<span aria-hidden="true">{warningCount}</span>');
    expect(tabsBar).toContain('<span aria-hidden="true">{errorCount}</span>');
    expect(tabsBar).toContain(
      '<span aria-hidden="true">{houseRuleCount}</span>',
    );
    expect(tabsBar).not.toContain(
      ">\n            {totalUnresolved} unresolved\n          </span>",
    );
    expect(tabsBar).not.toContain(
      '>\n            {warningCount} {warningCount === 1 ? "warning" : "warnings"}\n          </span>',
    );
    expect(iconSource).toContain('"circle-help": CircleHelp');
    expect(iconSource).toContain('"circle-x": CircleX');
    expect(iconSource).toContain("house: House");
    expect(source).toContain(
      "const totalUnresolved = builderIssues.unresolved.length",
    );
    expect(source).toContain(
      "const warningCount = builderIssues.warnings.length",
    );
    expect(source).toContain("const errorCount = builderIssues.errors.length");
    expect(source).toContain(
      "const houseRuleCount = builderIssues.houseRules.length",
    );
    expect(source).not.toContain("const warningCount = Math.max(");
  });

  it("uses a compact current-level indicator for unresolved character details", () => {
    const tabsBar = source.slice(
      source.indexOf('<div className="builder-tabs-bar">'),
      source.indexOf('<div className="builder-workspace"'),
    );

    expect(source).toContain("const unresolvedCharacterDetailChoices");
    expect(source).toContain("choice.level <= (build?.effectiveLevel");
    expect(tabsBar).toContain(
      "{unresolvedCharacterDetailChoices.length > 0 ? (",
    );
    expect(tabsBar).toContain('<Icon name="circle-help" />');
    expect(tabsBar).not.toContain("Needs attention");
    expect(tabsBar).not.toContain(
      "{unresolvedCharacterDetailChoices.length}</span>",
    );
    expect(source).toContain('className="character-detail-choice-heading"');
    expect(source).toContain('className="detail-choice-attention"');
  });

  it("uses shared typography classes for selection-pane heading levels", () => {
    expect(source).toContain(
      '<legend className="selection-subsection-heading">{label}</legend>',
    );
    expect(source).toContain('<h5 className="selection-subsection-heading">');
    expect(source).toContain('className="selection-section-heading"');
    expect(styles).toMatch(
      /\.selection-section-heading\s*\{[^}]*font-size: 0\.95rem;[^}]*font-weight: 800;[^}]*line-height: 1\.35;/,
    );
    expect(styles).toMatch(
      /\.selection-subsection-heading\s*\{[^}]*font-size: 0\.85rem;[^}]*font-weight: 800;[^}]*line-height: 1\.5;/,
    );
    expect(styles).not.toMatch(
      /\.compact-choice-picker > legend,\s*\.character-detail-choice-heading h5/,
    );
  });
});
