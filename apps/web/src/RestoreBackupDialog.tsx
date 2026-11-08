import { useEffect, useId, useRef } from "react";

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

/** The sentence asking about a character package (a .4ecb file or a
 *  shared character) whose characters are already in the library, active
 *  or in the trash: "Lily is already in your library." */
export function importConflictText(
  names: readonly string[],
  trashed: readonly boolean[] = [],
): string {
  if (names.length === 1)
    return trashed[0] === true
      ? `${names[0]!} is already in your library's trash.`
      : `${names[0]!} is already in your library.`;
  return `${names.length} characters in this file are already in your library: ${naturalList(names)}.`;
}

/** Asks what to do when a backup holds characters already in the library:
 *  replace them, keep both (the backup's copies are added alongside), or
 *  cancel. Only shown when there is a conflict. */
export function RestoreBackupDialog({
  names,
  ...actions
}: {
  /** The library's names for the characters the backup would replace. */
  readonly names: readonly string[];
  readonly onReplace: () => void;
  readonly onKeepBoth: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <CharacterConflictDialog
      title="Restore backup"
      text={restoreConflictText(names)}
      count={names.length}
      {...actions}
    />
  );
}

/** The one replace-or-keep-both question for characters already in the
 *  library (restoring a backup, importing a .4ecb file, receiving a shared
 *  character): Cancel, Keep both, Replace it/them. Focus starts on Cancel
 *  and Esc cancels. */
export function CharacterConflictDialog({
  title,
  text,
  count,
  onReplace,
  onKeepBoth,
  onCancel,
}: {
  readonly title: string;
  readonly text: string;
  /** How many characters would be replaced (picks "Replace it/them"). */
  readonly count: number;
  readonly onReplace: () => void;
  readonly onKeepBoth: () => void;
  readonly onCancel: () => void;
}) {
  const id = useId();
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
      aria-describedby={`${id}-text`}
      aria-labelledby={`${id}-title`}
      className="restore-backup-dialog dialog-shell"
      ref={dialog}
      role="alertdialog"
      onCancel={(event) => {
        event.preventDefault();
        finish(onCancel);
      }}
    >
      <header>
        <h2 id={`${id}-title`}>{title}</h2>
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
      <p className="restore-backup-body" id={`${id}-text`}>
        {text}
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
          {count === 1 ? "Replace it" : "Replace them"}
        </button>
      </footer>
    </dialog>
  );
}
