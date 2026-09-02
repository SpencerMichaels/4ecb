import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

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
      ["#20272a", "#f4f1e8"],
      ["#ffffff", "#243238"],
      ["#15516b", "#f4f1e8"],
      ["#193f50", "#ffffff"],
      ["#566066", "#f4f1e8"],
      ["#ffffff", "#315f73"],
      ["#8a2d1d", "#ffffff"],
      ["#ffffff", "#176c2a"],
      ["#ffffff", "#8c1717"],
      ["#ffffff", "#444444"],
      ["#ffffff", "#8a4800"],
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
      /@media \(max-width: 60rem\)[\s\S]*?\.builder-workspace,[\s\S]*?\.builder-secondary,[\s\S]*?grid-template-columns: 1fr/,
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

  it("supports system color preference and explicit light or dark overrides", () => {
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain("@media (prefers-color-scheme: dark)");
    expect(styles).toContain(":root:not([data-theme])");
    for (const [foreground, background] of [
      ["#edf2f4", "#111619"],
      ["#b6c1c6", "#111619"],
      ["#7fc0db", "#111619"],
      ["#ff9a88", "#45241f"],
      ["#f2bc70", "#3d3020"],
      ["#85ce91", "#1f3b26"],
    ] as const)
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
  });
});
