import {
  decodeContentPackBytes,
  validateContentPack,
  type ContentPack,
  type ContentPackManifest,
} from "@4ecb/content-pack";

import {
  storeValidatedContentPack,
  type ValidatedPackStorageMetadata,
} from "./pack-repository";

const validatedArtifacts = new WeakSet<object>();

export interface ValidatedContentPackArtifact {
  readonly pack: ContentPack;
  readonly encodedPack: ArrayBuffer;
}

export async function decodeAndValidateContentPackForStorage(
  encodedPack: ArrayBuffer,
  invalidMessage = "Cannot install invalid content pack",
  onDecoded?: () => void,
): Promise<ValidatedContentPackArtifact> {
  const pack = await decodeContentPackBytes(encodedPack);
  onDecoded?.();
  const validation = await validateContentPack(pack);
  if (!validation.valid)
    throw new Error(`${invalidMessage}: ${validation.errors.join("; ")}`);
  const artifact = { pack, encodedPack };
  validatedArtifacts.add(artifact);
  return artifact;
}

/** Internal seam requiring an unforgeable artifact from the validator above. */
export function storeAlreadyValidatedContentPack(
  artifact: ValidatedContentPackArtifact,
  metadata: ValidatedPackStorageMetadata = {},
): Promise<ContentPackManifest> {
  if (!validatedArtifacts.has(artifact))
    return Promise.reject(
      new Error("Content pack validation proof is missing"),
    );
  return storeValidatedContentPack(
    "4ecb",
    artifact.pack,
    artifact.encodedPack,
    metadata,
  );
}
