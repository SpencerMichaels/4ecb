import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type {
  CandidateDecision,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";

import { buildOverview, buildOverviewLevelChoiceCount } from "./build-overview";
import { appStyles } from "./test-styles";

const statement = (
  name: string,
  attributes: Readonly<Record<string, string>>,
): RuleStatement => ({
  name,
  attributes: Object.entries(attributes).map(([attribute, value]) => ({
    name: attribute,
    value,
  })),
  text: "",
  children: [],
  ordinal: 0,
});

const entity = (
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
  rules: readonly RuleStatement[] = [],
): ContentEntity => ({
  id,
  name,
  type,
  source: "Public test fixture",
  sources: ["Public test fixture"],
  attributes: [],
  categories: [],
  specifics: Object.entries(specifics).map(([field, value], ordinal) => ({
    name: field,
    value,
    extraAttributes: [],
    ordinal,
  })),
  rules,
  description: "",
  extensions: [],
  provenance: { sourceKey: "build-overview", sourceOrdinal: 0 },
});

const power = (id: string, name: string, usage: string, type = "Attack") =>
  entity(id, name, "Power", {
    "Power Usage": usage,
    "Power Type": type,
    "Action Type": "Standard Action",
  });

const entities = [
  entity("RACE_ELF", "Elf", "Race"),
  entity("LANGUAGE_ELVEN", "Elven", "Language"),
  entity("CLASS_WIZARD", "Wizard", "Class"),
  entity("FEAT_TOUGHNESS", "Toughness", "Feat"),
  entity("FEAT_ALERTNESS", "Alertness", "Feat"),
  entity("FEAT_IMPROVED_INITIATIVE", "Improved Initiative", "Feat"),
  entity("GENDER_FEMALE", "Female", "Gender"),
  power("POWER_MAGIC_MISSILE", "Magic Missile", "At-Will"),
  power("POWER_BURNING_HANDS", "Burning Hands", "Encounter"),
  power("POWER_SLEEP", "Sleep", "Daily"),
  power("POWER_SHIELD", "Shield", "Encounter", "Utility"),
  entity("STR_4", "Strength", "Ability Increase (Level 4)", {}, [
    statement("statadd", { name: "Strength", value: "+1" }),
  ]),
  entity("CHA_4", "Charisma", "Ability Increase (Level 4)", {}, [
    statement("statadd", { name: "Charisma", value: "+1" }),
  ]),
];
const byId = new Map(
  entities.map((record) => [record.id.toLocaleLowerCase(), record]),
);

const candidate = (definitionId: string): CandidateDecision => ({
  definitionId,
  eligible: true,
  sourceEntitled: true,
  rulesLegal: true,
  activeDefinition: false,
  activeOccurrenceIds: [],
  providerOccurrenceIds: [],
  reasons: [],
});

let ordinal = 0;
const choice = (
  level: number,
  type: string,
  selectedOccurrenceId?: string,
  extra: Partial<EvaluatedChoice> = {},
): EvaluatedChoice => {
  ordinal += 1;
  return {
    id: `choice-${ordinal}`,
    level,
    providerOccurrenceId: `level-${level}`,
    ruleOrdinal: ordinal,
    index: 0,
    type,
    optional: false,
    candidates: [],
    ...(selectedOccurrenceId === undefined ? {} : { selectedOccurrenceId }),
    ...extra,
  };
};

const occurrence = (
  id: string,
  definitionId: string,
  extra: Record<string, unknown> = {},
) => ({ id, definitionId, legality: "rules-legal", ...extra });

// Level 1 lists its powers daily first, to show they sort by usage.
const choices: EvaluatedChoice[] = [
  choice(1, "Power", "o-sleep"),
  choice(1, "Feat", "o-toughness"),
  choice(1, "Race", "o-elf"),
  choice(1, "Language", "o-elven", { providerOccurrenceId: "o-elf" }),
  choice(1, "Power", "o-shield"),
  choice(1, "Class", "o-wizard"),
  choice(1, "Power", "o-missile"),
  choice(1, "Power", "o-hands"),
  choice(1, "Gender", "o-female"),
  // An optional, unused alignment is no decision to list.
  choice(1, "Alignment", undefined, { optional: true }),
  // Level 2: an open required feat; a used retrain.
  choice(2, "Feat", undefined, {
    candidates: [candidate("FEAT_ALERTNESS")],
  }),
  choice(2, "Replacement", "o-retrain", {
    optional: true,
    replacementOptions: [
      {
        replacesOccurrenceId: "o-toughness",
        definitionId: "FEAT_TOUGHNESS",
        candidates: [],
      },
    ],
  }),
  // Level 3: an unused retrain only.
  choice(3, "Replacement", undefined, { optional: true }),
];
// Level 4: the two increases of one select rule.
const increases = [0, 1].map((index) => ({
  ...choice(4, "Ability Increase (Level 4)", `o-increase-${index}`),
  ruleOrdinal: 99,
  index,
  id: `increase-${index}`,
}));

const evaluation = {
  level: 4,
  choices: [...choices, ...increases],
  occurrences: [
    occurrence("o-elf", "RACE_ELF"),
    occurrence("o-elven", "LANGUAGE_ELVEN", { parentId: "o-elf" }),
    occurrence("o-wizard", "CLASS_WIZARD"),
    occurrence("o-missile", "POWER_MAGIC_MISSILE"),
    occurrence("o-hands", "POWER_BURNING_HANDS"),
    occurrence("o-sleep", "POWER_SLEEP"),
    occurrence("o-shield", "POWER_SHIELD"),
    occurrence("o-female", "GENDER_FEMALE"),
    occurrence("o-retrain", "FEAT_IMPROVED_INITIATIVE", {
      replacesId: "o-toughness",
    }),
    occurrence("o-increase-0", "STR_4"),
    occurrence("o-increase-1", "CHA_4"),
  ],
  replacedSelections: [occurrence("o-toughness", "FEAT_TOUGHNESS")],
} as unknown as EvaluatedCharacter;

const build = {
  effectiveLevel: 4,
  baseAbilities: {
    Strength: 10,
    Constitution: 12,
    Dexterity: 14,
    Intelligence: 16,
    Wisdom: 13,
    Charisma: 11,
  },
  levels: [],
  grabbag: [],
  alternates: [],
} as unknown as CharacterBuild;

const rows = (level: number) =>
  buildOverview(evaluation, build, byId)
    .find((entry) => entry.level === level)!
    .groups.flatMap((group) =>
      group.rows.map(
        (row) =>
          `${group.title}: ${row.title} — ${row.picks ?? "none chosen"}${row.status === undefined ? "" : ` (${row.status})`}`,
      ),
    );

describe("build overview", () => {
  it("lists every level up to the character's, a level without choices empty", () => {
    const levels = buildOverview(evaluation, build, byId);
    expect(levels.map(({ level }) => level)).toEqual([1, 2, 3, 4]);
    expect(levels[2]!.groups).toEqual([]);
  });

  it("groups a level's choices by kind, powers by usage", () => {
    expect(rows(1)).toEqual([
      "Character: Class — Wizard (complete)",
      "Character: Race — Elf · Language: Elven (complete)",
      "Feats: Feat — Toughness (complete)",
      "Powers: At-Will power — Magic Missile (complete)",
      "Powers: Encounter power — Burning Hands (complete)",
      "Powers: Daily power — Sleep (complete)",
      "Powers: Encounter Utility power — Shield (complete)",
      "Other: Ability Scores — STR 10, CON 12, DEX 14, INT 16, WIS 13, CHA 11 (complete)",
      "Other: Gender — Female (complete)",
    ]);
  });

  it("flags an open required choice and reads a retrain as old → new", () => {
    expect(rows(2)).toEqual([
      "Feats: Feat — none chosen (unresolved)",
      "Other: Retraining — Toughness → Improved Initiative (complete)",
    ]);
    expect(rows(4)).toEqual([
      "Other: Ability Increases — +1 STR, +1 CHA (complete)",
    ]);
  });

  it("targets each row where its choice is edited", () => {
    const levels = buildOverview(evaluation, build, byId);
    const level1 = levels[0]!.groups.flatMap((group) => group.rows);
    expect(
      level1.find((row) => row.title === "Ability Scores")?.target,
    ).toEqual({ kind: "abilities" });
    // The race flow opens on its first choice; an open slot on itself.
    expect(level1.find((row) => row.title === "Race")?.target).toEqual({
      kind: "choice",
      choiceId: choices[2]!.id,
    });
    expect(levels[1]!.groups[0]!.rows[0]!.target).toEqual({
      kind: "choice",
      choiceId: choices[10]!.id,
    });
  });
});

describe("Overview levels", () => {
  it("counts a level's choices across its groups", () => {
    const row = {
      title: "Feat",
      picks: undefined,
      status: "complete",
      target: { kind: "choice", choiceId: "feat" },
    } as const;
    expect(
      buildOverviewLevelChoiceCount({
        level: 1,
        groups: [
          {
            kind: "character",
            title: "Character",
            rows: [
              { ...row, key: "a" },
              { ...row, key: "b" },
            ],
          },
          { kind: "feats", title: "Feats", rows: [{ ...row, key: "c" }] },
        ],
      }),
    ).toBe(3);
    expect(buildOverviewLevelChoiceCount({ level: 2, groups: [] })).toBe(0);
  });

  it("draws a line only under the level band, never between rows or groups", () => {
    const rules = (selector: RegExp) =>
      [...appStyles.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) =>
        selector.test(sel!),
      );
    // The band is the shared table-section-row styling, not a copy.
    expect(appStyles).toMatch(
      /\.build-overview \.table-section-row \{[^}]*background: var\(--brand-navy\)/,
    );
    expect(appStyles).toMatch(
      /\.build-overview h4\.table-section-row \{[^}]*border-bottom: 1px solid var\(--border-strong\)/,
    );
    const overviewRules = rules(/\.build-overview-(?!level-heading)/);
    expect(overviewRules.length).toBeGreaterThan(0);
    for (const [selector, body] of overviewRules)
      expect(body, selector).not.toMatch(/border(-top|-bottom)?\s*:\s*(?!0)/);
    // A collapsed level's display:grid body still hides.
    expect(appStyles).toMatch(
      /\.build-overview-level-choices\[hidden\] \{\s*display: none;/,
    );
  });
});
