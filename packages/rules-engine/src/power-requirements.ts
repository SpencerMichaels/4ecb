import type { ContentEntity } from "@4ecb/content-domain";

import { EXCEPTION_NAMES } from "./exceptions";

/**
 * Legacy `IsRestricted` / `OtherRestrictions` (D20RulesEngine): the fixed
 * grammar the original engine reads from a power's `Requirement` to reject
 * the weapon variants it forbids. Recovered branch by branch from the
 * decompiled native code; see
 * reverse-engineering/docs/08-hard-coded-exceptions.md ("Power
 * restrictions"). It is engine semantics, so it lives in code; a power whose
 * wording the grammar cannot read gets a machine-read `_WeaponRequirement`
 * from content corrections instead (D089).
 */

/** Machine-read replacement for `Requirement`, from content corrections.
 * Besides the legacy grammar it accepts the weapon selectors of
 * `extendedClause` (a deliberate extension past legacy). */
export const WEAPON_REQUIREMENT_FIELD = "_WeaponRequirement";

const WIELDING_PREFIX = "you must be wielding ";
const SHIELD_REQUIREMENT = "you must be using a shield.";

/** Legacy IsMonkWeapon: weapons a monk's "monk weapon" requirement accepts. */
const MONK_WEAPON_NAMES = new Set(
  [
    EXCEPTION_NAMES.club,
    EXCEPTION_NAMES.dagger,
    EXCEPTION_NAMES.spear,
    EXCEPTION_NAMES.monkUnarmedStrike,
  ].map((name) => name.toLocaleLowerCase()),
);

export interface PowerRequirementContext {
  /** WeaponBase(main hand, power): the weapon record the power uses, or
   * undefined (an unarmed ranged power). */
  readonly mainBase: ContentEntity | undefined;
  /** OffhandWeaponBase(DetermineOffhand(main hand)), or undefined. */
  readonly offhandBase: ContentEntity | undefined;
  /** Legacy IsMonkWeapon of the main-hand item (true when unarmed). */
  readonly monkWeapon: boolean;
  /** Legacy DualShieldConditional: two or more shields equipped. */
  readonly dualShields: boolean;
  /** Legacy HasLoot("armor:shield"). */
  readonly shield: boolean;
  /** Legacy VersatileUsedInTwoHands for a versatile weapon: a Small
   * character with a non-small weapon, or _INTERNAL_VersatileUsedTwoHanded. */
  readonly versatileUsedTwoHanded: (weapon: ContentEntity) => boolean;
  /** Legacy GetStatText(name, '+'): the character's text values for a name. */
  readonly statText: (name: string) => string | undefined;
  /** Resolves a weapon reference (name or ID), for `_Primary End`. */
  readonly resolveWeapon: (reference: string) => ContentEntity | undefined;
  /** The row is Unarmed (mainBase is then the unarmed weapon record, or
   * undefined); only a `weapon:` selector can match it. */
  readonly unarmed?: boolean;
}

function field(entity: ContentEntity | undefined, name: string): string {
  if (entity === undefined) return "";
  const lower = name.toLocaleLowerCase();
  return (
    entity.specifics.find(
      (specific) => specific.name.toLocaleLowerCase() === lower,
    )?.value ?? ""
  );
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function equal(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

/** Legacy FigureWeaponType. */
export function legacyWeaponType(weapon: ContentEntity | undefined): {
  readonly melee: boolean;
  readonly ranged: boolean;
} {
  const category = field(weapon, "Weapon Category");
  const melee = contains(category, "melee");
  const ranged =
    contains(category, "ranged") || (melee && field(weapon, "Range") !== "");
  return { melee, ranged };
}

const isMeleeWeapon = (weapon: ContentEntity | undefined) =>
  weapon !== undefined && legacyWeaponType(weapon).melee;
const isRangedWeapon = (weapon: ContentEntity | undefined) =>
  weapon !== undefined && legacyWeaponType(weapon).ranged;

/** Legacy IsTwoHandedWeapon. */
function isTwoHandedWeapon(weapon: ContentEntity): boolean {
  return (
    contains(field(weapon, "Hands Required"), "Two-handed") ||
    contains(field(weapon, "Properties"), "stout")
  );
}

/** Legacy IsUsedTwoHanded. */
function isUsedTwoHanded(
  weapon: ContentEntity,
  context: PowerRequirementContext,
): boolean {
  return (
    (contains(field(weapon, "Properties"), "versatile") &&
      context.versatileUsedTwoHanded(weapon)) ||
    isTwoHandedWeapon(weapon)
  );
}

/** Legacy NormalizedName: the primary end's name, without " (large)". */
export function legacyNormalizedWeaponName(
  weapon: ContentEntity,
  resolveWeapon: (reference: string) => ContentEntity | undefined,
): string {
  const primary = field(weapon, "_Primary End");
  const named = (primary === "" ? undefined : resolveWeapon(primary)) ?? weapon;
  return named.name.replace(/ \(large\)$/iu, "");
}

/** Legacy IsMonkWeapon for an item's weapon record. */
export function isLegacyMonkWeapon(
  weapon: ContentEntity | undefined,
  staff: boolean,
  resolveWeapon: (reference: string) => ContentEntity | undefined,
): boolean {
  return (
    staff ||
    (weapon !== undefined &&
      MONK_WEAPON_NAMES.has(
        legacyNormalizedWeaponName(weapon, resolveWeapon).toLocaleLowerCase(),
      ))
  );
}

/** Legacy WeaponSwapCheck: an allowed list naming the weapon or its group. */
function weaponSwapCheck(
  weapon: ContentEntity,
  allowed: string | undefined,
  context: PowerRequirementContext,
): boolean {
  if (allowed === undefined) return false;
  return (
    contains(
      allowed,
      legacyNormalizedWeaponName(weapon, context.resolveWeapon),
    ) || contains(allowed, `${field(weapon, "Group")} group`)
  );
}

/**
 * Legacy WeaponSwap: a "<power Class>-<needed>" text, or a
 * "<associated feat> association-<needed>" text, lists the weapon or its
 * group as a substitute (Rogue weapon talents, Harrowing Swarm, …).
 */
function weaponSwap(
  power: ContentEntity,
  weapon: ContentEntity,
  needed: string,
  context: PowerRequirementContext,
): boolean {
  if (
    weaponSwapCheck(
      weapon,
      context.statText(`${field(power, "Class")}-${needed}`),
      context,
    )
  )
    return true;
  return field(power, "_Associated Feats")
    .split(",")
    .map((feat) => feat.trim())
    .some((feat) =>
      weaponSwapCheck(
        weapon,
        context.statText(`${feat} association-${needed}`),
        context,
      ),
    );
}

/** The Requirement text the grammar reads: `_WeaponRequirement` if any. */
export function machineReadRequirement(
  requirement: string | undefined,
  weaponRequirement: string | undefined,
): string {
  return weaponRequirement?.trim() || requirement || "";
}

/** The comma-separated clauses after "You must be wielding ", as the native
 * loop cuts them: leading space, then a leading "a " or "or a ", and one
 * trailing "." removed; a blank final segment ends the list. */
export function wieldingClauses(
  requirement: string,
): readonly string[] | undefined {
  if (!requirement.toLocaleLowerCase().startsWith(WIELDING_PREFIX))
    return undefined;
  const parts = requirement.slice(WIELDING_PREFIX.length).split(",");
  const clauses: string[] = [];
  for (const [index, part] of parts.entries()) {
    let clause = part.replace(/^\s+/u, "");
    if (clause === "" && index === parts.length - 1) break;
    if (/^a /iu.test(clause)) clause = clause.slice(2);
    else if (/^or a /iu.test(clause)) clause = clause.slice(5);
    clauses.push(clause.endsWith(".") ? clause.slice(0, -1) : clause);
  }
  return clauses;
}

/** A hand's weapon record test, for the extended selectors. */
type WeaponSelector = (
  weapon: ContentEntity | undefined,
  context: PowerRequirementContext,
) => boolean;

/** The extended selector for a thrown melee weapon power. */
const THROWN_MELEE_SELECTOR = "thrown melee";

const wielded =
  (test: (weapon: ContentEntity) => boolean): WeaponSelector =>
  (weapon, context) =>
    weapon !== undefined && context.unarmed !== true && test(weapon);

/** One extended selector, or undefined for any other text. */
function extendedSelector(text: string): WeaponSelector | undefined {
  const value = text.trim();
  const prefixed = /^(weapon|group|property):\s*(.+)$/iu.exec(value);
  if (prefixed !== null) {
    const kind = prefixed[1]?.toLocaleLowerCase();
    const operand = prefixed[2]?.trim() ?? "";
    if (kind === "group")
      return wielded((weapon) => contains(field(weapon, "Group"), operand));
    if (kind === "property")
      return wielded((weapon) =>
        contains(field(weapon, "Properties"), operand),
      );
    // By weapon: the named record's normalized name, so its Large sizes, a
    // double weapon's ends and magic weapons on that base all count.
    return (weapon, context) => {
      if (weapon === undefined) return false;
      const named = context.resolveWeapon(operand);
      return equal(
        legacyNormalizedWeaponName(weapon, context.resolveWeapon),
        named === undefined
          ? operand
          : legacyNormalizedWeaponName(named, context.resolveWeapon),
      );
    };
  }
  switch (value.toLocaleLowerCase()) {
    case "melee":
    case THROWN_MELEE_SELECTOR:
      return wielded(isMeleeWeapon);
    case "ranged":
      return wielded(isRangedWeapon);
    default:
      return undefined;
  }
}

/**
 * Extended `_WeaponRequirement` clauses (beyond legacy, product owner
 * 2026-10-21), read only from that corrections field:
 *
 * - `weapon:<ID or name>`, `group:<group>`, `property:<property>`, `melee`,
 *   `ranged`: the row's weapon record (WeaponBase) is that weapon, has that
 *   group or property (by substring, as legacy), or is melee or ranged.
 *   `thrown melee` is `melee` for a power thrown as a melee attack (see
 *   `weaponRequirementThrowsMelee`).
 * - `<selector> & <selector>`: one hand matches each, in either order (the
 *   main hand and DetermineOffhand's off hand, as legacy's pair branches).
 * - `<selector> & free hand`: the other hand holds no weapon, implement or
 *   shield.
 * - `any`: a condition the sheet cannot check (gear it cannot equip); every
 *   row, Unarmed included, meets it.
 *
 * Only `weapon:` can match the Unarmed row. Returns undefined for a clause
 * in no extended form, which the legacy grammar then reads.
 */
function extendedClause(
  clause: string,
  context: PowerRequirementContext,
): boolean | undefined {
  if (equal(clause.trim(), "any")) return true;
  const [first, second, ...rest] = clause.split("&");
  if (first === undefined || rest.length > 0) return undefined;
  const main = extendedSelector(first);
  if (main === undefined) return undefined;
  if (second === undefined) return main(context.mainBase, context);
  if (equal(second.trim(), "free hand"))
    return (
      main(context.mainBase, context) &&
      context.offhandBase === undefined &&
      !context.shield
    );
  const other = extendedSelector(second);
  if (other === undefined) return undefined;
  const offhand = context.offhandBase;
  return (
    (main(context.mainBase, context) && other(offhand, context)) ||
    (other(context.mainBase, context) && main(offhand, context))
  );
}

/** Whether a `_WeaponRequirement` names a thrown melee weapon: the power
 * then counts as melee only, as legacy IsMeleePower's thrown-melee
 * Requirement makes it. */
export function weaponRequirementThrowsMelee(
  weaponRequirement: string | undefined,
): boolean {
  return (
    wieldingClauses(weaponRequirement?.trim() ?? "")?.some((clause) =>
      equal(clause.trim(), THROWN_MELEE_SELECTOR),
    ) ?? false
  );
}

/**
 * Legacy IsRestricted (with OtherRestrictions): whether the power's
 * Requirement rejects this main-hand/off-hand pairing. A wielding
 * requirement is met when any clause is; an unrecognized clause is met only
 * when a weapon's Group contains it (or a weapon swap allows it). With
 * `extended` (the requirement is a `_WeaponRequirement`), a clause in an
 * `extendedClause` form is read that way instead.
 */
export function isPowerRestricted(
  power: ContentEntity,
  requirement: string,
  context: PowerRequirementContext,
  options: { readonly extended?: boolean } = {},
): boolean {
  const clauses = wieldingClauses(requirement);
  if (clauses === undefined)
    return equal(requirement, SHIELD_REQUIREMENT) && !context.shield;
  const main = context.mainBase;
  const offhand = context.offhandBase;
  for (const raw of clauses) {
    const clause = raw.toLocaleLowerCase();
    const met =
      options.extended === true ? extendedClause(raw, context) : undefined;
    if (met !== undefined) {
      if (met) return false;
    } else if (main !== undefined && clause === "bow or a crossbow") {
      if (contains(field(main, "Group"), "bow")) return false;
    } else if (clause === "monk weapon") {
      if (context.monkWeapon) return false;
    } else if (clause === "two shields") {
      if (context.dualShields) return false;
    } else if (clause === "both a thrown weapon and a melee weapon") {
      if (offhand === undefined) return true;
      const mainThrown = contains(field(main, "Properties"), "thrown");
      const offhandThrown = contains(field(offhand, "Properties"), "thrown");
      if (
        (isMeleeWeapon(main) && offhandThrown) ||
        (isMeleeWeapon(offhand) && mainThrown)
      )
        return false;
    } else if (
      clause ===
      "light thrown or a heavy thrown weapon to make a melee attack with this power"
    ) {
      if (isRangedWeapon(main)) return false;
    } else if (clause === "two melee weapons") {
      if (isMeleeWeapon(main) && isMeleeWeapon(offhand)) return false;
    } else if (main === undefined) {
      // Every remaining branch needs a weapon record.
    } else if (clause === "two melee weapons or a ranged weapon") {
      if (isMeleeWeapon(main) && isMeleeWeapon(offhand)) return false;
      if (legacyWeaponType(main).ranged) return false;
    } else if (clause === "ranged weapon") {
      if (legacyWeaponType(main).ranged) return false;
    } else if (
      clause === "two-handed weapon" ||
      clause ===
        "two-handed weapon. you must charge and use this power in place of the melee basic attack"
    ) {
      if (isTwoHandedWeapon(main)) return false;
    } else if (clause === "melee weapon in two hands") {
      if (isUsedTwoHanded(main, context) && isMeleeWeapon(main)) return false;
    } else if (clause === "two-handed reach weapon") {
      if (
        isTwoHandedWeapon(main) &&
        contains(field(main, "Properties"), "reach")
      )
        return false;
    } else if (clause === "light blade with the light thrown property") {
      if (
        contains(field(main, "Group"), "light blade") &&
        contains(field(main, "Properties"), "light thrown")
      )
        return false;
    } else if (clause === "heavy blade or light blade") {
      const group = field(main, "Group");
      if (contains(group, "heavy blade") || contains(group, "light blade"))
        return false;
    } else if (clause === "blowgun and use it for this attack") {
      if (contains(field(main, "Group"), "blowgun")) return false;
    } else if (clause === "reach weapon") {
      if (contains(field(main, "Properties"), "reach")) return false;
    } else if (
      clause ===
        "dagger and have scored a critical hit with a dagger against an enemy during this turn" ||
      clause === "dagger"
    ) {
      if (
        equal(
          legacyNormalizedWeaponName(main, context.resolveWeapon),
          EXCEPTION_NAMES.dagger,
        )
      )
        return false;
    } else if (clause === "spiked chain") {
      if (equal(main.name, EXCEPTION_NAMES.spikedChain)) return false;
    } else {
      const thrown =
        clause === "light thrown weapon"
          ? "light thrown"
          : clause === "heavy thrown weapon"
            ? "heavy thrown"
            : clause === "thrown weapon"
              ? "thrown"
              : undefined;
      const needed = thrown ?? raw;
      const value = field(main, thrown === undefined ? "Group" : "Properties");
      if (contains(value, needed)) return false;
      if (weaponSwap(power, main, needed, context)) return false;
    }
  }
  return true;
}
