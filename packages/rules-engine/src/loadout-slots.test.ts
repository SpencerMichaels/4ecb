import { describe, expect, it } from "vitest";

import type { EquipmentSlotAssignment } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  inventoryForcedTwoHanded,
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  inventoryUnwieldableReason,
  inventoryWieldsTwoHanded,
  legacyLoadoutHints,
  legacyLoadoutState,
  loadoutContext,
  resolveLoadoutAssignments,
  type LoadoutHolding,
  type LoadoutSlotContext,
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

describe("loadout size rules (D102)", () => {
  const sized = [
    ...content,
    entity("GREAT", "Great blade", "Weapon", {
      "Item Slot": "Two-Hands",
      "Hands Required": "Two-Handed",
    }),
    entity("SMALLV", "Little spear", "Weapon", {
      "Item Slot": "One-hand",
      "Hands Required": "One-Handed",
      Properties: "Versatile, Small",
    }),
    entity("HUGE", "Large arming sword", "Weapon", {
      "Item Slot": "One-hand",
      "Hands Required": "One-Handed",
      Size: "Large",
    }),
  ];
  const sizedById = new Map(
    sized.map((value) => [value.id.toLowerCase(), value]),
  );
  const facts = (
    extra: Partial<LoadoutSlotContext> = {},
  ): LoadoutSlotContext => ({
    small: false,
    oversized: false,
    oneSizeLarger: false,
    ambidextrous: false,
    ...extra,
  });
  const small = loadoutContext({}, facts({ small: true }));

  it("holds a non-small versatile weapon in both hands for a Small character", () => {
    const sword = holding("s", "SWORD", { wieldedTwoHanded: false });
    expect(inventoryForcedTwoHanded(sword, sizedById, small)).toBe(true);
    expect(inventoryWieldsTwoHanded(sword, sizedById, small)).toBe(true);
    expect(inventoryRequiresBothHands(sword, sizedById, small)).toBe(true);
    // Imported equip counts land in both hands, and the rules see the
    // versatile weapon used two-handed.
    const state = legacyLoadoutState([holding("s", "SWORD")], sizedById, small);
    expect(slots(state.assignmentsByEntry)).toEqual({
      s: "main-hand+off-hand",
    });
    expect([...state.twoHandedEntryIds]).toEqual(["s"]);
    // A Small weapon, One Size Larger, or no size facts leave it a choice.
    expect(
      inventoryForcedTwoHanded(holding("v", "SMALLV"), sizedById, small),
    ).toBe(false);
    expect(
      inventoryForcedTwoHanded(
        sword,
        sizedById,
        loadoutContext({}, facts({ small: true, oneSizeLarger: true })),
      ),
    ).toBe(false);
    expect(inventoryRequiresBothHands(sword, sizedById)).toBe(false);
  });

  it("fills the free other hand for a weapon placed in one hand that needs both", () => {
    const placed = holding("s", "SWORD", {
      equippedSlots: [{ slot: "main-hand", quantityIndex: 0 }],
    });
    expect(
      slots(
        resolveLoadoutAssignments([placed], sizedById, small)
          .assignmentsByEntry,
      ),
    ).toEqual({ s: "main-hand+off-hand" });
    // Something else in the off hand keeps it; nothing is displaced.
    expect(
      slots(
        resolveLoadoutAssignments(
          [
            placed,
            holding("r", "RAZOR", {
              equippedSlots: [{ slot: "off-hand", quantityIndex: 0 }],
            }),
          ],
          sizedById,
          small,
        ).assignmentsByEntry,
      ),
    ).toEqual({ s: "main-hand", r: "off-hand" });
  });

  it("holds a two-handed weapon in one hand with One Size Larger", () => {
    const larger = loadoutContext({}, facts({ oneSizeLarger: true }));
    const great = holding("g", "GREAT");
    expect(inventoryRequiresBothHands(great, sizedById, larger)).toBe(false);
    expect(
      slots(
        resolveLoadoutAssignments([great], sizedById, larger)
          .assignmentsByEntry,
      ),
    ).toEqual({ g: "main-hand" });
    expect(inventoryRequiresBothHands(great, sizedById)).toBe(true);
  });

  it("leaves Ambidextrous to the rules' SLOT: matching", () => {
    const ambidextrous = loadoutContext({}, facts({ ambidextrous: true }));
    expect(
      slots(
        resolveLoadoutAssignments(
          [holding("s", "SWORD")],
          sizedById,
          ambidextrous,
        ).assignmentsByEntry,
      ),
    ).toEqual({ s: "main-hand" });
  });

  it("names weapons the character can't wield, and still places them as authored", () => {
    const great = holding("g", "GREAT");
    expect(
      inventoryUnwieldableReason(great, sizedById, small.slotContext),
    ).toBe("small");
    expect(inventoryRequiresBothHands(great, sizedById, small)).toBe(true);
    expect(
      slots(
        resolveLoadoutAssignments([great], sizedById, small).assignmentsByEntry,
      ),
    ).toEqual({ g: "main-hand+off-hand" });

    const huge = holding("h", "HUGE");
    expect(inventoryUnwieldableReason(huge, sizedById, facts())).toBe("large");
    expect(
      inventoryUnwieldableReason(huge, sizedById, facts({ oversized: true })),
    ).toBeUndefined();
    expect(
      inventoryUnwieldableReason(
        huge,
        sizedById,
        facts({ oneSizeLarger: true }),
      ),
    ).toBeUndefined();
    expect(inventoryUnwieldableReason(huge, sizedById, undefined)).toBe(
      undefined,
    );
    expect(
      inventoryUnwieldableReason(holding("s", "SWORD"), sizedById, facts()),
    ).toBeUndefined();
  });
});
