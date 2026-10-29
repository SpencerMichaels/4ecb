import {
  CREATURE_STAT_BLOCK_FIELD,
  CREATURE_STAT_BLOCK_VERSION,
  type AssociateAbilityName,
  type CreatureAbilityScore,
  type CreatureAttackKind,
  type CreatureEntry,
  type CreatureEntryLine,
  type CreatureStatBlock,
  type FixedCreatureStatBlock,
  type SpecificField,
} from "@4ecb/content-domain";

import { parseAssociateStatBlock } from "./associate-stat-block";

/**
 * Parses a creature stat block (D110) once, at pack build: a mount Gear
 * record's `_Monster` text, the block legacy `MonsterDisplay.Build` showed in
 * the builder's detail pane. Two spellings occur:
 *
 * - a published monster block (47 of 49 mounts are this or the next):
 *   "Riding Horse - Level 1 Brute" / "Large  natural beast (mount) - XP 100",
 *   the Initiative, HP, AC and Speed lines, blank-separated powers and traits
 *   ("m Kick (standard;  At-Will) ▪ Poison" then its text), then Alignment,
 *   Skills and the ability scores with their printed modifiers;
 * - a block written relative to the owner (the Celestial steeds, Jade Horse):
 *   "Celestial Warhorse - Large immortal beast (mount)" / "-", then
 *   "HP your bloodied value", "Defenses your defenses +2, …", "Traits",
 *   "Standard Actions", "Attack: Melee 1 …; your level + 5 vs. AC". These
 *   are respelled as the associate stat block they are (D107) and parsed by
 *   its parser, so the owner-relative numbers have one model.
 *
 * Every line it cannot place is an issue, which the import turns into a
 * `mount.stat-block-unparsed` diagnostic.
 */
export interface CreatureStatBlockParse {
  readonly block?: CreatureStatBlock;
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

const SIZE_LINE =
  /^(tiny|small|medium|large|huge|gargantuan)\s+(.*?)\s*(?:-\s*XP\s+(\d+))?\s*$/i;
const ATTACK_KINDS: Readonly<Record<string, CreatureAttackKind>> = {
  m: "basic-melee",
  M: "melee",
  R: "ranged",
  C: "close",
  A: "area",
};
const ENTRY_LABEL =
  /^(Attack|Hit|Miss|Effect|Trigger|Requirement|Secondary Attack|Aftereffect|Special)(\s*\([^)]*\))?\s*:\s*(.*)$/;
const LABEL_SPLIT =
  /;\s*(?=(?:Attack|Hit|Miss|Effect|Trigger|Requirement|Aftereffect|Special)(?:\s*\([^)]*\))?\s*:)/;
const DEFENSE_TRAIT =
  /^(Immune|Resist|Vulnerable|Saving Throws|Action Points)\b/i;

const collapse = (value: string) =>
  value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
/** "charge attack.." (a content typo) ends with one period. */
const sentence = (value: string) => collapse(value).replace(/\.\.$/, ".");

function signedNumber(text: string): number {
  return Number(text.replace(/\s+/g, ""));
}

function entryLines(text: string): CreatureEntryLine[] {
  return sentence(text)
    .split(LABEL_SPLIT)
    .map((part) => {
      const labeled = ENTRY_LABEL.exec(part.trim());
      if (labeled === null) return { text: part.trim() };
      return {
        label: collapse(`${labeled[1] ?? ""}${labeled[2] ?? ""}`),
        text: (labeled[3] ?? "").trim(),
      };
    })
    .filter((line) => line.text !== "" || line.label !== undefined);
}

/** "m Kick (standard;  At-Will) ▪ Poison". */
function entryTitle(line: string): Omit<CreatureEntry, "lines"> {
  let text = collapse(line);
  let attackKind: CreatureAttackKind | undefined;
  const icon = /^([mMRCA])\s+(?=[A-Z])/.exec(text);
  if (icon !== null) {
    attackKind = ATTACK_KINDS[icon[1] ?? ""];
    text = text.slice(icon[0].length);
  }
  const [head = "", ...keywordParts] = text.split(/\s*[▪•]\s*/);
  const keywords = keywordParts.join(", ").trim();
  const usageMatch = /^(.*?)\s*\((.*)\)\s*$/.exec(head);
  const name = (usageMatch === null ? head : (usageMatch[1] ?? "")).trim();
  const usage = usageMatch?.[2]?.replace(/\s*;\s*/g, "; ").trim();
  return {
    name,
    ...(attackKind === undefined ? {} : { attackKind }),
    ...(usage === undefined || usage === "" ? {} : { usage }),
    ...(keywords === "" ? {} : { keywords }),
  };
}

function abilityScores(
  line: string,
): [AssociateAbilityName, CreatureAbilityScore][] | undefined {
  if (!/^(?:Str|Con|Dex|Int|Wis|Cha)\s+\d/i.test(line)) return undefined;
  return [
    ...line.matchAll(
      /\b(Str|Con|Dex|Int|Wis|Cha)\s+(\d+)\s*\(\s*([+-]?\s*\d+)\s*\)/gi,
    ),
  ].map(([, name, score, modifier]) => [
    ABILITY_ABBREVIATIONS[(name ?? "").toLocaleLowerCase()]!,
    { score: Number(score), modifier: signedNumber(modifier ?? "0") },
  ]);
}

function parseFixed(lines: readonly string[]): CreatureStatBlockParse {
  const issues: string[] = [];
  const [heading = "", typeLine = "", ...body] = lines;
  const headingSplit = heading.indexOf(" - ");
  const name = collapse(
    headingSplit < 0 ? heading : heading.slice(0, headingSplit),
  );
  const roleText = collapse(
    headingSplit < 0 ? "" : heading.slice(headingSplit + 3),
  );
  const levelRole = /^Level\s+(\d+)\s+(.+)$/i.exec(roleText);
  if (levelRole === null) issues.push(`no level and role: ${heading}`);
  const sizeMatch = SIZE_LINE.exec(collapse(typeLine));
  if (sizeMatch === null) issues.push(`no size and type line: ${typeLine}`);

  let initiative: number | undefined;
  let perception: number | undefined;
  let senses: string | undefined;
  let hitPoints: number | undefined;
  let bloodied: number | undefined;
  let hitPointsNote: string | undefined;
  let defenses: FixedCreatureStatBlock["defenses"] | undefined;
  let defensesNote: string | undefined;
  const defenseTraits: string[] = [];
  let speed: string | undefined;
  const entries: { title: Omit<CreatureEntry, "lines">; lines: string[] }[] =
    [];
  let alignment: string | undefined;
  let languages: string | undefined;
  let skills: string | undefined;
  let description: string | undefined;
  const abilities: Partial<Record<AssociateAbilityName, CreatureAbilityScore>> =
    {};

  const statLine = (line: string) => {
    const check =
      /^Initiative\s*([+-]\s*\d+)\s+Senses\s+Perception\s*([+-]\s*\d+)\s*(?:;\s*(.*))?$/i.exec(
        line,
      );
    if (check !== null) {
      initiative = signedNumber(check[1] ?? "");
      perception = signedNumber(check[2] ?? "");
      if (check[3] !== undefined && check[3] !== "") senses = check[3];
      return;
    }
    const hp = /^HP\s+(\d+)\s*(?:;\s*(.*))?$/i.exec(line);
    if (hp !== null) {
      hitPoints = Number(hp[1]);
      const rest = hp[2] ?? "";
      const bloodiedMatch = /^Bloodied\s+(\d+)$/i.exec(rest);
      if (bloodiedMatch !== null) bloodied = Number(bloodiedMatch[1]);
      else if (rest !== "") hitPointsNote = rest;
      return;
    }
    const ac =
      /^AC\s+(\d+)(?:\s*\(([^)]*)\))?\s*[;,]\s*Fortitude\s+(\d+)\s*,\s*Reflex\s+(\d+)\s*,\s*Will\s+(\d+)$/i.exec(
        line,
      );
    if (ac !== null) {
      defenses = {
        ac: Number(ac[1]),
        fortitude: Number(ac[3]),
        reflex: Number(ac[4]),
        will: Number(ac[5]),
      };
      if (ac[2] !== undefined) defensesNote = `AC ${collapse(ac[2])}`;
      return;
    }
    const speedMatch = /^Speed\s+(.+)$/i.exec(line);
    if (speedMatch !== null) {
      speed = speedMatch[1];
      return;
    }
    if (DEFENSE_TRAIT.test(line)) {
      defenseTraits.push(
        ...line.split(/;\s*(?=(?:Immune|Resist|Vulnerable)\b)/i).map(collapse),
      );
      return;
    }
    if (SIZE_LINE.test(line)) issues.push(`second size and type line: ${line}`);
    else issues.push(`stat line not understood: ${line}`);
  };

  let inStats = true;
  let afterBlank = false;
  let current: { lines: string[] } | undefined;
  for (const raw of body) {
    const line = collapse(raw);
    if (line === "") {
      inStats = false;
      afterBlank = true;
      current = undefined;
      continue;
    }
    if (inStats) {
      statLine(line);
      continue;
    }
    const scores = abilityScores(line);
    if (scores !== undefined) {
      if (scores.length !== 3)
        issues.push(`ability line not understood: ${line}`);
      for (const [ability, score] of scores) abilities[ability] = score;
      current = undefined;
      continue;
    }
    const alignmentMatch = /^Alignment\s+(.*?)\s+Languages\s*(.*)$/i.exec(line);
    if (alignmentMatch !== null) {
      alignment = alignmentMatch[1];
      const spoken = (alignmentMatch[2] ?? "").trim();
      if (spoken !== "" && spoken !== "-") languages = spoken;
      current = undefined;
      continue;
    }
    const skillsMatch = /^Skills\s+(.+)$/i.exec(line);
    if (skillsMatch !== null) {
      skills = skillsMatch[1];
      current = undefined;
      continue;
    }
    const descriptionMatch = /^Description:\s*(.+)$/i.exec(line);
    if (descriptionMatch !== null) {
      description = descriptionMatch[1];
      current = undefined;
      continue;
    }
    if (afterBlank || current === undefined) {
      current = { lines: [] };
      entries.push({ title: entryTitle(line), lines: current.lines });
      afterBlank = false;
      continue;
    }
    // A line broken mid-sentence ("the hawk's master gains" / "a +4
    // bonus …") continues the previous one.
    const previous = current.lines.length - 1;
    if (previous >= 0 && !/[.!?:;)]$/.test(current.lines[previous]!))
      current.lines[previous] = `${current.lines[previous]} ${line}`;
    else current.lines.push(line);
  }

  if (initiative === undefined || perception === undefined)
    issues.push("no initiative and perception line");
  if (hitPoints === undefined) issues.push("no hit points line");
  if (defenses === undefined) issues.push("no defenses line");
  if (speed === undefined) issues.push("no speed line");
  if (Object.keys(abilities).length !== 6)
    issues.push("ability scores incomplete");
  for (const entry of entries)
    if (entry.lines.length === 0 && entry.title.usage === undefined)
      issues.push(`entry without text: ${entry.title.name}`);
  if (
    initiative === undefined ||
    perception === undefined ||
    hitPoints === undefined ||
    defenses === undefined ||
    speed === undefined ||
    Object.keys(abilities).length !== 6
  )
    return { issues };

  const block: CreatureStatBlock = {
    version: CREATURE_STAT_BLOCK_VERSION,
    kind: "fixed",
    name,
    ...(levelRole === null
      ? {}
      : { level: Number(levelRole[1]), role: collapse(levelRole[2] ?? "") }),
    ...(sizeMatch?.[3] === undefined ? {} : { xp: Number(sizeMatch[3]) }),
    ...(sizeMatch === null
      ? {}
      : {
          size:
            (sizeMatch[1] ?? "").charAt(0).toLocaleUpperCase() +
            (sizeMatch[1] ?? "").slice(1).toLocaleLowerCase(),
          creatureType: collapse(sizeMatch[2] ?? ""),
        }),
    initiative,
    perception,
    ...(senses === undefined ? {} : { senses }),
    hitPoints,
    ...(bloodied === undefined ? {} : { bloodied }),
    ...(hitPointsNote === undefined ? {} : { hitPointsNote }),
    defenses,
    ...(defensesNote === undefined ? {} : { defensesNote }),
    ...(defenseTraits.length === 0 ? {} : { defenseTraits }),
    speed,
    entries: entries.map(({ title, lines }) => ({
      ...title,
      lines: lines.flatMap(entryLines),
    })),
    ...(alignment === undefined ? {} : { alignment }),
    ...(languages === undefined ? {} : { languages }),
    ...(skills === undefined ? {} : { skills }),
    abilities: abilities as Record<AssociateAbilityName, CreatureAbilityScore>,
    ...(description === undefined ? {} : { description }),
  };
  return { block, issues };
}

const ACTION_SECTION = /^(Standard|Minor|Move|Triggered|Free) Actions$/i;
/** "m Bite (At-Will)", "C Breath Weapon (cold, Encounter)". */
const OWNER_POWER_TITLE =
  /^(.*?)\s*\((?:([^()]*?),\s*)?(At-Will|Encounter|Daily|Recharge\b[^()]*)\)\s*$/i;

/**
 * Respells an owner-relative block in the associate stat block's spelling
 * (D107: tab-split heading and check cells, the healing surges and defense
 * traits on the HP and Defenses lines, capitalized section headings, "•"
 * before a usage) and parses it with the associate parser.
 */
function parseOwnerRelative(lines: readonly string[]): CreatureStatBlockParse {
  const [heading = ""] = lines;
  const split = heading.indexOf(" - ");
  const name = collapse(split < 0 ? heading : heading.slice(0, split));
  const typeLine = collapse(split < 0 ? "" : heading.slice(split + 3));
  const issues: string[] = [];
  const out: string[] = [`${name}\t`, typeLine];
  let section: string | undefined;
  let hpIndex: number | undefined;
  let defensesIndex: number | undefined;
  for (const raw of lines.slice(2)) {
    const line = collapse(raw);
    if (line === "") continue;
    if (/^Traits$/i.test(line)) {
      section = "Traits";
      out.push("TRAITS");
      continue;
    }
    const action = ACTION_SECTION.exec(line);
    if (action !== null) {
      section = action[1];
      out.push((action[1] ?? "").toLocaleUpperCase());
      continue;
    }
    if (section === undefined) {
      if (/^Healing Surges\b/i.test(line)) {
        if (hpIndex === undefined)
          issues.push(`healing surges before HP: ${line}`);
        else out[hpIndex] = `${out[hpIndex]}; ${line}`;
        continue;
      }
      if (DEFENSE_TRAIT.test(line)) {
        if (defensesIndex === undefined)
          issues.push(`defense trait before defenses: ${line}`);
        else out[defensesIndex] = `${out[defensesIndex]}; ${line}`;
        continue;
      }
      if (/^HP\b/i.test(line)) hpIndex = out.length;
      if (/^Defenses\b/i.test(line)) defensesIndex = out.length;
      out.push(line.replace(/,\s*(?=Perception\b)/i, "\t"));
      continue;
    }
    if (section === "Traits" && !ENTRY_LABEL.test(line)) {
      const trait = /^(.+?\))\s*(?:-|:)\s+(.+)$/.exec(line);
      if (trait !== null) {
        out.push(trait[1] ?? "", trait[2] ?? "");
        continue;
      }
    }
    const title = ENTRY_LABEL.test(line) ? null : OWNER_POWER_TITLE.exec(line);
    if (title !== null) {
      const keywords = title[2]?.trim();
      out.push(
        `${title[1]}${keywords === undefined || keywords === "" ? "" : ` (${keywords})`} • ${title[3]}`,
      );
      continue;
    }
    out.push(line);
  }
  const parsed = parseAssociateStatBlock(out.join("\n"));
  issues.push(...parsed.issues);
  return parsed.block === undefined
    ? { issues }
    : {
        block: {
          version: CREATURE_STAT_BLOCK_VERSION,
          kind: "master",
          name,
          block: parsed.block,
        },
        issues,
      };
}

export function parseCreatureStatBlock(text: string): CreatureStatBlockParse {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
  if (lines.length < 2) return { issues: ["fewer than two lines"] };
  return /^\s*-\s*$/.test(lines[1] ?? "")
    ? parseOwnerRelative(lines)
    : parseFixed(lines);
}

/** The record's {@link CREATURE_STAT_BLOCK_FIELD}, appended after its own
 *  fields, and the parse issues. No field when the block lacks its core
 *  statistics. */
export function creatureStatBlockField(
  text: string,
  ordinal: number,
): { field?: SpecificField; issues: readonly string[] } {
  const parsed = parseCreatureStatBlock(text);
  return parsed.block === undefined
    ? { issues: parsed.issues }
    : {
        field: {
          name: CREATURE_STAT_BLOCK_FIELD,
          value: JSON.stringify(parsed.block),
          extraAttributes: [],
          ordinal,
        },
        issues: parsed.issues,
      };
}
