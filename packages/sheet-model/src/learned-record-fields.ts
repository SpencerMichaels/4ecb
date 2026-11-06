/**
 * One-word labels for a ritual's, alchemical formula's or martial
 * practice's fields (owner: card field labels are one word — "Cost", not
 * "Component Cost"). The one source for the card's subheader
 * (`print-item-presentation.ts`) and the printed reference entry
 * (`SheetLearnedReference.fields`), so the two can't drift. Fields not
 * listed keep their authored name.
 */
const LEARNED_RECORD_FIELD_LABELS: ReadonlyMap<string, string> = new Map([
  ["component cost", "Cost"],
  ["key skill", "Skill"],
  ["market price", "Price"],
  ["prerequisites", "Prerequisite"],
]);

/** The label a known record's field `name` prints under. */
export function learnedRecordFieldLabel(name: string): string {
  return (
    LEARNED_RECORD_FIELD_LABELS.get(name.trim().toLocaleLowerCase()) ??
    name.trim()
  );
}
