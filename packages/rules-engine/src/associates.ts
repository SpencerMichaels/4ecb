import {
  readAssociateStatBlock,
  type AssociateStatBlock,
  type ContentEntity,
} from "@4ecb/content-domain";

import {
  associateStatistics,
  type AssociateStatistics,
} from "./derived-values";
import type { EvaluatedStat } from "./stats";

/**
 * An associate the character has (D107): a creature from an Associate
 * record, with its numbers worked out from the master's evaluated stats.
 */
export interface EvaluatedAssociate {
  readonly definitionId: string;
  readonly name: string;
  readonly block: AssociateStatBlock;
  readonly statistics: AssociateStatistics;
  /** The occurrences and holdings whose `FREEBEE:` stat gives it. */
  readonly providerIds: readonly string[];
}

interface ContentLookup {
  get(id: string): ContentEntity | undefined;
}

const FREEBEE_STAT = /^freebee:(.+)$/iu;

/**
 * The character's associates: every Associate record a `FREEBEE:<id>` stat
 * names with a positive value, the signal the content gives (Elemental
 * Companion, Summon Warlock's Ally (Elemental), Demonic Companion, … and the
 * cards 9F-associates.part fixes), in the order of the first occurrence
 * providing it. A record without a parsed stat block (a pack built before
 * D107) has no associate.
 */
export function evaluateAssociates(input: {
  readonly level: number;
  readonly occurrences: readonly { readonly id: string }[];
  readonly stats: Readonly<Record<string, EvaluatedStat>>;
  readonly content: ContentLookup;
}): EvaluatedAssociate[] {
  const rank = new Map(
    input.occurrences.map((occurrence, index) => [occurrence.id, index]),
  );
  const found: { associate: EvaluatedAssociate; order: number }[] = [];
  const seen = new Set<string>();
  for (const [name, stat] of Object.entries(input.stats)) {
    const target = FREEBEE_STAT.exec(name.trim())?.[1]?.trim();
    if (target === undefined || !(Number(stat.value) > 0)) continue;
    const entity = input.content.get(target);
    if (
      entity === undefined ||
      entity.type.trim().toLocaleLowerCase() !== "associate" ||
      seen.has(entity.id.toLocaleLowerCase())
    )
      continue;
    const block = readAssociateStatBlock(entity.specifics);
    if (block === undefined) continue;
    seen.add(entity.id.toLocaleLowerCase());
    const providerIds = [
      ...new Set(
        stat.contributions
          .filter((contribution) => contribution.applied)
          .map((contribution) => contribution.providerId),
      ),
    ];
    found.push({
      associate: {
        definitionId: entity.id,
        name: entity.name,
        block,
        statistics: associateStatistics({
          block,
          stats: input.stats,
          level: input.level,
        }),
        providerIds,
      },
      order: Math.min(
        ...providerIds.map((id) => rank.get(id) ?? Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      ),
    });
  }
  return found
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.associate.name.localeCompare(right.associate.name),
    )
    .map(({ associate }) => associate);
}
