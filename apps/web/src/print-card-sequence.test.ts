import { describe, expect, it } from "vitest";
import type {
  SheetCard,
  SheetFamiliarCard,
  SheetItemSetCard,
} from "@4ecb/sheet-model";

import { isPlayCard, printableSheetCards } from "./print-card-sequence";

const power = (name: string, extra: Partial<SheetCard> = {}): SheetCard => ({
  kind: "power",
  name,
  usage: "At-Will",
  actionType: "Standard Action",
  fields: [],
  ...extra,
});
const item = (id: string): SheetCard => ({
  kind: "item",
  id,
  name: id,
  fields: [],
});
const familiar = {
  kind: "familiar",
  id: "FAMILIAR",
  name: "Synthetic Sprite",
} as SheetFamiliarCard;
const set: SheetItemSetCard = {
  kind: "item-set",
  id: "SET",
  name: "Synthetic Set",
  group: false,
  pieces: 2,
  pieceIds: ["PIECE_A", "PIECE_B"],
  benefits: [],
};

const label = (card: ReturnType<typeof printableSheetCards>[number]) =>
  isPlayCard(card) ? card.kind : card.name;

describe("printed card sequence", () => {
  it("prints play data, companions, special cards, powers, then items with their set", () => {
    const cards = printableSheetCards({
      powers: [
        power("Second Wind", { universal: true, usage: "Encounter" }),
        power("Zephyr Strike"),
        power("Action Point", { universal: true, usage: "Encounter" }),
        power("Arc Strike"),
      ],
      companions: [familiar],
      items: [item("PIECE_A"), item("PIECE_B"), item("OTHER")],
      itemSets: [set],
    });
    expect(cards.map(label)).toEqual([
      "play-character",
      "play-skills",
      "Synthetic Sprite",
      "Action Point",
      "Second Wind",
      "Arc Strike",
      "Zephyr Strike",
      "PIECE_A",
      "PIECE_B",
      "Synthetic Set",
      "OTHER",
    ]);
  });
});
