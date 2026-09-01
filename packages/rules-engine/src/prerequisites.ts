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

function ownsTyped(
  context: PrerequisiteContext,
  name: string,
  type: string,
): boolean {
  return context.owned.some(
    (entity) =>
      normalized(entity.name) === normalized(name) &&
      normalized(entity.type) === normalized(type),
  );
}

function proficiencyStatus(
  clause: string,
  context: PrerequisiteContext,
): "satisfied" | "unverified" | undefined {
  const match = /^(?:proficient|proficiency)\s+(?:with|in)\s+(.+)$/i.exec(
    clause,
  );
  if (match?.[1] === undefined) return undefined;
  const requested = normalized(match[1]).replace(/[.]$/, "");
  const ownedProficiencies = context.owned.filter((entity) =>
    /proficien/i.test(`${entity.type} ${entity.name}`),
  );
  const terms = requested
    .split(/\s+or\s+|,\s*/i)
    .map((value) =>
      value
        .replace(/^(?:a|an|the|any|all)\s+/i, "")
        .replace(/\b(?:armor|weapon)s?$/i, "")
        .trim(),
    )
    .filter(Boolean);
  return terms.some((term) =>
    ownedProficiencies.some((entity) =>
      normalized(entity.name).includes(normalized(term)),
    ),
  )
    ? "satisfied"
    : "unverified";
}

function clauseStatus(
  original: string,
  context: PrerequisiteContext,
): "satisfied" | "failed" | "unverified" {
  const clause = original.trim();
  if (clause.length === 0) return "satisfied";
  const canonical = clause.replace(/[.]$/, "").trim();
  if (/^unselectable$/i.test(canonical)) return "failed";
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
  const ordinalLevel = /^(\d+)(?:st|nd|rd|th)\s+level$/i.exec(canonical);
  if (ordinalLevel?.[1] !== undefined)
    return context.level >= Number(ordinalLevel[1]) ? "satisfied" : "failed";
  if (/^heroic tier$/i.test(canonical))
    return context.level <= 10 ? "satisfied" : "failed";
  if (/^paragon tier$/i.test(canonical))
    return context.level >= 11 ? "satisfied" : "failed";
  if (/^epic tier$/i.test(canonical))
    return context.level >= 21 ? "satisfied" : "failed";
  const trained =
    /^(?:you must (?:be trained|have training)|trained) in (.+)$/i.exec(
      canonical,
    );
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
  const bracketedDefinition = /^(.+?)\s+\[[^\]]+\]\s+(feat|power)$/i.exec(
    canonical,
  );
  if (
    bracketedDefinition?.[1] !== undefined &&
    bracketedDefinition[2] !== undefined
  )
    return ownsTyped(context, bracketedDefinition[1], bracketedDefinition[2])
      ? "satisfied"
      : "failed";
  const className = /^(.+?)\s+class$/i.exec(canonical);
  if (className?.[1] !== undefined)
    return ownsTyped(context, className[1], "Class") ||
      ownsTyped(context, className[1], "Hybrid Class")
      ? "satisfied"
      : "failed";
  const worshipDomain = /^must worship (?:a deity of )?the (.+?) domain$/i.exec(
    canonical,
  );
  if (worshipDomain?.[1] !== undefined) {
    const domain = normalized(worshipDomain[1]);
    return context.owned.some(
      (entity) =>
        normalized(entity.type) === "deity" &&
        [
          ...entity.categories.map(normalized),
          ...fieldValues(entity, ["Domain", "Domains"]),
        ].includes(domain),
    )
      ? "satisfied"
      : "failed";
  }
  const worship = /^must worship (.+)$/i.exec(canonical);
  if (worship?.[1] !== undefined)
    return ownsTyped(context, worship[1], "Deity") ? "satisfied" : "failed";
  const proficiency = proficiencyStatus(canonical, context);
  if (proficiency !== undefined) return proficiency;
  if (/^hybrid character$/i.test(canonical))
    return context.owned.some(
      (entity) => normalized(entity.type) === "hybrid class",
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
