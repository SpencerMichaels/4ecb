import {
  combinedDefenseModifiers,
  playDataDefenseLine,
  type CharacterSheetModel,
  type SheetValue,
} from "@4ecb/sheet-model";

import type { StatTileValue } from "./StatTiles";
import {
  conditionalModifierText,
  type OverviewConditionalModifier,
} from "./defensive-text";
/**
 * The Play data card's stat body as display-ready strings: the ability
 * scores, defenses, health, the Init | Speed | Passive senses row and the
 * note lines, rendered by PlayDataStats on the print Play data card.
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
  // Only the defenses that always apply, then a pointer to page 1's
  // Conditional modifiers pane for the rest (owner decision, 2026-11-05).
  const defenses = playDataDefenseLine({
    saves: overview?.saves ?? "",
    defensiveTraits: overview?.defensiveTraits ?? [],
    conditionalModifiers: overview?.conditionalModifiers ?? [],
  });
  // Initiative, speed and ally bonuses beside the stat they modify, as
  // legacy CharTracker printed them under each stat; skills, checks and
  // health stay on page 1.
  const conditional = (
    surface: OverviewConditionalModifier["surface"],
  ): string =>
    combinedDefenseModifiers(overview?.conditionalModifiers ?? [])
      .filter((modifier) => modifier.surface === surface)
      .map(conditionalModifierText)
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
        ["Defenses", defenses],
        ["Initiative", conditional("initiative")],
        ["Speed", conditional("speed")],
        ["Allies", conditional("allies")],
      ] as const
    )
      .filter(([, text]) => text)
      .map(([label, text]) => ({ label, text })),
  };
}
