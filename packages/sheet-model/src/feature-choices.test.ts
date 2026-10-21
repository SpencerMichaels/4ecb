import { describe, expect, it } from "vitest";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { buildEvaluatedSheetModel, featureChoiceText } from "./index";

type Occurrence = EvaluatedCharacter["occurrences"][number];

const entity = (
  id: string,
  name: string,
  type: string,
  grants: readonly string[] = [],
): ContentEntity => ({
  id,
  name,
  type,
  source: "test",
  sources: ["test"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: grants.map((grant, ordinal) => ({
    name: "grant",
    attributes: [
      { name: "name", value: grant },
      { name: "type", value: type },
    ],
    text: "",
    children: [],
    ordinal,
  })),
  description: "",
  extensions: [],
  provenance: { sourceKey: "test", sourceOrdinal: 0 },
});
const occurrence = (
  id: string,
  definitionId: string,
  parentId?: string,
  kind: Occurrence["kind"] = "grant",
): Occurrence => ({
  id,
  definitionId,
  acquiredLevel: 1,
  kind,
  ...(parentId === undefined ? {} : { parentId }),
});
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
  formatVersion: 1,
  effectiveLevel: 1,
  levels: [],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
function sheet(
  content: readonly ContentEntity[],
  occurrences: readonly Occurrence[],
) {
  const evaluation = {
    level: 1,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences,
    activeDefinitionIds: occurrences.map(({ definitionId }) => definitionId),
    activeDefinitions: [],
    choices: [],
    stats: {},
    overlays: [],
    suggestions: [],
    textStrings: {},
    textContributions: [],
    diagnostics: [],
    powers: [],
  } as unknown as EvaluatedCharacter;
  return buildEvaluatedSheetModel(snapshot, build, evaluation, content);
}
const row = (model: ReturnType<typeof sheet>, label: string) =>
  model.features
    .flatMap(({ entries }) => entries)
    .find((entry) => entry.label === label);

describe("feature sub-choices", () => {
  const content = [
    entity("LEVEL", "1", "Level"),
    entity("RACE", "Synthetic Race", "Race"),
    entity("GRANTS", "Synthetic Race", "Grants"),
    entity("TRAIT", "Former life", "Racial Trait"),
    entity("ALIAS", "Other Ancestry", "CountsAsRace"),
    entity("CLASS", "Synthetic Class", "Class"),
    entity("FEATURE", "Bond Choice", "Class Feature"),
    entity("PACKAGE", "Bond of Stars", "Trait Package"),
    entity("TRAINING", "Arcana", "Skill Training"),
    entity("RULES", "Expansion", "Level1Rules"),
    entity("BACKGROUND", "Harbor Town", "Background"),
    entity("HELPER", "Background Benefit", "Internal"),
    entity("BENEFIT", "+2 to Streetwise", "Background Choice"),
    entity("FEAT", "Skill Focus", "Feat"),
    entity("SKILL_A", "Athletics", "Skill Training"),
    entity("SKILL_B", "Nature", "Skill Training"),
  ];
  const model = sheet(content, [
    occurrence("level", "LEVEL", undefined, "root"),
    occurrence("race", "RACE", "level", "choice"),
    occurrence("grants", "GRANTS", "race"),
    occurrence("trait", "TRAIT", "grants"),
    occurrence("alias", "ALIAS", "trait", "choice"),
    occurrence("class", "CLASS", "level", "choice"),
    occurrence("feature", "FEATURE", "class"),
    occurrence("package", "PACKAGE", "feature", "choice"),
    // A choice the identity-line class offers stays off feature rows.
    occurrence("training", "TRAINING", "class", "choice"),
    occurrence("rules", "RULES", "level"),
    occurrence("background", "BACKGROUND", "rules", "choice"),
    occurrence("helper", "HELPER", "rules"),
    occurrence("benefit", "BENEFIT", "helper", "choice"),
    // A feat taken twice lists both choices on its single row.
    occurrence("feat-1", "FEAT", "level", "choice"),
    occurrence("skill-a", "SKILL_A", "feat-1", "choice"),
    occurrence("feat-2", "FEAT", "level", "choice"),
    occurrence("skill-b", "SKILL_B", "feat-2", "choice"),
  ]);

  it("shows the choice made under a listed feature on its row", () => {
    expect(featureChoiceText(row(model, "Former life")?.choices)).toBe(
      "Other Ancestry",
    );
    expect(featureChoiceText(row(model, "Bond Choice")?.choices)).toBe(
      "Bond of Stars",
    );
    expect(featureChoiceText(row(model, "Skill Focus")?.choices)).toBe(
      "Athletics, Nature",
    );
  });

  it("gives a helper's choice to the one listed feature granted beside it", () => {
    expect(row(model, "Harbor Town")?.choices).toEqual([
      { id: "BENEFIT", name: "+2 to Streetwise", type: "Background Choice" },
    ]);
  });

  it("follows the choice's supports link among several listed features", () => {
    const linked = sheet(
      [
        ...content,
        entity("SECOND", "Mountain Pass", "Background"),
        {
          ...entity(
            "PASS_BENEFIT",
            "Mountain Pass Benefit",
            "Background Choice",
          ),
          specifics: [
            {
              name: "_SupportsID",
              value: "SECOND",
              extraAttributes: [],
              ordinal: 0,
            },
          ],
        },
      ],
      [
        occurrence("rules", "RULES"),
        occurrence("background", "BACKGROUND", "rules", "choice"),
        occurrence("helper", "HELPER", "rules"),
        occurrence("benefit", "PASS_BENEFIT", "helper", "choice"),
        occurrence("second", "SECOND", "rules", "choice"),
      ],
    );
    expect(featureChoiceText(row(linked, "Mountain Pass")?.choices)).toBe(
      "Mountain Pass Benefit",
    );
    expect(row(linked, "Harbor Town")?.choices).toBeUndefined();
  });

  it("never attaches a choice to an unlisted parent or an ambiguous helper", () => {
    const chosen = model.features.flatMap(({ entries }) =>
      entries.flatMap(({ choices }) => choices ?? []),
    );
    expect(chosen.map(({ id }) => id)).not.toContain("TRAINING");
    const ambiguous = sheet(
      [
        ...content,
        entity("FEAT_2", "Second Feat", "Feat"),
        entity("THEME", "Wanderer", "Theme"),
      ],
      [
        occurrence("rules", "RULES"),
        occurrence("background", "BACKGROUND", "rules", "choice"),
        occurrence("theme", "THEME", "rules", "choice"),
        occurrence("helper", "HELPER", "rules"),
        occurrence("benefit", "BENEFIT", "helper", "choice"),
      ],
    );
    expect(row(ambiguous, "Harbor Town")?.choices).toBeUndefined();
    expect(row(ambiguous, "Wanderer")?.choices).toBeUndefined();
    // A level root holds every top-level choice; its one feat does not own
    // the details or background picked through other helpers.
    const levelRoot = sheet(
      [...content, entity("DETAILS", "Details", "Level1Rules")],
      [
        occurrence("level", "LEVEL", undefined, "root"),
        occurrence("feat", "FEAT", "level", "choice"),
        occurrence("details", "DETAILS", "level"),
        occurrence("training", "TRAINING", "details", "choice"),
        occurrence("rules", "RULES", "level"),
        occurrence("background", "BACKGROUND", "rules", "choice"),
      ],
    );
    expect(row(levelRoot, "Skill Focus")?.choices).toBeUndefined();
  });

  it("carries the choice to the overview feature", () => {
    const feature = model.overview?.features.find(
      ({ name }) => name === "Bond Choice",
    );
    expect(featureChoiceText(feature?.choices)).toBe("Bond of Stars");
  });
});

describe("proficiency summary", () => {
  it("collapses group grants and lists lone proficiencies by kind", () => {
    const content = [
      entity("CLASS", "Synthetic Class", "Class"),
      entity("CLOTH", "Armor Proficiency (Cloth)", "Proficiency"),
      entity("LEATHER", "Armor Proficiency (Leather)", "Proficiency"),
      entity("LIGHT", "Shield Proficiency (Light)", "Proficiency", ["SPIKED"]),
      entity("SPIKED", "Shield Proficiency (Spiked)", "Proficiency"),
      entity("SIMPLE", "Simple Melee", "Proficiency", ["CLUB", "DAGGER"]),
      entity("CLUB", "Weapon Proficiency (Club)", "Proficiency"),
      entity("DAGGER", "Weapon Proficiency (Dagger)", "Proficiency"),
      entity("BLADES", "Weapon Group (Light Blade)", "Proficiency", ["SHORT"]),
      entity("SHORT", "Weapon Proficiency (Short sword)", "Proficiency"),
      entity("PACT", "Weapon Proficiency (Pact Blade)", "Proficiency"),
      entity("ROD", "Implement Proficiency (Rod)", "Proficiency"),
      entity("NOTHING", "Choose Nothing", "Proficiency"),
    ];
    const model = sheet(content, [
      occurrence("class", "CLASS", undefined, "root"),
      occurrence("cloth", "CLOTH", "class"),
      occurrence("leather", "LEATHER", "class"),
      occurrence("light", "LIGHT", "class"),
      occurrence("spiked", "SPIKED", "light"),
      occurrence("rod", "ROD", "class"),
      occurrence("simple", "SIMPLE", "class"),
      occurrence("club", "CLUB", "simple"),
      occurrence("dagger", "DAGGER", "simple"),
      // Also granted on its own: still covered by the group.
      occurrence("dagger-2", "DAGGER", "class"),
      occurrence("blades", "BLADES", "class"),
      occurrence("short", "SHORT", "blades"),
      occurrence("pact", "PACT", "class"),
      occurrence("nothing", "NOTHING", "class", "choice"),
    ]);
    expect(
      model.proficiencies?.map(({ kind, values }) => [kind, values]),
    ).toEqual([
      ["Armor", ["cloth", "leather"]],
      ["Shields", ["light"]],
      ["Weapons", ["simple melee", "light blade group", "pact blade"]],
      ["Implements", ["rod"]],
    ]);
    expect(
      model.proficiencies?.find(({ kind }) => kind === "Weapons")
        ?.definitionIds,
    ).toEqual(["SIMPLE", "CLUB", "DAGGER", "BLADES", "SHORT", "PACT"]);
    expect(
      model.proficiencies?.flatMap(({ definitionIds }) => definitionIds),
    ).not.toContain("NOTHING");
  });
});
