export const DEFAULT_PRINT_CARD_TEXT_SIZE = 8;
export const MIN_PRINT_CARD_TEXT_SIZE = 6;
export const MAX_PRINT_CARD_TEXT_SIZE = 10;

export function preferredPrintCardTextSize(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined || value === "")
    return DEFAULT_PRINT_CARD_TEXT_SIZE;
  const size = Number(value);
  return Number.isFinite(size) && size >= 6 && size <= MAX_PRINT_CARD_TEXT_SIZE
    ? Math.max(MIN_PRINT_CARD_TEXT_SIZE, Math.round(size * 2) / 2)
    : DEFAULT_PRINT_CARD_TEXT_SIZE;
}

/** Try the preferred size first; never enlarge a dense card beyond it. */
export function printCardFontSizes(preferred: number): readonly number[] {
  const sizes: number[] = [];
  for (
    let size = preferredPrintCardTextSize(preferred);
    size > MIN_PRINT_CARD_TEXT_SIZE;
    size -= 0.5
  )
    sizes.push(size);
  return [...sizes, MIN_PRINT_CARD_TEXT_SIZE];
}
