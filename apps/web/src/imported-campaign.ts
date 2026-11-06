// A legacy save's campaign block on import (D116). A save made in a legacy
// campaign carries a non-empty `D20CampaignSetting`: its restricted IDs and
// the DM's house-rule records. After the import the library offers to put
// the character in the installed campaign that matches the block, or to
// create a campaign from it. An empty block (the usual case) offers nothing.
//
// Matching and the offer need no house-rule parse; creating a campaign
// parses the block's records, so that code (and the legacy rules parser) is
// its own chunk, loaded only when the player chooses to create one.

import type { ContentEntity } from "@4ecb/content-domain";
import {
  MAX_CAMPAIGN_ID_LENGTH,
  MAX_CONTENT_PACK_NAME_LENGTH,
  resolveCampaignRestrictions,
  type CampaignDocument,
} from "@4ecb/content-pack";
import type { LegacyCampaignSetting } from "@4ecb/legacy-dnd4e";

import type * as CampaignFromSetting from "./campaign-from-setting";
import { latestCampaign } from "./campaign-profile";

type EntityIdentity = Pick<ContentEntity, "id" | "name" | "type">;

function folded(value: string): string {
  return value.toLocaleLowerCase();
}

function sameFoldedSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftSet = new Set(left.map(folded));
  const rightSet = new Set(right.map(folded));
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}

export interface SettingRestrictions {
  /** The restricted IDs, identity entries resolved, without duplicates. */
  readonly ids: readonly string[];
  /** Identity entries (name and type, no ID) no record matches. */
  readonly unresolved: readonly {
    readonly name: string;
    readonly type: string;
  }[];
}

/**
 * The setting's restricted records as IDs: its IDs as listed, plus each
 * `RulesElement` identity without an ID resolved by name and type (ignoring
 * case) against `entities`. An identity several records share resolves to
 * all of them, as each would have matched in the legacy loader.
 */
export function settingRestrictions(
  setting: Pick<
    LegacyCampaignSetting,
    "restrictedIds" | "restrictedIdentities"
  >,
  entities: readonly EntityIdentity[],
): SettingRestrictions {
  const ids = new Map<string, string>();
  for (const id of setting.restrictedIds)
    if (!ids.has(folded(id))) ids.set(folded(id), id);
  const unresolved: { name: string; type: string }[] = [];
  for (const identity of setting.restrictedIdentities) {
    const name = folded(identity.name.trim());
    const type = folded(identity.type.trim());
    const matches = entities.filter(
      (entity) => folded(entity.name) === name && folded(entity.type) === type,
    );
    if (matches.length === 0) unresolved.push(identity);
    for (const { id } of matches)
      if (!ids.has(folded(id))) ids.set(folded(id), id);
  }
  return { ids: [...ids.values()], unresolved };
}

/** The installed campaign's records over `baseEntities`: the base records
 *  with its house rules on top (IDs and types only; no compose). */
function campaignEntities(
  campaign: CampaignDocument,
  baseEntities: readonly EntityIdentity[],
): EntityIdentity[] {
  return [...baseEntities, ...campaign.houseRules.entities];
}

/**
 * True when `campaign` is the campaign the setting describes: it restricts
 * the same records (its rules resolved over the base content, type rules
 * expanded, as an export writes them) and supplies house-rule records with
 * the same IDs. IDs compare ignoring case, as the legacy loader does.
 */
export function campaignMatchesSetting(
  campaign: CampaignDocument,
  setting: Pick<LegacyCampaignSetting, "houseRuleIds">,
  restrictedIds: readonly string[],
  baseEntities: readonly EntityIdentity[],
): boolean {
  return (
    sameFoldedSet(
      campaign.houseRules.entities.map(({ id }) => id),
      setting.houseRuleIds,
    ) &&
    sameFoldedSet(
      resolveCampaignRestrictions(
        campaignEntities(campaign, baseEntities),
        campaign,
      ),
      restrictedIds,
    )
  );
}

export type ImportedCampaignOffer =
  | {
      /** An installed campaign matches: offer to put the character in it
       *  (its newest revision). */
      readonly kind: "join";
      readonly settingName: string;
      readonly campaign: CampaignDocument;
    }
  | {
      /** None matches: offer to create a campaign from the setting. */
      readonly kind: "create";
      readonly setting: LegacyCampaignSetting;
      readonly restrictions: SettingRestrictions;
      /** The new campaign's name and ID (unique among installed IDs). */
      readonly name: string;
      readonly campaignId: string;
    };

/**
 * What to offer after importing a save with `setting`, or undefined when its
 * campaign block is empty. A matching installed revision offers its
 * campaign's newest revision; matching is checked on every installed
 * revision, so a save exported before the DM's latest change still joins.
 */
export function importedCampaignOffer(
  setting: LegacyCampaignSetting,
  installed: readonly CampaignDocument[],
  baseEntities: readonly EntityIdentity[],
): ImportedCampaignOffer | undefined {
  if (setting.empty) return undefined;
  const settingName = setting.name.trim();
  for (const candidate of installed) {
    const entities = campaignEntities(candidate, baseEntities);
    const restrictions = settingRestrictions(setting, entities);
    if (
      campaignMatchesSetting(candidate, setting, restrictions.ids, baseEntities)
    )
      return {
        kind: "join",
        settingName,
        campaign: latestCampaign(installed, candidate.campaignId) ?? candidate,
      };
  }
  const name = importedCampaignName(settingName);
  return {
    kind: "create",
    setting,
    restrictions: settingRestrictions(setting, baseEntities),
    name,
    campaignId: uniqueCampaignId(
      name,
      installed.map(({ campaignId }) => campaignId),
    ),
  };
}

/** The setting's name as a campaign name ("Imported campaign" when blank). */
export function importedCampaignName(settingName: string): string {
  const name = settingName
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, MAX_CONTENT_PACK_NAME_LENGTH)
    .trim();
  return name === "" ? "Imported campaign" : name;
}

/**
 * A campaign ID from `name`: lower-case letters and digits joined by
 * hyphens, at most 32 characters, with "-2", "-3"… appended when an
 * installed campaign already uses it (ignoring case).
 */
export function uniqueCampaignId(
  name: string,
  existingIds: readonly string[],
): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_CAMPAIGN_ID_LENGTH)
      .replace(/-+$/, "") || "campaign";
  const taken = new Set(existingIds.map(folded));
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${base.slice(0, MAX_CAMPAIGN_ID_LENGTH - tail.length).replace(/-+$/, "")}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Type-only: erased from the bundle, so the chunk stays separate.
export type CampaignFromSettingModule = typeof CampaignFromSetting;

/** Loads the campaign-creation chunk (the legacy rules parser). */
export const loadCampaignFromSetting = (): Promise<CampaignFromSettingModule> =>
  import("./campaign-from-setting");

export interface ImportedCampaignSources {
  /** Every installed campaign revision. */
  readonly installed: () => Promise<readonly CampaignDocument[]>;
  /** The active content's records the character was imported onto. */
  readonly baseEntities: () => Promise<readonly EntityIdentity[]>;
}

/**
 * The offer for an imported save's campaign block.
 * An empty block returns undefined without reading campaigns or content.
 */
export async function campaignOfferForSave(
  setting: LegacyCampaignSetting,
  sources: ImportedCampaignSources,
): Promise<ImportedCampaignOffer | undefined> {
  if (setting.empty) return undefined;
  const [installed, baseEntities] = await Promise.all([
    sources.installed(),
    sources.baseEntities(),
  ]);
  return importedCampaignOffer(setting, installed, baseEntities);
}

/**
 * Creates the offer's campaign (loading the creation chunk) and installs it.
 * Returns the installed document.
 */
export async function createImportedCampaign(
  offer: Extract<ImportedCampaignOffer, { kind: "create" }>,
  install: (campaign: CampaignDocument) => Promise<CampaignDocument>,
  load: () => Promise<
    Pick<CampaignFromSettingModule, "campaignFromSetting">
  > = loadCampaignFromSetting,
): Promise<CampaignDocument> {
  const { campaignFromSetting } = await load();
  return install(await campaignFromSetting(offer));
}
