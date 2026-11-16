import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SheetCard } from "@4ecb/sheet-model";

import { ItemCard } from "./ItemCard";

const item = (
  values: Record<string, string>,
  description: string,
): SheetCard => ({
  kind: "item",
  name: "Synthetic Item",
  itemType: "Magic Item",
  baseItemType: "Magic Item",
  fields: Object.entries(values).map(([label, value]) => ({ label, value })),
  description,
});

const after = (markup: string, first: string, second: string) =>
  markup.indexOf(first) >= 0 && markup.indexOf(first) < markup.indexOf(second);

describe("item card descriptions", () => {
  const ordinary = item(
    { Property: "You gain resist 5 fire." },
    "Dran claimed it in a storm.",
  );
  it("shows any description after the rules in a builder pane", () => {
    const markup = renderToStaticMarkup(
      <ItemCard card={ordinary} layout="panel" />,
    );
    expect(after(markup, "resist 5 fire", "Dran claimed it")).toBe(true);
  });
  it("leaves an ordinary item's background off the printed card", () => {
    expect(renderToStaticMarkup(<ItemCard card={ordinary} />)).not.toContain(
      "Dran claimed it",
    );
  });
  it("points an artifact's concordance to the reference pages", () => {
    const artifact: SheetCard = {
      ...item(
        { "Magic Item Type": "Artifact", Property: "Your reach is 3." },
        "Goals: rule the sky.\nConcordance: starting score 5.",
      ),
      rulesText: "Concordance: starting score 5.",
      rulesTextKind: "concordance",
    };
    const printed = renderToStaticMarkup(<ItemCard card={artifact} />);
    expect(after(printed, "Your reach is 3.", "see Reference pages")).toBe(
      true,
    );
    expect(printed).toContain("<strong>Concordance: </strong>");
    expect(printed).not.toContain("starting score");
    expect(printed).not.toContain("Goals");
    const pane = renderToStaticMarkup(
      <ItemCard card={artifact} layout="panel" />,
    );
    expect(after(pane, "Your reach is 3.", "Goals")).toBe(true);
    expect(pane).not.toContain("see Reference pages");
  });
  it("prints a cursed item's curse rules after its rules", () => {
    const cursed: SheetCard = {
      ...item({ Property: "You take a -2 penalty." }, "To remove the curse…"),
      rulesText: "To remove the curse…",
      rulesTextKind: "curse",
    };
    expect(
      after(
        renderToStaticMarkup(<ItemCard card={cursed} />),
        "-2 penalty",
        "To remove the curse",
      ),
    ).toBe(true);
  });
});

describe("item card printed in two", () => {
  const cursed: SheetCard = {
    ...item({ Property: "You take a -2 penalty." }, "To remove the curse…"),
    name: "Synthetic Ring (Cursed)",
    rulesText: "To remove the curse…",
    rulesTextKind: "curse",
  };
  it("leaves a curse's rules to the second card", () => {
    const rules = renderToStaticMarkup(
      <ItemCard card={{ ...cursed, part: "rules" }} />,
    );
    expect(rules).toContain("-2 penalty");
    expect(rules).not.toContain("To remove");
    const second = renderToStaticMarkup(
      <ItemCard card={{ ...cursed, part: "rules-text" }} />,
    );
    expect(second).toContain("Synthetic Ring (Cursed) — Curse");
    expect(second).toContain("To remove the curse");
    expect(second).not.toContain("-2 penalty");
  });
});
