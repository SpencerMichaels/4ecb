import type { ContentEntity } from "@4ecb/content-domain";
import type {
  CharacterOccurrence,
  EvaluatedCharacter,
} from "@4ecb/rules-engine";
import {
  SHEET_FEATURE_TYPES,
  classifyPowerEntity,
  featureNoteHidden,
  featureNoteText,
} from "@4ecb/sheet-model";

/** One feature or power the character gains automatically at a level. */
export interface LevelGain {
  readonly occurrenceId: string;
  readonly definitionId: string;
  readonly name: string;
  /** "Class Feature", or a power's card type ("Daily power"). */
  readonly typeLabel: string;
  /** The sheet's one-line feature note, when it has one. */
  readonly note?: string;
  /** What this gain grants in turn at the same level. */
  readonly children: readonly LevelGain[];
}

const key = (value: string) => value.trim().toLocaleLowerCase();

const SHOWN_TYPES = new Set([...SHEET_FEATURE_TYPES, "Power"].map(key));

/**
 * What a level grants on its own, for the Build tab's empty state: the
 * evaluated grant occurrences acquired at `level`, nested under the gain
 * that granted them. Only types the sheet lists (features, feats…) and
 * powers show, and a feature the sheet hides (`InternalOnly`, a bare "@"
 * `_CS_ShortDescription`, or one superseded by an owned class feature)
 * gives its place to what it grants. Grants under a pick made at this
 * level (a retrain) are that pick's, not automatic, and are left out.
 */
export function levelGains(
  evaluation: Pick<EvaluatedCharacter, "occurrences">,
  level: number,
  entities: ReadonlyMap<string, ContentEntity>,
): readonly LevelGain[] {
  const owned = evaluation.occurrences.filter(
    (occurrence) =>
      occurrence.acquiredLevel <= level && occurrence.kind !== "inventory",
  );
  const byId = new Map(owned.map((occurrence) => [occurrence.id, occurrence]));
  const entityOf = (occurrence: CharacterOccurrence) =>
    entities.get(key(occurrence.definitionId));
  const ownedClassFeatures = new Set(
    owned.flatMap((occurrence) => {
      const entity = entityOf(occurrence);
      return entity !== undefined && key(entity.type) === "class feature"
        ? [key(entity.id), key(entity.name)]
        : [];
    }),
  );
  const ownsClassFeature = (nameOrId: string) =>
    ownedClassFeatures.has(key(nameOrId));
  const underPickAtLevel = (occurrence: CharacterOccurrence): boolean => {
    for (
      let parent =
        occurrence.parentId === undefined
          ? undefined
          : byId.get(occurrence.parentId);
      parent !== undefined && parent.acquiredLevel === level;
      parent =
        parent.parentId === undefined ? undefined : byId.get(parent.parentId)
    )
      if (parent.kind === "choice") return true;
    return false;
  };
  const gained = owned.filter(
    (occurrence) =>
      occurrence.kind === "grant" &&
      occurrence.acquiredLevel === level &&
      !underPickAtLevel(occurrence),
  );
  const childrenOf = new Map<string | undefined, CharacterOccurrence[]>();
  const gainedIds = new Set(gained.map(({ id }) => id));
  for (const occurrence of gained) {
    const parent =
      occurrence.parentId !== undefined && gainedIds.has(occurrence.parentId)
        ? occurrence.parentId
        : undefined;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), occurrence]);
  }
  const seen = new Set<string>();
  const present = (parentId: string | undefined): LevelGain[] =>
    (childrenOf.get(parentId) ?? []).flatMap((occurrence) => {
      const entity = entityOf(occurrence);
      if (
        entity === undefined ||
        !SHOWN_TYPES.has(key(entity.type)) ||
        featureNoteHidden(entity, ownsClassFeature) ||
        seen.has(key(entity.id))
      )
        return present(occurrence.id);
      seen.add(key(entity.id));
      const children = present(occurrence.id);
      const power = key(entity.type) === "power";
      const note = power ? "" : featureNoteText(entity).trim();
      return [
        {
          occurrenceId: occurrence.id,
          definitionId: entity.id,
          name: entity.name,
          typeLabel: power
            ? classifyPowerEntity(entity).typeLabel
            : entity.type.trim(),
          ...(note === "" ? {} : { note }),
          children,
        },
      ];
    });
  return present(undefined);
}
