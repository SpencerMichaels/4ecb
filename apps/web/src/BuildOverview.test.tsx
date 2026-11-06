// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BuildOverview } from "./BuildOverview";
import type { BuildOverviewLevel } from "./build-overview";

const levels: readonly BuildOverviewLevel[] = [
  {
    level: 1,
    groups: [
      {
        kind: "character",
        title: "Character",
        rows: [
          {
            key: "race",
            title: "Race",
            picks: "Revenant · Language: Elven",
            status: "complete",
            target: { kind: "choice", choiceId: "race" },
          },
        ],
      },
      {
        kind: "feats",
        title: "Feats",
        rows: [
          {
            key: "feat",
            title: "Feat",
            picks: undefined,
            status: "unresolved",
            target: { kind: "choice", choiceId: "feat" },
          },
        ],
      },
    ],
  },
  { level: 2, groups: [] },
];

let root: Root | undefined;
let host: HTMLElement | undefined;
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

describe("BuildOverview", () => {
  const choiceRows = (host: HTMLElement) => [
    ...host.querySelectorAll<HTMLButtonElement>("button.build-overview-row"),
  ];
  const levelToggles = (host: HTMLElement) => [
    ...host.querySelectorAll<HTMLButtonElement>("h4 > button"),
  ];

  it("shows a section per level, its rows grouped, an empty level compactly", () => {
    const { host } = render();
    // Each level's heading is the Inventory's collapsible group band, its
    // count the level's choices.
    const headings = [...host.querySelectorAll("h4")];
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Level 12",
      "Level 20",
    ]);
    for (const heading of headings)
      expect(heading.classList.contains("table-section-row")).toBe(true);
    expect(
      [...host.querySelectorAll("h4 .table-section-count")].map((count) =>
        count.getAttribute("aria-label"),
      ),
    ).toEqual(["2 choices", "0 choices"]);
    expect(host.querySelector(".build-overview-none")?.textContent).toBe(
      "No choices at this level",
    );
    expect(
      [...host.querySelectorAll("ul")].map((list) =>
        list.getAttribute("aria-label"),
      ),
    ).toEqual(["Level 1 character", "Level 1 feats"]);
    const rows = choiceRows(host).map((row) => row.textContent);
    expect(rows).toEqual([
      "RaceRevenant · Language: ElvenComplete",
      "Featnone chosenIncomplete",
    ]);
    // An open required choice carries the Build tab's status mark.
    expect(
      host.querySelector(".build-overview-row.is-unresolved .icon"),
    ).not.toBeNull();
  });

  it("opens a row's choice where it is edited", () => {
    const { host, onOpen } = render();
    const feat = choiceRows(host)[1]!;
    act(() => feat.click());
    expect(onOpen).toHaveBeenCalledWith({ kind: "choice", choiceId: "feat" });
  });

  it("collapses and expands a level from its heading, all expanded at first", () => {
    const { host } = render();
    const [first, second] = levelToggles(host);
    expect(
      levelToggles(host).map((toggle) => toggle.getAttribute("aria-expanded")),
    ).toEqual(["true", "true"]);
    // The heading button controls its level's choices and names it.
    const body = host.querySelector<HTMLElement>(
      `#${first!.getAttribute("aria-controls")}`,
    )!;
    expect(body.hidden).toBe(false);
    expect(first!.textContent).toBe("Level 12");
    expect(first!.querySelector(".icon")).not.toBeNull();
    expect(first!.type).toBe("button");

    act(() => first!.click());
    expect(first!.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);
    expect(choiceRows(host)).toHaveLength(0);
    // Other levels keep their state; the heading stays.
    expect(second!.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("#build-overview-level-1")).not.toBeNull();

    act(() => first!.click());
    expect(first!.getAttribute("aria-expanded")).toBe("true");
    expect(body.hidden).toBe(false);
    expect(choiceRows(host)).toHaveLength(2);

    // An empty level collapses too: its control is always there.
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
