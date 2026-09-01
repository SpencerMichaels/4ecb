import type { ContentPackManifest } from "@4ecb/content-pack";

export interface ImportPackRequest {
  readonly type: "import-pack";
  readonly buffer: ArrayBuffer;
}

export interface ImportLegacyRulesRequest {
  readonly type: "import-legacy-rules";
  readonly buffer: ArrayBuffer;
  readonly sourceKey: string;
  readonly packId: string;
  readonly name: string;
}

export type ContentImportRequest = ImportPackRequest | ImportLegacyRulesRequest;

export type ImportPackProgressPhase =
  "decoding" | "parsing-rules" | "building-pack" | "validating" | "storing";

export type ImportPackResponse =
  | { readonly type: "progress"; readonly phase: ImportPackProgressPhase }
  | { readonly type: "complete"; readonly manifest: ContentPackManifest }
  | { readonly type: "error"; readonly message: string };
