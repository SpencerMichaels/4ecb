import {
  abilityModifier,
  bloodiedValue,
  evaluatedHealingSurgeValue,
  healingSurgeValue,
  type CharacterOccurrence,
  type EvaluatedCharacter,
  type EvaluatedContribution,
  type EvaluatedStat,
} from "@4ecb/rules-engine";
import {
  conditionalModifiers,
  type ConditionalModifier,
} from "@4ecb/sheet-model";

import { StatGroup, type StatTileValue } from "./StatTiles";

type HeaderEvaluation = Pick<EvaluatedCharacter, "stats"> &
  Partial<Pick<EvaluatedCharacter, "occurrences">>;

const defenses = [
  ["AC", ["AC", "Armor Class"], "AC"],
  ["Fort", ["Fortitude Defense", "Fortitude"], "Fortitude"],
  ["Ref", ["Reflex Defense", "Reflex"], "Reflex"],
  ["Will", ["Will Defense", "Will"], "Will"],
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
  if (/ Misc$/i.test(raw)) return "Miscellaneous";
  if (/ Trained$/i.test(raw)) return "Trained";
  if (/ Defense Class Bonus$/i.test(raw)) return "Class bonus";
  return undefined;
}

/** The legacy builder's own rule elements: a level's grants (named by the
 *  level number) and the core rules elements (`SkillRules`). Their names
 *  say nothing to a player, so their rows are named by what they add. */
function coreRulesProvider(provider: string): boolean {
  return /^\d+$/.test(provider) || /^[A-Za-z]+Rules$/.test(provider);
}

const baseTenStats =
  /^(?:AC|Armor Class|(?:Fortitude|Reflex|Will)(?: Defense)?|Passive Insight|Passive Perception)$/i;

const abilityScoreStats = new Set(Object.values(abilityNames));

interface Provenance {
  readonly occurrences: ReadonlyMap<string, CharacterOccurrence>;
  /** Each contributing occurrence's element name, from the stats. */
  readonly names: ReadonlyMap<string, string>;
}

const provenanceCache = new WeakMap<HeaderEvaluation, Provenance>();

function provenance(evaluation: HeaderEvaluation): Provenance {
  const cached = provenanceCache.get(evaluation);
  if (cached !== undefined) return cached;
  const names = new Map<string, string>();
  for (const stat of Object.values(evaluation.stats))
    for (const contribution of stat.contributions)
      names.set(contribution.providerId, contribution.providerName.trim());
  const built = {
    occurrences: new Map(
      (evaluation.occurrences ?? []).map((occurrence) => [
        occurrence.id,
        occurrence,
      ]),
    ),
    names,
  };
  provenanceCache.set(evaluation, built);
  return built;
}

/** An ability bonus element is named after its ability (a race's ability
 *  bonus pick "Wisdom", a level's ability increase pick), which says
 *  nothing in that ability's breakdown. Name it by the nearest selection
 *  above it that has a name of its own: the race, or the level that
 *  granted the pick. (Other stats named after a feat or feature keep the
 *  element's name: there it is the useful one.) */
function selfNamedSourceLabel(
  statName: string,
  contribution: EvaluatedContribution,
  evaluation: HeaderEvaluation | undefined,
): string | undefined {
  if (evaluation === undefined || !abilityScoreStats.has(statName))
    return undefined;
  const key = statName.trim().toLocaleLowerCase();
  if (contribution.providerName.trim().toLocaleLowerCase() !== key)
    return undefined;
  const { occurrences, names } = provenance(evaluation);
  const seen = new Set<string>();
  let parentId = occurrences.get(contribution.providerId)?.parentId;
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    const name = names.get(parentId);
    if (name !== undefined && /^\d+$/.test(name))
      return `Level ${name} increase`;
    if (
      name !== undefined &&
      !coreRulesProvider(name) &&
      name.toLocaleLowerCase() !== key
    )
      return name;
    parentId = occurrences.get(parentId)?.parentId;
  }
  return undefined;
}

export function contributionLabel(
  statName: string,
  contribution: EvaluatedContribution,
  evaluation?: HeaderEvaluation,
): string {
  if (contribution.providerId === "base-abilities") return "Base";
  const provider = contribution.providerName.trim();
  if (!coreRulesProvider(provider))
    return selfNamedSourceLabel(statName, contribution, evaluation) ?? provider;

  const linked = linkedStatLabel(contribution.value);
  if (linked !== undefined) return linked;
  const raw = contribution.value.trim().replace(/^\+/, "");
  if (/^_LEVEL-ONE-HPS$/i.test(raw)) return "Level 1 hit points";
  if (/^_PER-LEVEL-HPS$/i.test(raw)) return `Level ${provider} hit points`;
  if (/^Constitution$/i.test(raw) && statName === "Hit Points")
    return "Constitution score";
  if (baseTenStats.test(statName) && Number(raw) === 10) return "Base";
  if (
    /^\d+$/.test(provider) &&
    abilityScoreStats.has(statName) &&
    /^\d+$/.test(raw)
  )
    return `Level ${provider} increase`;
  // A bare stat name links that stat's total (a passive sense's skill).
  if (/^[A-Za-z][A-Za-z ]*$/.test(raw)) return raw;
  return "Other contribution";
}

function formatContributionValue(label: string, value: number): string {
  if (label === "Base") return String(value);
  return value > 0 ? `+${value}` : String(value);
}

interface TooltipContribution {
  readonly label: string;
  readonly value: string;
}

/** Child rows are indented under the linked stat they explain. */
const nestedIndent = "\u2003";

/** The evaluated stat a core-rules contribution links (`+Insight Misc`,
 *  a passive sense's bare `Insight`), when its applied contributions add
 *  up to the linked amount, so expanding it stays exact. */
function linkedStat(
  contribution: EvaluatedContribution,
  value: number,
  evaluation: HeaderEvaluation | undefined,
): EvaluatedStat | undefined {
  if (evaluation === undefined) return undefined;
  if (!coreRulesProvider(contribution.providerName.trim())) return undefined;
  const name = contribution.value.trim().replace(/^\+/, "");
  if (!/^[A-Za-z][A-Za-z ]*$/.test(name)) return undefined;
  const stat = evaluation.stats[name];
  if (stat === undefined) return undefined;
  const sum = stat.contributions.reduce(
    (total, child) =>
      child.applied ? total + (contributionValue(child) ?? 0) : total,
    0,
  );
  return sum === value ? stat : undefined;
}

function appliedContributions(
  stat: EvaluatedStat,
  evaluation?: HeaderEvaluation,
  depth = 0,
): readonly TooltipContribution[] {
  const rows = stat.contributions.flatMap((contribution) => {
    if (!contribution.applied) return [];
    const value = contributionValue(contribution);
    if (value === undefined) return [];
    const label = contributionLabel(stat.name, contribution, evaluation);
    const row = { label, value: formatContributionValue(label, value) };
    const bucket = label === "Miscellaneous" || label === "Class bonus";
    // Untrained, or an empty bucket: nothing to explain.
    if (value === 0 && (bucket || label === "Trained")) return [];
    const named = label === contribution.value.trim().replace(/^\+/, "");
    const linked =
      depth < 2 && (bucket || named)
        ? linkedStat(contribution, value, evaluation)
        : undefined;
    if (linked === undefined) return [row];
    const children = appliedContributions(linked, evaluation, depth + 1);
    // A bucket (`Insight Misc`, a class bonus) is replaced by its sources;
    // a named stat (a passive sense's skill) heads its own breakdown.
    if (bucket) return children;
    return [
      row,
      ...children.map((child) => ({
        ...child,
        label: `${nestedIndent}${child.label}`,
      })),
    ];
  });
  // The base leads, as on the printed sheet, wherever the rules list it.
  return [
    ...rows.filter((row) => row.label === "Base"),
    ...rows.filter((row) => row.label !== "Base"),
  ];
}

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

/** The tile's conditional bonuses (sheet-model conditionalModifiers, the
 *  page-1 pane's source), each with its condition and source. */
function conditionalLines(
  conditional: readonly ConditionalModifier[],
): string[] {
  return conditional.length === 0
    ? []
    : [
        "Conditional:",
        ...conditional.map(({ text, source }) => `${text} (${source})`),
      ];
}

function statTooltip(
  label: string,
  value: string,
  stat: EvaluatedStat,
  conditional: readonly ConditionalModifier[] = [],
  evaluation?: HeaderEvaluation,
): string {
  return [
    `${label} ${value}`,
    ...collapsePerLevelHitPoints(appliedContributions(stat, evaluation)).map(
      contributionLine,
    ),
    ...conditionalLines(conditional),
  ].join("\n");
}

/** The character's own conditional bonuses by the stat they modify. */
function conditionalByTarget(
  evaluation: HeaderEvaluation | undefined,
): (target: string) => readonly ConditionalModifier[] {
  const modifiers =
    evaluation === undefined
      ? []
      : conditionalModifiers(evaluation.stats, []).filter(
          (modifier) => modifier.surface !== "allies",
        );
  return (target) => modifiers.filter((modifier) => modifier.target === target);
}

function statTile(
  evaluation: HeaderEvaluation | undefined,
  label: string,
  names: string | readonly string[],
  signed = false,
  /** Full name for the tooltip when the tile label is abbreviated. */
  tooltipLabel = label,
  conditional: readonly ConditionalModifier[] = [],
): StatTileValue {
  const stat = evaluatedStat(evaluation, names);
  const value = displayValue(stat, signed);
  return typeof stat?.value === "number"
    ? {
        label,
        value,
        title: statTooltip(tooltipLabel, value, stat, conditional, evaluation),
      }
    : { label, value };
}

function surgeValueTile(
  evaluation: HeaderEvaluation | undefined,
  conditional: readonly ConditionalModifier[] = [],
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
        : appliedContributions(bonus, evaluation).map(contributionLine)),
      ...conditionalLines(conditional),
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
      : {
          title: statTooltip(label, String(score), scoreStat, [], evaluation),
        }),
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
  const conditional = conditionalByTarget(evaluation);
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
        values={defenses.map(([label, names, target]) =>
          statTile(evaluation, label, names, false, label, conditional(target)),
        )}
      />
      <StatGroup
        label="Health"
        tone="health"
        values={[
          statTile(evaluation, "Max HP", "Hit Points"),
          bloodiedTile(evaluation),
          statTile(
            evaluation,
            "Surges",
            "Healing Surges",
            false,
            "Surges",
            conditional("Healing Surges"),
          ),
          surgeValueTile(evaluation, conditional("Healing Surge Value")),
        ]}
      />
      <div className="builder-character-stat-row">
        <StatGroup
          label="Initiative"
          tone="movement"
          values={[
            statTile(
              evaluation,
              "Init",
              "Initiative",
              true,
              "Init",
              conditional("Initiative"),
            ),
          ]}
        />
        <StatGroup
          label="Speed"
          tone="movement"
          values={[
            statTile(
              evaluation,
              "Speed",
              "Speed",
              false,
              "Speed",
              conditional("Speed"),
            ),
          ]}
        />
        <StatGroup
          label="Passive senses"
          tone="abilities"
          values={[
            statTile(
              evaluation,
              "Pass Ins",
              "Passive Insight",
              false,
              "Passive Insight",
            ),
            statTile(
              evaluation,
              "Pass Perc",
              "Passive Perception",
              false,
              "Passive Perception",
            ),
          ]}
        />
      </div>
    </section>
  );
}
