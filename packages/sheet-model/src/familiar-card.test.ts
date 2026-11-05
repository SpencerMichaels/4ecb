import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";

import { sheetCompanionCardKeyBase } from "./card-deck";
import {
  FAMILIAR_NOTES_KEY_SUFFIX,
  sheetFamiliarCard,
  type SheetFamiliarCard,
} from "./familiar-card";
import { applySheetLayout, sheetLayoutCardKey } from "./sheet-layout";

function familiar(specifics: Readonly<Record<string, string>>): ContentEntity {
  return {
    id: "FAMILIAR_TEST",
    name: "Test Sprite",
    type: "Familiar",
    source: "Test Book",
    sources: ["Test Book"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
      name,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: " A helpful spirit. ",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

const stat = (name: string, value: number) =>
  [name, { name, value, contributions: [] }] as const;
const stats = Object.fromEntries([
  stat("AC", 18),
  stat("Fortitude Defense", 14),
  stat("Reflex Defense", 16),
  stat("Will Defense", 17),
  stat("FAMILIAR.AC", 1),
  stat("FAMILIAR.Speed", 2),
]);

describe("familiar card", () => {
  it("shows the familiar's fields with its master's defenses and bonuses", () => {
    expect(
      sheetFamiliarCard(
        familiar({
          Size: "Tiny",
          Tier: "Heroic Tier",
          Speed: " 4 ",
          "Secondary Speed": "fly 6",
          Senses: "Low-light vision",
          "Constant Benefits": "You gain a +2 bonus to Arcana checks.",
          Power: "Light: You shed bright light.",
          Quirks: "",
        }),
        stats,
      ),
    ).toEqual({
      kind: "familiar",
      id: "FAMILIAR_TEST",
      name: "Test Sprite",
      size: "Tiny",
      tier: "Heroic Tier",
      speed: "6, fly 6",
      senses: "Low-light vision",
      defenses: { ac: 19, fortitude: 14, reflex: 16, will: 17 },
      hitPoints: 1,
      constantBenefits: "You gain a +2 bonus to Arcana checks.",
      activeBenefits: "Light: You shed bright light.",
      description: "A helpful spirit.",
      source: "Test Book",
    });
  });

  it("reads community-coded benefit names and flavor", () => {
    const card = sheetFamiliarCard(
      {
        ...familiar({
          "Passive Benefits": "See Below:\n* Venom affinity.",
          "Active Benefits": "Slide a poisoned creature.",
        }),
        description: "",
        flavor: "Lolth's children.",
      },
      {},
    );
    expect(card).toMatchObject({
      // The redundant "See Below:" lead is dropped by the shared prose
      // renderer, on every surface, not here.
      constantBenefits: "See Below:\n* Venom affinity.",
      activeBenefits: "Slide a poisoned creature.",
      description: "Lolth's children.",
    });
  });

  it("defaults to Tiny and omits what the familiar doesn't author", () => {
    const card = sheetFamiliarCard(familiar({ Size: " " }), {});
    expect(card.size).toBe("Tiny");
    expect(card.defenses).toEqual({});
    expect(card).not.toHaveProperty("speed");
    expect(card).not.toHaveProperty("quirks");
  });
});

describe("split familiar cards (D110)", () => {
  const model = {
    powers: [],
    items: [],
    companions: [sheetFamiliarCard(familiar({ Speed: "6" }), stats)],
  };
  const parts = (cards: readonly { readonly card: unknown }[]) =>
    cards
      .slice(2)
      .map(({ card }) => (card as SheetFamiliarCard).part ?? "whole");

  it("prints one whole card unless measured as overflowing", () => {
    expect(sheetCompanionCardKeyBase(model.companions[0]!)).toBe(
      "companion:familiar_test",
    );
    expect(parts(applySheetLayout(model, undefined).deck)).toEqual(["whole"]);
  });

  it("prints a split familiar as stats then notes, under one layout key", () => {
    const split = new Set(["companion:familiar_test"]);
    const resolved = applySheetLayout(model, undefined, {
      splitCompanions: split,
    });
    expect(parts(resolved.deck)).toEqual(["stats", "notes"]);
    const notes = resolved.cards.at(-1)!;
    expect(notes.key).toBe(
      `companion:familiar_test${FAMILIAR_NOTES_KEY_SUFFIX}`,
    );
    expect(sheetLayoutCardKey(notes)).toBe("companion:familiar_test");
    expect(resolved.defaultCardOrder).not.toContain(notes.key);
    const hidden = applySheetLayout(
      model,
      { version: 1, hiddenCards: ["companion:familiar_test"] },
      { splitCompanions: split },
    );
    expect(parts(hidden.deck)).toEqual([]);
  });
});
