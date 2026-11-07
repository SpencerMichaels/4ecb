// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import {
  authoredTableGroup,
  candidateTableBands,
  DEITY_TABLE_BANDS,
  isCandidateVisible,
  LANGUAGE_TABLE_BANDS,
} from "./builder-ui";
import { CandidateSelectionTable } from "./CandidateSelectionTable";
import { entityCardSpecifics } from "./EntityCard";

// Spelled as the content spells them: the stock Starting category and a
// campaign's authored "Language Group" specific
// (content/campaigns/pathfinder/house-rules.xml).
function language(
  index: number,
  name: string,
  group: string | undefined,
  provenance = { sourceKey: "house-rules.xml", sourceOrdinal: index },
): ContentEntity {
  return {
    id: `ID_TEST_LANGUAGE_${index}`,
    name,
    type: "Language",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: ["ID_INTERNAL_CATEGORY_STARTING"],
    specifics:
      group === undefined
        ? []
        : [
            {
              name: "Language Group",
              value: ` ${group} `,
              extraAttributes: [],
              ordinal: 0,
            },
          ],
    rules: [],
    description: `${name} is a language.`,
    extensions: [],
    provenance,
  };
}

function entityMap(
  records: readonly ContentEntity[],
): Map<string, ContentEntity> {
  return new Map(
    records.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
}

// A campaign's languages in its file's order (Common, Regional, Uncommon,
// Ancient), a kept ungrouped copy, and two stock languages from the larger
// server pack that the campaign restricts.
const campaign = [
  language(1, "Common", "Common"),
  language(2, "Elven", "Common"),
  language(3, "Varisian", "Regional"),
  language(4, "Tien", "Regional"),
  language(5, "Aklo", "Uncommon"),
  language(6, "Thassilonian", "Ancient"),
  language(7, "Secret Language", undefined),
];
const stock = [
  language(8, "Netherese", undefined, {
    sourceKey: "server",
    sourceOrdinal: 100,
  }),
  language(9, "Shou", undefined, { sourceKey: "server", sourceOrdinal: 101 }),
];
const all = [...campaign, ...stock];
const byId = entityMap([
  ...all,
  // The server pack is the larger source.
  ...Array.from({ length: 20 }, (_, index) => ({
    ...language(100 + index, `Filler ${index}`, undefined, {
      sourceKey: "server",
      sourceOrdinal: 200 + index,
    }),
    type: "Feat",
  })),
]);

function candidate(
  entity: ContentEntity,
  restricted = false,
): CandidateDecision {
  return {
    definitionId: entity.id,
    eligible: !restricted,
    sourceEntitled: !restricted,
    rulesLegal: true,
    activeDefinition: false,
    activeOccurrenceIds: [],
    providerOccurrenceIds: [],
    reasons: restricted ? ["campaign-restricted"] : [],
  };
}

const decisions = all.map((entity) =>
  candidate(entity, stock.includes(entity)),
);

describe("candidateTableBands", () => {
  it("bands a language table only when a language has a group", () => {
    expect(candidateTableBands("option", decisions, byId)).toBe(
      LANGUAGE_TABLE_BANDS,
    );
    // Stock content: no authored group, one unbanded list as before.
    expect(
      candidateTableBands(
        "option",
        stock.map((entity) => candidate(entity)),
        byId,
      ),
    ).toBeUndefined();
    // The Deity table always bands; feats and powers band by type instead.
    expect(candidateTableBands("deity", [], byId)).toBe(DEITY_TABLE_BANDS);
    expect(candidateTableBands("feat", decisions, byId)).toBeUndefined();
  });

  it("orders a campaign's language groups as authored, Other last", () => {
    const group = (entity: ContentEntity) =>
      authoredTableGroup(entity, byId, LANGUAGE_TABLE_BANDS);
    expect(campaign.map((entity) => group(entity).label)).toEqual([
      "Common",
      "Common",
      "Regional",
      "Regional",
      "Uncommon",
      "Ancient",
      "Other",
    ]);
    const orders = campaign.map((entity) => group(entity).order);
    expect(orders[0]).toBeLessThan(orders[2]!);
    expect(orders[2]).toBeLessThan(orders[4]!);
    expect(orders[4]).toBeLessThan(orders[5]!);
    expect(orders[6]).toBeGreaterThan(orders[5]!);
    expect(group(stock[0]!).key).toBe(group(campaign[6]!).key);
  });

  it("keeps deity and language band positions apart for one content", () => {
    const deity: ContentEntity = {
      ...language(50, "Abadar", undefined),
      type: "Deity",
      specifics: [
        {
          name: "Pantheon",
          value: "Inner Sea major deities",
          extraAttributes: [],
          ordinal: 0,
        },
      ],
    };
    const map = entityMap([...all, deity]);
    expect(authoredTableGroup(deity, map, DEITY_TABLE_BANDS)).toMatchObject({
      label: "Inner Sea major deities",
      order: 0,
    });
    expect(
      authoredTableGroup(campaign[0], map, LANGUAGE_TABLE_BANDS),
    ).toMatchObject({ label: "Common", order: 0 });
    // A language's group is not a deity band.
    expect(authoredTableGroup(campaign[0], map, DEITY_TABLE_BANDS).label).toBe(
      "Other",
    );
  });

  it("shows the group in the language card's subheader, not its body", () => {
    expect(entityCardSpecifics(campaign[2]!)).toEqual([]);
  });
});

describe("Language table bands", () => {
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

  function render(candidates: readonly CandidateDecision[]) {
    act(() =>
      root.render(
        <CandidateSelectionTable
          kind="option"
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
  }

  const bands = () =>
    [...container.querySelectorAll("tr.table-section-row")].map((row) => ({
      label: row.querySelector(".table-section-toggle > span")!.textContent,
      count: row.querySelector(".table-section-count")!.textContent,
      expanded: row
        .querySelector(".table-section-toggle")!
        .getAttribute("aria-expanded"),
      colSpan: row.querySelector("th")!.colSpan,
    }));
  const rowNames = () =>
    [...container.querySelectorAll("tr.selection-candidate-row")].map(
      (row) => row.querySelector(".selection-table-name button")!.textContent,
    );

  it("groups a campaign's languages into open bands in authored order", () => {
    render(decisions.filter((item) => isCandidateVisible(item, false)));
    expect(bands()).toEqual([
      { label: "Common", count: "2", expanded: "true", colSpan: 2 },
      { label: "Regional", count: "2", expanded: "true", colSpan: 2 },
      { label: "Uncommon", count: "1", expanded: "true", colSpan: 2 },
      { label: "Ancient", count: "1", expanded: "true", colSpan: 2 },
      { label: "Other", count: "1", expanded: "true", colSpan: 2 },
    ]);
    expect(rowNames()).toEqual([
      "Common",
      "Elven",
      "Tien",
      "Varisian",
      "Aklo",
      "Thassilonian",
      "Secret Language",
    ]);
  });

  it("collapses and reopens a band from its toggle", () => {
    render(decisions.filter((item) => isCandidateVisible(item, false)));
    const regionalToggle = () =>
      [
        ...container.querySelectorAll<HTMLButtonElement>(
          "tr.table-section-row .table-section-toggle",
        ),
      ][1]!;
    act(() => regionalToggle().click());
    expect(regionalToggle().getAttribute("aria-expanded")).toBe("false");
    expect(rowNames()).not.toContain("Varisian");
    expect(bands()[1]).toMatchObject({ label: "Regional", count: "2" });
    act(() => regionalToggle().click());
    expect(rowNames()).toContain("Varisian");
  });

  it("lists the restricted stock languages, in the Other band, only under Show all", () => {
    render(decisions.filter((item) => isCandidateVisible(item, true)));
    expect(bands().map(({ label, count }) => [label, count])).toEqual([
      ["Common", "2"],
      ["Regional", "2"],
      ["Uncommon", "1"],
      ["Ancient", "1"],
      ["Other", "3"],
    ]);
  });

  it("leaves stock languages one unbanded list", () => {
    render(stock.map((entity) => candidate(entity)));
    expect(bands()).toEqual([]);
    expect(rowNames()).toEqual(["Netherese", "Shou"]);
  });
});
