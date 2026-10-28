import type {
  ContentEntity,
  PowerFieldBonusAbility,
  PowerFieldBonuses,
} from "@4ecb/content-domain";

import { EXCEPTION_NAMES } from "./exceptions";
import { legacyListContainsOneOf } from "./weapon-groups";

/** A bonus a power's own field text adds to its row. */
export interface PowerFieldBonus {
  readonly label: string;
  readonly value: number;
  readonly source: string;
}

/** Native CalcBeast (Module ~25947): the Companion names that make its
 *  `Beast` line add Wisdom to damage. */
const WISDOM_BEAST_COMPANIONS = new Set(
  [
    EXCEPTION_NAMES.catCompanion,
    EXCEPTION_NAMES.spiderCompanion,
    EXCEPTION_NAMES.wolfCompanion,
  ].map((name) => name.toLocaleLowerCase()),
);

const lower = (value: string) => value.toLocaleLowerCase();

function signedLabel(
  ability: PowerFieldBonusAbility,
  half: boolean,
  suffix: string,
): string {
  return `${half ? "half " : ""}${ability} modifier${suffix}`;
}

/**
 * Native CalcMisc's `weapon` fields and CalcBonuses (Module 25976, 26254), in
 * that order: power-field riders that add an ability modifier to one row's
 * attack or damage. The exact texts are matched at pack build
 * (content-domain `parsePowerFieldBonuses`); this checks the character.
 *
 * - CalcMisc: a weapon power wielding a main-hand weapon; a `Weapon` field
 *   whose text is a `NATIVE_WEAPON_BONUSES` line, when the weapon base's
 *   Group is one of the line's groups (and an off-hand weapon is wielded for
 *   the two-weapon line); a `Beast` field (CalcBeast) whose text is its
 *   companion line adds Wisdom to damage for each cat, spider or wolf
 *   Companion the character has.
 * - CalcBonuses: any row; a field (not a standard power field) named
 *   "Special", or naming an element the character has (Brutal Scoundrel,
 *   Rageblood Vigor, a pact, an aegis…), or named "axe" when the weapon
 *   base's Group contains "axe" (or there is no base), whose text is a
 *   build-option sentence.
 */
export function nativePowerFieldBonuses(input: {
  readonly power: ContentEntity;
  /** The power's parsed field riders. */
  readonly fieldBonuses: PowerFieldBonuses;
  readonly weaponPower: boolean;
  /** A main-hand weapon is wielded (native stats.mainhandWeapon). */
  readonly mainhandWeapon: boolean;
  /** Native WeaponBase for the row. */
  readonly weaponBase: ContentEntity | undefined;
  readonly hasOffhand: boolean;
  /** Native FindCharElement: the character has an element by this name or ID. */
  readonly ownsElement: (name: string) => boolean;
  /** The names of the character's Companion elements (native
   *  IterateCharElements over the Companion type), for CalcBeast. */
  readonly companionNames: readonly string[];
  readonly abilityModifier: (ability: PowerFieldBonusAbility) => number;
}): {
  readonly attack: readonly PowerFieldBonus[];
  readonly damage: readonly PowerFieldBonus[];
} {
  const attack: PowerFieldBonus[] = [];
  const damage: PowerFieldBonus[] = [];
  const group =
    input.weaponBase?.specifics.find(
      (specific) => lower(specific.name.trim()) === "group",
    )?.value ?? "";

  // Divergence (D105, PHB p81 Giant's Wake, p84 Fangs of Steel): native
  // adds a rider once per matching `Weapon` field, so a power repeating it
  // under its secondary Hit adds it twice to every attack. The riders apply
  // to each attack's damage already, so a repeated text counts once.
  const appliedRiders = new Set<number>();
  if (input.weaponPower && input.mainhandWeapon)
    for (const bonus of input.fieldBonuses.weapon ?? []) {
      // CalcBeast: the exact line adds Wisdom once per owned cat, spider or
      // wolf Companion (Enclose the Prey).
      if ("beast" in bonus) {
        for (const companion of input.companionNames)
          if (WISDOM_BEAST_COMPANIONS.has(lower(companion.trim())))
            damage.push({
              label:
                "Wisdom modifier for having a cat, spider, or wolf companion",
              value: input.abilityModifier("Wisdom"),
              source: input.power.name,
            });
        continue;
      }
      if (appliedRiders.has(bonus.entry)) continue;
      if (
        (bonus.groups !== undefined &&
          !legacyListContainsOneOf(bonus.groups, group)) ||
        (bonus.needsOffhand === true && !input.hasOffhand)
      )
        continue;
      appliedRiders.add(bonus.entry);
      const modifier = input.abilityModifier(bonus.ability);
      const value = bonus.half === true ? Math.trunc(modifier / 2) : modifier;
      (bonus.attack === true ? attack : damage).push({
        label: signedLabel(bonus.ability, bonus.half === true, bonus.label),
        value,
        source: input.power.name,
      });
    }

  for (const rider of input.fieldBonuses.riders ?? []) {
    const name = rider.field;
    if (lower(name) !== "special" && !input.ownsElement(name)) {
      if (lower(name) !== "axe") continue;
      if (input.weaponBase !== undefined && !lower(group).includes("axe"))
        continue;
    }
    if (
      rider.requiresDwarf === true &&
      !input.ownsElement(EXCEPTION_NAMES.dwarf)
    )
      continue;
    (rider.attack === true ? attack : damage).push({
      label: `${rider.ability} modifier`,
      value: input.abilityModifier(rider.ability),
      source: rider.requiresDwarf === true ? EXCEPTION_NAMES.dwarf : name,
    });
  }
  return { attack, damage };
}
