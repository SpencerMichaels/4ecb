import { describe, expect, it } from "vitest";
import type { SheetCard } from "./index";
import type { SheetFamiliarCard } from "./familiar-card";
import type { SheetItemSetCard } from "./item-set-card";
import {
  isSheetPlayCard,
  deckPowerCards,
  sheetCardDeck,
  sortedPowerCards,
  type SheetDeckCard,
} from "./card-deck";

describe("character-sheet power-card order", () => {
  it("lists attacks before utilities, each by the power-table action hierarchy", () => {
    const card = (
      name: string,
      actionType: string,
      utility = false,
    ): SheetCard => ({
      kind: "power",
      name,
      usage: "At-Will",
      actionType,
      fields: [{ label: "Power Type", value: utility ? "Utility" : "Attack" }],
    });
    const cards = [
      card("A reaction", "Immediate Interrupt"),
      card("B opportunity", "Opportunity Action"),
      card("Z no action", "No Action"),
      card("A free", "Free Action"),
      card("A minor", "Minor Action"),
      card("A move", "Move Action"),
      card("A standard utility", "Standard Action", true),
      card("Z standard attack", "Standard Action"),
      card("B standard attack", "Standard Action"),
      card("Unknown", ""),
    ];
    expect(sortedPowerCards(cards).map((power) => power.name)).toEqual([
      "B standard attack",
      "Z standard attack",
      "A move",
      "A minor",
      "A free",
      "Z no action",
      "A reaction",
      "B opportunity",
      "Unknown",
      "A standard utility",
    ]);
  });
  it("orders specific at-will, universal at-will, encounter and daily, then utility and name", () => {
    const card = (
      name: string,
      usage: string,
      utility = false,
      universal = false,
    ): SheetCard => ({
      kind: "power",
      name,
      usage,
      universal,
      fields: [{ label: "Power Type", value: utility ? "Utility" : "Attack" }],
    });
    const input = [
      card("Daily attack", "Daily"),
      card("A daily utility", "Daily", true),
      card("Encounter attack", "Encounter"),
      card("A encounter utility", "Encounter", true),
      card("Universal attack", "At-Will", false, true),
      card("A universal utility", "At-Will", true, true),
      card("Z personal attack", "At-Will"),
      card("A personal utility", "At-Will", true),
      card("B personal attack", "At-Will"),
      {
        ...card("Rules only", "At-Will"),
        fields: [{ label: "Rules Item", value: "An applied effect." }],
      },
    ];
    const original = [...input];
    expect(sortedPowerCards(input).map((power) => power.name)).toEqual([
      "Rules only",
      "B personal attack",
      "Z personal attack",
      "A personal utility",
      "Universal attack",
      "A universal utility",
      "Encounter attack",
      "A encounter utility",
      "Daily attack",
      "A daily utility",
    ]);
    expect(input).toEqual(original);
  });
});

const power = (name: string, extra: Partial<SheetCard> = {}): SheetCard => ({
  kind: "power",
  name,
  usage: "At-Will",
  actionType: "Standard Action",
  fields: [],
  ...extra,
});
const item = (id: string, extra: Partial<SheetCard> = {}): SheetCard => ({
  kind: "item",
  id,
  name: id,
  fields: [],
  ...extra,
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
const label = (card: SheetDeckCard) =>
  isSheetPlayCard(card) ? card.kind : card.name;

describe("sheet card deck", () => {
  it("prints play data, companions, special cards, powers, then items with their set", () => {
    const deck = sheetCardDeck({
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
    expect(deck.map(({ card }) => label(card))).toEqual([
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
    expect(deck.map(({ group }) => group)).toEqual([
      "play",
      "play",
      "companions",
      "powers",
      "powers",
      "powers",
      "powers",
      "items",
      "items",
      "items",
      "items",
    ]);
  });

  it("prints a movement technique only on its full discipline's card", () => {
    const technique = { id: "TECHNIQUE", name: "Storms [MT]", fields: [] };
    const deck = sheetCardDeck({
      powers: [
        power("Storms", { id: "DISCIPLINE", movementTechnique: technique }),
        power("Storms [MT]", { id: "technique", actionType: "Move Action" }),
        power("Lone [MT]", { id: "LONE", actionType: "Move Action" }),
      ],
      companions: [],
      items: [],
    });
    expect(deck.map(({ card }) => label(card))).toEqual([
      "play-character",
      "play-skills",
      "Storms",
      // Owned without its discipline: keeps its own card.
      "Lone [MT]",
    ]);
    expect(
      deckPowerCards([
        power("Storms [MT]", { id: "TECHNIQUE" }),
        power("Other", { movementTechnique: technique }),
      ]).map(({ name }) => name),
    ).toEqual(["Other"]);
  });

  it("keys cards by provenance, not text", () => {
    const deck = sheetCardDeck({
      powers: [
        power("Action Point", {
          id: "4ecb:universal:action-point",
          universal: true,
          usage: "Encounter",
        }),
        power("Arc Strike", { id: "ID_FMP_POWER_1" }),
        power("Legacy Only"),
        power("Legacy Only"),
      ],
      companions: [familiar],
      items: [
        item("ID_ITEM", { holdingId: "holding-1" }),
        item("ID_ITEM", { holdingId: "holding-2" }),
        item("ID_CACHED"),
        { kind: "item", name: "Unresolved keepsake", fields: [] },
      ],
      itemSets: [set],
    });
    expect(deck.map(({ key }) => key)).toEqual([
      "play:character",
      "play:skills",
      "companion:familiar",
      "power:4ecb:universal:action-point",
      "power:id_fmp_power_1",
      "power:name:legacy only",
      "power:name:legacy only#2",
      "item:holding-1",
      "item:holding-2",
      "item:def:id_cached",
      "item:name:unresolved keepsake",
      "item-set:set",
    ]);
  });

  it("keeps a power's key through a level-up and a content text change", () => {
    const before = sheetCardDeck({
      powers: [power("Arc Strike", { id: "ID_ARC", attack: "+5 vs AC" })],
      companions: [],
      items: [item("ID_SWORD", { holdingId: "h-1", name: "Sword +1" })],
    });
    const after = sheetCardDeck({
      powers: [
        power("Arc Strike (revised)", {
          id: "ID_ARC",
          attack: "+9 vs AC",
          description: "Errata text.",
          usage: "Encounter",
        }),
      ],
      companions: [],
      items: [item("ID_SWORD_2", { holdingId: "h-1", name: "Sword +2" })],
    });
    expect(after.map(({ key }) => key)).toEqual(before.map(({ key }) => key));
  });

  it("lists items hidden by their holding but leaves them unshown", () => {
    const deck = sheetCardDeck({
      powers: [],
      companions: [],
      items: [item("A", { holdingId: "a", hiddenByDefault: true })],
    });
    expect(deck.at(-1)).toMatchObject({ key: "item:a", defaultShown: false });
  });
});
