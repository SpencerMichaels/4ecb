import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CampaignRepository, CharacterRepository } from "@4ecb/browser-storage";
import {
  encodeCampaign,
  MAX_CAMPAIGN_ENCODED_BYTES,
  type CampaignDocument,
} from "@4ecb/content-pack";

import { CAMPAIGNS_CHANGED_EVENT } from "./campaign-profile";
import {
  campaignFileName,
  campaignInviteUrl,
  campaignRows,
  inviteDisabledReason,
  removeDisabledReason,
  type CampaignMembers,
  type CampaignRow,
} from "./campaign-settings-ui";
import { download } from "./download";
import {
  ItemContextMenu,
  itemContextMenuAt,
  type ItemContextMenuState,
} from "./ItemContextMenu";
import type { AdvertisedCampaign } from "./runtime-content";

const campaignRepository = new CampaignRepository();
const characterRepository = new CharacterRepository();

export interface CampaignSettingsProps {
  readonly advertisedCampaigns: readonly AdvertisedCampaign[];
  readonly onError: (reason: unknown, title: string) => void;
}

/**
 * Settings → Campaigns (D116): the campaigns installed in this browser, with
 * import, and per-row Export file, Copy invite link and Remove on right-click.
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
  const [menu, setMenu] = useState<ItemContextMenuState>();
  const [pendingRemove, setPendingRemove] = useState<CampaignRow>();
  // The last copied (or, without clipboard access, the to-copy) invite link:
  // copying shows nothing on the page, so it is stated here.
  const [invite, setInvite] = useState<{
    readonly name: string;
    readonly url: string;
    readonly copied: boolean;
  }>();

  // The latest error handler, without reloading the table when it changes.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const closeMenu = useCallback(() => setMenu(undefined), []);

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
  // refresh of hosted revisions).
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

  async function copyInvite(row: CampaignRow): Promise<void> {
    const url = campaignInviteUrl(row.campaignId);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      // Without clipboard access the link is shown to copy by hand.
    }
    setInvite({ name: row.name, url, copied });
  }

  async function remove(row: CampaignRow): Promise<void> {
    setPendingRemove(undefined);
    await campaignRepository.remove(row.campaignId);
    window.dispatchEvent(new Event(CAMPAIGNS_CHANGED_EVENT));
  }

  function rowMenu(row: CampaignRow) {
    const inviteReason = inviteDisabledReason(row);
    const removeReason = removeDisabledReason(row);
    return [
      { label: "Export file", onSelect: () => exportFile(row) },
      {
        label: "Copy invite link",
        ...(inviteReason === undefined ? {} : { disabledReason: inviteReason }),
        onSelect: () => void copyInvite(row),
      },
      {
        label: "Remove",
        ...(removeReason === undefined ? {} : { disabledReason: removeReason }),
        onSelect: () => setPendingRemove(row),
      },
    ];
  }

  return (
    <section className="panel settings-section campaign-settings">
      <div>
        <h3>Campaigns</h3>
        <p>
          A campaign adds a DM&apos;s house rules and limits on top of the game
          content, for the characters in it. Right-click a campaign to export
          it, copy its invite link, or remove it.
        </p>
      </div>

      <table className="content-table campaign-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Revision</th>
            <th scope="col">Characters</th>
          </tr>
        </thead>
        <tbody>
          {rows === undefined ? null : rows.length === 0 ? (
            <tr>
              <td className="game-content-empty" colSpan={3}>
                No campaigns in this browser.
              </td>
            </tr>
          ) : (
            rows.flatMap((row) => [
              <tr
                key={row.campaignId}
                tabIndex={0}
                aria-label={`${row.name}, revision ${row.revision}`}
                onContextMenu={(event) => {
                  const next = itemContextMenuAt(event, row.name, rowMenu(row));
                  if (next !== undefined) setMenu(next);
                }}
              >
                <td>
                  <strong>{row.name}</strong>
                  <span className="content-row-source">{row.campaignId}</span>
                </td>
                <td className="campaign-table-number">{row.revision}</td>
                <td className="campaign-table-number">{row.characters}</td>
              </tr>,
              pendingRemove?.campaignId === row.campaignId ? (
                <tr
                  className="content-row-confirm"
                  key={`${row.campaignId}:remove`}
                >
                  <td colSpan={3}>
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
                        <strong>Remove {row.name} from this browser?</strong>{" "}
                        Every revision is removed. Import its file again to use
                        it later.
                      </p>
                      <div className="inline-actions">
                        <button
                          type="button"
                          onClick={() =>
                            void remove(row).catch((reason: unknown) =>
                              onError(reason, `Couldn't remove ${row.name}`),
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
              ) : null,
            ])
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
      {invite === undefined ? null : (
        <p className="status" aria-live="polite">
          {invite.copied
            ? `Copied the invite link for ${invite.name}: `
            : `Copy this invite link for ${invite.name}: `}
          <code className="campaign-invite-url">{invite.url}</code>
        </p>
      )}

      {menu === undefined ? null : (
        <ItemContextMenu menu={menu} onClose={closeMenu} />
      )}
    </section>
  );
}
