import { formatInventoryItemName } from "@4ecb/character-domain";
import { weaponPropertyText, type ContentEntity } from "@4ecb/content-domain";

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
import { EXCEPTION_IDS, EXCEPTION_NAMES } from "./exceptions";
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
import {
  IMPLEMENT_CLASS_FIELDS,
  increaseDamageDie,
  legacyIsKiFocus,
  legacyIsStaff,
  legacyLootImplement,
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
  readonly enhancement: number;
  readonly critical?: string;
  readonly unarmed: boolean;
  readonly weaponDefinition: boolean;
  readonly implementDefinition: boolean;
  readonly equipped: boolean;
  readonly hand?: "main" | "off";
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

/** The character's item name, composed exactly as the inventory and sheet
 * name it (e.g. "Aversion Quickbeam Staff +2"), never a joined part list. */
function equipmentName(parts: readonly ContentEntity[]): string {
  return formatInventoryItemName(
    parts.map((part) => ({
      name: part.name,
      type: part.type,
      magicItemType: field(part, "Magic Item Type"),
    })),
  );
}

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
  const value = field(entity, "WeaponEquiv")?.trim() ?? "";
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

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

/**
 * Legacy CharLootAugment: a loot entry's `augment` attribute is a serialized
 * CharLootID (`baseID`, optional `enchantID`), and FindLoot resolves it to
 * another owned loot entry, e.g. a dragonshard bound to a weapon. Returns that
 * augment's base record, or undefined when nothing owned matches.
 */
function boundAugment(
  entry: CharacterInventoryEntry,
  inventory: readonly CharacterInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
): ContentEntity | undefined {
  const serialized = Object.entries(entry.overrides ?? {}).find(
    ([name]) => key(name) === "augment",
  )?.[1];
  if (serialized === undefined) return undefined;
  const xml = decodeXmlText(serialized);
  const element = (name: string) =>
    new RegExp(`<${name}>([^<]*)</${name}>`, "u").exec(xml)?.[1]?.trim();
  const baseId = element("baseID");
  if (baseId === undefined || baseId === "") return undefined;
  const enchantId = element("enchantID");
  const owned = inventory.some(
    (candidate) =>
      candidate !== entry &&
      candidate.quantity > 0 &&
      key(candidate.definitionIds[0] ?? "") === key(baseId) &&
      (enchantId === undefined ||
        key(candidate.definitionIds[1] ?? "") === key(enchantId)),
  );
  return owned ? byId.get(key(baseId)) : undefined;
}

function loadouts(
  inventory: readonly CharacterInventoryEntry[],
  byId: ReadonlyMap<string, ContentEntity>,
  byName: ReadonlyMap<string, readonly ContentEntity[]>,
  textStrings: Readonly<Record<string, string>>,
): readonly Loadout[] {
  const implementResolver = legacyImplementResolver(byId, byName);
  const result: Loadout[] = [];
  for (const entry of inventory.filter((item) => item.quantity > 0)) {
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
    if (weapon === undefined && implement === undefined) continue;
    const augment = boundAugment(entry, inventory, byId);
    const critical = field(magic ?? emptyEntity, "Critical");
    const staff = baseRecord !== undefined && legacyIsStaff(baseRecord);
    // Native WeaponBase/IsStaffAsWeapon: a staff without a weapon part (a
    // magic or superior staff, the Staff Implement gear) attacks as the
    // Quarterstaff.
    const staffWeapon =
      weapon === undefined && (staff || /staff/i.test(magicType ?? ""));
    // The parts are already overlay-resolved (Arena Training's "Arena").
    const groups =
      weapon === undefined ? [] : legacyKeywordList(field(weapon, "Group"));
    result.push({
      id: entry.id,
      name: entry.name ?? equipmentName(parts),
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
      proficiencyNames: [
        ...(weapon !== undefined
          ? [weapon.name]
          : staffWeapon
            ? ["Quarterstaff"]
            : []),
        ...parts.flatMap((entity) => {
          const proficientAs = field(entity, "Proficient As");
          return proficientAs === undefined ? [] : [proficientAs];
        }),
      ],
      enhancement: parseEnhancement(magic),
      ...(critical ? { critical } : {}),
      unarmed: false,
      weaponDefinition: weapon !== undefined,
      implementDefinition: implement !== undefined,
      equipped: entry.equippedQuantity > 0,
      tags: [
        ...parts.map((entity) => entity.name),
        ...(weapon === undefined
          ? []
          : [
              // Native AddWeaponKeywords: "military" when the weapon's
              // Weapon Category contains it ("military,heavy blade group").
              ...(/military/iu.test(field(weapon, "Weapon Category") ?? "")
                ? ["military"]
                : []),
              ...groups,
              ...groups.map((group) => `${group} group`),
              field(weapon, "Item Slot") ?? "",
              field(weapon, "Hands Required") ?? "",
              ...(field(weapon, "Properties") ?? "").split(","),
              // Native AddWeaponKeywords: any thrown property is "thrown".
              ...(/thrown/iu.test(field(weapon, "Properties") ?? "")
                ? ["thrown"]
                : []),
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
        // D091 difference: legacy reads only the former), from the
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
        key(baseRecord?.type ?? "") === "weapon" ||
        (lootImplement !== undefined && !/ki focus/iu.test(lootImplement)),
      staff,
      ...(baseRecord === undefined ? {} : { lootBase: baseRecord }),
      ...(enchantRecord === undefined ? {} : { lootEnchant: enchantRecord }),
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
  const mainHandName = Object.entries(textStrings).find(
    ([name]) => key(name) === "_internal_mainhandweapon",
  )?.[1];
  const mainIndex =
    mainHandName === undefined
      ? -1
      : result.findIndex(
          (item) => item.equipped && key(item.name) === key(mainHandName),
        );
  if (mainIndex < 0) return result;
  const handed = result.map((item, index): Loadout =>
    !item.equipped || (!item.weaponDefinition && !item.implementDefinition)
      ? item
      : { ...item, hand: index === mainIndex ? "main" : "off" },
  );
  return handed.map((item) => {
    if (item.hand === undefined) return item;
    const pairs = handed.filter(
      (candidate) =>
        candidate.hand !== undefined &&
        candidate.hand !== item.hand &&
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
  for (const overlay of overlays) {
    if (
      overlay.targetDefinitionIds.includes(power.id) &&
      key(overlay.field) === key(name)
    ) {
      if (overlay.value !== undefined) value = overlay.value;
      if (overlay.listAddition !== undefined)
        value = [value, overlay.listAddition].filter(Boolean).join(", ");
    }
  }
  return value;
}

function diceTimes(expression: string, multiplier: number): string {
  const match = expression.match(/^(\d+)d(\d+)$/i);
  return match === null
    ? expression
    : `${Number(match[1]) * multiplier}d${match[2]}`;
}

function formatDamage(dice: string, bonus: number): string {
  if (bonus === 0) return dice;
  return `${dice}${bonus > 0 ? "+" : ""}${bonus}`;
}

function nativeSpecialDamage(
  power: ContentEntity,
  hitLine: string | undefined,
  level: number,
):
  | {
      readonly dice?: string;
      readonly expression?: string;
      readonly ability?: string;
      readonly suppressAbility?: boolean;
      readonly abilityOnly?: boolean;
    }
  | undefined {
  // The legacy engine checks this exact power name before parsing its
  // conditional movement prose.
  if (key(power.name) === key(EXCEPTION_NAMES.bondOfCensure))
    return { dice: level >= 21 ? "2d10" : "1d10", suppressAbility: true };
  if (key(power.name) === key(EXCEPTION_NAMES.knockdownAssault))
    return { dice: "", ability: "Strength", abilityOnly: true };

  const hit = key(hitLine ?? "");
  if (hit.startsWith("you deal damage based on the level of the rage power"))
    return { expression: "As Above" };
  if (
    hit === "the target takes ongoing 10 radiant damage (save ends)." ||
    hit ===
      "the target is stunned and takes ongoing 10 poison damage (save ends both)." ||
    hit.startsWith("ongoing 10 poison damage (save ends).")
  )
    return { expression: "ongoing 10" };
  if (
    hit ===
    "the target is slowed and takes ongoing damage equal to 10 + your dexterity modifier (save ends both)."
  )
    return { dice: "ongoing 10", ability: "Dexterity" };
  return undefined;
}

function unresolvedNativeSpecialCase(hitLine: string | undefined): boolean {
  const hit = key(hitLine ?? "");
  return (
    hit.startsWith("deal damage equal to your strength modifier,") ||
    hit ===
      "the target takes necrotic damage equal to the damage you took from the attack." ||
    hit ===
      "you take damage equal to your level, and the target takes 3d10 + constitution modifier damage plus extra damage equal to one-half your level." ||
    hit ===
      "you pull the target 4 squares, and it takes 4[w] + your charisma modifier psychic damage. the enemy then chooses either to be pushed 3 squares or to take a -2 penalty to attack rolls (save ends)." ||
    hit ===
      "whenever the target deals damage with an attack before the end of your next turn, it takes 15 force damage and is dazed until the end of your next turn."
  );
}

function hasCompanionAbilityDamage(hitLine: string | undefined): boolean {
  return /\b(?:your\s+)?beast(?:'s)?\s+(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\b/i.test(
    hitLine ?? "",
  );
}

function withoutCompanionAbilityDamage(value: string): string {
  return value.replace(
    /\b(?:your\s+)?beast(?:'s)?\s+(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma)\s+modifier\b/gi,
    "",
  );
}

/** Legacy CalcBAB: an attack line made with "Beast's attack bonus". */
const BEAST_ATTACK_LINE = /^\s*(?:your\s+)?beast(?:'s)?\s+attack\s+bonus\b/i;
/** The attack stat of a beast companion's attack. */
export const BEAST_ATTACK_STAT = "Beast";
/** "beast's Strength modifier", "your beast's ability modifier", and the
 *  content's "beast Strength's modifier" typo. */
const BEAST_ABILITY_DAMAGE =
  /\b(?:your\s+)?beast(?:'s)?\s+(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma|ability)(?:'s)?\s+modifier\b/gi;

/** A summoned creature's fixed attack line: "your level + 5 vs. Will". The
 *  summoner attacks through the creature with this bonus alone. */
const LEVEL_ATTACK_LINE =
  /^\s*(?:your\s+)?level\s*\+\s*(\d+)\s+vs\.?\s+([A-Za-z]+)/i;
/** The attack stat of a "your level + N" attack. */
export const LEVEL_ATTACK_STAT = "Level";

function isBeastAttackLine(line: string | undefined): boolean {
  return BEAST_ATTACK_LINE.test(line ?? "");
}

function isBeastHit(hit: string | undefined): boolean {
  return /\d+\s*\[B\]/i.test(hit ?? "") || hasCompanionAbilityDamage(hit);
}

/** Bonuses keyed to this one power: "<power ID>:attack", "<name>:damage". */
function powerSpecificComponents(
  stats: Readonly<Record<string, EvaluatedStat>>,
  power: ContentEntity,
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
  readonly hitClause: string;
  readonly beast: BeastCompanionStatistics;
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly power: ContentEntity;
}): Pick<PowerVariant, "damage" | "damageType" | "damageComponents"> {
  const clause = input.hitClause.split(/\bdamage\b/i)[0] ?? "";
  const beastDice = clause.match(/(\d+)\s*\[B\]/i);
  const dice =
    beastDice === null
      ? clause.match(/(\d+d\d+)/i)?.[1]
      : diceTimes(input.beast.damage.die, Number(beastDice[1]));
  if (dice === undefined || dice === "") return { damageComponents: [] };
  const components: PowerComponent[] = [];
  if (beastDice !== null && input.beast.damage.bonus !== 0)
    components.push({
      label: "beast's damage bonus",
      value: input.beast.damage.bonus,
    });
  for (const match of clause.matchAll(BEAST_ABILITY_DAMAGE)) {
    const named = abilityNames.find(
      (ability) => key(ability) === key(match[1] ?? ""),
    );
    if (named === undefined)
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
  const ownClause = clause.replace(BEAST_ABILITY_DAMAGE, "");
  for (const ability of abilityNames)
    if (new RegExp(`\\b${ability} modifier\\b`, "i").test(ownClause))
      components.push({
        label: `${ability} modifier`,
        value: numericStat(input.stats, `${ability} modifier`),
      });
  // Flat additions: "1d8 + 2 + your Wisdom modifier", "2d8 + 4".
  const powerBonus = [...clause.matchAll(/\+\s*(\d+)\b(?!\s*(?:\[|d\d))/gi)]
    .map((match) => Number(match[1]))
    .reduce((sum, value) => sum + value, 0);
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
  const damageType = clause.match(
    /\b(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)(?:\s*(?:,|and|or)\s*(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder))*\b/i,
  )?.[0];
  return {
    damage: formatDamage(
      dice,
      components.reduce((sum, component) => sum + component.value, 0),
    ),
    ...(damageType === undefined ? {} : { damageType: key(damageType) }),
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
  if (equipment.unarmed) return equipment.weaponDamage;
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

function recoveryExpressions(
  ...values: Array<string | undefined>
): PowerRecovery[] {
  const seen = new Set<string>();
  return values.flatMap((value) =>
    (value ?? "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((expression) => expression.trim())
      .filter(Boolean)
      .flatMap((expression) => {
        const kind = /temporary hit points/i.test(expression)
          ? "temporary-hit-points"
          : /healing surge/i.test(expression)
            ? "healing-surge"
            : /regain(?:s)?\s+(?:all of (?:your|his|her|their)\s+)?hit points/i.test(
                  expression,
                )
              ? "healing"
              : undefined;
        const identity = `${kind}\0${expression}`;
        if (kind === undefined || seen.has(identity)) return [];
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
  },
): readonly string[] {
  const tags: string[] = [
    ...(input.origin?.multiclass === true ? ["multiclass"] : []),
    ...(input.origin?.multiclassFeat === true ? ["multiclass feat"] : []),
  ];
  // Without a weapon, a melee power's WeaponBase is the Unarmed weapon.
  if (equipment.unarmed) {
    if (input.weaponPower && /melee/iu.test(input.attackType ?? ""))
      tags.push("melee weapon");
    return tags;
  }
  const base = input.weaponPower
    ? equipment.requirementBase
    : equipment.lootBase;
  if (base === undefined) return tags;
  // Native WeaponEnchant: the enchantment, else a magic item base itself.
  const enchant =
    equipment.lootEnchant ??
    (key(equipment.lootBase?.type ?? "") === "magic item"
      ? equipment.lootBase
      : undefined);
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

function combatStatComponents(
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
     * Built-in typed bonuses the row already holds (native CalcBAB and
     * CalcDamage register the weapon's enhancement as "Enhancement" before
     * any keyword stat), sharing maxima with matching stats.
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
  },
): PowerComponent[] {
  const suffix = `${kind}:${fieldName}`;
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
            "damage rolls",
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
    const qualified = normalized.match(/^(.*):(attack|damage)(?:\((.*)\))?$/);
    if (
      qualified &&
      qualified[2] === fieldName &&
      qualified[1]!.split(",").every((tag) => tags.has(key(tag))) &&
      (qualified[3] === undefined ||
        limiterNames(equipment, context.byId).has(qualified[3]))
    )
      return true;
    if (qualified?.[3] !== undefined) return false;
    if (normalized === suffix) return true;
    if (normalized.endsWith(`,${suffix}`)) {
      const qualifier = normalized.slice(0, -suffix.length - 1);
      return equipment.tags.includes(qualifier);
    }
    return [...equipment.tags, ...powerTags].some(
      (tag) => normalized === `${tag}:${fieldName}`,
    );
  });
  const seen = new Set<string>();
  const components: { component: PowerComponent; bonusType?: string }[] =
    relevant.flatMap(([name, stat]) => {
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
            ...(contribution.bonusType
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
  // Native AttackKeyword/DamageKeyword share typed maxima across matching
  // channels; qualifying the same type more narrowly must not stack it twice.
  const maxima = new Map<string, (typeof components)[number]>();
  for (const entry of components) {
    if (!entry.bonusType) continue;
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
      (entry) => !entry.bonusType || maxima.get(entry.bonusType) === entry,
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

function powerWeaponSpecificBonuses(
  power: ContentEntity,
  equipment: Loadout,
  stats: Readonly<Record<string, EvaluatedStat>>,
): {
  readonly attack: readonly PowerComponent[];
  readonly damage: readonly PowerComponent[];
} {
  const clauses = power.specifics
    .filter((specific) => key(specific.name) === "weapon")
    .map((specific) => specific.value);
  const hasFamily = (families: readonly string[]) =>
    families.some((family) => equipment.tags.includes(family));
  const attack = clauses.flatMap((clause) => {
    if (
      !/bonus to the attack roll equal to one-half your Strength modifier/i.test(
        clause,
      ) ||
      !hasFamily(["axe", "flail", "heavy blade", "pick"])
    )
      return [];
    return [
      {
        label: "power weapon bonus",
        value: Math.floor(numericStat(stats, "Strength modifier") / 2),
        source: power.name,
      },
    ];
  });
  const damage = clauses.flatMap((clause) => {
    if (
      !/(?:attack deals extra damage|gain a bonus to the damage roll) equal to your Constitution modifier/i.test(
        clause,
      ) ||
      !hasFamily(["axe", "hammer", "mace"])
    )
      return [];
    return [
      {
        label: "Constitution modifier",
        value: numericStat(stats, "Constitution modifier"),
        source: power.name,
      },
    ];
  });
  return { attack, damage };
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

interface AuthoredAttack {
  readonly ordinal: number;
  readonly line: string;
  readonly target?: string;
  readonly hit?: string;
  readonly attackType?: string;
}

const attackOrdinals = new Map([
  ["primary", 1],
  ["secondary", 2],
  ["tertiary", 3],
  ["quaternary", 4],
]);

function attackOrdinal(name: string): number | undefined {
  const match = name
    .trim()
    .match(/^(primary|secondary|tertiary|quaternary)\s+/i);
  return match?.[1] === undefined
    ? undefined
    : attackOrdinals.get(key(match[1]));
}

function authoredAttacks(
  power: ContentEntity,
  overlays: readonly FieldOverlay[],
): readonly AuthoredAttack[] {
  const attacks = new Map<number, string>();
  const targets = new Map<number, string>();
  const hits = new Map<number, string>();
  const attackTypes = new Map<number, string>();
  let activeOrdinal = 1;
  for (const specific of [...power.specifics].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    const name = specific.name.trim();
    let value = specific.value;
    for (const overlay of overlays) {
      if (
        overlay.targetDefinitionIds.includes(power.id) &&
        key(overlay.field) === key(name)
      ) {
        if (overlay.value !== undefined) value = overlay.value;
        if (overlay.listAddition !== undefined)
          value = [value, overlay.listAddition].filter(Boolean).join(", ");
      }
    }
    const namedOrdinal = attackOrdinal(name);
    if (namedOrdinal !== undefined) activeOrdinal = namedOrdinal;
    if (/targets?$/i.test(name) && value.trim().length > 0)
      targets.set(namedOrdinal ?? activeOrdinal, value.trim());
    if (/attack$/i.test(name) && /\bvs\.?\s+[A-Za-z]+/i.test(value))
      attacks.set(namedOrdinal ?? activeOrdinal, value.trim());
    if (/^(?:(?:primary|secondary|tertiary|quaternary)\s+)?hit$/i.test(name))
      hits.set(namedOrdinal ?? activeOrdinal, value.trim());
    if (/attack type$/i.test(name))
      attackTypes.set(namedOrdinal ?? activeOrdinal, value.trim());
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
        ...(target === undefined ? {} : { target }),
        ...(hit === undefined ? {} : { hit }),
        ...(attackType === undefined ? {} : { attackType }),
      };
    });
}

const ATTACK_LINE_PATTERN = /^(.*?)\s+vs\.?\s+([A-Za-z]+)/i;

/**
 * The ability an authored attack line uses for this character: an explicit
 * ability choice when the line allows it, else the best of the abilities it
 * names, else (for "primary ability") the best class key ability.
 */
function attackLineAbility(
  line: string,
  stats: Readonly<Record<string, EvaluatedStat>>,
  explicitAbilityChoice: string | undefined,
  preferredAbilities: readonly string[],
): string {
  const attackLeft = line.match(ATTACK_LINE_PATTERN)?.[1] ?? "";
  const availableAbilities = abilityNames.filter((ability) =>
    new RegExp(`\\b${ability}\\b`, "i").test(line),
  );
  if (
    explicitAbilityChoice !== undefined &&
    (new RegExp(`\\b${explicitAbilityChoice}\\b`, "i").test(line) ||
      /primary ability/i.test(attackLeft))
  )
    return explicitAbilityChoice;
  if (availableAbilities.length > 0)
    return highestAbility(stats, availableAbilities);
  return /primary ability/i.test(attackLeft)
    ? highestAbility(stats, preferredAbilities)
    : "Unknown";
}

export interface PowerAttackProfile {
  /** The ability each attack uses for this character, first attack first. */
  readonly abilities: readonly string[];
  /** The defenses its attacks target (AC, Fortitude, Reflex, Will). */
  readonly defenses: readonly string[];
}

const defenseNames = ["AC", "Fortitude", "Reflex", "Will"] as const;

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
  },
): PowerAttackProfile {
  const preferredAbilities = classKeyAbilities(
    input.activeDefinitionIds,
    input.byId,
  );
  const abilities = new Set<string>();
  const defenses = new Set<string>();
  for (const { line } of authoredAttacks(power, [])) {
    const ability = attackLineAbility(
      line,
      input.stats,
      undefined,
      preferredAbilities,
    );
    if (ability !== "Unknown") abilities.add(ability);
    for (const match of line.matchAll(/\bvs\.?\s+([A-Za-z]+)/gi)) {
      const defense = defenseNames.find((name) =>
        key(name).startsWith(key(match[1]!).slice(0, 3)),
      );
      if (defense !== undefined) defenses.add(defense);
    }
  }
  return { abilities: [...abilities], defenses: [...defenses] };
}

function classKeyAbilities(
  activeDefinitionIds: readonly string[],
  byId: ReadonlyMap<string, ContentEntity>,
): readonly string[] {
  const selectedClass = activeDefinitionIds
    .map((id) => byId.get(key(id)))
    .find((entity) => /^(?:hybrid )?class$/i.test(entity?.type ?? ""));
  const authored = field(selectedClass ?? emptyEntity, "Key Abilities") ?? "";
  const seen = new Set<string>();
  return [
    ...authored.matchAll(new RegExp(`\\b(${abilityNames.join("|")})\\b`, "gi")),
  ].flatMap((match) => {
    const ability = abilityNames.find(
      (candidate) => key(candidate) === key(match[1] ?? ""),
    );
    if (ability === undefined || seen.has(ability)) return [];
    seen.add(ability);
    return [ability];
  });
}

/**
 * Native AttackPowerModRepl (D20RulesEngine `-Module-.cs`, around 23530):
 * exact increase lines whose 11th- and 21st-level bonuses the generic parse
 * below would only half read. The value replaces the line's `+N`.
 */
const NATIVE_INCREASE_LINES: readonly {
  readonly text: string;
  readonly paragon: number;
  readonly epic: number;
}[] = [
  {
    text: "Increase to +6 at 11th level, +8 at 21st level.",
    paragon: 6,
    epic: 8,
  },
  {
    text: "Increase to +6 bonus at 11th level and +8 bonus at 21st level.",
    paragon: 6,
    epic: 8,
  },
  {
    text: "Increase the bonus to attack rolls to +4 at 11th level and +6 at 21st level",
    paragon: 4,
    epic: 6,
  },
  {
    text: "Increase to +4 bonus at 11th level, and to +6 at 21st level",
    paragon: 4,
    epic: 6,
  },
  {
    text: "Increase to +4 bonus at 11th level, and to +6 bonus at 21st level",
    paragon: 4,
    epic: 6,
  },
];

function powerBonusAtLevel(line: string, level: number): number {
  const normalized = key(line.replace(/\s+/g, " "));
  const native = NATIVE_INCREASE_LINES.find(({ text }) =>
    normalized.includes(key(text)),
  );
  const firstLine = line.split("\n")[0] ?? line;
  let bonus = Number(
    firstLine.match(
      /(?:ability|strength|constitution|dexterity|intelligence|wisdom|charisma)\s*\+\s*(\d+)/i,
    )?.[1] ?? 0,
  );
  if (native !== undefined && bonus !== 0)
    return level >= 21 ? native.epic : level >= 11 ? native.paragon : bonus;
  for (const match of line.matchAll(
    /(?:Level\s+)?(\d+)(?:st|nd|rd|th)?(?:\s+level)?\s*:\s*[^\n]*?\+\s*(\d+)|Increase\s+to\s+\+(\d+)\s+bonus\s+at\s+(\d+)(?:st|nd|rd|th)\s+level/gi,
  )) {
    const threshold = Number(match[1] ?? match[4]);
    const candidate = Number(match[2] ?? match[3]);
    if (threshold <= level && Number.isFinite(candidate)) bonus = candidate;
  }
  return bonus;
}

function lineAtLevel(
  value: string | undefined,
  level: number,
): string | undefined {
  if (value === undefined) return undefined;
  let selected = value.split("\n")[0];
  let selectedLevel = 0;
  for (const line of value.split("\n").slice(1)) {
    const match = line.match(/^Level\s+(\d+):\s*(.*)$/i);
    if (
      match?.[1] !== undefined &&
      match[2] !== undefined &&
      Number(match[1]) <= level &&
      Number(match[1]) >= selectedLevel
    ) {
      selectedLevel = Number(match[1]);
      selected = match[2];
    }
    const increase = line.match(
      /^Increase damage to\s+(.*?)\s+at\s+(\d+)(?:st|nd|rd|th)\s+level/i,
    );
    if (
      increase?.[1] !== undefined &&
      increase[2] !== undefined &&
      Number(increase[2]) <= level &&
      Number(increase[2]) >= selectedLevel
    ) {
      selectedLevel = Number(increase[2]);
      selected = increase[1];
    }
  }
  return selected;
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
        contribution.bonusType === undefined
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
      const type = key(contribution.bonusType ?? "");
      if (type === "") untyped.push(component);
      else if ((typed.get(type)?.value ?? -Infinity) < component.value)
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

/** Legacy IsDoubleWeapon. */
function legacyIsDoubleWeapon(weapon: ContentEntity | undefined): boolean {
  if (weapon === undefined) return false;
  return (
    (key(field(weapon, "Hands Required") ?? "") === "two-handed" &&
      /off-hand/iu.test(field(weapon, "Properties") ?? "")) ||
    (field(weapon, "_Secondary End")?.trim() ?? "") !== ""
  );
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
  readonly versatileUsedTwoHanded: boolean;
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly byName: ReadonlyMap<string, readonly ContentEntity[]>;
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
  const owns = (type: string, name: string) =>
    active.some(
      (entity) => key(entity.type) === type && key(entity.name) === key(name),
    );
  // Legacy SmallWithNonSmallWeapon.
  const small =
    owns("size", EXCEPTION_NAMES.smallSize) &&
    !owns("internal", EXCEPTION_NAMES.oneSizeLarger);
  const statText = (name: string): string | undefined => {
    if (input.textContributions === undefined)
      return textValue(input.textStrings, name);
    const values = input.textContributions
      .filter((contribution) => key(contribution.name) === key(name))
      .map((contribution) => contribution.value);
    return values.length === 0 ? undefined : values.join("+");
  };
  const unarmedText = textValue(
    input.textStrings,
    EXCEPTION_NAMES.unarmedWeaponText,
  );
  const unarmedBase =
    (unarmedText === undefined || unarmedText.trim() === ""
      ? undefined
      : resolveWeapon(unarmedText)) ??
    resolveWeapon(EXCEPTION_NAMES.unarmedAttack);
  const shared = {
    versatileUsedTwoHanded: (weapon: ContentEntity) =>
      (small && !/small/iu.test(field(weapon, "Properties") ?? "")) ||
      input.versatileUsedTwoHanded,
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
  const equipped = loadouts(
    input.inventory,
    byId,
    byName,
    input.textStrings ?? {},
  );
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
  // Without any recorded weapon proficiency (incomplete or custom content),
  // keep the bonus rather than strip it from every weapon, as for implements.
  const proficientWithWeapon = (item: Loadout) =>
    weaponProficiencies.size === 0 ||
    item.proficiencyNames.length === 0 ||
    item.proficiencyNames.some((name) => weaponProficiencies.has(key(name)));
  // Native ArenaTrainingImprovisedWeapon: with Arena Training, no weapon, a
  // weapon the character is not proficient with, or an improvised weapon
  // deals 1d8 (1d10 two-handed) with a +2 proficiency bonus.
  const hasArenaTraining = input.activeDefinitionIds.some(
    (id) => key(id) === key(EXCEPTION_IDS.arenaTraining),
  );
  const arenaImprovised = (item: Loadout) =>
    hasArenaTraining &&
    (item.unarmed ||
      ((item.weaponDefinition || item.staff) &&
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
  // Legacy VersatileUsedInTwoHands: _wtoi of the text, false when absent.
  const versatileUsedTwoHanded =
    Number(
      textValue(input.textStrings ?? {}, "_INTERNAL_VersatileUsedTwoHanded") ??
        0,
    ) !== 0;
  const origins = powerOrigins(input.occurrences ?? [], byId);
  const requirementContext = legacyRequirementContext({
    equipped,
    activeDefinitionIds: input.activeDefinitionIds,
    textStrings: input.textStrings ?? {},
    textContributions: input.textContributions,
    equipment: input.equipment,
    versatileUsedTwoHanded,
    byId,
    byName,
  });
  const activePowerIds = [
    ...new Set(
      input.activeDefinitionIds.flatMap((definitionId) => {
        const power = byId.get(key(definitionId));
        const versions = field(power ?? emptyEntity, "_AugmentVersions")
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        return versions === undefined || versions.length === 0
          ? [definitionId]
          : versions;
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
    const attackDefinitions = authoredAttacks(power, input.overlays);
    const attackLine = attackDefinitions[0]?.line;
    // `_CalculatedHit` (content corrections) supplies a damage line for a
    // power whose damage is only in prose, as legacy hardcodes Storm Pillar.
    const hitLine = lineAtLevel(
      attackDefinitions[0]?.hit ??
        effectiveField(power, "Hit", input.overlays) ??
        effectiveField(power, "_CalculatedHit", input.overlays),
      input.level,
    );
    const effectLine = effectiveField(power, "Effect", input.overlays);
    const hasAttack = /\bvs\.?\s+[A-Za-z]+/i.test(attackLine ?? "");
    const recoveries = recoveryExpressions(hitLine, effectLine);
    const weaponPower = keywords.some((value) => key(value) === "weapon");
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
    const candidates =
      !calculated ||
      key(power.id) === key(EXCEPTION_IDS.coordinatedAssaultAttack)
        ? []
        : (implementPower
            ? // Legacy offers every owned weapon and implement (its
              // CheckPower accepts any); proficiency only marks the
              // variant (D081).
              equipped.filter(ownedImplement)
            : weaponPower
              ? equipped.filter(
                  (item) =>
                    item.unarmed ||
                    (item.weaponDamage !== undefined &&
                      weaponFitsPowerRange(item, powerRange)),
                )
              : equipped.filter((item) => item.unarmed)
          ).filter((item) => !restricted(item));
    // A power only the beast attacks with uses none of the character's
    // equipment: one variant, not one per weapon with the same numbers.
    const beastOnly =
      beast !== undefined &&
      calculated &&
      (attackDefinitions.length > 0
        ? attackDefinitions.every((definition) =>
            isBeastAttackLine(definition.line),
          )
        : isBeastHit(hitLine));
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
    const preferredAbilities = classKeyAbilities(
      input.activeDefinitionIds,
      byId,
    );
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
    const variants = handCandidates.map((equipment): PowerVariant => {
      const nativeKeywords = nativeRowKeywords(equipment, {
        weaponPower,
        implementPower,
        offhand: legacyOffhand(equipment, equipped),
        attackType,
        origin: channelOrigin,
        resolve: implementResolver,
      });
      const weaponSpecific = powerWeaponSpecificBonuses(
        power,
        equipment,
        input.stats,
      );
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
      const explicitAbilityChoice = abilityNames.find((ability) =>
        input.activeDefinitionIds.some((definitionId) => {
          const choice = byId.get(key(definitionId));
          return key(choice?.name ?? "") === key(`${power.name} ${ability}`);
        }),
      );
      // Each attack's key-ability damage flags (native damage_stat and
      // half_damage), by attack ordinal.
      const keyAbilityDamage = new Map<number, KeyAbilityOverride>();
      const calculatedAttacks = (
        attackDefinitions.length === 0
          ? [{ ordinal: 1, line: "" } as AuthoredAttack]
          : attackDefinitions
      ).map((definition): PowerAttack => {
        const phaseAttackType = definition.attackType ?? attackType;
        const phaseAlternatives = /\(melee[^]*\sor\s[^]*\(ranged/i.test(
          definition.line,
        )
          ? definition.line.split(/\s+or\s+/i)
          : undefined;
        const authoredLine =
          phaseAlternatives !== undefined && phaseAlternatives.length > 1
            ? ((equipment.rangedWeapon
                ? phaseAlternatives.at(-1)
                : phaseAlternatives[0]) ?? definition.line)
            : definition.line;
        const attack = authoredLine.match(ATTACK_LINE_PATTERN);
        // Legacy CalcBAB: the beast's attack bonus replaces the whole
        // calculation; only bonuses keyed to this power add to it.
        if (beast !== undefined && isBeastAttackLine(authoredLine)) {
          const powerBonus =
            Number(
              /attack\s+bonus\s*\+\s*(\d+)/i.exec(authoredLine)?.[1] ?? 0,
            ) || powerBonusAtLevel(authoredLine, input.level);
          const attackComponents: PowerComponent[] = [
            { label: "beast's attack bonus", value: beast.attackBonus },
            ...(powerBonus === 0
              ? []
              : [{ label: "power attack bonus", value: powerBonus }]),
            ...powerSpecificComponents(input.stats, power, "attack"),
          ];
          return {
            id: `${power.id}:attack-${definition.ordinal}`,
            ordinal: definition.ordinal,
            attackStat: BEAST_ATTACK_STAT,
            powerBonus,
            defense: attack?.[2] ?? "Unknown",
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
        // no ability, weapon or implement applies, only bonuses keyed to
        // this power.
        const levelAttack = LEVEL_ATTACK_LINE.exec(authoredLine);
        if (levelAttack !== null) {
          const powerBonus = Number(levelAttack[1]);
          const attackComponents: PowerComponent[] = [
            { label: "your level", value: input.level },
            { label: "power attack bonus", value: powerBonus },
            ...powerSpecificComponents(input.stats, power, "attack"),
          ];
          return {
            id: `${power.id}:attack-${definition.ordinal}`,
            ordinal: definition.ordinal,
            attackStat: LEVEL_ATTACK_STAT,
            powerBonus,
            defense: levelAttack[2] ?? "Unknown",
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
          attackLineAbility(
            authoredLine,
            input.stats,
            undefined,
            preferredAbilities,
          ),
          keyContext,
        );
        let attackStat =
          override.ability ??
          attackLineAbility(
            authoredLine,
            input.stats,
            explicitAbilityChoice,
            preferredAbilities,
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
        const defense = attack?.[2] ?? "Unknown";
        const attackComponents: PowerComponent[] = [
          {
            label: `${attackStat} modifier`,
            value: numericStat(input.stats, `${attackStat} modifier`),
          },
          { label: "half your level", value: halfLevel(input.level) },
        ];
        if (weaponPower && arenaImprovised(equipment))
          attackComponents.push({
            label: "proficiency bonus",
            value: 2,
            source: "Arena Training",
          });
        else if (
          weaponPower &&
          equipment.proficiency !== 0 &&
          proficientWithWeapon(equipment)
        )
          attackComponents.push({
            label: "proficiency bonus",
            value: equipment.proficiency,
          });
        attackComponents.push(
          ...combatStatComponents(
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
              typedExtras: enhancementExtra,
              globalStats: { weaponRolls },
              nativeKeywords,
            },
          ),
        );
        if (implementPower && equipment.weaponDefinition)
          attackComponents.push(
            ...combatStatComponents(
              input.stats,
              equipment,
              power,
              "weapon",
              "attack",
              phaseAttackType,
              { keywords, defense, byId, basicAttackKind, nativeKeywords },
            ).filter(({ provenanceId }) =>
              provenanceId?.endsWith(":legacy-focused-expertise"),
            ),
          );
        const powerBonus = powerBonusAtLevel(authoredLine, input.level);
        if (powerBonus !== 0)
          attackComponents.push({
            label: "power attack bonus",
            value: powerBonus,
          });
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
      });
      const primaryAttack = calculatedAttacks[0];
      const attackStat = primaryAttack?.attackStat ?? "Unknown";
      const defense = primaryAttack?.defense ?? "Unknown";
      const attackComponents = primaryAttack?.attackComponents ?? [];
      const offhandItem = legacyOffhand(equipment, equipped);
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
        hitLine: string | undefined,
        attackStat: string,
        attackType: string | undefined,
        keyAbility: KeyAbilityOverride | undefined,
      ): Pick<
        PowerVariant,
        "damage" | "damageType" | "damageComponents" | "conditionalDamage"
      > => {
        const hitClauses = /\(melee[^]*\sor\s[^]*\(ranged/i.test(hitLine ?? "")
          ? (hitLine ?? "").split(/\s+or\s+/i)
          : [hitLine ?? ""];
        const selectedHitClause =
          hitClauses.length > 1
            ? equipment.rangedWeapon
              ? hitClauses.at(-1)
              : hitClauses[0]
            : hitLine;
        if (
          beast !== undefined &&
          (attackStat === BEAST_ATTACK_STAT || isBeastHit(selectedHitClause))
        )
          return {
            ...beastDamage({
              hitClause: selectedHitClause ?? "",
              beast,
              stats: input.stats,
              power,
            }),
            conditionalDamage: [],
          };
        const damageComponents: PowerComponent[] = [];
        const specialDamage = nativeSpecialDamage(power, hitLine, input.level);
        // Native ParseWeaponDmg: every N[W] term of the damage expression
        // (the text before "damage"; level lines and riders are not part of
        // it), each "(off-hand weapon)" one with the off-hand die.
        const weaponTermPattern = /(\d*)\[W\]( \(off-hand weapon\))?/giu;
        const expressionTerms = [
          ...(
            (selectedHitClause ?? "").split(/\bdamage\b/iu)[0] ?? ""
          ).matchAll(weaponTermPattern),
        ];
        const firstTerm = [
          ...(selectedHitClause ?? "").matchAll(weaponTermPattern),
        ].slice(0, 1);
        const weaponTerms =
          expressionTerms.length > 0 ? expressionTerms : firstTerm;
        const weaponMatch = weaponTerms[0];
        // Legacy: an implement with no weapon die (a rod) on a [W] power
        // deals only the ability modifier.
        const dieless =
          weaponMatch !== null &&
          weaponMatch !== undefined &&
          equipment.implementDefinition &&
          !equipment.weaponDefinition &&
          equipment.weaponDamage === undefined;
        const abilityOnly = specialDamage?.abilityOnly === true || dieless;
        const fixedMatch = selectedHitClause?.match(/(\d+d\d+)/i);
        const dice =
          specialDamage?.dice ??
          (weaponMatch !== null && weaponMatch !== undefined
            ? [
                dieless
                  ? undefined
                  : weaponTerms
                      .map((term) =>
                        diceTimes(
                          weaponDie(
                            attackType,
                            attackStat,
                            term[2] !== undefined,
                          ) ?? "1d4",
                          Number(term[1] || 1),
                        ),
                      )
                      .join("+"),
                key(power.name) === "howling strike"
                  ? fixedMatch?.[1]
                  : undefined,
              ]
                .filter(Boolean)
                .join("+")
            : fixedMatch?.[1]);
        const ongoing = /\bongoing\b/i.test(hitLine ?? "");
        const primaryDamageClause = withoutCompanionAbilityDamage(
          (selectedHitClause ?? "").split(/\bdamage\b/i)[0] ?? "",
        );
        let damageAbilities: readonly string[] = abilityNames.filter(
          (ability) =>
            new RegExp(`\\b${ability} modifier\\b`, "i").test(
              primaryDamageClause,
            ),
        );
        if (
          damageAbilities.length === 0 &&
          /\bability modifier\b/i.test(primaryDamageClause)
        )
          damageAbilities = [attackStat];
        const listedAbilities = abilityNames.filter((ability) =>
          new RegExp(`\\b${ability}\\b`, "i").test(primaryDamageClause),
        );
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
            : /\bor\b/i.test(primaryDamageClause)
              ? listedAbilities.includes(
                  attackStat as (typeof abilityNames)[number],
                )
                ? [attackStat]
                : damageAbilities.slice(0, 1)
              : damageAbilities;
        // Native ParseAbilityMod: with damage_stat every ability modifier
        // in the damage is the attack ability's, halved for half_damage.
        const followsAttack =
          keyAbility?.damageStat === true &&
          specialDamage?.ability === undefined &&
          abilityNames.some((ability) => ability === attackStat);
        const halved = followsAttack && keyAbility?.halfDamage === true;
        if (dice !== undefined)
          damageComponents.push(
            ...(followsAttack
              ? additiveAbilities.map(() => attackStat)
              : additiveAbilities
            ).map((ability) => {
              const modifier = numericStat(input.stats, `${ability} modifier`);
              return halved
                ? {
                    label: `half ${ability} modifier`,
                    value: Math.trunc(modifier / 2),
                  }
                : { label: `${ability} modifier`, value: modifier };
            }),
          );
        if (dice !== undefined) damageComponents.push(...weaponSpecific.damage);
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
              : legacyOffhand(equipment, equipped);
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
        if (dice !== undefined && !abilityOnly)
          damageComponents.push(
            ...combatStatComponents(
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
                typedExtras:
                  offHandEnhancement === 0
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
          );
        if (
          dice !== undefined &&
          weaponPower &&
          equipment.properties.includes("versatile") &&
          versatileUsedTwoHanded
        )
          damageComponents.push({
            label: "versatile weapon used two-handed",
            value: 1,
          });
        if (
          dice !== undefined &&
          !abilityOnly &&
          implementPower &&
          equipment.weaponDefinition
        )
          damageComponents.push(
            ...combatStatComponents(
              input.stats,
              equipment,
              power,
              "weapon",
              "damage",
              attackType,
              { keywords, defense, byId, basicAttackKind, nativeKeywords },
            ),
          );
        const powerDamageBonus = Number(
          selectedHitClause?.match(
            /\+\s*(\d+)\s+(?:[a-z]+\s+)*damage\b/i,
          )?.[1] ?? 0,
        );
        if (dice !== undefined && !abilityOnly && powerDamageBonus !== 0)
          damageComponents.push({
            label: "power damage bonus",
            value: powerDamageBonus,
          });
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
          ...(dice === undefined
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
        const primaryDamageText =
          (selectedHitClause ?? "").split(/\bdamage\b/i)[0] ?? "";
        const damageType = primaryDamageText.match(
          /\b(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)(?:\s*(?:,|and|or)\s*(?:acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder))*\b/i,
        )?.[0];
        return {
          ...(specialDamage?.expression !== undefined
            ? { damage: specialDamage.expression }
            : dice === undefined
              ? ongoing
                ? { damage: "Ongoing" }
                : {}
              : {
                  damage: abilityOnly
                    ? String(damageBonus)
                    : formatDamage(dice, damageBonus),
                }),
          ...(damageType === undefined ? {} : { damageType: key(damageType) }),
          damageComponents: uniqueDamageComponents,
          conditionalDamage,
        };
      };
      const damage = calculateDamage(
        hitLine,
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
              const phaseHit = lineAtLevel(definition?.hit, input.level);
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
              const roleText = `${definition?.line ?? ""} ${phaseHit ?? ""}`;
              const usesOff = /\boff[- ]hand(?: weapon)?\b/i.test(roleText);
              const usesMain = /\bmain(?:[- ]hand)? weapon\b/i.test(roleText);
              const weaponRole =
                usesOff === usesMain ? undefined : usesOff ? "off" : "main";
              // Without a beast companion (none chosen), a beast phase has
              // no numbers to show.
              const companion =
                beast === undefined &&
                (/\bbeast(?:'s)?\b/i.test(definition?.line ?? "") ||
                  hasCompanionAbilityDamage(phaseHit));
              const beastPhase =
                beast !== undefined &&
                (attack.attacker === "beast" || isBeastHit(phaseHit));
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
        equipped: equipment.equipped,
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
            : powerAdditionalEffects({
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
        ...(critical === undefined || beastOnly ? {} : { critical }),
        ...(brutal === undefined || beastOnly
          ? {}
          : { brutal: Number(brutal) }),
        attackComponents,
        attacks,
        ...(beastOnly ? { attacker: "beast" as const } : {}),
      };
    });
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
      /\bdamage\b/i.test(hitLine ?? "") &&
      variants.some((variant) => variant.damage === undefined) &&
      key(power.name) !== "call of the beast"
    )
      unsupported.push("unparsed-hit");
    if (unresolvedNativeSpecialCase(hitLine))
      unsupported.push(`native-special-case:${power.id}`);
    if (
      beast === undefined &&
      (hasCompanionAbilityDamage(hitLine) ||
        attackDefinitions.some(
          (attack) =>
            hasCompanionAbilityDamage(attack.hit) ||
            /\bbeast(?:'s)?\b/i.test(attack.line),
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
    return [
      {
        definitionId: power.id,
        name: power.name,
        ...(usage === undefined ? {} : { usage }),
        ...(actionType === undefined ? {} : { actionType }),
        ...(attackType === undefined ? {} : { attackType }),
        ...(basicAttackKind === undefined ? {} : { basicAttackKind }),
        keywords,
        variants,
        recoveries,
        ...(healing === undefined ? {} : { healing }),
        ...(extraDamage === undefined ? {} : { extraDamage }),
        unsupported,
      },
    ];
  });
}
