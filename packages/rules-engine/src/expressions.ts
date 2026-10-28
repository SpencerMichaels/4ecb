import type { ContentEntity } from "@4ecb/content-domain";

export type RequiresExpression =
  | { readonly kind: "owned"; readonly token: string }
  | {
      readonly kind: "category";
      readonly type: string;
      readonly expression: CategoryExpression;
    }
  | { readonly kind: "not"; readonly operand: RequiresExpression }
  | {
      readonly kind: "and" | "or";
      readonly operands: readonly RequiresExpression[];
    };

export interface CategoryTerm {
  readonly value: string;
  readonly negated: boolean;
}
export interface CategoryGroup {
  readonly alternatives: readonly CategoryTerm[];
}
export interface CategoryExpression {
  readonly dynamicPrefix?: string;
  readonly groups: readonly CategoryGroup[];
}

function trimOuter(value: string): string {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let index = 0; index < result.length; index += 1) {
      if (result[index] === "(") depth += 1;
      else if (result[index] === ")") depth -= 1;
      if (depth === 0 && index < result.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function splitTopLevel(value: string, operator: string): string[] {
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

export function parseRequires(value: string): RequiresExpression {
  const expression = trimOuter(value);
  if (expression.startsWith("!"))
    return { kind: "not", operand: parseRequires(expression.slice(1)) };
  const or = splitTopLevel(expression, "|");
  if (or.length > 1) return { kind: "or", operands: or.map(parseRequires) };
  const and = splitTopLevel(expression, "&");
  if (and.length > 1) return { kind: "and", operands: and.map(parseRequires) };
  const colon = expression.indexOf(":");
  if (colon > 0)
    return {
      kind: "category",
      type: expression.slice(0, colon).trim(),
      expression: parseCategoryExpression(expression.slice(colon + 1)),
    };
  return { kind: "owned", token: expression.trim() };
}

export function parseCategoryExpression(value: string): CategoryExpression {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const first = parts[0]?.toLocaleUpperCase();
  const dynamicPrefix = first?.startsWith("$$") ? parts.shift() : undefined;
  return {
    ...(dynamicPrefix === undefined ? {} : { dynamicPrefix }),
    groups: parts.map((part) => ({
      alternatives: part.split("|").map((term) => {
        const trimmed = term.trim();
        return {
          value: trimmed.startsWith("!") ? trimmed.slice(1) : trimmed,
          negated: trimmed.startsWith("!"),
        };
      }),
    })),
  };
}

export interface ExpressionContext {
  readonly owned: readonly ContentEntity[];
  /**
   * What a named requirement ("X", "!X") sees, when narrower than `owned`.
   * Native MeetsRequires ignores the checking element's own children, so a
   * rule like `grant X requires="!X"` doesn't switch itself off.
   */
  readonly namedOwned?: readonly ContentEntity[];
  readonly level: number;
  readonly dynamicCategories?: Readonly<Record<string, ReadonlySet<string>>>;
  readonly categoryAliases?: ReadonlyMap<string, ReadonlySet<string>>;
  readonly categoryValuesFor?: (entity: ContentEntity) => ReadonlySet<string>;
}

// One collator: localeCompare with options builds a new one on every call,
// which dominated evaluation time.
const accentCollator = new Intl.Collator(undefined, { sensitivity: "accent" });

function same(left: string, right: string): boolean {
  return (
    left.toLocaleLowerCase() === right.toLocaleLowerCase() ||
    accentCollator.compare(left, right) === 0
  );
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

interface NamedValue {
  readonly value: string;
  readonly lower: string;
  readonly ascii: boolean;
}

function namedValue(value: string): NamedValue {
  return {
    value,
    lower: value.toLocaleLowerCase(),
    ascii: PRINTABLE_ASCII.test(value),
  };
}

const namedValuesCache = new WeakMap<ContentEntity, readonly NamedValue[]>();

/** What a named requirement ("X", "!X") matches on an owned element. */
function namedValues(entity: ContentEntity): readonly NamedValue[] {
  let values = namedValuesCache.get(entity);
  if (values === undefined) {
    values = [
      entity.id,
      entity.name,
      `${entity.name} ${entity.type}`,
      `${entity.type} ${entity.name}`,
    ].map(namedValue);
    namedValuesCache.set(entity, values);
  }
  return values;
}

/**
 * `same` for a precomputed pair. Between printable ASCII strings the
 * accent-sensitive collator agrees with a case-insensitive comparison, so
 * it is skipped there: named requirements compare every owned element on
 * every grant pass, and the collator dominated evaluation time.
 */
function sameNamed(left: NamedValue, right: NamedValue): boolean {
  if (left.lower === right.lower) return true;
  if (left.ascii && right.ascii) return false;
  return accentCollator.compare(left.value, right.value) === 0;
}

function categoryValues(
  entity: ContentEntity,
  context: ExpressionContext,
): string[] {
  const values = [entity.id, entity.name, ...entity.categories];
  return [
    ...values,
    ...values.flatMap((value) => [
      ...(context.categoryAliases?.get(value.toLocaleLowerCase()) ?? []),
    ]),
  ];
}

function normalizedCategoryValues(
  entity: ContentEntity,
  context: ExpressionContext,
): ReadonlySet<string> {
  return (
    context.categoryValuesFor?.(entity) ??
    new Set(
      categoryValues(entity, context).map((value) => value.toLocaleLowerCase()),
    )
  );
}

function numericMatch(
  entity: ContentEntity,
  value: string,
  level: number,
): boolean | undefined {
  const substituted =
    value.toLocaleUpperCase() === "$$LEVEL" ? String(level) : value;
  const match = /^(\d+)(\+|-(\d+))?$/.exec(substituted);
  if (match === null) return undefined;
  // Native CategoryMatch::Matches reads a power's level from the bare number
  // in its <Category>. Records nearly always repeat it as a Level field, and
  // that field wins where the two disagree (four records); a power with only
  // the category number (Power Strike, Backstab) still has that level. Only
  // a power with no Level field at all falls back; an empty one stays level
  // 0 (cantrips and other at-wills match any "N" slot, as before).
  const levelField = entity.specifics.find(
    (field) => field.name.toLocaleLowerCase() === "level",
  )?.value;
  const entityLevel = Number(
    levelField !== undefined
      ? levelField
      : entity.type.toLocaleLowerCase() === "power"
        ? entity.categories.find((category) => /^\s*\d+\s*$/.test(category))
        : undefined,
  );
  if (!Number.isFinite(entityLevel)) return false;
  const minimum = Number(match[1]);
  if (match[2] === "+") return entityLevel >= minimum;
  // Native AddSingleEntry reads "N-M" as the exact level N (it only warns
  // when M differs), and CategoryMatch::Matches lets a power LoadRulesDatabase
  // flagged `_ThemePower` (or a magic item so flagged) of any level up to N
  // through. No shipped category uses the form.
  if (match[3] !== undefined) {
    const kind = entity.type.toLocaleLowerCase();
    const themePower =
      (kind === "power" || kind === "magic item") &&
      entity.specifics.some(
        (field) => field.name.toLocaleLowerCase() === "_themepower",
      );
    return themePower
      ? entityLevel !== 0 && entityLevel <= minimum
      : entityLevel === minimum;
  }
  if (entity.type.toLocaleLowerCase() === "power")
    return entityLevel <= minimum;
  return entityLevel === minimum;
}

export function matchesCategory(
  entity: ContentEntity,
  expression: CategoryExpression,
  context: ExpressionContext,
): boolean {
  const values = normalizedCategoryValues(entity, context);
  if (expression.dynamicPrefix !== undefined) {
    const prefix = expression.dynamicPrefix.toLocaleUpperCase();
    const allowed = context.dynamicCategories?.[prefix];
    if (allowed !== undefined) {
      const belongs = [...values].some((value) => allowed.has(value));
      if (prefix === "$$NOT_CLASS" ? belongs : !belongs) return false;
    }
  }
  return expression.groups.every((group) =>
    group.alternatives.some((term) => {
      const numeric = numericMatch(entity, term.value, context.level);
      const match = numeric ?? values.has(term.value.toLocaleLowerCase());
      return term.negated ? !match : match;
    }),
  );
}

export function evaluateRequires(
  expression: RequiresExpression,
  context: ExpressionContext,
): boolean {
  switch (expression.kind) {
    case "owned": {
      const token = namedValue(expression.token);
      return (context.namedOwned ?? context.owned).some((entity) =>
        namedValues(entity).some((value) => sameNamed(value, token)),
      );
    }
    case "category":
      return context.owned.some(
        (entity) =>
          same(entity.type, expression.type) &&
          matchesCategory(entity, expression.expression, context),
      );
    case "not":
      return !evaluateRequires(expression.operand, context);
    case "and":
      return expression.operands.every((operand) =>
        evaluateRequires(operand, context),
      );
    case "or":
      return expression.operands.some((operand) =>
        evaluateRequires(operand, context),
      );
  }
}
