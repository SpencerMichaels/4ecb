import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import * as builderUi from "./builder-ui";
import { CandidateSelectionTable } from "./CandidateSelectionTable";

vi.mock("./builder-ui", async (importOriginal) => {
  const original = await importOriginal<typeof builderUi>();
  return {
    ...original,
    candidateTableTypeGroup: vi.fn(original.candidateTableTypeGroup),
  };
});

function feat(index: number): ContentEntity {
  return {
    id: `FEAT_${index}`,
    name: `Feat ${index}`,
    type: "Feat",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [
      {
        name: "Tier",
        value: index % 2 === 0 ? "Heroic" : "Paragon",
        extraAttributes: [],
        ordinal: 0,
      },
    ],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: index },
  };
}

describe("candidate table caching", () => {
  it("groups each record into its type section once, not on every render", () => {
    const entities = Array.from({ length: 6 }, (_, index) => feat(index));
    const byId = new Map(
      entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
    );
    const candidates: CandidateDecision[] = entities.map((entity) => ({
      definitionId: entity.id,
      eligible: true,
      sourceEntitled: true,
      rulesLegal: true,
      activeDefinition: false,
      activeOccurrenceIds: [],
      providerOccurrenceIds: [],
      reasons: [],
    }));
    const render = () =>
      renderToStaticMarkup(
        createElement(CandidateSelectionTable, {
          kind: "feat",
          candidates,
          featGroups: builderUi.groupParameterizedCandidates(
            candidates,
            (id) => byId.get(id.toLocaleLowerCase())?.name ?? id,
          ),
          selectedIds: new Set<string>(),
          expandedGroupKey: "",
          byId,
          disabled: false,
          onExpandGroup: () => undefined,
          onInspect: () => undefined,
          onToggle: () => undefined,
        }),
      );
    const typeGroup = vi.mocked(builderUi.candidateTableTypeGroup);
    const first = render();
    const calls = typeGroup.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(entities.length);
    // A filter keystroke or an inspected row renders the table again.
    expect(render()).toBe(first);
    expect(typeGroup.mock.calls.length).toBe(calls);
  });
});
