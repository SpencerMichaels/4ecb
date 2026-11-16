import {
  ITEM_RULES_TEXT_FIELD,
  ITEM_RULES_TEXT_VERSION,
  type ItemRulesText,
  type SpecificField,
} from "@4ecb/content-domain";

/** An artifact's concordance heading line ("Concordance", authored typos
 *  such as "Concordancece", or opening its table: "<table>Concordance"). */
const CONCORDANCE =
  /^[ \t]*(?:<table>)?[ \t]*Concordance\w*[ \t]*(?:<table>)?[ \t]*$/im;
/** A concordance state's heading ("Pleased (16–20)", "Angered (Below 1)",
 *  "Moving On"), for an artifact whose table has no heading line. */
const STATE =
  /^[ \t]*(?:(?:Transcendent|Pleased|Satisfied|Normal|Unsatisfied|Angered)[ \t]*\(|Moving On[ \t]*$)/im;
/** An artifact table its powers roll on, under its own heading ("Negative
 *  Convergence Table" over a "<table>" block), in an artifact without a
 *  concordance (the Rod of Convergence). */
const ARTIFACT_TABLE = /^[ \t]*[^\n<]*\bTable[ \t]*\r?\n[ \t]*<table>/im;

/** The published cursed-item rule, which item curses repeat. */
const CURSE_RULE =
  /\bA cursed item looks and functions like a normal magic item\b/i;

/**
 * A magic item's printed description part (see content-domain
 * `item-rules-text.ts`): a cursed item's whole description (its curse
 * rules), else an artifact's description from its concordance heading (or
 * its first concordance state) on, else from the heading of a table its
 * powers roll on. Undefined for any other record.
 */
export function parseItemRulesText(
  type: string,
  specifics: readonly Pick<SpecificField, "name" | "value">[],
  description: string,
): Omit<ItemRulesText, "version"> | undefined {
  if (type.trim().toLocaleLowerCase() !== "magic item") return undefined;
  const text = description.trim();
  if (text === "") return undefined;
  const special = specifics
    .filter((field) => field.name.trim().toLocaleLowerCase() === "special")
    .some((field) => /\bcurse/i.test(field.value));
  if (special || CURSE_RULE.test(text)) return { kind: "curse", text };
  const start = CONCORDANCE.exec(text)?.index ?? STATE.exec(text)?.index;
  if (start !== undefined)
    return { kind: "concordance", text: text.slice(start).trim() };
  const artifact = specifics.some(
    (field) =>
      field.name.trim().toLocaleLowerCase() === "magic item type" &&
      field.value.trim().toLocaleLowerCase() === "artifact",
  );
  const table = artifact ? ARTIFACT_TABLE.exec(text)?.index : undefined;
  return table === undefined
    ? undefined
    : { kind: "table", text: text.slice(table).trim() };
}

/** The record's {@link ITEM_RULES_TEXT_FIELD}, appended after its fields. */
export function itemRulesTextField(
  type: string,
  specifics: readonly SpecificField[],
  description: string,
  ordinal: number,
): SpecificField | undefined {
  const parsed = parseItemRulesText(type, specifics, description);
  if (parsed === undefined) return undefined;
  const value: ItemRulesText = { version: ITEM_RULES_TEXT_VERSION, ...parsed };
  return {
    name: ITEM_RULES_TEXT_FIELD,
    value: JSON.stringify(value),
    extraAttributes: [],
    ordinal,
  };
}
