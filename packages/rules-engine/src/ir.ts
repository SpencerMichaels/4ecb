import {
  getAttribute,
  type ContentAttribute,
  type RuleStatement,
} from "@4ecb/content-domain";

export interface LevelRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface RuleSource {
  readonly providerId: string;
  readonly ordinal: number;
  readonly original: RuleStatement;
  readonly level: LevelRange;
  readonly unknownAttributes: readonly ContentAttribute[];
}

interface BaseRule {
  readonly source: RuleSource;
  readonly requires?: string;
}

export interface StatAddRule extends BaseRule {
  readonly kind: "statadd";
  readonly name: string;
  readonly value: string;
  readonly bonusType?: string;
  readonly condition?: string;
  readonly wearing?: string;
  readonly notWearing?: string;
  readonly zero?: string;
  readonly nonZero?: string;
  readonly halfPoint?: string;
  readonly statMinimum?: string;
}

export interface TextStringRule extends BaseRule {
  readonly kind: "textstring";
  readonly name: string;
  readonly value: string;
  readonly condition?: string;
  readonly wearing?: string;
}

export interface StatAliasRule extends BaseRule {
  readonly kind: "statalias";
  readonly name: string;
  readonly alias: string;
}

export interface GrantRule extends BaseRule {
  readonly kind: "grant";
  readonly name: string;
  readonly type?: string;
}

export interface DropRule extends BaseRule {
  readonly kind: "drop";
  readonly name?: string;
  readonly type?: string;
  readonly select?: string;
}

export interface SelectRule extends BaseRule {
  readonly kind: "select";
  readonly type: string;
  readonly number: number;
  readonly category?: string;
  readonly name?: string;
  readonly spellbook?: string;
  readonly prepare?: string;
  readonly optional: boolean;
  readonly existing: boolean;
  readonly defaultId?: string;
  readonly grant?: string;
  readonly label?: string;
}

export interface ReplaceRule extends BaseRule {
  readonly kind: "replace";
  readonly name?: string;
  readonly optional: boolean;
  readonly multiclass?: string;
  readonly powerReplace?: string;
  readonly retrain?: string;
  readonly powerSwap?: string;
  readonly label?: string;
}

export interface SuggestRule extends BaseRule {
  readonly kind: "suggest";
  readonly name: string;
  readonly type: string;
}

export interface ModifyRule extends BaseRule {
  readonly kind: "modify";
  readonly field: string;
  readonly name?: string;
  readonly type?: string;
  readonly select?: string;
  readonly value?: string;
  readonly listAddition?: string;
  readonly dieIncrease?: string;
  readonly wearing?: string;
}

export interface UnknownRule extends BaseRule {
  readonly kind: "unknown";
  readonly statementName: string;
}

export type ExecutableRule =
  | StatAddRule
  | TextStringRule
  | StatAliasRule
  | GrantRule
  | DropRule
  | SelectRule
  | ReplaceRule
  | SuggestRule
  | ModifyRule
  | UnknownRule;

function optional(statement: RuleStatement, name: string): string | undefined {
  const value = getAttribute(statement.attributes, name)?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function required(statement: RuleStatement, name: string): string {
  return optional(statement, name) ?? "";
}

function boolean(value: string | undefined): boolean {
  return (
    value !== undefined &&
    !["false", "0", "no"].includes(value.toLocaleLowerCase())
  );
}

export function parseLevelRange(value: string | undefined): LevelRange {
  if (value === undefined || value.trim().length === 0)
    return { minimum: 1, maximum: 30 };
  const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(value.trim());
  if (match === null) return { minimum: 1, maximum: 30 };
  const minimum = Number(match[1]);
  const maximum = match[2] === undefined ? 30 : Number(match[2]);
  return {
    minimum: Math.max(1, minimum),
    maximum: Math.min(30, Math.max(minimum, maximum)),
  };
}

function source(
  providerId: string,
  statement: RuleStatement,
  known: readonly string[],
): RuleSource {
  const knownNames = new Set(
    [...known, "level"].map((name) => name.toLocaleLowerCase()),
  );
  return {
    providerId,
    ordinal: statement.ordinal,
    original: statement,
    level: parseLevelRange(optional(statement, "Level")),
    unknownAttributes: statement.attributes.filter(
      (attribute) => !knownNames.has(attribute.name.toLocaleLowerCase()),
    ),
  };
}

function base(
  providerId: string,
  statement: RuleStatement,
  known: readonly string[],
): BaseRule {
  const requires = optional(statement, "requires");
  return {
    source: source(providerId, statement, [...known, "requires"]),
    ...(requires === undefined ? {} : { requires }),
  };
}

export function parseRule(
  providerId: string,
  statement: RuleStatement,
): ExecutableRule {
  const kind = statement.name.toLocaleLowerCase();
  switch (kind) {
    case "statadd": {
      const common = base(providerId, statement, [
        "name",
        "value",
        "type",
        "condition",
        "wearing",
        "not-wearing",
        "zero",
        "non-zero",
        "half-point",
        "statmin",
      ]);
      const values = {
        bonusType: optional(statement, "type"),
        condition: optional(statement, "condition"),
        wearing: optional(statement, "wearing"),
        notWearing: optional(statement, "not-wearing"),
        zero: optional(statement, "zero"),
        nonZero: optional(statement, "non-zero"),
        halfPoint: optional(statement, "half-point"),
        statMinimum: optional(statement, "statmin"),
      };
      return {
        ...common,
        kind,
        name: required(statement, "name"),
        value: required(statement, "value"),
        ...Object.fromEntries(
          Object.entries(values).filter(([, value]) => value !== undefined),
        ),
      } as StatAddRule;
    }
    case "textstring": {
      const common = base(providerId, statement, [
        "name",
        "value",
        "condition",
        "wearing",
      ]);
      const condition = optional(statement, "condition");
      const wearing = optional(statement, "wearing");
      return {
        ...common,
        kind,
        name: required(statement, "name"),
        value: required(statement, "value"),
        ...(condition === undefined ? {} : { condition }),
        ...(wearing === undefined ? {} : { wearing }),
      };
    }
    case "statalias":
      return {
        ...base(providerId, statement, ["name", "alias"]),
        kind,
        name: required(statement, "name"),
        alias: required(statement, "alias"),
      };
    case "grant": {
      const type = optional(statement, "type");
      return {
        ...base(providerId, statement, ["name", "type"]),
        kind,
        name: required(statement, "name"),
        ...(type === undefined ? {} : { type }),
      };
    }
    case "drop": {
      const rule = base(providerId, statement, ["name", "type", "select"]);
      const name = optional(statement, "name");
      const type = optional(statement, "type");
      const select = optional(statement, "select");
      return {
        ...rule,
        kind,
        ...(name === undefined ? {} : { name }),
        ...(type === undefined ? {} : { type }),
        ...(select === undefined ? {} : { select }),
      };
    }
    case "select": {
      const rule = base(providerId, statement, [
        "type",
        "number",
        "category",
        "name",
        "spellbook",
        "prepare",
        "optional",
        "existing",
        "default",
        "grant",
      ]);
      const stringValues = {
        category: optional(statement, "Category"),
        name: optional(statement, "name"),
        spellbook: optional(statement, "spellbook"),
        prepare: optional(statement, "Prepare"),
        defaultId: optional(statement, "default"),
        grant: optional(statement, "grant"),
        label: statement.text.trim() || undefined,
      };
      return {
        ...rule,
        kind,
        type: required(statement, "type"),
        number:
          optional(statement, "number") === undefined
            ? 1
            : Math.max(
                0,
                Number.parseInt(required(statement, "number"), 10) || 0,
              ),
        optional: boolean(optional(statement, "optional")),
        existing: boolean(optional(statement, "existing")),
        ...Object.fromEntries(
          Object.entries(stringValues).filter(
            ([, value]) => value !== undefined,
          ),
        ),
      } as SelectRule;
    }
    case "replace": {
      const rule = base(providerId, statement, [
        "name",
        "optional",
        "multiclass",
        "power-replace",
        "retrain",
        "powerswap",
      ]);
      const values = {
        name: optional(statement, "name"),
        multiclass: optional(statement, "multiclass"),
        powerReplace: optional(statement, "power-replace"),
        retrain: optional(statement, "retrain"),
        powerSwap: optional(statement, "powerswap"),
        label: statement.text.trim() || undefined,
      };
      return {
        ...rule,
        kind,
        optional: boolean(optional(statement, "optional")),
        ...Object.fromEntries(
          Object.entries(values).filter(([, value]) => value !== undefined),
        ),
      } as ReplaceRule;
    }
    case "suggest":
      return {
        ...base(providerId, statement, ["name", "type"]),
        kind,
        name: required(statement, "name"),
        type: required(statement, "type"),
      };
    case "modify": {
      const rule = base(providerId, statement, [
        "field",
        "name",
        "type",
        "select",
        "value",
        "list-addition",
        "die-increase",
        "wearing",
      ]);
      const values = {
        name: optional(statement, "name"),
        type: optional(statement, "type"),
        select: optional(statement, "select"),
        value: optional(statement, "value"),
        listAddition: optional(statement, "list-addition"),
        dieIncrease: optional(statement, "die-increase"),
        wearing: optional(statement, "wearing"),
      };
      return {
        ...rule,
        kind,
        field: required(statement, "Field"),
        ...Object.fromEntries(
          Object.entries(values).filter(([, value]) => value !== undefined),
        ),
      } as ModifyRule;
    }
    default:
      return {
        ...base(providerId, statement, []),
        kind: "unknown",
        statementName: statement.name,
      };
  }
}

export function parseRules(
  providerId: string,
  statements: readonly RuleStatement[],
): ExecutableRule[] {
  return statements.map((statement) => parseRule(providerId, statement));
}
