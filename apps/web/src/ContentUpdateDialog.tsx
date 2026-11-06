import { useEffect, useRef, useState } from "react";

import { CharacterRepository } from "@4ecb/browser-storage";
import {
  applyCharacterCommand,
  type CharacterRecord,
} from "@4ecb/character-domain";

import {
  contentTargetMove,
  type ContentTarget,
  type ContentTargetMove,
  type MaterializedContentTarget,
} from "./campaign-profile";
import {
  contentUpdateProgressDetail,
  describeContentUpdate,
  type ContentUpdateSummary,
} from "./content-update";
import type { RulesRuntimeClient } from "./app-runtime";
import { download } from "./download";
import { Icon } from "./Icon";
import { LoadingPane } from "./LoadingScreen";
import { RulesWorkerClient } from "./rules-client";

const repository = new CharacterRepository();

function dialogTitle(name: string, move: ContentTargetMove): string {
  switch (move.kind) {
    case "join":
      return `Move ${name} into ${move.campaign.name}?`;
    case "leave":
      return `Take ${name} out of its campaign?`;
    case "update":
      return `Update ${name} to the new content?`;
  }
}

function confirmLabel(name: string, move: ContentTargetMove): string {
  switch (move.kind) {
    case "join":
      return `Move ${name}`;
    case "leave":
      return `Take ${name} out`;
    case "update":
      return `Update ${name}`;
  }
}

function introduction(
  name: string,
  target: ContentTarget,
  move: ContentTargetMove,
): string {
  const content =
    target.kind === "campaign"
      ? `the current game content with ${target.campaign.name} (revision ${target.campaign.revision})`
      : `the current content (${target.name})`;
  switch (move.kind) {
    case "join":
      return `${name} will use ${content}: its house rules, and only the options it allows.`;
    case "leave":
      return `${name} will leave its campaign and use ${content} from now on.`;
    case "update":
      return target.kind === "campaign"
        ? `${name} was built with an older version of the game content or of ${target.campaign.name}. Updating uses ${content} from now on.`
        : `${name} was built with an older version of your game content. Updating uses ${content} from now on.`;
  }
}

/** What the update would change, as the dialog lists it. */
export function ContentUpdateSummaryView({
  name,
  summary,
  campaignName,
}: {
  readonly name: string;
  readonly summary: ContentUpdateSummary;
  /** The target's campaign, if any, for its "Not used in" list. */
  readonly campaignName?: string | undefined;
}) {
  return (
    <div aria-live="polite">
      {!summary.changesKnown ? (
        <p>
          The older content isn&apos;t installed anymore, so we can&apos;t list
          exactly what will change.
        </p>
      ) : summary.changes.length +
          summary.updatedRules.length +
          summary.removals.length +
          summary.filledChoices.length +
          summary.restricted.length +
          summary.missing.length ===
        0 ? (
        <p>Nothing on {name}&apos;s sheet will change.</p>
      ) : summary.changes.length === 0 ? null : (
        <>
          <h3>What will change</h3>
          <ul className="content-update-changes">
            {summary.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </>
      )}
      {summary.updatedRules.length === 0 ? null : (
        <>
          <h3>Updated rules text</h3>
          <p>
            The wording or rules of these changed:{" "}
            {summary.updatedRules.join(", ")}.
          </p>
        </>
      )}
      {summary.removals.length === 0 ? null : (
        <>
          <h3>Will be removed</h3>
          <ul className="content-update-changes">
            {summary.removals.map((removal) => (
              <li key={removal}>{removal}</li>
            ))}
          </ul>
        </>
      )}
      {summary.filledChoices.length === 0 ? null : (
        <>
          <h3>New choices, already made</h3>
          <ul className="content-update-changes">
            {summary.filledChoices.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {summary.restricted.length === 0 ? null : (
        <>
          <h3>Not used in {campaignName ?? "this campaign"}</h3>
          <p>
            {name} keeps these, marked as house rules, until you change them:
          </p>
          <ul className="content-update-changes">
            {summary.restricted.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {summary.missing.length === 0 ? null : (
        <>
          <h3>Not in the new content</h3>
          <p>
            {name} uses these, but the new content doesn&apos;t include them:{" "}
            {summary.missing.join(", ")}.
          </p>
        </>
      )}
      {summary.canUpdate ? null : (
        <p className="profile-warning">
          {name} can&apos;t be calculated with the new content, so it can&apos;t
          be updated yet.
        </p>
      )}
    </div>
  );
}

/**
 * Explains, in player terms, what moving a character onto its content target
 * (the active content, or the active content with its campaign, D116) would
 * change, and applies it only when the player confirms. A campaign target is
 * composed (or its stored copy reused) when the dialog opens.
 */
export function ContentUpdateDialog({
  character,
  target,
  rulesClient,
  onUpdated,
  onClose,
}: {
  readonly character: CharacterRecord;
  readonly target: ContentTarget;
  /** The page's rules client, already holding the character's current
   *  content; without one the preview uses a temporary worker. */
  readonly rulesClient?: RulesRuntimeClient | undefined;
  readonly onUpdated: () => void;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<ContentUpdateSummary>();
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const [updating, setUpdating] = useState(false);
  const [materialized, setMaterialized] = useState<MaterializedContentTarget>();
  const name = character.title || "this character";
  const move = contentTargetMove(character.profileBinding, target);

  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const client = rulesClient ?? new RulesWorkerClient();
    if (target.kind === "campaign")
      setProgress(`Preparing ${target.campaign.name}`);
    target
      .materialize()
      .then((next) => {
        if (cancelled) return undefined;
        setMaterialized(next);
        return client.previewProfileMigration(
          character.build,
          next.packId,
          character.profileBinding?.packId,
          character.profileBinding?.contentDigest,
          (step) => {
            if (!cancelled) setProgress(contentUpdateProgressDetail(step));
          },
        );
      })
      .then((preview) => {
        if (preview === undefined) return;
        if (!cancelled) setSummary(describeContentUpdate(preview));
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        // The page's client is borrowed; only a temporary one is ours to end.
        if (client !== rulesClient) client.terminate();
      });
    return () => {
      cancelled = true;
    };
  }, [character, rulesClient, target]);

  function close(): void {
    dialog.current?.close();
    onClose();
  }

  async function downloadBackup(): Promise<void> {
    const backup = await repository.exportCharacter(character.id);
    download(
      `${name.replace(/[^\w.-]+/g, "_")}-backup.4ecb`,
      JSON.stringify(backup, null, 2),
    );
  }

  async function update(): Promise<void> {
    if (materialized === undefined) return;
    setUpdating(true);
    try {
      const removed = summary?.removedOccurrenceIds ?? [];
      const fill = summary?.fillCommand;
      if (removed.length > 0 || fill !== undefined) {
        const current = await repository.required(character.id);
        await repository.updateBuild(
          character.id,
          applyCharacterCommand(current.build, {
            kind: "batch",
            commands: [
              // New choices first: they name occurrences a removal could
              // take with it.
              ...(fill === undefined ? [] : [fill]),
              ...removed.map((occurrenceId) => ({
                kind: "remove-occurrence" as const,
                occurrenceId,
              })),
            ],
          }),
        );
      }
      await repository.updateMetadata(character.id, {
        profileBinding: materialized.binding,
      });
      dialog.current?.close();
      onUpdated();
    } finally {
      setUpdating(false);
    }
  }

  return (
    <dialog
      className="content-update-dialog dialog-shell"
      ref={dialog}
      aria-labelledby="content-update-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="content-update-title">{dialogTitle(name, move)}</h2>
        <button
          aria-label="Close"
          className="button-icon dialog-close"
          title="Close"
          type="button"
          onClick={close}
        >
          <Icon name="remove" />
        </button>
      </header>
      <div className="content-update-body">
        <p>{introduction(name, target, move)}</p>
        {error !== undefined ? (
          <p className="error" role="alert">
            Couldn&apos;t check what would change: {error}
          </p>
        ) : summary === undefined ? (
          <LoadingPane label="Checking what would change…" detail={progress} />
        ) : (
          <ContentUpdateSummaryView
            name={name}
            summary={summary}
            campaignName={
              target.kind === "campaign" ? target.campaign.name : undefined
            }
          />
        )}
        <p className="field-help">
          Updating can&apos;t be undone from here. If you want to keep the
          current version, download a backup first.
        </p>
      </div>
      <footer>
        <button
          className="dialog-footer-start"
          type="button"
          onClick={() =>
            void downloadBackup().catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : String(reason),
              ),
            )
          }
        >
          <Icon name="download" /> Download a backup
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={
            summary === undefined ||
            materialized === undefined ||
            !summary.canUpdate ||
            updating
          }
          onClick={() =>
            void update().catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : String(reason),
              ),
            )
          }
        >
          {updating ? "Updating…" : confirmLabel(name, move)}
        </button>
      </footer>
    </dialog>
  );
}
