import type { EvaluatedCharacter } from "./evaluator";

/**
 * Diagnostics that make the occurrence they name a house rule in the legacy
 * sense: native `D20Choice::IsLegalChoice` clears a pick's `CharElement`
 * legal bit when its candidate fails the structural/prerequisite checks
 * (`choice.ineligible`, `prerequisite.failed`), and the occurrence was saved
 * or marked as a house rule, or campaign/source policy excludes it.
 * `prerequisite.unverified` is not one: the prerequisite is only unread.
 */
const HOUSE_RULE_OCCURRENCE_CODES: ReadonlySet<string> = new Set([
  "occurrence.houserule",
  "occurrence.campaign-restricted",
  "occurrence.source-unentitled",
  "choice.ineligible",
  "prerequisite.failed",
]);

/**
 * The legacy `legality` of each evaluated occurrence: "houserule" when it is
 * saved as one or the evaluation flags it as one, else "rules-legal". An
 * occurrence the evaluation granted carries no saved value, so its legality
 * comes from the evaluation alone, as native `CharElement` construction
 * starts legal.
 */
export function occurrenceLegality(
  evaluation: Pick<EvaluatedCharacter, "occurrences" | "diagnostics">,
): (occurrenceId: string) => "rules-legal" | "houserule" {
  const houseRuled = new Set<string>();
  for (const occurrence of evaluation.occurrences)
    if (occurrence.legality === "houserule") houseRuled.add(occurrence.id);
  for (const diagnostic of evaluation.diagnostics)
    if (
      diagnostic.occurrenceId !== undefined &&
      HOUSE_RULE_OCCURRENCE_CODES.has(diagnostic.code)
    )
      houseRuled.add(diagnostic.occurrenceId);
  return (occurrenceId) =>
    houseRuled.has(occurrenceId) ? "houserule" : "rules-legal";
}
