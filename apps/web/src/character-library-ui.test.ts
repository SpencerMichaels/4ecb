import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appStyles } from "./test-styles";

const library = readFileSync(
  new URL("./CharacterLibraryPage.tsx", import.meta.url),
  "utf8",
);
const styles = appStyles;
const characterExport = readFileSync(
  new URL("./character-export.ts", import.meta.url),
  "utf8",
);
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
    expect(library.match(/className="character-card-action"/g)).toHaveLength(3);
    expect(library).toContain('triggerClassName="character-card-action"');
    expect(library).toContain(
      'className="character-card-action danger-action"',
    );
    expect(library).toContain("Edit ${character.title} build");
    expect(library).toContain("View ${character.title} character sheet");
    expect(library).toContain("Export ${character.title}");
    expect(library).toContain("Duplicate ${character.title}");
    expect(library).toContain("Move ${character.title} to trash");
    // The shared ActionMenu (also the builder's Change level).
    expect(library).toContain("<ActionMenu");
    expect(library).toContain(".4ecb");
    expect(library).toContain(".dnd4e");
    // Files only: printing / saving a PDF is the character sheet's.
    expect(library).not.toContain('label: "PDF"');
    expect(library).not.toContain("preserve-original");
    expect(library).not.toContain("exportDnd4e");
    const actionRule = styles.match(/\.character-card-action \{([^}]*)\}/)?.[1];
    expect(actionRule).toContain("align-items: center");
    expect(actionRule).toContain("justify-content: center");
    expect(styles).toContain(".character-card-action:focus-visible");
    expect(styles).toContain(".action-menu-options");
  });

  it("regenerates dnd4e from edited state and sends PDF through the sheet", () => {
    // Shared by the library and the builder (character-export.ts).
    expect(library).toContain(
      "exportCharacter(character, exportCharacterDnd4e)",
    );
    expect(characterExport).toContain('target: "legacy-builder-0.07a"');
    expect(characterExport).toContain(
      "projectBuildForEvaluation(character.build",
    );
    expect(characterExport).not.toContain("?print=1");
    // The builder offers the same Export menu beside Character sheet, after
    // pending saves land.
    const editor = readFileSync(
      new URL("./CharacterEditorPage.tsx", import.meta.url),
      "utf8",
    );
    expect(editor).toContain("exportFrom(exportCharacterDnd4e)");
    expect(editor).toContain("await saveQueue.current?.whenIdle();");
    expect(sheet).toContain("printOnReady = false");
    expect(sheet).toContain("window.print()");
  });
});
