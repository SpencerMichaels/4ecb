import {
  PROSE_BONUSES_FIELD,
  PROSE_BONUSES_VERSION,
  type ProseBonus,
  type ProseBonuses,
  type ProseBonusTarget,
  type RuleStatement,
  type SpecificField,
} from "@4ecb/content-domain";

/**
 * Finds the standing situational bonuses a record writes only in its prose,
 * once, at pack build (the stored shape is content-domain
 * `prose-bonuses.ts`). A clause is kept only when all of these hold:
 *
 * - it is a signed amount to a skill, defense, saving throw, initiative,
 *   speed, a kind of check, or a resistance ("+4 item bonus to Diplomacy
 *   checks made against aberrant creatures", "resist 5 fire");
 * - the character gains it: the sentence's subject is "you" ("you gain",
 *   "grants you", "you and allies within 10 squares gain", or a note's bare
 *   "+2 to …"), never an ally, target, summoned creature, mount or rider;
 * - it applies in a standing situation, not after an action: no duration
 *   ("until the end of your next turn", "for the encounter"), no action
 *   trigger ("when you spend an action point", "after"), no choice to make,
 *   and it does not modify another bonus ("instead of", "increases to",
 *   "equal to");
 * - it has a condition, after the targets ("… to find traps") or before the
 *   subject ("While you are standing on stone, you gain …"); a flat prose
 *   bonus without a stat addition is missing content, not a situation;
 *   only checks no stat holds ("Strength checks") are kept flat;
 * - the record's own stat additions do not carry it: a target with a
 *   statadd of the same stat and amount is left out (Fey Senses' flat
 *   Perception statadd and its conditional save statadd), as is a clause a
 *   statadd's condition already spells out.
 */

const SKILLS = [
  "Acrobatics",
  "Arcana",
  "Athletics",
  "Bluff",
  "Diplomacy",
  "Dungeoneering",
  "Endurance",
  "Heal",
  "History",
  "Insight",
  "Intimidate",
  "Nature",
  "Perception",
  "Religion",
  "Stealth",
  "Streetwise",
  "Thievery",
] as const;
const SKILL_ABILITIES: Readonly<Record<string, readonly string[]>> = {
  strength: ["Athletics"],
  constitution: ["Endurance"],
  dexterity: ["Acrobatics", "Stealth", "Thievery"],
  intelligence: ["Arcana", "History", "Religion"],
  wisdom: ["Dungeoneering", "Heal", "Insight", "Nature", "Perception"],
  charisma: ["Bluff", "Diplomacy", "Intimidate", "Streetwise"],
};
const ABILITY = "Strength|Constitution|Dexterity|Intelligence|Wisdom|Charisma";
const DAMAGE_TYPES =
  "acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder";

const ITEM_TYPES = new Set([
  "magic item",
  "gear",
  "weapon",
  "armor",
  "superior implement",
]);
const FEATURE_TYPES = new Set([
  "feat",
  "class feature",
  "racial trait",
  "theme",
  // A background's benefit is its Background Choice ("Lost Kin Benefit"),
  // which only applies when chosen.
  "background choice",
  "paragon path",
  "epic destiny",
  "item set benefit",
]);

const key = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
const MINUS = /[−–]/g;

interface Target {
  readonly target: ProseBonusTarget;
  /** The target as written ("Fortitude defense", "Perception checks"). */
  readonly raw: string;
}

/** One target at `at` (sticky), or undefined. */
const TARGET = new RegExp(
  [
    `(?<death>death\\s+(?:saving\\s+throws?|saves))`,
    `(?<saves>saving\\s+throws?|saves)\\b`,
    `(?<alldef>all\\s+(?:of\\s+your\\s+)?defenses|your\\s+defenses|defenses)\\b`,
    `(?<ac>AC|Armor\\s+Class)\\b`,
    `(?<def>Fortitude|Reflex|Will)(?:\\s+defenses?)?\\b`,
    `(?<init>initiative)(?:\\s+checks?)?\\b`,
    `(?<speed>speed)\\b`,
    `(?<abilskill>(?:${ABILITY})-based\\s+(?:skill\\s+)?checks?)`,
    `(?<abil>(?:${ABILITY})(?:\\s+ability)?\\s+checks?)\\b`,
    `(?<skill>${SKILLS.join("|")})(?:\\s+(?:skill\\s+)?checks?|\\s+skill)?\\b`,
    `(?<generic>(?:all\\s+|any\\s+)?(?:skill\\s+or\\s+ability|ability\\s+or\\s+skill|skill|ability)\\s+checks?|checks)\\b`,
  ].join("|"),
  "iy",
);
const ARTICLE = /(?:(?:your|any|all|the)\s+)?/iy;
const SEPARATOR =
  /\s*(?:,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+|,?\s+as\s+well\s+as\s+)(?:to\s+)?/iy;

function targetAt(
  text: string,
  at: number,
): { targets: Target[]; end: number } | undefined {
  ARTICLE.lastIndex = at;
  const article = ARTICLE.exec(text);
  const start = article ? ARTICLE.lastIndex : at;
  TARGET.lastIndex = start;
  const match = TARGET.exec(text);
  if (!match?.groups) return undefined;
  const raw = text.slice(at, TARGET.lastIndex).trim();
  const g = match.groups;
  const one = (target: ProseBonusTarget) => [{ target, raw }];
  let targets: Target[];
  if (g.death) targets = one({ kind: "death-saves" });
  else if (g.saves) targets = one({ kind: "saving-throws" });
  else if (g.alldef)
    targets = ["AC", "Fortitude", "Reflex", "Will"].map((name) => ({
      target: { kind: "defense", name },
      raw,
    }));
  else if (g.ac) targets = one({ kind: "defense", name: "AC" });
  else if (g.def)
    targets = one({
      kind: "defense",
      name: g.def[0]!.toUpperCase() + g.def.slice(1).toLowerCase(),
    });
  else if (g.init) targets = one({ kind: "initiative" });
  else if (g.speed) targets = one({ kind: "speed" });
  else if (g.abilskill)
    targets = one({ kind: "checks", name: g.abilskill.replace(/\s+/g, " ") });
  else if (g.abil) {
    const ability = /^\w+/.exec(g.abil)![0];
    targets = one({
      kind: "checks",
      name: `${ability[0]!.toUpperCase()}${ability.slice(1).toLowerCase()} checks`,
    });
  } else if (g.skill)
    targets = one({
      kind: "skill",
      name: SKILLS.find((skill) => key(skill) === key(g.skill!))!,
    });
  else {
    const generic = key(g.generic!);
    targets = one({
      kind: "checks",
      name: /skill/.test(generic)
        ? "Skill checks"
        : /ability/.test(generic)
          ? "Ability checks"
          : "Checks",
    });
  }
  return { targets, end: TARGET.lastIndex };
}

/** The target list from `at`: "Arcana, Insight, History, and Dungeoneering
 *  checks", "initiative checks, Perception checks, and to saving throws". */
function targetList(
  text: string,
  at: number,
): { targets: Target[]; end: number } | undefined {
  const first = targetAt(text, at);
  if (first === undefined) return undefined;
  const targets = [...first.targets];
  let end = first.end;
  for (;;) {
    SEPARATOR.lastIndex = end;
    if (!SEPARATOR.exec(text)) break;
    const next = targetAt(text, SEPARATOR.lastIndex);
    if (next === undefined) break;
    targets.push(...next.targets);
    end = next.end;
  }
  // A trailing noun the list shares ("Fortitude, Reflex, and Will defenses").
  const shared = /\s+(?:checks?|defenses?|skill\s+checks)\b/iy;
  shared.lastIndex = end;
  if (shared.exec(text)) end = shared.lastIndex;
  return { targets, end };
}

/** Sentence-level signs that a bonus is not a standing one. */
const NOT_STANDING = [
  // A duration: a triggered or temporary benefit.
  /\buntil\b(?! your next extended rest)|\b(?:end|start) of (?:your|its|the|that|his|her|their|each)\b|\b(?:this|that|next) turn\b|\bsave ends\b|\bfor the (?:rest of the )?encounter\b|\bduring (?:that|the|this) (?:move|turn|attack|charge)\b|\bthe next\b|\bsustain/i,
  // An action or trigger.
  /\bwhen(?:ever)?\s+(?:you|an?|the|it|your|that)\s+(?:\w+\s+){0,3}?(?:use|uses|using|hit|hits|spend|spends|make|makes|score|scores|reduce|reduces|take|takes|miss|misses|drop|drops|charge|charges|shift|shifts|teleport|teleports|attack|attacks|kill|kills|deal|deals|start|starts|end|ends|roll|rolls|regain|regains|activate|invoke|expend|expends|enter|enters|first)\b/i,
  /\bafter\b|\beach time\b|\bthe first time\b|\bas a (?:free|minor|move|standard|immediate|no)\b|\baction points?\b|\bonce per\b|\byou can\b|\byou may\b|\bspend\b/i,
  // A modification of another bonus, or a choice.
  /\binstead\b|\bin place of\b|\bincreases?\b|\bgranted by\b|\bclass bonus\b|\bequal to\b|\b(?:the|this|that) bonus\b|\bdoubles?\b|\bbased on\b|\bchoose\b|\byour choice\b/i,
  // A negation.
  /\b(?:don['’]t|do not|doesn['’]t|does not|no longer|cannot|can['’]t|lose|loses)\b/i,
];

/** Who gains the bonus: the text before the amount ends with the
 *  character as the subject, or there is none (a note's "+2 to …"). */
function grantedToYou(
  prefix: string,
  atStart: boolean,
  continuing: boolean,
): boolean {
  const text = prefix
    .replace(
      /^(?:\s*(?:[*•-]|property:|in addition,|also,|additionally,|finally,|furthermore,))+\s*/i,
      "",
    )
    .trim();
  if (!text) return atStart || continuing;
  if (/^,?\s*(?:and|or|plus|in addition to)(?:\s+an?)?(?:\s+to)?$/i.test(text))
    return continuing;
  if (
    /\b(?:all(?:y|ies)|creatures?|enem(?:y|ies)|targets?|mounts?|steed|riders?|companions?|familiars?|summon\w*|minions?|beasts?|it|its|they|their|he|she|his|her)\b/i.test(
      text,
    ) &&
    !/\byou and\b/i.test(text)
  )
    return false;
  return (
    /(?<!\b(?:to|of|for|from|with|by|near|than|at|against)\s)\byou(?:\s+and\s+[^,.;]*?)?\s+(?:also\s+)?(?:gain|have|get|receive|take)s?\s+(?:an?\s+)?(?:cumulative\s+)?(?:\+|$)/i.test(
      `${text} +`,
    ) ||
    /\b(?:grants?|gives?)\s+you\s+(?:an?\s+)?(?:cumulative\s+)?(?:\+|$)/i.test(
      `${text} +`,
    ) ||
    // An item property's "Gain a +2 item bonus …", "The wearer gains …",
    // "Malaeura grants a +2 bonus …".
    /\bgrants?\s+(?:an?\s+)?$/i.test(`${text} `) ||
    /^(?:(?:the\s+)?(?:owner|wearer|wielder|bearer)\s+)?gains?\s+(?:an?\s+)?(?:permanent\s+|cumulative\s+)?$/i.test(
      `${text} `,
    )
  );
}

/** Where a clause's condition ends: a following clause, a new benefit. */
const CLAUSE_END =
  /,?\s+(?:and|plus)\s+(?:an?\s+)?(?:[+-]\s?\d|\w+\s+bonus|resist)|,?\s+and\s+(?:can|you|deal|deals|need|ignore|gain|gains|take|takes|is|are|have|has)\b|,\s+(?:you|and you|but)\b|,\s+and\s+(?:the|your|its)\s+(?:[\w'’]+\s+){1,3}?(?:is|are|takes?|becomes?|deals?|has|have)\b|[;:]/i;
/** "… to checks made to escape a grab and to saving throws against …": a
 *  second target list sharing the amount. */
const AND_TO = /,?\s+(?:and|or)\s+to\s+/gi;

const AMOUNT =
  /([+-]\s?\d+)(?:\s+(?!bonus\b|penalty\b|to\b|on\b)([a-z]+))?(?:\s+(bonus|penalty))?\s+(?:to|on)\s+/gi;
const RESIST = new RegExp(
  `\\b(?:resist(?:ance)?\\s+(\\d+)\\s+(?:to\\s+)?(all\\s+damage|${DAMAGE_TYPES})(?:\\s+damage)?)((?:\\s*(?:,|,?\\s+and)\\s+(?:resist\\s+)?\\d+\\s+(?:${DAMAGE_TYPES}))*)`,
  "gi",
);

interface StatAdd {
  readonly stat: string;
  readonly value: number | undefined;
  readonly type: string;
  readonly condition: string;
}

function statKey(name: string): string {
  const n = key(name)
    .replace(/ misc$/, "")
    .replace(/ defense$/, "");
  // A skill statadd whose name runs on ("Athletics checks to climb").
  const skill = SKILLS.find(
    (skill) =>
      n === key(skill) ||
      new RegExp(`^${key(skill)} (?:skill )?checks?\\b`).test(n),
  );
  if (skill) return key(skill);
  if (n === "armor class") return "ac";
  if (/^(?:saving throws?|saves)$/.test(n)) return "saving throws";
  if (/^death (?:saving throws?|saves)$/.test(n)) return "death saving throws";
  if (/^initiative/.test(n)) return "initiative";
  const resist = /^resist\s*:\s*(.+)$/.exec(n);
  if (resist) return `resist:${resist[1]!.trim()}`;
  return n;
}

function targetStatKeys(target: ProseBonusTarget): string[] {
  switch (target.kind) {
    case "skill":
    case "defense":
      return [key(target.name)];
    case "initiative":
      return ["initiative"];
    case "speed":
      return ["speed"];
    case "saving-throws":
      return ["saving throws"];
    case "death-saves":
      return ["death saving throws"];
    case "resist":
      return [`resist:${key(target.name).replace(/ damage$/, "")}`];
    case "checks": {
      const ability = /^(\w+)-based (?:skill )?checks?$/i.exec(target.name);
      return ability
        ? (SKILL_ABILITIES[key(ability[1]!)] ?? []).map(key)
        : target.name === "Skill checks"
          ? SKILLS.map(key)
          : [`check:${key(target.name)}`];
    }
  }
}

/** A statadd's bonus type and the prose's name the same type: "Racial
 *  Trait" and "racial", "Magic Item" and "item", "Feat" and "feat". */
function sameType(statadd: string, prose: string): boolean {
  const words = (text: string) =>
    key(text)
      .split(" ")
      .filter((word) => !/^(?:magic|trait|bonus)$/.test(word));
  const [a, b] = [words(statadd), words(prose)];
  return a.some((word) => b.includes(word));
}

function covered(
  target: ProseBonusTarget,
  amount: number,
  bonusType: string | undefined,
  condition: string,
  clauseText: string,
  statadds: readonly StatAdd[],
): boolean {
  const stats = targetStatKeys(target);
  // The same amount and type ("+2 item bonus" is not a +2 enhancement
  // statadd), or one the record routes through a stat of its own ("Arena
  // Training" +1 by tier, then AC "+Arena Training").
  const carrying = statadds.filter(
    (add) =>
      add.value === undefined ||
      (add.value === amount &&
        (!bonusType || !add.type || sameType(add.type, bonusType))),
  );
  const carried = stats.filter((stat) =>
    carrying.some((add) => add.stat === stat),
  );
  // "+2 item bonus to skill checks" written as one statadd per skill,
  // however many the record spells out.
  if (
    stats.length > 0 &&
    (carried.length === stats.length ||
      (target.kind === "checks" &&
        target.name === "Skill checks" &&
        carried.length * 2 > stats.length))
  )
    return true;
  // A statadd whose condition swallowed this clause ("against a quarry
  // marked by you, and you gain a +5 bonus to Perception checks to …").
  if (
    statadds.some(
      (add) => add.condition && key(add.condition).includes(key(clauseText)),
    )
  )
    return true;
  // Legacy writes a conditional resistance as a stat of its own
  // ("resist:tieflings", "resist:ranged").
  if (
    target.kind === "resist" &&
    carrying.some((add) => add.stat.startsWith("resist:"))
  )
    return true;
  // A generic check bonus carried as skill statadds with its condition
  // ("+5 to checks to escape a grab": Athletics and Acrobatics "to escape a
  // grab"), or a clause a statadd's condition swallowed.
  const wanted = key(condition);
  return (
    wanted.length > 0 &&
    statadds.some(
      (add) =>
        add.condition &&
        (wanted.includes(key(add.condition)) ||
          key(add.condition).includes(wanted)) &&
        (target.kind === "checks" || add.value === amount),
    )
  );
}

const lowerFirst = (text: string) =>
  text.replace(/^[A-Z](?![A-Z])/, (letter) => letter.toLowerCase());
const tidy = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[\s,]+$/, "")
    .trim();

function groupKind(target: ProseBonusTarget): string {
  return target.kind === "death-saves" ? "saving-throws" : target.kind;
}

const listed = (names: readonly string[]) =>
  names.length < 2
    ? names.join("")
    : names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;

/** The prose bonuses in one sentence. */
function sentenceBonuses(
  sentence: string,
  statadds: readonly StatAdd[],
): ProseBonus[] {
  if (NOT_STANDING.some((pattern) => pattern.test(sentence))) return [];
  // A leading condition, moved after the bonus: "While you are standing on
  // stone or earth, you gain …".
  const leading =
    /^\s*(?:[*•-]\s*)?((?:while|when|if|as long as|whenever|for each)\s+[^,]+),\s*/i.exec(
      sentence,
    );
  const leadingCondition = leading ? tidy(leading[1]!) : "";
  const body = leading ? sentence.slice(leading[0].length) : sentence;
  const result: ProseBonus[] = [];
  const clauses: {
    at: number;
    end: number;
    amountText: string;
    amount: number;
    bonusType?: string;
    word: string;
    targets: Target[];
    listEnd: number;
    /** A second target list sharing an earlier clause's amount. */
    continuation?: true;
  }[] = [];
  for (const match of body.matchAll(AMOUNT)) {
    const list = targetList(body, match.index + match[0].length);
    if (list === undefined) continue;
    clauses.push({
      at: match.index,
      end: list.end,
      amountText: match[1]!.replace(/\s+/g, ""),
      amount: Number(match[1]!.replace(/\s+/g, "")),
      ...(match[2] === undefined || /^(?:a|an)$/i.test(match[2])
        ? {}
        : { bonusType: match[2].toLocaleLowerCase() }),
      word: match[3] ?? "",
      targets: list.targets,
      listEnd: list.end,
    });
  }
  for (const match of body.matchAll(RESIST)) {
    const names = [
      match[2]!,
      ...[
        ...(match[3] ?? "").matchAll(new RegExp(`(${DAMAGE_TYPES})`, "gi")),
      ].map((m) => m[1]!),
    ];
    const amounts = [
      Number(match[1]),
      ...[...(match[3] ?? "").matchAll(/\d+/g)].map((m) => Number(m[0])),
    ];
    if (new Set(amounts).size > 1) continue;
    clauses.push({
      at: match.index,
      end: match.index + match[0].length,
      amountText: "",
      amount: amounts[0]!,
      word: "resist",
      targets: names.map((name) => ({
        target: {
          kind: "resist",
          name: key(name).replace(/\s+/g, " "),
        },
        raw: name,
      })),
      listEnd: match.index + match[0].length,
    });
  }
  clauses.sort((a, b) => a.at - b.at);
  let previousEnd = 0;
  let accepted = false;
  for (let index = 0; index < clauses.length; index++) {
    const clause = clauses[index]!;
    if (clause.at < previousEnd) continue;
    const prefix = body.slice(previousEnd, clause.at);
    const atStart = previousEnd === 0;
    const next = clauses[index + 1]?.at ?? body.length;
    // The connector before the next clause ("… to speed and a +1 …") is
    // that clause's prefix, not this one's condition.
    let tail = body
      .slice(clause.listEnd, next)
      .replace(
        /,?\s*(?:(?:and|plus|as well as|in addition to)\s+)?(?:an?\s+)?$/i,
        "",
      );
    const cut = CLAUSE_END.exec(tail);
    if (cut) tail = tail.slice(0, cut.index);
    // "… to checks made to escape a grab and to saving throws against …".
    for (const andTo of tail.matchAll(AND_TO)) {
      const from = clause.listEnd + andTo.index + andTo[0].length;
      const list = targetList(body, from);
      if (list === undefined) continue;
      clauses.splice(index + 1, 0, {
        ...clause,
        at: from,
        end: list.end,
        targets: list.targets,
        listEnd: list.end,
        continuation: true,
      });
      tail = tail.slice(0, andTo.index);
      break;
    }
    const remainder = tidy(tail)
      .replace(/^in addition to\b.*$/i, "")
      // A repeated noun ("Arcana checks and History history checks").
      .replace(
        new RegExp(
          `^(?:(?:${SKILLS.join("|")})\\s+)?(?:skill\\s+)?checks?$`,
          "i",
        ),
        "",
      );
    previousEnd = clause.listEnd + tail.length;
    const end = previousEnd;
    accepted = grantedToYou(prefix, atStart, accepted);
    if (!accepted) continue;
    // An anaphor names the skill elsewhere ("checks with that skill",
    // "made for this purpose"), the stat is another creature's ("the speed
    // of any mount"), or the condition is a level ("at 21st level").
    if (
      /^(?:with|using|for|in)\s+(?:that|this|these|those|the chosen|the same)\b|^of\b|\b(?:this|that|these|those) (?:purpose|way|power|skill|check|state|form)s?\b|^at \d+(?:st|nd|rd|th) level\b/i.test(
        remainder,
      )
    )
      continue;
    const condition = tidy(
      [remainder, leadingCondition && lowerFirst(leadingCondition)]
        .filter(Boolean)
        .join(" "),
    );
    // Without a condition only checks no stat holds stay ("+4 item bonus
    // to Athletics checks and Strength ability checks": the Strength checks).
    const statless = ({ target }: Target) =>
      target.kind === "checks" && target.name !== "Checks";
    const uncovered = clause.targets.filter(
      (entry) =>
        (condition !== "" || statless(entry)) &&
        !covered(
          entry.target,
          clause.amount,
          clause.bonusType,
          remainder,
          tidy(body.slice(clause.at, end)),
          statadds,
        ),
    );
    if (uncovered.length === 0) continue;
    const kinds = [
      ...new Set(uncovered.map(({ target }) => groupKind(target))),
    ];
    for (const kind of kinds) {
      const group = uncovered.filter(
        ({ target }) => groupKind(target) === kind,
      );
      const whole =
        !clause.continuation &&
        group.length === clause.targets.length &&
        kinds.length === 1;
      const head =
        clause.word === "resist"
          ? ""
          : `${clause.amountText}${clause.bonusType ? ` ${clause.bonusType}` : ""}${clause.word ? ` ${clause.word}` : ""} to `;
      const written = whole
        ? tidy(body.slice(clause.at, end))
        : tidy(
            clause.word === "resist"
              ? `resist ${clause.amount} ${listed([...new Set(group.map(({ raw }) => raw))])} ${remainder}`
              : `${head}${listed([...new Set(group.map(({ raw }) => raw))])} ${remainder}`,
          );
      const text = tidy(
        [
          written.replace(/^resistance\b/i, "resist"),
          leadingCondition && lowerFirst(leadingCondition),
        ]
          .filter(Boolean)
          .join(" "),
      );
      result.push({
        text,
        amount: clause.amount,
        ...(clause.bonusType === undefined
          ? {}
          : { bonusType: clause.bonusType }),
        targets: group.map(({ target }) => target),
      });
    }
  }
  return result;
}

const field = (specifics: readonly SpecificField[], name: string) =>
  specifics
    .filter((specific) => key(specific.name) === name)
    .map((specific) => specific.value.trim())
    .filter(Boolean);

/** The record's own prose, in the order it is read: an item's properties
 *  (not its powers); a feature's full text (or benefit), then its one-line
 *  note, read only when the full text gave nothing (a note that is the only
 *  statement of the benefit beside flavor text). */
function proseOf(
  type: string,
  specifics: readonly SpecificField[],
  description: string,
): string[][] {
  if (ITEM_TYPES.has(key(type)))
    return [
      [
        ...field(specifics, "property"),
        // A description's own property text, before any power.
        description.split(
          /\n\s*(?:Power|Enhancement|Critical)\b[^\n]*?[:(]/i,
        )[0]!,
      ].filter((text) => text.trim()),
    ];
  const full =
    description.trim() ||
    field(specifics, "full text")[0] ||
    field(specifics, "benefit")[0] ||
    "";
  return [[full], field(specifics, "short description")].map((texts) =>
    texts.filter(Boolean),
  );
}

/** The prose bonuses of one record; exported for the field and the tests. */
export function parseProseBonuses(
  type: string,
  specifics: readonly SpecificField[],
  description: string,
  rules: readonly RuleStatement[],
): ProseBonus[] {
  const kind = key(type);
  // A background's Benefit is usually one of its choices (a Background
  // Choice "… Benefit", parsed on its own); a background that implements
  // its benefit itself (statadds, modifies: "Shifter - The Dalelands") has
  // it always.
  const inherentBackground =
    kind === "background" &&
    rules.some(
      (rule) =>
        !(
          key(rule.name) === "grant" &&
          rule.attributes.some(
            (a) =>
              key(a.name) === "type" &&
              key(a.value) === "background association",
          )
        ),
    );
  if (!ITEM_TYPES.has(kind) && !FEATURE_TYPES.has(kind) && !inherentBackground)
    return [];
  const statadds: StatAdd[] = rules
    .filter((rule) => key(rule.name) === "statadd")
    .map((rule) => {
      const attribute = (name: string) =>
        rule.attributes.find((a) => key(a.name) === name)?.value ?? "";
      const value = attribute("value").trim().replace(MINUS, "-");
      return {
        stat: statKey(attribute("name")),
        value: /^[+-]?\d+$/.test(value) ? Number(value) : undefined,
        type: attribute("type").trim(),
        condition: attribute("condition").trim(),
      };
    });
  const result: ProseBonus[] = [];
  const seen = new Set<string>();
  for (const texts of proseOf(type, specifics, description)) {
    if (result.length > 0) break;
    for (const text of texts)
      for (const sentence of text
        .replace(MINUS, "-")
        .split(/(?<=[.!?])\s+(?=[A-Z*•(])|\n+/))
        for (const bonus of sentenceBonuses(
          sentence.replace(/[.!?]\s*$/, ""),
          statadds,
        )) {
          const identity = key(bonus.text);
          if (seen.has(identity)) continue;
          seen.add(identity);
          result.push(bonus);
        }
  }
  return result;
}

/** The record's {@link PROSE_BONUSES_FIELD}, appended after its own fields,
 *  when its prose has any. */
export function proseBonusesField(
  type: string,
  specifics: readonly SpecificField[],
  description: string,
  rules: readonly RuleStatement[],
  ordinal: number,
): SpecificField | undefined {
  const bonuses = parseProseBonuses(type, specifics, description, rules);
  if (bonuses.length === 0) return undefined;
  const value: ProseBonuses = { version: PROSE_BONUSES_VERSION, bonuses };
  return {
    name: PROSE_BONUSES_FIELD,
    value: JSON.stringify(value),
    extraAttributes: [],
    ordinal,
  };
}
