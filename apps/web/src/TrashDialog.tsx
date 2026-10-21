import { useEffect, useRef, useState } from "react";

import type { CharacterLibraryEntry } from "@4ecb/browser-storage";

import {
  characterCount,
  characterIdentity,
  trashOrder,
} from "./character-library-ui";
import { EmptyTrashDialog } from "./EmptyTrashDialog";
import { Icon } from "./Icon";
import { PortraitImage } from "./PortraitEditor";
import { exactDateTime, relativeDay } from "./relative-time";
import { useArmedAction } from "./useArmedAction";

/** Characters moved to trash, most recently trashed first: restore them,
 *  delete one for good (a second click confirms, like moving to trash), or
 *  empty the whole trash after an explicit confirmation. Always reachable,
 *  even when empty. */
export function TrashDialog({
  characters,
  onRestore,
  onPurge,
  onEmpty,
  onClose,
}: {
  readonly characters: readonly CharacterLibraryEntry[];
  readonly onRestore: (character: CharacterLibraryEntry) => void;
  readonly onPurge: (character: CharacterLibraryEntry) => void;
  readonly onEmpty: () => void;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const emptyButton = useRef<HTMLButtonElement>(null);
  const purgeAction = useArmedAction("trash-purge-trigger");
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);
  const ordered = trashOrder(characters);
  const now = new Date();
  return (
    <>
      <dialog
        aria-labelledby="trash-title"
        className="trash-dialog dialog-shell"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          // Esc first disarms a pending permanent delete, then closes.
          if (characters.some(({ id }) => purgeAction.isArmed(id))) return;
          onClose();
        }}
      >
        <header>
          <h2 id="trash-title">
            Trash{" "}
            <span className="trash-dialog-count">({characters.length})</span>
          </h2>
          <button
            aria-label="Close"
            className="button-icon dialog-close"
            ref={closeButton}
            title="Close"
            type="button"
            onClick={onClose}
          >
            <Icon name="remove" />
          </button>
        </header>
        {characters.length === 0 ? (
          <p className="trash-empty">The trash is empty.</p>
        ) : null}
        <ul className="trash-list">
          {ordered.map((character) => {
            const purgeArmed = purgeAction.isArmed(character.id);
            const trashed =
              character.deletedAt === undefined
                ? undefined
                : relativeDay(character.deletedAt, now);
            return (
              <li key={character.id}>
                <PortraitImage
                  className="trash-portrait"
                  name={character.title}
                  portrait={
                    character.renderedPortraitDataUrl === undefined
                      ? undefined
                      : { renderedDataUrl: character.renderedPortraitDataUrl }
                  }
                />
                <div className="trash-identity">
                  <strong>{character.title}</strong>
                  <span>
                    {characterIdentity(character)}
                    {trashed === undefined ? null : (
                      <>
                        {" · "}
                        <span title={exactDateTime(character.deletedAt ?? "")}>
                          Trashed {trashed}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="character-card-actions">
                  <button
                    aria-label={`Restore ${character.title}`}
                    className="character-card-action"
                    title="Restore"
                    type="button"
                    onClick={() => {
                      purgeAction.disarm();
                      onRestore(character);
                    }}
                  >
                    <Icon name="undo" />
                  </button>
                  <button
                    aria-label={
                      purgeArmed
                        ? `Confirm deleting ${character.title} permanently`
                        : `Delete ${character.title} permanently`
                    }
                    className="character-card-action danger-action"
                    data-armed={purgeArmed || undefined}
                    data-trash-purge-trigger={character.id}
                    title={
                      purgeArmed
                        ? "Click again to delete permanently"
                        : "Delete permanently"
                    }
                    type="button"
                    onClick={() => {
                      if (!purgeArmed) {
                        purgeAction.arm(character.id);
                        return;
                      }
                      purgeAction.disarm();
                      onPurge(character);
                    }}
                  >
                    <Icon name={purgeArmed ? "warning" : "trash"} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <footer>
          <span className="dialog-footer-start trash-hint">
            Restore puts a character back in the library.
          </span>
          <button
            className="danger-button"
            disabled={characters.length === 0}
            ref={emptyButton}
            title={
              characters.length === 0
                ? "The trash is empty"
                : `Permanently delete ${characterCount(characters.length)}`
            }
            type="button"
            onClick={() => {
              purgeAction.disarm();
              setConfirmingEmpty(true);
            }}
          >
            <Icon name="trash" />
            Empty trash…
          </button>
        </footer>
      </dialog>
      {/* A sibling, not a child, so its Esc never reaches the trash dialog. */}
      {confirmingEmpty ? (
        <EmptyTrashDialog
          names={ordered.map(({ title }) => title)}
          onCancel={() => {
            setConfirmingEmpty(false);
            emptyButton.current?.focus();
          }}
          onConfirm={() => {
            setConfirmingEmpty(false);
            // Empty trash is about to be disabled; keep focus in the dialog.
            closeButton.current?.focus();
            onEmpty();
          }}
        />
      ) : null}
    </>
  );
}
