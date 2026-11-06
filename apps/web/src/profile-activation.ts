// Switching the browser's active content (Settings' content table, and the
// automatic move to newly advertised group content, D004). Composing a
// profile pack takes seconds of CPU on a large pack, so the page never does
// it: a stored profile pack is a manifest lookup, anything else is composed
// in the content worker (the same mechanism as campaign profiles, D116).
// Only the activation itself, a settings write, runs here.

import type {
  ContentPackRepository,
  ContentProfileDefinition,
} from "@4ecb/browser-storage";

import { ACTIVE_PROFILE_ID, ACTIVE_PROFILE_NAME } from "./content-profile-ui";
import { composeProfileInWorker } from "./content-worker-client";
import {
  shouldActivateAdvertisedContent,
  type AdvertisedContentPack,
} from "./runtime-content";

export type ProfileMaterializer = (
  profileId: string,
  name: string,
  layerPackIds: readonly string[],
) => Promise<ContentProfileDefinition>;

export type ProfileActivationRepository = Pick<
  ContentPackRepository,
  "storedProfile" | "setActiveProfile"
>;

/** Makes `layerPackIds` (in order) the active content: the stored profile
 *  pack when there is one, else one composed in the content worker. */
export async function activateContentProfile(
  repository: ProfileActivationRepository,
  layerPackIds: readonly string[],
  composeInWorker: ProfileMaterializer = composeProfileInWorker,
): Promise<ContentProfileDefinition> {
  const definition =
    (await repository.storedProfile(
      ACTIVE_PROFILE_ID,
      ACTIVE_PROFILE_NAME,
      layerPackIds,
    )) ??
    (await composeInWorker(
      ACTIVE_PROFILE_ID,
      ACTIVE_PROFILE_NAME,
      layerPackIds,
    ));
  await repository.setActiveProfile(definition);
  return definition;
}

/**
 * The browser follows the group's content: it starts on it, and moves to a
 * newly advertised revision unless the user assembled content of their own,
 * once every advertised pack is installed. Characters stay pinned until the
 * user reviews the update. True when the active content changed.
 */
export async function followAdvertisedContent(
  repository: ProfileActivationRepository &
    Pick<ContentPackRepository, "activeProfile" | "listInstalled">,
  advertisedPacks: readonly AdvertisedContentPack[],
  composeInWorker: ProfileMaterializer = composeProfileInWorker,
): Promise<boolean> {
  const available = await repository.listInstalled();
  if (
    !shouldActivateAdvertisedContent(
      await repository.activeProfile(),
      advertisedPacks,
      (packId) =>
        available.find(({ manifest }) => manifest.packId === packId)?.origin,
    )
  )
    return false;
  if (
    !advertisedPacks.every((advertised) =>
      available.some(
        ({ manifest }) =>
          manifest.packId === advertised.packId &&
          manifest.contentDigest === advertised.contentDigest,
      ),
    )
  )
    return false;
  await activateContentProfile(
    repository,
    advertisedPacks.map(({ packId }) => packId),
    composeInWorker,
  );
  return true;
}
