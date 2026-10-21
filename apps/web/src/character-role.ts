import type { ContentEntity } from "@4ecb/content-domain";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";

import { contentSpecificValue } from "./builder-ui";

/** A class field's name part: its first sentence ("Defender. You…" →
 *  "Defender", "Martial and Shadow." → "Martial and Shadow"), title-cased
 *  but for its joining words. */
function fieldName(entity: ContentEntity, field: string): string | undefined {
  const sentence = contentSpecificValue(entity, field)
    ?.split(".")[0]
    ?.trim()
    .replaceAll(/\s+/g, " ");
  if (!sentence) return undefined;
  return sentence
    .split(" ")
    .map((word) =>
      /^(and|or)$/i.test(word)
        ? word.toLocaleLowerCase()
        : word.charAt(0).toLocaleUpperCase() +
          word.slice(1).toLocaleLowerCase(),
    )
    .join(" ");
}

/** One class's "Power source Role", e.g. "Divine Defender". */
export function classRole(entity: ContentEntity): string | undefined {
  return (
    [fieldName(entity, "Power Source"), fieldName(entity, "Role")]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

const isType = (entity: ContentEntity, type: string) =>
  entity.type.trim().toLocaleLowerCase() === type;

/**
 * The character's role line from its evaluated classes: "Divine Defender",
 * or for a hybrid both halves, "Arcane Leader / Arcane Striker". Like the
 * sheet's Class line, a hybrid is its two Hybrid Class elements (it also
 * owns the role-less "Hybrid" marker class).
 */
export function characterRoleLine(
  evaluation: Pick<EvaluatedCharacter, "occurrences">,
  content: readonly ContentEntity[],
): string | undefined {
  const byId = new Map(
    content.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const classes = [
    ...new Set(
      evaluation.occurrences.flatMap((occurrence) => {
        const entity = byId.get(occurrence.definitionId.toLocaleLowerCase());
        return entity === undefined ? [] : [entity];
      }),
    ),
  ];
  const hybrid = classes.filter((entity) => isType(entity, "hybrid class"));
  if (hybrid.length > 0)
    return (
      hybrid
        .map(classRole)
        .filter((role): role is string => role !== undefined)
        .join(" / ") || undefined
    );
  // The first class with a role (pseudo-classes such as an Order Adept's
  // have none).
  return classes
    .filter((entity) => isType(entity, "class"))
    .map(classRole)
    .find((role) => role !== undefined);
}
