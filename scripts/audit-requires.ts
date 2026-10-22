/**
 * Private audit of `requires` conditions. Parses every `requires` attribute in
 * an exact pack (grants, selects, statadds, textstrings, replaces, ...) with
 * the engine's grammar (`parseRequires` in packages/rules-engine/src/
 * expressions.ts, after native MeetsRequires) and flags conditions whose
 * literal reading likely contradicts what the author meant:
 *
 * - `not-and`: a leading `!` negates everything after it, so `!A&B` reads
 *   NOT(A & B); authors usually meant "not A, and B".
 * - `not-negated-terms`: `!A|!B` reads NOT(A | !B); authors usually meant
 *   "not A, or not B" (or "neither").
 * - `none-of`: `!A|B|C` reads "none of A, B, C". A common, usually
 *   deliberate idiom, but it can hide "not A, or B"; each use is reviewed.
 * - `mixed-operators`: `&` and `|` both at the top level. The engine binds
 *   `&` tighter; native MeetsRequires splits on `|` alone.
 * - `inner-not`: a bare `!X` term after the start. The engine negates it;
 *   native MeetsRequires looks up an element named "!X", which is never
 *   owned. `(!X)` reads as negation in both.
 * - `unresolved`: a named term no record in the pack matches, so it is never
 *   owned; `unknown-type`: a `Type:...` term whose type no record has.
 * - `contradiction` / `tautology`: the same term required and excluded in one
 *   `&` group, or offered both ways in one `|` group.
 *
 * Fixed conditions disappear from the corrected pack. Anything still flagged
 * must be in `DELIBERATE` below with a reason, or the audit fails, so new
 * mis-written conditions get caught. The fixes are in
 * content/corrections/95-requires-grammar.part.
 *
 *   pnpm audit:requires [PACK.4ecp] [--verbose]
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import type {
  ContentAttribute,
  ContentEntity,
  ContentNode,
} from "@4ecb/content-domain";
import { decodeContentPack } from "@4ecb/content-pack";
import { parseRequires, type RequiresExpression } from "@4ecb/rules-engine";

const decompress = promisify(gunzip);
const key = (value: string) => value.trim().toLocaleLowerCase();

type Flag =
  | "not-and"
  | "not-negated-terms"
  | "none-of"
  | "mixed-operators"
  | "inner-not"
  | "unresolved"
  | "unknown-type"
  | "contradiction"
  | "tautology";

interface Finding {
  readonly entityId: string;
  readonly entityName: string;
  readonly rule: string;
  readonly requires: string;
  readonly flags: readonly Flag[];
  readonly detail: readonly string[];
}

interface Deliberate {
  readonly entities: readonly string[];
  readonly flags: readonly Flag[];
  readonly reason: string;
}

/**
 * Flagged conditions whose literal reading is intended. An entry covers the
 * listed flags on every `requires` of the listed records.
 */
const DELIBERATE: readonly Deliberate[] = [
  {
    entities: ["ID_INTERNAL_PARAGON_PATH_PARAGON_MULTICLASSING"],
    flags: ["none-of"],
    reason:
      "The standard encounter power swap is for neither class psionic; its siblings cover the psionic cases with `(!X)` terms.",
  },
  {
    entities: ["ID_FMP_RACIAL_TRAIT_34"],
    flags: ["none-of"],
    reason:
      "Bonus Skill: the class-list select for any class but the five with their own select below it.",
  },
  {
    entities: [
      "ID_FMP_RACIAL_TRAIT_520",
      "ID_FMP_RACIAL_TRAIT_521",
      "ID_FMP_RACIAL_TRAIT_552",
      "ID_FMP_RACIAL_TRAIT_553",
      "ID_FMP_RACIAL_TRAIT_554",
      "ID_FMP_RACIAL_TRAIT_2094",
      "ID_FMP_RACIAL_TRAIT_2095",
      "ID_FMP_RACIAL_TRAIT_2096",
      "ID_FMP_RACIAL_TRAIT_2097",
      "ID_CDJ_RACIAL_TRAIT_39601",
      "ID_CDJ_RACIAL_TRAIT_39602",
      "ID_CDJ_RACIAL_TRAIT_39603",
      "ID_CDJ_RACIAL_TRAIT_39604",
    ],
    flags: ["none-of"],
    reason:
      "Genasi manifestations: a manifestation's static bonuses apply only while the character has no other manifestation.",
  },
  {
    entities: ["ID_FMP_CLASS_FEATURE_3873"],
    flags: ["none-of"],
    reason:
      "Order Adept powers count as class powers for a character with none of the spellbooks (fixed in 95-requires-grammar.part).",
  },
  {
    entities: ["ID_FMP_CLASS_FEATURE_3883"],
    flags: ["not-and", "mixed-operators", "inner-not"],
    reason:
      "Scholar's level-5 language choices, rewritten in 96-content-fixes.part: NOT((all three languages) | level-10 feature), and all three languages but not the level-10 feature.",
  },
  {
    entities: Array.from(
      { length: 9 },
      (_, index) => `ID_TIV_MAGIC_ITEM_DUNGEON_MAGAZINE_196_1_${index + 1}`,
    ),
    flags: ["unknown-type"],
    reason:
      'The Nine Swords of Tyr: a dead "!No Properties: ..." guard (no such type or record), so the item always grants its property and power cards, as published.',
  },
  {
    entities: [
      "ID_FMP_ARMOR_50",
      "ID_FMP_ARMOR_51",
      "ID_FMP_ARMOR_52",
      "ID_FMP_ARMOR_53",
    ],
    flags: ["unresolved"],
    reason:
      "Barding: no barding proficiency exists, so the non-proficiency penalty always applies, as for any wearer without one.",
  },
  {
    entities: ["ID_INTERNAL_ARENA_WEAPON_CATEGORYS"],
    flags: ["unresolved"],
    reason:
      "Dead alternatives in an OR (light mace, short spear, lance, unarmed attack have no Arena Weapon record); the rest still match.",
  },
];

interface Statement {
  readonly name: string;
  readonly attributes: readonly ContentAttribute[];
}

function statements(
  rules: readonly (Statement & { readonly children: readonly ContentNode[] })[],
): Statement[] {
  return rules.flatMap((rule) => [
    rule,
    ...statements(
      rule.children.filter(
        (child): child is Extract<ContentNode, { kind: "element" }> =>
          child.kind === "element",
      ),
    ),
  ]);
}

/** Top-level operands of `value` split on `operator`, outside parentheses. */
function topLevelSplit(value: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === operator && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

interface Term {
  readonly token: string;
  readonly negated: boolean;
}

function ownedTerms(expression: RequiresExpression, negated = false): Term[] {
  switch (expression.kind) {
    case "owned":
      return expression.token.length === 0
        ? []
        : [{ token: expression.token, negated }];
    case "category":
      return [];
    case "not":
      return ownedTerms(expression.operand, !negated);
    case "and":
    case "or":
      return expression.operands.flatMap((operand) =>
        ownedTerms(operand, negated),
      );
  }
}

function categoryTypes(expression: RequiresExpression): string[] {
  switch (expression.kind) {
    case "owned":
      return [];
    case "category":
      return [expression.type];
    case "not":
      return categoryTypes(expression.operand);
    case "and":
    case "or":
      return expression.operands.flatMap(categoryTypes);
  }
}

/** Same-group contradictions (`A&!A`) and tautologies (`A|!A`). */
function selfConflicts(expression: RequiresExpression): Flag[] {
  if (expression.kind === "not") return selfConflicts(expression.operand);
  if (expression.kind !== "and" && expression.kind !== "or") return [];
  const seen = new Map<string, boolean>();
  let conflict = false;
  for (const operand of expression.operands) {
    const term: Term | undefined =
      operand.kind === "owned"
        ? { token: operand.token, negated: false }
        : operand.kind === "not" && operand.operand.kind === "owned"
          ? { token: operand.operand.token, negated: true }
          : undefined;
    if (term === undefined || term.token.length === 0) continue;
    const previous = seen.get(key(term.token));
    if (previous !== undefined && previous !== term.negated) conflict = true;
    seen.set(key(term.token), term.negated);
  }
  const own: Flag[] = conflict
    ? [expression.kind === "and" ? "contradiction" : "tautology"]
    : [];
  return [...own, ...expression.operands.flatMap(selfConflicts)];
}

function grammarFlags(requires: string): Flag[] {
  const trimmed = requires.trim();
  const flags: Flag[] = [];
  if (trimmed.startsWith("!")) {
    const rest = trimmed.slice(1);
    const or = topLevelSplit(rest, "|");
    if (topLevelSplit(rest, "&").length > 1) flags.push("not-and");
    else if (or.length > 1)
      flags.push(
        or.slice(1).some((term) => term.trim().startsWith("!"))
          ? "not-negated-terms"
          : "none-of",
      );
  }
  if (
    topLevelSplit(trimmed, "&").length > 1 &&
    topLevelSplit(trimmed, "|").length > 1
  )
    flags.push("mixed-operators");
  // A `!` that neither starts the condition nor follows `(`.
  if (/[^(\s]\s*!/.test(trimmed.slice(1))) flags.push("inner-not");
  return flags;
}

function nameIndex(entities: readonly ContentEntity[]): {
  names: Set<string>;
  types: Set<string>;
} {
  const names = new Set<string>();
  const types = new Set<string>();
  for (const entity of entities) {
    names.add(key(entity.id));
    names.add(key(entity.name));
    names.add(key(`${entity.name} ${entity.type}`));
    names.add(key(`${entity.type} ${entity.name}`));
    types.add(key(entity.type));
  }
  return { names, types };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const path = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? "tmp/content/full-local.4ecp",
  );
  const encoded = await readFile(path);
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const { names, types } = nameIndex(pack.entities);

  let conditions = 0;
  const findings: Finding[] = [];
  for (const entity of pack.entities) {
    for (const statement of statements(entity.rules)) {
      const requires = statement.attributes.find(
        ({ name }) => key(name) === "requires",
      )?.value;
      if (requires === undefined || requires.trim().length === 0) continue;
      conditions += 1;
      const expression = parseRequires(requires);
      const flags = grammarFlags(requires);
      const detail: string[] = [];
      const unresolved = ownedTerms(expression).filter(
        ({ token }) => !names.has(key(token)),
      );
      if (unresolved.length > 0) {
        flags.push("unresolved");
        detail.push(
          `unresolved: ${unresolved.map(({ token }) => token).join(", ")}`,
        );
      }
      const unknownTypes = categoryTypes(expression).filter(
        (type) => !types.has(key(type)),
      );
      if (unknownTypes.length > 0) {
        flags.push("unknown-type");
        detail.push(`unknown type: ${unknownTypes.join(", ")}`);
      }
      flags.push(...selfConflicts(expression));
      if (flags.length === 0) continue;
      const attributes = statement.attributes
        .filter(({ name }) => key(name) !== "requires")
        .map(({ name, value }) => `${name}="${value}"`)
        .join(" ");
      findings.push({
        entityId: entity.id,
        entityName: entity.name,
        rule: `<${statement.name} ${attributes}>`,
        requires,
        flags: [...new Set(flags)],
        detail,
      });
    }
  }

  const deliberate = (finding: Finding) =>
    finding.flags.every((flag) =>
      DELIBERATE.some(
        (entry) =>
          entry.entities.includes(finding.entityId) &&
          entry.flags.includes(flag),
      ),
    );
  const byFlag = new Map<Flag, number>();
  for (const finding of findings)
    for (const flag of finding.flags)
      byFlag.set(flag, (byFlag.get(flag) ?? 0) + 1);
  const unexpected = findings.filter((finding) => !deliberate(finding));
  const stale = DELIBERATE.flatMap((entry) =>
    entry.entities.flatMap((entityId) =>
      entry.flags
        .filter(
          (flag) =>
            !findings.some(
              (finding) =>
                finding.entityId === entityId && finding.flags.includes(flag),
            ),
        )
        .map((flag) => `${entityId} ${flag}`),
    ),
  );

  process.stdout.write(
    `${conditions} requires conditions, ${findings.length} flagged (${[...byFlag].map(([flag, count]) => `${flag} ${count}`).join(", ")}): ${findings.length - unexpected.length} deliberate, ${unexpected.length} unexpected.\n`,
  );
  for (const finding of verbose ? findings : unexpected)
    process.stdout.write(
      `  ${deliberate(finding) ? "ok " : "!! "}[${finding.flags.join(",")}] ${finding.entityName} (${finding.entityId}) ${finding.rule} requires="${finding.requires}"${finding.detail.length > 0 ? ` (${finding.detail.join("; ")})` : ""}\n`,
    );
  for (const entry of stale)
    process.stdout.write(`  stale allowlist entry: ${entry}\n`);
  if (unexpected.length > 0 || stale.length > 0) process.exitCode = 1;
}

await main();
