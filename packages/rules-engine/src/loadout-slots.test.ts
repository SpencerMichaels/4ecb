import { describe, expect, it } from "vitest";

import type { EquipmentSlotAssignment } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  inventorySlotCandidates,
  inventoryWieldsTwoHanded,
  legacyLoadoutHints,
  legacyLoadoutState,
  resolveLoadoutAssignments,
  type LoadoutHolding,
} from "./loadout-slots";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Record<string, string> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
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

const content = [
  entity("SWORD", "Arming sword", "Weapon", {
    "Item Slot": "One-hand",
    "Hands Required": "One-Handed",
    Properties: "Versatile",
  }),
  entity("RAZOR", "Arm blade", "Weapon", {
    "Item Slot": "Off-hand",
    "Hands Required": "One-Handed",
    Properties: "Off-hand",
    _AlternateSlot: "Arms",
  }),
  entity("BRACERS", "Iron bracers", "Magic Item", { "Item Slot": "Arms" }),
];
const byId = new Map(content.map((value) => [value.id.toLowerCase(), value]));

const holding = (
  id: string,
  definitionId: string,
  extra: Partial<LoadoutHolding> = {},
): LoadoutHolding => ({
  id,
  quantity: 1,
  equippedQuantity: 1,
  elements: [{ definitionId }],
  ...extra,
});
const slots = (
  assignments: ReadonlyMap<string, readonly EquipmentSlotAssignment[]>,
) =>
  Object.fromEntries(
    [...assignments].map(([id, value]) => [
      id,
      value.map(({ slot }) => slot).join("+"),
    ]),
  );

describe("loadout slots (D101)", () => {
  it("offers an item's _AlternateSlot beside its Item Slot", () => {
    expect(inventorySlotCandidates(holding("r", "RAZOR"), byId)).toEqual([
      "main-hand",
      "off-hand",
      "arms",
    ]);
    expect(inventorySlotCandidates(holding("s", "SWORD"), byId)).toEqual([
      "main-hand",
      "off-hand",
    ]);
  });

  it("places imported holdings where native CharLootSlot puts them", () => {
    const place = (
      inventory: readonly LoadoutHolding[],
      textStrings: Record<string, string> = {},
    ) =>
      slots(
        resolveLoadoutAssignments(
          inventory,
          byId,
          legacyLoadoutHints(textStrings),
        ).assignmentsByEntry,
      );
    // An off-hand item stays in the off hand; a one-handed one takes the
    // main hand, even listed after it.
    expect(place([holding("r", "RAZOR")])).toEqual({ r: "off-hand" });
    expect(place([holding("r", "RAZOR"), holding("s", "SWORD")])).toEqual({
      r: "off-hand",
      s: "main-hand",
    });
    // The named main-hand weapon, with no one-handed item, is the main hand.
    expect(
      place([holding("r", "RAZOR")], {
        _INTERNAL_MainHandWeapon: "Arm blade",
      }),
    ).toEqual({ r: "main-hand" });
    // Of two one-handed items, the named one takes the main hand.
    expect(
      place(
        [holding("s", "SWORD"), holding("t", "SWORD", { name: "Keen blade" })],
        { _INTERNAL_MainHandWeapon: "Keen blade" },
      ),
    ).toEqual({ s: "off-hand", t: "main-hand" });
    // The loot's _AlternateSlot flag wears it on the arms.
    expect(
      place([
        holding("s", "SWORD"),
        holding("r", "RAZOR", { overrides: { _AlternateSlot: "1" } }),
      ]),
    ).toEqual({ s: "main-hand", r: "arms" });
    // A versatile weapon used two-handed fills both hands.
    expect(
      place([holding("s", "SWORD")], {
        _INTERNAL_VersatileUsedTwoHanded: "1",
      }),
    ).toEqual({ s: "main-hand+off-hand" });
    expect(place([holding("s", "SWORD", { wieldedTwoHanded: true })])).toEqual({
      s: "main-hand+off-hand",
    });
  });

  it("lets the holding's own wielding choice and exact slots win over legacy text", () => {
    const hints = legacyLoadoutHints({ _INTERNAL_VersatileUsedTwoHanded: "1" });
    expect(
      inventoryWieldsTwoHanded(
        holding("s", "SWORD", { wieldedTwoHanded: false }),
        byId,
        hints,
      ),
    ).toBe(false);
    expect(
      inventoryWieldsTwoHanded(
        holding("s", "SWORD", {
          equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
        }),
        byId,
        hints,
      ),
    ).toBe(false);
    // Only a versatile weapon can be wielded two-handed.
    expect(
      inventoryWieldsTwoHanded(
        holding("r", "RAZOR", { wieldedTwoHanded: true }),
        byId,
      ),
    ).toBe(false);
  });

  it("derives the main hand, alternate slot and two-handed use from the loadout", () => {
    const state = legacyLoadoutState(
      [
        holding("r", "RAZOR", {
          equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
        }),
        holding("b", "BRACERS"),
      ],
      byId,
      // Stale legacy text: the explicit loadout decides.
      legacyLoadoutHints({ _INTERNAL_MainHandWeapon: "Arming sword" }),
    );
    expect(state.mainHandWeapon).toBe("Arm blade");
    expect([...state.alternateEntryIds]).toEqual([]);

    const worn = legacyLoadoutState(
      [
        holding("s", "SWORD", {
          wieldedTwoHanded: true,
          equippedSlots: [
            { slot: "main-hand", quantityIndex: 0 },
            { slot: "off-hand", quantityIndex: 0 },
          ],
        }),
        holding("r", "RAZOR", {
          equippedSlots: [{ slot: "arms", quantityIndex: 0 }],
        }),
      ],
      byId,
    );
    // A weapon in both hands is not "the main-hand weapon" (native sets
    // the text only for off-hand items).
    expect(worn.mainHandWeapon).toBeUndefined();
    expect([...worn.alternateEntryIds]).toEqual(["r"]);
    expect([...worn.twoHandedEntryIds]).toEqual(["s"]);
  });
});
