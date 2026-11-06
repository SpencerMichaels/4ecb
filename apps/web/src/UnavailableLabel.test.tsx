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
import { UnavailableLabel } from "./UnavailableLabel";

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
  it("says Unavailable for a permission reason, Illegal for a rule", () => {
    expect(unavailablePresentation(["campaign-restricted"])).toEqual({
      label: "Unavailable in this campaign",
      description: "Unavailable in this campaign",
      status: "unavailable",
    });
    expect(unavailablePresentation(["source-unentitled"]).label).toBe(
      "Unavailable: not in your allowed sources",
    );
    expect(
      unavailablePresentation(["source-unentitled", "campaign-restricted"]),
    ).toEqual({
      label: "Unavailable in this campaign",
      description:
        "Unavailable in this campaign. Unavailable: not in your allowed sources",
      status: "unavailable",
    });
    expect(unavailablePresentation(["prerequisite"])).toEqual({
      label: "Illegal: does not meet prerequisites",
      description: "Illegal: does not meet prerequisites",
      status: "illegal",
    });
    expect(unavailablePresentation(["prerequisite", "duplicate"])).toEqual({
      label: "Illegal: does not meet prerequisites (+1 more)",
      description:
        "Illegal: does not meet prerequisites; already selected in another slot",
      status: "illegal",
    });
  });

  it("shows the permission label when a rule reason also applies", () => {
    expect(
      unavailablePresentation(["campaign-restricted", "prerequisite"]),
    ).toEqual({
      label: "Unavailable in this campaign",
      description:
        "Unavailable in this campaign. Illegal: does not meet prerequisites",
      status: "unavailable",
    });
  });

  it("says Unverified for a lone unparsed prerequisite", () => {
    expect(unavailablePresentation(["prerequisite-unverified"])).toEqual({
      label: "Unverified: prerequisites can't be checked",
      description: "Unverified: prerequisites can't be checked",
      status: "unverified",
    });
  });

  it("lets a rule reason win over an unverified one", () => {
    expect(
      unavailablePresentation(["prerequisite-unverified", "duplicate"]),
    ).toEqual({
      label: "Illegal: already selected in another slot (+1 more)",
      description:
        "Illegal: already selected in another slot. Unverified: prerequisites can't be checked",
      status: "illegal",
    });
  });

  it("lets a permission reason win over an unverified one", () => {
    expect(
      unavailablePresentation(["prerequisite-unverified", "source-unentitled"]),
    ).toEqual({
      label: "Unavailable: not in your allowed sources",
      description:
        "Unavailable: not in your allowed sources. Unverified: prerequisites can't be checked",
      status: "unavailable",
    });
  });
});

describe("UnavailableLabel tone", () => {
  it("adds one modifier class per status", () => {
    const badge = (reasons: readonly string[]) =>
      renderToStaticMarkup(createElement(UnavailableLabel, { reasons }));
    expect(badge(["campaign-restricted"])).toContain(
      'class="candidate-unavailable candidate-unavailable-unavailable"',
    );
    expect(badge(["prerequisite"])).toContain(
      'class="candidate-unavailable candidate-unavailable-illegal"',
    );
    expect(badge(["prerequisite-unverified"])).toContain(
      'class="candidate-unavailable candidate-unavailable-unverified"',
    );
  });
});

describe("one label per status", () => {
  it("labels a candidate card with the one badge and no reason box", () => {
    const card = (index: number) =>
      renderToStaticMarkup(
        createElement(CandidateDetailCard, {
          candidate: candidates[index]!,
          entity: [restricted, unsourced, unmet][index]!,
        }),
      );
    expect(card(0)).toContain(
      'class="candidate-unavailable candidate-unavailable-unavailable" title="Unavailable in this campaign">Unavailable in this campaign</span>',
    );
    expect(card(1)).toContain(">Unavailable: not in your allowed sources<");
    expect(card(2)).toContain(
      'class="candidate-unavailable candidate-unavailable-illegal" title="Illegal: does not meet prerequisites">Illegal: does not meet prerequisites</span>',
    );
    for (const index of [0, 1, 2]) {
      expect(card(index)).not.toContain("candidate-reason");
      expect(card(index).match(/class="candidate-unavailable /g)).toHaveLength(
        1,
      );
    }
  });

  it("marks choice buttons with the same label and no reason text", () => {
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
    expect(markup).toContain(
      '<span class="candidate-unavailable candidate-unavailable-unavailable" title="Unavailable in this campaign">Unavailable in this campaign</span></button>',
    );
    expect(markup).toContain(
      '<span class="candidate-unavailable candidate-unavailable-illegal" title="Illegal: does not meet prerequisites">Illegal: does not meet prerequisites</span></button>',
    );
    expect(markup).not.toContain("<small");
    expect(markup).not.toContain("unavailable-note");
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

  it("shows each row's one label, every reason described", () => {
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
      label: [...row.querySelectorAll(".candidate-unavailable")].map(
        (badge) => badge.textContent,
      ),
      small: row.querySelector("td small")?.textContent,
      description: row
        .querySelector(".selection-candidate-toggle")
        ?.getAttribute("aria-description"),
    }));
    expect(rows).toEqual([
      {
        label: ["Unavailable in this campaign"],
        small: undefined,
        description:
          "Click to inspect. This item cannot currently be selected. Unavailable in this campaign.",
      },
      {
        label: ["Unavailable: not in your allowed sources"],
        small: undefined,
        description:
          "Click to inspect. This item cannot currently be selected. Unavailable: not in your allowed sources.",
      },
      {
        label: ["Illegal: does not meet prerequisites"],
        small: undefined,
        description:
          "Click to inspect. Double-click or press Enter to select. Illegal: does not meet prerequisites.",
      },
    ]);
  });
});
