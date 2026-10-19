import { useCallback, useRef, useState } from "react";

import { Icon } from "./Icon";

export interface Toast {
  readonly id: number;
  readonly tone: "error" | "warning";
  readonly title: string;
  readonly messages: readonly string[];
}

export type ToastInput = Omit<Toast, "id">;

/** Page-local toast queue. Toasts stay until dismissed: they report real
 *  failures or warnings that the reader may need time to act on. */
export function useToasts() {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(0);
  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

/** Floats over the page (fixed, bottom-right) so a toast never displaces the
 *  page's contents. The region is always mounted so live announcements fire. */
export function ToastRegion({
  toasts,
  onDismiss,
}: {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: number) => void;
}) {
  return (
    <section className="toast-region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <Icon name={toast.tone === "error" ? "circle-x" : "warning"} />
          <div className="toast-body">
            <strong>{toast.title}</strong>
            {toast.messages.length === 1 ? (
              <p>{toast.messages[0]}</p>
            ) : (
              <ul>
                {toast.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            aria-label={`Dismiss: ${toast.title}`}
            className="toast-dismiss icon-only-button button-icon"
            title="Dismiss"
            type="button"
            onClick={() => onDismiss(toast.id)}
          >
            <Icon name="remove" />
          </button>
        </div>
      ))}
    </section>
  );
}
