import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import { evaluateCharacter, type CharacterOccurrence } from "./evaluator";

// Native `select existing="true" Prepare="X"` (D20Choice BuildReplaceList
// ~16872, CheckReplaceElem ~16748): only what a Prepare select picked, one
// power per Level.

function statement(
  name: string,
  attributes: Readonly<Record<string, string>>,
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
  extra: Partial<ContentEntity> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Public prepare fixture",
    sources: ["Public prepare fixture"],
    attributes: [],
    categories: [],
    specifics: [],
    rules,
    description: "",
    extensions: [],
    provenance: { sourceKey: "prepare-selects", sourceOrdinal: 0 },
    ...extra,
  };
}

const WIZARD = "ID_FMP_CLASS_9";

/** A wizard daily attack spelled as the real content spells it. */
function daily(id: string, level: number): ContentEntity {
  return entity(id, id, "Power", [], {
    categories: [
      id,
      WIZARD,
      "ID_INTERNAL_CATEGORY_ATTACK",
      "ID_INTERNAL_CATEGORY_DAILY",
      String(level),
    ],
    specifics: [
      { name: "Level", value: ` ${level} `, extraAttributes: [], ordinal: 0 },
      {
        name: "Power Usage",
        value: " Daily ",
        extraAttributes: [],
        ordinal: 1,
      },
      { name: "Class", value: ` ${WIZARD} `, extraAttributes: [], ordinal: 2 },
    ],
  });
}

const content: ContentEntity[] = [
  entity("ID_INTERNAL_CATEGORY_DAILY", "Daily", "Category"),
  entity("ID_INTERNAL_CATEGORY_ATTACK", "Attack", "Category"),
  entity(WIZARD, "Wizard", "Class"),
  // As Expanded Spellbook: daily selects carrying Prepare.
  entity("BOOK", "Spellbook Feature", "Class Feature", [
    statement(
      "select",
      {
        type: "Power",
        number: "2",
        Category: `${WIZARD},daily,1`,
        Level: "1",
        Prepare: WIZARD,
      },
      0,
    ),
    statement(
      "select",
      {
        type: "Power",
        number: "1",
        Category: `${WIZARD},daily,5`,
        Level: "5",
        Prepare: WIZARD,
      },
      1,
    ),
  ]),
  // A pick and a grant that no Prepare select made.
  entity("OTHER", "Other Feature", "Class Feature", [
    statement(
      "select",
      { type: "Power", number: "1", Category: `${WIZARD},daily,1` },
      0,
    ),
    statement("grant", { name: "GRANTED_1", type: "Power" }, 1),
  ]),
  entity("PREPARE", "Prepare Feature", "Class Feature", [
    statement(
      "select",
      {
        type: "Power",
        number: "2",
        Category: `${WIZARD},daily`,
        existing: "true",
        Prepare: WIZARD,
      },
      0,
    ),
  ]),
  daily("BOOK_1A", 1),
  daily("BOOK_1B", 1),
  daily("BOOK_5", 5),
  daily("PICKED_1", 1),
  daily("GRANTED_1", 1),
];

function occurrence(
  id: string,
  definitionId: string,
  extra: Partial<CharacterOccurrence> = {},
): CharacterOccurrence {
  return { id, definitionId, acquiredLevel: 5, kind: "root", ...extra };
}

const pick = (
  id: string,
  definitionId: string,
  parentId: string,
  ruleOrdinal: number,
  choiceIndex: number,
): CharacterOccurrence =>
  occurrence(id, definitionId, {
    acquiredLevel: parentId === "prepare" ? 5 : 1,
    kind: "choice",
    parentId,
    ruleOrdinal,
    choiceIndex,
  });

const evaluate = (prepared: readonly CharacterOccurrence[]) =>
  evaluateCharacter(
    {
      level: 5,
      occurrences: [
        occurrence("book", "BOOK", { acquiredLevel: 1 }),
        occurrence("other", "OTHER", { acquiredLevel: 1 }),
        occurrence("prepare", "PREPARE"),
        pick("book-1a", "BOOK_1A", "book", 0, 0),
        pick("book-1b", "BOOK_1B", "book", 0, 1),
        pick("book-5", "BOOK_5", "book", 1, 0),
        pick("picked-1", "PICKED_1", "other", 0, 0),
        ...prepared,
      ],
      inventory: [],
      baseAbilities: {},
      textStrings: {},
    },
    content,
  );

const prepareChoice = (
  result: ReturnType<typeof evaluate>,
  choiceIndex: number,
) =>
  result.choices.find(
    (choice) =>
      choice.providerOccurrenceId === "prepare" && choice.index === choiceIndex,
  );

const offered = (result: ReturnType<typeof evaluate>, choiceIndex: number) =>
  prepareChoice(result, choiceIndex)
    ?.candidates.filter(({ eligible }) => eligible)
    .map(({ definitionId }) => definitionId)
    .sort();

describe("existing selects with Prepare (native CheckReplaceElem)", () => {
  it("lists only what a select with the same Prepare picked", () => {
    const result = evaluate([]);
    expect(offered(result, 0)).toEqual(["BOOK_1A", "BOOK_1B", "BOOK_5"]);
    expect(
      prepareChoice(result, 0)?.candidates.map(
        ({ definitionId }) => definitionId,
      ),
    ).not.toContain("GRANTED_1");
  });

  it("keeps a second power of a Level another choice prepared out", () => {
    const result = evaluate([pick("prep-0", "BOOK_1A", "prepare", 0, 0)]);
    expect(offered(result, 1)).toEqual(["BOOK_5"]);
    // The choice's own pick does not limit it.
    expect(offered(result, 0)).toEqual(["BOOK_1A", "BOOK_1B", "BOOK_5"]);
  });

  it("flags a saved pick Prepare rules out", () => {
    const result = evaluate([
      pick("prep-0", "BOOK_1A", "prepare", 0, 0),
      pick("prep-1", "BOOK_1B", "prepare", 0, 1),
    ]);
    expect(
      prepareChoice(result, 1)?.candidates.find(
        ({ definitionId }) => definitionId === "BOOK_1B",
      )?.reasons,
    ).toContain("prepare-level");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "choice.ineligible",
        occurrenceId: "prep-1",
      }),
    );
  });
});
