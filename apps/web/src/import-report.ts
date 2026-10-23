import type { Dnd4eImportReport } from "@4ecb/legacy-dnd4e";

import type { ToastInput } from "./Toasts";

/** Settings key for matching missing content by name on import (on unless "0"). */
export const IMPORT_NAME_MATCHING_STORAGE_KEY = "4ecb.importNameMatching.v1";

/** How many name matches the import toast lists before summarizing. */
const LISTED_MATCHES = 8;

/**
 * The toast shown after a .dnd4e import: its warnings, then the records the
 * import matched by name because the file saved IDs the active content
 * lacks. Undefined when there is nothing to report.
 */
export function importReportToast(
  characterTitle: string,
  report: Dnd4eImportReport,
): ToastInput | undefined {
  const warnings = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity !== "info",
  );
  const matched = report.definitionMatching?.matched ?? [];
  if (warnings.length === 0 && matched.length === 0) return undefined;
  const listed = matched
    .slice(0, LISTED_MATCHES)
    .map((match) =>
      match.savedName === match.definitionName
        ? `${match.definitionName} (${match.type})`
        : `${match.savedName} as ${match.definitionName} (${match.type})`,
    );
  const more = matched.length - listed.length;
  const matchMessages =
    matched.length === 0
      ? []
      : [
          `Matched ${matched.length} saved ${
            matched.length === 1 ? "record" : "records"
          } your content doesn't have by name: ${listed.join("; ")}${
            more > 0 ? `; and ${more} more` : ""
          }. Exports use the matched records; the builder's Diagnostics lists them all.`,
        ];
  return {
    tone: warnings.some((warning) => warning.severity === "error")
      ? "error"
      : "warning",
    title:
      warnings.length > 0
        ? `Imported ${characterTitle} with warnings`
        : `Imported ${characterTitle}, matching content by name`,
    messages: [...warnings.map((warning) => warning.message), ...matchMessages],
  };
}
