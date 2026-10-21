import type { CharacterSheetModel, SheetValue } from "@4ecb/sheet-model";

import { ABILITY_ABBREVIATIONS } from "./ability-abbreviations";
import type { StatTileValue } from "./StatTiles";
import { defensiveBonusText, isSavingThrowTrait } from "./defensive-text";

/**
 * The Play data card's stat body as display-ready strings: the ability
 * scores, defenses, health, the Init | Speed | Passive senses row and the
 * note lines. The print card and the library's detail pane both render this
 * one value (PlayDataStats), so the two can't drift; it is plain data so the
 * library can keep it in its saved summary.
 */
export interface PlayData {
  readonly abilities: readonly StatTileValue[];
  readonly defenses: readonly StatTileValue[];
  readonly health: readonly StatTileValue[];
  readonly initiative: readonly StatTileValue[];
  readonly speed: readonly StatTileValue[];
  readonly passives: readonly StatTileValue[];
  readonly notes: readonly PlayDataNote[];
}

export interface PlayDataNote {
  readonly label: string;
  readonly text: string;
}

const find = (values: readonly SheetValue[], label: string) =>
  values.find((value) => value.label.toLowerCase() === label.toLowerCase())
    ?.value ?? "—";

const signed = (value: string) =>
  /^\d/.test(value.trim()) ? `+${value.trim()}` : value.trim() || "—";

/** Formats a sheet model's numbers for the Play data stat body. Every value
 *  is the model's own (evaluated stats and derived values); nothing here
 *  calculates. */
export function playData(model: CharacterSheetModel): PlayData {
  const overview = model.overview;
  const traits = overview?.defensiveTraits ?? [];
  const saves = [
    /^[+-]?0?$/.test(overview?.saves.trim() ?? "")
      ? ""
      : overview?.saves.trim(),
    ...traits.filter(isSavingThrowTrait).map(defensiveBonusText),
  ]
    .filter(Boolean)
    .join("; ");
  // Group by kind and drop the repeated word: "Resistances 5 fire, 7 cold".
  const defenseGroups = [
    ["Resistances", /^Resist\s+/i],
    ["Vulnerabilities", /^Vulnerable\s+/i],
    ["Immunities", /^Immune(?:\s+to)?\s+/i],
  ] as const;
  const defenseTexts = traits
    .filter((trait) => !isSavingThrowTrait(trait))
    .map(defensiveBonusText);
  const defenseLines = defenseGroups.map(
    ([label, prefix]) =>
      [
        label,
        defenseTexts
          .filter((text) => prefix.test(text))
          .map((text) => text.replace(prefix, ""))
          .join(", "),
      ] as const,
  );
  const otherDefenses = defenseTexts
    .filter((text) => !defenseGroups.some(([, prefix]) => prefix.test(text)))
    .join("; ");
  return {
    abilities: (overview?.abilities ?? []).map((ability) => ({
      lead: ability.score || "—",
      label: ability.name.slice(0, 3).toUpperCase(),
      value: ability.modifier || "—",
    })),
    defenses: [
      { label: "AC", value: find(model.defenses, "AC") },
      { label: "Fort", value: find(model.defenses, "Fortitude") },
      { label: "Ref", value: find(model.defenses, "Reflex") },
      { label: "Will", value: find(model.defenses, "Will") },
    ],
    health: [
      { label: "Max HP", value: find(model.resources, "Hit Points") },
      { label: "Bloodied", value: overview?.bloodied || "—" },
      { label: "Surges", value: find(model.resources, "Healing Surges") },
      {
        label: "Surge HP",
        value: find(model.resources, "Healing Surge Value"),
      },
    ],
    initiative: [
      { label: "Init", value: signed(find(model.resources, "Initiative")) },
    ],
    speed: [{ label: "Speed", value: find(model.resources, "Speed") }],
    passives: [
      {
        label: "Pass. Insight",
        value: find(model.senses, "Passive Insight"),
      },
      {
        label: "Pass. Perc.",
        value: find(model.senses, "Passive Perception"),
      },
    ],
    notes: (
      [
        ["Senses", overview?.vision ?? ""],
        ["Saves", saves],
        ...defenseLines,
        ["Other", otherDefenses],
      ] as const
    )
      .filter(([, text]) => text)
      .map(([label, text]) => ({ label, text })),
  };
}

const placeholder = (label: string): StatTileValue => ({ label, value: "—" });

/** The same tiles with "—" for every value, so a pane waiting on evaluation
 *  keeps the layout it will have once the numbers arrive. */
export const PLACEHOLDER_PLAY_DATA: PlayData = {
  abilities: ABILITY_ABBREVIATIONS.map(([, label]) => ({
    lead: "—",
    label,
    value: "—",
  })),
  defenses: ["AC", "Fort", "Ref", "Will"].map(placeholder),
  health: ["Max HP", "Bloodied", "Surges", "Surge HP"].map(placeholder),
  initiative: [placeholder("Init")],
  speed: [placeholder("Speed")],
  passives: ["Pass. Insight", "Pass. Perc."].map(placeholder),
  notes: [],
};

function isTileList(value: unknown): value is readonly StatTileValue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (tile: unknown) =>
        tile !== null &&
        typeof tile === "object" &&
        typeof (tile as StatTileValue).label === "string" &&
        typeof (tile as StatTileValue).value === "string" &&
        ["string", "undefined"].includes(typeof (tile as StatTileValue).lead),
    )
  );
}

/** Whether a stored value (a saved library summary) is a PlayData. */
export function isPlayData(value: unknown): value is PlayData {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<keyof PlayData, unknown>;
  return (
    isTileList(candidate.abilities) &&
    isTileList(candidate.defenses) &&
    isTileList(candidate.health) &&
    isTileList(candidate.initiative) &&
    isTileList(candidate.speed) &&
    isTileList(candidate.passives) &&
    Array.isArray(candidate.notes) &&
    candidate.notes.every(
      (note: unknown) =>
        note !== null &&
        typeof note === "object" &&
        typeof (note as PlayDataNote).label === "string" &&
        typeof (note as PlayDataNote).text === "string",
    )
  );
}
