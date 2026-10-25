import type {
  BuildElementIdentity,
  BuildInventoryElement,
  BuildOccurrence,
  BuildUserRule,
  CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

/** The content fields name matching reads. */
export type MatchableDefinition = Pick<
  ContentEntity,
  "id" | "name" | "type" | "rules"
>;

/**
 * How a saved element whose internal-id the content lacks was matched:
 * `name` — exactly one record has its name and type; `class-suffix` — no
 * record has its name, which ends in "(<Class>)" naming one of the
 * character's classes, and exactly one record has its name without that
 * suffix and its type; `grant` — its parent was matched, and the parent's
 * record grants exactly one record of its type at its level that the build
 * doesn't already hold.
 */
export type Dnd4eDefinitionMatchBasis = "name" | "class-suffix" | "grant";

export interface Dnd4eDefinitionMatch {
  /** The internal-id the file saved. */
  readonly savedId: string;
  readonly savedName: string;
  readonly type: string;
  /** The content record the import used instead. */
  readonly definitionId: string;
  readonly definitionName: string;
  readonly basis: Dnd4eDefinitionMatchBasis;
  /** For `grant` matches: the record that grants it. */
  readonly grantedBy?: string;
  /** For `class-suffix` matches: the class the saved name's suffix named. */
  readonly className?: string;
}

export interface Dnd4eUnmatchedDefinition {
  readonly savedId: string;
  readonly savedName: string;
  readonly type: string;
  /** Records sharing the name and type; two or more means it was ambiguous. */
  readonly candidateIds: readonly string[];
}

export interface Dnd4eDefinitionMatching {
  readonly matched: readonly Dnd4eDefinitionMatch[];
  /** Several records share the name and type, so none was chosen. */
  readonly ambiguous: readonly Dnd4eUnmatchedDefinition[];
  /** No record shares the name and type. */
  readonly unmatched: readonly Dnd4eUnmatchedDefinition[];
}

export interface DefinitionMatchingContext {
  /** The level a saved element's legacy record states (its `Level` specific). */
  readonly savedLevel?: (definitionId: string) => number | undefined;
}

function key(value: string): string {
  return value.toLocaleLowerCase();
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * The form names are compared in: XML entities decoded (content authored
 * with `&amp;` and a file saved with `&` agree), whitespace collapsed, and
 * case folded as the rest of the importer folds names and IDs.
 */
export function matchableName(value: string): string {
  return key(
    value
      .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
        if (body.startsWith("#x") || body.startsWith("#X"))
          return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
        if (body.startsWith("#"))
          return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
        return NAMED_ENTITIES[body.toLocaleLowerCase()] ?? whole;
      })
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * A name ending in a parenthesized suffix ("Mountain Guide (Ranger)") split
 * into the name before it and the suffix, or undefined without one. Whether
 * the suffix names a class is the caller's to decide.
 */
export function suffixedName(
  value: string,
): { readonly name: string; readonly suffix: string } | undefined {
  const match = /^(.*\S)\s*\(([^()]+)\)\s*$/s.exec(value);
  const name = match?.[1];
  const suffix = match?.[2];
  return name === undefined || suffix === undefined
    ? undefined
    : { name, suffix: suffix.trim() };
}

function nameKey(name: string, type: string): string {
  return `${matchableName(type)}\0${matchableName(name)}`;
}

function attributeValue(
  rule: MatchableDefinition["rules"][number],
  name: string,
): string | undefined {
  const wanted = key(name);
  return rule.attributes.find((attribute) => key(attribute.name) === wanted)
    ?.value;
}

interface SavedElement {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

/** Every saved occurrence tree whose identities name content definitions.
 *  A UserEdit's root is the character-local provider, never content. */
function occurrenceTrees(build: CharacterBuild): BuildOccurrence[] {
  return [
    ...build.levels.flatMap((frame) => [
      frame.root,
      ...(frame.userEdit?.root.children ?? []),
    ]),
    ...build.grabbag,
    ...build.alternates.map((alternate) => alternate.choice),
    ...build.inventory.flatMap((entry) =>
      entry.elements.flatMap((element) => element.children ?? []),
    ),
    ...build.known.flatMap((entry) =>
      (entry.legacyLoot?.elements ?? []).flatMap(
        (element) => element.children ?? [],
      ),
    ),
  ];
}

function savedIdentities(build: CharacterBuild): BuildElementIdentity[] {
  const result: BuildElementIdentity[] = [];
  const visit = (occurrence: BuildOccurrence) => {
    result.push(occurrence.identity);
    occurrence.children.forEach(visit);
  };
  occurrenceTrees(build).forEach(visit);
  build.alternates.forEach((alternate) => result.push(alternate.provider));
  build.inventory.forEach((entry) => result.push(...entry.elements));
  build.known.forEach((entry) => {
    result.push(entry.element);
    result.push(...(entry.legacyLoot?.elements ?? []));
  });
  return result;
}

/** One saved record import pointed at another content record. */
export interface NameMatchedIdentity {
  readonly savedId: string;
  readonly savedName: string;
  readonly type: string;
  readonly definitionId: string;
  /** The holding it belongs to, for an item or an item's saved child. */
  readonly inventoryEntryId?: string;
}

/**
 * The records an import matched by name or grant, read back from the
 * build's `importedDefinitionId`s (one per saved ID), so they stay
 * reviewable after import.
 */
export function nameMatchedIdentities(
  build: CharacterBuild,
): NameMatchedIdentity[] {
  const result = new Map<string, NameMatchedIdentity>();
  const add = (identity: BuildElementIdentity, inventoryEntryId?: string) => {
    const savedId = identity.importedDefinitionId;
    if (
      savedId === undefined ||
      identity.definitionId === undefined ||
      result.has(key(savedId))
    )
      return;
    result.set(key(savedId), {
      savedId,
      savedName: identity.name,
      type: identity.type,
      definitionId: identity.definitionId,
      ...(inventoryEntryId === undefined ? {} : { inventoryEntryId }),
    });
  };
  const visit = (occurrence: BuildOccurrence, inventoryEntryId?: string) => {
    add(occurrence.identity, inventoryEntryId);
    occurrence.children.forEach((child) => visit(child, inventoryEntryId));
  };
  build.levels.forEach((frame) => {
    visit(frame.root);
    frame.userEdit?.root.children.forEach((child) => visit(child));
  });
  build.grabbag.forEach((occurrence) => visit(occurrence));
  build.alternates.forEach((alternate) => {
    add(alternate.provider);
    visit(alternate.choice);
  });
  build.inventory.forEach((entry) =>
    entry.elements.forEach((element) => {
      add(element, entry.id);
      element.children?.forEach((child) => visit(child, entry.id));
    }),
  );
  build.known.forEach((entry) => add(entry.element));
  return [...result.values()];
}

interface Replacement {
  readonly definitionId: string;
}

function replacedIdentity<T extends BuildElementIdentity>(
  identity: T,
  replacements: ReadonlyMap<string, Replacement>,
): T {
  const replacement =
    identity.definitionId === undefined
      ? undefined
      : replacements.get(key(identity.definitionId));
  if (replacement === undefined || identity.definitionId === undefined)
    return identity;
  return {
    ...identity,
    definitionId: replacement.definitionId,
    importedDefinitionId:
      identity.importedDefinitionId ?? identity.definitionId,
  };
}

function replacedOccurrence(
  occurrence: BuildOccurrence,
  replacements: ReadonlyMap<string, Replacement>,
): BuildOccurrence {
  return {
    ...occurrence,
    identity: replacedIdentity(occurrence.identity, replacements),
    children: occurrence.children.map((child) =>
      replacedOccurrence(child, replacements),
    ),
  };
}

function replacedElement(
  element: BuildInventoryElement,
  replacements: ReadonlyMap<string, Replacement>,
): BuildInventoryElement {
  const identity = replacedIdentity(element, replacements);
  return element.children === undefined
    ? identity
    : {
        ...identity,
        children: element.children.map((child) =>
          replacedOccurrence(child, replacements),
        ),
      };
}

/** A UserEdit rule that names a matched record (`grant name="ID_…"`). */
function replacedRule(
  rule: BuildUserRule,
  replacements: ReadonlyMap<string, Replacement>,
): BuildUserRule {
  return {
    ...rule,
    attributes: rule.attributes.map((attribute) => {
      const replacement =
        key(attribute.name) === "name"
          ? replacements.get(key(attribute.value))
          : undefined;
      return replacement === undefined
        ? attribute
        : { ...attribute, value: replacement.definitionId };
    }),
    children: rule.children.map((child) => replacedRule(child, replacements)),
  };
}

/**
 * Text strings keyed by a record's ID: a given freebee (`<id>` = "Given")
 * and legacy loot notes (`LOOTNOTE_<id>__<id>__<name>`).
 */
function replacedTextStringKey(
  name: string,
  replacements: ReadonlyMap<string, Replacement>,
): string {
  const whole = replacements.get(key(name));
  if (whole !== undefined) return whole.definitionId;
  if (!name.startsWith("LOOTNOTE_")) return name;
  return `LOOTNOTE_${name
    .slice("LOOTNOTE_".length)
    .split("__")
    .map((part) => replacements.get(key(part))?.definitionId ?? part)
    .join("__")}`;
}

function replacedBuild(
  build: CharacterBuild,
  replacements: ReadonlyMap<string, Replacement>,
): CharacterBuild {
  return {
    ...build,
    levels: build.levels.map((frame) => ({
      ...frame,
      root: replacedOccurrence(frame.root, replacements),
      ...(frame.userEdit === undefined
        ? {}
        : {
            userEdit: {
              root: {
                ...frame.userEdit.root,
                children: frame.userEdit.root.children.map((child) =>
                  replacedOccurrence(child, replacements),
                ),
              },
              rules: frame.userEdit.rules.map((rule) =>
                replacedRule(rule, replacements),
              ),
            },
          }),
    })),
    grabbag: build.grabbag.map((occurrence) =>
      replacedOccurrence(occurrence, replacements),
    ),
    alternates: build.alternates.map((alternate) => ({
      ...alternate,
      provider: replacedIdentity(alternate.provider, replacements),
      choice: replacedOccurrence(alternate.choice, replacements),
    })),
    inventory: build.inventory.map((entry) => ({
      ...entry,
      elements: entry.elements.map((element) =>
        replacedElement(element, replacements),
      ),
    })),
    // The preserved loot transactions name the same items as the holdings.
    ...(build.inventoryHistory === undefined
      ? {}
      : {
          inventoryHistory: build.inventoryHistory.map((entry) => ({
            ...entry,
            elements: entry.elements.map((element) =>
              replacedElement(element, replacements),
            ),
          })),
        }),
    known: build.known.map((entry) => ({
      ...entry,
      element: replacedIdentity(entry.element, replacements),
      ...(entry.legacyLoot === undefined
        ? {}
        : {
            legacyLoot: {
              ...entry.legacyLoot,
              elements: entry.legacyLoot.elements.map((element) =>
                replacedElement(element, replacements),
              ),
            },
          }),
    })),
    textStrings: Object.fromEntries(
      Object.entries(build.textStrings).map(([name, value]) => [
        replacedTextStringKey(name, replacements),
        value,
      ]),
    ),
  };
}

const CLASS_TYPES = new Set(["class", "hybrid class"]);
/** Record types a class grants on the way to the classes it counts as. */
const COUNTS_AS_PATH_TYPES = new Set(["grants", "countsasclass"]);

/**
 * The character's classes, keyed by matchable name: its saved Class and
 * Hybrid Class records (saved and content names) and every CountsAsClass
 * their records grant, directly or through Grants records — so a Hunter (an
 * Essentials Ranger build) is also a Ranger, and so is a Hybrid Ranger.
 * Multiclass feats' CountsAsClass grants are not the character's classes.
 */
function characterClassNames(
  build: CharacterBuild,
  byId: ReadonlyMap<string, MatchableDefinition>,
  replacements: ReadonlyMap<string, Replacement>,
): Map<string, string> {
  const result = new Map<string, string>();
  const add = (name: string) => {
    if (!result.has(matchableName(name))) result.set(matchableName(name), name);
  };
  const seen = new Set<string>();
  const visit = (entity: MatchableDefinition) => {
    if (seen.has(key(entity.id))) return;
    seen.add(key(entity.id));
    if (key(entity.type) === "countsasclass") add(entity.name);
    for (const rule of entity.rules) {
      if (key(rule.name) !== "grant") continue;
      const grantedId = attributeValue(rule, "name");
      const granted =
        grantedId === undefined ? undefined : byId.get(key(grantedId));
      if (granted !== undefined && COUNTS_AS_PATH_TYPES.has(key(granted.type)))
        visit(granted);
    }
  };
  for (const identity of savedIdentities(build)) {
    if (!CLASS_TYPES.has(matchableName(identity.type))) continue;
    add(identity.name);
    const id = identity.definitionId;
    const entity =
      id === undefined
        ? undefined
        : byId.get(key(replacements.get(key(id))?.definitionId ?? id));
    if (entity === undefined) continue;
    add(entity.name);
    visit(entity);
  }
  return result;
}

/**
 * Points saved elements whose internal-id the content lacks at the content
 * record that has the same name and type, when exactly one does — or, when
 * none does and the saved name ends in "(<Class>)" naming one of the
 * character's classes, at the one record named without that suffix. A saved
 * child of a matched element whose own name differs (a theme's "Starting
 * Feature" saved as "Level 1 … Starting Feature") is then lined up with the
 * one record of its type that the matched parent grants at its level.
 * Ambiguous names are never matched. Each changed identity keeps its saved
 * name and type, and the saved ID as `importedDefinitionId`; the original
 * XML stays in the envelope.
 */
export function matchMissingDefinitions(
  build: CharacterBuild,
  content: readonly MatchableDefinition[],
  context: DefinitionMatchingContext = {},
): {
  readonly build: CharacterBuild;
  readonly matching: Dnd4eDefinitionMatching;
} {
  const byId = new Map(content.map((entity) => [key(entity.id), entity]));
  const byName = new Map<string, MatchableDefinition[]>();
  for (const entity of content) {
    const name = nameKey(entity.name, entity.type);
    const list = byName.get(name);
    if (list === undefined) byName.set(name, [entity]);
    else list.push(entity);
  }

  const missing = new Map<string, SavedElement>();
  for (const identity of savedIdentities(build)) {
    const id = identity.definitionId;
    if (id === undefined || id.length === 0 || byId.has(key(id))) continue;
    if (!missing.has(key(id)))
      missing.set(key(id), { id, name: identity.name, type: identity.type });
  }

  const replacements = new Map<string, Replacement>();
  const matched: Dnd4eDefinitionMatch[] = [];
  const candidatesFor = new Map<string, readonly MatchableDefinition[]>();
  for (const [savedKey, saved] of missing) {
    const candidates = byName.get(nameKey(saved.name, saved.type)) ?? [];
    candidatesFor.set(savedKey, candidates);
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only === undefined) continue;
    replacements.set(savedKey, { definitionId: only.id });
    matched.push({
      savedId: saved.id,
      savedName: saved.name,
      type: saved.type,
      definitionId: only.id,
      definitionName: only.name,
      basis: "name",
    });
  }

  // A name the file saved with one of the character's classes appended
  // ("Mountain Guide (Ranger)", ours "Mountain Guide"). Only when no record
  // has the saved name itself; other parentheticals ("(heroic tier)") never
  // name a class, so they are never stripped.
  const classNames = characterClassNames(build, byId, replacements);
  const suffixCandidatesFor = new Map<string, readonly MatchableDefinition[]>();
  for (const [savedKey, saved] of missing) {
    if ((candidatesFor.get(savedKey)?.length ?? 0) > 0) continue;
    const split = suffixedName(saved.name);
    const className =
      split === undefined
        ? undefined
        : classNames.get(matchableName(split.suffix));
    if (split === undefined || className === undefined) continue;
    const candidates = byName.get(nameKey(split.name, saved.type)) ?? [];
    suffixCandidatesFor.set(savedKey, candidates);
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only === undefined) continue;
    replacements.set(savedKey, { definitionId: only.id });
    matched.push({
      savedId: saved.id,
      savedName: saved.name,
      type: saved.type,
      definitionId: only.id,
      definitionName: only.name,
      basis: "class-suffix",
      className,
    });
  }

  // Line up a matched parent's unmatched saved children with what its record
  // grants. Repeats so a lined-up child's own children can follow.
  const resolvedId = (id: string | undefined): string | undefined =>
    id === undefined
      ? undefined
      : (replacements.get(key(id))?.definitionId ?? id);
  const heldIds = (): Set<string> =>
    new Set(
      savedIdentities(build).flatMap((identity) => {
        const id = resolvedId(identity.definitionId);
        return id === undefined ? [] : [key(id)];
      }),
    );
  for (let changed = true; changed;) {
    changed = false;
    const held = heldIds();
    const visit = (occurrence: BuildOccurrence) => {
      const parentSavedId = occurrence.identity.definitionId;
      const parent =
        parentSavedId === undefined
          ? undefined
          : replacements.get(key(parentSavedId));
      const parentEntity =
        parent === undefined ? undefined : byId.get(key(parent.definitionId));
      if (parentEntity !== undefined && parentSavedId !== undefined)
        for (const child of occurrence.children) {
          const childId = child.identity.definitionId;
          if (
            childId === undefined ||
            byId.has(key(childId)) ||
            replacements.has(key(childId)) ||
            (candidatesFor.get(key(childId))?.length ?? 0) > 1
          )
            continue;
          const childLevel = context.savedLevel?.(childId);
          const parentLevel = context.savedLevel?.(parentSavedId) ?? 1;
          const grants = parentEntity.rules.flatMap((rule) => {
            if (key(rule.name) !== "grant") return [];
            const grantedId = attributeValue(rule, "name");
            const granted =
              grantedId === undefined ? undefined : byId.get(key(grantedId));
            if (
              granted === undefined ||
              held.has(key(granted.id)) ||
              matchableName(attributeValue(rule, "type") ?? granted.type) !==
                matchableName(child.identity.type)
            )
              return [];
            const grantLevel =
              Number.parseInt(attributeValue(rule, "level") ?? "", 10) ||
              parentLevel;
            return childLevel === undefined || childLevel === grantLevel
              ? [granted]
              : [];
          });
          const only = grants.length === 1 ? grants[0] : undefined;
          if (only === undefined) continue;
          replacements.set(key(childId), { definitionId: only.id });
          held.add(key(only.id));
          matched.push({
            savedId: childId,
            savedName: child.identity.name,
            type: child.identity.type,
            definitionId: only.id,
            definitionName: only.name,
            basis: "grant",
            grantedBy: parentEntity.id,
          });
          changed = true;
        }
      occurrence.children.forEach(visit);
    };
    occurrenceTrees(build).forEach(visit);
  }

  const ambiguous: Dnd4eUnmatchedDefinition[] = [];
  const unmatched: Dnd4eUnmatchedDefinition[] = [];
  for (const [savedKey, saved] of missing) {
    if (replacements.has(savedKey)) continue;
    const exact = candidatesFor.get(savedKey) ?? [];
    const candidateIds = (
      exact.length > 0 ? exact : (suffixCandidatesFor.get(savedKey) ?? [])
    ).map((candidate) => candidate.id);
    (candidateIds.length > 1 ? ambiguous : unmatched).push({
      savedId: saved.id,
      savedName: saved.name,
      type: saved.type,
      candidateIds,
    });
  }
  return {
    build: replacements.size === 0 ? build : replacedBuild(build, replacements),
    matching: { matched, ambiguous, unmatched },
  };
}
