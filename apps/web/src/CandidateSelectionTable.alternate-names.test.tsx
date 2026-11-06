// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import { CandidateSelectionTable } from "./CandidateSelectionTable";

function race(
  id: string,
  name: string,
  names: Pick<ContentEntity, "aliases" | "alternateName"> = {},
): ContentEntity {
  return {
    id,
    name,
    type: "Race",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: `${name} is a race.`,
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
    ...names,
  };
}

// A campaign's alternate name keeps the record's name (D116): Pathfinder's
// Shadar-kai is called Fetchling; a rename keeps the stock name as an alias.
const shadarKai = race("ID_SHADAR_KAI", "Shadar-kai", {
  alternateName: "Fetchling",
});
const aasimar = race("ID_DEVA", "Aasimar", { aliases: ["Deva"] });
const elf = race("ID_ELF", "Elf");
const entities = [shadarKai, aasimar, elf];
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

describe("choice table alternate names", () => {
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
    act(() =>
      root.render(
        <CandidateSelectionTable
          kind="option"
          candidates={entities.map(candidate)}
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

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

  it("titles a row with the record's name and its alternate name", () => {
    expect(rowNames()).toEqual(["Aasimar", "Elf", "Shadar-kai (Fetchling)"]);
  });

  it("finds a record by its alternate name or an alias", () => {
    search("fetchling");
    expect(rowNames()).toEqual(["Shadar-kai (Fetchling)"]);
    search("shadar");
    expect(rowNames()).toEqual(["Shadar-kai (Fetchling)"]);
    search("deva");
    expect(rowNames()).toEqual(["Aasimar"]);
  });
});
