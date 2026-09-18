import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const characterEditor = readFileSync(
  new URL("./CharacterEditorPage.tsx", import.meta.url),
  "utf8",
);

describe("candidate table initialization integration", () => {
  it("gates shared details initialization to the first table in an open pane", () => {
    const scope = characterEditor.slice(
      characterEditor.indexOf("function CandidateInspectionScope"),
      characterEditor.indexOf("const candidateReferenceIndexes"),
    );

    expect(scope).toContain("initializeCandidateInspection(");
    expect(scope).toContain("explicitlyInspectCandidate(");
    expect(characterEditor).toContain('key={active ? "open" : "closed"}');
    expect(characterEditor).toContain(
      'key={`${workspaceTab === "build" ? "open" : "closed"}:${selectedLevel}:${activeLevelSection ?? "empty"}`}',
    );
  });

  it("positions each table once without restoring the removed locator", () => {
    const table = characterEditor.slice(
      characterEditor.indexOf("function CandidateSelectionTable"),
      characterEditor.indexOf("function ChoiceFlowSection"),
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
