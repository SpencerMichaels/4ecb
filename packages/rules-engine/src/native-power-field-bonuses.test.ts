import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";

import type { CharacterInventoryEntry } from "./evaluator";
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

const stat = (name: string, value: number): EvaluatedStat => ({
  name,
  value,
  contributions: [],
});

const weapons = [
  entity("AXE", "Handaxe", "Weapon", {
    Damage: "1d6",
    "Proficiency Bonus": "2",
    Group: "Axe",
    "Weapon Category": "Simple Melee",
  }),
  entity("SWORD", "Longsword", "Weapon", {
    Damage: "1d8",
    "Proficiency Bonus": "3",
    Group: "Heavy Blade",
    "Weapon Category": "Military Melee",
  }),
  entity("HAMMER", "Warhammer", "Weapon", {
    Damage: "1d10",
    "Proficiency Bonus": "2",
    Group: "Hammer",
    "Weapon Category": "Military Melee",
    "Hands Required": "One-Handed",
  }),
  entity("MAUL", "Maul", "Weapon", {
    Damage: "2d6",
    "Proficiency Bonus": "2",
    Group: "Hammer",
    "Weapon Category": "Military Melee",
    "Hands Required": "Two-Handed",
  }),
  entity("PICK", "War pick", "Weapon", {
    Damage: "1d8",
    "Proficiency Bonus": "2",
    Group: "Pick",
    "Weapon Category": "Military Melee",
  }),
];

const holding = (
  id: string,
  equippedQuantity = 1,
): CharacterInventoryEntry => ({
  id: id.toLowerCase(),
  definitionIds: [id],
  quantity: 1,
  equippedQuantity,
  acquiredLevel: 1,
});

function rows(input: {
  readonly power: ContentEntity;
  readonly inventory?: readonly CharacterInventoryEntry[];
  readonly owned?: readonly ContentEntity[];
  readonly stats?: Record<string, number>;
}) {
  const stats = Object.fromEntries(
    Object.entries({
      "Strength modifier": 4,
      "Constitution modifier": 3,
      "Dexterity modifier": 2,
      "Intelligence modifier": 1,
      "Wisdom modifier": 2,
      ...input.stats,
    }).map(([name, value]) => [name, stat(name, value)]),
  );
  const [power] = evaluatePowers({
    level: 2,
    activeDefinitionIds: [
      input.power.id,
      ...(input.owned ?? []).map(({ id }) => id),
    ],
    inventory: input.inventory ?? [],
    stats,
    overlays: [],
    entities: [input.power, ...weapons, ...(input.owned ?? [])],
  });
  return (name: string) =>
    power?.variants.find((variant) => variant.equipmentName === name);
}

const weaponPower = (
  id: string,
  name: string,
  fields: Record<string, string>,
): ContentEntity =>
  entity(id, name, "Power", {
    Keywords: "Martial, Weapon",
    "Attack Type": "Melee weapon",
    Attack: "Strength vs. AC",
    Hit: "1[W] + Strength modifier damage.",
    ...fields,
  });

describe("native CalcMisc WeaponBonuses", () => {
  it("adds Dexterity to the attack for a light blade, heavy blade or spear", () => {
    const row = rows({
      power: weaponPower("HESITATION", "Hesitation Slash", {
        " Weapon":
          "If you're wielding a light blade, heavy blade or a spear, you gain a bonus to the attack roll equal to your Dexterity modifier.",
      }),
      inventory: [holding("SWORD"), holding("AXE", 0)],
    });
    // Str 4 + half level 1 + proficiency.
    expect(row("Longsword")?.attackBonus).toBe(4 + 1 + 3 + 2);
    expect(row("Handaxe")?.attackBonus).toBe(4 + 1 + 2);
  });

  it("uses the table's weapon groups (the axe-only line, the hammer or mace line)", () => {
    const axeOnly = rows({
      power: weaponPower("HACK", "Hack 'n' Slash", {
        " Weapon":
          "If you're wielding an axe, you gain a bonus to the damage roll equal to your Constitution modifier.",
      }),
      inventory: [holding("AXE"), holding("HAMMER", 0)],
    });
    expect(axeOnly("Handaxe")?.damage).toBe("1d6+7");
    expect(axeOnly("Warhammer")?.damage).toBe("1d10+4");

    const dazed = rows({
      power: weaponPower("BOGGLE", "Boggling Smash", {
        " Weapon":
          "If you're wielding a hammer or a mace, the attack deals extra damage equal to your Constitution modifier, and the target is dazed until the end of your next turn.",
      }),
      inventory: [holding("AXE"), holding("HAMMER", 0)],
    });
    expect(dazed("Handaxe")?.damage).toBe("1d6+4");
    expect(dazed("Warhammer")?.damage).toBe("1d10+7");
  });

  it("matches the table's other Constitution sentences exactly", () => {
    const row = rows({
      power: weaponPower("INEXORABLE", "Inexorable Advance", {
        " Weapon":
          "If you're wielding an axe, a hammer, or a mace, the attacks deal extra damage equal to your Constitution modifier.",
      }),
      inventory: [holding("HAMMER")],
    });
    expect(row("Warhammer")?.damage).toBe("1d10+7");
  });

  it("gives a power without a damage expression the rider alone (Bell Ringer)", () => {
    const row = rows({
      power: weaponPower("BELL", "Bell Ringer", {
        Attack: "Strength vs. Fortitude",
        Hit: "The target is dazed until the end of your next turn.",
        " Weapon":
          "If you're wielding an axe, a hammer, or a mace, the attack deals damage equal to your Constitution modifier.",
      }),
      inventory: [holding("HAMMER"), holding("SWORD", 0)],
    });
    expect(row("Warhammer")?.damage).toBe("3");
    expect(row("Longsword")?.damage).toBeUndefined();
  });

  it("needs an off-hand weapon for the two-melee-weapons line", () => {
    const power = weaponPower("SPATE", "Distracting Spate", {
      " Weapon":
        "If you're wielding two melee weapons, the attack deals extra damage equal to your Dexterity modifier.",
    });
    expect(
      rows({ power, inventory: [holding("SWORD")] })("Longsword")?.damage,
    ).toBe("1d8+4");
    expect(
      rows({ power, inventory: [holding("SWORD"), holding("AXE")] })(
        "Longsword",
      )?.damage,
    ).toBe("1d8+6");
  });

  it("halves Strength with C# truncation", () => {
    const power = weaponPower("SWEEP", "Sweeping Blow", {
      " Weapon":
        "If you're wielding an axe, a flail, a heavy blade, or a pick, you gain a bonus to the attack roll equal to one-half your Strength modifier.",
    });
    const row = rows({
      power,
      inventory: [holding("AXE")],
      stats: { "Strength modifier": -3 },
    });
    // -3 Str + 1 half level + 2 proficiency, then trunc(-1.5) = -1.
    expect(row("Handaxe")?.attackBonus).toBe(-3 + 1 + 2 - 1);
  });

  it("takes the weapons of a Constitution rider outside the table from its sentence (D091)", () => {
    const press = rows({
      power: weaponPower("PRESS", "Press Forward", {
        " Weapon":
          "If you're wielding an axe, a hammer, or a pick, the attack deals extra damage equal to your Constitution modifier.",
      }),
      inventory: [holding("PICK"), holding("SWORD", 0)],
    });
    expect(press("War pick")?.damage).toBe("1d8+7");
    expect(press("Longsword")?.damage).toBe("1d8+4");

    const barreling = rows({
      power: weaponPower("BARREL", "Barreling Swing", {
        "  Weapon":
          "If you're wielding a two-handed mace or a twohanded hammer, the attack deals extra damage equal to your Constitution modifier.",
      }),
      inventory: [holding("MAUL"), holding("HAMMER", 0)],
    });
    expect(barreling("Maul")?.damage).toBe("2d6+7");
    expect(barreling("Warhammer")?.damage).toBe("1d10+4");
  });
});

describe("native CalcBonuses build-option riders", () => {
  const brutal = entity("BRUTAL", "Brutal Scoundrel", "Class Feature", {});

  it("adds the rider named by an owned element, on every row", () => {
    const power = weaponPower("SLY", "Sly Lunge", {
      " Brutal Scoundrel":
        "The attack deals extra damage equal to your Strength modifier.",
    });
    const owned = rows({
      power,
      inventory: [holding("SWORD")],
      owned: [brutal],
    });
    expect(owned("Longsword")?.damage).toBe("1d8+8");
    expect(owned("Unarmed")?.damage).toBe("1d4+8");
    expect(
      rows({ power, inventory: [holding("SWORD")] })("Longsword")?.damage,
    ).toBe("1d8+4");
  });

  it("adds Strength to the attack for the attack-roll sentences", () => {
    const row = rows({
      power: weaponPower("TOPPLE", "Topple Over", {
        " Brutal Scoundrel":
          "You gain a bonus to the attack roll equal to your Strength modifier.",
      }),
      inventory: [holding("SWORD")],
      owned: [brutal],
    });
    expect(row("Longsword")?.attackBonus).toBe(4 + 1 + 3 + 4);
  });

  it("needs a Dwarf for the Special dwarf line", () => {
    const power = entity("BASH", "Shield Bash", "Power", {
      Keywords: "Martial",
      "Attack Type": "Melee 1",
      Attack: "Strength +2 vs. Reflex",
      Hit: "1d10 + Strength modifier damage, and you push the target 1 square and knock it prone.",
      " Special":
        "If you are a dwarf, the attack deals extra damage equal to your Wisdom modifier.",
    });
    const dwarf = entity("DWARF", "Dwarf", "Race", {});
    expect(rows({ power, owned: [dwarf] })("Unarmed")?.damage).toBe("1d10+6");
    expect(rows({ power })("Unarmed")?.damage).toBe("1d10+4");
  });

  it("applies an `Axe` rider only with an axe", () => {
    const power = weaponPower("MASTER", "Weapon Master's Strike", {
      " Axe":
        "The target takes extra damage equal to your Constitution modifier.",
    });
    const row = rows({
      power,
      inventory: [holding("AXE"), holding("SWORD", 0)],
    });
    expect(row("Handaxe")?.damage).toBe("1d6+7");
    expect(row("Longsword")?.damage).toBe("1d8+4");
    expect(row("Unarmed")?.damage).toBe("1d4+4");
  });
});
