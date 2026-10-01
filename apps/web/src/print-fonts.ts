/** Load selected icon glyphs before measuring cards or opening print. */
export async function readyPrintFonts(): Promise<void> {
  if (typeof document === "undefined" || document.fonts === undefined) return;
  try {
    await document.fonts.load('12px "4ecb Nerd Symbols"', "\uEEF5");
    await document.fonts.ready;
  } catch {
    // A missing decorative icon must not prevent printing readable card text.
  }
}

export async function printWithFonts(): Promise<void> {
  await readyPrintFonts();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  window.print();
}
