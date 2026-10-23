import type { CharacterOccurrence, EvaluatedStat } from "@4ecb/rules-engine";

/**
 * "Remember in play" deduplication (owner decision, 2026-10-23): a reminder
 * is dropped when everything it would remind about is already shown in a
 * more specific place — the Conditional modifiers pane (conditional stat
 * bonuses, resistances, saves), a power card's reminder lines or the
 * companion card. Sources are matched by provenance: an evaluated
 * contribution's provider resolves to the granting definition (a feature's
 * entity id) or inventory holding (an item's id). Only entries without any
 * provenance fall back to the provider's name.
 *
 * A reminder that covers more than those entries (a bonus feat, a free
 * action, other benefits nothing else represents) stays: see
 * {@link reminderCovered}.
 */

const key = (value: string) => value.trim().toLocaleLowerCase();

export const definitionSourceKey = (definitionId: string) =>
  `def:${key(definitionId)}`;
export const inventorySourceKey = (inventoryId: string) =>
  `inv:${key(inventoryId)}`;
export const nameSourceKey = (name: string) => `name:${key(name)}`;

/** Resolves an evaluated provenance id (a contribution id, or a provider id
 *  such as a special card's textstring) to its source keys: the granting
 *  definition and, for an item, its inventory holding. */
export function provenanceSourceResolver(
  stats: Readonly<Record<string, EvaluatedStat>>,
  occurrences: readonly CharacterOccurrence[],
): (provenanceId: string | undefined) => readonly string[] {
  const providers = new Map<string, string>();
  for (const stat of Object.values(stats))
    for (const contribution of stat.contributions)
      providers.set(contribution.id, contribution.providerId);
  const definitions = new Map(
    occurrences.map((occurrence) => [occurrence.id, occurrence.definitionId]),
  );
  return (provenanceId) => {
    if (provenanceId === undefined || !provenanceId.trim()) return [];
    const provider = providers.get(provenanceId) ?? provenanceId;
    const definition = definitions.get(provider);
    const holding = /^(.+):definition:\d+$/.exec(provider)?.[1];
    const keys = [
      ...(definition === undefined ? [] : [definitionSourceKey(definition)]),
      ...(holding === undefined ? [] : [inventorySourceKey(holding)]),
    ];
    return keys.length ? keys : [`prov:${key(provider)}`];
  };
}

/** Game terms a reminder can name. Each one a reminder mentions must also
 *  appear in the entries that represent it, or the reminder says more. */
const TERMS: readonly (readonly [string, RegExp])[] = [
  [
    "action",
    /\b(?:free|minor|move|standard|immediate|opportunity|no) actions?\b/i,
  ],
  ["interrupt", /\binterrupt/i],
  ["reaction", /\breaction/i],
  ["shift", /\bshift/i],
  ["teleport", /\bteleport/i],
  ["slide", /\bslid(?:e|es|ing)\b/i],
  ["push", /\bpush/i],
  ["pull", /\bpull/i],
  ["fly", /\bfl(?:y|ies|ying|ight)\b/i],
  ["climb", /\bclimb/i],
  ["swim", /\bswim/i],
  ["jump", /\bjump/i],
  ["squeeze", /\bsqueez/i],
  ["charge", /\bcharg(?:e|es|ed|ing)\b/i],
  ["run", /\brun(?:s|ning)?\b/i],
  ["reroll", /\bre-?roll|\broll(?:s)? twice\b/i],
  ["sheathe", /\bsheath/i],
  ["draw", /\bdraw/i],
  ["stow", /\bstow/i],
  ["temporary hit points", /\btemporary hit points\b|\btemp(?:orary)? hp\b/i],
  ["regain", /\bregain/i],
  ["concealment", /\bconceal/i],
  ["cover", /\bcover\b/i],
  ["invisible", /\binvisib/i],
  ["combat advantage", /\bcombat advantage\b/i],
  ["mark", /\bmark(?:s|ed|ing)?\b/i],
  [
    "condition",
    /\b(?:prone|dazed|stunned|slowed|immobilized|weakened|blinded|deafened|restrained|dominated|unconscious|grabbed|helpless|petrified)\b/i,
  ],
  ["immune", /\bimmun/i],
  ["resist", /\bresist/i],
  ["vulnerable", /\bvulnerab/i],
  ["feat", /\bfeats?\b/i],
  ["proficiency", /\bproficien/i],
  ["training", /\btrain(?:ed|ing)\b/i],
  ["power", /\bpowers?\b/i],
  ["ritual", /\britual/i],
  ["language", /\blanguage/i],
  ["AC", /\bAC\b|\barmor class\b/],
  ["fortitude", /\bfortitude\b/i],
  ["reflex", /\breflex\b/i],
  ["will", /\bWill\b/],
  ["defenses", /\bdefenses\b/i],
  ["speed", /\bspeed\b/i],
  ["initiative", /\binitiative\b/i],
  ["damage", /\bdamage\b/i],
  ["save", /\bsav(?:e|es|ing throws?)\b/i],
  ["hit points", /\bhit points\b/i],
  ["healing surge", /\bhealing surges?\b/i],
  ["bull rush", /\bbull rush\b/i],
  [
    "skill",
    /\b(?:acrobatics|arcana|athletics|bluff|diplomacy|dungeoneering|endurance|heal|history|insight|intimidate|nature|perception|religion|stealth|streetwise|thievery)\b/i,
  ],
];

/** Level-scaling notes restate the represented bonus at higher levels:
 *  "(+2 at 11th level, +3 at 21st)", "The bonus increases to +2 at 11th
 *  level and +3 at 21st level." */
function withoutLevelScaling(text: string): string {
  return (
    text
      // Loadout conditions are the power cards' own: a weapon bonus's line
      // shows only on the powers it applies to.
      .replace(
        /\b(?:while|when|if)\s+(?:you\s+(?:are\s+)?)?(?:using|wearing|wielding|equipped)\b[^.;]*/gi,
        " ",
      )
      .replace(/\([^()]*\b\d+(?:st|nd|rd|th)\b[^()]*\)/gi, " ")
      .split(/(?<=[.!?])\s+/)
      .filter(
        (sentence) =>
          !/\bincreases?\b[^.!?]*\b\d+(?:st|nd|rd|th)\b/i.test(sentence),
      )
      .join(" ")
  );
}

function amounts(text: string): string[] {
  const result: string[] = [];
  for (const match of text.matchAll(
    /([+-])\s*(\d+(?:d\d+)?)\b|\b(\d+d\d+)\b|\b(?:resist(?:ance)?|vulnerab(?:le|ility))\s+(\d+)\b/gi,
  ))
    result.push(
      match[2] !== undefined
        ? `${match[1]}${match[2].toLocaleLowerCase()}`
        : match[3] !== undefined
          ? `+${match[3].toLocaleLowerCase()}`
          : `resist ${match[4]}`,
    );
  return result;
}

const STOPWORDS = new Set(
  `a an the to of and or you your it its is are be can may when whenever while
  if on in at for with by as that this than from into gain gains get gets
  bonus has have his her their they any each one all no not none make makes
  also instead until per against within which who whose do does don't
  there them then so such only same other`.split(/\s+/),
);

/** A clause's significant words, crudely stemmed ("allies" ~ "ally",
 *  "charging" ~ "charge"). */
function words(text: string): Set<string> {
  return new Set(
    (text.toLocaleLowerCase().match(/[a-z][a-z'-]*/g) ?? [])
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
      .map((word) =>
        word
          .replace(/(?:ies|y)$/, "i")
          .replace(/(?:ing|ed|es|s)$/, "")
          .slice(0, 5),
      ),
  );
}

/** Each clause must be mostly said by the entries: a reminder clause about
 *  something else ("Dilettante power becomes at-will") shares few words. */
const CLAUSE_COVERAGE = 0.6;

/**
 * Whether the more specific entries say everything the reminder does: every
 * amount it names appears in them (as many times), and every game term it
 * names (an action type, movement, a condition, a stat, a feat or power
 * grant) appears in at least one of them, and most significant words of each
 * of its clauses appear in them. Level-scaling notes and loadout conditions
 * are ignored.
 * With no representing entries, nothing is covered.
 */
export function reminderCovered(
  reminder: string,
  represented: readonly string[],
): boolean {
  const entries = [...new Set(represented.map((text) => text.trim()))].filter(
    Boolean,
  );
  if (entries.length === 0) return false;
  const text = withoutLevelScaling(reminder);
  const available = entries.flatMap(amounts);
  for (const amount of amounts(text)) {
    const index = available.indexOf(amount);
    if (index < 0) return false;
    available.splice(index, 1);
  }
  const joined = entries.join("\n");
  if (
    !TERMS.every(([, pattern]) => !pattern.test(text) || pattern.test(joined))
  )
    return false;
  const vocabulary = words(joined);
  return text
    .split(/[.;!?](?:\s+|$)|\n+/)
    .map(words)
    .filter((clause) => clause.size > 0)
    .every(
      (clause) =>
        [...clause].filter((word) => vocabulary.has(word)).length >=
        CLAUSE_COVERAGE * clause.size,
    );
}
