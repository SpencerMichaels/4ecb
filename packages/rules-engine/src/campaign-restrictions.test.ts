import { describe, expect, it } from "vitest";

import type { CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

import {
  evaluateCharacter,
  type CharacterOccurrence,
  type EvaluationInput,
} from "./evaluator";
import { previewProfileMigration } from "./profile-migration";

// Campaign restrictions (D116): the engine receives restricted definition
// IDs; it knows nothing of campaign documents.

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
  options: {
    prerequisites?: string;
    rules?: RuleStatement[];
    specifics?: Record<string, string>;
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic campaign fixture",
    sources: ["Synthetic campaign fixture"],
    attributes: [],
    categories: [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([fieldName, value], ordinal) => ({
        name: fieldName,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "campaign", sourceOrdinal: 0 },
    ...(options.prerequisites === undefined
      ? {}
      : { prerequisites: options.prerequisites }),
  };
}

const definitions = [
  entity("ROOT", "1", "Level", {
    rules: [
      rule("select", { type: "Deity", optional: "true" }, 0),
      rule("select", { type: "Feat", optional: "true" }, 1),
    ],
  }),
  entity("ID_FMP_DEITY_9", "Moradin", "Deity", {
    specifics: { Domains: "ID_DOMAIN_EARTH" },
  }),
  entity("ID_TORAG", "Torag", "Deity", {
    specifics: { Domains: "ID_DOMAIN_PROTECTION" },
    rules: [
      rule(
        "grant",
        { name: "ID_INTERNAL_COUNTSASDEITY_MORADIN", type: "CountsAsDeity" },
        0,
      ),
    ],
  }),
  entity("ID_INTERNAL_COUNTSASDEITY_MORADIN", "Moradin", "CountsAsDeity", {
    specifics: { _SupportsID: "ID_FMP_DEITY_9" },
  }),
  entity("ID_DOMAIN_EARTH", "Earth", "Domain"),
  entity("ID_DOMAIN_PROTECTION", "Protection", "Domain"),
  entity("ID_MORADINS_FEAT", "Moradin's Synthetic Blessing", "Feat", {
    prerequisites: "must worship Moradin",
  }),
];

const rootOccurrence: CharacterOccurrence = {
  id: "root",
  definitionId: "ROOT",
  acquiredLevel: 1,
  kind: "root",
};

function deityPick(definitionId: string): CharacterOccurrence {
  return {
    id: "selected-deity",
    definitionId,
    acquiredLevel: 1,
    parentId: "root",
    ruleOrdinal: 0,
    choiceIndex: 0,
    kind: "choice",
  };
}

function evaluate(
  occurrences: readonly CharacterOccurrence[],
  restrictedDefinitionIds?: readonly string[],
) {
  const input: EvaluationInput = {
    level: 1,
    baseAbilities: {},
    occurrences: [rootOccurrence, ...occurrences],
    inventory: [],
    ...(restrictedDefinitionIds === undefined
      ? {}
      : { restrictedDefinitionIds }),
  };
  return evaluateCharacter(input, definitions);
}

function candidate(
  result: Pick<ReturnType<typeof evaluate>, "choices">,
  type: string,
  definitionId: string,
) {
  return result.choices
    .find((choice) => choice.type === type)
    ?.candidates.find((decision) => decision.definitionId === definitionId);
}

describe("campaign restrictions (D116)", () => {
  it("does not offer a restricted deity, matching its ID case-insensitively", () => {
    const result = evaluate([], ["id_fmp_deity_9"]);
    expect(candidate(result, "Deity", "ID_FMP_DEITY_9")).toMatchObject({
      eligible: false,
      sourceEntitled: false,
      rulesLegal: true,
      reasons: ["campaign-restricted"],
    });
    expect(candidate(result, "Deity", "ID_TORAG")).toMatchObject({
      eligible: true,
      sourceEntitled: true,
      reasons: [],
    });
  });

  it("still resolves a restricted deity's name for a worship prerequisite", () => {
    // Moradin is restricted, but "must worship Moradin" still names it, and
    // Torag's CountsAsDeity Moradin meets it.
    const throughTorag = evaluate([deityPick("ID_TORAG")], ["ID_FMP_DEITY_9"]);
    expect(candidate(throughTorag, "Feat", "ID_MORADINS_FEAT")).toMatchObject({
      eligible: true,
      sourceEntitled: true,
      rulesLegal: true,
    });
    expect(throughTorag.legal).toBe(true);
    expect(throughTorag.diagnostics.map(({ code }) => code)).not.toContain(
      "occurrence.campaign-restricted",
    );

    const withoutDeity = evaluate([], ["ID_FMP_DEITY_9"]);
    expect(candidate(withoutDeity, "Feat", "ID_MORADINS_FEAT")).toMatchObject({
      sourceEntitled: true,
      rulesLegal: false,
    });
  });

  it("flags an existing pick of a restricted deity and makes the character not legal", () => {
    const unrestricted = evaluate([deityPick("ID_FMP_DEITY_9")]);
    expect(unrestricted.legal).toBe(true);

    const restricted = evaluate(
      [deityPick("ID_FMP_DEITY_9")],
      ["ID_FMP_DEITY_9"],
    );
    expect(
      restricted.diagnostics.filter(
        ({ code }) => code === "occurrence.campaign-restricted",
      ),
    ).toEqual([
      expect.objectContaining({
        severity: "warning",
        occurrenceId: "selected-deity",
      }),
    ]);
    expect(restricted.legal).toBe(false);
    // The warning speaks for the pick: no second "not eligible" error.
    expect(restricted.diagnostics.map(({ code }) => code)).not.toContain(
      "choice.ineligible",
    );
    // The pick stays owned: the issue is the player's to resolve.
    expect(restricted.occurrences.map(({ id }) => id)).toContain(
      "selected-deity",
    );
  });

  it("flags a held restricted item on its holding and does not offer it", () => {
    const items = [
      entity("ROOT", "1", "Level", {
        rules: [rule("select", { type: "Magic Item", optional: "true" }, 0)],
      }),
      entity("ID_STOCK_SWORD", "Stock Sword", "Magic Item", {
        specifics: { "Magic Item Type": "Weapon", "Item Slot": "Main Hand" },
      }),
      entity("ID_CAMPAIGN_SWORD", "Campaign Sword", "Magic Item", {
        specifics: { "Magic Item Type": "Weapon", "Item Slot": "Main Hand" },
      }),
    ];
    const evaluateItems = (
      equippedQuantity: number,
      restrictedDefinitionIds?: readonly string[],
    ) =>
      evaluateCharacter(
        {
          level: 1,
          baseAbilities: {},
          occurrences: [rootOccurrence],
          inventory: [
            {
              id: "holding",
              definitionIds: ["ID_STOCK_SWORD"],
              quantity: 1,
              equippedQuantity,
              acquiredLevel: 1,
            },
          ],
          ...(restrictedDefinitionIds === undefined
            ? {}
            : { restrictedDefinitionIds }),
        },
        items,
      );

    expect(evaluateItems(0).legal).toBe(true);
    for (const equipped of [0, 1]) {
      const restricted = evaluateItems(equipped, ["ID_STOCK_SWORD"]);
      // One issue, on the holding (as item.requirement-unmet targets it),
      // equipped or not.
      expect(
        restricted.diagnostics.filter(({ code }) =>
          code.endsWith("campaign-restricted"),
        ),
      ).toEqual([
        expect.objectContaining({
          severity: "warning",
          code: "item.campaign-restricted",
          occurrenceId: "holding:definition:0",
        }),
      ]);
      expect(restricted.legal).toBe(false);
      expect(
        candidate(restricted, "Magic Item", "ID_STOCK_SWORD"),
      ).toMatchObject({
        eligible: false,
        sourceEntitled: false,
        // An equipped one also reads "owned".
        reasons: expect.arrayContaining(["campaign-restricted"]),
      });
      expect(
        candidate(restricted, "Magic Item", "ID_CAMPAIGN_SWORD"),
      ).toMatchObject({ eligible: true });
    }
  });

  it("restricts nothing with an empty list", () => {
    const pick = [deityPick("ID_FMP_DEITY_9")];
    expect(evaluate(pick, [])).toEqual(evaluate(pick));
  });

  it("applies each side's restrictions in a migration preview", () => {
    const build: CharacterBuild = {
      formatVersion: 3,
      known: [],
      effectiveLevel: 1,
      levels: [
        {
          level: 1,
          root: {
            id: "root",
            identity: { definitionId: "ROOT", name: "1", type: "Level" },
            acquiredLevel: 1,
            legality: "rules-legal",
            unresolved: false,
            children: [
              {
                id: "selected-deity",
                identity: {
                  definitionId: "ID_FMP_DEITY_9",
                  name: "Moradin",
                  type: "Deity",
                },
                acquiredLevel: 1,
                legality: "rules-legal",
                unresolved: false,
                children: [],
              },
            ],
          },
        },
      ],
      grabbag: [],
      inventory: [],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };
    const intoCampaign = previewProfileMigration(
      build,
      definitions,
      definitions,
      { targetRestrictedDefinitionIds: ["ID_FMP_DEITY_9"] },
    );
    expect(intoCampaign.source).toMatchObject({ legal: true });
    expect(intoCampaign.target).toMatchObject({ legal: false });
    expect(intoCampaign.newDiagnosticCodes).toContain(
      "occurrence.campaign-restricted",
    );
    expect(intoCampaign.targetDiagnostics).toContainEqual(
      expect.objectContaining({ code: "occurrence.campaign-restricted" }),
    );
    expect(intoCampaign.restrictedSelections).toEqual([
      {
        occurrenceId: "selected-deity",
        kind: "selection",
        name: "Moradin",
        type: "Deity",
      },
    ]);
    // A held item is named by its holding.
    const withSword = [
      ...definitions,
      entity("ID_STOCK_SWORD", "Stock Sword", "Magic Item"),
    ];
    expect(
      previewProfileMigration(
        {
          ...build,
          inventory: [
            {
              id: "holding",
              name: "Grandfather's Sword",
              acquiredLevel: 1,
              quantity: 1,
              equippedQuantity: 0,
              elements: [
                {
                  definitionId: "ID_STOCK_SWORD",
                  name: "Stock Sword",
                  type: "Magic Item",
                },
              ],
              overrides: {},
              legality: "rules-legal",
            },
          ],
        },
        withSword,
        withSword,
        { targetRestrictedDefinitionIds: ["ID_STOCK_SWORD"] },
      ).restrictedSelections,
    ).toEqual([
      {
        occurrenceId: "holding:definition:0",
        kind: "holding",
        name: "Grandfather's Sword",
        type: "Magic Item",
      },
    ]);
    // Already restricted before: nothing new to list.
    expect(
      previewProfileMigration(build, definitions, definitions, {
        sourceRestrictedDefinitionIds: ["ID_FMP_DEITY_9"],
        targetRestrictedDefinitionIds: ["ID_FMP_DEITY_9"],
      }).restrictedSelections,
    ).toEqual([]);

    const outOfCampaign = previewProfileMigration(
      build,
      definitions,
      definitions,
      { sourceRestrictedDefinitionIds: ["ID_FMP_DEITY_9"] },
    );
    expect(outOfCampaign.source).toMatchObject({ legal: false });
    expect(outOfCampaign.target).toMatchObject({ legal: true });
    expect(outOfCampaign.resolvedDiagnosticCodes).toContain(
      "occurrence.campaign-restricted",
    );
  });
});
