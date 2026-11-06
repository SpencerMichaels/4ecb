// The page's side of the content worker for work it awaits: one worker per
// request, ended when the request settles (pack import keeps its own
// progress-reporting client in Settings).

import type { CampaignProfileDefinition } from "@4ecb/browser-storage";
import type { CampaignDocument } from "@4ecb/content-pack";

import type {
  MaterializeCampaignProfileRequest,
  MaterializeCampaignProfileResponse,
} from "./worker-messages";

/** The subset of `Worker` the client uses, so tests can drive the worker
 *  module in process. */
export interface ContentWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: MaterializeCampaignProfileRequest): void;
  terminate(): void;
}

export type ContentWorkerFactory = () => ContentWorkerPort;

const createContentWorker: ContentWorkerFactory = () =>
  new Worker(new URL("./content.worker.ts", import.meta.url), {
    type: "module",
  });

/** Composes and stores a campaign profile (D116) in the content worker, so
 *  decoding, composing and encoding a large pack never blocks the page. */
export function composeCampaignProfileInWorker(
  baseLayerPackIds: readonly string[],
  campaign: CampaignDocument,
  createWorker: ContentWorkerFactory = createContentWorker,
): Promise<CampaignProfileDefinition> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.onmessage = (
      event: MessageEvent<MaterializeCampaignProfileResponse>,
    ) => {
      worker.terminate();
      const response = event.data;
      if (response.type === "campaign-profile") resolve(response.definition);
      else reject(new Error(response.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The content worker failed"));
    };
    worker.postMessage({
      type: "materialize-campaign-profile",
      baseLayerPackIds,
      campaign,
    });
  });
}
