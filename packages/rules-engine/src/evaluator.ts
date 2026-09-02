import type { ContentEntity } from "@4ecb/content-domain";

import {
  equipmentPredicate,
  type EquippedItem,
  type EquipmentState,
} from "./equipment";
import {
  diverseStudyException,
  EXCEPTION_IDS,
  isCustomChoiceException,
  isUniversalSkill,
  seekerException,
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
import { evaluatePrerequisite } from "./prerequisites";
import { evaluatePowers, type EvaluatedPower } from "./powers";

export interface CharacterOccurrence {
  readonly id: string;
  readonly definitionId: string;
  readonly acquiredLevel: number;
  readonly parentId?: string;
  readonly ruleOrdinal?: number;
  readonly choiceIndex?: number;
  readonly kind: "root" | "choice" | "grant" | "grabbag";
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
}

export interface CandidateDecision {
  readonly definitionId: string;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

export interface EvaluatedChoice {
  readonly id: string;
  readonly providerOccurrenceId: string;
  readonly ruleOrdinal: number;
  readonly index: number;
  readonly type: string;
  readonly name?: string;
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
function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
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

function dynamicCategories(
  owned: readonly ContentEntity[],
  occurrences: readonly CharacterOccurrence[],
  index: RulesIndex,
  text: Readonly<Record<string, string>>,
): Readonly<Record<string, ReadonlySet<string>>> {
  const classValues = new Set<string>();
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

export function evaluateCharacter(
  input: EvaluationInput,
  entities: readonly ContentEntity[],
): EvaluatedCharacter {
  const index = new RulesIndex(entities);
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
                    kind: "grabbag" as const,
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
  let converged = false;
  let iterations = 0;

  for (iterations = 1; iterations <= 30; iterations += 1) {
    const before = occurrences.map((occurrence) => occurrence.id).join("\0");
    const definitions = occurrences.flatMap((occurrence) => {
      const entity = index.get(occurrence.definitionId);
      return entity === undefined ? [] : [entity];
    });
    const context: ExpressionContext = {
      owned: definitions,
      level: input.level,
      dynamicCategories: dynamicCategories(
        definitions,
        occurrences,
        index,
        input.textStrings ?? {},
      ),
      categoryAliases: index.categoryAliases,
      categoryValuesFor: (entity) => index.categoryValues(entity),
    };
    const additions: CharacterOccurrence[] = [];
    const dropped = new Set<string>();
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
        }
      }
    }
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
  const choices: EvaluatedChoice[] = [];
  const overlays: FieldOverlay[] = [];
  const suggestions: EvaluatedCharacter["suggestions"][number][] = [];
  const text = { ...(input.textStrings ?? {}) };
  const candidateCache = new Map<string, CandidateDecision[]>();
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

  const candidatesFor = (
    rule: SelectRule,
    provider: CharacterOccurrence,
  ): CandidateDecision[] => {
    const cacheKey = [
      key(rule.type),
      rule.category ?? "",
      provider.definitionId,
      input.level,
    ].join("\0");
    const cached = candidateCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const decisions = index.type(rule.type).map((candidate) => {
      const reasons: string[] = [];
      if (key(candidate.id) === key(provider.definitionId))
        reasons.push("self");
      if (rule.category !== undefined) {
        const category = parseCategoryExpression(rule.category);
        let match = matchesCategory(candidate, category, expressionContext);
        const terms = category.groups.flatMap((group) =>
          group.alternatives.map((term) => term.value),
        );
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
      return {
        definitionId: candidate.id,
        eligible: reasons.length === 0,
        reasons,
      };
    });
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
          const baseCandidates = candidatesFor(rule, occurrence);
          for (
            let choiceIndex = 0;
            choiceIndex < rule.number;
            choiceIndex += 1
          ) {
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
            const candidates = baseCandidates.map((candidate) =>
              siblingDefinitionIds.has(key(candidate.definitionId))
                ? {
                    ...candidate,
                    eligible: false,
                    reasons: [...candidate.reasons, "duplicate"],
                  }
                : candidate,
            );
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
            choices.push({
              id: `${occurrence.id}:choice:${rule.source.ordinal}:${choiceIndex}`,
              providerOccurrenceId: occurrence.id,
              ruleOrdinal: rule.source.ordinal,
              index: choiceIndex,
              type: rule.type,
              ...(rule.name === undefined ? {} : { name: rule.name }),
              optional: rule.optional,
              ...(selected === undefined
                ? {}
                : { selectedOccurrenceId: selected.id }),
              candidates,
            });
          }
          break;
        }
        case "replace": {
          const replacementLevel = Math.max(
            occurrence.acquiredLevel,
            rule.source.level.minimum,
          );
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
                !replacedIds.has(candidate.id) &&
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
              return originalProvider === undefined ||
                originalSelect === undefined
                ? []
                : [
                    {
                      replacesOccurrenceId: candidate.id,
                      definitionId: candidate.definitionId,
                      candidates: candidatesFor(
                        originalSelect,
                        originalProvider,
                      ),
                    },
                  ];
            });
          choices.push({
            id: `${occurrence.id}:replacement:${rule.source.ordinal}`,
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
              eligible: true,
              reasons: [],
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
  }
  const evaluatedStats = Object.fromEntries(
    stats.allNames().map((name) => [name, stats.evaluate(name)]),
  );
  const prerequisiteContext = {
    owned: ownedDefinitions,
    level: input.level,
    abilities: Object.fromEntries(
      [
        "Strength",
        "Constitution",
        "Dexterity",
        "Intelligence",
        "Wisdom",
        "Charisma",
      ].map((ability) => {
        const value = stats.evaluate(ability).value;
        return [ability, typeof value === "number" ? value : 0];
      }),
    ),
    ownedTokens: new Set(
      ownedDefinitions.flatMap((entity) =>
        [
          entity.id,
          entity.name,
          `${entity.name} ${entity.type}`,
          `${entity.type} ${entity.name}`,
        ].map((value) => value.trim().toLocaleLowerCase().replaceAll("_", " ")),
      ),
    ),
  };
  for (const choice of choices)
    if (!choice.optional && choice.selectedOccurrenceId === undefined)
      diagnostics.push({
        severity: "error",
        code: "choice.required",
        message: `Required ${choice.type} choice is unresolved.`,
        occurrenceId: choice.providerOccurrenceId,
        ruleOrdinal: choice.ruleOrdinal,
      });
  for (const choice of choices) {
    if (choice.selectedOccurrenceId === undefined) continue;
    const selectedDefinitionId = occurrences.find(
      (occurrence) => occurrence.id === choice.selectedOccurrenceId,
    )?.definitionId;
    const selected = choice.candidates.find(
      (candidate) => candidate.definitionId === selectedDefinitionId,
    );
    const selectedEntity =
      selectedDefinitionId === undefined
        ? undefined
        : index.get(selectedDefinitionId);
    const prerequisite = evaluatePrerequisite(
      selectedEntity?.prerequisites,
      prerequisiteContext,
    );
    const exactOwnedPrerequisite =
      selectedEntity?.prerequisites !== undefined &&
      !/[;,]/.test(selectedEntity.prerequisites) &&
      evaluateRequires(
        parseRequires(selectedEntity.prerequisites),
        expressionContext,
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
        (reason) => reason !== "category" || !exactOwnedPrerequisite,
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
  const powers = evaluatePowers({
    level: input.level,
    activeDefinitionIds,
    inventory,
    stats: evaluatedStats,
    overlays,
    textStrings: text,
    entities,
  });
  return {
    level: input.level,
    converged,
    iterations,
    complete,
    legal,
    occurrences,
    activeDefinitionIds,
    choices,
    stats: evaluatedStats,
    textStrings: text,
    overlays,
    powers,
    suggestions,
    diagnostics,
  };
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
