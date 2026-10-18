import {
  classifyPowerCard,
  powerActionRank,
  type SheetCard,
} from "@4ecb/sheet-model";

export { powerActionRank };

export const isRulesReferencePower = (card: SheetCard) =>
  classifyPowerCard(card).feature;

/** Character-sheet usage groups, then the same action hierarchy as power tables. */
export function sortedPowerCards(cards: readonly SheetCard[]): SheetCard[] {
  const classifications = new Map(
    cards.map((card) => [card, classifyPowerCard(card)]),
  );
  const group = (card: SheetCard) => {
    const classification = classifications.get(card)!;
    if (classification.feature) return -1;
    switch (classification.usage) {
      case "at-will":
        return card.universal ? 1 : 0;
      case "encounter":
        return 2;
      case "daily":
        return 3;
      default:
        return 4;
    }
  };
  const utility = (card: SheetCard) =>
    Number(classifications.get(card)!.utility);
  return [...cards].sort(
    (a, b) =>
      group(a) - group(b) ||
      utility(a) - utility(b) ||
      powerActionRank(a.actionType) - powerActionRank(b.actionType) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
