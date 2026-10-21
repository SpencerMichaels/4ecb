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
  /** Normalized names that contain a block connector, longest first. */
  readonly connectorNames: readonly string[];
}

/** Text the block grammar splits at: a comma, ` and ` or ` or `. */
const CONNECTOR = /,|\s(?:and|or)\s/i;

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
    connectorNames: [
      ...new Set(
        definitions
          .map((definition) => normalized(definition.name))
          .filter((name) => CONNECTOR.test(name)),
      ),
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

interface Span {
  readonly start: number;
  readonly end: number;
}

const WORD_CHARACTER = /[\p{L}\p{N}'-]/u;

/**
 * Where the text names a known record whose name contains a connector
 * ("Circle of Smoke and Whispers"), longest name first, so the block grammar
 * never splits inside a name. Legacy LineParse splits at every depth-zero
 * comma and ` and `, and keeps only its one such clause whole by a literal
 * InternalizeBlock check; this keeps every such name whole.
 */
function knownNameSpans(
  input: string,
  context: PrerequisiteContext,
): readonly Span[] {
  if (context.definitions === undefined || !CONNECTOR.test(input)) return [];
  const source = input
    .toLocaleLowerCase()
    .replaceAll("_", " ")
    .replace(/[\u2018\u2019]/g, "'");
  const spans: Span[] = [];
  for (const name of definitionIndex(context.definitions).connectorNames) {
    let start = source.indexOf(name);
    while (start >= 0) {
      const end = start + name.length;
      if (
        !WORD_CHARACTER.test(source[start - 1] ?? " ") &&
        !WORD_CHARACTER.test(source[end] ?? " ") &&
        !spans.some((span) => start < span.end && span.start < end)
      )
        spans.push({ start, end });
      start = source.indexOf(name, start + 1);
    }
  }
  return spans;
}

/**
 * Split only at depth zero and outside the protected spans, retaining the
 * delimiter that introduced a part.
 */
function splitTopLevel(
  input: string,
  delimiters: readonly RegExp[],
  protectedSpans: readonly Span[] = [],
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
    if (protectedSpans.some((span) => span.start < index && index < span.end))
      continue;
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

const LEADING_ARTICLE = /^(?:the|an?)\s+/i;

/**
 * A record of that type by name, else without a leading article ("the
 * Dalelands"), else, when no record has the name, every "<name> (<variant>)"
 * record of the type: legacy SpecialCase reads "Cormyr" as either Cormyr
 * background, generalized.
 */
function typedElement(
  text: string,
  name: string,
  context: PrerequisiteContext,
  type: string,
): PrerequisiteIr | undefined {
  const exact = namedElement(text, name, context, type);
  if (exact !== undefined) return exact;
  const bare = name.trim().replace(LEADING_ARTICLE, "").trim();
  if (bare !== name.trim()) {
    const stripped = namedElement(text, bare, context, type);
    if (stripped !== undefined) return stripped;
  }
  const variant = `${normalized(bare)} (`;
  return elementOf(
    text,
    definitionsOfType(context, type).filter((definition) => {
      const candidate = normalized(definition.name);
      return candidate.startsWith(variant) && candidate.endsWith(")");
    }),
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
  if (phrase !== undefined) return weaponProficiencies(text, context, phrase);
  // The property phrases above, generalized: "any <group> that has the
  // <property> property" for any weapon group and weapon property.
  const qualified =
    /^(?:any |an? )?(.+?) (?:that has|with) the (.+?) property$/.exec(lower);
  if (
    qualified?.[1] !== undefined &&
    qualified[2] !== undefined &&
    isGroup(qualified[1]) &&
    resolveDefinitions(qualified[2], context, "Weapon Property").length > 0
  ) {
    const [, propertyGroup, property] = qualified;
    return weaponProficiencies(text, context, (weapon) =>
      groupAndProperty(weapon, propertyGroup, normalized(property)),
    );
  }
  // "a superior weapon", generalized: "a military melee weapon" is any
  // weapon of that category.
  const category = /^(?:any |an? )(.+?) weapons?$/.exec(lower)?.[1];
  if (category !== undefined) {
    const categoryWeapons = weaponProficiencies(text, context, (weapon) =>
      normalized(rawField(weapon, "Weapon Category")).includes(category),
    );
    if (categoryWeapons !== undefined) return categoryWeapons;
  }
  // Legacy's armor and shield literals ("hide armor", "chainmail", "heavy
  // shields"), generalized: the armor or shield proficiency of that name.
  const armor = /^(.+?)(?: armor)?$/.exec(lower)?.[1];
  const armorProficiency =
    armor === undefined
      ? undefined
      : namedElement(
          text,
          `Armor Proficiency (${armor})`,
          context,
          "Proficiency",
        );
  if (armorProficiency !== undefined) return armorProficiency;
  const shield = /^(.+?) shields?$/.exec(lower)?.[1];
  return shield === undefined
    ? undefined
    : namedElement(
        text,
        `Shield Proficiency (${shield})`,
        context,
        "Proficiency",
      );
}

const CLASS_TYPES: ReadonlySet<string> = new Set([
  "class",
  "hybrid class",
  "countsasclass",
]);

/** Whether "<name> class" names a class (always, without definitions). */
function isClassName(name: string, context: PrerequisiteContext): boolean {
  if (context.definitions === undefined) return !name.trim().startsWith("!");
  return resolveDefinitions(name, context).some((definition) =>
    CLASS_TYPES.has(normalized(definition.type)),
  );
}

/**
 * Legacy InternalizeBlock: a prefix's type limits every later part it
 * carries to (CreateElementPrereq skips records of any other type), so
 * "trained in Bluff or Stealth" reads Stealth as a skill training and
 * "proficiency with longbow or shortbow" reads shortbow as a proficiency.
 * Undefined when nothing of that type matches, and the part is then read as
 * if it had no prefix.
 */
function inheritedTypeClause(
  text: string,
  canonical: string,
  context: PrerequisiteContext,
  type: string,
): PrerequisiteIr | undefined {
  const name = canonical.trim();
  if (type === "Skill Training")
    return resolveDefinitions(name, context, type).length > 0
      ? { kind: "training", text, value: name }
      : undefined;
  if (type === "Proficiency")
    return proficiencySpecialCase(
      text,
      normalized(name).replace(/\s+/g, " "),
      context,
    );
  return typedElement(text, name, context, type);
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
): PrerequisiteIr | undefined {
  if (context.definitions === undefined) return undefined;
  const lower = normalized(canonical).replace(/\s+/g, " ");
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
    if (type !== undefined) return typedElement(text, rest, context, type);
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
  // Legacy SpecialCase "any defender (class)" (generalized over roles).
  const role = /^any (.+?)(?: class)?$/.exec(lower)?.[1];
  const roleElement =
    role === undefined ? undefined : namedElement(text, role, context, "Role");
  if (roleElement !== undefined) return roleElement;
  // Legacy MulticlassDivine (generalized over sources): a multiclass feat
  // for a class of that power source.
  const multiclassSource = /^multiclass (\S+) class$/.exec(lower)?.[1];
  if (multiclassSource !== undefined)
    return elementOf(
      text,
      definitionsOfType(context, "Feat").filter((feat) => {
        const target = multiclassTarget(feat);
        return (
          target !== undefined &&
          resolveDefinitions(target, context, "Class").some((entity) =>
            normalized(rawField(entity, "Power Source")).startsWith(
              multiclassSource,
            ),
          )
        );
      }),
    );
  // Legacy MoreThanOneClass: any CountsAsClass, or the Hybrid class.
  if (lower === "must have more than one class")
    return elementOf(text, [
      ...definitionsOfType(context, "CountsAsClass"),
      ...resolveDefinitions(EXCEPTION_NAMES.hybridClass, context, "Class"),
    ]);
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
  return (
    qualifiedClass(text, lower, context) ??
    qualifiedClause(text, canonical.trim(), context)
  );
}

/** Whether a class's power source (its field's first sentence) names this source. */
function classHasSource(entity: ContentEntity, source: string): boolean {
  const sources = normalized(rawField(entity, "Power Source")).split(".")[0];
  return (sources ?? "").split(/\W+/).includes(source);
}

/**
 * "[any] <source> class that can use an implement" (a class whose
 * Implements field names one) and "... that uses power points" (a class
 * with the Psionic Augmentation class feature, which grants power points),
 * with each class's CountsAsClass alternate. Legacy reads neither.
 */
function qualifiedClass(
  text: string,
  lower: string,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  const match =
    /^(?:any )?(\S+) class that (can use an implement|uses power points)$/.exec(
      lower,
    );
  if (
    match?.[1] === undefined ||
    match[2] === undefined ||
    resolveDefinitions(match[1], context, "Power Source").length === 0
  )
    return undefined;
  const [, source, qualifier] = match;
  return elementOf(
    text,
    withCountsAsAlternates(
      definitionsOfType(context, "Class").filter(
        (entity) =>
          classHasSource(entity, source) &&
          (qualifier === "uses power points"
            ? isPsionicClass(entity)
            : rawField(entity, "Implements").trim().length > 0),
      ),
      context,
    ),
  );
}

/**
 * A clause that joins two requirements in one phrase, read as both (legacy
 * reads only "<race> <class>"; the rest are Unrecognized, always failing):
 *
 * - "21st-level wizard": that level and a wizard;
 * - "<A> with the <B>": "warlock with the fey pact", "Human with the
 *   Tuathan theme";
 * - "<A> from <place>": A and the place's regional background, unverified
 *   when the content has no such background (a story-only region, D090);
 * - "<B> <class>": "infernal pact warlock";
 * - "the <X>": X ("either the oath of enmity").
 *
 * Each side must resolve (the place excepted), so prose stays unverified.
 */
function qualifiedClause(
  text: string,
  canonical: string,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  const read = (part: string) => {
    const ir = internalizeLeaf(part, context);
    return resolves(ir, context) ? ir : undefined;
  };
  const both = (
    left: PrerequisiteIr | undefined,
    right: PrerequisiteIr | undefined,
  ): PrerequisiteIr | undefined =>
    left === undefined || right === undefined
      ? undefined
      : { kind: "all", text, children: [left, right] };
  const levelled = /^((\d+)(?:st|nd|rd|th)[\s-]+level)\s+(.+)$/i.exec(
    canonical,
  );
  if (
    levelled?.[1] !== undefined &&
    levelled[2] !== undefined &&
    levelled[3] !== undefined
  ) {
    const joined = both(
      {
        kind: "level",
        text: levelled[1],
        minimum: Number(levelled[2]),
      },
      read(levelled[3]),
    );
    if (joined !== undefined) return joined;
  }
  const withQualifier = /^(.+?)\s+with\s+(?:the\s+|an?\s+)?(.+)$/i.exec(
    canonical,
  );
  if (withQualifier?.[1] !== undefined && withQualifier[2] !== undefined) {
    const joined = both(read(withQualifier[1]), read(withQualifier[2]));
    if (joined !== undefined) return joined;
  }
  const fromPlace = /^(.+?)\s+from\s+(.+)$/i.exec(canonical);
  if (fromPlace?.[1] !== undefined && fromPlace[2] !== undefined) {
    const place = fromPlace[2];
    const joined = both(
      read(fromPlace[1]),
      typedElement(place, place, context, "Background") ??
        read(place) ?? { kind: "unverified", text: place },
    );
    if (joined !== undefined) return joined;
  }
  const words = canonical.split(/\s+/);
  for (let split = words.length - 1; split >= 1; split -= 1) {
    const className = words.slice(split).join(" ");
    if (resolveDefinitions(className, context, "Class").length === 0) continue;
    const joined = both(
      read(words.slice(0, split).join(" ")),
      namedElement(className, className, context),
    );
    if (joined !== undefined) return joined;
  }
  return LEADING_ARTICLE.test(canonical)
    ? read(canonical.replace(LEADING_ARTICLE, ""))
    : undefined;
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
  // Legacy SpecialCase reads "Arcane Class" as "Any Arcane Class"
  // (generalized over sources).
  const source =
    /^(?:any )?(arcane|divine|martial|primal|psionic|shadow) class$/i.exec(
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
  if (className?.[1] !== undefined && isClassName(className[1], context))
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
  if (inheritedType !== undefined && !negated) {
    const typed = inheritedTypeClause(text, canonical, context, inheritedType);
    if (typed !== undefined) return typed;
  }
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
    (negated ? undefined : legacyClause(text, canonical, context)) ?? {
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

const COUNT_WORDS: Readonly<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
};

/**
 * Legacy HarperTraining, generalized: "training in any two of A, B, C, or D"
 * is one clause (any pair of those trainings), read before the block is
 * split at its commas.
 */
function trainingInAnyOf(
  text: string,
  context: PrerequisiteContext,
): PrerequisiteIr | undefined {
  const match =
    /^(?:you must (?:be trained|have training)|trained|training) in any (two|three|four|\d+) of (.+?)\.?$/i.exec(
      text,
    );
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  const count = COUNT_WORDS[match[1].toLocaleLowerCase()] ?? Number(match[1]);
  const skills = splitTopLevel(
    match[2],
    [/^,\s*(?:or\s+|and\s+)?/i, /^\s+(?:or|and)\s+/i],
    knownNameSpans(match[2], context),
  ).map((part) => part.text);
  if (count < 1 || count > skills.length) return undefined;
  const combinations = (from: number, size: number): string[][] =>
    size === 0
      ? [[]]
      : skills
          .slice(from)
          .flatMap((skill, offset) =>
            combinations(from + offset + 1, size - 1).map((rest) => [
              skill,
              ...rest,
            ]),
          );
  return connective(
    "any",
    text,
    combinations(0, count).map((chosen) =>
      connective(
        "all",
        chosen.map((skill) => `training in ${skill}`).join(" and "),
        chosen.map((skill) => ({
          kind: "training",
          text: `training in ${skill}`,
          value: skill,
        })),
      ),
    ),
  );
}

function internalizeBlock(
  original: string,
  context: PrerequisiteContext,
  inheritedType?: string,
): PrerequisiteIr {
  const text = original.trim();
  if (hasOuterParentheses(text))
    return internalizeBlock(text.slice(1, -1), context, inheritedType);
  const anyOf = trainingInAnyOf(text, context);
  if (anyOf !== undefined) return anyOf;
  const names = knownNameSpans(text, context);
  const commaAnd = splitTopLevel(
    text,
    [/^,\s*(?:or\s+|and\s+)?/i, /^\s+and\s+/i],
    names,
  );
  if (commaAnd.length > 1) {
    const isOrList = commaAnd.some((part) =>
      /^,\s*or\s+/i.test(part.delimiter),
    );
    // In "A, or B and C" the bare " and " joins B and C inside the last
    // alternative (legacy LineParse splits there too, making C an
    // alternative); only the commas separate the alternatives.
    return isOrList
      ? alternativesOf(
          text,
          splitTopLevel(text, [/^,\s*(?:or\s+|and\s+)?/i], names),
          context,
          inheritedType,
        )
      : connective(
          "all",
          text,
          carriedParts(commaAnd, inheritedType).map(([part, type]) =>
            internalizeBlock(part, context, type),
          ),
        );
  }
  // Legacy InternalizeOr does not split "1 or more".
  const alternatives = /\b1\s+or\s+more\b/i.test(text)
    ? [{ text, delimiter: "" }]
    : splitTopLevel(text, [/^\s+or\s+/i], names);
  if (alternatives.length > 1)
    return alternativesOf(text, alternatives, context, inheritedType);
  return internalizeLeaf(text, context, inheritedType);
}

/**
 * Each part with the type legacy reads it under: a part's prefix sets the
 * type for it and every later part until another prefix (InternalizeBlock
 * carries it across comma parts; InternalizeOr hands it to the rest of the
 * text after an ` or `).
 */
function carriedParts(
  parts: readonly Segment[],
  inheritedType: string | undefined,
): readonly (readonly [string, string | undefined])[] {
  let type = inheritedType;
  return parts.map((part) => {
    const prefixType = legacyPrefixType(part.text);
    if (prefixType !== undefined) type = prefixType ?? undefined;
    return [part.text, type] as const;
  });
}

function alternativesOf(
  text: string,
  parts: readonly Segment[],
  context: PrerequisiteContext,
  inheritedType: string | undefined,
): PrerequisiteIr {
  const sharedHead = sharedFromHead(text, parts, context, inheritedType);
  if (sharedHead !== undefined) return sharedHead;
  const carried = carriedParts(parts, inheritedType);
  const children = distributeSharedWords(
    carried,
    distributeQualifiers(
      carried,
      carried.map(([part, type]) => internalizeBlock(part, context, type)),
      context,
    ),
    context,
  );
  // Legacy Ignore yields no prerequisite, and InternalizeOr then keeps only
  // the other side: "6th-level or higher utility power" needs 6th level.
  const kept = children.filter((child) => child.kind !== "ignored");
  if (kept.length === 0 || kept.length === children.length)
    return connective("any", text, children);
  return kept.length === 1 && kept[0] !== undefined
    ? { ...kept[0], text }
    : connective("any", text, kept);
}

/** A leaf the parser read to something it can check. */
function resolves(ir: PrerequisiteIr, context: PrerequisiteContext): boolean {
  if (ir.kind === "unverified") return false;
  if (ir.kind === "training" && context.definitions !== undefined)
    return ["Skill Training", "Skill"].some(
      (type) => resolveDefinitions(ir.value, context, type).length > 0,
    );
  return true;
}

/** The words of an alternative that another may share: no brackets. */
function shareableWords(text: string): readonly string[] {
  const words = text.replace(/[.]$/, "").trim().split(/\s+/);
  return words.some((word) => /[()[\]]/.test(word)) ? [] : words;
}

/**
 * "Rogue from Cormyr, the Dalelands, ..., or Sembia": the head before
 * "from" holds for the whole list, and the list is of places (regional
 * backgrounds), so it is the head and any of the places. Legacy reads
 * "Rogue from Cormyr" as one Unrecognized alternative, so a character
 * from any other place qualifies without being a rogue. A place with no
 * background stays unverified (D090).
 */
function sharedFromHead(
  text: string,
  parts: readonly Segment[],
  context: PrerequisiteContext,
  inheritedType: string | undefined,
): PrerequisiteIr | undefined {
  const first = parts[0]?.text.replace(/[.]$/, "").trim() ?? "";
  const match = /^(.+?)\s+from\s+(.+)$/i.exec(first);
  if (
    context.definitions === undefined ||
    parts.length < 2 ||
    match?.[1] === undefined ||
    match[2] === undefined ||
    resolveDefinitions(first, context).length > 0 ||
    parts.slice(1).some((part) => /\sfrom\s/i.test(part.text))
  )
    return undefined;
  const head = internalizeLeaf(match[1], context, inheritedType);
  if (!resolves(head, context)) return undefined;
  const places = [{ text: match[2], delimiter: "" }, ...parts.slice(1)];
  const placesText = text
    .slice(text.search(/\sfrom\s/i))
    .replace(/^\s*from\s+/i, "");
  return {
    kind: "all",
    text,
    children: [head, alternativesOf(placesText, places, context, "Background")],
  };
}

const RELATIVE_CLAUSE = /^(.+?)\s+((?:that|which|who)\s+.+)$/i;
const PROFICIENCY_PREFIX =
  /^(?:proficiency with|proficient with|can use the)\s+/i;
const DETERMINER = /^(?:any|an?|the|all)\s/i;

/**
 * Qualifiers that scope over every alternative although only one carries
 * them, where each alternative also resolves alone (so shared-word
 * distribution, which only completes fragments, leaves them):
 *
 * - a trailing relative clause on the last alternative: in "proficiency
 *   with any axe, hammer, or mace that has the versatile property" the
 *   axe and the hammer must be versatile too;
 * - the first proficiency alternative's "any": in "proficiency with any
 *   bow or crossbow" the crossbow is any crossbow, not the Crossbow.
 *
 * Legacy reads each alternative alone. When the qualified alternative
 * cannot be checked it is unverified rather than read without the
 * qualifier.
 */
function distributeQualifiers(
  parts: readonly (readonly [string, string | undefined])[],
  children: readonly PrerequisiteIr[],
  context: PrerequisiteContext,
): readonly PrerequisiteIr[] {
  if (context.definitions === undefined || parts.length < 2) return children;
  const last = (parts[parts.length - 1]?.[0] ?? "").replace(/[.]$/, "").trim();
  const relative =
    shareableWords(last).length === 0
      ? undefined
      : RELATIVE_CLAUSE.exec(last)?.[2];
  const firstValue = (parts[0]?.[0] ?? "")
    .trim()
    .replace(PROFICIENCY_PREFIX, "");
  const anyHead = parts[0]?.[1] === "Proficiency" && /^any\s/i.test(firstValue);
  return children.map((child, index) => {
    const [part, type] = parts[index] ?? ["", undefined];
    const own = part.replace(/[.]$/, "").trim();
    if (child.kind === "all" || child.kind === "any") return child;
    const tail =
      relative !== undefined &&
      index < parts.length - 1 &&
      !/\b(?:that|which|who)\b/i.test(own)
        ? ` ${relative}`
        : "";
    if (type === "Proficiency") {
      const prefix = PROFICIENCY_PREFIX.exec(own)?.[0] ?? "";
      const value = own.slice(prefix.length);
      const head =
        anyHead && index > 0 && !DETERMINER.test(value) ? "any " : "";
      if (head === "" && tail === "") return child;
      const distributed = `${prefix}${head}${value}${tail}`;
      const read = proficiencySpecialCase(
        distributed,
        normalized(`${head}${value}${tail}`).replace(/\s+/g, " "),
        context,
      );
      if (read !== undefined) return read;
      return tail === "" ? child : { kind: "unverified", text: distributed };
    }
    if (tail === "" || child.kind === "unverified") return child;
    const distributed = `${own}${tail}`;
    const read = internalizeLeaf(distributed, context, type);
    return resolves(read, context)
      ? read
      : { kind: "unverified", text: distributed };
  });
}

/**
 * Shared-word (elliptical) coordination: "Any martial or divine class" is
 * "any martial class" or "any divine class", and "proficiency with light
 * or heavy shields" is light shields or heavy shields. Legacy InternalizeOr
 * reads each side of an ` or ` alone, so a side that lacks the shared
 * words (`Any martial`) is Unrecognized and always fails. An alternative
 * that does not resolve alone takes the last alternative's trailing words,
 * the first alternative's leading words, or both, when that distributed
 * clause resolves. When none does but a distributed clause starts with one
 * that resolves (`Any arcane` + `class that can use an implement`), the
 * alternative is that whole distributed clause, still unverified, rather
 * than a fragment.
 */
function distributeSharedWords(
  parts: readonly (readonly [string, string | undefined])[],
  children: readonly PrerequisiteIr[],
  context: PrerequisiteContext,
): readonly PrerequisiteIr[] {
  if (context.definitions === undefined) return children;
  const first = shareableWords(parts[0]?.[0] ?? "");
  const last = shareableWords(parts[parts.length - 1]?.[0] ?? "");
  return children.map((child, index) => {
    const [part, type] = parts[index] ?? ["", undefined];
    const own = part.replace(/[.]$/, "").trim();
    const tails =
      index < parts.length - 1
        ? last.slice(1).map((_, offset) => last.slice(offset + 1))
        : [];
    const heads =
      index > 0
        ? first.slice(1).map((_, offset) => first.slice(0, offset + 1))
        : [];
    if (child.kind === "proficiency") {
      // "proficiency with light" + "shields": the proficiency it names.
      const value = normalized(child.value).replace(/\s+/g, " ");
      if (proficiencySpecialCase(child.text, value, context) !== undefined)
        return child;
      for (const tail of tails) {
        const distributed = `${own} ${tail.join(" ")}`;
        const read = proficiencySpecialCase(
          distributed,
          `${value} ${normalized(tail.join(" "))}`,
          context,
        );
        if (read !== undefined) return read;
      }
      return child;
    }
    if (child.kind !== "unverified") return child;
    const candidates = [
      ...tails.map((tail) => [own, ...tail]),
      ...heads.map((head) => [...head, own]),
      ...heads.flatMap((head) => tails.map((tail) => [...head, own, ...tail])),
    ].map((words) => words.join(" "));
    for (const candidate of candidates) {
      const read = internalizeLeaf(candidate, context, type);
      if (resolves(read, context)) return read;
    }
    for (const tail of tails)
      for (let length = tail.length - 1; length >= 1; length -= 1) {
        const lead = internalizeLeaf(
          [own, ...tail.slice(0, length)].join(" "),
          context,
          type,
        );
        if (resolves(lead, context))
          return { kind: "unverified", text: [own, ...tail].join(" ") };
      }
    return child;
  });
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

const domainIdCache = new WeakMap<
  readonly ContentEntity[],
  Map<string, ReadonlySet<string>>
>();

/** Normalized IDs of the Domain definitions with this normalized name. */
function domainIdsNamed(
  context: PrerequisiteContext,
  name: string,
): ReadonlySet<string> {
  const definitions = context.definitions;
  if (definitions === undefined) return new Set();
  let byName = domainIdCache.get(definitions);
  if (byName === undefined) {
    byName = new Map();
    for (const definition of definitions) {
      if (normalized(definition.type) !== "domain") continue;
      const key = normalized(definition.name);
      byName.set(
        key,
        new Set([...(byName.get(key) ?? []), normalized(definition.id)]),
      );
    }
    domainIdCache.set(definitions, byName);
  }
  return byName.get(name) ?? new Set();
}

/** The owned-definition tokens prerequisite clauses are matched against. */
export function ownedPrerequisiteTokens(
  owned: readonly ContentEntity[],
): ReadonlySet<string> {
  return new Set(
    owned.flatMap((entity) =>
      [
        entity.id,
        entity.name,
        `${entity.name} ${entity.type}`,
        `${entity.type} ${entity.name}`,
      ].map((value) => value.trim().toLocaleLowerCase().replaceAll("_", " ")),
    ),
  );
}

/**
 * The definitions a choice's own pick sets aside while that choice's
 * candidates and pick are checked: the pick and what it grants directly,
 * except CountsAsClass grants. Legacy `D20Choice::UpdateArrays` clears their
 * ownership (`Preserve`) for the check, so a pick never fails a prerequisite
 * on what it brings ("!Dwarf CountsAsRace" on the trait granting it). Stats
 * keep the pick's contributions, as in legacy.
 */
export function choiceSelectionSetAside(
  selected: { readonly id: string; readonly definitionId: string } | undefined,
  occurrences: readonly {
    readonly parentId?: string | undefined;
    readonly definitionId: string;
  }[],
  definitionOf: (definitionId: string) => ContentEntity | undefined,
): readonly string[] {
  if (selected === undefined) return [];
  return [
    selected.definitionId,
    ...occurrences
      .filter(
        (occurrence) =>
          occurrence.parentId === selected.id &&
          normalized(definitionOf(occurrence.definitionId)?.type ?? "") !==
            "countsasclass",
      )
      .map((occurrence) => occurrence.definitionId),
  ];
}

/** The context without some owned definitions (by ID). */
export function withoutOwnedDefinitions(
  context: PrerequisiteContext,
  definitionIds: readonly string[],
): PrerequisiteContext {
  if (definitionIds.length === 0) return context;
  const excluded = new Set(definitionIds.map(normalized));
  const owned = context.owned.filter(
    (entity) => !excluded.has(normalized(entity.id)),
  );
  if (owned.length === context.owned.length) return context;
  return {
    ...context,
    owned,
    ...(context.ownedTokens === undefined
      ? {}
      : { ownedTokens: ownedPrerequisiteTokens(owned) }),
  };
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
    case "worship-domain": {
      // Legacy reads "<name> domain" as the Domain record, which the deity
      // grants; a deity's `Domains` field lists Domain IDs.
      const wanted = normalized(ir.value);
      const domainIds = domainIdsNamed(context, wanted);
      return context.owned.some((entity) => {
        const type = normalized(entity.type);
        if (type === "domain") return normalized(entity.name) === wanted;
        return (
          type === "deity" &&
          [
            ...entity.categories.map(normalized),
            ...fieldValues(entity, ["Domain", "Domains"]),
          ].some((value) => value === wanted || domainIds.has(value))
        );
      })
        ? "satisfied"
        : "failed";
    }
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
