/** Ability names and their display abbreviations, always uppercase (STR). */
export const ABILITY_ABBREVIATIONS = [
  ["Strength", "STR"],
  ["Constitution", "CON"],
  ["Dexterity", "DEX"],
  ["Intelligence", "INT"],
  ["Wisdom", "WIS"],
  ["Charisma", "CHA"],
] as const;

/** "Strength" → "STR"; an unknown name is uppercased as written. */
export function abilityAbbreviation(ability: string): string {
  const name = ability.trim().toLocaleLowerCase();
  return (
    ABILITY_ABBREVIATIONS.find(
      ([full]) => full.toLocaleLowerCase() === name,
    )?.[1] ?? ability.toLocaleUpperCase()
  );
}
