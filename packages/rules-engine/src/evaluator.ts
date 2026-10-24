import type { ContentEntity } from "@4ecb/content-domain";

import {
  equipmentPredicate,
  type EquippedItem,
  type EquipmentState,
} from "./equipment";
import {
  archeryMasteryPowerId,
  diverseStudyException,
  EXCEPTION_IDS,
  isLeveledRangerAtWillAttack,
  isCustomChoiceException,
  isUniversalSkill,
  meetsItemRequirement,
  seekerException,
  shouldChooseDeity,
  versatileMasterException,
} from "./exceptions";
import {
  evaluateRequires,
  matchesCategory,
  parseCategoryExpression,
  parseRequires,
  type ExpressionContext,
  type RequiresExpression,
} from "./expressions";
import {
  parseRules,
  type ExecutableRule,
  type ModifyRule,
  type SelectRule,
} from "./ir";
import { StatAccumulator, type EvaluatedStat } from "./stats";
import {
  choiceSelectionSetAside,
  evaluatePrerequisite,
  withoutOwnedDefinitions,
  type PrerequisiteContext,
} from "./prerequisites";
import { evaluatePowers, type EvaluatedPower } from "./powers";
import {
  evaluateBeastCompanion,
  isBeastCompanionEntity,
  type EvaluatedBeastCompanion,
} from "./beast-companion";
import { evaluateItemSets, type EvaluatedItemSet } from "./item-sets";
import { legacyIsStaff, overlaidEntity, overlaidFields } from "./item-fields";
import { legacyKeywordList } from "./weapon-groups";

/** Bump whenever EvaluationInput semantics or EvaluatedCharacter shape changes. */
export const RULES_EVALUATION_CACHE_VERSION =
  "evaluated-character-v55-2026-10-23-hit-rider-damage";

export interface CharacterOccurrence {
  readonly id: string;
  readonly definitionId: string;
  readonly acquiredLevel: number;
  readonly parentId?: string;
  readonly ruleOrdinal?: number;
  readonly choiceIndex?: number;
  readonly kind: "root" | "choice" | "grant" | "grabbag" | "inventory";
  readonly legality?: "rules-legal" | "houserule";
  readonly replacesId?: string;
}

export interface CharacterInventoryEntry {
  readonly id: string;
  readonly name?: string;
  readonly definitionIds: readonly string[];
  readonly quantity: number;
  readonly equippedQuantity: number;
  readonly acquiredLevel: number;
  readonly overrides?: Readonly<Record<string, string>>;
}

export interface EvaluationInput {
  readonly level: number;
  readonly baseAbilities: Readonly<Record<string, number>>;
  readonly occurrences: readonly CharacterOccurrence[];
  readonly inventory: readonly CharacterInventoryEntry[];
  readonly textStrings?: Readonly<Record<string, string>>;
  /** Character-local definitions synthesized from legacy per-level UserEdit rules. */
  readonly localEntities?: readonly ContentEntity[];
  /**
   * Legacy source entitlements by Source name/ID. Undefined means that no
   * entitlement list is configured and therefore every definition is
   * source-entitled. A configured list always includes Core implicitly.
   */
  readonly sourceEntitlements?: readonly string[];
  /**
   * Levels whose choices need complete candidate lists. Undefined preserves
   * the exhaustive compatibility/reporting result; presentation-scoped lists
   * omit category mismatches because the builder never exposes those as
   * options. An empty list keeps only selected candidates and the active
   * candidates needed by `existing` choices.
   */
  readonly candidateDetailLevels?: readonly number[];
  /** Optional replacement choices whose nested replacement lists are open. */
  readonly candidateDetailReplacementChoiceIds?: readonly string[];
  /**
   * Whether to materialize attack/loadout variants. Defaults to true for
   * compatibility reports, sheets, exports, and callers that need them.
   */
  readonly includePowers?: boolean;
}

export interface CandidateDecision {
  readonly definitionId: string;
  /** Compatibility aggregate: sourceEntitled && rulesLegal. */
  readonly eligible: boolean;
  /** Whether campaign/source policy permits choosing this definition. */
  readonly sourceEntitled: boolean;
  /** The native Legal bit: structural and prerequisite legality only. */
  readonly rulesLegal: boolean;
  /** Whether this definition is already present in active membership. */
  readonly activeDefinition: boolean;
  /** Active occurrences carrying this definition. */
  readonly activeOccurrenceIds: readonly string[];
  /** Occurrences whose rules/slots own those active occurrences. */
  readonly providerOccurrenceIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface ActiveDefinitionMembership {
  readonly definitionId: string;
  readonly occurrenceIds: readonly string[];
  readonly providerOccurrenceIds: readonly string[];
}

export interface EvaluatedChoice {
  readonly id: string;
  /** Effective level of this decision, including a rule's delayed minimum. */
  readonly level: number;
  readonly providerOccurrenceId: string;
  readonly ruleOrdinal: number;
  readonly index: number;
  readonly type: string;
  readonly name?: string;
  /** Legacy alternate-slot name for spellbook/prepared-power choices. */
  readonly spellbook?: string;
  readonly optional: boolean;
  /**
   * The slot's selection. A replacement's is its own saved pick, which a
   * later replacement may have traded away: then it is in
   * `EvaluatedCharacter.replacedSelections`, not `occurrences`.
   */
  readonly selectedOccurrenceId?: string;
  readonly candidates: readonly CandidateDecision[];
  readonly replacementOptions?: readonly {
    readonly replacesOccurrenceId: string;
    readonly definitionId: string;
    readonly candidates: readonly CandidateDecision[];
  }[];
}

/**
 * A saved pick whose provider's select rule is inactive because its
 * `requires` isn't met (D043). Level-gated (future) slots, replacement swaps
 * and drop rules are not dormancy.
 */
export interface DormantSelection {
  readonly occurrence: CharacterOccurrence;
  readonly providerOccurrenceId: string;
  readonly ruleOrdinal: number;
  /** The select rule's name ("Power Encounter 3") and type ("Power"). */
  readonly slotName?: string;
  readonly slotType: string;
  readonly requires: string;
  /**
   * Active occurrences whose presence switches the slot off: they match a
   * negated name in `requires` ("!No Level 3 Encounter Power").
   */
  readonly blockedBy: readonly CharacterOccurrence[];
}

export interface FieldOverlay {
  readonly providerOccurrenceId: string;
  readonly targetDefinitionIds: readonly string[];
  /** The rule's target name, kept even when no owned definition matches it. */
  readonly targetName?: string;
  /** The rule's target type, which qualifies `targetName`. */
  readonly targetType?: string;
  readonly field: string;
  readonly value?: string;
  readonly listAddition?: string;
  readonly dieIncrease?: string;
}

export interface EngineDiagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly occurrenceId?: string;
  readonly ruleOrdinal?: number;
}

export interface EvaluatedTextContribution {
  readonly name: string;
  readonly value: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly definitionId: string;
}

export interface EvaluatedCharacter {
  readonly level: number;
  readonly converged: boolean;
  readonly iterations: number;
  readonly complete: boolean;
  readonly legal: boolean;
  readonly occurrences: readonly CharacterOccurrence[];
  /**
   * Replacement picks that a later replacement traded away (Hurricane
   * Strike swapped in at 15 and out at 19). None is active; each is still
   * its own slot's `selectedOccurrenceId`, so that level shows its pick.
   */
  readonly replacedSelections?: readonly CharacterOccurrence[];
  /**
   * Saved picks whose slot a statement-level `requires` currently switches
   * off (D043): kept in the build, but contributing nothing.
   */
  readonly dormantSelections?: readonly DormantSelection[];
  readonly activeDefinitionIds: readonly string[];
  readonly activeDefinitions: readonly ActiveDefinitionMembership[];
  readonly choices: readonly EvaluatedChoice[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly textStrings: Readonly<Record<string, string>>;
  /** Every applied textstring with its source; stackable strings such as
   *  "Action Point" accumulate here where `textStrings` keeps the last value. */
  readonly textContributions?: readonly EvaluatedTextContribution[];
  readonly overlays: readonly FieldOverlay[];
  readonly powers: readonly EvaluatedPower[];
  /** The beast companion's statistics, when the character has one. */
  readonly beastCompanion?: EvaluatedBeastCompanion;
  /** Item sets the character has pieces of (legacy `ItemSetCount`). */
  readonly itemSets?: readonly EvaluatedItemSet[];
  readonly suggestions: readonly {
    readonly providerOccurrenceId: string;
    readonly definitionId: string;
    readonly type: string;
  }[];
  readonly diagnostics: readonly EngineDiagnostic[];
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

const ANY_CLASS_CATEGORY = "ID_FMP_CLASS_0";

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

function sourceEntitlementChecker(
  configured: readonly string[] | undefined,
  index: RulesIndex,
): (entity: ContentEntity) => boolean {
  if (configured === undefined) return () => true;
  const entitled = new Set(["core", ...configured.map(key)]);
  for (const requested of [...entitled]) {
    const source =
      index.find(requested, "Source") ??
      index.type("Source").find((entity) => key(entity.id) === requested);
    if (source === undefined) continue;
    entitled.add(key(source.id));
    entitled.add(key(source.name));
  }
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const check = (entity: ContentEntity): boolean => {
    const entityKey = key(entity.id);
    const cached = memo.get(entityKey);
    if (cached !== undefined) return cached;
    if (visiting.has(entityKey)) return false;
    visiting.add(entityKey);
    const requiresId =
      field(entity, "_RequiresID") ??
      entity.attributes.find(({ name }) => key(name) === "_requiresid")?.value;
    const dependency =
      requiresId === undefined ? undefined : index.get(requiresId);
    const dependencyEntitled = dependency === undefined || check(dependency);
    const ownSourceEntitled = entity.sources.some((source) =>
      entitled.has(key(source)),
    );
    const result = dependencyEntitled && ownSourceEntitled;
    visiting.delete(entityKey);
    memo.set(entityKey, result);
    return result;
  };
  return check;
}

export class RulesIndex {
  readonly entities: readonly ContentEntity[];
  readonly #byId = new Map<string, ContentEntity>();
  readonly #byNameType = new Map<string, ContentEntity>();
  readonly #byType = new Map<string, ContentEntity[]>();
  readonly #expandedCategoryValues = new Map<string, ReadonlySet<string>>();
  readonly categoryAliases = new Map<string, ReadonlySet<string>>();

  constructor(entities: readonly ContentEntity[]) {
    this.entities = entities;
    for (const entity of entities) {
      this.#byId.set(key(entity.id), entity);
      this.#byNameType.set(`${key(entity.type)}\0${key(entity.name)}`, entity);
      this.#byType.set(key(entity.type), [
        ...(this.#byType.get(key(entity.type)) ?? []),
        entity,
      ]);
      const aliases = new Set([
        key(entity.id),
        key(entity.name),
        key(`${entity.name} ${entity.type}`),
        key(`${entity.type} ${entity.name}`),
      ]);
      for (const value of aliases) this.categoryAliases.set(value, aliases);
    }
  }

  get(id: string): ContentEntity | undefined {
    return this.#byId.get(key(id));
  }
  find(nameOrId: string, type?: string): ContentEntity | undefined {
    return (
      this.get(nameOrId) ??
      (type === undefined
        ? this.entities.find((entity) => key(entity.name) === key(nameOrId))
        : this.#byNameType.get(`${key(type)}\0${key(nameOrId)}`))
    );
  }
  type(type: string): readonly ContentEntity[] {
    return this.#byType.get(key(type)) ?? [];
  }
  categoryValues(entity: ContentEntity): ReadonlySet<string> {
    const id = key(entity.id);
    const cached = this.#expandedCategoryValues.get(id);
    if (cached !== undefined) return cached;
    const values = new Set<string>();
    for (const value of [entity.id, entity.name, ...entity.categories]) {
      values.add(key(value));
      for (const alias of this.categoryAliases.get(key(value)) ?? [])
        values.add(key(alias));
    }
    this.#expandedCategoryValues.set(id, values);
    return values;
  }
}

const sharedRulesIndexCache = new WeakMap<
  readonly ContentEntity[],
  RulesIndex
>();

/** One index per entity array, shared by every evaluation of that array. */
export function sharedRulesIndex(
  entities: readonly ContentEntity[],
): RulesIndex {
  const cached = sharedRulesIndexCache.get(entities);
  if (cached !== undefined) return cached;
  const created = new RulesIndex(entities);
  sharedRulesIndexCache.set(entities, created);
  return created;
}

const knownDefinitionTokensCache = new WeakMap<
  readonly ContentEntity[],
  ReadonlySet<string>
>();

function knownDefinitionTokens(
  entities: readonly ContentEntity[],
): ReadonlySet<string> {
  const cached = knownDefinitionTokensCache.get(entities);
  if (cached !== undefined) return cached;
  const tokens = new Set(
    entities.flatMap((entity) =>
      [
        entity.id,
        entity.name,
        `${entity.name} ${entity.type}`,
        `${entity.type} ${entity.name}`,
      ].map((value) => value.trim().toLocaleLowerCase().replaceAll("_", " ")),
    ),
  );
  knownDefinitionTokensCache.set(entities, tokens);
  return tokens;
}

const prerequisiteSnapshotCaches = new WeakMap<
  readonly ContentEntity[],
  Map<string, EvaluatedCharacter>
>();

function prerequisiteSnapshotKey(
  input: EvaluationInput,
  level: number,
): string {
  return JSON.stringify({
    level,
    baseAbilities: input.baseAbilities,
    occurrences: input.occurrences.filter(
      (occurrence) => occurrence.acquiredLevel <= level,
    ),
    inventory: input.inventory.filter((entry) => entry.acquiredLevel <= level),
    textStrings: input.textStrings,
    localEntities: input.localEntities,
    sourceEntitlements: input.sourceEntitlements,
  });
}

function dynamicCategories(
  owned: readonly ContentEntity[],
  occurrences: readonly CharacterOccurrence[],
  index: RulesIndex,
  text: Readonly<Record<string, string>>,
): Readonly<Record<string, ReadonlySet<string>>> {
  // The stock builder seeds $$CLASS with its synthetic "Any Class" entry.
  // Published racial utility powers use that category, then restrict the
  // result to the correct race through their authored prerequisite.
  const classValues = new Set<string>([key(ANY_CLASS_CATEGORY), "any class"]);
  const hybridValues = new Set<string>();
  const multiclassValues = new Set<string>();
  const occurrencesById = new Map(
    occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const inheritedClassTarget = (
    occurrence: CharacterOccurrence,
  ): Set<string> | undefined => {
    let parentId = occurrence.parentId;
    const visited = new Set<string>();
    while (parentId !== undefined && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = occurrencesById.get(parentId);
      if (parent === undefined) return undefined;
      const parentType = key(index.get(parent.definitionId)?.type ?? "");
      if (parentType === "class") return classValues;
      if (parentType === "hybrid class") return hybridValues;
      parentId = parent.parentId;
    }
    return undefined;
  };
  for (const occurrence of occurrences) {
    const entity = index.get(occurrence.definitionId);
    if (entity === undefined) continue;
    const countsAsClass = field(entity, "CountsAsClass");
    const baseClassId = field(entity, "_BaseClass");
    const baseClass =
      baseClassId === undefined ? undefined : index.get(baseClassId);
    const entityType = key(entity.type);
    const targets =
      entityType === "hybrid class"
        ? [
            hybridValues,
            ...(inheritedClassTarget(occurrence) === classValues
              ? [classValues]
              : []),
          ]
        : entityType === "class"
          ? [classValues]
          : entityType === "countsasclass" || countsAsClass !== undefined
            ? [inheritedClassTarget(occurrence) ?? multiclassValues]
            : [];
    for (const target of targets)
      [
        entity.id,
        entity.name,
        ...entity.categories,
        countsAsClass ?? "",
        baseClassId ?? "",
        baseClass?.name ?? "",
        ...(baseClass?.categories ?? []),
      ]
        .filter(Boolean)
        .forEach((value) => target.add(key(value)));
  }
  const powersAsClass = Object.entries(text).find(
    ([name]) => key(name) === "powersasclass",
  )?.[1];
  if (powersAsClass) classValues.add(key(powersAsClass));
  if (
    owned.some(
      (entity) => key(entity.id) === key(EXCEPTION_IDS.paragonMulticlassing),
    )
  )
    for (const value of multiclassValues) classValues.add(value);
  const all = new Set([...classValues, ...multiclassValues]);
  return {
    $$CLASS: classValues,
    $$HYBRID: hybridValues,
    $$MULTICLASS: multiclassValues,
    $$CLASS_OR_MULTICLASS: all,
    $$NOT_CLASS: classValues,
  };
}

/**
 * The equipped records the wearing/not-wearing selectors read. Fields
 * resolve through the character's `modify` overlays (native
 * C_RulesElementField), which the rule pass is still collecting, so the
 * items are rebuilt whenever an overlay has been added since the last read.
 */
function equippedState(
  input: EvaluationInput,
  index: RulesIndex,
  overlays: readonly FieldOverlay[],
): EquipmentState {
  let builtFor = -1;
  let items: readonly EquippedItem[] = [];
  return {
    get items() {
      if (builtFor !== overlays.length) {
        items = equippedItems(input, index, overlays);
        builtFor = overlays.length;
      }
      return items;
    },
  };
}

function equippedItems(
  input: EvaluationInput,
  index: RulesIndex,
  overlays: readonly FieldOverlay[],
): EquippedItem[] {
  const items: EquippedItem[] = [];
  for (const entry of input.inventory.filter(
    (item) => item.acquiredLevel <= input.level && item.equippedQuantity > 0,
  )) {
    entry.definitionIds.forEach((definitionId, definitionIndex) => {
      const record = index.get(definitionId);
      if (record === undefined) return;
      const entity = overlaidEntity(record, overlays);
      const properties = (
        field(entity, "Properties") ??
        field(entity, "Weapon Property") ??
        ""
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const handsText = field(entity, "Hands Required") ?? "";
      // Native CategoryMatch reads the record's categories, which name
      // Two-Handed, each weapon group and so on by ID; LootCheck also takes
      // the record's name (or its name without "Large "), and the weapon a
      // superior implement's WeaponEquiv names.
      const equivalentId = field(entity, "WeaponEquiv")?.trim();
      const equivalent =
        equivalentId === undefined || equivalentId === ""
          ? undefined
          : (index.get(equivalentId) ??
            index.find(equivalentId.replace(/:weapon$/iu, ""), "Weapon"));
      const categories = [
        ...index.categoryValues(record),
        entity.name.replace(/^large\s+/iu, ""),
        ...(equivalent === undefined
          ? []
          : [
              ...index.categoryValues(equivalent),
              ...legacyKeywordList(field(equivalent, "Group")),
              field(equivalent, "Hands Required") ?? "",
            ]),
        field(entity, "Armor Type") ?? "",
        field(entity, "Armor Category") ?? "",
        field(entity, "Weapon Category") ?? "",
        ...legacyKeywordList(field(entity, "Weapon Group")),
        ...legacyKeywordList(field(entity, "Group")),
        handsText,
        field(entity, "Implement Type") ?? "",
        field(entity, "Magic Item Type") ?? "",
      ].filter(Boolean);
      const magicItemType = field(entity, "Magic Item Type") ?? "";
      if (
        /(implement|holy symbol|ki focus|orb|rod|staff|tome|totem|wand)/i.test(
          magicItemType,
        ) ||
        /^(holy symbol|ki focus)$/i.test(entity.name)
      )
        categories.push(
          "Implement",
          /holy symbol/i.test(entity.name) ? "Holy Symbol" : "",
          /ki focus/i.test(entity.name) ? "Ki Focus" : "",
        );
      const slot = field(entity, "Item Slot");
      items.push({
        id: entry.id,
        name: entity.name,
        type: entity.type,
        categories,
        properties,
        ...(slot === undefined ? {} : { slot }),
        ...(handsText.length === 0
          ? {}
          : { hands: /two/i.test(handsText) ? 2 : 1 }),
        quantity: entry.equippedQuantity,
        base: definitionIndex === 0,
        ...(equivalent === undefined ? {} : { weaponEquivalent: true }),
        ...(definitionIndex === 0 && legacyIsStaff(entity)
          ? { staff: true }
          : {}),
      });
    });
  }
  return items;
}

function activeAt(rule: ExecutableRule, level: number): boolean {
  return (
    level >= rule.source.level.minimum && level <= rule.source.level.maximum
  );
}

export function aggregateInventory(
  entries: readonly CharacterInventoryEntry[],
  level: number,
): readonly CharacterInventoryEntry[] {
  const aggregated = new Map<string, CharacterInventoryEntry>();
  for (const entry of entries.filter((item) => item.acquiredLevel <= level)) {
    const identity = `${entry.name ?? ""}\0${entry.definitionIds.join("\0")}`;
    const current = aggregated.get(identity);
    aggregated.set(
      identity,
      current === undefined
        ? entry
        : {
            ...current,
            quantity: current.quantity + entry.quantity,
            equippedQuantity: current.equippedQuantity + entry.equippedQuantity,
            overrides: { ...current.overrides, ...entry.overrides },
          },
    );
  }
  return [...aggregated.values()].filter(
    (entry) => entry.quantity > 0 || entry.equippedQuantity > 0,
  );
}

function itemSlot(entity: ContentEntity | undefined): string {
  return entity === undefined ? "" : (field(entity, "Item Slot") ?? "");
}

/**
 * Legacy ShouldExecute: a holding's rules run while any of it is equipped,
 * or while it is owned (count > 0) and its base element either has no Item
 * Slot (wondrous items, augments, rituals, most gear) or sets
 * `_AlwaysExecute`. Only the base element (the holding's first definition)
 * decides; an owned, unequipped slotted item stays inert.
 */
function lootExecutes(
  entry: CharacterInventoryEntry,
  index: RulesIndex,
): boolean {
  if (entry.equippedQuantity > 0) return true;
  if (entry.quantity <= 0) return false;
  const baseId = entry.definitionIds[0];
  const base = baseId === undefined ? undefined : index.get(baseId);
  if (base === undefined) return false;
  return (
    itemSlot(base).length === 0 ||
    (field(base, "_AlwaysExecute") ?? "").length > 0
  );
}

/**
 * The inventory definitions whose rules execute, in inventory order, as
 * legacy EquipLoot does: each executing holding runs its base element and,
 * per ShouldExecuteEnchant, its enchantment unless an equipped holding's base
 * occupies the Arms slot and the enchantment is itself an Arms item (a shield
 * enchantment yields to worn bracers). AlreadyExecuted skips a definition an
 * earlier executing holding already ran (as its base or executed
 * enchantment). Executing is not equipping: wearing predicates, loadout and
 * weapon/implement rows still read only equipped holdings (SlotEquipped).
 */
function executedLoot(
  inventory: readonly CharacterInventoryEntry[],
  index: RulesIndex,
): readonly {
  readonly entry: CharacterInventoryEntry;
  readonly definitionIndex: number;
  readonly definitionId: string;
}[] {
  const armsSlotUsed = inventory.some((entry) => {
    const baseId = entry.definitionIds[0];
    return (
      entry.equippedQuantity > 0 &&
      baseId !== undefined &&
      key(itemSlot(index.get(baseId))) === "arms"
    );
  });
  const ran = new Set<string>();
  const result: {
    entry: CharacterInventoryEntry;
    definitionIndex: number;
    definitionId: string;
  }[] = [];
  for (const entry of inventory) {
    if (!lootExecutes(entry, index)) continue;
    entry.definitionIds.forEach((definitionId, definitionIndex) => {
      if (
        definitionIndex > 0 &&
        armsSlotUsed &&
        key(itemSlot(index.get(definitionId))) === "arms"
      )
        return;
      const definitionKey = key(definitionId);
      if (ran.has(definitionKey)) return;
      ran.add(definitionKey);
      result.push({ entry, definitionIndex, definitionId });
    });
  }
  return result;
}

const magicArmorAdjustment = {
  light: [0, 0, 0, 0, 1, 1, 2],
  heavy: [0, 0, 1, 2, 3, 4, 6],
} as const;

function leadingInteger(value: string | undefined): number {
  const match = /^[+-]?\d+/.exec(value?.trim() ?? "");
  return match === null ? 0 : Number(match[0]);
}

function essentialsMagicArmorBonuses(
  inventory: readonly CharacterInventoryEntry[],
  index: RulesIndex,
): ReadonlyMap<string, number> {
  const bonuses = new Map<string, number>();
  // Native EssentialsMagicArmor runs for each executing holding.
  for (const entry of inventory.filter((item) => lootExecutes(item, index))) {
    const definitions = entry.definitionIds.flatMap((definitionId) => {
      const definition = index.get(definitionId);
      return definition === undefined ? [] : [definition];
    });
    const armor = definitions.find(({ type }) => key(type) === "armor");
    const enchantment = definitions.find(
      (definition) =>
        definition !== armor && field(definition, "Enhancement") !== undefined,
    );
    if (
      armor === undefined ||
      enchantment === undefined ||
      leadingInteger(field(armor, "Minimum Enhancement Bonus")) !== 0
    )
      continue;
    const enhancement = leadingInteger(field(enchantment, "Enhancement"));
    const armorType = key(field(armor, "Armor Type") ?? "");
    const adjustment =
      magicArmorAdjustment[armorType === "heavy" ? "heavy" : "light"][
        enhancement
      ] ?? 0;
    if (adjustment === 0) continue;
    const adjusted = leadingInteger(field(armor, "Armor Bonus")) + adjustment;
    const id = key(armor.id);
    bonuses.set(id, Math.max(bonuses.get(id) ?? 0, adjusted));
  }
  return bonuses;
}

/** Coarse, monotonic progress of one top-level evaluation. */
export interface EvaluationProgress {
  readonly completed: number;
  readonly total: number;
}

export interface EvaluationOptions {
  readonly onProgress?: (progress: EvaluationProgress) => void;
}

function evaluateCharacterInternal(
  input: EvaluationInput,
  entities: readonly ContentEntity[],
  prerequisiteContextOnly: boolean,
  prepared?: {
    readonly evaluationEntities: readonly ContentEntity[];
    readonly index: RulesIndex;
  },
  options: EvaluationOptions = {},
): EvaluatedCharacter {
  // Progress counts work items, not time: one per earlier level's
  // prerequisite scope (each a nested evaluation, the bulk of a cold run)
  // plus one for the top-level pass.
  const progressTotal = Math.max(0, input.level - 1) + 1;
  let progressCompleted = 0;
  const reportProgress = (completed: number) => {
    progressCompleted = Math.min(progressTotal, completed);
    options.onProgress?.({
      completed: progressCompleted,
      total: progressTotal,
    });
  };
  reportProgress(0);
  const localEntities = input.localEntities ?? [];
  const evaluationEntities =
    prepared?.evaluationEntities ??
    (localEntities.length === 0 ? entities : [...entities, ...localEntities]);
  const index =
    prepared?.index ??
    (localEntities.length === 0
      ? sharedRulesIndex(entities)
      : new RulesIndex(evaluationEntities));
  const isSourceEntitled = sourceEntitlementChecker(
    input.sourceEntitlements,
    index,
  );
  const diagnostics: EngineDiagnostic[] = [];
  const inventory = aggregateInventory(input.inventory, input.level);
  const adjustedMagicArmorBonuses = essentialsMagicArmorBonuses(
    inventory,
    index,
  );
  const currentInput = { ...input, inventory };
  const savedDefinitionIds = new Set(
    input.occurrences.map(({ definitionId }) => key(definitionId)),
  );
  const lootDefinitions = executedLoot(
    inventory.filter((entry) => entry.acquiredLevel <= input.level),
    index,
  );
  // Each executed enchantment's holding base, for `modify name="BaseItem"`,
  // by occurrence ID and (when the enchantment is also a saved occurrence)
  // by definition.
  const baseItemIds = new Map(
    lootDefinitions.flatMap(({ entry, definitionIndex, definitionId }) => {
      const baseId = entry.definitionIds[0];
      return definitionIndex === 0 || baseId === undefined
        ? []
        : [
            [`${entry.id}:definition:${definitionIndex}`, baseId] as const,
            [key(definitionId), baseId] as const,
          ];
    }),
  );
  const inventoryOccurrences: CharacterOccurrence[] = lootDefinitions.flatMap(
    ({ entry, definitionIndex, definitionId }) =>
      savedDefinitionIds.has(key(definitionId))
        ? []
        : [
            {
              id: `${entry.id}:definition:${definitionIndex}`,
              definitionId,
              acquiredLevel: entry.acquiredLevel,
              kind: "inventory" as const,
            },
          ],
  );
  const executed: CharacterOccurrence[] = [
    ...input.occurrences.filter(
      (occurrence) => occurrence.acquiredLevel <= input.level,
    ),
    ...inventoryOccurrences,
  ];
  // Unlocked item set benefits are elements too (legacy native Sets).
  const itemSets = evaluateItemSets(executed, index, input.textStrings ?? {});
  const saved: CharacterOccurrence[] = [
    ...executed,
    ...itemSets.benefitOccurrences,
  ];
  const replacedIds = new Set(
    saved.flatMap((occurrence) =>
      occurrence.replacesId === undefined ? [] : [occurrence.replacesId],
    ),
  );
  let occurrences = saved.filter(
    (occurrence) => !replacedIds.has(occurrence.id),
  );
  // Occurrences currently displaced by a replacement (see displacedBy).
  let displacedIds: ReadonlySet<string> = replacedIds;
  const replacementIncludes = (
    candidate: CharacterOccurrence,
    targetId: string,
  ): boolean => {
    let replacedId = candidate.replacesId;
    const visited = new Set<string>();
    while (replacedId !== undefined && !visited.has(replacedId)) {
      if (replacedId === targetId) return true;
      visited.add(replacedId);
      replacedId = saved.find(({ id }) => id === replacedId)?.replacesId;
    }
    return false;
  };
  const passThroughDefinition = (definition: ContentEntity): ContentEntity => {
    const rules = parseRules(definition.id, definition.rules);
    if (rules.length !== 1 || rules[0]?.kind !== "grant") return definition;
    const target = index.find(rules[0].name, rules[0].type);
    return target !== undefined &&
      ["proficiency", "skill training"].includes(key(target.type))
      ? target
      : definition;
  };
  const defaultName = (rule: SelectRule): string | undefined => {
    if (rule.defaultId === undefined) return undefined;
    const textKey = /^\[([^\]]+)\]$/.exec(rule.defaultId)?.[1];
    const value =
      textKey === undefined
        ? rule.defaultId
        : (input.textStrings?.[textKey] ?? "");
    return value.trim().length === 0 ? undefined : value;
  };
  const isDescendantOf = (
    candidate: CharacterOccurrence,
    ancestorId: string,
  ): boolean => {
    let parentId = candidate.parentId;
    const visited = new Set<string>();
    while (parentId !== undefined && !visited.has(parentId)) {
      if (parentId === ancestorId) return true;
      visited.add(parentId);
      parentId = occurrences.find(({ id }) => id === parentId)?.parentId;
    }
    return false;
  };
  // Native MeetsRequires passes the rule's owner as `checker`, and a named
  // requirement ignores elements whose parent is that owner. So Master
  // Trickster's `grant Ghost Sound requires="!Ghost Sound"` keeps the power it
  // granted instead of dropping it every other pass.
  const ownChildrenIndex = new WeakMap<
    readonly CharacterOccurrence[],
    {
      readonly children: ReadonlyMap<string, readonly CharacterOccurrence[]>;
      readonly counts: ReadonlyMap<string, number>;
    }
  >();
  const ruleRequiresMet = (
    requires: string | undefined,
    owner: CharacterOccurrence,
    activeOccurrences: readonly CharacterOccurrence[],
    context: ExpressionContext,
  ): boolean => {
    if (requires === undefined) return true;
    const expression = parseRequires(requires);
    let indexed = ownChildrenIndex.get(activeOccurrences);
    if (indexed === undefined) {
      const children = new Map<string, CharacterOccurrence[]>();
      const counts = new Map<string, number>();
      for (const occurrence of activeOccurrences) {
        const definitionKey = key(occurrence.definitionId);
        counts.set(definitionKey, (counts.get(definitionKey) ?? 0) + 1);
        if (occurrence.parentId !== undefined)
          children.set(occurrence.parentId, [
            ...(children.get(occurrence.parentId) ?? []),
            occurrence,
          ]);
      }
      indexed = { children, counts };
      ownChildrenIndex.set(activeOccurrences, indexed);
    }
    const ownChildren = indexed.children.get(owner.id) ?? [];
    const childCounts = new Map<string, number>();
    for (const child of ownChildren) {
      const definitionKey = key(child.definitionId);
      childCounts.set(definitionKey, (childCounts.get(definitionKey) ?? 0) + 1);
    }
    // Definitions owned only through the owner's own children.
    const ignored = new Set(
      [...childCounts].flatMap(([definitionKey, count]) =>
        indexed.counts.get(definitionKey) === count ? [definitionKey] : [],
      ),
    );
    return evaluateRequires(
      expression,
      ignored.size === 0
        ? context
        : {
            ...context,
            namedOwned: context.owned.filter(
              (entity) => !ignored.has(key(entity.id)),
            ),
          },
    );
  };
  const droppedBy = (
    drop: { readonly name?: string; readonly type?: string },
    candidate: CharacterOccurrence,
  ): boolean => {
    const definition = index.get(candidate.definitionId);
    return (
      definition !== undefined &&
      (drop.name === undefined ||
        key(definition.name) === key(drop.name) ||
        key(definition.id) === key(drop.name)) &&
      (drop.type === undefined || key(definition.type) === key(drop.type))
    );
  };
  let droppedSelectSlots: ReadonlySet<string> = new Set();
  let converged = false;
  let iterations = 0;

  const expressionContextFor = (
    activeOccurrences: readonly CharacterOccurrence[],
  ): ExpressionContext => {
    const definitions = activeOccurrences.flatMap((occurrence) => {
      const entity = index.get(occurrence.definitionId);
      return entity === undefined ? [] : [entity];
    });
    return {
      owned: definitions,
      level: input.level,
      dynamicCategories: dynamicCategories(
        definitions,
        activeOccurrences,
        index,
        input.textStrings ?? {},
      ),
      categoryAliases: index.categoryAliases,
      categoryValuesFor: (entity) => index.categoryValues(entity),
    };
  };
  const activeProviderRule = (
    occurrence: CharacterOccurrence,
    activeOccurrences: readonly CharacterOccurrence[],
    context: ExpressionContext,
  ): boolean => {
    if (
      occurrence.parentId === undefined ||
      occurrence.ruleOrdinal === undefined
    )
      return true;
    const parent = activeOccurrences.find(
      (candidate) => candidate.id === occurrence.parentId,
    );
    // Preserve recoverable legacy or custom occurrences whose serialized
    // provider is genuinely absent. A provider that is present in the saved
    // graph but currently inactive suppresses its descendants.
    if (parent === undefined)
      return !saved.some((candidate) => candidate.id === occurrence.parentId);
    const parentDefinition = index.get(parent.definitionId);
    if (parentDefinition === undefined) return true;
    const rule = parseRules(parentDefinition.id, parentDefinition.rules).find(
      (candidate) => candidate.source.ordinal === occurrence.ruleOrdinal,
    );
    if (rule === undefined) return true;
    return (
      activeAt(rule, input.level) &&
      ruleRequiresMet(rule.requires, parent, activeOccurrences, context)
    );
  };
  /**
   * Native HybridArmorProf: an armor or shield Proficiency granted by a
   * hybrid Grants record waits until the other half's hybrid Grants record
   * grants it too, so a hybrid is proficient only with the armor and shields
   * both classes grant. Another source (Armored Warlord, a hybrid talent
   * feature) still grants it normally.
   */
  const hybridGrantDeferred = (
    provider: CharacterOccurrence,
    target: ContentEntity,
    activeOccurrences: readonly CharacterOccurrence[],
    context: ExpressionContext,
  ): boolean => {
    const isHybridGrants = (entity: ContentEntity | undefined) =>
      entity !== undefined &&
      key(entity.type) === "grants" &&
      /hybrid/iu.test(entity.name);
    if (
      key(target.type) !== "proficiency" ||
      !/armor|shield/iu.test(target.name) ||
      !isHybridGrants(index.get(provider.definitionId))
    )
      return false;
    return !activeOccurrences.some((other) => {
      if (other.id === provider.id) return false;
      const entity = index.get(other.definitionId);
      if (entity === undefined || !isHybridGrants(entity)) return false;
      return parseRules(entity.id, entity.rules).some(
        (rule) =>
          rule.kind === "grant" &&
          activeAt(rule, input.level) &&
          key(index.find(rule.name, rule.type)?.id ?? "") === key(target.id) &&
          ruleRequiresMet(rule.requires, other, activeOccurrences, context),
      );
    });
  };
  /** A granted occurrence that HybridArmorProf defers. */
  const deferredHybridGrant = (
    occurrence: CharacterOccurrence,
    activeOccurrences: readonly CharacterOccurrence[],
    context: ExpressionContext,
  ): boolean => {
    if (occurrence.parentId === undefined) return false;
    const provider = activeOccurrences.find(
      (candidate) => candidate.id === occurrence.parentId,
    );
    const target = index.get(occurrence.definitionId);
    return (
      provider !== undefined &&
      target !== undefined &&
      hybridGrantDeferred(provider, target, activeOccurrences, context)
    );
  };
  const savedById = new Map(
    saved.map((occurrence) => [occurrence.id, occurrence]),
  );
  const savedReplacements = saved.filter(
    (occurrence) => occurrence.replacesId !== undefined,
  );
  /**
   * Occurrences displaced by a replacement whose slot is live, following
   * each chain. A replacement whose provider rule went dormant (a level-17
   * swap once an Assassin's Strike upgrade grants No Level 17 Encounter
   * Power) displaces nothing, so its target is active again. A replacement
   * merely dropped by a drop rule still displaces its target.
   */
  const displacedBy = (
    active: readonly CharacterOccurrence[],
    context: ExpressionContext,
    counts: (replacement: CharacterOccurrence) => boolean = () => true,
  ): ReadonlySet<string> => {
    const ids = new Set<string>();
    for (const replacement of savedReplacements) {
      if (!counts(replacement)) continue;
      if (!activeProviderRule(replacement, active, context)) continue;
      let replacedId = replacement.replacesId;
      while (replacedId !== undefined && !ids.has(replacedId)) {
        ids.add(replacedId);
        replacedId = savedById.get(replacedId)?.replacesId;
      }
    }
    return ids;
  };
  const reactivatableSaved = saved.filter(
    (occurrence) =>
      occurrence.parentId !== undefined && occurrence.ruleOrdinal !== undefined,
  );

  for (iterations = 1; iterations <= 30; iterations += 1) {
    const before = occurrences.map((occurrence) => occurrence.id).join("\0");
    const preliminaryContext = expressionContextFor(occurrences);
    displacedIds = displacedBy(occurrences, preliminaryContext);
    const restored = reactivatableSaved.filter(
      (occurrence) =>
        !displacedIds.has(occurrence.id) &&
        !occurrences.some((candidate) => candidate.id === occurrence.id) &&
        activeProviderRule(occurrence, occurrences, preliminaryContext) &&
        !deferredHybridGrant(occurrence, occurrences, preliminaryContext),
    );
    if (restored.length > 0) occurrences = [...occurrences, ...restored];
    const context = expressionContextFor(occurrences);
    const additions: CharacterOccurrence[] = [];
    const dropped = new Set<string>();
    const namedDrops: { readonly name?: string; readonly type?: string }[] = [];
    // Native VerifyDrop unlinks a named select's slot element, so the slot
    // is no longer an active choice (Level 19 Cavalier Daily Power drops
    // the level-5 daily select).
    const droppedSlots = new Set<string>();
    droppedSelectSlots = droppedSlots;
    for (const occurrence of occurrences)
      if (
        displacedIds.has(occurrence.id) ||
        !activeProviderRule(occurrence, occurrences, context) ||
        deferredHybridGrant(occurrence, occurrences, context)
      )
        dropped.add(occurrence.id);
    for (const occurrence of occurrences) {
      const entity = index.get(occurrence.definitionId);
      if (entity === undefined) continue;
      for (const rule of parseRules(entity.id, entity.rules)) {
        if (
          !activeAt(rule, input.level) ||
          !ruleRequiresMet(rule.requires, occurrence, occurrences, context)
        )
          continue;
        if (rule.kind === "grant") {
          const target = index.find(rule.name, rule.type);
          if (target === undefined) {
            diagnostics.push({
              severity: "error",
              code: "grant.missing-target",
              message: `${entity.name} grants missing ${rule.type ?? "record"} ${rule.name}`,
              occurrenceId: occurrence.id,
              ruleOrdinal: rule.source.ordinal,
            });
            continue;
          }
          if (hybridGrantDeferred(occurrence, target, occurrences, context))
            continue;
          const id = `${occurrence.id}:grant:${rule.source.ordinal}`;
          if (
            !occurrences.some(
              (candidate) =>
                candidate.id === id ||
                key(candidate.definitionId) === key(target.id) ||
                (candidate.parentId === occurrence.id &&
                  candidate.ruleOrdinal === rule.source.ordinal &&
                  candidate.kind === "grant"),
            )
          )
            additions.push({
              id,
              definitionId: target.id,
              acquiredLevel: Math.max(
                occurrence.acquiredLevel,
                rule.source.level.minimum,
              ),
              parentId: occurrence.id,
              ruleOrdinal: rule.source.ordinal,
              kind: "grant",
            });
        } else if (rule.kind === "drop") {
          if (rule.select !== undefined) {
            for (const selectProvider of occurrences) {
              const selectEntity = index.get(selectProvider.definitionId);
              if (selectEntity === undefined) continue;
              for (const selectRule of parseRules(
                selectEntity.id,
                selectEntity.rules,
              )) {
                if (
                  selectRule.kind !== "select" ||
                  key(selectRule.name ?? "") !== key(rule.select) ||
                  !activeAt(selectRule, input.level)
                )
                  continue;
                for (
                  let choiceIndex = 0;
                  choiceIndex < selectRule.number;
                  choiceIndex += 1
                ) {
                  droppedSlots.add(
                    `${selectProvider.id}:${selectRule.source.ordinal}:${choiceIndex}`,
                  );
                  const selected = saved.find(
                    (candidate) =>
                      candidate.parentId === selectProvider.id &&
                      candidate.ruleOrdinal === selectRule.source.ordinal &&
                      (candidate.choiceIndex ?? 0) === choiceIndex,
                  );
                  if (selected === undefined) continue;
                  const active = occurrences.find(
                    (candidate) =>
                      candidate.id === selected.id ||
                      replacementIncludes(candidate, selected.id),
                  );
                  if (active !== undefined) dropped.add(active.id);
                }
              }
            }
            continue;
          }
          namedDrops.push(rule);
          for (const candidate of occurrences)
            if (droppedBy(rule, candidate)) dropped.add(candidate.id);
        } else if (rule.kind === "select" && rule.defaultId !== undefined) {
          const target = index.find(rule.defaultId, rule.type);
          if (target === undefined || !isSourceEntitled(target)) continue;
          for (
            let choiceIndex = 0;
            choiceIndex < rule.number;
            choiceIndex += 1
          ) {
            const direct = saved.find(
              (candidate) =>
                candidate.parentId === occurrence.id &&
                candidate.ruleOrdinal === rule.source.ordinal &&
                (candidate.choiceIndex ?? 0) === choiceIndex,
            );
            if (
              occurrences.some(
                (candidate) =>
                  (candidate.parentId === occurrence.id &&
                    candidate.ruleOrdinal === rule.source.ordinal &&
                    (candidate.choiceIndex ?? 0) === choiceIndex) ||
                  (direct !== undefined &&
                    replacementIncludes(candidate, direct.id)),
              )
            )
              continue;
            additions.push({
              id: `${occurrence.id}:default:${rule.source.ordinal}:${choiceIndex}`,
              definitionId: target.id,
              acquiredLevel: Math.max(
                occurrence.acquiredLevel,
                rule.source.level.minimum,
              ),
              parentId: occurrence.id,
              ruleOrdinal: rule.source.ordinal,
              choiceIndex,
              kind: "choice",
            });
          }
        }
        if (rule.kind === "select" && !rule.existing) {
          for (
            let choiceIndex = 0;
            choiceIndex < rule.number;
            choiceIndex += 1
          ) {
            const direct = saved.find(
              (candidate) =>
                candidate.parentId === occurrence.id &&
                candidate.ruleOrdinal === rule.source.ordinal &&
                (candidate.choiceIndex ?? 0) === choiceIndex,
            );
            const selected = occurrences.find(
              (candidate) =>
                (candidate.parentId === occurrence.id &&
                  candidate.ruleOrdinal === rule.source.ordinal &&
                  (candidate.choiceIndex ?? 0) === choiceIndex) ||
                (direct !== undefined &&
                  replacementIncludes(candidate, direct.id)),
            );
            if (selected === undefined) continue;
            const selectedDefinition = index.get(selected.definitionId);
            if (
              selectedDefinition === undefined ||
              key(selectedDefinition.name) === key(defaultName(rule) ?? "")
            )
              continue;
            const equivalent = passThroughDefinition(selectedDefinition);
            const choiceLevel = Math.max(
              occurrence.acquiredLevel,
              rule.source.level.minimum,
            );
            const duplicate = occurrences.some((candidate) => {
              if (
                candidate.id === selected.id ||
                isDescendantOf(candidate, selected.id) ||
                candidate.acquiredLevel > choiceLevel
              )
                return false;
              const candidateKey = key(candidate.definitionId);
              return (
                candidateKey === key(selectedDefinition.id) ||
                (equivalent !== selectedDefinition &&
                  candidateKey === key(equivalent.id))
              );
            });
            if (duplicate) dropped.add(selected.id);
          }
        }
      }
    }
    for (const candidate of occurrences)
      if ([...dropped].some((id) => isDescendantOf(candidate, id)))
        dropped.add(candidate.id);
    occurrences = [
      ...occurrences.filter((occurrence) => !dropped.has(occurrence.id)),
      // A drop also suppresses a grant of what it drops; otherwise the
      // grant re-adds it every other pass (Born of Shadow drops the Fey
      // Origin its race grants).
      ...additions.filter(
        (addition) => !namedDrops.some((drop) => droppedBy(drop, addition)),
      ),
    ];
    const after = occurrences.map((occurrence) => occurrence.id).join("\0");
    if (before === after) {
      converged = true;
      break;
    }
  }
  if (!converged)
    diagnostics.push({
      severity: "error",
      code: "engine.non-convergent",
      message: "Rule topology did not converge within 30 iterations.",
    });
  // A saved child with a provider but no rule position is one the projection
  // found no current slot for (content changed since it was saved). It stays
  // owned and preserved; say so rather than let it pass unnoticed.
  for (const occurrence of input.occurrences) {
    if (
      occurrence.kind !== "choice" ||
      occurrence.parentId === undefined ||
      occurrence.ruleOrdinal !== undefined
    )
      continue;
    const definition = index.get(occurrence.definitionId);
    const parent = saved.find(({ id }) => id === occurrence.parentId);
    const provider =
      parent === undefined ? undefined : index.get(parent.definitionId);
    if (definition === undefined || provider === undefined) continue;
    diagnostics.push({
      severity: "warning",
      code: "occurrence.unslotted",
      message: `${definition.name} is saved under ${provider.name}, which no longer grants it and has no free ${definition.type} choice to hold it.`,
      occurrenceId: occurrence.id,
    });
  }
  const ownedDefinitions = occurrences.flatMap((occurrence) => {
    const definition = index.get(occurrence.definitionId);
    if (definition !== undefined) return [definition];
    diagnostics.push({
      severity: "error",
      code: "occurrence.missing-definition",
      message: `Missing content definition ${occurrence.definitionId}`,
      occurrenceId: occurrence.id,
    });
    return [];
  });
  const memberships = new Map<
    string,
    {
      definitionId: string;
      occurrenceIds: string[];
      providerOccurrenceIds: string[];
    }
  >();
  for (const occurrence of occurrences) {
    const definitionKey = key(occurrence.definitionId);
    const membership = memberships.get(definitionKey) ?? {
      definitionId: occurrence.definitionId,
      occurrenceIds: [],
      providerOccurrenceIds: [],
    };
    membership.occurrenceIds.push(occurrence.id);
    if (
      occurrence.parentId !== undefined &&
      !membership.providerOccurrenceIds.includes(occurrence.parentId)
    )
      membership.providerOccurrenceIds.push(occurrence.parentId);
    memberships.set(definitionKey, membership);
    const definition = index.get(occurrence.definitionId);
    if (definition !== undefined && !isSourceEntitled(definition))
      diagnostics.push({
        severity: "error",
        code: "occurrence.source-unentitled",
        message: `${definition.name} is not included in the configured source entitlements.`,
        occurrenceId: occurrence.id,
      });
  }
  const ownedIds = new Set(ownedDefinitions.map((entity) => key(entity.id)));
  const expressionContext: ExpressionContext = {
    owned: ownedDefinitions,
    level: input.level,
    dynamicCategories: dynamicCategories(
      ownedDefinitions,
      occurrences,
      index,
      input.textStrings ?? {},
    ),
    categoryAliases: index.categoryAliases,
    categoryValuesFor: (entity) => index.categoryValues(entity),
  };
  // Active-definition membership is intentionally collapsed by definition,
  // but every active grant provider remains an owner of its rule occurrence.
  // This preserves the native distinction even where the modern evaluator has
  // already deduplicated a generated grant from the occurrence projection.
  for (const provider of occurrences) {
    const providerDefinition = index.get(provider.definitionId);
    if (providerDefinition === undefined) continue;
    for (const rule of parseRules(
      providerDefinition.id,
      providerDefinition.rules,
    )) {
      if (
        rule.kind !== "grant" ||
        !activeAt(rule, input.level) ||
        !ruleRequiresMet(
          rule.requires,
          provider,
          occurrences,
          expressionContext,
        )
      )
        continue;
      const target = index.find(rule.name, rule.type);
      if (target === undefined) continue;
      const membership = memberships.get(key(target.id));
      if (
        membership !== undefined &&
        !membership.providerOccurrenceIds.includes(provider.id)
      )
        membership.providerOccurrenceIds.push(provider.id);
    }
  }
  const activeDefinitions: ActiveDefinitionMembership[] = [
    ...memberships.values(),
  ];
  const selectedTheme = ownedDefinitions.find(
    (definition) => key(definition.type) === "theme",
  );
  const themeClassValues =
    selectedTheme === undefined
      ? []
      : [selectedTheme.id, selectedTheme.name, ...selectedTheme.categories].map(
          key,
        );
  const overlays: FieldOverlay[] = [];
  const equipment = equippedState(currentInput, index, overlays);
  const stats = new StatAccumulator(equipment);
  for (const [ability, value] of Object.entries(input.baseAbilities))
    stats.add({
      id: `base:${ability}`,
      stat: ability,
      value: String(value),
      providerId: "base-abilities",
      providerName: "Base ability score",
    });
  for (const occurrence of occurrences) {
    if (index.get(occurrence.definitionId) !== undefined) continue;
    const target = occurrence.definitionId.match(
      /^ID_INTERNAL_FEAT_FOCUSED_EXPERTISE_\((.+)\)$/i,
    )?.[1];
    if (target === undefined) continue;
    const weaponName = target.replaceAll("_", " ");
    const weapon = index.find(weaponName, "Weapon");
    if (weapon === undefined) continue;
    const group = field(weapon, "Group");
    if (group === undefined) continue;
    stats.add({
      id: `${occurrence.id}:legacy-focused-expertise`,
      stat: `${group} group,weapon:attack`,
      value: String(1 + Math.floor((Math.max(1, input.level) - 1) / 10)),
      bonusType: "Feat",
      providerId: occurrence.id,
      providerName: `Focused Expertise (${weapon.name})`,
    });
  }
  let choices: EvaluatedChoice[] = [];
  const suggestions: EvaluatedCharacter["suggestions"][number][] = [];
  const text = { ...(input.textStrings ?? {}) };
  const textContributions: EvaluatedTextContribution[] = [];
  const candidateCache = new Map<string, CandidateDecision[]>();
  const categoryCache = new Map<
    string,
    ReturnType<typeof parseCategoryExpression>
  >();
  const categoryTermsCache = new Map<string, readonly string[]>();
  const candidateDetailLevels =
    input.candidateDetailLevels === undefined
      ? undefined
      : new Set(input.candidateDetailLevels);
  const candidateDetailReplacementChoiceIds = new Set(
    input.candidateDetailReplacementChoiceIds ?? [],
  );
  const universalSkillIds = new Set<string>();
  for (const occurrence of occurrences) {
    const provider = index.get(occurrence.definitionId);
    if (provider === undefined) continue;
    for (const rule of parseRules(provider.id, provider.rules)) {
      if (
        rule.kind !== "modify" ||
        key(rule.field) !== "universalclassskill" ||
        key(rule.value ?? "") !== "true" ||
        !activeAt(rule, input.level) ||
        !ruleRequiresMet(
          rule.requires,
          occurrence,
          occurrences,
          expressionContext,
        )
      )
        continue;
      for (const candidate of index.type(rule.type ?? "Skill Training"))
        if (
          rule.name === undefined ||
          key(candidate.name) === key(rule.name) ||
          key(candidate.id) === key(rule.name)
        )
          universalSkillIds.add(key(candidate.id));
    }
  }

  // A background benefit that adds a skill the character's class (or hybrid
  // class) already lists as a class skill would do nothing, so it is marked
  // and left out of the default candidate list.
  const classSkillValues = new Set([
    ...(expressionContext.dynamicCategories?.$$CLASS ?? []),
    ...(expressionContext.dynamicCategories?.$$HYBRID ?? []),
  ]);
  const grantsExistingClassSkill = (candidate: ContentEntity): boolean => {
    if (key(candidate.type) !== "background choice") return false;
    const grants = parseRules(candidate.id, candidate.rules).flatMap((rule) =>
      rule.kind === "modify" &&
      key(rule.field) === "universalclassskill" &&
      key(rule.value ?? "") === "true"
        ? [rule]
        : [],
    );
    return (
      grants.length > 0 &&
      grants.every((rule) => {
        const skill =
          rule.name === undefined
            ? undefined
            : index.find(rule.name, rule.type ?? "Skill Training");
        return (
          skill !== undefined &&
          skill.categories.some((category) =>
            classSkillValues.has(key(category)),
          )
        );
      })
    );
  };

  /** Saved replacement picks whose provider rule is dormant (never held). */
  const dormantReplacementIds = new Set(
    savedReplacements
      .filter(
        (replacement) =>
          !activeProviderRule(replacement, occurrences, expressionContext),
      )
      .map(({ id }) => id),
  );
  /**
   * A replacement slot at `level` (a retraining or power swap), resolved on
   * its own even inside a chain of swaps: its selection is its own saved
   * pick, even when a later swap traded that pick away, and it can trade what
   * the character held at that level. Native BuildReplaceList walks the
   * elements present at the choice's level (ElemAtLevel) and re-adds the
   * choice's own current target (AddReplaceChoice), so a level-15 swap of
   * Bristling Defense still lists Bristling Defense after a level-19 swap
   * trades its Hurricane Strike away. Another slot's replacement at the same
   * or an earlier level has displaced its target by then; a later one, or one
   * whose provider rule is dormant, hasn't.
   */
  const replacementSlot = (
    provider: CharacterOccurrence,
    ruleOrdinal: number,
    level: number,
  ): {
    readonly selected: CharacterOccurrence | undefined;
    readonly held: (candidate: CharacterOccurrence) => boolean;
    /** Held at `level` but traded away by a later replacement since. */
    readonly heldThenReplaced: readonly CharacterOccurrence[];
  } => {
    const selected = saved.find(
      (candidate) =>
        candidate.parentId === provider.id &&
        candidate.ruleOrdinal === ruleOrdinal &&
        candidate.replacesId !== undefined,
    );
    const displaced = displacedBy(
      occurrences,
      expressionContext,
      (replacement) =>
        replacement.acquiredLevel <= level && replacement.id !== selected?.id,
    );
    const held = (candidate: CharacterOccurrence): boolean =>
      candidate.id === selected?.replacesId ||
      (!displaced.has(candidate.id) &&
        !dormantReplacementIds.has(candidate.id));
    return {
      selected,
      held,
      heldThenReplaced: saved.filter(
        (candidate) =>
          displacedIds.has(candidate.id) &&
          candidate.acquiredLevel <= level &&
          held(candidate),
      ),
    };
  };

  const occurrencesByDefinition = new Map<string, CharacterOccurrence[]>();
  for (const occurrence of occurrences) {
    const definitionKey = key(occurrence.definitionId);
    occurrencesByDefinition.set(definitionKey, [
      ...(occurrencesByDefinition.get(definitionKey) ?? []),
      occurrence,
    ]);
  }
  /**
   * Whether choosing `definition` in a slot at `choiceLevel` would duplicate
   * an occurrence owned by then. Mirrors the topology pass's duplicate drop:
   * the slot's own selection and its descendants don't count.
   */
  const ownedElsewhere = (
    definition: ContentEntity,
    equivalent: ContentEntity,
    choiceLevel: number,
    excludedIds: readonly string[],
    alsoOwned: readonly CharacterOccurrence[] = [],
  ): boolean =>
    [definition, ...(equivalent === definition ? [] : [equivalent])].some(
      (entity) =>
        [
          ...(occurrencesByDefinition.get(key(entity.id)) ?? []),
          ...alsoOwned.filter(
            (owned) => key(owned.definitionId) === key(entity.id),
          ),
        ].some(
          (owned) =>
            owned.acquiredLevel <= choiceLevel &&
            excludedIds.every(
              (id) => owned.id !== id && !isDescendantOf(owned, id),
            ),
        ),
    );
  /** A gain candidate already owned is marked like a select's (native
   * UpdateArrays runs for a replacement's gain list too), counting what was
   * held then but traded away by a later replacement. */
  const markOwned = (
    candidate: CandidateDecision,
    choiceLevel: number,
    excludedIds: readonly string[],
    alsoOwned: readonly CharacterOccurrence[] = [],
  ): CandidateDecision => {
    const definition = index.get(candidate.definitionId);
    return definition !== undefined &&
      !candidate.reasons.includes("self") &&
      ownedElsewhere(
        definition,
        passThroughDefinition(definition),
        choiceLevel,
        excludedIds,
        alsoOwned,
      )
      ? {
          ...candidate,
          eligible: false,
          rulesLegal: false,
          reasons: [...candidate.reasons, "owned"],
        }
      : candidate;
  };
  const candidateFor = (
    rule: SelectRule,
    provider: CharacterOccurrence,
    candidate: ContentEntity,
  ): CandidateDecision => {
    const reasons: string[] = [];
    if (key(candidate.id) === key(provider.definitionId)) reasons.push("self");
    if (rule.category !== undefined) {
      const category =
        categoryCache.get(rule.category) ??
        parseCategoryExpression(rule.category);
      categoryCache.set(rule.category, category);
      // The legacy engine treats the selected theme as a class category for
      // power choices only. This is what permits a theme attack such as Sly
      // Gambit to occupy the ordinary level-7 class encounter-power slot.
      const candidateContext =
        key(candidate.type) !== "power" || themeClassValues.length === 0
          ? expressionContext
          : {
              ...expressionContext,
              dynamicCategories: {
                ...expressionContext.dynamicCategories,
                $$CLASS: new Set([
                  ...(expressionContext.dynamicCategories?.$$CLASS ?? []),
                  ...themeClassValues,
                ]),
                $$NOT_CLASS: new Set([
                  ...(expressionContext.dynamicCategories?.$$NOT_CLASS ?? []),
                  ...themeClassValues,
                ]),
              },
              categoryValuesFor: (entity: ContentEntity) =>
                new Set([
                  ...index.categoryValues(entity),
                  ...[field(entity, "Class"), field(entity, "_ThemePower")]
                    .filter((value): value is string => value !== undefined)
                    .map(key),
                ]),
            };
      let match = matchesCategory(candidate, category, candidateContext);
      const terms =
        categoryTermsCache.get(rule.category) ??
        category.groups.flatMap((group) =>
          group.alternatives.map((term) => term.value),
        );
      categoryTermsCache.set(rule.category, terms);
      match ||= terms.some((term) => isUniversalSkill(candidate, term));
      match ||=
        universalSkillIds.has(key(candidate.id)) &&
        terms.some((term) => key(index.find(term)?.type ?? "") === "class");
      match ||= terms.some((term) =>
        diverseStudyException(candidate, term, ownedIds),
      );
      match ||= seekerException(
        candidate,
        provider.definitionId,
        terms,
        ownedIds,
      );
      match ||= versatileMasterException(
        candidate,
        provider.definitionId,
        ownedIds,
      );
      match ||= isCustomChoiceException(candidate);
      if (!match) reasons.push("category");
    }
    if (grantsExistingClassSkill(candidate))
      reasons.push("already-class-skill");
    const membership = memberships.get(key(candidate.id));
    if (rule.existing && membership === undefined) reasons.push("existing");
    const sourceEntitled = isSourceEntitled(candidate);
    if (!sourceEntitled) reasons.push("source-unentitled");
    const rulesLegal = !reasons.some(
      (reason) => reason !== "source-unentitled",
    );
    return {
      definitionId: candidate.id,
      eligible: sourceEntitled && rulesLegal,
      sourceEntitled,
      rulesLegal,
      activeDefinition: membership !== undefined,
      activeOccurrenceIds: membership?.occurrenceIds ?? [],
      providerOccurrenceIds: membership?.providerOccurrenceIds ?? [],
      reasons,
    };
  };
  const candidatesFor = (
    rule: SelectRule,
    provider: CharacterOccurrence,
  ): CandidateDecision[] => {
    const cacheKey = [
      key(rule.type),
      rule.category ?? "",
      provider.definitionId,
      input.level,
      rule.existing,
    ].join("\0");
    const cached = candidateCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const decisions = index
      .type(rule.type)
      .map((candidate) => candidateFor(rule, provider, candidate));
    candidateCache.set(cacheKey, decisions);
    return decisions;
  };

  for (const occurrence of occurrences) {
    const entity = index.get(occurrence.definitionId);
    if (entity === undefined) continue;
    if (occurrence.legality === "houserule")
      diagnostics.push({
        severity: "warning",
        code: "occurrence.houserule",
        message: `${entity.name} is marked as a house rule.`,
        occurrenceId: occurrence.id,
      });
    // Race "Skill Bonuses" and background "Benefit" text is display-only: the
    // native engine never reads either field, and content grants the real
    // bonuses through rules (parsing the text double-counted them).
    const entityRules = parseRules(entity.id, entity.rules);
    for (const rule of entityRules) {
      if (
        !activeAt(rule, input.level) ||
        !ruleRequiresMet(
          rule.requires,
          occurrence,
          occurrences,
          expressionContext,
        )
      )
        continue;
      switch (rule.kind) {
        case "statadd": {
          const adjustedArmorBonus = adjustedMagicArmorBonuses.get(
            key(entity.id),
          );
          stats.add({
            id: `${occurrence.id}:${rule.source.ordinal}`,
            stat: rule.name,
            value:
              adjustedArmorBonus !== undefined &&
              key(rule.name) === "armor class" &&
              key(rule.bonusType ?? "") === "armor"
                ? String(adjustedArmorBonus)
                : rule.value,
            providerId: occurrence.id,
            providerName: entity.name,
            ...(rule.bonusType === undefined
              ? {}
              : { bonusType: rule.bonusType }),
            ...(rule.condition === undefined
              ? {}
              : { condition: rule.condition }),
            ...(rule.wearing === undefined ? {} : { wearing: rule.wearing }),
            ...(rule.notWearing === undefined
              ? {}
              : { notWearing: rule.notWearing }),
            ...(rule.zero === undefined ? {} : { zeroOnly: true }),
            ...(rule.nonZero === undefined ? {} : { nonZeroOnly: true }),
            ...(rule.halfPoint === undefined ? {} : { halfPoint: true }),
          });
          break;
        }
        case "statalias":
          stats.alias(rule.name, rule.alias);
          break;
        case "textstring":
          // Native records a conditional textstring as a string statadd on
          // its stat (StatBlock `statadd String="+1d6" conditional=...`),
          // which CalcConditionals reads back as a power-card reminder.
          if (rule.condition !== undefined) {
            stats.add({
              id: `${occurrence.id}:${rule.source.ordinal}`,
              stat: rule.name,
              value: rule.value,
              providerId: occurrence.id,
              providerName: entity.name,
              condition: rule.condition,
              ...(rule.wearing === undefined ? {} : { wearing: rule.wearing }),
              text: true,
            });
            break;
          }
          if (
            rule.wearing === undefined ||
            equipmentPredicate(equipment, rule.wearing)
          ) {
            text[rule.name] = rule.value;
            textContributions.push({
              name: rule.name,
              value: rule.value,
              providerId: occurrence.id,
              providerName: entity.name,
              definitionId: entity.id,
            });
          }
          break;
        case "select": {
          if (prerequisiteContextOnly) break;
          const choiceLevel = Math.max(
            occurrence.acquiredLevel,
            rule.source.level.minimum,
          );
          for (
            let choiceIndex = 0;
            choiceIndex < rule.number;
            choiceIndex += 1
          ) {
            if (
              droppedSelectSlots.has(
                `${occurrence.id}:${rule.source.ordinal}:${choiceIndex}`,
              )
            )
              continue;
            const directSelection = saved.find(
              (candidate) =>
                candidate.parentId === occurrence.id &&
                candidate.ruleOrdinal === rule.source.ordinal &&
                (candidate.choiceIndex ?? 0) === choiceIndex,
            );
            const selected =
              occurrences.find(
                (candidate) =>
                  candidate.parentId === occurrence.id &&
                  candidate.ruleOrdinal === rule.source.ordinal &&
                  (candidate.choiceIndex ?? 0) === choiceIndex,
              ) ??
              (directSelection === undefined
                ? undefined
                : occurrences.find((candidate) =>
                    replacementIncludes(candidate, directSelection.id),
                  ));
            const siblingDefinitionIds = new Set(
              occurrences
                .filter(
                  (candidate) =>
                    candidate.parentId === occurrence.id &&
                    candidate.ruleOrdinal === rule.source.ordinal &&
                    (candidate.choiceIndex ?? 0) !== choiceIndex,
                )
                .map((candidate) => key(candidate.definitionId)),
            );
            const detailed =
              candidateDetailLevels === undefined ||
              candidateDetailLevels.has(choiceLevel);
            const selectedEntity =
              selected === undefined
                ? undefined
                : index.get(selected.definitionId);
            const baseCandidates = detailed
              ? candidatesFor(rule, occurrence)
              : selectedEntity !== undefined
                ? [candidateFor(rule, occurrence, selectedEntity)]
                : rule.existing
                  ? ownedDefinitions
                      .filter(
                        (candidate) => key(candidate.type) === key(rule.type),
                      )
                      .map((candidate) =>
                        candidateFor(rule, occurrence, candidate),
                      )
                  : [];
            const candidates = baseCandidates
              .map((candidate) => {
                const definition = index.get(candidate.definitionId);
                if (
                  rule.existing ||
                  definition === undefined ||
                  key(definition.name) === key(defaultName(rule) ?? "")
                )
                  return candidate;
                const equivalent = passThroughDefinition(definition);
                const duplicate =
                  siblingDefinitionIds.has(key(definition.id)) ||
                  (equivalent !== definition &&
                    siblingDefinitionIds.has(key(equivalent.id)));
                if (duplicate)
                  return {
                    ...candidate,
                    eligible: false,
                    rulesLegal: false,
                    reasons: [...candidate.reasons, "duplicate"],
                  };
                // The topology pass drops a selection whose definition is
                // already owned by the choice's level (legacy marks such a
                // candidate Selected), so offering it would let a pick vanish.
                return !candidate.reasons.includes("self") &&
                  ownedElsewhere(
                    definition,
                    equivalent,
                    choiceLevel,
                    selected === undefined ? [] : [selected.id],
                  )
                  ? {
                      ...candidate,
                      eligible: false,
                      rulesLegal: false,
                      reasons: [...candidate.reasons, "owned"],
                    }
                  : candidate;
              })
              .filter(
                (candidate) =>
                  candidateDetailLevels === undefined ||
                  candidate.definitionId === selected?.definitionId ||
                  !candidate.reasons.includes("category"),
              );
            choices.push({
              id: `${occurrence.id}:choice:${rule.source.ordinal}:${choiceIndex}`,
              level: choiceLevel,
              providerOccurrenceId: occurrence.id,
              ruleOrdinal: rule.source.ordinal,
              index: choiceIndex,
              type: rule.type,
              ...(rule.name === undefined ? {} : { name: rule.name }),
              ...(rule.spellbook === undefined
                ? {}
                : { spellbook: rule.spellbook }),
              optional:
                rule.optional ||
                ["build", "class build"].includes(key(rule.type)),
              ...(selected === undefined
                ? {}
                : { selectedOccurrenceId: selected.id }),
              candidates,
            });
          }
          break;
        }
        case "replace": {
          if (prerequisiteContextOnly) break;
          const replacementChoiceId = `${occurrence.id}:replacement:${rule.source.ordinal}`;
          const replacementLevel = Math.max(
            occurrence.acquiredLevel,
            rule.source.level.minimum,
          );
          const detailedReplacement =
            candidateDetailLevels === undefined ||
            candidateDetailReplacementChoiceIds.has(replacementChoiceId);
          const { selected, held, heldThenReplaced } = replacementSlot(
            occurrence,
            rule.source.ordinal,
            replacementLevel,
          );
          const replacementOptions = saved
            .filter((candidate) => {
              const candidateType = key(
                index.get(candidate.definitionId)?.type ?? "",
              );
              const powerOnly =
                rule.powerReplace !== undefined ||
                rule.multiclass !== undefined ||
                rule.powerSwap !== undefined;
              // Martial Power p. 42: instead of a feat, a power or a skill,
              // a retrain can change the beast companion.
              const ordinaryRetraining =
                rule.retrain === undefined ||
                ["feat", "power", "skill training"].includes(candidateType) ||
                isBeastCompanionEntity(index.get(candidate.definitionId));
              return (
                held(candidate) &&
                candidate.acquiredLevel < replacementLevel &&
                candidate.kind === "choice" &&
                ordinaryRetraining &&
                (!powerOnly || candidateType === "power")
              );
            })
            .flatMap((candidate) => {
              let original = candidate;
              const visited = new Set<string>();
              while (
                original.replacesId !== undefined &&
                !visited.has(original.id)
              ) {
                visited.add(original.id);
                const previous = saved.find(
                  (value) => value.id === original.replacesId,
                );
                if (previous === undefined) break;
                original = previous;
              }
              const originalProvider = saved.find(
                (provider) => provider.id === original.parentId,
              );
              const originalDefinition =
                originalProvider === undefined
                  ? undefined
                  : index.get(originalProvider.definitionId);
              const originalSelect =
                originalDefinition === undefined
                  ? undefined
                  : parseRules(originalDefinition.id, originalDefinition.rules)
                      .filter(
                        (candidateRule): candidateRule is SelectRule =>
                          candidateRule.kind === "select",
                      )
                      .find(
                        (candidateRule) =>
                          candidateRule.source.ordinal === original.ruleOrdinal,
                      );
              if (
                originalProvider === undefined ||
                originalSelect === undefined
              )
                return [];
              const selectedReplacement =
                selected?.replacesId === candidate.id
                  ? index.get(selected.definitionId)
                  : undefined;
              const gainSelect =
                rule.powerSwap === undefined
                  ? originalSelect
                  : { ...originalSelect, category: rule.powerSwap };
              const gainProvider =
                rule.powerSwap === undefined ? originalProvider : occurrence;
              // Native CheckReplaceElem: a power swap can only lose a power
              // that matches its own category (class, usage, level or
              // lower), so a level-13 encounter swap never offers a daily.
              const lost = index.get(candidate.definitionId);
              if (
                rule.powerSwap !== undefined &&
                candidate.id !== selected?.replacesId &&
                lost !== undefined &&
                candidateFor(gainSelect, gainProvider, lost).reasons.includes(
                  "category",
                )
              )
                return [];
              return [
                {
                  replacesOccurrenceId: candidate.id,
                  definitionId: candidate.definitionId,
                  // Retraining X into X changes nothing, so it isn't offered.
                  candidates: detailedReplacement
                    ? candidatesFor(gainSelect, gainProvider)
                        .filter(
                          (decision) =>
                            key(decision.definitionId) !==
                            key(candidate.definitionId),
                        )
                        .map((decision) =>
                          markOwned(
                            decision,
                            replacementLevel,
                            [
                              candidate.id,
                              ...(selected === undefined ? [] : [selected.id]),
                            ],
                            heldThenReplaced,
                          ),
                        )
                    : selectedReplacement === undefined
                      ? []
                      : [
                          candidateFor(
                            gainSelect,
                            gainProvider,
                            selectedReplacement,
                          ),
                        ],
                },
              ];
            });
          choices.push({
            id: replacementChoiceId,
            level: replacementLevel,
            providerOccurrenceId: occurrence.id,
            ruleOrdinal: rule.source.ordinal,
            index: 0,
            type: "Replacement",
            ...(rule.label === undefined ? {} : { name: rule.label }),
            optional: rule.optional,
            ...(selected === undefined
              ? {}
              : { selectedOccurrenceId: selected.id }),
            candidates: replacementOptions.map((option) => ({
              definitionId: option.definitionId,
              eligible:
                index.get(option.definitionId) === undefined ||
                isSourceEntitled(index.get(option.definitionId)!),
              sourceEntitled:
                index.get(option.definitionId) === undefined ||
                isSourceEntitled(index.get(option.definitionId)!),
              rulesLegal: true,
              activeDefinition: memberships.has(key(option.definitionId)),
              activeOccurrenceIds:
                memberships.get(key(option.definitionId))?.occurrenceIds ?? [],
              providerOccurrenceIds:
                memberships.get(key(option.definitionId))
                  ?.providerOccurrenceIds ?? [],
              reasons:
                index.get(option.definitionId) !== undefined &&
                !isSourceEntitled(index.get(option.definitionId)!)
                  ? ["source-unentitled"]
                  : [],
            })),
            replacementOptions,
          });
          break;
        }
        case "modify":
          if (
            rule.wearing === undefined ||
            equipmentPredicate(equipment, rule.wearing)
          )
            overlays.push(
              overlay(
                rule,
                occurrence,
                entityRules,
                occurrences,
                index,
                baseItemIds,
              ),
            );
          break;
        case "suggest": {
          const target = index.find(rule.name, rule.type);
          if (target !== undefined)
            suggestions.push({
              providerOccurrenceId: occurrence.id,
              definitionId: target.id,
              type: target.type,
            });
          break;
        }
        case "unknown":
          diagnostics.push({
            severity: "warning",
            code: "rule.unknown",
            message: `Unknown rule statement ${rule.statementName} was preserved but not evaluated.`,
            occurrenceId: occurrence.id,
            ruleOrdinal: rule.source.ordinal,
          });
          break;
        default:
          break;
      }
    }
    const masteryPowerId = archeryMasteryPowerId(entity);
    const masteryPower =
      masteryPowerId === undefined ? undefined : index.get(masteryPowerId);
    if (!prerequisiteContextOnly && masteryPower !== undefined) {
      const ruleOrdinal = 0;
      const { selected, held } = replacementSlot(
        occurrence,
        ruleOrdinal,
        occurrence.acquiredLevel,
      );
      const replacementOptions = saved.flatMap((candidate) => {
        const candidateEntity = index.get(candidate.definitionId);
        return candidate.kind === "choice" &&
          candidate.acquiredLevel <= occurrence.acquiredLevel &&
          held(candidate) &&
          candidateEntity !== undefined &&
          isLeveledRangerAtWillAttack(candidateEntity)
          ? [
              {
                replacesOccurrenceId: candidate.id,
                definitionId: candidate.definitionId,
                candidates: [
                  {
                    definitionId: masteryPower.id,
                    eligible: isSourceEntitled(masteryPower),
                    sourceEntitled: isSourceEntitled(masteryPower),
                    rulesLegal: true,
                    activeDefinition: memberships.has(key(masteryPower.id)),
                    activeOccurrenceIds:
                      memberships.get(key(masteryPower.id))?.occurrenceIds ??
                      [],
                    providerOccurrenceIds:
                      memberships.get(key(masteryPower.id))
                        ?.providerOccurrenceIds ?? [],
                    reasons: isSourceEntitled(masteryPower)
                      ? []
                      : ["source-unentitled"],
                  },
                ],
              },
            ]
          : [];
      });
      choices.push({
        id: `${occurrence.id}:archery-mastery-replacement`,
        level: occurrence.acquiredLevel,
        providerOccurrenceId: occurrence.id,
        ruleOrdinal,
        index: 0,
        type: "Replacement",
        name: `${entity.name} power replacement`,
        optional: true,
        ...(selected === undefined
          ? {}
          : { selectedOccurrenceId: selected.id }),
        candidates: replacementOptions.map((option) => ({
          definitionId: option.definitionId,
          eligible:
            index.get(option.definitionId) === undefined ||
            isSourceEntitled(index.get(option.definitionId)!),
          sourceEntitled:
            index.get(option.definitionId) === undefined ||
            isSourceEntitled(index.get(option.definitionId)!),
          rulesLegal: true,
          activeDefinition: memberships.has(key(option.definitionId)),
          activeOccurrenceIds:
            memberships.get(key(option.definitionId))?.occurrenceIds ?? [],
          providerOccurrenceIds:
            memberships.get(key(option.definitionId))?.providerOccurrenceIds ??
            [],
          reasons:
            index.get(option.definitionId) !== undefined &&
            !isSourceEntitled(index.get(option.definitionId)!)
              ? ["source-unentitled"]
              : [],
        })),
        replacementOptions,
      });
    }
  }
  const evaluatedStats = Object.fromEntries(
    stats.allNames().map((name) => [name, stats.evaluate(name)]),
  );
  if (prerequisiteContextOnly) choices = [];
  const abilityNames = [
    "Strength",
    "Constitution",
    "Dexterity",
    "Intelligence",
    "Wisdom",
    "Charisma",
  ] as const;
  const knownTokens = knownDefinitionTokens(evaluationEntities);
  const prerequisiteContextFor = (
    level: number,
    owned: readonly ContentEntity[],
    abilityValue: (ability: string) => number | string | undefined,
  ): PrerequisiteContext => ({
    owned,
    definitions: evaluationEntities,
    level,
    abilities: Object.fromEntries(
      abilityNames.map((ability) => {
        const value = abilityValue(ability);
        return [ability, typeof value === "number" ? value : 0];
      }),
    ),
    ownedTokens: new Set(
      owned.flatMap((entity) =>
        [
          entity.id,
          entity.name,
          `${entity.name} ${entity.type}`,
          `${entity.type} ${entity.name}`,
        ].map((value) => value.trim().toLocaleLowerCase().replaceAll("_", " ")),
      ),
    ),
    knownTokens,
  });
  const prerequisiteScopes = new Map<
    string,
    {
      readonly context: PrerequisiteContext;
      readonly expressionContext: ExpressionContext;
    }
  >([
    [
      String(input.level),
      {
        context: prerequisiteContextFor(
          input.level,
          ownedDefinitions,
          (ability) => stats.evaluate(ability).value,
        ),
        expressionContext,
      },
    ],
  ]);
  /** Occurrences and everything they granted (their descendants). */
  const withDescendants = (ids: readonly string[]): ReadonlySet<string> => {
    const excluded = new Set(ids);
    let grew = excluded.size > 0;
    while (grew) {
      grew = false;
      for (const occurrence of input.occurrences)
        if (
          occurrence.parentId !== undefined &&
          excluded.has(occurrence.parentId) &&
          !excluded.has(occurrence.id)
        ) {
          excluded.add(occurrence.id);
          grew = true;
        }
    }
    return excluded;
  };
  /** The character at a level, optionally without some occurrences (what a
   *  retrain gives up can't count toward what it takes). */
  const prerequisiteScopeAt = (
    requestedLevel: number,
    excludedIds: readonly string[] = [],
  ) => {
    const level = Math.min(input.level, requestedLevel);
    const excluded = withDescendants(excludedIds);
    const scopeKey = [level, ...[...excluded].sort()].join("\0");
    const cached = prerequisiteScopes.get(scopeKey);
    if (cached !== undefined) return cached;
    const scopedInput =
      excluded.size === 0
        ? input
        : {
            ...input,
            occurrences: input.occurrences.filter(
              ({ id }) => !excluded.has(id),
            ),
          };
    const snapshotCache =
      prerequisiteSnapshotCaches.get(entities) ??
      new Map<string, EvaluatedCharacter>();
    if (!prerequisiteSnapshotCaches.has(entities))
      prerequisiteSnapshotCaches.set(entities, snapshotCache);
    const snapshotKey = prerequisiteSnapshotKey(scopedInput, level);
    let scoped = snapshotCache.get(snapshotKey);
    if (scoped === undefined) {
      scoped = evaluateCharacterInternal(
        {
          ...scopedInput,
          level,
          candidateDetailLevels: [],
          candidateDetailReplacementChoiceIds: [],
        },
        entities,
        true,
        { evaluationEntities, index },
      );
      snapshotCache.set(snapshotKey, scoped);
      while (snapshotCache.size > 64)
        snapshotCache.delete(snapshotCache.keys().next().value!);
    } else {
      snapshotCache.delete(snapshotKey);
      snapshotCache.set(snapshotKey, scoped);
    }
    const scopedOwned = scoped.occurrences.flatMap((occurrence) => {
      const definition = index.get(occurrence.definitionId);
      return definition === undefined ? [] : [definition];
    });
    const scope = {
      context: prerequisiteContextFor(
        level,
        scopedOwned,
        (ability: string) => scoped.stats[ability]?.value,
      ),
      expressionContext: {
        owned: scopedOwned,
        level,
        dynamicCategories: dynamicCategories(
          scopedOwned,
          scoped.occurrences,
          index,
          input.textStrings ?? {},
        ),
        categoryAliases: index.categoryAliases,
        categoryValuesFor: (entity: ContentEntity) =>
          index.categoryValues(entity),
      },
    };
    prerequisiteScopes.set(scopeKey, scope);
    reportProgress(progressCompleted + 1);
    return scope;
  };
  const candidatePrerequisiteStatuses = new Map<
    string,
    ReturnType<typeof evaluatePrerequisite>["status"]
  >();
  const withPrerequisites = (
    level: number,
    candidate: CandidateDecision,
    excludedIds: readonly string[] = [],
    setAside: readonly string[] = [],
  ): CandidateDecision => {
    const candidateEntity = index.get(candidate.definitionId);
    if (
      candidateEntity?.prerequisites === undefined ||
      candidateEntity.prerequisites.trim().length === 0
    )
      return candidate;
    const prerequisiteContext = withoutOwnedDefinitions(
      prerequisiteScopeAt(level, excludedIds).context,
      setAside,
    );
    const candidateKey = [
      level,
      key(candidate.definitionId),
      ...[...excludedIds].sort(),
      "",
      ...[...setAside].map(key).sort(),
    ].join("\0");
    let prerequisiteStatus = candidatePrerequisiteStatuses.get(candidateKey);
    if (prerequisiteStatus === undefined) {
      prerequisiteStatus = evaluatePrerequisite(
        candidateEntity?.prerequisites,
        {
          ...prerequisiteContext,
          ...(candidateEntity === undefined
            ? {}
            : { subject: candidateEntity }),
        },
      ).status;
      candidatePrerequisiteStatuses.set(candidateKey, prerequisiteStatus);
    }
    if (
      prerequisiteStatus === "satisfied" ||
      candidate.reasons.includes("prerequisite") ||
      candidate.reasons.includes("prerequisite-unverified")
    )
      return candidate;
    return {
      ...candidate,
      eligible: false,
      rulesLegal: false,
      reasons: [
        ...candidate.reasons,
        prerequisiteStatus === "failed"
          ? "prerequisite"
          : "prerequisite-unverified",
      ],
    };
  };
  // Prerequisites hold for every offered candidate, including what a
  // replacement (retraining, power swap) may take, checked at its level
  // without what it gives up (nor the slot's current pick, being redone).
  // An ordinary slot's candidates are checked with its own pick set aside.
  const selectionSetAside = (choice: (typeof choices)[number]) =>
    choiceSelectionSetAside(
      occurrences.find(({ id }) => id === choice.selectedOccurrenceId),
      occurrences,
      (definitionId) => index.get(definitionId),
    );
  choices = choices.map((choice) => {
    const setAside = selectionSetAside(choice);
    return {
      ...choice,
      candidates: choice.candidates.map((candidate) =>
        withPrerequisites(choice.level, candidate, [], setAside),
      ),
      ...(choice.replacementOptions === undefined
        ? {}
        : {
            replacementOptions: choice.replacementOptions.map((option) => ({
              ...option,
              candidates: option.candidates.map((candidate) =>
                withPrerequisites(choice.level, candidate, [
                  option.replacesOccurrenceId,
                  ...(choice.selectedOccurrenceId === undefined
                    ? []
                    : [choice.selectedOccurrenceId]),
                ]),
              ),
            })),
          }),
    };
  });
  if (shouldChooseDeity(ownedDefinitions))
    choices = choices.map((choice) =>
      key(choice.type) === "deity" ? { ...choice, optional: false } : choice,
    );
  for (const choice of choices)
    if (
      !choice.optional &&
      choice.selectedOccurrenceId === undefined &&
      !(() => {
        const provider = occurrences.find(
          ({ id }) => id === choice.providerOccurrenceId,
        );
        const definition =
          provider === undefined ? undefined : index.get(provider.definitionId);
        const rule =
          definition === undefined
            ? undefined
            : parseRules(definition.id, definition.rules).find(
                (candidate) => candidate.source.ordinal === choice.ruleOrdinal,
              );
        return (
          rule?.kind === "select" &&
          rule.existing &&
          !choice.candidates.some(
            (candidate) =>
              candidate.activeDefinition && candidate.sourceEntitled,
          )
        );
      })() &&
      !(
        choice.type === "Replacement" &&
        (choice.replacementOptions?.length ?? 0) === 0
      )
    )
      diagnostics.push({
        severity: "error",
        code: "choice.required",
        message: `Required ${choice.type} choice is unresolved.`,
        occurrenceId: choice.providerOccurrenceId,
        ruleOrdinal: choice.ruleOrdinal,
      });
  // House-ruled selections that the live checks below now find legal.
  const nowLegalOccurrenceIds = new Set<string>();
  for (const choice of choices) {
    if (choice.selectedOccurrenceId === undefined) continue;
    const selectedOccurrence = occurrences.find(
      (occurrence) => occurrence.id === choice.selectedOccurrenceId,
    );
    // A swap pick a later swap traded away is history, not held now.
    if (selectedOccurrence === undefined) continue;
    if (
      selectedOccurrence.replacesId !== undefined &&
      (selectedOccurrence.parentId !== choice.providerOccurrenceId ||
        selectedOccurrence.ruleOrdinal !== choice.ruleOrdinal)
    )
      continue;
    const selectedDefinitionId = selectedOccurrence?.definitionId;
    const selected = choice.candidates.find(
      (candidate) => candidate.definitionId === selectedDefinitionId,
    );
    const selectedEntity =
      selectedDefinitionId === undefined
        ? undefined
        : index.get(selectedDefinitionId);
    const prerequisiteScope =
      selectedEntity?.prerequisites === undefined ||
      selectedEntity.prerequisites.trim().length === 0
        ? prerequisiteScopes.get(String(input.level))!
        : prerequisiteScopeAt(choice.level);
    const prerequisite = evaluatePrerequisite(selectedEntity?.prerequisites, {
      ...withoutOwnedDefinitions(
        prerequisiteScope.context,
        selectionSetAside(choice),
      ),
      ...(selectedEntity === undefined ? {} : { subject: selectedEntity }),
    });
    const exactOwnedPrerequisite =
      selectedEntity?.prerequisites !== undefined &&
      !/[;,]/.test(selectedEntity.prerequisites) &&
      evaluateRequires(
        parseRequires(selectedEntity.prerequisites),
        prerequisiteScope.expressionContext,
      );
    if (prerequisite.status === "unverified")
      diagnostics.push({
        severity: "warning",
        code: "prerequisite.unverified",
        message: `The selected ${choice.type} has a legacy prerequisite that is not yet machine-verified: ${selectedDefinitionId ?? "unknown"}`,
        occurrenceId: choice.selectedOccurrenceId,
        ruleOrdinal: choice.ruleOrdinal,
      });
    if (prerequisite.status === "failed")
      diagnostics.push({
        severity: "error",
        code: "prerequisite.failed",
        message: `The selected ${choice.type} does not satisfy its prerequisite: ${selectedEntity?.prerequisites ?? "unknown"}.`,
        occurrenceId: choice.selectedOccurrenceId,
        ruleOrdinal: choice.ruleOrdinal,
      });
    if (
      selected !== undefined &&
      selected.reasons.some(
        (reason) =>
          reason !== "prerequisite" &&
          reason !== "prerequisite-unverified" &&
          // A redundant pick is harmless, not an error.
          reason !== "already-class-skill" &&
          (reason !== "category" || !exactOwnedPrerequisite),
      )
    )
      diagnostics.push({
        severity: "error",
        code: "choice.ineligible",
        message: `The selected ${choice.type} is not eligible: ${selected.reasons.join(", ")}.`,
        occurrenceId: choice.selectedOccurrenceId,
        ruleOrdinal: choice.ruleOrdinal,
      });
    // A saved house-rule flag stands only while the pick is still ineligible.
    // One that now passes every check (a prerequisite the parser has since
    // learned to read, a training gained later) is rules-legal again.
    if (
      selectedOccurrence?.legality === "houserule" &&
      selected?.eligible === true &&
      prerequisite.status === "satisfied"
    )
      nowLegalOccurrenceIds.add(selectedOccurrence.id);
  }
  if (nowLegalOccurrenceIds.size > 0) {
    occurrences = occurrences.map((occurrence) =>
      nowLegalOccurrenceIds.has(occurrence.id)
        ? { ...occurrence, legality: "rules-legal" }
        : occurrence,
    );
    for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
      const diagnostic = diagnostics[index]!;
      if (
        diagnostic.code === "occurrence.houserule" &&
        diagnostic.occurrenceId !== undefined &&
        nowLegalOccurrenceIds.has(diagnostic.occurrenceId)
      )
        diagnostics.splice(index, 1);
    }
  }
  // Legacy EquipLoot/MeetsItemRequirement: an equipped item whose
  // Requirement the character does not meet is "custom equipment", a house
  // rule. It stays equipped and its rules still apply (ShouldExecute ignores
  // the flag); an unequipped one is not reported.
  const activeIds = new Set(
    occurrences.map((occurrence) => key(occurrence.definitionId)),
  );
  let itemRequirementUnmet = false;
  for (const entry of inventory) {
    if (entry.equippedQuantity <= 0 || entry.quantity <= 0) continue;
    for (const definitionId of entry.definitionIds) {
      const entity = index.get(definitionId);
      if (entity === undefined || meetsItemRequirement(entity, activeIds))
        continue;
      itemRequirementUnmet = true;
      diagnostics.push({
        severity: "warning",
        code: "item.requirement-unmet",
        message: `${entry.name ?? entity.name}: ${field(entity, "Requirement") ?? ""}`,
      });
    }
  }
  const complete =
    converged &&
    !diagnostics.some((diagnostic) => diagnostic.code === "choice.required");
  const legal =
    converged &&
    !diagnostics.some(
      (diagnostic) =>
        (diagnostic.severity === "error" &&
          diagnostic.code !== "choice.required") ||
        diagnostic.code === "prerequisite.unverified",
    ) &&
    !itemRequirementUnmet &&
    !occurrences.some((occurrence) => occurrence.legality === "houserule");
  const activeDefinitionIds = occurrences.map(
    (occurrence) => occurrence.definitionId,
  );
  const beastCompanion = prerequisiteContextOnly
    ? undefined
    : evaluateBeastCompanion({
        level: input.level,
        occurrences,
        stats: evaluatedStats,
        fieldsOf: (entity) => applyFieldOverlays(entity, overlays),
        content: index,
      });
  const powers =
    prerequisiteContextOnly || input.includePowers === false
      ? []
      : evaluatePowers({
          level: input.level,
          activeDefinitionIds,
          inventory,
          stats: evaluatedStats,
          overlays,
          textStrings: text,
          textContributions,
          equipment,
          occurrences,
          entities: evaluationEntities,
          ...(beastCompanion === undefined
            ? {}
            : { beastCompanion: beastCompanion.statistics }),
        });
  const activeOccurrenceIds = new Set(occurrences.map(({ id }) => id));
  const replacedSelections = choices.flatMap((choice) => {
    if (choice.type !== "Replacement") return [];
    const selected =
      choice.selectedOccurrenceId === undefined ||
      activeOccurrenceIds.has(choice.selectedOccurrenceId)
        ? undefined
        : savedById.get(choice.selectedOccurrenceId);
    return selected === undefined ? [] : [selected];
  });
  const replacedSelectionIds = new Set(replacedSelections.map(({ id }) => id));
  /** Names a requires expression needs absent ("!X"), under any nesting. */
  const negatedNames = (
    expression: RequiresExpression,
    negated = false,
  ): string[] => {
    switch (expression.kind) {
      case "owned":
        return negated ? [expression.token] : [];
      case "category":
        return [];
      case "not":
        return negatedNames(expression.operand, !negated);
      case "and":
      case "or":
        return expression.operands.flatMap((operand) =>
          negatedNames(operand, negated),
        );
    }
  };
  const dormantSelections = saved.flatMap((occurrence): DormantSelection[] => {
    if (
      occurrence.kind !== "choice" ||
      occurrence.parentId === undefined ||
      occurrence.ruleOrdinal === undefined ||
      activeOccurrenceIds.has(occurrence.id) ||
      displacedIds.has(occurrence.id) ||
      replacedSelectionIds.has(occurrence.id) ||
      droppedSelectSlots.has(
        `${occurrence.parentId}:${occurrence.ruleOrdinal}:${occurrence.choiceIndex ?? 0}`,
      )
    )
      return [];
    const provider = occurrences.find(({ id }) => id === occurrence.parentId);
    const providerDefinition =
      provider === undefined ? undefined : index.get(provider.definitionId);
    if (provider === undefined || providerDefinition === undefined) return [];
    const rule = parseRules(
      providerDefinition.id,
      providerDefinition.rules,
    ).find((candidate) => candidate.source.ordinal === occurrence.ruleOrdinal);
    if (
      rule?.kind !== "select" ||
      rule.requires === undefined ||
      !activeAt(rule, input.level) ||
      ruleRequiresMet(rule.requires, provider, occurrences, expressionContext)
    )
      return [];
    const names = negatedNames(parseRequires(rule.requires));
    const blockedBy = occurrences.filter((candidate) => {
      const entity = index.get(candidate.definitionId);
      return (
        entity !== undefined &&
        names.some((token) =>
          evaluateRequires(
            { kind: "owned", token },
            { ...expressionContext, owned: [entity], namedOwned: [entity] },
          ),
        )
      );
    });
    return [
      {
        occurrence,
        providerOccurrenceId: provider.id,
        ruleOrdinal: occurrence.ruleOrdinal,
        ...(rule.name === undefined ? {} : { slotName: rule.name }),
        slotType: rule.type,
        requires: rule.requires,
        blockedBy,
      },
    ];
  });
  return {
    level: input.level,
    converged,
    iterations,
    complete,
    legal,
    occurrences,
    ...(replacedSelections.length === 0 ? {} : { replacedSelections }),
    ...(dormantSelections.length === 0 ? {} : { dormantSelections }),
    activeDefinitionIds,
    activeDefinitions,
    choices,
    stats: evaluatedStats,
    textStrings: text,
    textContributions,
    overlays,
    powers,
    ...(beastCompanion === undefined ? {} : { beastCompanion }),
    ...(itemSets.itemSets.length === 0 ? {} : { itemSets: itemSets.itemSets }),
    suggestions,
    diagnostics,
  };
}

export function evaluateCharacter(
  input: EvaluationInput,
  entities: readonly ContentEntity[],
  options: EvaluationOptions = {},
): EvaluatedCharacter {
  const evaluated = evaluateCharacterInternal(
    input,
    entities,
    false,
    undefined,
    options,
  );
  options.onProgress?.({ completed: 1, total: 1 });
  return evaluated;
}

/**
 * Native ProcessModify with neither `name` nor `select` walks the
 * provider's child list up to the rule's cursor and modifies the element of
 * the last child created so far. ExecuteRules runs the provider's rules in
 * order, and each grant and replace makes one child (VerifyChild) and each
 * select `number` children, whatever their level or conditions; drops and
 * other statements make none. So the target is the preceding grant's record
 * (FindGrantElement) or what the preceding replace, or the preceding
 * select's last slot, chose. With no child yet, or an empty slot, nothing is
 * modified (Gauntlets of Brilliance makes only Light at-will, Student of
 * Battle only Inspiring Word daily).
 */
function precedingChildTarget(
  rule: ModifyRule,
  providerRules: readonly ExecutableRule[],
  provider: CharacterOccurrence,
  occurrences: readonly CharacterOccurrence[],
  index: RulesIndex,
): string | undefined {
  let child: ExecutableRule | undefined;
  for (const candidate of providerRules) {
    if (candidate.source.ordinal >= rule.source.ordinal) break;
    if (
      candidate.kind === "grant" ||
      candidate.kind === "replace" ||
      (candidate.kind === "select" && candidate.number > 0)
    )
      child = candidate;
  }
  if (child === undefined) return undefined;
  const childRule = child;
  const lastSlot = childRule.kind === "select" ? childRule.number - 1 : 0;
  const created = occurrences.find(
    (occurrence) =>
      occurrence.parentId === provider.id &&
      occurrence.ruleOrdinal === childRule.source.ordinal &&
      (childRule.kind !== "select" ||
        (occurrence.choiceIndex ?? 0) === lastSlot),
  );
  if (created !== undefined) return created.definitionId;
  // A grant whose record another provider already supplies makes no
  // occurrence of its own; native still targets the granted record.
  return childRule.kind === "grant"
    ? index.find(childRule.name, childRule.type)?.id
    : undefined;
}

function overlay(
  rule: ModifyRule,
  provider: CharacterOccurrence,
  providerRules: readonly ExecutableRule[],
  occurrences: readonly CharacterOccurrence[],
  index: RulesIndex,
  baseItemIds: ReadonlyMap<string, string>,
): FieldOverlay {
  // Native ProcessModify: `BaseItem` is the holding's base record while
  // EquipLoot executes its enchantment (Heartwood Spear's spear), and
  // nothing otherwise.
  if (rule.name !== undefined && key(rule.name) === "baseitem") {
    const baseId =
      baseItemIds.get(provider.id) ??
      baseItemIds.get(key(provider.definitionId));
    return {
      providerOccurrenceId: provider.id,
      targetDefinitionIds: baseId === undefined ? [] : [baseId],
      targetName: rule.name,
      field: rule.field,
      ...(rule.value === undefined ? {} : { value: rule.value }),
      ...(rule.listAddition === undefined
        ? {}
        : { listAddition: rule.listAddition }),
      ...(rule.dieIncrease === undefined
        ? {}
        : { dieIncrease: rule.dieIncrease }),
    };
  }
  if (rule.name === undefined && rule.select === undefined) {
    const target = precedingChildTarget(
      rule,
      providerRules,
      provider,
      occurrences,
      index,
    );
    return {
      providerOccurrenceId: provider.id,
      targetDefinitionIds: target === undefined ? [] : [target],
      ...(rule.type === undefined ? {} : { targetType: rule.type }),
      field: rule.field,
      ...(rule.value === undefined ? {} : { value: rule.value }),
      ...(rule.listAddition === undefined
        ? {}
        : { listAddition: rule.listAddition }),
      ...(rule.dieIncrease === undefined
        ? {}
        : { dieIncrease: rule.dieIncrease }),
    };
  }
  // `modify select="X"` targets only what the select named X chose (the
  // Dilettante power, Unexpected Flourish's spell), not every occurrence.
  const occurrencesById =
    rule.select === undefined
      ? undefined
      : new Map(occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const chosenBySelect = (occurrence: CharacterOccurrence): boolean => {
    if (rule.select === undefined || occurrencesById === undefined) return true;
    const parent =
      occurrence.parentId === undefined
        ? undefined
        : occurrencesById.get(occurrence.parentId);
    const parentEntity =
      parent === undefined ? undefined : index.get(parent.definitionId);
    return (
      parentEntity !== undefined &&
      occurrence.ruleOrdinal !== undefined &&
      parseRules(parentEntity.id, parentEntity.rules).some(
        (candidate) =>
          candidate.kind === "select" &&
          candidate.source.ordinal === occurrence.ruleOrdinal &&
          key(candidate.name ?? "") === key(rule.select ?? ""),
      )
    );
  };
  const targetDefinitionIds = occurrences.flatMap((occurrence) => {
    const entity = index.get(occurrence.definitionId);
    if (entity === undefined || !chosenBySelect(occurrence)) return [];
    return (rule.name === undefined ||
      key(entity.name) === key(rule.name) ||
      key(entity.id) === key(rule.name)) &&
      (rule.type === undefined || key(entity.type) === key(rule.type))
      ? [entity.id]
      : [];
  });
  return {
    providerOccurrenceId: provider.id,
    targetDefinitionIds,
    ...(rule.name === undefined ? {} : { targetName: rule.name }),
    ...(rule.type === undefined ? {} : { targetType: rule.type }),
    field: rule.field,
    ...(rule.value === undefined ? {} : { value: rule.value }),
    ...(rule.listAddition === undefined
      ? {}
      : { listAddition: rule.listAddition }),
    ...(rule.dieIncrease === undefined
      ? {}
      : { dieIncrease: rule.dieIncrease }),
  };
}

/**
 * A record's fields as native C_RulesElementField reads them: every `modify`
 * overlay that targets it (see item-fields.ts `overlayTargets`) applied in
 * order over its own specifics.
 */
export function applyFieldOverlays(
  entity: ContentEntity,
  overlays: readonly FieldOverlay[],
): Readonly<Record<string, string>> {
  return overlaidFields(entity, overlays);
}
