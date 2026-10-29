import { describe, expect, it } from "vitest";

import type {
  BuildInventoryEntry,
  CharacterBuild,
  LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { buildEvaluatedSheetModel } from ".";
import {
  contentReferenceFinder,
  inventoryPackageGroups,
  inventoryPackagePair,
  packageSplit,
} from "./inventory-packages";

function entity(
  id: string,
  name: string,
  specifics: Readonly<Record<string, string>>,
): ContentEntity {
  return {
    id,
    name,
    type: "Gear",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([field, value], ordinal) => ({
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

// The content's own spelling: Arrows (count 30) and Arrow (count 1) name
// each other by internal ID.
const arrows = entity("ID_FMP_GEAR_11", "Arrows", {
  Weight: "3",
  Gold: "1",
  Category: "Ammunition",
  _RelatedElement: "ID_FMP_GEAR_58",
  count: "30",
});
const arrow = entity("ID_FMP_GEAR_58", "Arrow", {
  Weight: ".1",
  Copper: "4",
  Category: "Ammunition",
  _RelatedElement: "ID_FMP_GEAR_11",
  count: "1",
});
const rope = entity("ID_FMP_GEAR_18", "Hempen Rope (50 ft.)", {
  Weight: "10",
  count: "1",
});
const content = [arrows, arrow, rope];
const byId = new Map(
  content.map((item) => [item.id.toLocaleLowerCase(), item]),
);
const find = contentReferenceFinder(byId);
const resolve = (id: string) => byId.get(id.toLocaleLowerCase());

function holding(item: ContentEntity, quantity: number): BuildInventoryEntry {
  return {
    id: `holding:${item.id}`,
    acquiredLevel: 1,
    quantity,
    equippedQuantity: 0,
    elements: [{ definitionId: item.id, name: item.name, type: item.type }],
    overrides: {},
    legality: "rules-legal",
  };
}

describe("packaged gear pairs", () => {
  it("pairs a package with its single item by ID or name", () => {
    expect(inventoryPackagePair(arrow, find)).toMatchObject({
      single: arrow,
      singleLot: 1,
      pack: arrows,
      packLot: 30,
    });
    const byName = entity("SYNTH_BOLT", "Bolt", {
      _RelatedElement: "Arrows",
      count: "1",
    });
    expect(inventoryPackagePair(byName, find)?.pack).toBe(arrows);
    expect(inventoryPackagePair(rope, find)).toBeUndefined();
    expect(packageSplit(inventoryPackagePair(arrow, find)!, 65)).toEqual({
      packs: 2,
      singles: 5,
    });
  });

  it("groups both holdings and counts their units", () => {
    const inventory = [holding(arrows, 1), holding(arrow, 5), holding(rope, 1)];
    const groups = inventoryPackageGroups(inventory, resolve, find);
    expect(groups.get(inventory[0]!.id)).toMatchObject({
      units: 35,
      name: "Arrows",
      representative: inventory[0],
    });
    expect(groups.get(inventory[1]!.id)).toBe(groups.get(inventory[0]!.id));
    expect(groups.has(inventory[2]!.id)).toBe(false);
  });
});

describe("evaluated sheet inventory", () => {
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
    inventory: [holding(arrow, 5), holding(arrows, 1), holding(rope, 1)],
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  };
  const evaluation = {
    level: 1,
    converged: true,
    iterations: 1,
    complete: true,
    legal: true,
    occurrences: [],
    activeDefinitionIds: [],
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
  const model = buildEvaluatedSheetModel(snapshot, build, evaluation, content);

  it("lists a package pair as one row of its total units", () => {
    expect(
      (model.overview?.inventory ?? []).map(({ name, quantity, weight }) => [
        name,
        quantity,
        weight,
      ]),
    ).toEqual([
      // Weight from each record: the 3 lb quiver, and 5 arrows at .1 lb,
      // which native field parsing reads as 0.
      ["Arrows", 35, 3],
      ["Hempen Rope (50 ft.)", 1, 10],
    ]);
    expect(model.equipment).toEqual([
      { label: "Arrows", value: "× 35" },
      { label: "Hempen Rope (50 ft.)", value: "× 1" },
    ]);
    expect(model.items.map(({ name }) => name)).toEqual([
      "Arrows",
      "Hempen Rope (50 ft.)",
    ]);
  });
});
