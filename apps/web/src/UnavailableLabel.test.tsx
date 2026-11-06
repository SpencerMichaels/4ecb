// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import { unavailablePresentation } from "./builder-ui";
import { CandidateDetailCard } from "./CandidateDetail";
import { CandidateSelectionTable } from "./CandidateSelectionTable";
import { CompactChoiceButtons } from "./ChoiceEditors";

function feat(index: number, name: string): ContentEntity {
  return {
    id: `ID_TEST_FEAT_${index}`,
    name,
    type: "Feat",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: `${name} is a feat.`,
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: index },
  };
}

function candidate(
  entity: ContentEntity,
  reasons: readonly string[],
): CandidateDecision {
  const permission = reasons.some(
    (reason) =>
      reason === "campaign-restricted" || reason === "source-unentitled",
  );
  return {
    definitionId: entity.id,
    eligible: reasons.length === 0,
    sourceEntitled: !permission,
    rulesLegal: !reasons.includes("prerequisite"),
    activeDefinition: false,
    activeOccurrenceIds: [],
    providerOccurrenceIds: [],
    reasons,
  };
}

const restricted = feat(1, "Campaign Banned");
const unsourced = feat(2, "Other Book");
const unmet = feat(3, "Too Hard");
const byId = new Map(
  [restricted, unsourced, unmet].map((entity) => [
    entity.id.toLocaleLowerCase(),
    entity,
  ]),
);
const candidates = [
  candidate(restricted, ["campaign-restricted"]),
  candidate(unsourced, ["source-unentitled"]),
  candidate(unmet, ["prerequisite"]),
];

describe("unavailablePresentation", () => {
  it("merges a permission reason into the label, keeps a rule reason apart", () => {
    expect(unavailablePresentation(["campaign-restricted"])).toEqual({
      label: "Unavailable in this campaign",
      description: "Not used in this campaign",
      status: "Unavailable in this campaign",
    });
    expect(unavailablePresentation(["source-unentitled"]).label).toBe(
      "Unavailable: not in your allowed sources",
    );
    expect(
      unavailablePresentation(["source-unentitled", "campaign-restricted"])
        .label,
    ).toBe("Unavailable in this campaign");
    expect(unavailablePresentation(["prerequisite"])).toEqual({
      label: "Unavailable",
      reason: "Does not meet prerequisites",
      description: "Does not meet prerequisites",
      status: "Does not meet prerequisites",
    });
    expect(
      unavailablePresentation(["campaign-restricted", "prerequisite"]).label,
    ).toBe("Unavailable");
  });
});

describe("one Unavailable label", () => {
  it("labels a candidate card the same way for every reason", () => {
    const card = (index: number) =>
      renderToStaticMarkup(
        createElement(CandidateDetailCard, {
          candidate: candidates[index]!,
          entity: [restricted, unsourced, unmet][index]!,
        }),
      );
    expect(card(0)).toContain(
      'class="candidate-unavailable" title="Not used in this campaign">Unavailable in this campaign</span>',
    );
    expect(card(0)).not.toContain("candidate-reason");
    expect(card(1)).toContain(">Unavailable: not in your allowed sources<");
    expect(card(1)).not.toContain("candidate-reason");
    expect(card(2)).toContain(
      'class="candidate-unavailable" title="Does not meet prerequisites">Unavailable</span>',
    );
    expect(card(2)).toContain(
      '<p class="candidate-reason">Does not meet prerequisites</p>',
    );
  });

  it("marks choice buttons with the same label", () => {
    const markup = renderToStaticMarkup(
      createElement(CompactChoiceButtons, {
        label: "Pick",
        options: [
          {
            id: "a",
            label: "Kept",
            selectable: true,
            unavailableReasons: ["campaign-restricted"],
          },
          {
            id: "b",
            label: "Unmet",
            selectable: false,
            unavailableReasons: ["prerequisite"],
          },
        ],
        selectedId: "a",
        disabled: false,
        onChoose: () => undefined,
      }),
    );
    expect(markup).toContain('title="Not used in this campaign"');
    expect(markup).toContain(
      '<span class="unavailable-note"><span class="candidate-unavailable" title="Not used in this campaign">Unavailable in this campaign</span></span>',
    );
    expect(markup).toContain(
      '<span class="unavailable-note"><span class="candidate-unavailable" title="Does not meet prerequisites">Unavailable</span><small>Does not meet prerequisites</small></span>',
    );
  });
});

describe("Unavailable rows", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows each row's reason as the label, the full reason described", () => {
    act(() =>
      root.render(
        <CandidateSelectionTable
          kind="deity"
          candidates={candidates}
          featGroups={[]}
          selectedIds={new Set()}
          expandedGroupKey=""
          byId={byId}
          disabled={false}
          onExpandGroup={() => undefined}
          onInspect={() => undefined}
          onToggle={() => undefined}
        />,
      ),
    );
    const rows = [
      ...container.querySelectorAll("tr.selection-candidate-row"),
    ].map((row) => ({
      label: row.querySelector(".unavailable-note .candidate-unavailable")
        ?.textContent,
      reason: row.querySelector(".unavailable-note small")?.textContent,
      description: row
        .querySelector(".selection-candidate-toggle")
        ?.getAttribute("aria-description"),
    }));
    expect(rows).toEqual([
      {
        label: "Unavailable in this campaign",
        reason: undefined,
        description:
          "Click to inspect. This item cannot currently be selected. Unavailable: Not used in this campaign.",
      },
      {
        label: "Unavailable: not in your allowed sources",
        reason: undefined,
        description:
          "Click to inspect. This item cannot currently be selected. Unavailable: Not included in this character's allowed sources.",
      },
      {
        label: "Unavailable",
        reason: "Does not meet prerequisites",
        description:
          "Click to inspect. Double-click or press Enter to select. Unavailable: Does not meet prerequisites.",
      },
    ]);
  });
});
