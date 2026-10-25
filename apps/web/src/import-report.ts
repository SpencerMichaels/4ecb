import type { Dnd4eImportReport } from "@4ecb/legacy-dnd4e";

import type { ToastInput } from "./Toasts";

/** Settings key for matching missing content by name on import (on unless "0"). */
export const IMPORT_NAME_MATCHING_STORAGE_KEY = "4ecb.importNameMatching.v1";

/**
 * The toast shown after a .dnd4e import with warnings. A clean import, and
 * records it matched by name, stay silent: success needs no notice.
 * Undefined when there is nothing to report.
 */
export function importReportToast(
  characterTitle: string,
  report: Dnd4eImportReport,
): ToastInput | undefined {
  const warnings = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity !== "info",
  );
  if (warnings.length === 0) return undefined;
  return {
    tone: warnings.some((warning) => warning.severity === "error")
      ? "error"
      : "warning",
    title: `Imported ${characterTitle} with warnings`,
    messages: warnings.map((warning) => warning.message),
  };
}
