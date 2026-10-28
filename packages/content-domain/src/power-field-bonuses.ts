/**
 * Native power-field riders (D20RulesEngine CalcMisc's `WeaponBonuses`
 * table, CalcBeast's companion line, CalcBonuses' build-option sentences):
 * the exact field texts that add an ability modifier to a power's attack or
 * damage. The legacy-wotc import matches each Power record's fields against
 * these tables once, at pack build, and stores the matches in its
 * `_Power Text IR` (`PowerTextStore.fieldBonuses`); the rules engine checks
 * only what depends on the character (weapon group, off hand, owned
 * elements, companions) and adds the modifier.
 */

export type PowerFieldBonusAbility =
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
  readonly ability: PowerFieldBonusAbility;
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
  readonly ability: PowerFieldBonusAbility;
  readonly attack?: boolean;
  /** The dwarf line also needs a Dwarf element, and is typed "Dwarf". */
  readonly requiresDwarf?: boolean;
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
    requiresDwarf: true,
  },
];

/** Native CalcBeast (Module ~25947): the one `Beast` field text it reads. */
const NATIVE_BEAST_WISDOM_LINE =
  "If your companion is a cat, a spider, or a wolf, the attack deals extra damage equal to your Wisdom modifier.";

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

/** A CalcMisc field rider of a weapon power: a `Weapon` field's
 *  `NATIVE_WEAPON_BONUSES` line (by table entry, which a repeated text
 *  shares), or CalcBeast's `Beast` line. */
export type PowerWeaponFieldBonus =
  | { readonly beast: true }
  | ({ readonly entry: number } & Omit<WeaponBonus, "text">);

/** A CalcBonuses rider: a field (not a standard power field) whose text is
 *  a build-option sentence; the field's name gates it. */
export interface PowerRiderFieldBonus {
  readonly field: string;
  readonly ability: PowerFieldBonusAbility;
  readonly attack?: true;
  /** The dwarf line also needs a Dwarf element. */
  readonly requiresDwarf?: true;
}

export interface PowerFieldBonuses {
  readonly weapon?: readonly PowerWeaponFieldBonus[];
  readonly riders?: readonly PowerRiderFieldBonus[];
}

/** The record's field riders, in field order (indent ≤ 2). */
export function parsePowerFieldBonuses(
  specifics: readonly { readonly name: string; readonly value: string }[],
): PowerFieldBonuses {
  const weapon: PowerWeaponFieldBonus[] = [];
  const riders: PowerRiderFieldBonus[] = [];
  for (const specific of specifics) {
    const { name, indent } = trimmedField(specific.name);
    const value = specific.value.trim();
    if (indent > 2) continue;
    if (lower(name) === "beast") {
      if (lower(value) === lower(NATIVE_BEAST_WISDOM_LINE))
        weapon.push({ beast: true });
    } else if (lower(name) === "weapon") {
      const entry = NATIVE_WEAPON_BONUSES.findIndex(
        (candidate) => lower(candidate.text) === lower(value),
      );
      if (entry >= 0) {
        const { label, groups, ability, attack, half, needsOffhand } =
          NATIVE_WEAPON_BONUSES[entry]!;
        weapon.push({
          entry,
          label,
          ...(groups === undefined ? {} : { groups }),
          ability,
          ...(attack === undefined ? {} : { attack }),
          ...(half === undefined ? {} : { half }),
          ...(needsOffhand === undefined ? {} : { needsOffhand }),
        });
      }
    }
    if (STANDARD_POWER_FIELDS.has(lower(name))) continue;
    const rider = NATIVE_BUILD_OPTION_BONUSES.find(
      (candidate) => lower(candidate.text) === lower(value),
    );
    if (rider === undefined) continue;
    riders.push({
      field: name,
      ability: rider.ability,
      ...(rider.attack === true ? { attack: true as const } : {}),
      ...(rider.requiresDwarf === true ? { requiresDwarf: true as const } : {}),
    });
  }
  return {
    ...(weapon.length === 0 ? {} : { weapon }),
    ...(riders.length === 0 ? {} : { riders }),
  };
}
