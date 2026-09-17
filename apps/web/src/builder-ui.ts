import {
  applyCharacterCommand,
  type CharacterBuild,
  type CharacterCommand,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  ABILITY_SCORE_NAMES,
  commandForEvaluatedChoice,
  findBuildChildIndex,
  parseRules,
  type AbilityScoreName,
} from "@4ecb/rules-engine";
import type {
  CandidateDecision,
  EvaluatedCharacter,
  EvaluatedChoice,
  EvaluatedStat,
} from "@4ecb/rules-engine";

import { createLevelFrame } from "./new-character";
import { entityVisualTone } from "./visual-language";

export const MAX_CHARACTER_LEVEL = 30;

export function choiceLevel(choice: EvaluatedChoice): number {
  return choice.level;
}

export function choicesAtLevel(
  level: number,
  evaluation: EvaluatedCharacter | undefined,
): readonly EvaluatedChoice[] {
  return (
    evaluation?.choices.filter(
      (choice) =>
        choiceLevel(choice) === level &&
        evaluation.occurrences.find(
          (occurrence) => occurrence.id === choice.providerOccurrenceId,
        )?.kind !== "inventory",
    ) ?? []
  );
}

export function evaluationAtHorizon(
  evaluation: EvaluatedCharacter | undefined,
  horizon: number | undefined,
): EvaluatedCharacter | undefined {
  return evaluation?.level === horizon ? evaluation : undefined;
}

export function abilityScoreBonus(stat: EvaluatedStat | undefined): number {
  if (stat === undefined) return 0;
  let bonus = 0;
  for (const contribution of stat.contributions) {
    if (!contribution.applied || contribution.providerId === "base-abilities")
      continue;
    const parsed =
      contribution.numericValue ?? Number.parseFloat(contribution.value);
    if (Number.isFinite(parsed)) bonus += parsed;
  }
  return bonus;
}

/** Applies only the unevaluated click delta to an authoritative horizon score. */
export function abilityScoreWithPendingDelta(
  evaluation: EvaluatedCharacter,
  ability: string,
  pendingDelta: number,
): number | string | undefined {
  const evaluatedScore = evaluation.stats[ability]?.value;
  if (typeof evaluatedScore === "number") return evaluatedScore + pendingDelta;
  if (evaluatedScore !== undefined && Number.isFinite(Number(evaluatedScore)))
    return Number(evaluatedScore) + pendingDelta;
  return evaluatedScore;
}

export function isUnresolvedChoice(choice: EvaluatedChoice): boolean {
  return !choice.optional && choice.selectedOccurrenceId === undefined;
}

export interface LevelChoiceProgress {
  readonly completed: number;
  readonly required: number;
  readonly state: "none" | "partial" | "complete";
}

/** Summarizes required evaluated choices for one level in the advancement rail. */
export function levelChoiceProgress(
  choices: readonly EvaluatedChoice[],
): LevelChoiceProgress {
  const requiredChoices = choices.filter((choice) => !choice.optional);
  const completed = requiredChoices.filter(
    (choice) => choice.selectedOccurrenceId !== undefined,
  ).length;
  return {
    completed,
    required: requiredChoices.length,
    state:
      completed === 0
        ? "none"
        : completed === requiredChoices.length
          ? "complete"
          : "partial",
  };
}

export type LevelRailChoiceStatus =
  "future" | "planned-partial" | "planned-complete" | "incomplete" | "complete";

export function levelRailChoiceStatus(
  choices: readonly EvaluatedChoice[],
  reached: boolean,
  additionalUnresolved = 0,
): LevelRailChoiceStatus {
  if (reached)
    return additionalUnresolved > 0 || choices.some(isUnresolvedChoice)
      ? "incomplete"
      : "complete";
  const progress = levelChoiceProgress(choices);
  return progress.state === "complete"
    ? "planned-complete"
    : progress.state === "partial"
      ? "planned-partial"
      : "future";
}

export function isOptionalRetrainingChoice(choice: EvaluatedChoice): boolean {
  return (
    choice.type === "Replacement" &&
    choice.optional &&
    (choice.name === undefined || choice.name.trim() === "")
  );
}

export function isBuildPresetChoice(choice: EvaluatedChoice): boolean {
  return ["build", "class build"].includes(
    choice.type.trim().toLocaleLowerCase(),
  );
}

export type ChoiceSelectionTableKind =
  | "feat"
  | "power"
  | "class"
  | "feature"
  | "deity"
  | "background"
  | "preset"
  | "option";

export function choiceSelectionTableKind(
  choice: EvaluatedChoice,
): ChoiceSelectionTableKind | undefined {
  const type = choice.type.trim().toLocaleLowerCase();
  if (type === "feat" || type.startsWith("feat ")) return "feat";
  if (
    type === "power" ||
    /^power (at-will|encounter|daily|utility)\b/.test(type)
  )
    return "power";
  if (type === "class") return "class";
  if (type === "class feature") return "feature";
  if (type === "deity") return "deity";
  if (type === "background") return "background";
  if (type !== "background choice" && (choice.candidates?.length ?? 0) > 8)
    return "option";
  return undefined;
}

export function contentSpecificValue(
  entity: ContentEntity,
  name: string,
): string | undefined {
  const value = entity.specifics.find(
    (field) =>
      field.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  )?.value;
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/** Preserves the class record's authored Key Abilities order. */
export function classKeyAbilities(
  selectedClass: ContentEntity | undefined,
): readonly AbilityScoreName[] {
  if (selectedClass === undefined) return [];
  const authored = contentSpecificValue(selectedClass, "Key Abilities");
  if (authored === undefined) return [];
  const abilitiesByName = new Map<string, AbilityScoreName>([
    ...ABILITY_SCORE_NAMES.map(
      (ability) => [ability.toLocaleLowerCase(), ability] as const,
    ),
    ["str", "Strength"],
    ["con", "Constitution"],
    ["dex", "Dexterity"],
    ["int", "Intelligence"],
    ["wis", "Wisdom"],
    ["cha", "Charisma"],
  ]);
  const seen = new Set<AbilityScoreName>();
  return [
    ...authored.matchAll(
      /\b(?:strength|str|constitution|con|dexterity|dex|intelligence|int|wisdom|wis|charisma|cha)\b/giu,
    ),
  ].flatMap(([value]) => {
    const ability = abilitiesByName.get(value.toLocaleLowerCase());
    if (ability === undefined || seen.has(ability)) return [];
    seen.add(ability);
    return [ability];
  });
}

export function classKeyAbilitiesSentence(
  selectedClass: ContentEntity | undefined,
  abilities: readonly AbilityScoreName[] = classKeyAbilities(selectedClass),
): string | undefined {
  const className = selectedClass?.name.trim();
  if (className === undefined || className === "" || abilities.length === 0)
    return undefined;
  const article = /^[aeiou]/iu.test(className) ? "An" : "A";
  const list =
    abilities.length === 1
      ? abilities[0]
      : abilities.length === 2
        ? `${abilities[0]} and ${abilities[1]}`
        : `${abilities.slice(0, -1).join(", ")}, and ${abilities.at(-1)}`;
  return `${article} ${className}'s key ${abilities.length === 1 ? "ability is" : "abilities are"} ${list}.`;
}

/** User-facing feats and powers directly granted by an inspected definition. */
export function grantedDetailEntities(
  entity: ContentEntity,
  references: ReadonlyMap<string, ContentEntity>,
): readonly ContentEntity[] {
  const seen = new Set<string>();
  return parseRules(entity.id, entity.rules).flatMap((rule) => {
    if (rule.kind !== "grant" || rule.requires !== undefined) return [];
    const granted = references.get(rule.name.trim().toLocaleLowerCase());
    if (
      granted === undefined ||
      !["feat", "power"].includes(granted.type.trim().toLocaleLowerCase()) ||
      seen.has(granted.id.trim().toLocaleLowerCase())
    )
      return [];
    seen.add(granted.id.trim().toLocaleLowerCase());
    return [granted];
  });
}

export interface ThemePowerGroup {
  readonly level: number | undefined;
  readonly powers: readonly ContentEntity[];
}

/** Powers authored as direct grants or members of a theme's power list. */
export function themePowerGroups(
  theme: ContentEntity,
  entities: Iterable<ContentEntity>,
): readonly ThemePowerGroup[] {
  if (theme.type.trim().toLocaleLowerCase() !== "theme") return [];

  const allEntities = [...entities];
  const references = new Map<string, ContentEntity>();
  for (const entity of allEntities) {
    references.set(entity.id.trim().toLocaleLowerCase(), entity);
    const name = entity.name.trim().toLocaleLowerCase();
    if (!references.has(name)) references.set(name, entity);
  }
  const directlyGrantedPowerIds = new Set(
    grantedDetailEntities(theme, references)
      .filter((entity) => entity.type.trim().toLocaleLowerCase() === "power")
      .map((entity) => entity.id.trim().toLocaleLowerCase()),
  );
  const themeValues = new Set(
    [theme.id, theme.name, ...theme.categories].map((value) =>
      value.trim().toLocaleLowerCase(),
    ),
  );
  const powers = new Map<string, ContentEntity>();
  for (const entity of allEntities) {
    if (entity.type.trim().toLocaleLowerCase() !== "power") continue;
    const entityId = entity.id.trim().toLocaleLowerCase();
    const isThemePower = entity.specifics.some(
      (field) =>
        ["class", "_themepower"].includes(
          field.name.trim().toLocaleLowerCase(),
        ) && themeValues.has(field.value.trim().toLocaleLowerCase()),
    );
    if (isThemePower || directlyGrantedPowerIds.has(entityId))
      powers.set(entityId, entity);
  }

  const groups = new Map<number | undefined, ContentEntity[]>();
  for (const power of powers.values()) {
    const authoredLevel = contentSpecificValue(power, "Level");
    const parsedLevel =
      authoredLevel !== undefined && /^\d+$/.test(authoredLevel)
        ? Number(authoredLevel)
        : undefined;
    const level =
      parsedLevel !== undefined && parsedLevel > 0
        ? parsedLevel
        : directlyGrantedPowerIds.has(power.id.trim().toLocaleLowerCase())
          ? 1
          : undefined;
    const group = groups.get(level) ?? [];
    group.push(power);
    groups.set(level, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === undefined) return right === undefined ? 0 : 1;
      if (right === undefined) return -1;
      return left - right;
    })
    .map(([level, groupedPowers]) => ({
      level,
      powers: groupedPowers.sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
      ),
    }));
}

export function choiceTableSummary(
  entity: ContentEntity,
  kind: ChoiceSelectionTableKind,
): string | undefined {
  if (kind === "feat") return contentSpecificValue(entity, "Short Description");
  if (kind === "class")
    return contentSpecificValue(entity, "Short Description");
  if (kind === "feature")
    return (
      contentSpecificValue(entity, "Short Description") ??
      firstSentence(entity.description)
    );
  if (kind === "deity") return contentSpecificValue(entity, "Alignment");
  if (kind === "preset") return firstSentence(entity.description);
  return entity.flavor?.trim() || entity.description.trim() || undefined;
}

/** Presentation-only synopsis for deity selection rows. */
export function deityTableDescription(
  entity: ContentEntity,
): string | undefined {
  return firstSentence(entity.description);
}

/** Skills listed by the authored background metadata, without prose inference. */
export function backgroundAssociatedSkills(
  entity: ContentEntity,
): string | undefined {
  return contentSpecificValue(entity, "Associated Skills");
}

export interface LabeledDescription {
  readonly label?: string;
  readonly description?: string;
}

/** Splits legacy fields such as `Defender. You are durable...` for table use. */
export function splitLabeledDescription(
  value: string | undefined,
): LabeledDescription {
  const normalized = value?.trim();
  if (!normalized) return {};
  const separator = normalized.indexOf(".");
  const lead = (separator < 0 ? normalized : normalized.slice(0, separator))
    .trim()
    .split(/\s+/)[0];
  const description =
    separator < 0 ? undefined : normalized.slice(separator + 1).trim();
  return {
    ...(lead ? { label: lead } : {}),
    ...(description ? { description } : {}),
  };
}

export function firstSentence(value: string | undefined): string | undefined {
  const normalized = value?.trim().replaceAll(/\s+/g, " ");
  if (!normalized) return undefined;
  const match = normalized.match(/^.*?[.!?](?=\s|$)/);
  return match?.[0] ?? normalized;
}

/** Theme prose in legacy rules content stores each authored paragraph on its own line. */
export function themeDescriptionParagraphs(
  description: string,
): readonly string[] {
  return description
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function classTableMetadata(entity: ContentEntity): {
  readonly role: LabeledDescription;
  readonly powerSource: LabeledDescription;
} {
  return {
    role: splitLabeledDescription(contentSpecificValue(entity, "Role")),
    powerSource: splitLabeledDescription(
      contentSpecificValue(entity, "Power Source"),
    ),
  };
}

/**
 * Recovers the authored parent feature behind a generic nested select. The
 * evaluator keeps the provider occurrence, while shared candidate categories
 * provide a fallback for unresolved or partially materialized legacy builds.
 */
export function contextualChoiceName(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
  resolveEntity: (reference: string) => ContentEntity | undefined,
): string | undefined {
  const type = choice.type.trim().toLocaleLowerCase();
  if (type !== "class feature") return undefined;

  const provider = evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  const providerEntity =
    provider === undefined ? undefined : resolveEntity(provider.definitionId);
  if (providerEntity?.type.trim().toLocaleLowerCase() === type)
    return providerEntity.name;

  const candidateEntities = choice.candidates.flatMap((candidate) => {
    const entity = resolveEntity(candidate.definitionId);
    return entity === undefined ? [] : [entity];
  });
  const first = candidateEntities[0];
  if (first === undefined) return undefined;
  const sharedCategories = first.categories.filter((category) =>
    candidateEntities.every((entity) => entity.categories.includes(category)),
  );
  return sharedCategories
    .map(resolveEntity)
    .find((entity) => entity?.type.trim().toLocaleLowerCase() === type)?.name;
}

export interface CandidateTableTypeGroup {
  readonly key: string;
  readonly label: string;
  readonly order: number;
}

const candidateTypeOrder: Readonly<Record<string, number>> = {
  class: 10,
  race: 20,
  skill: 30,
  multiclass: 40,
  theme: 50,
  "paragon path": 60,
  "epic destiny": 70,
  paragon: 80,
  epic: 90,
  general: 100,
  other: 900,
};

function tableTypeGroup(
  label: string,
  orderLabel: string = label,
): CandidateTableTypeGroup {
  const normalized = label.trim().toLocaleLowerCase();
  const normalizedOrder = orderLabel.trim().toLocaleLowerCase();
  return {
    key: normalized.replaceAll(/[^a-z0-9]+/g, "-") || "other",
    label,
    order: candidateTypeOrder[normalizedOrder] ?? 500,
  };
}

export function powerTableLevel(entity: ContentEntity): number | undefined {
  const value = contentSpecificValue(entity, "Level");
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The compact type shown opposite an entity name in primary detail panes. */
export function primaryDetailTypeLabel(entity: ContentEntity): string {
  if (entity.type.trim().toLocaleLowerCase() !== "power") return entity.type;

  const usage = (() => {
    switch (entityVisualTone(entity)) {
      case "at-will":
        return "At-Will";
      case "encounter":
        return "Encounter";
      case "daily":
        return "Daily";
      case "utility":
        return "Utility";
      default:
        return "Power";
    }
  })();
  const level = powerTableLevel(entity);
  return level === undefined ? usage : `${usage} ${level}`;
}

/**
 * Produces the player-facing category used by the feat/power browser. The
 * legacy feat page gives an authored subtype priority, then derives its broad
 * Race/Class/tier buckets from prerequisite references. Power categories use
 * the type of their authored Class/owner reference, with skill powers called
 * out by their dedicated metadata field.
 */
export function candidateTableTypeGroup(
  entity: ContentEntity,
  kind: Extract<ChoiceSelectionTableKind, "feat" | "power">,
  resolveEntity: (reference: string) => ContentEntity | undefined,
): CandidateTableTypeGroup {
  if (kind === "power") {
    if (contentSpecificValue(entity, "_SkillPower") !== undefined)
      return tableTypeGroup("Skill");
    const owner = (contentSpecificValue(entity, "Class") ?? "")
      .split(",")
      .map((reference) => resolveEntity(reference.trim()))
      .find((candidate) => candidate !== undefined);
    const ownerType = owner?.type.trim().toLocaleLowerCase();
    if (ownerType === "class" || ownerType === "pseudo class")
      return tableTypeGroup("Class");
    if (ownerType === "race") return tableTypeGroup("Race");
    if (ownerType === "theme")
      return tableTypeGroup(`Theme (${owner!.name})`, "Theme");
    if (ownerType === "paragon path") return tableTypeGroup("Paragon Path");
    if (ownerType === "epic destiny") return tableTypeGroup("Epic Destiny");
    const display = contentSpecificValue(entity, "Display") ?? "";
    if (/\bracial\b/i.test(display)) return tableTypeGroup("Race");
    return tableTypeGroup("Other");
  }

  const subtype = contentSpecificValue(entity, "Type");
  if (subtype !== undefined) {
    if (/\bmulticlass\b/i.test(subtype)) return tableTypeGroup("Multiclass");
    if (/\b(?:greater|lesser) style\b/i.test(subtype))
      return tableTypeGroup("Style");
    return tableTypeGroup(subtype);
  }

  const prerequisite = `${entity.prerequisites ?? ""};${entity.printPrerequisites ?? ""}`;
  const references = prerequisite
    .split(/[,;]|\bor\b|\band\b/i)
    .map((reference) => reference.trim().replace(/^[!~]+/, ""))
    .filter(Boolean);
  const referencedTypes = new Set(
    references.flatMap((reference) => {
      const direct = resolveEntity(reference);
      if (direct !== undefined) return [direct.type.trim().toLocaleLowerCase()];
      const withoutQualifier = reference.replace(
        /\s+(?:racial power|racial trait|class feature)$/i,
        "",
      );
      const qualified = resolveEntity(withoutQualifier);
      return qualified === undefined
        ? []
        : [qualified.type.trim().toLocaleLowerCase()];
    }),
  );
  if (
    referencedTypes.has("race") ||
    referencedTypes.has("racial trait") ||
    /\bracial (?:power|trait)\b/i.test(prerequisite)
  )
    return tableTypeGroup("Race");
  if (
    referencedTypes.has("class") ||
    referencedTypes.has("class feature") ||
    /\b(?:class feature|any \w+ class)\b/i.test(prerequisite)
  )
    return tableTypeGroup("Class");
  if (
    referencedTypes.has("skill") ||
    /\btrain(?:ed|ing) in\b/i.test(prerequisite)
  )
    return tableTypeGroup("Skill");
  if (/\bepic tier\b/i.test(prerequisite)) return tableTypeGroup("Epic");
  if (/\bparagon tier\b/i.test(prerequisite)) return tableTypeGroup("Paragon");
  return tableTypeGroup("General");
}

export function buildPresetSuggestionNames(
  preset: ContentEntity,
): readonly string[] {
  const suggested = preset.specifics.find(
    (field) => field.name.trim().toLocaleLowerCase() === "suggested",
  )?.value;
  if (suggested === undefined) return [];
  return suggested.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf(":");
    if (separator < 0) return [];
    const value = line.slice(separator + 1).trim();
    const humanFeat = /\(Human feat:\s*([^)]+)\)/i.exec(value)?.[1]?.trim();
    const ordinary = value.replace(/\s*\(Human feat:[^)]+\)\s*/i, "");
    return [
      ...ordinary.split(",").map((name) => name.trim()),
      ...(humanFeat === undefined ? [] : [humanFeat]),
    ].filter(Boolean);
  });
}

export function applyBuildPresetCommand(
  build: CharacterBuild,
  preset: ContentEntity,
  choices: readonly EvaluatedChoice[],
  evaluation: EvaluatedCharacter,
  entities: readonly ContentEntity[],
  occurrenceId: (definitionId: string, index: number) => string,
): CharacterCommand | undefined {
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const assignedChoices = new Set<string>();
  const assignedDefinitions = new Set<string>();
  const commands: CharacterCommand[] = [];
  let projectedBuild = build;
  for (const [suggestionIndex, suggestion] of buildPresetSuggestionNames(
    preset,
  ).entries()) {
    const normalized = suggestion.toLocaleLowerCase();
    const match = choices
      .filter(
        (choice) =>
          !isBuildPresetChoice(choice) &&
          choice.selectedOccurrenceId === undefined &&
          !assignedChoices.has(choice.id),
      )
      .flatMap((choice) =>
        choice.candidates.map((candidate) => ({ choice, candidate })),
      )
      .find(({ candidate }) => {
        const entity = byId.get(candidate.definitionId.toLocaleLowerCase());
        return (
          entity?.name.trim().toLocaleLowerCase() === normalized &&
          candidate.eligible &&
          !assignedDefinitions.has(candidate.definitionId.toLocaleLowerCase())
        );
      });
    if (match === undefined) continue;
    const definition = byId.get(
      match.candidate.definitionId.toLocaleLowerCase(),
    );
    if (definition === undefined) continue;
    const command = commandForEvaluatedChoice(
      projectedBuild,
      match.choice,
      evaluation.occurrences,
      entities,
      {
        id: occurrenceId(definition.id, suggestionIndex),
        identity: {
          definitionId: definition.id,
          name: definition.name,
          type: definition.type,
        },
        acquiredLevel: match.choice.level,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
      (index) => `web:placeholder:preset:${suggestionIndex}:${index}`,
    );
    if (command === undefined) continue;
    assignedChoices.add(match.choice.id);
    assignedDefinitions.add(definition.id.toLocaleLowerCase());
    commands.push(command);
    projectedBuild = applyCharacterCommand(projectedBuild, command);
  }
  return commands.length === 0 ? undefined : { kind: "batch", commands };
}

export function isCharacterDetailChoice(choice: EvaluatedChoice): boolean {
  return ["gender", "alignment", "deity"].includes(
    choice.type.trim().toLocaleLowerCase(),
  );
}

export function choicePresentationLabel(label: string): string {
  const concise = label.trim().replace(/^Choose\s+/i, "");
  const power = /^Power\s+(At-Will|Encounter|Daily|Utility)(?:\s+\d+)?$/i.exec(
    concise,
  );
  if (power !== null) {
    const usage = power[1]!.toLocaleLowerCase();
    const displayUsage =
      usage === "at-will"
        ? "At-Will"
        : `${usage[0]!.toLocaleUpperCase()}${usage.slice(1)}`;
    return `${displayUsage} Power`;
  }
  if (isAbilityIncreaseChoiceType(concise)) return "Ability Score Increase";
  return concise.replace(/\s+Choice$/i, "");
}

export function isAbilityIncreaseChoiceType(type: string): boolean {
  return /^(?:Companion )?Ability Increase(?:\s*\(Level\s+\d+\))?$/i.test(
    type.trim(),
  );
}

export function isCompanionChoiceType(type: string | undefined): boolean {
  if (type === undefined) return false;
  const normalized = type.trim().toLocaleLowerCase();
  return (
    normalized === "companion" ||
    normalized === "familiar" ||
    /^companion ability increase(?:\s*\(level\s+\d+\))?$/i.test(type.trim())
  );
}

export function identityChoiceLabel(type: string): string | undefined {
  return ["class", "hybrid class", "race"].includes(
    type.trim().toLocaleLowerCase(),
  )
    ? choicePresentationLabel(type)
    : undefined;
}

export function selectedChoiceHasWarning(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
): boolean {
  const selected =
    choice.selectedOccurrenceId === undefined
      ? undefined
      : evaluation.occurrences.find(
          (occurrence) => occurrence.id === choice.selectedOccurrenceId,
        );
  if (selected === undefined) return false;
  if (selected.legality === "houserule") return true;
  const decisions =
    choice.type === "Replacement"
      ? ((choice.replacementOptions ?? []).find(
          (option) => option.replacesOccurrenceId === selected.replacesId,
        )?.candidates ?? [])
      : choice.candidates;
  return decisions.some(
    (candidate) =>
      candidate.definitionId === selected.definitionId && !candidate.eligible,
  );
}

function interveningLevelFrameCommands(
  build: CharacterBuild,
  targetLevel: number,
  entities: readonly ContentEntity[],
  occurrenceId: (level: number) => string,
): CharacterCommand[] {
  return Array.from(
    { length: targetLevel - build.levels.length },
    (_, index) => {
      const level = build.levels.length + index + 1;
      return {
        kind: "add-level" as const,
        frame: createLevelFrame(level, entities, occurrenceId(level)),
      };
    },
  );
}

export function planningHorizonCommand(
  build: CharacterBuild,
  targetLevel: number,
  entities: readonly ContentEntity[],
  occurrenceId: (level: number) => string,
): CharacterCommand | undefined {
  if (
    !Number.isInteger(targetLevel) ||
    targetLevel < 1 ||
    targetLevel > MAX_CHARACTER_LEVEL
  )
    throw new Error(
      `Planning horizons must be integers from 1 through ${MAX_CHARACTER_LEVEL}`,
    );
  if (targetLevel <= build.levels.length) return undefined;
  return {
    kind: "batch",
    commands: [
      ...interveningLevelFrameCommands(
        build,
        targetLevel,
        entities,
        occurrenceId,
      ),
      { kind: "set-effective-level", level: build.effectiveLevel },
    ],
  };
}

/**
 * Moves the character's current level to `targetLevel`, creating any
 * intervening level frames (empty) along the way if needed. Unlike
 * `planningHorizonCommand`, which restores the prior effective level so
 * higher levels can be browsed without moving "current", this actually
 * advances (or retreats) what level the character is on. Newly created
 * frames start with unresolved choices, which surface as ordinary
 * non-blocking diagnostics rather than blocking the level change.
 */
export function jumpToLevelCommand(
  build: CharacterBuild,
  targetLevel: number,
  entities: readonly ContentEntity[],
  occurrenceId: (level: number) => string,
): CharacterCommand {
  if (
    !Number.isInteger(targetLevel) ||
    targetLevel < 1 ||
    targetLevel > MAX_CHARACTER_LEVEL
  )
    throw new Error(
      `Character level must be an integer from 1 through ${MAX_CHARACTER_LEVEL}`,
    );
  return {
    kind: "batch",
    commands: [
      ...interveningLevelFrameCommands(
        build,
        targetLevel,
        entities,
        occurrenceId,
      ),
      { kind: "set-effective-level", level: targetLevel },
    ],
  };
}

export function candidateReason(reasons: readonly string[]): string {
  if (reasons.length === 0) return "Available";
  const labels: Readonly<Record<string, string>> = {
    category: "Does not match this choice category",
    prerequisite: "Does not meet prerequisites",
    "prerequisite-unverified": "Prerequisites could not be verified",
    "source-unentitled": "Not included in this character's allowed sources",
    self: "A feature cannot select itself",
    duplicate: "Already selected in another slot",
  };
  return reasons.map((reason) => labels[reason] ?? reason).join("; ");
}

export function isCandidateSelectable(candidate: CandidateDecision): boolean {
  return candidate.sourceEntitled !== false;
}

export function isCandidateVisible(
  candidate: CandidateDecision,
  showAll: boolean,
  selectedDefinitionId?: string,
): boolean {
  if (candidate.reasons.includes("category")) return false;
  return (
    showAll ||
    candidate.eligible ||
    candidate.definitionId === selectedDefinitionId
  );
}

export interface CandidatePresentationOption {
  readonly candidate: CandidateDecision;
  readonly label: string;
}

export interface CandidatePresentationGroup {
  readonly key: string;
  readonly label: string;
  readonly parameterLabel?: string;
  readonly options: readonly CandidatePresentationOption[];
}

function parentheticalName(
  name: string,
): { readonly base: string; readonly variant: string } | undefined {
  const open = name.indexOf(" (");
  return open <= 0 || !name.endsWith(")")
    ? undefined
    : { base: name.slice(0, open), variant: name.slice(open + 2, -1) };
}

export function groupParameterizedCandidates(
  candidates: readonly CandidateDecision[],
  nameFor: (definitionId: string) => string,
  minimumFamilySize = 4,
): readonly CandidatePresentationGroup[] {
  const parsed = candidates.map((candidate) => ({
    candidate,
    name: nameFor(candidate.definitionId),
    parsed: parentheticalName(nameFor(candidate.definitionId)),
  }));
  const familyCounts = new Map<string, number>();
  for (const item of parsed)
    if (item.parsed !== undefined)
      familyCounts.set(
        item.parsed.base,
        (familyCounts.get(item.parsed.base) ?? 0) + 1,
      );
  const groups: CandidatePresentationGroup[] = [];
  const familyGroups = new Map<string, number>();
  for (const item of parsed) {
    const family =
      item.parsed !== undefined &&
      (familyCounts.get(item.parsed.base) ?? 0) >= minimumFamilySize
        ? item.parsed
        : undefined;
    if (family === undefined) {
      groups.push({
        key: `candidate:${item.candidate.definitionId}`,
        label: item.name,
        options: [{ candidate: item.candidate, label: item.name }],
      });
      continue;
    }
    const existing = familyGroups.get(family.base);
    if (existing === undefined) {
      familyGroups.set(family.base, groups.length);
      groups.push({
        key: `family:${family.base}`,
        label: family.base,
        parameterLabel:
          family.base === "Weapon Proficiency"
            ? "Weapon type"
            : family.base === "Superior Implement Training"
              ? "Implement type"
              : "Option",
        options: [{ candidate: item.candidate, label: family.variant }],
      });
    } else {
      const group = groups[existing]!;
      groups[existing] = {
        ...group,
        options: [
          ...group.options,
          { candidate: item.candidate, label: family.variant },
        ],
      };
    }
  }
  return groups;
}

export function groupBackgroundChoiceCandidates(
  candidates: readonly CandidateDecision[],
  nameFor: (definitionId: string) => string,
): readonly CandidatePresentationGroup[] {
  const definitions = [
    {
      key: "skill-plus-two",
      label: "+2 to a skill",
      parameterLabel: "Skill",
      match: (name: string) => /^\+2 to /i.test(name),
      optionLabel: (name: string) => name.replace(/^\+2 to /i, ""),
    },
    {
      key: "class-skill",
      label: "Add a class skill",
      parameterLabel: "Skill",
      match: (name: string) => / class skill$/i.test(name),
      optionLabel: (name: string) => name.replace(/ class skill$/i, ""),
    },
    {
      key: "language",
      label: "Language",
      parameterLabel: "Language",
      match: (name: string) => /^Learn /i.test(name),
      optionLabel: (name: string) => name.replace(/^Learn /i, ""),
    },
    {
      key: "benefit",
      label: "Background benefit",
      parameterLabel: "Benefit",
      match: (name: string) => / Benefit$/i.test(name),
      optionLabel: (name: string) => name.replace(/ Benefit$/i, ""),
    },
  ] as const;
  const groups = new Map<string, CandidatePresentationGroup>();
  for (const candidate of candidates) {
    const name = nameFor(candidate.definitionId);
    const definition = definitions.find(({ match }) => match(name)) ?? {
      key: "other",
      label: "Other",
      parameterLabel: "Option",
      optionLabel: (value: string) => value,
    };
    const option = { candidate, label: definition.optionLabel(name) };
    const existing = groups.get(definition.key);
    groups.set(
      definition.key,
      existing === undefined
        ? {
            key: `background:${definition.key}`,
            label: definition.label,
            parameterLabel: definition.parameterLabel,
            options: [option],
          }
        : { ...existing, options: [...existing.options, option] },
    );
  }
  return [...groups.values()];
}

export interface GroupedLevelChoices {
  readonly backgrounds: readonly EvaluatedChoice[];
  readonly skillTraining: readonly EvaluatedChoice[];
  readonly ordinary: readonly EvaluatedChoice[];
}

export type LegacyChoiceSection =
  | "Class"
  | "Race"
  | "Background"
  | "Theme"
  | "Ability Scores"
  | "Companion"
  | "Skills"
  | "Powers"
  | "Spellbook"
  | "Feats"
  | "Character Details"
  | "Other";

const legacySectionOrder: readonly LegacyChoiceSection[] = [
  "Class",
  "Race",
  "Background",
  "Theme",
  "Ability Scores",
  "Companion",
  "Skills",
  "Powers",
  "Spellbook",
  "Feats",
  "Character Details",
  "Other",
];

/**
 * Recreate the legacy builder's familiar wizard-pane order while retaining
 * the rules engine's exact choices. This is deliberately a presentation-only
 * classification: no choice is merged or re-parented.
 */
export function legacyChoiceSection(
  choice: EvaluatedChoice,
): LegacyChoiceSection {
  const type = choice.type.trim().toLocaleLowerCase();
  if (choice.spellbook !== undefined) return "Spellbook";
  if (isCompanionChoiceType(type)) return "Companion";
  if (
    [
      "class",
      "hybrid class",
      "build",
      "class build",
      "class feature",
      "trait package",
      "proficiency",
      "god fragment",
      "magic item",
      "paragon path",
      "epic destiny",
    ].includes(type)
  )
    return "Class";
  if (
    type === "race" ||
    type === "racial trait" ||
    type === "race ability bonus" ||
    type === "language"
  )
    return "Race";
  if (type === "background" || type === "background choice")
    return "Background";
  if (type === "theme") return "Theme";
  if (type.includes("ability score") || isAbilityIncreaseChoiceType(type))
    return "Ability Scores";
  if (type === "skill" || type === "skill training") return "Skills";
  if (type === "spellbook") return "Spellbook";
  if (type === "power" || type.startsWith("power ")) return "Powers";
  if (type === "feat") return "Feats";
  if (["gender", "alignment", "deity"].includes(type))
    return "Character Details";
  return "Other";
}

export interface LegacyChoiceSectionGroup {
  readonly section: LegacyChoiceSection;
  readonly choices: readonly EvaluatedChoice[];
}

export type OverviewChoicePane =
  | "Character"
  | "Ability Scores"
  | "Companion"
  | "Skills"
  | "Powers"
  | "Spellbook"
  | "Feats"
  | "Retraining"
  | "Other";

const overviewPaneOrder: readonly OverviewChoicePane[] = [
  "Character",
  "Ability Scores",
  "Companion",
  "Skills",
  "Powers",
  "Spellbook",
  "Feats",
  "Retraining",
  "Other",
];

export function overviewChoicePane(
  choice: EvaluatedChoice,
): OverviewChoicePane {
  if (isOptionalRetrainingChoice(choice)) return "Retraining";
  const section = legacyChoiceSection(choice);
  if (
    ["Class", "Race", "Background", "Theme", "Character Details"].includes(
      section,
    )
  )
    return "Character";
  if (
    [
      "Ability Scores",
      "Companion",
      "Skills",
      "Powers",
      "Spellbook",
      "Feats",
    ].includes(section)
  )
    return section as OverviewChoicePane;
  return "Other";
}

export function groupOverviewChoices(
  choices: readonly EvaluatedChoice[],
  paneOverride?: (choice: EvaluatedChoice) => OverviewChoicePane | undefined,
): readonly {
  readonly pane: OverviewChoicePane;
  readonly choices: readonly EvaluatedChoice[];
}[] {
  const groups = new Map<OverviewChoicePane, EvaluatedChoice[]>();
  choices.forEach((choice) => {
    const pane = paneOverride?.(choice) ?? overviewChoicePane(choice);
    groups.set(pane, [...(groups.get(pane) ?? []), choice]);
  });
  return overviewPaneOrder.flatMap((pane) => {
    const paneChoices = groups.get(pane);
    return paneChoices === undefined
      ? []
      : [
          {
            pane,
            choices: paneChoices
              .map((choice, index) => ({ choice, index }))
              .sort(
                (left, right) =>
                  left.choice.level - right.choice.level ||
                  left.index - right.index,
              )
              .map(({ choice }) => choice),
          },
        ];
  });
}

function legacyChoiceTypeRank(choice: EvaluatedChoice): number {
  const type = choice.type.trim().toLocaleLowerCase();
  const description = `${type} ${choice.name ?? ""}`.toLocaleLowerCase();
  const exactOrder = [
    "class",
    "hybrid class",
    "build",
    "class build",
    "class feature",
    "trait package",
    "proficiency",
    "god fragment",
    "magic item",
    "paragon path",
    "epic destiny",
    "race",
    "racial trait",
    "race ability bonus",
    "language",
    "background",
    "background choice",
    "theme",
    "gender",
    "alignment",
    "deity",
  ];
  const rank = exactOrder.indexOf(type);
  if (rank >= 0) return rank;
  if (description.includes("at-will")) return 100;
  if (description.includes("encounter")) return 101;
  if (description.includes("daily")) return 102;
  if (description.includes("utility")) return 103;
  if (type === "power") return 100;
  return 50;
}

export function groupChoicesByLegacyWorkflow(
  choices: readonly EvaluatedChoice[],
): readonly LegacyChoiceSectionGroup[] {
  const grouped = new Map<LegacyChoiceSection, EvaluatedChoice[]>();
  for (const choice of choices) {
    const section = legacyChoiceSection(choice);
    grouped.set(section, [...(grouped.get(section) ?? []), choice]);
  }
  return legacySectionOrder.flatMap((section) => {
    const sectionChoices = grouped.get(section);
    return sectionChoices === undefined
      ? []
      : [
          {
            section,
            choices: sectionChoices
              .map((choice, index) => ({ choice, index }))
              .sort(
                (left, right) =>
                  legacyChoiceTypeRank(left.choice) -
                    legacyChoiceTypeRank(right.choice) ||
                  left.index - right.index,
              )
              .map(({ choice }) => choice),
          },
        ];
  });
}

/**
 * Keep rules-engine choices exact while presenting choices created by the
 * preceding selection as one progressive decision. For example, a feat that
 * grants a mastery choice and that mastery's power replacement should read as
 * one flow rather than three unrelated cards.
 */
export function groupDependentChoiceFlows(
  choices: readonly EvaluatedChoice[],
): readonly (readonly EvaluatedChoice[])[] {
  const choiceBySelectedOccurrence = new Map(
    choices.flatMap((choice) =>
      choice.selectedOccurrenceId === undefined
        ? []
        : [[choice.selectedOccurrenceId, choice] as const],
    ),
  );
  const children = new Map<string, EvaluatedChoice[]>();
  const roots: EvaluatedChoice[] = [];
  for (const choice of choices) {
    const parent = choiceBySelectedOccurrence.get(choice.providerOccurrenceId);
    const startsCompanionFlow =
      parent !== undefined &&
      isCompanionChoiceType(choice.type) &&
      !isCompanionChoiceType(parent.type);
    if (parent === undefined || parent.id === choice.id || startsCompanionFlow)
      roots.push(choice);
    else children.set(parent.id, [...(children.get(parent.id) ?? []), choice]);
  }
  const visited = new Set<string>();
  const collect = (root: EvaluatedChoice): EvaluatedChoice[] => {
    if (visited.has(root.id)) return [];
    visited.add(root.id);
    return [
      root,
      ...(children.get(root.id) ?? []).flatMap((child) => collect(child)),
    ];
  };
  const flows = roots.map(collect).filter((flow) => flow.length > 0);
  for (const choice of choices)
    if (!visited.has(choice.id)) flows.push(collect(choice));
  return flows;
}

/** Group positional slots emitted by one select rule without merging them. */
export function groupRepeatedChoiceSlots(
  choices: readonly EvaluatedChoice[],
): readonly (readonly EvaluatedChoice[])[] {
  const groups = new Map<string, EvaluatedChoice[]>();
  for (const choice of choices) {
    const key = [
      choice.level,
      choice.providerOccurrenceId,
      choice.ruleOrdinal,
      choice.type,
      choice.name,
    ].join("\0");
    groups.set(key, [...(groups.get(key) ?? []), choice]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function groupLevelChoices(
  choices: readonly EvaluatedChoice[],
): GroupedLevelChoices {
  const backgrounds: EvaluatedChoice[] = [];
  const skillTraining: EvaluatedChoice[] = [];
  const ordinary: EvaluatedChoice[] = [];
  for (const choice of choices) {
    const type = choice.type.trim().toLocaleLowerCase();
    if (type === "background") backgrounds.push(choice);
    else if (type === "skill training") skillTraining.push(choice);
    else ordinary.push(choice);
  }
  return { backgrounds, skillTraining, ordinary };
}

export function selectedDefinitionId(
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
): string | undefined {
  if (choice.selectedOccurrenceId === undefined) return undefined;
  return evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.selectedOccurrenceId,
  )?.definitionId;
}

export function choiceForRepeatedCandidate(
  choices: readonly EvaluatedChoice[],
  occupiedChoiceIds: ReadonlySet<string>,
  definitionId: string,
  showAll: boolean,
  replaceFilledSingleChoice = false,
): EvaluatedChoice | undefined {
  const available = choices.find(
    (choice) =>
      !occupiedChoiceIds.has(choice.id) &&
      choice.candidates.some(
        (candidate) =>
          candidate.definitionId === definitionId &&
          isCandidateSelectable(candidate) &&
          isCandidateVisible(candidate, showAll),
      ),
  );
  if (available !== undefined) return available;
  if (!replaceFilledSingleChoice || choices.length !== 1) return undefined;
  const choice = choices[0]!;
  return choice.candidates.some(
    (candidate) =>
      candidate.definitionId === definitionId &&
      isCandidateSelectable(candidate) &&
      isCandidateVisible(candidate, showAll),
  )
    ? choice
    : undefined;
}

export interface RepeatedCandidateScope {
  readonly key: string;
  readonly choices: readonly EvaluatedChoice[];
  readonly candidateIds: readonly string[];
}

export function groupRepeatedCandidateScopes(
  choices: readonly EvaluatedChoice[],
): readonly RepeatedCandidateScope[] {
  const groups = new Map<string, RepeatedCandidateScope>();
  for (const choice of choices) {
    const candidateIds = [
      ...new Set(
        choice.candidates
          .filter((candidate) => !candidate.reasons.includes("category"))
          .map((candidate) => candidate.definitionId),
      ),
    ];
    const signature = `${choice.providerOccurrenceId}\0${[...candidateIds]
      .sort((left, right) => left.localeCompare(right))
      .join("\0")}`;
    const existing = groups.get(signature);
    groups.set(
      signature,
      existing === undefined
        ? { key: signature, choices: [choice], candidateIds }
        : { ...existing, choices: [...existing.choices, choice] },
    );
  }
  return [...groups.values()];
}

export function unresolveEvaluatedChoiceCommand(
  build: CharacterBuild,
  choice: EvaluatedChoice,
  evaluation: EvaluatedCharacter,
  entities: readonly ContentEntity[],
  occurrenceId: string,
): CharacterCommand | undefined {
  const visit = (
    occurrence: CharacterBuild["levels"][number]["root"],
  ): CharacterBuild["levels"][number]["root"] | undefined =>
    occurrence.id === choice.providerOccurrenceId
      ? occurrence
      : occurrence.children.map(visit).find((value) => value !== undefined);
  const provider = [
    ...build.levels.map((frame) => frame.root),
    ...build.grabbag,
  ]
    .map(visit)
    .find((value) => value !== undefined);
  if (provider === undefined) return undefined;
  const evaluatedProvider = evaluation.occurrences.find(
    (occurrence) => occurrence.id === choice.providerOccurrenceId,
  );
  const providerEntity = entities.find(
    (entity) =>
      entity.id.toLocaleLowerCase() ===
      evaluatedProvider?.definitionId.toLocaleLowerCase(),
  );
  return {
    kind: "choose",
    parentId: provider.id,
    index: findBuildChildIndex(
      provider,
      providerEntity,
      choice.ruleOrdinal,
      choice.index,
    ),
    occurrence: {
      id: occurrenceId,
      identity: { name: "", type: "" },
      acquiredLevel: provider.acquiredLevel,
      legality: "rules-legal",
      children: [],
      unresolved: true,
    },
  };
}
