import {
  POWER_TEXT_FIELD,
  POWER_TEXT_VERSION,
  authoredAttackLine,
  getAttribute,
  namesSummonedCreature,
  parsePowerFieldBonuses,
  parsePowerText,
  powerAttackSlots,
  type PowerTextEntry,
  type PowerTextStore,
  type RuleStatement,
  type SpecificField,
} from "@4ecb/content-domain";

type Facets = { attack?: boolean; hit?: boolean; recoveries?: boolean };

/** The facets the rules engine reads a field of this name as. */
function facetsOfField(name: string): Facets | undefined {
  const field = name.trim().toLocaleLowerCase();
  if (/attack$/.test(field) && !/attack type$/.test(field))
    return { attack: true };
  if (
    /^(?:(?:primary|secondary|tertiary|quaternary)\s+)?hit$/.test(field) ||
    field === "_calculatedhit"
  )
    return { hit: true };
  if (field === "effect") return { recoveries: true };
  return undefined;
}

function addText(
  wanted: Map<string, Facets>,
  text: string,
  facets: Facets,
): void {
  if (text.trim() === "") return;
  const current = wanted.get(text) ?? {};
  wanted.set(text, {
    ...current,
    ...(facets.attack === true ? { attack: true } : {}),
    ...(facets.hit === true ? { hit: true } : {}),
    ...(facets.recoveries === true ? { recoveries: true } : {}),
  });
}

/** Why a parsed text would leave the engine without a number. */
function issuesOf(text: string, entry: PowerTextEntry): string[] {
  const issues: string[] = [];
  const raw =
    entry.attack === undefined ? undefined : authoredAttackLine(entry.attack);
  if (
    entry.attack?.isAttack === true &&
    raw !== undefined &&
    raw.abilities === undefined &&
    raw.special === undefined &&
    raw.primaryAbility === undefined &&
    raw.beastBonus === undefined &&
    raw.levelAttack === undefined
  )
    issues.push(`attack line names no ability: ${JSON.stringify(text)}`);
  for (const { line } of entry.hit?.steps ?? []) {
    const variant = line.other;
    const clause = variant.clauses[0];
    if (
      line.damage === true &&
      line.beastHit === undefined &&
      variant.special === undefined &&
      variant.ongoing === undefined &&
      clause.weaponTerms === undefined &&
      clause.fixedDice === undefined &&
      clause.flatBase === undefined
    ) {
      issues.push(`hit line has no damage expression: ${JSON.stringify(text)}`);
      break;
    }
  }
  return issues;
}

/**
 * The record's {@link POWER_TEXT_FIELD}, appended after its own fields: a
 * Power's attack slots and the parsed text of each attack, hit and effect
 * field, and, for any record, the parsed value of each `modify` that
 * replaces such a field (Melee Training's "Constitution vs. AC"). Keyed by
 * the exact text the engine looks up (an attack slot's trimmed value, a
 * field's raw value). Every Power has one; another record only for its
 * `modify` values. `issues` are texts that parse to no attack ability or
 * no damage.
 */
export function powerTextField(
  type: string,
  specifics: readonly SpecificField[],
  rules: readonly RuleStatement[],
  ordinal: number,
): { field?: SpecificField; issues: readonly string[] } {
  const wanted = new Map<string, Facets>();
  const power = type.toLocaleLowerCase() === "power";
  const slots = power ? powerAttackSlots(specifics) : [];
  if (power) {
    for (const [specificOrdinal, role] of slots) {
      if (role !== "attack" && role !== "hit") continue;
      const specific = specifics.find(
        (candidate) => candidate.ordinal === specificOrdinal,
      );
      if (specific !== undefined)
        addText(wanted, specific.value.trim(), { [role]: true });
    }
    for (const specific of specifics) {
      const facets = facetsOfField(specific.name);
      if (facets === undefined) continue;
      // effectiveField reads the raw value; slots read it trimmed.
      if (facets.hit === true || facets.recoveries === true)
        addText(wanted, specific.value, facets);
    }
  }
  for (const rule of rules) {
    if (rule.name.toLocaleLowerCase() !== "modify") continue;
    const facets = facetsOfField(getAttribute(rule.attributes, "Field") ?? "");
    const value = getAttribute(rule.attributes, "value");
    if (facets === undefined || value === undefined) continue;
    addText(wanted, value, facets);
    addText(wanted, value.trim(), facets);
  }
  if (!power && wanted.size === 0) return { issues: [] };
  const texts: Record<string, PowerTextEntry> = {};
  const issues: string[] = [];
  for (const [text, facets] of [...wanted].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    const entry = parsePowerText(text, facets);
    texts[text] = entry;
    if (power) issues.push(...issuesOf(text, entry));
  }
  const fieldBonuses = power ? parsePowerFieldBonuses(specifics) : undefined;
  const store: PowerTextStore = {
    version: POWER_TEXT_VERSION,
    ...(slots.length === 0 ? {} : { slots }),
    ...(power && namesSummonedCreature(specifics)
      ? { summonedCreature: true as const }
      : {}),
    ...(fieldBonuses === undefined ||
    (fieldBonuses.weapon === undefined && fieldBonuses.riders === undefined)
      ? {}
      : { fieldBonuses }),
    texts,
  };
  return {
    field: {
      name: POWER_TEXT_FIELD,
      value: JSON.stringify(store),
      extraAttributes: [],
      ordinal,
    },
    issues,
  };
}
