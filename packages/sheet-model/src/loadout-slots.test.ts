import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type BuildInventoryEntry,
  type CharacterBuild,
  type LegacyCharacterSnapshot,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import {
  buildEvaluatedSheetModel,
  buildSheetModel,
  resolveLoadoutAssignments,
} from ".";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>>,
): ContentEntity {
  return {
    id,
    name,
    type,
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

// Mirrors the legacy content shapes: a holy symbol authored as an Off-hand
// item and a two-handed weapon authored for Two-Hands.
const symbol = entity("SYNTH_SYMBOL", "Synthetic Symbol +1", "Magic Item", {
  "Magic Item Type": "Holy Symbol",
  "Item Slot": "Off-hand",
});
const greatblade = entity(
  "SYNTH_GREATBLADE",
  "Synthetic Greatblade",
  "Weapon",
  {
    "Hands Required": "Two-Handed",
    "Item Slot": "Two-Hands",
  },
);
const content = [symbol, greatblade];
const byId = new Map(
  content.map((item) => [item.id.toLocaleLowerCase(), item]),
);

/** An imported legacy holding: an equip count but no modern slots. */
function holding(id: string, item: ContentEntity): BuildInventoryEntry {
  return {
    id,
    acquiredLevel: 1,
    quantity: 1,
    equippedQuantity: 1,
    elements: [{ definitionId: item.id, name: item.name, type: item.type }],
    overrides: {},
    legality: "rules-legal",
  };
}

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

function build(inventory: readonly BuildInventoryEntry[]): CharacterBuild {
  return {
    formatVersion: 3,
    known: [],
    effectiveLevel: 1,
    levels: [],
    grabbag: [],
    inventory: [...inventory],
    alternates: [],
    baseAbilities: {},
    textStrings: {},
  };
}

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

function sheetSlots(characterBuild: CharacterBuild) {
  return Object.fromEntries(
    (
      buildEvaluatedSheetModel(snapshot, characterBuild, evaluation, content)
        .overview?.inventory ?? []
    ).map(({ name, slots }) => [name, slots]),
  );
}

function builderSlots(characterBuild: CharacterBuild) {
  const resolved = resolveLoadoutAssignments(characterBuild.inventory, byId);
  return Object.fromEntries(
    characterBuild.inventory.map((entry) => [
      entry.elements[0]!.name,
      resolved.assignmentsByEntry.get(entry.id)?.map(({ slot }) => slot) ?? [],
    ]),
  );
}

describe("shared loadout slot resolution", () => {
  it("places an imported holy symbol and two-handed weapon without overlap", () => {
    const imported = build([
      holding("symbol", symbol),
      holding("greatblade", greatblade),
    ]);
    const expected = {
      "Synthetic Symbol +1": ["symbol"],
      "Synthetic Greatblade": ["main-hand", "off-hand"],
    };
    expect(builderSlots(imported)).toEqual(expected);
    // The sheet projects the same resolved slots instead of falling back to
    // the symbol's authored Off-hand slot.
    expect(sheetSlots(imported)).toEqual(expected);
  });

  it("keeps explicit modern assignments on both surfaces", () => {
    const explicit = build([
      {
        ...holding("symbol", symbol),
        equippedSlots: [{ slot: "off-hand", quantityIndex: 0 }],
      },
      {
        ...holding("greatblade", greatblade),
        equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
      },
    ]);
    const expected = {
      "Synthetic Symbol +1": ["off-hand"],
      "Synthetic Greatblade": ["main-hand"],
    };
    expect(builderSlots(explicit)).toEqual(expected);
    expect(sheetSlots(explicit)).toEqual(expected);
  });

  it("follows a loadout edit and survives a save/reload round trip", () => {
    const imported = build([
      holding("symbol", symbol),
      holding("greatblade", greatblade),
    ]);
    // Moving the symbol into the off hand displaces the two-handed weapon.
    const edited = applyCharacterCommand(
      applyCharacterCommand(imported, {
        kind: "equip-inventory",
        entryId: "greatblade",
        assignments: [],
      }),
      {
        kind: "equip-inventory",
        entryId: "symbol",
        assignments: [{ slot: "off-hand", quantityIndex: 0 }],
      },
    );
    const expected = {
      "Synthetic Symbol +1": ["off-hand"],
      "Synthetic Greatblade": [],
    };
    expect(builderSlots(edited)).toEqual(expected);
    expect(sheetSlots(edited)).toEqual(expected);

    const reloaded = JSON.parse(JSON.stringify(edited)) as CharacterBuild;
    expect(builderSlots(reloaded)).toEqual(expected);
    expect(sheetSlots(reloaded)).toEqual(expected);
  });

  it("resolves legacy-snapshot loot with the same resolver", () => {
    const model = buildSheetModel(
      {
        ...snapshot,
        loot: [symbol, greatblade].map((item) => ({
          name: item.name,
          count: 1,
          equippedCount: 1,
          showPowerCard: false,
          elements: [{ id: item.id, name: item.name, type: item.type }],
        })),
      },
      content,
    );
    expect(
      Object.fromEntries(
        (model.overview?.inventory ?? []).map(({ name, slots }) => [
          name,
          slots,
        ]),
      ),
    ).toEqual({
      "Synthetic Symbol +1": ["symbol"],
      "Synthetic Greatblade": ["main-hand", "off-hand"],
    });
  });
});
