import {
  authoredAttackLine,
  hitLineAt,
  levelHeaderText,
  parseHitLine,
  readCreatureStatBlock,
  weaponPropertyText,
  type AttackBonusIr,
  type AttackFieldIr,
  type AttackLineIr,
  type ContentEntity,
  type DamageClauseIr,
  type HitLineIr,
  type PowerRecoveryIr,
  type SpecialHitIr,
} from "@4ecb/content-domain";
import { boundAugmentHolding } from "@4ecb/character-domain";

import type {
  CharacterInventoryEntry,
  CharacterOccurrence,
  FieldOverlay,
} from "./evaluator";
import type { EvaluatedStat } from "./stats";
import {
  companionStatBonus,
  halfLevel,
  type BeastCompanionStatistics,
} from "./derived-values";
import {
  EXCEPTION_IDS,
  EXCEPTION_NAMES,
  TWICE_PER_ENCOUNTER_SPECIALS,
} from "./exceptions";
import { internalizePrerequisite, type PrerequisiteIr } from "./prerequisites";
import {
  keyAbilityOverride,
  powerOrigins,
  rangedBasicFallbackOverride,
  type KeyAbilityContext,
  type KeyAbilityOverride,
  type PowerOrigin,
} from "./key-ability-overrides";
import type { EquipmentState } from "./equipment";
import {
  isLegacyMonkWeapon,
  isPowerRestricted,
  legacyNormalizedWeaponName,
  legacyProficiencyWeaponName,
  machineReadRequirement,
  WEAPON_REQUIREMENT_FIELD,
  weaponRequirementThrowsMelee,
  type PowerRequirementContext,
} from "./power-requirements";
import {
  legacyKeywordList,
  legacyListContains,
  legacyListContainsOneOf,
} from "./weapon-groups";
import { nativePowerFieldBonuses } from "./native-power-field-bonuses";
import { powerTexts, type PowerTexts } from "./power-text-index";
import {
  legacyLoadoutHints,
  legacyLoadoutState,
  type LegacyLoadoutState,
} from "./loadout-slots";
import {
  IMPLEMENT_CLASS_FIELDS,
  equipmentName,
  increaseDamageDie,
  legacyIsDoubleWeapon,
  legacyCanUseLargeWeapons,
  legacyIsKiFocus,
  legacyIsLargeWeapon,
  legacyIsStaff,
  legacyLootImplement,
  legacyLootSlotContext,
  legacySmallWithNonSmallWeapon,
  modifiedFieldValue,
  recordFieldOverlays,
  withOverlaidItems,
} from "./item-fields";

export interface PowerComponent {
  readonly label: string;
  readonly value: number;
  readonly source?: string;
  readonly provenanceId?: string;
}

export interface PowerVariant {
  readonly id: string;
  readonly equipmentName: string;
  /** Stable inventory identity for presentation; do not derive it from a name. */
  readonly equipmentId?: string;
  readonly basicAttackTypes?: readonly ("melee" | "ranged")[];
  readonly definitionIds?: readonly string[];
  readonly equipped?: boolean;
  readonly weaponDamage?: string;
  readonly hand?: "main" | "off";
  readonly pairedEquipmentName?: string;
  readonly attackStat?: string;
  readonly defense?: string;
  readonly attackBonus?: number;
  readonly damage?: string;
  readonly damageType?: string;
  readonly critical?: string;
  readonly brutal?: number;
  readonly attackComponents: readonly PowerComponent[];
  readonly attacks?: readonly PowerAttack[];
  readonly damageComponents: readonly PowerComponent[];
  readonly conditionalDamage: readonly PowerConditionalDamage[];
  readonly additionalEffects?: readonly PowerAdditionalEffect[];
  /**
   * False for an implement-power variant whose item the character is not
   * proficient with as an implement. Legacy lists every owned weapon and
   * implement; presentation may hide these (D081).
   */
  readonly proficient: boolean;
  /** Every attack of this variant is the beast companion's own. */
  readonly attacker?: "beast";
  /** A summoned creature's commands, worked out with this row's equipment
   *  (D111). */
  readonly commands?: readonly PowerCommand[];
}

/**
 * A summoned creature's command the summoner rolls (D111): the row of one
 * power (attack) of the creature stored on the summon power
 * (`_Creature Stat Block`, `block.powers[entry].roll`), worked out as the
 * power's own attacks are: the summoner's ability, bonuses and equipment
 * for "Wisdom vs. Reflex" (D095), or "your level + N" with only the
 * creature's and the command's keyed bonuses.
 */
export interface PowerCommand extends PowerAttack {
  /** The index of the creature's power in `block.powers`. */
  readonly entry: number;
}

export interface PowerAdditionalEffect {
  readonly text: string;
  readonly source: string;
  readonly provenanceId?: string;
}

export interface PowerAttack {
  readonly id: string;
  readonly ordinal: number;
  readonly attackStat: string;
  readonly powerBonus: number;
  readonly defense: string;
  readonly attackBonus: number;
  readonly target?: string;
  readonly attackType?: string;
  readonly damage?: string;
  readonly damageType?: string;
  readonly damageComponents?: readonly PowerComponent[];
  readonly weaponRole?: "main" | "off";
  readonly eligible?: boolean;
  /** The beast companion makes this attack, with its own numbers. */
  readonly attacker?: "beast";
  readonly attackComponents: readonly PowerComponent[];
}

export interface PowerConditionalDamage {
  readonly source: string;
  readonly expression: string;
  readonly condition: string;
}

export interface EvaluatedPower {
  readonly definitionId: string;
  readonly name: string;
  readonly usage?: string;
  /** Uses per encounter when more than one (`legacyEncounterUses`); a
   * play tracker shows one box per use of a non-at-will power. */
  readonly encounterUses?: number;
  readonly actionType?: string;
  readonly attackType?: string;
  /** Effective authored _BasicAttack field, including active rule overlays. */
  readonly basicAttackKind?: "melee" | "ranged";
  readonly keywords: readonly string[];
  readonly variants: readonly PowerVariant[];
  readonly recoveries: readonly PowerRecovery[];
  /** Extra hit points a Healing power restores (legacy CalcHealing). */
  readonly healing?: PowerHealing;
  /** Extra damage dice other features add to this power. */
  readonly extraDamage?: PowerExtraDamage;
  /** A summon power with no rows of its own (a hexblade's pact creature):
   *  its creature's commands, worked out without equipment (D111). A power
   *  with rows carries them on each variant. */
  readonly commands?: readonly PowerCommand[];
  readonly unsupported: readonly string[];
}

/**
 * Extra damage dice from the "<power ID>:extra damage" (or "<power
 * name>:extra damage") stat, e.g. each Assassin's Strike (Hybrid) upgrade's
 * "+1d10". Added to whatever damage the power's own text deals.
 */
export interface PowerExtraDamage {
  /** The summed dice, largest die first: "2d10", "1d10 + 1d6". */
  readonly dice: string;
  readonly components: readonly PowerDiceComponent[];
}

export interface PowerDiceComponent {
  readonly dice: string;
  readonly source: string;
  readonly provenanceId: string;
}

export interface PowerHealing {
  /** Always-on extra hit points (legacy "regain an additional N"). */
  readonly bonus: number;
  readonly components: readonly PowerComponent[];
  /** Extra hit points that apply only sometimes, for reminders. */
  readonly conditional: readonly PowerConditionalHealing[];
}

export interface PowerConditionalHealing {
  /** Extra hit points: a number or dice ("1d6"). */
  readonly amount: string;
  readonly condition: string;
  readonly source: string;
  readonly provenanceId: string;
}

export interface PowerRecovery {
  readonly kind: "healing" | "healing-surge" | "temporary-hit-points";
  readonly expression: string;
}

interface Loadout {
  readonly id: string;
  readonly name: string;
  readonly definitionIds: readonly string[];
  readonly weaponDamage?: string;
  readonly proficiency: number;
  /**
   * Names whose "Weapon Proficiency (…)" makes the proficiency bonus apply:
   * the base weapon (a staff without one is a Quarterstaff) and any magic
   * item's "Proficient As". Empty for anything that is not a weapon.
   */
  readonly proficiencyNames: readonly string[];
  /** Native IsLargeWeapon: proficiency needs CanUseLargeWeapons. */
  readonly largeWeapon?: boolean;
  readonly enhancement: number;
  readonly critical?: string;
  readonly unarmed: boolean;
  readonly weaponDefinition: boolean;
  readonly implementDefinition: boolean;
  readonly equipped: boolean;
  /** Worn in the holy symbol slot (not an equip count). */
  readonly wornSymbol?: boolean;
  readonly hand?: "main" | "off";
  /** A versatile weapon the loadout holds in both hands (native
   * _INTERNAL_VersatileUsedTwoHanded, per holding: D101). */
  readonly twoHanded: boolean;
  readonly pairedEquipmentName?: string;
  readonly tags: readonly string[];
  /** What implement proficiency this item answers to: its implement kinds
   * (e.g. "holy symbol", "staff") and, for weapons, its name and group. */
  readonly implementKinds: readonly string[];
  /** Authored scopes in which this item works as an implement regardless of
   * proficiency (_ImplementForClass/_ImplementAsClass/_ImplementForPower),
   * e.g. a pact blade for warlock powers. */
  readonly implementScopes: readonly string[];
  /** _UniversalImplement: works as any implement. */
  readonly universalImplement: boolean;
  readonly properties: readonly string[];
  readonly weaponCategory?: string;
  readonly rangedWeapon: boolean;
  /** Legacy IsRestricted inputs: the item's base record (CharLoot base),
   * its WeaponBase for a weapon power, its equipped count, whether legacy
   * DetermineOffhand may pick it as the off hand, and IsStaff. */
  readonly baseRecord?: ContentEntity;
  readonly requirementBase?: ContentEntity;
  readonly equippedQuantity: number;
  readonly offhandCandidate: boolean;
  readonly staff: boolean;
  /** Legacy CharLootAugment: the name of the owned augment (a dragonshard)
   * bound to this item, which a `…(<augment name>)` limiter also matches. */
  readonly augmentName?: string;
  /** Native CharLoot BaseElem/EnchantElem: the base record (the weapon part
   * when there is one) and its magic enchantment, which BuildKeywordSet
   * reads for an implement power's row. */
  readonly lootBase?: ContentEntity;
  readonly lootEnchant?: ContentEntity;
  /** Native BuildKiList: the weapon holding a synthetic ki-focused loot was
   * built from; the loot takes that holding's hand. */
  readonly kiFocusedFrom?: string;
  /** What a weapon power reads instead (`asWeaponPowerLoadout`): native
   * WeaponBase's WeaponEquiv weapon for a non-weapon loot (a rod
   * "functioning as a mace", Boar Tusk Helm's gore, Feral Armor's claw) and
   * WeaponEnchant's EnchantEquiv record (Boar Tusk Helm's Magic Weapon +2). */
  readonly weaponPowerOverrides?: Partial<Loadout>;
}

/**
 * The loadout a weapon power's row uses: native WeaponBase and
 * WeaponEnchant (-Module-.cs ~21085, ~21159) read WeaponEquiv and
 * EnchantEquiv only when the power is a weapon power.
 */
function asWeaponPowerLoadout(item: Loadout): Loadout {
  const { weaponPowerOverrides, ...rest } = item;
  return weaponPowerOverrides === undefined
    ? item
    : { ...rest, ...weaponPowerOverrides };
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** "Ki focuses" → "ki focus", "light blade group" → "light blade". */
function implementKind(value: string): string {
  return key(value)
    .replace(/\s+group$/u, "")
    .replace(/(?<=[a-z])(?:es|s)$/u, "");
}

const IMPLEMENT_PROFICIENCY =
  /^(?:arcane\s+)?implement proficiency\s*\((.+)\)$/iu;

/**
 * Implement kinds the character can use, from active "Implement Proficiency
 * (…)" elements. 4E lets an implement power use only an implement the
 * character is proficient with; anything else (a plain weapon in hand) adds
 * nothing, which is exactly the Unarmed/no-implement calculation.
 */
function implementProficiencies(
  activeDefinitionIds: readonly string[],
  byId: ReadonlyMap<string, ContentEntity>,
): ReadonlySet<string> {
  return new Set(
    activeDefinitionIds.flatMap((id) => {
      const match = IMPLEMENT_PROFICIENCY.exec(
        byId.get(key(id))?.name.trim() ?? "",
      );
      return match?.[1] === undefined ? [] : [implementKind(match[1])];
    }),
  );
}

function usableAsImplement(
  item: Loadout,
  proficiencies: ReadonlySet<string>,
  inScope: (scopes: readonly string[]) => boolean,
): boolean {
  if (item.unarmed || item.universalImplement) return true;
  if (item.implementScopes.length > 0 && inScope(item.implementScopes))
    return true;
  const proficient = item.implementKinds.some((kind) =>
    proficiencies.has(kind),
  );
  if (item.implementDefinition)
    // Without any recorded implement proficiency (incomplete or custom
    // content), keep implements rather than leave only Unarmed.
    return proficient || proficiencies.size === 0;
  return proficient;
}

function listField(parts: readonly ContentEntity[], name: string): string[] {
  return parts.flatMap((entity) =>
    entity.specifics
      .filter((specific) => key(specific.name) === key(name))
      .flatMap((specific) => specific.value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/**
 * Whether a power falls inside an item's authored implement scopes:
 * a class (its class and paragon path powers), "PP <class>" (paragon path
 * powers of that class), a power source, or "@Power Source:<name>". A race in
 * parentheses ("warlock(dwarf)") also requires that race; other parenthesized
 * text is a display label.
 */
function implementScopeMatcher(
  power: ContentEntity,
  keywords: readonly string[],
  activeDefinitionIds: readonly string[],
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, ContentEntity>,
): (scopes: readonly string[]) => boolean {
  const resolve = (reference: string) =>
    byId.get(key(reference)) ?? byName.get(key(reference));
  const owners = (field(power, "Class") ?? "")
    .split(",")
    .map((reference) => resolve(reference))
    .filter((entity): entity is ContentEntity => entity !== undefined);
  const ownerIds = new Set(owners.map((owner) => key(owner.id)));
  // Paragon paths name their class in their prerequisite ("Cleric class").
  const pathClassNames = new Set(
    owners
      .filter((owner) => key(owner.type) === "paragon path")
      .flatMap((path) =>
        [
          ...(path.prerequisites ?? "").matchAll(/([A-Za-z' ]+?)\s+class\b/giu),
        ].map((match) => key(match[1] ?? "")),
      ),
  );
  const keywordSet = new Set(keywords.map(key));
  const races = new Set(
    activeDefinitionIds.flatMap((id) => {
      const entity = byId.get(key(id));
      return entity !== undefined && key(entity.type) === "race"
        ? [key(entity.name)]
        : [];
    }),
  );
  const matches = (scope: string): boolean => {
    const qualified = /^(.*?)\s*\(([^)]*)\)\s*$/u.exec(scope);
    const base = (qualified?.[1] ?? scope).trim();
    const qualifier = qualified?.[2]?.trim() ?? "";
    const qualifierEntity = qualifier === "" ? undefined : resolve(qualifier);
    if (
      qualifierEntity !== undefined &&
      key(qualifierEntity.type) === "race" &&
      !races.has(key(qualifierEntity.name))
    )
      return false;
    const pathClass = /^pp\s+(.+)$/iu.exec(base)?.[1];
    if (pathClass !== undefined) {
      const name = resolve(pathClass)?.name ?? pathClass;
      return pathClassNames.has(key(name));
    }
    const source = /^@power source:\s*(.+)$/iu.exec(base)?.[1];
    if (source !== undefined) return keywordSet.has(key(source));
    const entity = resolve(base);
    if (entity === undefined) return false;
    if (key(entity.type) === "power source")
      return keywordSet.has(key(entity.name));
    return ownerIds.has(key(entity.id)) || pathClassNames.has(key(entity.name));
  };
  return (scopes) => scopes.some(matches);
}

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

function numericStat(
  stats: Readonly<Record<string, EvaluatedStat>>,
  name: string,
): number {
  const direct = stats[name]?.value;
  if (typeof direct === "number") return direct;
  const found = Object.entries(stats).find(
    ([candidate]) => key(candidate) === key(name),
  )?.[1].value;
  return typeof found === "number" ? found : 0;
}

function parseEnhancement(entity: ContentEntity | undefined): number {
  const match = field(entity ?? emptyEntity, "Enhancement")?.match(/\+(\d+)/);
  return match === undefined || match === null ? 0 : Number(match[1]);
}

const emptyEntity: ContentEntity = {
  id: "",
  name: "",
  type: "",
  source: "",
  sources: [],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "", sourceOrdinal: 0 },
};

/** Record lookups native LootImplement needs: WeaponEquiv and
 * FindRulesElement for an `_ImplementForClass` value. */
function legacyImplementResolver(
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, readonly ContentEntity[]>,
): Parameters<typeof legacyLootImplement>[2] {
  return {
    weaponEquiv: (entity) => legacyWeaponEquiv(entity, byId, byName),
    record: (reference) =>
      byId.get(key(reference)) ?? byName.get(key(reference))?.[0],
  };
}

/** Legacy WeaponEquiv: a "name[:type]" or ID naming the record the item
 * attacks as (a superior implement or shield that is also a weapon). */
function legacyWeaponEquiv(
  entity: ContentEntity,
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, readonly ContentEntity[]>,
): ContentEntity | undefined {
  return legacyNamedRecord(field(entity, "WeaponEquiv"), byId, byName);
}

/** Native ParseNameType + FindRulesElement: a "name[:type]" or ID field
 * value (WeaponEquiv, EnchantEquiv) as the record it names. */
function legacyNamedRecord(
  reference: string | undefined,
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, readonly ContentEntity[]>,
): ContentEntity | undefined {
  const value = reference?.trim() ?? "";
  if (value === "") return undefined;
  const typed = /^(.*):([^:]*)$/u.exec(value);
  const name = (typed?.[1] ?? value).trim();
  const type = typed?.[2]?.trim();
  return (
    byId.get(key(name)) ??
    byName
      .get(key(name))
      ?.find(
        (candidate) => type === undefined || key(candidate.type) === key(type),
      )
  );
}

/**
 * Legacy CharLootAugment: the base record of the owned augment (a
 * dragonshard) bound to this loot, as the character-domain binding resolves
 * it (the modern choice, else the imported CharLootID), or undefined.
 */
function boundAugment(
  entry: CharacterInventoryEntry,
  inventory: readonly CharacterInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
): ContentEntity | undefined {
  const augment = boundAugmentHolding(
    entry,
    inventory,
    (holding) => holding.definitionIds,
  );
  const baseId = augment?.definitionIds[0];
  return baseId === undefined ? undefined : byId.get(key(baseId));
}

/**
 * Native BuildWeaponsList/BuildKiList (D20RulesEngine): each owned loot
 * whose base is an equipped ki focus (IsKiFocus) adds, after itself, one
 * synthetic loot per owned weapon base not already seen earlier in the loot
 * list (BaseElemAlreadySeen): the bare base weapon (the weapon's own
 * enchantment and overrides dropped) enchanted by the ki focus, with the
 * weapon loot's count and equip-count — "Shadow Master Ki Focused Wrist
 * Razors +1" (CharLootName). The synthetic loot lives only on the weapons
 * list, so DetermineOffhand never picks it as another item's off hand.
 */
function withKiFocusedWeapons(
  inventory: readonly CharacterInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
): readonly {
  readonly entry: CharacterInventoryEntry;
  readonly kiSource?: CharacterInventoryEntry;
}[] {
  const owned = inventory.filter((item) => item.quantity > 0);
  const weaponBase = (entry: CharacterInventoryEntry) => {
    const base = byId.get(key(entry.definitionIds[0] ?? ""));
    return base !== undefined && key(base.type) === "weapon" ? base : undefined;
  };
  return owned.flatMap((entry) => {
    const ki = byId.get(key(entry.definitionIds[0] ?? ""));
    if (entry.equippedQuantity <= 0 || !legacyIsKiFocus(ki) || ki === undefined)
      return [{ entry }];
    const focused = owned.flatMap((weapon, index) => {
      const base = weaponBase(weapon);
      if (
        base === undefined ||
        owned
          .slice(0, index)
          .some((earlier) => weaponBase(earlier)?.id === base.id)
      )
        return [];
      return [
        {
          entry: {
            id: `${weapon.id}#ki:${entry.id}`,
            definitionIds: [base.id, ki.id],
            quantity: weapon.quantity,
            equippedQuantity: weapon.equippedQuantity,
            acquiredLevel: weapon.acquiredLevel,
          },
          kiSource: weapon,
        },
      ];
    });
    return [{ entry }, ...focused];
  });
}

/**
 * Native AddWeaponKeywords' record part for a row's weapon base: "military"
 * when its Weapon Category contains it ("military,heavy blade group"), its
 * groups and "<group> group", Item Slot, Hands Required and Properties, and
 * "thrown" for any thrown property. The caller adds the name and ID.
 */
function weaponRecordTags(
  weapon: ContentEntity,
  groups: readonly string[] = legacyKeywordList(field(weapon, "Group")),
): string[] {
  const properties = field(weapon, "Properties") ?? "";
  return [
    ...(/military/iu.test(field(weapon, "Weapon Category") ?? "")
      ? ["military"]
      : []),
    ...groups,
    ...groups.map((group) => `${group} group`),
    field(weapon, "Item Slot") ?? "",
    field(weapon, "Hands Required") ?? "",
    ...properties.split(","),
    ...(/thrown/iu.test(properties) ? ["thrown"] : []),
  ];
}

/**
 * Native AddArenaWeapons (BuildKeywordSet, -Module-.cs ~25583): when a row's
 * weapon base has the "Arena Weapon" property, every other Weapon record
 * with it adds its keywords too. No current content sets that property
 * (Arena Training's picks add the "Arena" group instead), so this only
 * matters for homebrew.
 */
function legacyArenaWeaponTags(
  base: ContentEntity,
  entities: Iterable<ContentEntity>,
): string[] {
  const arena = (record: ContentEntity) =>
    /arena weapon/iu.test(field(record, "Properties") ?? "");
  if (!arena(base)) return [];
  const tags: string[] = [];
  for (const record of entities)
    if (record !== base && key(record.type) === "weapon" && arena(record))
      tags.push(record.name, record.id, ...weaponRecordTags(record));
  return tags;
}

/**
 * Native WeaponBase without a weapon, for a melee power (-Module-.cs
 * ~21085): the weapon record the "Unarmed Weapon" text names (Belt of the
 * Brawler's Club), else "Unarmed Attack" (ID_FMP_WEAPON_34). Undefined when
 * the content has neither. A non-melee power without a weapon has no base.
 */
function legacyUnarmedWeaponBase(
  textStrings: Readonly<Record<string, string>>,
  resolveWeapon: (reference: string) => ContentEntity | undefined,
): ContentEntity | undefined {
  const named = textValue(textStrings, EXCEPTION_NAMES.unarmedWeaponText);
  return (
    (named === undefined || named.trim() === ""
      ? undefined
      : resolveWeapon(named.trim())) ??
    resolveWeapon(EXCEPTION_NAMES.unarmedAttack)
  );
}

/**
 * The Unarmed row of a melee power on its native WeaponBase: the record's
 * keywords (AddWeaponKeywords: name, ID, groups, slot, properties, so
 * `Unarmed group:attack` and `Unarmed attack:attack` apply), its proficiency
 * bonus (GetProficiencyBonus: a Club's +2 when proficient) and its Damage
 * stepped by DieIncrease (FigureWeaponDice; Brutal Brawler `modify`s the
 * Unarmed attack record's Damage). The "Unarmed Damage Die" text is only
 * FigureWeaponDice's fallback for a row without a base.
 */
function withUnarmedWeaponBase(
  unarmed: Loadout,
  base: ContentEntity,
  resolveWeapon: (reference: string) => ContentEntity | undefined,
  weapons: Iterable<ContentEntity>,
): Loadout {
  const damage = field(base, "Damage")?.trim();
  return {
    ...unarmed,
    ...(damage === undefined || damage === "" ? {} : { weaponDamage: damage }),
    proficiency: Number(field(base, "Proficiency Bonus")) || 0,
    proficiencyNames: [legacyProficiencyWeaponName(base, resolveWeapon)],
    ...(legacyIsLargeWeapon(base) ? { largeWeapon: true } : {}),
    tags: [
      "unarmed",
      base.name,
      base.id,
      ...weaponRecordTags(base),
      ...legacyArenaWeaponTags(base, weapons),
    ]
      .map(key)
      .filter(Boolean),
    properties: (field(base, "Properties") ?? "")
      .split(",")
      .map(key)
      .filter(Boolean),
    weaponCategory: key(field(base, "Weapon Category") ?? "") || "melee",
    requirementBase: base,
  };
}

function loadouts(
  inventory: readonly CharacterInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, readonly ContentEntity[]>,
  textStrings: Readonly<Record<string, string>>,
  loadout: LegacyLoadoutState,
): readonly Loadout[] {
  const implementResolver = legacyImplementResolver(byId, byName);
  const resolveWeapon = (reference: string) =>
    byId.get(key(reference)) ??
    byName.get(key(reference))?.find((entity) => key(entity.type) === "weapon");
  const result: Loadout[] = [];
  for (const { entry, kiSource } of withKiFocusedWeapons(inventory, byId)) {
    const parts = entry.definitionIds.flatMap((id) => {
      const entity = byId.get(key(id));
      return entity === undefined ? [] : [entity];
    });
    const weapon = parts.find((entity) => key(entity.type) === "weapon");
    const magic = parts.find(
      (entity) =>
        key(entity.type) === "magic item" && parseEnhancement(entity) > 0,
    );
    const magicType =
      magic === undefined ? "" : field(magic, "Magic Item Type");
    const baseRecord = weapon ?? parts[0];
    const enchantRecord = parts.find(
      (entity) => entity !== baseRecord && key(entity.type) === "magic item",
    );
    // Native LootImplement(CharLoot): the base with its enchantment.
    const lootImplement = legacyLootImplement(
      baseRecord,
      enchantRecord,
      implementResolver,
    );
    const implement =
      parts.find((entity) => {
        const itemType = field(entity, "Magic Item Type") ?? "";
        return (
          /(implement|holy symbol|ki focus|orb|rod|staff|tome|totem|wand)/i.test(
            itemType,
          ) ||
          /^(holy symbol|ki focus)$/i.test(entity.name) ||
          key(entity.type) === "superior implement" ||
          // Legacy LootImplement: a non-weapon item whose `_ImplementEquiv`
          // names an implement kind is one (an instrument, say).
          (weapon === undefined &&
            (field(entity, "_ImplementEquiv")?.trim() ?? "") !== "")
        );
      }) ??
      // Native BuildWeaponsList: any other non-weapon loot LootImplement
      // names, e.g. the mundane Rod Implement or Totem gear.
      (weapon === undefined && lootImplement !== undefined
        ? baseRecord
        : undefined);
    const staff = baseRecord !== undefined && legacyIsStaff(baseRecord);
    // Native WeaponBase/IsStaffAsWeapon: a staff without a weapon part (a
    // magic or superior staff, the Staff Implement gear) attacks as the
    // Quarterstaff.
    const staffWeapon =
      weapon === undefined && (staff || /staff/i.test(magicType ?? ""));
    // Native WeaponBase for a weapon power: a non-weapon loot's WeaponEquiv
    // (the base's, else the enchantment's), which BuildWeaponsList keeps
    // when it is a weapon: a Rod of Smiting attacks as a mace, a Boar Tusk
    // Helm as its Boar Tusk.
    const equivalent =
      weapon !== undefined || staffWeapon || baseRecord === undefined
        ? undefined
        : (legacyWeaponEquiv(baseRecord, byId, byName) ??
          (enchantRecord === undefined
            ? undefined
            : legacyWeaponEquiv(enchantRecord, byId, byName)));
    const equivalentWeapon =
      equivalent !== undefined && key(equivalent.type) === "weapon"
        ? equivalent
        : undefined;
    // Native WeaponEnchant for a weapon power: the base's EnchantEquiv
    // record first (Boar Tusk Helm's Magic Weapon +2).
    const enchantEquivalent =
      baseRecord === undefined
        ? undefined
        : legacyNamedRecord(field(baseRecord, "EnchantEquiv"), byId, byName);
    if (
      weapon === undefined &&
      implement === undefined &&
      equivalentWeapon === undefined
    )
      continue;
    const augment = boundAugment(entry, inventory, byId);
    const critical = field(magic ?? emptyEntity, "Critical");
    const proficientAs = parts.flatMap((entity) => {
      const value = field(entity, "Proficient As");
      return value === undefined ? [] : [value];
    });
    const weaponPowerOverrides: Partial<Loadout> = {
      ...(equivalentWeapon === undefined
        ? {}
        : {
            weaponDamage:
              entry.overrides?.Damage ??
              field(equivalentWeapon, "Damage") ??
              "1d8",
            proficiency:
              Number(field(equivalentWeapon, "Proficiency Bonus")) || 0,
            proficiencyNames: [
              legacyProficiencyWeaponName(equivalentWeapon, resolveWeapon),
              ...proficientAs,
            ],
            ...(legacyIsLargeWeapon(equivalentWeapon)
              ? { largeWeapon: true }
              : {}),
            weaponDefinition: true,
            tags: [
              ...parts.map((entity) => entity.name),
              equivalentWeapon.name,
              equivalentWeapon.id,
              ...weaponRecordTags(equivalentWeapon),
              ...legacyArenaWeaponTags(equivalentWeapon, byId.values()),
            ]
              .map(key)
              .filter(Boolean),
            properties: weaponPropertyText(
              equivalentWeapon,
              field(equivalentWeapon, "Properties") ?? "",
            )
              .split(",")
              .map(key)
              .filter(Boolean),
            weaponCategory: key(
              field(equivalentWeapon, "Weapon Category") ?? "",
            ),
            rangedWeapon: Boolean(field(equivalentWeapon, "Range")),
          }),
      ...(enchantEquivalent === undefined
        ? {}
        : {
            enhancement: parseEnhancement(enchantEquivalent),
            lootEnchant: enchantEquivalent,
          }),
    };
    // The parts are already overlay-resolved (Arena Training's "Arena").
    const groups =
      weapon === undefined ? [] : legacyKeywordList(field(weapon, "Group"));
    // Native AddWeaponKeywords reads a staff main hand's keywords (group,
    // name, ID, properties, slot) from the Quarterstaff for every power, so
    // a staff without a weapon part answers to "staff group" (Staff
    // Expertise's `weapon,staff group:attack`).
    const keywordWeapon =
      weapon ?? (staff ? byId.get(key(EXCEPTION_IDS.quarterstaff)) : undefined);
    const keywordGroups =
      keywordWeapon === weapon
        ? groups
        : legacyKeywordList(field(keywordWeapon ?? emptyEntity, "Group"));
    result.push({
      id: entry.id,
      name: entry.name ?? equipmentName(parts),
      twoHanded: loadout.twoHandedEntryIds.has(entry.id),
      definitionIds: entry.definitionIds,
      ...(weapon === undefined && !staffWeapon
        ? {}
        : {
            weaponDamage:
              entry.overrides?.Damage ??
              field(weapon ?? emptyEntity, "Damage") ??
              "1d8",
          }),
      proficiency:
        Number(field(weapon ?? emptyEntity, "Proficiency Bonus")) ||
        (staffWeapon ? 2 : 0),
      // Native IsProficient(elem, enchant): a Large weapon by its
      // NormalizedName (its primary end, without " (large)").
      proficiencyNames: [
        ...(weapon !== undefined
          ? [legacyProficiencyWeaponName(weapon, resolveWeapon)]
          : staffWeapon
            ? ["Quarterstaff"]
            : []),
        ...proficientAs,
      ],
      ...(weapon !== undefined && legacyIsLargeWeapon(weapon)
        ? { largeWeapon: true }
        : {}),
      enhancement: parseEnhancement(magic),
      ...(critical ? { critical } : {}),
      unarmed: false,
      weaponDefinition: weapon !== undefined,
      implementDefinition: implement !== undefined,
      equipped: entry.equippedQuantity > 0,
      ...(entry.id === loadout.symbolEntryId ? { wornSymbol: true } : {}),
      tags: [
        ...parts.map((entity) => entity.name),
        ...(keywordWeapon === undefined
          ? []
          : [
              ...(keywordWeapon === weapon
                ? []
                : [keywordWeapon.name, keywordWeapon.id]),
              ...weaponRecordTags(keywordWeapon, keywordGroups),
              ...legacyArenaWeaponTags(keywordWeapon, byId.values()),
            ]),
      ]
        .map(key)
        .filter(Boolean),
      implementKinds: [
        ...(implement === undefined
          ? []
          : [
              magicType ?? "",
              field(implement, "Magic Item Type") ?? "",
              field(implement, "Group") ?? "",
              implement.name,
            ]),
        ...(weapon === undefined ? [] : [weapon.name, ...groups]),
        ...legacyKeywordList(lootImplement),
        // A weapon that counts as an implement kind, e.g. a holy symbol.
        ...listField(parts, "_ImplementEquiv").map((kind) =>
          kind.replace(/\s*\([^)]*\)\s*$/u, ""),
        ),
      ]
        .filter((value) => value.trim() !== "")
        .map(implementKind),
      implementScopes: [
        // `_ImplementForClass` and its alias `_ImplementAsClass` (a deliberate
        // D105 difference: legacy reads only the former), from the
        // overlay-resolved parts, so list-additions arrive comma-joined.
        ...IMPLEMENT_CLASS_FIELDS.flatMap((name) => listField(parts, name)),
        ...listField(parts, "_ImplementForPower"),
      ],
      universalImplement: parts.some(
        (entity) => key(field(entity, "_UniversalImplement") ?? "") === "true",
      ),
      properties: weaponPropertyText(
        weapon,
        field(weapon ?? emptyEntity, "Properties") ?? "",
      )
        .split(",")
        .map(key)
        .filter(Boolean),
      ...(weapon === undefined
        ? {}
        : { weaponCategory: key(field(weapon, "Weapon Category") ?? "") }),
      rangedWeapon: Boolean(field(weapon ?? emptyEntity, "Range")),
      ...(baseRecord === undefined
        ? {}
        : {
            baseRecord,
            requirementBase:
              legacyWeaponEquiv(baseRecord, byId, byName) ??
              (enchantRecord === undefined
                ? undefined
                : legacyWeaponEquiv(enchantRecord, byId, byName)) ??
              (staff
                ? (byId.get(key(EXCEPTION_IDS.quarterstaff)) ?? baseRecord)
                : baseRecord),
          }),
      equippedQuantity: entry.equippedQuantity,
      ...(augment === undefined ? {} : { augmentName: augment.name }),
      // Native DetermineOffhand: a weapon, or loot LootImplement names
      // other than a ki focus.
      offhandCandidate:
        kiSource === undefined &&
        (key(baseRecord?.type ?? "") === "weapon" ||
          (lootImplement !== undefined && !/ki focus/iu.test(lootImplement))),
      ...(kiSource === undefined ? {} : { kiFocusedFrom: kiSource.id }),
      staff,
      ...(baseRecord === undefined ? {} : { lootBase: baseRecord }),
      ...(enchantRecord === undefined ? {} : { lootEnchant: enchantRecord }),
      ...(Object.keys(weaponPowerOverrides).length === 0
        ? {}
        : { weaponPowerOverrides }),
    });
  }
  result.push({
    id: "unarmed",
    name: "Unarmed",
    definitionIds: [],
    // Native FigureWeaponDice without a weapon: the "Unarmed Damage Die"
    // text string (Brutal Brawler's 1d6), else 1d4.
    weaponDamage: textValue(textStrings, "Unarmed Damage Die")?.trim() || "1d4",
    proficiency: 0,
    proficiencyNames: [],
    enhancement: 0,
    unarmed: true,
    weaponDefinition: false,
    implementDefinition: false,
    equipped: false,
    twoHanded: false,
    tags: ["unarmed"],
    implementKinds: [],
    implementScopes: [],
    universalImplement: false,
    properties: [],
    weaponCategory: "melee",
    rangedWeapon: false,
    equippedQuantity: 0,
    offhandCandidate: false,
    staff: false,
  });
  // The holding alone in the loadout's main hand (D101).
  const mainHandName = loadout.mainHandWeapon;
  const mainIndex =
    mainHandName === undefined
      ? -1
      : result.findIndex(
          (item) => item.equipped && key(item.name) === key(mainHandName),
        );
  if (mainIndex < 0) return result;
  const mainId = result[mainIndex]?.id;
  const handed = result.map((item, index): Loadout =>
    !item.equipped || (!item.weaponDefinition && !item.implementDefinition)
      ? item
      : {
          ...item,
          hand:
            index === mainIndex ||
            (item.kiFocusedFrom !== undefined && item.kiFocusedFrom === mainId)
              ? "main"
              : "off",
        },
  );
  return handed.map((item) => {
    if (item.hand === undefined) return item;
    const pairs = handed.filter(
      (candidate) =>
        candidate.hand !== undefined &&
        candidate.hand !== item.hand &&
        candidate.kiFocusedFrom === undefined &&
        (item.weaponDefinition
          ? candidate.weaponDefinition
          : candidate.implementDefinition),
    );
    const pair = pairs.length === 1 ? pairs[0] : undefined;
    return pair === undefined
      ? item
      : { ...item, pairedEquipmentName: pair.name };
  });
}

function effectiveField(
  power: ContentEntity,
  name: string,
  overlays: readonly FieldOverlay[],
): string | undefined {
  let value = field(power, name);
  // Native C_RulesElementField: an augment version also reads its
  // _AugmentParent power's overlays.
  for (const overlay of recordFieldOverlays(power, overlays, (candidate) =>
    candidate.targetDefinitionIds.includes(power.id),
  ))
    if (key(overlay.field) === key(name))
      value = modifiedFieldValue(value, overlay);
  return value;
}

function diceTimes(expression: string, multiplier: number): string {
  const match = expression.match(/^(\d+)d(\d+)$/i);
  return match === null
    ? expression
    : `${Number(match[1]) * multiplier}d${match[2]}`;
}

/**
 * Native ParseDamage (`-Module-.cs` ~24312): a non-empty `_DamageDie` field
 * replaces the first "dN" of a dice expression (after the level's damage
 * line is chosen), so Dragon Breath's 2d6 becomes 2d10. A [W] expression
 * has no "dN" there and keeps its weapon dice.
 */
function withDamageDie(
  dice: string | undefined,
  damageDie: string | undefined,
): string | undefined {
  const die = damageDie?.trim() ?? "";
  return dice === undefined || die.length === 0
    ? dice
    : dice.replace(/d\d+/i, die);
}

function formatDamage(dice: string, bonus: number): string {
  if (bonus === 0) return dice;
  return `${dice}${bonus > 0 ? "+" : ""}${bonus}`;
}

/**
 * Native SpecialCase (-Module-.cs ~24430): Bond of Censure by name and the
 * exact hit lines whose damage CalcDamage cannot parse. `dice` replaces the
 * rolled dice ("" for an ability-only line), `flat` is dice-less flat
 * damage (not a damage roll, so no enhancement or roll-only bonuses),
 * `expression` a fixed display text, and `components` extra fixed terms.
 * Summons to Doom's line, which native rewrites to "4[W] + charisma
 * modifier psychic damage", already parses that way up to its first
 * "damage".
 */
function nativeSpecialDamage(
  power: ContentEntity,
  hit: SpecialHitIr | undefined,
  level: number,
):
  | {
      readonly dice?: string;
      readonly flat?: number;
      readonly expression?: string;
      readonly ability?: string;
      readonly suppressAbility?: boolean;
      readonly abilityOnly?: boolean;
      readonly components?: readonly PowerComponent[];
    }
  | undefined {
  // The legacy engine checks this exact power name before parsing its
  // conditional movement prose.
  if (key(power.name) === key(EXCEPTION_NAMES.bondOfCensure))
    return { dice: level >= 21 ? "2d10" : "1d10", suppressAbility: true };

  // The exact hit lines, matched at pack build (content-domain power-text).
  switch (hit) {
    case "strength-modifier":
      return { dice: "", ability: "Strength", abilityOnly: true };
    case "as-above":
      return { expression: "As Above" };
    case "damage-you-took":
      return { expression: "The damage you took" };
    case "ongoing-10":
      return { expression: "ongoing 10" };
    case "ongoing-10-dexterity":
      return { dice: "ongoing 10", ability: "Dexterity" };
    // Warlock's Bargain: 3d10, half the level (unsigned division) and the
    // Constitution modifier.
    case "warlocks-bargain":
      return {
        dice: "3d10",
        ability: "Constitution",
        components: [
          {
            label: "half your level",
            value: Math.floor(Math.max(0, level) / 2),
          },
        ],
      };
    case "final-reproach":
      return { flat: 15 };
    case undefined:
      return undefined;
  }
}

/** Command rows' attack ordinals start here, apart from the power's own
 *  attacks' (D111). */
const COMMAND_ORDINAL = 1000;

/** The attack stat of a beast companion's attack ("Beast's attack bonus"). */
export const BEAST_ATTACK_STAT = "Beast";

/** The attack stat of a summoned creature's "your level + N" attack: the
 *  summoner attacks through the creature with this bonus alone. */
export const LEVEL_ATTACK_STAT = "Level";

/**
 * A power a summoned creature uses: the Summoning keyword, or a stat block
 * naming the creature a "Summoned Creature" (Servant of the Staff). With a
 * "your level + N" attack it is a fixed-bonus creature (D095): its attack
 * and damage take only creature (`ALLY.`/`COMPANION.`/`SUMMON.`) and
 * power-keyed bonuses, never the summoner's character-wide or keyword ones.
 * Native PowerStats runs CalcKeywords and CalcGlobal on every row, so legacy
 * adds them; their description "specifies otherwise" (D091).
 */
function summonedCreaturePower(
  texts: PowerTexts,
  keywords: readonly string[],
): boolean {
  return (
    keywords.some((keyword) => key(keyword) === "summoning") ||
    texts.summonedCreature
  );
}

/** A fixed-bonus creature's own bonus to one statistic, as a component. */
function creatureStatComponents(
  stats: Readonly<Record<string, EvaluatedStat>>,
  statNames: readonly string[],
  label: string,
): PowerComponent[] {
  const value = statNames.reduce(
    (sum, stat) => sum + companionStatBonus(stats, "SUMMON", stat),
    0,
  );
  return value === 0 ? [] : [{ label, value }];
}

/** Bonuses keyed to this one power: "<power ID>:attack", "<name>:damage". */
function powerSpecificComponents(
  stats: Readonly<Record<string, EvaluatedStat>>,
  power: { readonly id: string; readonly name: string },
  fieldName: "attack" | "damage",
): PowerComponent[] {
  const wanted = new Set([
    `${key(power.id)}:${fieldName}`,
    `${key(power.name)}:${fieldName}`,
  ]);
  return Object.entries(stats).flatMap(([name, stat]) =>
    wanted.has(key(name))
      ? stat.contributions.flatMap((contribution) =>
          contribution.applied && contribution.numericValue !== undefined
            ? [
                {
                  label: name,
                  value: contribution.numericValue,
                  source: contribution.providerName,
                  provenanceId: contribution.id,
                },
              ]
            : [],
        )
      : [],
  );
}

/**
 * A beast companion's damage on a hit (legacy FigureWeaponDice with
 * `is_beast`, ParseBeastAbilityMod): `[B]` is the beast's damage die, "beast's
 * X modifier" its own ability modifier and "beast's ability modifier" the
 * record's damage ability; "your X modifier" stays the character's. Only the
 * beast's own bonuses apply, never the character's weapon or implement.
 */
function beastDamage(input: {
  readonly clause: DamageClauseIr;
  readonly beast: BeastCompanionStatistics;
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly power: ContentEntity;
}): Pick<PowerVariant, "damage" | "damageType" | "damageComponents"> {
  const parsed = input.clause.beast;
  const dice =
    parsed.beastDice === undefined
      ? parsed.fixedDice
      : diceTimes(input.beast.damage.die, parsed.beastDice);
  if (dice === undefined || dice === "") return { damageComponents: [] };
  const components: PowerComponent[] = [];
  if (parsed.beastDice !== undefined && input.beast.damage.bonus !== 0)
    components.push({
      label: "beast's damage bonus",
      value: input.beast.damage.bonus,
    });
  for (const named of parsed.beastAbilities ?? []) {
    if (named === "ability")
      components.push(
        ...input.beast.damage.abilities.map((ability) => ({
          label: `${ability.owner === "beast" ? "beast's" : "your"} ${ability.ability} modifier`,
          value: ability.modifier,
        })),
      );
    else
      components.push({
        label: `beast's ${named} modifier`,
        value: input.beast.abilities[named].modifier,
      });
  }
  for (const ability of parsed.ownAbilities ?? [])
    components.push({
      label: `${ability} modifier`,
      value: numericStat(input.stats, `${ability} modifier`),
    });
  // Flat additions: "1d8 + 2 + your Wisdom modifier", "2d8 + 4".
  const powerBonus = parsed.flatBonus ?? 0;
  if (powerBonus !== 0)
    components.push({ label: "power damage bonus", value: powerBonus });
  const companionBonus = companionStatBonus(
    input.stats,
    "BEAST",
    "damage rolls",
  );
  if (companionBonus !== 0)
    components.push({
      label: "beast damage bonus",
      value: companionBonus,
    });
  components.push(
    ...powerSpecificComponents(input.stats, input.power, "damage"),
  );
  const damageType = input.clause.damageType;
  return {
    damage: formatDamage(
      dice,
      components.reduce((sum, component) => sum + component.value, 0),
    ),
    ...(damageType === undefined ? {} : { damageType }),
    damageComponents: components,
  };
}

/** The beast's situational attack and damage bonuses, as card reminders. */
function beastAdditionalEffects(
  beast: BeastCompanionStatistics,
): PowerAdditionalEffect[] {
  return beast.conditionalBonuses.flatMap((bonus) => {
    const stat = key(bonus.stat);
    if (stat !== "attack rolls" && stat !== "damage rolls") return [];
    const value = Number(bonus.value);
    const amount = Number.isFinite(value)
      ? `${value > 0 ? "+" : ""}${value}`
      : bonus.value;
    return [
      {
        text: `${amount} to the beast's ${stat} ${bonus.condition} - ${bonus.source}.`,
        source: bonus.source,
        provenanceId: bonus.provenanceId,
      },
    ];
  });
}

/**
 * Native DieIncrease: every `<keywords>:die` stat whose comma-separated
 * keywords are all in the row's keyword set (IsKeyword) steps the weapon die
 * up that many times (Deadly Soldier's "Off-hand:die", Throwing Master's
 * "thrown,ranged:die").
 */
function dieIncreaseSteps(
  stats: Readonly<Record<string, EvaluatedStat>>,
  tags: ReadonlySet<string>,
): number {
  let steps = 0;
  for (const [name, stat] of Object.entries(stats)) {
    const keywords = /^(.+):die$/iu.exec(name.trim())?.[1];
    if (keywords === undefined || typeof stat.value !== "number") continue;
    if (keywords.split(",").every((keyword) => tags.has(key(keyword))))
      steps += Math.max(0, Math.trunc(stat.value));
  }
  return steps;
}

/**
 * Native FigureWeaponDice for one [W] term of a row. Arena Training's
 * improvised weapon (no weapon, a weapon the character is not proficient
 * with, or an improvised one) is 1d8, 1d10 two-handed. Otherwise a "(off-hand
 * weapon)" term uses the off-hand item's die (DetermineOffhand; a double
 * weapon's other end), any other term the row's own, each stepped up by
 * DieIncrease; with no weapon it is the unarmed die.
 */
function figureWeaponDice(input: {
  readonly equipment: Loadout;
  readonly offhand: Loadout | undefined;
  readonly offhandTerm: boolean;
  readonly arenaImprovised: boolean;
  readonly steps: number;
  readonly byId: ReadonlyMap<string, ContentEntity>;
}): string | undefined {
  const { equipment } = input;
  if (input.arenaImprovised)
    return key(
      field(equipment.requirementBase ?? emptyEntity, "Hands Required") ?? "",
    ) === "two-handed"
      ? "1d10"
      : "1d8";
  // Without a base (no Unarmed attack record) the unarmed die is final.
  if (equipment.unarmed && equipment.requirementBase === undefined)
    return equipment.weaponDamage;
  let die = equipment.weaponDamage;
  if (input.offhandTerm && input.offhand !== undefined) {
    const secondaryEnd =
      input.offhand === equipment
        ? field(equipment.requirementBase ?? emptyEntity, "_Secondary End")
        : undefined;
    const end =
      secondaryEnd === undefined || secondaryEnd.trim() === ""
        ? undefined
        : input.byId.get(key(secondaryEnd));
    die =
      (end === undefined ? undefined : field(end, "Damage")) ??
      input.offhand.weaponDamage ??
      die;
  }
  return die === undefined ? undefined : increaseDamageDie(die, input.steps);
}

function criticalExpression(
  equipment: Loadout,
  level: number,
  weaponDie: string | undefined,
): string | undefined {
  const parts = equipment.critical === undefined ? [] : [equipment.critical];
  if (weaponDie !== undefined && equipment.properties.includes("high crit")) {
    const dice = diceTimes(
      weaponDie,
      1 + Math.floor((Math.max(1, level) - 1) / 10),
    );
    parts.unshift(`+${dice} high crit damage`);
  }
  return parts.length === 0 ? undefined : parts.join("; ");
}

/** The hit and effect texts' recovery sentences, each once. */
function recoveryExpressions(
  ...values: ReadonlyArray<readonly PowerRecoveryIr[] | undefined>
): PowerRecovery[] {
  const seen = new Set<string>();
  return values.flatMap((value) =>
    (value ?? []).flatMap(({ kind, expression }) => {
      const identity = `${kind}\0${expression}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [{ kind, expression }];
    }),
  );
}

/**
 * Power keywords native CalcKeywords adds beyond the authored Keywords: the
 * power's name and internal ID, each Class reference and that class's name,
 * `_ExtraKeywords`, `_Associated Feats` as "<feat> association", and Power
 * Usage. Content keys bonuses by these (Hexblade Pact Reward is
 * `ID_FMP_CLASS_7:damage`).
 */
function legacyPowerKeywordTags(
  power: ContentEntity,
  byId: ReadonlyMap<string, ContentEntity>,
): string[] {
  const list = (name: string) =>
    (field(power, name) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  return [
    power.name,
    power.id,
    ...list("Class").flatMap((reference) => [
      reference,
      byId.get(key(reference))?.name ?? "",
    ]),
    ...list("_ExtraKeywords"),
    ...list("_Associated Feats").map((feat) => `${feat} association`),
    ...list("_AugmentParent"),
    field(power, "Power Usage") ?? "",
  ]
    .map(key)
    .filter(Boolean);
}

/**
 * Names a parenthesized `keyword:stat(<name>)` limiter may give for this
 * equipment (normalized): native IsLimiterName's base and enchantment, and
 * the augment bound to it (CharLootAugment, as in CalcKeywords).
 */
function limiterNames(
  equipment: Loadout,
  byId: ReadonlyMap<string, ContentEntity>,
): ReadonlySet<string> {
  return new Set(
    [
      ...equipment.definitionIds.map((id) => byId.get(key(id))?.name ?? ""),
      equipment.augmentName ?? "",
    ]
      .map(key)
      .filter(Boolean),
  );
}

/** Native FigureWeaponType: melee and ranged from Weapon Category; a melee
 * weapon with a Range is ranged too. */
function legacyWeaponType(entity: ContentEntity | undefined): {
  readonly melee: boolean;
  readonly ranged: boolean;
} {
  const category = field(entity ?? emptyEntity, "Weapon Category") ?? "";
  const melee = /melee/iu.test(category);
  return {
    melee,
    ranged:
      /ranged/iu.test(category) ||
      (melee && (field(entity ?? emptyEntity, "Range")?.trim() ?? "") !== ""),
  };
}

const twicePerEncounterSpecials = new Set(
  TWICE_PER_ENCOUNTER_SPECIALS.map((text) => whitespaceKey(text)),
);

/** Lower-cased, with every whitespace run one space. */
function whitespaceKey(value: string): string {
  return key(value).replace(/\s+/gu, " ");
}

/**
 * Native D20Workspace.RulesElementEncounterUses (~1880), the use boxes the
 * legacy play tracker gives a non-at-will power: 2 (3 from 16th level) for a
 * power whose Special is one of the recovered "twice per encounter" texts,
 * else 1 + the overlaid `_ADDITIONAL_USES` field (Fight On, Rage Strike,
 * Blurred Strike Ki Focus) + the "<power ID>_ADDITIONAL_USES" stat.
 *
 * Divergences (D105, from the records' own rules text):
 * - native compares the Special text exactly, so Ardent Surge, whose
 *   Special carries a line break, gets 1 use although its text grants two;
 *   whitespace runs compare as one space here.
 * - native returns the "twice per encounter" count before reading
 *   `_ADDITIONAL_USES`, so Fight On ("Gain additional use of inspiring
 *   word") adds nothing to Inspiring Word; here the additional uses count
 *   on top.
 */
function legacyEncounterUses(
  power: ContentEntity,
  overlays: readonly FieldOverlay[],
  level: number,
  stats: Readonly<Record<string, EvaluatedStat>>,
): number {
  const special = effectiveField(power, "Special", overlays);
  const base =
    special !== undefined &&
    twicePerEncounterSpecials.has(whitespaceKey(special))
      ? level < 16
        ? 2
        : 3
      : 1;
  // _wtoi: the leading integer, else 0.
  const additional =
    Number.parseInt(
      effectiveField(power, "_ADDITIONAL_USES", overlays)?.trim() ?? "",
      10,
    ) || 0;
  return base + additional + numericStat(stats, `${power.id}_ADDITIONAL_USES`);
}

/** The row-independent class channels of one power's keyword set. */
interface PowerClassChannels {
  /** Native BaseClass of the power's Class field (no character class): a
   * paragon path's class prerequisite, else the field itself. */
  readonly baseClass: string;
  /** InsertParagonPath's category ID and the power's own
   * `_PowerstatKeywords` (AdditionalKeywords). */
  readonly keywords: readonly string[];
}

/**
 * Native FindPrereq(<paragon path>, Class): the first Class record its
 * prerequisite names ("Sorcerer", "Warlock class, star pact").
 */
function legacyParagonPathClass(
  path: ContentEntity,
  definitions: readonly ContentEntity[],
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, readonly ContentEntity[]>,
): ContentEntity | undefined {
  const ir = internalizePrerequisite(path.prerequisites, {
    owned: [],
    level: 1,
    abilities: {},
    definitions,
    subject: path,
  });
  const isClass = (entity: ContentEntity | undefined) =>
    entity !== undefined && key(entity.type) === "class";
  const find = (
    node: PrerequisiteIr | undefined,
  ): ContentEntity | undefined => {
    if (node === undefined) return undefined;
    if (node.kind === "all" || node.kind === "any")
      return node.children.map(find).find(isClass);
    if (node.kind === "element" && !node.negated)
      return node.definitionIds.map((id) => byId.get(key(id))).find(isClass);
    if (node.kind === "class")
      return [
        byId.get(key(node.value)),
        ...(byName.get(key(node.value)) ?? []),
      ].find(isClass);
    return undefined;
  };
  return find(ir);
}

/**
 * Native BuildKeywordSet's power-level class channels. BaseClass maps a
 * paragon path power to its path's class (IsClassPower, for qualified
 * `_PowerstatKeywords`); InsertParagonPath adds the ID of the
 * "<class name> Paragon Path" record (Sorcerous Power's
 * `ID_INTERNAL_CATEGORY_SORCERER_PARAGON_PATH:damage`); AdditionalKeywords
 * adds the power's own `_PowerstatKeywords`. The path's own ID is already a
 * Class keyword (`legacyPowerKeywordTags`), which Pact Reward's
 * `ID_FMP_PARAGON_PATH_<n>:damage` stats match.
 */
function legacyPowerClassChannels(
  power: ContentEntity,
  powerstatKeywords: string | undefined,
  definitions: readonly ContentEntity[],
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, readonly ContentEntity[]>,
): PowerClassChannels {
  const classField = field(power, "Class") ?? "";
  const owner = byId.get(key(classField)) ?? byName.get(key(classField))?.[0];
  const pathClass =
    owner !== undefined && key(owner.type) === "paragon path"
      ? legacyParagonPathClass(owner, definitions, byId, byName)
      : undefined;
  const baseClass = pathClass?.id ?? classField;
  // InsertParagonPath (Module ~25407): the "<class name> Paragon Path"
  // record's ID, the category content keys path-power bonuses by.
  const category =
    pathClass === undefined
      ? undefined
      : byName.get(key(`${pathClass.name} Paragon Path`))?.[0];
  return {
    baseClass,
    keywords: [
      ...(category === undefined ? [] : [category.id]),
      ...legacyPowerstatKeywords(powerstatKeywords, baseClass),
    ],
  };
}

/**
 * Native AdditionalList/PossibleInsert: a `_PowerstatKeywords` value's
 * comma-separated keywords. A "<keyword>?<class ID>" entry (Eladrin Sword
 * Wizardry's "wand implement?ID_FMP_CLASS_9") joins only when the power's
 * BaseClass is that class (IsClassPower).
 */
function legacyPowerstatKeywords(
  value: string | undefined,
  baseClass: string,
): string[] {
  return (value ?? "").split(",").flatMap((entry) => {
    const [keyword = "", classId] = entry.split("?", 2);
    if (classId !== undefined && key(classId) !== key(baseClass)) return [];
    const trimmed = keyword.trim();
    return trimmed === "" ? [] : [trimmed];
  });
}

/**
 * The equipment- and origin-dependent channels of native BuildKeywordSet
 * for one row: `ptr4` is WeaponBase (the WeaponEquiv or Quarterstaff a
 * weapon power attacks as, the loot's own base for any other power) and the
 * off hand is DetermineOffhand's.
 *
 * - Weapon powers: "Melee Weapon" (else "Ranged Weapon"), "<group>
 *   group(weapon)", and the off-hand slot's "one-hand".
 * - Non-weapon powers: the LootImplement name itself ("Staff", "Tome").
 * - Any power: "Ki Focuses Implement" when the base or enchantment is a ki
 *   focus; the base's WeaponEquiv record's group, name, properties and slot
 *   when it is not `ptr4`.
 * - Implement powers: "<LootImplement or base name> implement" and "<group>
 *   implement group" (the base's groups, or its WeaponEquiv record's).
 * - A second weapon or implement in the off hand: "two-weapon"; with two
 *   melee weapons, "two-melee-weapon(-close)", "two-blade" for two blades,
 *   and "two-melee-offhand(-close)" when the main weapon is an off-hand one.
 * - FromMulticlassing: "multiclass" and "multiclass feat".
 * - InsertParagonPath and AdditionalKeywords: the power-level channels of
 *   `legacyPowerClassChannels`, then WeaponBase's and WeaponEnchant's
 *   `_PowerstatKeywords` (Staff of Divinity's conditional "holy symbol
 *   implement" for a Divine character).
 */
function nativeRowKeywords(
  equipment: Loadout,
  input: {
    readonly weaponPower: boolean;
    readonly implementPower: boolean;
    readonly offhand: Loadout | undefined;
    /** The power's own Attack Type field. */
    readonly attackType: string | undefined;
    readonly origin: PowerOrigin | undefined;
    readonly resolve: Parameters<typeof legacyLootImplement>[2];
    readonly classChannels: PowerClassChannels;
  },
): readonly string[] {
  const tags: string[] = [
    ...(input.origin?.multiclass === true ? ["multiclass"] : []),
    ...(input.origin?.multiclassFeat === true ? ["multiclass feat"] : []),
    ...input.classChannels.keywords,
  ];
  // Without a weapon, a melee power's WeaponBase is the Unarmed weapon
  // (withUnarmedWeaponBase), for weapon and non-weapon powers alike; there
  // is no loot, so only the base's own channels below apply.
  if (equipment.unarmed && equipment.requirementBase === undefined) {
    if (input.weaponPower && /melee/iu.test(input.attackType ?? ""))
      tags.push("melee weapon");
    return tags.map(key).filter(Boolean);
  }
  const base =
    input.weaponPower || equipment.unarmed
      ? equipment.requirementBase
      : equipment.lootBase;
  if (base === undefined) return tags.map(key).filter(Boolean);
  // Native WeaponEnchant: the enchantment, else a magic item base itself.
  const enchant =
    equipment.lootEnchant ??
    (key(equipment.lootBase?.type ?? "") === "magic item"
      ? equipment.lootBase
      : undefined);
  // The loot records are already overlaid (withOverlaidItems), so a
  // conditional `modify name="this"` list-addition is read here.
  for (const record of enchant === undefined ? [base] : [base, enchant])
    tags.push(
      ...legacyPowerstatKeywords(
        field(record, "_PowerstatKeywords"),
        input.classChannels.baseClass,
      ),
    );
  const isWeapon = (entity: ContentEntity | undefined) =>
    key(entity?.type ?? "") === "weapon";
  if (input.weaponPower) {
    const type = legacyWeaponType(base);
    if (type.melee) tags.push("melee weapon");
    else if (type.ranged) tags.push("ranged weapon");
    tags.push(
      ...legacyKeywordList(field(base, "Group")).map(
        (group) => `${group} group(weapon)`,
      ),
    );
  }
  if (isWeapon(base) && key(field(base, "Item Slot") ?? "") === "off-hand")
    tags.push("one-hand");
  if (equipment.unarmed) return tags.map(key).filter(Boolean);
  const lootImplement = legacyLootImplement(base, enchant, input.resolve);
  if (!input.weaponPower) tags.push(...legacyKeywordList(lootImplement));
  if (legacyIsKiFocus(base) || legacyIsKiFocus(enchant))
    tags.push("ki focuses implement");
  const equivalent =
    equipment.lootBase === undefined
      ? undefined
      : input.resolve.weaponEquiv(equipment.lootBase);
  const mainEquivalent = equivalent === base ? undefined : equivalent;
  if (input.implementPower) {
    tags.push(
      ...legacyKeywordList(lootImplement || base.name).map(
        (name) => `${name} implement`,
      ),
    );
    const groupSource = isWeapon(base) ? base : mainEquivalent;
    tags.push(
      ...legacyKeywordList(field(groupSource ?? emptyEntity, "Group")).map(
        (group) => `${group} implement group`,
      ),
    );
  }
  if (mainEquivalent !== undefined) {
    tags.push(
      ...legacyKeywordList(field(mainEquivalent, "Group")).map(
        (group) => `${group} group`,
      ),
      mainEquivalent.name,
      ...legacyKeywordList(field(mainEquivalent, "Properties")),
    );
    if (isWeapon(mainEquivalent)) {
      const slot = field(mainEquivalent, "Item Slot") ?? "";
      tags.push(...legacyKeywordList(slot));
      if (key(slot) === "off-hand") tags.push("one-hand");
    }
  }
  const offhand = input.offhand;
  if (offhand !== undefined) {
    tags.push("two-weapon");
    // Native OffhandWeaponBase: the off-hand loot's `_Secondary End`, else
    // its WeaponBase for this power.
    const secondaryEnd = field(
      offhand.lootBase ?? emptyEntity,
      "_Secondary End",
    )?.trim();
    const offhandBase =
      (secondaryEnd === undefined || secondaryEnd === ""
        ? undefined
        : input.resolve.record(secondaryEnd)) ??
      (input.weaponPower ? offhand.requirementBase : offhand.lootBase);
    if (legacyWeaponType(base).melee && legacyWeaponType(offhandBase).melee) {
      const attackType = input.attackType ?? "";
      const melee = /melee/iu.test(attackType);
      const close = !melee && /close/iu.test(attackType);
      if (melee) tags.push("two-melee-weapon");
      else if (close) tags.push("two-melee-weapon-close");
      const blade = (entity: ContentEntity | undefined) =>
        /light blade|heavy blade/iu.test(
          field(entity ?? emptyEntity, "Group") ?? "",
        );
      if (blade(base) && blade(offhandBase)) tags.push("two-blade");
      if (/off-hand/iu.test(field(base, "Properties") ?? "")) {
        if (melee) tags.push("two-melee-offhand");
        else if (close) tags.push("two-melee-offhand-close");
      }
    }
  }
  return tags.map(key).filter(Boolean);
}

/**
 * A power row's keyword set (native BuildKeywordSet and AddLaterKeywords),
 * which `<keywords>:attack`, `:damage` and `:die` stats test with
 * IsKeyword: the item's tags, the power's name, attack type and keywords,
 * the basic-attack kind, the defense and the attack ability.
 */
function rowKeywordTags(
  equipment: Loadout,
  power: ContentEntity,
  attackType: string | undefined,
  context: {
    readonly keywords: readonly string[];
    readonly defense?: string;
    readonly byId: ReadonlyMap<string, ContentEntity>;
    readonly basicAttackKind?: "melee" | "ranged" | undefined;
    readonly attackStat?: string;
    /** The row's equipment- and origin-dependent channels
     * (nativeRowKeywords). */
    readonly nativeKeywords?: readonly string[];
  },
): { readonly tags: ReadonlySet<string>; readonly powerTags: string[] } {
  const attackTypeTags = (() => {
    const normalized = key(attackType ?? "");
    if (/melee\s+or\s+ranged/.test(normalized)) {
      if (equipment.weaponCategory?.includes("ranged")) return ["ranged"];
      if (equipment.weaponCategory?.includes("melee")) return ["melee"];
    }
    return ["melee", "ranged", "area", "close"].filter((candidate) =>
      new RegExp(`\\b${candidate}\\b`).test(normalized),
    );
  })();
  const powerTags = [
    key(power.name),
    key(power.name).replace(/\s+attack$/, ""),
    ...attackTypeTags,
    ...(context.basicAttackKind ? [`${context.basicAttackKind} basic`] : []),
  ].filter(Boolean);
  const tags = new Set([
    ...equipment.tags.filter((tag) => tag !== "weapon" && tag !== "implement"),
    ...equipment.definitionIds.map(key),
    ...powerTags,
    ...legacyPowerKeywordTags(power, context.byId),
    ...context.keywords.map(key),
    key(context.defense ?? ""),
    key(context.attackStat ?? ""),
    ...(context.nativeKeywords ?? []),
  ]);
  return { tags, powerTags };
}

/** The bonus types native CalcBAB registers for a row's built-in attack
 *  parts (besides "Enhancement"). */
const NATIVE_ATTACK_TYPES = {
  abilityModifier: "abilmod",
  halfLevel: "HALF-LEVEL",
  proficiency: "Proficiency Bonus",
} as const;

/** A `<keywords>:<channel>` stat whose comma-separated keyword list names
 *  `weapon` ("Polearm group,weapon:damage", "weapon:damage"). */
function statNeedsWeaponKeyword(statName: string): boolean {
  const keywords = /^(.*):[^:]*$/u.exec(key(statName))?.[1];
  return (
    keywords !== undefined &&
    keywords.split(",").some((token) => token.trim() === "weapon")
  );
}

type TypedPowerComponent = {
  readonly component: PowerComponent;
  readonly bonusType?: string;
};

/**
 * The stat contributions a row reads for one channel, typed bonuses not yet
 * stacked. Native PowerStats keeps one att_type_max/dmg_type_max list per row
 * (D20Workspace.PowerStats, Module CalcDamage/CalcKeywords/CalcGlobal/
 * DamageKeyword's GetCharStatMax), so a row that reads stats along two paths
 * (an implement power used through a weapon) stacks their entries together
 * with `stackTypedComponents`.
 */
function combatStatEntries(
  stats: Readonly<Record<string, EvaluatedStat>>,
  equipment: Loadout,
  power: ContentEntity,
  kind: "weapon" | "implement",
  fieldName: "attack" | "damage",
  attackType: string | undefined,
  context: {
    keywords: readonly string[];
    defense?: string;
    byId: ReadonlyMap<string, ContentEntity>;
    basicAttackKind?: "melee" | "ranged" | undefined;
    /** Native AddLaterKeywords: the attack ability is a keyword too. */
    attackStat?: string;
    nativeKeywords?: readonly string[];
    /**
     * Built-in typed bonuses the row already holds (native CalcBAB
     * registers the attack's ability modifier, half level, proficiency and
     * enhancement, and CalcDamage the weapon's enhancement, before any
     * keyword stat), sharing maxima with matching stats.
     */
    typedExtras?: readonly {
      readonly bonusType: string;
      readonly component: PowerComponent;
    }[];
    /**
     * Also read the row-wide stats (native CalcGlobal, after CalcKeywords
     * with the same typed maxima): `attack rolls`, or `damage` and, for a
     * damage roll, `damage rolls`, each also limited to the weapon base,
     * enchantment or augment as `attack rolls(<name>)`; with `weaponRolls`
     * (a weapon power with a wielded weapon) `weapon attack rolls` /
     * `weapon damage rolls` too.
     */
    globalStats?: { readonly weaponRolls: boolean };
    /**
     * Native IsDamageRoll (the damage has dice): false for flat damage
     * ("Charisma modifier thunder damage"), which reads neither `:damage`
     * keyword stats nor `damage rolls` (PowerStats/CalcKeywords), only
     * `damage` and `:nonroll-damage`. Defaults to true.
     */
    damageRoll?: boolean;
  },
): TypedPowerComponent[] {
  const damageRoll = fieldName === "damage" && context.damageRoll !== false;
  // Native CalcKeywords: `:damage` stats only for a damage roll,
  // `:nonroll-damage` for any damage.
  const channels: readonly string[] =
    fieldName === "attack"
      ? ["attack"]
      : damageRoll
        ? ["damage", "nonroll-damage"]
        : ["nonroll-damage"];
  const globalNames = new Set(
    context.globalStats === undefined
      ? []
      : fieldName === "attack"
        ? [
            "attack rolls",
            ...(context.globalStats.weaponRolls ? ["weapon attack rolls"] : []),
          ]
        : [
            "damage",
            ...(damageRoll ? ["damage rolls"] : []),
            ...(context.globalStats.weaponRolls ? ["weapon damage rolls"] : []),
          ],
  );
  const { tags, powerTags } = rowKeywordTags(
    equipment,
    power,
    attackType,
    context,
  );
  const relevant = Object.entries(stats).filter(([name]) => {
    const normalized = key(name);
    const global = normalized.match(/^([^:(]*?)(?:\((.*)\))?$/);
    if (global !== null && globalNames.has(global[1]!.trim()))
      return (
        global[2] === undefined ||
        limiterNames(equipment, context.byId).has(global[2])
      );
    // Native CalcKeywords/IsKeyword: comma qualifiers are conjunctive;
    // parenthesized limits identify the selected base/enchantment, not any
    // other implement in the inventory. The evaluated contribution has already
    // enforced training/prerequisites, conditions and numeric expressions.
    const qualified = normalized.match(
      /^(.*):(attack|damage|nonroll-damage)(?:\((.*)\))?$/,
    );
    if (
      qualified &&
      channels.includes(qualified[2]!) &&
      qualified[1]!.split(",").every((tag) => tags.has(key(tag))) &&
      (qualified[3] === undefined ||
        limiterNames(equipment, context.byId).has(qualified[3]))
    )
      return true;
    if (qualified?.[3] !== undefined) return false;
    return channels.some((channel) => {
      const suffix = `${kind}:${channel}`;
      if (normalized === suffix) return true;
      if (normalized.endsWith(`,${suffix}`)) {
        const qualifier = normalized.slice(0, -suffix.length - 1);
        return equipment.tags.includes(qualifier);
      }
      return [...equipment.tags, ...powerTags].some(
        (tag) => normalized === `${tag}:${channel}`,
      );
    });
  });
  const seen = new Set<string>();
  const components: TypedPowerComponent[] = relevant.flatMap(([name, stat]) => {
    if (stat.contributions.length === 0)
      return typeof stat.value === "number" && stat.value !== 0
        ? [{ component: { label: name, value: stat.value } }]
        : [];
    return stat.contributions.flatMap((contribution) => {
      if (
        !contribution.applied ||
        contribution.numericValue === undefined ||
        seen.has(contribution.id)
      )
        return [];
      seen.add(contribution.id);
      return [
        {
          // `type=""` is a real (empty) type natively (StatAddRule.bonusType).
          ...(contribution.bonusType !== undefined
            ? { bonusType: key(contribution.bonusType) }
            : {}),
          component: {
            label: name,
            value: contribution.numericValue,
            source: contribution.providerName,
            provenanceId: contribution.id,
          },
        },
      ];
    });
  });
  // Registered first, so an equal stat bonus of the same type adds nothing.
  components.unshift(
    ...(context.typedExtras ?? []).map((extra) => ({
      bonusType: key(extra.bonusType),
      component: extra.component,
    })),
  );
  return components;
}

/**
 * Native AttackKeyword/DamageKeyword share typed maxima across matching
 * channels; qualifying the same type more narrowly must not stack it twice.
 * The same contribution read along two paths counts once.
 */
function stackTypedComponents(
  entries: readonly TypedPowerComponent[],
): PowerComponent[] {
  const seen = new Set<string>();
  const components = entries.filter(({ component: { provenanceId } }) => {
    if (provenanceId === undefined) return true;
    if (seen.has(provenanceId)) return false;
    seen.add(provenanceId);
    return true;
  });
  const maxima = new Map<string, TypedPowerComponent>();
  for (const entry of components) {
    if (entry.bonusType === undefined) continue;
    const old = maxima.get(entry.bonusType);
    const value = entry.component.value;
    if (
      !old ||
      (value >= 0 &&
        (old.component.value < 0 || value > old.component.value)) ||
      (value < 0 && old.component.value < 0 && value < old.component.value)
    )
      maxima.set(entry.bonusType, entry);
  }
  return components
    .filter(
      (entry) =>
        entry.bonusType === undefined || maxima.get(entry.bonusType) === entry,
    )
    .map(({ component }) => component);
}

function uniquePowerComponents(
  components: readonly PowerComponent[],
): PowerComponent[] {
  const seen = new Set<string>();
  return components.filter(({ provenanceId }) => {
    if (provenanceId === undefined) return true;
    if (seen.has(provenanceId)) return false;
    seen.add(provenanceId);
    return true;
  });
}

const abilityNames = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

function highestAbility(
  stats: Readonly<Record<string, EvaluatedStat>>,
  preferred: readonly string[] = abilityNames,
): string {
  const candidates = preferred.filter((candidate) =>
    abilityNames.some((ability) => key(ability) === key(candidate)),
  );
  return (candidates.length === 0 ? abilityNames : candidates).reduce(
    (best, candidate) => {
      const candidateModifier = numericStat(stats, `${candidate} modifier`);
      const bestModifier = numericStat(stats, `${best} modifier`);
      if (candidateModifier !== bestModifier)
        return candidateModifier > bestModifier ? candidate : best;
      const candidateScore = numericStat(stats, candidate);
      const bestScore = numericStat(stats, best);
      return candidateScore > bestScore ? candidate : best;
    },
  );
}

/**
 * Native HighestAbility (`-Module-.cs` ~23335) and HighestMentalAbility
 * (~23315): the candidate with the highest ability *score*, earlier ones
 * winning ties (Strength..Charisma; Intelligence, Wisdom, Charisma).
 */
function highestScoreAbility(
  stats: Readonly<Record<string, EvaluatedStat>>,
  candidates: readonly string[] = abilityNames,
): string {
  return candidates.reduce((best, candidate) =>
    numericStat(stats, candidate) > numericStat(stats, best) ? candidate : best,
  );
}

const MENTAL_ABILITIES = ["Intelligence", "Wisdom", "Charisma"] as const;

/** The "Chosen Ability" text string's ability (native ChosenAbility). */
function chosenAbility(
  textStrings: Readonly<Record<string, string>>,
): string | undefined {
  const value = textValue(textStrings, "Chosen Ability")?.trim() ?? "";
  return abilityNames.find((ability) => key(ability) === key(value));
}

/**
 * The ability native CalcStatVsDefense (`-Module-.cs` ~23753) reads from a
 * special attack-stat phrase, left of " vs" (parsed at pack build):
 * - "Highest Mental Ability" (exact, AttackSpecialCase) → the best of
 *   Intelligence, Wisdom and Charisma;
 * - a "your highest ability" prefix → HighestAbility over all six scores;
 * - a "Chosen Ability" prefix → the "Chosen Ability" text string (Abiding
 *   Reaper's choice); "Unknown" without one, as there is nothing to add.
 *
 * Divergence (D105): native matches only "your highest ability", so the
 * bare "Highest ability vs. AC" / "Highest ability modifier + 2 vs. Will"
 * lines (Avandra's Curse, Diverting Taunt, the Dragon-magazine and
 * elemental-companion powers) parse to the non-ability "ability" and add no
 * modifier. Their text means the same as the "your" form, so they resolve
 * the same way.
 */
function specialAttackAbility(
  special: AttackLineIr["special"],
  stats: Readonly<Record<string, EvaluatedStat>>,
  chosen: string | undefined,
): string | undefined {
  if (special === "highest-mental")
    return highestScoreAbility(stats, MENTAL_ABILITIES);
  if (special === "highest") return highestScoreAbility(stats);
  if (special === "chosen") return chosen ?? "Unknown";
  return undefined;
}

/**
 * The line a row attacks with (parsed at pack build): "<Ability> (thrown
 * weapon) or <Ability>" takes the first ability with a thrown weapon, the
 * second with any other (Reactive Shot; D105, Martial Power 2 p41: native
 * WhichAttack splits it by ranged-ness instead), and a dual power's line
 * (native WhichAttack/IsDualPower, `-Module-.cs` ~23628) takes its second
 * alternative with a ranged weapon, else its first.
 */
function rowAttackLine(
  field: AttackFieldIr,
  thrownWeapon: boolean,
  rangedWeapon: boolean,
): AttackLineIr {
  const choice = thrownWeapon ? (field.thrown ?? field.other) : field.other;
  return "alternatives" in choice
    ? choice.alternatives[rangedWeapon ? 1 : 0]
    : choice.line;
}

interface AuthoredAttack {
  readonly ordinal: number;
  readonly line: string;
  readonly field: AttackFieldIr;
  readonly target?: string;
  readonly hit?: string;
  readonly attackType?: string;
}

/**
 * The power's attacks: each attack slot's field (with the character's
 * `modify` overlays) by attack ordinal, the last field of a role winning;
 * an attack only when its line names a defense.
 */
function authoredAttacks(
  power: ContentEntity,
  overlays: readonly FieldOverlay[],
  texts: PowerTexts,
  level: number,
): readonly AuthoredAttack[] {
  const attacks = new Map<number, string>();
  const targets = new Map<number, string>();
  const hits = new Map<number, string>();
  const attackTypes = new Map<number, string>();
  for (const [specificOrdinal, role, ordinal, fromLevel] of texts.slots) {
    // A "Level N" header's fields replace their namesakes from level N
    // (native FindLine), "As above, but " stripped.
    if (fromLevel !== undefined && fromLevel > level) continue;
    const specific = power.specifics.find(
      (candidate) => candidate.ordinal === specificOrdinal,
    );
    if (specific === undefined) continue;
    let value = specific.value;
    for (const overlay of overlays) {
      if (
        overlay.targetDefinitionIds.includes(power.id) &&
        key(overlay.field) === key(specific.name)
      ) {
        value = modifiedFieldValue(value, overlay) ?? "";
      }
    }
    const text =
      fromLevel === undefined ? value.trim() : levelHeaderText(value.trim());
    if (role === "target" && text.length > 0) targets.set(ordinal, text);
    if (role === "attack" && texts.attack(text).isAttack)
      attacks.set(ordinal, text);
    if (role === "hit") hits.set(ordinal, text);
    if (role === "attack-type") attackTypes.set(ordinal, text);
  }
  return [...attacks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([ordinal, line]) => {
      const target = targets.get(ordinal);
      const hit = hits.get(ordinal);
      const attackType = attackTypes.get(ordinal);
      return {
        ordinal,
        line,
        field: texts.attack(line),
        ...(target === undefined ? {} : { target }),
        ...(hit === undefined ? {} : { hit }),
        ...(attackType === undefined ? {} : { attackType }),
      };
    });
}

/**
 * The ability an authored attack line uses for this character: an explicit
 * ability choice when the line allows it, else the best of the abilities it
 * names, else a native special phrase (highest / highest mental / chosen
 * ability), else (for "primary ability") native HighestAbility: the highest
 * of all six scores, earlier ones winning ties. Native CalcStatVsDefense
 * (`-Module-.cs` ~23753) maps the "Primary ability" prefix to HighestAbility
 * (~23335) whatever the class's key abilities are.
 */
function attackLineAbility(
  line: AttackLineIr,
  stats: Readonly<Record<string, EvaluatedStat>>,
  explicitAbilityChoice: string | undefined,
  chosen?: string,
): string {
  const special = specialAttackAbility(line.special, stats, chosen);
  if (special !== undefined) return special;
  if (
    explicitAbilityChoice !== undefined &&
    ((line.abilities ?? []).some(
      (ability) => ability === explicitAbilityChoice,
    ) ||
      line.primaryAbility === true)
  )
    return explicitAbilityChoice;
  if (line.abilities !== undefined && line.abilities.length > 0)
    return highestAbility(stats, line.abilities);
  return line.primaryAbility === true ? highestScoreAbility(stats) : "Unknown";
}

export interface PowerAttackProfile {
  /** The ability each attack uses for this character, first attack first. */
  readonly abilities: readonly string[];
  /** The defenses its attacks target (AC, Fortitude, Reflex, Will). */
  readonly defenses: readonly string[];
}

/**
 * What a power attacks with and against, from its authored attack lines,
 * resolving ability choices the same way evaluated powers do. Used to sort
 * and filter powers that are not (yet) part of the character.
 */
export function powerAttackProfile(
  power: ContentEntity,
  input: {
    readonly stats: Readonly<Record<string, EvaluatedStat>>;
    readonly activeDefinitionIds: readonly string[];
    readonly byId: ReadonlyMap<string, ContentEntity>;
    /** The character's level (a "Level N" header's attack from N). */
    readonly level?: number;
  },
): PowerAttackProfile {
  const abilities = new Set<string>();
  const defenses = new Set<string>();
  for (const { field } of authoredAttacks(
    power,
    [],
    powerTexts(power),
    input.level ?? 0,
  )) {
    const ability = attackLineAbility(
      authoredAttackLine(field),
      input.stats,
      undefined,
    );
    if (ability !== "Unknown") abilities.add(ability);
    for (const defense of field.defenses ?? []) defenses.add(defense);
  }
  return { abilities: [...abilities], defenses: [...defenses] };
}

/**
 * Native AttackPowerModRepl's by-name branches: these powers' `+N` becomes
 * the tier bonus whatever their attack line says (Dragon Breath's increase
 * is only in its Hit line). Below the tier the authored `+N` stands. Its
 * exact increase lines are matched at pack build (`AttackBonusIr.tier`).
 */
const NATIVE_NAMED_INCREASES: readonly {
  readonly name: string;
  readonly paragon?: number;
  readonly epic: number;
}[] = [
  { name: EXCEPTION_NAMES.bloodDrain, paragon: 4, epic: 6 },
  { name: EXCEPTION_NAMES.razorStorm, paragon: 4, epic: 6 },
  { name: EXCEPTION_NAMES.dragonBreath, paragon: 4, epic: 6 },
  { name: EXCEPTION_NAMES.dragonsWrath, epic: 6 },
];

/**
 * Native CalcStatVsDefense (-Module-.cs ~23818): an attack stat ending
 * "+ 1 per enemy adjacent to you" (Valiant Strike) adds no number; the row
 * gets this reminder instead.
 */
const PER_ADJACENT_ENEMY_REMINDER =
  "+1 attack bonus per enemy adjacent to you.";

/** A row without a hit text reads an empty damage expression. */
const emptyHitLine = parseHitLine("").other;

/** The attack line's "+N" at this level (native CalcStatVsDefense and
 *  AttackPowerModRepl). */
function powerBonusAtLevel(
  bonus: AttackBonusIr,
  level: number,
  powerName: string,
): number {
  if (bonus.perAdjacentEnemy === true) return 0;
  const native =
    bonus.tier ??
    NATIVE_NAMED_INCREASES.find(({ name }) => key(name) === key(powerName));
  if (native !== undefined && (bonus.base ?? 0) !== 0)
    return (
      (level >= 21 ? native.epic : level >= 11 ? native.paragon : undefined) ??
      bonus.base ??
      0
    );
  let value = bonus.base ?? 0;
  for (const step of bonus.steps ?? [])
    if (step.level <= level) value = step.bonus;
  return value;
}

/** The hit line this level reads (native HigherLevelDamage, parsed at pack
 *  build), or undefined without a hit text. */
function hitLineAtLevel(
  texts: PowerTexts,
  value: string | undefined,
  level: number,
): HitLineIr | undefined {
  return value === undefined ? undefined : hitLineAt(texts.hit(value), level);
}

/**
 * Native CalcStrikers: Hunter's Quarry, Warlock's Curse and Sneak Attack, by
 * their standard feature (whose Name and Usage the reminder reads), or the
 * hybrid feature for that class's powers (HasStrikerFeature).
 */
const strikerFeatures = [
  {
    standardId: key(EXCEPTION_IDS.huntersQuarry),
    hybridId: key(EXCEPTION_IDS.hybridHuntersQuarry),
    hybridClassId: key(EXCEPTION_IDS.rangerClass),
    fallbackName: "Hunter's Quarry",
  },
  {
    standardId: key(EXCEPTION_IDS.warlocksCurse),
    hybridId: key(EXCEPTION_IDS.hybridWarlocksCurse),
    hybridClassId: key(EXCEPTION_IDS.warlockClass),
    fallbackName: "Warlock's Curse",
  },
  {
    standardId: key(EXCEPTION_IDS.sneakAttack),
    hybridId: key(EXCEPTION_IDS.hybridSneakAttack),
    hybridClassId: key(EXCEPTION_IDS.rogueClass),
    fallbackName: "Sneak Attack",
    weaponRestricted: true,
  },
] as const;

function textValue(
  values: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  return Object.entries(values).find(
    ([candidate]) => key(candidate) === key(name),
  )?.[1];
}

/** The row's weapon as native CalcStrikers sees it. */
interface StrikerWeapon {
  readonly weaponPower: boolean;
  /** Native WeaponBase(main hand, power): the row's weapon record (the
   * Unarmed weapon for a melee power without one), undefined for none. */
  readonly base: ContentEntity | undefined;
  /** The base's overlay-resolved Group entries. */
  readonly groups: readonly string[];
  /** Native NormalizedName of the base. */
  readonly normalizedName: string | undefined;
  /** Native GetStatText(name, '+'). */
  readonly statText: (name: string) => string | undefined;
}

/**
 * Native DiceAdjustment: "<feature> Dice(<weapon name>)" and
 * "<feature> Dice(<group> group)" stats (Longsword Finesse's -1 die).
 */
function strikerDiceAdjustment(
  stats: Readonly<Record<string, EvaluatedStat>>,
  diceName: string,
  weapon: StrikerWeapon,
): number {
  if (weapon.base === undefined) return 0;
  return [
    weapon.base.name,
    ...weapon.groups.map((group) => `${group} group`),
  ].reduce(
    (sum, limit) => sum + numericStat(stats, `${diceName}(${limit})`),
    0,
  );
}

/**
 * Native CalcStrikers' Sneak Attack weapons: a weapon power whose weapon is
 * in the light blade or sling group or is a hand crossbow or shortbow by
 * name, or whose normalized name or "<group> group" is in the '+'-joined
 * "Sneak Attack Weapons" text (Longsword Finesse, Street Thug, …).
 */
function sneakAttackWeapon(weapon: StrikerWeapon): boolean {
  if (!weapon.weaponPower || weapon.base === undefined) return false;
  const groups = weapon.groups.join(",");
  if (
    legacyListContainsOneOf(EXCEPTION_NAMES.sneakAttackGroups, groups) ||
    legacyListContains(EXCEPTION_NAMES.sneakAttackWeapons, weapon.base.name)
  )
    return true;
  const text = (weapon.statText(EXCEPTION_NAMES.sneakAttackWeaponsText) ?? "")
    .replaceAll("+", ",")
    .replace(/^,/u, "");
  if (text === "") return false;
  return (
    (weapon.normalizedName !== undefined &&
      legacyListContains(text, weapon.normalizedName)) ||
    legacyListContainsOneOf(
      text,
      weapon.groups.map((group) => `${group} group`).join(","),
    )
  );
}

function conditionalStrikerDamage(input: {
  readonly activeDefinitionIds: readonly string[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly textStrings: Readonly<Record<string, string>>;
  readonly power: ContentEntity;
  readonly weapon: StrikerWeapon;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly overlays: readonly FieldOverlay[];
}): readonly PowerConditionalDamage[] {
  const activeIds = new Set(input.activeDefinitionIds.map(key));
  return strikerFeatures.flatMap((feature) => {
    const standard = activeIds.has(feature.standardId);
    const hybrid = activeIds.has(feature.hybridId);
    if (!standard && !hybrid) return [];
    if (
      hybrid &&
      !standard &&
      !input.power.categories.some(
        (category) => key(category) === feature.hybridClassId,
      )
    )
      return [];
    if (
      "weaponRestricted" in feature &&
      feature.weaponRestricted &&
      !sneakAttackWeapon(input.weapon)
    )
      return [];
    const record = input.byId.get(feature.standardId);
    const name = record?.name ?? feature.fallbackName;
    const diceName = `${name} Dice`;
    const dice =
      numericStat(input.stats, diceName) +
      strikerDiceAdjustment(input.stats, diceName, input.weapon);
    const flat = numericStat(input.stats, name);
    if (dice <= 0 && flat === 0) return [];
    const die = textValue(input.textStrings, `${name} Die`) ?? "d6";
    const diceExpression = dice > 0 ? `${dice}${die}` : "";
    const expression = [
      diceExpression,
      flat === 0 ? "" : `${flat > 0 && diceExpression ? "+" : ""}${flat}`,
    ].join("");
    // Native: "once per <Usage>", the feature's Usage field or "round".
    const usage =
      (record === undefined
        ? undefined
        : effectiveField(record, "Usage", input.overlays)
      )?.trim() || "round";
    return [
      {
        source: name,
        expression,
        condition: `once per ${usage.toLocaleLowerCase()}`,
      },
    ];
  });
}

/** Native CalcConditionals/InfoKeyword reminders, kept out of ordinary totals. */
function powerAdditionalEffects(input: {
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly power: ContentEntity;
  readonly equipment: Loadout;
  readonly keywords: readonly string[];
  readonly attackType?: string;
  readonly attackStat: string;
  readonly defense: string;
  readonly hasAttack: boolean;
  readonly damage?: string;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly basicAttackKind?: "melee" | "ranged" | undefined;
  readonly nativeKeywords?: readonly string[];
}): readonly PowerAdditionalEffect[] {
  const tags = new Set([
    ...(input.nativeKeywords ?? []),
    ...input.keywords.map(key),
    ...input.equipment.tags,
    ...input.equipment.properties,
    key(input.power.name),
    ...input.power.categories.map(key),
    ...input.equipment.definitionIds.map(key),
    ...legacyPowerKeywordTags(input.power, input.byId),
    key(field(input.power, "Class ID") ?? ""),
    key(input.attackStat),
    key(input.defense),
    ...["melee", "ranged", "close", "area"].filter((tag) =>
      new RegExp(`\\b${tag}\\b`, "i").test(input.attackType ?? ""),
    ),
  ]);
  if (/melee\s+or\s+ranged/i.test(input.attackType ?? "")) {
    tags.delete(input.equipment.rangedWeapon ? "melee" : "ranged");
  }
  const basicAttack =
    /^(?:Melee|Ranged) Basic Attack$/i.test(input.power.name) ||
    input.basicAttackKind !== undefined;
  if (basicAttack) {
    tags.add("basic");
    tags.add(`${tags.has("ranged") ? "ranged" : "melee"} basic`);
  }
  const damageRoll = /\d+d\d+/i.test(input.damage ?? "");
  const globals = new Map([
    ["attack rolls", "attack"],
    ["damage", "damage"],
    ["damage rolls", "damage-roll"],
    [
      "weapon attack rolls",
      tags.has("weapon") && !input.equipment.unarmed ? "attack" : "none",
    ],
    [
      "weapon damage rolls",
      tags.has("weapon") && !input.equipment.unarmed ? "damage-roll" : "none",
    ],
  ]);
  const seen = new Set<string>();
  return Object.entries(input.stats).flatMap(([name, stat]) => {
    const normalized = key(name);
    const qualified = normalized.match(
      /^(.*):(attack|damage|damage-roll|info)(?:\((.*)\))?$/,
    );
    const kind = globals.get(normalized) ?? qualified?.[2];
    if (kind === undefined || kind === "none") return [];
    if (kind === "attack" && !input.hasAttack) return [];
    if (kind === "damage" && input.damage === undefined) return [];
    if (kind === "damage-roll" && !damageRoll) return [];
    // Native comma keywords are a conjunction; parenthesized limits name the
    // selected weapon/base/enchantment, not another owned inventory variant.
    if (qualified !== null && qualified !== undefined) {
      if (!qualified[1]?.split(",").every((tag) => tags.has(key(tag))))
        return [];
      const limiter = qualified[3];
      if (
        limiter !== undefined &&
        !limiterNames(input.equipment, input.byId).has(limiter)
      )
        return [];
    }
    return stat.contributions.flatMap((contribution) => {
      const identity = `${contribution.id}:${kind === "damage-roll" ? "damage" : kind}`;
      if (seen.has(identity) || contribution.reason === "equipment") return [];
      if (
        !basicAttack &&
        (/opportunity attack/i.test(contribution.condition ?? "") ||
          /^(?:on any successful charge|when you charge)$/i.test(
            contribution.condition ?? "",
          ))
      )
        return [];
      if (kind === "info") {
        if (!contribution.applied && contribution.reason !== "conditional")
          return [];
        const text = contribution.value.trim();
        if (!text) return [];
        seen.add(identity);
        return [
          {
            text,
            source: contribution.providerName,
            provenanceId: contribution.id,
          },
        ];
      }
      if (contribution.reason !== "conditional" || !contribution.condition)
        return [];
      const value = contribution.numericValue;
      if (value === 0) return [];
      const amount =
        value === undefined
          ? contribution.value
          : `${value > 0 ? "+" : ""}${value}`;
      const bonus =
        (contribution.bonusType ?? "").trim() === ""
          ? ""
          : ` ${contribution.bonusType} bonus`;
      const text = `${amount}${bonus} to ${kind === "attack" ? "attack rolls" : "damage rolls"} ${contribution.condition} - ${contribution.providerName}.`;
      seen.add(identity);
      return [
        {
          text,
          source: contribution.providerName,
          provenanceId: contribution.id,
        },
      ];
    });
  });
}

/**
 * Legacy CalcHealing reads the "Healing", "<power name>:healing" and
 * "<class>:healing" stats, typed bonuses sharing one maximum. Content also
 * keys healing by the power's internal ID (Vigorous Spirit) or a keyword
 * (Golden Halo's "divine:healing"), which legacy never reads but the rules
 * intend, so those count too. Conditional bonuses become reminders.
 */
function powerHealing(
  stats: Readonly<Record<string, EvaluatedStat>>,
  names: readonly string[],
): PowerHealing | undefined {
  const wanted = new Set(names.map(key));
  const untyped: PowerComponent[] = [];
  const typed = new Map<string, PowerComponent>();
  const conditional: PowerConditionalHealing[] = [];
  const seen = new Set<string>();
  for (const [name, stat] of Object.entries(stats)) {
    if (!wanted.has(key(name))) continue;
    for (const contribution of stat.contributions) {
      if (seen.has(contribution.id)) continue;
      seen.add(contribution.id);
      if (!contribution.applied) {
        const dice = /^\+?(\d+d\d+)$/i.exec(contribution.value.trim())?.[1];
        const amount =
          dice ??
          (contribution.numericValue === undefined
            ? undefined
            : String(contribution.numericValue));
        if (
          contribution.reason === "conditional" &&
          contribution.condition !== undefined &&
          amount !== undefined
        )
          conditional.push({
            amount,
            condition: contribution.condition,
            source: contribution.providerName,
            provenanceId: contribution.id,
          });
        continue;
      }
      if (contribution.numericValue === undefined) continue;
      const component: PowerComponent = {
        label: name,
        value: contribution.numericValue,
        source: contribution.providerName,
        provenanceId: contribution.id,
      };
      if (contribution.bonusType === undefined) {
        untyped.push(component);
        continue;
      }
      const type = key(contribution.bonusType);
      if ((typed.get(type)?.value ?? -Infinity) < component.value)
        typed.set(type, component);
    }
  }
  const components = [...untyped, ...typed.values()];
  const bonus = components.reduce((sum, part) => sum + part.value, 0);
  return bonus === 0 && conditional.length === 0
    ? undefined
    : { bonus, components: bonus === 0 ? [] : components, conditional };
}

/** Sums the applied "+NdM" contributions to the power's extra-damage stats. */
function powerExtraDamage(
  stats: Readonly<Record<string, EvaluatedStat>>,
  names: readonly string[],
): PowerExtraDamage | undefined {
  const wanted = new Set(names.map(key));
  const components: PowerDiceComponent[] = [];
  const seen = new Set<string>();
  for (const [name, stat] of Object.entries(stats)) {
    if (!wanted.has(key(name))) continue;
    for (const contribution of stat.contributions) {
      if (!contribution.applied || seen.has(contribution.id)) continue;
      seen.add(contribution.id);
      const dice = /^\+?(\d+d\d+)$/i.exec(contribution.value.trim())?.[1];
      if (dice !== undefined)
        components.push({
          dice: dice.toLocaleLowerCase(),
          source: contribution.providerName,
          provenanceId: contribution.id,
        });
    }
  }
  if (components.length === 0) return undefined;
  const bySize = new Map<number, number>();
  for (const { dice } of components) {
    const [count, size] = dice.split("d").map(Number) as [number, number];
    bySize.set(size, (bySize.get(size) ?? 0) + count);
  }
  return {
    dice: [...bySize]
      .sort(([left], [right]) => right - left)
      .map(([size, count]) => `${count}d${size}`)
      .join(" + "),
    components,
  };
}

interface PowerRange {
  readonly melee: boolean;
  readonly ranged: boolean;
}

const THROWN_MELEE_REQUIREMENT =
  "you must throw your melee weapon at the target.";

/** Legacy IsMeleePower/IsRangedPower, from the power's Attack Type. */
function legacyPowerRange(
  power: ContentEntity,
  attackType: string | undefined,
  weaponPower: boolean,
  fields: {
    readonly requirement: string | undefined;
    readonly weaponRequirement: string | undefined;
  },
): PowerRange {
  const type = key(attackType ?? "");
  const close = /close (?:burst|blast)/.test(type);
  const thrownMelee =
    key(fields.requirement ?? "") === THROWN_MELEE_REQUIREMENT ||
    weaponRequirementThrowsMelee(fields.weaponRequirement);
  return {
    melee: type.includes("melee") || (close && weaponPower) || thrownMelee,
    ranged:
      close ||
      type.includes("area burst") ||
      (type.includes("ranged") && !thrownMelee) ||
      key(power.name) === key(EXCEPTION_NAMES.stabAndShoot),
  };
}

/**
 * Legacy FigureWeaponType: a weapon's "Weapon Category" makes it melee or
 * ranged, and a melee weapon with a Range (thrown) is also ranged. A staff
 * without a weapon base is used as a quarterstaff, which is melee.
 */
function weaponFitsPowerRange(item: Loadout, range: PowerRange): boolean {
  const category =
    item.weaponCategory ?? (item.weaponDefinition ? "" : "melee");
  // Every published weapon has a category; custom content without one is
  // offered to any weapon power rather than to none.
  if (category === "") return true;
  const melee = category.includes("melee");
  const ranged = category.includes("ranged") || (melee && item.rangedWeapon);
  return (melee && range.melee) || (ranged && range.ranged);
}

/**
 * Legacy DetermineOffhand, for a row that attacks with `item`: the same item
 * when two are equipped, else the first other equipped weapon or non-ki-focus
 * implement in inventory order, else a double weapon's other end. An
 * unequipped item has no off hand.
 */
function legacyOffhand(
  item: Loadout,
  equipped: readonly Loadout[],
): Loadout | undefined {
  if (item.unarmed) return undefined;
  if (item.equippedQuantity > 1) return item;
  if (item.equippedQuantity === 1) {
    const other = equipped.find(
      (candidate) =>
        candidate !== item &&
        !candidate.unarmed &&
        candidate.equippedQuantity >= 1 &&
        candidate.offhandCandidate,
    );
    if (other !== undefined) return other;
  }
  return legacyIsDoubleWeapon(item.requirementBase) ? item : undefined;
}

/**
 * The character-level inputs of legacy IsRestricted, bound per item:
 * WeaponBase, DetermineOffhand/OffhandWeaponBase, IsMonkWeapon, the shield
 * checks, VersatileUsedInTwoHands and GetStatText.
 */
function legacyRequirementContext(input: {
  readonly equipped: readonly Loadout[];
  readonly activeDefinitionIds: readonly string[];
  readonly textStrings: Readonly<Record<string, string>>;
  readonly textContributions:
    readonly { readonly name: string; readonly value: string }[] | undefined;
  readonly equipment: EquipmentState | undefined;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly byName: ReadonlyMap<string, readonly ContentEntity[]>;
  /** Native WeaponBase without a weapon (legacyUnarmedWeaponBase). */
  readonly unarmedBase: ContentEntity | undefined;
}): (item: Loadout, meleePower: boolean) => PowerRequirementContext {
  const resolve = (reference: string, type?: string) =>
    input.byId.get(key(reference)) ??
    input.byName
      .get(key(reference))
      ?.find((entity) => type === undefined || key(entity.type) === type) ??
    (type === undefined ? undefined : input.byName.get(key(reference))?.[0]);
  const resolveWeapon = (reference: string) => resolve(reference, "weapon");
  const active = input.activeDefinitionIds.flatMap((id) => {
    const entity = input.byId.get(key(id));
    return entity === undefined ? [] : [entity];
  });
  const sizeContext = legacyLootSlotContext(active);
  const statText = (name: string): string | undefined => {
    if (input.textContributions === undefined)
      return textValue(input.textStrings, name);
    const values = input.textContributions
      .filter((contribution) => key(contribution.name) === key(name))
      .map((contribution) => contribution.value);
    return values.length === 0 ? undefined : values.join("+");
  };
  const unarmedBase = input.unarmedBase;
  const smallWithNonSmall = (weapon: ContentEntity) =>
    legacySmallWithNonSmallWeapon(weapon, sizeContext);
  const shared = {
    versatileUsedTwoHanded: smallWithNonSmall,
    statText,
    resolveWeapon,
  };
  return (item, meleePower) => {
    if (item.unarmed)
      return {
        ...shared,
        mainBase: meleePower ? unarmedBase : undefined,
        monkWeapon: true,
        unarmed: true,
      };
    return {
      ...shared,
      versatileUsedTwoHanded: (weapon: ContentEntity) =>
        smallWithNonSmall(weapon) || item.twoHanded,
      mainBase: item.requirementBase,
      monkWeapon: isLegacyMonkWeapon(
        item.requirementBase,
        item.staff,
        resolveWeapon,
      ),
    };
  };
}

export function evaluatePowers(input: {
  readonly level: number;
  readonly activeDefinitionIds: readonly string[];
  readonly inventory: readonly CharacterInventoryEntry[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly overlays: readonly FieldOverlay[];
  readonly textStrings?: Readonly<Record<string, string>>;
  /** Every applied text string, for legacy GetStatText's '+'-joined values. */
  readonly textContributions?: readonly {
    readonly name: string;
    readonly value: string;
  }[];
  /** The equipped items, for the legacy shield requirements. */
  readonly equipment?: EquipmentState;
  readonly entities: readonly ContentEntity[];
  /** The beast companion's statistics, for "beast's attack bonus" and [B]. */
  /** The character's occurrences, for where each power came from. */
  readonly occurrences?: readonly CharacterOccurrence[];
  readonly beastCompanion?: BeastCompanionStatistics;
}): readonly EvaluatedPower[] {
  const beast = input.beastCompanion;
  // Loot records as native C_RulesElementField reads them: with the
  // character's `modify` overlays (Reaper's Blade's High Crit scythe, a
  // Heartwood Spear's heavy thrown base spear).
  const entities = withOverlaidItems(input.entities, input.overlays);
  const byId = new Map(entities.map((entity) => [key(entity.id), entity]));
  const byName = new Map<string, ContentEntity[]>();
  for (const entity of entities) {
    const named = byName.get(key(entity.name));
    if (named === undefined) byName.set(key(entity.name), [entity]);
    else named.push(entity);
  }
  // The evaluator's resolved loadout; a direct call resolves its own.
  const loadoutState =
    input.equipment?.loadout ??
    legacyLoadoutState(
      input.inventory.map((entry) => ({
        ...entry,
        elements: entry.definitionIds.map((definitionId) => ({
          definitionId,
        })),
      })),
      byId,
      legacyLoadoutHints(input.textStrings),
    );
  // The records whose `modify` overlays may replace a power's text: the
  // pack parsed their values with theirs (`_Power Text IR`).
  const occurrenceDefinitions = new Map(
    (input.occurrences ?? []).map((occurrence) => [
      occurrence.id,
      occurrence.definitionId,
    ]),
  );
  const overlayProviders = [
    ...new Set(
      input.overlays.flatMap((overlay) => {
        const definitionId = occurrenceDefinitions.get(
          overlay.providerOccurrenceId,
        );
        const provider =
          definitionId === undefined ? undefined : byId.get(key(definitionId));
        return provider === undefined ? [] : [provider];
      }),
    ),
  ];
  // Native FindCharElement: an owned element by name or ID.
  const ownedElementKeys = new Set(
    input.activeDefinitionIds.flatMap((id) => {
      const entity = byId.get(key(id));
      return entity === undefined ? [key(id)] : [key(id), key(entity.name)];
    }),
  );
  // Native CalcBeast iterates the character's Companion elements.
  const companionNames = [
    ...new Set(input.activeDefinitionIds.map(key)),
  ].flatMap((id) => {
    const entity = byId.get(id);
    return entity !== undefined && key(entity.type) === "companion"
      ? [entity.name]
      : [];
  });
  const equipped = loadouts(
    input.inventory,
    byId,
    byName,
    input.textStrings ?? {},
    loadoutState,
  );
  // A melee power's Unarmed row attacks with native WeaponBase's unarmed
  // record; any other power keeps the bare Unarmed row.
  const resolveWeaponRecord = (reference: string) =>
    byId.get(key(reference)) ??
    byName.get(key(reference))?.find((entity) => key(entity.type) === "weapon");
  const unarmedWeaponBase = legacyUnarmedWeaponBase(
    input.textStrings ?? {},
    resolveWeaponRecord,
  );
  const meleeEquipped =
    unarmedWeaponBase === undefined
      ? equipped
      : equipped.map((item) =>
          item.unarmed
            ? withUnarmedWeaponBase(
                item,
                unarmedWeaponBase,
                resolveWeaponRecord,
                byId.values(),
              )
            : item,
        );
  // A weapon power's rows read each loot through native WeaponBase/
  // WeaponEnchant's weapon-power branch; one object per loot, so
  // DetermineOffhand's identity tests hold.
  const weaponViews = new Map<Loadout, Loadout>();
  const asWeaponView = (item: Loadout) => {
    let view = weaponViews.get(item);
    if (view === undefined) {
      view = asWeaponPowerLoadout(item);
      weaponViews.set(item, view);
    }
    return view;
  };
  const weaponEquipped = equipped.map(asWeaponView);
  const weaponMeleeEquipped = meleeEquipped.map(asWeaponView);
  const implementResolver = legacyImplementResolver(byId, byName);
  // Legacy GetProficiencyBonus/IsProficient: the bonus needs an owned
  // "Weapon Proficiency (<base weapon or Proficient As>)".
  const weaponProficiencies = new Set(
    input.activeDefinitionIds.flatMap((id) => {
      const match = /^weapon proficiency \((.+)\)$/i.exec(
        byId.get(key(id))?.name.trim() ?? "",
      );
      return match?.[1] === undefined ? [] : [key(match[1])];
    }),
  );
  // Native IsProficient: a Large weapon needs CanUseLargeWeapons (Oversized,
  // or One Size Larger when not Small) before any proficiency counts, its
  // Proficient As included.
  const lootSlotContext = legacyLootSlotContext(
    input.activeDefinitionIds.flatMap((id) => {
      const entity = byId.get(key(id));
      return entity === undefined ? [] : [entity];
    }),
  );
  const canUseLargeWeapons = legacyCanUseLargeWeapons(lootSlotContext);
  // Without any recorded weapon proficiency (incomplete or custom content),
  // keep the bonus rather than strip it from every weapon, as for implements.
  const proficientWithWeapon = (item: Loadout) =>
    (item.largeWeapon !== true || canUseLargeWeapons) &&
    (weaponProficiencies.size === 0 ||
      item.proficiencyNames.length === 0 ||
      item.proficiencyNames.some((name) => weaponProficiencies.has(key(name))));
  // Native ArenaTrainingImprovisedWeapon: with Arena Training, no weapon, a
  // weapon the character is not proficient with, or an improvised weapon
  // deals 1d8 (1d10 two-handed) with a +2 proficiency bonus.
  const hasArenaTraining = input.activeDefinitionIds.some(
    (id) => key(id) === key(EXCEPTION_IDS.arenaTraining),
  );
  const arenaImprovised = (item: Loadout) =>
    hasArenaTraining &&
    ((item.unarmed && item.requirementBase === undefined) ||
      ((item.weaponDefinition || item.staff || item.unarmed) &&
        (!proficientWithWeapon(item) ||
          /improvised/iu.test(
            field(item.requirementBase ?? emptyEntity, "Weapon Category") ??
              item.weaponCategory ??
              "",
          ))));
  // Deliberate departure from legacy PowerStats, which offered every
  // equipped item to implement powers (D081).
  const characterImplementProficiencies = implementProficiencies(
    input.activeDefinitionIds,
    byId,
  );
  const entitiesByName = new Map<string, ContentEntity>();
  for (const entity of byId.values())
    if (!entitiesByName.has(key(entity.name)))
      entitiesByName.set(key(entity.name), entity);
  const origins = powerOrigins(input.occurrences ?? [], byId);
  const requirementContext = legacyRequirementContext({
    equipped,
    activeDefinitionIds: input.activeDefinitionIds,
    textStrings: input.textStrings ?? {},
    textContributions: input.textContributions,
    equipment: input.equipment,
    byId,
    byName,
    unarmedBase: unarmedWeaponBase,
  });
  const activePowerIds = [
    ...new Set(
      input.activeDefinitionIds.flatMap((definitionId) => {
        const power = byId.get(key(definitionId));
        const versions = field(power ?? emptyEntity, "_AugmentVersions")
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          power === undefined ||
          versions === undefined ||
          versions.length === 0
        )
          return [definitionId];
        // Native CharPowerAugmentCount (D20Workspace.cs ~1691): a locked
        // augmentable power (`_SuppressAugments`, which nativePsionics also
        // sets on a Racial Trait's pick) has only its version 0.
        return (effectiveField(power, "_SuppressAugments", input.overlays) ??
          "") === ""
          ? versions
          : versions.slice(0, 1);
      }),
    ),
  ];
  return activePowerIds.flatMap((definitionId) => {
    const power = byId.get(key(definitionId));
    if (power === undefined || key(power.type) !== "power") return [];
    const keywords = (effectiveField(power, "Keywords", input.overlays) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const texts = powerTexts(power, overlayProviders);
    const summonedCreature = summonedCreaturePower(texts, keywords);
    const attackType = effectiveField(power, "Attack Type", input.overlays);
    const rawBasic = effectiveField(power, "_BasicAttack", input.overlays)
      ?.trim()
      .toLowerCase();
    const basicAttackKind: "melee" | "ranged" | undefined =
      rawBasic === "melee" || rawBasic === "ranged"
        ? rawBasic
        : /^melee basic attack$/i.test(power.name)
          ? "melee"
          : /^ranged basic attack$/i.test(power.name)
            ? "ranged"
            : undefined;
    const attackDefinitions = authoredAttacks(
      power,
      input.overlays,
      texts,
      input.level,
    );
    // A summoned creature's commands the summoner rolls (D111): each one's
    // attack and hit texts, parsed at pack build, and the record whose
    // keyed bonuses apply (a merged community card, else the power).
    const creature = readCreatureStatBlock(power.specifics);
    const commandDefinitions =
      creature?.kind !== "master"
        ? []
        : creature.block.powers.flatMap((entry, index) => {
            const roll = entry.roll;
            if (roll === undefined) return [];
            const definition: AuthoredAttack = {
              ordinal: COMMAND_ORDINAL + index,
              line: roll.attack,
              field: texts.attack(roll.attack),
              ...(roll.target === undefined ? {} : { target: roll.target }),
              ...(roll.hit === undefined ? {} : { hit: roll.hit }),
              ...(roll.attackType === undefined
                ? {}
                : { attackType: roll.attackType }),
            };
            return definition.field.isAttack
              ? [{ entry: index, definition, keyedTo: roll.source ?? power }]
              : [];
          });
    // `_CalculatedHit` (content corrections) supplies a damage line for a
    // power whose damage is only in prose, as legacy hardcodes Storm Pillar.
    const hitLine = hitLineAtLevel(
      texts,
      attackDefinitions[0]?.hit ??
        effectiveField(power, "Hit", input.overlays) ??
        effectiveField(power, "_CalculatedHit", input.overlays),
      input.level,
    );
    // Native CalcDamage (-Module-.cs ~24760): Defender's Gambit's damage is
    // its indented secondary "\thit" field (" Hit" in the pack, "5[W] +
    // Strength modifier.") without its last character, plus " damage.".
    const indentedHit =
      key(power.name) === key(EXCEPTION_NAMES.defendersGambit)
        ? power.specifics.find(
            (specific) =>
              /^\s/u.test(specific.name) && key(specific.name) === "hit",
          )?.value
        : undefined;
    const damageHitLine =
      indentedHit === undefined
        ? hitLine
        : hitLineAtLevel(
            texts,
            `${indentedHit.trim().slice(0, -1)} damage.`,
            input.level,
          );
    const effectLine = effectiveField(power, "Effect", input.overlays);
    // Native ParseDamage: `_DamageDie` (set by a feat's `modify`, e.g.
    // Empowered Dragon Breath's d10) replaces the size of the dice.
    const damageDie = effectiveField(power, "_DamageDie", input.overlays);
    // Every authored attack names a defense.
    const hasAttack = attackDefinitions.length > 0;
    const recoveries = recoveryExpressions(
      hitLine?.recoveries,
      effectLine === undefined ? undefined : texts.recoveries(effectLine),
    );
    const weaponPower = keywords.some((value) => key(value) === "weapon");
    // Native NonDamagePower (-Module-.cs ~24736): CalcDamage returns at once
    // for these, whose Hit prose names damage they do not deal.
    const nonDamage =
      key(power.name) === key(EXCEPTION_NAMES.exactingUtterance) ||
      key(power.name).startsWith(
        key(EXCEPTION_NAMES.forcedOpportunityPrefix),
      ) ||
      key(power.id) === key(EXCEPTION_IDS.whispersOfDefeat) ||
      key(power.id) === key(EXCEPTION_IDS.exterminationUrge);
    const implementPower = keywords.some((value) => key(value) === "implement");
    const arcanePower = keywords.some((value) => key(value) === "arcane");
    const powerImplementScope = implementScopeMatcher(
      power,
      keywords,
      input.activeDefinitionIds,
      byId,
      entitiesByName,
    );
    // Legacy PowerStats calculates rows only for a power with a Hit line. We
    // also keep an attack without one, for its attack bonus; a power with
    // neither (Divine Fortune and other utilities) gets no rows.
    const calculated = hasAttack || hitLine !== undefined;
    const ownedImplement = (item: Loadout) =>
      item.unarmed ||
      item.weaponDefinition ||
      item.implementDefinition ||
      item.universalImplement ||
      item.implementScopes.length > 0;
    const weaponRequirement = effectiveField(
      power,
      WEAPON_REQUIREMENT_FIELD,
      input.overlays,
    );
    const powerRange = legacyPowerRange(power, attackType, weaponPower, {
      requirement: effectiveField(power, "Requirement", input.overlays),
      weaponRequirement,
    });
    // Legacy IsValidPowerCombo tests the Implement keyword first, so a power
    // that is both (Hexblade, Swordmage) takes the implement path.
    // Legacy IsRestricted: the power's Requirement may reject a row's
    // weapon. It checks every weapon-power item and, through AllowUnarmed,
    // Unarmed for any power; an implement power's own items are not checked.
    // A `_WeaponRequirement` also reads the extended weapon selectors. Only
    // clauses naming the attacking weapon filter rows: a shield, second
    // weapon or free hand limits when the power is used (D093).
    const requirement = machineReadRequirement(
      effectiveField(power, "Requirement", input.overlays),
      weaponRequirement,
    );
    const extendedRequirement = (weaponRequirement?.trim() ?? "") !== "";
    const restricted = (item: Loadout) =>
      requirement !== "" &&
      (item.unarmed || weaponPower) &&
      isPowerRestricted(
        power,
        requirement,
        requirementContext(item, powerRange.melee),
        { extended: extendedRequirement },
      );
    // Native WeaponBase: a melee power's Unarmed row uses the unarmed
    // record, and a weapon power reads WeaponEquiv/EnchantEquiv.
    const powerEquipped = weaponPower ? weaponEquipped : equipped;
    const rowEquipped = powerRange.melee
      ? weaponPower
        ? weaponMeleeEquipped
        : meleeEquipped
      : powerEquipped;
    const candidates =
      !calculated ||
      key(power.id) === key(EXCEPTION_IDS.coordinatedAssaultAttack) ||
      // Native PowerStats returns no stats for this name (the content
      // record has no Hit line either; this keeps an overlay that adds one
      // from giving it rows).
      key(power.name) === key(EXCEPTION_NAMES.commandersStrike)
        ? []
        : (implementPower
            ? // Legacy offers every owned weapon and implement (its
              // CheckPower accepts any); proficiency only marks the
              // variant (D081).
              rowEquipped.filter(ownedImplement)
            : weaponPower
              ? rowEquipped.filter(
                  (item) =>
                    item.unarmed ||
                    (item.weaponDamage !== undefined &&
                      weaponFitsPowerRange(item, powerRange)),
                )
              : rowEquipped.filter((item) => item.unarmed)
          ).filter((item) => !restricted(item));
    // A power only the beast attacks with uses none of the character's
    // equipment: one variant, not one per weapon with the same numbers.
    const beastOnly =
      beast !== undefined &&
      calculated &&
      (attackDefinitions.length > 0
        ? attackDefinitions.every(
            (definition) =>
              authoredAttackLine(definition.field).beastBonus !== undefined,
          )
        : hitLine?.beastHit === true);
    if (beastOnly && candidates.length > 1) {
      const single = candidates.find((item) => item.unarmed) ?? candidates[0]!;
      candidates.splice(0, candidates.length, single);
    }
    const proficientFor = (item: Loadout) =>
      !implementPower ||
      (weaponPower && item.weaponDefinition) ||
      usableAsImplement(
        item,
        characterImplementProficiencies,
        powerImplementScope,
      );
    // Legacy PowerStats retains every legal equipment variant even for prose
    // that names one hand. The saved main-hand selection describes the active
    // pairing; it must not erase the alternate variants a user can select.
    const handCandidates = candidates;
    const hasDualImplementSpellcaster = input.activeDefinitionIds.some((id) => {
      const entity = byId.get(key(id));
      return (
        key(id) === key(EXCEPTION_IDS.dualImplementSpellcaster) ||
        key(entity?.name ?? "") ===
          key(EXCEPTION_NAMES.dualImplementSpellcaster)
      );
    });
    // Native OverrideStatPower: _KeyAbilityAs reads the overrides of the
    // power it names (Dragon's Wrath as Dragon Breath).
    const keyAbilityAs = field(power, "_KeyAbilityAs")?.trim();
    const keyPower =
      (keyAbilityAs === undefined || keyAbilityAs === ""
        ? undefined
        : (byId.get(key(keyAbilityAs)) ??
          byName
            .get(key(keyAbilityAs))
            ?.find((entity) => key(entity.type) === "power"))) ?? power;
    const keyOrigin = origins.get(key(keyPower.id));
    const keyGrantor =
      keyOrigin?.grantorId === undefined
        ? undefined
        : byId.get(key(keyOrigin.grantorId));
    const keyAbilityContext = (equipment: Loadout): KeyAbilityContext => {
      const weaponBase =
        !equipment.unarmed && (equipment.weaponDefinition || equipment.staff);
      // A staff without a weapon part is native WeaponBase's Quarterstaff.
      const weaponCategory =
        equipment.weaponCategory ??
        key(
          field(equipment.requirementBase ?? emptyEntity, "Weapon Category") ??
            "",
        );
      return {
        power,
        keyPower,
        fieldOf: (entity, name) => effectiveField(entity, name, input.overlays),
        text: (name) => textValue(input.textStrings ?? {}, name),
        score: (ability) => numericStat(input.stats, ability),
        ...(keyOrigin === undefined ? {} : { origin: keyOrigin }),
        ...(keyGrantor === undefined ? {} : { grantor: keyGrantor }),
        weapon: {
          melee: weaponBase && weaponCategory.includes("melee"),
          bowGroup: weaponBase && equipment.tags.includes("bow group"),
          thrown:
            weaponBase &&
            equipment.properties.some(
              (property) =>
                property === "heavy thrown" || property === "light thrown",
            ),
          proficient: weaponBase && proficientWithWeapon(equipment),
        },
      };
    };
    // Native FromMulticlassing reads an augment version's _AugmentParent.
    const augmentParent = field(power, "_AugmentParent")?.trim() ?? "";
    const channelOrigin =
      origins.get(
        key(
          (augmentParent === ""
            ? undefined
            : (byId.get(key(augmentParent)) ??
              byName.get(key(augmentParent))?.[0])
          )?.id ?? power.id,
        ),
      ) ?? origins.get(key(power.id));
    // Native CalcStrikers' WeaponBase: the Unarmed weapon for a melee power
    // without one; for a non-weapon power, the item itself.
    const strikerWeapon = (equipment: Loadout): StrikerWeapon => {
      const context = requirementContext(equipment, powerRange.melee);
      const base = equipment.unarmed
        ? context.mainBase
        : weaponPower
          ? equipment.requirementBase
          : equipment.lootBase;
      return {
        weaponPower,
        base,
        groups: legacyKeywordList(field(base ?? emptyEntity, "Group")),
        normalizedName:
          base === undefined
            ? undefined
            : legacyNormalizedWeaponName(base, context.resolveWeapon),
        statText: context.statText,
      };
    };
    const classChannels = legacyPowerClassChannels(
      power,
      effectiveField(power, "_PowerstatKeywords", input.overlays),
      entities,
      byId,
      byName,
    );
    const variantFor = (equipment: Loadout): PowerVariant => {
      const nativeKeywords = nativeRowKeywords(equipment, {
        weaponPower,
        implementPower,
        offhand: legacyOffhand(equipment, powerEquipped),
        attackType,
        origin: channelOrigin,
        resolve: implementResolver,
        classChannels,
      });
      // Native CalcMisc (`Weapon` fields) and CalcBonuses (build-option
      // riders) on this row's WeaponBase; for an unarmed melee row without
      // an `Unarmed Weapon` that is the Unarmed attack record (no group).
      const fieldBonusBase = strikerWeapon(equipment).base;
      const weaponSpecific = nativePowerFieldBonuses({
        power,
        fieldBonuses: texts.fieldBonuses,
        weaponPower,
        mainhandWeapon: !equipment.unarmed,
        weaponBase:
          fieldBonusBase ??
          (equipment.unarmed && powerRange.melee ? emptyEntity : undefined),
        hasOffhand: legacyOffhand(equipment, powerEquipped) !== undefined,
        ownsElement: (name) => ownedElementKeys.has(key(name)),
        companionNames,
        abilityModifier: (ability) =>
          numericStat(input.stats, `${ability} modifier`),
      });
      // Native CalcBAB/CalcDamage: the wielded item's enhancement is an
      // "Enhancement" bonus, so typed Enhancement stats (Inherent Bonuses)
      // add only what exceeds it.
      const enhancementExtra =
        equipment.enhancement === 0
          ? []
          : [
              {
                bonusType: "Enhancement",
                component: {
                  label: "enhancement bonus",
                  value: equipment.enhancement,
                },
              },
            ];
      // Native CalcKeywords reads `weapon attack/damage rolls` only for a
      // weapon power with a wielded (non-unarmed) weapon.
      const weaponRolls = weaponPower && !equipment.unarmed;
      const thrownWeapon = equipment.properties.some(
        (property) =>
          property === "heavy thrown" || property === "light thrown",
      );
      const explicitAbilityChoice = abilityNames.find((ability) =>
        input.activeDefinitionIds.some((definitionId) => {
          const choice = byId.get(key(definitionId));
          return key(choice?.name ?? "") === key(`${power.name} ${ability}`);
        }),
      );
      // Each attack's key-ability damage flags (native damage_stat and
      // half_damage), by attack ordinal.
      const keyAbilityDamage = new Map<number, KeyAbilityOverride>();
      const chosen = chosenAbility(input.textStrings ?? {});
      // One attack's row; a summoned creature's command reads the bonuses
      // keyed to its own record (D111).
      const computeAttack = (
        definition: AuthoredAttack,
        keyedTo: { readonly id: string; readonly name: string } = power,
      ): PowerAttack => {
        const phaseAttackType = definition.attackType ?? attackType;
        // Native ExtractPowerMods (`-Module-.cs` ~23703): Hawk's Talon's
        // sentence adds a power bonus equal to the Wisdom modifier.
        const extractedBonus =
          definition.field.wisdomPowerBonus === true
            ? numericStat(input.stats, "Wisdom modifier")
            : 0;
        const authoredLine = rowAttackLine(
          definition.field,
          thrownWeapon,
          equipment.rangedWeapon,
        );
        const defense = authoredLine.defense ?? "Unknown";
        // Legacy CalcBAB: the beast's attack bonus replaces the whole
        // calculation; only bonuses keyed to this power add to it.
        if (beast !== undefined && authoredLine.beastBonus !== undefined) {
          const powerBonus =
            authoredLine.beastBonus ||
            powerBonusAtLevel(authoredLine.bonus, input.level, power.name);
          const attackComponents: PowerComponent[] = [
            { label: "beast's attack bonus", value: beast.attackBonus },
            ...(powerBonus === 0
              ? []
              : [{ label: "power attack bonus", value: powerBonus }]),
            ...powerSpecificComponents(input.stats, keyedTo, "attack"),
          ];
          return {
            id: `${power.id}:attack-${definition.ordinal}`,
            ordinal: definition.ordinal,
            attackStat: BEAST_ATTACK_STAT,
            powerBonus,
            defense,
            attackBonus: attackComponents.reduce(
              (sum, component) => sum + component.value,
              0,
            ),
            ...(definition.target === undefined
              ? {}
              : { target: definition.target }),
            ...(phaseAttackType === undefined
              ? {}
              : { attackType: phaseAttackType }),
            attacker: "beast",
            attackComponents,
          };
        }
        // A summoned creature attacks with your level plus a fixed bonus;
        // no ability, weapon or implement applies, only the creature's own
        // bonuses and bonuses keyed to this power.
        const levelAttack = authoredLine.levelAttack;
        if (levelAttack !== undefined) {
          const powerBonus = levelAttack.bonus;
          const attackComponents: PowerComponent[] = [
            { label: "your level", value: input.level },
            { label: "power attack bonus", value: powerBonus },
            ...(summonedCreature
              ? creatureStatComponents(
                  input.stats,
                  ["attack rolls"],
                  "creature attack bonus",
                )
              : []),
            ...powerSpecificComponents(input.stats, keyedTo, "attack"),
          ];
          return {
            id: `${power.id}:attack-${definition.ordinal}`,
            ordinal: definition.ordinal,
            attackStat: LEVEL_ATTACK_STAT,
            powerBonus,
            defense: levelAttack.defense,
            attackBonus: attackComponents.reduce(
              (sum, component) => sum + component.value,
              0,
            ),
            ...(definition.target === undefined
              ? {}
              : { target: definition.target }),
            ...(phaseAttackType === undefined
              ? {}
              : { attackType: phaseAttackType }),
            attackComponents,
          };
        }
        // Native OverrideStat compares against the attack line's own
        // ability; the `<power> <ability>` choice element comes after its
        // text-string and Key Ability overrides.
        const keyContext = keyAbilityContext(equipment);
        const override = keyAbilityOverride(
          attackLineAbility(authoredLine, input.stats, undefined, chosen),
          keyContext,
        );
        let attackStat =
          override.ability ??
          attackLineAbility(
            authoredLine,
            input.stats,
            explicitAbilityChoice,
            chosen,
          );
        let damageOverride: KeyAbilityOverride = override;
        if (override.ability === undefined) {
          if (
            weaponPower &&
            /^ranged\b/i.test(phaseAttackType ?? "") &&
            attackStat === "Dexterity" &&
            equipment.properties.includes("heavy thrown")
          )
            attackStat = "Strength";
          const fallback = rangedBasicFallbackOverride(attackStat, keyContext);
          attackStat = fallback.ability ?? attackStat;
          damageOverride = {
            damageStat: override.damageStat || fallback.damageStat,
            halfDamage: override.halfDamage || fallback.halfDamage,
          };
        }
        keyAbilityDamage.set(definition.ordinal, damageOverride);
        // Native CalcBAB (`-Module-.cs` ~23982) registers each built-in
        // part in the row's att_type_max as it adds it: the ability
        // modifier as "abilmod", half level as "HALF-LEVEL", the proficiency
        // bonus as "Proficiency Bonus" and the enhancement as "Enhancement".
        // A stat bonus of one of those types then adds only its excess.
        const builtInAttack: {
          readonly bonusType: string;
          readonly component: PowerComponent;
        }[] = [
          {
            bonusType: NATIVE_ATTACK_TYPES.abilityModifier,
            component: {
              label: `${attackStat} modifier`,
              value: numericStat(input.stats, `${attackStat} modifier`),
            },
          },
          {
            bonusType: NATIVE_ATTACK_TYPES.halfLevel,
            component: {
              label: "half your level",
              value: halfLevel(input.level),
            },
          },
        ];
        if (weaponPower && arenaImprovised(equipment))
          builtInAttack.push({
            bonusType: NATIVE_ATTACK_TYPES.proficiency,
            component: {
              label: "proficiency bonus",
              value: 2,
              source: "Arena Training",
            },
          });
        else if (
          weaponPower &&
          equipment.proficiency !== 0 &&
          proficientWithWeapon(equipment)
        )
          builtInAttack.push({
            bonusType: NATIVE_ATTACK_TYPES.proficiency,
            component: {
              label: "proficiency bonus",
              value: equipment.proficiency,
            },
          });
        const attackComponents: PowerComponent[] = [];
        // One typed maximum per row (native att_type_max) across both paths.
        attackComponents.push(
          ...stackTypedComponents([
            ...combatStatEntries(
              input.stats,
              equipment,
              power,
              weaponPower ? "weapon" : "implement",
              "attack",
              phaseAttackType,
              {
                keywords,
                defense,
                byId,
                basicAttackKind,
                attackStat,
                typedExtras: [...builtInAttack, ...enhancementExtra],
                globalStats: { weaponRolls },
                nativeKeywords,
              },
            ),
            ...(implementPower && equipment.weaponDefinition
              ? combatStatEntries(
                  input.stats,
                  equipment,
                  power,
                  "weapon",
                  "attack",
                  phaseAttackType,
                  { keywords, defense, byId, basicAttackKind, nativeKeywords },
                ).filter(({ component: { provenanceId } }) =>
                  provenanceId?.endsWith(":legacy-focused-expertise"),
                )
              : []),
          ]),
        );
        const authoredBonus = powerBonusAtLevel(
          authoredLine.bonus,
          input.level,
          power.name,
        );
        if (authoredBonus !== 0)
          attackComponents.push({
            label: "power attack bonus",
            value: authoredBonus,
          });
        if (extractedBonus !== 0)
          attackComponents.push({
            label: "power bonus (Wisdom modifier)",
            value: extractedBonus,
          });
        const powerBonus = authoredBonus + extractedBonus;
        attackComponents.push(...weaponSpecific.attack);
        return {
          id: `${power.id}:attack-${definition.ordinal}`,
          ordinal: definition.ordinal,
          attackStat,
          powerBonus,
          defense,
          attackBonus: attackComponents.reduce(
            (sum, component) => sum + component.value,
            0,
          ),
          ...(definition.target === undefined
            ? {}
            : { target: definition.target }),
          ...(phaseAttackType === undefined
            ? {}
            : { attackType: phaseAttackType }),
          attackComponents,
        };
      };
      const calculatedAttacks = (
        attackDefinitions.length === 0
          ? [
              {
                ordinal: 1,
                line: "",
                field: texts.attack(""),
              } as AuthoredAttack,
            ]
          : attackDefinitions
      ).map((definition) => computeAttack(definition));
      const primaryAttack = calculatedAttacks[0];
      const attackStat = primaryAttack?.attackStat ?? "Unknown";
      const defense = primaryAttack?.defense ?? "Unknown";
      const attackComponents = primaryAttack?.attackComponents ?? [];
      const offhandItem = legacyOffhand(equipment, powerEquipped);
      const weaponDie = (
        rowAttackType: string | undefined,
        rowAttackStat: string,
        offhandTerm: boolean,
      ) =>
        figureWeaponDice({
          equipment,
          offhand: offhandItem,
          offhandTerm,
          arenaImprovised: arenaImprovised(equipment),
          steps: dieIncreaseSteps(
            input.stats,
            rowKeywordTags(equipment, power, rowAttackType, {
              keywords,
              defense,
              byId,
              basicAttackKind,
              attackStat: rowAttackStat,
              nativeKeywords,
            }).tags,
          ),
          byId,
        });
      const mainWeaponDie = weaponDie(attackType, attackStat, false);

      const calculateDamage = (
        authoredHit: HitLineIr | undefined,
        attackStat: string,
        attackType: string | undefined,
        keyAbility: KeyAbilityOverride | undefined,
        keyedTo: { readonly id: string; readonly name: string } = power,
      ): Pick<
        PowerVariant,
        "damage" | "damageType" | "damageComponents" | "conditionalDamage"
      > => {
        if (nonDamage) return { damageComponents: [], conditionalDamage: [] };
        // Native HigherLevelDamage (`-Module-.cs` ~24587): from 21st level
        // Chilling Cloud deals "twice intelligence modifier damage." by name
        // (its increase is in the Effect). We keep its cold type (D105).
        const hitText =
          key(power.name) === key(EXCEPTION_NAMES.chillingCloud) &&
          input.level >= 21
            ? hitLineAtLevel(
                texts,
                "twice Intelligence modifier cold damage.",
                input.level,
              )
            : authoredHit;
        // The line as this weapon reads it: "<A> (thrown weapon) or <B>"
        // by thrown-ness, a "(melee …) or … (ranged …)" line's clause by
        // ranged-ness (parsed at pack build).
        const hitLine =
          hitText === undefined
            ? emptyHitLine
            : thrownWeapon
              ? (hitText.thrown ?? hitText.other)
              : hitText.other;
        const clause =
          hitLine.clauses.length > 1 && equipment.rangedWeapon
            ? hitLine.clauses[1]!
            : hitLine.clauses[0];
        if (
          beast !== undefined &&
          (attackStat === BEAST_ATTACK_STAT || clause.beastHit === true)
        )
          return {
            ...beastDamage({
              clause,
              beast,
              stats: input.stats,
              power,
            }),
            conditionalDamage: [],
          };
        // D095: a fixed-bonus creature's damage is its dice, the named
        // ability modifiers and flat terms, its own damage bonuses and those
        // keyed to this power; nothing of the summoner's weapon, implement,
        // keywords or character-wide damage.
        const fixedCreature =
          summonedCreature && attackStat === LEVEL_ATTACK_STAT;
        const damageComponents: PowerComponent[] = [];
        const specialDamage = nativeSpecialDamage(
          power,
          hitLine.special,
          input.level,
        );
        // Native ParseWeaponDmg: every N[W] term of the damage expression
        // (the text before "damage"; level lines and riders are not part of
        // it), each "(off-hand weapon)" one with the off-hand die.
        // D105: also "(off-hand)" (Deceptive Steel) and "(off-hand end)"
        // (Binding Cahulaks), which native reads as main-hand dice; native
        // also stops parsing at any such parenthetical, dropping the ability
        // modifiers after it (Eruption of Steel's "(main weapon)"), which
        // this keeps.
        const weaponTerms = clause.weaponTerms ?? [];
        const weaponMatch = weaponTerms[0];
        // Legacy: an implement with no weapon die (a rod) on a [W] power
        // deals only the ability modifier.
        const dieless =
          weaponMatch !== undefined &&
          equipment.implementDefinition &&
          !equipment.weaponDefinition &&
          equipment.weaponDamage === undefined;
        const abilityOnly = specialDamage?.abilityOnly === true || dieless;
        const dice =
          specialDamage?.dice ??
          (weaponMatch !== undefined
            ? [
                dieless
                  ? undefined
                  : weaponTerms
                      .map((term) =>
                        diceTimes(
                          weaponDie(
                            attackType,
                            attackStat,
                            term.offhand === true,
                          ) ?? "1d4",
                          term.count,
                        ),
                      )
                      .join("+"),
                // Native ParseAbilityMod's digit branch: each "+ NdM" term
                // after the weapon dice is appended ("1[W] + 1d8").
                ...(clause.weaponAddedDice ?? []),
              ]
                .filter(Boolean)
                .join("+")
            : withDamageDie(clause.fixedDice, damageDie));
        const ongoing = hitLine.ongoing === true;
        // Native CalcDamage: dice-less flat damage; IsDamageRoll is false, so
        // the weapon's enhancement and roll-only bonuses do not apply.
        const flatBase =
          specialDamage?.flat ??
          (dice === undefined && specialDamage === undefined
            ? clause.flatBase
            : undefined);
        const flat = flatBase !== undefined;
        const hasDamage = dice !== undefined || flat;
        let damageAbilities: readonly string[] = clause.modifierAbilities ?? [];
        // Native ParseAbilityMod (`-Module-.cs` ~24333): "+ your highest
        // ability modifier" (and "+ highest ...") and the bare "+ [your]
        // ability modifier" are HighestAbility whatever the attack used;
        // only a key-ability damage_stat (followsAttack below) makes them
        // follow the attack ability. "+ chosen ability modifier" translates
        // to the "Chosen Ability" text string (AbilityTranslation), adding
        // nothing without one.
        // D105: "+ primary ability modifier" (Elemental Eruption, Soul
        // Scourge) is native's unknown "primary" stat; it resolves like the
        // bare form, as "Primary ability" does on the attack line.
        if (damageAbilities.length === 0) {
          if (clause.abilityPhrase === "highest")
            damageAbilities = [highestScoreAbility(input.stats)];
          else if (clause.abilityPhrase === "chosen")
            damageAbilities = chosen === undefined ? [] : [chosen];
          else if (clause.abilityPhrase === "ability")
            damageAbilities = [highestScoreAbility(input.stats)];
        }
        const listedAbilities: readonly string[] = clause.listedAbilities ?? [];
        if (damageAbilities.length === 0 && listedAbilities.length > 1)
          damageAbilities = [attackStat];
        if (
          equipment.properties.includes("heavy thrown") &&
          attackStat === "Strength" &&
          damageAbilities.length === 1 &&
          damageAbilities[0] === "Dexterity"
        )
          damageAbilities = ["Strength"];
        const additiveAbilities = specialDamage?.ability
          ? [specialDamage.ability]
          : specialDamage?.suppressAbility
            ? []
            : clause.hasOr === true
              ? listedAbilities.includes(attackStat)
                ? [attackStat]
                : // Native MultipleAbilityChoices (`-Module-.cs` ~24663):
                  // "your Intelligence, Wisdom, or Charisma modifier" is
                  // the highest of them by score, earlier ones winning
                  // ties (a fixed-bonus creature's attack names none, D111).
                  listedAbilities.length > 1
                  ? [highestScoreAbility(input.stats, listedAbilities)]
                  : damageAbilities.slice(0, 1)
              : damageAbilities;
        // Native ParseAbilityMod: with damage_stat every ability modifier
        // in the damage is the attack ability's, halved for half_damage.
        const followsAttack =
          keyAbility?.damageStat === true &&
          specialDamage?.ability === undefined &&
          abilityNames.some((ability) => ability === attackStat);
        const halved = followsAttack && keyAbility?.halfDamage === true;
        if (hasDamage)
          damageComponents.push(
            ...additiveAbilities.map((term) => {
              const ability = followsAttack ? attackStat : term;
              // Native CalcDamage: "twice [your] X modifier" doubles that
              // term (before half_damage halves it).
              const twice = (clause.twice ?? []).some(
                (ability) => ability === term,
              );
              const label = `${twice ? "twice " : ""}${ability} modifier`;
              const modifier =
                numericStat(input.stats, `${ability} modifier`) *
                (twice ? 2 : 1);
              return halved
                ? { label: `half ${label}`, value: Math.trunc(modifier / 2) }
                : { label, value: modifier };
            }),
          );
        if (hasDamage)
          damageComponents.push(...(specialDamage?.components ?? []));
        // Native AddToDamage: CalcMisc/CalcBonuses riders add to any row's
        // damage; a power with no damage expression (Bell Ringer) deals the
        // rider alone.
        const riderDamage = fixedCreature ? [] : weaponSpecific.damage;
        damageComponents.push(...riderDamage);
        const riderOnly =
          !hasDamage && specialDamage === undefined && riderDamage.length > 0;
        const offHandImplements = handCandidates.filter(
          (candidate) =>
            candidate.hand === "off" &&
            candidate.equipped &&
            candidate.implementDefinition,
        );
        // Native DualImplementSpellcaster: an arcane implement power's damage
        // roll made with an equipped item adds the enhancement of the item
        // in the other hand, which must be a different item (TwoDifferent
        // Weapons). With a saved main-hand selection, the main-hand row pairs
        // with the one equipped off-hand implement (none when ambiguous) and
        // an off-hand row with the main-hand item; without one, the other
        // hand is native DetermineOffhand's.
        const mainHandItem = handCandidates.find(
          (candidate) => candidate.hand === "main",
        );
        const otherHand =
          equipment.hand === "main"
            ? offHandImplements.length === 1
              ? offHandImplements[0]
              : undefined
            : equipment.hand === "off"
              ? mainHandItem
              : legacyOffhand(equipment, powerEquipped);
        const pairedImplement =
          implementPower &&
          arcanePower &&
          hasDualImplementSpellcaster &&
          otherHand !== undefined &&
          otherHand.definitionIds.join("\0") !==
            equipment.definitionIds.join("\0")
            ? otherHand
            : undefined;
        // Legacy types Dual Implement Spellcaster's bonus as an off-hand
        // enhancement, sharing one maximum with pact-blade transfers of the
        // same bonus ("[Doesn't Stack]").
        const offHandEnhancement = pairedImplement?.enhancement ?? 0;
        if (hasDamage && fixedCreature)
          damageComponents.push(
            // Native IsDamageRoll: flat damage is not a damage roll.
            ...creatureStatComponents(
              input.stats,
              flat ? ["damage"] : ["damage", "damage rolls"],
              "creature damage bonus",
            ),
            ...powerSpecificComponents(input.stats, keyedTo, "damage"),
          );
        if (
          dice !== undefined &&
          !fixedCreature &&
          weaponPower &&
          equipment.properties.includes("versatile") &&
          equipment.twoHanded &&
          // Native VersatileUsedTwoHanded: a Small character's non-small
          // versatile weapon fills both hands (D102) but earns no +1.
          !(
            equipment.requirementBase !== undefined &&
            legacySmallWithNonSmallWeapon(
              equipment.requirementBase,
              lootSlotContext,
            )
          )
        )
          damageComponents.push({
            label: "versatile weapon used two-handed",
            value: 1,
          });
        // One typed maximum per row (native dmg_type_max): an implement power
        // used through a weapon (a pact blade) also reads the weapon path, and
        // a typed bonus there (the pact blade's transferred off-hand
        // enhancement) must not stack with the same type on the implement
        // path (Dual Implement Spellcaster's), as legacy's "[Doesn't Stack]".
        if (hasDamage && !abilityOnly && !fixedCreature)
          damageComponents.push(
            ...stackTypedComponents([
              ...combatStatEntries(
                input.stats,
                equipment,
                power,
                weaponPower ? "weapon" : "implement",
                "damage",
                attackType,
                {
                  keywords,
                  defense,
                  byId,
                  basicAttackKind,
                  attackStat,
                  globalStats: { weaponRolls },
                  nativeKeywords,
                  damageRoll: !flat,
                  typedExtras: flat
                    ? []
                    : offHandEnhancement === 0
                      ? enhancementExtra
                      : [
                          ...enhancementExtra,
                          {
                            bonusType: "off-hand enhancement",
                            component: {
                              label: "off-hand implement enhancement bonus",
                              value: offHandEnhancement,
                              source: "Dual Implement Spellcaster",
                            },
                          },
                        ],
                },
              ),
              ...(implementPower && equipment.weaponDefinition
                ? combatStatEntries(
                    input.stats,
                    equipment,
                    power,
                    "weapon",
                    "damage",
                    attackType,
                    {
                      keywords,
                      defense,
                      byId,
                      basicAttackKind,
                      nativeKeywords,
                      damageRoll: !flat,
                    },
                    // Native IsKeyword (`-Module-.cs` ~20876): `weapon` is
                    // in the row's keyword set only from the power's
                    // Keywords (BuildKeywordSet never adds it for an
                    // implement power), so "Polearm group,weapon:damage"
                    // (Weapon Focus) misses an implement row through a
                    // weapon; "<group> group:damage" still applies.
                  ).filter(
                    ({ component: { label } }) =>
                      weaponPower || !statNeedsWeaponKeyword(label),
                  )
                : []),
            ]),
          );
        // Native CalcDamage parses only the damage expression: the hit line
        // up to its first "damage". A "+N bonus to damage rolls" rider after
        // it (Villain's Menace, Warlord's Strike) is a follow-up effect.
        const powerDamageBonus = clause.powerDamageBonus ?? 0;
        if (hasDamage && !abilityOnly && powerDamageBonus !== 0)
          damageComponents.push({
            label: "power damage bonus",
            value: powerDamageBonus,
          });
        if (flatBase !== undefined && flatBase !== 0)
          damageComponents.push({ label: "power damage", value: flatBase });
        const uniqueDamageComponents = uniquePowerComponents(damageComponents);
        const damageBonus = uniqueDamageComponents.reduce(
          (sum, component) => sum + component.value,
          0,
        );
        const conditionalDamage: readonly PowerConditionalDamage[] = [
          ...(key(power.name) === "call of the beast"
            ? [
                {
                  source: power.name,
                  expression: String(
                    (input.level >= 21 ? 10 : 5) +
                      numericStat(input.stats, "Wisdom modifier"),
                  ),
                  condition:
                    "on its next turn when the target attacks without including your ally nearest to it",
                },
              ]
            : []),
          ...(!hasDamage || fixedCreature
            ? []
            : conditionalStrikerDamage({
                activeDefinitionIds: input.activeDefinitionIds,
                stats: input.stats,
                textStrings: input.textStrings ?? {},
                power,
                weapon: strikerWeapon(equipment),
                byId,
                overlays: input.overlays,
              })),
        ];
        const damageType = clause.damageType;
        return {
          ...(specialDamage?.expression !== undefined
            ? { damage: specialDamage.expression }
            : flat || riderOnly
              ? { damage: String(damageBonus) }
              : dice === undefined
                ? ongoing
                  ? { damage: "Ongoing" }
                  : {}
                : {
                    damage: abilityOnly
                      ? String(damageBonus)
                      : formatDamage(dice, damageBonus),
                  }),
          ...(damageType === undefined ? {} : { damageType }),
          damageComponents: uniqueDamageComponents,
          conditionalDamage,
        };
      };
      const damage = calculateDamage(
        damageHitLine,
        attackStat,
        attackType,
        keyAbilityDamage.get(primaryAttack?.ordinal ?? 1),
      );
      const attacks =
        attackDefinitions.length === 0
          ? []
          : calculatedAttacks.map((attack): PowerAttack => {
              const definition = attackDefinitions.find(
                (candidate) => candidate.ordinal === attack.ordinal,
              );
              const phaseHit = hitLineAtLevel(
                texts,
                definition?.hit,
                input.level,
              );
              const phaseDamage =
                attack.ordinal === 1 &&
                phaseHit === hitLine &&
                attack.attackType === attackType
                  ? damage
                  : calculateDamage(
                      phaseHit,
                      attack.attackStat,
                      attack.attackType,
                      keyAbilityDamage.get(attack.ordinal),
                    );
              const usesOff =
                definition?.field.offHand === true ||
                phaseHit?.offHand === true;
              const usesMain =
                definition?.field.mainWeapon === true ||
                phaseHit?.mainWeapon === true;
              const weaponRole =
                usesOff === usesMain ? undefined : usesOff ? "off" : "main";
              // Without a beast companion (none chosen), a beast phase has
              // no numbers to show.
              const companion =
                beast === undefined &&
                (definition?.field.beast === true ||
                  phaseHit?.companionAbility === true);
              const beastPhase =
                beast !== undefined &&
                (attack.attacker === "beast" || phaseHit?.beastHit === true);
              const eligible =
                !companion &&
                (beastPhase ||
                  weaponRole === undefined ||
                  equipment.hand === undefined ||
                  equipment.hand === weaponRole);
              return {
                ...attack,
                ...(companion || phaseDamage.damage === undefined
                  ? {}
                  : { damage: phaseDamage.damage }),
                ...(companion || phaseDamage.damageType === undefined
                  ? {}
                  : { damageType: phaseDamage.damageType }),
                ...(companion
                  ? {}
                  : { damageComponents: phaseDamage.damageComponents }),
                ...(weaponRole === undefined ? {} : { weaponRole }),
                ...(eligible ? {} : { eligible: false }),
              };
            });
      // A summoned creature's commands (D111), each worked out as one of
      // the power's own attacks with this row's equipment.
      const commands = commandDefinitions.map(
        ({ entry, definition, keyedTo }): PowerCommand => {
          const attack = computeAttack(definition, keyedTo);
          const commandDamage = calculateDamage(
            hitLineAtLevel(texts, definition.hit, input.level),
            attack.attackStat,
            attack.attackType,
            keyAbilityDamage.get(definition.ordinal),
            keyedTo,
          );
          return {
            ...attack,
            id: `${power.id}:command-${entry}`,
            ordinal: entry,
            entry,
            ...(commandDamage.damage === undefined
              ? {}
              : { damage: commandDamage.damage }),
            ...(commandDamage.damageType === undefined
              ? {}
              : { damageType: commandDamage.damageType }),
            damageComponents: commandDamage.damageComponents,
          };
        },
      );
      const critical = criticalExpression(
        equipment,
        input.level,
        mainWeaponDie,
      );
      const brutal = equipment.properties
        .map((property) => /^brutal\s+(\d+)$/i.exec(property)?.[1])
        .find((value) => value !== undefined);
      return {
        id: `${power.id}:${equipment.id}`,
        equipmentName: equipment.name,
        equipmentId: equipment.id,
        proficient: beastOnly || proficientFor(equipment),
        ...(equipment.unarmed
          ? { basicAttackTypes: ["melee" as const] }
          : equipment.weaponCategory?.includes("melee")
            ? {
                basicAttackTypes: /(?:light|heavy) thrown/i.test(
                  equipment.properties.join(","),
                )
                  ? ["melee" as const, "ranged" as const]
                  : ["melee" as const],
              }
            : equipment.weaponCategory?.includes("ranged")
              ? { basicAttackTypes: ["ranged" as const] }
              : {}),
        definitionIds: equipment.definitionIds,
        // Native comes_before counts the `_INTERNAL_EquippedSymbol` item as
        // equipped.
        equipped: equipment.equipped || equipment.wornSymbol === true,
        ...(equipment.weaponDamage === undefined || mainWeaponDie === undefined
          ? {}
          : { weaponDamage: mainWeaponDie }),
        ...(equipment.hand === undefined ? {} : { hand: equipment.hand }),
        ...(equipment.pairedEquipmentName === undefined
          ? {}
          : { pairedEquipmentName: equipment.pairedEquipmentName }),
        attackStat,
        defense,
        ...(primaryAttack === undefined
          ? {}
          : { attackBonus: primaryAttack.attackBonus }),
        ...damage,
        additionalEffects:
          beastOnly && beast !== undefined
            ? beastAdditionalEffects(beast)
            : [
                ...(attackDefinitions[0]?.field.perAdjacentEnemy === true
                  ? [{ text: PER_ADJACENT_ENEMY_REMINDER, source: power.name }]
                  : []),
                ...powerAdditionalEffects({
                  stats: input.stats,
                  power,
                  equipment,
                  keywords,
                  ...(attackType === undefined ? {} : { attackType }),
                  attackStat,
                  defense,
                  hasAttack,
                  ...(damage.damage === undefined
                    ? {}
                    : { damage: damage.damage }),
                  byId,
                  basicAttackKind,
                  nativeKeywords,
                }),
              ],
        ...(critical === undefined || beastOnly ? {} : { critical }),
        ...(brutal === undefined || beastOnly
          ? {}
          : { brutal: Number(brutal) }),
        attackComponents,
        attacks,
        ...(beastOnly ? { attacker: "beast" as const } : {}),
        ...(commands.length === 0 ? {} : { commands }),
      };
    };
    const variants = handCandidates.map(variantFor);
    // A summon power with no rows (no attack or hit of its own) still has
    // its creature's commands, worked out with no equipment.
    const unarmed = equipped.find((item) => item.unarmed);
    const commands =
      variants.length > 0 ||
      commandDefinitions.length === 0 ||
      unarmed === undefined
        ? undefined
        : variantFor(unarmed).commands;
    const unsupported: string[] = [];
    const supportedStrikerIds = new Set<string>(
      strikerFeatures.flatMap(({ standardId, hybridId }) => [
        standardId,
        hybridId,
      ]),
    );
    for (const activeId of input.activeDefinitionIds) {
      const active = byId.get(key(activeId));
      if (
        active !== undefined &&
        key(active.type) === "class feature" &&
        /hunter's quarry|warlock's curse|sneak attack/i.test(active.name) &&
        !supportedStrikerIds.has(key(active.id))
      )
        unsupported.push(`striker-feature:${active.id}`);
    }
    if (
      power.specifics.some((specific) => /^Augment/i.test(specific.name)) &&
      field(power, "_AugmentVersions") === undefined
    )
      unsupported.push("augment");
    if (
      !nonDamage &&
      hitLine?.damage === true &&
      variants.some((variant) => variant.damage === undefined) &&
      key(power.name) !== "call of the beast"
    )
      unsupported.push("unparsed-hit");
    if (
      beast === undefined &&
      (hitLine?.companionAbility === true ||
        attackDefinitions.some(
          (attack) =>
            (attack.hit !== undefined &&
              texts.hit(attack.hit).companionAbility === true) ||
            attack.field.beast === true,
        ))
    )
      unsupported.push(`companion-ability:${power.id}`);
    const usage = effectiveField(power, "Power Usage", input.overlays);
    const actionType = effectiveField(power, "Action Type", input.overlays);
    const healing = keywords.some((value) => key(value) === "healing")
      ? powerHealing(input.stats, [
          "Healing",
          `${power.name}:healing`,
          `${power.id}:healing`,
          ...(field(power, "Class") ?? "").split(",").flatMap((reference) => {
            // A class power belongs to the class's power source: Healing
            // Word is a divine healing power though its keywords omit it.
            const source = /^\s*([A-Za-z]+)/.exec(
              field(byId.get(key(reference)) ?? emptyEntity, "Power Source") ??
                "",
            )?.[1];
            return [
              `${reference.trim()}:healing`,
              ...(source === undefined ? [] : [`${source}:healing`]),
            ];
          }),
          ...keywords.map((keyword) => `${keyword}:healing`),
        ])
      : undefined;
    const extraDamage = powerExtraDamage(input.stats, [
      `${power.id}:extra damage`,
      `${power.name}:extra damage`,
    ]);
    const encounterUses = legacyEncounterUses(
      power,
      input.overlays,
      input.level,
      input.stats,
    );
    return [
      {
        definitionId: power.id,
        name: power.name,
        ...(usage === undefined ? {} : { usage }),
        ...(encounterUses > 1 ? { encounterUses } : {}),
        ...(actionType === undefined ? {} : { actionType }),
        ...(attackType === undefined ? {} : { attackType }),
        ...(basicAttackKind === undefined ? {} : { basicAttackKind }),
        keywords,
        variants,
        recoveries,
        ...(healing === undefined ? {} : { healing }),
        ...(extraDamage === undefined ? {} : { extraDamage }),
        ...(commands === undefined ? {} : { commands }),
        unsupported,
      },
    ];
  });
}
