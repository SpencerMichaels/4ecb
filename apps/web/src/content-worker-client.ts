// The page's side of the content worker for work it awaits: one worker per
// request, ended when the request settles (pack import keeps its own
// progress-reporting client in Settings).

import type {
  CampaignProfileDefinition,
  ContentProfileDefinition,
} from "@4ecb/browser-storage";
import type {
  CampaignDocument,
  CampaignRemovedRecordCount,
} from "@4ecb/content-pack";

import type {
  CampaignRemovedRecordsRequest,
  CampaignRemovedRecordsResponse,
  MaterializeCampaignProfileRequest,
  MaterializeCampaignProfileResponse,
  MaterializeProfileRequest,
  MaterializeProfileResponse,
} from "./worker-messages";

type ContentWorkerAwaitedRequest =
  | CampaignRemovedRecordsRequest
  | MaterializeCampaignProfileRequest
  | MaterializeProfileRequest;
type ContentWorkerAwaitedResponse =
  | CampaignRemovedRecordsResponse
  | MaterializeCampaignProfileResponse
  | MaterializeProfileResponse;

/** The subset of `Worker` the client uses, so tests can drive the worker
 *  module in process. */
export interface ContentWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: ContentWorkerAwaitedRequest): void;
  terminate(): void;
}

export type ContentWorkerFactory = () => ContentWorkerPort;

const createContentWorker: ContentWorkerFactory = () =>
  new Worker(new URL("./content.worker.ts", import.meta.url), {
    type: "module",
  });

/** Sends one request to a fresh content worker and settles with its
 *  answer; the worker ends either way. */
function requestContentWorker<Result>(
  request: ContentWorkerAwaitedRequest,
  result: (response: ContentWorkerAwaitedResponse) => Result | undefined,
  createWorker: ContentWorkerFactory,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.onmessage = (event: MessageEvent<ContentWorkerAwaitedResponse>) => {
      worker.terminate();
      const response = event.data;
      const value = result(response);
      if (value !== undefined) resolve(value);
      else
        reject(
          new Error(
            response.type === "error"
              ? response.message
              : "The content worker answered unexpectedly",
          ),
        );
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The content worker failed"));
    };
    worker.postMessage(request);
  });
}

/** Composes and stores a campaign profile (D116) in the content worker, so
 *  decoding, composing and encoding a large pack never blocks the page. */
export function composeCampaignProfileInWorker(
  baseLayerPackIds: readonly string[],
  campaign: CampaignDocument,
  createWorker: ContentWorkerFactory = createContentWorker,
): Promise<CampaignProfileDefinition> {
  return requestContentWorker(
    { type: "materialize-campaign-profile", baseLayerPackIds, campaign },
    (response) =>
      response.type === "campaign-profile" ? response.definition : undefined,
    createWorker,
  );
}

/** Composes and stores an ordinary content profile in the content worker,
 *  the same way; activating it is left to the caller. */
export function composeProfileInWorker(
  profileId: string,
  name: string,
  layerPackIds: readonly string[],
  createWorker: ContentWorkerFactory = createContentWorker,
): Promise<ContentProfileDefinition> {
  return requestContentWorker(
    { type: "materialize-profile", profileId, name, layerPackIds },
    (response) =>
      response.type === "profile" ? response.definition : undefined,
    createWorker,
  );
}

/** Counts, by type, the base records `campaign` makes unavailable over the
 *  given base layers (the invite page's "Removed" line), in the content
 *  worker, so decoding a large pack never blocks the page. */
export function countCampaignRemovedRecordsInWorker(
  baseLayerPackIds: readonly string[],
  campaign: CampaignDocument,
  createWorker: ContentWorkerFactory = createContentWorker,
): Promise<readonly CampaignRemovedRecordCount[]> {
  return requestContentWorker(
    { type: "campaign-removed-records", baseLayerPackIds, campaign },
    (response) =>
      response.type === "campaign-removed-records"
        ? response.counts
        : undefined,
    createWorker,
  );
}
