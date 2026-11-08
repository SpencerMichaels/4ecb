import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  formatShareCode,
  isShareCode,
  normalizeShareCode,
  receiveSharedCharacter,
  shareBlocker,
  shareCountdownText,
  ShareError,
  shareFailureMessage,
  type ShareFailureKind,
  type UploadedShare,
} from "./character-share";
import { shareStoredCharacter } from "./character-export";
import { Icon } from "./Icon";

/**
 * Share and Receive (D122): the sharing device shows a 6-digit code with a
 * countdown; the receiving device types it. Both dialogs always open, and
 * say inside them why sharing can't happen when this server doesn't host
 * the relay or the browser is offline.
 */

/** Whether the browser says it's online, following its online/offline
 *  events. */
function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => globalThis.navigator?.onLine ?? true,
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** Opens a <dialog> modally once mounted (jsdom lacks showModal). */
function useModal(): RefObject<HTMLDialogElement | null> {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const current = dialog.current;
    if (current !== null && !current.open) current.showModal?.();
  }, []);
  return dialog;
}

function failureMessage(reason: unknown): string {
  if (reason instanceof ShareError) return reason.message;
  return reason instanceof Error ? reason.message : String(reason);
}

type ShareState =
  | { readonly phase: "blocked"; readonly kind: ShareFailureKind }
  | { readonly phase: "uploading" }
  | { readonly phase: "shared"; readonly share: UploadedShare }
  | { readonly phase: "expired" }
  | { readonly phase: "failed"; readonly message: string };

/** Uploads the character as soon as it opens, then shows the code and the
 *  time left; once it expires, offers Share again. Closing during the
 *  upload cancels it. */
export function ShareCharacterDialog({
  characterId,
  characterName,
  enabled,
  onClose,
  share = shareStoredCharacter,
  now = Date.now,
}: {
  readonly characterId: string;
  readonly characterName: string;
  /** runtime-config.json's features.characterShare; undefined until it
   *  loads (or when it couldn't). */
  readonly enabled: boolean | undefined;
  readonly onClose: () => void;
  /** Tests replace the upload. */
  readonly share?: typeof shareStoredCharacter;
  readonly now?: () => number;
}) {
  const id = useId();
  const dialog = useModal();
  const online = useOnline();
  const [state, setState] = useState<ShareState>({ phase: "uploading" });
  const [clock, setClock] = useState(now);
  const [copied, setCopied] = useState<"copied" | "failed">();
  const upload = useRef<AbortController | undefined>(undefined);

  const start = useCallback(() => {
    upload.current?.abort();
    setCopied(undefined);
    const blocker = shareBlocker(enabled);
    if (blocker !== undefined) {
      setState({ phase: "blocked", kind: blocker });
      return;
    }
    const controller = new AbortController();
    upload.current = controller;
    setState({ phase: "uploading" });
    share(characterId, { signal: controller.signal })
      .then((uploaded) => {
        if (controller.signal.aborted) return;
        setClock(now());
        setState({ phase: "shared", share: uploaded });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({ phase: "failed", message: failureMessage(reason) });
      });
  }, [characterId, enabled, share, now]);

  useEffect(() => {
    start();
    return () => upload.current?.abort();
  }, [start]);

  // The countdown ticks each second while the code is shown.
  useEffect(() => {
    if (state.phase !== "shared") return;
    const tick = () => {
      const current = now();
      setClock(current);
      if (current >= state.share.expiresAt) setState({ phase: "expired" });
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [state, now]);

  const close = () => {
    upload.current?.abort();
    dialog.current?.close();
    onClose();
  };

  const copy = (code: string) => {
    void navigator.clipboard
      .writeText(code)
      .then(() => setCopied("copied"))
      .catch(() => setCopied("failed"));
  };

  // Offline is checked live: the explanation follows the connection.
  const blockedKind =
    state.phase === "blocked" && state.kind === "offline" && online
      ? undefined
      : state.phase === "blocked"
        ? state.kind
        : undefined;

  return (
    <dialog
      aria-busy={state.phase === "uploading" || undefined}
      aria-labelledby={`${id}-title`}
      className="share-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id={`${id}-title`}>Share {characterName}</h2>
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
      <div aria-live="polite" className="share-dialog-body">
        {state.phase === "uploading" ? (
          <div className="share-dialog-status">
            <span aria-hidden="true" className="loading-spinner" />
            <p>Uploading {characterName}…</p>
          </div>
        ) : state.phase === "shared" ? (
          <>
            <p>
              On the other device, open the character library, choose{" "}
              <strong>Receive</strong> and enter this code:
            </p>
            <p className="share-code" aria-label={state.share.code}>
              {formatShareCode(state.share.code)}
            </p>
            <p className="share-dialog-expiry">
              Expires in{" "}
              <span className="share-countdown">
                {shareCountdownText(state.share.expiresAt, clock)}
              </span>
              . The code works once.
            </p>
          </>
        ) : state.phase === "expired" ? (
          <p>
            This code has expired. Choose Share again for a new one if the
            character wasn&apos;t received.
          </p>
        ) : state.phase === "failed" ? (
          <p className="share-dialog-problem" role="alert">
            {state.message}
          </p>
        ) : blockedKind === undefined ? (
          <p>You&apos;re back online. Choose Try again to share.</p>
        ) : (
          <p className="share-dialog-problem">
            {shareFailureMessage(blockedKind)}
          </p>
        )}
      </div>
      <footer>
        {state.phase === "shared" ? (
          <span className="dialog-footer-start share-copy-status">
            {copied === "copied"
              ? "Copied."
              : copied === "failed"
                ? "Couldn't copy: type the code instead."
                : null}
          </span>
        ) : null}
        <button type="button" onClick={close}>
          {state.phase === "uploading" ? "Cancel" : "Close"}
        </button>
        {state.phase === "shared" ? (
          <button type="button" onClick={() => copy(state.share.code)}>
            <Icon name="duplicate" /> Copy code
          </button>
        ) : state.phase === "expired" ? (
          <button type="button" onClick={start}>
            Share again
          </button>
        ) : state.phase === "failed" ||
          (state.phase === "blocked" && state.kind === "offline") ? (
          <button type="button" disabled={!online} onClick={start}>
            Try again
          </button>
        ) : null}
      </footer>
    </dialog>
  );
}

/** Asks for the code, downloads the character and hands its package to
 *  `onReceived` (the library's .4ecb import flow). A failure stays in the
 *  dialog with the code, so it can be corrected. When the import needs a
 *  question answered (a character already in the library), `onReceived`
 *  returns that step, which runs once this dialog has closed. */
export function ReceiveCharacterDialog({
  enabled,
  onReceived,
  onClose,
  receive = receiveSharedCharacter,
}: {
  readonly enabled: boolean | undefined;
  /** Imports the received package; the dialog closes once it resolves,
   *  then runs the step it returned, if any. */
  readonly onReceived: (value: unknown) => Promise<(() => void) | undefined>;
  readonly onClose: () => void;
  /** Tests replace the download. */
  readonly receive?: typeof receiveSharedCharacter;
}) {
  const id = useId();
  const dialog = useModal();
  const online = useOnline();
  const [input, setInput] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [problem, setProblem] = useState<string>();
  const download = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => download.current?.abort(), []);

  const code = normalizeShareCode(input);
  const blocker = shareBlocker(enabled, online);
  const ready = blocker === undefined && isShareCode(code) && !receiving;

  const close = () => {
    download.current?.abort();
    dialog.current?.close();
    onClose();
  };

  const submit = () => {
    if (!ready) return;
    const controller = new AbortController();
    download.current = controller;
    setReceiving(true);
    setProblem(undefined);
    receive(code, { signal: controller.signal })
      .then(async (value) => {
        if (controller.signal.aborted) return;
        const next = await onReceived(value);
        dialog.current?.close();
        onClose();
        next?.();
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setProblem(failureMessage(reason));
        setReceiving(false);
      });
  };

  return (
    <dialog
      aria-busy={receiving || undefined}
      aria-labelledby={`${id}-title`}
      className="share-dialog dialog-shell"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <header>
          <h2 id={`${id}-title`}>Receive a character</h2>
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
        <div className="share-dialog-body">
          {blocker === undefined ? (
            <p id={`${id}-hint`}>
              Enter the 6-digit code shown on the device sharing the character.
            </p>
          ) : (
            <p className="share-dialog-problem" id={`${id}-hint`}>
              {shareFailureMessage(blocker)}
            </p>
          )}
          <label className="share-code-field">
            <span>Code</span>
            <input
              aria-describedby={`${id}-hint`}
              autoComplete="one-time-code"
              // Focus lands in the field when the dialog opens.
              autoFocus
              className="share-code-input"
              disabled={receiving || enabled !== true}
              enterKeyHint="go"
              inputMode="numeric"
              maxLength={16}
              placeholder="123 456"
              spellCheck={false}
              type="text"
              value={input}
              onChange={(event) => {
                setInput(event.currentTarget.value);
                setProblem(undefined);
              }}
            />
          </label>
          {receiving ? (
            <div className="share-dialog-status" aria-live="polite">
              <span aria-hidden="true" className="loading-spinner" />
              <p>Receiving…</p>
            </div>
          ) : null}
          {problem === undefined ? null : (
            <p className="share-dialog-problem" role="alert">
              {problem}
            </p>
          )}
        </div>
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button disabled={!ready} type="submit">
            Receive
          </button>
        </footer>
      </form>
    </dialog>
  );
}
