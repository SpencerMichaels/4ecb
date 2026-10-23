// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentEntity } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import { CandidateSelectionTable } from "./CandidateSelectionTable";

// jsdom has no layout, so model one: the table's scroll box sits at y=100
// with a 30px column header, and every body row (section bands included) is
// 20px tall. Rows report where they would be at the box's current scroll.
const VIEWPORT_TOP = 100;
const HEADER = 30;
const ROW = 20;
let viewportHeight = 0;
const scrollTops = new WeakMap<Element, number>();
const observers = new Set<FakeResizeObserver>();

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() {
    observers.add(this);
  }
  disconnect() {
    observers.delete(this);
  }
  fire() {
    this.callback();
  }
}

const scrollBox = (element: Element) =>
  element.closest(".selection-table-scroll");
const rect = (top: number, height: number) =>
  ({ top, height, bottom: top + height }) as DOMRect;

function installLayout() {
  const proto = window.HTMLElement.prototype;
  Object.defineProperty(proto, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("selection-table-scroll")
        ? viewportHeight
        : 0;
    },
  });
  Object.defineProperty(proto, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("selection-table-scroll")
        ? HEADER + this.querySelectorAll("tbody tr").length * ROW
        : 0;
    },
  });
  Object.defineProperty(window.Element.prototype, "scrollTop", {
    configurable: true,
    get(this: Element) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      scrollTops.set(this, value);
    },
  });
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const box = scrollBox(this);
    if (box === null || viewportHeight === 0) return rect(0, 0);
    if (this === box) return rect(VIEWPORT_TOP, viewportHeight);
    if (this.tagName === "THEAD") return rect(VIEWPORT_TOP, HEADER);
    const row = this.closest("tbody tr");
    if (row === null) return rect(0, 0);
    const index = [...box.querySelectorAll("tbody tr")].indexOf(row);
    return rect(
      VIEWPORT_TOP + HEADER + index * ROW - (scrollTops.get(box) ?? 0),
      ROW,
    );
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    FakeResizeObserver;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
}

function power(index: number): ContentEntity {
  const id = `POWER_${String(index).padStart(3, "0")}`;
  return {
    id,
    name: `Power ${String(index).padStart(3, "0")}`,
    type: "Power",
    source: "test",
    sources: ["test"],
    attributes: [],
    categories: [],
    specifics: [],
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: index },
  };
}

function fixture(count: number) {
  const entities = Array.from({ length: count }, (_, index) => power(index));
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
  const byId = new Map(
    entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  return { candidates, byId };
}

let container: HTMLDivElement;
let root: Root;

function renderTable(
  count: number,
  selected: readonly string[],
  candidateCount = count,
) {
  const { candidates, byId } = fixture(count);
  act(() =>
    root.render(
      <CandidateSelectionTable
        kind="power"
        candidates={candidates.slice(0, candidateCount)}
        featGroups={[]}
        selectedIds={new Set(selected)}
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

const viewport = () =>
  container.querySelector<HTMLElement>(".selection-table-scroll")!;
const showLayout = (height: number) => {
  viewportHeight = height;
  act(() => {
    for (const observer of [...observers]) observer.fire();
  });
};
// The body row (counting the section band) a definition renders at.
const rowIndex = (name: string) =>
  [...container.querySelectorAll("tbody tr")].findIndex(
    (row) => row.querySelector("button span")?.textContent === name,
  );
// The scroll offset that puts that row right under the header and the
// section band: its top at HEADER + index * ROW, minus both.
const underBand = (name: string) =>
  HEADER + rowIndex(name) * ROW - (HEADER + ROW);

describe("candidate table pre-scroll", () => {
  beforeEach(() => {
    installLayout();
    viewportHeight = 300;
    observers.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("puts the pick right under the header and section band", () => {
    renderTable(40, ["POWER_020"]);
    expect(viewport().scrollTop).toBe(underBand("Power 020"));
    expect(viewport().scrollTop).toBe(20 * ROW);
  });

  it("goes as high as it can for a pick near the end", () => {
    renderTable(40, ["POWER_038"]);
    // 41 body rows (band + 40) below a 30px header in a 300px box.
    expect(viewport().scrollTop).toBe(HEADER + 41 * ROW - 300);
  });

  it("aims at the topmost of several picks", () => {
    renderTable(40, ["POWER_030", "POWER_012"]);
    expect(viewport().scrollTop).toBe(underBand("Power 012"));
  });

  it("waits for layout when it opens with no height, then scrolls once", () => {
    viewportHeight = 0;
    renderTable(40, ["POWER_020"]);
    expect(viewport().scrollTop).toBe(0);
    showLayout(300);
    expect(viewport().scrollTop).toBe(underBand("Power 020"));
    // Settled: a later resize, render or pick never re-scrolls the table.
    viewport().scrollTop = 0;
    showLayout(320);
    renderTable(40, ["POWER_025"]);
    expect(viewport().scrollTop).toBe(0);
  });

  it("waits for candidates that arrive after it opens", () => {
    renderTable(40, ["POWER_020"], 0);
    expect(viewport().scrollTop).toBe(0);
    renderTable(40, ["POWER_020"]);
    expect(viewport().scrollTop).toBe(underBand("Power 020"));
  });

  it("opens on the later page that holds the pick and scrolls to it", () => {
    viewportHeight = 0;
    renderTable(250, ["POWER_230"]);
    showLayout(300);
    expect(container.textContent).toContain("Power 230");
    expect(container.textContent).not.toContain("Power 100");
    expect(viewport().scrollTop).toBe(underBand("Power 230"));
  });

  it("leaves a table without a pick at the top", () => {
    renderTable(40, []);
    expect(viewport().scrollTop).toBe(0);
    // Picking afterwards doesn't scroll it either.
    renderTable(40, ["POWER_020"]);
    expect(viewport().scrollTop).toBe(0);
  });
});
