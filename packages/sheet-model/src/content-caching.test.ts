import { describe, expect, it } from "vitest";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import { scanCountingContent, type ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import {
  buildEvaluatedSheetModel,
  createEvaluatedPowerTextPersonalizer,
  createSheetPowerCardFinder,
} from "./index";

// Per-content setup (id maps, class-feature families, universal powers) is
// built once per content array: a sheet or builder card set built again
// over the same content, for a new character state, scans none of it.

const entity = (
  id: string,
  name: string,
  type: string,
  extra: Partial<ContentEntity> = {},
): ContentEntity => ({
  id,
  name,
  type,
  source: "test",
  sources: ["test"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "test", sourceOrdinal: 0 },
  ...extra,
});

const records = [
  entity("ID_LEVEL1RULES", "Level1Rules", "Level1Rules", {
    rules: [
      {
        name: "grant",
        attributes: [
          { name: "name", value: "ID_POWER_BASIC" },
          { name: "type", value: "Power" },
        ],
        text: "",
        children: [],
        ordinal: 0,
      },
    ],
  }),
  entity("ID_POWER_BASIC", "Melee Basic Attack", "Power", {
    specifics: [
      {
        name: "Power Usage",
        value: "At-Will",
        extraAttributes: [],
        ordinal: 0,
      },
    ],
  }),
  entity("ID_CLASS", "Synthetic Class", "Class"),
  entity("ID_FEATURE", "Synthetic Feature", "Class Feature", {
    categories: ["SYNTH_FEATURE"],
  }),
  entity("ID_PROPERTY", "Brutal", "Weapon Property"),
];

const snapshot: LegacyCharacterSnapshot = {
  details: {},
  abilities: {},
  stats: {},
  selectedRules: [],
  loot: [],
  powers: [],
  textStrings: {},
  levelCount: 1,
  source: "legacy-cache",
};
const build: CharacterBuild = {
  formatVersion: 3,
  known: [],
  effectiveLevel: 1,
  levels: [],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const evaluation = (level: number) =>
  ({
    level,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [
      {
        id: "class",
        definitionId: "ID_CLASS",
        acquiredLevel: 1,
        kind: "choice",
      },
    ],
    activeDefinitionIds: ["ID_CLASS", "ID_POWER_BASIC"],
    activeDefinitions: [],
    choices: [],
    stats: {},
    overlays: [],
    suggestions: [],
    textStrings: {},
    textContributions: [],
    diagnostics: [],
    powers: [],
  }) as unknown as EvaluatedCharacter;

describe("sheet-model per-content caching", () => {
  it("builds a sheet for a new character state without scanning the content", () => {
    const { content, scans } = scanCountingContent(records);
    buildEvaluatedSheetModel(snapshot, build, evaluation(1), content);
    const warm = scans();
    expect(warm).toBeGreaterThan(0);
    buildEvaluatedSheetModel(snapshot, build, evaluation(2), content);
    expect(scans()).toBe(warm);
  });

  it("makes builder card finders for a new character state without scanning the content", () => {
    const { content, scans } = scanCountingContent(records);
    const options = {
      resolveAbilityChoices: true,
      proficientEquipmentOnly: true,
    };
    createSheetPowerCardFinder(evaluation(1), content, options);
    createEvaluatedPowerTextPersonalizer(evaluation(1), content, true);
    const warm = scans();
    createSheetPowerCardFinder(evaluation(2), content, options);
    createEvaluatedPowerTextPersonalizer(evaluation(2), content, true);
    expect(scans()).toBe(warm);
  });
});
