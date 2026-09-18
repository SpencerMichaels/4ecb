import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EvaluatedContribution, EvaluatedStat } from "@4ecb/rules-engine";

import { BuilderHeaderStats } from "./BuilderHeaderStats";

function stat(name: string, value: number | string): EvaluatedStat {
  return { name, value, contributions: [] };
}

function contribution(
  overrides: Partial<EvaluatedContribution>,
): EvaluatedContribution {
  return {
    applied: true,
    id: "test:contribution",
    providerId: "test:provider",
    providerName: "Test provider",
    stat: "AC",
    value: "+1",
    ...overrides,
  };
}

describe("BuilderHeaderStats", () => {
  it("renders current evaluated totals in the approved semantic groups", () => {
    const markup = renderToStaticMarkup(
      createElement(BuilderHeaderStats, {
        evaluation: {
          stats: {
            "Hit Points": stat("Hit Points", 71),
            Speed: stat("Speed", 5),
            Initiative: stat("Initiative", 2),
            AC: stat("AC", 25),
            "Fortitude Defense": stat("Fortitude Defense", 22),
            "Reflex Defense": stat("Reflex Defense", 18),
            "Will Defense": stat("Will Defense", 21),
            Strength: stat("Strength", 20),
            Constitution: stat("Constitution", 16),
            Dexterity: stat("Dexterity", 10),
            Intelligence: stat("Intelligence", 8),
            Wisdom: stat("Wisdom", 14),
            Charisma: stat("Charisma", 18),
          },
        },
      }),
    );

    expect(markup).toContain('aria-label="Key statistics"');
    expect(markup).toContain('aria-label="Defenses"');
    expect(markup).toContain('aria-label="Ability scores"');
    expect(markup).not.toContain(">Defenses<");
    expect(markup).not.toContain(">Abilities<");
    expect(markup).toContain('<dd title="HP 71">71</dd>');
    expect(markup).toContain('<dd title="INIT +2">+2</dd>');
    expect(markup).toContain('<dt>FORT</dt><dd title="FORT 22">22</dd>');
    expect(markup).toContain('<dt>REF</dt><dd title="REF 18">18</dd>');
    expect(markup).toContain('<dt>WILL</dt><dd title="WILL 21">21</dd>');
    expect(markup).toContain('<dt>INT</dt><dd title="INT 8">8</dd>');
    expect(markup.match(/<dd title=/g)).toHaveLength(13);
    expect(markup).toContain('<dd title="HP 71">71</dd>');
  });

  it("recognizes the legacy short aliases for defense totals", () => {
    const markup = renderToStaticMarkup(
      createElement(BuilderHeaderStats, {
        evaluation: {
          stats: {
            "Armor Class": stat("Armor Class", 24),
            Fortitude: stat("Fortitude", 20),
            Reflex: stat("Reflex", 19),
            Will: stat("Will", 21),
          },
        },
      }),
    );

    expect(markup).toContain('<dt>AC</dt><dd title="AC 24">24</dd>');
    expect(markup).toContain('<dt>FORT</dt><dd title="FORT 20">20</dd>');
    expect(markup).toContain('<dt>REF</dt><dd title="REF 19">19</dd>');
    expect(markup).toContain('<dt>WILL</dt><dd title="WILL 21">21</dd>');
  });

  it("uses stable em dashes while the current evaluation is unavailable", () => {
    const markup = renderToStaticMarkup(createElement(BuilderHeaderStats, {}));

    expect(markup.match(/<dd>—<\/dd>/g)).toHaveLength(13);
    expect(markup).not.toContain("title=");
  });

  it("shows only applied evaluator provenance with player-facing labels", () => {
    const markup = renderToStaticMarkup(
      createElement(BuilderHeaderStats, {
        evaluation: {
          stats: {
            AC: {
              name: "AC",
              value: 23,
              contributions: [
                contribution({
                  numericValue: 10,
                  providerName: "1",
                  value: "+10",
                }),
                contribution({
                  numericValue: 4,
                  providerName: "1",
                  value: "+HALF-LEVEL",
                }),
                contribution({
                  bonusType: "Ability",
                  numericValue: 3,
                  providerName: "1",
                  value: "+ABILITYMOD(int)",
                }),
                contribution({
                  numericValue: 3,
                  providerName: "Armor of Faith",
                  value: "+Armor of Faith Bonus",
                }),
                contribution({
                  applied: false,
                  numericValue: 2,
                  providerName: "Suppressed armor",
                  reason: "typed-stacking",
                }),
              ],
            },
          },
        },
      }),
    );

    expect(markup).toContain(
      'title="AC 23\nBase 10\nHalf level +4\nIntelligence modifier +3\nArmor of Faith +3"',
    );
    expect(markup).not.toContain("Suppressed armor");
  });

  it("does not repeat an exact signed bonus already present in a provider name", () => {
    const markup = renderToStaticMarkup(
      createElement(BuilderHeaderStats, {
        evaluation: {
          stats: {
            AC: {
              name: "AC",
              value: 23,
              contributions: [
                contribution({
                  numericValue: 1,
                  providerName: "Flowform Armor +1",
                }),
                contribution({
                  numericValue: 1,
                  providerName: "Armor issued in Year 1",
                }),
              ],
            },
          },
        },
      }),
    );

    expect(markup).toContain(
      'title="AC 23\nFlowform Armor +1\nArmor issued in Year 1 +1"',
    );
    expect(markup).not.toContain("Flowform Armor +1 +1");
  });

  it("translates opaque hit-point level providers without inventing a source", () => {
    const markup = renderToStaticMarkup(
      createElement(BuilderHeaderStats, {
        evaluation: {
          stats: {
            "Hit Points": {
              name: "Hit Points",
              value: 32,
              contributions: [
                contribution({
                  numericValue: 14,
                  providerName: "1",
                  stat: "Hit Points",
                  value: "+_LEVEL-ONE-HPS",
                }),
                contribution({
                  numericValue: 6,
                  providerName: "2",
                  stat: "Hit Points",
                  value: "+_PER-LEVEL-HPS",
                }),
                contribution({
                  numericValue: 12,
                  providerName: "1",
                  stat: "Hit Points",
                  value: "+Constitution",
                }),
              ],
            },
          },
        },
      }),
    );

    expect(markup).toContain(
      'title="HP 32\nLevel 1 hit points +14\nLevel 2 hit points +6\nConstitution score +12"',
    );
  });

  it("collapses only consecutive per-level hit points with the same amount", () => {
    const perLevelHitPoints = (level: number, amount: number) =>
      contribution({
        numericValue: amount,
        providerName: String(level),
        stat: "Hit Points",
        value: "+_PER-LEVEL-HPS",
      });
    const markup = renderToStaticMarkup(
      createElement(BuilderHeaderStats, {
        evaluation: {
          stats: {
            "Hit Points": {
              name: "Hit Points",
              value: 55,
              contributions: [
                perLevelHitPoints(2, 6),
                perLevelHitPoints(3, 6),
                perLevelHitPoints(4, 5),
                perLevelHitPoints(5, 5),
                perLevelHitPoints(7, 5),
                perLevelHitPoints(8, 6),
              ],
            },
          },
        },
      }),
    );

    expect(markup).toContain(
      'title="HP 55\nLevels 2–3 hit points +6 each\nLevels 4–5 hit points +5 each\nLevel 7 hit points +5\nLevel 8 hit points +6"',
    );
  });
});
