import {
  detailsWithLegacyTextStrings,
  type BuildElementIdentity,
  type BuildInventoryEntry,
  type BuildOccurrence,
  type BuildUserRule,
  type CharacterBuild,
  type LegacyCharacterSnapshot,
  type LegacyEnvelope,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  aggregateInventory,
  applyFieldOverlays,
  projectBuildForEvaluation,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import { SaxesParser } from "saxes";

export const DND4E_EXPORT_TARGETS = [
  {
    id: "preserve-original",
    label: "Original imported file (no edits)",
  },
  {
    id: "legacy-builder-0.07a",
    label: "Legacy Character Builder 0.07a",
  },
] as const;

export type Dnd4eExportTarget = (typeof DND4E_EXPORT_TARGETS)[number]["id"];

export interface EditedDnd4eExportInput {
  readonly target: "legacy-builder-0.07a";
  readonly envelope: LegacyEnvelope;
  readonly snapshot: LegacyCharacterSnapshot;
  readonly build: CharacterBuild;
  readonly evaluation: EvaluatedCharacter;
  readonly content: readonly ContentEntity[];
}

export interface Dnd4eRoundTripComparison {
  readonly equivalent: boolean;
  readonly differences: readonly string[];
}

interface XmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlNode[];
  text: string;
}

interface RootFragment {
  readonly name: string;
  readonly raw: string;
}

const ABILITIES = [
  "Strength",
  "Constitution",
  "Dexterity",
  "Intelligence",
  "Wisdom",
  "Charisma",
] as const;

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function xmlSafe(value: string): string {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (
      point !== 0x9 &&
      point !== 0xa &&
      point !== 0xd &&
      !(point >= 0x20 && point <= 0xd7ff) &&
      !(point >= 0xe000 && point <= 0xfffd) &&
      !(point >= 0x10000 && point <= 0x10ffff)
    )
      throw new Error("Edited export contains an invalid XML 1.0 character");
  }
  return value;
}

function escapeText(value: string): string {
  return xmlSafe(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function attributes(
  values: Readonly<Record<string, string | number | undefined>>,
): string {
  return Object.entries(values)
    .flatMap(([name, value]) =>
      value === undefined
        ? []
        : [` ${name}="${escapeAttribute(String(value))}"`],
    )
    .join("");
}

function element(
  name: string,
  values: Readonly<Record<string, string | number | undefined>> = {},
  contents?: string,
): string {
  const attrs = attributes(values);
  return contents === undefined
    ? `<${name}${attrs}/>`
    : `<${name}${attrs}>${contents}</${name}>`;
}

function parseTree(xml: string): XmlNode {
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentag", (tag) => {
    const node: XmlNode = {
      name: tag.name,
      attributes: Object.fromEntries(Object.entries(tag.attributes)),
      children: [],
      text: "",
    };
    const parent = stack.at(-1);
    if (parent === undefined) root = node;
    else parent.children.push(node);
    stack.push(node);
  });
  const append = (value: string) => {
    const node = stack.at(-1);
    if (node !== undefined) node.text += value;
  };
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", () => stack.pop());
  parser.write(xml).close();
  if (root === undefined)
    throw new Error("The source envelope has no XML root element");
  return root;
}

/** Extracts direct children so preserved extension payload stays byte-exact. */
function childFragments(source: string, parentName: string): RootFragment[] {
  const xml = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const fragments: RootFragment[] = [];
  let depth = 0;
  let parentDepth: number | undefined;
  let openingParent = false;
  let childStart: number | undefined;
  let childName: string | undefined;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentagstart", (tag) => {
    openingParent =
      parentDepth === undefined && key(tag.name) === key(parentName);
    if (parentDepth !== undefined && depth === parentDepth) {
      childStart = xml.lastIndexOf("<", parser.position - 1);
      childName = tag.name;
    }
  });
  parser.on("opentag", () => {
    depth += 1;
    if (openingParent) {
      parentDepth = depth;
      openingParent = false;
    }
  });
  parser.on("closetag", () => {
    if (
      parentDepth !== undefined &&
      depth === parentDepth + 1 &&
      childStart !== undefined &&
      childName !== undefined
    ) {
      fragments.push({
        name: childName,
        raw: xml.slice(childStart, parser.position),
      });
      childStart = undefined;
      childName = undefined;
    }
    if (parentDepth !== undefined && depth === parentDepth)
      parentDepth = undefined;
    depth -= 1;
  });
  parser.write(xml).close();
  return fragments;
}

function identityAttributes(
  identity: BuildElementIdentity,
): Record<string, string | undefined> {
  return {
    name: identity.name,
    type: identity.type,
    "internal-id": identity.definitionId,
    url: identity.url,
  };
}

function allOccurrences(build: CharacterBuild): BuildOccurrence[] {
  const result: BuildOccurrence[] = [];
  const visit = (occurrence: BuildOccurrence) => {
    result.push(occurrence);
    occurrence.children.forEach(visit);
  };
  build.levels.forEach((frame) => visit(frame.root));
  build.levels.forEach((frame) => {
    if (frame.userEdit !== undefined) visit(frame.userEdit.root);
  });
  build.grabbag.forEach(visit);
  build.alternates.forEach((alternate) => visit(alternate.choice));
  build.inventory.forEach((entry) =>
    entry.elements.forEach((element) => element.children?.forEach(visit)),
  );
  return result;
}

function occurrencePaths(build: CharacterBuild): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const visit = (occurrence: BuildOccurrence, path: string) => {
    result.set(occurrence.id, path);
    occurrence.children.forEach((child, index) =>
      visit(child, `${path}.children[${index}]`),
    );
  };
  build.levels.forEach((frame, index) =>
    visit(frame.root, `levels[${index}].root`),
  );
  build.levels.forEach((frame, index) => {
    if (frame.userEdit !== undefined)
      visit(frame.userEdit.root, `levels[${index}].userEdit.root`);
  });
  build.grabbag.forEach((occurrence, index) =>
    visit(occurrence, `grabbag[${index}]`),
  );
  build.alternates.forEach((alternate, index) =>
    visit(alternate.choice, `alternates[${index}].choice`),
  );
  build.inventory.forEach((entry, entryIndex) =>
    entry.elements.forEach((element, elementIndex) =>
      element.children?.forEach((child, childIndex) =>
        visit(
          child,
          `inventory[${entryIndex}].elements[${elementIndex}].children[${childIndex}]`,
        ),
      ),
    ),
  );
  return result;
}

function sortedRecord<T>(record: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(record).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function semanticBuild(build: CharacterBuild): unknown {
  const paths = occurrencePaths(build);
  const occurrence = (value: BuildOccurrence): unknown => ({
    identity: value.identity,
    acquiredLevel: value.acquiredLevel,
    legality: value.legality,
    ...(value.replacesId === undefined
      ? {}
      : { replacesPath: paths.get(value.replacesId) ?? "unresolved" }),
    unresolved: value.unresolved,
    children: value.children.map(occurrence),
  });
  return {
    formatVersion: build.formatVersion,
    effectiveLevel: build.effectiveLevel,
    levels: build.levels.map((frame) => ({
      level: frame.level,
      root: occurrence(frame.root),
      ...(frame.userEdit === undefined
        ? {}
        : {
            userEdit: {
              root: occurrence(frame.userEdit.root),
              rules: frame.userEdit.rules,
            },
          }),
    })),
    grabbag: build.grabbag.map(occurrence),
    inventory: build.inventory.map((entry) => ({
      acquiredLevel: entry.acquiredLevel,
      quantity: entry.quantity,
      equippedQuantity: entry.equippedQuantity,
      elements: entry.elements.map((identity) => ({
        definitionId: identity.definitionId,
        name: identity.name,
        type: identity.type,
        url: identity.url,
        ...(identity.children === undefined
          ? {}
          : { children: identity.children.map(occurrence) }),
      })),
      ...(entry.name === undefined ? {} : { name: entry.name }),
      ...(entry.showPowerCard === undefined
        ? {}
        : { showPowerCard: entry.showPowerCard }),
      overrides: sortedRecord(entry.overrides),
      legality: entry.legality,
    })),
    alternates: build.alternates.map((alternate) => ({
      selectName: alternate.selectName,
      provider: alternate.provider,
      choice: occurrence(alternate.choice),
    })),
    baseAbilities: sortedRecord(build.baseAbilities),
    textStrings: sortedRecord(build.textStrings),
  };
}

function firstSemanticDifference(
  expected: unknown,
  actual: unknown,
  path = "build",
): string | undefined {
  if (Object.is(expected, actual)) return undefined;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length)
      return `${path}.length is ${actual.length}; expected ${expected.length}.`;
    for (const [index, value] of expected.entries()) {
      const difference = firstSemanticDifference(
        value,
        actual[index],
        `${path}[${index}]`,
      );
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const expectedRecord = expected as Readonly<Record<string, unknown>>;
    const actualRecord = actual as Readonly<Record<string, unknown>>;
    const expectedKeys = Object.keys(expectedRecord).toSorted();
    const actualKeys = Object.keys(actualRecord).toSorted();
    if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys))
      return `${path} has keys ${actualKeys.join(", ")}; expected ${expectedKeys.join(", ")}.`;
    for (const name of expectedKeys) {
      const difference = firstSemanticDifference(
        expectedRecord[name],
        actualRecord[name],
        `${path}.${name}`,
      );
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  return `${path} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`;
}

/** Compares build meaning while deliberately ignoring regenerated local IDs. */
export function compareEditedDnd4eRoundTrip(
  expected: CharacterBuild,
  actual: CharacterBuild,
): Dnd4eRoundTripComparison {
  const difference = firstSemanticDifference(
    semanticBuild(expected),
    semanticBuild(actual),
  );
  return difference === undefined
    ? { equivalent: true, differences: [] }
    : {
        equivalent: false,
        differences: [difference],
      };
}

function occurrenceTokens(build: CharacterBuild): Map<string, string> {
  const result = new Map<string, string>();
  for (const [index, occurrence] of allOccurrences(build).entries()) {
    if (result.has(occurrence.id))
      throw new Error(
        `Duplicate occurrence ID cannot be exported: ${occurrence.id}`,
      );
    result.set(occurrence.id, `4ecb-${index + 1}`);
  }
  return result;
}

function serializeOccurrence(
  occurrence: BuildOccurrence,
  tokens: ReadonlyMap<string, string>,
): string {
  const token = tokens.get(occurrence.id);
  if (token === undefined)
    throw new Error(`Missing export token for occurrence ${occurrence.id}`);
  const replacement =
    occurrence.replacesId === undefined
      ? undefined
      : tokens.get(occurrence.replacesId);
  return element(
    "RulesElement",
    {
      ...identityAttributes(occurrence.identity),
      charelem: token,
      ...(replacement === undefined ? {} : { replaces: replacement }),
      legality: occurrence.legality === "rules-legal" ? undefined : "houserule",
    },
    occurrence.children
      .map((child) => serializeOccurrence(child, tokens))
      .join(""),
  );
}

function serializeInventory(
  entry: BuildInventoryEntry,
  tokens: ReadonlyMap<string, string>,
): string {
  const reserved = new Set([
    "count",
    "equip-count",
    "name",
    "showpowercard",
    "legality",
  ]);
  const overrides = Object.fromEntries(
    Object.entries(entry.overrides).filter(
      ([name]) =>
        /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name) && !reserved.has(key(name)),
    ),
  );
  return element(
    "loot",
    {
      count: entry.quantity,
      "equip-count": entry.equippedQuantity,
      name: entry.name,
      ShowPowerCard:
        entry.showPowerCard === undefined
          ? undefined
          : entry.showPowerCard
            ? "1"
            : "0",
      legality: entry.legality === "rules-legal" ? undefined : "houserule",
      ...overrides,
    },
    entry.elements
      .map((identity) =>
        element(
          "RulesElement",
          identityAttributes(identity),
          (identity.children ?? [])
            .map((child) => serializeOccurrence(child, tokens))
            .join(""),
        ),
      )
      .join(""),
  );
}

function serializeUserRule(rule: BuildUserRule): string {
  if (
    !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(rule.name) ||
    rule.attributes.some(
      ({ name }) => !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name),
    )
  )
    throw new Error("A user-edit rule contains an invalid XML name");
  const contents = `${escapeText(rule.text)}${rule.children
    .map(serializeUserRule)
    .join("")}`;
  return element(
    rule.name,
    Object.fromEntries(rule.attributes.map(({ name, value }) => [name, value])),
    contents.length === 0 ? undefined : contents,
  );
}

function userEditXml(
  frame: CharacterBuild["levels"][number],
  tokens: ReadonlyMap<string, string>,
): string {
  if (frame.userEdit === undefined) return "";
  return element(
    "UserEdit",
    {},
    `${serializeOccurrence(frame.userEdit.root, tokens)}${element(
      "rules",
      {},
      frame.userEdit.rules.map(serializeUserRule).join(""),
    )}`,
  );
}

function levelXml(build: CharacterBuild, tokens: ReadonlyMap<string, string>) {
  return build.levels.map((frame) =>
    element(
      "Level",
      {},
      `${serializeOccurrence(frame.root, tokens)}${build.inventory
        .filter((entry) => entry.acquiredLevel === frame.level)
        .map((entry) => serializeInventory(entry, tokens))
        .join("")}${userEditXml(frame, tokens)}`,
    ),
  );
}

function grabbagXml(
  build: CharacterBuild,
  tokens: ReadonlyMap<string, string>,
): string {
  return build.grabbag.length === 0
    ? ""
    : element(
        "Grabbag",
        {},
        build.grabbag
          .map((occurrence) => serializeOccurrence(occurrence, tokens))
          .join(""),
      );
}

function alternatesXml(
  build: CharacterBuild,
  tokens: ReadonlyMap<string, string>,
): string[] {
  return build.alternates.map((alternate) =>
    element(
      "alternate",
      {
        SelectName: alternate.selectName,
        ...identityAttributes(alternate.provider),
      },
      serializeOccurrence(alternate.choice, tokens),
    ),
  );
}

function contentMap(content: readonly ContentEntity[]) {
  return new Map(content.map((entity) => [key(entity.id), entity]));
}

function detailsXml(
  snapshot: LegacyCharacterSnapshot,
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
  entities: ReadonlyMap<string, ContentEntity>,
): string {
  const details: Record<string, string> = {
    ...detailsWithLegacyTextStrings(snapshot.details, build.textStrings),
    Level: String(evaluation.level),
  };
  for (const [type, detail] of [
    ["Race", "Race"],
    ["Class", "Class"],
    ["Theme", "Theme"],
    ["Paragon Path", "ParagonPath"],
    ["Epic Destiny", "EpicDestiny"],
  ] as const) {
    const selected = evaluation.occurrences
      .map((occurrence) => entities.get(key(occurrence.definitionId)))
      .find((entity) => entity !== undefined && key(entity.type) === key(type));
    if (selected !== undefined) details[detail] = selected.name;
  }
  return element(
    "Details",
    {},
    Object.entries(details)
      .map(([name, value]) => element(name, {}, escapeText(value)))
      .join(""),
  );
}

function baseAbilityScoresXml(build: CharacterBuild): string {
  return element(
    "AbilityScores",
    {},
    ABILITIES.flatMap((ability) => {
      const score = build.baseAbilities[ability];
      return score === undefined
        ? []
        : [element(ability, { score: String(score) })];
    }).join(""),
  );
}

function statBlockXml(evaluation: EvaluatedCharacter): string {
  return element(
    "StatBlock",
    {},
    Object.entries(evaluation.stats)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, stat]) =>
        element(
          "Stat",
          { value: String(stat.value) },
          element("alias", { name }),
        ),
      )
      .join(""),
  );
}

function ruleTallyXml(
  evaluation: EvaluatedCharacter,
  entities: ReadonlyMap<string, ContentEntity>,
): string {
  return element(
    "RulesElementTally",
    {},
    evaluation.occurrences
      .flatMap((occurrence) => {
        const entity = entities.get(key(occurrence.definitionId));
        if (entity === undefined) return [];
        const fields = applyFieldOverlays(entity, evaluation.overlays);
        return [
          element(
            "RulesElement",
            {
              name: entity.name,
              type: entity.type,
              "internal-id": entity.id,
              legality:
                occurrence.legality === "rules-legal" ? undefined : "houserule",
            },
            Object.entries(fields)
              .map(([name, value]) =>
                element("specific", { name }, escapeText(value)),
              )
              .join(""),
          ),
        ];
      })
      .join(""),
  );
}

function activeInventory(
  build: CharacterBuild,
): readonly BuildInventoryEntry[] {
  const projected = projectBuildForEvaluation(build, []);
  const aggregated = aggregateInventory(
    projected.inventory,
    build.effectiveLevel,
  );
  return aggregated.flatMap((entry) => {
    const original = build.inventory.find(
      (candidate) => candidate.id === entry.id,
    );
    return original === undefined
      ? []
      : [
          {
            ...original,
            quantity: entry.quantity,
            equippedQuantity: entry.equippedQuantity,
          },
        ];
  });
}

/**
 * The legacy format has one active level horizon. Native records may retain a
 * longer planning timeline, so compatibility export deliberately projects the
 * durable build to its current effective level instead of serializing inactive
 * future choices.
 */
export function projectBuildForLegacyExport(
  build: CharacterBuild,
): CharacterBuild {
  const activeLevel = build.effectiveLevel;
  const activeOccurrence = (occurrence: BuildOccurrence): BuildOccurrence => ({
    ...occurrence,
    children: occurrence.children
      .filter((child) => child.acquiredLevel <= activeLevel)
      .map(activeOccurrence),
  });
  const activeIds = new Set<string>();
  const remember = (occurrence: BuildOccurrence) => {
    activeIds.add(occurrence.id);
    occurrence.children.forEach(remember);
  };
  const levels = build.levels
    .filter((frame) => frame.level <= activeLevel)
    .map((frame) => ({
      ...frame,
      root: activeOccurrence(frame.root),
      ...(frame.userEdit === undefined
        ? {}
        : {
            userEdit: {
              ...frame.userEdit,
              root: activeOccurrence(frame.userEdit.root),
            },
          }),
    }));
  const grabbag = build.grabbag
    .filter((occurrence) => occurrence.acquiredLevel <= activeLevel)
    .map(activeOccurrence);
  levels.forEach((frame) => remember(frame.root));
  grabbag.forEach(remember);
  return {
    ...build,
    levels,
    grabbag,
    inventory: build.inventory.filter(
      (entry) => entry.acquiredLevel <= activeLevel,
    ),
    alternates: build.alternates.flatMap((alternate) =>
      alternate.choice.acquiredLevel <= activeLevel &&
      (alternate.choice.replacesId === undefined ||
        activeIds.has(alternate.choice.replacesId))
        ? [{ ...alternate, choice: activeOccurrence(alternate.choice) }]
        : [],
    ),
  };
}

function lootTallyXml(
  build: CharacterBuild,
  tokens: ReadonlyMap<string, string>,
): string {
  return element(
    "LootTally",
    {},
    activeInventory(build)
      .map((entry) => serializeInventory(entry, tokens))
      .join(""),
  );
}

function powerStatsXml(evaluation: EvaluatedCharacter): string {
  return element(
    "PowerStats",
    {},
    evaluation.powers
      .map((power) =>
        element(
          "Power",
          { name: power.name },
          `${power.usage === undefined ? "" : element("specific", { name: "Power Usage" }, escapeText(power.usage))}${
            power.actionType === undefined
              ? ""
              : element(
                  "specific",
                  { name: "Action Type" },
                  escapeText(power.actionType),
                )
          }${power.variants
            .map((variant) =>
              element(
                "Weapon",
                { name: variant.equipmentName },
                `${variant.attackBonus === undefined ? "" : element("AttackBonus", {}, escapeText(String(variant.attackBonus)))}${
                  variant.damage === undefined
                    ? ""
                    : element("Damage", {}, escapeText(variant.damage))
                }${
                  variant.attackStat === undefined
                    ? ""
                    : element("AttackStat", {}, escapeText(variant.attackStat))
                }${
                  variant.defense === undefined
                    ? ""
                    : element("Defense", {}, escapeText(variant.defense))
                }${
                  variant.attackComponents.length === 0
                    ? ""
                    : element(
                        "HitComponents",
                        {},
                        escapeText(
                          variant.attackComponents
                            .map((part) => `${part.label} ${part.value}`)
                            .join(" + "),
                        ),
                      )
                }${
                  variant.damageComponents.length === 0
                    ? ""
                    : element(
                        "DamageComponents",
                        {},
                        escapeText(
                          variant.damageComponents
                            .map((part) => `${part.label} ${part.value}`)
                            .join(" + "),
                        ),
                      )
                }${
                  variant.conditionalDamage.length === 0
                    ? ""
                    : element(
                        "Conditions",
                        {},
                        escapeText(
                          variant.conditionalDamage
                            .map(
                              ({ source, expression, condition }) =>
                                `${expression.startsWith("-") ? "" : "+"}${expression} to damage ${condition} (${source})`,
                            )
                            .join("\n"),
                        ),
                      )
                }`,
              ),
            )
            .join("")}`,
        ),
      )
      .join(""),
  );
}

function characterSheetXml(
  input: EditedDnd4eExportInput,
  tokens: ReadonlyMap<string, string>,
): string {
  const entities = contentMap(input.content);
  const regenerated = new Set([
    "details",
    "abilityscores",
    "statblock",
    "ruleselementtally",
    "loottally",
    "powerstats",
  ]);
  const preserved = childFragments(input.envelope.sourceXml, "CharacterSheet")
    .filter((fragment) => !regenerated.has(key(fragment.name)))
    .map((fragment) => fragment.raw)
    .join("");
  return element(
    "CharacterSheet",
    {},
    `${detailsXml(input.snapshot, input.build, input.evaluation, entities)}${baseAbilityScoresXml(
      input.build,
    )}${statBlockXml(input.evaluation)}${ruleTallyXml(
      input.evaluation,
      entities,
    )}${lootTallyXml(input.build, tokens)}${powerStatsXml(input.evaluation)}${preserved}`,
  );
}

export function exportEditedDnd4e(input: EditedDnd4eExportInput): string {
  if (input.target !== "legacy-builder-0.07a")
    throw new Error(
      `Unsupported edited export target: ${String(input.target)}`,
    );
  if (!input.evaluation.converged)
    throw new Error("Edited export requires a converged rules evaluation");
  if (input.evaluation.level !== input.build.effectiveLevel)
    throw new Error("Edited export evaluation does not match the build level");
  const build = projectBuildForLegacyExport(input.build);

  const sourceXml = input.envelope.sourceXml.startsWith("\uFEFF")
    ? input.envelope.sourceXml.slice(1)
    : input.envelope.sourceXml;
  const sourceRoot = parseTree(sourceXml);
  if (key(sourceRoot.name) !== "d20character")
    throw new Error(`Expected D20Character root but found ${sourceRoot.name}`);

  const replaced = new Set([
    "level",
    "grabbag",
    "alternate",
    "textstring",
    "charactersheet",
    "abilityscores",
  ]);
  const preserved = childFragments(sourceXml, "D20Character")
    .filter((fragment) => !replaced.has(key(fragment.name)))
    .map((fragment) => fragment.raw);
  const tokens = occurrenceTokens(build);
  const textStrings = Object.entries(build.textStrings).map(([name, value]) =>
    element("textstring", { name }, escapeText(value)),
  );
  const rootAttributes: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(sourceRoot.attributes).filter(
        ([name]) => !["game-system", "version", "legality"].includes(key(name)),
      ),
    ),
    "game-system": "D&D4E",
    Version: "0.07a",
    legality: input.evaluation.legal ? "rules-legal" : "houserule",
  };
  const body = [
    characterSheetXml({ ...input, build }, tokens),
    ...preserved,
    ...levelXml(build, tokens),
    grabbagXml(build, tokens),
    ...alternatesXml(build, tokens),
    ...textStrings,
  ]
    .filter(Boolean)
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<D20Character${attributes(
    rootAttributes,
  )}>\n  ${body}\n</D20Character>\n`;
}
