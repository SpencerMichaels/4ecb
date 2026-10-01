import { afterEach, describe, expect, it, vi } from "vitest";
import { printWithFonts, readyPrintFonts } from "./print-fonts";

afterEach(() => vi.unstubAllGlobals());

describe("print icon font readiness", () => {
  it("loads the selected glyph before measuring/printing", async () => {
    let finish: () => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
    const print = vi.fn();
    vi.stubGlobal("window", {
      print,
      requestAnimationFrame: (callback: () => void) => callback(),
    });
    const pending = printWithFonts();
    expect(load).toHaveBeenCalledWith('12px "4ecb Nerd Symbols"', "\uEEF5");
    expect(print).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(print).toHaveBeenCalledOnce();
  });
  it("does not block readable text when the icon font fails", async () => {
    vi.stubGlobal("document", {
      fonts: { load: () => Promise.reject(new Error("missing")) },
    });
    await expect(readyPrintFonts()).resolves.toBeUndefined();
  });
  it("works without a browser font API", async () => {
    vi.stubGlobal("document", {});
    await expect(readyPrintFonts()).resolves.toBeUndefined();
  });
});
