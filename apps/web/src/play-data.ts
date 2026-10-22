import type { CharacterSheetModel, SheetValue } from "@4ecb/sheet-model";

import type { StatTileValue } from "./StatTiles";
import { defensiveBonusText, isSavingThrowTrait } from "./defensive-text";

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
