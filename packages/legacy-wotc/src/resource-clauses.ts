import {
  RESOURCE_CLAUSES_FIELD,
  RESOURCE_CLAUSES_VERSION,
  type ClauseResource,
  type ResourceClause,
  type ResourceClauses,
  type SpecificField,
} from "@4ecb/content-domain";

/**
 * Sentences that open on a resource the character must have, by resource.
 * Only openings that make the whole sentence conditional count: a sentence
 * that merely names the resource ("... cannot spend action points, healing
 * surges, or power points", Krylanthi Cloak) applies to anyone.
 */
const RESOURCE_OPENINGS: readonly (readonly [ClauseResource, RegExp])[] = [
  ["power-points", /^(?:while|if) you have at least (?:1|one) power point\b/iu],
  [
    "power-points",
    /^(?:you can|you may|(?:when|whenever|if) you) spend (?:\d+|a|one|one or more) power points?\b/iu,
  ],
  [
    "channel-divinity",
    /^(?:when|whenever|each time) you use (?:a|an|any|your) channel divinity (?:power|class feature|feature)\b/iu,
  ],
];

/** Each line's sentences, as exact substrings of the value. */
function sentences(value: string): string[] {
  return value
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=\p{Lu})/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** The Property sentences of a record that depend on a resource. */
export function parseResourceClauses(
  specifics: readonly SpecificField[],
): ResourceClause[] {
  const clauses: ResourceClause[] = [];
  const occurrences = new Map<string, number>();
  for (const field of specifics) {
    const name = field.name.trim().toLocaleLowerCase();
    const occurrence = (occurrences.get(name) ?? 0) + 1;
    occurrences.set(name, occurrence);
    if (name !== "property") continue;
    for (const text of sentences(field.value)) {
      const resource = RESOURCE_OPENINGS.find(([, opening]) =>
        opening.test(text),
      )?.[0];
      if (resource !== undefined)
        clauses.push({ field: field.name, occurrence, text, resource });
    }
  }
  return clauses;
}

/** The stored field for a record's resource clauses, or undefined. */
export function resourceClausesField(
  specifics: readonly SpecificField[],
  ordinal: number,
): SpecificField | undefined {
  const clauses = parseResourceClauses(specifics);
  if (clauses.length === 0) return undefined;
  const value: ResourceClauses = {
    version: RESOURCE_CLAUSES_VERSION,
    clauses,
  };
  return {
    name: RESOURCE_CLAUSES_FIELD,
    value: JSON.stringify(value),
    extraAttributes: [],
    ordinal,
  };
}
