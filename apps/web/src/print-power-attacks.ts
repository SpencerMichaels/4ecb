import {
  isPowerTargetLabel,
  type SheetCard,
  type SheetPowerAttack,
  type SheetPowerVariant,
  type SheetValue,
} from "@4ecb/sheet-model";

import { LEVEL_ATTACK_STAT } from "@4ecb/rules-engine";

import { abilityAbbreviation } from "./ability-abbreviations";
import { powerTextAtLevel } from "./power-level-text";

function namedOrdinal(label: string): number | undefined {
  return new Map([
    ["primary attack", 1],
    ["secondary attack", 2],
    ["tertiary attack", 3],
    ["quaternary attack", 4],
  ]).get(label.trim().toLocaleLowerCase());
}

export function printSustainActions(
  fields: readonly SheetValue[],
): readonly string[] {
  return [
    ...new Set(
      fields.flatMap((field) => {
        const match =
          /^sustain\s+(minor|move|standard|free|no action)\s*:?$/i.exec(
            field.label.trim(),
          );
        return match
          ? [
              match[1]!
                .toLowerCase()
                .replace(/\b\w/g, (letter) => letter.toUpperCase()),
            ]
          : [];
      }),
    ),
  ];
}

/** A calculated equipment variant must not carry a power-wide primary target
 * into later phases. Only authored phase metadata supplies those headers. */
export function withAuthoredPrintTargets(
  card: SheetCard,
  attacks: readonly SheetPowerAttack[],
): readonly SheetPowerAttack[] {
  const authored = fallbackPrintAttacks(card, undefined);
  return attacks.map((attack) => {
    if (attack.ordinal === 1) return attack;
    const rest = { ...attack };
    delete rest.target;
    const target = authored.find(
      (phase) => phase.ordinal === attack.ordinal,
    )?.target;
    return target === undefined ? rest : { ...rest, target };
  });
}

export function defaultPrintVariant(
  card: SheetCard,
): SheetPowerVariant | undefined {
  const variants = card.variants ?? [];
  return (
    variants.find((variant) => variant.equipped && variant.hand === "main") ??
    variants.find((variant) => variant.equipped) ??
    variants[0]
  );
}

/** Equipped phase projection for physical cards; indexes use authored formulas. */
export function defaultPrintAttacks(
  card: SheetCard,
): readonly SheetPowerAttack[] {
  const variants = card.variants ?? [];
  const selected = defaultPrintVariant(card);
  return withAuthoredPrintTargets(
    card,
    selected?.attacks?.map((attack) =>
      attack.eligible !== false
        ? attack
        : (variants
            .flatMap((variant) =>
              variant.equipped ? (variant.attacks ?? []) : [],
            )
            .find(
              (candidate) =>
                candidate.ordinal === attack.ordinal &&
                candidate.eligible !== false,
            ) ?? attack),
    ) ?? fallbackPrintAttacks(card, selected),
  );
}

/** An attack band's header: the ability formula against the defense. The
 *  equipped weapon's total to-hit bonus isn't shown here; each card's weapon
 *  table lists every weapon's bonus (D085). A beast companion's attack has
 *  no weapon and no ability formula, so its header is the beast's own
 *  attack line: "Beast +12 vs AC". A summoned creature's reads "Level+5 vs
 *  Will"; an ability the engine could not resolve (a beast's attack with no
 *  beast companion) is a dash, never "UNKNOWN". */
export function printAttackHeader(attack: SheetPowerAttack): string {
  const total = attack.attack
    .replace(/\bFortitude\b/gi, "Fort")
    .replace(/\bReflex\b/gi, "Ref");
  if (attack.attacker === "beast") return `Beast ${total}`;
  const name = attack.ability.trim().toLocaleLowerCase();
  if (name === "unknown")
    return `— vs ${total.match(/\bvs\s+(.+)$/i)?.[1] ?? "defense"}`;
  const ability =
    name === LEVEL_ATTACK_STAT.toLocaleLowerCase()
      ? LEVEL_ATTACK_STAT
      : abilityAbbreviation(attack.ability);
  const formula = `${ability}${attack.powerBonus === 0 ? "" : attack.powerBonus > 0 ? `+${attack.powerBonus}` : attack.powerBonus}`;
  return `${formula} vs ${total.match(/\bvs\s+(.+)$/i)?.[1] ?? "defense"}`;
}

/** Splits a power card's rule fields by attack phase. A target field is a
 * rule line unless its phase's attack band shows the same target (the
 * band's text is authored; the field may carry the sheet's "(+N)" value
 * annotations), so a power with no attack roll keeps its "Target:" line;
 * an attack line likewise unless the band shows all of it
 * (`bandShowsAttackLine`, at `level`). A phase without a band (its attack
 * line has no defense) prints its fields with the band before it, or
 * before the bands. */
export function groupedPrintRules(
  fields: readonly SheetValue[],
  headers: readonly SheetPowerAttack[] = [],
  level = 0,
) {
  const leading: SheetValue[] = [];
  const attacks = new Map<number, SheetValue[]>();
  let currentAttack: number | undefined;
  const banded = new Set(headers.map((header) => header.ordinal));
  // The section a phase's fields print in: its own band's, else the
  // nearest earlier band's, else the lines before the bands.
  const sectionFor = (ordinal: number): SheetValue[] => {
    const shown = [...banded]
      .filter((candidate) => candidate <= ordinal)
      .sort((left, right) => right - left)[0];
    if (shown === undefined) return leading;
    const section = attacks.get(shown) ?? [];
    attacks.set(shown, section);
    return section;
  };
  for (const field of fields) {
    const targetLabel = field.label.trim().toLocaleLowerCase();
    if (isPowerTargetLabel(targetLabel)) {
      const targetOrdinal =
        namedOrdinal(targetLabel.replace(/targets?$/, "attack")) ??
        currentAttack ??
        1;
      const headerTarget = headers.find(
        (header) => header.ordinal === targetOrdinal,
      )?.target;
      const normalized = (value: string) =>
        value
          .replace(/\s*\([+-]\d+\)/g, "")
          .trim()
          .replace(/\s+/g, " ")
          .toLocaleLowerCase();
      if (
        headerTarget !== undefined &&
        normalized(headerTarget) === normalized(field.value)
      )
        continue;
    }
    const ordinal =
      namedOrdinal(field.label) ??
      (field.label.trim().toLocaleLowerCase() === "attack"
        ? (currentAttack ?? 1)
        : undefined);
    if (ordinal !== undefined) {
      currentAttack = ordinal;
      if (!attacks.has(ordinal)) attacks.set(ordinal, []);
      // The band shows the attack's ability and defense; anything else the
      // line says ("…, two attacks", "(off-hand weapon)", other defenses,
      // a level's bonus) or a line with no attack roll at all ("Attack:
      // You can shift 1 square, then make a basic attack") stays a rule.
      const header = headers.find((candidate) => candidate.ordinal === ordinal);
      if (header === undefined || !bandShowsAttackLine(field.value, level))
        sectionFor(ordinal).push(field);
      continue;
    }
    if (currentAttack === undefined) leading.push(field);
    else sectionFor(currentAttack).push(field);
  }
  return { leading, attacks };
}

const ABILITY_NAME =
  "(?:your\\s+)?(?:strength|constitution|dexterity|intelligence|wisdom|charisma|str|con|dex|int|wis|cha|primary ability|level)(?:\\s+modifier)?(?:\\s*\\([+-]?\\d+\\))?";

/** An attack line the band says all of: "Strength vs. AC", "Wisdom + 2
 *  vs. Will", "Charisma or Intelligence (+4) vs. Reflex". */
const BAND_ATTACK_LINE = new RegExp(
  `^${ABILITY_NAME}(?:\\s*(?:,|or|and|/)\\s*${ABILITY_NAME})*(?:\\s*[+-]\\s*\\d+)?(?:\\s*\\([+-]?\\d+\\))?\\s+vs\\.?\\s+(?:ac|armor class|fortitude|fort|reflex|ref|will)\\.?$`,
  "i",
);

/** Whether an attack band (ability and defense) shows all of an authored
 *  attack line at the card's level; a line of only punctuation (a legacy
 *  "Secondary Attack" heading over its indented fields) says nothing. */
export function bandShowsAttackLine(value: string, level: number): boolean {
  const text = powerTextAtLevel(value, level).replace(/\s+/g, " ").trim();
  return !/[\p{L}\p{N}]/u.test(text) || BAND_ATTACK_LINE.test(text);
}

/** Cached exports supply only a primary total; preserve other authored phases
 * without pretending that total also applies to a secondary attack. */
export function fallbackPrintAttacks(
  card: SheetCard,
  variant: SheetPowerVariant | undefined,
): readonly SheetPowerAttack[] {
  const definitions = new Map<number, string>();
  const targets = new Map<number, string>();
  let active = 1;
  for (const field of card.fields) {
    const name = field.label.trim().toLocaleLowerCase();
    const named = namedOrdinal(name);
    if (named !== undefined) active = named;
    if (
      (named !== undefined || name === "attack") &&
      /\bvs\.?\s+[A-Za-z]+/i.test(field.value)
    )
      definitions.set(active, field.value);
    const targetOrdinal =
      /^(primary|secondary|tertiary|quaternary) targets?$/.test(name)
        ? namedOrdinal(name.replace(/targets?$/, "attack"))
        : undefined;
    if (isPowerTargetLabel(name))
      targets.set(targetOrdinal ?? active, field.value);
  }
  const primaryTotal = variant?.attack ?? card.attack;
  if (
    definitions.size === 0 &&
    primaryTotal !== undefined &&
    !primaryTotal.includes("Unknown")
  )
    definitions.set(1, primaryTotal);
  return [...definitions]
    .sort(([a], [b]) => a - b)
    .map(([ordinal, line]) => {
      const ability =
        (ordinal === 1 ? variant?.ability : undefined) ??
        line.match(
          /\b(Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma|Primary ability)\b/i,
        )?.[1] ??
        // A builder card before evaluation abbreviates ("CON vs. Fortitude").
        line.match(/\b(STR|CON|DEX|INT|WIS|CHA)\b/)?.[1] ??
        "Ability";
      const defense = line.match(/\bvs\.?\s+([A-Za-z]+)/i)?.[1] ?? "defense";
      const target = targets.get(ordinal);
      return {
        id: `${card.id ?? card.name}:attack-${ordinal}`,
        ordinal,
        ability,
        powerBonus:
          ordinal === 1 && variant?.powerBonus !== undefined
            ? variant.powerBonus
            : Number(
                line.match(
                  /\b(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma|Primary ability|ability|STR|CON|DEX|INT|WIS|CHA)\s*\+\s*(\d+)/i,
                )?.[1] ?? 0,
              ),
        attack:
          ordinal === 1 && primaryTotal !== undefined
            ? primaryTotal
            : `— vs ${defense}`,
        ...(target === undefined ? {} : { target }),
      };
    });
}
