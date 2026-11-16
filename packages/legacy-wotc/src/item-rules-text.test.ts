import { describe, expect, it } from "vitest";

import { parseItemRulesText } from "./item-rules-text";

const special = (value: string) => [{ name: "Special", value }];

describe("a magic item's printed description part", () => {
  it("takes an artifact's description from its concordance heading on", () => {
    expect(
      parseItemRulesText(
        "Magic Item",
        [],
        "Goals of the Spear\n• Rule.\n\nConcordancece\n<table>Starting score\t5</table>\n\nPleased (16–20)\nIt is proud.",
      ),
    ).toEqual({
      kind: "concordance",
      text: "Concordancece\n<table>Starting score\t5</table>\n\nPleased (16–20)\nIt is proud.",
    });
  });

  it("starts at the first concordance state when no heading names it", () => {
    expect(
      parseItemRulesText(
        "Magic Item",
        [],
        "Lore first.\n\nNormal (5–11)\nIt watches.\n\nMoving On\nIt leaves.",
      )?.text,
    ).toBe("Normal (5–11)\nIt watches.\n\nMoving On\nIt leaves.");
  });

  it("keeps a cursed item's whole curse rules", () => {
    const curse = "A cursed item looks and functions like a normal magic item.";
    expect(parseItemRulesText("Magic Item", [], curse)).toEqual({
      kind: "curse",
      text: curse,
    });
    expect(
      parseItemRulesText("Magic Item", special("Item Curse"), "Remove it.")
        ?.kind,
    ).toBe("curse");
  });

  it("finds nothing in lore or an intelligent item's persona", () => {
    expect(
      parseItemRulesText(
        "Magic Item",
        [],
        "Communication Speech\nPersona Gruff.",
      ),
    ).toBeUndefined();
    expect(
      parseItemRulesText("Magic Item", [], "Legend has it the tome is old."),
    ).toBeUndefined();
    expect(
      parseItemRulesText("Weapon", [], "Concordance\nStarting score 5"),
    ).toBeUndefined();
  });
});
