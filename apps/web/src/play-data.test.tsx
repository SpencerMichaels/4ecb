import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterSheetModel } from "@4ecb/sheet-model";

import { PlayDataStats } from "./PlayDataStats";
import { PrintCharacterCard } from "./PrintPlayCards";
import { playData } from "./play-data";

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

describe("Play data stat body", () => {
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
  });

  it("adds conditional defense, initiative, speed and ally lines beside the saves", () => {
    const modifier = (
      surface: string,
      target: string,
      text: string,
      source: string,
    ) => ({ surface, target, text, source, provenanceId: `${source}:0` });
    const data = playData({
      ...model,
      overview: {
        ...model.overview!,
        saves: "+1",
        conditionalModifiers: [
          modifier("speed", "Speed", "+2 to speed when charging", "Swift"),
          modifier(
            "defenses",
            "AC",
            "+4 to AC against opportunity attacks",
            "Style",
          ),
          modifier("defenses", "Will", "+2 to Will against fear", "Resolve"),
          modifier("initiative", "Initiative", "+2 to initiative", "Alert"),
          modifier(
            "allies",
            "AC",
            "Allies gain +1 to AC while adjacent to you",
            "Guard",
          ),
          // Skills, checks and health stay on page 1.
          modifier("skills", "Athletics", "+2 to Athletics checks", "Climb"),
          modifier("health", "Healing Surge Value", "+2 to it", "Standard"),
        ],
      },
    } as CharacterSheetModel);
    expect(data.notes).toEqual([
      { label: "Senses", text: "Low-light vision" },
      {
        label: "Defenses",
        text: "+4 to AC against opportunity attacks; +2 to Will against fear",
      },
      { label: "Saves", text: "+1" },
      { label: "Resistances", text: "5 fire" },
      { label: "Immunities", text: "Disease" },
      { label: "Initiative", text: "+2 to initiative" },
      { label: "Speed", text: "+2 to speed when charging" },
      { label: "Allies", text: "Allies gain +1 to AC while adjacent to you" },
    ]);
  });

  it("is the print Play data card's body", () => {
    const stats = renderToStaticMarkup(
      <PlayDataStats data={playData(model)} />,
    );
    const card = renderToStaticMarkup(
      <PrintCharacterCard model={model} name="Ingi" portrait={undefined} />,
    );
    expect(card).toContain(
      `<div class="print-play-body">${stats}</div><div class="print-card-type">`,
    );
  });
});
