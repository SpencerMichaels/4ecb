import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type {
  CandidateDecision,
  EvaluatedCharacter,
  EvaluatedChoice,
} from "@4ecb/rules-engine";

import {
  BUILD_OVERVIEW_SORT_STORAGE_KEY,
  buildOverview,
  buildOverviewBands,
  DEFAULT_BUILD_OVERVIEW_SORT,
  nextBuildOverviewSort,
  readBuildOverviewSort,
  writeBuildOverviewSort,
} from "./build-overview";
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
    retraining: true,
    replacementOptions: [
      {
        replacesOccurrenceId: "o-toughness",
        definitionId: "FEAT_TOUGHNESS",
        candidates: [],
      },
    ],
  }),
  // Level 3: an unused retrain only.
  choice(3, "Replacement", undefined, { optional: true, retraining: true }),
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

  it("groups a level's choices by category, powers by usage", () => {
    expect(rows(1)).toEqual([
      "Character: Class — Wizard (complete)",
      "Character: Race — Elf · Language: Elven (complete)",
      "Character: Gender — Female (complete)",
      "Ability Scores: Ability Scores — STR 10, CON 12, DEX 14, INT 16, WIS 13, CHA 11 (complete)",
      "Feats: Feat — Toughness (complete)",
      "Powers: At-Will power — Magic Missile (complete)",
      "Powers: Encounter power — Burning Hands (complete)",
      "Powers: Daily power — Sleep (complete)",
      "Powers: Encounter Utility power — Shield (complete)",
    ]);
  });

  it("flags an open required choice and reads a retrain as old → new", () => {
    expect(rows(2)).toEqual([
      "Feats: Feat — none chosen (unresolved)",
      "Feats: Retraining — Toughness → Improved Initiative (complete)",
    ]);
    expect(rows(4)).toEqual([
      "Ability Scores: Ability Increases — +1 STR, +1 CHA (complete)",
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

describe("build overview by slot", () => {
  // A fighter's at-will Cleave retrained into Reaping Strike at level 4.
  // As the evaluator reports it, the level-1 slot's pick is now the
  // retrain's own occurrence (it replaced into that slot).
  const powers = [
    power("POWER_CLEAVE", "Cleave", "At-Will"),
    power("POWER_REAPING_STRIKE", "Reaping Strike", "At-Will"),
    power("POWER_SPINNING_SWEEP", "Spinning Sweep", "Encounter"),
  ];
  const retrainById = new Map([
    ...byId,
    ...powers.map((record) => [record.id.toLocaleLowerCase(), record] as const),
  ]);
  const level1Power = choice(1, "Power", "o-reaping");
  const level1Encounter = choice(1, "Power", "o-sweep");
  const level1Feat = choice(1, "Feat", "o-toughness-2");
  const retrain = choice(4, "Replacement", "o-reaping", {
    optional: true,
    retraining: true,
    replacementOptions: [
      {
        replacesOccurrenceId: "o-cleave",
        definitionId: "POWER_CLEAVE",
        candidates: [],
      },
    ],
  });
  const retrainEvaluation = {
    level: 4,
    choices: [level1Power, level1Encounter, level1Feat, retrain],
    occurrences: [
      occurrence("o-reaping", "POWER_REAPING_STRIKE", {
        replacesId: "o-cleave",
      }),
      occurrence("o-sweep", "POWER_SPINNING_SWEEP"),
      occurrence("o-toughness-2", "FEAT_TOUGHNESS"),
    ],
  } as unknown as EvaluatedCharacter;
  const levels = buildOverview(retrainEvaluation, build, retrainById);
  // A band's rows, each section's under its sub-heading ("-- Daily").
  const band = (bands: ReturnType<typeof buildOverviewBands>, title: string) =>
    bands
      .find((entry) => entry.title === title)!
      .sections.flatMap((section) => [
        ...(section.title === undefined ? [] : [`-- ${section.title}`]),
        ...section.rows.map(
          ({ row, picks, note }) =>
            `L${row.level} ${row.title} — ${picks ?? "none chosen"}${note === undefined ? "" : ` (${note})`}`,
        ),
      ]);

  it("lists the full history by level, the retrain on its own row", () => {
    const bands = buildOverviewBands(levels, DEFAULT_BUILD_OVERVIEW_SORT);
    expect(bands.map(({ title }) => title)).toEqual([
      "Level 1",
      "Level 2",
      "Level 3",
      "Level 4",
    ]);
    expect(band(bands, "Level 1")).toEqual([
      "L1 Ability Scores — STR 10, CON 12, DEX 14, INT 16, WIS 13, CHA 11",
      "L1 Feat — Toughness",
      "L1 At-Will power — Reaping Strike",
      "L1 Encounter power — Spinning Sweep",
    ]);
    expect(band(bands, "Level 4")).toEqual([
      "L4 Retraining — Cleave → Reaping Strike",
    ]);
    expect(
      levels[3]!.groups.map(({ kind, rows: groupRows }) => [
        kind,
        groupRows.length,
      ]),
    ).toEqual([["powers", 1]]);
  });

  it("bands every category in order, rows by level, only what is held now", () => {
    const bands = buildOverviewBands(levels, {
      column: "slot",
      direction: "ascending",
    });
    expect(bands.map(({ title }) => title)).toEqual([
      "Character",
      "Ability Scores",
      "Skills",
      "Feats",
      "Powers",
      "Features & Other",
    ]);
    // Powers run in usage sub-groups, only those with rows. The retrained
    // slot has no row of its own: the power the character has now shows
    // once, at the level it was gained, noting what it replaced.
    expect(band(bands, "Powers")).toEqual([
      "-- At-Will",
      "L4 Retraining — Reaping Strike (replaced Cleave at L4)",
      "-- Encounter",
      "L1 Encounter power — Spinning Sweep",
    ]);
    expect(band(bands, "Feats")).toEqual(["L1 Feat — Toughness"]);
    // An empty category keeps its band.
    expect(band(bands, "Skills")).toEqual([]);
  });

  it("runs each usage sub-group by level, in usage order", () => {
    const bands = buildOverviewBands(buildOverview(evaluation, build, byId), {
      column: "slot",
      direction: "ascending",
    });
    // Level 1 lists Sleep first; the sub-groups still run by usage.
    expect(band(bands, "Powers")).toEqual([
      "-- At-Will",
      "L1 At-Will power — Magic Missile",
      "-- Encounter",
      "L1 Encounter power — Burning Hands",
      "-- Daily",
      "L1 Daily power — Sleep",
      "-- Utility",
      "L1 Encounter Utility power — Shield",
    ]);
    // A Powers band without powers is one empty section, no sub-groups.
    expect(
      buildOverviewBands(
        buildOverview({ ...evaluation, choices: [] }, build, byId),
        { column: "slot", direction: "ascending" },
      ).find(({ title }) => title === "Powers")!.sections,
    ).toEqual([{ key: "slot:powers", title: undefined, rows: [] }]);
  });

  it("drops a pick a later retrain traded away", () => {
    // The first fixture reports the replaced Toughness as the level-1
    // slot's pick from replacedSelections.
    const bands = buildOverviewBands(buildOverview(evaluation, build, byId), {
      column: "slot",
      direction: "ascending",
    });
    expect(band(bands, "Feats")).toEqual([
      "L2 Feat — none chosen",
      "L2 Retraining — Improved Initiative (replaced Toughness at L2)",
    ]);
  });

  it("files a level's power swap under the power it picks", () => {
    // A Build-tab swap (not a retrain): Spinning Sweep for Burning Hands.
    const encounter = choice(1, "Power", "o-hands-2");
    const swap = choice(3, "Replacement", "o-hands-2", {
      replacementOptions: [
        {
          replacesOccurrenceId: "o-sweep-2",
          definitionId: "POWER_SPINNING_SWEEP",
          candidates: [],
        },
      ],
    });
    const swapLevels = buildOverview(
      {
        level: 4,
        choices: [encounter, swap],
        occurrences: [
          occurrence("o-hands-2", "POWER_BURNING_HANDS", {
            replacesId: "o-sweep-2",
          }),
        ],
      } as unknown as EvaluatedCharacter,
      build,
      retrainById,
    );
    expect(
      swapLevels[2]!.groups.flatMap(({ rows: groupRows }) =>
        groupRows.map(({ kind, usage }) => `${kind}/${usage}`),
      ),
    ).toEqual(["powers/encounter"]);
    const bands = buildOverviewBands(swapLevels, {
      column: "slot",
      direction: "ascending",
    });
    expect(band(bands, "Powers")).toEqual([
      "-- Encounter",
      "L3 Replacement — Burning Hands (replaced Spinning Sweep at L3)",
    ]);
  });

  it("reverses the bands for a descending sort", () => {
    expect(
      buildOverviewBands(levels, {
        column: "level",
        direction: "descending",
      }).map(({ title }) => title),
    ).toEqual(["Level 4", "Level 3", "Level 2", "Level 1"]);
    expect(
      buildOverviewBands(levels, {
        column: "slot",
        direction: "descending",
      })[0]!.title,
    ).toBe("Features & Other");
  });

  it("flips the active column and starts the other ascending", () => {
    expect(nextBuildOverviewSort(DEFAULT_BUILD_OVERVIEW_SORT, "level")).toEqual(
      { column: "level", direction: "descending" },
    );
    expect(
      nextBuildOverviewSort(
        { column: "level", direction: "descending" },
        "slot",
      ),
    ).toEqual({ column: "slot", direction: "ascending" });
  });

  it("remembers the grouping, falling back to by level", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(readBuildOverviewSort(storage)).toEqual(DEFAULT_BUILD_OVERVIEW_SORT);
    writeBuildOverviewSort(
      { column: "slot", direction: "descending" },
      storage,
    );
    expect(readBuildOverviewSort(storage)).toEqual({
      column: "slot",
      direction: "descending",
    });
    // The slot grouping's earlier stored name still reads as it.
    store.set(
      BUILD_OVERVIEW_SORT_STORAGE_KEY,
      '{"column":"category","direction":"ascending"}',
    );
    expect(readBuildOverviewSort(storage)).toEqual({
      column: "slot",
      direction: "ascending",
    });
    store.set(BUILD_OVERVIEW_SORT_STORAGE_KEY, '{"column":"slot"}');
    expect(readBuildOverviewSort(storage)).toEqual(DEFAULT_BUILD_OVERVIEW_SORT);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readBuildOverviewSort(blocked)).toEqual(DEFAULT_BUILD_OVERVIEW_SORT);
  });
});

describe("Overview table styles", () => {
  const rules = (selector: RegExp) =>
    [...appStyles.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) =>
      selector.test(sel!),
    );
  const ruleFor = (selector: string) =>
    rules(/./).find(([, sel]) =>
      sel!
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(",")
        .map((part) => part.replace(/\s+/g, " ").trim())
        .includes(selector),
    );

  it("styles no count on the bands", () => {
    // The owner found the choice count confusing (D113 note, 2026-11-05).
    expect(rules(/build-overview[^{]*table-section-count/)).toEqual([]);
  });

  it("stripes and tints rows with the candidate tables' own rules", () => {
    // One rule each, shared with the tables: no Overview copy of the colors.
    const base = ruleFor(".build-overview-rows > tr");
    expect(base?.[2]).toMatch(/background: var\(--surface\);/);
    expect(base?.[1]).toContain(".selection-table-scroll tbody tr");
    const stripe = ruleFor(".build-overview-rows > tr:nth-child(even)");
    expect(stripe?.[2]).toMatch(/background: var\(--surface-subtle\);/);
    expect(stripe?.[1]).toContain(
      ".selection-table-scroll tbody tr:nth-child(even)",
    );
    // Hover: the tables' tint, and their cancelled button hover shadow.
    const tint = ruleFor(
      ".build-overview-rows > tr.build-overview-choice:hover > td",
    );
    expect(tint?.[1]).toMatch(/tr\.selection-candidate-row:hover/);
    expect(tint?.[2]).toMatch(/linear-gradient/);
    expect(ruleFor(".build-overview-row:hover")?.[2]).toMatch(
      /box-shadow: none/,
    );
  });

  it("sorts with the candidate tables' header control", () => {
    // The Overview has no sort-button styling of its own.
    expect(rules(/build-overview[^{]*selection-sort-button/)).toEqual([]);
    expect(appStyles).toMatch(/\.selection-sort-button \{/);
  });

  it("draws a line only under the band, never between rows", () => {
    // The band is the shared table-section-row styling, not a copy.
    expect(appStyles).toMatch(
      /\.build-overview \.table-section-row \{[^}]*background: var\(--brand-navy\)/,
    );
    expect(appStyles).toMatch(
      /\.build-overview \.table-section-row th \{[^}]*border-bottom: 1px solid var\(--border-strong\)/,
    );
    const overviewRules = rules(/\.build-overview-/);
    expect(overviewRules.length).toBeGreaterThan(0);
    for (const [selector, body] of overviewRules)
      expect(body, selector).not.toMatch(/border(-top|-bottom)?\s*:\s*(?!0)/);
    // A collapsed band's bodies and sub-bands hide.
    expect(appStyles).toMatch(
      /\.build-overview-rows\[hidden\],\s*\.build-overview-subband\[hidden\] \{\s*display: none;/,
    );
  });

  it("draws the Powers usage sub-bands lighter than the band", () => {
    const subband = ruleFor(".build-overview-subband th")?.[2];
    expect(subband).toMatch(
      /background: color-mix\(in srgb, var\(--brand-navy\) 16%, var\(--surface\)\)/,
    );
    expect(subband).toMatch(/color: var\(--text\)/);
  });

  it("narrows its fixed columns with the tab, not the viewport", () => {
    // A container query on the builder tab, so 140% zoom and the parked
    // sidebar both narrow it.
    expect(appStyles).toMatch(
      /@container builder-tab \(max-width: 42rem\) \{[^@]*\.build-overview-col-level \{\s*width: 3\.6rem;/,
    );
    expect(ruleFor(".build-overview-table")?.[2]).toMatch(
      /table-layout: fixed/,
    );
  });
});
