import type { ContentEntity } from "@4ecb/content-domain";

import {
  equipmentPredicate,
  type EquippedItem,
  type EquipmentState,
} from "./equipment";
import {
  diverseStudyException,
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
  readonly definitionIds: readonly string[];
  readonly quantity: number;
  readonly equippedQuantity: number;
  readonly acquiredLevel: number;
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

export class RulesIndex {
  readonly entities: readonly ContentEntity[];
  readonly #byId = new Map<string, ContentEntity>();
  readonly #byNameType = new Map<string, ContentEntity>();
  readonly #byType = new Map<string, ContentEntity[]>();
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
      if (key(entity.type) === "category") {
        const aliases = new Set([key(entity.id), key(entity.name)]);
        for (const value of aliases) this.categoryAliases.set(value, aliases);
      }
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
}

function dynamicCategories(
  owned: readonly ContentEntity[],
  text: Readonly<Record<string, string>>,
): Readonly<Record<string, ReadonlySet<string>>> {
  const classValues = new Set<string>();
  const hybridValues = new Set<string>();
  const multiclassValues = new Set<string>();
  for (const entity of owned) {
    const target =
      key(entity.type) === "hybrid class"
        ? hybridValues
        : key(entity.type) === "class"
          ? classValues
          : key(entity.type) === "countsasclass"
            ? multiclassValues
            : undefined;
    if (target !== undefined)
      [
        entity.id,
        entity.name,
        ...entity.categories,
        field(entity, "CountsAsClass") ?? "",
      ]
        .filter(Boolean)
        .forEach((value) => target.add(key(value)));
  }
  const powersAsClass = Object.entries(text).find(
    ([name]) => key(name) === "powersasclass",
  )?.[1];
  if (powersAsClass) classValues.add(key(powersAsClass));
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
        field(entity, "Implement Type") ?? "",
      ].filter(Boolean);
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

export function evaluateCharacter(
  input: EvaluationInput,
  entities: readonly ContentEntity[],
): EvaluatedCharacter {
  const index = new RulesIndex(entities);
  const diagnostics: EngineDiagnostic[] = [];
  const inventoryOccurrences: CharacterOccurrence[] = input.inventory.flatMap(
    (entry) =>
      entry.acquiredLevel > input.level || entry.equippedQuantity <= 0
        ? []
        : entry.definitionIds.map((definitionId, definitionIndex) => ({
            id: `${entry.id}:definition:${definitionIndex}`,
            definitionId,
            acquiredLevel: entry.acquiredLevel,
            kind: "grabbag" as const,
          })),
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
        input.textStrings ?? {},
      ),
      categoryAliases: index.categoryAliases,
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
      input.textStrings ?? {},
    ),
    categoryAliases: index.categoryAliases,
  };
  const equipment = equippedState(input, index);
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
      if (rule.category !== undefined) {
        const category = parseCategoryExpression(rule.category);
        let match = matchesCategory(candidate, category, expressionContext);
        const terms = category.groups.flatMap((group) =>
          group.alternatives.map((term) => term.value),
        );
        match ||= terms.some((term) => isUniversalSkill(candidate, term));
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
      if (
        candidate.prerequisites !== undefined &&
        candidate.prerequisites.trim().length > 0
      )
        reasons.push("unverified-prerequisite");
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
    for (const rule of parseRules(entity.id, entity.rules)) {
      if (
        !activeAt(rule, input.level) ||
        (rule.requires !== undefined &&
          !evaluateRequires(parseRequires(rule.requires), expressionContext))
      )
        continue;
      switch (rule.kind) {
        case "statadd":
          stats.add({
            id: `${occurrence.id}:${rule.source.ordinal}`,
            stat: rule.name,
            value: rule.value,
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
          });
          break;
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
          const candidates = candidatesFor(rule, occurrence);
          for (
            let choiceIndex = 0;
            choiceIndex < rule.number;
            choiceIndex += 1
          ) {
            const selected = occurrences.find(
              (candidate) =>
                candidate.parentId === occurrence.id &&
                candidate.ruleOrdinal === rule.source.ordinal &&
                (candidate.choiceIndex ?? 0) === choiceIndex,
            );
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
        case "replace":
          diagnostics.push({
            severity: "warning",
            code: "replace.requires-command",
            message: `${entity.name} has a replacement choice that must be resolved through character history commands.`,
            occurrenceId: occurrence.id,
            ruleOrdinal: rule.source.ordinal,
          });
          break;
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
    if (selected?.reasons.includes("unverified-prerequisite"))
      diagnostics.push({
        severity: "warning",
        code: "prerequisite.unverified",
        message: `The selected ${choice.type} has a legacy prerequisite that is not yet machine-verified: ${selected.definitionId}`,
        occurrenceId: choice.selectedOccurrenceId,
        ruleOrdinal: choice.ruleOrdinal,
      });
    if (
      selected !== undefined &&
      selected.reasons.some((reason) => reason !== "unverified-prerequisite")
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
  return {
    level: input.level,
    converged,
    iterations,
    complete,
    legal,
    occurrences,
    activeDefinitionIds: occurrences.map(
      (occurrence) => occurrence.definitionId,
    ),
    choices,
    stats: evaluatedStats,
    textStrings: text,
    overlays,
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
