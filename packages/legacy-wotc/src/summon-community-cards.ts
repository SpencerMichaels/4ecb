import {
  CREATURE_STAT_BLOCK_FIELD,
  POWER_TEXT_FIELD,
  getAttribute,
  readCreatureStatBlock,
  type AssociateEntry,
  type AssociateLine,
  type AssociatePower,
  type CreatureRoll,
  type ParsedContentEntity,
  type RuleStatement,
  type SpecificField,
} from "@4ecb/content-domain";

import { associateEntryLine } from "./associate-stat-block";
import { powerTextField } from "./power-text";

/**
 * The community card sets of the hexblade's and binder's summoned allies
 * (D111): the content splits each creature over a summon power
 * `<prefix>_POWERCARD_0` (its stat fields, parsed into the power's
 * `_Creature Stat Block`) and sibling Power records `<prefix>_POWERCARD_<n>`
 * granted with it: a trait card (auras, special movement, opportunity
 * actions) and attack cards ("Mourning Handmaiden's Attack", "Spectral
 * Protector's Opportunity"). The pack build merges the siblings into the
 * creature, traits with its traits and attacks and actions with its
 * actions, and keeps each sibling as an inert Internal record under its own
 * ID, so imported characters still resolve and export writes the same IDs
 * (as D107 did for associates' community cards).
 *
 * A sibling belongs to the creature when it shares the ID prefix and the
 * same granting records as `_POWERCARD_0`. An attack card's own `modify`
 * of its fields (the `9B-summoned-allies.part` "your level + N" attack
 * lines) applies before the merge. Each attack card's attack becomes a
 * {@link CreatureRoll} naming the card, so bonuses the content keys to it
 * ("<card id>:damage", a pact reward) still reach its row.
 */

const SIBLING = /^(.*)_POWERCARD_(\d+)$/i;

/** Fields every Power record has, which the creature does not show. */
const CARD_FIELDS = new Set([
  "power usage",
  "display",
  "keywords",
  "action type",
  "attack type",
  "class",
  "level",
  "power type",
  "flavor",
]);

const ACTION_WORDS: readonly [RegExp, string][] = [
  [/^standard\b/i, "Standard"],
  [/^minor\b/i, "Minor"],
  [/^move\b/i, "Move"],
  [/^free\b/i, "Free"],
  [/^no\b/i, "No Action"],
  [/^opportunity\b/i, "Opportunity"],
  [/^immediate interrupt\b/i, "Immediate Interrupt"],
  [/^immediate reaction\b/i, "Immediate Reaction"],
  [/^triggered\b/i, "Triggered"],
];

const USAGE_WORD = /^(?:At-Will|Encounter|Daily|Recharge)\b/i;
const LINE_LABELS =
  /(Trigger|Effect(?:\s*\([^)]*\))?|Attack|Hit|Miss|Special|Aftereffect)\s*:\s*/g;

const key = (value: string) => value.trim().toLocaleLowerCase();
const collapse = (value: string) =>
  value.replace(/ /g, " ").replace(/\s+/g, " ").trim();

function actionOf(text: string): string | undefined {
  return ACTION_WORDS.find(([pattern]) => pattern.test(text.trim()))?.[1];
}

/** The card's own field values, after its unconditional `modify` rules of
 *  itself. */
function effectiveFields(
  entity: ParsedContentEntity,
): Map<string, { name: string; value: string; ordinal: number }> {
  const fields = new Map<
    string,
    { name: string; value: string; ordinal: number }
  >();
  for (const field of entity.specifics)
    if (!field.name.startsWith("_"))
      fields.set(key(field.name), {
        name: collapse(field.name),
        value: field.value,
        ordinal: field.ordinal,
      });
  for (const rule of entity.rules) {
    if (key(rule.name) !== "modify") continue;
    const target = getAttribute(rule.attributes, "name") ?? "";
    const fieldName = getAttribute(rule.attributes, "Field");
    const value = getAttribute(rule.attributes, "value");
    const conditional = rule.attributes.some(
      (attribute) => !["name", "field", "value"].includes(key(attribute.name)),
    );
    if (
      conditional ||
      fieldName === undefined ||
      value === undefined ||
      (key(target) !== key(entity.id) && key(target) !== "this")
    )
      continue;
    const current = fields.get(key(fieldName));
    if (current !== undefined)
      fields.set(key(fieldName), { ...current, value });
  }
  return fields;
}

/** "Trigger: … Effect (Immediate Interrupt): …" as labeled lines. */
function labeledLines(text: string): AssociateLine[] {
  const value = collapse(text);
  const marks = [...value.matchAll(LINE_LABELS)];
  if (marks.length === 0) return value === "" ? [] : [{ text: value }];
  const lines: AssociateLine[] = [];
  const lead = value.slice(0, marks[0]!.index).trim();
  if (lead !== "") lines.push({ text: lead });
  marks.forEach((mark, index) => {
    const end = marks[index + 1]?.index ?? value.length;
    const body = value.slice((mark.index ?? 0) + mark[0].length, end).trim();
    lines.push(associateEntryLine(collapse(mark[1]!), body));
  });
  return lines;
}

/** "Shining Presence (Aura 2)", "Special Movement (At-Will; 1/round)",
 *  "Child of the Void (Necrotic, Aura 1)", "Displacement (Illusion)". */
function traitTitle(name: string): {
  name: string;
  keywords?: string;
  usage?: string;
  aura?: number;
} {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(collapse(name));
  if (match === null) return { name: collapse(name) };
  const parts = (match[2] ?? "").split(/\s*[,;]\s*/).filter(Boolean);
  const keywords: string[] = [];
  let aura: number | undefined;
  let usage: string | undefined;
  parts.forEach((part, index) => {
    if (usage !== undefined) return;
    const auraMatch = /^Aura (\d+)$/i.exec(part);
    if (auraMatch !== null) aura = Number(auraMatch[1]);
    else if (USAGE_WORD.test(part)) usage = parts.slice(index).join("; ");
    else keywords.push(part);
  });
  return {
    name: match[1] ?? name,
    ...(keywords.length === 0 ? {} : { keywords: keywords.join(", ") }),
    ...(usage === undefined ? {} : { usage }),
    ...(aura === undefined ? {} : { aura }),
  };
}

interface Merged {
  readonly traits: AssociateEntry[];
  readonly powers: AssociatePower[];
  /** Specials every attack card repeats ("The creature lacks actions of its
   *  own. Instead, you spend actions to command it."), once. */
  readonly notes: string[];
}

/** A trait card: each named field a trait, or an action when its text
 *  opens with one ("Minor Action. Effect: …") or its name is one. */
function mergeTraitCard(
  fields: ReturnType<typeof effectiveFields>,
  merged: Merged,
): void {
  for (const field of [...fields.values()].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    if (CARD_FIELDS.has(key(field.name)) || collapse(field.value) === "")
      continue;
    const title = traitTitle(field.name);
    const value = collapse(field.value);
    const lead =
      /^((?:Standard|Minor|Move|Free|No|Opportunity|Immediate Interrupt|Immediate Reaction) Action)\.\s*/i.exec(
        value,
      );
    const namedAction = /^(.*) Action$/i.exec(title.name);
    const action =
      lead !== null
        ? actionOf(lead[1]!)
        : namedAction === null
          ? undefined
          : actionOf(namedAction[1]!);
    const lines = labeledLines(
      lead === null ? value : value.slice(lead[0].length),
    );
    if (action === undefined) merged.traits.push({ ...title, lines });
    else merged.powers.push({ ...title, action, lines });
  }
}

/** An attack card: one action of the creature, its Attack line with the
 *  card's range ("Melee 1; your level + 5 vs. Reflex") as a stat block
 *  writes it. */
function mergeAttackCard(
  card: ParsedContentEntity,
  fields: ReturnType<typeof effectiveFields>,
  merged: Merged,
): void {
  const value = (name: string) => collapse(fields.get(key(name))?.value ?? "");
  const action = actionOf(value("Action Type")) ?? "Standard";
  const usage = value("Power Usage");
  const keywords = value("Keywords");
  const range = value("Attack Type");
  const attack = value("Attack");
  const target = value("Target");
  const lines: AssociateLine[] = [];
  for (const field of [...fields.values()].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    const name = key(field.name);
    const text = collapse(field.value);
    if (CARD_FIELDS.has(name) || text === "") continue;
    // "You must have summoned your mourning handmaiden.": the card is the
    // creature's.
    if (name === "requirement") continue;
    if (name === "special") {
      if (!merged.notes.includes(text)) merged.notes.push(text);
      continue;
    }
    const label = collapse(field.name);
    lines.push(
      associateEntryLine(
        label,
        name === "attack" && range !== "" ? `${range}; ${text}` : text,
      ),
    );
  }
  const roll: CreatureRoll | undefined = /\bvs\.?\s+\w+/i.test(attack)
    ? {
        attack,
        ...(value("Hit") === "" ? {} : { hit: value("Hit") }),
        ...(range === "" ? {} : { attackType: range }),
        ...(target === "" ? {} : { target }),
        source: { id: card.id, name: card.name },
      }
    : undefined;
  merged.powers.push({
    name: collapse(card.name),
    ...(keywords === "" ? {} : { keywords }),
    ...(usage === "" ? {} : { usage }),
    action,
    lines,
    ...(roll === undefined ? {} : { roll }),
  });
}

/** A record with nothing left but its identity: no fields, no rules that
 *  rewrite its own (absorbed) text. */
function inert(card: ParsedContentEntity): ParsedContentEntity {
  const rest: ParsedContentEntity = { ...card };
  delete (rest as { flavor?: string }).flavor;
  return {
    ...rest,
    type: "Internal",
    specifics: [],
    description: "",
    rules: card.rules.filter(
      (rule: RuleStatement) =>
        key(rule.name) !== "modify" ||
        key(getAttribute(rule.attributes, "name") ?? "") !== key(card.id),
    ),
  };
}

/**
 * Merges each summon power's community cards into its creature (see
 * above). Returns the record set with the summon powers' blocks (and power
 * text IR) rebuilt and the merged cards inert; other records are returned
 * as they were.
 */
export function mergeSummonCommunityCards(
  entities: readonly ParsedContentEntity[],
): ParsedContentEntity[] {
  const granters = new Map<string, Set<string>>();
  for (const entity of entities)
    for (const rule of entity.rules) {
      if (key(rule.name) !== "grant") continue;
      const granted = key(getAttribute(rule.attributes, "name") ?? "");
      if (granted === "") continue;
      const set = granters.get(granted) ?? new Set<string>();
      set.add(key(entity.id));
      granters.set(granted, set);
    }
  const sameGranters = (left: string, right: string) => {
    const a = granters.get(key(left)) ?? new Set<string>();
    const b = granters.get(key(right)) ?? new Set<string>();
    return a.size > 0 && a.size === b.size && [...a].every((id) => b.has(id));
  };
  const siblingsByPrefix = new Map<string, ParsedContentEntity[]>();
  for (const entity of entities) {
    const match = SIBLING.exec(entity.id);
    if (match === null || match[2] === "0") continue;
    const prefix = key(match[1]!);
    siblingsByPrefix.set(prefix, [
      ...(siblingsByPrefix.get(prefix) ?? []),
      entity,
    ]);
  }

  const replaced = new Map<string, ParsedContentEntity>();
  for (const summon of entities) {
    const match = SIBLING.exec(summon.id);
    if (match === null || match[2] !== "0" || key(summon.type) !== "power")
      continue;
    const block = readCreatureStatBlock(summon.specifics);
    if (block?.kind !== "master") continue;
    const siblings = (siblingsByPrefix.get(key(match[1]!)) ?? [])
      .filter(
        (card) =>
          key(card.type) === "power" && sameGranters(card.id, summon.id),
      )
      .sort(
        (left, right) =>
          Number(SIBLING.exec(left.id)![2]) -
          Number(SIBLING.exec(right.id)![2]),
      );
    if (siblings.length === 0) continue;
    const merged: Merged = { traits: [], powers: [], notes: [] };
    for (const card of siblings) {
      const fields = effectiveFields(card);
      if (collapse(fields.get("action type")?.value ?? "") === "")
        mergeTraitCard(fields, merged);
      else mergeAttackCard(card, fields, merged);
      replaced.set(key(card.id), inert(card));
    }
    const creature = {
      ...block,
      block: {
        ...block.block,
        traits: [...block.block.traits, ...merged.traits],
        powers: [...block.block.powers, ...merged.powers],
        ...(merged.notes.length === 0
          ? {}
          : { other: [...(block.block.other ?? []), ...merged.notes] }),
      },
      absorbed: siblings.map((card) => card.id),
    };
    // The block's field, then the power text IR rebuilt from it (its
    // commands' rolls), each in its own place.
    const withBlock: SpecificField[] = summon.specifics.map((field) =>
      field.name === CREATURE_STAT_BLOCK_FIELD
        ? { ...field, value: JSON.stringify(creature) }
        : field,
    );
    const ir = withBlock.find((field) => field.name === POWER_TEXT_FIELD);
    const rebuilt =
      ir === undefined
        ? undefined
        : powerTextField(
            summon.type,
            withBlock.filter((field) => field.name !== POWER_TEXT_FIELD),
            summon.rules,
            ir.ordinal,
          ).field;
    replaced.set(key(summon.id), {
      ...summon,
      specifics: withBlock.map((field) =>
        field.name === POWER_TEXT_FIELD && rebuilt !== undefined
          ? rebuilt
          : field,
      ),
    });
  }
  return entities.map((entity) => replaced.get(key(entity.id)) ?? entity);
}
