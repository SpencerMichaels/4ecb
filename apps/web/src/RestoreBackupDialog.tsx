import { useEffect, useRef } from "react";

import { Icon } from "./Icon";

/** "Lily", "Lily and Hu", "Lily, Beatrix and Hu". */
export function naturalList(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}

/** The dialog's one sentence, naming the library's conflicting characters. */
export function restoreConflictText(names: readonly string[]): string {
  return names.length === 1
    ? `1 character in this backup is already in your library: ${naturalList(names)}.`
    : `${names.length} characters in this backup are already in your library: ${naturalList(names)}.`;
}

/** The confirmation after a restore, which lands in the library rather than
 *  on Settings: "Restored 23 characters." Characters the backup held in the
 *  trash are restored there, so they are counted separately. */
export function restoreSuccessText(count: number, trashed = 0): string {
  const characters = count === 1 ? "1 character" : `${count} characters`;
  return trashed === 0
    ? `Restored ${characters}.`
    : `Restored ${characters} (${trashed} to the trash).`;
}

/** Asks what to do when a backup holds characters already in the library:
 *  replace them, keep both (the backup's copies are added alongside), or
 *  cancel. Only shown when there is a conflict; focus starts on Cancel and
 *  Esc cancels. */
export function RestoreBackupDialog({
  names,
  onReplace,
  onKeepBoth,
  onCancel,
}: {
  /** The library's names for the characters the backup would replace. */
  readonly names: readonly string[];
  readonly onReplace: () => void;
  readonly onKeepBoth: () => void;
  readonly onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
    // showModal focuses the header's close button; start on Cancel instead.
    cancel.current?.focus();
  }, []);
  const finish = (then: () => void) => {
    dialog.current?.close();
    then();
  };
  return (
    <dialog
      aria-describedby="restore-backup-text"
      aria-labelledby="restore-backup-title"
      className="restore-backup-dialog dialog-shell"
      ref={dialog}
      role="alertdialog"
      onCancel={(event) => {
        event.preventDefault();
        finish(onCancel);
      }}
    >
      <header>
        <h2 id="restore-backup-title">Restore backup</h2>
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
      <p className="restore-backup-body" id="restore-backup-text">
        {restoreConflictText(names)}
      </p>
      <footer>
        <button ref={cancel} type="button" onClick={() => finish(onCancel)}>
          Cancel
        </button>
        <button type="button" onClick={() => finish(onKeepBoth)}>
          Keep both
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={() => finish(onReplace)}
        >
          {names.length === 1 ? "Replace it" : "Replace them"}
        </button>
      </footer>
    </dialog>
  );
}
