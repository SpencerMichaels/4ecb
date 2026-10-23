/**
 * Modifier-shape normalization for the private `audit:modifiers` and
 * `audit:parity-coverage` audits. Every `statadd`, `modify` and `textstring`
 * a content pack uses is collected and its target normalized into a shape:
 * `<damage type>:damage`, `implement:damage(<magic item>)`, `<skill> misc`,
 * `power.<ability> value`, and so on. Shapes group targets the rules engine
 * must handle the same way, so one evaluated example stands for the group.
 *
 * Pure functions over `ContentEntity` records; the audits do the I/O and the
 * evaluation.
 */
import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";

export type ModifierKind = "statadd" | "modify" | "textstring";

export interface ModifierUse {
  readonly kind: ModifierKind;
  readonly entityId: string;
  readonly entityName: string;
  readonly entityType: string;
  readonly ordinal: number;
  readonly rule: RuleStatement;
  /** Lowercased attribute name to value. */
  readonly attributes: Readonly<Record<string, string>>;
}

const MODIFIER_KINDS: ReadonlySet<string> = new Set([
  "statadd",
  "modify",
  "textstring",
]);

export function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function ruleAttributes(
  rule: RuleStatement,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    rule.attributes.map((attribute) => [key(attribute.name), attribute.value]),
  );
}

/** Every statadd/modify/textstring rule, in entity and rule order. */
export function collectModifierUses(
  entities: readonly ContentEntity[],
): ModifierUse[] {
  return entities.flatMap((entity) =>
    entity.rules.flatMap((rule) => {
      const kind = key(rule.name);
      if (!MODIFIER_KINDS.has(kind)) return [];
      return [
        {
          kind: kind as ModifierKind,
          entityId: entity.id,
          entityName: entity.name,
          entityType: entity.type,
          ordinal: rule.ordinal,
          rule,
          attributes: ruleAttributes(rule),
        },
      ];
    }),
  );
}

export const DAMAGE_TYPES: ReadonlySet<string> = new Set([
  "acid",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "poison",
  "psychic",
  "radiant",
  "thunder",
]);

const ABILITIES: ReadonlySet<string> = new Set([
  "strength",
  "constitution",
  "dexterity",
  "intelligence",
  "wisdom",
  "charisma",
]);

const DEFENSES: ReadonlySet<string> = new Set([
  "ac",
  "fortitude",
  "reflex",
  "will",
]);

/** Equipment/attack-form tags kept literally: the engine keys on each. */
const LITERAL_TAGS: ReadonlySet<string> = new Set([
  "weapon",
  "implement",
  "melee",
  "ranged",
  "close",
  "area",
  "melee basic",
  "ranged basic",
  "basic attack",
  "two-weapon",
  "two-melee-weapon",
  "one-hand",
  "two-hand",
  "off-hand",
  "main-hand",
]);

/** Single-word namespaces before a colon (`resist:fire`, `FREEBEE:ID_…`). */
const NAMESPACES: ReadonlySet<string> = new Set([
  "resist",
  "freebee",
  "check",
  "vulnerable",
  "immune",
]);

const COMPANION_PREFIX = /^(ally|beast|familiar|companion|summon)\.(.+)$/iu;

export interface ShapeVocabulary {
  readonly typeById: ReadonlyMap<string, string>;
  readonly typeByName: ReadonlyMap<string, string>;
  readonly keywords: ReadonlySet<string>;
  readonly skills: ReadonlySet<string>;
}

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

/** Content-derived token classes: IDs, names, power keywords, skills. */
export function shapeVocabulary(
  entities: readonly ContentEntity[],
): ShapeVocabulary {
  const typeById = new Map<string, string>();
  const typeByName = new Map<string, string>();
  const keywords = new Set<string>();
  const skills = new Set<string>();
  for (const entity of entities) {
    typeById.set(key(entity.id), key(entity.type));
    if (!typeByName.has(key(entity.name)))
      typeByName.set(key(entity.name), key(entity.type));
    if (key(entity.type) === "skill") skills.add(key(entity.name));
    if (key(entity.type) === "power")
      for (const keyword of (field(entity, "Keywords") ?? "").split(","))
        if (keyword.trim() !== "") keywords.add(key(keyword));
  }
  return { typeById, typeByName, keywords, skills };
}

/** The token class of one comma-separated tag or limiter. */
export function classifyTag(tag: string, vocabulary: ShapeVocabulary): string {
  const value = key(tag);
  if (value === "") return "";
  if (/^id_/u.test(value)) {
    const type = vocabulary.typeById.get(value);
    return type === undefined ? "<unknown id>" : `<${type} id>`;
  }
  if (DAMAGE_TYPES.has(value)) return "<damage type>";
  if (LITERAL_TAGS.has(value)) return value;
  if (DEFENSES.has(value)) return "<defense>";
  if (ABILITIES.has(value)) return "<ability>";
  if (/ implement group$/u.test(value)) return "<implement group>";
  if (/ implement$/u.test(value)) return "<implement kind>";
  if (/ group$/u.test(value)) return "<weapon group>";
  if (vocabulary.skills.has(value)) return "<skill>";
  if (vocabulary.keywords.has(value)) return "<keyword>";
  const type = vocabulary.typeByName.get(value);
  if (type !== undefined) return `<${type}>`;
  return "<other>";
}

/** The class of a plain stat base (`Intimidate` in `Intimidate Misc`). */
function classifyStatBase(base: string, vocabulary: ShapeVocabulary): string {
  const value = key(base);
  if (vocabulary.skills.has(value)) return "<skill>";
  if (ABILITIES.has(value)) return "<ability>";
  return value;
}

/**
 * A stat name's shape. Tag lists are order-insensitive, so `weapon,arena
 * group:attack` and `arena group,weapon:attack` share a shape.
 */
export function statNameShape(
  name: string,
  vocabulary: ShapeVocabulary,
): string {
  const trimmed = name.trim().replace(/\[[^\]]*\]/gu, "[<choice>]");
  const companion = COMPANION_PREFIX.exec(trimmed);
  if (companion?.[1] !== undefined && companion[2] !== undefined)
    return `${key(companion[1])}.${statNameShape(companion[2], vocabulary)}`;
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const left = trimmed.slice(0, colon);
    const right = trimmed.slice(colon + 1);
    if (NAMESPACES.has(key(left))) {
      const operand = key(right);
      const tag =
        operand === "all" || operand === "damage"
          ? operand
          : DAMAGE_TYPES.has(operand) || /^id_/u.test(operand)
            ? classifyTag(operand, vocabulary)
            : "<other>";
      return `${key(left)}:${tag}`;
    }
    const limited = /^([^()]+?)\s*\((.*)\)\s*$/u.exec(right);
    const suffix = key(limited?.[1] ?? right);
    const limiter =
      limited?.[2] === undefined
        ? ""
        : `(${classifyTag(limited[2], vocabulary)})`;
    const tags = left
      .split(",")
      .map((tag) => classifyTag(tag, vocabulary))
      .filter(Boolean)
      .toSorted();
    return `${tags.join(",")}:${suffix}${limiter}`;
  }
  const value = key(trimmed);
  const misc = /^(.+) misc$/u.exec(value);
  if (misc?.[1] !== undefined)
    return `${classifyStatBase(misc[1], vocabulary)} misc`;
  const set = /^(id_\S+) (set count|equipped count)$/u.exec(value);
  if (set?.[1] !== undefined && set[2] !== undefined)
    return `${classifyTag(set[1], vocabulary)} ${set[2]}`;
  const checks = /^(.+) checks$/u.exec(value);
  if (checks?.[1] !== undefined && vocabulary.skills.has(checks[1]))
    return "<skill> checks";
  if (vocabulary.skills.has(value)) return "<skill>";
  if (ABILITIES.has(value)) return "<ability>";
  if (/^id_/u.test(value)) return classifyTag(value, vocabulary);
  return value;
}

/** Shape of an equipment selector (`wearing` / `not-wearing`). */
export function selectorShape(
  selector: string,
  vocabulary: ShapeVocabulary,
): string {
  const value = key(selector);
  const prefixed =
    /^(armor|weapon|implement|slot|only-weapon|dual-wielding|versatile|defensive):(.*)$/u.exec(
      value,
    );
  if (prefixed?.[1] !== undefined) {
    const operand = prefixed[2] ?? "";
    if (prefixed[1] === "armor" || prefixed[1] === "slot")
      return `${prefixed[1]}:${operand}`;
    const terms = operand
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean)
      .map((term) =>
        term.startsWith("!")
          ? `!${classifyTag(term.slice(1), vocabulary)}`
          : classifyTag(term, vocabulary),
      );
    return `${prefixed[1]}:${terms.join(",")}`;
  }
  if (value === "*") return "*";
  const type = vocabulary.typeByName.get(value);
  return type === undefined ? "<other>" : `<${type} name>`;
}

export type ValueForm =
  "constant" | "link" | "ability-modifier" | "string" | "empty";

export function valueForm(value: string | undefined): ValueForm {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return "empty";
  if (/^[+-]?\d+(?:\.\d+)?$/u.test(trimmed)) return "constant";
  if (/^[+-]?ABILITYMOD\(/iu.test(trimmed)) return "ability-modifier";
  if (/^[+-]/u.test(trimmed)) return "link";
  return "string";
}

/** Entity types whose names `modify` uses as ad-hoc power-card fields. */
const NAMED_FIELD_TYPES: ReadonlySet<string> = new Set([
  "feat",
  "class feature",
  "racial trait",
  "magic item",
  "paragon path",
  "epic destiny",
  "theme",
  "background",
]);

/** The field-name class of a `modify` (`Strength` → `<ability>`). */
function modifyFieldShape(fieldName: string, vocabulary: ShapeVocabulary) {
  const value = key(fieldName);
  if (ABILITIES.has(value)) return "<ability>";
  const type = vocabulary.typeByName.get(value);
  if (type !== undefined && NAMED_FIELD_TYPES.has(type))
    return `<${type} name>`;
  return value;
}

/** The target class of a `modify`: a type, `this`, `baseitem`, a select. */
export function modifyTarget(
  attributes: Readonly<Record<string, string>>,
  vocabulary: ShapeVocabulary,
): string {
  if (attributes.select !== undefined) return "<select>";
  const name = key(attributes.name ?? "");
  if (name === "") return "<no target>";
  if (name === "this" || name === "baseitem") return name;
  if (attributes.type !== undefined) return key(attributes.type);
  return (
    vocabulary.typeById.get(name) ??
    vocabulary.typeByName.get(name) ??
    "<unknown target>"
  );
}

/** Bonus types that name a stacking group rather than one item. */
const CONVENTIONAL_BONUS_TYPES: ReadonlySet<string> = new Set([
  "enhancement",
  "item",
  "feat",
  "power",
  "racial",
  "class feature",
  "armor",
  "shield",
  "resist",
  "ability",
  "misc",
  "magic item",
  "trained",
  "superior implement",
  "off-hand enhancement",
]);

/** Whether a use's gating attributes make it conditional on play state. */
export function useQualifiers(use: ModifierUse): readonly string[] {
  const attributes = use.attributes;
  return [
    ...(attributes.condition === undefined ? [] : ["conditional"]),
    ...(attributes.wearing === undefined ? [] : ["wearing"]),
    ...(attributes["not-wearing"] === undefined ? [] : ["not-wearing"]),
  ];
}

/**
 * The shape key of one use. Statadds and textstrings key on the target stat
 * shape plus whether the contribution is conditional or equipment-gated;
 * modifies key on target type, field shape and mutation modes.
 */
export function modifierShape(
  use: ModifierUse,
  vocabulary: ShapeVocabulary,
): string {
  const attributes = use.attributes;
  if (use.kind === "modify") {
    const target = modifyTarget(attributes, vocabulary);
    const mutations = ["value", "list-addition", "die-increase"]
      .filter((name) => attributes[name] !== undefined)
      .join("+");
    return `modify ${target}.${modifyFieldShape(attributes.field ?? "", vocabulary)} ${mutations || "<none>"}`;
  }
  const qualifiers = useQualifiers(use);
  return `${use.kind} ${statNameShape(attributes.name ?? "", vocabulary)}${
    qualifiers.length === 0 ? "" : ` [${qualifiers.join(",")}]`
  }`;
}

/** Secondary shapes: bonus types, equipment selectors and value forms. */
export function qualifierShapes(
  use: ModifierUse,
  vocabulary: ShapeVocabulary,
): readonly string[] {
  if (use.kind === "modify") return [];
  const attributes = use.attributes;
  const type = attributes.type;
  const namedType =
    type === undefined || CONVENTIONAL_BONUS_TYPES.has(key(type))
      ? undefined
      : vocabulary.typeByName.get(key(type));
  const typeShape =
    type === undefined || type.trim() === ""
      ? "untyped"
      : namedType === undefined
        ? `type=${key(type)}`
        : `type=<${namedType} name>`;
  return [
    `${use.kind} ${typeShape}`,
    ...(attributes.wearing === undefined
      ? []
      : [
          `${use.kind} wearing=${selectorShape(attributes.wearing, vocabulary)}`,
        ]),
    ...(attributes["not-wearing"] === undefined
      ? []
      : [
          `${use.kind} not-wearing=${selectorShape(attributes["not-wearing"], vocabulary)}`,
        ]),
    ...["zero", "non-zero", "half-point", "statmin", "requires"].flatMap(
      (name) => (attributes[name] === undefined ? [] : [`${use.kind} ${name}`]),
    ),
    `${use.kind} value=${valueForm(attributes.value)}`,
  ];
}

export interface ShapeGroup {
  readonly shape: string;
  readonly kind: ModifierKind;
  readonly uses: readonly ModifierUse[];
  readonly entityCount: number;
  readonly names: ReadonlyMap<string, number>;
}

/** Uses grouped by shape, ranked by how many distinct entities use each. */
export function groupByShape(
  uses: readonly ModifierUse[],
  shapeOf: (use: ModifierUse) => string | readonly string[],
): ShapeGroup[] {
  const groups = new Map<string, ModifierUse[]>();
  for (const use of uses)
    for (const shape of [shapeOf(use)].flat())
      groups.set(shape, [...(groups.get(shape) ?? []), use]);
  return [...groups]
    .map(([shape, members]) => {
      const names = new Map<string, number>();
      for (const use of members) {
        const name =
          use.kind === "modify"
            ? `${use.attributes.name ?? use.attributes.select ?? ""}.${use.attributes.field ?? ""}`
            : (use.attributes.name ?? "");
        names.set(name, (names.get(name) ?? 0) + 1);
      }
      return {
        shape,
        kind: members[0]?.kind ?? "statadd",
        uses: members,
        entityCount: new Set(members.map((use) => key(use.entityId))).size,
        names,
      };
    })
    .toSorted(
      (left, right) =>
        right.entityCount - left.entityCount ||
        left.shape.localeCompare(right.shape),
    );
}

/**
 * Up to `limit` representative uses, preferring distinct target names and
 * then ungated, constant-valued ones, in a stable order.
 */
export function representativeUses(
  group: ShapeGroup,
  limit: number,
): ModifierUse[] {
  const score = (use: ModifierUse) =>
    Number(use.attributes.requires !== undefined) +
    Number(valueForm(use.attributes.value) !== "constant");
  const ordered = group.uses.toSorted(
    (left, right) =>
      score(left) - score(right) ||
      left.entityId.localeCompare(right.entityId) ||
      left.ordinal - right.ordinal,
  );
  const picked: ModifierUse[] = [];
  const seen = new Set<string>();
  const nameOf = (use: ModifierUse) =>
    key(
      `${use.attributes.name ?? use.attributes.select ?? ""}.${use.attributes.field ?? ""}`,
    );
  for (const use of ordered) {
    if (picked.length >= limit) break;
    if (seen.has(nameOf(use))) continue;
    seen.add(nameOf(use));
    picked.push(use);
  }
  for (const use of ordered) {
    if (picked.length >= limit) break;
    if (!picked.includes(use)) picked.push(use);
  }
  return picked;
}

/** Stat names some statadd value links to (`value="+Power Attack"`). */
export function linkedStatNames(
  uses: readonly ModifierUse[],
): ReadonlyMap<string, number> {
  const linked = new Map<string, number>();
  for (const use of uses) {
    if (use.kind !== "statadd") continue;
    const value = (use.attributes.value ?? "").trim();
    const ability = /^[+-]?ABILITYMOD\((.+)\)$/iu.exec(value)?.[1];
    const link = ability ?? /^[+-](.*\D.*)$/u.exec(value)?.[1];
    if (link === undefined) continue;
    const name = key(link.replace(/\[[^\]]*\]/gu, "[<choice>]"));
    linked.set(name, (linked.get(name) ?? 0) + 1);
  }
  return linked;
}
