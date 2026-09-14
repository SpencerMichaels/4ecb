import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const characterEditor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return (
    channel((value >> 16) & 0xff) * 0.2126 +
    channel((value >> 8) & 0xff) * 0.7152 +
    channel(value & 0xff) * 0.0722
  );
}

function contrast(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe("release accessibility contract", () => {
  it("keeps every normal-text palette pair above WCAG AA contrast", () => {
    const pairs = [
      ["#1e2933", "#eef2f6"],
      ["#ffffff", "#1d3d5d"],
      ["#315f85", "#ffffff"],
      ["#52616e", "#eef2f6"],
      ["#ffffff", "#006400"],
      ["#ffffff", "#8b0000"],
      ["#111111", "#808080"],
      ["#ffffff", "#000080"],
      ["#211406", "#ff8c00"],
    ] as const;
    for (const [foreground, background] of pairs)
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
  });

  it("does not force a desktop viewport and stacks dense layouts for tablets", () => {
    expect(styles.match(/body\s*\{[^}]*\}/)?.[0]).not.toContain("min-width");
    expect(styles).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.compendium-workspace,[\s\S]*?grid-template-columns: 1fr/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.metadata-form,[\s\S]*?\.sheet-columns[\s\S]*?grid-template-columns: 1fr/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 60rem\)[\s\S]*?\.builder-workspace,[\s\S]*?\.level-choice-workspace,[\s\S]*?grid-template-columns: 1fr/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.choice-selection-layout[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(styles).toMatch(/\.candidate-detail:focus-visible/);
    expect(styles).toMatch(/\.level-choice-section:focus-visible/);
    expect(styles).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.skill-training-layout[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
    );
  });

  it("keeps navigation compact and ordinary detail content in document flow", () => {
    expect(characterEditor).toContain('className="level-rail"');
    expect(characterEditor).toContain('workspaceTab === "overview"');
    expect(characterEditor).toContain('workspaceTab === "equipment"');
    expect(characterEditor).toContain('workspaceTab === "diagnostics"');
    expect(characterEditor).toContain('className="build-overview"');
    expect(characterEditor).toContain("Show planned choices");
    expect(characterEditor).toContain('className="overview-checklist-pane"');
    expect(characterEditor).toContain(
      'aria-sort={active ? sort.direction : "none"}',
    );
    expect(characterEditor).toContain('className="selection-sort-button"');
    expect(characterEditor).not.toContain("Stored features");
    expect(characterEditor).not.toContain("function OccurrenceTree");
    expect(characterEditor).not.toContain('aria-controls="build-timeline"');
    expect(characterEditor).not.toContain('aria-label="Close level plan"');
    expect(characterEditor).not.toContain('className="builder-secondary"');

    const candidateDetailRule = styles.match(
      /\.candidate-detail\s*\{([^}]*)\}/,
    )?.[1];
    const timelineRule = styles.match(/\.build-overview\s*\{([^}]*)\}/)?.[1];
    expect(candidateDetailRule).toBeDefined();
    expect(candidateDetailRule).not.toContain("max-height");
    expect(candidateDetailRule).not.toContain("overflow:");
    expect(timelineRule).toBeDefined();
    expect(timelineRule).not.toContain("max-height");
    expect(timelineRule).not.toContain("overflow:");
    expect(styles).toMatch(
      /\.selection-table-scroll\s*\{[^}]*max-height:[^}]*overflow: auto/,
    );
  });

  it("keeps table selection spatially stable and communicates it without checkmarks", () => {
    const tableSource = characterEditor.slice(
      characterEditor.indexOf("function CandidateSelectionTable"),
      characterEditor.indexOf("function ChoiceFlowSection"),
    );
    expect(tableSource).not.toContain("prioritizedCandidates");
    expect(tableSource).not.toContain('name="check"');
    expect(tableSource).toContain("candidate-selection-short");
    expect(styles).toMatch(
      /\.candidate-selection-short[\s\S]*?\.selection-table-scroll\s*\{[\s\S]*?height: auto/,
    );
  });

  it("supports system color preference and explicit light or dark overrides", () => {
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain("@media (prefers-color-scheme: dark)");
    expect(styles).toContain(":root:not([data-theme])");
    for (const [foreground, background] of [
      ["#f2f4f7", "#111727"],
      ["#b7c1d1", "#111727"],
      ["#7eaed2", "#111727"],
      ["#ffaaa1", "#482525"],
      ["#ffc36b", "#46351f"],
      ["#83d18b", "#203c2a"],
    ] as const)
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the legacy semantic palette and avoids pill-shaped chrome", () => {
    for (const token of [
      "--power-at-will: #006400",
      "--power-encounter: #8b0000",
      "--power-daily: #808080",
      "--power-utility: #000080",
      "--power-item: #ff8c00",
    ])
      expect(styles).toContain(token);
    expect(styles).not.toContain("border-radius: 999px");
  });
});
