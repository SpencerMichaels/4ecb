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
  it("prints an artifact's description after its rules", () => {
    const artifact = item(
      { "Magic Item Type": "Artifact", Property: "Your reach is 3." },
      "Concordance: starting score 5.",
    );
    const markup = renderToStaticMarkup(<ItemCard card={artifact} />);
    expect(after(markup, "Your reach is 3.", "Concordance")).toBe(true);
  });
});

describe("item card printed in two", () => {
  const artifact = item(
    { "Magic Item Type": "Artifact", Property: "Your reach is 3." },
    "Concordance: starting score 5.",
  );
  it("leaves the description to the lore card", () => {
    const rules = renderToStaticMarkup(
      <ItemCard card={{ ...artifact, part: "rules" }} />,
    );
    expect(rules).toContain("Your reach is 3.");
    expect(rules).not.toContain("Concordance");
    const lore = renderToStaticMarkup(
      <ItemCard card={{ ...artifact, part: "lore" }} />,
    );
    expect(lore).toContain("Synthetic Item — Lore");
    expect(lore).toContain("Concordance");
    expect(lore).not.toContain("Your reach is 3.");
  });
});
