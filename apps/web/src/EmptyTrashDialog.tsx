import { useEffect, useRef } from "react";

import { characterCount } from "./character-library-ui";
import { Icon } from "./Icon";

/** Names listed before the rest are summarized as "and N more". */
const LISTED_NAMES = 8;

/** Confirms permanently deleting every trashed character. Too destructive
 *  for the two-click arm, so it asks explicitly; focus starts on Cancel and
 *  Esc cancels. */
export function EmptyTrashDialog({
  names,
  onCancel,
  onConfirm,
}: {
  readonly names: readonly string[];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal();
    // showModal focuses the header's close button; start on Cancel instead.
    cancel.current?.focus();
  }, []);
  // Close the modal first so the trash dialog behind it is no longer inert
  // and can take focus back.
  const finish = (then: () => void) => {
    dialog.current?.close();
    then();
  };
  const count = characterCount(names.length);
  const listed = names.slice(0, LISTED_NAMES);
  const unlisted = names.length - listed.length;
  return (
    <dialog
      aria-describedby="empty-trash-text"
      aria-labelledby="empty-trash-title"
      className="empty-trash-dialog dialog-shell"
      ref={dialog}
      role="alertdialog"
      onCancel={(event) => {
        event.preventDefault();
        finish(onCancel);
      }}
    >
      <header>
        <h2 id="empty-trash-title">Empty trash?</h2>
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
      <div className="empty-trash-body">
        <p id="empty-trash-text">
          Permanently delete {count}? This can&rsquo;t be undone.
        </p>
        <ul>
          {listed.map((name, index) => (
            <li key={index}>{name}</li>
          ))}
          {unlisted > 0 ? <li>and {unlisted} more</li> : null}
        </ul>
      </div>
      <footer>
        <button ref={cancel} type="button" onClick={() => finish(onCancel)}>
          Cancel
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={() => finish(onConfirm)}
        >
          Delete {count}
        </button>
      </footer>
    </dialog>
  );
}
