// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import { deityTableDomains } from "./builder-ui";
import {
  CandidateSelectionTable,
  candidateTableColumnCount,
} from "./CandidateSelectionTable";

function grant(name: string, type: string): RuleStatement {
  return {
    name: "grant",
    attributes: [
      { name: "name", value: name },
      { name: "type", value: type },
    ],
    text: "",
    children: [],
    ordinal: 0,
  };
}

function record(
  id: string,
  name: string,
  type: string,
  options: {
    readonly specifics?: Record<string, string>;
    readonly rules?: RuleStatement[];
  } = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(options.specifics ?? {}).map(
      ([field, value], ordinal) => ({
        name: field,
        value,
        extraAttributes: [],
        ordinal,
      }),
    ),
    rules: options.rules ?? [],
    description: `${name} is a record.`,
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
  };
}

// As stock content spells them: a deity's "Domains" field lists Domain
// record IDs; Torag grants the CountsAsDeity record named Moradin.
const moradin = record("ID_MORADIN", "Moradin", "Deity", {
  specifics: {
    Alignment: "Lawful Good",
    Domains: "ID_DOMAIN_CREATION, ID_DOMAIN_EARTH",
  },
});
const torag = record("ID_TORAG", "Torag", "Deity", {
  specifics: { Alignment: "Lawful Good", Domains: "ID_DOMAIN_PROTECTION" },
  rules: [grant("ID_COUNTSASDEITY_MORADIN", "CountsAsDeity")],
});
const sehanine = record("ID_SEHANINE", "Sehanine", "Deity", {
  specifics: { Alignment: "Unaligned" },
});
const halfdrake = record("ID_HALFDRAKE", "Halfdrake", "Race", {
  rules: [grant("ID_COUNTSASRACE_DRAGONBORN", "CountsAsRace")],
});
const oldDraconic = record("ID_OLD_DRACONIC", "Old Draconic", "Language", {
  rules: [grant("ID_COUNTSASLANGUAGE_DRACONIC", "CountsAsLanguage")],
});
const entities = [
  moradin,
  torag,
  sehanine,
  record("ID_COUNTSASDEITY_MORADIN", "Moradin", "CountsAsDeity"),
  record("ID_DOMAIN_CREATION", "Creation", "Domain"),
  record("ID_DOMAIN_EARTH", "Earth", "Domain"),
  record("ID_DOMAIN_PROTECTION", "Protection", "Domain"),
  halfdrake,
  record("ID_ELF", "Elf", "Race"),
  record("ID_COUNTSASRACE_DRAGONBORN", "Dragonborn", "CountsAsRace"),
  oldDraconic,
  record("ID_GIANT", "Giant", "Language"),
  record("ID_COUNTSASLANGUAGE_DRACONIC", "Draconic", "CountsAsLanguage"),
];
const byId = new Map(
  entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
);

function candidate(entity: ContentEntity): CandidateDecision {
  return {
    definitionId: entity.id,
    eligible: true,
    sourceEntitled: true,
    rulesLegal: true,
    activeDefinition: false,
    activeOccurrenceIds: [],
    providerOccurrenceIds: [],
    reasons: [],
  };
}

describe("deityTableDomains", () => {
  it("names the deity's domains, cached per content and record", () => {
    expect(deityTableDomains(moradin, byId)).toBe("Creation, Earth");
    expect(deityTableDomains(sehanine, byId)).toBeUndefined();
    // A different entity map is different content.
    expect(deityTableDomains(moradin, new Map())).toBeUndefined();
  });
});

describe("Deity table Domains column", () => {
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

  function render(kind: "deity" | "option", options: readonly ContentEntity[]) {
    act(() =>
      root.render(
        <CandidateSelectionTable
          kind={kind}
          candidates={options.map(candidate)}
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

  function search(text: string) {
    const input = container.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const rowNames = () =>
    [...container.querySelectorAll("tr.selection-candidate-row")].map(
      (row) => row.querySelector(".selection-table-name button")!.textContent,
    );

  it("adds Domains between Alignment and Description", () => {
    render("deity", [moradin, torag, sehanine]);
    const headers = [...container.querySelectorAll("thead th")];
    expect(headers.map((header) => header.textContent)).toEqual([
      "Deity",
      "Alignment",
      "Domains",
      "Description",
    ]);
    expect(headers[2]!.className).toBe(
      "selection-col-optional selection-col-domains",
    );
    const domains = [
      ...container.querySelectorAll("tr.selection-candidate-row"),
    ].map((row) => row.querySelector("td.selection-col-domains")!.textContent);
    // Rows sort by name: Moradin, Sehanine, Torag.
    expect(domains).toEqual(["Creation, Earth", "—", "Protection"]);
  });

  it("spans the bands and empty row over every column, the optional one included", () => {
    render("deity", [moradin, torag, sehanine]);
    const columns = container.querySelectorAll("thead th").length;
    expect(candidateTableColumnCount("deity")).toBe(columns);
    for (const row of container.querySelectorAll("tr.selection-candidate-row"))
      expect(row.children).toHaveLength(columns);
    for (const band of container.querySelectorAll("tr.table-section-row th"))
      expect((band as HTMLTableCellElement).colSpan).toBe(columns);
    search("no such deity");
    expect(
      (container.querySelector("tbody td") as HTMLTableCellElement).colSpan,
    ).toBe(columns);
  });

  it("finds a deity by what it counts as, and by its domains", () => {
    render("deity", [moradin, torag, sehanine]);
    search("Moradin");
    expect(rowNames()).toEqual(["Moradin", "Torag"]);
    search("protection");
    expect(rowNames()).toEqual(["Torag"]);
  });

  it("finds races and languages by what they count as", () => {
    render("option", [halfdrake, entities[8]!]);
    search("dragonborn");
    expect(rowNames()).toEqual(["Halfdrake"]);
    render("option", [oldDraconic, entities[11]!]);
    search("draconic");
    expect(rowNames()).toEqual(["Old Draconic"]);
  });
});
