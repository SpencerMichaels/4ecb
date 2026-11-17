// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BuildOverview } from "./BuildOverview";
import {
  BUILD_OVERVIEW_SORT_STORAGE_KEY,
  type BuildOverviewLevel,
  type BuildOverviewRow,
} from "./build-overview";

const row = (
  level: number,
  kind: BuildOverviewRow["kind"],
  key: string,
  title: string,
  picks: string | undefined,
  extra: Partial<BuildOverviewRow> = {},
): BuildOverviewRow => ({
  key,
  level,
  kind,
  title,
  picks,
  status: picks === undefined ? "unresolved" : "complete",
  target: { kind: "choice", choiceId: key },
  held: { picks },
  ...extra,
});

const levels: readonly BuildOverviewLevel[] = [
  {
    level: 1,
    groups: [
      {
        kind: "character",
        title: "Character",
        rows: [
          row(1, "character", "race", "Race", "Revenant · Language: Elven"),
        ],
      },
      {
        kind: "feats",
        title: "Feats",
        rows: [row(1, "feats", "feat", "Feat", undefined)],
      },
      {
        kind: "powers",
        title: "Powers",
        rows: [
          // Its pick came by the level-3 retrain, so by slot it has no row
          // of its own.
          row(1, "powers", "power", "At-Will power", "Reaping Strike", {
            usage: "at-will",
            held: undefined,
          }),
          row(1, "powers", "daily", "Daily power", "Sleep", {
            usage: "daily",
          }),
        ],
      },
    ],
  },
  { level: 2, groups: [] },
  {
    level: 3,
    groups: [
      {
        kind: "feats",
        title: "Feats",
        rows: [row(3, "feats", "feat-3", "Feat", "Toughness")],
      },
      {
        kind: "powers",
        title: "Powers",
        rows: [
          row(3, "powers", "retrain", "Retraining", "Cleave → Reaping Strike", {
            usage: "at-will",
            held: { picks: "Reaping Strike", note: "replaced Cleave at L3" },
          }),
        ],
      },
    ],
  },
];

let root: Root | undefined;
let host: HTMLElement | undefined;
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

function render(onOpen = vi.fn()) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<BuildOverview levels={levels} onOpen={onOpen} />));
  return { host, onOpen };
}

const choiceRows = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLTableRowElement>("tr.build-overview-choice"),
];
const rowText = (host: HTMLElement) =>
  choiceRows(host).map((item) =>
    [...item.cells].map((cell) => cell.textContent).join(" | "),
  );
const bandToggles = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLButtonElement>(
    "tr.table-section-row .table-section-toggle",
  ),
];
const sortButton = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLButtonElement>(
    `thead button[aria-label="Sort by ${label}"]`,
  )!;
const subbands = (host: HTMLElement) =>
  [...host.querySelectorAll("tbody.build-overview-subband th")].map(
    (heading) => heading.textContent,
  );
const sortState = (host: HTMLElement) =>
  [...host.querySelectorAll("thead th")].map(
    (header) =>
      `${header.textContent}:${header.getAttribute("aria-sort") ?? "-"}`,
  );

describe("BuildOverview", () => {
  it("is one table with the candidate tables' sortable Level and Category headers", () => {
    const { host } = render();
    expect(host.querySelectorAll("table")).toHaveLength(1);
    expect(sortState(host)).toEqual([
      "Level:ascending",
      "Category:none",
      "Pick:-",
      "Status:-",
    ]);
    // No Category column: the slot says what each row is.
    expect(host.querySelectorAll("col")).toHaveLength(4);
    for (const label of ["Level", "Category"]) {
      const button = sortButton(host, label);
      expect(button.type).toBe("button");
      expect(button.classList.contains("selection-sort-button")).toBe(true);
      expect(button.querySelector(".icon")).not.toBeNull();
    }
    // Pick does not sort.
    expect(host.querySelectorAll("thead button")).toHaveLength(2);
  });

  it("bands by level with the full history, an empty level compactly", () => {
    const { host } = render();
    // Each band is the Inventory's collapsible group band, with no count:
    // the owner found a choice count confusing (D113 note).
    expect(bandToggles(host).map((toggle) => toggle.textContent)).toEqual([
      "Level 1",
      "Level 2",
      "Level 3",
    ]);
    expect(host.querySelector(".table-section-count")).toBeNull();
    expect(host.querySelector(".build-overview-none")?.textContent).toBe(
      "No choices at this level",
    );
    expect(rowText(host)).toEqual([
      "1 | Race | Revenant · Language: Elven | Complete",
      "1 | Feat | none chosen | Incomplete",
      "1 | At-Will power | Reaping Strike | Complete",
      "1 | Daily power | Sleep | Complete",
      "3 | Feat | Toughness | Complete",
      "3 | Retraining | Cleave → Reaping Strike | Complete",
    ]);
    // Usage sub-bands are the slot grouping's only.
    expect(subbands(host)).toEqual([]);
    // An open required choice carries the Build tab's status mark.
    expect(
      host.querySelector("tr.build-overview-choice.is-unresolved .icon"),
    ).not.toBeNull();
  });

  it("regroups by slot category from its header, showing what the character has now", () => {
    const { host } = render();
    act(() => sortButton(host, "Category").click());
    expect(sortState(host).slice(0, 2)).toEqual([
      "Level:none",
      "Category:ascending",
    ]);
    // Every category keeps its band; empty ones say so.
    expect(bandToggles(host).map((toggle) => toggle.textContent)).toEqual([
      "Character",
      "Ability Scores",
      "Skills",
      "Feats",
      "Powers",
      "Features & Other",
    ]);
    expect(host.querySelector(".build-overview-none")?.textContent).toBe(
      "Nothing in this category",
    );
    // Powers run in lighter usage sub-bands, each by level.
    expect(subbands(host)).toEqual(["At-Will", "Daily"]);
    expect(rowText(host)).toEqual([
      "1 | Race | Revenant · Language: Elven | Complete",
      "1 | Feat | none chosen | Incomplete",
      "3 | Feat | Toughness | Complete",
      "3 | Retraining | Reaping Strike (replaced Cleave at L3) | Complete",
      "1 | Daily power | Sleep | Complete",
    ]);
    expect(host.querySelector(".build-overview-note")?.textContent).toBe(
      " (replaced Cleave at L3)",
    );
    // Remembered for the next visit, like the library's sort.
    expect(
      JSON.parse(window.localStorage.getItem(BUILD_OVERVIEW_SORT_STORAGE_KEY)!),
    ).toEqual({ column: "slot", direction: "ascending" });

    // The active header flips the direction: the bands reverse.
    act(() => sortButton(host, "Category").click());
    expect(sortState(host)[1]).toBe("Category:descending");
    expect(bandToggles(host)[0]!.textContent).toBe("Features & Other");

    act(() => sortButton(host, "Level").click());
    expect(sortState(host).slice(0, 2)).toEqual([
      "Level:ascending",
      "Category:none",
    ]);
    expect(bandToggles(host)[0]!.textContent).toBe("Level 1");
  });

  it("opens the remembered grouping", () => {
    window.localStorage.setItem(
      BUILD_OVERVIEW_SORT_STORAGE_KEY,
      JSON.stringify({ column: "slot", direction: "ascending" }),
    );
    const { host } = render();
    expect(sortState(host)[1]).toBe("Category:ascending");
    expect(bandToggles(host)[0]!.textContent).toBe("Character");
  });

  it("stripes each band's rows in a body of their own", () => {
    const { host } = render();
    // Stripes are the tables' nth-child rule, so each band's rows need
    // their own <tbody> to restart them.
    expect(
      [...host.querySelectorAll("tbody.build-overview-rows")].map(
        (body) => body.querySelectorAll("tr").length,
      ),
    ).toEqual([4, 1, 2]);
  });

  it("collapses a Powers band with its usage sub-bands", () => {
    const { host } = render();
    act(() => sortButton(host, "Category").click());
    const powers = bandToggles(host).find(
      (toggle) => toggle.textContent === "Powers",
    )!;
    // The band controls each sub-band and its rows' body, which restarts
    // the stripes under every sub-band.
    const controlled = powers
      .getAttribute("aria-controls")!
      .split(" ")
      .map((id) => host.querySelector<HTMLElement>(`#${id}`)!);
    expect(controlled.map((body) => body.className)).toEqual([
      "build-overview-subband",
      "build-overview-rows",
      "build-overview-subband",
      "build-overview-rows",
    ]);
    // Each sub-band's rows are labelled by the band and the sub-band.
    expect(
      controlled[1]!
        .getAttribute("aria-labelledby")!
        .split(" ")
        .map((id) => host.querySelector(`#${id}`)?.textContent),
    ).toEqual(["Powers", "At-Will"]);
    act(() => powers.click());
    expect(controlled.every((body) => body.hidden)).toBe(true);
    expect(choiceRows(host)).toHaveLength(3);
  });

  it("opens a row's choice from its button or anywhere on the row", () => {
    const { host, onOpen } = render();
    const feat = choiceRows(host)[1]!;
    const button = feat.querySelector<HTMLButtonElement>(
      "button.build-overview-row",
    )!;
    // The row's one focus stop is a real button named by its slot, so
    // Enter and Space open it like any button.
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Feat");
    button.focus();
    expect(document.activeElement).toBe(button);
    act(() => button.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith({ kind: "choice", choiceId: "feat" });
    act(() => feat.cells[3]!.click());
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("orders the tab stops: sort headers, then each band toggle and its rows", () => {
    const { host } = render();
    const stops = [...host.querySelectorAll<HTMLElement>("button")].map(
      (button) =>
        button.getAttribute("aria-label") ??
        (button.classList.contains("table-section-toggle")
          ? `band ${button.textContent}`
          : button.textContent),
    );
    expect(stops).toEqual([
      "Sort by Level",
      "Sort by Category",
      "band Level 1",
      "Race",
      "Feat",
      "At-Will power",
      "Daily power",
      "band Level 2",
      "band Level 3",
      "Feat",
      "Retraining",
    ]);
  });

  it("collapses and expands a band from its heading, all expanded at first", () => {
    const { host } = render();
    const [first, second] = bandToggles(host);
    expect(
      bandToggles(host).map((toggle) => toggle.getAttribute("aria-expanded")),
    ).toEqual(["true", "true", "true"]);
    const body = host.querySelector<HTMLElement>(
      `#${first!.getAttribute("aria-controls")}`,
    )!;
    expect(body.hidden).toBe(false);
    expect(first!.querySelector(".icon")).not.toBeNull();
    expect(first!.type).toBe("button");

    act(() => first!.click());
    expect(first!.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);
    expect(choiceRows(host)).toHaveLength(2);
    expect(second!.getAttribute("aria-expanded")).toBe("true");

    act(() => first!.click());
    expect(body.hidden).toBe(false);
    expect(choiceRows(host)).toHaveLength(6);

    // An empty band collapses too: its control is always there.
    act(() => second!.click());
    expect(host.querySelector(".build-overview-none")).toBeNull();
  });

  it("keeps the tab while the evaluation loads", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(<BuildOverview levels={undefined} onOpen={vi.fn()} />),
    );
    expect(host.textContent).toContain("Overview");
    expect(host.textContent).toContain("Evaluating character…");
  });
});
