import type { CharacterRepository } from "@4ecb/browser-storage";
import type { CharacterRecord } from "@4ecb/character-domain";

/**
 * New characters live here, unsaved, until their first change: opening New
 * character and closing it again leaves nothing in the library. A draft is
 * lost on reload, which is fine: it has no edits to lose.
 */
const drafts = new Map<string, CharacterRecord>();
const persisting = new Map<string, Promise<void>>();

export function holdCharacterDraft(character: CharacterRecord): void {
  drafts.set(character.id, character);
}

export function characterDraft(id: string): CharacterRecord | undefined {
  return drafts.get(id);
}

/** Writes a held draft to storage (once), before its first change is saved. */
export function persistCharacterDraft(
  repository: CharacterRepository,
  id: string,
): Promise<void> {
  const draft = drafts.get(id);
  if (draft === undefined) return persisting.get(id) ?? Promise.resolve();
  let pending = persisting.get(id);
  if (pending === undefined) {
    pending = repository.put(draft).then(
      () => {
        drafts.delete(id);
        persisting.delete(id);
      },
      (reason: unknown) => {
        persisting.delete(id);
        throw reason;
      },
    );
    persisting.set(id, pending);
  }
  return pending;
}

/** Loads a character: a held draft, else the stored record. */
export async function loadCharacter(
  repository: CharacterRepository,
  id: string,
): Promise<CharacterRecord | undefined> {
  return characterDraft(id) ?? repository.get(id);
}
