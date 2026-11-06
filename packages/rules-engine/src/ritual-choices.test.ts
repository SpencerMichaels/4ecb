import { describe, expect, it } from "vitest";

import type {
  BuildKnownEntry,
  BuildOccurrence,
  CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { projectBuildForEvaluation } from "./build-projection";
import { evaluateCharacter } from "./evaluator";
import { knownRecords } from "./known-records";
import { ritualAllowanceStatuses } from "./ritual-allowances";
import { fillRitualChoicesFromKnown } from "./ritual-choices";

function rule(
  name: string,
  attributes: Record<string, string>,
  ordinal: number,
): RuleStatement {
  return {
    name,
    attributes: Object.entries(attributes).map(([attribute, value]) => ({
      name: attribute,
      value,
    })),
    text: "",
    children: [],
    ordinal,
  };
}

function entity(
  id: string,
  name: string,
  type: string,
  rules: readonly RuleStatement[] = [],
  specifics: readonly (readonly [string, string])[] = [],
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public test fixture",
    sources: ["Public test fixture"],
    attributes: [],
    categories: [],
    specifics: specifics.map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "ritual-choices-test", sourceOrdinal: 0 },
  };
}

const ritual = (id: string, name: string, level: number) =>
  entity(id, name, "Ritual", [], [["Level", String(level)]]);

// As the content corrections author them (98-ritual-allowances.part): the
// Psion's grants record keeps its open 1st-level allowance, and the class
// gains a select whose Category lists Sending and Tenser's Floating Disk.
const content = [
  entity("L1", "1", "Level"),
  entity("ID_FMP_CLASS_437", "Psion", "Class", [
    rule("grant", { name: "ID_INTERNAL_GRANTS_PSION", type: "Grants" }, 0),
    rule(
      "select",
      {
        type: "Ritual",
        number: "1",
        Category: "ID_FMP_RITUAL_55|ID_FMP_RITUAL_60",
      },
      1,
    ),
  ]),
  entity(
    "ID_INTERNAL_GRANTS_PSION",
    "Psion",
    "Grants",
    [],
    [["_FreeRitualAllowance", "Ritual; 1@1<=1"]],
  ),
  entity("ID_FMP_FEAT_1885", "Wild Sage", "Feat", [
    rule(
      "select",
      {
        type: "Ritual",
        number: "1",
        Category: "ID_FMP_RITUAL_285|ID_FMP_RITUAL_287|ID_FMP_RITUAL_291",
      },
      0,
    ),
  ]),
  ritual("ID_FMP_RITUAL_55", "Sending", 6),
  ritual("ID_FMP_RITUAL_60", "Tenser's Floating Disk", 1),
  ritual("ID_FMP_RITUAL_285", "Dowsing Rod", 1),
  ritual("ID_FMP_RITUAL_287", "Portend Weather", 1),
  ritual("ID_FMP_RITUAL_291", "Traveler's Camouflage", 1),
  ritual("ID_FMP_RITUAL_9", "Comprehend Language", 1),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));
const lookup = (id: string) => byId.get(id.toLowerCase());

function occurrence(
  id: string,
  definitionId: string,
  children: readonly BuildOccurrence[] = [],
): BuildOccurrence {
  const record = lookup(definitionId)!;
  return {
    id,
    identity: { definitionId, name: record.name, type: record.type },
    acquiredLevel: 1,
    legality: "rules-legal",
    children,
    unresolved: false,
  };
}

const loot = {
  quantity: 1,
  equippedQuantity: 0,
  elements: [],
  overrides: {},
  legality: "rules-legal" as const,
};

function known(
  id: string,
  definitionId: string,
  extra: Partial<BuildKnownEntry> = {},
): BuildKnownEntry {
  const record = lookup(definitionId)!;
  return {
    id,
    acquiredLevel: 1,
    element: { definitionId, name: record.name, type: "Ritual" },
    acquisition: "free",
    ...extra,
  };
}

function psion(
  entries: readonly BuildKnownEntry[],
  extra: readonly BuildOccurrence[] = [],
): CharacterBuild {
  return {
    formatVersion: 3,
    effectiveLevel: 1,
    levels: [
      {
        level: 1,
        root: occurrence("l1", "L1", [
          occurrence("class", "ID_FMP_CLASS_437"),
          ...extra,
        ]),
      },
    ],
    grabbag: [],
    inventory: [],
    known: entries,
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  };
}

const evaluate = (build: CharacterBuild) =>
  evaluateCharacter(projectBuildForEvaluation(build, content), content);

const ritualChoice = (build: CharacterBuild, provider: string) => {
  const evaluation = evaluate(build);
  return evaluation.choices.find(
    (choice) =>
      choice.type === "Ritual" &&
      evaluation.occurrences.find(
        ({ id }) => id === choice.providerOccurrenceId,
      )?.definitionId === provider,
  );
};

const chosenId = (build: CharacterBuild, provider: string) => {
  const evaluation = evaluate(build);
  const choice = ritualChoice(build, provider);
  return evaluation.occurrences.find(
    ({ id }) => id === choice?.selectedOccurrenceId,
  )?.definitionId;
};

describe("Ritual choices filled from known entries", () => {
  it("offers only the select's listed rituals", () => {
    const choice = ritualChoice(psion([]), "ID_FMP_CLASS_437");
    expect(
      choice?.candidates
        .filter(({ eligible }) => eligible)
        .map(({ definitionId }) => definitionId),
    ).toEqual(["ID_FMP_RITUAL_55", "ID_FMP_RITUAL_60"]);
  });

  it("fills a psion's choice from imported Sending loot, shown once", () => {
    const build = psion([
      known("comprehend", "ID_FMP_RITUAL_9", { legacyLoot: loot }),
      known("sending", "ID_FMP_RITUAL_55", { legacyLoot: loot }),
    ]);
    const result = fillRitualChoicesFromKnown(build, content);
    expect(result.fills).toEqual([
      expect.objectContaining({
        entryId: "sending",
        definitionId: "ID_FMP_RITUAL_55",
        name: "Sending",
        provider: "Psion",
      }),
    ]);
    expect(chosenId(result.build, "ID_FMP_CLASS_437")).toBe("ID_FMP_RITUAL_55");
    // The loot entry is kept for export; the list shows Sending once.
    expect(result.build.known).toEqual(build.known);
    const evaluation = evaluate(result.build);
    const records = knownRecords(result.build, evaluation, lookup);
    expect(
      records.map(({ element, source }) => [
        element.definitionId,
        source.kind,
        source.kind === "granted" ? source.via : source.acquisition,
      ]),
    ).toEqual([
      ["ID_FMP_RITUAL_55", "granted", "choice"],
      ["ID_FMP_RITUAL_9", "learned", "free"],
    ]);
    // Only Comprehend Language uses the open 1st-level allowance.
    expect(
      ritualAllowanceStatuses(result.build, evaluation, lookup)[0],
    ).toMatchObject({ used: 1, entryIds: ["comprehend"] });
    // Filling again changes nothing.
    expect(fillRitualChoicesFromKnown(result.build, content).fills).toEqual([]);
  });

  it("prefers the entry learned from the retired allowance", () => {
    const build = psion([
      known("disk-loot", "ID_FMP_RITUAL_60", { legacyLoot: loot }),
      known("sending", "ID_FMP_RITUAL_55", {
        acquiredLevel: 1,
        allowance: "ID_INTERNAL_GRANTS_PSION#2",
      }),
    ]);
    const result = fillRitualChoicesFromKnown(build, content);
    expect(result.fills.map(({ entryId }) => entryId)).toEqual(["sending"]);
  });

  it("never takes a bought entry or one on a current allowance", () => {
    const build = psion([
      known("bought", "ID_FMP_RITUAL_55", { acquisition: "bought" }),
      // Learn free on the open 1st-level slot: the player's pick there.
      known("open", "ID_FMP_RITUAL_60", {
        allowance: "ID_INTERNAL_GRANTS_PSION",
      }),
    ]);
    const result = fillRitualChoicesFromKnown(build, content);
    expect(result.fills).toEqual([]);
    expect(result.build).toBe(build);
  });

  it("fills Wild Sage's choice under the feat, with the earliest loot", () => {
    const build = psion(
      [
        known("rod-later", "ID_FMP_RITUAL_285", {
          acquiredLevel: 1,
          legacyLoot: loot,
        }),
        known("weather", "ID_FMP_RITUAL_287", {
          allowance: "ID_FMP_FEAT_1885",
        }),
      ],
      [occurrence("sage", "ID_FMP_FEAT_1885")],
    );
    const result = fillRitualChoicesFromKnown(build, content);
    expect(
      result.fills.map(({ entryId, provider }) => [entryId, provider]),
    ).toEqual([["weather", "Wild Sage"]]);
    expect(chosenId(result.build, "ID_FMP_FEAT_1885")).toBe(
      "ID_FMP_RITUAL_287",
    );
    // The psion's choice has no matching entry and stays open.
    expect(
      ritualChoice(result.build, "ID_FMP_CLASS_437")?.selectedOccurrenceId,
    ).toBeUndefined();
  });
});
