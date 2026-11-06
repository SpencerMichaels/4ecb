import type {
  CampaignProfileDefinition,
  ContentProfileDefinition,
} from "@4ecb/browser-storage";
import type { CampaignDocument, ContentPackManifest } from "@4ecb/content-pack";

export interface ImportPackRequest {
  readonly type: "import-pack";
  readonly buffer: ArrayBuffer;
}

/** The browser installs portable packs only; conversion is the content tool's job. */
export type ContentImportRequest = ImportPackRequest;

export type ImportPackProgressPhase = "decoding" | "validating" | "storing";

export type ImportPackResponse =
  | { readonly type: "progress"; readonly phase: ImportPackProgressPhase }
  | { readonly type: "complete"; readonly manifest: ContentPackManifest }
  | { readonly type: "error"; readonly message: string };

/** Composes and stores a campaign character's profile (D116) off the main
 *  thread: `ContentPackRepository.materializeCampaignProfile`. */
export interface MaterializeCampaignProfileRequest {
  readonly type: "materialize-campaign-profile";
  readonly baseLayerPackIds: readonly string[];
  readonly campaign: CampaignDocument;
}

export type MaterializeCampaignProfileResponse =
  | {
      readonly type: "campaign-profile";
      readonly definition: CampaignProfileDefinition;
    }
  | { readonly type: "error"; readonly message: string };

/** Composes and stores an ordinary content profile (the browser's active
 *  content) off the main thread: `ContentPackRepository.materializeProfile`.
 *  The page activates the returned definition itself. */
export interface MaterializeProfileRequest {
  readonly type: "materialize-profile";
  readonly profileId: string;
  readonly name: string;
  readonly layerPackIds: readonly string[];
}

export type MaterializeProfileResponse =
  | {
      readonly type: "profile";
      readonly definition: ContentProfileDefinition;
    }
  | { readonly type: "error"; readonly message: string };

/** Everything the content worker accepts; one worker serves one request. */
export type ContentWorkerRequest =
  | ContentImportRequest
  | MaterializeCampaignProfileRequest
  | MaterializeProfileRequest;
