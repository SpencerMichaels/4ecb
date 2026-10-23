import type { ContentEntity } from "@4ecb/content-domain";

import type { CharacterOccurrence } from "./evaluator";
import { EXCEPTION_IDS } from "./exceptions";

/**
 * Native attack key-ability overrides (D20RulesEngine `-Module-.cs`:
 * OverrideStat around 22957, OverrideStatList 22821, OverrideByAssociation
 * 22903, OverrideStatPower 22941, FromDilettante/FromMulticlassing).
 */

const ABILITIES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * An ability named in a key-ability list: its full name or the
 * three-letter `statalias` the content defines (`int`, `dex`, ...).
 */
export function canonicalAbility(value: string): string | undefined {
  const name = key(value);
  return ABILITIES.find(
    (ability) =>
      key(ability) === name ||
      (name.length === 3 && key(ability).startsWith(name)),
  );
}

/** Where a power came from, for the granting-element, Dilettante and
 * multiclass overrides. */
export interface PowerOrigin {
  /** The element whose rule granted or selected the power's first
   * occurrence (native RulesToCharElement + CharElementParent). */
  readonly grantorId?: string;
  /** Native FromDilettante. */
  readonly dilettante: boolean;
  /** Native FromMulticlassing (featOnly false). */
  readonly multiclass: boolean;
}

/** Native FromDilettante/FromMulticlassing and the granting element, keyed
 * by lower-case power definition id. */
export function powerOrigins(
  occurrences: readonly CharacterOccurrence[],
  byId: ReadonlyMap<string, ContentEntity>,
): ReadonlyMap<string, PowerOrigin> {
  const occurrencesById = new Map(
    occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const parentDefinition = (occurrence: CharacterOccurrence) => {
    const parent =
      occurrence.parentId === undefined
        ? undefined
        : occurrencesById.get(occurrence.parentId);
    return parent === undefined
      ? undefined
      : { parent, entity: byId.get(key(parent.definitionId)) };
  };
  const origins = new Map<string, PowerOrigin>();
  for (const occurrence of occurrences) {
    const powerKey = key(occurrence.definitionId);
    if (key(byId.get(powerKey)?.type ?? "") !== "power") continue;
    const found = parentDefinition(occurrence);
    const parentId = key(found?.parent.definitionId ?? "");
    const dilettante = parentId === key(EXCEPTION_IDS.dilettante);
    // The choice that selected it is a multiclass power swap.
    const multiclassSwap =
      occurrence.ruleOrdinal !== undefined &&
      (found?.entity?.rules ?? []).some(
        (rule) =>
          rule.ordinal === occurrence.ruleOrdinal &&
          key(rule.name) === "replace" &&
          rule.attributes.some(
            (attribute) => key(attribute.name) === "multiclass",
          ),
      );
    // The nearest feat above it is a multiclass feat.
    let multiclassFeat = false;
    let ancestor: CharacterOccurrence | undefined = found?.parent;
    const visited = new Set<string>();
    while (ancestor !== undefined && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      const entity = byId.get(key(ancestor.definitionId));
      if (key(entity?.type ?? "") === "feat") {
        multiclassFeat = /multiclass/i.test(
          entity?.specifics.find((specific) => key(specific.name) === "type")
            ?.value ?? "",
        );
        break;
      }
      ancestor =
        ancestor.parentId === undefined
          ? undefined
          : occurrencesById.get(ancestor.parentId);
    }
    const multiclass =
      dilettante ||
      parentId === key(EXCEPTION_IDS.paragonMulticlassing) ||
      multiclassSwap ||
      multiclassFeat;
    const previous = origins.get(powerKey);
    origins.set(powerKey, {
      ...(previous?.grantorId !== undefined
        ? { grantorId: previous.grantorId }
        : found === undefined
          ? {}
          : { grantorId: found.parent.definitionId }),
      dilettante: (previous?.dilettante ?? false) || dilettante,
      multiclass: (previous?.multiclass ?? false) || multiclass,
    });
  }
  return origins;
}

export interface KeyAbilityOverride {
  /** The overriding ability, when one applies. */
  readonly ability?: string;
  /** Native damage_stat: damage ability modifiers use the attack ability. */
  readonly damageStat: boolean;
  /** Native half_damage: that modifier is halved (truncated). */
  readonly halfDamage: boolean;
}

export interface KeyAbilityContext {
  /** The evaluated power. */
  readonly power: ContentEntity;
  /** The power its overrides are read from (native _KeyAbilityAs). */
  readonly keyPower: ContentEntity;
  readonly fieldOf: (entity: ContentEntity, name: string) => string | undefined;
  readonly text: (name: string) => string | undefined;
  readonly score: (ability: string) => number;
  readonly origin?: PowerOrigin;
  readonly grantor?: ContentEntity;
  /** The row's weapon (native WeaponBase/mainhandWeapon). */
  readonly weapon: {
    readonly melee: boolean;
    readonly bowGroup: boolean;
    readonly thrown: boolean;
    readonly proficient: boolean;
  };
}

interface Flags {
  damageStat: boolean;
  halfDamage: boolean;
}

/**
 * Native OverrideStatList: `DMG:` and `HALF-DMG:` set the damage flags
 * whenever the list is read, even when it picks nothing; a trailing `*`
 * needs a proficient weapon, `!` forces the ability, otherwise the highest
 * listed score above the current attack ability wins.
 */
function overrideFromList(
  list: string | undefined,
  current: string,
  context: KeyAbilityContext,
  flags: Flags,
): string | undefined {
  let value = list?.trim() ?? "";
  if (value === "") return undefined;
  if (/^DMG:/i.test(value)) {
    flags.damageStat = true;
    value = value.slice(4);
  } else if (/^HALF-DMG:/i.test(value)) {
    flags.damageStat = true;
    flags.halfDamage = true;
    value = value.slice(9);
  }
  let best = context.score(current);
  let chosen: string | undefined;
  for (const part of value.split(/[,+]/)) {
    let text = part.trim();
    if (text.endsWith("*")) {
      text = text.slice(0, -1);
      if (!context.weapon.proficient) continue;
    }
    const forced = text.endsWith("!");
    if (forced) text = text.slice(0, -1);
    const ability = canonicalAbility(text);
    if (ability === undefined) continue;
    const score = context.score(ability);
    if (forced || score > best) {
      best = score;
      chosen = ability;
    }
  }
  return chosen;
}

/**
 * Native OverrideStat, steps before the `<power> <ability>` choice element:
 * the attack ability a power uses instead of its attack line's `current`
 * one, and whether its damage follows. The caller applies the choice
 * element and the heavy-thrown rule when nothing here applies, then
 * {@link rangedBasicFallbackOverride}.
 */
export function keyAbilityOverride(
  current: string,
  context: KeyAbilityContext,
): KeyAbilityOverride {
  const flags: Flags = { damageStat: false, halfDamage: false };
  const { keyPower } = context;
  const text = (name: string) => context.text(name);
  const found = (ability: string | undefined, damageStat: boolean) =>
    ability === undefined
      ? undefined
      : {
          ability,
          damageStat: flags.damageStat || damageStat,
          halfDamage: flags.halfDamage,
        };
  const list = (name: string | undefined) =>
    overrideFromList(name, current, context, flags);
  const attackType = context.fieldOf(keyPower, "Attack Type") ?? "";
  const keywords = context.fieldOf(keyPower, "Keywords") ?? "";
  const name = key(keyPower.name);
  const result =
    (/melee/i.test(attackType) && /martial/i.test(keywords)
      ? found(list(text("martial,melee:key ability")), true)
      : undefined) ??
    (name === "melee basic attack"
      ? found(
          list(text("melee basic:key ability")) ??
            (context.weapon.melee
              ? list(text("melee basic,melee weapon:key ability"))
              : undefined),
          true,
        )
      : undefined) ??
    (name === "ranged basic attack"
      ? found(
          list(text("ranged basic:key ability")) ??
            (context.weapon.bowGroup
              ? list(text("ranged basic,bow group:key ability"))
              : undefined) ??
            (context.weapon.thrown && context.weapon.proficient
              ? list(text("ranged basic,thrown:key ability"))
              : undefined),
          true,
        )
      : undefined) ??
    // Native reads only the internal id; the official Otherworldly Pulse
    // and Call of Letherna choices key theirs by power name.
    found(
      list(text(`${keyPower.id}:key ability`)) ??
        list(text(`${keyPower.name}:key ability`)),
      true,
    ) ??
    found(associationOverride(context, list), true) ??
    (context.grantor === undefined
      ? undefined
      : found(list(context.fieldOf(context.grantor, "Key Ability")), false)) ??
    found(list(context.fieldOf(keyPower, "Key Ability")), false) ??
    (context.origin?.dilettante === true
      ? found(list(text("dilettante:key ability")), true)
      : undefined) ??
    (context.origin?.multiclass === true
      ? found(list(text("multiclass:key ability")), false)
      : undefined);
  return result ?? flags;
}

/** Native OverrideByAssociation: the first `<feat> association:key ability`
 * among the evaluated power's `_Associated Feats`. */
function associationOverride(
  context: KeyAbilityContext,
  list: (value: string | undefined) => string | undefined,
): string | undefined {
  for (const feat of (
    context.fieldOf(context.power, "_Associated Feats") ?? ""
  ).split(",")) {
    if (feat.trim() === "") continue;
    const ability = list(
      context.text(`${feat.trim()} association:key ability`),
    );
    if (ability !== undefined) return ability;
  }
  return undefined;
}

/**
 * Native OverrideStat's last step for a Ranged Basic Attack with no earlier
 * override (after the caller's heavy-thrown Strength): `ranged basic` and,
 * with a melee weapon, `ranged basic,melee weapon` against the current
 * ability. Damage follows.
 */
export function rangedBasicFallbackOverride(
  current: string,
  context: KeyAbilityContext,
): KeyAbilityOverride {
  const flags: Flags = { damageStat: false, halfDamage: false };
  if (key(context.keyPower.name) !== "ranged basic attack") return flags;
  const ability =
    overrideFromList(
      context.text("ranged basic:key ability"),
      current,
      context,
      flags,
    ) ??
    (context.weapon.melee
      ? overrideFromList(
          context.text("ranged basic,melee weapon:key ability"),
          current,
          context,
          flags,
        )
      : undefined);
  return ability === undefined
    ? flags
    : { ability, damageStat: true, halfDamage: flags.halfDamage };
}
