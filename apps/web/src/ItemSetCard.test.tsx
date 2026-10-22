import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type { SheetItemSetCard } from "@4ecb/sheet-model";

import { DeityDomains } from "./DeityDomains";
import { HideFlavortextContext } from "./HideFlavortextContext";
import { ItemSetCard } from "./ItemSetCard";

const card: SheetItemSetCard = {
  kind: "item-set",
  id: "SET",
  name: "Synthetic Regalia",
  tier: "Heroic",
  group: false,
  pieces: 2,
  pieceIds: ["CROWN", "CLOAK"],
  benefits: [
    { id: "SET_2", pieceCount: 2, text: "Two-piece benefit.", active: true },
    { id: "SET_4", pieceCount: 4, text: "Four-piece benefit.", active: false },
  ],
  description: "Regalia of a synthetic court.",
  source: "Synthetic Book",
};

describe("item set card", () => {
  it("prints the set's benefits by piece count, marking the active ones", () => {
    const html = renderToStaticMarkup(<ItemSetCard card={card} />);
    expect(html).toContain("print-item-card print-item-set-card");
    expect(html).toContain("<dt>Pieces</dt><dd>2</dd>");
    expect(html).toContain("<dt>Tier</dt><dd>Heroic</dd>");
    expect(html).toContain('class="print-item-set-benefit is-active"');
    expect(html).toContain("2 pieces (active): ");
    expect(html).toContain("4 pieces: ");
    expect(html.indexOf("Two-piece benefit.")).toBeLessThan(
      html.indexOf("Four-piece benefit."),
    );
    expect(html).toContain("<span>Item Set</span>");
    // Printed cards omit the set's introduction, like power flavor.
    expect(html).not.toContain("Regalia of a synthetic court.");
  });

  it("shows the introduction on a panel unless flavor text is hidden", () => {
    expect(
      renderToStaticMarkup(<ItemSetCard card={card} layout="panel" />),
    ).toContain("Regalia of a synthetic court.");
    expect(
      renderToStaticMarkup(
        <HideFlavortextContext.Provider value={true}>
          <ItemSetCard card={card} layout="panel" />
        </HideFlavortextContext.Provider>,
      ),
    ).not.toContain("Regalia of a synthetic court.");
  });

  it("explains a group set's count and an empty benefit list", () => {
    const html = renderToStaticMarkup(
      <ItemSetCard card={{ ...card, group: true, benefits: [] }} />,
    );
    expect(html).toContain("<dt>Group pieces</dt><dd>2</dd>");
    expect(html).toContain("you and your allies wield");
    expect(html).toContain("This set lists no benefits.");
  });
});

const entity = (
  id: string,
  name: string,
  type: string,
  specifics: Record<string, string> = {},
): ContentEntity => ({
  id,
  name,
  type,
  source: "Synthetic Book",
  sources: ["Synthetic Book"],
  attributes: [],
  categories: [],
  specifics: Object.entries(specifics).map(([name, value], ordinal) => ({
    name,
    value,
    extraAttributes: [],
    ordinal,
  })),
  rules: [],
  description: "",
  extensions: [],
  provenance: { sourceKey: "item-set-card-test", sourceOrdinal: 0 },
});

describe("deity domains line", () => {
  const deity = entity("DEITY", "Synthetic Moon", "Deity", {
    Domains: "DOMAIN_B, DOMAIN_A",
  });
  const references = new Map(
    [
      deity,
      entity("DOMAIN_A", "Tides", "Domain"),
      entity("DOMAIN_B", "Dusk", "Domain"),
    ].map((value) => [value.id.toLowerCase(), value]),
  );

  it("opens a deity card with its domains", () => {
    expect(
      renderToStaticMarkup(
        <DeityDomains entity={deity} references={references} />,
      ),
    ).toBe(
      '<p class="deity-domains"><strong>Domains:</strong> Dusk, Tides</p>',
    );
  });

  it("is absent for other cards", () => {
    expect(
      renderToStaticMarkup(
        <DeityDomains
          entity={references.get("domain_a")!}
          references={references}
        />,
      ),
    ).toBe("");
  });
});
