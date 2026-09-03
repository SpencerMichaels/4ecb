import type { ContentEntity } from "@4ecb/content-domain";

export type PrerequisiteStatus = "satisfied" | "failed" | "unverified";

export interface PrerequisiteContext {
  readonly owned: readonly ContentEntity[];
  readonly level: number;
  readonly abilities: Readonly<Record<string, number>>;
  /** All definitions in the resolved content profile. */
  readonly definitions?: readonly ContentEntity[];
  /** The definition whose prerequisite is being internalized. */
  readonly subject?: ContentEntity;
  /** Compatibility indexes used while callers transition to resolved definitions. */
  readonly ownedTokens?: ReadonlySet<string>;
  readonly knownTokens?: ReadonlySet<string>;
}

export type PrerequisiteIr =
  | {
      readonly kind: "all" | "any";
      readonly text: string;
      readonly children: readonly PrerequisiteIr[];
    }
  | {
      readonly kind: "element";
      readonly text: string;
      readonly definitionIds: readonly string[];
      readonly negated: boolean;
    }
  | {
      readonly kind: "exclusive";
      readonly text: string;
      readonly definitionIds: readonly string[];
    }
  | {
      readonly kind: "ability";
      readonly text: string;
      readonly ability: string;
      readonly minimum: number;
    }
  | {
      readonly kind: "level";
      readonly text: string;
      readonly minimum: number;
      readonly maximum?: number;
    }
  | {
      readonly kind:
        | "class-source"
        | "class"
        | "training"
        | "proficiency"
        | "worship"
        | "worship-domain";
      readonly text: string;
      readonly value: string;
    }
  | { readonly kind: "hybrid" | "never"; readonly text: string }
  | { readonly kind: "unverified"; readonly text: string };

export interface PrerequisiteResult {
  readonly status: PrerequisiteStatus;
  readonly ir?: PrerequisiteIr;
  readonly clauses: readonly {
    readonly text: string;
    readonly status: PrerequisiteStatus;
  }[];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll("_", " ");
}

interface DefinitionIndex {
  readonly byNameOrId: ReadonlyMap<string, readonly ContentEntity[]>;
  readonly typesByLength: readonly string[];
}

const definitionIndexCache = new WeakMap<
  readonly ContentEntity[],
  DefinitionIndex
>();
const prerequisiteIrCache = new WeakMap<
  readonly ContentEntity[],
  Map<string, PrerequisiteIr>
>();

function definitionIndex(
  definitions: readonly ContentEntity[],
): DefinitionIndex {
  const cached = definitionIndexCache.get(definitions);
  if (cached !== undefined) return cached;
  const mutable = new Map<string, ContentEntity[]>();
  for (const definition of definitions)
    for (const token of new Set([
      normalized(definition.id),
      normalized(definition.name),
    ])) {
      const matches = mutable.get(token) ?? [];
      matches.push(definition);
      mutable.set(token, matches);
    }
  const index = {
    byNameOrId: mutable,
    typesByLength: [
      ...new Set(definitions.map((definition) => definition.type)),
    ].sort((left, right) => right.length - left.length),
  };
  definitionIndexCache.set(definitions, index);
  return index;
}

function fieldValues(
  entity: ContentEntity,
  names: readonly string[],
): string[] {
  return entity.specifics
    .filter((specific) =>
      names.some((name) => normalized(specific.name) === normalized(name)),
    )
    .flatMap((specific) => specific.value.split(/[,;]/))
    .map(normalized)
    .filter(Boolean);
}

interface Segment {
  readonly text: string;
  readonly delimiter: string;
}

/** Split only at depth zero, retaining the delimiter that introduced a part. */
function splitTopLevel(
  input: string,
  delimiters: readonly RegExp[],
): readonly Segment[] {
  const parts: Segment[] = [];
  let depth = 0;
  let start = 0;
  let delimiter = "";
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;
    const rest = input.slice(index);
    const match = delimiters
      .map((pattern) => pattern.exec(rest)?.[0])
      .find((candidate) => candidate !== undefined);
    if (match === undefined) continue;
    parts.push({ text: input.slice(start, index).trim(), delimiter });
    delimiter = match;
    index += match.length - 1;
    start = index + 1;
  }
  parts.push({ text: input.slice(start).trim(), delimiter });
  return parts.filter((part) => part.text.length > 0);
}

function hasOuterParentheses(input: string): boolean {
  if (!input.startsWith("(") || !input.endsWith(")")) return false;
  let depth = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === "(") depth += 1;
    else if (input[index] === ")") depth -= 1;
    if (depth === 0 && index < input.length - 1) return false;
  }
  return depth === 0;
}

function connective(
  kind: "all" | "any",
  text: string,
  children: readonly PrerequisiteIr[],
): PrerequisiteIr {
  if (children.length === 1 && children[0] !== undefined) return children[0];
  return { kind, text, children };
}

function resolveDefinitions(
  token: string,
  context: PrerequisiteContext,
  requiredType?: string,
): readonly ContentEntity[] {
  const definitions = context.definitions;
  if (definitions === undefined) return [];
  const wanted = normalized(token);
  return (definitionIndex(definitions).byNameOrId.get(wanted) ?? []).filter(
    (definition) =>
      (requiredType === undefined ||
        normalized(definition.type) === normalized(requiredType)) &&
      [definition.id, definition.name].some(
        (value) => normalized(value) === wanted,
      ),
  );
}

function typedReference(
  token: string,
  context: PrerequisiteContext,
): { readonly name: string; readonly type?: string } {
  const bracketed = /^(.+?)\s+\[[^\]]+\]\s+(.+)$/i.exec(token);
  if (bracketed?.[1] !== undefined && bracketed[2] !== undefined)
    return { name: bracketed[1], type: bracketed[2] };
  const knownTypes =
    context.definitions === undefined
      ? []
      : definitionIndex(context.definitions).typesByLength;
  for (const type of knownTypes) {
    const suffix = ` ${type}`;
    if (token.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase()))
      return { name: token.slice(0, -suffix.length), type };
    const prefix = `${type} `;
    if (token.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()))
      return { name: token.slice(prefix.length), type };
  }
  const legacyTyped = /^(.+?)\s+(feat|power)$/i.exec(token);
  return legacyTyped?.[1] !== undefined && legacyTyped[2] !== undefined
    ? { name: legacyTyped[1], type: legacyTyped[2] }
    : { name: token };
}

function markerAppears(prerequisite: string, marker: string): boolean {
  const wanted = marker.toLocaleLowerCase();
  const source = prerequisite.toLocaleLowerCase();
  let offset = 0;
  while ((offset = source.indexOf(wanted, offset)) >= 0) {
    const before = source[offset - 1];
    const after = source.slice(offset + wanted.length);
    if (
      (before === undefined || /[\s(,;]/.test(before)) &&
      (after.length === 0 || /^(?:\s*(?:[,;)]|\band\b|\bor\b))/.test(after))
    )
      return true;
    offset += wanted.length;
  }
  return false;
}

function internalizeLeaf(
  original: string,
  context: PrerequisiteContext,
): PrerequisiteIr {
  const text = original.trim();
  const canonical = text.replace(/[.]$/, "").trim();
  if (/^unselectable$/i.test(canonical)) return { kind: "never", text };
  if (canonical.startsWith("~")) {
    if (context.subject === undefined || context.definitions === undefined)
      return { kind: "unverified", text };
    const subject = context.subject;
    const definitionIds = context.definitions
      .filter(
        (definition) =>
          definition.id !== subject.id &&
          normalized(definition.type) === normalized(subject.type) &&
          definition.prerequisites !== undefined &&
          markerAppears(definition.prerequisites, canonical),
      )
      .map((definition) => definition.id);
    return { kind: "exclusive", text, definitionIds };
  }
  const score =
    /^(str(?:ength)?|con(?:stitution)?|dex(?:terity)?|int(?:elligence)?|wis(?:dom)?|cha(?:risma)?)\s+(\d+)$/i.exec(
      canonical,
    );
  if (score?.[1] !== undefined && score[2] !== undefined) {
    const abilities: Record<string, string> = {
      str: "Strength",
      strength: "Strength",
      con: "Constitution",
      constitution: "Constitution",
      dex: "Dexterity",
      dexterity: "Dexterity",
      int: "Intelligence",
      intelligence: "Intelligence",
      wis: "Wisdom",
      wisdom: "Wisdom",
      cha: "Charisma",
      charisma: "Charisma",
    };
    return {
      kind: "ability",
      text,
      ability: abilities[normalized(score[1])] ?? score[1],
      minimum: Number(score[2]),
    };
  }
  const level = /^(?:level\s+)?(\d+)(?:st|nd|rd|th)?(?:\s+level)?$/i.exec(
    canonical,
  );
  if (level?.[1] !== undefined)
    return { kind: "level", text, minimum: Number(level[1]) };
  if (/^heroic tier$/i.test(canonical))
    return { kind: "level", text, minimum: 1, maximum: 10 };
  if (/^paragon tier$/i.test(canonical))
    return { kind: "level", text, minimum: 11 };
  if (/^epic tier$/i.test(canonical))
    return { kind: "level", text, minimum: 21 };
  const training =
    /^(?:you must (?:be trained|have training)|trained) in (.+)$/i.exec(
      canonical,
    );
  if (training?.[1] !== undefined)
    return { kind: "training", text, value: training[1] };
  const source =
    /^any (arcane|divine|martial|primal|psionic|shadow) class$/i.exec(
      canonical,
    );
  if (source?.[1] !== undefined)
    return { kind: "class-source", text, value: source[1] };
  const className = /^(.+?)\s+class$/i.exec(canonical);
  if (className?.[1] !== undefined)
    return { kind: "class", text, value: className[1] };
  const domain = /^must worship (?:a deity of )?the (.+?) domain$/i.exec(
    canonical,
  );
  if (domain?.[1] !== undefined)
    return { kind: "worship-domain", text, value: domain[1] };
  const worship = /^must worship (.+)$/i.exec(canonical);
  if (worship?.[1] !== undefined)
    return { kind: "worship", text, value: worship[1] };
  const proficiency = /^(?:proficient|proficiency)\s+(?:with|in)\s+(.+)$/i.exec(
    canonical,
  );
  if (proficiency?.[1] !== undefined)
    return { kind: "proficiency", text, value: proficiency[1] };
  if (/^hybrid character$/i.test(canonical)) return { kind: "hybrid", text };

  const negated = canonical.startsWith("!");
  const bareReference = negated ? canonical.slice(1).trim() : canonical;
  const exactMatches = resolveDefinitions(bareReference, context);
  if (exactMatches.length > 0)
    return {
      kind: "element",
      text,
      definitionIds: exactMatches.map((definition) => definition.id),
      negated,
    };
  const reference = typedReference(bareReference, context);
  const matches = resolveDefinitions(reference.name, context, reference.type);
  if (matches.length > 0)
    return {
      kind: "element",
      text,
      definitionIds: matches.map((definition) => definition.id),
      negated,
    };
  const token = normalized(reference.name);
  const known = context.knownTokens?.has(token) ?? false;
  const owned = context.ownedTokens?.has(token) ?? false;
  if (known || owned)
    return { kind: "element", text, definitionIds: [token], negated };
  return { kind: "unverified", text };
}

function internalizeBlock(
  original: string,
  context: PrerequisiteContext,
): PrerequisiteIr {
  const text = original.trim();
  if (hasOuterParentheses(text))
    return internalizeBlock(text.slice(1, -1), context);
  const commaAnd = splitTopLevel(text, [
    /^,\s*(?:or\s+|and\s+)?/i,
    /^\s+and\s+/i,
  ]);
  if (commaAnd.length > 1) {
    const isOrList = commaAnd.some((part) =>
      /^,\s*or\s+/i.test(part.delimiter),
    );
    return connective(
      isOrList ? "any" : "all",
      text,
      commaAnd.map((part) => internalizeBlock(part.text, context)),
    );
  }
  const alternatives = splitTopLevel(text, [/^\s+or\s+/i]);
  if (alternatives.length > 1)
    return connective(
      "any",
      text,
      alternatives.map((part) => internalizeBlock(part.text, context)),
    );
  return internalizeLeaf(text, context);
}

export function internalizePrerequisite(
  prerequisite: string | undefined,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  if (prerequisite === undefined || prerequisite.trim().length === 0)
    return undefined;
  const definitions = context.definitions;
  const subject = context.subject;
  const cache =
    definitions === undefined || subject === undefined
      ? undefined
      : (prerequisiteIrCache.get(definitions) ??
        new Map<string, PrerequisiteIr>());
  if (
    definitions !== undefined &&
    cache !== undefined &&
    !prerequisiteIrCache.has(definitions)
  )
    prerequisiteIrCache.set(definitions, cache);
  const cacheKey = `${subject?.id ?? ""}\0${prerequisite}`;
  const cached = cache?.get(cacheKey);
  if (cached !== undefined) return cached;
  const blocks = splitTopLevel(prerequisite, [/^\s*;\s*/]);
  const result = connective(
    "all",
    prerequisite,
    blocks.map((block) => internalizeBlock(block.text, context)),
  );
  cache?.set(cacheKey, result);
  return result;
}

function ownsDefinition(
  context: PrerequisiteContext,
  definitionId: string,
): boolean {
  const wanted = normalized(definitionId);
  if (context.ownedTokens !== undefined) return context.ownedTokens.has(wanted);
  if (
    context.owned.some((entity) =>
      [
        entity.id,
        entity.name,
        `${entity.name} ${entity.type}`,
        `${entity.type} ${entity.name}`,
      ].some((value) => normalized(value) === wanted),
    )
  )
    return true;
  return false;
}

function aggregate(
  kind: "all" | "any",
  statuses: readonly PrerequisiteStatus[],
): PrerequisiteStatus {
  if (kind === "all") {
    if (statuses.includes("failed")) return "failed";
    return statuses.includes("unverified") ? "unverified" : "satisfied";
  }
  if (statuses.includes("satisfied")) return "satisfied";
  return statuses.includes("unverified") ? "unverified" : "failed";
}

export function evaluatePrerequisiteIr(
  ir: PrerequisiteIr,
  context: PrerequisiteContext,
): PrerequisiteStatus {
  switch (ir.kind) {
    case "all":
    case "any":
      return aggregate(
        ir.kind,
        ir.children.map((child) => evaluatePrerequisiteIr(child, context)),
      );
    case "element": {
      const owned = ir.definitionIds.some((id) => ownsDefinition(context, id));
      return ir.negated
        ? owned
          ? "failed"
          : "satisfied"
        : owned
          ? "satisfied"
          : "failed";
    }
    case "exclusive":
      return ir.definitionIds.some((id) => ownsDefinition(context, id))
        ? "failed"
        : "satisfied";
    case "ability":
      return (context.abilities[ir.ability] ?? 0) >= ir.minimum
        ? "satisfied"
        : "failed";
    case "level":
      return context.level >= ir.minimum &&
        (ir.maximum === undefined || context.level <= ir.maximum)
        ? "satisfied"
        : "failed";
    case "training":
      return context.owned.some(
        (entity) =>
          normalized(entity.type) === "skill training" &&
          normalized(entity.name) === normalized(ir.value),
      )
        ? "satisfied"
        : "failed";
    case "class-source":
      return context.owned.some(
        (entity) =>
          normalized(entity.type) === "power source" &&
          normalized(entity.name) === normalized(ir.value),
      )
        ? "satisfied"
        : "failed";
    case "class":
      return context.owned.some(
        (entity) =>
          ["class", "hybrid class"].includes(normalized(entity.type)) &&
          normalized(entity.name) === normalized(ir.value),
      )
        ? "satisfied"
        : "failed";
    case "worship":
      return context.owned.some(
        (entity) =>
          normalized(entity.type) === "deity" &&
          normalized(entity.name) === normalized(ir.value),
      )
        ? "satisfied"
        : "failed";
    case "worship-domain":
      return context.owned.some(
        (entity) =>
          normalized(entity.type) === "deity" &&
          [
            ...entity.categories.map(normalized),
            ...fieldValues(entity, ["Domain", "Domains"]),
          ].includes(normalized(ir.value)),
      )
        ? "satisfied"
        : "failed";
    case "proficiency": {
      const requested = normalized(ir.value)
        .replace(/^(?:a|an|the|any|all)\s+/i, "")
        .replace(/\b(?:armor|weapon)s?$/i, "")
        .trim();
      return context.owned.some(
        (entity) =>
          /proficien/i.test(`${entity.type} ${entity.name}`) &&
          normalized(entity.name).includes(requested),
      )
        ? "satisfied"
        : "unverified";
    }
    case "hybrid":
      return context.owned.some(
        (entity) => normalized(entity.type) === "hybrid class",
      )
        ? "satisfied"
        : "failed";
    case "never":
      return "failed";
    case "unverified":
      return "unverified";
  }
}

function leafResults(
  ir: PrerequisiteIr,
  context: PrerequisiteContext,
): PrerequisiteResult["clauses"] {
  if (ir.kind === "all" || ir.kind === "any")
    return ir.children.flatMap((child) => leafResults(child, context));
  return [{ text: ir.text, status: evaluatePrerequisiteIr(ir, context) }];
}

export function evaluatePrerequisite(
  prerequisite: string | undefined,
  context: PrerequisiteContext,
): PrerequisiteResult {
  const ir = internalizePrerequisite(prerequisite, context);
  if (ir === undefined) return { status: "satisfied", clauses: [] };
  return {
    status: evaluatePrerequisiteIr(ir, context),
    ir,
    clauses: leafResults(ir, context),
  };
}
