import type {
  SheetCard,
  SheetPowerAttack,
  SheetPowerVariant,
  SheetValue,
} from "@4ecb/sheet-model";

function namedOrdinal(label: string): number | undefined {
  return new Map([
    ["primary attack", 1],
    ["secondary attack", 2],
    ["tertiary attack", 3],
    ["quaternary attack", 4],
  ]).get(label.trim().toLocaleLowerCase());
}

export function printAttackHeader(
  attack: SheetPowerAttack,
  showEquippedAttackBonus: boolean,
): string {
  const ability =
    new Map([
      ["strength", "STR"],
      ["constitution", "CON"],
      ["dexterity", "DEX"],
      ["intelligence", "INT"],
      ["wisdom", "WIS"],
      ["charisma", "CHA"],
    ]).get(attack.ability.trim().toLocaleLowerCase()) ??
    attack.ability.toLocaleUpperCase();
  const formula = `${ability}${attack.powerBonus === 0 ? "" : attack.powerBonus > 0 ? `+${attack.powerBonus}` : attack.powerBonus}`;
  const total = attack.attack
    .replace(/\bFortitude\b/gi, "Fort")
    .replace(/\bReflex\b/gi, "Ref");
  return showEquippedAttackBonus
    ? total.replace(/^(.+?)\s+vs\s+(.+)$/i, `$1 · ${formula} vs $2`)
    : `${formula} vs ${total.match(/\bvs\s+(.+)$/i)?.[1] ?? "defense"}`;
}

export function groupedPrintRules(
  fields: readonly SheetValue[],
  headers: readonly SheetPowerAttack[] = [],
) {
  const leading: SheetValue[] = [];
  const attacks = new Map<number, SheetValue[]>();
  let currentAttack: number | undefined;
  for (const field of fields) {
    const targetLabel = field.label.trim().toLocaleLowerCase();
    if (
      /^(?:(?:primary|secondary|tertiary|quaternary) )?targets?$/.test(
        targetLabel,
      )
    ) {
      const targetOrdinal =
        namedOrdinal(targetLabel.replace(/targets?$/, "attack")) ??
        currentAttack ??
        1;
      const headerTarget = headers.find(
        (header) => header.ordinal === targetOrdinal,
      )?.target;
      const normalized = (value: string) =>
        value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
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
      continue;
    }
    if (currentAttack === undefined) leading.push(field);
    else attacks.get(currentAttack)?.push(field);
  }
  return { leading, attacks };
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
    if (/^(?:(?:primary|secondary|tertiary|quaternary) )?targets?$/.test(name))
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
                  /\b(?:Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma|Primary ability|ability)\s*\+\s*(\d+)/i,
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
