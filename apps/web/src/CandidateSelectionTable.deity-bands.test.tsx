// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import {
  DEITY_PANTHEON_FALLBACK,
  deityOfferedBands,
  deityTableGroup,
  isCandidateVisible,
} from "./builder-ui";
import { CandidateSelectionTable } from "./CandidateSelectionTable";
import { entityCardSpecifics } from "./EntityCard";

// Spelled as the content spells them: an authored "Pantheon" specific
// beside the stock "Alignment" (content/corrections/9I-deity-pantheons.part,
// content/campaigns/pathfinder/house-rules.xml).
function deity(
  index: number,
  name: string,
  pantheon: string | undefined,
  provenance = { sourceKey: "test", sourceOrdinal: index },
): ContentEntity {
  return {
    id: `ID_TEST_DEITY_${index}`,
    name,
    type: "Deity",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [
      { name: "Alignment", value: "Good", extraAttributes: [], ordinal: 0 },
      ...(pantheon === undefined
        ? []
        : [
            {
              name: "Pantheon",
              value: pantheon,
              extraAttributes: [],
              ordinal: 1,
            },
          ]),
    ],
    rules: [],
    description: `${name} is a deity.`,
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

// Content order: Core first, then Eberron, then Inner Sea; one homebrew
// deity without a Pantheon.
const entities = [
  deity(1, "Avandra", "Core"),
  deity(2, "Bahamut", "Core"),
  deity(3, "Arawai", "Eberron"),
  deity(4, "Homebrew God", undefined),
  deity(5, "Abadar", "Inner Sea major deities"),
  deity(6, "Desna", "Inner Sea major deities"),
];
const byId = new Map(
  entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
);

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

describe("deityTableGroup", () => {
  it("bands by authored Pantheon in content order, the fallback last", () => {
    const groups = entities.map((entity) => deityTableGroup(entity, byId));
    expect(groups.map(({ label }) => label)).toEqual([
      "Core",
      "Core",
      "Eberron",
      DEITY_PANTHEON_FALLBACK,
      "Inner Sea major deities",
      "Inner Sea major deities",
    ]);
    const order = (label: string) =>
      groups.find((group) => group.label === label)!.order;
    expect(order("Core")).toBeLessThan(order("Eberron"));
    expect(order("Eberron")).toBeLessThan(order("Inner Sea major deities"));
    expect(order(DEITY_PANTHEON_FALLBACK)).toBeGreaterThan(
      order("Inner Sea major deities"),
    );
    expect(groups[0]!.key).toBe(groups[1]!.key);
    expect(deityTableGroup(undefined, byId).key).toBe(groups[3]!.key);
  });

  it("orders bands by source position, not by record ID", () => {
    // Composition sorts records by ID; the IDs here run against the
    // authored order (ID_TEST_DEITY_1 is authored last).
    const records = [
      deity(1, "Zon-Kuthon", "Archdevils", {
        sourceKey: "rules.xml",
        sourceOrdinal: 30,
      }),
      deity(2, "Torag", "Dwarven", {
        sourceKey: "rules.xml",
        sourceOrdinal: 20,
      }),
      deity(3, "Calistria", "Elven", {
        sourceKey: "rules.xml",
        sourceOrdinal: 10,
      }),
      deity(4, "Abadar", "Inner Sea major deities", {
        sourceKey: "rules.xml",
        sourceOrdinal: 0,
      }),
      deity(5, "Erastil", "Inner Sea major deities", {
        sourceKey: "rules.xml",
        sourceOrdinal: 1,
      }),
    ];
    const map = entityMap(records);
    const order = (index: number) => deityTableGroup(records[index], map).order;
    expect([3, 2, 1, 0].map(order)).toEqual([0, 1, 2, 3]);
    expect(order(4)).toBe(order(3));
  });

  it("puts the base content's bands before a smaller overlay's", () => {
    const base = Array.from({ length: 4 }, (_, index) =>
      deity(10 + index, `Stock ${index}`, index < 2 ? "Core" : "Eberron", {
        sourceKey: "base",
        sourceOrdinal: 500 + index,
      }),
    );
    const overlay = deity(1, "Abadar", "Inner Sea major deities", {
      sourceKey: "house-rules.xml",
      sourceOrdinal: 0,
    });
    const map = entityMap([overlay, ...base]);
    const label = (entity: ContentEntity) => deityTableGroup(entity, map);
    expect(
      [overlay, base[0]!, base[2]!]
        .map(label)
        .sort((left, right) => left.order - right.order)
        .map(({ label }) => label),
    ).toEqual(["Core", "Eberron", "Inner Sea major deities"]);
    expect(deityTableGroup(undefined, map).order).toBeGreaterThan(
      label(overlay).order,
    );
  });

  it("puts bands with a pickable deity before campaign-restricted ones", () => {
    const decisions = entities.map((entity) =>
      candidate(entity, !/^Inner Sea/.test(entity.specifics[1]?.value ?? "")),
    );
    const offered = deityOfferedBands(decisions, byId);
    const order = (index: number) =>
      deityTableGroup(entities[index], byId, offered).order;
    // Inner Sea (offered) leads; Core and Eberron keep their order after it.
    expect(order(4)).toBeLessThan(order(0));
    expect(order(0)).toBeLessThan(order(2));
    expect(order(3)).toBeGreaterThan(order(2));
  });

  it("computes the band positions once per content", () => {
    let scans = 0;
    class CountingMap extends Map<string, ContentEntity> {
      override values() {
        scans += 1;
        return super.values();
      }
    }
    const map = new CountingMap(byId);
    for (let round = 0; round < 3; round += 1)
      for (const entity of entities) deityTableGroup(entity, map);
    const first = scans;
    for (const entity of entities) deityTableGroup(entity, map, new Set());
    expect(first).toBeGreaterThan(0);
    expect(scans).toBe(first);
  });

  it("shows the Pantheon on the deity card as an authored field", () => {
    expect(
      entityCardSpecifics(entities[0]!).map(({ name, value }) => [name, value]),
    ).toEqual([
      ["Alignment", "Good"],
      ["Pantheon", "Core"],
    ]);
  });
});

describe("Deity table bands", () => {
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

  it("groups rows into open bands in content order, the fallback last", () => {
    render(entities.map((entity) => candidate(entity)));
    expect(bands()).toEqual([
      { label: "Core", count: "2", expanded: "true", colSpan: 4 },
      { label: "Eberron", count: "1", expanded: "true", colSpan: 4 },
      {
        label: "Inner Sea major deities",
        count: "2",
        expanded: "true",
        colSpan: 4,
      },
      { label: "Other", count: "1", expanded: "true", colSpan: 4 },
    ]);
    expect(rowNames()).toEqual([
      "Avandra",
      "Bahamut",
      "Arawai",
      "Abadar",
      "Desna",
      "Homebrew God",
    ]);
  });

  it("collapses and reopens a band from its toggle", () => {
    render(entities.map((entity) => candidate(entity)));
    const coreToggle = () =>
      container.querySelector<HTMLButtonElement>(
        "tr.table-section-row .table-section-toggle",
      )!;
    act(() => coreToggle().click());
    expect(coreToggle().getAttribute("aria-expanded")).toBe("false");
    expect(rowNames()).not.toContain("Avandra");
    expect(rowNames()).toContain("Arawai");
    // The collapsed band stays, with its count.
    expect(bands()[0]).toMatchObject({ label: "Core", count: "2" });
    act(() => coreToggle().click());
    expect(rowNames()).toContain("Avandra");
  });

  it("filters across bands, dropping bands with no matching rows", () => {
    render(entities.map((entity) => candidate(entity)));
    const input = container.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setValue.call(input, "ab");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(rowNames()).toEqual(["Abadar"]);
    expect(bands().map(({ label, count }) => [label, count])).toEqual([
      ["Inner Sea major deities", "1"],
    ]);
  });

  it("shows a campaign's restricted stock deities, in their bands, only under Show all", () => {
    // Under a campaign the stock deities are restricted (D116).
    const decisions = entities.map((entity) =>
      candidate(entity, !/^Inner Sea/.test(entity.specifics[1]?.value ?? "")),
    );
    render(decisions.filter((item) => isCandidateVisible(item, false)));
    expect(bands().map(({ label }) => label)).toEqual([
      "Inner Sea major deities",
    ]);
    render(decisions.filter((item) => isCandidateVisible(item, true)));
    expect(bands().map(({ label }) => label)).toEqual([
      "Inner Sea major deities",
      "Core",
      "Eberron",
      "Other",
    ]);
  });
});
