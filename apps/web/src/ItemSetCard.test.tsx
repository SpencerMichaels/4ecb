import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ContentEntity } from "@4ecb/content-domain";
import type { SheetItemSetCard } from "@4ecb/sheet-model";

import {
  authoredBuilderCardSettings,
  BuilderCardContext,
  type BuilderCardSettings,
} from "./BuilderCards";
import { BuilderItemSetCard, parsePartyPieces } from "./BuilderItemSetCard";
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
      <ItemSetCard
        card={{ ...card, group: true, partyPieces: 2, benefits: [] }}
      />,
    );
    expect(html).toContain("<dt>Party pieces</dt><dd>2</dd>");
    expect(html).toContain("you and your allies wield");
    expect(html).toContain("This set lists no benefits.");
  });

  it("leaves a blank for an unset party count and dims no benefit", () => {
    const group = { ...card, group: true, pieces: 0 };
    const unset = renderToStaticMarkup(
      <ItemSetCard
        card={{
          ...group,
          benefits: group.benefits.map((benefit) => ({
            ...benefit,
            active: false,
          })),
        }}
      />,
    );
    expect(unset).toContain("print-item-set-card is-count-unknown");
    expect(unset).toContain(
      '<dt>Party pieces</dt><dd><span class="print-write-in">',
    );
    expect(unset).toContain("2 pieces: ");
    expect(unset).toContain("4 pieces: ");
    expect(unset).not.toContain("(active)");
    const entered = renderToStaticMarkup(
      <ItemSetCard card={{ ...group, pieces: 2, partyPieces: 2 }} />,
    );
    expect(entered).not.toContain("is-count-unknown");
    expect(entered).toContain("<dt>Party pieces</dt><dd>2</dd>");
    expect(entered).toContain("2 pieces (active): ");
    // Unknown counts are a group-set state only.
    expect(renderToStaticMarkup(<ItemSetCard card={card} />)).not.toContain(
      "is-count-unknown",
    );
  });
});

describe("party pieces field", () => {
  it("accepts a non-negative whole number, or empty to clear", () => {
    expect(parsePartyPieces("3")).toEqual({ pieces: 3 });
    expect(parsePartyPieces(" 0 ")).toEqual({ pieces: 0 });
    expect(parsePartyPieces("")).toEqual({ pieces: undefined });
    expect(parsePartyPieces("-1")).toBeUndefined();
    expect(parsePartyPieces("1.5")).toBeUndefined();
    expect(parsePartyPieces("two")).toBeUndefined();
  });

  const settings = (group: boolean) =>
    ({
      ...authoredBuilderCardSettings(1),
      itemSetCardFor: () => ({
        ...card,
        group,
        ...(group ? { partyPieces: 4 } : {}),
      }),
    }) satisfies BuilderCardSettings;
  const render = (group: boolean) =>
    renderToStaticMarkup(
      <BuilderCardContext.Provider value={settings(group)}>
        <BuilderItemSetCard
          pieces={[entity("CROWN", "Synthetic Crown", "Magic Item")]}
          byId={new Map()}
          onSetPartyPieces={() => undefined}
        />
      </BuilderCardContext.Provider>,
    );

  it("sits on a group set's builder card with the entered count", () => {
    const html = render(true);
    expect(html).toContain("<span>Party pieces</span>");
    expect(html).toMatch(/<input type="number"[^>]*value="4"/u);
    expect(render(false)).not.toContain("<span>Party pieces</span>");
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
