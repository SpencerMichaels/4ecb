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
  it("shows a section per level, its rows grouped, an empty level compactly", () => {
    const { host } = render();
    const headings = [...host.querySelectorAll("h4")].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(["Level 1", "Level 2No choices at this level"]);
    expect(
      [...host.querySelectorAll("ul")].map((list) =>
        list.getAttribute("aria-label"),
      ),
    ).toEqual(["Level 1 character", "Level 1 feats"]);
    const rows = [...host.querySelectorAll("button")].map(
      (row) => row.textContent,
    );
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
    const feat = [...host.querySelectorAll("button")][1]!;
    act(() => feat.click());
    expect(onOpen).toHaveBeenCalledWith({ kind: "choice", choiceId: "feat" });
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
