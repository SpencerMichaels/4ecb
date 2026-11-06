import { useCallback, useEffect, useState } from "react";

import {
  CampaignRepository,
  ContentPackRepository,
  type ContentProfileDefinition,
} from "@4ecb/browser-storage";
import type { CampaignDocument } from "@4ecb/content-pack";

import {
  campaignJoinState,
  campaignSummaryLines,
  type CampaignJoinState,
} from "./campaign-join-ui";
import { CAMPAIGNS_CHANGED_EVENT } from "./campaign-profile";
import { startNewCharacter } from "./create-character";
import { LoadingPane } from "./LoadingScreen";
import {
  downloadAdvertisedCampaign,
  type AdvertisedCampaign,
} from "./runtime-content";

const campaignRepository = new CampaignRepository();
const contentRepository = new ContentPackRepository();

const toLibrary = () => {
  window.location.hash = "#/characters";
};

export interface CampaignJoinPageProps {
  readonly campaignId: string;
  readonly advertisedCampaigns: readonly AdvertisedCampaign[];
  /** Whether the server's runtime configuration has been read (or failed). */
  readonly advertisedLoaded: boolean;
  readonly activePackId?: string;
  readonly activeProfile?: ContentProfileDefinition;
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function CampaignSummary({
  campaign,
}: {
  readonly campaign: CampaignDocument;
}) {
  return (
    <dl className="campaign-join-summary">
      {campaignSummaryLines(campaign).map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The invite link's page (D116, `#/campaigns/join/<id>`): what the hosted
 * campaign is, "Add campaign" to put it in this browser, then "New
 * character in <name>". Adding changes no character.
 */
export function CampaignJoinPage({
  campaignId,
  advertisedCampaigns,
  advertisedLoaded,
  activePackId,
  activeProfile,
}: CampaignJoinPageProps) {
  const [installed, setInstalled] = useState<readonly CampaignDocument[]>();
  const [loadError, setLoadError] = useState<string>();
  // The hosted copy, fetched (digest-checked) to show before adding.
  const [preview, setPreview] = useState<{
    readonly digest: string;
    readonly campaign?: CampaignDocument;
    readonly error?: string;
  }>();
  const [previewRequest, setPreviewRequest] = useState(0);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const load = useCallback(() => {
    void campaignRepository
      .list()
      .then((campaigns) => {
        setInstalled(campaigns);
        setLoadError(undefined);
      })
      .catch((reason: unknown) => {
        setInstalled([]);
        setLoadError(message(reason));
      });
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(CAMPAIGNS_CHANGED_EVENT, load);
    return () => window.removeEventListener(CAMPAIGNS_CHANGED_EVENT, load);
  }, [load]);

  const state: CampaignJoinState = campaignJoinState(
    campaignId,
    advertisedCampaigns,
    advertisedLoaded,
    installed,
  );
  const hosted = state.kind === "available" ? state.advertised : undefined;

  useEffect(() => {
    if (hosted === undefined) return;
    let cancelled = false;
    setPreview({ digest: hosted.contentDigest });
    void downloadAdvertisedCampaign(hosted)
      .then((campaign) => {
        if (!cancelled) setPreview({ digest: hosted.contentDigest, campaign });
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setPreview({ digest: hosted.contentDigest, error: message(reason) });
      });
    return () => {
      cancelled = true;
    };
  }, [hosted, previewRequest]);

  async function add(campaign: CampaignDocument): Promise<void> {
    setAdding(true);
    setActionError(undefined);
    try {
      await campaignRepository.install(campaign);
      setAdded(true);
      // Open pages (and this one) re-read the installed campaigns.
      window.dispatchEvent(new Event(CAMPAIGNS_CHANGED_EVENT));
    } catch (reason: unknown) {
      setActionError(`Couldn't add ${campaign.name}: ${message(reason)}`);
    } finally {
      setAdding(false);
    }
  }

  async function createCharacter(campaign: CampaignDocument): Promise<void> {
    setCreating(true);
    setActionError(undefined);
    try {
      await startNewCharacter(
        {
          activePackId,
          activeProfile,
          loadPack: (packId) => contentRepository.get(packId),
        },
        campaign,
      );
    } catch (reason: unknown) {
      setActionError(`Couldn't create a character: ${message(reason)}`);
      setCreating(false);
    }
  }

  const heading =
    state.kind === "installed"
      ? state.campaign.name
      : state.kind === "available"
        ? `Join ${state.advertised.name}?`
        : "Campaign invite";

  let body;
  if (state.kind === "looking-up") {
    body = <LoadingPane label="Looking up the campaign…" />;
  } else if (state.kind === "unknown") {
    body = (
      <div className="empty-state campaign-join-empty">
        <h3>This campaign isn&apos;t available</h3>
        <p>
          Your group&apos;s server doesn&apos;t host a campaign called{" "}
          <code>{campaignId}</code>, and it isn&apos;t in this browser.
          {loadError === undefined
            ? null
            : ` (The campaigns in this browser couldn't be read: ${loadError}.)`}
        </p>
        <p>
          If your DM gave you a campaign file, add it in{" "}
          <a href="#/settings">Settings → Campaigns</a> with Import campaign.
          Otherwise ask them for a new invite link.
        </p>
        <div className="inline-actions">
          <button type="button" onClick={toLibrary}>
            Back to characters
          </button>
        </div>
      </div>
    );
  } else if (state.kind === "available") {
    const ready =
      preview?.digest === state.advertised.contentDigest ? preview : undefined;
    body = (
      <>
        <p>
          Your DM invites you to {state.advertised.name}. Adding it puts the
          campaign&apos;s house rules and limits in this browser; no character
          changes until you choose the campaign for it.
          {state.installedRevision === undefined
            ? null
            : ` This browser has revision ${state.installedRevision}; this adds revision ${state.advertised.revision}.`}
        </p>
        {ready?.campaign !== undefined ? (
          <CampaignSummary campaign={ready.campaign} />
        ) : ready?.error !== undefined ? (
          <p className="error" role="alert">
            Couldn&apos;t download {state.advertised.name}: {ready.error}
          </p>
        ) : (
          <LoadingPane label={`Reading ${state.advertised.name}…`} />
        )}
        <div className="inline-actions">
          {ready?.error !== undefined ? (
            <button
              type="button"
              onClick={() => setPreviewRequest((request) => request + 1)}
            >
              Try again
            </button>
          ) : (
            <button
              type="button"
              disabled={ready?.campaign === undefined || adding}
              onClick={() => {
                if (ready?.campaign !== undefined) void add(ready.campaign);
              }}
            >
              {adding ? "Adding campaign…" : "Add campaign"}
            </button>
          )}
          <button type="button" onClick={toLibrary}>
            Cancel
          </button>
        </div>
      </>
    );
  } else {
    const { campaign } = state;
    const noContent = activePackId === undefined;
    const createLabel = `New character in ${campaign.name}`;
    body = (
      <>
        <p aria-live="polite">
          {added
            ? `Added ${campaign.name} to this browser.`
            : `${campaign.name} is in this browser.`}{" "}
          Start a new character in it, or choose it for an existing character in
          that character&apos;s Details tab.
        </p>
        <CampaignSummary campaign={campaign} />
        <div className="inline-actions">
          <button
            type="button"
            // aria-disabled, not disabled, so the tooltip saying why shows.
            aria-disabled={noContent || undefined}
            disabled={creating}
            {...(noContent
              ? {
                  title:
                    "Turn on game content in Settings to create a character",
                }
              : {})}
            onClick={() => {
              if (!noContent) void createCharacter(campaign);
            }}
          >
            {creating ? "Creating character…" : createLabel}
          </button>
          <button type="button" onClick={toLibrary}>
            Back to characters
          </button>
        </div>
      </>
    );
  }

  return (
    <main className="campaign-join-page" id="main-content">
      <header className="page-heading">
        <h2>{heading}</h2>
      </header>
      <section className="panel campaign-join-panel" aria-busy={creating}>
        {body}
        {actionError === undefined ? null : (
          <p className="error" role="alert">
            {actionError}
          </p>
        )}
      </section>
    </main>
  );
}
