// The library's New character and the campaign invite page's "New character
// in <campaign>" (D116): one way to start a character, held as an unsaved
// draft until its first change.

import type { ContentProfileDefinition } from "@4ecb/browser-storage";
import type {
  CharacterProfileBinding,
  CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import type { CampaignDocument, ContentPackManifest } from "@4ecb/content-pack";

import {
  campaignChangeTarget,
  type CampaignProfileMaterializer,
} from "./campaign-profile";
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
  /** Composes a campaign profile; the app's default when omitted. */
  readonly materializer?: CampaignProfileMaterializer;
}

/**
 * A new level-1 character on the active content, or, given `campaign`, on
 * the active content plus that campaign (its profile composed, or the stored
 * copy reused, before the character opens).
 */
export async function newCharacter(
  content: NewCharacterContent,
  campaign?: CampaignDocument,
): Promise<CharacterRecord> {
  const { activePackId, activeProfile } = content;
  if (activePackId === undefined)
    throw new Error("Activate a content profile before creating a character.");
  const pack = await content.loadPack(activePackId);
  if (pack === undefined)
    throw new Error("The active content profile is not installed.");
  let profileBinding: CharacterProfileBinding | undefined;
  if (campaign !== undefined) {
    const target = campaignChangeTarget(
      campaign,
      { manifest: pack.manifest, profile: activeProfile },
      ...(content.materializer === undefined ? [] : [content.materializer]),
    );
    if (target === undefined)
      throw new Error(
        "Activate a content profile before creating a character.",
      );
    profileBinding = (await target.materialize()).binding;
  } else if (activeProfile !== undefined)
    profileBinding = {
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
  campaign?: CampaignDocument,
  navigate: (hash: string) => void = (hash) => {
    window.location.hash = hash;
  },
): Promise<CharacterRecord> {
  const character = await newCharacter(content, campaign);
  holdCharacterDraft(character);
  navigate(characterEditorHash(character.id, { workspace: "build" }));
  return character;
}
