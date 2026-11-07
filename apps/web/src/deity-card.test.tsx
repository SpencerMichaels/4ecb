import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import { CandidateDetail } from "./CandidateDetail";
import { appStyles } from "./test-styles";

/*
 * A deity card's common fields are its subheader (owner, 2026-11-06), the
 * ritual cards' CardSubheader: "Alignment · Pantheon", then Domains and any
 * Counts as on their own lines. The body is the description alone.
 */

function record(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
  grants: readonly string[] = [],
  description = "",
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic source",
    sources: ["Synthetic source"],
    attributes: [],
    categories: [],
    specifics: Object.entries(specifics).map(([field, value], ordinal) => ({
      name: field,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: grants.map((granted, ordinal) => ({
      name: "grant",
      attributes: [
        { name: "name", value: granted },
        { name: "type", value: "CountsAsDeity" },
      ],
      text: "",
      children: [],
      ordinal,
    })),
    description,
    extensions: [],
    provenance: { sourceKey: "deity-card-test", sourceOrdinal: 0 },
  };
}

const full = record(
  "ID_SYNTH_PHARASMA",
  "Synthetic Pharasma",
  "Deity",
  {
    Alignment: "Unaligned",
    Domains: "ID_DOMAIN_DEATH, ID_DOMAIN_FATE",
    Pantheon: "Pathfinder",
  },
  ["ID_COUNTSASDEITY_RAVEN_QUEEN"],
  "The lady of graves judges every soul.",
);
const noCountsAs = record(
  "ID_SYNTH_IOUN",
  "Synthetic Ioun",
  "Deity",
  { Alignment: "Unaligned", Domains: "ID_DOMAIN_FATE", Pantheon: "Core" },
  [],
  "Knowledge.",
);
const noDomains = record(
  "ID_SYNTH_TORAG",
  "Synthetic Torag",
  "Deity",
  { Alignment: "Lawful Good", Domains: "", Pantheon: "Pathfinder" },
  ["ID_COUNTSASDEITY_MORADIN"],
  "The forge god.",
);
// A campaign's Moradin counting as the stock one of the same name.
const sameName = record(
  "ID_SYNTH_MORADIN",
  "Moradin",
  "Deity",
  { Alignment: "Lawful Good", Pantheon: "Core" },
  ["ID_COUNTSASDEITY_MORADIN"],
  "The soul forger.",
);
const content = [
  full,
  noCountsAs,
  noDomains,
  sameName,
  record("ID_DOMAIN_DEATH", "Death", "Domain"),
  record("ID_DOMAIN_FATE", "Fate", "Domain"),
  record("ID_COUNTSASDEITY_RAVEN_QUEEN", "The Raven Queen", "CountsAsDeity"),
  record("ID_COUNTSASDEITY_MORADIN", "Moradin", "CountsAsDeity"),
];
const byId = new Map(content.map((item) => [item.id.toLowerCase(), item]));

const render = (deity: ContentEntity) =>
  renderToStaticMarkup(
    <CandidateDetail
      candidate={
        {
          definitionId: deity.id,
          eligible: true,
          rulesLegal: true,
          reasons: [],
        } as unknown as CandidateDecision
      }
      entity={deity}
      byId={byId}
    />,
  );

/** The subheader's lines as label: value pairs, in order. */
function subheaderLines(markup: string) {
  const block = /<div class="print-item-subheader">(.*?)<\/dl><\/div>/su.exec(
    markup,
  )?.[1];
  if (block === undefined) return undefined;
  return block
    .split('<div class="print-item-stat-row">')
    .slice(1)
    .map((row) =>
      [...row.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/gu)].map(
        ([, label, value]) => `${label}: ${value}`,
      ),
    );
}

const body = (markup: string) =>
  markup.slice(markup.indexOf('class="reference-card-body"'));

describe("deity card subheader", () => {
  it("shows Alignment · Pantheon, then Domains, then Counts as", () => {
    const markup = render(full);
    expect(subheaderLines(markup)).toEqual([
      ["Alignment: Unaligned", "Pantheon: Pathfinder"],
      ["Domains: Death, Fate"],
      ["Counts as: The Raven Queen"],
    ]);
    // The ritual cards' undivided subheader, right under the title.
    expect(markup).toContain('class="print-item-stats is-undivided"');
    expect(markup.indexOf("print-item-subheader")).toBeGreaterThan(
      markup.indexOf("reference-card-title"),
    );
    expect(markup.indexOf("print-item-subheader")).toBeLessThan(
      markup.indexOf("reference-card-body"),
    );
  });

  it("has no Counts as line for a deity counting as none", () => {
    expect(subheaderLines(render(noCountsAs))).toEqual([
      ["Alignment: Unaligned", "Pantheon: Core"],
      ["Domains: Fate"],
    ]);
  });

  it("has no Domains line for a deity without domains", () => {
    expect(subheaderLines(render(noDomains))).toEqual([
      ["Alignment: Lawful Good", "Pantheon: Pathfinder"],
      ["Counts as: Moradin"],
    ]);
  });

  it("leaves out a counts-as of the deity's own name", () => {
    expect(subheaderLines(render(sameName))).toEqual([
      ["Alignment: Lawful Good", "Pantheon: Core"],
    ]);
  });

  it.each([full, noCountsAs, noDomains, sameName])(
    "keeps only the description in %s's body",
    (deity) => {
      const text = body(render(deity));
      expect(text).toContain(deity.description);
      for (const label of ["Alignment", "Pantheon", "Domains", "Counts as"])
        expect(text).not.toContain(label);
      expect(text).not.toContain("candidate-fields");
      expect(text).not.toContain("deity-domains");
    },
  );

  it("styles the subheader at the reference card's panel scale", () => {
    expect(appStyles).toMatch(
      /\.reference-entity-card > \.print-item-subheader \{\s*--card-paper: var\(--parchment\);\s*--print-card-body-size: var\(--panel-card-body-size\);/u,
    );
    expect(appStyles).toMatch(
      /\.reference-entity-card > \.print-item-subheader \.print-item-stat-row \{\s*padding: 0\.25rem 0\.55rem;/u,
    );
  });
});
