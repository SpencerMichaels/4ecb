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
