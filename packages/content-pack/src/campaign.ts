// Campaign documents (D116): a DM's house-rule overlay and restrictions as a
// portable, digest-verified document, and its composition over the server's
// packs. Wire format: docs/content-pack-format.md, "Campaign documents".

import type { ContentEntity, ParsedContentSource } from "@4ecb/content-domain";

import {
  assertContentPackShape,
  buildContentPack,
  composeContentPacks,
  contentPackIdentityErrors,
  validateContentPack,
  type BuildContentPackOptions,
  type ComposedContentProfile,
  type ContentPack,
  type ContentPackByteLimits,
  type ContentPackCampaign,
  type ContentPackValidation,
} from "./index";
import { readLimitedText, sha256 } from "./internal";

export const CAMPAIGN_FORMAT = "4ecb-campaign";
export const CAMPAIGN_VERSION = 1;
export const MAX_CAMPAIGN_ENCODED_BYTES = 16 * 1024 * 1024;
export const MAX_CAMPAIGN_DECODED_BYTES = 16 * 1024 * 1024;
export const MAX_CAMPAIGN_ID_LENGTH = 32;
export const MAX_CAMPAIGN_REVISION = 999_999;
export const MAX_CAMPAIGN_HOUSE_RULE_RECORDS = 10_000;
export const MAX_CAMPAIGN_RESTRICTED_IDS = 50_000;
export const MAX_CAMPAIGN_TYPE_RULES = 32;
export const MAX_CAMPAIGN_LEGACY_XML_BYTES = 8 * 1024 * 1024;

/** A type rule: every record of `type` not supplied by the campaign. */
export interface CampaignTypeRestriction {
  readonly type: string;
  readonly allow: "campaign-only";
}

export interface CampaignRestrictions {
  /** Record IDs not offered in the campaign (legacy `Restricted`). */
  readonly ids: readonly string[];
  readonly types: readonly CampaignTypeRestriction[];
}

export interface CampaignDocument {
  readonly format: typeof CAMPAIGN_FORMAT;
  readonly version: typeof CAMPAIGN_VERSION;
  readonly campaignId: string;
  readonly name: string;
  /** Orders a campaign's revisions; the DM bumps it on every change. */
  readonly revision: number;
  readonly restrictions: CampaignRestrictions;
  /** The overlay pack, `packId` `campaign.<campaignId>.r<revision>`. */
  readonly houseRules: ContentPack;
  /** The DM's RulesElement XML verbatim (the root's children), for export. */
  readonly legacyHouseRulesXml: string;
  /** SHA-256 over every other field, the overlay by its own digest. */
  readonly contentDigest: string;
}

/** The authored parts of a campaign; `buildCampaign` adds the rest. */
export interface CampaignManifest {
  readonly campaignId: string;
  readonly name: string;
  readonly revision: number;
  readonly restrictions: CampaignRestrictions;
}

export function campaignHouseRulesPackId(
  campaignId: string,
  revision: number,
): string {
  return `campaign.${campaignId}.r${revision}`;
}

function campaignDigestInput(
  campaign: Omit<CampaignDocument, "contentDigest">,
): string {
  return JSON.stringify({
    format: campaign.format,
    version: campaign.version,
    campaignId: campaign.campaignId,
    name: campaign.name,
    revision: campaign.revision,
    restrictions: {
      ids: campaign.restrictions.ids,
      types: campaign.restrictions.types.map(({ type, allow }) => ({
        type,
        allow,
      })),
    },
    houseRules: campaign.houseRules.manifest.contentDigest,
    legacyHouseRulesXml: campaign.legacyHouseRulesXml,
  });
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

/** Identity, revision, restriction and size errors; no digests. */
function campaignManifestErrors(manifest: CampaignManifest): string[] {
  const errors: string[] = [];
  const { campaignId, name, revision, restrictions } = manifest;
  if (
    campaignId.length > MAX_CAMPAIGN_ID_LENGTH ||
    contentPackIdentityErrors(campaignId, "-").length > 0
  )
    errors.push(
      `campaignId must be 1-${MAX_CAMPAIGN_ID_LENGTH} ASCII letters, digits, dots, underscores, colons, or hyphens and start with a letter or digit`,
    );
  errors.push(
    ...contentPackIdentityErrors("x", name).map((error) =>
      error.replace(/^name/, "Campaign name"),
    ),
  );
  if (
    !Number.isInteger(revision) ||
    revision < 1 ||
    revision > MAX_CAMPAIGN_REVISION
  )
    errors.push(
      `revision must be an integer from 1 to ${MAX_CAMPAIGN_REVISION.toLocaleString()}`,
    );
  if (restrictions.ids.length > MAX_CAMPAIGN_RESTRICTED_IDS)
    errors.push(
      `A campaign restricts at most ${MAX_CAMPAIGN_RESTRICTED_IDS.toLocaleString()} IDs`,
    );
  const ids = new Set<string>();
  for (const id of restrictions.ids) {
    if (id.length === 0 || id !== id.trim() || hasControlCharacters(id))
      errors.push(`Restricted ID ${JSON.stringify(id)} is not a record ID`);
    const key = id.toLocaleLowerCase();
    if (ids.has(key)) errors.push(`Restricted ID ${id} is listed twice`);
    ids.add(key);
  }
  if (restrictions.types.length > MAX_CAMPAIGN_TYPE_RULES)
    errors.push(
      `A campaign has at most ${MAX_CAMPAIGN_TYPE_RULES} type restrictions`,
    );
  const types = new Set<string>();
  for (const rule of restrictions.types) {
    if (
      rule.type.length === 0 ||
      rule.type !== rule.type.trim() ||
      hasControlCharacters(rule.type)
    )
      errors.push(
        `Restricted type ${JSON.stringify(rule.type)} is not a record type`,
      );
    if ((rule.allow as string) !== "campaign-only")
      errors.push(
        `Type restriction ${rule.type} must allow "campaign-only", not ${JSON.stringify(rule.allow)}`,
      );
    const key = rule.type.toLocaleLowerCase();
    if (types.has(key))
      errors.push(`Restricted type ${rule.type} is listed twice`);
    types.add(key);
  }
  return errors;
}

function legacyXmlErrors(xml: string): string[] {
  return new TextEncoder().encode(xml).byteLength >
    MAX_CAMPAIGN_LEGACY_XML_BYTES
    ? [
        `Legacy house-rule XML exceeds the ${MAX_CAMPAIGN_LEGACY_XML_BYTES.toLocaleString()} byte limit`,
      ]
    : [];
}

function houseRuleCountErrors(count: number): string[] {
  return count > MAX_CAMPAIGN_HOUSE_RULE_RECORDS
    ? [
        `A campaign has at most ${MAX_CAMPAIGN_HOUSE_RULE_RECORDS.toLocaleString()} house-rule records`,
      ]
    : [];
}

/**
 * Builds a campaign from its manifest, the parsed house-rule records and the
 * XML they were parsed from. Restricted IDs and type rules are put in a
 * canonical order (sorted, ignoring case), so the digest does not depend on
 * how the DM listed them.
 */
export async function buildCampaign(
  manifest: CampaignManifest,
  houseRules: ParsedContentSource,
  legacyHouseRulesXml: string,
): Promise<CampaignDocument> {
  const restrictions: CampaignRestrictions = {
    ids: [...manifest.restrictions.ids].sort(compareIgnoringCase),
    types: [...manifest.restrictions.types]
      .map(({ type, allow }) => ({ type, allow }))
      .sort((left, right) => compareIgnoringCase(left.type, right.type)),
  };
  const errors = [
    ...campaignManifestErrors({ ...manifest, restrictions }),
    ...legacyXmlErrors(legacyHouseRulesXml),
    ...houseRuleCountErrors(houseRules.entities.length),
  ];
  if (errors.length > 0)
    throw new Error(`Invalid campaign: ${errors.join("; ")}`);
  const pack = await buildContentPack(houseRules, {
    packId: campaignHouseRulesPackId(manifest.campaignId, manifest.revision),
    name: manifest.name,
  });
  const document: Omit<CampaignDocument, "contentDigest"> = {
    format: CAMPAIGN_FORMAT,
    version: CAMPAIGN_VERSION,
    campaignId: manifest.campaignId,
    name: manifest.name,
    revision: manifest.revision,
    restrictions,
    houseRules: pack,
    legacyHouseRulesXml,
  };
  return {
    ...document,
    contentDigest: await sha256(campaignDigestInput(document)),
  };
}

function compareIgnoringCase(left: string, right: string): number {
  const folded = left
    .toLocaleLowerCase()
    .localeCompare(right.toLocaleLowerCase());
  return folded !== 0 ? folded : left.localeCompare(right);
}

/** Canonical JSON followed by one newline (`.4ecc`; gzip is optional). */
export function encodeCampaign(
  campaign: CampaignDocument,
  maxBytes = MAX_CAMPAIGN_DECODED_BYTES,
): Uint8Array {
  const bytes = new TextEncoder().encode(`${JSON.stringify(campaign)}\n`);
  if (bytes.byteLength > maxBytes)
    throw new Error(
      `Encoded campaign exceeds the ${maxBytes.toLocaleString()} byte decoded-size limit`,
    );
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCampaignShape(
  value: unknown,
): asserts value is CampaignDocument {
  if (!isRecord(value)) throw new Error("Campaign must be a JSON object");
  if (value.format !== CAMPAIGN_FORMAT)
    throw new Error(`Unsupported campaign format: ${String(value.format)}`);
  if (value.version !== CAMPAIGN_VERSION)
    throw new Error(`Unsupported campaign version: ${String(value.version)}`);
  for (const field of [
    "campaignId",
    "name",
    "legacyHouseRulesXml",
    "contentDigest",
  ] as const)
    if (typeof value[field] !== "string")
      throw new Error(`Campaign field ${field} must be a string`);
  if (typeof value.revision !== "number")
    throw new Error("Campaign field revision must be a number");
  const restrictions = isRecord(value.restrictions)
    ? value.restrictions
    : undefined;
  if (
    restrictions === undefined ||
    !Array.isArray(restrictions.ids) ||
    !Array.isArray(restrictions.types)
  )
    throw new Error("Campaign restrictions are missing");
  // Counts before contents, so an oversized list is refused unread.
  if (restrictions.ids.length > MAX_CAMPAIGN_RESTRICTED_IDS)
    throw new Error(
      `A campaign restricts at most ${MAX_CAMPAIGN_RESTRICTED_IDS.toLocaleString()} IDs`,
    );
  if (restrictions.types.length > MAX_CAMPAIGN_TYPE_RULES)
    throw new Error(
      `A campaign has at most ${MAX_CAMPAIGN_TYPE_RULES} type restrictions`,
    );
  if (!restrictions.ids.every((id) => typeof id === "string"))
    throw new Error("Campaign restricted IDs must be strings");
  if (
    !restrictions.types.every(
      (rule) =>
        isRecord(rule) &&
        typeof rule.type === "string" &&
        typeof rule.allow === "string",
    )
  )
    throw new Error("Campaign type restrictions are invalid");
  if (!isRecord(value.houseRules))
    throw new Error("Campaign house rules are missing");
  if (
    !Array.isArray(value.houseRules.entities) ||
    value.houseRules.entities.length > MAX_CAMPAIGN_HOUSE_RULE_RECORDS
  )
    throw new Error(
      `A campaign has at most ${MAX_CAMPAIGN_HOUSE_RULE_RECORDS.toLocaleString()} house-rule records`,
    );
  if (value.houseRules.campaign !== undefined)
    throw new Error("Campaign house rules cannot carry a campaign");
  assertContentPackShape(value.houseRules);
}

/**
 * Recomputes the campaign digest and validates its identity, limits and the
 * embedded house-rule pack (whose errors are prefixed "House rules: ").
 */
export async function validateCampaign(
  campaign: CampaignDocument,
): Promise<ContentPackValidation> {
  const errors = [
    ...campaignManifestErrors(campaign),
    ...legacyXmlErrors(campaign.legacyHouseRulesXml),
    ...houseRuleCountErrors(campaign.houseRules.entities.length),
  ];
  const expectedPackId = campaignHouseRulesPackId(
    campaign.campaignId,
    campaign.revision,
  );
  if (campaign.houseRules.manifest.packId !== expectedPackId)
    errors.push(
      `House rules packId ${campaign.houseRules.manifest.packId} must be ${expectedPackId}`,
    );
  if (campaign.houseRules.campaign !== undefined)
    errors.push("House rules cannot carry a campaign");
  const pack = await validateContentPack(campaign.houseRules);
  errors.push(...pack.errors.map((error) => `House rules: ${error}`));
  const actualDigest = await sha256(campaignDigestInput(campaign));
  if (actualDigest !== campaign.contentDigest)
    errors.push(
      `Digest mismatch: expected ${campaign.contentDigest}, calculated ${actualDigest}`,
    );
  return {
    valid: errors.length === 0,
    errors,
    warnings: pack.warnings.map((warning) => `House rules: ${warning}`),
  };
}

/**
 * Decodes optionally gzipped `.4ecc` bytes within the size limits, checks the
 * shape (record and restriction counts before contents) and then validates
 * the campaign; an invalid campaign throws.
 */
export async function decodeCampaign(
  value: ArrayBuffer,
  limits: ContentPackByteLimits = {},
): Promise<CampaignDocument> {
  const text = await readLimitedText(value, {
    label: "campaign",
    maxEncodedBytes: limits.maxEncodedBytes ?? MAX_CAMPAIGN_ENCODED_BYTES,
    maxDecodedBytes: limits.maxDecodedBytes ?? MAX_CAMPAIGN_DECODED_BYTES,
  });
  const decoded: unknown = JSON.parse(text);
  assertCampaignShape(decoded);
  const validation = await validateCampaign(decoded);
  if (!validation.valid)
    throw new Error(`Invalid campaign: ${validation.errors.join("; ")}`);
  return decoded;
}

/**
 * The record IDs a campaign's restrictions resolve to against composed
 * `entities`, sorted ignoring case. ID rules match ignoring case and resolve
 * to the composed record's spelling; an ID with no record is kept as listed
 * (it still round-trips to legacy `Restricted`). A type rule restricts every
 * record of that type (ignoring case) whose ID the campaign's house rules do
 * not supply, an overlay record replacing a stock ID included.
 */
export function resolveCampaignRestrictions(
  entities: readonly Pick<ContentEntity, "id" | "type">[],
  campaign: Pick<CampaignDocument, "restrictions" | "houseRules">,
): string[] {
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity.id]),
  );
  const campaignIds = new Set(
    campaign.houseRules.entities.map(({ id }) => id.toLocaleLowerCase()),
  );
  const restrictedTypes = new Set(
    campaign.restrictions.types.map(({ type }) => type.toLocaleLowerCase()),
  );
  const restricted = new Map<string, string>();
  for (const id of campaign.restrictions.ids) {
    const key = id.toLocaleLowerCase();
    restricted.set(key, byId.get(key) ?? id);
  }
  if (restrictedTypes.size > 0)
    for (const entity of entities) {
      const key = entity.id.toLocaleLowerCase();
      if (
        restrictedTypes.has(entity.type.toLocaleLowerCase()) &&
        !campaignIds.has(key)
      )
        restricted.set(key, entity.id);
    }
  return [...restricted.values()].sort(compareIgnoringCase);
}

/**
 * Composes the base packs with the campaign's house rules on top
 * (`last-pack-wins-v1`) and records the campaign and its resolved
 * restrictions on the materialized pack. Type rules are resolved on every
 * composition, so records added to later base revisions are covered.
 */
export async function composeCampaignProfile(
  basePacks: readonly ContentPack[],
  campaign: CampaignDocument,
  options: BuildContentPackOptions,
): Promise<ComposedContentProfile> {
  if (basePacks.some((pack) => pack.campaign !== undefined))
    throw new Error("A campaign profile cannot layer another campaign profile");
  return composeContentPacks(
    [...basePacks, campaign.houseRules],
    options,
    (entities): ContentPackCampaign => ({
      campaignId: campaign.campaignId,
      revision: campaign.revision,
      contentDigest: campaign.contentDigest,
      restrictedIds: resolveCampaignRestrictions(entities, campaign),
    }),
  );
}
