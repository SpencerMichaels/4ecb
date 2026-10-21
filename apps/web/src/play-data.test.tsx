import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterLibraryEntry } from "@4ecb/browser-storage";
import type { CharacterSheetModel } from "@4ecb/sheet-model";

import { CharacterLibraryDetail } from "./CharacterLibraryDetail";
import { PlayDataStats } from "./PlayDataStats";
import { PrintCharacterCard } from "./PrintPlayCards";
import { isPlayData, playData, PLACEHOLDER_PLAY_DATA } from "./play-data";
import type { LibraryStats } from "./use-library-summary";

const value = (label: string, v: string) => ({ label, value: v });
const model = {
  identity: [value("Race", "Dwarf"), value("Class", "Paladin")],
  defenses: [
    value("AC", "24"),
    value("Fortitude", "20"),
    value("Reflex", "16"),
    value("Will", "19"),
  ],
  resources: [
    value("Hit Points", "71"),
    value("Healing Surges", "13"),
    value("Healing Surge Value", "17"),
    value("Initiative", "2"),
    value("Speed", "5"),
  ],
  senses: [value("Passive Insight", "18"), value("Passive Perception", "13")],
  overview: {
    bloodied: "35",
    vision: "Low-light vision",
    saves: "+0",
    defensiveTraits: [
      { label: "Resistance", value: "Fire 5", source: "Cloak" },
      { label: "Immunity", value: "Disease", source: "Feat" },
    ],
    abilities: [
      { name: "Strength", score: "16", modifier: "+3", check: "+6" },
      { name: "Charisma", score: "18", modifier: "+4", check: "+7" },
    ],
    skills: [],
  },
} as unknown as CharacterSheetModel;

const entry: CharacterLibraryEntry = {
  id: "ingi",
  title: "Ingi",
  updatedAt: "2026-10-21T10:00:00.000Z",
  effectiveLevel: 7,
  race: "Dwarf",
  className: "Paladin",
};

function pane(stats: LibraryStats): string {
  return renderToStaticMarkup(
    <CharacterLibraryDetail
      character={entry}
      stats={stats}
      now={new Date("2026-10-21T12:00:00.000Z")}
      updateAvailable={false}
      exporting={false}
      trashArmed={false}
      onExportBackup={() => undefined}
      onExportDnd4e={() => undefined}
      onDuplicate={() => undefined}
      onTrash={() => undefined}
    />,
  );
}

describe("shared Play data stat body", () => {
  it("formats the sheet model's values in the card's order", () => {
    const data = playData(model);
    expect(data.abilities).toEqual([
      { lead: "16", label: "STR", value: "+3" },
      { lead: "18", label: "CHA", value: "+4" },
    ]);
    expect(data.defenses.map(({ value }) => value)).toEqual([
      "24",
      "20",
      "16",
      "19",
    ]);
    expect(data.health).toEqual([
      { label: "Max HP", value: "71" },
      { label: "Bloodied", value: "35" },
      { label: "Surges", value: "13" },
      { label: "Surge HP", value: "17" },
    ]);
    expect(data.initiative).toEqual([{ label: "Init", value: "+2" }]);
    expect(data.passives.map(({ value }) => value)).toEqual(["18", "13"]);
    // A +0 save line is dropped; the rest keep the card's order.
    expect(data.notes.map(({ label }) => label)).toEqual([
      "Senses",
      "Resistances",
      "Immunities",
    ]);
    // Plain data, so the library can save it.
    expect(isPlayData(JSON.parse(JSON.stringify(data)))).toBe(true);
    expect(isPlayData({ ...data, notes: [{ label: 1 }] })).toBe(false);
    expect(isPlayData(PLACEHOLDER_PLAY_DATA)).toBe(true);
  });

  it("renders identically on the print card and in the library pane", () => {
    const stats = renderToStaticMarkup(
      <PlayDataStats data={playData(model)} />,
    );
    const card = renderToStaticMarkup(
      <PrintCharacterCard model={model} name="Ingi" portrait={undefined} />,
    );
    expect(card).toContain(
      `<div class="print-play-body">${stats}</div><div class="print-card-type">`,
    );
    const ready = pane({
      status: "ready",
      summary: { roleLine: "Divine Defender", playData: playData(model) },
    });
    expect(ready).toContain(
      `<div class="library-stats" data-state="ready">${stats}</div>`,
    );
    expect(ready).toContain(
      '<p class="library-detail-role">Divine Defender</p>',
    );
    expect(ready).toContain(
      '<p class="library-stats-status" role="status"></p>',
    );
  });

  it("keeps full-size placeholder tiles while calculating or unavailable", () => {
    const placeholder = renderToStaticMarkup(
      <PlayDataStats data={PLACEHOLDER_PLAY_DATA} />,
    );
    expect(placeholder).toContain("<dt>AC</dt><dd>—</dd>");
    expect(placeholder).toContain(
      '<dt><span class="stat-tile-lead">—</span><span class="stat-tile-label">WIS</span></dt><dd>—</dd>',
    );

    const loading = pane({ status: "loading" });
    expect(loading).toContain(
      `<div class="library-stats" data-state="loading" aria-busy="true">${placeholder}</div>`,
    );
    expect(loading).toMatch(
      /<p class="library-stats-status" role="status"><span aria-hidden="true" class="loading-spinner"><\/span>Calculating stats…<\/p>/,
    );
    expect(loading).toContain('class="library-detail-role-wait"');
    // Identity and actions never wait.
    expect(loading).toContain("<h2>Ingi</h2>");
    expect(loading).toContain("Edit Ingi build");

    const failed = pane({ status: "error", message: "Pack missing" });
    expect(failed).toContain(
      '<p class="library-stats-status" role="status" title="Pack missing">',
    );
    expect(failed).toContain("Stats unavailable");
    expect(failed).not.toContain("library-detail-role");
    expect(failed).toContain(
      `<div class="library-stats" data-state="error">${placeholder}</div>`,
    );
  });
});
