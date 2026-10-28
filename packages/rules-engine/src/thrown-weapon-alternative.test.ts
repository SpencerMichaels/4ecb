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

const weapons = [
  entity("ID_FMP_WEAPON_3", "Dagger", "Weapon", {
    Range: "5/10",
    Damage: "1d4",
    "Proficiency Bonus": "3",
    "Weapon Category": "Simple Melee",
    "Hands Required": "One-Handed",
    "Item Slot": "Off-hand",
    Group: "Light Blade",
    Properties: "Light Thrown, Off-hand",
  }),
  entity("ID_FMP_WEAPON_39", "Shortbow", "Weapon", {
    Range: "15/30",
    Damage: "1d8",
    "Proficiency Bonus": "2",
    "Weapon Category": "Military Ranged",
    "Hands Required": "Two-Handed",
    "Item Slot": "Two-Hands",
    Group: "Bow",
    Properties: "Load Free, Small",
  }),
];

const reactiveShot = entity("ID_FMP_POWER_10648", "Reactive Shot", "Power", {
  "Power Usage": "Daily",
  Keywords: "Martial, Weapon",
  "Action Type": "No Action",
  "Attack Type": "Ranged weapon",
  Target: "One creature",
  Attack: "Strength (thrown weapon) or Dexterity vs. AC",
  Hit: "3[W] + Strength (thrown weapon) or Dexterity modifier damage.",
  Miss: "Half damage.",
});

const holding = (id: string): CharacterInventoryEntry => ({
  id: id.toLowerCase(),
  definitionIds: [id],
  quantity: 1,
  equippedQuantity: 1,
  acquiredLevel: 1,
});

function row(
  weapon: string,
  name: string,
  modifiers: { str: number; dex: number },
) {
  const stats: Record<string, EvaluatedStat> = Object.fromEntries(
    [
      ["Strength modifier", modifiers.str],
      ["Dexterity modifier", modifiers.dex],
    ].map(([name, value]) => [
      name,
      { name: name as string, value: value as number, contributions: [] },
    ]),
  );
  const [power] = evaluatePowers({
    level: 2,
    activeDefinitionIds: [reactiveShot.id],
    inventory: [holding(weapon)],
    stats,
    overlays: [],
    entities: [reactiveShot, ...weapons],
  });
  return power?.variants.find((variant) => variant.equipmentName === name);
}

describe("Reactive Shot's thrown-weapon alternative (D105)", () => {
  it("uses Dexterity for attack and damage with a bow, even when Strength is higher", () => {
    const bow = row("ID_FMP_WEAPON_39", "Shortbow", { str: 4, dex: 2 });
    expect(bow?.attackStat).toBe("Dexterity");
    expect(bow?.damage).toBe("3d8+2");
  });

  it("uses Strength for attack and damage with a thrown weapon, even when Dexterity is higher", () => {
    const dagger = row("ID_FMP_WEAPON_3", "Dagger", { str: 2, dex: 4 });
    expect(dagger?.attackStat).toBe("Strength");
    expect(dagger?.damage).toBe("3d4+2");
  });
});
