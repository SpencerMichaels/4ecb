import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import {
  previewBeastCompanion,
  RulesIndex,
  type CandidateDecision,
} from "@4ecb/rules-engine";
import { sheetBeastCompanionCard } from "@4ecb/sheet-model";

import {
  authoredBuilderCardSettings,
  BuilderCardContext,
} from "./BuilderCards";
import { CandidateDetail } from "./CandidateDetail";

const alignment: ContentEntity = {
  id: "ID_ALIGNMENT_GOOD",
  name: "Good",
  type: "Alignment",
  source: "test",
  sources: ["test"],
  attributes: [],
  categories: [],
  specifics: [],
  rules: [],
  description: "Protect the weak.",
  extensions: [],
  provenance: { sourceKey: "test", sourceOrdinal: 0 },
};
const candidate = {
  definitionId: alignment.id,
  eligible: true,
  rulesLegal: true,
  reasons: [],
} as unknown as CandidateDecision;

const render = (favoritable?: boolean) =>
  renderToStaticMarkup(
    createElement(CandidateDetail, {
      candidate,
      entity: alignment,
      byId: new Map([[alignment.id.toLocaleLowerCase(), alignment]]),
      ...(favoritable === undefined ? {} : { favoritable }),
    }),
  );

describe("candidate detail favorite star", () => {
  it("is offered only for an option picked from a selection table", () => {
    expect(render(true)).toContain("card-favorite-toggle");
    expect(render(false)).not.toContain("card-favorite-toggle");
    expect(render()).not.toContain("card-favorite-toggle");
  });
});

function entity(
  id: string,
  name: string,
  type: string,
  specifics: Readonly<Record<string, string>>,
  description = "",
): ContentEntity {
  return {
    ...alignment,
    id,
    name,
    type,
    specifics: Object.entries(specifics).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    description,
  };
}

describe("trait package detail", () => {
  it("follows the package's card with each class feature it lists and what that grants", () => {
    const pact = entity(
      "PACT_TEST",
      "Test Pact",
      "Trait Package",
      {
        _PARSED_CLASS_FEATURE: " FEATURE_BOON, FEATURE_MISSING,FEATURE_REWARD ",
      },
      "You gain the following benefits:",
    );
    const soulStep = entity("POWER_SOUL_STEP", "Soul Step", "Power", {
      "Power Usage": "Encounter",
      Effect: "You teleport 3 squares.",
    });
    const boon = {
      ...entity(
        "FEATURE_BOON",
        "Test Pact Boon",
        "Class Feature",
        {},
        "You gain the soul step power.",
      ),
      rules: [
        {
          name: "grant",
          attributes: [
            { name: "name", value: soulStep.id },
            { name: "type", value: "Power" },
          ],
          text: "",
          children: [],
          ordinal: 0,
        },
      ],
    };
    // Granted only at a later level, but named for display.
    const laterPower = entity("POWER_LATER", "Moonlit Escape", "Power", {
      "Power Usage": "Encounter",
    });
    const reward = entity(
      "FEATURE_REWARD",
      "Test Pact Reward",
      "Class Feature",
      { _DisplayPowers: "POWER_LATER" },
      "Add your Dexterity modifier to damage rolls.",
    );
    const markup = renderToStaticMarkup(
      createElement(CandidateDetail, {
        candidate: { ...candidate, definitionId: pact.id },
        entity: pact,
        byId: new Map(
          [reward, pact, soulStep, laterPower, boon].map((item) => [
            item.id.toLowerCase(),
            item,
          ]),
        ),
      }),
    );

    const features = markup.slice(
      markup.indexOf('aria-label="Test Pact benefits"'),
    );
    expect(markup.indexOf("You gain the following benefits:")).toBeLessThan(
      markup.indexOf('aria-label="Test Pact benefits"'),
    );
    expect(features.match(/reference-entity-card/g)).toHaveLength(2);
    expect(features.indexOf("Test Pact Boon")).toBeLessThan(
      features.indexOf("Soul Step"),
    );
    expect(features.indexOf("Soul Step")).toBeLessThan(
      features.indexOf("Test Pact Reward"),
    );
    expect(features).toContain("Granted power");
    expect(features).toContain("You teleport 3 squares.");
    expect(features.indexOf("Test Pact Reward")).toBeLessThan(
      features.indexOf("Moonlit Escape"),
    );
    expect(features).toContain("You gain the soul step power.");
    expect(features).toContain("Add your Dexterity modifier to damage rolls.");
    expect(markup).not.toContain("FEATURE_MISSING");
  });
});

describe("familiar detail", () => {
  it("shows the familiar card", () => {
    const sprite = entity(
      "FAMILIAR_TEST",
      "Test Sprite",
      "Familiar",
      { Speed: "4", "Secondary Speed": "fly 6" },
      "A helpful spirit.",
    );
    const markup = renderToStaticMarkup(
      createElement(CandidateDetail, {
        candidate: { ...candidate, definitionId: sprite.id },
        entity: sprite,
        byId: new Map([[sprite.id.toLowerCase(), sprite]]),
      }),
    );
    expect(markup).toContain("print-familiar-card is-panel");
    expect(markup).toContain("Tiny familiar");
    expect(markup).toContain("4, fly 6");
  });
});

describe("beast companion detail", () => {
  it("previews a candidate beast's card from its record", () => {
    const fields = {
      Strength: "16",
      Constitution: "14",
      Dexterity: "12",
      Intelligence: "6",
      Wisdom: "12",
      Charisma: "6",
      "Attack Bonus": "2",
      Damage: "1d12",
      "Armor Class": "12",
      "Fortitude Defense": "14",
      "Reflex Defense": "10",
      "Will Defense": "12",
      "Hit Points at 1st Level": "16",
      "Hit Points per Level Gained": "10",
      Size: "Medium",
      Speed: "5",
      Attack: "Claw",
      "Ability Score": "Strength",
    };
    const bear = entity("BEAR_TEST", "Bear", "Companion", fields);
    const settings = {
      ...authoredBuilderCardSettings(1),
      beastCardFor: (record: ContentEntity) => {
        const beast = previewBeastCompanion({
          entity: record,
          level: 1,
          stats: {},
          fieldsOf: () => fields,
          content: new RulesIndex([record]),
        });
        return beast === undefined
          ? undefined
          : sheetBeastCompanionCard(record, beast);
      },
    };
    const markup = renderToStaticMarkup(
      createElement(
        BuilderCardContext.Provider,
        { value: settings },
        createElement(CandidateDetail, {
          candidate: { ...candidate, definitionId: bear.id },
          entity: bear,
          byId: new Map([[bear.id.toLowerCase(), bear]]),
        }),
      ),
    );
    expect(markup).toContain("print-beast-card is-panel");
    expect(markup).toContain("Level 1 Medium beast");
    // 16 + 1 × 10 hit points; AC 12 + level.
    expect(markup).toContain("<dt>HP</dt><dd>26</dd>");
    expect(markup).toContain("<dt>AC</dt><dd>13</dd>");
    expect(markup).toContain("<strong>Claw</strong> +3 vs AC · 1d12+3 damage");
  });
});

describe("option detail benefits", () => {
  it("follows a deity's card with its domains' cards", () => {
    const deity = entity(
      "DEITY_TEST",
      "Test Deity",
      "Deity",
      { Domains: "DOMAIN_CHANGE" },
      "The god of change.",
    );
    const change = entity(
      "DOMAIN_CHANGE",
      "Change",
      "Domain",
      {},
      "Change is ever-renewing opportunity.",
    );
    const markup = renderToStaticMarkup(
      createElement(CandidateDetail, {
        candidate: { ...candidate, definitionId: deity.id },
        entity: deity,
        byId: new Map(
          [deity, change].map((item) => [item.id.toLowerCase(), item]),
        ),
      }),
    );
    const benefits = markup.slice(
      markup.indexOf('aria-label="Test Deity benefits"'),
    );
    expect(markup.indexOf("The god of change.")).toBeLessThan(
      markup.indexOf('aria-label="Test Deity benefits"'),
    );
    expect(benefits.match(/reference-entity-card/g)).toHaveLength(1);
    expect(benefits).toContain("Change is ever-renewing opportunity.");
  });
});

describe("option detail benefits by level", () => {
  const withLevel = (item: ContentEntity, level: string): ContentEntity => ({
    ...item,
    specifics: [
      ...item.specifics,
      {
        name: "Level",
        value: level,
        extraAttributes: [],
        ordinal: item.specifics.length,
      },
    ],
  });
  const grants = (item: ContentEntity, ...ids: readonly string[]) => ({
    ...item,
    rules: ids.map((id, ordinal) => ({
      name: "grant",
      attributes: [{ name: "name", value: id }],
      text: "",
      children: [],
      ordinal,
    })),
  });
  const pact = entity(
    "PACT_LEVELS",
    "Levelled Pact",
    "Trait Package",
    { _PARSED_CLASS_FEATURE: "FEATURE_BOON, FEATURE_ALLY, FEATURE_CURSE" },
    "You gain the following benefits:",
  );
  const boon = withLevel(
    entity("FEATURE_BOON", "Levelled Pact Boon", "Class Feature", {}),
    "1",
  );
  const summoned = entity("POWER_SUMMON", "Summoned Creature", "Power", {
    "Power Usage": "Daily",
  });
  const handmaiden = entity("POWER_HANDMAIDEN", "Handmaiden", "Power", {
    "Power Usage": "At-Will",
  });
  const ally = grants(
    withLevel(
      entity("FEATURE_ALLY", "Level 9 Summon Ally", "Class Feature", {}),
      "9",
    ),
    summoned.id,
    handmaiden.id,
  );
  const curse = withLevel(
    entity("FEATURE_CURSE", "Level 11 Pact Curse", "Class Feature", {}),
    "11",
  );
  const render = (root: ContentEntity, level: number) =>
    renderToStaticMarkup(
      createElement(
        BuilderCardContext.Provider,
        { value: authoredBuilderCardSettings(level) },
        createElement(CandidateDetail, {
          candidate: { ...candidate, definitionId: root.id },
          entity: root,
          byId: new Map(
            [pact, boon, summoned, handmaiden, ally, curse, root].map(
              (item) => [item.id.toLowerCase(), item],
            ),
          ),
        }),
      ),
    );
  const sections = (markup: string) =>
    [
      ...markup.matchAll(
        /<div class="detail-level-section( is-open)?"><h3 class="detail-level-heading"><button([^>]*)>(.*?)<\/button><\/h3><div class="detail-level-cards"( hidden="")?/g,
      ),
    ].map(([, open, button = "", content = "", hidden]) => ({
      open: open !== undefined,
      expanded: button.includes('aria-expanded="true"'),
      described: button.includes("aria-describedby"),
      hidden: hidden !== undefined,
      heading: (
        /class="detail-level-summary"[^>]*>(.*?)<\/span><\/span>/.exec(
          content,
        )?.[1] ?? ""
      )
        .replaceAll(/<[^>]+>/g, "")
        .replaceAll("&#x27;", "'"),
      // Listed in the toggle only while folded.
      names: [
        ...content.matchAll(/class="detail-level-benefit">(.*?)<\/span>/g),
      ].map(([, name]) => name),
    }));

  it("folds each level's benefits under a heading that counts them", () => {
    const markup = render(pact, 9);
    expect(sections(markup)).toEqual([
      {
        open: true,
        expanded: true,
        described: false,
        hidden: false,
        heading: "Level 1 ·: 1 feature",
        names: [],
      },
      {
        open: true,
        expanded: true,
        described: false,
        hidden: false,
        heading: "Level 9 ·: 1 feature, 2 powers",
        names: [],
      },
      {
        open: false,
        expanded: false,
        described: true,
        hidden: true,
        heading: "Level 11 ·: 1 feature",
        names: ["Pact Curse"],
      },
    ]);
    // The level 9 feature is followed by the powers it grants.
    const nine = markup.slice(markup.indexOf("Level 9 Summon Ally"));
    expect(nine.indexOf("Summoned Creature")).toBeLessThan(
      nine.indexOf("Level 11 Pact Curse"),
    );
    expect(nine.indexOf("Handmaiden")).toBeLessThan(
      nine.indexOf("Level 11 Pact Curse"),
    );
    expect(markup).toContain('aria-label="Levelled Pact benefits"');
  });

  it("opens the levels up to the one the pane is viewing", () => {
    expect(sections(render(pact, 1)).map(({ open }) => open)).toEqual([
      true,
      false,
      false,
    ]);
    expect(sections(render(pact, 20)).map(({ open }) => open)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("files a theme's powers under their level and keeps one-level stacks flat", () => {
    const feature = withLevel(
      entity("THEME_FEATURE_5", "Level 5 Test Feature", "Class Feature", {}),
      "5",
    );
    const power = withLevel(
      entity("THEME_POWER_2", "Test Theme Utility", "Power", {
        "Power Usage": "Encounter",
        Class: "THEME_LEVELS",
      }),
      "2",
    );
    const theme = entity("THEME_LEVELS", "Test Theme", "Theme", {
      _PARSED_SUB_FEATURES: feature.id,
    });
    const markup = renderToStaticMarkup(
      createElement(CandidateDetail, {
        candidate: { ...candidate, definitionId: theme.id },
        entity: theme,
        byId: new Map(
          [theme, feature, power].map((item) => [item.id.toLowerCase(), item]),
        ),
      }),
    );
    expect(sections(markup).map(({ heading }) => heading)).toEqual([
      "Level 2 ·: 1 power",
      "Level 5 ·: 1 feature",
    ]);
    expect(markup).not.toContain("theme-power-cards");

    const flat = render(
      entity("PACT_FLAT", "Flat Pact", "Trait Package", {
        _PARSED_CLASS_FEATURE: "FEATURE_BOON",
      }),
      1,
    );
    expect(flat).toContain('aria-label="Flat Pact benefits"');
    expect(flat).not.toContain("detail-level-section");
  });

  it("shows a paragon path's benefits under plain level headings, only the chosen path's", () => {
    const pathCurse = withLevel(
      entity(
        "FEATURE_PATH_CURSE",
        "Level 11 Dark Curse (Test Path)",
        "Class Feature",
        {},
      ),
      "11",
    );
    const pathInvocation = withLevel(
      entity(
        "FEATURE_PATH_INVOCATION",
        "Level 12 Dark Invocation",
        "Class Feature",
        {},
      ),
      "12",
    );
    const path = entity("PATH_TEST", "Test Path", "Paragon Path", {
      "Class Features": "FEATURE_PATH_CURSE, FEATURE_PATH_INVOCATION",
    });
    const pathPact = entity("PACT_PATHS", "Path Pact", "Trait Package", {
      _PARSED_CLASS_FEATURE:
        "FEATURE_BOON, FEATURE_PATH_CURSE, FEATURE_PATH_INVOCATION",
    });
    const markupFor = (paragonPathId?: string) =>
      renderToStaticMarkup(
        createElement(
          BuilderCardContext.Provider,
          {
            value: {
              ...authoredBuilderCardSettings(11),
              ...(paragonPathId === undefined ? {} : { paragonPathId }),
            },
          },
          createElement(CandidateDetail, {
            candidate: { ...candidate, definitionId: pathPact.id },
            entity: pathPact,
            byId: new Map(
              [pathPact, boon, path, pathCurse, pathInvocation].map((item) => [
                item.id.toLowerCase(),
                item,
              ]),
            ),
          }),
        ),
      );
    const markup = markupFor();
    expect(
      sections(markup).map(({ heading, open }) => [heading, open]),
    ).toEqual([
      ["Level 1 ·: 1 feature", true],
      ["Test Path (Levels 11–12) ·: 2 features", true],
    ]);
    const pathCards = markup.slice(markup.indexOf("Test Path (Levels"));
    expect(pathCards).toContain(
      '<h4 class="detail-level-subheading">Level 11</h4>',
    );
    expect(pathCards.indexOf("Level 11 Dark Curse")).toBeLessThan(
      pathCards.indexOf("Level 12</h4>"),
    );
    expect(sections(markupFor("PATH_TEST"))).toHaveLength(2);
    // Another path taken: none of this one's benefits, and one level left.
    const other = markupFor("PATH_OTHER");
    expect(other).not.toContain("detail-level-section");
    expect(other).not.toContain("Dark Curse");
  });

  it("puts an option's prerequisites on one line before its text", () => {
    const prerequisite = {
      ...pact,
      printPrerequisites: "Hexblade\n  Dex 13;\nTrained in Arcana",
    };
    const markup = render(prerequisite, 1);
    const line =
      '<p class="entity-card-prerequisites"><strong>Prerequisite:</strong> Hexblade; Dex 13; Trained in Arcana</p>';
    expect(markup).toContain(line);
    expect(markup.indexOf(line)).toBeLessThan(
      markup.indexOf("You gain the following benefits:"),
    );
  });
});
