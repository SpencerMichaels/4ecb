import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CharacterOccurrence,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";

import {
  groupChoicesByLegacyWorkflow,
  presentLevelChoices,
  primaryLevelBuildChoices,
  showsLevelChoiceEmptyState,
} from "./builder-ui";
import { levelGains } from "./level-gains";

function entity(
  id: string,
  type: string,
  name: string,
  specifics: Record<string, string> = {},
): ContentEntity {
  return {
    id,
    type,
    name,
    specifics: Object.entries(specifics).map(([field, value]) => ({
      name: field,
      value,
    })),
  } as unknown as ContentEntity;
}

function occurrence(
  id: string,
  definitionId: string,
  acquiredLevel: number,
  kind: CharacterOccurrence["kind"],
  parentId?: string,
): CharacterOccurrence {
  return {
    id,
    definitionId,
    acquiredLevel,
    kind,
    ...(parentId === undefined ? {} : { parentId }),
  };
}

describe("Build tab empty state", () => {
  it("shows the empty state for a level whose only choice is the optional retrain", () => {
    const retrain = {
      id: "retrain-25",
      level: 25,
      providerOccurrenceId: "level-25",
      ruleOrdinal: 0,
      index: 0,
      type: "Replacement",
      optional: true,
      retraining: true,
      candidates: [],
    } as unknown as EvaluatedChoice;
    const primary = primaryLevelBuildChoices([retrain]);
    expect(primary).toEqual([]);
    const sections = groupChoicesByLegacyWorkflow(
      presentLevelChoices(primary).presentationChoices,
    );
    expect(showsLevelChoiceEmptyState(25, sections)).toBe(true);
    // Level 1 always has its Ability Scores tab.
    expect(showsLevelChoiceEmptyState(1, sections)).toBe(false);
    expect(showsLevelChoiceEmptyState(25, [{}])).toBe(false);
  });
});

describe("levelGains", () => {
  const entities = new Map(
    [
      entity("CLASS", "Class", "Hexblade"),
      entity("SUMMON", "Class Feature", "Greater Summon Warlock's Ally", {
        _CS_ShortDescription: "@",
      }),
      entity(
        "WELL",
        "Class Feature",
        "Level 25 Greater Summon Warlock's Ally (White Well)",
        { _CS_ShortDescription: "Can summon spectral protector" },
      ),
      entity("POWER", "Power", "Greater Summon (White Well Pact)", {
        "Power Usage": "Daily",
      }),
      entity("CREATURE", "Internal", "Spectral Protector"),
      entity("PACT", "Class Feature", "Improved Pact Weapon"),
      entity("FEAT", "Feat", "Retrained Feat"),
      entity("FEAT_POWER", "Power", "Feat Power"),
    ].map((value) => [value.id.toLocaleLowerCase(), value]),
  );
  const evaluation = {
    occurrences: [
      occurrence("class", "CLASS", 1, "choice"),
      occurrence("pact", "PACT", 3, "grant", "class"),
      occurrence("summon", "SUMMON", 25, "grant", "class"),
      occurrence("well", "WELL", 25, "grant", "summon"),
      occurrence("power", "POWER", 25, "grant", "well"),
      occurrence("creature", "CREATURE", 25, "grant", "well"),
      occurrence("feat", "FEAT", 25, "choice"),
      occurrence("feat-power", "FEAT_POWER", 25, "grant", "feat"),
    ],
  } as unknown as EvaluatedCharacter;

  it("nests a level's grants and lifts a hidden feature's to its place", () => {
    expect(levelGains(evaluation, 25, entities)).toEqual([
      {
        occurrenceId: "well",
        definitionId: "WELL",
        name: "Level 25 Greater Summon Warlock's Ally (White Well)",
        typeLabel: "Class Feature",
        note: "Can summon spectral protector",
        children: [
          {
            occurrenceId: "power",
            definitionId: "POWER",
            name: "Greater Summon (White Well Pact)",
            typeLabel: "Daily power",
            children: [],
          },
        ],
      },
    ]);
  });

  it("lists only that level's gains, and none for a level without", () => {
    expect(levelGains(evaluation, 3, entities).map(({ name }) => name)).toEqual(
      ["Improved Pact Weapon"],
    );
    expect(levelGains(evaluation, 4, entities)).toEqual([]);
  });
});
