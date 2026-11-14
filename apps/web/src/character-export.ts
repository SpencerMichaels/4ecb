import { CampaignRepository, CharacterRepository } from "@4ecb/browser-storage";
import type { CharacterRecord } from "@4ecb/character-domain";
import type { CampaignDocument, ContentPackCampaign } from "@4ecb/content-pack";
import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
  projectBuildForLegacyExport,
  legacyExportedBuild,
  type CampaignSettingInput,
} from "@4ecb/legacy-dnd4e";

import {
  evaluateStoredCharacter,
  withCharacterSnapshots,
} from "./backup-snapshots";
import { shareCharacter, type UploadedShare } from "./character-share";
import { download } from "./download";

/** Export files offered from the library and the builder (.4ecb, .dnd4e).
 *  Printing or saving a PDF is the character sheet's job. */

const repository = new CharacterRepository();
const campaignRepository = new CampaignRepository();

/**
 * The legacy `D20CampaignSetting` a campaign character exports with (D116):
 * the campaign's name, its restrictions as the bound pack resolved them
 * (type rules already expanded to IDs, as legacy `Restricted` needs) and the
 * DM's house-rule XML. CountsAsDeity records travel inside that XML; the old
 * builder ignores the type, so the export says nothing about it (owner
 * decision). The legacy block has a name only, so the campaign's
 * description is dropped silently (owner decision). Undefined outside a campaign, and when the campaign's document
 * isn't installed: restrictions without the house rules that replace them
 * would be a different campaign, so the save's own setting is kept as is.
 */
export function legacyCampaignSetting(
  packCampaign: ContentPackCampaign | undefined,
  campaign: CampaignDocument | undefined,
): CampaignSettingInput | undefined {
  if (packCampaign === undefined || campaign === undefined) return undefined;
  if (
    campaign.campaignId !== packCampaign.campaignId ||
    campaign.contentDigest !== packCampaign.contentDigest
  )
    return undefined;
  return {
    name: campaign.name,
    restrictedIds: packCampaign.restrictedIds,
    houseRulesXml: campaign.legacyHouseRulesXml,
  };
}

function fileBase(character: CharacterRecord): string {
  return character.title.replace(/[^a-z0-9_-]+/gi, "-");
}

/** The character as a native .4ecb backup file, with its evaluated
 *  snapshot for other apps (`withCharacterSnapshots`). */
export async function exportCharacterBackup(id: string): Promise<void> {
  const character = await repository.required(id);
  const backup = await withCharacterSnapshots(
    await repository.exportCharacter(character.id),
  );
  download(
    `${fileBase(character)}.4ecb`,
    JSON.stringify(backup, null, 2),
    "application/json",
  );
}

/** Downloads a backup of every character in this browser, with each one's
 *  evaluated snapshot for other apps (`withCharacterSnapshots`). */
export async function downloadCharacterBackup(
  characters: CharacterRepository = repository,
): Promise<void> {
  const backup = await withCharacterSnapshots(await characters.exportBackup());
  download(
    `4ecb-characters-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(backup, null, 2),
  );
}

/** The character regenerated as a legacy .dnd4e file, after checking that
 *  re-importing it gives back the same build. */
export async function exportCharacterDnd4e(id: string): Promise<void> {
  const character = await repository.required(id);
  const { pack, evaluation } = await evaluateStoredCharacter(
    character,
    "Regenerated .dnd4e export",
  );
  const campaignSetting = legacyCampaignSetting(
    pack.campaign,
    pack.campaign === undefined
      ? undefined
      : await campaignRepository.get(
          pack.campaign.campaignId,
          pack.campaign.contentDigest,
        ),
  );
  const xml = exportEditedDnd4e({
    target: "legacy-builder-0.07a",
    envelope: character.legacy,
    snapshot: character.snapshot,
    build: character.build,
    evaluation,
    content: pack.entities,
    ...(campaignSetting === undefined ? {} : { campaignSetting }),
  });
  const reimported = importDnd4e(xml);
  const comparison = compareEditedDnd4eRoundTrip(
    projectBuildForLegacyExport(
      legacyExportedBuild(character.build, evaluation, pack.entities),
    ),
    reimported.build,
  );
  if (!comparison.equivalent)
    throw new Error(
      `Edited export re-import check failed: ${comparison.differences.join(" ")}`,
    );
  download(`${fileBase(character)}.dnd4e`, xml, "application/xml");
}

/** Shares a stored character by code (D122): its .4ecb package, uploaded to
 *  the share relay, retried without the portrait's original image when too
 *  large. */
export function shareStoredCharacter(
  id: string,
  options: Parameters<typeof shareCharacter>[1] = {},
): Promise<UploadedShare> {
  return shareCharacter(
    (prepare) =>
      repository.exportCharacter(id, prepare === undefined ? {} : { prepare }),
    options,
  );
}
