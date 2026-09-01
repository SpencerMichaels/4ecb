import type { ContentEntity } from "@4ecb/content-domain";

export interface PrerequisiteContext {
  readonly owned: readonly ContentEntity[];
  readonly level: number;
  readonly abilities: Readonly<Record<string, number>>;
  readonly ownedTokens?: ReadonlySet<string>;
}

export interface PrerequisiteResult {
  readonly status: "satisfied" | "failed" | "unverified";
  readonly clauses: readonly {
    readonly text: string;
    readonly status: "satisfied" | "failed" | "unverified";
  }[];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll("_", " ");
}

function owns(context: PrerequisiteContext, token: string): boolean {
  const wanted = normalized(token);
  if (context.ownedTokens !== undefined) return context.ownedTokens.has(wanted);
  return context.owned.some((entity) =>
    [
      entity.id,
      entity.name,
      `${entity.name} ${entity.type}`,
      `${entity.type} ${entity.name}`,
    ].some((value) => normalized(value) === wanted),
  );
}

function clauseStatus(
  original: string,
  context: PrerequisiteContext,
): "satisfied" | "failed" | "unverified" {
  const clause = original.trim();
  if (clause.length === 0) return "satisfied";
  const alternatives = clause.split(/\s+or\s+/i);
  if (alternatives.length > 1) {
    const results = alternatives.map((part) => clauseStatus(part, context));
    if (results.includes("satisfied")) return "satisfied";
    return results.includes("unverified") ? "unverified" : "failed";
  }
  if (clause.startsWith("!"))
    return owns(context, clause.slice(1)) ? "failed" : "satisfied";
  if (/^~[A-Z][A-Z0-9_-]*$/.test(clause)) {
    if (clause.toLocaleUpperCase() === "~MULTICLASS")
      return context.owned.some(
        (entity) =>
          normalized(entity.type) === "multiclass" ||
          normalized(entity.type) === "countsasclass",
      )
        ? "satisfied"
        : "failed";
    // Uppercase tilde markers are recovered native predicates used primarily on
    // race/category records. Their presence is a verified compatibility marker,
    // not prerequisite prose presented to the user.
    return "satisfied";
  }
  const score =
    /^(str(?:ength)?|con(?:stitution)?|dex(?:terity)?|int(?:elligence)?|wis(?:dom)?|cha(?:risma)?)\s+(\d+)$/i.exec(
      clause,
    );
  if (score?.[1] !== undefined && score[2] !== undefined) {
    const names: Record<string, string> = {
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
    const ability = names[normalized(score[1])];
    return ability !== undefined &&
      (context.abilities[ability] ?? 0) >= Number(score[2])
      ? "satisfied"
      : "failed";
  }
  const level = /^level\s+(\d+)$/i.exec(clause);
  if (level?.[1] !== undefined)
    return context.level >= Number(level[1]) ? "satisfied" : "failed";
  const trained = /^trained in (.+)$/i.exec(clause);
  if (trained?.[1] !== undefined)
    return context.owned.some(
      (entity) =>
        normalized(entity.type) === "skill training" &&
        normalized(entity.name) === normalized(trained[1] ?? ""),
    )
      ? "satisfied"
      : "failed";
  const anySource =
    /^any (arcane|divine|martial|primal|psionic|shadow) class$/i.exec(clause);
  if (anySource?.[1] !== undefined)
    return context.owned.some(
      (entity) =>
        normalized(entity.type) === "power source" &&
        normalized(entity.name) === normalized(anySource[1] ?? ""),
    )
      ? "satisfied"
      : "failed";
  if (owns(context, clause)) return "satisfied";
  return "unverified";
}

export function evaluatePrerequisite(
  prerequisite: string | undefined,
  context: PrerequisiteContext,
): PrerequisiteResult {
  if (prerequisite === undefined || prerequisite.trim().length === 0)
    return { status: "satisfied", clauses: [] };
  const clauses = prerequisite
    .split(/\s*;\s*|\s*,\s*/)
    .filter(Boolean)
    .map((text) => ({ text, status: clauseStatus(text, context) }));
  return {
    status: clauses.some((clause) => clause.status === "failed")
      ? "failed"
      : clauses.some((clause) => clause.status === "unverified")
        ? "unverified"
        : "satisfied",
    clauses,
  };
}
