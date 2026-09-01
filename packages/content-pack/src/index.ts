import type {
  ContentAccounting,
  ContentDiagnostic,
  ContentEntity,
  ContentNode,
  ParsedContentEntity,
  ParsedContentSource,
  RejectedContentRecord,
} from "@4ecb/content-domain";

export const CONTENT_PACK_FORMAT = "4ecb-content-pack";
export const CONTENT_PACK_VERSION = 1;
export const MAX_CONTENT_PACK_ENCODED_BYTES = 128 * 1024 * 1024;
export const MAX_CONTENT_PACK_DECODED_BYTES = 128 * 1024 * 1024;
export const MAX_CONTENT_PACK_ID_LENGTH = 64;
export const MAX_CONTENT_PACK_NAME_LENGTH = 120;

export interface ContentTypeCount {
  readonly type: string;
  readonly count: number;
}

export interface ContentPackManifest {
  readonly formatVersion: typeof CONTENT_PACK_VERSION;
  readonly packId: string;
  readonly name: string;
  readonly contentDigest: string;
  readonly gameSystem: string;
  readonly sourceKey: string;
  readonly recordCount: number;
  readonly typeCounts: readonly ContentTypeCount[];
  readonly accounting: ContentAccounting;
  readonly diagnosticCounts: Readonly<
    Record<ContentDiagnostic["severity"], number>
  >;
}

export interface ContentPack {
  readonly format: typeof CONTENT_PACK_FORMAT;
  readonly manifest: ContentPackManifest;
  readonly entities: readonly ContentEntity[];
  readonly rejected: readonly RejectedContentRecord[];
  readonly rawTopLevel: readonly ContentNode[];
  readonly diagnostics: readonly ContentDiagnostic[];
}

export interface BuildContentPackOptions {
  readonly packId: string;
  readonly name: string;
}

export interface ContentPackValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ContentPackSummary {
  readonly packId: string;
  readonly name: string;
  readonly contentDigest: string;
  readonly gameSystem: string;
  readonly sourceKey: string;
  readonly recordCount: number;
  readonly typeCounts: readonly ContentTypeCount[];
  readonly accounting: ContentAccounting;
  readonly diagnosticCounts: Readonly<
    Record<ContentDiagnostic["severity"], number>
  >;
}

export interface ContentPackDiff {
  readonly beforeDigest: string;
  readonly afterDigest: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
  readonly unchangedCount: number;
}

export interface ContentPackByteLimits {
  readonly maxEncodedBytes?: number;
  readonly maxDecodedBytes?: number;
}

export function contentPackIdentityErrors(
  packId: string,
  name: string,
): string[] {
  const errors: string[] = [];
  if (
    packId.length === 0 ||
    packId.length > MAX_CONTENT_PACK_ID_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(packId)
  )
    errors.push(
      `packId must be 1-${MAX_CONTENT_PACK_ID_LENGTH} ASCII letters, digits, dots, underscores, colons, or hyphens and start with a letter or digit`,
    );
  if (
    name.length === 0 ||
    name.length > MAX_CONTENT_PACK_NAME_LENGTH ||
    name !== name.trim() ||
    /[\u0000-\u001f\u007f]/.test(name)
  )
    errors.push(
      `name must be 1-${MAX_CONTENT_PACK_NAME_LENGTH} trimmed characters without control characters`,
    );
  return errors;
}

function typeCounts(entities: readonly ContentEntity[]): ContentTypeCount[] {
  const counts = new Map<string, number>();
  for (const entity of entities)
    counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
  return [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => ({ type, count }));
}

function diagnosticCounts(
  diagnostics: readonly ContentDiagnostic[],
): Record<ContentDiagnostic["severity"], number> {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1;
  return counts;
}

function normalizeParsedEntity(entity: ParsedContentEntity): ContentEntity {
  const { content, ...normalized } = entity;
  void content;
  return normalized;
}

function digestInput(pack: ContentPack): string {
  const manifest = {
    formatVersion: pack.manifest.formatVersion,
    packId: pack.manifest.packId,
    name: pack.manifest.name,
    gameSystem: pack.manifest.gameSystem,
    sourceKey: pack.manifest.sourceKey,
    recordCount: pack.manifest.recordCount,
    typeCounts: pack.manifest.typeCounts,
    accounting: pack.manifest.accounting,
    diagnosticCounts: pack.manifest.diagnosticCounts,
  };
  return JSON.stringify({
    format: pack.format,
    manifest,
    entities: pack.entities,
    rejected: pack.rejected,
    rawTopLevel: pack.rawTopLevel,
    diagnostics: pack.diagnostics,
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildContentPack(
  source: ParsedContentSource,
  options: BuildContentPackOptions,
): Promise<ContentPack> {
  const identityErrors = contentPackIdentityErrors(
    options.packId,
    options.name,
  );
  if (identityErrors.length > 0)
    throw new Error(
      `Invalid content pack identity: ${identityErrors.join("; ")}`,
    );

  const entities = source.entities.map(normalizeParsedEntity);
  const manifestWithoutDigest: ContentPackManifest = {
    formatVersion: CONTENT_PACK_VERSION,
    packId: options.packId,
    name: options.name,
    contentDigest: "",
    gameSystem: source.gameSystem,
    sourceKey: source.sourceKey,
    recordCount: entities.length,
    typeCounts: typeCounts(entities),
    accounting: source.accounting,
    diagnosticCounts: diagnosticCounts(source.diagnostics),
  };
  const packWithoutDigest: ContentPack = {
    format: CONTENT_PACK_FORMAT,
    manifest: manifestWithoutDigest,
    entities,
    rejected: source.rejected,
    rawTopLevel: source.rawTopLevel,
    diagnostics: source.diagnostics,
  };
  const contentDigest = await sha256(digestInput(packWithoutDigest));
  return {
    ...packWithoutDigest,
    manifest: { ...manifestWithoutDigest, contentDigest },
  };
}

export function encodeContentPack(pack: ContentPack): string {
  return `${JSON.stringify(pack)}\n`;
}

export function encodeContentPackBytes(
  pack: ContentPack,
  maxBytes = MAX_CONTENT_PACK_DECODED_BYTES,
): Uint8Array {
  const bytes = new TextEncoder().encode(encodeContentPack(pack));
  if (bytes.byteLength > maxBytes)
    throw new Error(
      `Encoded content pack exceeds the ${maxBytes.toLocaleString()} byte decoded-size limit`,
    );
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPackShape(value: unknown): asserts value is ContentPack {
  if (!isRecord(value)) throw new Error("Content pack must be a JSON object");
  if (value.format !== CONTENT_PACK_FORMAT) {
    throw new Error(`Unsupported content pack format: ${String(value.format)}`);
  }
  if (!isRecord(value.manifest))
    throw new Error("Content pack manifest is missing");
  if (value.manifest.formatVersion !== CONTENT_PACK_VERSION) {
    throw new Error(
      `Unsupported content pack version: ${String(value.manifest.formatVersion)}`,
    );
  }
  for (const field of [
    "packId",
    "name",
    "contentDigest",
    "gameSystem",
    "sourceKey",
  ] as const) {
    if (typeof value.manifest[field] !== "string") {
      throw new Error(`Manifest field ${field} must be a string`);
    }
  }
  if (!Array.isArray(value.entities))
    throw new Error("Content pack entities must be an array");
  if (!Array.isArray(value.rejected))
    throw new Error("Content pack rejected must be an array");
  if (!Array.isArray(value.rawTopLevel)) {
    throw new Error("Content pack rawTopLevel must be an array");
  }
  if (!Array.isArray(value.diagnostics)) {
    throw new Error("Content pack diagnostics must be an array");
  }
}

export function decodeContentPack(value: string): ContentPack {
  const decoded: unknown = JSON.parse(value);
  assertPackShape(decoded);
  return decoded;
}

export async function decodeContentPackBytes(
  value: ArrayBuffer,
  limits: ContentPackByteLimits = {},
): Promise<ContentPack> {
  const maxEncodedBytes =
    limits.maxEncodedBytes ?? MAX_CONTENT_PACK_ENCODED_BYTES;
  const maxDecodedBytes =
    limits.maxDecodedBytes ?? MAX_CONTENT_PACK_DECODED_BYTES;
  if (value.byteLength > maxEncodedBytes)
    throw new Error(
      `Content pack exceeds the ${maxEncodedBytes.toLocaleString()} byte input-size limit`,
    );

  const bytes = new Uint8Array(value);
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const stream = gzip
    ? new Blob([value]).stream().pipeThrough(new DecompressionStream("gzip"))
    : new Blob([value]).stream();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let decodedBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      decodedBytes += result.value.byteLength;
      if (decodedBytes > maxDecodedBytes) {
        await reader.cancel();
        throw new Error(
          `Decoded content pack exceeds the ${maxDecodedBytes.toLocaleString()} byte limit`,
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const decoded = new Uint8Array(decodedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    decoded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeContentPack(new TextDecoder().decode(decoded));
}

export async function validateContentPack(
  pack: ContentPack,
): Promise<ContentPackValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  errors.push(
    ...contentPackIdentityErrors(pack.manifest.packId, pack.manifest.name),
  );

  if (pack.manifest.recordCount !== pack.entities.length) {
    errors.push(
      `Manifest recordCount ${pack.manifest.recordCount} does not match ${pack.entities.length}`,
    );
  }
  if (pack.manifest.accounting.acceptedRecords !== pack.entities.length) {
    errors.push("Accounting acceptedRecords does not match entity count");
  }
  if (
    pack.manifest.accounting.topLevelRecords !==
    pack.entities.length + pack.rejected.length
  ) {
    errors.push(
      "Top-level accounting does not equal accepted plus rejected records",
    );
  }

  for (const entity of pack.entities) {
    const normalizedId = entity.id.toLocaleLowerCase();
    if (ids.has(normalizedId)) errors.push(`Duplicate entity ID: ${entity.id}`);
    ids.add(normalizedId);
    if (entity.name.length === 0 || entity.type.length === 0) {
      errors.push(`Entity ${entity.id} has an empty name or type`);
    }
  }

  const expectedTypeCounts = JSON.stringify(typeCounts(pack.entities));
  if (JSON.stringify(pack.manifest.typeCounts) !== expectedTypeCounts) {
    errors.push("Manifest typeCounts do not match entities");
  }

  const actualDigest = await sha256(
    digestInput({ ...pack, manifest: { ...pack.manifest } }),
  );
  if (actualDigest !== pack.manifest.contentDigest) {
    errors.push(
      `Digest mismatch: expected ${pack.manifest.contentDigest}, calculated ${actualDigest}`,
    );
  }

  if (pack.rejected.length > 0) {
    warnings.push(
      `${pack.rejected.length} record(s) were rejected and preserved`,
    );
  }
  if (pack.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    warnings.push("The pack contains source diagnostics with error severity");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function summarizeContentPack(pack: ContentPack): ContentPackSummary {
  return {
    packId: pack.manifest.packId,
    name: pack.manifest.name,
    contentDigest: pack.manifest.contentDigest,
    gameSystem: pack.manifest.gameSystem,
    sourceKey: pack.manifest.sourceKey,
    recordCount: pack.manifest.recordCount,
    typeCounts: pack.manifest.typeCounts,
    accounting: pack.manifest.accounting,
    diagnosticCounts: pack.manifest.diagnosticCounts,
  };
}

export function diffContentPacks(
  before: ContentPack,
  after: ContentPack,
): ContentPackDiff {
  const beforeById = new Map(
    before.entities.map((entity) => [entity.id, JSON.stringify(entity)]),
  );
  const afterById = new Map(
    after.entities.map((entity) => [entity.id, JSON.stringify(entity)]),
  );
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchangedCount = 0;

  for (const [id, entity] of afterById) {
    const previous = beforeById.get(id);
    if (previous === undefined) added.push(id);
    else if (previous !== entity) changed.push(id);
    else unchangedCount += 1;
  }
  for (const id of beforeById.keys()) {
    if (!afterById.has(id)) removed.push(id);
  }

  return {
    beforeDigest: before.manifest.contentDigest,
    afterDigest: after.manifest.contentDigest,
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    unchangedCount,
  };
}
