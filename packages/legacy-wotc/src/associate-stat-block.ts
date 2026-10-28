import {
  ASSOCIATE_STAT_BLOCK_FIELD,
  ASSOCIATE_STAT_BLOCK_VERSION,
  type AssociateAbilityName,
  type AssociateAttack,
  type AssociateDamage,
  type AssociateDamageStep,
  type AssociateDamageTerm,
  type AssociateDefenseName,
  type AssociateDefenses,
  type AssociateDefenseValues,
  type AssociateEntry,
  type AssociateHitPoints,
  type AssociateLine,
  type AssociateMasterCheck,
  type AssociatePower,
  type AssociateStatBlock,
  type SpecificField,
} from "@4ecb/content-domain";

/**
 * Parses an Associate record's description, a monster-style stat block
 * written relative to the master, into an {@link AssociateStatBlock} (D107).
 * It runs once, at pack build. It recognizes the spellings the content uses
 * (two-column lines split by tabs, "F"/"•"/"*" usage separators, power-icon
 * letters, "Level 21:" damage steps) and reports every line it cannot place
 * as an issue, which the import turns into a pack diagnostic.
 */
export interface AssociateStatBlockParse {
  readonly block?: AssociateStatBlock;
  readonly issues: readonly string[];
}

const ABILITY_ABBREVIATIONS: Readonly<Record<string, AssociateAbilityName>> = {
  str: "Strength",
  con: "Constitution",
  dex: "Dexterity",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};
const ABILITY_NAMES = Object.values(ABILITY_ABBREVIATIONS);
const ABILITY_PATTERN = ABILITY_NAMES.join("|");

const SIZES = /^(tiny|small|medium|large|huge|gargantuan)\s+(.*)$/i;
const SECTION_NAMES = new Map(
  [
    "Traits",
    "Standard",
    "Minor",
    "Move",
    "Triggered",
    "Free",
    "Opportunity",
    "Immediate Interrupt",
    "Immediate Reaction",
  ].map((name) => [name.toLocaleLowerCase(), name]),
);
const LINE_LABEL =
  /^(Attack|Hit|Miss|Effect|Trigger|Special|Requirement|Aftereffect|Target|Targets|Sustain (?:Minor|Move|Standard)|Level (\d+))(\s*\([^)]*\))?\s*:\s*(.*)$/i;
const SENSE =
  /\b(?:low-light vision|darkvision|tremorsense|blindsight|truesight|vision)\b/i;
const DEFENSE_VALUES =
  /AC\s+(\d+)\s*,\s*Fortitude\s+(\d+)\s*,\s*Reflex\s+(\d+)\s*,\s*Will\s+(\d+)/i;
const ADD_LEVEL = /\(\s*add your level to each defense\s*\)/i;
const DEFENSE_NAMES: Readonly<Record<string, AssociateDefenseName>> = {
  ac: "ac",
  fortitude: "fortitude",
  reflex: "reflex",
  will: "will",
};

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
const zeroDefenses = (): Record<AssociateDefenseName, number> => ({
  ac: 0,
  fortitude: 0,
  reflex: 0,
  will: 0,
});

function defenseValues(match: RegExpExecArray): AssociateDefenseValues {
  return {
    ac: Number(match[1]),
    fortitude: Number(match[2]),
    reflex: Number(match[3]),
    will: Number(match[4]),
  };
}

/** "equal to yours +2" → { bonus: 2 }. */
function masterCheck(text: string): AssociateMasterCheck | undefined {
  const match = /^equal to yours\s*(?:([+-])\s*(\d+))?\s*$/i.exec(text.trim());
  if (match === null) return undefined;
  const value = Number(match[2] ?? 0);
  return { bonus: match[1] === "-" ? -value : value };
}

function hitPoints(text: string): AssociateHitPoints | undefined {
  const value = collapse(text).toLocaleLowerCase();
  if (value === "your bloodied value") return { kind: "master-bloodied" };
  if (value === "your healing surge value")
    return { kind: "master-surge-value" };
  return /^\d+$/.test(value)
    ? { kind: "fixed", value: Number(value) }
    : undefined;
}

/** "your defenses (+2 to AC and Fortitude), not including …". */
function masterDefenses(
  text: string,
): { bonus: AssociateDefenseValues; note?: string } | undefined {
  const match = /^your defenses\b(.*)$/i.exec(text.trim());
  if (match === null) return undefined;
  let rest = match[1] ?? "";
  const bonus = zeroDefenses();
  const all = /^\s*\+\s*(\d+)/.exec(rest);
  if (all !== null) {
    for (const name of Object.keys(bonus) as AssociateDefenseName[])
      bonus[name] = Number(all[1]);
    rest = rest.slice(all[0].length);
  }
  const some =
    /\(\s*\+(\d+) to ([A-Za-z ,]+?)\)|with a \+(\d+) bonus to ([A-Za-z ,]+?)(?= and not\b|,|$)/i.exec(
      rest,
    );
  if (some !== null) {
    const value = Number(some[1] ?? some[3]);
    for (const name of (some[2] ?? some[4] ?? "").split(/\s*(?:,|\band\b)\s*/))
      if (name.trim() !== "") {
        const defense = DEFENSE_NAMES[name.trim().toLocaleLowerCase()];
        if (defense === undefined) return undefined;
        bonus[defense] += value;
      }
  }
  const note = /not including any temporary bonuses or penalties/i.exec(
    rest,
  )?.[0];
  return note === undefined ? { bonus } : { bonus, note };
}

/** Splits at semicolons outside parentheses ("fly 6 (hover; altitude limit 1)"). */
function splitOutsideParentheses(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "(") depth++;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === ";" && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Normalizes "land 6 , fly 8 " to "6, fly 8". */
function speedText(text: string): string {
  return collapse(text)
    .replace(/\s+,/g, ",")
    .replace(/^land\s+/i, "");
}

function abilityLine(
  line: string,
): [AssociateAbilityName, number][] | undefined {
  if (!/^\s*(?:Str|Con|Dex|Int|Wis|Cha)\b/i.test(line)) return undefined;
  const scores = [
    ...line.matchAll(/\b(Str|Con|Dex|Int|Wis|Cha)\b\s*:?\s*(\d+)/gi),
  ].map(([, name, score]): [AssociateAbilityName, number] => [
    ABILITY_ABBREVIATIONS[(name ?? "").toLocaleLowerCase()]!,
    Number(score),
  ]);
  return scores.length === 0 ? undefined : scores;
}

function damageTerm(
  text: string,
): { term: AssociateDamageTerm; rest: string } | undefined {
  const value = text.trim();
  const dice = /^(\d+d\d+)\b/i.exec(value);
  if (dice !== null)
    return {
      term: { kind: "dice", dice: (dice[1] ?? "").toLocaleLowerCase() },
      rest: value.slice(dice[0].length),
    };
  const halfLevel = /^one-half your level\b/i.exec(value);
  if (halfLevel !== null)
    return {
      term: { kind: "half-level" },
      rest: value.slice(halfLevel[0].length),
    };
  const level = /^your level\b/i.exec(value);
  if (level !== null)
    return { term: { kind: "level" }, rest: value.slice(level[0].length) };
  const highest = /^(?:your )?highest ability modifier\b/i.exec(value);
  if (highest !== null)
    return {
      term: { kind: "highest-ability" },
      rest: value.slice(highest[0].length),
    };
  const ability = new RegExp(
    `^your (${ABILITY_PATTERN})(?: or (${ABILITY_PATTERN}))? modifier\\b`,
    "i",
  ).exec(value);
  if (ability !== null) {
    const abilities = [ability[1], ability[2]].flatMap((name) => {
      const found = ABILITY_NAMES.find(
        (candidate) =>
          candidate.toLocaleLowerCase() === name?.toLocaleLowerCase(),
      );
      return found === undefined ? [] : [found];
    });
    return {
      term: { kind: "ability", abilities },
      rest: value.slice(ability[0].length),
    };
  }
  const flat = /^(\d+)\b/.exec(value);
  if (flat !== null)
    return {
      term: { kind: "flat", value: Number(flat[1]) },
      rest: value.slice(flat[0].length),
    };
  return undefined;
}

/**
 * The damage expression before "damage": terms joined by "+", then damage
 * type words. Undefined when the hit line does not open with one ("Ongoing
 * 15 fire damage", "The target is dazed").
 */
export function parseAssociateDamage(
  text: string,
): { damage: AssociateDamage; rest: string } | undefined {
  const at = /\bdamage\b/i.exec(text);
  if (at === null) return undefined;
  const expression = text.slice(0, at.index).trim();
  if (expression === "") return undefined;
  const parts = expression.split(/\s*\+\s*/);
  const terms: AssociateDamageTerm[] = [];
  let damageType: string | undefined;
  for (const [index, part] of parts.entries()) {
    const parsed = damageTerm(part);
    if (parsed === undefined) return undefined;
    terms.push(parsed.term);
    const trailing = parsed.rest.trim();
    if (trailing === "") continue;
    if (index !== parts.length - 1 || !/^[a-z][a-z ,]*$/.test(trailing))
      return undefined;
    damageType = trailing;
  }
  return {
    damage: damageType === undefined ? { terms } : { terms, damageType },
    rest: text.slice(at.index + at[0].length),
  };
}

function parseAttack(text: string): AssociateAttack {
  const split = text.lastIndexOf(";");
  const range = collapse(split < 0 ? text : text.slice(0, split));
  const rest = split < 0 ? "" : text.slice(split + 1).trim();
  const level = /^your level\s*\+\s*(\d+)\s+vs\.?\s+([A-Za-z]+)/i.exec(rest);
  if (level !== null)
    return {
      range,
      bonus: { kind: "level", plus: Number(level[1]) },
      defense: level[2] ?? "",
    };
  const fixed = /^\+\s*(\d+)\s+vs\.?\s+([A-Za-z]+)/i.exec(rest);
  if (fixed !== null)
    return {
      range,
      bonus: { kind: "fixed", value: Number(fixed[1]) },
      defense: fixed[2] ?? "",
    };
  return { range };
}

interface ParsedTitle {
  readonly name: string;
  readonly keywords?: string;
  readonly usage?: string;
  readonly aura?: number;
}

function parseTitle(line: string): ParsedTitle {
  // Power-icon letters (M melee, R ranged, C close, O aura, m basic melee).
  let text = collapse(line).replace(/^[MCRAOm]\s+(?=[A-Z])/, "");
  let aura: number | undefined;
  const auraMatch = /\s*\bAura\s+(\d+)\s*$/i.exec(text);
  if (auraMatch !== null) {
    aura = Number(auraMatch[1]);
    text = text.slice(0, auraMatch.index);
  }
  // "F" is the content's rendering of the usage bullet.
  text = text.replace(/\s+F\s+/g, " • ").replace(/\s+F$/, "");
  const [head = "", ...usageParts] = text.split(/\s*[•*]\s*/);
  let name = head;
  let usage: string | undefined = usageParts.join(" • ").trim() || undefined;
  if (usage === undefined) {
    const trailing =
      /\s+((?:At-Will|Encounter|Daily|Recharge\b).*)$/i.exec(name) ??
      /\s*\((\d+\/round)\)\s*$/i.exec(name);
    if (trailing !== null) {
      usage = trailing[1]?.trim();
      name = name.slice(0, trailing.index);
    }
  }
  usage = usage?.replace(/\(\((.*)\)\)/, "($1)").trim();
  // An unclosed parenthesis ("Remove Outlier (Standard") is lost text.
  if (/\([^)]*$/.test(name)) name = name.slice(0, name.lastIndexOf("("));
  let keywords: string | undefined;
  const keywordMatch = /\s*\(([^()\d]*)\)\s*$/.exec(name);
  if (keywordMatch !== null) {
    keywords = keywordMatch[1]?.trim() || undefined;
    name = name.slice(0, keywordMatch.index);
  }
  name = name.trim().replace(/[:;,]$/, "");
  return {
    name,
    ...(keywords === undefined ? {} : { keywords }),
    ...(usage === undefined || usage === "" ? {} : { usage }),
    ...(aura === undefined ? {} : { aura }),
  };
}

/** "STANDARD", "IMMEDIATE iNTERRUPT", "MINOR • At-Will" (no name). */
function sectionHeader(
  line: string,
): { section: string; usage?: string } | undefined {
  const text = collapse(line);
  const [head = "", ...usageParts] = text.split(/\s*[•*]\s*/);
  const firstWord = head.split(" ")[0] ?? "";
  if (firstWord.length < 3 || firstWord !== firstWord.toLocaleUpperCase())
    return undefined;
  const known = SECTION_NAMES.get(head.toLocaleLowerCase());
  const usage = usageParts.join(" • ").trim();
  if (known !== undefined)
    return usage === "" ? { section: known } : { section: known, usage };
  // An all-capitals heading (Sarifal Advisor's "ADVISOR'S ACUMEN") opens
  // a trait.
  return /[a-z]/.test(text) ? undefined : { section: "Traits" };
}

interface MutableEntry {
  section: string;
  title: ParsedTitle;
  lines: AssociateLine[];
}

export function parseAssociateStatBlock(
  description: string,
): AssociateStatBlockParse {
  const issues: string[] = [];
  const rawLines = description
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim() !== "");
  const [heading, typeLine, ...body] = rawLines;
  if (heading === undefined) return { issues: ["empty description"] };

  const headingCells = heading.split(/\t+/).map(collapse).filter(Boolean);
  let role: string | undefined = headingCells[1];
  let level: number | undefined;
  const levelRole = /^Level (\d+)\s+(.*)$/i.exec(role ?? "");
  if (levelRole !== null) {
    level = Number(levelRole[1]);
    role = levelRole[2];
  }
  let size: string | undefined;
  let creatureType: string | undefined;
  const sizeMatch = SIZES.exec(collapse(typeLine ?? ""));
  if (sizeMatch === null) issues.push(`no size and type line: ${typeLine}`);
  else {
    const sizeWord = sizeMatch[1] ?? "";
    size =
      sizeWord.charAt(0).toLocaleUpperCase() + sizeWord.slice(1).toLowerCase();
    creatureType = collapse((sizeMatch[2] ?? "").replace(/\(\s*\)/g, ""));
  }

  let hp: AssociateHitPoints | undefined;
  let hitPointsNote: string | undefined;
  let healingSurges: string | undefined;
  let defenses: AssociateDefenses | undefined;
  let defensesNote: string | undefined;
  const defenseTraits: string[] = [];
  let addLevel = false;
  let initiative: AssociateMasterCheck | undefined;
  let perception: AssociateMasterCheck | undefined;
  let speed: string | undefined;
  let senses: string | undefined;
  const abilities: Partial<Record<AssociateAbilityName, number>> = {};
  const other: string[] = [];
  const entries: MutableEntry[] = [];
  let section: string | undefined;
  let current: MutableEntry | undefined;

  const setDefenseValues = (text: string) => {
    const values = DEFENSE_VALUES.exec(text);
    if (values === null) return false;
    if (ADD_LEVEL.test(text)) addLevel = true;
    defenses = addLevel
      ? { kind: "level", base: defenseValues(values) }
      : { kind: "fixed", values: defenseValues(values) };
    return true;
  };
  const statCell = (cell: string) => {
    const hpMatch = /^HP\b\s*(.*)$/i.exec(cell);
    if (hpMatch !== null) {
      const [value = "", ...rest] = (hpMatch[1] ?? "").split(";");
      hp = hitPoints(value);
      if (hp === undefined) issues.push(`hit points not understood: ${cell}`);
      const note = collapse(rest.join(";"));
      const surges = /^Healing Surges\s+(.*)$/i.exec(note);
      if (surges !== null) healingSurges = surges[1];
      else if (note !== "") hitPointsNote = note;
      return;
    }
    const check = /^(Initiative|Perception)\b\s*(.*)$/i.exec(cell);
    if (check !== null) {
      const parsed = masterCheck(check[2] ?? "");
      if (parsed === undefined) issues.push(`check not understood: ${cell}`);
      else if (/^initiative$/i.test(check[1] ?? "")) initiative = parsed;
      else perception = parsed;
      return;
    }
    const defenseMatch = /^Defenses\b\s*(.*)$/i.exec(cell);
    if (defenseMatch !== null) {
      const [main = "", ...traits] = (defenseMatch[1] ?? "").split(";");
      defenseTraits.push(...traits.map(collapse).filter(Boolean));
      if (ADD_LEVEL.test(main)) addLevel = true;
      if (setDefenseValues(main)) return;
      const master = masterDefenses(main);
      if (master !== undefined) {
        defenses = { kind: "master", bonus: master.bonus };
        if (master.note !== undefined) defensesNote = master.note;
        return;
      }
      if (ADD_LEVEL.test(main) && collapse(main.replace(ADD_LEVEL, "")) === "")
        return;
      issues.push(`defenses not understood: ${cell}`);
      return;
    }
    if (/^AC\s+\d+/i.test(cell)) {
      if (!setDefenseValues(cell))
        issues.push(`defenses not understood: ${cell}`);
      return;
    }
    const speedMatch = /^Speed\b\s*(.*)$/i.exec(cell);
    if (speedMatch !== null) {
      const [value = "", ...rest] = splitOutsideParentheses(
        speedMatch[1] ?? "",
      );
      speed = speedText(value);
      const tail = collapse(rest.join(";"));
      if (tail !== "") {
        if (SENSE.test(tail)) senses = tail;
        else issues.push(`speed not understood: ${cell}`);
      }
      return;
    }
    if (SENSE.test(cell) && cell.length < 60) {
      senses = collapse(cell);
      return;
    }
    issues.push(`stat line not understood: ${cell}`);
  };

  const startEntry = (title: ParsedTitle) => {
    // Instinctive behavior is a trait of the creature, not a power.
    const entrySection = /^instinctive effect$/i.test(title.name)
      ? "Traits"
      : (section ?? "Traits");
    current = { section: entrySection, title, lines: [] };
    entries.push(current);
  };

  let resistTitle = false;
  for (const raw of body) {
    const line = collapse(raw);
    const scores = abilityLine(line);
    if (scores !== undefined) {
      for (const [name, score] of scores) abilities[name] = score;
      continue;
    }
    if (/^(?:Alignment|Languages)\s*:/i.test(line)) {
      other.push(line);
      continue;
    }
    const header = sectionHeader(line);
    if (header !== undefined) {
      section = header.section;
      current = undefined;
      if (header.usage !== undefined)
        startEntry({
          name: `${header.section} Action`,
          usage: header.usage,
        });
      continue;
    }
    if (section === undefined) {
      for (const cell of raw.split(/\t+/).map(collapse).filter(Boolean))
        statCell(cell);
      continue;
    }
    // A "Resist" heading and its "Resist: fire 10" line (Flame Zephyr).
    const resist = /^Resist\s*:\s*(.*)$/i.exec(line);
    if (resist !== null) {
      const value = /^([a-z ]+?)\s+(\d+)$/i.exec(resist[1] ?? "");
      defenseTraits.push(
        value === null
          ? `Resist ${resist[1]}`
          : `Resist ${value[2]} ${value[1]}`,
      );
      if (resistTitle && current?.lines.length === 0) {
        entries.pop();
        current = undefined;
      }
      continue;
    }
    resistTitle = /^resist$/i.test(line);
    const labeled = LINE_LABEL.exec(line);
    if (labeled !== null) {
      const label = collapse(`${labeled[1] ?? ""}${labeled[3] ?? ""}`);
      const text = (labeled[4] ?? "").trim();
      if (current === undefined) startEntry({ name: `${section} Action` });
      const entry = current!;
      const stepLevel = labeled[2];
      if (stepLevel !== undefined) {
        const hit = [...entry.lines]
          .reverse()
          .find((candidate) => /^hit$/i.test(candidate.label ?? ""));
        const parsed = parseAssociateDamage(text);
        if (hit === undefined || parsed === undefined) {
          issues.push(`level step not understood: ${line}`);
          entry.lines.push({ label, text });
          continue;
        }
        const rest = collapse(parsed.rest.replace(/^\s*\.\s*$/, ""));
        const step: AssociateDamageStep = {
          level: Number(stepLevel),
          damage: parsed.damage,
          ...(rest === "" ? {} : { rest }),
        };
        const index = entry.lines.indexOf(hit);
        entry.lines[index] = {
          ...hit,
          steps: [...(hit.steps ?? []), step].sort((a, b) => a.level - b.level),
        };
        continue;
      }
      if (/^attack/i.test(label)) {
        const attack = parseAttack(text);
        if (
          attack.bonus === undefined &&
          /your level|\+\s*\d+\s+vs/i.test(text)
        )
          issues.push(`attack not understood: ${line}`);
        entry.lines.push({ label, text, attack });
        continue;
      }
      if (/^hit$/i.test(label)) {
        const parsed = parseAssociateDamage(text);
        if (parsed === undefined) {
          const before = text.split(/\bdamage\b/i)[0] ?? "";
          if (/\byour\b/i.test(before))
            issues.push(`hit damage not understood: ${line}`);
          entry.lines.push({ label, text });
        } else
          entry.lines.push({
            label,
            text,
            damage: parsed.damage,
            rest: parsed.rest,
          });
        continue;
      }
      entry.lines.push({ label, text });
      continue;
    }
    if (current !== undefined && current.lines.length === 0) {
      current.lines.push({ text: line });
      continue;
    }
    if (current !== undefined && /[.,]$/.test(line)) {
      current.lines.push({ text: line });
      continue;
    }
    startEntry(parseTitle(line));
  }

  if (hp === undefined) issues.push("no hit points line");
  if (defenses === undefined) issues.push("no defenses line");
  if (hp === undefined || defenses === undefined) return { issues };

  const traits: AssociateEntry[] = [];
  const powers: AssociatePower[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const base: AssociateEntry = {
      ...entry.title,
      lines: entry.lines,
    };
    // The content repeats a power verbatim (Blue Dragon Wyrmling).
    const identity = JSON.stringify([entry.section, base]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (entry.section === "Traits") traits.push(base);
    else powers.push({ ...base, action: entry.section });
  }
  const abilityScores =
    Object.keys(abilities).length === 6
      ? (abilities as Record<AssociateAbilityName, number>)
      : undefined;
  if (Object.keys(abilities).length > 0 && abilityScores === undefined)
    issues.push("ability scores incomplete");

  const block: AssociateStatBlock = {
    version: ASSOCIATE_STAT_BLOCK_VERSION,
    ...(role === undefined || role === "" ? {} : { role }),
    ...(level === undefined ? {} : { level }),
    ...(size === undefined ? {} : { size }),
    ...(creatureType === undefined ? {} : { creatureType }),
    hitPoints: hp,
    ...(hitPointsNote === undefined ? {} : { hitPointsNote }),
    ...(healingSurges === undefined ? {} : { healingSurges }),
    defenses,
    ...(defensesNote === undefined ? {} : { defensesNote }),
    ...(defenseTraits.length === 0 ? {} : { defenseTraits }),
    ...(initiative === undefined ? {} : { initiative }),
    ...(perception === undefined ? {} : { perception }),
    ...(speed === undefined ? {} : { speed }),
    ...(senses === undefined ? {} : { senses }),
    traits,
    powers,
    ...(abilityScores === undefined ? {} : { abilities: abilityScores }),
    ...(other.length === 0 ? {} : { other }),
  };
  return { block, issues };
}

/** The record's {@link ASSOCIATE_STAT_BLOCK_FIELD}, appended after its own
 *  fields, and the parse issues. No field when the block lacks HP or
 *  defenses. */
export function associateStatBlockField(
  description: string,
  ordinal: number,
): { field?: SpecificField; issues: readonly string[] } {
  const parsed = parseAssociateStatBlock(description);
  return parsed.block === undefined
    ? { issues: parsed.issues }
    : {
        field: {
          name: ASSOCIATE_STAT_BLOCK_FIELD,
          value: JSON.stringify(parsed.block),
          extraAttributes: [],
          ordinal,
        },
        issues: parsed.issues,
      };
}
