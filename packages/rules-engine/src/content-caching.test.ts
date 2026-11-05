import { describe, expect, it } from "vitest";

import {
  scanCountingContent,
  type ContentEntity,
  type RuleStatement,
} from "@4ecb/content-domain";

import {
  contentWithLocalEntities,
  evaluateCharacter,
  type EvaluationInput,
} from "./evaluator";

// Per-content setup (rules index, powers lookups, id and category maps) is
// built once per content array: evaluating the character again, after an
// edit, scans none of the content. A character's own records (user edits)
// keep one combined array while they are unchanged.

const grant = (name: string, ordinal: number): RuleStatement => ({
  name: "grant",
  attributes: [
    { name: "name", value: name },
    { name: "type", value: "Feat" },
  ],
  text: "",
  children: [],
  ordinal,
});

const entity = (
  id: string,
  type: string,
  rules: readonly RuleStatement[] = [],
): ContentEntity => ({
  id,
  name: id,
  type,
  source: "test",
  sources: ["test"],
  attributes: [],
  categories: [],
  specifics: [],
  rules,
  description: "",
  extensions: [],
  provenance: { sourceKey: "test", sourceOrdinal: 0 },
});

const records = [
  entity("ROOT", "Root"),
  entity("FEAT", "Feat"),
  entity("POWER", "Power"),
];

// What projectBuildForEvaluation hands over each time: new arrays, equal
// records.
const input = (level: number, withUserEdit: boolean): EvaluationInput => ({
  level,
  baseAbilities: {},
  occurrences: [
    { id: "root", definitionId: "ROOT", acquiredLevel: 1, kind: "root" },
    { id: "power", definitionId: "POWER", acquiredLevel: 1, kind: "grabbag" },
    ...(withUserEdit
      ? [
          {
            id: "edit",
            definitionId: "ID_INTERNAL_USER_EDIT_1",
            acquiredLevel: 1,
            kind: "grabbag" as const,
          },
        ]
      : []),
  ],
  inventory: [],
  candidateDetailLevels: [level],
  ...(withUserEdit
    ? {
        localEntities: [
          entity("ID_INTERNAL_USER_EDIT_1", "Internal", [grant("FEAT", 0)]),
        ],
      }
    : {}),
});

describe("rules-engine per-content caching", () => {
  it.each([false, true])(
    "evaluates an edited character again without scanning the content (user edits: %s)",
    (withUserEdit) => {
      const { content, scans } = scanCountingContent(records);
      const first = evaluateCharacter(input(1, withUserEdit), content);
      const warm = scans();
      expect(warm).toBeGreaterThan(0);
      const again = evaluateCharacter(input(2, withUserEdit), content);
      expect(scans()).toBe(warm);
      expect(again.activeDefinitionIds).toEqual(first.activeDefinitionIds);
      expect(first.activeDefinitionIds.includes("FEAT")).toBe(withUserEdit);
    },
  );

  it("keeps one combined array per distinct set of local records", () => {
    const local = () => [entity("ID_INTERNAL_USER_EDIT_1", "Internal")];
    expect(contentWithLocalEntities(records, [])).toBe(records);
    const combined = contentWithLocalEntities(records, local());
    expect(contentWithLocalEntities(records, local())).toBe(combined);
    expect(combined.map(({ id }) => id)).toEqual([
      "ROOT",
      "FEAT",
      "POWER",
      "ID_INTERNAL_USER_EDIT_1",
    ]);
    expect(
      contentWithLocalEntities(records, [
        entity("ID_INTERNAL_USER_EDIT_2", "Internal"),
      ]),
    ).not.toBe(combined);
  });
});
