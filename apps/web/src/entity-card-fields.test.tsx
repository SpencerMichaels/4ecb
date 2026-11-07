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

describe("duplicate fields dropped", () => {
  it("drops a class feature's Level, and its Usage when it grants a power", () => {
    const feature = record(
      "ID_SYNTH_CF",
      "Synthetic Challenge",
      "Class Feature",
      {
        Level: "1",
        type: "At-Will",
        Powers: "ID_SYNTH_POWER",
        "Short Description": "Mark an enemy.",
      },
      { description: "You can mark an enemy." },
    );
    const markup = renderGranted(feature);
    expect(subheaderLines(markup)).toBeUndefined();
    expect(bodyLines(markup)).toEqual([]);
    expect(body(markup)).not.toContain("At-Will");
    expect(body(markup)).not.toMatch(/<dt>Level<\/dt>/u);
  });

  it("keeps a class feature's Type when it grants no power", () => {
    const feature = record(
      "ID_SYNTH_CF_2",
      "Synthetic Aspect",
      "Class Feature",
      {
        Level: "3",
        Type: "Aspect of the Wild (Scout)",
      },
    );
    expect(bodyLines(renderGranted(feature))).toEqual([
      "Type: Aspect of the Wild (Scout)",
    ]);
  });

  it("drops a racial trait's Level and its granted power's usage", () => {
    const trait = record("ID_SYNTH_RT", "Synthetic Breath", "Racial Trait", {
      Level: "1",
      type: "Encounter",
      _DisplayPowers: "ID_SYNTH_BREATH",
    });
    expect(bodyLines(renderGranted(trait))).toEqual([]);
  });

  it.each(["Paragon Path", "Epic Destiny", "Theme", "Trait Package"])(
    "drops a %s's Power Name",
    (type) => {
      const path = record("ID_SYNTH_PATH", "Synthetic Path", type, {
        "Power Name": "Spells",
      });
      const markup = renderGranted(path);
      expect(bodyLines(markup)).toEqual([]);
      expect(markup).not.toContain("Spells");
    },
  );

  it("strips the Immortality text's repeated first line", () => {
    const destiny = (immortality: string) =>
      bodyLines(
        renderGranted(
          record("ID_SYNTH_ED", "Synthetic Destiny", "Epic Destiny", {
            Immortality: immortality,
          }),
        ),
      ).join("|");
    expect(destiny("Immortality\nYou ascend.")).not.toContain(
      '<p class="prose-paragraph">Immortality</p>',
    );
    expect(destiny("Immortality\nYou ascend.")).toContain("You ascend.");
    expect(destiny("Immortality?\nYou ascend.")).not.toMatch(/Immortality\?/u);
    // Another heading is the text's own and stays.
    expect(destiny("Living the Destiny\nYou ascend.")).toContain(
      "Living the Destiny",
    );
  });

  it("drops an item set benefit's Piece Count", () => {
    const benefit = record(
      "ID_SYNTH_SET_BENEFIT",
      "Synthetic Gear (2)",
      "Item Set Benefit",
      { "Piece Count": "2" },
      { description: "+1 to saving throws." },
    );
    expect(bodyLines(renderGranted(benefit))).toEqual([]);
  });

  it("drops a god fragment's power rows, which its power card shows", () => {
    const fragment = record(
      "ID_SYNTH_FRAGMENT",
      "Synthetic Fragment",
      "God Fragment",
      {
        "Power Usage": "Encounter",
        "Action Type": "Free",
        Keywords: "Fear",
        Trigger: "You use a divine encounter attack power.",
        Effect: "One ally gains 5 temporary hit points.",
        "Constant Benefits": "+1 to saving throws.",
        Quirks: "Abrasive, intimidating, lively",
      },
    );
    const lines = bodyLines(renderGranted(fragment)).map((line) =>
      line.slice(0, line.indexOf(":")),
    );
    for (const dropped of [
      "Power Usage",
      "Action Type",
      "Keywords",
      "Trigger",
      "Effect",
    ])
      expect(lines).not.toContain(dropped);
  });
});

describe("class card", () => {
  const warden = record("ID_SYNTH_CLASS", "Synthetic Warden", "Class", {
    Role: "Defender and Striker. You protect your allies.",
    "Power Source": "Martial and Primal. Training and spirits.",
    "Hit Points at 1st Level": "15+ Constitution Score",
    "Hit Points per Level Gained": "6",
    "Healing Surges": "9+ Constitution Modifier",
    "Bonus to Defense": "+1 Fortitude, +1 Will",
    "Key Abilities": "Strength, Constitution, Wisdom",
    "Armor Proficiencies": "Cloth, leather, hide",
    "Weapon Proficiencies": "Simple melee, military melee",
    Implements: "Totems",
    "Trained Skills":
      "Nature. From the class skills list below, choose 3 more.",
    "Class Skills": "Athletics (Str), Nature (Wis)",
    "Build Options": "Earthstrength Warden",
    "Power Name": "Evocations",
    "Short Description": "You guard the wild.",
  });

  it("shows Role · Source, then HP · Level · Surges, then Defenses", () => {
    expect(subheaderLines(render(warden))).toEqual([
      ["Role: Defender and Striker", "Source: Martial and Primal"],
      [
        "HP: 15+ Constitution Score",
        "Level: 6",
        "Surges: 9+ Constitution Modifier",
      ],
      ["Defenses: +1 Fortitude, +1 Will"],
    ]);
  });

  it("lists abilities, proficiencies, skills and builds as body lines", () => {
    expect(bodyLines(render(warden))).toEqual([
      "Abilities: Strength, Constitution, Wisdom",
      "Armor: Cloth, leather, hide",
      "Weapons: Simple melee, military melee",
      "Implements: Totems",
      "Trained: Nature. From the class skills list below, choose 3 more.",
      "Class skills: Athletics (Str), Nature (Wis)",
      "Builds: Earthstrength Warden",
    ]);
  });

  it("shows each field once and drops the lede's role and source", () => {
    const markup = render(warden);
    expectNoDuplicateLabels(markup);
    expect(body(markup)).toContain(
      '<p class="entity-card-lede">You guard the wild.</p>',
    );
    expect(body(markup)).not.toContain("Defender and Striker");
    expect(body(markup)).not.toContain("15+ Constitution Score");
    expect(body(markup)).not.toContain("Evocations");
    expect(body(markup)).not.toContain("entity-stat-grid");
  });

  it("leaves out empty fields and lines on a hybrid class", () => {
    const hybrid = record(
      "ID_SYNTH_HYBRID",
      "Synthetic Hybrid",
      "Hybrid Class",
      {
        Role: "Leader.",
        "Power Source": "Divine",
        "Hit Points per Level Gained": "2.5",
        "Hybrid Talent Options": "Hybrid Talent: Healer's Lore.",
      },
    );
    const markup = render(hybrid);
    expect(subheaderLines(markup)).toEqual([
      ["Role: Leader", "Source: Divine"],
      ["Level: 2.5"],
    ]);
    expect(bodyLines(markup)).toEqual([
      "Hybrid talents: Hybrid Talent: Healer&#x27;s Lore.",
    ]);
  });
});
