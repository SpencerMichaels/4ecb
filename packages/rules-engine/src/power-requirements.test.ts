import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import { EXCEPTION_IDS, meetsItemRequirement } from "./exceptions";
import {
  isPowerRestricted,
  wieldingClauses,
  type PowerRequirementContext,
} from "./power-requirements";
import { evaluatePowers } from "./powers";
import type { EvaluatedStat } from "./stats";

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Record<string, string>,
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

const weapon = (
  name: string,
  group: string,
  fields: Record<string, string> = {},
) =>
  entity(`W:${name}`, name, "Weapon", {
    Damage: "1d8",
    "Proficiency Bonus": "3",
    "Weapon Category": "Military Melee",
    "Hands Required": "One-Handed",
    Group: group,
    Properties: "",
    ...fields,
  });

const longsword = weapon("Longsword", "Heavy Blade", {
  Properties: "Versatile",
});
const dagger = weapon("Dagger", "Light Blade", {
  Range: "5/10",
  Properties: "Off-hand, Light Thrown",
});
const greataxe = weapon("Greataxe", "Axe", {
  "Hands Required": "Two-Handed",
  Properties: "High Crit",
});
const longbow = weapon("Longbow", "Bow", {
  "Weapon Category": "Military Ranged",
  "Hands Required": "Two-Handed",
  Range: "20/40",
});
const club = weapon("Club", "Mace");

function context(
  overrides: Partial<PowerRequirementContext> = {},
): PowerRequirementContext {
  return {
    mainBase: undefined,
    offhandBase: undefined,
    monkWeapon: false,
    dualShields: false,
    shield: false,
    versatileUsedTwoHanded: () => false,
    statText: () => undefined,
    resolveWeapon: () => undefined,
    ...overrides,
  };
}

const power = entity("P", "Strike", "Power", {
  Keywords: "Weapon",
  Class: "ID_ROGUE",
  "_Associated Feats": "ID_FEAT_A, ID_FEAT_B",
});
const restricted = (requirement: string, overrides = {}) =>
  isPowerRestricted(power, requirement, context(overrides));

describe("legacy power requirement grammar (IsRestricted)", () => {
  it("cuts clauses as the native loop does", () => {
    expect(
      wieldingClauses(
        "You must be wielding a crossbow, a light blade, or a sling.",
      ),
    ).toEqual(["crossbow", "light blade", "sling"]);
    // "an" is not the "a " prefix, and "X or a Y" stays one clause.
    expect(wieldingClauses("You must be wielding an orb.")).toEqual(["an orb"]);
    expect(
      wieldingClauses("You must be wielding a rapier or a short sword."),
    ).toEqual(["rapier or a short sword"]);
    expect(wieldingClauses("You must be bloodied.")).toBeUndefined();
  });

  it("matches a group clause against the weapon's Group", () => {
    const requirement = "You must be wielding a light blade.";
    expect(restricted(requirement, { mainBase: dagger })).toBe(false);
    expect(restricted(requirement, { mainBase: longsword })).toBe(true);
    // An unarmed ranged power has no weapon record; every group clause fails.
    expect(restricted(requirement)).toBe(true);
  });

  it("reads the named two-handed, reach and thrown branches", () => {
    expect(
      restricted("You must be wielding a two-handed weapon.", {
        mainBase: greataxe,
      }),
    ).toBe(false);
    expect(
      restricted("You must be wielding a two-handed weapon.", {
        mainBase: longsword,
      }),
    ).toBe(true);
    expect(
      restricted("You must be wielding a melee weapon in two hands.", {
        mainBase: longsword,
        versatileUsedTwoHanded: () => true,
      }),
    ).toBe(false);
    expect(
      restricted("You must be wielding a thrown weapon.", { mainBase: dagger }),
    ).toBe(false);
    expect(
      restricted("You must be wielding a thrown weapon.", {
        mainBase: longsword,
      }),
    ).toBe(true);
  });

  it("needs a melee off hand for two melee weapons, or a ranged weapon", () => {
    const requirement =
      "You must be wielding two melee weapons or a ranged weapon.";
    expect(
      restricted(requirement, { mainBase: longsword, offhandBase: longsword }),
    ).toBe(false);
    expect(restricted(requirement, { mainBase: longsword })).toBe(true);
    expect(restricted(requirement, { mainBase: longbow })).toBe(false);
    // A melee weapon with a range (thrown) is also ranged.
    expect(restricted(requirement, { mainBase: dagger })).toBe(false);
  });

  it("stops at a missing off hand for the thrown-and-melee pair", () => {
    const requirement =
      "You must be wielding both a thrown weapon and a melee weapon.";
    expect(restricted(requirement, { mainBase: longsword })).toBe(true);
    expect(
      restricted(requirement, { mainBase: longsword, offhandBase: dagger }),
    ).toBe(false);
  });

  it("accepts a weapon swap text naming the weapon or its group", () => {
    const requirement = "You must be wielding a light blade.";
    const swap = (name: string, value: string) => (candidate: string) =>
      candidate.toLowerCase() === name.toLowerCase() ? value : undefined;
    expect(
      restricted(requirement, {
        mainBase: club,
        statText: swap("ID_ROGUE-light blade", "Club"),
      }),
    ).toBe(false);
    expect(
      restricted(requirement, {
        mainBase: club,
        statText: swap("ID_FEAT_B association-light blade", "mace group"),
      }),
    ).toBe(false);
    expect(
      restricted(requirement, {
        mainBase: club,
        statText: swap("ID_OTHER-light blade", "Club"),
      }),
    ).toBe(true);
  });

  it("checks the shield requirement and leaves other wording alone", () => {
    expect(restricted("You must be using a shield.")).toBe(true);
    expect(restricted("You must be using a shield.", { shield: true })).toBe(
      false,
    );
    expect(restricted("You must be bloodied.")).toBe(false);
  });

  it("treats Unarmed as a monk weapon", () => {
    expect(
      restricted("You must be wielding a monk weapon.", { monkWeapon: true }),
    ).toBe(false);
  });
});

const stats: Record<string, EvaluatedStat> = {
  "Strength modifier": {
    name: "Strength modifier",
    value: 3,
    contributions: [],
  },
  "Dexterity modifier": {
    name: "Dexterity modifier",
    value: 3,
    contributions: [],
  },
};

function variantNames(
  requirement: Record<string, string>,
  inventory: readonly { id: string; weapon: ContentEntity; equipped: number }[],
  powerId = "TWIN",
): readonly string[] {
  const entities = [
    entity(powerId, "Twin Strike", "Power", {
      Keywords: "Martial, Weapon",
      "Attack Type": "Melee or Ranged weapon",
      Attack: "Strength vs. AC (melee) or Dexterity vs. AC (ranged)",
      Hit: "1[W] damage.",
      ...requirement,
    }),
    longsword,
    dagger,
    longbow,
    entity("UNARMED", "Unarmed attack", "Weapon", {
      Damage: "1d4",
      "Weapon Category": "Improvised Melee",
      Group: "Unarmed",
    }),
  ];
  return (
    evaluatePowers({
      level: 1,
      activeDefinitionIds: [powerId],
      inventory: inventory.map((item) => ({
        id: item.id,
        name: item.id,
        definitionIds: [item.weapon.id],
        quantity: 1,
        equippedQuantity: item.equipped,
        acquiredLevel: 1,
      })),
      stats,
      overlays: [],
      entities,
    })[0]?.variants.map((variant) => variant.equipmentName) ?? []
  );
}

describe("power variants under a Requirement", () => {
  const inventory = [
    { id: "Sword A", weapon: longsword, equipped: 1 },
    { id: "Sword B", weapon: longsword, equipped: 1 },
    { id: "Spare dagger", weapon: dagger, equipped: 0 },
    { id: "Bow", weapon: longbow, equipped: 0 },
  ];

  it("keeps only the pairings legacy PowerStats lists", () => {
    // An equipped longsword's off hand is the other equipped one; an
    // unequipped dagger has none, but it is thrown and so ranged.
    expect(
      variantNames(
        {
          Requirement:
            "You must be wielding two melee weapons or a ranged weapon.",
        },
        inventory,
      ),
    ).toEqual(["Sword A", "Sword B", "Spare dagger", "Bow"]);
    expect(
      variantNames(
        { Requirement: "You must be wielding two melee weapons." },
        inventory,
      ),
    ).toEqual(["Sword A", "Sword B"]);
    // Without a requirement every fitting weapon and Unarmed is offered.
    expect(variantNames({}, inventory)).toContain("Unarmed");
  });

  it("reads `_WeaponRequirement` in place of the published Requirement", () => {
    expect(
      variantNames(
        {
          Requirement: "You must be wielding a crossbow or a light blade.",
          _WeaponRequirement: "You must be wielding a crossbow, a light blade.",
        },
        inventory,
      ),
    ).toEqual(["Spare dagger"]);
    // The published wording alone is one unreadable clause: legacy rejects
    // every weapon.
    expect(
      variantNames(
        { Requirement: "You must be wielding a crossbow or a light blade." },
        inventory,
      ),
    ).toEqual([]);
  });

  it("gives Coordinated Assault Attack no variants (IsValidPowerCombo)", () => {
    expect(
      variantNames({}, inventory, EXCEPTION_IDS.coordinatedAssaultAttack),
    ).toEqual([]);
  });
});

describe("legacy item requirements (MeetsItemRequirement)", () => {
  const item = (requirement: string) =>
    entity("ITEM", "Item", "Magic Item", { Requirement: requirement });
  const owning = (...ids: string[]) =>
    new Set(ids.map((id) => id.toLocaleLowerCase()));

  it("checks the living construct and ki focus texts against Internal records", () => {
    const living = item(
      "You must have the living construct racial trait to use this item.",
    );
    expect(meetsItemRequirement(living, owning())).toBe(false);
    expect(
      meetsItemRequirement(living, owning(EXCEPTION_IDS.canUseComponents)),
    ).toBe(true);
    const ki = item("must be able to use ki focuses as an implement.");
    expect(meetsItemRequirement(ki, owning())).toBe(false);
    expect(meetsItemRequirement(ki, owning(EXCEPTION_IDS.kiFocusUser))).toBe(
      true,
    );
  });

  it("passes every other Requirement, as legacy does", () => {
    expect(
      meetsItemRequirement(
        item("Must be able to use tomes as an implement."),
        owning(),
      ),
    ).toBe(true);
    expect(meetsItemRequirement(item(""), owning())).toBe(true);
  });
});

describe("registry-keyed weapon records", () => {
  const evaluateOne = (
    requirement: string,
    item: { definitionIds: string[]; equipped: number },
    extra: readonly ContentEntity[],
    activeDefinitionIds: readonly string[] = [],
  ) =>
    evaluatePowers({
      level: 1,
      activeDefinitionIds: ["POWER", ...activeDefinitionIds],
      inventory: [
        {
          id: "item",
          name: "Item",
          definitionIds: item.definitionIds,
          quantity: 1,
          equippedQuantity: item.equipped,
          acquiredLevel: 1,
        },
      ],
      stats,
      overlays: [],
      entities: [
        entity("POWER", "Cleave", "Power", {
          Keywords: "Weapon",
          "Attack Type": "Melee weapon",
          Attack: "Strength vs. AC",
          Hit: "1[W] damage.",
          Requirement: requirement,
        }),
        ...extra,
      ],
    })[0]?.variants.map((variant) => variant.equipmentName) ?? [];

  it("attacks with a staff as the Quarterstaff record", () => {
    const quarterstaff = {
      ...weapon("Quarterstaff", "Staff", { "Hands Required": "Two-Handed" }),
      id: EXCEPTION_IDS.quarterstaff,
    };
    const staff = entity("STAFF", "Staff of Ruin +1", "Magic Item", {
      "Magic Item Type": "Staff",
      Enhancement: "+1",
    });
    expect(
      evaluateOne(
        "You must be wielding a two-handed weapon.",
        { definitionIds: ["STAFF"], equipped: 1 },
        [quarterstaff, staff],
      ),
    ).toEqual(["Item"]);
  });

  it("uses a versatile weapon two-handed for a Small character", () => {
    const small = entity("SMALL", "Small", "Size", {});
    const requirement = "You must be wielding a melee weapon in two hands.";
    const item = { definitionIds: [longsword.id], equipped: 1 };
    expect(evaluateOne(requirement, item, [longsword, small])).toEqual([]);
    expect(
      evaluateOne(requirement, item, [longsword, small], ["SMALL"]),
    ).toEqual(["Item"]);
  });

  it("rejects Unarmed for a requirement its record cannot meet", () => {
    const unarmed = entity("UNARMED", "Unarmed attack", "Weapon", {
      "Weapon Category": "Improvised Melee",
      Group: "Unarmed",
    });
    expect(
      evaluateOne(
        "You must be wielding a two-handed weapon.",
        { definitionIds: [longsword.id], equipped: 1 },
        [longsword, unarmed],
      ),
    ).toEqual([]);
    expect(
      evaluateOne(
        "You must be wielding a monk weapon.",
        { definitionIds: [club.id], equipped: 1 },
        [club, unarmed],
      ),
    ).toEqual(["Item", "Unarmed"]);
  });
});
