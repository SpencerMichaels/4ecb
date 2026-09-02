import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import {
  candidateReason,
  choicesAtLevel,
  isCandidateVisible,
  planningHorizonCommand,
} from "./builder-ui";

const level = (number: number): ContentEntity => ({
  id: `ID_INTERNAL_LEVEL_${number}`,
  name: String(number),
  type: "Level",
  source: "Public test fixture",
  sources: ["Public test fixture"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "builder-ui", sourceOrdinal: number },
});

const build: CharacterBuild = {
  formatVersion: 1,
  effectiveLevel: 1,
  levels: [
    {
      level: 1,
      root: {
        id: "level-1",
        identity: {
          definitionId: "ID_INTERNAL_LEVEL_1",
          name: "1",
          type: "Level",
        },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
    },
  ],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

describe("builder planning UI", () => {
  it("creates every intervening level without advancing the current level", () => {
    const command = planningHorizonCommand(
      build,
      4,
      [level(1), level(2), level(3), level(4)],
      (value) => `level-${value}`,
    );
    expect(command).toBeDefined();
    const planned = applyCharacterCommand(build, command!);
    expect(planned.levels.map((frame) => frame.level)).toEqual([1, 2, 3, 4]);
    expect(planned.effectiveLevel).toBe(1);
  });

  it("does not mutate stored levels when the visible horizon is lowered", () => {
    expect(
      planningHorizonCommand(build, 1, [level(1)], String),
    ).toBeUndefined();
  });

  it("turns evaluator reasons into objective user-facing text", () => {
    expect(candidateReason(["category", "self"])).toBe(
      "Does not match this choice category; A feature cannot select itself",
    );
  });

  it("never exposes category mismatches through the Show all filter", () => {
    const categoryMismatch = {
      definitionId: "cross-category",
      eligible: false,
      reasons: ["category"],
    };
    expect(isCandidateVisible(categoryMismatch, false)).toBe(false);
    expect(isCandidateVisible(categoryMismatch, true)).toBe(false);
    expect(isCandidateVisible(categoryMismatch, true, "cross-category")).toBe(
      false,
    );
  });

  it("shows legal, explicitly revealed, and recoverable selected candidates", () => {
    const legal = { definitionId: "legal", eligible: true, reasons: [] };
    const unavailable = {
      definitionId: "unavailable",
      eligible: false,
      reasons: ["prerequisite"],
    };
    expect(isCandidateVisible(legal, false)).toBe(true);
    expect(isCandidateVisible(unavailable, false)).toBe(false);
    expect(isCandidateVisible(unavailable, true)).toBe(true);
    expect(isCandidateVisible(unavailable, false, "unavailable")).toBe(true);
  });

  it("keeps inventory-owned configuration out of the level-up timeline", () => {
    const evaluation = {
      occurrences: [
        {
          id: "level",
          kind: "root",
        },
        {
          id: "item",
          kind: "inventory",
        },
      ],
      choices: [
        { id: "advancement", level: 8, providerOccurrenceId: "level" },
        { id: "item-choice", level: 8, providerOccurrenceId: "item" },
      ],
    } as unknown as EvaluatedCharacter;

    expect(choicesAtLevel(8, evaluation).map(({ id }) => id)).toEqual([
      "advancement",
    ]);
  });
});
