import { describe, expect, it } from "vitest";
import type {
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter, EvaluatedPower } from "@4ecb/rules-engine";

import { featureNoteHidden, featureNoteText } from "./feature-notes";
import {
  movementTechniqueOf,
  powerClassBlock,
  spellbookPowerIds,
} from "./power-card-header";
import { deckPowerCards } from "./card-deck";
import { buildEvaluatedSheetModel, createSheetPowerCardFinder } from "./index";

type Occurrence = EvaluatedCharacter["occurrences"][number];

const entity = (
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity => ({
  id,
  name,
  type,
  source: "Synthetic Book",
  sources: ["Synthetic Book"],
  attributes: [],
  categories: [],
  specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
    name,
    value,
    extraAttributes: [],
    ordinal,
  })),
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "legacy-card-parts-test", sourceOrdinal: 0 },
});

// Spelled as the content spells them: `_CS_ShortDescription` "@" and
// "text@Feature name", Class/_SkillPower/_ChildPower record IDs, a
// "[Movement Technique]" child power.
const content = [
  entity("CLASS", "Synthetic Monk", "Class"),
  entity("SKILL", "Diplomacy", "Skill"),
  entity("PLACEHOLDER", "Level 1 Synthetic Powers", "Class Feature", {
    "Short Description": "Choose two powers.",
    _CS_ShortDescription: "@",
  }),
  entity("MASTERY", "Synthetic Mastery", "Class Feature", {
    "Short Description": "Gain a +1 bonus to damage rolls.",
    _CS_ShortDescription: "+1 damage@Paragon Synthetic Mastery",
  }),
  entity("PARAGON_MASTERY", "Paragon Synthetic Mastery", "Class Feature", {
    "Short Description": "Gain a +2 bonus to damage rolls.",
    _CS_ShortDescription: "+2 damage@Epic Synthetic Mastery",
  }),
  entity("WALK", "Synthetic Walk", "Racial Trait", {
    "Short Description":
      "On your turn, if you move 3 squares, gain concealment.",
    _CS_ShortDescription: "Move 3+ squares: concealment.",
  }),
  entity("EMPTY", "Synthetic Heritage", "Racial Trait", {
    "Short Description": "Count as an elf.",
    _CS_ShortDescription: "",
  }),
  entity("DISCIPLINE", "Synthetic Storms", "Power", {
    "Power Usage": "At-Will",
    _ChildPower: "TECHNIQUE",
    Display: "Synthetic Monk Attack 1",
    "Action Type": "Standard Action",
    "Attack Type": "Close burst 1",
    Attack: "Dexterity vs. Reflex",
    Hit: "1d8 + Dexterity modifier damage.",
    Class: "CLASS",
    Level: "1",
    "Power Type": "Attack",
  }),
  entity("TECHNIQUE", "Synthetic Storms [Movement Technique]", "Power", {
    "Power Usage": "At-Will",
    Keywords: "Full Discipline",
    "Action Type": "Move Action",
    "Attack Type": "Personal",
    Effect: "You shift 2 squares.",
    _ParentPower: "DISCIPLINE",
    Class: "CLASS",
  }),
  entity("SECONDARY", "Synthetic Cloud", "Power", {
    "Power Usage": "Daily",
    _ChildPower: "SECONDARY_ATTACK",
    Class: "CLASS",
  }),
  entity("SECONDARY_ATTACK", "Synthetic Cloud Attack", "Power", {
    "Power Usage": "Daily",
  }),
  entity("RACIAL", "Synthetic Breath", "Power", {
    "Power Usage": "Encounter",
    Display: "Synthetic Racial Power",
  }),
  entity("SKILL_POWER", "Synthetic Diplomat", "Power", {
    "Power Usage": "Daily",
    _SkillPower: "SKILL",
    "Power Type": "Utility",
    Level: "6",
  }),
  entity("PREPARED", "Synthetic Sleep", "Power", {
    "Power Usage": "Daily",
    Class: "CLASS",
    Level: "1",
  }),
  entity("BOOK", "Synthetic Cloud Burst", "Power", {
    "Power Usage": "Daily",
    Class: "CLASS",
    Level: "1",
  }),
  entity("SPELLBOOK", "Synthetic Spellbook", "Class Feature"),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));
const lookup = (id: string) => byId.get(id.toLowerCase());

describe("feature notes (NoteHolder.GetShortDescription)", () => {
  const owns =
    (...names: string[]) =>
    (name: string) =>
      names.includes(name);

  it("prefers the sheet override, else the short description", () => {
    expect(featureNoteText(lookup("WALK")!)).toBe(
      "Move 3+ squares: concealment.",
    );
    expect(featureNoteText(lookup("MASTERY")!)).toBe("+1 damage");
    // An empty override, or none, keeps the short description.
    expect(featureNoteText(lookup("EMPTY")!)).toBe("Count as an elf.");
    expect(featureNoteText(lookup("CLASS")!)).toBe("");
  });

  it("hides a bare '@' always and 'text@Feature' once Feature is owned", () => {
    expect(featureNoteHidden(lookup("PLACEHOLDER")!, owns())).toBe(true);
    expect(featureNoteHidden(lookup("MASTERY")!, owns())).toBe(false);
    expect(
      featureNoteHidden(lookup("MASTERY")!, owns("Paragon Synthetic Mastery")),
    ).toBe(true);
    expect(featureNoteHidden(lookup("WALK")!, owns())).toBe(false);
    expect(
      featureNoteHidden(
        entity("INTERNAL", "Internal Trait", "Racial Trait", {
          InternalOnly: "1",
        }),
        owns(),
      ),
    ).toBe(true);
  });
});

describe("power card record parts (UpdatePowerCardPower)", () => {
  it("names the class, a racial power, or a skill power's skill", () => {
    expect(powerClassBlock(lookup("DISCIPLINE")!, lookup)).toBe(
      "Synthetic Monk",
    );
    expect(powerClassBlock(lookup("RACIAL")!, lookup)).toBe("Racial");
    expect(powerClassBlock(lookup("SKILL_POWER")!, lookup)).toBe("Diplomacy");
    expect(
      powerClassBlock(
        entity("LOST", "Lost", "Power", { Class: "MISSING" }),
        lookup,
      ),
    ).toBeUndefined();
    expect(powerClassBlock(lookup("SECONDARY_ATTACK")!, lookup)).toBe(
      undefined,
    );
  });

  it("finds only a '[Movement Technique]' child power", () => {
    expect(movementTechniqueOf(lookup("DISCIPLINE")!, lookup)?.id).toBe(
      "TECHNIQUE",
    );
    expect(movementTechniqueOf(lookup("SECONDARY")!, lookup)).toBeUndefined();
    expect(movementTechniqueOf(lookup("TECHNIQUE")!, lookup)).toBeUndefined();
  });

  it("marks powers known only through a spellbook slot", () => {
    const ids = spellbookPowerIds({
      occurrences: [
        { id: "prepared", definitionId: "PREPARED" },
        { id: "book", definitionId: "BOOK" },
        { id: "both-a", definitionId: "SECONDARY" },
        { id: "both-b", definitionId: "SECONDARY" },
      ],
      choices: [
        { selectedOccurrenceId: "prepared" },
        { spellbook: "Power Daily 1", selectedOccurrenceId: "book" },
        { spellbook: "Power Daily 5", selectedOccurrenceId: "both-a" },
        { spellbook: "Power Daily 9" },
      ],
    });
    expect([...ids]).toEqual(["book"]);
  });
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
  ...(parentId === undefined ? {} : { parentId, ruleOrdinal: 0 }),
});
const occurrences = [
  occurrence("class", "CLASS", undefined, "root"),
  occurrence("placeholder", "PLACEHOLDER", "class"),
  occurrence("mastery", "MASTERY", "class"),
  occurrence("paragon", "PARAGON_MASTERY", "class"),
  occurrence("walk", "WALK", undefined, "root"),
  occurrence("discipline", "DISCIPLINE", "class"),
  occurrence("technique", "TECHNIQUE", "discipline"),
  occurrence("spellbook", "SPELLBOOK", "class"),
  occurrence("prepared", "PREPARED", "class", "choice"),
  occurrence("book", "BOOK", "spellbook", "choice"),
];
const power = (id: string, name: string, usage: string): EvaluatedPower => ({
  definitionId: id,
  name,
  usage,
  keywords: [],
  variants: [],
  recoveries: [],
  unsupported: [],
});
const evaluation = {
  level: 11,
  converged: true,
  iterations: 1,
  complete: true,
  legal: true,
  occurrences,
  activeDefinitionIds: occurrences.map(({ definitionId }) => definitionId),
  activeDefinitions: [],
  choices: [
    {
      id: "class:choice:0:0",
      level: 1,
      providerOccurrenceId: "class",
      ruleOrdinal: 0,
      index: 0,
      type: "Power",
      optional: false,
      selectedOccurrenceId: "prepared",
      candidates: [],
    },
    {
      id: "spellbook:choice:0:0",
      level: 1,
      providerOccurrenceId: "spellbook",
      ruleOrdinal: 0,
      index: 0,
      type: "Power",
      spellbook: "Power Daily 1",
      optional: false,
      selectedOccurrenceId: "book",
      candidates: [],
    },
  ],
  stats: {},
  overlays: [],
  suggestions: [],
  textStrings: {},
  textContributions: [],
  diagnostics: [],
  powers: [
    power("DISCIPLINE", "Synthetic Storms", "At-Will"),
    power("TECHNIQUE", "Synthetic Storms [Movement Technique]", "At-Will"),
    power("PREPARED", "Synthetic Sleep", "Daily"),
    power("BOOK", "Synthetic Cloud Burst", "Daily"),
  ],
  itemSets: [],
} as unknown as EvaluatedCharacter;
const snapshot: LegacyCharacterSnapshot = {
  details: {},
  abilities: {},
  stats: {},
  selectedRules: [],
  loot: [],
  powers: [],
  textStrings: {},
  levelCount: 11,
  source: "legacy-cache",
};
const build: CharacterBuild = {
  formatVersion: 3,
  known: [],
  effectiveLevel: 11,
  levels: [],
  grabbag: [],
  inventory: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};
const sheet = buildEvaluatedSheetModel(snapshot, build, evaluation, content);

describe("evaluated sheet", () => {
  it("lists features with their sheet notes and leaves out hidden ones", () => {
    const entries = sheet.features.flatMap(({ entries }) => entries);
    expect(entries.map(({ label }) => label)).toEqual(
      expect.not.arrayContaining([
        "Level 1 Synthetic Powers",
        "Synthetic Mastery",
      ]),
    );
    expect(entries).toEqual(
      expect.arrayContaining([
        { label: "Paragon Synthetic Mastery", value: "+2 damage" },
        { label: "Synthetic Walk", value: "Move 3+ squares: concealment." },
      ]),
    );
    expect(
      sheet.overview?.features.find(({ name }) => name === "Synthetic Walk")
        ?.summary,
    ).toBe("Move 3+ squares: concealment.");
    expect(sheet.overview?.features.map(({ name }) => name)).not.toContain(
      "Synthetic Mastery",
    );
  });

  it("gives power cards their class block, technique and spellbook mark", () => {
    const card = (name: string) =>
      sheet.powers.find((candidate) => candidate.name === name);
    expect(card("Synthetic Storms")).toMatchObject({
      classBlock: "Synthetic Monk",
      movementTechnique: {
        id: "TECHNIQUE",
        name: "Synthetic Storms [Movement Technique]",
        actionType: "Move Action",
        attackType: "Personal",
        fields: [{ label: "Effect", value: "You shift 2 squares." }],
      },
    });
    expect(card("Synthetic Storms")?.spellbook).toBeUndefined();
    // The model keeps the technique's power (page-1 lists); only the card
    // deck drops its own card, since the discipline's card prints it.
    expect(card("Synthetic Storms [Movement Technique]")).toMatchObject({
      classBlock: "Synthetic Monk",
    });
    expect(deckPowerCards(sheet.powers).map(({ name }) => name)).not.toContain(
      "Synthetic Storms [Movement Technique]",
    );
    expect(card("Synthetic Cloud Burst")?.spellbook).toBe(true);
    expect(card("Synthetic Sleep")?.spellbook).toBeUndefined();
  });

  it("builds the same card parts for builder panes", () => {
    const finder = createSheetPowerCardFinder(evaluation, content);
    const discipline = lookup("DISCIPLINE")!;
    expect(finder(discipline, evaluation.powers[0])).toMatchObject({
      classBlock: "Synthetic Monk",
      movementTechnique: { id: "TECHNIQUE" },
    });
    // A power the character is only considering: authored card, same parts.
    expect(finder(lookup("SKILL_POWER")!, undefined)).toMatchObject({
      classBlock: "Diplomacy",
    });
    expect(finder(lookup("BOOK")!, evaluation.powers[3])?.spellbook).toBe(true);
  });
});
