import { useEffect, useRef, useState } from "react";

import {
  CharacterRepository,
  type ContentProfileDefinition,
} from "@4ecb/browser-storage";
import {
  applyCharacterCommand,
  type CharacterRecord,
} from "@4ecb/character-domain";
import type { ContentPackManifest } from "@4ecb/content-pack";

import {
  activeProfileBinding,
  describeContentUpdate,
  type ContentUpdateSummary,
} from "./content-update";
import { Icon } from "./Icon";
import { RulesWorkerClient } from "./rules-client";

const repository = new CharacterRepository();

function download(name: string, contents: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Explains, in player terms, what moving a character onto the active content
 * would change, and applies it only when the player confirms.
 */
export function ContentUpdateDialog({
  character,
  target,
  activeProfile,
  onUpdated,
  onClose,
}: {
  readonly character: CharacterRecord;
  readonly target: ContentPackManifest;
  readonly activeProfile: ContentProfileDefinition | undefined;
  readonly onUpdated: () => void;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<ContentUpdateSummary>();
  const [error, setError] = useState<string>();
  const [updating, setUpdating] = useState(false);
  const name = character.title || "this character";

  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const client = new RulesWorkerClient();
    client
      .previewProfileMigration(
        character.build,
        target.packId,
        character.profileBinding?.packId,
        character.profileBinding?.contentDigest,
      )
      .then((preview) => {
        if (!cancelled) setSummary(describeContentUpdate(preview));
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => client.terminate());
    return () => {
      cancelled = true;
    };
  }, [character, target.packId]);

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
    setUpdating(true);
    try {
      const removed = summary?.removedOccurrenceIds ?? [];
      if (removed.length > 0) {
        const current = await repository.required(character.id);
        await repository.updateBuild(
          character.id,
          applyCharacterCommand(current.build, {
            kind: "batch",
            commands: removed.map((occurrenceId) => ({
              kind: "remove-occurrence" as const,
              occurrenceId,
            })),
          }),
        );
      }
      await repository.updateMetadata(character.id, {
        profileBinding: activeProfileBinding(target, activeProfile),
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
        <div>
          <p className="eyebrow">Game content update</p>
          <h2 id="content-update-title">Update {name} to the new content?</h2>
        </div>
        <button
          aria-label="Close"
          className="button-icon dialog-close"
          type="button"
          onClick={close}
        >
          <Icon name="remove" />
        </button>
      </header>
      <div className="content-update-body">
        <p>
          {name} was built with an older version of your game content. Updating
          uses the current content ({target.name}) from now on.
        </p>
        {error !== undefined ? (
          <p className="error" role="alert">
            Couldn&apos;t check what would change: {error}
          </p>
        ) : summary === undefined ? (
          <p aria-live="polite">Checking what would change…</p>
        ) : (
          <div aria-live="polite">
            {!summary.changesKnown ? (
              <p>
                The older content isn&apos;t installed anymore, so we can&apos;t
                list exactly what will change.
              </p>
            ) : summary.changes.length +
                summary.updatedRules.length +
                summary.removals.length +
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
            {summary.missing.length === 0 ? null : (
              <>
                <h3>Not in the new content</h3>
                <p>
                  {name} uses these, but the new content doesn&apos;t include
                  them: {summary.missing.join(", ")}.
                </p>
              </>
            )}
            {summary.canUpdate ? null : (
              <p className="profile-warning">
                {name} can&apos;t be calculated with the new content, so it
                can&apos;t be updated yet.
              </p>
            )}
          </div>
        )}
        <p className="field-help">
          Updating can&apos;t be undone from here. If you want to keep the
          current version, download a backup first.
        </p>
      </div>
      <footer className="content-update-actions">
        <button
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
        <span className="content-update-spacer" />
        <button type="button" onClick={close}>
          Not now
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={summary === undefined || !summary.canUpdate || updating}
          onClick={() =>
            void update().catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : String(reason),
              ),
            )
          }
        >
          {updating ? "Updating…" : `Update ${name}`}
        </button>
      </footer>
    </dialog>
  );
}
