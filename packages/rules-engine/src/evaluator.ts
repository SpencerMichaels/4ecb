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
} from "./expressions";
import {
  parseRules,
  type ExecutableRule,
  type ModifyRule,
  type SelectRule,
} from "./ir";
import { StatAccumulator, type EvaluatedStat } from "./stats";
import {
  evaluatePrerequisite,
  type PrerequisiteContext,
} from "./prerequisites";
import { evaluatePowers, type EvaluatedPower } from "./powers";

/** Bump whenever EvaluationInput semantics or EvaluatedCharacter shape changes. */
export const RULES_EVALUATION_CACHE_VERSION =
  "evaluated-character-v3-2026-09-17";

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
  readonly selectedOccurrenceId?: string;
  readonly candidates: readonly CandidateDecision[];
  readonly replacementOptions?: readonly {
    readonly replacesOccurrenceId: string;
    readonly definitionId: string;
    readonly candidates: readonly CandidateDecision[];
  }[];
}

export interface FieldOverlay {
  readonly providerOccurrenceId: string;
  readonly targetDefinitionIds: readonly string[];
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

export interface EvaluatedCharacter {
  readonly level: number;
  readonly converged: boolean;
  readonly iterations: number;
  readonly complete: boolean;
  readonly legal: boolean;
  readonly occurrences: readonly CharacterOccurrence[];
  readonly activeDefinitionIds: readonly string[];
  readonly activeDefinitions: readonly ActiveDefinitionMembership[];
  readonly choices: readonly EvaluatedChoice[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly textStrings: Readonly<Record<string, string>>;
  readonly overlays: readonly FieldOverlay[];
  readonly powers: readonly EvaluatedPower[];
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

function nativeSpecificStatBonuses(
  entity: ContentEntity,
): readonly { stat: string; value: number; source: string }[] {
  const result: { stat: string; value: number; source: string }[] = [];
  const skillBonuses = field(entity, "Skill Bonuses");
  if (key(entity.type) === "race" && skillBonuses !== undefined)
    for (const match of skillBonuses.matchAll(
      /([+-]\d+)\s+([A-Za-z][A-Za-z ]*)/g,
    ))
      result.push({
        stat: `${match[2]!.trim()} Misc`,
        value: Number(match[1]!),
        source: "Skill Bonuses",
      });

  const benefit = field(entity, "Benefit");
  if (key(entity.type) === "background" && benefit !== undefined)
    for (const match of benefit.matchAll(
      /([+-]\d+)\s+bonus\s+(?:on|to)\s+([A-Za-z]+)(?:\s+skill)?\s+checks/gi,
    ))
      result.push({
        stat: `${match[2]![0]!.toUpperCase()}${match[2]!.slice(1)} Misc`,
        value: Number(match[1]!),
        source: "Benefit",
      });
  return result;
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

function sharedRulesIndex(entities: readonly ContentEntity[]): RulesIndex {
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

function equippedState(
  input: EvaluationInput,
  index: RulesIndex,
): EquipmentState {
  const items: EquippedItem[] = [];
  for (const entry of input.inventory.filter(
    (item) => item.acquiredLevel <= input.level && item.equippedQuantity > 0,
  )) {
    for (const definitionId of entry.definitionIds) {
      const entity = index.get(definitionId);
      if (entity === undefined) continue;
      const properties = (
        field(entity, "Properties") ??
        field(entity, "Weapon Property") ??
        ""
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const categories = [
        ...entity.categories,
        field(entity, "Armor Type") ?? "",
        field(entity, "Armor Category") ?? "",
        field(entity, "Weapon Category") ?? "",
        field(entity, "Weapon Group") ?? "",
        field(entity, "Group") ?? "",
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
      const handsText = field(entity, "Hands Required") ?? "";
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
      });
    }
  }
  return { items };
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
  for (const entry of inventory.filter(
    ({ equippedQuantity }) => equippedQuantity > 0,
  )) {
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

function evaluateCharacterInternal(
  input: EvaluationInput,
  entities: readonly ContentEntity[],
  prerequisiteContextOnly: boolean,
  prepared?: {
    readonly evaluationEntities: readonly ContentEntity[];
    readonly index: RulesIndex;
  },
): EvaluatedCharacter {
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
  const inventoryOccurrences: CharacterOccurrence[] = inventory.flatMap(
    (entry) =>
      entry.acquiredLevel > input.level || entry.equippedQuantity <= 0
        ? []
        : entry.definitionIds.flatMap((definitionId, definitionIndex) =>
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
          ),
  );
  const saved: CharacterOccurrence[] = [
    ...input.occurrences.filter(
      (occurrence) => occurrence.acquiredLevel <= input.level,
    ),
    ...inventoryOccurrences,
  ];
  const replacedIds = new Set(
    saved.flatMap((occurrence) =>
      occurrence.replacesId === undefined ? [] : [occurrence.replacesId],
    ),
  );
  let occurrences = saved.filter(
    (occurrence) => !replacedIds.has(occurrence.id),
  );
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
      (rule.requires === undefined ||
        evaluateRequires(parseRequires(rule.requires), context))
    );
  };
  const reactivatableSaved = saved.filter(
    (occurrence) =>
      !replacedIds.has(occurrence.id) &&
      occurrence.parentId !== undefined &&
      occurrence.ruleOrdinal !== undefined,
  );

  for (iterations = 1; iterations <= 30; iterations += 1) {
    const before = occurrences.map((occurrence) => occurrence.id).join("\0");
    const preliminaryContext = expressionContextFor(occurrences);
    const restored = reactivatableSaved.filter(
      (occurrence) =>
        !occurrences.some((candidate) => candidate.id === occurrence.id) &&
        activeProviderRule(occurrence, occurrences, preliminaryContext),
    );
    if (restored.length > 0) occurrences = [...occurrences, ...restored];
    const context = expressionContextFor(occurrences);
    const additions: CharacterOccurrence[] = [];
    const dropped = new Set<string>();
    for (const occurrence of occurrences)
      if (!activeProviderRule(occurrence, occurrences, context))
        dropped.add(occurrence.id);
    for (const occurrence of occurrences) {
      const entity = index.get(occurrence.definitionId);
      if (entity === undefined) continue;
      for (const rule of parseRules(entity.id, entity.rules)) {
        if (
          !activeAt(rule, input.level) ||
          (rule.requires !== undefined &&
            !evaluateRequires(parseRequires(rule.requires), context))
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
          for (const candidate of occurrences) {
            const definition = index.get(candidate.definitionId);
            if (
              definition !== undefined &&
              (rule.name === undefined ||
                key(definition.name) === key(rule.name) ||
                key(definition.id) === key(rule.name)) &&
              (rule.type === undefined ||
                key(definition.type) === key(rule.type))
            )
              dropped.add(candidate.id);
          }
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
      ...additions,
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
        (rule.requires !== undefined &&
          !evaluateRequires(parseRequires(rule.requires), expressionContext))
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
  const equipment = equippedState(currentInput, index);
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
  const overlays: FieldOverlay[] = [];
  const suggestions: EvaluatedCharacter["suggestions"][number][] = [];
  const text = { ...(input.textStrings ?? {}) };
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
        (rule.requires !== undefined &&
          !evaluateRequires(parseRequires(rule.requires), expressionContext))
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
    for (const [ordinal, bonus] of nativeSpecificStatBonuses(
      entity,
    ).entries()) {
      const explicitBonusName = `${bonus.stat.replace(/ Misc$/i, "")} Bonus`;
      if (
        key(entity.type) === "race" &&
        ownedDefinitions.some(
          (definition) => key(definition.name) === key(explicitBonusName),
        )
      )
        continue;
      stats.add({
        id: `${occurrence.id}:native-specific:${bonus.source}:${ordinal}`,
        stat: bonus.stat,
        value: String(bonus.value),
        providerId: occurrence.id,
        providerName: entity.name,
      });
    }
    for (const rule of parseRules(entity.id, entity.rules)) {
      if (
        !activeAt(rule, input.level) ||
        (rule.requires !== undefined &&
          !evaluateRequires(parseRequires(rule.requires), expressionContext))
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
          if (
            rule.condition === undefined &&
            (rule.wearing === undefined ||
              equipmentPredicate(equipment, rule.wearing))
          )
            text[rule.name] = rule.value;
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
                  siblingDefinitionIds.size === 0 ||
                  definition === undefined ||
                  key(definition.name) === key(defaultName(rule) ?? "")
                )
                  return candidate;
                const equivalent = passThroughDefinition(definition);
                const duplicate =
                  siblingDefinitionIds.has(key(definition.id)) ||
                  (equivalent !== definition &&
                    siblingDefinitionIds.has(key(equivalent.id)));
                return duplicate
                  ? {
                      ...candidate,
                      eligible: false,
                      rulesLegal: false,
                      reasons: [...candidate.reasons, "duplicate"],
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
          const directSelection = saved.find(
            (candidate) =>
              candidate.parentId === occurrence.id &&
              candidate.ruleOrdinal === rule.source.ordinal &&
              candidate.replacesId !== undefined,
          );
          const selected =
            occurrences.find(
              (candidate) =>
                candidate.parentId === occurrence.id &&
                candidate.ruleOrdinal === rule.source.ordinal &&
                candidate.replacesId !== undefined,
            ) ??
            (directSelection === undefined
              ? undefined
              : occurrences.find((candidate) =>
                  replacementIncludes(candidate, directSelection.id),
                ));
          const replacementOptions = saved
            .filter((candidate) => {
              const candidateType = key(
                index.get(candidate.definitionId)?.type ?? "",
              );
              const powerOnly =
                rule.powerReplace !== undefined ||
                rule.multiclass !== undefined ||
                rule.powerSwap !== undefined;
              const ordinaryRetraining =
                rule.retrain === undefined ||
                ["feat", "power", "skill training"].includes(candidateType);
              return (
                (!replacedIds.has(candidate.id) ||
                  candidate.id === selected?.replacesId) &&
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
              return [
                {
                  replacesOccurrenceId: candidate.id,
                  definitionId: candidate.definitionId,
                  candidates: detailedReplacement
                    ? candidatesFor(gainSelect, gainProvider)
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
            overlays.push(overlay(rule, occurrence, occurrences, index));
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
      const directSelection = saved.find(
        (candidate) =>
          candidate.parentId === occurrence.id &&
          candidate.ruleOrdinal === ruleOrdinal &&
          candidate.replacesId !== undefined,
      );
      const selected =
        occurrences.find(
          (candidate) =>
            candidate.parentId === occurrence.id &&
            candidate.ruleOrdinal === ruleOrdinal &&
            candidate.replacesId !== undefined,
        ) ??
        (directSelection === undefined
          ? undefined
          : occurrences.find((candidate) =>
              replacementIncludes(candidate, directSelection.id),
            ));
      const replacementOptions = saved.flatMap((candidate) => {
        const candidateEntity = index.get(candidate.definitionId);
        return candidate.kind === "choice" &&
          candidate.acquiredLevel <= occurrence.acquiredLevel &&
          (!replacedIds.has(candidate.id) ||
            candidate.id === selected?.replacesId) &&
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
    number,
    {
      readonly context: PrerequisiteContext;
      readonly expressionContext: ExpressionContext;
    }
  >([
    [
      input.level,
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
  const prerequisiteScopeAt = (requestedLevel: number) => {
    const level = Math.min(input.level, requestedLevel);
    const cached = prerequisiteScopes.get(level);
    if (cached !== undefined) return cached;
    const snapshotCache =
      prerequisiteSnapshotCaches.get(entities) ??
      new Map<string, EvaluatedCharacter>();
    if (!prerequisiteSnapshotCaches.has(entities))
      prerequisiteSnapshotCaches.set(entities, snapshotCache);
    const snapshotKey = prerequisiteSnapshotKey(input, level);
    let scoped = snapshotCache.get(snapshotKey);
    if (scoped === undefined) {
      scoped = evaluateCharacterInternal(
        {
          ...input,
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
    prerequisiteScopes.set(level, scope);
    return scope;
  };
  const candidatePrerequisiteStatuses = new Map<
    string,
    ReturnType<typeof evaluatePrerequisite>["status"]
  >();
  choices = choices.map((choice) => ({
    ...choice,
    candidates: choice.candidates.map((candidate) => {
      const candidateEntity = index.get(candidate.definitionId);
      if (
        candidateEntity?.prerequisites === undefined ||
        candidateEntity.prerequisites.trim().length === 0
      )
        return candidate;
      const prerequisiteContext = prerequisiteScopeAt(choice.level).context;
      const candidateKey = `${choice.level}\0${key(candidate.definitionId)}`;
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
    }),
  }));
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
  for (const choice of choices) {
    if (choice.selectedOccurrenceId === undefined) continue;
    const selectedOccurrence = occurrences.find(
      (occurrence) => occurrence.id === choice.selectedOccurrenceId,
    );
    if (
      selectedOccurrence?.replacesId !== undefined &&
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
        ? prerequisiteScopes.get(input.level)!
        : prerequisiteScopeAt(choice.level);
    const prerequisite = evaluatePrerequisite(selectedEntity?.prerequisites, {
      ...prerequisiteScope.context,
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
    !occurrences.some((occurrence) => occurrence.legality === "houserule");
  const activeDefinitionIds = occurrences.map(
    (occurrence) => occurrence.definitionId,
  );
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
          entities: evaluationEntities,
        });
  return {
    level: input.level,
    converged,
    iterations,
    complete,
    legal,
    occurrences,
    activeDefinitionIds,
    activeDefinitions,
    choices,
    stats: evaluatedStats,
    textStrings: text,
    overlays,
    powers,
    suggestions,
    diagnostics,
  };
}

export function evaluateCharacter(
  input: EvaluationInput,
  entities: readonly ContentEntity[],
): EvaluatedCharacter {
  return evaluateCharacterInternal(input, entities, false);
}

function overlay(
  rule: ModifyRule,
  provider: CharacterOccurrence,
  occurrences: readonly CharacterOccurrence[],
  index: RulesIndex,
): FieldOverlay {
  const targetDefinitionIds = occurrences.flatMap((occurrence) => {
    const entity = index.get(occurrence.definitionId);
    if (entity === undefined) return [];
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

export function applyFieldOverlays(
  entity: ContentEntity,
  overlays: readonly FieldOverlay[],
): Readonly<Record<string, string>> {
  const fields: Record<string, string> = Object.fromEntries(
    entity.specifics.map((specific) => [specific.name, specific.value]),
  );
  for (const overlay of overlays.filter((candidate) =>
    candidate.targetDefinitionIds.some((id) => key(id) === key(entity.id)),
  )) {
    const existingName =
      Object.keys(fields).find((name) => key(name) === key(overlay.field)) ??
      overlay.field;
    if (overlay.value !== undefined) fields[existingName] = overlay.value;
    if (overlay.listAddition !== undefined)
      fields[existingName] = [fields[existingName], overlay.listAddition]
        .filter(Boolean)
        .join(", ");
    if (overlay.dieIncrease !== undefined)
      fields[existingName] = increaseDie(
        fields[existingName] ?? "",
        Number(overlay.dieIncrease) || 1,
      );
  }
  return fields;
}

function increaseDie(value: string, steps: number): string {
  const dice = [4, 6, 8, 10, 12];
  return value.replace(
    /d(4|6|8|10|12)\b/i,
    (_, size: string) =>
      `d${dice[Math.min(dice.length - 1, dice.indexOf(Number(size)) + steps)]}`,
  );
}
