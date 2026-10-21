import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

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
  it("follows the package's card with a card per class feature it lists", () => {
    const pact = entity(
      "PACT_TEST",
      "Test Pact",
      "Trait Package",
      {
        _PARSED_CLASS_FEATURE: " FEATURE_BOON, FEATURE_MISSING,FEATURE_REWARD ",
      },
      "You gain the following benefits:",
    );
    const boon = entity(
      "FEATURE_BOON",
      "Test Pact Boon",
      "Class Feature",
      {},
      "You gain the soul step power.",
    );
    const reward = entity(
      "FEATURE_REWARD",
      "Test Pact Reward",
      "Class Feature",
      {},
      "Add your Dexterity modifier to damage rolls.",
    );
    const markup = renderToStaticMarkup(
      createElement(CandidateDetail, {
        candidate: { ...candidate, definitionId: pact.id },
        entity: pact,
        byId: new Map(
          [reward, pact, boon].map((item) => [item.id.toLowerCase(), item]),
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
      features.indexOf("Test Pact Reward"),
    );
    expect(features).toContain("You gain the soul step power.");
    expect(features).toContain("Add your Dexterity modifier to damage rolls.");
    expect(markup).not.toContain("FEATURE_MISSING");
  });
});
