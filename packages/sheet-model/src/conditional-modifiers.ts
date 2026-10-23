import type { EvaluatedContribution, EvaluatedStat } from "@4ecb/rules-engine";

/**
 * Where a conditional bonus belongs on the sheet. Legacy CharTracker lists
 * them beside the stat they modify (BasicUtils.BuildConditionalString):
 * "CONDITIONAL BONUSES" under each defense, "CONDITIONAL MODIFIERS" under
 * Initiative and "SPECIAL MOVEMENT" under Speed. Skills, checks, healing
 * surge value and ally-facing bonuses had no legacy surface.
 */
export type ConditionalModifierSurface =
  | "defenses"
  | "initiative"
  | "speed"
  | "skills"
  | "health"
  | "checks"
  | "allies";

export interface ConditionalModifier {
  readonly surface: ConditionalModifierSurface;
  /** The modified stat as the sheet names it: "AC", "Fortitude",
   *  "Initiative", "Speed", a skill name, "Healing Surge Value", "Escape"
   *  (a `check:Escape`), "Bull rush". Ally bonuses name the ally's stat. */
  readonly target: string;
  /** "+4 to AC against opportunity attacks you provoke by making a ranged
   *  attack"; ally bonuses read "Allies gain +1 to AC against ...". */
  readonly text: string;
  /** The granting element's name. */
  readonly source: string;
  /** The evaluated contribution id. */
  readonly provenanceId: string;
}

interface Target {
  readonly surface: ConditionalModifierSurface;
  readonly target: string;
  /** The words after "to": "AC", "initiative", "Athletics checks to climb". */
  readonly label: string;
}

const DEFENSES: Readonly<Record<string, string>> = {
  ac: "AC",
  "armor class": "AC",
  fortitude: "Fortitude",
  "fortitude defense": "Fortitude",
  reflex: "Reflex",
  "reflex defense": "Reflex",
  will: "Will",
  "will defense": "Will",
};

const key = (value: string) => value.trim().toLocaleLowerCase();

/** Stat names this projection owns. Attack and damage bonuses are power-card
 *  reminders (rules-engine powerAdditionalEffects), saves and resistances are
 *  defensive traits, and BEAST.* bonuses are companion-card notes. */
function targetOf(
  name: string,
  skills: ReadonlyMap<string, string>,
  ally: boolean,
): Target | undefined {
  const normalized = key(name).replace(/\s+/g, " ");
  const defense = DEFENSES[normalized];
  if (defense !== undefined)
    return { surface: "defenses", target: defense, label: defense };
  if (/^initiative(?: misc)?$/.test(normalized))
    return { surface: "initiative", target: "Initiative", label: "initiative" };
  if (normalized === "speed")
    return { surface: "speed", target: "Speed", label: "speed" };
  if (normalized === "healing surge value")
    return {
      surface: "health",
      target: "Healing Surge Value",
      label: "healing surge value",
    };
  if (normalized === "healing surges")
    return {
      surface: "health",
      target: "Healing Surges",
      label: "healing surges",
    };
  if (normalized === "bull rush")
    return { surface: "checks", target: "Bull rush", label: "bull rush" };
  const check = /^check:(.+)$/.exec(normalized);
  if (check?.[1] !== undefined) {
    const target = name.trim().slice("check:".length).trim();
    return { surface: "checks", target, label: `${target} checks` };
  }
  const skill = /^(.+?)(?: (misc|checks?))?(?: (.+))?$/.exec(normalized);
  const skillName = skill?.[1] === undefined ? undefined : skills.get(skill[1]);
  if (
    skillName !== undefined &&
    (skill?.[3] === undefined || /^checks?$/.test(skill[2] ?? ""))
  )
    return {
      surface: "skills",
      target: skillName,
      label: `${skillName} checks${skill?.[3] === undefined ? "" : ` ${skill[3]}`}`,
    };
  if (!ally) return undefined;
  if (/^(?:death )?saving throws$/.test(normalized))
    return {
      surface: "allies",
      target: normalized.startsWith("death") ? "Death saves" : "Saving throws",
      label: normalized.startsWith("death") ? "death saves" : "saves",
    };
  if (/^(?:attack|damage) rolls$/.test(normalized))
    return { surface: "allies", target: name.trim(), label: normalized };
  const damage = /^(melee|ranged):damage$/.exec(normalized);
  if (damage?.[1] !== undefined)
    return {
      surface: "allies",
      target: name.trim(),
      label: `${damage[1]} damage rolls`,
    };
  return undefined;
}

const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

function amountText(
  contribution: EvaluatedContribution,
  value: number | undefined,
): string {
  const amount =
    value === undefined ? contribution.value.trim() : signed(value);
  const type = contribution.bonusType?.trim();
  return type
    ? `${amount} ${type.toLocaleLowerCase()} ${value !== undefined && value < 0 ? "penalty" : "bonus"}`
    : amount;
}

/**
 * The evaluated character's conditional statadds, one entry per bonus with
 * its condition and source, for the surfaces legacy showed beside each stat.
 * Each bonus stays separate: its circumstance, typing and stacking are the
 * player's call, so nothing is summed. Aliases ("AC" / "Armor Class") and
 * zero / non-zero gated pairs collapse to one entry.
 */
export function conditionalModifiers(
  stats: Readonly<Record<string, EvaluatedStat>>,
  skillNames: readonly string[],
): ConditionalModifier[] {
  const skills = new Map(skillNames.map((name) => [key(name), name]));
  const result: ConditionalModifier[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  for (const [name, stat] of Object.entries(stats)) {
    const allyMatch = /^ally\.(.+)$/i.exec(name.trim());
    const ally = allyMatch?.[1] !== undefined;
    const resist = ally && /^resist:(.+)$/i.exec(allyMatch[1]!.trim());
    const target = resist
      ? undefined
      : targetOf(allyMatch?.[1] ?? name, skills, ally);
    if (!resist && target === undefined) continue;
    for (const contribution of stat.contributions) {
      if (contribution.reason !== "conditional") continue;
      const condition = contribution.condition?.trim();
      if (!condition || seenIds.has(contribution.id)) continue;
      const value = contribution.numericValue;
      if (value === 0) continue;
      let entry: Omit<ConditionalModifier, "source" | "provenanceId">;
      if (resist) {
        const kind = resist[1]!.trim();
        const resistText =
          value === undefined
            ? `resist ${contribution.value.trim()} ${kind}`
            : `${value > 0 ? "resist" : "vulnerable"} ${Math.abs(value)} ${kind}`;
        entry = {
          surface: "allies",
          target: `Resist ${kind}`,
          text: `Allies gain ${resistText} ${condition}`,
        };
      } else {
        const own = `${amountText(contribution, value)} to ${target!.label} ${condition}`;
        entry = {
          surface: ally ? "allies" : target!.surface,
          target: target!.target,
          text: ally ? `Allies gain ${own}` : own,
        };
      }
      seenIds.add(contribution.id);
      const identity = `${entry.surface}:${entry.text}:${contribution.providerName}`;
      if (seenTexts.has(identity)) continue;
      seenTexts.add(identity);
      result.push({
        ...entry,
        source: contribution.providerName,
        provenanceId: contribution.id,
      });
    }
  }
  return result;
}
