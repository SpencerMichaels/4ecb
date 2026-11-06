import { useEffect, useRef, useState } from "react";

import type { CampaignDocument } from "@4ecb/content-pack";

import { Icon } from "./Icon";
import type { ImportedCampaignOffer } from "./imported-campaign";

function count(value: number, noun: string): string {
  return `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;
}

/** Names listed before the rest are summarized as "and N more". */
const LISTED = 8;

/**
 * Shown after importing a legacy save made in a campaign (D116): offers to
 * put the character in the matching installed campaign, or to create a
 * campaign from the save's campaign block. Either way the move itself is
 * then reviewed in the content-update dialog; Cancel leaves the imported
 * character on the browser's content, outside any campaign.
 */
export function ImportedCampaignDialog({
  characterName,
  offer,
  onCancel,
  onCreate,
  onJoin,
}: {
  readonly characterName: string;
  readonly offer: ImportedCampaignOffer;
  readonly onCancel: () => void;
  /** Creates and installs the offer's campaign. */
  readonly onCreate: () => Promise<CampaignDocument>;
  /** Moves on to reviewing the character's move into `campaign`. */
  readonly onJoin: (campaign: CampaignDocument) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);
  const finish = (then: () => void) => {
    dialog.current?.close();
    then();
  };
  const settingName =
    offer.kind === "join" ? offer.settingName : offer.setting.name.trim();
  const saved =
    settingName === ""
      ? `${characterName} was saved in a legacy campaign`
      : `${characterName} was saved in the legacy campaign “${settingName}”`;

  async function create(): Promise<void> {
    setCreating(true);
    setError(undefined);
    try {
      const campaign = await onCreate();
      finish(() => onJoin(campaign));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreating(false);
    }
  }

  const title =
    offer.kind === "join"
      ? `Put ${characterName} in ${offer.campaign.name}?`
      : `Create a campaign for ${characterName}?`;
  const unresolved =
    offer.kind === "create" ? offer.restrictions.unresolved : [];
  return (
    <dialog
      aria-labelledby="imported-campaign-title"
      className="imported-campaign-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        finish(onCancel);
      }}
    >
      <header>
        <h2 id="imported-campaign-title">{title}</h2>
        <button
          aria-label="Close"
          className="button-icon dialog-close"
          title="Close"
          type="button"
          onClick={() => finish(onCancel)}
        >
          <Icon name="remove" />
        </button>
      </header>
      <div className="imported-campaign-body">
        {offer.kind === "join" ? (
          <p>
            {saved}, which matches {offer.campaign.name} in this browser. You
            can review what changes before {characterName} moves in.
          </p>
        ) : (
          <>
            <p>
              {saved}. No campaign in this browser matches it. Creating{" "}
              {offer.name} adds a campaign that restricts{" "}
              {count(offer.restrictions.ids.length, "record")} and has{" "}
              {count(offer.setting.houseRuleIds.length, "house-rule record")};
              you can then review what changes before {characterName} moves in.
            </p>
            {unresolved.length > 0 ? (
              <>
                <p>
                  {count(unresolved.length, "restricted record")} in the save
                  {unresolved.length === 1 ? " isn’t" : " aren’t"} in this
                  content and {unresolved.length === 1 ? "is" : "are"} left out:
                </p>
                <ul>
                  {unresolved.slice(0, LISTED).map((identity, index) => (
                    <li key={index}>
                      {identity.name} ({identity.type})
                    </li>
                  ))}
                  {unresolved.length > LISTED ? (
                    <li>and {unresolved.length - LISTED} more</li>
                  ) : null}
                </ul>
              </>
            ) : null}
          </>
        )}
        {error === undefined ? null : (
          <p className="error" role="alert">
            Couldn&apos;t create the campaign: {error}
          </p>
        )}
      </div>
      <footer>
        <button type="button" onClick={() => finish(onCancel)}>
          Cancel
        </button>
        {offer.kind === "join" ? (
          <button
            className="button-primary"
            type="button"
            onClick={() => finish(() => onJoin(offer.campaign))}
          >
            Put in {offer.campaign.name}
          </button>
        ) : (
          <button
            className="button-primary"
            disabled={creating}
            type="button"
            onClick={() => void create()}
          >
            {creating ? "Creating campaign…" : `Create campaign ${offer.name}`}
          </button>
        )}
      </footer>
    </dialog>
  );
}
