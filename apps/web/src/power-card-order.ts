import type { SheetCard } from "@4ecb/sheet-model";

export const isRulesReferencePower = (card: SheetCard) =>
  card.fields.some(
    (field) =>
      field.label.trim().toLowerCase() === "rules item" &&
      Boolean(field.value.trim()),
  );

/** Character-sheet cards, independently of builder-table/action sorting. */
export function sortedPowerCards(cards: readonly SheetCard[]): SheetCard[] {
  const group = (card: SheetCard) => {
    if (isRulesReferencePower(card)) return 5;
    const usage = card.usage?.trim() ?? "";
    if (/^at[- ]will\b/i.test(usage)) return card.universal ? 1 : 0;
    if (/^encounter\b/i.test(usage)) return 2;
    if (/^daily\b/i.test(usage)) return 3;
    return 4;
  };
  const utility = (card: SheetCard) =>
    Number(
      card.fields.some(
        (field) =>
          field.label.trim().toLowerCase() === "power type" &&
          field.value.trim().toLowerCase() === "utility",
      ),
    );
  return [...cards].sort(
    (a, b) =>
      group(a) - group(b) ||
      utility(a) - utility(b) ||
      a.name.localeCompare(b.name),
  );
}
