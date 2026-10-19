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
