import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CharacterLibraryEntry } from "@4ecb/browser-storage";

import { EmptyTrashDialog } from "./EmptyTrashDialog";
import { TrashDialog } from "./TrashDialog";

const noop = () => undefined;

function entry(
  id: string,
  title: string,
  deletedAt: string,
  extra: Partial<CharacterLibraryEntry> = {},
): CharacterLibraryEntry {
  return {
    id,
    title,
    updatedAt: deletedAt,
    deletedAt,
    effectiveLevel: 11,
    race: "Human",
    className: "Paladin",
    ...extra,
  };
}

function trash(characters: readonly CharacterLibraryEntry[]): string {
  return renderToStaticMarkup(
    createElement(TrashDialog, {
      characters,
      onClose: noop,
      onEmpty: noop,
      onPurge: noop,
      onRestore: noop,
    }),
  );
}

describe("TrashDialog", () => {
  it("lists trashed characters like library rows, most recently trashed first", () => {
    const markup = trash([
      entry("old", "Aldric Vey", "2020-01-02T12:00:00.000Z", {
        renderedPortraitDataUrl: "data:image/webp;base64,cG9ydHJhaXQ=",
      }),
      entry("new", "Pip Underbough", new Date().toISOString(), {
        effectiveLevel: 2,
        race: "Halfling",
        className: "Rogue",
      }),
    ]);
    expect(markup.indexOf("Pip Underbough")).toBeLessThan(
      markup.indexOf("Aldric Vey"),
    );
    expect(markup).toContain(
      'class="character-portrait trash-portrait" src="data:image/webp;base64,cG9ydHJhaXQ="',
    );
    expect(markup).toContain('class="portrait-placeholder trash-portrait"');
    expect(markup).toContain("<strong>Pip Underbough</strong>");
    expect(markup).toContain("Level 2 Halfling Rogue");
    expect(markup).toContain("Level 11 Human Paladin");
    expect(markup).toMatch(/<span title="[^"]+">Trashed today<\/span>/);
    expect(markup).toMatch(/Trashed \d+ years ago/);
    expect(markup).toContain('aria-label="Restore Pip Underbough"');
    expect(markup).toContain('aria-label="Delete Pip Underbough permanently"');
    expect(markup).toContain('class="trash-dialog-count">(2)</span>');
    expect(markup).toMatch(
      /<button class="danger-button" title="Permanently delete 2 characters" type="button">/,
    );
  });

  it("keeps Empty trash present but disabled while the trash is empty", () => {
    const markup = trash([]);
    expect(markup).toContain("The trash is empty.");
    expect(markup).toMatch(
      /<button class="danger-button" disabled="" title="The trash is empty" type="button">/,
    );
    expect(markup).toContain("Empty trash…");
  });
});

describe("EmptyTrashDialog", () => {
  const confirm = (names: readonly string[]) =>
    renderToStaticMarkup(
      createElement(EmptyTrashDialog, {
        names,
        onCancel: noop,
        onConfirm: noop,
      }),
    );

  it("asks explicitly, naming what will be deleted", () => {
    const markup = confirm(["Aldric Vey", "Pip Underbough", "Mira"]);
    expect(markup).toContain('class="empty-trash-dialog dialog-shell"');
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain(">Empty trash?</h2>");
    expect(markup).toContain(
      "Permanently delete 3 characters? This can’t be undone.",
    );
    expect(markup).toContain("<li>Pip Underbough</li>");
    // Cancel first, then the danger action.
    expect(markup).toMatch(
      /<button type="button">Cancel<\/button><button class="danger-button" type="button">Delete 3 characters<\/button>/,
    );
  });

  it("uses the singular for one character and summarizes a long list", () => {
    expect(confirm(["Aldric Vey"])).toContain(
      "Permanently delete 1 character? This can’t be undone.",
    );
    expect(confirm(["Aldric Vey"])).toContain("Delete 1 character<");
    const many = confirm(
      Array.from({ length: 11 }, (_, index) => `Hero ${index}`),
    );
    expect(many).toContain("<li>Hero 7</li>");
    expect(many).not.toContain("<li>Hero 8</li>");
    expect(many).toContain("<li>and 3 more</li>");
  });
});
