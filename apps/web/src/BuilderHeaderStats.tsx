import type {
  EvaluatedCharacter,
  EvaluatedContribution,
  EvaluatedStat,
} from "@4ecb/rules-engine";

type HeaderEvaluation = Pick<EvaluatedCharacter, "stats">;

const defenses = [
  ["AC", ["AC", "Armor Class"]],
  ["FORT", ["Fortitude Defense", "Fortitude"]],
  ["REF", ["Reflex Defense", "Reflex"]],
  ["WILL", ["Will Defense", "Will"]],
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

function Stat({
  label,
  names,
  evaluation,
  signed = false,
}: {
  readonly label: string;
  readonly names: string | readonly string[];
  readonly evaluation: HeaderEvaluation | undefined;
  readonly signed?: boolean;
}) {
  const stat = evaluatedStat(evaluation, names);
  const value = displayValue(stat, signed);
  const numeric = typeof stat?.value === "number";
  return (
    <div className="builder-header-stat">
      <dt>{label}</dt>
      <dd
        {...(numeric && stat !== undefined
          ? { title: statTooltip(label, value, stat) }
          : {})}
      >
        {value}
      </dd>
    </div>
  );
}

export function BuilderHeaderStats({
  evaluation,
}: {
  readonly evaluation?: HeaderEvaluation | undefined;
}) {
  return (
    <section aria-label="Key statistics" className="builder-header-stats">
      <div className="builder-header-stat-groups">
        <dl
          aria-label="Hit points"
          className="builder-header-stat-cluster builder-header-vitals"
        >
          <Stat evaluation={evaluation} label="HP" names="Hit Points" />
        </dl>
        <dl
          aria-label="Movement"
          className="builder-header-stat-cluster builder-header-movement"
        >
          <Stat evaluation={evaluation} label="SPEED" names="Speed" />
          <Stat
            evaluation={evaluation}
            label="INIT"
            names="Initiative"
            signed
          />
        </dl>
        <dl
          aria-label="Defenses"
          className="builder-header-stat-cluster builder-header-defenses"
        >
          {defenses.map(([label, names]) => (
            <Stat
              key={label}
              evaluation={evaluation}
              label={label}
              names={names}
            />
          ))}
        </dl>
        <dl
          aria-label="Ability scores"
          className="builder-header-stat-cluster builder-header-abilities"
        >
          {abilities.map(([label, name]) => (
            <Stat
              key={name}
              evaluation={evaluation}
              label={label}
              names={name}
            />
          ))}
        </dl>
      </div>
    </section>
  );
}
