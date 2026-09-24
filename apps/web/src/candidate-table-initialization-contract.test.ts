import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const characterEditor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);
const characterDetailsEditor = readFileSync(
  new URL("./CharacterDetailsEditor.tsx", import.meta.url),
  "utf8",
);
const builderChoiceContext = readFileSync(
  new URL("./builder-choice-context.tsx", import.meta.url),
  "utf8",
);
const candidateSelectionTable = readFileSync(
  new URL("./CandidateSelectionTable.tsx", import.meta.url),
  "utf8",
);

describe("candidate table initialization integration", () => {
  it("gates shared details initialization to the first table in an open pane", () => {
    const scope = builderChoiceContext.slice(
      builderChoiceContext.indexOf("export function CandidateInspectionScope"),
    );

    expect(scope).toContain("initializeCandidateInspection(");
    expect(scope).toContain("explicitlyInspectCandidate(");
    expect(characterDetailsEditor).toContain(
      'key={active ? "open" : "closed"}',
    );
    expect(characterEditor).toContain(
      'key={`${workspaceTab === "build" ? "open" : "closed"}:${selectedLevel}:${activeLevelSection ?? "empty"}`}',
    );
  });

  it("positions each table once without restoring the removed locator", () => {
    const table = candidateSelectionTable.slice(
      candidateSelectionTable.indexOf(
        "export function CandidateSelectionTable",
      ),
    );

    expect(table).toContain("useRef(firstSelectedCandidateId(selectedIds))");
    expect(table).toContain("if (initializedRef.current) return");
    expect(table).toContain("initializedRef.current = true");
    expect(table).toContain("viewport.scrollTop = initialCandidateScrollTop");
    expect(table).toContain("stickyHeaderHeight:");
    expect(table).not.toContain("scrollIntoView");
    expect(table).not.toContain('setFilter("")');
    expect(table).not.toContain("setFavoritesOnly(false)");
  });
});
