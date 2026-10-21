import type { CharacterMetadata } from "@4ecb/browser-storage";

/** "Level N Race Class": the identity line under a character's name in the
 *  library and the trash. */
export function characterIdentity(
  character: Pick<CharacterMetadata, "effectiveLevel" | "race" | "className">,
): string {
  return [
    `Level ${character.effectiveLevel}`,
    character.race,
    character.className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Trashed characters, most recently trashed first (ISO timestamps sort as
 *  text); any without a trash time go last. */
export function trashOrder<T extends Pick<CharacterMetadata, "deletedAt">>(
  characters: readonly T[],
): T[] {
  return [...characters].sort((a, b) =>
    (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""),
  );
}

/** "1 character" / "N characters". */
export function characterCount(count: number): string {
  return `${count} ${count === 1 ? "character" : "characters"}`;
}
