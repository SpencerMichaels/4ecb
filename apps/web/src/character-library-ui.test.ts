import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const library = readFileSync(
  new URL("./CharacterLibraryPage.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const sheet = readFileSync(
  new URL("./CharacterSheetPage.tsx", import.meta.url),
  "utf8",
);

describe("compact character library", () => {
  it("keeps the card focused on character identity", () => {
    expect(library).toContain('className="library-portrait"');
    expect(library).toContain('className="character-summary"');
    expect(library).not.toContain("Library name");
    expect(library).not.toContain("Library notes");
    expect(library).not.toContain("ProfileMigrationControl");
    expect(library).not.toContain("Profile:");
  });

  it("provides five named icon actions and an on-demand export menu", () => {
    expect(library.match(/className="character-card-action"/g)).toHaveLength(4);
    expect(library).toContain(
      'className="character-card-action danger-action"',
    );
    expect(library).toContain("Edit ${character.title} build");
    expect(library).toContain("View ${character.title} character sheet");
    expect(library).toContain("Export ${character.title}");
    expect(library).toContain("Duplicate ${character.title}");
    expect(library).toContain("Move ${character.title} to trash");
    expect(library).toContain('className="character-export-menu"');
    expect(library).toContain(".4ecb");
    expect(library).toContain(".dnd4e");
    expect(library).toContain("PDF");
    expect(library).not.toContain("preserve-original");
    expect(library).not.toContain("exportDnd4e");
    expect(styles).toContain(".character-card-action:focus-visible");
    expect(styles).toContain(".character-export-options");
  });

  it("regenerates dnd4e from edited state and sends PDF through the sheet", () => {
    expect(library).toContain('target: "legacy-builder-0.07a"');
    expect(library).toContain("projectBuildForEvaluation(character.build");
    expect(library).toContain("?print=1");
    expect(sheet).toContain("printOnReady = false");
    expect(sheet).toContain("window.print()");
  });
});
