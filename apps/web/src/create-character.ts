// The library's New character: one way to start a character, held as an
// unsaved draft until its first change.

import type { ContentProfileDefinition } from "@4ecb/browser-storage";
import type {
  CharacterProfileBinding,
  CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";

import { holdCharacterDraft } from "./character-drafts";
import { createNativeCharacter } from "./new-character";
import { characterEditorHash } from "./routes";

export interface NewCharacterContent {
  readonly activePackId: string | undefined;
  readonly activeProfile: ContentProfileDefinition | undefined;
  /** Reads the active pack (its level records start the character). */
  readonly loadPack: (packId: string) => Promise<
    | {
        readonly manifest: ContentPackManifest;
        readonly entities: readonly ContentEntity[];
      }
    | undefined
  >;
}

/** A new level-1 character on the active content (a campaign is chosen
 *  later, in Details). */
export async function newCharacter(
  content: NewCharacterContent,
): Promise<CharacterRecord> {
  const { activePackId, activeProfile } = content;
  if (activePackId === undefined)
    throw new Error("Activate a content profile before creating a character.");
  const pack = await content.loadPack(activePackId);
  if (pack === undefined)
    throw new Error("The active content profile is not installed.");
  const profileBinding: CharacterProfileBinding | undefined =
    activeProfile === undefined
      ? undefined
      : {
          packId: activeProfile.materializedPackId,
          contentDigest: activeProfile.contentDigest,
          layers: activeProfile.layers,
          resolutionPolicy: activeProfile.resolutionPolicy,
        };
  // The level-1 record is read from the base content.
  return createNativeCharacter(
    "New Character",
    pack.manifest,
    pack.entities,
    profileBinding === undefined ? {} : { profileBinding },
  );
}

/** Creates the character and opens it in the builder. It is held unsaved
 *  until its first change, so closing it adds nothing to the library. */
export async function startNewCharacter(
  content: NewCharacterContent,
  navigate: (hash: string) => void = (hash) => {
    window.location.hash = hash;
  },
): Promise<CharacterRecord> {
  const character = await newCharacter(content);
  holdCharacterDraft(character);
  navigate(characterEditorHash(character.id, { workspace: "build" }));
  return character;
}
