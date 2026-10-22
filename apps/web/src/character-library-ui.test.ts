import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_VIEW_STORAGE_KEY,
  characterCount,
  characterIdentity,
  librarySelection,
  nextLibrarySort,
  readLibraryView,
  sortLibrary,
  trashOrder,
  writeLibraryView,
} from "./character-library-ui";
import { appStyles } from "./test-styles";

const library = readFileSync(
  new URL("./CharacterLibraryPage.tsx", import.meta.url),
  "utf8",
);
const table = readFileSync(
  new URL("./CharacterLibraryTable.tsx", import.meta.url),
  "utf8",
);
const detail = readFileSync(
  new URL("./CharacterLibraryDetail.tsx", import.meta.url),
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

describe("character library table and detail pane", () => {
  it("replaces the tile grid with a table beside a sticky detail pane", () => {
    expect(library).toContain("<CharacterLibraryTable");
    expect(library).toContain("<CharacterLibraryDetail");
    expect(library).not.toContain("character-grid");
    expect(styles).not.toContain(".character-grid");
    expect(styles).toMatch(
      /\.library-workspace \{[^}]*grid-template-columns: minmax\(0, 1fr\) clamp\(/,
    );
    expect(styles).toMatch(/\.library-detail \{[^}]*position: sticky/);
    // The builder's selection-table look and sort headers, not its component.
    expect(table).toContain("selection-table-scroll library-table-scroll");
    expect(table).toContain('className="selection-sort-button"');
    expect(table).toContain("aria-sort={active ? sort.direction");
    expect(table).not.toContain("CandidateSelectionTable");
    expect(table).toContain('className="library-table-portrait"');
    expect(styles).toMatch(/\.library-table-portrait \{[^}]*height: 2\.25rem/);
    // The empty message renders inside the table, which always stays.
    expect(table).toContain('className="library-table-empty"');
    expect(table).toContain("No characters yet.");
    // No filter box: the table starts level with the pane's header band.
    expect(table).not.toContain("selection-table-toolbar");
    expect(table).not.toContain('type="search"');
    expect(styles).not.toContain(".library-table-toolbar");
    expect(styles).toMatch(/\.library-workspace \{[^}]*align-items: start/);
  });

  it("selects rows with click and arrow keys and opens with Enter or double-click", () => {
    // Each name is a real link to the builder (middle-click, new tab).
    expect(table).toContain("href={href}");
    expect(table).toContain("`#/characters/${encodeURIComponent(id)}/edit`");
    // Roving focus: only one row's link is in the tab order.
    expect(table).toContain("tabIndex={character.id === focusId ? 0 : -1}");
    expect(table).toContain('event.key === "ArrowDown"');
    expect(table).toContain('event.key === "ArrowUp"');
    expect(table).toContain("onDoubleClick=");
    // A plain click selects; keyboard Enter (detail 0) follows the link.
    expect(table).toContain("event.detail > 0");
    expect(table).toContain("aria-current={selected || undefined}");
  });

  it("hides Race and Edited and stacks the pane below the builder breakpoint", () => {
    const narrow = styles.slice(styles.indexOf("@media (max-width: 60rem)"));
    expect(narrow).toMatch(
      /\.library-workspace \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(narrow).toContain(
      ".library-table :is(.library-col-race, .library-col-edited)",
    );
  });

  it("labels the page header actions, icon-only on phones", () => {
    const order = [
      "New</span>",
      "Import\n",
      "Trash\n",
      "<UpdateButton",
      "Settings\n",
    ];
    const positions = order.map((label) => library.indexOf(label));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(library).toContain('aria-label="New character"');
    expect(library).toContain('className="page-action-count"');
    expect(library).toContain('<UpdateButton label="Update" />');
    expect(styles).toMatch(
      /@media \(max-width: 36rem\) \{\s*\.page-action-label \{\s*display: none;/,
    );
  });

  it("puts identity and five labelled actions in the pane's navy band", () => {
    expect(detail).toContain('className="library-detail-portrait"');
    expect(detail).toContain("Paragon path: {character.paragonPath}");
    expect(detail).toContain("Epic destiny: {character.epicDestiny}");
    expect(detail).toContain("Edited {edited}");
    for (const word of ["Edit", "Sheet", "Duplicate"])
      expect(detail).toContain(`<span>${word}</span>`);
    expect(detail).toContain('visibleLabel="Export"');
    expect(detail).toContain('{trashArmed ? "Confirm" : "Trash"}');
    expect(detail).toContain("Edit ${title} build");
    expect(detail).toContain("View ${title} character sheet");
    expect(detail).toContain("Export ${title}");
    expect(detail).toContain("Duplicate ${title}");
    expect(detail).toContain("Move ${title} to trash");
    expect(detail).toContain("?preview=1");
    // The shared ActionMenu (also the builder's Change level).
    expect(detail).toContain("<ActionMenu");
    expect(detail).toContain(".4ecb");
    expect(detail).toContain(".dnd4e");
    // Files only: printing / saving a PDF is the character sheet's.
    expect(detail).not.toContain('label: "PDF"');
    expect(library).not.toContain("preserve-original");
    expect(library).not.toContain("exportDnd4e");
    expect(styles).toMatch(
      /\.library-detail-actions \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/,
    );
    expect(styles).toMatch(
      /\.library-detail-action > span:not\(\.icon\) \{[^}]*white-space: nowrap/,
    );
    expect(styles).toMatch(
      /\.library-detail-header \{[^}]*background: var\(--brand-navy\);[^}]*border-bottom: 3px solid var\(--brand-blue\)/,
    );
    expect(styles).toContain(".action-menu-options");
  });

  it("regenerates dnd4e from edited state and sends PDF through the sheet", () => {
    // Shared by the library and the builder (character-export.ts).
    expect(library).toContain(
      "exportCharacter(selected, exportCharacterDnd4e)",
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
    expect(sheet).toContain("printWithFileName(");
  });
});

describe("library helpers", () => {
  it("composes the identity line and orders the trash newest first", () => {
    expect(
      characterIdentity({
        effectiveLevel: 3,
        race: "Elf",
        className: "Wizard",
      }),
    ).toBe("Elf Wizard 3");
    expect(characterIdentity({ effectiveLevel: 1 })).toBe("Level 1");
    expect(
      trashOrder([
        { id: "a", deletedAt: "2026-10-01T00:00:00.000Z" },
        { id: "b" },
        { id: "c", deletedAt: "2026-10-20T00:00:00.000Z" },
      ]).map(({ id }) => id),
    ).toEqual(["c", "a", "b"]);
    expect(characterCount(1)).toBe("1 character");
    expect(characterCount(0)).toBe("0 characters");
  });

  it("wires Empty trash to the repository and styles trash rows like the library", () => {
    expect(library).toContain(".emptyTrash()");
    expect(library).toContain("Couldn't empty the trash");
    expect(styles).toMatch(
      /\.trash-list > li:nth-child\(even\) \{[^}]*background: var\(--surface-subtle\)/,
    );
    expect(styles).toMatch(/\.trash-portrait \{[^}]*height: 2\.75rem/);
    expect(styles).toMatch(/\.trash-list \{[^}]*overflow: auto/);
  });
});

describe("library table helpers", () => {
  const rows = [
    {
      id: "a",
      title: "Brisa",
      effectiveLevel: 4,
      race: "Elf",
      className: "Ranger",
      updatedAt: "2026-10-20T00:00:00.000Z",
    },
    {
      id: "b",
      title: "aldric",
      effectiveLevel: 11,
      race: "Human",
      className: "Paladin",
      updatedAt: "2026-10-21T00:00:00.000Z",
    },
    {
      id: "c",
      title: "Korrin",
      effectiveLevel: 1,
      updatedAt: "2026-10-18T00:00:00.000Z",
    },
  ];
  const ids = (list: readonly { id: string }[]) => list.map(({ id }) => id);

  it("sorts by each column, newest edit first by default", () => {
    expect(ids(sortLibrary(rows, DEFAULT_LIBRARY_SORT))).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(
      ids(sortLibrary(rows, { column: "name", direction: "ascending" })),
    ).toEqual(["b", "a", "c"]);
    expect(
      ids(sortLibrary(rows, { column: "level", direction: "descending" })),
    ).toEqual(["b", "a", "c"]);
    // No race sorts last in either direction.
    expect(
      ids(sortLibrary(rows, { column: "race", direction: "ascending" })),
    ).toEqual(["a", "b", "c"]);
    expect(
      ids(sortLibrary(rows, { column: "race", direction: "descending" })),
    ).toEqual(["b", "a", "c"]);
  });

  it("flips the active column and starts others ascending (Edited newest)", () => {
    expect(nextLibrarySort(DEFAULT_LIBRARY_SORT, "edited")).toEqual({
      column: "edited",
      direction: "ascending",
    });
    expect(nextLibrarySort(DEFAULT_LIBRARY_SORT, "class")).toEqual({
      column: "class",
      direction: "ascending",
    });
    expect(
      nextLibrarySort({ column: "name", direction: "ascending" }, "edited"),
    ).toEqual(DEFAULT_LIBRARY_SORT);
  });

  it("keeps a remembered selection and falls back to the first row", () => {
    expect(librarySelection(rows, "c")).toBe("c");
    expect(librarySelection(rows, "gone")).toBe("a");
    expect(librarySelection(rows, undefined)).toBe("a");
    expect(librarySelection([], "gone")).toBeUndefined();
  });

  it("remembers sort and selection, tolerating bad or blocked storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(readLibraryView(storage)).toEqual({ sort: DEFAULT_LIBRARY_SORT });
    const view = {
      sort: { column: "level", direction: "ascending" },
      selectedId: "b",
    } as const;
    writeLibraryView(view, storage);
    expect(readLibraryView(storage)).toEqual(view);
    store.set(
      LIBRARY_VIEW_STORAGE_KEY,
      JSON.stringify({ sort: { column: "bogus" }, selectedId: 3 }),
    );
    expect(readLibraryView(storage)).toEqual({ sort: DEFAULT_LIBRARY_SORT });
    store.set(LIBRARY_VIEW_STORAGE_KEY, "{not json");
    expect(readLibraryView(storage)).toEqual({ sort: DEFAULT_LIBRARY_SORT });
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readLibraryView(blocked)).toEqual({ sort: DEFAULT_LIBRARY_SORT });
    expect(() => writeLibraryView(view, blocked)).not.toThrow();
  });
});
