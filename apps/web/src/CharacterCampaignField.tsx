import { useEffect, useState } from "react";

import { CampaignRepository } from "@4ecb/browser-storage";
import type { CampaignDocument } from "@4ecb/content-pack";

import { CAMPAIGNS_CHANGED_EVENT, latestCampaign } from "./campaign-profile";

const campaignRepository = new CampaignRepository();

export interface CampaignOption {
  /** "" is None: the character follows the browser's content alone. */
  readonly value: string;
  readonly label: string;
  readonly campaign?: CampaignDocument;
  /** The character's campaign when none of its revisions is installed. */
  readonly missing?: boolean;
}

/** The select's options: None, then each installed campaign's newest
 *  revision by name, plus the character's own campaign if it is missing. */
export function campaignOptions(
  installed: readonly CampaignDocument[],
  currentCampaignId: string | undefined,
): CampaignOption[] {
  const ids = [...new Set(installed.map(({ campaignId }) => campaignId))];
  const campaigns = ids
    .map((id) => latestCampaign(installed, id)!)
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.campaignId.localeCompare(right.campaignId),
    );
  return [
    { value: "", label: "None" },
    ...campaigns.map((campaign) => ({
      value: campaign.campaignId,
      label: campaign.name,
      campaign,
    })),
    ...(currentCampaignId === undefined || ids.includes(currentCampaignId)
      ? []
      : [
          {
            value: currentCampaignId,
            label: `${currentCampaignId} (not in this browser)`,
            missing: true,
          },
        ]),
  ];
}

/**
 * Details' Campaign select (D116): None or an installed campaign. It shows
 * the character's campaign; choosing another asks `onChoose` to review the
 * move (the content-update dialog), and the select follows only once the
 * character has moved.
 */
export function CharacterCampaignField({
  campaignId,
  disabledReason,
  onChoose,
}: {
  readonly campaignId: string | undefined;
  /** Why the campaign can't be changed now (no active content). */
  readonly disabledReason?: string | undefined;
  readonly onChoose: (campaign: CampaignDocument | undefined) => void;
}) {
  const [installed, setInstalled] = useState<readonly CampaignDocument[]>();
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void campaignRepository
        .list()
        .then((campaigns) => {
          if (!cancelled) setInstalled(campaigns);
        })
        .catch(() => {
          if (!cancelled) setInstalled([]);
        });
    load();
    window.addEventListener(CAMPAIGNS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CAMPAIGNS_CHANGED_EVENT, load);
    };
  }, []);
  const options = campaignOptions(installed ?? [], campaignId);
  const none = installed !== undefined && installed.length === 0;
  return (
    <div className="character-campaign-field">
      <label className="inline-field">
        <span className="inline-field-label">Campaign</span>
        <select
          disabled={disabledReason !== undefined}
          {...(disabledReason === undefined ? {} : { title: disabledReason })}
          value={campaignId ?? ""}
          onChange={(event) => {
            const next = options.find(
              ({ value }) => value === event.currentTarget.value,
            );
            if (next === undefined || next.missing === true) return;
            if (next.value === (campaignId ?? "")) return;
            onChoose(next.campaign);
          }}
        >
          {options.map((option) => (
            <option
              disabled={option.missing === true}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {none ? (
        <p className="field-help">
          No campaigns in this browser. Open your DM&apos;s invite link, or
          import their campaign file in{" "}
          <a href="#/settings">Settings → Campaigns</a>.
        </p>
      ) : null}
    </div>
  );
}
