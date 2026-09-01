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
  readonly level: number;
  readonly dynamicCategories?: Readonly<Record<string, ReadonlySet<string>>>;
  readonly categoryAliases?: ReadonlyMap<string, ReadonlySet<string>>;
}

function same(left: string, right: string): boolean {
  return (
    left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0 ||
    left.toLocaleLowerCase() === right.toLocaleLowerCase()
  );
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

function numericMatch(
  entity: ContentEntity,
  value: string,
  level: number,
): boolean | undefined {
  const substituted =
    value.toLocaleUpperCase() === "$$LEVEL" ? String(level) : value;
  const match = /^(\d+)(\+|-(\d+))?$/.exec(substituted);
  if (match === null) return undefined;
  const entityLevel = Number(
    entity.specifics.find((field) => field.name.toLocaleLowerCase() === "level")
      ?.value,
  );
  if (!Number.isFinite(entityLevel)) return false;
  const minimum = Number(match[1]);
  if (match[2] === "+") return entityLevel >= minimum;
  if (match[3] !== undefined)
    return entityLevel >= minimum && entityLevel <= Number(match[3]);
  return entityLevel === minimum;
}

export function matchesCategory(
  entity: ContentEntity,
  expression: CategoryExpression,
  context: ExpressionContext,
): boolean {
  if (expression.dynamicPrefix !== undefined) {
    const prefix = expression.dynamicPrefix.toLocaleUpperCase();
    const allowed = context.dynamicCategories?.[prefix];
    if (allowed !== undefined) {
      const belongs = categoryValues(entity, context).some((value) =>
        allowed.has(value.toLocaleLowerCase()),
      );
      if (prefix === "$$NOT_CLASS" ? belongs : !belongs) return false;
    }
  }
  return expression.groups.every((group) =>
    group.alternatives.some((term) => {
      const numeric = numericMatch(entity, term.value, context.level);
      const match =
        numeric ??
        categoryValues(entity, context).some((value) =>
          same(value, term.value),
        );
      return term.negated ? !match : match;
    }),
  );
}

export function evaluateRequires(
  expression: RequiresExpression,
  context: ExpressionContext,
): boolean {
  switch (expression.kind) {
    case "owned":
      return context.owned.some(
        (entity) =>
          same(entity.id, expression.token) ||
          same(entity.name, expression.token) ||
          same(`${entity.name} ${entity.type}`, expression.token) ||
          same(`${entity.type} ${entity.name}`, expression.token),
      );
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
