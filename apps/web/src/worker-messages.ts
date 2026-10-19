import type { ContentPackManifest } from "@4ecb/content-pack";

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
