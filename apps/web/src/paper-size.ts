/** The printed sheet's paper: an app-wide preference, not per-character. */
export type PaperSize = "letter" | "a4";

export const PAPER_SIZE_STORAGE_KEY = "4ecb.paperSize.v1";

// Regions that use US Letter; everywhere else uses A4.
const LETTER_REGIONS: ReadonlySet<string> = new Set([
  "US",
  "CA",
  "MX",
  "PH",
  "CL",
  "CO",
  "VE",
  "GT",
  "CR",
  "PR",
  "DO",
  "SV",
  "NI",
  "PA",
  "BZ",
]);

/** Letter for Letter regions in the browser's preferred locales, else A4. */
export function localePaperSize(
  languages: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages,
): PaperSize {
  for (const language of languages) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(language).maximize().region;
    } catch {
      continue;
    }
    if (region !== undefined)
      return LETTER_REGIONS.has(region) ? "letter" : "a4";
  }
  return "letter";
}

export function storedPaperSize(): PaperSize {
  try {
    const stored = localStorage.getItem(PAPER_SIZE_STORAGE_KEY);
    if (stored === "letter" || stored === "a4") return stored;
  } catch {
    // Fall back to the locale default.
  }
  return localePaperSize();
}
