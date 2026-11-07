import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";
import { entityCardFields } from "@4ecb/sheet-model";

import { CandidateDetail, CandidateDetailCard } from "./CandidateDetail";

/*
 * Reference cards' subheaders and body lines (owner, 2026-11-06): the
 * subheader holds short fields of steady size, phrases are labelled body
 * lines, and nothing the card shows elsewhere appears twice
 * (`entityCardFields`).
 */

function record(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>> = {},
  extra: Partial<ContentEntity> = {},
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
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "entity-card-fields-test", sourceOrdinal: 0 },
    ...extra,
  };
}

const render = (
  entity: ContentEntity,
  references: readonly ContentEntity[] = [],
) => {
  const byId = new Map(
    [entity, ...references].map((item) => [item.id.toLowerCase(), item]),
  );
  return renderToStaticMarkup(
    <CandidateDetail
      candidate={
        {
          definitionId: entity.id,
          eligible: true,
          rulesLegal: true,
          reasons: [],
        } as unknown as CandidateDecision
      }
      entity={entity}
      byId={byId}
    />,
  );
};

/** A granted card (a detail stack's), without the reference index. */
const renderGranted = (entity: ContentEntity) =>
  renderToStaticMarkup(<CandidateDetailCard entity={entity} granted />);

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

/** The first card's body (up to its footer). */
const body = (markup: string) => {
  const start = markup.indexOf('class="reference-card-body"');
  const end = markup.indexOf('class="print-card-type"', start);
  return markup.slice(start, end < 0 ? undefined : end);
};

/** The body's labelled lines ("Label: value" dl rows), in order. */
const bodyLines = (markup: string) =>
  [
    ...body(markup).matchAll(
      /<div><dt>(.*?)<\/dt><dd(?: class="preserve-lines")?>(.*?)<\/dd><\/div>/gu,
    ),
  ].map(([, label, value]) => `${label}: ${value}`);

/** Each label at most once on the whole card. */
function expectNoDuplicateLabels(markup: string) {
  const labels = [
    ...markup.matchAll(/<dt>(.*?)<\/dt>/gu),
    ...markup.matchAll(/<strong>([^<]*?):<\/strong>/gu),
  ].map(([, label]) => label);
  expect(new Set(labels).size).toBe(labels.length);
}

describe("feat card", () => {
  const feat = record(
    "ID_SYNTH_FEAT",
    "Synthetic Feat",
    "Feat",
    {
      Tier: "Heroic",
      type: "Divinity",
      "Associated Powers": "Divine Bolts, Recovery Strike",
      "Associated Power Info":
        "When you hit an enemy with a power associated with this feat, push it 1 square.",
      Special: "You can take this feat more than once.",
      "Short Description": "Push on a hit.",
    },
    {
      description: "You gain a power.",
      printPrerequisites: "Channel Divinity class feature",
    },
  );

  it("shows Tier · Type in the subheader", () => {
    const markup = render(feat);
    expect(subheaderLines(markup)).toEqual([
      ["Tier: Heroic", "Type: Divinity"],
    ]);
    expect(markup.indexOf("print-item-subheader")).toBeLessThan(
      markup.indexOf("reference-card-body"),
    );
  });

  it("lists Powers, Associated Power Info and Special as body lines", () => {
    const markup = render(feat);
    expect(bodyLines(markup)).toEqual([
      "Powers: Divine Bolts, Recovery Strike",
      "Associated Power Info: When you hit an enemy with a power associated with this feat, push it 1 square.",
      "Special: You can take this feat more than once.",
    ]);
    expect(body(markup)).toContain(
      "<strong>Prerequisite:</strong> Channel Divinity class feature",
    );
    // The prerequisite precedes the text; the other lines follow it.
    expect(body(markup).indexOf("Prerequisite:")).toBeLessThan(
      body(markup).indexOf("You gain a power."),
    );
    expect(body(markup).indexOf("You gain a power.")).toBeLessThan(
      body(markup).indexOf("Powers"),
    );
  });

  it("shows each field once", () => {
    const markup = render(feat);
    expectNoDuplicateLabels(markup);
    expect(body(markup)).not.toContain("Heroic");
    expect(body(markup)).not.toContain("<dd>Divinity");
    expect(body(markup)).not.toMatch(/<dt>(?:Tier|Type)<\/dt>/u);
    expect(body(markup)).not.toContain("Associated Powers");
  });

  it("leaves an empty Type out, and a feat without fields has no subheader", () => {
    const plain = record("ID_SYNTH_FEAT_2", "Plain Feat", "Feat", {
      Tier: "Epic",
      type: "",
    });
    expect(subheaderLines(render(plain))).toEqual([["Tier: Epic"]]);
    expect(bodyLines(render(plain))).toEqual([]);
    const bare = record("ID_SYNTH_FEAT_3", "Bare Feat", "Feat");
    expect(subheaderLines(render(bare))).toBeUndefined();
  });

  it("reads an authored Type in either case", () => {
    const upper = record("ID_SYNTH_FEAT_4", "Upper Feat", "Feat", {
      Tier: "Paragon",
      Type: "Multiclass Ardent, Battlemind, or Psion",
    });
    expect(entityCardFields(upper)?.subheader).toEqual([
      [
        { label: "Tier", value: "Paragon" },
        { label: "Type", value: "Multiclass Ardent, Battlemind, or Psion" },
      ],
    ]);
    expect(bodyLines(render(upper))).toEqual([]);
  });

  it("has the same subheader on a granted card", () => {
    expect(subheaderLines(renderGranted(feat))).toEqual([
      ["Tier: Heroic", "Type: Divinity"],
    ]);
  });
});
