// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmptyTrashDialog } from "./EmptyTrashDialog";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/* The "Empty trash?" confirmation's focus and Esc behaviour, formerly an
 * owner check in docs/visual-review-checklist.md. */
describe("EmptyTrashDialog focus and Esc", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom has no modal dialogs.
    HTMLDialogElement.prototype.showModal ??= function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function close(
      this: HTMLDialogElement,
    ) {
      this.open = false;
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function open() {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    act(() =>
      root.render(
        createElement(EmptyTrashDialog, {
          names: ["Aldric Vey"],
          onCancel,
          onConfirm,
        }),
      ),
    );
    const dialog = container.querySelector("dialog")!;
    return { dialog, onCancel, onConfirm };
  }

  it("opens modal with focus on Cancel, not Delete", () => {
    const { dialog } = open();
    expect(dialog.open).toBe(true);
    expect(document.activeElement?.textContent).toBe("Cancel");
  });

  it("closes only itself on Esc, cancelling without deleting", () => {
    const { dialog, onCancel, onConfirm } = open();
    const event = new Event("cancel", { cancelable: true });
    act(() => {
      dialog.dispatchEvent(event);
    });
    // The browser's own close is prevented, so the trash dialog behind it
    // isn't closed with it; the confirmation closes itself.
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
