// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareError, shareFailureMessage } from "./character-share";

vi.mock("./character-export", () => ({ shareStoredCharacter: vi.fn() }));

const { ReceiveCharacterDialog, ShareCharacterDialog } =
  await import("./CharacterShareDialogs");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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
  vi.useRealTimers();
});

function buttons(): string[] {
  return [...container.querySelectorAll("footer button")].map(
    (button) => button.textContent?.trim() ?? "",
  );
}

function button(label: string): HTMLButtonElement {
  return [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  )!;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ShareCharacterDialog", () => {
  it("explains inside the dialog when the server doesn't share", () => {
    const share = vi.fn();
    act(() =>
      root.render(
        createElement(ShareCharacterDialog, {
          characterId: "lily",
          characterName: "Lily",
          enabled: false,
          share,
          onClose: () => undefined,
        }),
      ),
    );
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.textContent).toContain(shareFailureMessage("disabled"));
    expect(share).not.toHaveBeenCalled();
    expect(buttons()).toEqual(["Close"]);
  });

  it("uploads, shows the grouped code, counts down and offers Share again", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let clock = 1_000;
    const share = vi
      .fn()
      .mockResolvedValue({ code: "123456", expiresAt: 1_000 + 600_000 });
    act(() =>
      root.render(
        createElement(ShareCharacterDialog, {
          characterId: "lily",
          characterName: "Lily",
          enabled: true,
          share,
          now: () => clock,
          onClose: () => undefined,
        }),
      ),
    );
    expect(container.textContent).toContain("Uploading Lily…");
    expect(buttons()).toEqual(["Cancel"]);
    await flush();
    expect(share).toHaveBeenCalledWith("lily", {
      signal: expect.any(AbortSignal),
    });
    expect(container.querySelector(".share-code")?.textContent).toBe("123 456");
    expect(container.querySelector(".share-countdown")?.textContent).toBe(
      "10:00",
    );
    expect(buttons()).toEqual(["Close", "Copy code"]);

    clock += 61_000;
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector(".share-countdown")?.textContent).toBe(
      "8:59",
    );

    clock += 600_000;
    act(() => vi.advanceTimersByTime(1000));
    expect(container.textContent).toContain("This code has expired.");
    expect(buttons()).toEqual(["Close", "Share again"]);

    act(() => button("Share again").click());
    expect(share).toHaveBeenCalledTimes(2);
  });

  it("shows a relay refusal with Try again", async () => {
    const share = vi.fn().mockRejectedValue(new ShareError("ip-limit"));
    act(() =>
      root.render(
        createElement(ShareCharacterDialog, {
          characterId: "lily",
          characterName: "Lily",
          enabled: true,
          share,
          onClose: () => undefined,
        }),
      ),
    );
    await flush();
    expect(container.querySelector("[role=alert]")?.textContent).toBe(
      shareFailureMessage("ip-limit"),
    );
    expect(buttons()).toEqual(["Close", "Try again"]);
  });

  it("cancels the upload when closed", () => {
    let signal: AbortSignal | undefined;
    const share = vi.fn(
      (_id: string, options?: { readonly signal?: AbortSignal }) => {
        signal = options?.signal;
        return new Promise<never>(() => undefined);
      },
    );
    const onClose = vi.fn();
    act(() =>
      root.render(
        createElement(ShareCharacterDialog, {
          characterId: "lily",
          characterName: "Lily",
          enabled: true,
          share,
          onClose,
        }),
      ),
    );
    act(() => button("Cancel").click());
    expect(signal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ReceiveCharacterDialog", () => {
  function type(value: string): void {
    const input = container.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function render(props: {
    readonly receive: (code: string) => Promise<unknown>;
    readonly onReceived?: (value: unknown) => Promise<(() => void) | undefined>;
    readonly onClose?: () => void;
    readonly enabled?: boolean;
  }) {
    act(() =>
      root.render(
        createElement(ReceiveCharacterDialog, {
          enabled: props.enabled ?? true,
          receive: props.receive,
          onReceived: props.onReceived ?? (() => Promise.resolve(undefined)),
          onClose: props.onClose ?? (() => undefined),
        }),
      ),
    );
  }

  it("enables Receive for six digits, pasted with spaces or a dash", () => {
    render({ receive: vi.fn() });
    const input = container.querySelector("input")!;
    expect(input.inputMode).toBe("numeric");
    expect(button("Receive").disabled).toBe(true);
    type("12345");
    expect(button("Receive").disabled).toBe(true);
    type("123-456");
    expect(button("Receive").disabled).toBe(false);
    type(" 123 456 ");
    expect(button("Receive").disabled).toBe(false);
    type("12345a");
    expect(button("Receive").disabled).toBe(true);
  });

  it("keeps the field and says why when the code is wrong", async () => {
    const receive = vi.fn().mockRejectedValue(new ShareError("not-found"));
    const onClose = vi.fn();
    render({ receive, onClose });
    type("123 456");
    act(() => button("Receive").click());
    expect(receive).toHaveBeenCalledWith("123456", {
      signal: expect.any(AbortSignal),
    });
    await flush();
    expect(container.querySelector("[role=alert]")?.textContent).toBe(
      shareFailureMessage("not-found"),
    );
    expect(container.querySelector("input")?.value).toBe("123 456");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("imports what it received, closes, then runs the import's next step", async () => {
    const order: string[] = [];
    const value = { format: "4ecb-character-backup" };
    render({
      receive: () => Promise.resolve(value),
      onReceived: (received) => {
        order.push(received === value ? "imported" : "wrong");
        return Promise.resolve(() => order.push("asked"));
      },
      onClose: () => order.push("closed"),
    });
    type("654321");
    act(() => button("Receive").click());
    await flush();
    expect(order).toEqual(["imported", "closed", "asked"]);
  });

  it("explains inside the dialog when the server doesn't share", () => {
    render({ receive: vi.fn(), enabled: false });
    expect(container.textContent).toContain(shareFailureMessage("disabled"));
    expect(container.querySelector("input")).not.toBeNull();
    expect(button("Receive").disabled).toBe(true);
  });
});
