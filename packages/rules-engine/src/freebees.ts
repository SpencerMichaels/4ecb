import { isFreebeeGiven, type CharacterBuild } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import type { EvaluatedCharacter } from "./evaluator";
import type { EntityLookup } from "./known-records";

/**
 * Free items (legacy `MainWindow.GiveFreebees`): a character stat named
 * `FREEBEE:<id>` entitles the character to one copy of `<id>` as loot, given
 * once and then recorded by textstring `<id>` = "Given", so an item the
 * player later sells or drops is never re-added.
 *
 * Only physical items are gifts. FREEBEE rituals are derived known records
 * (`known-records.ts`, D091), and FREEBEE associates belong to the companion
 * model.
 */

export interface PendingFreebeeItem {
  readonly definitionId: string;
  /** The textstring that records the gift: the target ID as authored. */
  readonly marker: string;
  readonly entity: ContentEntity;
  /** Display name of the element whose stat grants it. */
  readonly provider: string;
  /** The granting element's level, at most the evaluated level. */
  readonly acquiredLevel: number;
  /** Already held, so legacy only records the marker. */
  readonly owned: boolean;
}

const FREEBEE_STAT = /^freebee:(.+)$/iu;

/** Entity types a FREEBEE never gives as an inventory holding. */
const NOT_GIFTED_TYPES = new Set(["ritual", "associate"]);

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * The FREEBEE items the evaluation entitles the build to that are not yet
 * marked as given, once per target, in stat order.
 */
export function pendingFreebeeItems(
  build: Pick<CharacterBuild, "inventory" | "textStrings">,
  evaluation: Pick<EvaluatedCharacter, "level" | "occurrences" | "stats">,
  entityById: EntityLookup,
): readonly PendingFreebeeItem[] {
  const occurrences = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const owned = new Set(
    build.inventory
      .filter(({ quantity }) => quantity > 0)
      .flatMap(({ elements }) =>
        elements.flatMap(({ definitionId }) =>
          definitionId === undefined ? [] : [key(definitionId)],
        ),
      ),
  );
  const seen = new Set<string>();
  const result: PendingFreebeeItem[] = [];
  for (const stat of Object.values(evaluation.stats)) {
    const marker = FREEBEE_STAT.exec(stat.name.trim())?.[1]?.trim();
    if (marker === undefined || marker === "") continue;
    if (typeof stat.value !== "number" || stat.value <= 0) continue;
    const entity = entityById(marker);
    if (entity === undefined || NOT_GIFTED_TYPES.has(key(entity.type)))
      continue;
    const id = key(entity.id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (isFreebeeGiven(build.textStrings, marker)) continue;
    const contribution = stat.contributions.find(({ applied }) => applied);
    const providerLevel =
      contribution === undefined
        ? undefined
        : occurrences.get(contribution.providerId)?.acquiredLevel;
    result.push({
      definitionId: entity.id,
      marker,
      entity,
      provider: contribution?.providerName ?? "",
      acquiredLevel: Math.max(
        1,
        Math.min(providerLevel ?? evaluation.level, evaluation.level),
      ),
      owned: owned.has(id),
    });
  }
  return result;
}
