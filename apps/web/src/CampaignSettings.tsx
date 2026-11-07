import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CampaignRepository, CharacterRepository } from "@4ecb/browser-storage";
import {
  encodeCampaign,
  MAX_CAMPAIGN_ENCODED_BYTES,
  type CampaignDocument,
} from "@4ecb/content-pack";

import { CAMPAIGNS_CHANGED_EVENT } from "./campaign-profile";
import {
  campaignFileName,
  campaignRows,
  removeDisabledReason,
  type CampaignMembers,
  type CampaignRow,
} from "./campaign-settings-ui";
import { download } from "./download";
import type { AdvertisedCampaign } from "./runtime-content";

const campaignRepository = new CampaignRepository();
const characterRepository = new CharacterRepository();

export interface CampaignSettingsProps {
  readonly advertisedCampaigns: readonly AdvertisedCampaign[];
  readonly onError: (reason: unknown, title: string) => void;
}

/**
 * Settings → Campaigns (D116): the campaigns installed in this browser, with
 * import, and per-row Export and Remove buttons laid out like the content
 * packs table's (a disabled one says why on hover). Hosted campaigns arrive
 * by themselves (`refreshInstalledCampaigns`) and can't be removed.
 */
export function CampaignSettings({
  advertisedCampaigns,
  onError,
}: CampaignSettingsProps) {
  // What storage holds; the rows add the server's hosted copies.
  const [stored, setStored] = useState<{
    readonly installed: readonly CampaignDocument[];
    readonly members: CampaignMembers;
  }>();
  const [importing, setImporting] = useState<string>();
  const [pendingRemove, setPendingRemove] = useState<CampaignRow>();

  // The latest error handler, without reloading the table when it changes.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async () => {
    const [installed, members] = await Promise.all([
      campaignRepository.list(),
      characterRepository.listMetadataPartitioned(),
    ]);
    setStored({ installed, members });
  }, []);
  const rows = useMemo(
    () =>
      stored === undefined
        ? undefined
        : campaignRows(stored.installed, stored.members, advertisedCampaigns),
    [stored, advertisedCampaigns],
  );

  // Loads now, and again when campaigns change elsewhere (the background
  // install of hosted campaigns and their revisions).
  useEffect(() => {
    const reload = () =>
      void load().catch((reason: unknown) =>
        onErrorRef.current(reason, "Couldn't list campaigns"),
      );
    reload();
    window.addEventListener(CAMPAIGNS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(CAMPAIGNS_CHANGED_EVENT, reload);
  }, [load]);

  const focusConfirmation = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return;
    node.scrollIntoView({ block: "nearest" });
    node.querySelector("button")?.focus({ preventScroll: true });
  }, []);

  async function importFile(file: File): Promise<void> {
    if (!file.name.trim().toLocaleLowerCase().endsWith(".4ecc"))
      throw new Error("Choose a .4ecc campaign file.");
    if (file.size > MAX_CAMPAIGN_ENCODED_BYTES)
      throw new Error("The campaign file is larger than the 16 MiB limit.");
    setImporting(`Reading ${file.name}…`);
    try {
      await campaignRepository.installEncoded(await file.arrayBuffer());
      // Open pages re-read campaigns; this table reloads with them.
      window.dispatchEvent(new Event(CAMPAIGNS_CHANGED_EVENT));
    } finally {
      setImporting(undefined);
    }
  }

  function exportFile(row: CampaignRow): void {
    download(
      campaignFileName(row),
      new TextDecoder().decode(encodeCampaign(row.campaign)),
    );
  }

  async function remove(row: CampaignRow): Promise<void> {
    setPendingRemove(undefined);
    await campaignRepository.remove(row.campaignId);
    window.dispatchEvent(new Event(CAMPAIGNS_CHANGED_EVENT));
  }

  return (
    <section className="panel settings-section campaign-settings">
      <div>
        <h3>Campaigns</h3>
        <p>
          A campaign adds a DM&apos;s house rules and limits on top of the game
          content, for the characters in it.
        </p>
      </div>

      <table className="content-table campaign-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Description</th>
            <th className="campaign-table-number" scope="col">
              Revision
            </th>
            <th className="campaign-table-number" scope="col">
              Characters
            </th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows === undefined ? null : rows.length === 0 ? (
            <tr>
              <td className="game-content-empty" colSpan={5}>
                No campaigns in this browser.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const removeReason = removeDisabledReason(row);
              return (
                <Fragment key={row.campaignId}>
                  <tr>
                    <td>
                      <strong>{row.name}</strong>
                      <span className="content-row-source">
                        {row.campaignId}
                      </span>
                    </td>
                    <td>
                      {row.campaign.description === undefined ? null : (
                        // Clamped like the builder tables' Description.
                        <span className="selection-table-summary">
                          {row.campaign.description}
                        </span>
                      )}
                    </td>
                    <td className="campaign-table-number">{row.revision}</td>
                    <td className="campaign-table-number">{row.characters}</td>
                    <td>
                      <div className="content-row-actions">
                        <button type="button" onClick={() => exportFile(row)}>
                          Export
                        </button>
                        <button
                          type="button"
                          {...actionState(removeReason)}
                          onClick={() => {
                            if (removeReason === undefined)
                              setPendingRemove(row);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                  {pendingRemove?.campaignId === row.campaignId ? (
                    <tr className="content-row-confirm">
                      <td colSpan={5}>
                        <div
                          className="content-change-review"
                          onKeyDown={(event) => {
                            // Esc cancels here instead of closing Settings.
                            if (event.key !== "Escape") return;
                            event.preventDefault();
                            setPendingRemove(undefined);
                          }}
                          ref={focusConfirmation}
                        >
                          <p>
                            <strong>
                              Remove {row.name} from this browser?
                            </strong>{" "}
                            Every revision is removed. Import its file again to
                            use it later.
                          </p>
                          <div className="inline-actions">
                            <button
                              type="button"
                              onClick={() =>
                                void remove(row).catch((reason: unknown) =>
                                  onError(
                                    reason,
                                    `Couldn't remove ${row.name}`,
                                  ),
                                )
                              }
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingRemove(undefined)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>

      <div className="heading-actions">
        <label
          className={`file-button${importing === undefined ? "" : " disabled"}`}
        >
          Import campaign…
          <input
            accept=".4ecc,application/json,application/gzip"
            type="file"
            disabled={importing !== undefined}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined)
                void importFile(file).catch((reason: unknown) =>
                  onError(reason, `Couldn't import ${file.name}`),
                );
              event.currentTarget.value = "";
            }}
          />
        </label>
        {importing === undefined ? null : (
          <p className="status" aria-live="polite">
            {importing}
          </p>
        )}
      </div>
    </section>
  );
}

/** A row action that can't be used stays visible and focusable, inert, with
 *  its reason as the tooltip and accessible description. */
function actionState(disabledReason: string | undefined) {
  return disabledReason === undefined
    ? {}
    : { "aria-disabled": true, title: disabledReason };
}
