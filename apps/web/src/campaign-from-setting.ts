// Creating a campaign from a legacy save's campaign block (D116). Loaded as
// its own chunk (`loadCampaignFromSetting`), only when the player chooses
// "Create campaign": it carries the legacy rules parser.
//
// D082 keeps legacy content conversion (decrypting, merging `.part` files,
// raw rules XML as installed content) in the content tool. A save's
// `Houserules` block is different: it is part of a character file the
// browser already reads, a handful of records, and becomes a campaign
// overlay exactly as `content-tool campaign build` makes one, with the same
// parser and `buildCampaign`. It is parsed once, here, and stored in the
// campaign document; nothing re-parses it on load or evaluation.

import { buildCampaign, type CampaignDocument } from "@4ecb/content-pack";
import { houseRulesDocument, parseHouseRules } from "@4ecb/legacy-wotc";

import type { ImportedCampaignOffer } from "./imported-campaign";

/**
 * Revision 1 of a new campaign from the offer's setting: its restricted IDs
 * (identity entries already resolved) and its house-rule records, the XML
 * kept verbatim for a later legacy export. Throws when a house-rule record
 * is rejected, as the content tool would.
 */
export async function campaignFromSetting(
  offer: Extract<ImportedCampaignOffer, { kind: "create" }>,
): Promise<CampaignDocument> {
  const houseRulesXml = offer.setting.houseRulesXml.trim();
  const source = parseHouseRules(
    houseRulesDocument(houseRulesXml),
    "house-rules.xml",
  );
  return buildCampaign(
    {
      campaignId: offer.campaignId,
      name: offer.name,
      revision: 1,
      restrictions: { ids: offer.restrictions.ids, types: [] },
    },
    source,
    houseRulesXml,
  );
}
