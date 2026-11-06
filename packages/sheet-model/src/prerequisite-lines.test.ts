import { describe, expect, it } from "vitest";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { buildEvaluatedSheetModel } from "./index";

// A campaign renamed Shadar-kai to Fetchling (D116 aliases): the sheet's
// feature prerequisite reads the evaluation's line with the current name.

const feat: ContentEntity = {
  id: "ID_FEAT_GHOSTLY",
  name: "Ghostly Rejuvenation",
  type: "Feat",
  source: "test",
  sources: ["test"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "You recover.",
  extensions: [],
  provenance: { sourceKey: "test", sourceOrdinal: 0 },
  prerequisites: "11th level, shadar-kai; Paragon Tier",
  printPrerequisites: "11th level, shadar-kai",
};
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
function prerequisite(
  prerequisiteLines?: Readonly<Record<string, string>>,
): string | undefined {
  const evaluation = {
    level: 11,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [
      {
        id: "feat",
        definitionId: feat.id,
        acquiredLevel: 1,
        kind: "root",
      },
    ],
    activeDefinitionIds: [feat.id],
    activeDefinitions: [],
    choices: [],
    stats: {},
    overlays: [],
    suggestions: [],
    textStrings: {},
    textContributions: [],
    diagnostics: [],
    powers: [],
    ...(prerequisiteLines === undefined ? {} : { prerequisiteLines }),
  } as unknown as EvaluatedCharacter;
  return buildEvaluatedSheetModel(snapshot, build, evaluation, [feat])
    .overview?.features.find((entry) => entry.name === feat.name)
    ?.fields.find((field) => field.label === "Prerequisite")?.value;
}

describe("sheet prerequisite lines (D116 aliases)", () => {
  it("prints the evaluation's line naming the renamed record", () => {
    expect(prerequisite()).toBe("11th level, shadar-kai");
    expect(prerequisite({ [feat.id]: "11th level, fetchling" })).toBe(
      "11th level, fetchling",
    );
  });
});
