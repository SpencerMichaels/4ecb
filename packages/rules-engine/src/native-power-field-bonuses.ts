import type { ContentEntity } from "@4ecb/content-domain";

import { EXCEPTION_NAMES } from "./exceptions";
import { legacyListContainsOneOf } from "./weapon-groups";

/** A bonus a power's own field text adds to its row. */
export interface PowerFieldBonus {
  readonly label: string;
  readonly value: number;
  readonly source: string;
}

type Ability =
  | "Strength"
  | "Constitution"
  | "Dexterity"
  | "Intelligence"
  | "Wisdom"
  | "Charisma";

interface WeaponBonus {
  readonly text: string;
  /** Native component label, appended to the signed value. */
  readonly label: string;
  /** Weapon groups (native ListContainsOneOf); none for any weapon. */
  readonly groups?: string;
  readonly ability: Ability;
  readonly attack?: boolean;
  readonly half?: boolean;
  readonly needsOffhand?: boolean;
}

const AXE_HAMMER_MACE = "axe,hammer,mace";
const FOR_AXE_HAMMER_MACE = " for using an axe, a hammer, or a mace";
const axeHammerMace = (rest: string): WeaponBonus => ({
  text: `If you're wielding an axe, a hammer, or a mace, ${rest}`,
  label: FOR_AXE_HAMMER_MACE,
  groups: AXE_HAMMER_MACE,
  ability: "Constitution",
});

/**
 * Native `WeaponBonuses` (D20RulesEngine.dll, read by CalcMisc): the exact
 * (case-insensitive) `Weapon` field texts that add an ability modifier to a
 * weapon power's damage or attack. Decoded from the table's data pointers;
 * flags 1 = attack, 2 = half (C# truncation), 4 = needs an off-hand weapon.
 */
export const NATIVE_WEAPON_BONUSES: readonly WeaponBonus[] = [
  axeHammerMace(
    "you gain a bonus to the damage roll equal to your Constitution modifier.",
  ),
  axeHammerMace(
    "your attack deals extra damage equal to your Constitution modifier.",
  ),
  axeHammerMace(
    "the attack deals extra damage equal to your Constitution modifier.",
  ),
  axeHammerMace(
    "the attacks deal extra damage equal to your Constitution modifier.",
  ),
  axeHammerMace("the attack deals damage equal to your Constitution modifier."),
  axeHammerMace(
    "the attack deals extra damage equal to your Constitution modifier, and you knock the target prone.",
  ),
  axeHammerMace(
    "the primary attack deals extra damage equal to your Constitution modifier.",
  ),
  {
    text: "If you're wielding an axe, you gain a bonus to the damage roll equal to your Constitution modifier.",
    label: " for using an axe",
    groups: "axe",
    ability: "Constitution",
  },
  {
    text: "If you're wielding a light blade or a spear, you gain a bonus to the damage roll equal to your Dexterity modifier.",
    label: " for using a light blade or a spear",
    groups: "light blade,spear",
    ability: "Dexterity",
  },
  {
    text: "If you're wielding a light blade or a spear, you gain a bonus to the attack roll equal to your Dexterity modifier.",
    label: " for using a light blade or a spear",
    groups: "light blade,spear",
    ability: "Dexterity",
    attack: true,
  },
  {
    text: "If you're wielding a light blade, heavy blade or a spear, you gain a bonus to the attack roll equal to your Dexterity modifier.",
    label: " for using a light blade, heavy blade, or a spear",
    groups: "light blade,heavy blade,spear",
    ability: "Dexterity",
    attack: true,
  },
  {
    text: "If you're wielding an axe, a flail, a heavy blade, or a pick, you gain a bonus to the attack roll equal to one-half your Strength modifier.",
    label: " for using an axe, a flail, a heavy blade, or a pick",
    groups: "axe,flail,heavy blade,pick",
    ability: "Strength",
    attack: true,
    half: true,
  },
  {
    text: "If you're wielding two melee weapons, the attack deals extra damage equal to your Dexterity modifier.",
    label: " for using two melee weapons",
    ability: "Dexterity",
    needsOffhand: true,
  },
  {
    text: "If you're wielding a hammer or a mace, the attack deals extra damage equal to your Constitution modifier, and the target is dazed until the end of your next turn.",
    label: " for using a hammer or a mace",
    groups: "hammer,mace",
    ability: "Constitution",
  },
  {
    text: "If you're wielding a hammer or a mace, you gain a bonus to the damage roll equal to your Constitution modifier, and your enemy is blinded until the end of your next turn.",
    label: " for using a hammer or a mace",
    groups: "hammer,mace",
    ability: "Constitution",
  },
  {
    text: "If you're wielding a light blade, heavy blade or a spear, you gain a bonus to the damage roll equal to your Dexterity modifier.",
    label: " for using a light blade, heavy blade, or a spear",
    groups: "light blade,heavy blade,spear",
    ability: "Dexterity",
  },
];

/**
 * Native CalcBonuses: the exact (case-insensitive) build-option rider texts
 * and the ability modifier each adds to damage, or to the attack.
 */
const NATIVE_BUILD_OPTION_BONUSES: readonly {
  readonly text: string;
  readonly ability: Ability;
  readonly attack?: boolean;
  /** The dwarf line also needs a Dwarf element, and is typed "Dwarf". */
  readonly requires?: string;
}[] = [
  {
    text: "The attack deals extra damage equal to your intelligence modifier.",
    ability: "Intelligence",
  },
  {
    text: "Gain a bonus to each attack's damage roll equal to your Intelligence modifier.",
    ability: "Intelligence",
  },
  {
    text: "The attack deals extra damage equal to your Wisdom modifier.",
    ability: "Wisdom",
  },
  {
    text: "The attack deals extra damage equal to your Constitution modifier.",
    ability: "Constitution",
  },
  {
    text: "The target takes extra damage equal to your Constitution modifier.",
    ability: "Constitution",
  },
  {
    text: "You gain a bonus to the damage roll equal to your strength modifier.",
    ability: "Strength",
  },
  {
    text: "The attack deals extra damage equal to your Strength modifier.",
    ability: "Strength",
  },
  {
    text: "You gain a bonus to the attack roll equal to your strength modifier.",
    ability: "Strength",
    attack: true,
  },
  {
    text: "The attack gains a bonus to the attack roll equal to your strength modifier.",
    ability: "Strength",
    attack: true,
  },
  {
    text: "If you are a dwarf, the attack deals extra damage equal to your Wisdom modifier.",
    ability: "Wisdom",
    requires: EXCEPTION_NAMES.dwarf,
  },
];

/** Native `power_field` (StandardPowerField): never a CalcBonuses gate. */
const STANDARD_POWER_FIELDS = new Set([
  "power type",
  "power usage",
  "class",
  "level",
  "keywords",
  "action type",
  "attack type",
  "attack",
  "target",
  "targets",
  "display",
  "hit",
]);

const lower = (value: string) => value.toLocaleLowerCase();

/** Native Trim: the field name without its leading whitespace, and how much
 *  there was (CalcMisc and CalcBonuses skip fields indented more than 2). */
function trimmedField(name: string): { name: string; indent: number } {
  const trimmed = name.trimStart();
  return { name: trimmed, indent: name.length - trimmed.length };
}

function signedLabel(ability: Ability, half: boolean, suffix: string): string {
  return `${half ? "half " : ""}${ability} modifier${suffix}`;
}

/**
 * Native CalcMisc's `weapon` fields and CalcBonuses (Module 25976, 26254), in
 * that order: power-field riders that add an ability modifier to one row's
 * attack or damage.
 *
 * - CalcMisc: a weapon power wielding a main-hand weapon; a `Weapon` field
 *   (indent ≤ 2) whose text is a `NATIVE_WEAPON_BONUSES` line, when the
 *   weapon base's Group is one of the line's groups (and an off-hand weapon
 *   is wielded for the two-weapon line).
 * - CalcBonuses: any row; a field (indent ≤ 2, not a standard power field)
 *   named "Special", or naming an element the character has (Brutal
 *   Scoundrel, Rageblood Vigor, a pact, an aegis…), or named "axe" when the
 *   weapon base's Group contains "axe" (or there is no base), whose text is
 *   a `NATIVE_BUILD_OPTION_BONUSES` sentence.
 */
export function nativePowerFieldBonuses(input: {
  readonly power: ContentEntity;
  readonly weaponPower: boolean;
  /** A main-hand weapon is wielded (native stats.mainhandWeapon). */
  readonly mainhandWeapon: boolean;
  /** Native WeaponBase for the row. */
  readonly weaponBase: ContentEntity | undefined;
  readonly hasOffhand: boolean;
  /** Native FindCharElement: the character has an element by this name or ID. */
  readonly ownsElement: (name: string) => boolean;
  readonly abilityModifier: (ability: Ability) => number;
}): {
  readonly attack: readonly PowerFieldBonus[];
  readonly damage: readonly PowerFieldBonus[];
} {
  const attack: PowerFieldBonus[] = [];
  const damage: PowerFieldBonus[] = [];
  const baseField = (name: string) =>
    input.weaponBase?.specifics.find(
      (specific) => lower(specific.name.trim()) === lower(name),
    )?.value ?? "";
  const group = baseField("Group");
  const fields = input.power.specifics.map((specific) => ({
    ...trimmedField(specific.name),
    value: specific.value.trim(),
  }));

  // Divergence (D105, PHB p81 Giant's Wake, p84 Fangs of Steel): native
  // adds a rider once per matching `Weapon` field, so a power repeating it
  // under its secondary Hit adds it twice to every attack. The riders apply
  // to each attack's damage already, so a repeated text counts once.
  const appliedRiders = new Set<string>();
  if (input.weaponPower && input.mainhandWeapon)
    for (const { name, indent, value } of fields) {
      if (indent > 2 || lower(name) !== "weapon") continue;
      if (appliedRiders.has(lower(value))) continue;
      const bonus = NATIVE_WEAPON_BONUSES.find(
        (candidate) =>
          lower(candidate.text) === lower(value) &&
          (candidate.groups === undefined ||
            legacyListContainsOneOf(candidate.groups, group)) &&
          (!candidate.needsOffhand || input.hasOffhand),
      );
      if (bonus === undefined) continue;
      appliedRiders.add(lower(value));
      const modifier = input.abilityModifier(bonus.ability);
      const value_ = bonus.half ? Math.trunc(modifier / 2) : modifier;
      (bonus.attack ? attack : damage).push({
        label: signedLabel(bonus.ability, bonus.half === true, bonus.label),
        value: value_,
        source: input.power.name,
      });
    }

  for (const { name, indent, value } of fields) {
    if (indent > 2 || STANDARD_POWER_FIELDS.has(lower(name))) continue;
    if (lower(name) !== "special" && !input.ownsElement(name)) {
      if (lower(name) !== "axe") continue;
      if (input.weaponBase !== undefined && !lower(group).includes("axe"))
        continue;
    }
    const rider = NATIVE_BUILD_OPTION_BONUSES.find(
      (candidate) => lower(candidate.text) === lower(value),
    );
    if (rider === undefined) continue;
    if (rider.requires !== undefined && !input.ownsElement(rider.requires))
      continue;
    (rider.attack ? attack : damage).push({
      label: `${rider.ability} modifier`,
      value: input.abilityModifier(rider.ability),
      source: rider.requires ?? name,
    });
  }
  return { attack, damage };
}
