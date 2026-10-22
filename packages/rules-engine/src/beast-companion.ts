import type { ContentEntity } from "@4ecb/content-domain";

import {
  beastCompanionStatistics,
  isBeastCompanionFields,
  type BeastCompanionSkillInput,
  type BeastCompanionStatistics,
} from "./derived-values";
import type { EvaluatedStat } from "./stats";

/** The character's beast companion, evaluated once per character evaluation. */
export interface EvaluatedBeastCompanion {
  readonly occurrenceId: string;
  readonly definitionId: string;
  readonly name: string;
  readonly statistics: BeastCompanionStatistics;
}

interface ContentLookup {
  get(id: string): ContentEntity | undefined;
  find(nameOrId: string, type?: string): ContentEntity | undefined;
  type(type: string): readonly ContentEntity[];
}

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Every skill with its key ability, marking the companion record's
 * `Trained Skills` (skill IDs, or names in the sentinel records).
 */
export function beastCompanionSkills(
  fields: Readonly<Record<string, string>>,
  content: ContentLookup,
): BeastCompanionSkillInput[] {
  const trainedField =
    Object.entries(fields).find(
      ([name]) => key(name) === "trained skills",
    )?.[1] ?? "";
  const trained = new Set(
    trainedField
      .split(",")
      .map((reference) => reference.trim())
      .filter(Boolean)
      .flatMap((reference) => {
        const skill = content.find(reference, "Skill");
        return skill === undefined || key(skill.type) !== "skill"
          ? []
          : [key(skill.id)];
      }),
  );
  return content.type("Skill").flatMap((skill) => {
    const keyAbility = skill.specifics
      .find((specific) => key(specific.name) === "key ability")
      ?.value.trim();
    return keyAbility === undefined || keyAbility === ""
      ? []
      : [
          {
            name: skill.name,
            keyAbility,
            trained: trained.has(key(skill.id)),
          },
        ];
  });
}

/**
 * The beast companion is the first `Companion` occurrence whose record is a
 * beast stat block (`isBeastCompanionFields`), as legacy `BeastBlock` takes
 * the first Companion element. Its numbers are derived values over the
 * character's evaluated stats; there is no second evaluation context.
 */
export function evaluateBeastCompanion(input: {
  readonly level: number;
  readonly occurrences: readonly {
    readonly id: string;
    readonly definitionId: string;
  }[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  /** A record's fields with the evaluation's field overlays applied. */
  readonly fieldsOf: (
    entity: ContentEntity,
  ) => Readonly<Record<string, string>>;
  readonly content: ContentLookup;
}): EvaluatedBeastCompanion | undefined {
  for (const occurrence of input.occurrences) {
    const entity = input.content.get(occurrence.definitionId);
    if (entity === undefined || key(entity.type) !== "companion") continue;
    const fields = input.fieldsOf(entity);
    if (!isBeastCompanionFields(fields)) continue;
    return {
      occurrenceId: occurrence.id,
      definitionId: entity.id,
      name: entity.name,
      statistics: beastCompanionStatistics({
        fields,
        stats: input.stats,
        level: input.level,
        skills: beastCompanionSkills(fields, input.content),
      }),
    };
  }
  return undefined;
}

/** A `Companion` record with a beast stat block (`isBeastCompanionFields`). */
export function isBeastCompanionEntity(
  entity: ContentEntity | undefined,
): entity is ContentEntity {
  if (entity === undefined || key(entity.type) !== "companion") return false;
  return isBeastCompanionFields(
    Object.fromEntries(
      entity.specifics.map((specific) => [specific.name, specific.value]),
    ),
  );
}

/**
 * A beast companion record as the character would have it: the evaluated
 * beast itself when it is the one chosen, else a preview (builder candidate
 * pane) from the record's fields and the character's companion bonuses from
 * other sources, without the chosen beast's own contributions.
 */
export function previewBeastCompanion(input: {
  readonly entity: ContentEntity;
  readonly level: number;
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly chosen?: EvaluatedBeastCompanion;
  readonly fieldsOf: (
    entity: ContentEntity,
  ) => Readonly<Record<string, string>>;
  readonly content: ContentLookup;
}): EvaluatedBeastCompanion | undefined {
  const { entity, chosen } = input;
  if (chosen !== undefined && key(chosen.definitionId) === key(entity.id))
    return chosen;
  if (key(entity.type) !== "companion") return undefined;
  const fields = input.fieldsOf(entity);
  if (!isBeastCompanionFields(fields)) return undefined;
  return {
    occurrenceId: "",
    definitionId: entity.id,
    name: entity.name,
    statistics: beastCompanionStatistics({
      fields,
      stats: input.stats,
      level: input.level,
      skills: beastCompanionSkills(fields, input.content),
      candidate: {
        replacedProviderIds: chosen === undefined ? [] : [chosen.occurrenceId],
      },
    }),
  };
}
