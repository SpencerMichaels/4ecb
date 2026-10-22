import { describe, expect, it } from "vitest";

import type { BuildKnownEntry } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import type { EvaluatedCharacter } from "./evaluator";
import {
  eligibleRitualAllowances,
  parseRitualAllowance,
  ritualAllowanceStatuses,
  ritualAllowances,
} from "./ritual-allowances";

function entity(
  id: string,
  type: string,
  specifics: readonly (readonly [string, string])[] = [],
): ContentEntity {
  return {
    id,
    name: id.replaceAll("_", " ").toLowerCase(),
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
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "ritual-allowances-test", sourceOrdinal: 0 },
  };
}

const ritual = (id: string, level: number, subtype = "Ritual") =>
  entity(id, "Ritual", [
    ["Level", String(level)],
    ["type", subtype],
  ]);

const content = [
  entity("WIZARD_BOOK", "Class Feature", [
    ["_FreeRitualAllowance", "Ritual; 3@1<=1; 2@5,11<=step"],
  ]),
  entity("DRUID", "Grants", [["_FreeRitualAllowance", "Ritual; 1@1<=1"]]),
  entity("PSION", "Grants", [
    ["_FreeRitualAllowance", "Ritual; 1@1<=1"],
    ["_FreeRitualAllowance", "Ritual; 1@1; from=R_SENDING|R_DISK"],
  ]),
  entity("PRODIGY", "Feat", [
    ["_FreeRitualAllowance", "Martial Practice; 2@1<=level; 1@5<=level"],
  ]),
  entity("BROKEN", "Feat", [["_FreeRitualAllowance", "Ritual; three"]]),
  ritual("R_ONE", 1),
  ritual("R_ONE_B", 1),
  ritual("R_ONE_C", 1),
  ritual("R_ONE_D", 1),
  ritual("R_FOUR", 4),
  ritual("R_EIGHT", 8),
  ritual("R_SENDING", 6),
  ritual("R_DISK", 1),
  ritual("R_GIFT", 1),
  ritual("P_THREE", 3, "Martial Practice"),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));
const lookup = (id: string) => byId.get(id.toLowerCase());

function evaluation(
  level: number,
  activeDefinitionIds: readonly string[],
  freebees: readonly string[] = [],
): Pick<
  EvaluatedCharacter,
  "activeDefinitionIds" | "level" | "occurrences" | "stats"
> {
  return {
    level,
    activeDefinitionIds,
    occurrences: [],
    stats: Object.fromEntries(
      freebees.map((id) => [
        `freebee:${id}`,
        { name: `FREEBEE:${id}`, value: 1, contributions: [] },
      ]),
    ),
  };
}

function free(
  id: string,
  definitionId: string,
  acquiredLevel = 1,
  extra: Partial<BuildKnownEntry> = {},
): BuildKnownEntry {
  return {
    id,
    acquiredLevel,
    element: { definitionId, name: definitionId, type: "Ritual" },
    acquisition: "free",
    ...extra,
  };
}

describe("free-ritual allowances", () => {
  it("parses the allowance grammar and rejects malformed values", () => {
    expect(parseRitualAllowance("Ritual; 3@1<=1; 2@5,11<=step")).toEqual({
      kind: "Ritual",
      steps: [
        { level: 1, count: 3, max: 1 },
        { level: 5, count: 2, max: "step" },
        { level: 11, count: 2, max: "step" },
      ],
    });
    expect(
      parseRitualAllowance("martial practice; 2@1<=level; from=A|b"),
    ).toEqual({
      kind: "Martial Practice",
      steps: [{ level: 1, count: 2, max: "level" }],
      from: ["a", "b"],
    });
    expect(parseRitualAllowance("Ritual; 1@1")).toEqual({
      kind: "Ritual",
      steps: [{ level: 1, count: 1 }],
    });
    for (const value of [
      "Ritual",
      "Spell; 1@1",
      "Ritual; three",
      "Ritual; 0@1",
    ])
      expect(parseRitualAllowance(value)).toBeUndefined();
  });

  it("reads one allowance per field of each active provider", () => {
    const allowances = ritualAllowances(
      evaluation(1, ["PSION", "BROKEN", "psion"]),
      lookup,
    );
    expect(allowances.map(({ key }) => key)).toEqual(["PSION", "PSION#2"]);
    expect(allowances.map(({ provider }) => provider)).toEqual([
      "psion",
      "psion",
    ]);
  });

  it("grows a wizard's allowance at its listed levels with step limits", () => {
    const build = { known: [] };
    const at = (level: number) =>
      ritualAllowanceStatuses(
        build,
        evaluation(level, ["WIZARD_BOOK"]),
        lookup,
      )[0]!;
    expect(at(1)).toMatchObject({
      total: 3,
      used: 0,
      remaining: 3,
      remainders: [{ count: 3, maxLevel: 1 }],
    });
    expect(at(5).remainders).toEqual([
      { count: 3, maxLevel: 1 },
      { count: 2, maxLevel: 5 },
    ]);
    expect(at(11)).toMatchObject({ total: 7, remaining: 7 });
  });

  it("counts named and imported free entries, never bought or granted ones", () => {
    const build = {
      known: [
        free("a", "R_ONE", 1, { allowance: "WIZARD_BOOK" }),
        free("b", "R_FOUR", 5, { allowance: "WIZARD_BOOK" }),
        // Learned free natively without an allowance: a gift, not counted.
        free("c", "R_ONE_B"),
        // Imported loot records no allowance; it is matched where it fits.
        free("d", "R_ONE_C", 3, {
          legacyLoot: {
            quantity: 1,
            equippedQuantity: 0,
            elements: [],
            overrides: {},
            legality: "rules-legal",
          },
        }),
        free("e", "R_ONE_D"),
        {
          ...free("f", "R_EIGHT", 5),
          acquisition: "bought" as const,
        },
        // Granted outright, so it never uses the allowance.
        free("g", "R_GIFT", 1, { allowance: "WIZARD_BOOK" }),
      ],
    };
    const [status] = ritualAllowanceStatuses(
      build,
      evaluation(5, ["WIZARD_BOOK"], ["R_GIFT"]),
      lookup,
    );
    expect(status).toMatchObject({ total: 5, used: 3, remaining: 2 });
    expect([...status!.entryIds].sort()).toEqual(["a", "b", "d"]);
    // R_FOUR could only use a level-5 slot; one 1st-level and one level-5
    // slot remain.
    expect(status!.remainders).toEqual([
      { count: 1, maxLevel: 1 },
      { count: 1, maxLevel: 5 },
    ]);
  });

  it("hides entries learned above the viewed level", () => {
    const build = {
      known: [free("late", "R_FOUR", 5, { allowance: "WIZARD_BOOK" })],
    };
    const [status] = ritualAllowanceStatuses(
      build,
      evaluation(5, ["WIZARD_BOOK"]),
      lookup,
      4,
    );
    expect(status).toMatchObject({ total: 3, used: 0 });
  });

  it("offers only the allowances a record fits", () => {
    const statuses = ritualAllowanceStatuses(
      { known: [] },
      evaluation(1, ["DRUID", "PSION", "PRODIGY"]),
      lookup,
    );
    const keys = (id: string) =>
      eligibleRitualAllowances(statuses, lookup(id)!, 1).map(({ key }) => key);
    expect(keys("R_ONE")).toEqual(["DRUID", "PSION"]);
    expect(keys("R_DISK")).toEqual(["DRUID", "PSION", "PSION#2"]);
    expect(keys("R_SENDING")).toEqual(["PSION#2"]);
    expect(keys("R_FOUR")).toEqual([]);
    expect(keys("P_THREE")).toEqual([]);
    const later = ritualAllowanceStatuses(
      { known: [] },
      evaluation(3, ["PRODIGY"]),
      lookup,
    );
    expect(
      eligibleRitualAllowances(later, lookup("P_THREE")!, 3).map(
        ({ key }) => key,
      ),
    ).toEqual(["PRODIGY"]);
    expect(later[0]!.remainders).toEqual([{ count: 2, maxLevel: 3 }]);
  });

  it("marks an exhausted allowance as fully used", () => {
    const [status] = ritualAllowanceStatuses(
      { known: [free("x", "R_ONE", 1, { allowance: "DRUID" })] },
      evaluation(1, ["DRUID"]),
      lookup,
    );
    expect(status).toMatchObject({ total: 1, used: 1, remaining: 0 });
    expect(eligibleRitualAllowances([status!], lookup("R_ONE_B")!, 1)).toEqual(
      [],
    );
  });
});
