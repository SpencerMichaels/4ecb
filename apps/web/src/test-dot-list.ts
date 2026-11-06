/**
 * Test helper: rendered markup with each DotList written as its visible
 * text ("A · B"), so assertions read as the card prints. The list's closing
 * tags stay; only the openings and item boundaries are rewritten.
 */
export function dotted(markup: string): string {
  return markup
    .replaceAll(
      /<span class="dot-list(?: [^"]*)?"><span class="dot-list-item">/g,
      "",
    )
    .replaceAll('</span> <span class="dot-list-item">', " · ");
}
