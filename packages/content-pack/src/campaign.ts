// Campaign documents (D116): a DM's house-rule overlay and restrictions as a
// portable, digest-verified document, and its composition over the server's
// packs. Wire format: docs/content-pack-format.md, "Campaign documents".

import type {
  ContentDiagnostic,
  ContentEntity,
  ParsedContentSource,
  RuleStatement,
} from "@4ecb/content-domain";
import {
  getAttribute,
  MAX_ENTITY_ALIAS_LENGTH,
  normalizeDisplayText,
  renamedEntity,
  withAlternateName,
} from "@4ecb/content-domain";

import {
  assertContentPackShape,
  buildContentPack,
  composeContentPacks,
  contentPackIdentityErrors,
  validateContentPack,
  type BuildContentPackOptions,
  type ComposedCampaignLayer,
  type ComposedContentProfile,
  type ContentPack,
  type ContentPackByteLimits,
  type ContentPackCampaign,
  type ContentPackValidation,
} from "./index";
import { readLimitedText, sha256 } from "./internal";

export const CAMPAIGN_FORMAT = "4ecb-campaign";
/**
 * The version `buildCampaign` writes. Version 2 added field `patches`;
 * version 3 added rule patches and the `prerequisites` field; version 4
 * added alternate-name patches.
 */
export const CAMPAIGN_VERSION = 4;
/**
 * Versions `decodeCampaign` reads; a version-1 document has no patches, a
 * version-2 document only field patches and a version-3 document no
 * alternate-name patches.
 */
export const CAMPAIGN_VERSIONS = [1, 2, 3, 4] as const;
export type CampaignVersion = (typeof CAMPAIGN_VERSIONS)[number];
export const MAX_CAMPAIGN_ENCODED_BYTES = 16 * 1024 * 1024;
export const MAX_CAMPAIGN_DECODED_BYTES = 16 * 1024 * 1024;
export const MAX_CAMPAIGN_ID_LENGTH = 32;
export const MAX_CAMPAIGN_REVISION = 999_999;
export const MAX_CAMPAIGN_HOUSE_RULE_RECORDS = 10_000;
export const MAX_CAMPAIGN_RESTRICTED_IDS = 50_000;
export const MAX_CAMPAIGN_TYPE_RULES = 32;
export const MAX_CAMPAIGN_LEGACY_XML_BYTES = 8 * 1024 * 1024;
export const MAX_CAMPAIGN_PATCHES = 10_000;
/** Longest patch field name (a specific's name). */
export const MAX_CAMPAIGN_PATCH_FIELD_LENGTH = 120;
/** Longest `expect` or `value` of a patch. */
export const MAX_CAMPAIGN_PATCH_VALUE_LENGTH = 4_000;
/** The patch field naming the record's name. */
export const CAMPAIGN_PATCH_NAME_FIELD = "name";
/**
 * The patch field naming the record's prerequisites (`<Prereqs>`; an empty
 * `value` removes them, an empty `expect` means it has none). Version 3;
 * any other field names a specific.
 */
export const CAMPAIGN_PATCH_PREREQUISITES_FIELD = "prerequisites";
/** Most rule elements one rule patch matches (`count`). */
export const MAX_CAMPAIGN_RULE_MATCH_COUNT = 1_000;
/** Most rule elements one `add` appends. */
export const MAX_CAMPAIGN_RULE_ADD = 100;
/** Most attributes in one match, `set` or rule element. */
export const MAX_CAMPAIGN_RULE_ATTRIBUTES = 64;
/** Longest rule element or attribute name. */
export const MAX_CAMPAIGN_RULE_NAME_LENGTH = 120;

/**
 * One field of a stock record changed in place (D116 amendment), so the
 * record's other fields keep following the server. Applied only while the
 * composed record's current value is still `expect`.
 */
export interface CampaignPatch {
  /** The target record's ID (matched ignoring case). */
  readonly id: string;
  /** "name", or a specific's name (matched ignoring case), e.g. "Languages". */
  readonly field: string;
  /** The stock value the author saw. */
  readonly expect: string;
  /** The campaign's value. */
  readonly value: string;
}

/**
 * A rule element a rule patch writes, `<name attributes…>text</name>`: one
 * `RuleStatement` (attributes in order).
 */
export interface CampaignRuleElement {
  /** The element name, e.g. "grant" or "select". */
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  /** Inner text, e.g. a select's prompt. */
  readonly text?: string;
}

/**
 * Which of a record's rule elements an operation acts on: elements named
 * `name` carrying every listed attribute with that value (names and values
 * matched ignoring case; unlisted attributes are not compared).
 */
export interface CampaignRuleMatch {
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

/**
 * One operation on a record's rule elements: exactly one of `set`,
 * `replaceId`, `replaceWith`, `remove` and `add`. Every operation but `add`
 * has a `match`, its drift guard: it applies only when exactly `count`
 * (default 1) elements match. `add` has no match and applies only while
 * none of its elements is on the record already (and, with `before` or
 * `after`, while exactly one element matches that anchor).
 */
export interface CampaignRuleOperation {
  readonly match?: CampaignRuleMatch;
  readonly count?: number;
  /** Sets these attributes on each matched element (added when absent). */
  readonly set?: Readonly<Record<string, string>>;
  /**
   * Replaces an ID (or other list entry: a whole token, bounded by anything
   * but letters, digits, `_` and `-`) in every attribute value of each
   * matched element; an element matches only when a value contains it.
   */
  readonly replaceId?: { readonly from: string; readonly to: string };
  /** Replaces each matched element in place. */
  readonly replaceWith?: CampaignRuleElement;
  /** Removes each matched element. */
  readonly remove?: true;
  /**
   * Inserts these elements: after the record's last rule, or before or
   * after the one element its anchor matches. Rule positions are part of a
   * character's saved state (a grant's or select's occurrence is keyed by
   * its ordinal), so a patch that must reproduce a copy places them.
   */
  readonly add?: readonly CampaignRuleElement[];
  /** `add` only: insert before the element this matches (exactly one). */
  readonly before?: CampaignRuleMatch;
  /** `add` only: insert after the element this matches (exactly one). */
  readonly after?: CampaignRuleMatch;
}

/**
 * A change to a stock record's rule elements (D116 amendment), so the
 * record's other fields and rules keep following the server. Version 3.
 */
export interface CampaignRulePatch {
  /** The target record's ID (matched ignoring case). */
  readonly id: string;
  readonly rule: CampaignRuleOperation;
}

/**
 * A setting's second name for a stock record, which keeps its own name
 * (D116 amendment): Pathfinder's Shadar-kai is "Shadar-kai (Fetchling)" in
 * the builder, and its feats keep naming shadar-kai. Applied only when the
 * record exists. Version 4.
 */
export interface CampaignAlternateNamePatch {
  /** The target record's ID (matched ignoring case). */
  readonly id: string;
  readonly alternateName: string;
}

/**
 * One entry of a campaign's `patches`: a field patch, an alternate-name
 * patch or a rule patch.
 */
export type CampaignPatchEntry =
  CampaignPatch | CampaignAlternateNamePatch | CampaignRulePatch;

export function isCampaignRulePatch(
  patch: CampaignPatchEntry,
): patch is CampaignRulePatch {
  return "rule" in patch;
}

export function isCampaignAlternateNamePatch(
  patch: CampaignPatchEntry,
): patch is CampaignAlternateNamePatch {
  return "alternateName" in patch;
}

function isCampaignFieldPatch(
  patch: CampaignPatchEntry,
): patch is CampaignPatch {
  return !isCampaignRulePatch(patch) && !isCampaignAlternateNamePatch(patch);
}

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
  readonly version: CampaignVersion;
  readonly campaignId: string;
  readonly name: string;
  /** Orders a campaign's revisions; the DM bumps it on every change. */
  readonly revision: number;
  readonly restrictions: CampaignRestrictions;
  /**
   * Field and rule patches on base records, sorted by ID ignoring case; a
   * record's field patches (by field) come before its rule patches (in the
   * order authored, which is the order they apply in). Always present from
   * version 2 (field patches only); absent in version 1 (none). Read it
   * through `campaignPatches` and `campaignRulePatches`.
   */
  readonly patches?: readonly CampaignPatchEntry[];
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
  readonly patches?: readonly CampaignPatchEntry[];
}

/** A campaign's field patches; none for a version-1 document. */
export function campaignPatches(
  campaign: Pick<CampaignDocument, "patches">,
): readonly CampaignPatch[] {
  return (campaign.patches ?? []).filter(isCampaignFieldPatch);
}

/** A campaign's alternate-name patches; none before version 4. */
export function campaignAlternateNamePatches(
  campaign: Pick<CampaignDocument, "patches">,
): readonly CampaignAlternateNamePatch[] {
  return (campaign.patches ?? []).filter(isCampaignAlternateNamePatch);
}

/** A campaign's rule patches, in the order they apply. */
export function campaignRulePatches(
  campaign: Pick<CampaignDocument, "patches">,
): readonly CampaignRulePatch[] {
  return (campaign.patches ?? []).filter(isCampaignRulePatch);
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
    // Version 1 has no patches and versions 2 and 3 no alternate names,
    // each serialized as before, so their documents keep their digests.
    ...(campaign.version === 1
      ? {}
      : { patches: (campaign.patches ?? []).map(canonicalPatch) }),
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

function isNameField(field: string): boolean {
  return field.trim().toLocaleLowerCase() === CAMPAIGN_PATCH_NAME_FIELD;
}

function isPrerequisitesField(field: string): boolean {
  return (
    field.trim().toLocaleLowerCase() === CAMPAIGN_PATCH_PREREQUISITES_FIELD
  );
}

function canonicalAttributes(
  attributes: Readonly<Record<string, string>>,
): Record<string, string> {
  // fromEntries defines own properties, so no key reaches the prototype.
  return Object.fromEntries(Object.entries(attributes));
}

function canonicalElement(element: CampaignRuleElement): CampaignRuleElement {
  return {
    name: element.name,
    attributes: canonicalAttributes(element.attributes),
    ...(element.text === undefined ? {} : { text: element.text }),
  };
}

function canonicalMatch(match: CampaignRuleMatch): CampaignRuleMatch {
  return {
    name: match.name,
    ...(match.attributes === undefined
      ? {}
      : { attributes: canonicalAttributes(match.attributes) }),
  };
}

/** A rule operation with its keys in a fixed order and `count: 1` dropped. */
function canonicalRuleOperation(
  operation: CampaignRuleOperation,
): CampaignRuleOperation {
  const { match, count, set, replaceId, replaceWith, remove, add } = operation;
  const { before, after } = operation;
  return {
    ...(match === undefined ? {} : { match: canonicalMatch(match) }),
    ...(count === undefined || count === 1 ? {} : { count }),
    ...(set === undefined ? {} : { set: canonicalAttributes(set) }),
    ...(replaceId === undefined
      ? {}
      : { replaceId: { from: replaceId.from, to: replaceId.to } }),
    ...(replaceWith === undefined
      ? {}
      : { replaceWith: canonicalElement(replaceWith) }),
    ...(remove === undefined ? {} : { remove }),
    ...(add === undefined ? {} : { add: add.map(canonicalElement) }),
    ...(before === undefined ? {} : { before: canonicalMatch(before) }),
    ...(after === undefined ? {} : { after: canonicalMatch(after) }),
  };
}

function canonicalPatch(patch: CampaignPatchEntry): CampaignPatchEntry {
  if (isCampaignRulePatch(patch))
    return { id: patch.id, rule: canonicalRuleOperation(patch.rule) };
  if (isCampaignAlternateNamePatch(patch))
    return { id: patch.id, alternateName: patch.alternateName };
  const { id, field, expect, value } = patch;
  return { id, field, expect, value };
}

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isRuleElementShape(value: unknown): value is CampaignRuleElement {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) =>
      ["name", "attributes", "text"].includes(key),
    ) &&
    typeof value.name === "string" &&
    isStringMap(value.attributes) &&
    (value.text === undefined || typeof value.text === "string")
  );
}

const RULE_OPERATION_KEYS = new Set([
  "match",
  "count",
  "set",
  "replaceId",
  "replaceWith",
  "remove",
  "add",
  "before",
  "after",
]);

function isMatchShape(value: unknown): value is CampaignRuleMatch {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "name" || key === "attributes") &&
    typeof value.name === "string" &&
    (value.attributes === undefined || isStringMap(value.attributes))
  );
}

/**
 * The type errors of a rule operation read from JSON (unknown keys, wrong
 * types); `buildCampaign` and validation check its meaning.
 */
export function campaignRuleOperationShapeErrors(value: unknown): string[] {
  if (!isRecord(value)) return ["must be an object"];
  const errors: string[] = [];
  const unknown = Object.keys(value).filter(
    (key) => !RULE_OPERATION_KEYS.has(key),
  );
  if (unknown.length > 0)
    errors.push(`has unknown keys: ${unknown.join(", ")}`);
  const { match, count, set, replaceId, replaceWith, remove, add } = value;
  for (const [key, anchor] of [
    ["match", match],
    ["before", value.before],
    ["after", value.after],
  ] as const)
    if (anchor !== undefined && !isMatchShape(anchor))
      errors.push(`${key} must be {name, attributes?: {name: value}}`);
  if (count !== undefined && typeof count !== "number")
    errors.push("count must be a number");
  if (set !== undefined && !isStringMap(set))
    errors.push("set must map attribute names to values");
  if (
    replaceId !== undefined &&
    !(
      isRecord(replaceId) &&
      Object.keys(replaceId).every((key) => key === "from" || key === "to") &&
      typeof replaceId.from === "string" &&
      typeof replaceId.to === "string"
    )
  )
    errors.push("replaceId must be {from, to}");
  if (replaceWith !== undefined && !isRuleElementShape(replaceWith))
    errors.push("replaceWith must be {name, attributes: {…}, text?}");
  if (remove !== undefined && remove !== true)
    errors.push("remove must be true");
  if (
    add !== undefined &&
    !(
      Array.isArray(add) &&
      add.length <= MAX_CAMPAIGN_RULE_ADD &&
      add.every(isRuleElementShape)
    )
  )
    errors.push(
      `add must be a list of at most ${MAX_CAMPAIGN_RULE_ADD} {name, attributes: {…}, text?} elements`,
    );
  return errors;
}

function isPatchEntryShape(value: unknown, version: number): boolean {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  if (version >= 3 && "rule" in value)
    return (
      Object.keys(value).length === 2 &&
      campaignRuleOperationShapeErrors(value.rule).length === 0
    );
  if (version >= 4 && "alternateName" in value)
    return (
      Object.keys(value).length === 2 && typeof value.alternateName === "string"
    );
  return (
    typeof value.field === "string" &&
    typeof value.expect === "string" &&
    typeof value.value === "string"
  );
}

const RULE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

function ruleNameErrors(name: string, what: string): string[] {
  return name.length <= MAX_CAMPAIGN_RULE_NAME_LENGTH &&
    RULE_NAME_PATTERN.test(name)
    ? []
    : [
        `${what} ${JSON.stringify(name)} must be 1-${MAX_CAMPAIGN_RULE_NAME_LENGTH} characters: a letter, then letters, digits, "_", ".", ":" or "-"`,
      ];
}

function ruleTextErrors(text: string, what: string): string[] {
  return text.length <= MAX_CAMPAIGN_PATCH_VALUE_LENGTH &&
    !hasControlCharactersInText(text)
    ? []
    : [
        `${what} must be at most ${MAX_CAMPAIGN_PATCH_VALUE_LENGTH.toLocaleString()} characters without control characters`,
      ];
}

function ruleAttributeErrors(
  attributes: Readonly<Record<string, string>>,
  what: string,
): string[] {
  const entries = Object.entries(attributes);
  const errors: string[] = [];
  if (entries.length > MAX_CAMPAIGN_RULE_ATTRIBUTES)
    errors.push(
      `${what} has more than ${MAX_CAMPAIGN_RULE_ATTRIBUTES} attributes`,
    );
  const seen = new Set<string>();
  for (const [name, value] of entries) {
    errors.push(...ruleNameErrors(name, `${what} attribute`));
    errors.push(...ruleTextErrors(value, `${what} attribute ${name}`));
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) errors.push(`${what} lists attribute ${name} twice`);
    seen.add(key);
  }
  return errors;
}

function ruleElementErrors(
  element: CampaignRuleElement,
  what: string,
): string[] {
  return [
    ...ruleNameErrors(element.name, `${what} element`),
    ...ruleAttributeErrors(element.attributes, what),
    ...(element.text === undefined
      ? []
      : ruleTextErrors(element.text, `${what} text`)),
  ];
}

const RULE_ACTIONS = [
  "set",
  "replaceId",
  "replaceWith",
  "remove",
  "add",
] as const;

/** A rule operation's meaning errors, each prefixed with `label`. */
function ruleOperationErrors(
  operation: CampaignRuleOperation,
  label: string,
): string[] {
  const errors: string[] = [];
  const actions = RULE_ACTIONS.filter(
    (action) => operation[action] !== undefined,
  );
  if (actions.length !== 1)
    return [
      `${label} must have exactly one of ${RULE_ACTIONS.join(", ")}${actions.length > 1 ? `, not ${actions.join(" and ")}` : ""}`,
    ];
  const { match, count, set, replaceId, replaceWith, add } = operation;
  const { before, after } = operation;
  if (add !== undefined) {
    if (match !== undefined || count !== undefined)
      errors.push(
        `${label}: add takes no match or count (it applies while its elements are absent)`,
      );
    if (add.length === 0) errors.push(`${label}: add lists no elements`);
    add.forEach((element, index) =>
      errors.push(...ruleElementErrors(element, `${label} add[${index}]`)),
    );
    if (before !== undefined && after !== undefined)
      errors.push(`${label}: add takes before or after, not both`);
    for (const [key, anchor] of [
      ["before", before],
      ["after", after],
    ] as const)
      if (anchor !== undefined)
        errors.push(
          ...ruleNameErrors(anchor.name, `${label} ${key} element`),
          ...ruleAttributeErrors(anchor.attributes ?? {}, `${label} ${key}`),
        );
    return errors;
  }
  if (before !== undefined || after !== undefined)
    errors.push(`${label}: only add takes before or after`);
  if (match === undefined)
    return [`${label}: ${actions[0]} needs a match (its drift guard)`];
  errors.push(...ruleNameErrors(match.name, `${label} match element`));
  errors.push(...ruleAttributeErrors(match.attributes ?? {}, `${label} match`));
  if (
    count !== undefined &&
    (!Number.isInteger(count) ||
      count < 1 ||
      count > MAX_CAMPAIGN_RULE_MATCH_COUNT)
  )
    errors.push(
      `${label}: count must be an integer from 1 to ${MAX_CAMPAIGN_RULE_MATCH_COUNT.toLocaleString()}`,
    );
  if (set !== undefined) {
    const entries = Object.entries(set);
    if (entries.length === 0) errors.push(`${label}: set lists no attributes`);
    errors.push(...ruleAttributeErrors(set, `${label} set`));
    if (
      entries.length > 0 &&
      entries.every(
        ([name, value]) => getMapValue(match.attributes ?? {}, name) === value,
      )
    )
      errors.push(`${label} changes nothing`);
  }
  if (replaceId !== undefined) {
    const { from, to } = replaceId;
    if (from === "" || from !== from.trim() || /[\s|&,!()]/.test(from))
      errors.push(
        `${label}: replaceId.from must be one ID or list entry (no spaces, "|", "&", ",", "!" or parentheses)`,
      );
    errors.push(...ruleTextErrors(from, `${label} replaceId.from`));
    errors.push(...ruleTextErrors(to, `${label} replaceId.to`));
    if (to.trim() === "") errors.push(`${label}: replaceId.to is empty`);
    if (from === to) errors.push(`${label} changes nothing`);
  }
  if (replaceWith !== undefined)
    errors.push(...ruleElementErrors(replaceWith, `${label} replaceWith`));
  return errors;
}

function getMapValue(
  map: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const folded = name.toLocaleLowerCase();
  return Object.entries(map).find(
    ([key]) => key.toLocaleLowerCase() === folded,
  )?.[1];
}

function patchKey(patch: Pick<CampaignPatch, "id" | "field">): string {
  return `${patch.id.toLocaleLowerCase()}\u0000${patch.field.trim().toLocaleLowerCase()}`;
}

function hasControlCharactersInText(value: string): boolean {
  return /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value);
}

/**
 * Patch count, identity and length errors, and patches on a record the
 * campaign's own house rules supply (edit that record instead).
 */
function patchErrors(
  patches: readonly CampaignPatchEntry[],
  houseRules: readonly Pick<ContentEntity, "id">[],
): string[] {
  if (patches.length > MAX_CAMPAIGN_PATCHES)
    return [
      `A campaign has at most ${MAX_CAMPAIGN_PATCHES.toLocaleString()} patches`,
    ];
  const errors: string[] = [];
  const overlay = new Set(houseRules.map(({ id }) => id.toLocaleLowerCase()));
  const seen = new Set<string>();
  for (const patch of patches) {
    const { id } = patch;
    if (id.length === 0 || id !== id.trim() || hasControlCharacters(id))
      errors.push(`Patch ID ${JSON.stringify(id)} is not a record ID`);
    if (isCampaignRulePatch(patch)) {
      const label = `Rule patch ${id}`;
      errors.push(...ruleOperationErrors(patch.rule, label));
      if (overlay.has(id.toLocaleLowerCase()))
        errors.push(
          `${label}: ${id} is one of the campaign's house rules; edit the record instead`,
        );
      continue;
    }
    if (isCampaignAlternateNamePatch(patch)) {
      const label = `Alternate name patch ${id}`;
      const { alternateName } = patch;
      if (
        alternateName.length === 0 ||
        alternateName.length > MAX_ENTITY_ALIAS_LENGTH ||
        alternateName !== alternateName.trim() ||
        hasControlCharacters(alternateName)
      )
        errors.push(
          `${label}: alternateName must be 1-${MAX_ENTITY_ALIAS_LENGTH} trimmed characters without control characters`,
        );
      if (overlay.has(id.toLocaleLowerCase()))
        errors.push(
          `${label}: ${id} is one of the campaign's house rules; give the record the name there instead`,
        );
      const key = `${id.toLocaleLowerCase()}\u0000\u0000alternate`;
      if (seen.has(key)) errors.push(`${label} is listed twice`);
      seen.add(key);
      continue;
    }
    const { field, expect, value } = patch;
    const label = `Patch ${id} ${field}`;
    if (
      field.length === 0 ||
      field.length > MAX_CAMPAIGN_PATCH_FIELD_LENGTH ||
      field !== field.trim() ||
      hasControlCharacters(field)
    )
      errors.push(
        `${label}: field must be "name", "prerequisites" or a specific's name of 1-${MAX_CAMPAIGN_PATCH_FIELD_LENGTH} trimmed characters`,
      );
    else if (field.startsWith("_"))
      errors.push(
        `${label}: "_" fields are built from the content and cannot be patched`,
      );
    for (const [name, text] of [
      ["expect", expect],
      ["value", value],
    ] as const)
      if (
        text.length > MAX_CAMPAIGN_PATCH_VALUE_LENGTH ||
        hasControlCharactersInText(text)
      )
        errors.push(
          `${label}: ${name} must be at most ${MAX_CAMPAIGN_PATCH_VALUE_LENGTH.toLocaleString()} characters without control characters`,
        );
    if (expect === value) errors.push(`${label} changes nothing`);
    if (isNameField(field) && value.trim() === "")
      errors.push(`${label}: a record name cannot be empty`);
    if (overlay.has(id.toLocaleLowerCase()))
      errors.push(
        `${label}: ${id} is one of the campaign's house rules; edit the record instead`,
      );
    const key = patchKey(patch);
    if (seen.has(key)) errors.push(`${label} is listed twice`);
    seen.add(key);
  }
  return errors;
}

/** What a version allows in `patches`, beyond `patchErrors`. */
function patchVersionErrors(
  version: number,
  patches: readonly CampaignPatchEntry[] | undefined,
): string[] {
  if (version === 1)
    return patches === undefined
      ? []
      : ["A version 1 campaign cannot carry patches"];
  const entries = patches ?? [];
  if (version <= 3 && entries.some(isCampaignAlternateNamePatch))
    return [`A version ${version} campaign cannot carry alternate names`];
  if (version === 2) {
    if (entries.some(isCampaignRulePatch))
      return ["A version 2 campaign cannot carry rule patches"];
    if (
      entries.some(
        (patch) =>
          isCampaignFieldPatch(patch) && isPrerequisitesField(patch.field),
      )
    )
      return ["A version 2 campaign cannot patch prerequisites"];
  }
  return [];
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
 * XML they were parsed from. Restricted IDs, type rules and patches are put
 * in a canonical order (sorted, ignoring case), so the digest does not
 * depend on how the DM listed them. A patch on a record the house rules
 * supply is an error: the DM edits that record instead.
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
  const patches = sortedPatches(manifest.patches ?? []);
  const errors = [
    ...campaignManifestErrors({ ...manifest, restrictions }),
    ...legacyXmlErrors(legacyHouseRulesXml),
    ...houseRuleCountErrors(houseRules.entities.length),
    ...patchErrors(patches, houseRules.entities),
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
    patches,
    houseRules: pack,
    legacyHouseRulesXml,
  };
  return {
    ...document,
    contentDigest: await sha256(campaignDigestInput(document)),
  };
}

/**
 * Patches in canonical order and form: by ID ignoring case; a record's
 * field patches by field, then its alternate name, then its rule patches in
 * the order authored (the sort is stable), since each rule patch sees the
 * ones before it.
 */
function sortedPatches(
  patches: readonly CampaignPatchEntry[],
): CampaignPatchEntry[] {
  const rank = (patch: CampaignPatchEntry) =>
    isCampaignRulePatch(patch)
      ? 2
      : isCampaignAlternateNamePatch(patch)
        ? 1
        : 0;
  return patches.map(canonicalPatch).sort((left, right) => {
    const byId = compareIgnoringCase(left.id, right.id);
    if (byId !== 0) return byId;
    const byKind = rank(left) - rank(right);
    if (byKind !== 0) return byKind;
    return isCampaignFieldPatch(left) && isCampaignFieldPatch(right)
      ? compareIgnoringCase(left.field, right.field)
      : 0;
  });
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
  if (!(CAMPAIGN_VERSIONS as readonly unknown[]).includes(value.version))
    throw new Error(`Unsupported campaign version: ${String(value.version)}`);
  if (value.version === 1) {
    if (value.patches !== undefined)
      throw new Error("A version 1 campaign cannot carry patches");
  } else {
    if (!Array.isArray(value.patches))
      throw new Error("Campaign patches are missing");
    // Count before contents, so an oversized list is refused unread.
    if (value.patches.length > MAX_CAMPAIGN_PATCHES)
      throw new Error(
        `A campaign has at most ${MAX_CAMPAIGN_PATCHES.toLocaleString()} patches`,
      );
    const version = value.version as number;
    if (!value.patches.every((patch) => isPatchEntryShape(patch, version)))
      throw new Error("Campaign patches are invalid");
  }
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
    ...patchVersionErrors(campaign.version, campaign.patches),
    ...patchErrors(campaign.patches ?? [], campaign.houseRules.entities),
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

/** What a patch finds on the records it is applied to. */
export type CampaignPatchOutcome =
  | { readonly patch: CampaignPatch; readonly status: "applies" }
  | { readonly patch: CampaignPatch; readonly status: "target-missing" }
  /** The record has no specific of that name. */
  | { readonly patch: CampaignPatch; readonly status: "field-missing" }
  /** The record has several specifics of that name. */
  | {
      readonly patch: CampaignPatch;
      readonly status: "field-ambiguous";
      readonly count: number;
    }
  /** The field's current value is not the one the author saw. */
  | {
      readonly patch: CampaignPatch;
      readonly status: "stock-differs";
      readonly current: string;
    };

function patchedFieldValue(
  entity: ContentEntity,
  field: string,
): { readonly value: string } | { readonly count: number } {
  if (isNameField(field)) return { value: entity.name };
  if (isPrerequisitesField(field)) return { value: entity.prerequisites ?? "" };
  const folded = field.trim().toLocaleLowerCase();
  const matches = entity.specifics.filter(
    (specific) => specific.name.trim().toLocaleLowerCase() === folded,
  );
  const [only] = matches;
  return matches.length === 1 && only !== undefined
    ? { value: only.value }
    : { count: matches.length };
}

/**
 * Each patch's outcome against `entities` (IDs matched ignoring case): it
 * applies only when the record exists, the field is there once, and its
 * value is exactly the patch's `expect`.
 */
export function campaignPatchOutcomes(
  entities: readonly ContentEntity[],
  patches: readonly CampaignPatch[],
): CampaignPatchOutcome[] {
  if (patches.length === 0) return [];
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  return patches.map((patch): CampaignPatchOutcome => {
    const entity = byId.get(patch.id.toLocaleLowerCase());
    if (entity === undefined) return { patch, status: "target-missing" };
    const found = patchedFieldValue(entity, patch.field);
    if ("count" in found)
      return found.count === 0
        ? { patch, status: "field-missing" }
        : { patch, status: "field-ambiguous", count: found.count };
    return found.value === patch.expect
      ? { patch, status: "applies" }
      : { patch, status: "stock-differs", current: found.value };
  });
}

/** One line on a patch that does not apply, for diagnostics and reports. */
export function campaignPatchOutcomeMessage(
  outcome: CampaignPatchOutcome,
): string {
  const { id, field, expect } = outcome.patch;
  const label = `Patch ${id} ${field}`;
  switch (outcome.status) {
    case "applies":
      return `${label} applies`;
    case "target-missing":
      return `${label} not applied: no record ${id}`;
    case "field-missing":
      return `${label} not applied: ${id} has no ${field} field`;
    case "field-ambiguous":
      return `${label} not applied: ${id} has ${outcome.count} ${field} fields`;
    case "stock-differs":
      return `${label} not applied: the content has ${JSON.stringify(outcome.current)}, the patch expects ${JSON.stringify(expect)}`;
  }
}

/**
 * Applies the patches that apply to `entities` and returns a warning
 * diagnostic (`campaign.patch-not-applied`) for each one that does not: the
 * record keeps the content's value, and composition never fails over it.
 */
export function applyCampaignPatches(
  entities: readonly ContentEntity[],
  patches: readonly CampaignPatch[],
): {
  readonly entities: readonly ContentEntity[];
  readonly diagnostics: readonly ContentDiagnostic[];
} {
  const outcomes = campaignPatchOutcomes(entities, patches);
  if (outcomes.length === 0) return { entities, diagnostics: [] };
  const diagnostics: ContentDiagnostic[] = [];
  const applying = new Map<string, CampaignPatch[]>();
  for (const outcome of outcomes) {
    if (outcome.status !== "applies") {
      diagnostics.push({
        severity: "warning",
        code: "campaign.patch-not-applied",
        message: campaignPatchOutcomeMessage(outcome),
        entityId: outcome.patch.id,
      });
      continue;
    }
    const key = outcome.patch.id.toLocaleLowerCase();
    applying.set(key, [...(applying.get(key) ?? []), outcome.patch]);
  }
  return {
    entities: entities.map((entity) => {
      const own = applying.get(entity.id.toLocaleLowerCase());
      if (own === undefined) return entity;
      let patched = entity;
      for (const { field, value } of own) {
        if (isNameField(field)) {
          // The stock name stays an alias, so everything that names the
          // record by its old name still finds it (Deva → Aasimar).
          patched = renamedEntity(patched, value);
          continue;
        }
        if (isPrerequisitesField(field)) {
          // The stored `_Prerequisite IR` was parsed from the old text; a
          // composed campaign profile never keeps stored prerequisite IR
          // (composeContentPacks), so the engine parses the new one.
          const { prerequisites: _old, ...rest } = patched;
          void _old;
          patched = value === "" ? rest : { ...rest, prerequisites: value };
          continue;
        }
        const folded = field.trim().toLocaleLowerCase();
        patched = {
          ...patched,
          specifics: patched.specifics.map((specific) =>
            specific.name.trim().toLocaleLowerCase() === folded
              ? { ...specific, value }
              : specific,
          ),
        };
      }
      return patched;
    }),
    diagnostics,
  };
}

/** What an alternate-name patch finds on the records it is applied to. */
export type CampaignAlternateNameOutcome =
  | {
      readonly patch: CampaignAlternateNamePatch;
      readonly status: "applies";
    }
  | {
      readonly patch: CampaignAlternateNamePatch;
      readonly status: "target-missing";
    }
  /** The record's name or an alias already is the alternate name. */
  | {
      readonly patch: CampaignAlternateNamePatch;
      readonly status: "name-taken";
      readonly current: string;
    };

/**
 * Each alternate-name patch's outcome against `entities` (IDs matched
 * ignoring case): it applies when the record exists and none of its names
 * already is the alternate name.
 */
export function campaignAlternateNameOutcomes(
  entities: readonly ContentEntity[],
  patches: readonly CampaignAlternateNamePatch[],
): CampaignAlternateNameOutcome[] {
  if (patches.length === 0) return [];
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  return patches.map((patch): CampaignAlternateNameOutcome => {
    const entity = byId.get(patch.id.toLocaleLowerCase());
    if (entity === undefined) return { patch, status: "target-missing" };
    const folded = patch.alternateName.toLocaleLowerCase();
    const taken = [entity.name, ...(entity.aliases ?? [])].find(
      (name) => name.trim().toLocaleLowerCase() === folded,
    );
    return taken === undefined
      ? { patch, status: "applies" }
      : { patch, status: "name-taken", current: taken };
  });
}

/** One line on an alternate-name patch, for diagnostics and reports. */
export function campaignAlternateNameOutcomeMessage(
  outcome: CampaignAlternateNameOutcome,
): string {
  const { id, alternateName } = outcome.patch;
  const label = `Alternate name patch ${id} ${JSON.stringify(alternateName)}`;
  switch (outcome.status) {
    case "applies":
      return `${label} applies`;
    case "target-missing":
      return `${label} not applied: no record ${id}`;
    case "name-taken":
      return `${label} not applied: ${id} is already named ${JSON.stringify(outcome.current)}`;
  }
}

/**
 * Gives records their alternate names and returns a warning diagnostic
 * (`campaign.patch-not-applied`) for each patch that does not apply; the
 * record is left as it is, and composition never fails over it.
 */
export function applyCampaignAlternateNames(
  entities: readonly ContentEntity[],
  patches: readonly CampaignAlternateNamePatch[],
): {
  readonly entities: readonly ContentEntity[];
  readonly diagnostics: readonly ContentDiagnostic[];
} {
  const outcomes = campaignAlternateNameOutcomes(entities, patches);
  if (outcomes.length === 0) return { entities, diagnostics: [] };
  const diagnostics: ContentDiagnostic[] = [];
  const applying = new Map<string, string>();
  for (const outcome of outcomes)
    if (outcome.status === "applies")
      applying.set(
        outcome.patch.id.toLocaleLowerCase(),
        outcome.patch.alternateName,
      );
    else
      diagnostics.push({
        severity: "warning",
        code: "campaign.patch-not-applied",
        message: campaignAlternateNameOutcomeMessage(outcome),
        entityId: outcome.patch.id,
      });
  return {
    entities: entities.map((entity) => {
      const alternateName = applying.get(entity.id.toLocaleLowerCase());
      return alternateName === undefined
        ? entity
        : withAlternateName(entity, alternateName);
    }),
    diagnostics,
  };
}

/** What a rule patch finds on the record it is applied to. */
export type CampaignRulePatchStatus =
  | "applies"
  | "target-missing"
  /** No rule element matches (or no element matches an add's anchor). */
  | "no-match"
  /** More or fewer elements match than `count` (an anchor: than one). */
  | "ambiguous"
  /** `add`: an element it adds is on the record already. */
  | "present";

export interface CampaignRulePatchOutcome {
  readonly patch: CampaignRulePatch;
  readonly status: CampaignRulePatchStatus;
  /**
   * The rule elements the operation matched, as XML (for "present", those
   * already on the record, for an anchored add its anchor); the elements
   * it acts on when it applies.
   */
  readonly matched: readonly string[];
}

function xmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function elementXml(
  name: string,
  attributes: readonly (readonly [string, string])[],
  text = "",
): string {
  const open = [
    name,
    ...attributes.map(([key, value]) => `${key}="${xmlAttribute(value)}"`),
  ].join(" ");
  return text === "" ? `<${open} />` : `<${open}>${text}</${name}>`;
}

/** A rule element as XML, for reports and diagnostics. */
export function ruleStatementXml(statement: RuleStatement): string {
  return elementXml(
    statement.name,
    statement.attributes.map(({ name, value }) => [name, value] as const),
    statement.text,
  );
}

function ruleElementXml(element: CampaignRuleElement): string {
  return elementXml(
    element.name,
    Object.entries(element.attributes),
    element.text ?? "",
  );
}

function matchXml(match: CampaignRuleMatch): string {
  return elementXml(match.name, Object.entries(match.attributes ?? {}));
}

/** What a rule patch does, in a few words: "remove <grant … />". */
export function describeCampaignRuleOperation(
  operation: CampaignRuleOperation,
): string {
  const { match, count, set, replaceId, replaceWith, add } = operation;
  const target =
    match === undefined
      ? ""
      : `${count !== undefined && count !== 1 ? `${count} × ` : ""}${matchXml(match)}`;
  if (set !== undefined)
    return `set ${Object.entries(set)
      .map(([key, value]) => `${key}="${value}"`)
      .join(" ")} on ${target}`;
  if (replaceId !== undefined)
    return `replace ${replaceId.from} with ${replaceId.to} in ${target}`;
  if (replaceWith !== undefined)
    return `replace ${target} with ${ruleElementXml(replaceWith)}`;
  if (add !== undefined) {
    const { before, after } = operation;
    const place =
      before !== undefined
        ? ` before ${matchXml(before)}`
        : after !== undefined
          ? ` after ${matchXml(after)}`
          : "";
    return `add ${add.length > 3 ? `${add.length} rule elements` : add.map(ruleElementXml).join(", ")}${place}`;
  }
  return `remove ${target}`;
}

function sameText(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function matchesRule(
  statement: RuleStatement,
  match: CampaignRuleMatch,
): boolean {
  if (!sameText(statement.name, match.name)) return false;
  return Object.entries(match.attributes ?? {}).every(([name, value]) => {
    const actual = getAttribute(statement.attributes, name);
    return actual !== undefined && sameText(actual, value);
  });
}

function tokenPattern(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "giu");
}

function sameElement(
  statement: RuleStatement,
  element: CampaignRuleElement,
): boolean {
  const attributes = Object.entries(element.attributes);
  return (
    sameText(statement.name, element.name) &&
    statement.attributes.length === attributes.length &&
    attributes.every(([name, value]) => {
      const actual = getAttribute(statement.attributes, name);
      return actual !== undefined && sameText(actual, value);
    })
  );
}

function ruleStatement(
  element: CampaignRuleElement,
  ordinal: number,
): RuleStatement {
  const text = element.text ?? "";
  return {
    name: element.name,
    attributes: Object.entries(element.attributes).map(([name, value]) => ({
      name,
      value,
    })),
    text: normalizeDisplayText(text),
    children: text === "" ? [] : [{ kind: "text", value: text }],
    ordinal,
  };
}

function withAttributes(
  statement: RuleStatement,
  set: Readonly<Record<string, string>>,
): RuleStatement {
  let attributes = [...statement.attributes];
  for (const [name, value] of Object.entries(set)) {
    const index = attributes.findIndex((attribute) =>
      sameText(attribute.name, name),
    );
    if (index < 0) attributes = [...attributes, { name, value }];
    else
      attributes = attributes.map((attribute, position) =>
        position === index ? { ...attribute, value } : attribute,
      );
  }
  return { ...statement, attributes };
}

/**
 * One rule operation on a record's rules: its outcome, and the rules after
 * it when it applies (ordinals renumbered, as the parser numbers them).
 */
function applyRuleOperation(
  rules: readonly RuleStatement[],
  operation: CampaignRuleOperation,
): {
  readonly status: Exclude<CampaignRulePatchStatus, "target-missing">;
  readonly matched: readonly RuleStatement[];
  readonly rules?: readonly RuleStatement[];
} {
  const { add, before, after } = operation;
  if (add !== undefined) {
    const present = rules.filter((statement) =>
      add.some((element) => sameElement(statement, element)),
    );
    if (present.length > 0) return { status: "present", matched: present };
    const anchor = before ?? after;
    const anchors =
      anchor === undefined
        ? []
        : rules.filter((statement) => matchesRule(statement, anchor));
    if (anchor !== undefined && anchors.length !== 1)
      return {
        status: anchors.length === 0 ? "no-match" : "ambiguous",
        matched: anchors,
      };
    const [only] = anchors;
    const at =
      only === undefined
        ? rules.length
        : rules.indexOf(only) + (after === undefined ? 0 : 1);
    const added = add.map((element) => ruleStatement(element, 0));
    return {
      status: "applies",
      matched: anchors,
      rules: renumbered([...rules.slice(0, at), ...added, ...rules.slice(at)]),
    };
  }
  const { match, count = 1, set, replaceId, replaceWith } = operation;
  if (match === undefined) return { status: "no-match", matched: [] };
  const pattern =
    replaceId === undefined ? undefined : tokenPattern(replaceId.from);
  const selected = new Set(
    rules.filter(
      (statement) =>
        matchesRule(statement, match) &&
        (pattern === undefined ||
          statement.attributes.some(({ value }) => {
            pattern.lastIndex = 0;
            return pattern.test(value);
          })),
    ),
  );
  const matched = [...selected];
  if (matched.length === 0) return { status: "no-match", matched };
  if (matched.length !== count) return { status: "ambiguous", matched };
  const next = rules.flatMap((statement): RuleStatement[] => {
    if (!selected.has(statement)) return [statement];
    if (set !== undefined) return [withAttributes(statement, set)];
    if (replaceId !== undefined && pattern !== undefined)
      return [
        {
          ...statement,
          attributes: statement.attributes.map((attribute) => ({
            ...attribute,
            value: attribute.value.replace(pattern, () => replaceId.to),
          })),
        },
      ];
    if (replaceWith !== undefined)
      return [ruleStatement(replaceWith, statement.ordinal)];
    return []; // remove
  });
  return { status: "applies", matched, rules: renumbered(next) };
}

/** Rule ordinals are positions, as the parser numbers them. */
function renumbered(rules: readonly RuleStatement[]): RuleStatement[] {
  return rules.map((statement, ordinal) =>
    statement.ordinal === ordinal ? statement : { ...statement, ordinal },
  );
}

/**
 * Applies rule patches to `entities` in order (IDs matched ignoring case;
 * each patch sees the record as the patches before it left it): every
 * outcome, and the patched records.
 */
export function runCampaignRulePatches(
  entities: readonly ContentEntity[],
  patches: readonly CampaignRulePatch[],
): {
  readonly entities: readonly ContentEntity[];
  readonly outcomes: readonly CampaignRulePatchOutcome[];
} {
  if (patches.length === 0) return { entities, outcomes: [] };
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const patched = new Map<string, ContentEntity>();
  const outcomes = patches.map((patch): CampaignRulePatchOutcome => {
    const key = patch.id.toLocaleLowerCase();
    const entity = patched.get(key) ?? byId.get(key);
    if (entity === undefined)
      return { patch, status: "target-missing", matched: [] };
    const result = applyRuleOperation(entity.rules, patch.rule);
    if (result.rules !== undefined)
      patched.set(key, { ...entity, rules: result.rules });
    return {
      patch,
      status: result.status,
      matched: result.matched.map(ruleStatementXml),
    };
  });
  return {
    entities:
      patched.size === 0
        ? entities
        : entities.map(
            (entity) => patched.get(entity.id.toLocaleLowerCase()) ?? entity,
          ),
    outcomes,
  };
}

/** Each rule patch's outcome against `entities`, applied in order. */
export function campaignRulePatchOutcomes(
  entities: readonly ContentEntity[],
  patches: readonly CampaignRulePatch[],
): readonly CampaignRulePatchOutcome[] {
  return runCampaignRulePatches(entities, patches).outcomes;
}

/** One line on a rule patch's outcome, for diagnostics and reports. */
export function campaignRulePatchOutcomeMessage(
  outcome: CampaignRulePatchOutcome,
): string {
  const { id, rule } = outcome.patch;
  const label = `Rule patch ${id}: ${describeCampaignRuleOperation(rule)}`;
  switch (outcome.status) {
    case "applies":
      return `${label} applies`;
    case "target-missing":
      return `${label} not applied: no record ${id}`;
    case "no-match":
      return `${label} not applied: ${id} has no matching rule element`;
    case "ambiguous":
      return `${label} not applied: ${id} has ${outcome.matched.length} matching rule elements, the patch expects ${rule.add === undefined ? (rule.count ?? 1) : 1}: ${outcome.matched.join(", ")}`;
    case "present":
      return `${label} not applied: ${id} already has ${outcome.matched.join(", ")}`;
  }
}

/**
 * Applies the rule patches that apply to `entities` and returns a warning
 * diagnostic (`campaign.rule-patch-not-applied`) for each one that does
 * not: the record keeps the content's rules, and composition never fails
 * over it.
 */
export function applyCampaignRulePatches(
  entities: readonly ContentEntity[],
  patches: readonly CampaignRulePatch[],
): {
  readonly entities: readonly ContentEntity[];
  readonly diagnostics: readonly ContentDiagnostic[];
} {
  const result = runCampaignRulePatches(entities, patches);
  return {
    entities: result.entities,
    diagnostics: result.outcomes
      .filter(({ status }) => status !== "applies")
      .map((outcome) => ({
        severity: "warning",
        code: "campaign.rule-patch-not-applied",
        message: campaignRulePatchOutcomeMessage(outcome),
        entityId: outcome.patch.id,
      })),
  };
}

/**
 * Composes the base packs with the campaign's house rules on top
 * (`last-pack-wins-v1`), applies the campaign's field patches, alternate
 * names and then its rule patches to the composed records, and records the campaign and its
 * resolved restrictions on the materialized pack. Type rules are resolved
 * on every composition, so records added to later base revisions are
 * covered; a patch whose stock value or rule has changed is left out with
 * a diagnostic.
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
    (composed): ComposedCampaignLayer => {
      // Field patches, alternate names, then rule patches: they touch
      // different parts of a record, and restrictions resolve over the
      // result.
      const fields = applyCampaignPatches(composed, campaignPatches(campaign));
      const names = applyCampaignAlternateNames(
        fields.entities,
        campaignAlternateNamePatches(campaign),
      );
      const rules = applyCampaignRulePatches(
        names.entities,
        campaignRulePatches(campaign),
      );
      const { entities } = rules;
      const diagnostics = [
        ...fields.diagnostics,
        ...names.diagnostics,
        ...rules.diagnostics,
      ];
      const packCampaign: ContentPackCampaign = {
        campaignId: campaign.campaignId,
        revision: campaign.revision,
        contentDigest: campaign.contentDigest,
        restrictedIds: resolveCampaignRestrictions(entities, campaign),
      };
      return { entities, diagnostics, campaign: packCampaign };
    },
  );
}
