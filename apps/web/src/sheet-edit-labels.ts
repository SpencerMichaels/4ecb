import type { SheetSectionId } from "@4ecb/character-domain";
import {
  creatureCardTitle,
  isSheetPlayCard,
  type SheetLayoutCard,
} from "@4ecb/sheet-model";

/** Edit mode's names for the sheet's sections (D099). */
export const SHEET_SECTION_LABELS: Readonly<Record<SheetSectionId, string>> = {
  summary: "Overview",
  scratchpad: "Play scratchpad",
  "reference:features": "Feature reference",
  "reference:items": "Item reference",
  "reference:power-index": "Power index",
  "reference:rituals": "Rituals & practices",
  "reference:profile": "Character profile",
  cards: "Power & item cards",
  "session-notes": "Session notes",
};

/** Edit mode's name for a deck card. */
export function sheetCardLabel(entry: Pick<SheetLayoutCard, "card">): string {
  const { card } = entry;
  if (isSheetPlayCard(card))
    return card.kind === "play-character" ? "Play data" : "Skills";
  return card.kind === "creature" ? creatureCardTitle(card) : card.name;
}
