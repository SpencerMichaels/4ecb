import {
  boundAugmentHolding,
  currentInventoryHoldings,
  detailsWithLegacyTextStrings,
  inventoryHoldingKey,
  isKnownElementStored,
  legacyAugmentOverride,
  parseLegacyLootId,
  serializeLegacyLootId,
  LEGACY_AUGMENT_OVERRIDE,
  type BuildElementIdentity,
  type BuildInventoryEntry,
  type BuildKnownEntry,
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
  grantedKnownRecords,
  halfLevel,
  legacyEquipCount,
  legacyLoadoutHints,
  legacyLoadoutState,
  parseRules,
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

/** What a file can carry: the saved ID a name match replaced is not written. */
function semanticIdentity(
  identity: BuildElementIdentity,
): BuildElementIdentity {
  const { importedDefinitionId, ...written } = identity;
  void importedDefinitionId;
  return written;
}

function semanticBuild(build: CharacterBuild): unknown {
  const paths = occurrencePaths(build);
  const occurrence = (value: BuildOccurrence): unknown => ({
    identity: semanticIdentity(value.identity),
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
    // Legacy records neither whether a ritual was bought nor a native entry's
    // ID, so a known record means its exact element at its level.
    known: build.known.map((entry) => ({
      acquiredLevel: entry.acquiredLevel,
      definitionId: entry.element.definitionId,
      name: entry.element.name,
      type: entry.element.type,
    })),
    // Holdings are one current set at every level (D097): neither their order
    // nor the level of their first loot row is part of their meaning.
    inventory: [...build.inventory]
      .sort((left, right) =>
        inventoryHoldingKey(left).localeCompare(inventoryHoldingKey(right)),
      )
      .map((entry) => ({
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
      provider: semanticIdentity(alternate.provider),
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

/**
 * One `loot` row. Only the `LootTally` cache nests an item's chosen and
 * granted elements beneath it; native per-level rows are flat (none of the
 * 959 per-level rows in the sample saves has a child), and the importer
 * recovers item choices from the cache (`inventoryFrom`). Writing them in
 * both places would also repeat their `charelem` tokens.
 */
function serializeInventory(
  entry: BuildInventoryEntry,
  tokens: ReadonlyMap<string, string>,
  { children }: { readonly children: boolean },
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
          children
            ? (identity.children ?? [])
                .map((child) => serializeOccurrence(child, tokens))
                .join("")
            : "",
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
        .map((entry) => serializeInventory(entry, tokens, { children: false }))
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
    // A choice cleared in the builder must not resurface from the
    // import-time snapshot (legacy Details omit these fields anyway).
    if (selected === undefined) delete details[detail];
    else details[detail] = selected.name;
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

/** Legacy `statadd` value attributes: a number, a stat link, or a string. */
function statAddValue(value: string) {
  const trimmed = value.trim();
  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed))
    return { value: String(Number(trimmed)) };
  // Native ParseStatAdd (`-Module-.cs` ~31955) reads MINONEMOD(X) and
  // HALFMOD(X) as an ability-modifier link plus a flag, and the StatBlock
  // writer (~11709) saves them as abilmod="true" with minone/halfmod.
  const ability = /^([+-]?)(ABILITYMOD|MINONEMOD|HALFMOD)\((.+)\)$/i.exec(
    trimmed,
  );
  if (ability?.[2] !== undefined && ability[3] !== undefined) {
    const form = ability[2].toUpperCase();
    return {
      value: ability[1] === "-" ? "-1" : "1",
      statlink: ability[3],
      abilmod: "true",
      ...(form === "MINONEMOD" ? { minone: "true" } : {}),
      ...(form === "HALFMOD" ? { halfmod: "true" } : {}),
    };
  }
  const link = /^([+-])(.+)$/.exec(trimmed);
  if (link?.[1] !== undefined && link[2] !== undefined)
    return { value: link[1] === "-" ? "-1" : "1", statlink: link[2] };
  return { String: trimmed, value: "0" };
}

/**
 * Third-party readers such as iPlay4e reject a StatBlock whose stats lack the
 * legacy per-bonus `statadd` children, so each evaluated contribution is
 * written back in the legacy shape alongside the total.
 */
function statBlockXml(
  evaluation: EvaluatedCharacter,
  tokens: ReadonlyMap<string, string>,
  entities: ReadonlyMap<string, ContentEntity>,
): string {
  const occurrences = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  // Legacy writes one Stat per stat with every alias ("Dexterity", "dex"),
  // and its statlinks name the stat itself, never an alias.
  const canonicalNames = new Map<string, string>();
  const aliasesOf = new Map<string, string[]>();
  for (const occurrence of evaluation.occurrences) {
    const entity = entities.get(key(occurrence.definitionId));
    if (entity === undefined) continue;
    for (const rule of parseRules(entity.id, entity.rules)) {
      if (rule.kind !== "statalias") continue;
      canonicalNames.set(key(rule.alias), rule.name);
      aliasesOf.set(key(rule.name), [
        ...(aliasesOf.get(key(rule.name)) ?? []),
        rule.alias,
      ]);
    }
  }
  const canonical = (name: string) => canonicalNames.get(key(name)) ?? name;
  const groups = new Map<
    string,
    { name: string; names: string[]; stat: EvaluatedCharacter["stats"][string] }
  >();
  for (const [name, stat] of Object.entries(evaluation.stats)) {
    const primary = canonical(name);
    const group = groups.get(key(primary));
    if (group === undefined)
      groups.set(key(primary), { name: primary, names: [name], stat });
    else {
      group.names.push(name);
      if (key(name) === key(primary)) group.stat = stat;
    }
  }
  // Legacy also lists every stat a statlink names, at 0 when nothing adds to
  // it ("Acrobatics Trained" for an untrained skill).
  for (const stat of Object.values(evaluation.stats))
    for (const contribution of stat.contributions) {
      if (contribution.text === true) continue;
      const value = statAddValue(contribution.value);
      if (!("statlink" in value) || value.statlink === undefined) continue;
      const linked = canonical(value.statlink);
      if (!groups.has(key(linked)))
        groups.set(key(linked), {
          name: linked,
          names: [linked],
          stat: { name: linked, value: 0, contributions: [] },
        });
    }
  return element(
    "StatBlock",
    {},
    [...groups.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ name, names, stat }) => {
        const aliases = [
          name,
          ...names,
          ...(aliasesOf.get(key(name)) ?? []),
        ].filter(
          (alias, index, all) =>
            all.findIndex((other) => key(other) === key(alias)) === index,
        );
        return element(
          "Stat",
          { value: String(stat.value) },
          `${aliases.map((alias) => element("alias", { name: alias })).join("")}${stat.contributions
            .map((contribution) => {
              const occurrence = occurrences.get(contribution.providerId);
              const value =
                contribution.text === true
                  ? { String: contribution.value.trim(), value: "0" }
                  : statAddValue(contribution.value);
              return element("statadd", {
                type: contribution.bonusType,
                Level: occurrence?.acquiredLevel,
                ...value,
                ...("statlink" in value && value.statlink !== undefined
                  ? { statlink: canonical(value.statlink) }
                  : {}),
                // Native StatBlock spells it "conditional" (RULE.CONDITIONAL).
                conditional: contribution.condition,
                wearing: contribution.wearing,
                "not-wearing": contribution.notWearing,
                charelem: tokens.get(contribution.providerId),
              });
            })
            .join("")}`,
        );
      })
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
    // Holdings are current at every level (D097): one lowered below an
    // item's purchase still owns it, as the level it is exported at.
    inventory: build.inventory.map((entry) =>
      entry.acquiredLevel <= activeLevel
        ? entry
        : { ...entry, acquiredLevel: activeLevel },
    ),
    ...(build.inventoryHistory === undefined
      ? {}
      : {
          inventoryHistory: build.inventoryHistory.filter(
            (entry) => entry.acquiredLevel <= activeLevel,
          ),
        }),
    known: build.known.filter((entry) => entry.acquiredLevel <= activeLevel),
    alternates: build.alternates.flatMap((alternate) =>
      alternate.choice.acquiredLevel <= activeLevel &&
      (alternate.choice.replacesId === undefined ||
        activeIds.has(alternate.choice.replacesId))
        ? [{ ...alternate, choice: activeOccurrence(alternate.choice) }]
        : [],
    ),
    // Wallet text is written verbatim: the current wallet is already the
    // latest key at or below this level, as legacy reads it, and keys above
    // a lowered level stay as the stale values legacy itself keeps (D097).
  };
}

/**
 * The per-level `loot` rows to write. A build without imported history
 * writes its holdings. Otherwise the original transactions are written back
 * verbatim, then one row at the current level per item whose current
 * holding differs from what those transactions sum to, so legacy TallyLoot
 * arrives at exactly the current holdings (D097). A delta for an item the
 * history already holds carries no saved choices: they are in its history.
 */
export function legacyLootRows(
  build: CharacterBuild,
): readonly BuildInventoryEntry[] {
  const history = build.inventoryHistory;
  if (history === undefined) return build.inventory;
  const before = new Map(
    currentInventoryHoldings(history).map((entry) => [
      inventoryHoldingKey(entry),
      entry,
    ]),
  );
  const now = new Map(
    build.inventory.map((entry) => [inventoryHoldingKey(entry), entry]),
  );
  const deltas: BuildInventoryEntry[] = [];
  for (const key of new Set([...now.keys(), ...before.keys()])) {
    const current = now.get(key);
    const previous = before.get(key);
    const quantity = (current?.quantity ?? 0) - (previous?.quantity ?? 0);
    const equippedQuantity =
      (current?.equippedQuantity ?? 0) - (previous?.equippedQuantity ?? 0);
    const overridesChanged =
      current !== undefined &&
      JSON.stringify(sortedRecord(current.overrides)) !==
        JSON.stringify(sortedRecord(previous?.overrides ?? {}));
    if (quantity === 0 && equippedQuantity === 0 && !overridesChanged) continue;
    const { equippedSlots: _slots, ...item } = (current ?? previous)!;
    void _slots;
    deltas.push({
      ...item,
      id: `${item.id}:export-delta`,
      acquiredLevel: build.effectiveLevel,
      quantity,
      equippedQuantity,
      elements:
        previous === undefined
          ? item.elements
          : item.elements.map(({ children: _children, ...element }) => {
              void _children;
              return element;
            }),
    });
  }
  return [...history, ...deltas];
}

/**
 * Writes the modern loadout back as the legacy state it replaces (D101):
 * the loot `_AlternateSlot` flag of each holding worn in its alternate slot,
 * `_INTERNAL_MainHandWeapon` (the holding alone in the main hand),
 * `_INTERNAL_VersatileUsedTwoHanded` and `_INTERNAL_EquippedSymbol` (the
 * holding in the holy symbol slot, which native leaves out of its equip
 * count). A loadout nobody has placed by hand
 * (every holding an imported equip count, no wielding choice) is still the
 * imported state, so its text strings and flags are written back unchanged.
 */
export function withLegacyLoadoutState(
  build: CharacterBuild,
  content: readonly ContentEntity[],
): CharacterBuild {
  const placed = build.inventory.filter(
    (entry) =>
      entry.equippedSlots !== undefined || entry.wieldedTwoHanded !== undefined,
  );
  if (placed.length === 0) return build;
  const byId = new Map(
    content.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
  );
  const state = legacyLoadoutState(
    build.inventory,
    byId,
    legacyLoadoutHints(build.textStrings),
  );
  const inventory = build.inventory.map((placedEntry) => {
    if (placedEntry.equippedSlots === undefined) return placedEntry;
    // Native keeps the holy symbol slot as `_INTERNAL_EquippedSymbol`, not
    // an equip count: a symbol only worn there exports unequipped.
    const entry = placedEntry.equippedSlots.some(
      ({ slot }) => slot === "symbol",
    )
      ? {
          ...placedEntry,
          equippedQuantity: legacyEquipCount(placedEntry),
          equippedSlots: placedEntry.equippedSlots.filter(
            ({ slot }) => slot !== "symbol",
          ),
        }
      : placedEntry;
    const overrides = Object.fromEntries(
      Object.entries(entry.overrides).filter(
        ([name]) => key(name) !== "_alternateslot",
      ),
    );
    // "0" rather than nothing, so a re-import that merges the holding's
    // earlier loot rows does not keep an earlier "1".
    if (state.alternateEntryIds.has(entry.id)) overrides._AlternateSlot = "1";
    else if (
      Object.keys(entry.overrides).some(
        (name) => key(name) === "_alternateslot",
      )
    )
      overrides._AlternateSlot = "0";
    return JSON.stringify(sortedRecord(overrides)) ===
      JSON.stringify(sortedRecord(entry.overrides))
      ? entry
      : { ...entry, overrides };
  });
  const handHeld = [...state.assignmentsByEntry.values()].some((assignments) =>
    assignments.some(({ slot }) => slot === "main-hand" || slot === "off-hand"),
  );
  const textStrings = withTextString(
    withTextString(
      withTextString(
        build.textStrings,
        "_INTERNAL_MainHandWeapon",
        state.mainHandWeapon,
      ),
      // Native EquipHolySymbol.Unequip writes "".
      "_INTERNAL_EquippedSymbol",
      state.equippedSymbol ??
        (Object.keys(build.textStrings).some(
          (name) => key(name) === "_internal_equippedsymbol",
        )
          ? ""
          : undefined),
    ),
    "_INTERNAL_VersatileUsedTwoHanded",
    state.twoHandedEntryIds.size > 0
      ? "1"
      : handHeld ||
          Object.keys(build.textStrings).some(
            (name) => key(name) === "_internal_versatileusedtwohanded",
          )
        ? "0"
        : undefined,
  );
  return { ...build, inventory, textStrings };
}

/** The text strings with `name` set in place (undefined removes it). */
function withTextString(
  textStrings: Readonly<Record<string, string>>,
  name: string,
  value: string | undefined,
): Readonly<Record<string, string>> {
  let found = false;
  const entries = Object.entries(textStrings).flatMap(([textName, text]) => {
    if (key(textName) !== key(name)) return [[textName, text] as const];
    found = true;
    return value === undefined ? [] : [[textName, value] as const];
  });
  if (!found && value !== undefined) entries.push([name, value]);
  return Object.fromEntries(entries);
}

/**
 * The build as the old builder stores it: FREEBEE rituals as known loot and
 * the loadout as its legacy flags and text strings. Export writes it, and a
 * re-import is compared with it.
 */
export function legacyExportedBuild(
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
  content: readonly ContentEntity[],
): CharacterBuild {
  return withLegacyAugmentState(
    withLegacyLoadoutState(
      withLegacyFreebeeRituals(build, evaluation, content),
      content,
    ),
  );
}

function holdingDefinitionIds(entry: BuildInventoryEntry): readonly string[] {
  return entry.elements.flatMap(({ definitionId }) =>
    definitionId === undefined ? [] : [definitionId],
  );
}

/**
 * Writes each modern augment binding (`augmentEntryId`) back as the loot
 * `augment` attribute the old builder stores (a serialized CharLootID of the
 * augment's base and enchantment). A detached host writes an empty one, so a
 * re-import that merges the holding's earlier loot rows does not keep an
 * earlier binding. A holding without a modern choice keeps its imported
 * attribute verbatim, as does one whose choice names the same augment.
 */
export function withLegacyAugmentState(build: CharacterBuild): CharacterBuild {
  let changed = false;
  const inventory = build.inventory.map((entry) => {
    if (entry.augmentEntryId === undefined) return entry;
    const augment = boundAugmentHolding(
      entry,
      build.inventory,
      holdingDefinitionIds,
    );
    const ids = augment === undefined ? [] : holdingDefinitionIds(augment);
    const baseId = ids[0];
    const enchantId = ids[1];
    const saved = legacyAugmentOverride(entry);
    const savedId = saved === undefined ? undefined : parseLegacyLootId(saved);
    const same =
      baseId === undefined
        ? savedId === undefined && (saved === undefined || saved === "")
        : savedId !== undefined &&
          key(savedId.baseId) === key(baseId) &&
          key(savedId.enchantId ?? "") === key(enchantId ?? "");
    if (same) return entry;
    const name =
      Object.keys(entry.overrides).find(
        (overrideName) => key(overrideName) === LEGACY_AUGMENT_OVERRIDE,
      ) ?? LEGACY_AUGMENT_OVERRIDE;
    changed = true;
    return {
      ...entry,
      overrides: {
        ...entry.overrides,
        [name]:
          baseId === undefined
            ? ""
            : serializeLegacyLootId(
                enchantId === undefined ? { baseId } : { baseId, enchantId },
              ),
      },
    };
  });
  return changed ? { ...build, inventory } : build;
}

/**
 * Legacy gives each `FREEBEE:<ritual id>` once, as loot, and marks textstring
 * `<id>` = `Given` (MainWindow.GiveFreebees). This app derives those rituals
 * from the grant instead (D091), so export writes what the old builder would
 * have stored itself: every FREEBEE ritual not already known becomes a known
 * entry at its provider's level, with the `Given` marker. `grant`-granted
 * rituals add nothing; legacy keeps them as granted elements.
 */
export function withLegacyFreebeeRituals(
  build: CharacterBuild,
  evaluation: Pick<EvaluatedCharacter, "occurrences" | "stats">,
  content: readonly ContentEntity[],
): CharacterBuild {
  const entities = contentMap(content);
  const additions = grantedKnownRecords(evaluation, (id) =>
    entities.get(key(id)),
  ).flatMap((granted): BuildKnownEntry[] => {
    const entity = entities.get(key(granted.definitionId));
    if (granted.via !== "freebee" || entity === undefined) return [];
    const element = {
      definitionId: entity.id,
      name: entity.name,
      type: entity.type,
    };
    if (isKnownElementStored(build, element)) return [];
    return [
      {
        id: `export:freebee:${entity.id}`,
        acquiredLevel: Math.min(
          build.effectiveLevel,
          Math.max(1, granted.acquiredLevel ?? 1),
        ),
        element,
        acquisition: "free",
      },
    ];
  });
  if (additions.length === 0) return build;
  return {
    ...build,
    known: [...build.known, ...additions],
    textStrings: {
      ...build.textStrings,
      ...Object.fromEntries(
        additions.map(({ element }) => [element.definitionId!, "Given"]),
      ),
    },
  };
}

/** A known record as the `loot` legacy stores it in. */
function knownHolding(entry: BuildKnownEntry): BuildInventoryEntry {
  return {
    id: entry.id,
    acquiredLevel: entry.acquiredLevel,
    ...(entry.legacyLoot ?? {
      quantity: 1,
      equippedQuantity: 0,
      elements: [entry.element],
      showPowerCard: true,
      overrides: {},
      legality: "rules-legal" as const,
    }),
  };
}

/** Legacy has no known list: each known record is written back as loot. */
function withKnownAsLoot(build: CharacterBuild): CharacterBuild {
  return {
    ...build,
    inventory: [...build.inventory, ...build.known.map(knownHolding)],
    known: [],
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
      .map((entry) => serializeInventory(entry, tokens, { children: true }))
      .join(""),
  );
}

function powerSpecificsXml(
  power: EvaluatedCharacter["powers"][number],
  evaluation: EvaluatedCharacter,
  entities: ReadonlyMap<string, ContentEntity>,
): string {
  const entity = entities.get(key(power.definitionId));
  const fields: Record<string, string> = {
    ...(entity?.flavor === undefined ? {} : { Flavor: entity.flavor }),
    ...(entity === undefined
      ? {}
      : applyFieldOverlays(entity, evaluation.overlays)),
  };
  for (const [name, value] of [
    ["Power Usage", power.usage],
    ["Action Type", power.actionType],
  ] as const) {
    const existing =
      Object.keys(fields).find((field) => key(field) === key(name)) ?? name;
    if (value !== undefined) fields[existing] = value;
  }
  return Object.entries(fields)
    .map(([name, value]) => element("specific", { name }, escapeText(value)))
    .join("");
}

/**
 * Legacy always writes every weapon field, empty when it does not apply;
 * iPlay4e rejects a file whose power weapons omit Damage or
 * DamageComponents, and shows no power cards without the power's text.
 */
type PowerComponentPart =
  EvaluatedCharacter["powers"][number]["variants"][number]["attackComponents"][number];

/**
 * Legacy writes each value padded with one space (`<AttackBonus> 11 </...>`);
 * iPlay4e rejects the file without the padding.
 */
function padded(value: string): string {
  return ` ${value} `;
}

/**
 * Legacy component text: " +5 Wisdom modifier.\r\n+4 half your level.\r\n"
 * then a blank line and the closing indentation. A bonus from another
 * element reads "+2 bonus - <source>"; the power's own bonus is "power
 * modifier", listed first. iPlay4e rejects other layouts.
 */
function legacyComponentText(parts: readonly PowerComponentPart[]): string {
  const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
  const lines = [...parts]
    .filter((part) => !(part.label === "Unknown modifier" && part.value === 0))
    .sort(
      (left, right) =>
        Number(right.label === "power attack bonus") -
        Number(left.label === "power attack bonus"),
    )
    .map((part) =>
      part.label === "power attack bonus"
        ? `${signed(part.value)} power modifier.`
        : part.source !== undefined
          ? `${signed(part.value)} bonus - ${part.source}`
          : `${signed(part.value)} ${part.label}.`,
    );
  const indent = "               ";
  return lines.length === 0
    ? ` \r\n${indent}`
    : ` ${lines.join("\r\n")}\r\n\r\n${indent}`;
}

/** "cold and lightning" → "Cold and Lightning", as legacy's DamageType. */
function legacyDamageType(value: string): string {
  return value.replace(
    /\b([a-z])([a-z]*)/g,
    (word, first: string, rest: string) =>
      ["and", "or"].includes(word) ? word : first.toUpperCase() + rest,
  );
}

function powerStatsXml(
  evaluation: EvaluatedCharacter,
  entities: ReadonlyMap<string, ContentEntity>,
): string {
  // Legacy keeps a placeholder Unarmed row on a Healing power without a Hit
  // line so its healing bonus has somewhere to live; readers expect it.
  const healingRow =
    (): EvaluatedCharacter["powers"][number]["variants"][number] => {
      const half = halfLevel(evaluation.level);
      return {
        id: "healing-placeholder",
        equipmentName: "Unarmed",
        attackStat: "Unknown",
        defense: "Unknown",
        attackBonus: half,
        attackComponents: [{ label: "half your level", value: half }],
        damageComponents: [],
        conditionalDamage: [],
        proficient: true,
      };
    };
  return element(
    "PowerStats",
    {},
    evaluation.powers
      .map((power) =>
        element(
          "Power",
          { name: power.name },
          `${powerSpecificsXml(power, evaluation, entities)}${(power.variants
            .length === 0 &&
          power.keywords.some((keyword) => key(keyword) === "healing")
            ? [healingRow()]
            : power.variants
          )
            .map((variant) =>
              element(
                "Weapon",
                { name: variant.equipmentName },
                `${element("AttackBonus", {}, escapeText(padded(variant.attackBonus === undefined ? "" : String(variant.attackBonus))))}${element(
                  "Damage",
                  {},
                  escapeText(padded(variant.damage ?? "")),
                )}${
                  variant.damageType === undefined
                    ? ""
                    : element(
                        "DamageType",
                        {},
                        escapeText(
                          padded(legacyDamageType(variant.damageType)),
                        ),
                      )
                }${element(
                  "AttackStat",
                  {},
                  escapeText(padded(variant.attackStat ?? "")),
                )}${element("Defense", {}, escapeText(padded(variant.defense ?? "")))}${
                  power.healing === undefined || power.healing.bonus === 0
                    ? ""
                    : element(
                        "Healing",
                        {},
                        escapeText(
                          padded(
                            `regain an additional ${power.healing.bonus} hit points.`,
                          ),
                        ),
                      )
                }${element(
                  "HitComponents",
                  {},
                  escapeText(legacyComponentText(variant.attackComponents)),
                )}${element(
                  "DamageComponents",
                  {},
                  escapeText(legacyComponentText(variant.damageComponents)),
                )}${
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
    )}${statBlockXml(input.evaluation, tokens, entities)}${ruleTallyXml(
      input.evaluation,
      entities,
    )}${lootTallyXml(input.build, tokens)}${powerStatsXml(input.evaluation, entities)}${preserved}`,
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
  const projected = projectBuildForLegacyExport(
    legacyExportedBuild(input.build, input.evaluation, input.content),
  );
  const build = withKnownAsLoot({
    ...projected,
    inventory: legacyLootRows(projected),
  });

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
