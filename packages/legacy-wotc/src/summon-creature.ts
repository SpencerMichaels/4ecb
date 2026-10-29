import {
  ASSOCIATE_STAT_BLOCK_VERSION,
  CREATURE_STAT_BLOCK_FIELD,
  CREATURE_STAT_BLOCK_VERSION,
  namesSummonedCreature,
  type AssociateDefenseName,
  type AssociateEntry,
  type AssociatePower,
  type AssociateStatBlock,
  type CreatureStatBlock,
  type SpecificField,
} from "@4ecb/content-domain";

import { parseAssociateStatBlock } from "./associate-stat-block";

/**
 * The creature a summon power describes (D111), parsed once at pack build
 * into the power's `_Creature Stat Block` so the sheet prints it as a
 * creature card and the power card keeps only the summoning. Two spellings
 * carry a creature:
 *
 * - **Stat fields** (Bound Soul, Earth-friend, Servant of the Staff, the
 *   hexblade and binder "Summoned Creature (… Pact)" cards): `Hit Points`,
 *   `Defenses`, `Speed`, `Statistics` or `Creature`/`Size`/`Origin`/`Type`,
 *   traits and action fields. They are respelled as the associate stat block
 *   they are (D107) and parsed by its parser, as the owner-relative mounts
 *   are (D110), so "your level + 5 vs. Fortitude" has one model.
 * - **Special commands** (the Player's Handbook 2 summoning powers): an
 *   Effect "You summon a Medium blade angel …" followed by command fields
 *   (" Standard action", " Opportunity Attack") and creature behavior
 *   ("Instinctive Effect", "Intrinsic Nature", "Symbiosis"). The creature's
 *   hit points and defenses are the Summoning keyword's (Player's Handbook 2
 *   p. 220: "maximum hit points equal your bloodied value", "defenses equal
 *   yours … not including any temporary bonuses or penalties"); its size,
 *   speed, defense bonuses and resistances come from the Effect's sentences
 *   about the creature. The commands are attacks you make through the
 *   creature with your own statistics, so their text is kept whole. The
 *   Effect itself stays on the power card.
 *
 * Fields after an "Augment" field are the augment's and stay on the power.
 * A power's own attack fields (Servant of the Staff's Attack and Hit) stay
 * too. Anything that would make the creature's numbers wrong (no "you summon
 * a …" sentence, a defense bonus of a subject not read as the creature) is
 * an issue and leaves no block, so the power card keeps its whole text. A
 * conditional bonus ("+4 bonus to AC against opportunity attacks") is no
 * part of its defenses and stays in the Effect.
 */
export interface SummonCreatureParse {
  readonly block?: CreatureStatBlock;
  readonly issues: readonly string[];
}

/** The fields every power card shows in its header or class block. */
const POWER_FIELDS = new Set([
  "power usage",
  "display",
  "keywords",
  "action type",
  "attack type",
  "class",
  "level",
  "power type",
  "prerequisite",
  "target",
  "targets",
  "attack",
  "hit",
  "miss",
  "effect",
  "special",
  "trigger",
  "requirement",
  "sustain minor",
  "sustain move",
  "sustain standard",
  "augment",
  "flavor",
  "full text",
]);

const SIZE_WORDS = "Tiny|Small|Medium|Large|Huge|Gargantuan";
const DEFENSE_WORD = /^(AC|Fortitude|Reflex|Will)$/i;

const collapse = (value: string) =>
  value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const fieldKey = (name: string) =>
  collapse(name.replace(/^[\s•*]+/, "")).toLocaleLowerCase();
const capitalized = (text: string) =>
  text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** The specifics a reader sees: not the internal `_…` fields. */
function visible(
  specifics: readonly SpecificField[],
): readonly SpecificField[] {
  return [...specifics]
    .filter((field) => !field.name.startsWith("_"))
    .sort((left, right) => left.ordinal - right.ordinal);
}

function hasSummoningKeyword(specifics: readonly SpecificField[]): boolean {
  return specifics.some(
    (field) =>
      fieldKey(field.name) === "keywords" && /\bsummoning\b/i.test(field.value),
  );
}

/* ------------------------------------------------------- stat fields */

/** "Servant of the Staff Hit Points" → the prefix "Servant of the Staff". */
function statFieldPrefix(fields: readonly SpecificField[]): string | undefined {
  for (const field of fields) {
    const match = /^(.+?)\s+Hit Points$/i.exec(collapse(field.name));
    if (match !== null) return match[1];
  }
  return undefined;
}

/** A stat field's name without the creature prefix ("Servant of the Staff
 *  Speed" → "Speed"). */
function statName(name: string, prefix: string | undefined): string {
  const plain = collapse(name);
  return prefix !== undefined &&
    plain.toLocaleLowerCase().startsWith(`${prefix.toLocaleLowerCase()} `)
    ? plain.slice(prefix.length + 1)
    : plain;
}

const ACTION_FIELD =
  /^(Standard|Minor|Move|Free|Opportunity|Triggered|Immediate Interrupt|Immediate Reaction|No) Action$/i;

/** "(At-Will)", "(Teleportation) * At-will", "* At-will (1/round)": the
 *  usage and keywords before an action field's text. */
function actionTitle(
  name: string,
  firstLine: string,
): { title: string; rest: boolean } {
  let text = collapse(firstLine);
  let keywords: string | undefined;
  let usage: string | undefined;
  const usageWord = /^(?:At-Will|Encounter|Daily|Recharge)\b/i;
  for (;;) {
    const group = /^\(([^)]*)\)\s*/.exec(text);
    if (group !== null) {
      const inner = (group[1] ?? "").trim();
      if (usageWord.test(inner)) usage = inner;
      else keywords = inner;
      text = text.slice(group[0].length);
      continue;
    }
    const bullet = /^[*•]\s*(.*)$/.exec(text);
    if (bullet !== null && usageWord.test(bullet[1] ?? "")) {
      usage = bullet[1];
      text = "";
    }
    break;
  }
  const head = keywords === undefined ? name : `${name} (${keywords})`;
  return {
    title: usage === undefined ? head : `${head} • ${usage}`,
    rest: text === "",
  };
}

/**
 * Respells a power's stat fields as an associate stat block's text (D107:
 * heading, size and type line, HP/Defenses/Speed lines, TRAITS and action
 * sections) for the associate parser.
 */
function parseStatFields(
  powerName: string,
  specifics: readonly SpecificField[],
): SummonCreatureParse & { readonly fields?: readonly string[] } {
  const issues: string[] = [];
  const fields = visible(specifics);
  const prefix = statFieldPrefix(fields);
  const taken: string[] = [];
  const take = (field: SpecificField) => {
    if (!taken.includes(field.name)) taken.push(field.name);
  };
  const byStat = (name: string) =>
    fields.find(
      (field) =>
        statName(field.name, prefix).toLocaleLowerCase() ===
        name.toLocaleLowerCase(),
    );

  let name = prefix ?? powerName;
  let role = "Summoned Creature";
  let typeLine: string | undefined;
  let speedLine: string | undefined;
  let speedTail: string | undefined;

  const creature = byStat("Creature");
  if (creature !== undefined) {
    name = collapse(creature.value);
    take(creature);
  }
  // Earth-friend: a field named for the creature, "Level 10 Summoned
  // Creature".
  const roleField = fields.find((field) =>
    /^(?:Level \d+ )?Summoned Creature\b/i.test(collapse(field.value)),
  );
  if (roleField !== undefined && byStat("Statistics") !== undefined) {
    role = collapse(roleField.value);
    name = collapse(roleField.name);
    take(roleField);
  }
  const size = byStat("Size");
  if (size !== undefined) {
    const parts = [size, byStat("Origin"), byStat("Type")].filter(
      (field): field is SpecificField => field !== undefined,
    );
    parts.forEach(take);
    typeLine = parts
      .map((field, index) =>
        index === 0
          ? collapse(field.value)
          : collapse(field.value).toLocaleLowerCase(),
      )
      .join(" ");
  }
  const statistics = byStat("Statistics") ?? byStat("Stats");
  if (statistics !== undefined) {
    take(statistics);
    // "Medium shadow humanoid (undead), Speed 6"; "Tiny … (earth); Speed 5,
    // burrow 5"; "Medium shadow humanoid; Summoned Creature (minion)".
    const [type = "", ...rest] = collapse(statistics.value).split(
      /\s*[;,]\s*(?=Speed\b|Summoned Creature\b)/i,
    );
    typeLine = type;
    for (const part of rest) {
      if (/^Speed\b/i.test(part)) speedLine = part.replace(/^Speed\s*/i, "");
      else role = part;
    }
  }
  const speed = byStat("Speed");
  if (speed !== undefined) {
    take(speed);
    speedLine = collapse(speed.value).replace(/\s+,/g, ",");
  }
  if (speedLine !== undefined) {
    // "6; phasing": the associate parser reads only a speed and senses.
    const split = /^([^;]*?)\s*;\s*(.+)$/.exec(speedLine);
    if (split !== null) {
      speedTail = speedLine;
      speedLine = split[1];
    }
  }
  const hitPoints = byStat("Hit Points");
  const defenses = byStat("Defenses");
  if (hitPoints === undefined || defenses === undefined)
    return { issues: ["no hit points or defenses field"] };
  take(hitPoints);
  take(defenses);
  // "(your healing surge value)", "Your bloodied value.", "1, a missed
  // attack never damages a minion."
  const hp = collapse(hitPoints.value)
    .replace(/^\((.*)\)$/, "$1")
    .replace(/\.$/, "")
    .replace(/^(\d+)\s*,\s*/, "$1; ");
  const surges = byStat("Healing Surges");
  if (surges !== undefined) take(surges);
  let defenseText = collapse(defenses.value).replace(/\.$/, "");
  // Earth-friend: "AC; Fortitude, Reflex, Will: Equal to yours (not
  // including any temporary bonuses or penalties)".
  const equal = /equal to yours\s*(?:\((.*)\))?$/i.exec(defenseText);
  if (equal !== null)
    defenseText = ["your defenses", equal[1]].filter(Boolean).join(", ");

  const lines: string[] = [
    `${name}\t${role}`,
    typeLine ?? "",
    `HP ${hp}${surges === undefined ? "" : `; Healing Surges ${collapse(surges.value).replace(/\.$/, "")}`}`,
    `Defenses ${defenseText}`,
    ...(speedLine === undefined ? [] : [`Speed ${speedLine}`]),
  ];
  const traits: string[] = [];
  const actions: string[] = [];
  for (const field of fields) {
    if (taken.includes(field.name)) continue;
    const key = fieldKey(field.name);
    if (POWER_FIELDS.has(key)) continue;
    const stat = statName(field.name, prefix);
    const valueLines = field.value
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(collapse)
      .filter(Boolean);
    const action = ACTION_FIELD.exec(stat);
    if (action !== null) {
      const section = (action[1] ?? "").toLocaleUpperCase();
      const { title, rest } = actionTitle(stat, valueLines[0] ?? "");
      actions.push(
        section,
        title,
        ...(rest ? valueLines.slice(1) : valueLines),
      );
      take(field);
      continue;
    }
    if (/^traits$/i.test(stat)) {
      // "Insubstantial: The soul takes half damage …".
      for (const line of valueLines) {
        const trait = /^([^:]{2,40}):\s*(.+)$/.exec(line);
        if (trait === null) traits.push(line);
        else traits.push(trait[1] ?? "", trait[2] ?? "");
      }
      take(field);
      continue;
    }
    // A named trait or aura: "Mists of Pluton": "(Aura 1)\nThe soul …";
    // "Earth Glide": "The earth-friend can pass …".
    const aura = /^\(Aura (\d+)\)$/i.exec(valueLines[0] ?? "");
    traits.push(
      aura === null ? stat : `${stat} Aura ${aura[1]}`,
      ...(aura === null ? valueLines : valueLines.slice(1)),
    );
    take(field);
  }
  if (traits.length > 0) lines.push("TRAITS", ...traits);
  lines.push(...actions);
  const parsed = parseAssociateStatBlock(lines.join("\n"));
  issues.push(...parsed.issues);
  if (parsed.block === undefined) return { issues };
  const block: AssociateStatBlock =
    speedTail === undefined
      ? parsed.block
      : { ...parsed.block, speed: speedTail };
  return {
    block: {
      version: CREATURE_STAT_BLOCK_VERSION,
      kind: "master",
      name,
      block,
      powerFields: taken,
    },
    issues,
  };
}

/* --------------------------------------------------- special commands */

/** A command field's action ("Standard action", "• Standart Action",
 *  "Standard Action (1/encounter)", "Opportunity Attack"). */
const COMMAND_FIELD =
  /^(standard|standart|minor|move|free|no|opportunity|immediate interrupt|immediate reaction|triggered)\s*(action|acton|attack)?\s*(?:\(([^)]*)\))?$/i;
/** Creature behavior and per-type details shown with the creature. */
const BEHAVIOR_FIELD =
  /^(instinctive effect|intrinsic nature|symbiosis|special movement\b.*|water|air|fire|earth)$/i;

const COMMAND_ACTIONS: Readonly<Record<string, string>> = {
  standard: "Standard",
  standart: "Standard",
  minor: "Minor",
  move: "Move",
  free: "Free",
  no: "No Action",
  opportunity: "Opportunity",
  "immediate interrupt": "Immediate Interrupt",
  "immediate reaction": "Immediate Reaction",
  triggered: "Triggered",
};

/** "Standard Action", "Opportunity Attack", "Immediate Interrupt". */
function commandName(match: RegExpExecArray): string {
  const action = COMMAND_ACTIONS[(match[1] ?? "").toLocaleLowerCase()] ?? "";
  const kind = (match[2] ?? "").toLocaleLowerCase();
  if (kind === "attack") return `${action} Attack`;
  if (/ (interrupt|reaction|action)$/i.test(action)) return action;
  return `${action} Action`;
}

/** "You summon a Medium blade angel in …" → size and the creature. */
const SUMMON_SENTENCE = new RegExp(
  `\\byou (?:summon|create|conjure|call forth|call|animate)\\s+(?:up to\\s+)?(?:a|an|the|your|one|two|three|four|five|six|\\d+)\\s+(?:(${SIZE_WORDS})\\s+)?(.+?)(?:,|\\s+(?:in|into|within|adjacent|at|on|to|that|who|which|from)\\b)`,
  "i",
);

/** An Effect's sentences. */
function sentencesOf(effect: string): string[] {
  return effect
    .replace(/\r\n?/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(collapse);
}

/** The Effect's sentences about the creature ("It has …", "The angel has
 *  …", "A weird has …"), not about you or your allies. */
function creatureSentences(
  effect: string,
  noun: string | undefined,
  powerName: string,
) {
  const singular = (word: string) => word.toLocaleLowerCase().replace(/s$/, "");
  // The power names it too: "Summon Chainbearer", "a Large creature made
  // of chains … The chainbearer has …".
  const nounWords = `${noun ?? ""} ${powerName}`
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(singular);
  return sentencesOf(effect).filter((sentence) => {
    if (/^(?:It|They)\b/.test(sentence)) return true;
    // "The angel has …" (an angelic protector), "Each tendril has …",
    // "Your true dream form is Medium and has …".
    const subject =
      /^(?:The|A|An|Each|Your) ([\w' -]+?) (?:also )?(?:has|have|gains|gain|is|are)\b/.exec(
        sentence,
      );
    if (subject === null) return false;
    const word = singular(subject[1]!.split(/[\s-]+/).at(-1)!);
    return (
      noun === undefined ||
      nounWords.some((candidate) => candidate.startsWith(word))
    );
  });
}

const DEFENSE_LIST =
  "its other defenses|all other defenses|all defenses|(?:AC|Fortitude|Reflex|Will)(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)(?:to\\s+)?(?:AC|Fortitude|Reflex|Will))*";

/** "+4 bonus to AC and a +2 bonus to its other defenses". */
function defenseBonuses(sentences: readonly string[]): {
  bonus: Record<AssociateDefenseName, number>;
  issues: string[];
} {
  const bonus: Record<AssociateDefenseName, number> = {
    ac: 0,
    fortitude: 0,
    reflex: 0,
    will: 0,
  };
  const issues: string[] = [];
  const named = new Set<AssociateDefenseName>();
  for (const sentence of sentences) {
    for (const match of sentence.matchAll(
      new RegExp(`\\+(\\d+) bonus to (${DEFENSE_LIST})\\b`, "gi"),
    )) {
      const after = sentence.slice((match.index ?? 0) + match[0].length);
      // A conditional bonus ("+4 bonus to AC against opportunity attacks")
      // is no part of its defenses; the Effect on the power card says it.
      if (/^\s*(?:against|while|when|until|if|on)\b/i.test(after)) continue;
      const value = Number(match[1]);
      const list = (match[2] ?? "").toLocaleLowerCase();
      const targets: AssociateDefenseName[] =
        list === "all defenses"
          ? ["ac", "fortitude", "reflex", "will"]
          : /other defenses$/.test(list)
            ? (["ac", "fortitude", "reflex", "will"] as const).filter(
                (name) => !named.has(name),
              )
            : list
                .split(/\s*,\s*(?:and\s+)?|\s+and\s+(?:to\s+)?/)
                .filter((word) => DEFENSE_WORD.test(word))
                .map((word) =>
                  word.toLocaleLowerCase() === "ac"
                    ? "ac"
                    : (word.toLocaleLowerCase() as AssociateDefenseName),
                );
      for (const target of targets) {
        bonus[target] += value;
        named.add(target);
      }
    }
  }
  return { bonus, issues };
}

/** "has speed 6 and fly 6 (hover)", "has a speed of 6", "has fly 8
 *  (hover)", "has speed 4, fly 6 (hover), and resist 5 fire". */
function speedOf(sentences: readonly string[]): string | undefined {
  const mode = String.raw`(?:fly|climb|swim|burrow|teleport)(?: speed)?(?: of)? \d+(?: \([^)]*\))?`;
  for (const sentence of sentences) {
    // "has speed 6 and fly 6 (hover)", "has reach 2 and a speed of 5", "has
    // a speed of fly 8 (hover)", "has fly 8 (hover)".
    const match =
      new RegExp(
        String.raw`\bspeed (?:of )?((?:${mode})|\d+(?: \([^)]*\))?)((?:,? (?:and )?(?:a )?${mode})*)`,
        "i",
      ).exec(sentence) ??
      new RegExp(
        String.raw`\b(?:has|have) (?:a )?()(${mode}(?:,? (?:and )?(?:a )?${mode})*)`,
        "i",
      ).exec(sentence);
    if (match === null) continue;
    const modes = [...(match[2] ?? "").matchAll(new RegExp(mode, "gi"))].map(
      ([text]) => text.replace(/ speed(?: of)? /i, " ").replace(/ of /i, " "),
    );
    return [match[1], ...modes].filter(Boolean).join(", ");
  }
  return undefined;
}

/** "resist 5 fire", "vulnerable 5 radiant". */
function resistances(sentences: readonly string[]): string[] {
  return sentences.flatMap((sentence) =>
    [
      ...sentence.matchAll(
        /\b(resist|vulnerable) (\d+) ([a-z]+)\b(?! damage)/gi,
      ),
    ].map(
      ([, kind, value, type]) =>
        `${capitalized(kind!.toLocaleLowerCase())} ${value} ${type}`,
    ),
  );
}

function creatureName(powerName: string, noun: string): string {
  const named = /^Summon\s+(.+?)(?:\s*\((?:Augment|Level)[^)]*\))?$/i.exec(
    powerName,
  );
  if (named !== null) return named[1]!;
  // "the animated corpse of one of your fallen enemies": the power names it.
  if (noun.split(" ").length > 3) return powerName;
  return noun
    .split(" ")
    .map((word) => capitalized(word))
    .join(" ");
}

function parseCommands(
  powerName: string,
  specifics: readonly SpecificField[],
): SummonCreatureParse | undefined {
  const fields = visible(specifics);
  const effectIndex = fields.findIndex(
    (field) => fieldKey(field.name) === "effect",
  );
  if (effectIndex < 0) return undefined;
  const effect = fields[effectIndex]!.value;
  const commandFields: SpecificField[] = [];
  for (const field of fields.slice(effectIndex + 1)) {
    const key = fieldKey(field.name);
    if (key === "augment") break;
    if (COMMAND_FIELD.test(key) || BEHAVIOR_FIELD.test(key))
      commandFields.push(field);
  }
  if (commandFields.length === 0) return undefined;
  const issues: string[] = [];
  const summon = SUMMON_SENTENCE.exec(collapse(effect));
  if (summon === null) {
    issues.push(
      `no "you summon a <size> <creature>" sentence: ${collapse(effect).slice(0, 80)}`,
    );
  }
  const noun = summon === null ? undefined : collapse(summon[2] ?? "");
  const sentences = creatureSentences(effect, noun, powerName);
  const defenses = defenseBonuses(sentences);
  issues.push(...defenses.issues);
  // A defense bonus in a sentence not read as the creature's would leave its
  // defenses wrong.
  for (const sentence of sentencesOf(effect))
    if (
      !sentences.includes(sentence) &&
      new RegExp(`\\+\\d+ bonus to (?:${DEFENSE_LIST})\\b`, "i").test(sentence)
    )
      issues.push(`defense bonus of another subject: ${sentence}`);
  if (summon === null || issues.length > 0) return { issues };

  const traits: AssociateEntry[] = [];
  const powers: AssociatePower[] = [];
  for (const field of commandFields) {
    const key = fieldKey(field.name);
    const text = collapse(field.value);
    const command = COMMAND_FIELD.exec(key);
    if (command !== null) {
      const name = commandName(command);
      const action =
        COMMAND_ACTIONS[(command[1] ?? "").toLocaleLowerCase()] ?? name;
      const usage = command[3]?.trim();
      powers.push({
        name,
        action,
        ...(usage === undefined || usage === "" ? {} : { usage }),
        lines: [{ text }],
      });
      continue;
    }
    traits.push({
      name: collapse(field.name.replace(/^[\s•*]+/, "")),
      lines: [{ text }],
    });
  }
  const speed = speedOf(sentences);
  const defenseTraits = resistances(sentences);
  const sizeWord = summon[1];
  const block: AssociateStatBlock = {
    version: ASSOCIATE_STAT_BLOCK_VERSION,
    role: "Summoned Creature",
    ...(sizeWord === undefined
      ? {}
      : { size: capitalized(sizeWord.toLocaleLowerCase()) }),
    creatureType: noun!,
    hitPoints: { kind: "master-bloodied" },
    defenses: { kind: "master", bonus: defenses.bonus },
    defensesNote: "not including any temporary bonuses or penalties",
    ...(defenseTraits.length === 0 ? {} : { defenseTraits }),
    ...(speed === undefined ? {} : { speed }),
    traits,
    powers,
  };
  return {
    block: {
      version: CREATURE_STAT_BLOCK_VERSION,
      kind: "master",
      name: creatureName(powerName, noun!),
      block,
      powerFields: commandFields.map((field) => field.name),
    },
    issues,
  };
}

/* -------------------------------------------------------------- entry */

/**
 * The summoned creature of a Power record, or undefined when the power is
 * no summon or carries no creature of its own (a summon whose commands are
 * written into its Effect, a hexblade creature's trait card). A summon
 * whose creature cannot be placed returns its issues and no block.
 */
export function parseSummonCreature(
  powerName: string,
  specifics: readonly SpecificField[],
): SummonCreatureParse | undefined {
  if (!hasSummoningKeyword(specifics) && !namesSummonedCreature(specifics))
    return undefined;
  const fields = visible(specifics);
  const statField = (suffix: string) =>
    fields.some((field) =>
      new RegExp(`(?:^|\\s)${suffix}$`, "i").test(collapse(field.name)),
    );
  if (statField("Hit Points") && statField("Defenses"))
    return parseStatFields(powerName, specifics);
  return parseCommands(powerName, specifics);
}

/** The power's {@link CREATURE_STAT_BLOCK_FIELD}, appended after its own
 *  fields, and the parse issues; nothing for a power with no creature. */
export function summonCreatureField(
  powerName: string,
  specifics: readonly SpecificField[],
  ordinal: number,
): { field?: SpecificField; issues: readonly string[] } {
  const parsed = parseSummonCreature(powerName, specifics);
  if (parsed === undefined) return { issues: [] };
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
