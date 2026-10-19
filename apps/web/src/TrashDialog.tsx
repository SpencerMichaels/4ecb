import { useEffect, useRef } from "react";

import type { CharacterLibraryEntry } from "@4ecb/browser-storage";

import { Icon } from "./Icon";
import { useArmedAction } from "./useArmedAction";

/** Characters moved to trash: restore them, or delete one for good (a second
 *  click confirms, like moving to trash). Always reachable, even when empty. */
export function TrashDialog({
  characters,
  onRestore,
  onPurge,
  onClose,
}: {
  readonly characters: readonly CharacterLibraryEntry[];
  readonly onRestore: (character: CharacterLibraryEntry) => void;
  readonly onPurge: (character: CharacterLibraryEntry) => void;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const purgeAction = useArmedAction("trash-purge-trigger");
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
  }, []);
  return (
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
        <h2 id="trash-title">Trash</h2>
        <button
          aria-label="Close"
          className="button-icon dialog-close"
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
        {characters.map((character) => {
          const purgeArmed = purgeAction.isArmed(character.id);
          return (
            <li key={character.id}>
              <span>{character.title}</span>
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
    </dialog>
  );
}
