// `content-tool campaign build|inspect` and `advertise-campaign` (D116): a
// DM's campaign.json and house-rule XML become a digest-verified `.4ecc`
// document, hosted beside the private packs in deploy/.

import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { stderr } from "node:process";

import type { ParsedContentSource } from "@4ecb/content-domain";
import {
  buildCampaign,
  decodeCampaign,
  encodeCampaign,
  resolveCampaignRestrictions,
  summarizeContentPack,
  validateCampaign,
  type CampaignDocument,
  type CampaignManifest,
  type CampaignTypeRestriction,
  type ContentPack,
} from "@4ecb/content-pack";
import { parseD20Rules } from "@4ecb/legacy-wotc";

import {
  gzip,
  printJson,
  readPack,
  requireOption,
  writeAtomically,
  type ParsedArguments,
} from "./cli";
import { updateRuntimeConfig, withAdvertisedCampaign } from "./runtime-config";

/** `campaign.json`: the manifest, a house-rule XML path relative to it. */
export interface CampaignSource {
  readonly manifest: CampaignManifest;
  /** Absolute path of the house-rule XML; undefined when there is none. */
  readonly houseRulesPath: string | undefined;
}

const MANIFEST_KEYS = new Set([
  "campaignId",
  "name",
  "revision",
  "houseRules",
  "restrict",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a `campaign.json` value: `{campaignId, name, revision, houseRules?,
 * restrict?: {ids?: [...], types?: {"Deity": "campaign-only"}}}`. Unknown
 * keys are refused, so a misspelt restriction never silently restricts
 * nothing. Identity and limit rules are `buildCampaign`'s.
 */
export function parseCampaignManifest(
  value: unknown,
  manifestDirectory: string,
): CampaignSource {
  if (!isRecord(value)) throw new Error("campaign.json must be a JSON object");
  const unknown = Object.keys(value).filter((key) => !MANIFEST_KEYS.has(key));
  if (unknown.length > 0)
    throw new Error(`campaign.json has unknown keys: ${unknown.join(", ")}`);
  const { campaignId, name, revision, houseRules } = value;
  if (typeof campaignId !== "string")
    throw new Error("campaign.json campaignId must be a string");
  if (typeof name !== "string")
    throw new Error("campaign.json name must be a string");
  if (typeof revision !== "number")
    throw new Error("campaign.json revision must be a number");
  if (houseRules !== undefined && typeof houseRules !== "string")
    throw new Error("campaign.json houseRules must be a relative XML path");
  const restrict = value.restrict ?? {};
  if (!isRecord(restrict))
    throw new Error("campaign.json restrict must be an object");
  const unknownRestrict = Object.keys(restrict).filter(
    (key) => key !== "ids" && key !== "types",
  );
  if (unknownRestrict.length > 0)
    throw new Error(
      `campaign.json restrict has unknown keys: ${unknownRestrict.join(", ")}`,
    );
  const ids = restrict.ids ?? [];
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string"))
    throw new Error("campaign.json restrict.ids must be an array of IDs");
  const typeRules = restrict.types ?? {};
  if (!isRecord(typeRules))
    throw new Error(
      'campaign.json restrict.types must map a type to "campaign-only"',
    );
  const types: CampaignTypeRestriction[] = Object.entries(typeRules).map(
    ([type, allow]) => {
      if (allow !== "campaign-only")
        throw new Error(
          `campaign.json restrict.types.${type} must be "campaign-only", not ${JSON.stringify(allow)}`,
        );
      return { type, allow };
    },
  );
  return {
    manifest: {
      campaignId,
      name,
      revision,
      restrictions: { ids: ids as string[], types },
    },
    houseRulesPath:
      houseRules === undefined
        ? undefined
        : resolve(manifestDirectory, houseRules),
  };
}

const D20_RULES_OPEN = /<D20Rules\b(?:[^>"']|"[^"]*"|'[^']*')*>/i;

/**
 * The root's children verbatim (trimmed): the RulesElement definitions a
 * legacy export writes inside `Houserules`. The parser has already checked
 * the document is well formed with a D20Rules root.
 */
export function houseRulesChildrenXml(xml: string): string {
  const open = D20_RULES_OPEN.exec(xml);
  if (open === null) throw new Error("House-rule XML has no D20Rules root");
  if (open[0].endsWith("/>")) return "";
  const start = open.index + open[0].length;
  const end = xml.toLocaleLowerCase().lastIndexOf("</d20rules");
  if (end < start) throw new Error("House-rule XML has no closing D20Rules");
  return xml.slice(start, end).trim();
}

const EMPTY_HOUSE_RULES = '<D20Rules game-system="D&amp;D4E" />';

/**
 * Parses house-rule XML with the parser `content-tool build` uses. Records
 * the parser rejects, and top-level elements other than RulesElement (which
 * the legacy `Houserules` block cannot carry), are errors.
 */
export function parseHouseRules(
  xml: string,
  sourceKey: string,
): ParsedContentSource {
  const parsed = parseD20Rules(xml, sourceKey);
  const errors = [
    ...parsed.rejected.map(
      (record) =>
        `House-rule record ${record.ordinal + 1} was rejected: ${record.reason}`,
    ),
    ...parsed.rawTopLevel.flatMap((node) =>
      node.kind === "element"
        ? [
            `House-rule XML may hold only RulesElement records, not <${node.name}>`,
          ]
        : [],
    ),
  ];
  if (errors.length > 0) throw new Error(errors.join("; "));
  return parsed;
}

/** Builds the campaign a `campaign.json` describes. */
export async function buildCampaignFromManifest(
  manifestPath: string,
): Promise<{ campaign: CampaignDocument; source: ParsedContentSource }> {
  const absolute = resolve(manifestPath);
  const { manifest, houseRulesPath } = parseCampaignManifest(
    JSON.parse(await readFile(absolute, "utf8")),
    dirname(absolute),
  );
  const xml =
    houseRulesPath === undefined
      ? EMPTY_HOUSE_RULES
      : (await readFile(houseRulesPath, "utf8")).replace(/^﻿/, "");
  const source = parseHouseRules(
    xml,
    houseRulesPath === undefined ? "house-rules.xml" : basename(houseRulesPath),
  );
  const campaign = await buildCampaign(
    manifest,
    source,
    houseRulesChildrenXml(xml),
  );
  return { campaign, source };
}

export interface CampaignAgainstReport {
  readonly packId: string;
  readonly contentDigest: string;
  /** Every record the campaign restricts over this pack. */
  readonly restrictedRecords: number;
  readonly typeRules: readonly {
    readonly type: string;
    /** Records of the type the rule restricts. */
    readonly restrictedRecords: number;
    /** Records of the type the campaign supplies. */
    readonly campaignRecords: number;
  }[];
  /** House-rule records replacing a record of the pack. */
  readonly overriddenIds: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Checks a campaign against the content it will be layered over. Nothing
 * here is an error: a restricted ID may name content a later pack adds.
 */
export function campaignAgainstPack(
  campaign: CampaignDocument,
  pack: ContentPack,
): CampaignAgainstReport {
  const { packId, contentDigest } = pack.manifest;
  const stock = new Map(
    pack.entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const overlay = new Map(
    campaign.houseRules.entities.map((entity) => [
      entity.id.toLocaleLowerCase(),
      entity,
    ]),
  );
  const warnings: string[] = [];
  for (const id of campaign.restrictions.ids) {
    const key = id.toLocaleLowerCase();
    if (overlay.has(key))
      warnings.push(`Restricted ID ${id} is one of the campaign's house rules`);
    else if (!stock.has(key))
      warnings.push(`Restricted ID ${id} is not in ${packId}`);
  }
  const overriddenIds: string[] = [];
  for (const [key, record] of overlay) {
    const replaced = stock.get(key);
    if (replaced === undefined) continue;
    overriddenIds.push(record.id);
    warnings.push(
      `House rule ${record.id} (${record.type} "${record.name}") replaces ${packId}'s ${replaced.type} "${replaced.name}"`,
    );
  }
  const typeRules = campaign.restrictions.types.map(({ type }) => {
    const folded = type.toLocaleLowerCase();
    const ofType = (entity: { readonly type: string }) =>
      entity.type.toLocaleLowerCase() === folded;
    const restrictedRecords = pack.entities.filter(
      (entity) => ofType(entity) && !overlay.has(entity.id.toLocaleLowerCase()),
    ).length;
    const campaignRecords = campaign.houseRules.entities.filter(ofType).length;
    if (restrictedRecords === 0 && campaignRecords === 0)
      warnings.push(
        `Type rule ${type} matches no record in ${packId} or the house rules (is the type spelt as the content spells it?)`,
      );
    return { type, restrictedRecords, campaignRecords };
  });
  const composed = [
    ...pack.entities.filter(
      (entity) => !overlay.has(entity.id.toLocaleLowerCase()),
    ),
    ...campaign.houseRules.entities,
  ];
  return {
    packId,
    contentDigest,
    restrictedRecords: resolveCampaignRestrictions(composed, campaign).length,
    typeRules,
    overriddenIds,
    warnings,
  };
}

/** What `campaign inspect` prints. */
export function summarizeCampaign(campaign: CampaignDocument) {
  return {
    campaignId: campaign.campaignId,
    name: campaign.name,
    revision: campaign.revision,
    contentDigest: campaign.contentDigest,
    restrictions: {
      ids: campaign.restrictions.ids.length,
      types: campaign.restrictions.types,
    },
    houseRules: summarizeContentPack(campaign.houseRules),
    legacyHouseRulesXmlBytes: new TextEncoder().encode(
      campaign.legacyHouseRulesXml,
    ).byteLength,
  };
}

/** Gzipped canonical `.4ecc` bytes (deterministic for one campaign). */
export async function campaignFileBytes(
  campaign: CampaignDocument,
): Promise<Uint8Array> {
  return gzip(encodeCampaign(campaign), { level: 9 });
}

/** Decodes and verifies a `.4ecc` file (gzipped or plain). */
export async function readCampaignFile(
  path: string,
): Promise<{ campaign: CampaignDocument; bytes: Uint8Array }> {
  const bytes = await readFile(path);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return { campaign: await decodeCampaign(buffer), bytes };
}

/** The hosted file name: revision-qualified, so one URL never changes. */
export function advertisedCampaignFileName(
  campaign: Pick<CampaignDocument, "campaignId" | "contentDigest">,
): string {
  return `${campaign.campaignId}-${campaign.contentDigest.slice(0, 12)}.4ecc`;
}

/**
 * Copies a verified campaign to `<outDir>/private-packs/campaigns/` and
 * advertises it in `<outDir>/runtime-config.json`, keeping every other key.
 * Hosting a campaign applies it to nobody (D116).
 */
export async function advertiseCampaignFile(source: string, outDir: string) {
  const { campaign, bytes } = await readCampaignFile(resolve(source));
  const fileName = advertisedCampaignFileName(campaign);
  const entry = {
    campaignId: campaign.campaignId,
    name: campaign.name,
    revision: campaign.revision,
    contentDigest: campaign.contentDigest,
    url: `/private-packs/campaigns/${fileName}`,
  };
  const configPath = resolve(outDir, "runtime-config.json");
  const campaignPath = resolve(outDir, "private-packs", "campaigns", fileName);
  // Copy first: an advertised URL must never point at a missing file.
  await writeAtomically(campaignPath, bytes);
  await updateRuntimeConfig(configPath, (config) =>
    withAdvertisedCampaign(config, entry),
  );
  return { campaignPath, configPath, advertised: entry };
}

async function campaignBuild(arguments_: ParsedArguments): Promise<void> {
  const manifestPath = requireOption(arguments_, "manifest");
  const output = resolve(requireOption(arguments_, "output"));
  const against = arguments_.options.get("against");
  const { campaign, source } = await buildCampaignFromManifest(manifestPath);
  const validation = await validateCampaign(campaign);
  if (!validation.valid) {
    printJson(validation);
    throw new Error("Refusing to write an invalid campaign");
  }
  await writeAtomically(output, await campaignFileBytes(campaign));
  const parseWarnings = source.diagnostics
    .filter(({ severity }) => severity !== "info")
    .map(({ code, message }) => `${code}: ${message}`);
  const report =
    against === undefined
      ? undefined
      : campaignAgainstPack(campaign, await readPack(resolve(against)));
  for (const warning of [
    ...parseWarnings,
    ...validation.warnings,
    ...(report?.warnings ?? []),
  ])
    stderr.write(`warning: ${warning}\n`);
  printJson({
    output,
    summary: summarizeCampaign(campaign),
    validation,
    ...(report === undefined ? {} : { against: report }),
  });
}

async function campaignInspect(arguments_: ParsedArguments): Promise<void> {
  const path = arguments_.positionals[2];
  if (path === undefined)
    throw new Error("campaign inspect requires a .4ecc path");
  const { campaign } = await readCampaignFile(resolve(path));
  printJson({
    ...summarizeCampaign(campaign),
    validation: await validateCampaign(campaign),
  });
}

export async function campaignCommand(
  arguments_: ParsedArguments,
): Promise<void> {
  const subcommand = arguments_.positionals[1];
  switch (subcommand) {
    case "build":
      await campaignBuild(arguments_);
      break;
    case "inspect":
      await campaignInspect(arguments_);
      break;
    default:
      throw new Error(
        `Unknown campaign command: ${subcommand ?? "(none)"} (build, inspect)`,
      );
  }
}

export async function advertiseCampaignCommand(
  arguments_: ParsedArguments,
): Promise<void> {
  const source = arguments_.positionals[1];
  if (source === undefined)
    throw new Error("advertise-campaign requires a .4ecc path");
  printJson(
    await advertiseCampaignFile(
      source,
      resolve(arguments_.options.get("out-dir") ?? "deploy"),
    ),
  );
}
