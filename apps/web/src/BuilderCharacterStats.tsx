import {
  abilityModifier,
  bloodiedValue,
  evaluatedHealingSurgeValue,
  healingSurgeValue,
  type EvaluatedCharacter,
  type EvaluatedContribution,
  type EvaluatedStat,
} from "@4ecb/rules-engine";

import { StatGroup, type StatTileValue } from "./StatTiles";

type HeaderEvaluation = Pick<EvaluatedCharacter, "stats">;

const defenses = [
  ["AC", ["AC", "Armor Class"]],
  ["Fort", ["Fortitude Defense", "Fortitude"]],
  ["Ref", ["Reflex Defense", "Reflex"]],
  ["Will", ["Will Defense", "Will"]],
] as const;

const abilities = [
  ["STR", "Strength"],
  ["CON", "Constitution"],
  ["DEX", "Dexterity"],
  ["INT", "Intelligence"],
  ["WIS", "Wisdom"],
  ["CHA", "Charisma"],
] as const;

function evaluatedStat(
  evaluation: HeaderEvaluation | undefined,
  names: string | readonly string[],
): EvaluatedStat | undefined {
  if (evaluation === undefined) return undefined;
  for (const name of typeof names === "string" ? [names] : names) {
    const exact = evaluation.stats[name];
    if (exact !== undefined) return exact;
    const normalized = name.trim().toLocaleLowerCase();
    const normalizedMatch = Object.entries(evaluation.stats).find(
      ([candidate]) => candidate.trim().toLocaleLowerCase() === normalized,
    );
    if (normalizedMatch !== undefined) return normalizedMatch[1];
  }
  return undefined;
}

function displayValue(stat: EvaluatedStat | undefined, signed = false): string {
  const value = stat?.value;
  if (value === undefined || value === "") return "—";
  const text = String(value);
  return signed && /^\d+(?:\.\d+)?$/.test(text) ? `+${text}` : text;
}

const abilityNames: Readonly<Record<string, string>> = {
  cha: "Charisma",
  con: "Constitution",
  dex: "Dexterity",
  int: "Intelligence",
  str: "Strength",
  wis: "Wisdom",
};

function contributionValue(
  contribution: EvaluatedContribution,
): number | undefined {
  if (contribution.numericValue !== undefined) return contribution.numericValue;
  const parsed = Number(contribution.value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function linkedStatLabel(value: string): string | undefined {
  const raw = value.trim().replace(/^\+/, "");
  const ability = /^ABILITYMOD\(([^)]+)\)$/i.exec(raw)?.[1];
  if (ability !== undefined)
    return `${abilityNames[ability.trim().toLocaleLowerCase()] ?? ability} modifier`;
  if (/^HALF-LEVEL$/i.test(raw)) return "Half level";
  if (/^Initiative Misc$/i.test(raw)) return "Miscellaneous";
  if (/ Defense Class Bonus$/i.test(raw)) return "Class bonus";
  return undefined;
}

export function contributionLabel(
  statName: string,
  contribution: EvaluatedContribution,
): string {
  if (contribution.providerId === "base-abilities") return "Base";
  const provider = contribution.providerName.trim();
  if (!/^\d+$/.test(provider)) return provider;

  const linked = linkedStatLabel(contribution.value);
  if (linked !== undefined) return linked;
  const raw = contribution.value.trim().replace(/^\+/, "");
  if (/^_LEVEL-ONE-HPS$/i.test(raw)) return "Level 1 hit points";
  if (/^_PER-LEVEL-HPS$/i.test(raw)) return `Level ${provider} hit points`;
  if (/^Constitution$/i.test(raw) && statName === "Hit Points")
    return "Constitution score";
  if (
    /^(?:AC|Armor Class|Fortitude Defense|Reflex Defense|Will Defense)$/i.test(
      statName,
    ) &&
    Number(raw) === 10
  )
    return "Base";
  return "Other contribution";
}

function formatContributionValue(label: string, value: number): string {
  if (label === "Base") return String(value);
  return value > 0 ? `+${value}` : String(value);
}

function appliedContributions(stat: EvaluatedStat): readonly {
  readonly label: string;
  readonly value: string;
}[] {
  return stat.contributions.flatMap((contribution) => {
    if (!contribution.applied) return [];
    const value = contributionValue(contribution);
    if (value === undefined) return [];
    const label = contributionLabel(stat.name, contribution);
    return [{ label, value: formatContributionValue(label, value) }];
  });
}

type TooltipContribution = ReturnType<typeof appliedContributions>[number];

function collapsePerLevelHitPoints(
  contributions: readonly TooltipContribution[],
): readonly TooltipContribution[] {
  const collapsed: TooltipContribution[] = [];

  for (let index = 0; index < contributions.length; index += 1) {
    const contribution = contributions[index];
    if (contribution === undefined) continue;
    const firstLevel = /^Level (\d+) hit points$/.exec(contribution.label)?.[1];
    if (firstLevel === undefined) {
      collapsed.push(contribution);
      continue;
    }

    const start = Number(firstLevel);
    let end = start;
    while (index + 1 < contributions.length) {
      const next = contributions[index + 1];
      if (next === undefined || next.value !== contribution.value) break;
      const nextLevel = /^Level (\d+) hit points$/.exec(next.label)?.[1];
      if (nextLevel === undefined || Number(nextLevel) !== end + 1) break;
      end += 1;
      index += 1;
    }

    collapsed.push(
      end === start
        ? contribution
        : {
            label: `Levels ${start}\u2013${end} hit points`,
            value: `${contribution.value} each`,
          },
    );
  }

  return collapsed;
}

function contributionLine(contribution: TooltipContribution): string {
  // Item names commonly include their enhancement bonus. Only suppress an
  // exact, whitespace-delimited suffix so unrelated numbers remain visible.
  if (contribution.label.endsWith(` ${contribution.value}`))
    return contribution.label;
  return `${contribution.label} ${contribution.value}`;
}

function statTooltip(
  label: string,
  value: string,
  stat: EvaluatedStat,
): string {
  return [
    `${label} ${value}`,
    ...collapsePerLevelHitPoints(appliedContributions(stat)).map(
      contributionLine,
    ),
  ].join("\n");
}

function statTile(
  evaluation: HeaderEvaluation | undefined,
  label: string,
  names: string | readonly string[],
  signed = false,
): StatTileValue {
  const stat = evaluatedStat(evaluation, names);
  const value = displayValue(stat, signed);
  return typeof stat?.value === "number"
    ? { label, value, title: statTooltip(label, value, stat) }
    : { label, value };
}

function surgeValueTile(
  evaluation: HeaderEvaluation | undefined,
): StatTileValue {
  const total =
    evaluation === undefined
      ? undefined
      : evaluatedHealingSurgeValue(evaluation.stats);
  const hitPoints = evaluatedStat(evaluation, "Hit Points")?.value;
  if (total === undefined || typeof hitPoints !== "number")
    return { label: "Surge HP", value: "—" };
  const bonus = evaluatedStat(evaluation, "Healing Surge Value");
  return {
    label: "Surge HP",
    value: String(total),
    title: [
      `Surge HP ${total}`,
      `Quarter of max HP ${healingSurgeValue(hitPoints, 0)}`,
      ...(bonus === undefined
        ? []
        : appliedContributions(bonus).map(contributionLine)),
    ].join("\n"),
  };
}

function bloodiedTile(evaluation: HeaderEvaluation | undefined): StatTileValue {
  const hitPoints = evaluatedStat(evaluation, "Hit Points")?.value;
  if (typeof hitPoints !== "number") return { label: "Bloodied", value: "—" };
  const value = String(bloodiedValue(hitPoints));
  return {
    label: "Bloodied",
    value,
    title: `Bloodied ${value}\nHalf of max HP ${hitPoints}`,
  };
}

function abilityTile(
  evaluation: HeaderEvaluation | undefined,
  label: string,
  name: string,
): StatTileValue {
  const scoreStat = evaluatedStat(evaluation, name);
  const score =
    typeof scoreStat?.value === "number" ? scoreStat.value : undefined;
  // Same precedence as the printed sheet: the evaluated modifier, else the
  // shared derived formula.
  const modifierStat = evaluatedStat(evaluation, `${name} modifier`);
  const modifier =
    typeof modifierStat?.value === "number"
      ? modifierStat.value
      : score === undefined
        ? undefined
        : abilityModifier(score);
  const value =
    modifier === undefined
      ? "—"
      : modifier >= 0
        ? `+${modifier}`
        : String(modifier);
  return {
    lead: score === undefined ? "—" : String(score),
    label,
    value,
    ...(scoreStat === undefined || score === undefined
      ? {}
      : { title: statTooltip(label, String(score), scoreStat) }),
  };
}

/**
 * The builder sidebar's numbers, arranged like the printed Play-data card:
 * abilities, defenses, health, then initiative, speed and passive senses.
 */
export function BuilderCharacterStats({
  evaluation,
}: {
  readonly evaluation?: HeaderEvaluation | undefined;
}) {
  return (
    <section aria-label="Key statistics" className="builder-character-stats">
      <StatGroup
        label="Ability scores"
        tone="abilities"
        className="builder-character-abilities"
        compact
        values={abilities.map(([label, name]) =>
          abilityTile(evaluation, label, name),
        )}
      />
      <StatGroup
        label="Defenses"
        tone="defenses"
        values={defenses.map(([label, names]) =>
          statTile(evaluation, label, names),
        )}
      />
      <StatGroup
        label="Health"
        tone="health"
        values={[
          statTile(evaluation, "Max HP", "Hit Points"),
          bloodiedTile(evaluation),
          statTile(evaluation, "Surges", "Healing Surges"),
          surgeValueTile(evaluation),
        ]}
      />
      <div className="builder-character-stat-row">
        <StatGroup
          label="Initiative"
          tone="movement"
          values={[statTile(evaluation, "Init", "Initiative", true)]}
        />
        <StatGroup
          label="Speed"
          tone="movement"
          values={[statTile(evaluation, "Speed", "Speed")]}
        />
        <StatGroup
          label="Passive senses"
          tone="abilities"
          values={[
            statTile(evaluation, "Insight", "Passive Insight"),
            statTile(evaluation, "Perception", "Passive Perception"),
          ]}
        />
      </div>
    </section>
  );
}
