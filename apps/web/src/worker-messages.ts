import type { ContentPackManifest } from "@4ecb/content-pack";

export interface ImportPackRequest {
  readonly type: "import-pack";
  readonly buffer: ArrayBuffer;
}

export type ImportPackProgressPhase = "decoding" | "validating" | "storing";

export type ImportPackResponse =
  | { readonly type: "progress"; readonly phase: ImportPackProgressPhase }
  | { readonly type: "complete"; readonly manifest: ContentPackManifest }
  | { readonly type: "error"; readonly message: string };
