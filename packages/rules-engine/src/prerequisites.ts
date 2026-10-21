import type { ContentEntity } from "@4ecb/content-domain";

import { EXCEPTION_IDS, EXCEPTION_NAMES } from "./exceptions";

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
  | {
      /** Legacy predicate prerequisites over the owned powers. */
      readonly kind: "predicate";
      readonly text: string;
      readonly predicate: "psionic-daily-attack" | "healing-infusion-power";
    }
  | { readonly kind: "hybrid" | "never" | "ignored"; readonly text: string }
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
  return value
    .trim()
    .toLocaleLowerCase()
    .replaceAll("_", " ")
    .replace(/[\u2018\u2019]/g, "'");
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

/**
 * Clauses the legacy engine skips as always met (`Ignore`): every playable
 * race is a living humanoid, and the rest are not checkable from a record.
 * `pnpm audit:legacy-special-cases` checks this list against the decompiled
 * engine.
 */
export const LEGACY_IGNORED_CLAUSES: ReadonlySet<string> = new Set([
  "living humanoid race",
  "humanoid race",
  "natural humanoid",
  "humanoid",
  "higher utility power",
  "member of the gatekeepers",
  "ability to mark a foe",
  "must adhere to amoth's precepts",
]);

const COUNTS_AS_ALTERNATES: Readonly<Record<string, string>> = {
  class: "CountsAsClass",
  "class feature": "CountsAsFeature",
  race: "CountsAsRace",
};

/**
 * Legacy CreateElementPrereq (ConnectAlternate): a class, class feature or
 * race requirement is also met by the same-named CountsAsClass,
 * CountsAsFeature or CountsAsRace element, which hybrid classes and their
 * hybrid class features grant. Negated requirements take no alternate.
 */
function withCountsAsAlternates(
  matches: readonly ContentEntity[],
  context: PrerequisiteContext,
): readonly ContentEntity[] {
  const alternates = matches.flatMap((definition) => {
    const type = COUNTS_AS_ALTERNATES[normalized(definition.type)];
    return type === undefined
      ? []
      : resolveDefinitions(definition.name, context, type);
  });
  return [
    ...matches,
    ...alternates.filter((alternate) => !matches.includes(alternate)),
  ];
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

/**
 * Legacy InternalizeBlock `Prefixes`: a clause prefix that limits the lookup
 * to one type, or (no type) is dropped. Table order is the legacy order.
 */
const LEGACY_PREFIXES: readonly (readonly [string, string | undefined])[] = [
  ["training in ", "Skill Training"],
  ["trained in ", "Skill Training"],
  ["you must be trained in ", "Skill Training"],
  ["you must have training in ", "Skill Training"],
  ["must worship a deity of the ", undefined],
  ["must worship ", "Deity"],
  ["you must worship ", "Deity"],
  ["worship ", "Deity"],
  ["follower of ", "Deity"],
  ["affiliated with ", "Background"],
  ["proficiency with ", "Proficiency"],
  ["proficient with ", "Proficiency"],
  ["can use the ", "Proficiency"],
  ["fluent in ", "Language"],
  ["be a ", undefined],
  ["must have the ", undefined],
  ["have the ", undefined],
  ["you must have the ", undefined],
  ["either ", undefined],
];

/** Legacy InternalizeItem `Suffixes`: a clause suffix that names the type. */
const LEGACY_SUFFIXES: readonly (readonly [string, string])[] = [
  [" elemental manifestation", "Racial Trait"],
  [" racial feature", "Racial Trait"],
  [" spell source", "Class Feature"],
  [" regional benefit", "Background"],
  [" regional background", "Background"],
  [" racial power", "Power"],
  [" channel divinity power", "Power"],
  [" paragon path feature", "Class Feature"],
  [" guild training", "Class Feature"],
  [" class character", "Class"],
];

function rawField(entity: ContentEntity, name: string): string {
  return (
    entity.specifics.find(
      (specific) => normalized(specific.name) === normalized(name),
    )?.value ?? ""
  );
}

function definitionsOfType(
  context: PrerequisiteContext,
  type: string,
): readonly ContentEntity[] {
  return (context.definitions ?? []).filter(
    (definition) => normalized(definition.type) === normalized(type),
  );
}

function elementOf(
  text: string,
  matches: readonly ContentEntity[],
): PrerequisiteIr | undefined {
  return matches.length === 0
    ? undefined
    : {
        kind: "element",
        text,
        definitionIds: [...new Set(matches.map((match) => match.id))],
        negated: false,
      };
}

/** Legacy InternalizeElement: every same-named record plus its CountsAs alternate. */
function namedElement(
  text: string,
  name: string,
  context: PrerequisiteContext,
  type?: string,
): PrerequisiteIr | undefined {
  return elementOf(
    text,
    withCountsAsAlternates(resolveDefinitions(name, context, type), context),
  );
}

/** Legacy CountsAsClassPowerSource: CountsAsClass records of a source's classes. */
function countsAsClassOfSource(
  source: string,
  context: PrerequisiteContext,
): readonly ContentEntity[] {
  return definitionsOfType(context, "CountsAsClass").filter((countsAs) =>
    resolveDefinitions(countsAs.name, context, "Class").some((entity) =>
      normalized(rawField(entity, "Power Source")).startsWith(
        normalized(source),
      ),
    ),
  );
}

const WEAPON_PROFICIENCY = /^weapon proficiency \((.+)\)$/;

/** Weapon proficiencies whose weapon (legacy ProficiencyWeapon) passes. */
function weaponProficiencies(
  text: string,
  context: PrerequisiteContext,
  test: (weapon: ContentEntity) => boolean,
): PrerequisiteIr | undefined {
  return elementOf(
    text,
    definitionsOfType(context, "Proficiency").filter((proficiency) => {
      const weapon = WEAPON_PROFICIENCY.exec(normalized(proficiency.name))?.[1];
      return (
        weapon !== undefined &&
        resolveDefinitions(weapon, context, "Weapon").some(test)
      );
    }),
  );
}

/** Weapon-property phrases from legacy ProficiencySpecialCase. */
const LEGACY_WEAPON_PHRASES: Readonly<
  Record<string, (weapon: ContentEntity) => boolean>
> = {
  "a bow": (weapon) => normalized(rawField(weapon, "Group")).includes("bow"),
  "a non-spear polearm": nonSpearPolearm,
  "any nonspear polearm": nonSpearPolearm,
  "a superior weapon": (weapon) =>
    normalized(rawField(weapon, "Weapon Category")).includes("superior"),
  "any heavy blade with the high critical property": highCritHeavyBlade,
  "any heavy blade that has the high crit property": highCritHeavyBlade,
  "mace that has the versatile property": (weapon) =>
    groupAndProperty(weapon, "mace", "versatile"),
  "any heavy blade that has the versatile property": (weapon) =>
    groupAndProperty(weapon, "heavy blade", "versatile"),
};

function groupAndProperty(
  weapon: ContentEntity,
  group: string,
  property: string,
): boolean {
  return (
    normalized(rawField(weapon, "Group")).includes(group) &&
    normalized(rawField(weapon, "Properties")).includes(property)
  );
}

function nonSpearPolearm(weapon: ContentEntity): boolean {
  const group = normalized(rawField(weapon, "Group"));
  return group.includes("polearm") && !group.includes("spear");
}

function highCritHeavyBlade(weapon: ContentEntity): boolean {
  return groupAndProperty(weapon, "heavy blade", "high crit");
}

/**
 * Legacy ProficiencySpecialCase, read under a "Proficiency with" prefix: a
 * weapon (optionally "the ..."), a weapon group (optionally "any ..."), a
 * hand-and-group form, or a weapon-property phrase.
 */
function proficiencySpecialCase(
  text: string,
  lower: string,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  const isWeapon = (name: string) =>
    resolveDefinitions(name, context, "Weapon").length > 0;
  const isGroup = (name: string) =>
    resolveDefinitions(name, context, "Weapon Group").length > 0;
  const weaponName = isWeapon(lower)
    ? lower
    : lower.startsWith("the ") && isWeapon(lower.slice(4))
      ? lower.slice(4)
      : undefined;
  if (weaponName !== undefined)
    return namedElement(
      text,
      `Weapon Proficiency (${weaponName})`,
      context,
      "Proficiency",
    );
  const group = /^(?:any )?(.+)$/.exec(lower)?.[1];
  if (group !== undefined && isGroup(group))
    return weaponProficiencies(text, context, (weapon) =>
      normalized(rawField(weapon, "Group")).includes(group),
    );
  const handed = /^(?:any )?(one|two)-handed (.+)$/.exec(lower);
  if (
    handed?.[1] !== undefined &&
    handed[2] !== undefined &&
    isGroup(handed[2])
  ) {
    const [, hands, handedGroup] = handed;
    return weaponProficiencies(
      text,
      context,
      (weapon) =>
        normalized(rawField(weapon, "Group")).includes(handedGroup) &&
        normalized(rawField(weapon, "Hands Required")) === `${hands}-handed`,
    );
  }
  const phrase = LEGACY_WEAPON_PHRASES[lower];
  return phrase === undefined
    ? undefined
    : weaponProficiencies(text, context, phrase);
}

/**
 * Legacy SpecialCase "paragon multiclassing in a martial class": Paragon
 * Multiclassing and a CountsAsClass of that source (generalized over sources).
 */
function paragonMulticlassingInSource(
  text: string,
  canonical: string,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  const source = /^paragon multiclassing in an? (\S+) class$/i.exec(
    canonical.trim(),
  )?.[1];
  if (source === undefined || context.definitions === undefined)
    return undefined;
  const path = elementOf(
    text,
    resolveDefinitions(EXCEPTION_IDS.paragonMulticlassing, context),
  );
  const countsAs = elementOf(text, countsAsClassOfSource(source, context));
  return path === undefined || countsAs === undefined
    ? undefined
    : { kind: "all", text, children: [path, countsAs] };
}

/** "multiclass X" feat type remainder, or undefined. */
function multiclassTarget(feat: ContentEntity): string | undefined {
  const type = rawField(feat, "type").trim();
  return /^multiclass .+/i.test(type) ? type.slice(11).trim() : undefined;
}

function isPsionicClass(entity: ContentEntity): boolean {
  return normalized(rawField(entity, "_PARSED_CLASS_FEATURE")).includes(
    normalized(EXCEPTION_NAMES.psionicAugmentation),
  );
}

/** Legacy AnyFeat: feats whose `type` field contains the named kind. */
function anyFeat(
  text: string,
  kind: string,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  const wanted = normalized(kind);
  return elementOf(
    text,
    definitionsOfType(context, "Feat").filter((feat) =>
      normalized(rawField(feat, "type")).includes(wanted),
    ),
  );
}

/** Legacy AnyClassSpecific / AnyClassMoreSpecific / AnyClassNoPsi / RememberedKnack. */
function classSpecificFamily(
  text: string,
  lower: string,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  const feats = definitionsOfType(context, "Feat");
  const classNamed = (name: string, type = "Class") =>
    resolveDefinitions(name, context, type)[0];
  if (lower === "any class-specific multiclass feat")
    return elementOf(
      text,
      feats.filter((feat) => {
        if (
          [
            EXCEPTION_NAMES.studentOfThePlague,
            EXCEPTION_NAMES.adeptDilettante,
          ].some((name) => normalized(name) === normalized(feat.name))
        )
          return true;
        const target = multiclassTarget(feat);
        return target !== undefined && classNamed(target) !== undefined;
      }),
    );
  const psionic =
    /^any class[- ]specific multiclass feat for a class that (has|doesn't have) the psionic augmentation class feature$/.exec(
      lower,
    );
  if (psionic?.[1] !== undefined) {
    const wanted = psionic[1] === "has";
    return elementOf(
      text,
      feats.filter((feat) => {
        const target = multiclassTarget(feat);
        if (target === undefined) return false;
        const owner = classNamed(target) ?? classNamed(target, "Pseudo Class");
        return owner !== undefined && isPsionicClass(owner) === wanted;
      }),
    );
  }
  if (
    lower ===
    "any class that doesn't have the psionic augmentation class feature"
  )
    return elementOf(
      text,
      withCountsAsAlternates(
        definitionsOfType(context, "Class").filter(
          (entity) => !isPsionicClass(entity),
        ),
        context,
      ),
    );
  if (
    lower ===
    "any class-specific multiclassing feat that grants training in a skill"
  )
    return elementOf(
      text,
      feats.filter(
        (feat) =>
          multiclassTarget(feat) !== undefined &&
          feat.rules.some(
            (rule) =>
              ["grant", "select"].includes(normalized(rule.name)) &&
              rule.attributes.some(
                (attribute) =>
                  normalized(attribute.name) === "type" &&
                  normalized(attribute.value) === "skill training",
              ),
          ),
      ),
    );
  return undefined;
}

/**
 * Legacy InternalizeElement and SpecialCase grammar for a clause the modern
 * parser does not otherwise read: the prefix and suffix type tables, the
 * "name type" complex-name lookup, and SpecialCase's generic families (race
 * plus class, any X feat, paragon multiclassing, class-specific multiclass
 * feats, warlock pacts and owned-power predicates). Exact-text aliases from
 * the same table are content corrections (D089), not code.
 */
function legacyClause(
  text: string,
  canonical: string,
  context: PrerequisiteContext,
  inheritedType?: string,
): PrerequisiteIr | undefined {
  if (context.definitions === undefined) return undefined;
  const lower = normalized(canonical).replace(/\s+/g, " ");
  // A "Proficiency with ..." prefix carries to the next comma parts.
  if (
    inheritedType === "Proficiency" &&
    legacyPrefixType(canonical) === undefined
  ) {
    const proficiency = proficiencySpecialCase(text, lower, context);
    if (proficiency !== undefined) return proficiency;
  }
  const armor = /^training with (.+?)(?: armor\b.*)?$/.exec(lower);
  if (armor?.[1] !== undefined)
    return namedElement(
      text,
      `Armor Proficiency (${armor[1]})`,
      context,
      "Proficiency",
    );
  const prefix = LEGACY_PREFIXES.find(
    ([candidate]) =>
      lower.length > candidate.length && lower.startsWith(candidate),
  );
  if (prefix !== undefined) {
    const rest = canonical.trim().slice(prefix[0].length).trim();
    const type = prefix[1];
    if (type === "Skill Training")
      return { kind: "training", text, value: rest };
    if (type === "Proficiency")
      return { kind: "proficiency", text, value: rest };
    if (type !== undefined) return namedElement(text, rest, context, type);
    const inner = internalizeLeaf(rest, context);
    return inner.kind === "unverified" ? undefined : { ...inner, text };
  }
  const suffix = LEGACY_SUFFIXES.find(
    ([candidate]) =>
      lower.length > candidate.length && lower.endsWith(candidate),
  );
  if (suffix !== undefined)
    return namedElement(
      text,
      canonical.trim().slice(0, -suffix[0].length),
      context,
      suffix[1],
    );
  // The complex "name type" lookup, for every type the clause may end with.
  for (const type of definitionIndex(context.definitions).typesByLength) {
    const ending = ` ${normalized(type)}`;
    if (lower.length <= ending.length || !lower.endsWith(ending)) continue;
    const typed = namedElement(
      text,
      canonical.trim().slice(0, -ending.length),
      context,
      type,
    );
    if (typed !== undefined) return typed;
  }
  const family = classSpecificFamily(text, lower, context);
  if (family !== undefined) return family;
  if (lower === "any warlock pact")
    return elementOf(text, [
      ...definitionsOfType(context, "CountsAsPact"),
      ...definitionsOfType(context, "Class Feature").filter((feature) =>
        feature.categories.some((category) =>
          normalized(category).includes("eldritch pact"),
        ),
      ),
    ]);
  const space = lower.indexOf(" ");
  if (space > 0) {
    const race = canonical.trim().slice(0, space);
    const className = canonical.trim().slice(space + 1);
    if (
      resolveDefinitions(race, context, "Race").length > 0 &&
      resolveDefinitions(className, context, "Class").length > 0
    ) {
      const left = namedElement(race, race, context);
      const right = namedElement(className, className, context);
      if (left !== undefined && right !== undefined)
        return { kind: "all", text, children: [left, right] };
    }
  }
  const feat = /^(?:any|at least one) (.+) feat$/.exec(lower);
  if (feat?.[1] !== undefined) return anyFeat(text, feat[1], context);
  const paragon = /^paragon multiclassing as (?:an? )?(.+)$/.exec(lower);
  if (paragon?.[1] !== undefined) {
    const path = elementOf(
      text,
      resolveDefinitions(EXCEPTION_IDS.paragonMulticlassing, context),
    );
    const multiclass = anyFeat(text, `multiclass ${paragon[1]}`, context);
    return path === undefined || multiclass === undefined
      ? undefined
      : { kind: "all", text, children: [path, multiclass] };
  }
  if (lower === "at least one psionic daily attack power")
    return { kind: "predicate", text, predicate: "psionic-daily-attack" };
  if (lower === "at least one healing infusion power")
    return { kind: "predicate", text, predicate: "healing-infusion-power" };
  return undefined;
}

function internalizeLeaf(
  original: string,
  context: PrerequisiteContext,
  inheritedType?: string,
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
  // Legacy SpecialCase also reads "Nth-level".
  const level = /^(?:level\s+)?(\d+)(?:st|nd|rd|th)?(?:[\s-]+level)?$/i.exec(
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
    /^(?:you must (?:be trained|have training)|trained|training) in (.+)$/i.exec(
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
  const paragonInSource = paragonMulticlassingInSource(
    text,
    canonical,
    context,
  );
  if (paragonInSource !== undefined) return paragonInSource;
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
  const implementUse = /^can use the (.+?) implement$/i.exec(canonical);
  if (implementUse?.[1] !== undefined) {
    const matches = resolveDefinitions(
      `Implement Proficiency (${implementUse[1]})`,
      context,
      "Proficiency",
    );
    if (matches.length > 0)
      return {
        kind: "element",
        text,
        definitionIds: matches.map((definition) => definition.id),
        negated: false,
      };
    return { kind: "unverified", text };
  }
  const proficiency = /^(?:proficient|proficiency)\s+(?:with|in)\s+(.+)$/i.exec(
    canonical,
  );
  if (proficiency?.[1] !== undefined)
    return { kind: "proficiency", text, value: proficiency[1] };
  if (/^hybrid character$/i.test(canonical)) return { kind: "hybrid", text };
  if (LEGACY_IGNORED_CLAUSES.has(normalized(canonical)))
    return { kind: "ignored", text };

  const negated = canonical.startsWith("!");
  const bareReference = negated ? canonical.slice(1).trim() : canonical;
  const exactResolved = resolveDefinitions(bareReference, context);
  const exactMatches = negated
    ? exactResolved
    : withCountsAsAlternates(exactResolved, context);
  if (exactMatches.length > 0)
    return {
      kind: "element",
      text,
      definitionIds: exactMatches.map((definition) => definition.id),
      negated,
    };
  const reference = typedReference(bareReference, context);
  const resolved = resolveDefinitions(reference.name, context, reference.type);
  const matches = negated
    ? resolved
    : withCountsAsAlternates(resolved, context);
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
  return (
    (negated
      ? undefined
      : legacyClause(text, canonical, context, inheritedType)) ?? {
      kind: "unverified",
      text,
    }
  );
}

/**
 * The type a legacy prefix sets for this comma part, `null` for a prefix
 * that clears it, or undefined when the part has no prefix (legacy
 * InternalizeBlock then keeps the previous part's type).
 */
function legacyPrefixType(text: string): string | null | undefined {
  const lower = normalized(text).replace(/\s+/g, " ");
  const prefix = LEGACY_PREFIXES.find(
    ([candidate]) =>
      lower.length > candidate.length && lower.startsWith(candidate),
  );
  return prefix === undefined ? undefined : (prefix[1] ?? null);
}

function internalizeBlock(
  original: string,
  context: PrerequisiteContext,
  inheritedType?: string,
): PrerequisiteIr {
  const text = original.trim();
  if (hasOuterParentheses(text))
    return internalizeBlock(text.slice(1, -1), context, inheritedType);
  const commaAnd = splitTopLevel(text, [
    /^,\s*(?:or\s+|and\s+)?/i,
    /^\s+and\s+/i,
  ]);
  if (commaAnd.length > 1) {
    let type = inheritedType;
    const isOrList = commaAnd.some((part) =>
      /^,\s*or\s+/i.test(part.delimiter),
    );
    return connective(
      isOrList ? "any" : "all",
      text,
      commaAnd.map((part) => {
        const prefixType = legacyPrefixType(part.text);
        if (prefixType !== undefined) type = prefixType ?? undefined;
        return internalizeBlock(part.text, context, type);
      }),
    );
  }
  // Legacy InternalizeOr does not split "1 or more".
  const alternatives = /\b1\s+or\s+more\b/i.test(text)
    ? [{ text, delimiter: "" }]
    : splitTopLevel(text, [/^\s+or\s+/i]);
  if (alternatives.length > 1) {
    const prefixType = legacyPrefixType(text);
    const type =
      prefixType === undefined ? inheritedType : (prefixType ?? undefined);
    return connective(
      "any",
      text,
      alternatives.map((part) => internalizeBlock(part.text, context, type)),
    );
  }
  return internalizeLeaf(text, context, inheritedType);
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
      // A hybrid owns "Hybrid Warlord" and a CountsAsClass named "Warlord".
      return context.owned.some(
        (entity) =>
          ["class", "hybrid class", "countsasclass"].includes(
            normalized(entity.type),
          ) && normalized(entity.name) === normalized(ir.value),
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
    case "predicate":
      return context.owned.some(
        (entity) =>
          normalized(entity.type) === "power" &&
          (ir.predicate === "healing-infusion-power"
            ? normalized(entity.name).startsWith(
                normalized(EXCEPTION_NAMES.healingInfusionPrefix),
              )
            : normalized(rawField(entity, "Power Type")) === "attack" &&
              normalized(rawField(entity, "Power Usage")) === "daily" &&
              normalized(rawField(entity, "Keywords")).includes("psionic")),
      )
        ? "satisfied"
        : "failed";
    case "ignored":
      return "satisfied";
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
