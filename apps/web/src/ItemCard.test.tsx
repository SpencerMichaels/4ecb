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
  it("prints only an artifact's mechanics after its rules", () => {
    const artifact = {
      ...item(
        { "Magic Item Type": "Artifact", Property: "Your reach is 3." },
        "Goals: rule the sky.\nConcordance: starting score 5.",
      ),
      rulesText: "Concordance: starting score 5.",
    };
    const printed = renderToStaticMarkup(<ItemCard card={artifact} />);
    expect(after(printed, "Your reach is 3.", "Concordance")).toBe(true);
    expect(printed).not.toContain("Goals");
    const pane = renderToStaticMarkup(
      <ItemCard card={artifact} layout="panel" />,
    );
    expect(after(pane, "Your reach is 3.", "Goals")).toBe(true);
  });
});

describe("item card printed in two", () => {
  const artifact: SheetCard = {
    ...item(
      { "Magic Item Type": "Artifact", Property: "Your reach is 3." },
      "Goals: rule.\nConcordance: starting score 5.",
    ),
    rulesText: "Concordance: starting score 5.",
    rulesTextKind: "concordance",
  };
  it("leaves its mechanics to the second card", () => {
    const rules = renderToStaticMarkup(
      <ItemCard card={{ ...artifact, part: "rules" }} />,
    );
    expect(rules).toContain("Your reach is 3.");
    expect(rules).not.toContain("starting score");
    const second = renderToStaticMarkup(
      <ItemCard card={{ ...artifact, part: "rules-text" }} />,
    );
    expect(second).toContain("Synthetic Item — Concordance");
    expect(second).toContain("starting score 5");
    expect(second).not.toContain("Your reach is 3.");
  });
});
