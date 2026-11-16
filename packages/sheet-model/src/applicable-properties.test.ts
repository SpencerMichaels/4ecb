import { describe, expect, it } from "vitest";

import type {
  BuildInventoryEntry,
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import {
  RESOURCE_CLAUSES_FIELD,
  RESOURCE_CLAUSES_VERSION,
  type ContentEntity,
  type ResourceClause,
} from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { buildEvaluatedSheetModel, sheetItemCard } from ".";
import {
  missingClauseResources,
  withoutInapplicableClauses,
} from "./applicable-properties";

const BOOTS_PROPERTY =
  "You gain a +1 item bonus to Reflex. You can spend 1 power point as a free action during your turn to increase the bonus to +3 until the end of your next turn.";
const ARMOR_PROPERTY =
  "While you have at least 1 power point, you gain a +1 item bonus to speed.";

function item(
  id: string,
  name: string,
  properties: readonly string[],
  clauses: readonly ResourceClause[],
): ContentEntity {
  const fields = [
    ["Magic Item Type", "Wondrous"],
    ...properties.map((value) => ["Property", value] as const),
    [
      RESOURCE_CLAUSES_FIELD,
      JSON.stringify({ version: RESOURCE_CLAUSES_VERSION, clauses }),
    ],
  ] as const;
  return {
    id,
    name,
    type: "Magic Item",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: fields.map(([field, value], ordinal) => ({
      name: field,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

// As the pack build stores them (legacy-wotc resource-clauses.ts).
const boots = item(
  "ID_TEST_BOOTS",
  "Boots of Resolute Reflexes",
  [BOOTS_PROPERTY, "Your speed is 6."],
  [
    {
      field: "Property",
      occurrence: 1,
      text: "You can spend 1 power point as a free action during your turn to increase the bonus to +3 until the end of your next turn.",
      resource: "power-points",
    },
  ],
);
const armor = item(
  "ID_TEST_ARMOR",
  "Quicksilver Armor +1",
  [ARMOR_PROPERTY],
  [
    {
      field: "Property",
      occurrence: 1,
      text: ARMOR_PROPERTY,
      resource: "power-points",
    },
  ],
);

const properties = (entity: ContentEntity) =>
  entity.specifics
    .filter(({ name }) => name === "Property")
    .map(({ value }) => value);

describe("inapplicable item properties", () => {
  it("names the resources a character lacks", () => {
    expect([
      ...missingClauseResources({ powerPoints: undefined, powers: [] }),
    ]).toEqual(["power-points", "channel-divinity"]);
    expect([
      ...missingClauseResources({
        powerPoints: "4",
        powers: [{ sharedUsage: "Channel Divinity" }],
      }),
    ]).toEqual([]);
    expect([
      ...missingClauseResources({ powerPoints: "0", powers: [{}] }),
    ]).toEqual(["power-points", "channel-divinity"]);
  });

  it("drops only the stored sentences of a missing resource", () => {
    expect(
      properties(withoutInapplicableClauses(boots, new Set(["power-points"]))),
    ).toEqual(["You gain a +1 item bonus to Reflex.", "Your speed is 6."]);
    expect(
      properties(
        withoutInapplicableClauses(boots, new Set(["channel-divinity"])),
      ),
    ).toEqual([BOOTS_PROPERTY, "Your speed is 6."]);
    expect(
      properties(withoutInapplicableClauses(armor, new Set(["power-points"]))),
    ).toEqual([""]);
    // A field rewritten after the pack build keeps its text.
    const rewritten = {
      ...armor,
      specifics: armor.specifics.map((field) =>
        field.name === "Property"
          ? { ...field, value: "You gain a +1 item bonus to speed." }
          : field,
      ),
    };
    expect(
      properties(
        withoutInapplicableClauses(rewritten, new Set(["power-points"])),
      ),
    ).toEqual(["You gain a +1 item bonus to speed."]);
  });

  it("leaves an emptied Property off the item card", () => {
    const card = sheetItemCard({
      name: armor.name,
      entities: [armor],
      missingResources: new Set(["power-points"]),
    });
    expect(card.fields.some(({ label }) => label === "Property")).toBe(false);
    expect(
      sheetItemCard({ name: armor.name, entities: [armor] }).fields,
    ).toContainEqual({ label: "Property", value: ARMOR_PROPERTY });
  });

  describe("on the evaluated sheet", () => {
    const holding = (entity: ContentEntity): BuildInventoryEntry => ({
      id: `holding:${entity.id}`,
      acquiredLevel: 1,
      quantity: 1,
      equippedQuantity: 1,
      elements: [
        { definitionId: entity.id, name: entity.name, type: entity.type },
      ],
      overrides: {},
      legality: "rules-legal",
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
      formatVersion: 3,
      known: [],
      effectiveLevel: 1,
      levels: [],
      grabbag: [],
      inventory: [holding(armor)],
      alternates: [],
      baseAbilities: {},
      textStrings: {},
    };
    const evaluation = (
      stats: Record<string, { name: string; value: number; contributions: [] }>,
    ) =>
      ({
        level: 1,
        converged: true,
        iterations: 1,
        complete: true,
        legal: true,
        occurrences: [],
        activeDefinitionIds: [],
        activeDefinitions: [],
        choices: [],
        stats,
        overlays: [],
        suggestions: [],
        textStrings: {},
        textContributions: [],
        diagnostics: [],
        powers: [],
      }) as unknown as EvaluatedCharacter;
    const property = (
      stats: Record<string, { name: string; value: number; contributions: [] }>,
      hideInapplicableItemProperties?: boolean,
    ) =>
      buildEvaluatedSheetModel(snapshot, build, evaluation(stats), [armor], {
        ...(hideInapplicableItemProperties === undefined
          ? {}
          : { hideInapplicableItemProperties }),
      }).items[0]?.fields.find(({ label }) => label === "Property")?.value;

    it("hides a power-point property only when asked and without a pool", () => {
      expect(property({}, true)).toBeUndefined();
      expect(property({})).toBe(ARMOR_PROPERTY);
      expect(property({}, false)).toBe(ARMOR_PROPERTY);
      expect(
        property(
          {
            "Power Points": {
              name: "Power Points",
              value: 4,
              contributions: [],
            },
          },
          true,
        ),
      ).toBe(ARMOR_PROPERTY);
    });
  });
});
