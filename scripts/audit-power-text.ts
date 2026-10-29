/**
 * Private unconsumed-power-text sweep (roadmap queue item 12b). For every
 * record of an exact pack that carries `_Power Text IR`, compares each
 * attack and hit text the engine reads with what the stored parse captured
 * from it, and reports the meaningful tokens the parse did not consume:
 * numbers, signs, dice, `N[W]`/`N[B]`, ability names, "modifier", "twice",
 * "highest", "half level" and the like.
 *
 * It does not parse power text a second time. It tokenizes the source text,
 * splits it into the regions native reads (CalcStatVsDefense: the attack
 * stat before " vs."; CalcDamage: the hit line up to its first " damage",
 * nothing when a sentence ends first), and checks each token against the IR
 * values that can explain it (`AttackLineIr.abilities`/`bonus`,
 * `DamageClauseIr.weaponTerms`/`fixedDice`/`weaponAddedDice`/`flatBase`/
 * `powerDamageBonus`/`modifierAbilities`/…). Hit lines are taken per level
 * step exactly as the pack parse took them (`hitFieldStepTexts`).
 *
 * Regions:
 * - `attack-stat` / `attack-level-stat`: the attack stat of the first line
 *   or of a "Level N:" line; a leftover here is a number or ability the row
 *   never sees.
 * - `attack-tail`: the rest of the attack text (after the defense).
 * - `hit-expr`: native CalcDamage's damage expression; a leftover here is
 *   the main suspect.
 * - `hit-tail`: the hit line after the expression (riders, conditions).
 * It also lists over-reads: IR values taken from outside native's region
 * (`over:*`), and power fields that read like a CalcMisc/CalcBonuses rider
 * but match no native table entry (`rider:*`, native also ignores them;
 * `rider:near-miss` would match after normalizing whitespace and quotes).
 *
 * Leftovers are grouped by a normalized pattern (abilities, dice, numbers
 * and damage types replaced by placeholders) with counts and example
 * records. Writes ignored `tmp/audit/power-text.{json,md}`.
 *
 *   pnpm audit:power-text [PACK.4ecp] [--examples=N] [--top=N]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  POWER_TEXT_ABILITIES,
  POWER_TEXT_FIELD,
  POWER_TEXT_VERSION,
  hitFieldStepTexts,
  meleeRangedClauses,
  parsePowerFieldBonuses,
  readPowerTextStore,
  thrownWeaponAlternative,
  type AttackChoiceIr,
  type AttackFieldIr,
  type AttackLineIr,
  type ContentEntity,
  type DamageClauseIr,
  type HitFieldIr,
  type HitVariantIr,
  type PowerTextStore,
} from "../packages/content-domain/src/index";

import { loadPack } from "./native-character";

const OUTPUT_DIRECTORY = "tmp/audit";

type Region =
  "attack-stat" | "attack-level-stat" | "attack-tail" | "hit-expr" | "hit-tail";

type TokenKind =
  | "weapon"
  | "beast-dice"
  | "dice"
  | "ordinal"
  | "signed"
  | "number"
  | "ability"
  | "half-level"
  | "level"
  | "word";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly index: number;
  readonly end: number;
}

const ABILITY_PATTERN = POWER_TEXT_ABILITIES.join("|");
const DAMAGE_TYPE_PATTERN =
  "acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder";

const TOKEN = new RegExp(
  [
    String.raw`(?<weapon>\d*\s*\[W\])`,
    String.raw`(?<beastDice>\d*\s*\[B\])`,
    String.raw`(?<dice>\b\d+d\d+\b)`,
    String.raw`(?<ordinal>\b\d+(?:st|nd|rd|th)\b)`,
    String.raw`(?<signed>[+\-–]\s*\d+\b(?!\s*\[|d\d))`,
    String.raw`(?<number>\b\d+\b(?!\s*\[|d\d))`,
    String.raw`(?<ability>\b(?:${ABILITY_PATTERN})\b)`,
    String.raw`(?<halfLevel>\b(?:one-half|half)\s+(?:of\s+)?(?:your\s+)?level\b)`,
    String.raw`(?<level>\blevel\b)`,
    String.raw`(?<word>\b(?:modifier|twice|highest|chosen|primary)\b)`,
  ].join("|"),
  "giu",
);

function tokenize(text: string, offset = 0): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const groups = match.groups ?? {};
    const kind: TokenKind | undefined =
      groups.weapon !== undefined
        ? "weapon"
        : groups.beastDice !== undefined
          ? "beast-dice"
          : groups.dice !== undefined
            ? "dice"
            : groups.ordinal !== undefined
              ? "ordinal"
              : groups.signed !== undefined
                ? "signed"
                : groups.number !== undefined
                  ? "number"
                  : groups.ability !== undefined
                    ? "ability"
                    : groups.halfLevel !== undefined
                      ? "half-level"
                      : groups.level !== undefined
                        ? "level"
                        : groups.word !== undefined
                          ? "word"
                          : undefined;
    if (kind === undefined) continue;
    tokens.push({
      kind,
      text: match[0],
      index: offset + match.index,
      end: offset + match.index + match[0].length,
    });
  }
  return tokens;
}

const lower = (value: string) => value.toLocaleLowerCase();
const signedValue = (text: string) =>
  (text.trim().startsWith("+") ? 1 : -1) * Number(text.replace(/\D/gu, ""));
const plainNumber = (text: string) => Number(text.replace(/\D/gu, ""));

/** Placeholders, so leftovers group by shape rather than by value. */
function normalize(text: string): string {
  return text
    .replace(/\s+/gu, " ")
    .replace(/\d*\s*\[W\]/giu, "<N[W]>")
    .replace(/\d*\s*\[B\]/giu, "<N[B]>")
    .replace(/\b\d+d\d+\b/giu, "<NdM>")
    .replace(/\b\d+(?:st|nd|rd|th)\b/giu, "<Nth>")
    .replace(/\d+/gu, "<N>")
    .replace(new RegExp(`\\b(?:${ABILITY_PATTERN})\\b`, "giu"), "<ABIL>")
    .replace(new RegExp(`\\b(?:${DAMAGE_TYPE_PATTERN})\\b`, "giu"), "<TYPE>")
    .replace(/–/gu, "-")
    .trim();
}

/** The leftover token in its context: up to `words` words each side. */
function contextPattern(
  text: string,
  token: Token,
  start: number,
  end: number,
  words = 3,
): string {
  const before = text
    .slice(start, token.index)
    .split(/\s+/u)
    .filter(Boolean)
    .slice(-words)
    .join(" ");
  const after = text
    .slice(token.end, end)
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, words)
    .join(" ");
  return `${normalize(before)} «${normalize(token.text)}» ${normalize(after)}`
    .replace(/\s+/gu, " ")
    .trim();
}

/* ------------------------------------------------------------ findings */

interface Example {
  readonly record: string;
  readonly id: string;
  readonly field: string;
  readonly text: string;
}

interface Cluster {
  readonly region: string;
  readonly kind: string;
  readonly pattern: string;
  count: number;
  readonly records: Set<string>;
  readonly examples: Example[];
}

const clusters = new Map<string, Cluster>();
let maxExamples = 5;

function report(
  region: string,
  kind: string,
  pattern: string,
  example: Example,
): void {
  const id = `${region}\u0000${kind}\u0000${pattern}`;
  let cluster = clusters.get(id);
  if (cluster === undefined) {
    cluster = {
      region,
      kind,
      pattern,
      count: 0,
      records: new Set(),
      examples: [],
    };
    clusters.set(id, cluster);
  }
  cluster.count += 1;
  if (!cluster.records.has(example.id) && cluster.examples.length < maxExamples)
    cluster.examples.push(example);
  cluster.records.add(example.id);
}

/* ------------------------------------------------------------- attacks */

function choiceLines(choice: AttackChoiceIr | undefined): AttackLineIr[] {
  if (choice === undefined) return [];
  return "line" in choice ? [choice.line] : [...choice.alternatives];
}

/** Every attack-line IR a row may read for this text. */
function attackLines(field: AttackFieldIr): AttackLineIr[] {
  return [
    ...(field.raw === undefined ? [] : [field.raw]),
    ...choiceLines(field.other),
    ...choiceLines(field.thrown),
  ];
}

const ATTACK_STAT = /^(.*?)\s+vs\.?\s+([A-Za-z]+)/iu;
const LEVEL_LINE = /^\s*Level\s+(\d+)\s*:\s*/iu;
const VERSUS = /\s+vs\.?\s+[A-Za-z]+/giu;

/** Attack-stat spans of a line: the text before each " vs. <Defense>",
 *  back to the previous one (native WhichAttack picks one alternative of a
 *  "<A> vs. X, <B> vs. X, or <C> vs. X" line; CalcStatVsDefense reads the
 *  words before its " vs."). */
function statSpans(line: string, from: number): [number, number][] {
  const spans: [number, number][] = [];
  let start = from;
  for (const match of line.slice(from).matchAll(VERSUS)) {
    const at = from + match.index;
    spans.push([start, at]);
    start = at + match[0].length;
  }
  return spans;
}

/** A signed number of an attack tail that is a condition, not the row's. */
const PROSE_AFTER =
  /^\s*(?:power |untyped |item |feat |racial )?(?:bonus|penalty)\b/iu;

function auditAttack(
  entity: ContentEntity,
  fieldName: string,
  text: string,
  field: AttackFieldIr,
): void {
  const lines = attackLines(field);
  const abilities = new Set<string>(
    lines.flatMap((line) => line.abilities ?? []),
  );
  const bases = new Set(lines.map((line) => line.bonus.base ?? 0));
  const steps = lines.flatMap((line) => line.bonus.steps ?? []);
  const tier = lines.find((line) => line.bonus.tier !== undefined)?.bonus.tier;
  const levelAttack = lines.find(
    (line) => line.levelAttack !== undefined,
  )?.levelAttack;
  const beastBonus = lines.find(
    (line) => line.beastBonus !== undefined,
  )?.beastBonus;
  const special = lines.some((line) => line.special !== undefined);
  const primary = lines.some((line) => line.primaryAbility === true);
  const example = (region: string): Example => ({
    record: entity.name,
    id: entity.id,
    field: `${fieldName} (${region})`,
    text,
  });

  text.split("\n").forEach((line, lineIndex) => {
    const level = LEVEL_LINE.exec(line);
    const levelNumber = level === null ? undefined : Number(level[1]);
    const from = level === null ? 0 : level[0].length;
    const spans =
      lineIndex === 0 || level !== null ? statSpans(line, from) : [];
    const lastStatEnd = spans.at(-1)?.[1] ?? 0;
    for (const token of tokenize(line)) {
      if (token.index < from) continue;
      const span = spans.find(
        ([start, end]) => token.index >= start && token.end <= end,
      );
      const inStat = span !== undefined;
      const region: Region = inStat
        ? level === null
          ? "attack-stat"
          : "attack-level-stat"
        : "attack-tail";
      let consumed = false;
      switch (token.kind) {
        case "ability":
          // The IR's `abilities` is every ability of the text (see
          // over:attack-ability); here only the stat's count.
          consumed = inStat && abilities.has(canonicalAbility(token.text));
          break;
        case "signed": {
          const value = signedValue(token.text);
          consumed =
            (inStat &&
              level === null &&
              (bases.has(value) ||
                (levelAttack !== undefined && levelAttack.bonus === value) ||
                (beastBonus !== undefined && beastBonus === value))) ||
            steps.some(
              (step) =>
                step.bonus === Math.abs(value) &&
                (levelNumber === undefined || step.level === levelNumber),
            ) ||
            (tier !== undefined &&
              (tier.epic === value || tier.paragon === value));
          break;
        }
        case "number":
        case "ordinal":
        case "level":
        case "word":
          // Native CalcStatVsDefense ignores unsigned numbers and words other
          // than abilities and its special phrases in the stat; outside it
          // they are prose.
          if (
            inStat &&
            token.kind === "word" &&
            /^(?:highest|primary|chosen)$/iu.test(token.text) &&
            !special &&
            !primary
          )
            break;
          continue;
        default:
          consumed = false;
      }
      if (consumed) continue;
      if (
        region === "attack-tail" &&
        !["signed", "dice", "weapon", "ability", "half-level"].includes(
          token.kind,
        )
      )
        continue;
      const [start, end] = span ?? [lastStatEnd, line.length];
      const prose =
        region === "attack-tail" &&
        token.kind === "signed" &&
        PROSE_AFTER.test(line.slice(token.end));
      report(
        region,
        prose ? "prose:bonus" : token.kind,
        contextPattern(line, token, start, end),
        example(region),
      );
    }
  });

  // Over-reads: IR abilities that native never sees (named outside every
  // attack stat of the text).
  const statAbilities = new Set<string>();
  text.split("\n").forEach((line, lineIndex) => {
    const level = LEVEL_LINE.exec(line);
    if (lineIndex > 0 && level === null) return;
    for (const [start, end] of statSpans(line, level?.[0].length ?? 0))
      for (const token of tokenize(line.slice(start, end)))
        if (token.kind === "ability")
          statAbilities.add(canonicalAbility(token.text));
  });
  if (field.isAttack)
    for (const ability of abilities)
      if (!statAbilities.has(ability))
        report(
          "over",
          "attack-ability",
          normalize(text.split("\n")[0] ?? ""),
          example("ability outside the attack stat"),
        );
  // Native HigherLevelAttack reads only "Level 11:" and "Level 21:" lines
  // (AttackPowerModRepl only those and its exact increase sentences).
  for (const step of steps)
    if (step.level !== 11 && step.level !== 21)
      report(
        "over",
        "attack-step-level",
        `step at level ${step.level}`,
        example("non-native level step"),
      );
  // A "Level N:" line whose stat or defense differs from the first line:
  // native HigherLevelAttack replaces the whole line at 11/21.
  const first = ATTACK_STAT.exec(text.split("\n")[0] ?? "");
  for (const line of text.split("\n").slice(1)) {
    const level = LEVEL_LINE.exec(line);
    if (level === null || first === null) continue;
    const rest = line.slice(level[0].length);
    if (/^\+/u.test(rest)) continue;
    const own = ATTACK_STAT.exec(rest);
    if (own === null) continue;
    const firstAbilities = abilityList(first[1] ?? "");
    const ownAbilities = abilityList(own[1] ?? "");
    if (
      firstAbilities !== ownAbilities ||
      lower(first[2] ?? "") !== lower(own[2] ?? "")
    )
      report(
        "over",
        "attack-level-line-differs",
        `${normalize(first[0])} -> Level ${level[1]}: ${normalize(own[0])}`,
        example("level line"),
      );
  }
}

function canonicalAbility(text: string): string {
  return (
    POWER_TEXT_ABILITIES.find((ability) => lower(ability) === lower(text)) ??
    text
  );
}

function abilityList(text: string): string {
  return tokenize(text)
    .filter((token) => token.kind === "ability")
    .map((token) => canonicalAbility(token.text))
    .join(",");
}

/* ---------------------------------------------------------------- hits */

/** Native CalcDamage's expression: the line up to its first " damage";
 *  none when a sentence ends before it. */
function nativeExpressionEnd(clause: string): number | undefined {
  const end = lower(clause).indexOf(" damage");
  if (end < 0) return undefined;
  const period = clause.indexOf(".");
  if (period >= 0 && period < end) return undefined;
  return end;
}

function auditClause(
  entity: ContentEntity,
  fieldName: string,
  stepLabel: string,
  clauseText: string,
  clause: DamageClauseIr,
  special: boolean,
  levelStep: boolean,
  meleeClause: boolean,
): void {
  const example = (region: string): Example => ({
    record: entity.name,
    id: entity.id,
    field: `${fieldName} ${stepLabel} (${region})`,
    text: clauseText,
  });
  // A level step's text (a "Level N:" line or an increase clause) is native
  // HigherLevelDamage's replacement for the whole expression; the IR still
  // cuts it at "damage", so the region is that cut, and a "+<N>" after it,
  // which native CalcDamage's "+" chain would read, is reported apart.
  // The melee clause of a "(melee …) or … (ranged …)" line ends before the
  // " or "; native reads it as part of the line's one expression.
  const modernCut = /\bdamage\b/iu.exec(clauseText)?.index;
  const expressionEnd =
    levelStep || meleeClause
      ? (modernCut ?? clauseText.length)
      : nativeExpressionEnd(clauseText);
  const tokens = tokenize(clauseText);
  if (special) return;

  const weaponTerms = clause.weaponTerms ?? [];
  const diceBudget = [
    ...(weaponTerms.length > 0
      ? (clause.weaponAddedDice ?? [])
      : clause.fixedDice === undefined
        ? []
        : [clause.fixedDice]),
    ...(clause.beastHit === true && clause.beast.fixedDice !== undefined
      ? [clause.beast.fixedDice]
      : []),
  ].map(lower);
  const numberBudget = [
    ...(clause.flatBase === undefined ? [] : [clause.flatBase]),
    ...(clause.powerDamageBonus === undefined ? [] : [clause.powerDamageBonus]),
  ];
  const beastFlat =
    clause.beastHit === true ? clause.beast.flatBonus : undefined;
  const modifierAbilities = new Set<string>([
    ...(clause.modifierAbilities ?? []),
    ...(clause.twice ?? []),
  ]);
  const listed = clause.listedAbilities ?? [];
  if (
    clause.hasOr === true ||
    (listed.length > 1 && (clause.modifierAbilities ?? []).length === 0)
  )
    for (const ability of listed) modifierAbilities.add(ability);
  if (clause.beastHit === true)
    for (const ability of [
      ...(clause.beast.beastAbilities ?? []),
      ...(clause.beast.ownAbilities ?? []),
    ])
      modifierAbilities.add(ability);

  let weaponIndex = 0;
  let previousConsumed = false;
  for (const token of tokens) {
    const inExpression =
      expressionEnd !== undefined && token.index < expressionEnd;
    const region: Region = inExpression ? "hit-expr" : "hit-tail";
    let consumed = false;
    if (inExpression) {
      switch (token.kind) {
        case "weapon":
          consumed = weaponIndex < weaponTerms.length;
          weaponIndex += 1;
          break;
        case "beast-dice":
          consumed =
            clause.beastHit === true && clause.beast.beastDice !== undefined;
          break;
        case "dice": {
          const at = diceBudget.indexOf(lower(token.text));
          consumed = at >= 0;
          if (consumed) diceBudget.splice(at, 1);
          break;
        }
        case "signed":
        case "number": {
          const value = plainNumber(token.text);
          const at = numberBudget.indexOf(value);
          consumed = at >= 0 || (beastFlat !== undefined && beastFlat > 0);
          if (at >= 0) numberBudget.splice(at, 1);
          break;
        }
        case "ability":
          consumed = modifierAbilities.has(canonicalAbility(token.text));
          break;
        case "word": {
          const word = lower(token.text);
          consumed =
            word === "modifier"
              ? previousConsumed || clause.abilityPhrase !== undefined
              : word === "twice"
                ? (clause.twice ?? []).length > 0
                : clause.abilityPhrase !== undefined;
          break;
        }
        default:
          consumed = false;
      }
    } else {
      // The tail is prose to native CalcDamage; report only what reads like
      // damage the row could carry.
      if (
        !["signed", "dice", "weapon", "beast-dice", "half-level"].includes(
          token.kind,
        )
      ) {
        previousConsumed = false;
        continue;
      }
    }
    previousConsumed = consumed;
    if (consumed) continue;
    const start = region === "hit-expr" ? 0 : (expressionEnd ?? 0);
    const end =
      region === "hit-expr" ? (expressionEnd ?? 0) : clauseText.length;
    const kind =
      region === "hit-expr"
        ? token.kind
        : levelStep && /^\+/u.test(token.text)
          ? `level-line-plus:${token.kind}`
          : token.kind === "signed" &&
              PROSE_AFTER.test(clauseText.slice(token.end))
            ? "prose:bonus"
            : token.kind;
    report(
      region,
      kind,
      region === "hit-expr"
        ? `${normalize(clauseText.slice(0, expressionEnd))} damage`.replace(
            /\s+/gu,
            " ",
          ) + `  «${normalize(token.text)}»`
        : contextPattern(clauseText, token, start, end),
      example(region),
    );
  }

  // Over-reads: dice or weapon terms the IR took from outside native's
  // expression: a sentence ends before " damage" (`…sentence-before-damage`),
  // the text has no " damage" at all (`…no-damage-word`), or they come
  // after it (`…after-expression`).
  const expression =
    expressionEnd === undefined ? "" : clauseText.slice(0, expressionEnd);
  const why = !/ damage/iu.test(clauseText)
    ? "no-damage-word"
    : expressionEnd === undefined
      ? "sentence-before-damage"
      : "after-expression";
  if (weaponTerms.length > 0 && !/\d*\s*\[W\]/iu.test(expression))
    report(
      "over",
      `hit-weapon-outside-expression:${why}`,
      normalize(clauseText).slice(0, 160),
      example("weapon term outside native expression"),
    );
  if (
    weaponTerms.length === 0 &&
    clause.fixedDice !== undefined &&
    !lower(expression).includes(lower(clause.fixedDice))
  )
    report(
      "over",
      `hit-dice-outside-expression:${why}`,
      normalize(clauseText).slice(0, 160),
      example("dice outside native expression"),
    );
}

function variantClauseTexts(line: string, variant: HitVariantIr): string[] {
  const split =
    variant.clauses.length > 1 ? meleeRangedClauses(line) : undefined;
  return split === undefined ? [line] : [...split];
}

function auditHit(
  entity: ContentEntity,
  fieldName: string,
  text: string,
  field: HitFieldIr,
): void {
  // Native LevelIncrease (`-Module-.cs` ~24555) finds "Level 25: ",
  // "Level 21: ", "Level 15: ", "Level 11: " or "Level 5: " anywhere in the
  // hit text (stristr); the pack parse must step there (`hit-level-missed`
  // otherwise). It also steps at a later line starting (after indentation)
  // with another level (D105, `hit-level-line-not-native`, informational).
  const stepLevels = new Set(field.steps.map((step) => step.from));
  text.split("\n").forEach((line, lineIndex) => {
    for (const match of line.matchAll(/\bLevel\s+(\d+)\s*:/giu)) {
      const atLineStart =
        lineIndex > 0 && line.slice(0, match.index).trim() === "";
      const level = Number(match[1]);
      const native = [5, 11, 15, 21, 25].includes(level);
      if (native && !stepLevels.has(level))
        report(
          "over",
          "hit-level-missed",
          `"Level ${level}:" native reads, with no step`,
          { record: entity.name, id: entity.id, field: fieldName, text },
        );
      else if (!native && atLineStart)
        report(
          "over",
          "hit-level-line-not-native",
          `line "Level ${level}:" (native reads only 5/11/15/21/25)`,
          { record: entity.name, id: entity.id, field: fieldName, text },
        );
    }
  });
  const stepTexts = hitFieldStepTexts(text);
  if (stepTexts.length !== field.steps.length) {
    report(
      "error",
      "step-mismatch",
      "hitFieldStepTexts and the stored steps disagree",
      { record: entity.name, id: entity.id, field: fieldName, text },
    );
    return;
  }
  field.steps.forEach((step, index) => {
    const line = stepTexts[index]?.text ?? "";
    const label = step.from === undefined ? "base" : `from ${step.from}`;
    const variants: [string, HitVariantIr][] = [
      [thrownWeaponAlternative(line, false), step.line.other],
      ...(step.line.thrown === undefined
        ? []
        : [
            [thrownWeaponAlternative(line, true), step.line.thrown] as [
              string,
              HitVariantIr,
            ],
          ]),
    ];
    for (const [variantText, variant] of variants) {
      const clauseTexts = variantClauseTexts(variantText, variant);
      variant.clauses.forEach((clause, clauseIndex) =>
        auditClause(
          entity,
          fieldName,
          label,
          clauseTexts[clauseIndex] ?? "",
          clause,
          variant.special !== undefined,
          step.from !== undefined,
          variant.clauses.length > 1 && clauseIndex === 0,
        ),
      );
    }
  });
}

/* --------------------------------------------------------------- slots */

/** The attack fields native AttackLine reads (`-Module-.cs` ~23456), plus
 *  the later ordinals the engine supports on purpose. */
const NATIVE_ATTACK_FIELD =
  /^(?:(?:primary|secondary|tertiary|quaternary)\s+)?attack(?:\s+\((?:fortitude|reflex|will)\))?$/iu;

/**
 * Slots whose field native reads differently: an attack slot from a field
 * native AttackLine never reads ("Opportunity Attack" in a summon's stat
 * lines), and an attack or hit slot under an empty "Level N" header field,
 * which native FindLine (`-Module-.cs` ~23393) reads for a `_ThemePower` only
 * from that level, and otherwise never, unless the slot reads it from that
 * level too (`fromLevel`).
 */
function auditSlots(entity: ContentEntity, store: PowerTextStore): void {
  const example = (field: string, text: string): Example => ({
    record: entity.name,
    id: entity.id,
    field,
    text,
  });
  const theme = entity.specifics.some(
    (specific) => specific.name.trim() === "_ThemePower",
  );
  let header: number | undefined;
  const headers = new Map<number, number>();
  for (const specific of [...entity.specifics].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    const level = /^Level\s+(\d+)$/iu.exec(specific.name.trim());
    if (level !== null && specific.value.trim() === "") {
      header = Number(level[1]);
      continue;
    }
    if (!/^\s/u.test(specific.name)) header = undefined;
    if (header !== undefined) headers.set(specific.ordinal, header);
  }
  for (const [ordinal, role, , fromLevel] of store.slots ?? []) {
    if (role !== "attack" && role !== "hit") continue;
    const specific = entity.specifics.find(
      (candidate) => candidate.ordinal === ordinal,
    );
    if (specific === undefined) continue;
    const name = specific.name.trim();
    const header = headers.get(ordinal);
    // A slot that reads its header's field from that level is native's.
    if (header !== undefined && fromLevel !== header)
      report(
        "over",
        `level-header-slot:${role}`,
        `"Level N" header, then indented "${name}"${theme ? " (_ThemePower)" : ""}`,
        example(`Level ${header} / ${name}`, specific.value),
      );
    else if (role === "attack" && !NATIVE_ATTACK_FIELD.test(name))
      report(
        "over",
        "attack-slot-field",
        `attack slot from field "${name}"`,
        example(name, specific.value),
      );
  }
}

/* -------------------------------------------------------------- riders */

const RIDER_SENTENCE = new RegExp(
  `equal to (?:one-half )?(?:your )?(?:${ABILITY_PATTERN}) modifier`,
  "iu",
);

function auditRiders(entity: ContentEntity, matched: number): void {
  const normalizedSpecifics = entity.specifics.map((specific) => ({
    name: specific.name,
    value: specific.value
      .replace(/[‘’]/gu, "'")
      .replace(/\s+/gu, " ")
      .replace(/\s*\.?\s*$/u, "."),
  }));
  const normalized = parsePowerFieldBonuses(normalizedSpecifics);
  const normalizedCount =
    (normalized.weapon?.length ?? 0) + (normalized.riders?.length ?? 0);
  if (normalizedCount > matched)
    report(
      "rider",
      "near-miss",
      `${normalizedCount - matched} field(s) match a native rider after normalizing`,
      { record: entity.name, id: entity.id, field: "fields", text: "" },
    );
  for (const specific of entity.specifics) {
    const name = specific.name.trim();
    if (
      name === POWER_TEXT_FIELD ||
      name.startsWith("_") ||
      /^(?:hit|attack|effect|target|targets|power usage|keywords|action type|attack type|display|flavor|class|level|power type|requirement|trigger|special|miss)$/iu.test(
        name,
      )
    )
      continue;
    if (!RIDER_SENTENCE.test(specific.value)) continue;
    if (!/damage|attack roll/iu.test(specific.value)) continue;
    const alone = parsePowerFieldBonuses([specific]);
    if ((alone.weapon?.length ?? 0) + (alone.riders?.length ?? 0) > 0) continue;
    report(
      "rider",
      `unmatched:${lower(name).replace(/\s+/gu, " ")}`,
      normalize(specific.value).slice(0, 200),
      {
        record: entity.name,
        id: entity.id,
        field: name,
        text: specific.value,
      },
    );
  }
}

/* ---------------------------------------------------------------- main */

function argValue(args: readonly string[], name: string): string | undefined {
  return args
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const packPath =
    args.find((argument) => !argument.startsWith("--")) ??
    "tmp/content/full-local.4ecp";
  maxExamples = Number(argValue(args, "examples") ?? 5);
  const top = Number(argValue(args, "top") ?? 60);
  const pack = await loadPack(packPath);

  let records = 0;
  let attackTexts = 0;
  let hitTexts = 0;
  let stale = 0;
  for (const entity of pack.entities) {
    const store = readPowerTextStore(entity.specifics);
    if (store === undefined) {
      if (
        entity.specifics.some((specific) => specific.name === POWER_TEXT_FIELD)
      )
        stale += 1;
      continue;
    }
    records += 1;
    const fieldNames = new Map<string, string>();
    for (const specific of entity.specifics)
      if (!fieldNames.has(specific.value.trim()))
        fieldNames.set(specific.value.trim(), specific.name.trim());
    for (const [text, entry] of Object.entries(store.texts)) {
      const fieldName = fieldNames.get(text) ?? "modify";
      if (entry.attack !== undefined) {
        attackTexts += 1;
        auditAttack(entity, fieldName, text, entry.attack);
      }
      // A "Level N" header's "As above, but …" Hit restates the main Hit
      // (D105): no slot reads it.
      const headerRider =
        /^As above, but /iu.test(text) &&
        entity.specifics.some(
          (specific) =>
            /^Level\s+\d+$/iu.test(specific.name.trim()) &&
            specific.value.trim() === "",
        );
      if (entry.hit !== undefined && !headerRider) {
        hitTexts += 1;
        auditHit(entity, fieldName, text, entry.hit);
      }
    }
    auditSlots(entity, store);
    const fieldBonuses = store.fieldBonuses ?? {};
    auditRiders(
      entity,
      (fieldBonuses.weapon?.length ?? 0) + (fieldBonuses.riders?.length ?? 0),
    );
  }

  if (stale > 0 && records === 0)
    throw new Error(
      `${packPath}: ${stale} records carry ${POWER_TEXT_FIELD} of another version than this checkout's ${POWER_TEXT_VERSION}; rebuild the pack (scripts/build-private-content.sh) or pass one built from this checkout.`,
    );
  if (stale > 0)
    console.warn(
      `${stale} records carry ${POWER_TEXT_FIELD} of another version; they are skipped.`,
    );
  // The regions a row computes from first, prose-only tails last.
  const priority = (cluster: Cluster) =>
    cluster.kind.startsWith("prose:")
      ? 9
      : cluster.kind.startsWith("level-line-plus:")
        ? 1
        : ([
            "error",
            "hit-expr",
            "attack-stat",
            "attack-level-stat",
            "over",
            "rider",
            "hit-tail",
            "attack-tail",
          ].indexOf(cluster.region) +
            9) %
          9;
  const ranked = [...clusters.values()].sort(
    (left, right) =>
      priority(left) - priority(right) ||
      right.records.size - left.records.size ||
      right.count - left.count ||
      left.pattern.localeCompare(right.pattern),
  );
  const regionTotals = new Map<string, { clusters: number; records: number }>();
  for (const cluster of ranked) {
    const label = `${cluster.region}/${cluster.kind}`;
    const total = regionTotals.get(label) ?? { clusters: 0, records: 0 };
    total.clusters += 1;
    total.records += cluster.records.size;
    regionTotals.set(label, total);
  }

  await mkdir(resolve(OUTPUT_DIRECTORY), { recursive: true });
  await writeFile(
    resolve(OUTPUT_DIRECTORY, "power-text.json"),
    `${JSON.stringify(
      {
        pack: packPath,
        records,
        attackTexts,
        hitTexts,
        clusters: ranked.map((cluster) => ({
          region: cluster.region,
          kind: cluster.kind,
          pattern: cluster.pattern,
          count: cluster.count,
          records: cluster.records.size,
          examples: cluster.examples,
        })),
      },
      null,
      2,
    )}\n`,
  );
  const escape = (value: string) => value.replace(/\|/gu, "\\|");
  const markdown = [
    "# Unconsumed power text",
    "",
    `Pack \`${packPath}\`: ${records} records, ${attackTexts} attack texts, ${hitTexts} hit texts; ${ranked.length} clusters.`,
    "",
    "| Region/kind | Clusters | Records |",
    "| --- | ---: | ---: |",
    ...[...regionTotals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([label, total]) =>
          `| ${label} | ${total.clusters} | ${total.records} |`,
      ),
    "",
    "| Region | Kind | Pattern | Records | Tokens | Examples |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...ranked.map(
      (cluster) =>
        `| ${cluster.region} | ${cluster.kind} | \`${escape(cluster.pattern)}\` | ${cluster.records.size} | ${cluster.count} | ${escape(cluster.examples.map((example) => example.record).join("; "))} |`,
    ),
    "",
  ].join("\n");
  await writeFile(resolve(OUTPUT_DIRECTORY, "power-text.md"), markdown);

  console.log(
    `${records} records, ${attackTexts} attack texts, ${hitTexts} hit texts, ${ranked.length} clusters`,
  );
  for (const [label, total] of [...regionTotals.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  ))
    console.log(
      `  ${label}: ${total.clusters} clusters, ${total.records} record hits`,
    );
  console.log(`\nTop ${top} clusters (records, tokens):`);
  for (const cluster of ranked.slice(0, top))
    console.log(
      `${String(cluster.records.size).padStart(5)} ${String(cluster.count).padStart(5)}  ${cluster.region}/${cluster.kind}  ${cluster.pattern}  [${cluster.examples
        .slice(0, 3)
        .map((example) => example.record)
        .join("; ")}]`,
    );
  console.log(
    `\nWrote ${OUTPUT_DIRECTORY}/power-text.json and ${OUTPUT_DIRECTORY}/power-text.md`,
  );
}

await main();
