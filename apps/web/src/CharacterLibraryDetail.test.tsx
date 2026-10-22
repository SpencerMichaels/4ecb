import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterLibraryEntry } from "@4ecb/browser-storage";

import { CharacterLibraryDetail } from "./CharacterLibraryDetail";
import type { LibraryRoleLine } from "./use-library-summary";

const entry: CharacterLibraryEntry = {
  id: "ingi",
  title: "Ingi",
  updatedAt: "2026-10-21T10:00:00.000Z",
  effectiveLevel: 7,
  race: "Dwarf",
  className: "Paladin",
  paragonPath: "Astral Weapon",
};

function pane(roleLine: LibraryRoleLine): string {
  return renderToStaticMarkup(
    <CharacterLibraryDetail
      character={entry}
      roleLine={roleLine}
      now={new Date("2026-10-21T12:00:00.000Z")}
      exporting={false}
      trashArmed={false}
      onExportBackup={() => undefined}
      onExportDnd4e={() => undefined}
      onDuplicate={() => undefined}
      onTrash={() => undefined}
    />,
  );
}

describe("character library detail pane", () => {
  it("is only the header band, with the role line once it is ready", () => {
    const ready = pane({ status: "ready", roleLine: "Divine Defender" });
    expect(ready).toContain(
      '<p class="library-detail-role">Divine Defender</p>',
    );
    expect(ready).toMatch(/<\/header><\/aside>$/);
    expect(ready).not.toContain("library-detail-body");
    expect(ready).not.toContain("library-stats");
    expect(ready).not.toContain("Update available");
    // A class without a role: no role line, nothing waiting.
    const roleless = pane({ status: "ready" });
    expect(roleless).not.toContain("library-detail-role");
  });

  it("holds the role line's place while loading and omits it on error", () => {
    const loading = pane({ status: "loading" });
    expect(loading).toContain(
      '<p class="library-detail-role"><span aria-hidden="true" class="library-detail-role-wait"></span></p>',
    );
    // Nothing else in the band waits on evaluation.
    expect(loading).toContain("<h2>Ingi</h2>");
    expect(loading).toContain("Dwarf Paladin 7");
    expect(loading).toContain("Paragon path: Astral Weapon");
    expect(loading).toContain("Edited ");
    expect(loading).toContain("Edit Ingi build");
    expect(loading).not.toContain("aria-busy");

    const failed = pane({ status: "error", message: "Pack missing" });
    expect(failed).not.toContain("library-detail-role");
    expect(failed).not.toContain("Pack missing");
    expect(failed).toContain("<h2>Ingi</h2>");
  });
});
