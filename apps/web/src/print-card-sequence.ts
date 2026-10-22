import {
  withItemSetCards,
  type CharacterSheetModel,
  type SheetCard,
  type SheetCompanionCard,
  type SheetItemSetCard,
} from "@4ecb/sheet-model";

import { sortedPowerCards } from "./power-card-order";
import type { PlayCardKind } from "./PrintPlayCards";

export type PrintableCard =
  | SheetCard
  | SheetCompanionCard
  | SheetItemSetCard
  | { readonly kind: PlayCardKind };

export const isPlayCard = (
  card: PrintableCard,
): card is { readonly kind: PlayCardKind } =>
  card.kind === "play-character" || card.kind === "play-skills";

/**
 * The printed card deck in order: the Play data and Skills cards, the beast
 * companion then familiars (companion card proposal, owner answer 5), the
 * special Action Point and Second Wind cards (as in the legacy builder), the
 * other powers (`sortedPowerCards`), then items with each item set's card
 * after its pieces' cards (legacy CharTracker).
 */
export function printableSheetCards(
  model: Pick<CharacterSheetModel, "powers" | "items" | "companions"> &
    Partial<Pick<CharacterSheetModel, "itemSets">>,
): PrintableCard[] {
  const powerCards = sortedPowerCards(model.powers);
  const specialCardRank = (card: SheetCard) =>
    ["action point", "second wind"].indexOf(card.name.trim().toLowerCase());
  const specialCards = powerCards
    .filter((card) => card.universal && specialCardRank(card) >= 0)
    .sort((a, b) => specialCardRank(a) - specialCardRank(b));
  return [
    { kind: "play-character" as const },
    { kind: "play-skills" as const },
    ...model.companions,
    ...specialCards,
    ...powerCards.filter((card) => !specialCards.includes(card)),
    ...withItemSetCards(model.items, model.itemSets ?? []),
  ];
}
