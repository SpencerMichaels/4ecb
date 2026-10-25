import { describe, expect, it } from "vitest";

import {
  applyCharacterCommand,
  type BuildInventoryEntry,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { freebeeGiftCommand } from "./freebee-gifts";

function entity(
  id: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
): ContentEntity {
  return {
    id,
    name: id,
    type,
    source: "Public fixture",
    sources: ["Public fixture"],
    attributes: [],
    categories: [],
    description: "",
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    extensions: [],
    provenance: { sourceKey: "public-freebees", sourceOrdinal: 0 },
  };
}

const content = [
  entity("BOOK", "Gear"),
  entity("FIST", "Weapon", {
    "Item Slot": "Off-hand",
    "Hands Required": "One-Handed",
  }),
  entity("BLADE", "Weapon", {
    "Item Slot": "One-hand",
    "Hands Required": "One-Handed",
  }),
  entity("SWORD", "Weapon", {
    "Item Slot": "One-hand",
    "Hands Required": "One-Handed",
  }),
  entity("RITE", "Ritual"),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));

const build: CharacterBuild = {
  formatVersion: 3,
  effectiveLevel: 3,
  levels: [],
  grabbag: [],
  inventory: [],
  known: [],
  alternates: [],
  baseAbilities: {},
  textStrings: {},
};

function evaluation(
  targets: readonly string[],
): Pick<EvaluatedCharacter, "level" | "occurrences" | "stats"> {
  return {
    level: 3,
    occurrences: [
      {
        id: "feature",
        definitionId: "FEATURE",
        acquiredLevel: 2,
        kind: "choice",
      },
    ],
    stats: Object.fromEntries(
      targets.map((target) => [
        `freebee:${target}`.toLowerCase(),
        {
          name: `FREEBEE:${target}`,
          value: 1,
          contributions: [
            {
              id: target,
              stat: `FREEBEE:${target}`,
              value: "+1",
              providerId: "feature",
              providerName: "Feature",
              applied: true,
            },
          ],
        },
      ]),
    ),
  };
}

const sword: BuildInventoryEntry = {
  id: "sword",
  acquiredLevel: 1,
  quantity: 1,
  equippedQuantity: 1,
  equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
  elements: [{ definitionId: "SWORD", name: "SWORD", type: "Weapon" }],
  overrides: {},
  legality: "rules-legal",
};

describe("free item gifts", () => {
  it("gives physical gifts once, equipping slotted ones into free slots", () => {
    const equipped = { ...build, inventory: [sword] };
    const command = freebeeGiftCommand(
      equipped,
      evaluation(["BOOK", "FIST", "BLADE", "RITE"]),
      byId,
    );
    expect(command?.kind).toBe("give-freebees");
    const given = applyCharacterCommand(equipped, command!);
    expect(
      given.inventory.map(({ id, acquiredLevel, equippedSlots }) => ({
        id,
        acquiredLevel,
        slots: equippedSlots?.map(({ slot }) => slot) ?? [],
      })),
    ).toEqual([
      { id: "sword", acquiredLevel: 1, slots: ["main-hand"] },
      { id: "web:freebee:BOOK", acquiredLevel: 2, slots: [] },
      // The authored off-hand slot is preferred.
      { id: "web:freebee:FIST", acquiredLevel: 2, slots: ["off-hand"] },
      // Both hands are taken; the gift is not equipped over them.
      { id: "web:freebee:BLADE", acquiredLevel: 2, slots: [] },
    ]);
    expect(given.textStrings).toEqual({
      BOOK: "Given",
      FIST: "Given",
      BLADE: "Given",
    });
    // Evaluating again gives nothing, and a removed gift isn't re-added.
    expect(
      freebeeGiftCommand(given, evaluation(["BOOK", "FIST", "BLADE"]), byId),
    ).toBeUndefined();
    const dropped = applyCharacterCommand(given, {
      kind: "remove-inventory",
      entryId: "web:freebee:BOOK",
    });
    expect(
      freebeeGiftCommand(dropped, evaluation(["BOOK"]), byId),
    ).toBeUndefined();
  });

  it("only marks a gift the character already owns", () => {
    const owning = {
      ...build,
      inventory: [{ ...sword, equippedQuantity: 0, equippedSlots: [] }],
    };
    expect(freebeeGiftCommand(owning, evaluation(["SWORD"]), byId)).toEqual({
      kind: "give-freebees",
      gifts: [{ marker: "SWORD" }],
    });
    expect(freebeeGiftCommand(build, evaluation([]), byId)).toBeUndefined();
  });
});
