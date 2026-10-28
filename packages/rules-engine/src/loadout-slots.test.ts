import { describe, expect, it } from "vitest";

import type { EquipmentSlotAssignment } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import {
  inventoryForcedTwoHanded,
  inventoryRequiresBothHands,
  inventorySlotCandidates,
  inventoryUnwieldableReason,
  inventoryWieldsTwoHanded,
  inventoryWornSymbolEntryId,
  legacyEquipCount,
  legacyLoadoutHints,
  legacyLoadoutState,
  loadoutContext,
  loadoutRingSlotCount,
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

describe("loadout ring slots (native SlotManip)", () => {
  const rings = ["RING_A", "RING_B", "RING_C", "RING_D"].map((id) =>
    entity(id, `Ring of ${id}`, "Magic Item", {
      "Magic Item Type": "Ring",
      "Item Slot": "Ring",
    }),
  );
  const ringsById = new Map(
    rings.map((value) => [value.id.toLowerCase(), value]),
  );
  const facts = (ringSlots?: number): LoadoutSlotContext => ({
    small: false,
    oversized: false,
    oneSizeLarger: false,
    ambidextrous: false,
    ...(ringSlots === undefined ? {} : { ringSlots }),
  });
  const worn = rings.map((ring, index) => holding(`r${index}`, ring.id));

  it("offers as many ring slots as the Ring Slots stat, two without it", () => {
    expect(inventorySlotCandidates(worn[0]!, ringsById)).toEqual([
      "ring-1",
      "ring-2",
    ]);
    expect(inventorySlotCandidates(worn[0]!, ringsById, facts(3))).toEqual([
      "ring-1",
      "ring-2",
      "ring-3",
    ]);
    expect(loadoutRingSlotCount(facts(9))).toBe(4);
    // A ring already worn in the third slot keeps it offered.
    expect(
      loadoutRingSlotCount(facts(2), [
        { equippedSlots: [{ slot: "ring-3", quantityIndex: 0 }] },
      ]),
    ).toBe(3);
  });

  it("places imported equipped rings up to the character's ring slots", () => {
    expect(
      slots(
        resolveLoadoutAssignments(worn, ringsById, loadoutContext({}, facts()))
          .assignmentsByEntry,
      ),
    ).toEqual({ r0: "ring-1", r1: "ring-2" });
    expect(
      slots(
        resolveLoadoutAssignments(worn, ringsById, loadoutContext({}, facts(3)))
          .assignmentsByEntry,
      ),
    ).toEqual({ r0: "ring-1", r1: "ring-2", r2: "ring-3" });
  });
});

describe("holy symbol slot (native HolySymbolLootSlot)", () => {
  const records = [
    entity("GEAR_SYMBOL", "Holy Symbol", "Gear", {
      Category: "Gear",
      "Item Slot": "Off-hand",
    }),
    entity("BEACON", "Beacon of Erathis +1", "Magic Item", {
      "Magic Item Type": "Holy Symbol",
      "Item Slot": "Off-hand",
    }),
    entity("ORB", "Orb of Light", "Magic Item", {
      "Magic Item Type": "Artifact",
      "Item Slot": "Off-hand",
      _ImplementEquiv: "Holy Symbol",
    }),
    entity("MACE", "Mace", "Weapon", {
      "Item Slot": "One-hand",
      "Hands Required": "One-Handed",
    }),
    entity("DISRUPTING", "Disrupting Weapon +2", "Magic Item", {
      "Magic Item Type": "Weapon",
      Weapon: "Flail, Hammer, Mace",
      "Item Slot": "",
      _ImplementEquiv: "Holy Symbol",
    }),
  ];
  const symbolsById = new Map(
    records.map((value) => [value.id.toLowerCase(), value]),
  );
  const symbolHolding = (
    id: string,
    definitionIds: readonly string[],
    extra: Partial<LoadoutHolding> = {},
  ): LoadoutHolding => ({
    id,
    quantity: 1,
    equippedQuantity: 0,
    elements: definitionIds.map((definitionId) => ({ definitionId })),
    ...extra,
  });

  it("offers holy symbols and _ImplementEquiv Holy Symbol bases, not weapon enchantments", () => {
    const offers = (definitionIds: readonly string[]) =>
      inventorySlotCandidates(
        symbolHolding("x", definitionIds),
        symbolsById,
      ).includes("symbol");
    expect(offers(["GEAR_SYMBOL"])).toBe(true);
    expect(offers(["BEACON"])).toBe(true);
    expect(offers(["ORB"])).toBe(true);
    // IsItemCandidate reads the loot base: a Disrupting mace's base is the
    // mace, whose own _ImplementEquiv is empty.
    expect(offers(["MACE", "DISRUPTING"])).toBe(false);
  });

  it("wears the _INTERNAL_EquippedSymbol holding there, beside any hand it is equipped in", () => {
    const hints = legacyLoadoutHints({
      _INTERNAL_EquippedSymbol: "\n  Beacon of Erathis +1\n",
    });
    expect(hints.equippedSymbol).toBe("Beacon of Erathis +1");
    // Unequipped (native equip-count 0): only the symbol slot.
    const beacon = symbolHolding("beacon", ["BEACON"]);
    expect(
      slots(
        resolveLoadoutAssignments([beacon], symbolsById, hints)
          .assignmentsByEntry,
      ),
    ).toEqual({ beacon: "symbol" });
    // An equip count stays in a hand, as native CharLootSlot shows it.
    expect(
      slots(
        resolveLoadoutAssignments(
          [{ ...beacon, equippedQuantity: 1 }],
          symbolsById,
          hints,
        ).assignmentsByEntry,
      ),
    ).toEqual({ beacon: "off-hand+symbol" });
    expect(
      slots(
        resolveLoadoutAssignments(
          [{ ...beacon, equippedQuantity: 1 }],
          symbolsById,
          {},
        ).assignmentsByEntry,
      ),
    ).toEqual({ beacon: "off-hand" });
    const state = legacyLoadoutState([beacon], symbolsById, hints);
    expect(state.symbolEntryId).toBe("beacon");
    expect(state.equippedSymbol).toBe("Beacon of Erathis +1");
    expect(inventoryWornSymbolEntryId([beacon], symbolsById, hints)).toBe(
      "beacon",
    );
  });

  it("keeps the holy symbol slot out of the native equip count", () => {
    const placed = symbolHolding("orb", ["ORB"], {
      equippedQuantity: 1,
      equippedSlots: [{ slot: "symbol", quantityIndex: 0 }],
    });
    expect(legacyEquipCount(placed)).toBe(0);
    expect(
      legacyEquipCount({
        ...placed,
        equippedSlots: [
          { slot: "symbol", quantityIndex: 0 },
          { slot: "off-hand", quantityIndex: 0 },
        ],
      }),
    ).toBe(1);
    // An exact placement wins over the imported text string.
    const other = symbolHolding("beacon", ["BEACON"]);
    expect(
      inventoryWornSymbolEntryId(
        [placed, other],
        symbolsById,
        legacyLoadoutHints({
          _INTERNAL_EquippedSymbol: "Beacon of Erathis +1",
        }),
      ),
    ).toBe("orb");
  });
});
