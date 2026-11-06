import { describe, expect, it } from "vitest";

import {
  backToPreviousRoute,
  characterEditorHash,
  characterSheetHash,
  commitHashNavigation,
  previousRouteHash,
  recordRouteEntry,
  sheetBackLabel,
} from "./routes";

/** A session history with the browser's push/replace/back semantics. */
function fakeBrowser(initialHash: string, initialState: unknown = null) {
  const entries: { hash: string; state: unknown }[] = [
    { hash: initialHash, state: initialState },
  ];
  let index = 0;
  let shownHash: string | undefined;
  const target = {
    location: {
      get hash() {
        return entries[index]!.hash;
      },
    },
    history: {
      get state() {
        return entries[index]!.state;
      },
      pushState(state: unknown, _unused: string, url: string) {
        entries.splice(index + 1, entries.length, {
          hash: url,
          state: structuredClone(state),
        });
        index += 1;
      },
      replaceState(state: unknown, _unused: string, url: string) {
        entries[index] = { hash: url, state: structuredClone(state) };
      },
      back() {
        if (index > 0) index -= 1;
      },
    },
  };
  /** What App does after any hash change: record the entry's origin. */
  const show = () => {
    recordRouteEntry(target, shownHash);
    shownHash = target.location.hash;
  };
  /** A link, a typed hash or `location.hash =`: the browser adds the entry. */
  const followLink = (hash: string) => {
    entries.splice(index + 1, entries.length, { hash, state: null });
    index += 1;
    show();
  };
  /** The app's own navigation (`commitHashNavigation`). */
  const navigate = (hash: string, replace = false) => {
    commitHashNavigation(target, hash, replace);
    show();
  };
  /** App's sheet Back (`returnFromSheet`). */
  const sheetBack = (characterId: string) => {
    if (!backToPreviousRoute(target))
      navigate(characterEditorHash(characterId, { workspace: "build" }), true);
    else show();
  };
  const browserBack = () => {
    target.history.back();
    show();
  };
  show();
  return {
    target,
    entries,
    followLink,
    navigate,
    sheetBack,
    browserBack,
    show,
    get index() {
      return index;
    },
  };
}

const defaultBuilder = characterEditorHash("one", { workspace: "build" });
const preview = characterSheetHash("one", { preview: true });

describe("back to the previous in-app route", () => {
  it("goes to the character's default builder when the sheet was opened directly", () => {
    const browser = fakeBrowser(preview);
    expect(previousRouteHash(browser.target)).toBeNull();
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe(defaultBuilder);
    // The builder took the sheet's place: nothing to loop back to.
    expect(browser.entries).toHaveLength(1);
  });

  it("returns to the exact builder entry with a real Back", () => {
    const inventory = characterEditorHash("one", { workspace: "equipment" });
    const browser = fakeBrowser("#/characters");
    browser.navigate(characterEditorHash("one", { workspace: "build" }));
    browser.navigate(inventory);
    browser.followLink(preview);
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe(inventory);
    // A real Back keeps the sheet on the Forward stack.
    expect(browser.index).toBe(browser.entries.length - 2);
    expect(browser.entries.at(-1)!.hash).toBe(preview);
  });

  it("returns to a builder level reached through a pushed sheet", () => {
    const level4 = characterEditorHash("one", { workspace: "build", level: 4 });
    const browser = fakeBrowser(level4);
    browser.navigate(preview);
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe(level4);
  });

  it("goes back to another character's builder it came from", () => {
    const twoDetails = characterEditorHash("two", { workspace: "details" });
    const browser = fakeBrowser(twoDetails);
    browser.followLink(preview);
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe(twoDetails);
  });

  it("goes back to the library it came from", () => {
    const browser = fakeBrowser("#/characters");
    browser.followLink(preview);
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe("#/characters");
    expect(browser.entries.at(-1)!.hash).toBe(preview);
  });

  it("replaces a directly opened sheet so the browser's Back doesn't loop", () => {
    const browser = fakeBrowser(preview);
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe(defaultBuilder);
    // The builder kept the sheet's record (none), so its own Back controls
    // still treat it as opened directly.
    expect(previousRouteHash(browser.target)).toBeNull();
  });

  it("treats the sheet's Edit mode as the sheet", () => {
    const details = characterEditorHash("one", { workspace: "details" });
    const browser = fakeBrowser(details);
    browser.navigate(preview);
    // View ↔ Edit replaces the entry (App's navigateSheet).
    browser.navigate(
      characterSheetHash("one", { preview: true, edit: true }),
      true,
    );
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe(details);

    const direct = fakeBrowser(
      characterSheetHash("one", { preview: true, edit: true }),
    );
    direct.sheetBack("one");
    expect(direct.target.location.hash).toBe(defaultBuilder);
  });

  it("keeps the record through the print route's in-place rewrite", () => {
    const browser = fakeBrowser(defaultBuilder);
    browser.followLink(characterSheetHash("one", { print: true }));
    // CharacterSheetPage drops `?print=1` keeping the entry's state.
    browser.target.history.replaceState(
      browser.target.history.state,
      "",
      characterSheetHash("one"),
    );
    expect(previousRouteHash(browser.target)).toBe(defaultBuilder);
  });

  it("keeps the record across a reload", () => {
    const shop = characterEditorHash("one", { workspace: "shop" });
    const browser = fakeBrowser(shop);
    browser.navigate(preview);
    // A reload keeps the entry's state; App records nothing over it.
    const reloaded = fakeBrowser(preview, browser.target.history.state);
    expect(previousRouteHash(reloaded.target)).toBe(shop);
    expect(backToPreviousRoute(reloaded.target)).toBe(true);
  });

  it("keeps the record through a canonical redirect", () => {
    const browser = fakeBrowser(defaultBuilder);
    browser.followLink("#/characters/one?preview=1&stray=1");
    // App's redirect replaces the entry keeping its state.
    browser.navigate(preview, true);
    browser.sheetBack("one");
    expect(browser.target.location.hash).toBe(defaultBuilder);
    expect(browser.index).toBe(0);
  });

  it("closes Settings with a real Back to the app page it came from", () => {
    const browser = fakeBrowser(defaultBuilder);
    browser.followLink("#/settings");
    expect(backToPreviousRoute(browser.target)).toBe(true);
    expect(browser.target.location.hash).toBe(defaultBuilder);

    const direct = fakeBrowser("#/settings");
    expect(backToPreviousRoute(direct.target)).toBe(false);
  });
});

describe("the sheet's Back label", () => {
  it("names the page a real Back returns to", () => {
    expect(sheetBackLabel(defaultBuilder)).toBe("Return to builder");
    expect(
      sheetBackLabel(characterEditorHash("other", { workspace: "shop" })),
    ).toBe("Return to builder");
    expect(sheetBackLabel("#/characters")).toBe("Return to library");
    expect(sheetBackLabel("#/settings")).toBe("Return to settings");
    expect(sheetBackLabel(characterSheetHash("other", { preview: true }))).toBe(
      "Return to sheet",
    );
  });

  it("names this character's builder when the sheet was opened directly", () => {
    expect(sheetBackLabel(null)).toBe("Return to builder");
    expect(sheetBackLabel(undefined)).toBe("Return to builder");
    const browser = fakeBrowser(preview);
    expect(sheetBackLabel(previousRouteHash(browser.target))).toBe(
      "Return to builder",
    );
  });
});
