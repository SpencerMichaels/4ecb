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
export const MAX_CONTENT_PACK_RECORDS = 100_000;
export const MAX_CONTENT_NODE_DEPTH = 100;

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

export const CONTENT_PROFILE_RESOLUTION_POLICY = "last-pack-wins-v1" as const;

export interface ContentProfileLayer {
  readonly packId: string;
  readonly contentDigest: string;
}

export interface ComposedContentProfile {
  readonly layers: readonly ContentProfileLayer[];
  readonly resolutionPolicy: typeof CONTENT_PROFILE_RESOLUTION_POLICY;
  readonly pack: ContentPack;
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

export async function composeContentPacks(
  packs: readonly ContentPack[],
  options: BuildContentPackOptions,
): Promise<ComposedContentProfile> {
  if (packs.length === 0)
    throw new Error("A content profile requires at least one pack");
  const identities = new Set<string>();
  const gameSystem = packs[0]?.manifest.gameSystem;
  for (const pack of packs) {
    const identity = `${pack.manifest.packId}:${pack.manifest.contentDigest}`;
    if (identities.has(identity))
      throw new Error(`Duplicate content profile layer ${identity}`);
    identities.add(identity);
    if (pack.manifest.gameSystem !== gameSystem)
      throw new Error("Content profile layers must use the same game system");
  }
  const resolved = new Map<string, ContentEntity>();
  const collisions: ContentDiagnostic[] = [];
  for (const pack of packs) {
    for (const entity of pack.entities) {
      const previous = resolved.get(entity.id);
      if (previous !== undefined)
        collisions.push({
          severity: "info",
          code: "profile.entity-overridden",
          message: `${entity.id} from ${pack.manifest.packId} overrides an earlier layer`,
          entityId: entity.id,
        });
      resolved.set(entity.id, entity);
    }
  }
  const entities = [...resolved.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const pack = await buildContentPack(
    {
      gameSystem: gameSystem ?? "D&D4E",
      sourceKey: packs
        .map(({ manifest }) => `${manifest.packId}:${manifest.contentDigest}`)
        .join(" > "),
      entities: entities.map((entity) => ({ ...entity, content: [] })),
      rejected: packs.flatMap((candidate) => candidate.rejected),
      rawTopLevel: [],
      diagnostics: [
        ...packs.flatMap((candidate) => candidate.diagnostics),
        ...collisions,
      ],
      accounting: {
        topLevelRecords:
          entities.length +
          packs.reduce(
            (sum, candidate) =>
              sum + candidate.manifest.accounting.rejectedRecords,
            0,
          ),
        acceptedRecords: entities.length,
        warnedRecords: packs.reduce(
          (sum, candidate) => sum + candidate.manifest.accounting.warnedRecords,
          0,
        ),
        rejectedRecords: packs.reduce(
          (sum, candidate) =>
            sum + candidate.manifest.accounting.rejectedRecords,
          0,
        ),
        rawTopLevelElements: 0,
      },
    },
    options,
  );
  return {
    layers: packs.map(({ manifest }) => ({
      packId: manifest.packId,
      contentDigest: manifest.contentDigest,
    })),
    resolutionPolicy: CONTENT_PROFILE_RESOLUTION_POLICY,
    pack,
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

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isAttribute(value: unknown): boolean {
  const attribute = isRecord(value) ? value : undefined;
  return (
    attribute !== undefined &&
    typeof attribute.name === "string" &&
    typeof attribute.value === "string"
  );
}

function isAttributeArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isAttribute);
}

function isContentNode(value: unknown, depth = 0): boolean {
  if (depth > MAX_CONTENT_NODE_DEPTH) return false;
  const node = isRecord(value) ? value : undefined;
  if (node === undefined) return false;
  if (node.kind === "text" || node.kind === "comment")
    return typeof node.value === "string";
  return (
    node.kind === "element" &&
    typeof node.name === "string" &&
    isAttributeArray(node.attributes) &&
    Array.isArray(node.children) &&
    node.children.every((child) => isContentNode(child, depth + 1))
  );
}

function isSpecificField(value: unknown): boolean {
  const field = isRecord(value) ? value : undefined;
  return (
    field !== undefined &&
    typeof field.name === "string" &&
    typeof field.value === "string" &&
    isAttributeArray(field.extraAttributes) &&
    isNonnegativeInteger(field.ordinal)
  );
}

function isRuleStatement(value: unknown): boolean {
  const statement = isRecord(value) ? value : undefined;
  return (
    statement !== undefined &&
    typeof statement.name === "string" &&
    isAttributeArray(statement.attributes) &&
    typeof statement.text === "string" &&
    Array.isArray(statement.children) &&
    statement.children.every((child) => isContentNode(child)) &&
    isNonnegativeInteger(statement.ordinal)
  );
}

function isContentEntity(value: unknown): boolean {
  const entity = isRecord(value) ? value : undefined;
  const provenance = isRecord(entity?.provenance)
    ? entity.provenance
    : undefined;
  return (
    entity !== undefined &&
    typeof entity.id === "string" &&
    typeof entity.name === "string" &&
    typeof entity.type === "string" &&
    typeof entity.source === "string" &&
    isStringArray(entity.sources) &&
    isOptionalString(entity.revisionDate) &&
    isAttributeArray(entity.attributes) &&
    isStringArray(entity.categories) &&
    isOptionalString(entity.flavor) &&
    isOptionalString(entity.prerequisites) &&
    isOptionalString(entity.printPrerequisites) &&
    Array.isArray(entity.specifics) &&
    entity.specifics.every(isSpecificField) &&
    Array.isArray(entity.rules) &&
    entity.rules.every(isRuleStatement) &&
    typeof entity.description === "string" &&
    Array.isArray(entity.extensions) &&
    entity.extensions.every((value) => {
      const extension = isRecord(value) ? value : undefined;
      return (
        extension !== undefined &&
        isNonnegativeInteger(extension.ordinal) &&
        isContentNode(extension.node)
      );
    }) &&
    provenance !== undefined &&
    typeof provenance.sourceKey === "string" &&
    isNonnegativeInteger(provenance.sourceOrdinal)
  );
}

function isAccounting(value: unknown): boolean {
  const accounting = isRecord(value) ? value : undefined;
  return (
    accounting !== undefined &&
    [
      "topLevelRecords",
      "acceptedRecords",
      "warnedRecords",
      "rejectedRecords",
      "rawTopLevelElements",
    ].every((field) => isNonnegativeInteger(accounting[field]))
  );
}

function isDiagnostic(value: unknown): boolean {
  const diagnostic = isRecord(value) ? value : undefined;
  return (
    diagnostic !== undefined &&
    (diagnostic.severity === "error" ||
      diagnostic.severity === "warning" ||
      diagnostic.severity === "info") &&
    typeof diagnostic.code === "string" &&
    typeof diagnostic.message === "string" &&
    isOptionalString(diagnostic.entityId) &&
    (diagnostic.ordinal === undefined ||
      isNonnegativeInteger(diagnostic.ordinal))
  );
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
  if (
    !isNonnegativeInteger(value.manifest.recordCount) ||
    !Array.isArray(value.manifest.typeCounts) ||
    !value.manifest.typeCounts.every((entry) => {
      const count = isRecord(entry) ? entry : undefined;
      return (
        count !== undefined &&
        typeof count.type === "string" &&
        isNonnegativeInteger(count.count)
      );
    }) ||
    !isAccounting(value.manifest.accounting)
  )
    throw new Error("Content pack manifest counts are invalid");
  const diagnosticCounts = isRecord(value.manifest.diagnosticCounts)
    ? value.manifest.diagnosticCounts
    : undefined;
  if (
    diagnosticCounts === undefined ||
    !["error", "warning", "info"].every((severity) =>
      isNonnegativeInteger(diagnosticCounts[severity]),
    )
  )
    throw new Error("Content pack diagnostic counts are invalid");
  if (
    !Array.isArray(value.entities) ||
    value.entities.length > MAX_CONTENT_PACK_RECORDS ||
    !value.entities.every(isContentEntity)
  )
    throw new Error(
      `Content pack entities must contain at most ${MAX_CONTENT_PACK_RECORDS.toLocaleString()} valid records`,
    );
  if (
    !Array.isArray(value.rejected) ||
    value.rejected.length > MAX_CONTENT_PACK_RECORDS ||
    !value.rejected.every((value) => {
      const rejected = isRecord(value) ? value : undefined;
      return (
        rejected !== undefined &&
        isNonnegativeInteger(rejected.ordinal) &&
        typeof rejected.reason === "string" &&
        isContentNode(rejected.content) &&
        isRecord(rejected.content) &&
        rejected.content.kind === "element"
      );
    })
  )
    throw new Error("Content pack rejected records are invalid");
  if (
    !Array.isArray(value.rawTopLevel) ||
    !value.rawTopLevel.every((node) => isContentNode(node))
  )
    throw new Error("Content pack raw top-level nodes are invalid");
  if (
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isDiagnostic)
  )
    throw new Error("Content pack diagnostics are invalid");
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
