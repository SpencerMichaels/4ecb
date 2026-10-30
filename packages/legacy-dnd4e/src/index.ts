import type {
  BuildAlternate,
  BuildElementIdentity,
  BuildInventoryEntry,
  BuildLegality,
  BuildOccurrence,
  BuildUserEdit,
  BuildUserRule,
  CharacterBuild,
  LegacyCharacterSnapshot,
  LegacyEnvelope,
  LegacyLootSnapshot,
  LegacyPowerSnapshot,
  LegacyRuleElement,
  LegacyWeaponSnapshot,
} from "@4ecb/character-domain";
import {
  CHARACTER_BUILD_FORMAT_VERSION,
  separateKnownHoldings,
  settleInventory,
} from "@4ecb/character-domain";
import { SaxesParser } from "saxes";

import {
  matchMissingDefinitions,
  type Dnd4eDefinitionMatching,
  type MatchableDefinition,
} from "./definition-matching";

export * from "./definition-matching";
export * from "./saved-selection-audit";
export * from "./writer";

export interface Dnd4eImportDiagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
}

export interface Dnd4eImportReport {
  readonly diagnostics: readonly Dnd4eImportDiagnostic[];
  readonly rootVersion?: string;
  readonly gameSystem?: string;
  readonly legality?: string;
  readonly levelCount: number;
  readonly selectedRuleCount: number;
  readonly powerCount: number;
  readonly lootCount: number;
  readonly unknownRootElements: readonly string[];
  readonly usesLegacyCache: true;
  /** Present when the import matched missing IDs by name (see options). */
  readonly definitionMatching?: Dnd4eDefinitionMatching;
}

export interface Dnd4eImportOptions {
  /**
   * The active content. When given, a saved internal-id it lacks is pointed
   * at the one record with the same name and type (`matchMissingDefinitions`).
   */
  readonly matchMissingDefinitionsIn?: readonly MatchableDefinition[];
}

export interface Dnd4eImportResult {
  readonly envelope: LegacyEnvelope;
  readonly snapshot: LegacyCharacterSnapshot;
  readonly build: CharacterBuild;
  readonly report: Dnd4eImportReport;
}

interface XmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlNode[];
  text: string;
}

function key(value: string): string {
  return value.toLocaleLowerCase();
}

function attribute(node: XmlNode, name: string): string | undefined {
  const wanted = key(name);
  return Object.entries(node.attributes).find(
    ([candidate]) => key(candidate) === wanted,
  )?.[1];
}

function direct(node: XmlNode, name: string): XmlNode[] {
  const wanted = key(name);
  return node.children.filter((child) => key(child.name) === wanted);
}

function first(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node === undefined ? undefined : direct(node, name)[0];
}

function normalizedText(node: XmlNode | undefined): string {
  if (node === undefined) return "";
  const nested = node.children.map(normalizedText).join("");
  return `${node.text}${nested}`.replace(/\r\n?/g, "\n").trim();
}

function buildUserRule(node: XmlNode): BuildUserRule {
  return {
    name: node.name,
    attributes: Object.entries(node.attributes).map(([name, value]) => ({
      name,
      value,
    })),
    text: node.text.replace(/\r\n?/g, "\n").trim(),
    children: node.children.map(buildUserRule),
  };
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
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.write(xml).close();
  if (root === undefined)
    throw new Error("The file does not contain an XML root element");
  return root;
}

function detailsFrom(sheet: XmlNode | undefined): Record<string, string> {
  const details = first(sheet, "Details");
  if (details === undefined) return {};
  return Object.fromEntries(
    details.children.map((node) => [node.name, normalizedText(node)]),
  );
}

function abilitiesFrom(sheet: XmlNode | undefined): Record<string, number> {
  const scores = first(sheet, "AbilityScores");
  if (scores === undefined) return {};
  return Object.fromEntries(
    scores.children.flatMap((node) => {
      const score = Number(attribute(node, "score"));
      return Number.isFinite(score) ? [[node.name, score] as const] : [];
    }),
  );
}

function statsFrom(sheet: XmlNode | undefined): Record<string, string> {
  const block = first(sheet, "StatBlock");
  if (block === undefined) return {};
  const result: Record<string, string> = {};
  for (const stat of direct(block, "Stat")) {
    const value = attribute(stat, "value") ?? "";
    for (const alias of direct(stat, "alias")) {
      const name = attribute(alias, "name");
      if (name !== undefined && result[name] === undefined)
        result[name] = value;
    }
  }
  return result;
}

function ruleElement(node: XmlNode): LegacyRuleElement {
  const id = attribute(node, "internal-id");
  const legality = attribute(node, "legality");
  const description = direct(node, "specific").find(
    (specific) =>
      key(attribute(specific, "name") ?? "") === "short description",
  );
  const shortDescription = normalizedText(description) || undefined;
  return {
    ...(id === undefined ? {} : { id }),
    name: attribute(node, "name") ?? "",
    type: attribute(node, "type") ?? "",
    ...(legality === undefined ? {} : { legality }),
    ...(shortDescription === undefined
      ? {}
      : { description: shortDescription }),
  };
}

function buildLegality(value: string | undefined): BuildLegality {
  return value === undefined || key(value) === "rules-legal"
    ? "rules-legal"
    : "houserule";
}

function buildIdentity(node: XmlNode): BuildElementIdentity {
  const definitionId = attribute(node, "internal-id");
  const url = attribute(node, "url");
  return {
    ...(definitionId === undefined ? {} : { definitionId }),
    name: attribute(node, "name") ?? "",
    type: attribute(node, "type") ?? "",
    ...(url === undefined ? {} : { url }),
  };
}

interface ParsedOccurrence extends BuildOccurrence {
  readonly legacyToken?: string;
  readonly replacesToken?: string;
  readonly children: readonly ParsedOccurrence[];
}

function occurrenceFrom(
  node: XmlNode,
  level: number,
  path: string,
): ParsedOccurrence {
  const legacyToken = attribute(node, "charelem");
  const replacesToken = attribute(node, "replaces");
  const identity = buildIdentity(node);
  return {
    id: legacyToken === undefined ? `legacy:${path}` : `legacy:${legacyToken}`,
    identity,
    acquiredLevel: level,
    legality: buildLegality(attribute(node, "legality")),
    children: direct(node, "RulesElement").map((child, index) =>
      occurrenceFrom(child, level, `${path}.${index}`),
    ),
    unresolved:
      identity.definitionId === undefined &&
      identity.name.length === 0 &&
      identity.type.length === 0,
    ...(legacyToken === undefined ? {} : { legacyToken }),
    ...(replacesToken === undefined ? {} : { replacesToken }),
  };
}

function resolveReplacementLinks(
  rootOccurrences: readonly ParsedOccurrence[],
): BuildOccurrence[] {
  const tokenIds = new Map<string, string>();
  const visit = (occurrence: ParsedOccurrence) => {
    if (occurrence.legacyToken !== undefined)
      tokenIds.set(occurrence.legacyToken, occurrence.id);
    occurrence.children.forEach(visit);
  };
  rootOccurrences.forEach(visit);
  const clean = (occurrence: ParsedOccurrence): BuildOccurrence => {
    const { legacyToken, replacesToken, ...base } = occurrence;
    void legacyToken;
    return {
      ...base,
      ...(replacesToken === undefined
        ? {}
        : {
            replacesId:
              tokenIds.get(replacesToken) ?? `legacy:${replacesToken}`,
          }),
      children: occurrence.children.map(clean),
    };
  };
  return rootOccurrences.map(clean);
}

function inventoryFrom(
  root: XmlNode,
  sheet: XmlNode | undefined,
): BuildInventoryEntry[] {
  const result: BuildInventoryEntry[] = [];
  for (const [levelIndex, levelNode] of direct(root, "Level").entries()) {
    for (const [lootIndex, loot] of direct(levelNode, "loot").entries()) {
      const quantity =
        Number.parseInt(attribute(loot, "count") ?? "0", 10) || 0;
      const equippedQuantity =
        Number.parseInt(attribute(loot, "equip-count") ?? "0", 10) || 0;
      const known = new Set([
        "count",
        "equip-count",
        "name",
        "showpowercard",
        "legality",
      ]);
      const overrides = Object.fromEntries(
        Object.entries(loot.attributes).filter(
          ([name]) => !known.has(key(name)),
        ),
      );
      const name = attribute(loot, "name");
      const elements = direct(loot, "RulesElement").map(
        (node, elementIndex) => {
          const children = resolveReplacementLinks(
            direct(node, "RulesElement").map((child, childIndex) =>
              occurrenceFrom(
                child,
                levelIndex + 1,
                `loot:${levelIndex + 1}:${lootIndex}:definition:${elementIndex}:${childIndex}`,
              ),
            ),
          );
          return {
            ...buildIdentity(node),
            ...(children.length === 0 ? {} : { children }),
          };
        },
      );
      result.push({
        id: `legacy:loot:${levelIndex + 1}:${lootIndex}`,
        acquiredLevel: levelIndex + 1,
        quantity,
        equippedQuantity,
        elements,
        ...(name === undefined ? {} : { name }),
        ...(attribute(loot, "ShowPowerCard") === undefined
          ? {}
          : { showPowerCard: attribute(loot, "ShowPowerCard") !== "0" }),
        overrides,
        legality: buildLegality(attribute(loot, "legality")),
      });
    }
  }
  const tally = sheet === undefined ? undefined : first(sheet, "LootTally");
  const cachedLootEntries = tally === undefined ? [] : direct(tally, "loot");
  for (const [cachedIndex, cachedLoot] of cachedLootEntries.entries()) {
    const cachedElements = direct(cachedLoot, "RulesElement");
    const identity = cachedElements
      .map(
        (node) =>
          attribute(node, "internal-id") ?? attribute(node, "name") ?? "",
      )
      .join("\0")
      .toLocaleLowerCase();
    const matchIndex = result.findLastIndex(
      (entry) =>
        entry.quantity > 0 &&
        entry.elements
          .map((element) => element.definitionId ?? element.name)
          .join("\0")
          .toLocaleLowerCase() === identity,
    );
    if (matchIndex < 0) continue;
    const match = result[matchIndex]!;
    const elements = match.elements.map((element, elementIndex) => {
      if ((element.children?.length ?? 0) > 0) return element;
      const cachedElement = cachedElements[elementIndex];
      if (cachedElement === undefined) return element;
      const children = resolveReplacementLinks(
        direct(cachedElement, "RulesElement").map((child, childIndex) =>
          occurrenceFrom(
            child,
            match.acquiredLevel,
            `cached-loot:${cachedIndex}:definition:${elementIndex}:${childIndex}`,
          ),
        ),
      );
      return children.length === 0 ? element : { ...element, children };
    });
    result[matchIndex] = { ...match, elements };
  }
  return result;
}

function buildFrom(
  root: XmlNode,
  sheet: XmlNode | undefined,
  snapshotAbilities: Readonly<Record<string, number>>,
  textStrings: Readonly<Record<string, string>>,
): CharacterBuild {
  const levelNodes = direct(root, "Level");
  const parsedLevelEntries = levelNodes.flatMap((levelNode, index) => {
    const rootElement = direct(levelNode, "RulesElement")[0];
    return rootElement === undefined
      ? []
      : [
          {
            node: levelNode,
            root: occurrenceFrom(rootElement, index + 1, `level:${index + 1}`),
          },
        ];
  });
  const parsedLevels = parsedLevelEntries.map((entry) => entry.root);
  const parsedGrabbag = direct(root, "Grabbag").flatMap((container, index) =>
    direct(container, "RulesElement").map((node, childIndex) =>
      occurrenceFrom(node, 0, `grabbag:${index}:${childIndex}`),
    ),
  );
  const resolved = resolveReplacementLinks([...parsedLevels, ...parsedGrabbag]);
  const levelRoots = resolved.slice(0, parsedLevels.length);
  const grabbag = resolved.slice(parsedLevels.length);
  const userEditFrom = (
    levelNode: XmlNode | undefined,
    level: number,
  ): BuildUserEdit | undefined => {
    const container = first(levelNode, "UserEdit");
    const rootElement = first(container, "RulesElement");
    if (container === undefined || rootElement === undefined) return undefined;
    const rules = first(container, "rules");
    return {
      root: resolveReplacementLinks([
        occurrenceFrom(rootElement, level, `user-edit:${level}`),
      ])[0]!,
      rules: rules?.children.map(buildUserRule) ?? [],
    };
  };
  const alternates: BuildAlternate[] = direct(root, "alternate").flatMap(
    (node, index) => {
      const choice = direct(node, "RulesElement")[0];
      if (choice === undefined) return [];
      const provider = buildIdentity(node);
      return [
        {
          id: `legacy:alternate:${index}`,
          selectName: attribute(node, "SelectName") ?? "",
          provider,
          choice: occurrenceFrom(choice, 0, `alternate:${index}`),
        },
      ];
    },
  );
  // A ritual, formula or practice in `loot` is a known record, not gear.
  const { inventory, known } = separateKnownHoldings(
    inventoryFrom(root, sheet),
  );
  return {
    formatVersion: CHARACTER_BUILD_FORMAT_VERSION,
    effectiveLevel: Math.max(1, parsedLevels.length),
    levels: levelRoots.map((rootOccurrence, index) => {
      const userEdit = userEditFrom(parsedLevelEntries[index]?.node, index + 1);
      return {
        level: index + 1,
        root: rootOccurrence,
        ...(userEdit === undefined ? {} : { userEdit }),
      };
    }),
    grabbag,
    // Per-level loot becomes current holdings; the rows stay as history.
    ...settleInventory(inventory),
    known,
    alternates,
    baseAbilities: snapshotAbilities,
    textStrings,
  };
}

/** The `Level` specific of each tallied record, keyed by folded internal-id. */
function tallyLevelsFrom(sheet: XmlNode | undefined): Map<string, number> {
  const tally = first(sheet, "RulesElementTally");
  const levels = new Map<string, number>();
  for (const node of tally === undefined ? [] : direct(tally, "RulesElement")) {
    const id = attribute(node, "internal-id");
    const level = Number.parseInt(specifics(node)["Level"] ?? "", 10);
    if (id !== undefined && Number.isSafeInteger(level) && !levels.has(key(id)))
      levels.set(key(id), level);
  }
  return levels;
}

function selectedRulesFrom(sheet: XmlNode | undefined): LegacyRuleElement[] {
  const tally = first(sheet, "RulesElementTally");
  return tally === undefined
    ? []
    : direct(tally, "RulesElement").map(ruleElement);
}

function specifics(node: XmlNode): Record<string, string> {
  return Object.fromEntries(
    direct(node, "specific").map((specific) => [
      attribute(specific, "name") ?? "",
      normalizedText(specific),
    ]),
  );
}

function weaponFrom(node: XmlNode): LegacyWeaponSnapshot {
  const value = (name: string) =>
    normalizedText(first(node, name)) || undefined;
  const attackBonus = value("AttackBonus");
  const damage = value("Damage");
  const attackStat = value("AttackStat");
  const defense = value("Defense");
  const hitComponents = value("HitComponents");
  const damageComponents = value("DamageComponents");
  const conditions = value("Conditions");
  return {
    name: attribute(node, "name") ?? "Unspecified",
    definitionIds: direct(node, "RulesElement").flatMap((element) => {
      const id = attribute(element, "internal-id");
      return id === undefined ? [] : [id];
    }),
    ...(attackBonus === undefined ? {} : { attackBonus }),
    ...(damage === undefined ? {} : { damage }),
    ...(attackStat === undefined ? {} : { attackStat }),
    ...(defense === undefined ? {} : { defense }),
    ...(hitComponents === undefined ? {} : { hitComponents }),
    ...(damageComponents === undefined ? {} : { damageComponents }),
    ...(conditions === undefined ? {} : { conditions }),
  };
}

export function canonicalLegacyEquipmentName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .toSorted()
    .join(" ");
}

export function legacyEquipmentIdentityMatches(
  cached: LegacyWeaponSnapshot,
  candidate: {
    readonly equipmentName: string;
    readonly definitionIds: readonly string[];
  },
): boolean {
  if ((cached.definitionIds?.length ?? 0) > 0) {
    const cachedIds = new Set(cached.definitionIds?.map((id) => key(id)));
    const candidateIds = new Set(candidate.definitionIds.map((id) => key(id)));
    return (
      cachedIds.size === candidateIds.size &&
      [...cachedIds].every((id) => candidateIds.has(id))
    );
  }
  return (
    canonicalLegacyEquipmentName(cached.name) ===
    canonicalLegacyEquipmentName(candidate.equipmentName)
  );
}

/** An evaluated power variant as the main-hand row-order check reads it. */
export interface LegacyHandOrderVariant {
  readonly equipmentName: string;
  readonly definitionIds?: readonly string[] | undefined;
  readonly equipped?: boolean | undefined;
  readonly hand?: "main" | "off" | undefined;
}

/**
 * Native PowerStats lists a power's weapon rows in the order of the
 * workspace weapons list, which BuildWeaponsList sorts with comes_before
 * (`-Module-.cs` ~22312 and the comes_before below weapon_sort): equipped
 * items first, then the loot whose CharLootSlot is "Main hand", then by
 * level. So when two or more cached rows are equipped items and the modern
 * evaluation names a main-hand item, the first equipped cached row must be a
 * main-hand variant. Returns undefined when that is not comparable (no
 * modern main hand, or fewer than two equipped cached rows). The cached rows'
 * values are compared by weapon identity elsewhere, so a swapped hand is
 * invisible there; this check catches it.
 */
export function compareLegacyMainHandOrder(
  cachedWeapons: readonly LegacyWeaponSnapshot[],
  variants: readonly LegacyHandOrderVariant[],
):
  | { readonly expected: string; readonly actual: string; matches: boolean }
  | undefined {
  const mains = variants.filter(
    (variant) => variant.equipped === true && variant.hand === "main",
  );
  if (mains.length === 0) return undefined;
  const equippedRows = cachedWeapons.flatMap((cached) => {
    const variant = variants.find((candidate) =>
      legacyEquipmentIdentityMatches(cached, {
        equipmentName: candidate.equipmentName,
        definitionIds: candidate.definitionIds ?? [],
      }),
    );
    return variant?.equipped === true ? [{ cached, variant }] : [];
  });
  const [first] = equippedRows;
  if (first === undefined || equippedRows.length < 2) return undefined;
  if (!equippedRows.some(({ variant }) => variant.hand === "main"))
    return undefined;
  return {
    expected: first.cached.name,
    actual: mains.map((variant) => variant.equipmentName).join(", "),
    matches: first.variant.hand === "main",
  };
}

function canonicalLegacyPowerValue(value: string): string {
  return value
    .replace(/\s+/g, "")
    .split("+")
    .filter((part, index) => index === 0 || !/^0(?:d\d+)?$/i.test(part))
    .join("+")
    .toLocaleLowerCase();
}

export function legacyPowerValueMatches(
  expected: string,
  actual: string | undefined,
): boolean {
  return (
    actual !== undefined &&
    canonicalLegacyPowerValue(expected) === canonicalLegacyPowerValue(actual)
  );
}

function powersFrom(sheet: XmlNode | undefined): LegacyPowerSnapshot[] {
  const powerStats = first(sheet, "PowerStats");
  const tally = first(sheet, "RulesElementTally");
  if (powerStats === undefined) return [];
  const tallyPowers = new Map<string, XmlNode>();
  for (const node of tally === undefined ? [] : direct(tally, "RulesElement")) {
    if (key(attribute(node, "type") ?? "") === "power")
      tallyPowers.set(key(attribute(node, "name") ?? ""), node);
  }
  return direct(powerStats, "Power").map((power) => {
    const name = attribute(power, "name") ?? "Unnamed power";
    const cached = specifics(power);
    const selected = tallyPowers.get(key(name));
    const fields = selected === undefined ? {} : specifics(selected);
    const id =
      selected === undefined ? undefined : attribute(selected, "internal-id");
    return {
      name,
      ...(id === undefined ? {} : { id }),
      ...(cached["Power Usage"] === undefined
        ? {}
        : { usage: cached["Power Usage"] }),
      ...(cached["Action Type"] === undefined
        ? {}
        : { actionType: cached["Action Type"] }),
      ...(fields.Keywords === undefined ? {} : { keywords: fields.Keywords }),
      ...(fields["Attack Type"] === undefined
        ? {}
        : { attackType: fields["Attack Type"] }),
      ...(fields.Target === undefined ? {} : { target: fields.Target }),
      ...(fields["Power Description"] === undefined
        ? {}
        : { description: fields["Power Description"] }),
      ...(fields.Source === undefined ? {} : { source: fields.Source }),
      ...(fields.Level === undefined ? {} : { level: fields.Level }),
      weapons: direct(power, "Weapon").map(weaponFrom),
    };
  });
}

function lootFrom(sheet: XmlNode | undefined): LegacyLootSnapshot[] {
  const tally = first(sheet, "LootTally");
  if (tally === undefined) return [];
  return direct(tally, "loot").flatMap((loot) => {
    const elements = direct(loot, "RulesElement").map(ruleElement);
    const count = Number.parseInt(attribute(loot, "count") ?? "0", 10) || 0;
    if (
      count <= 0 &&
      (Number.parseInt(attribute(loot, "equip-count") ?? "0", 10) || 0) <= 0
    )
      return [];
    return [
      {
        name:
          attribute(loot, "name") ??
          elements
            .map((item) => item.name)
            .filter(Boolean)
            .join(" "),
        count,
        equippedCount:
          Number.parseInt(attribute(loot, "equip-count") ?? "0", 10) || 0,
        showPowerCard: attribute(loot, "ShowPowerCard") !== "0",
        elements,
      },
    ];
  });
}

/** One `statadd` a save's StatBlock attributes to a rules element. */
export interface SavedStatAdd {
  /** Every alias of the Stat it adds to; the first is the Stat's own name. */
  readonly stat: readonly string[];
  /** Its attributes, without the instance's `Level` and `charelem`. */
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * A rules element instance as a save recorded it: the specifics it saved
 * and the statadds the StatBlock attributes to its `charelem`.
 */
export interface SavedRuleElement extends LegacyRuleElement {
  readonly charelem?: string;
  /** `tally` (RulesElementTally) or `loot` (LootTally). */
  readonly section: "tally" | "loot";
  /** For loot: whether its holding was equipped, so its statadds applied. */
  readonly equipped?: boolean;
  readonly specifics: Readonly<Record<string, string>>;
  readonly statAdds: readonly SavedStatAdd[];
}

/** The rules evidence a save stored (`savedCharacterRules`). */
export interface SavedCharacterRules {
  readonly elements: readonly SavedRuleElement[];
  /** Each StatBlock Stat's aliases; the first is the Stat's own name. */
  readonly stats: readonly (readonly string[])[];
}

/**
 * The rules a save stored for each selected element and holding: the
 * evidence of which content generation the legacy builder ran. Statadds are
 * read from the StatBlock by `charelem`; a placeholder element (an ID the
 * builder's content lacked, saved `legality="houserule"`) has none.
 */
export function savedCharacterRules(input: string): SavedCharacterRules {
  const root = parseTree(input.startsWith("\uFEFF") ? input.slice(1) : input);
  const sheet = first(root, "CharacterSheet");
  const statAdds = new Map<string, SavedStatAdd[]>();
  const stats: string[][] = [];
  const block = first(sheet, "StatBlock");
  for (const stat of block === undefined ? [] : direct(block, "Stat")) {
    const aliases = direct(stat, "alias").flatMap((alias) => {
      const name = attribute(alias, "name");
      return name === undefined ? [] : [name];
    });
    stats.push(aliases);
    for (const add of direct(stat, "statadd")) {
      const charelem = attribute(add, "charelem");
      if (charelem === undefined) continue;
      const attributes = Object.fromEntries(
        Object.entries(add.attributes).filter(
          ([name]) => key(name) !== "level" && key(name) !== "charelem",
        ),
      );
      statAdds.set(charelem, [
        ...(statAdds.get(charelem) ?? []),
        { stat: aliases, attributes },
      ]);
    }
  }
  const saved = (
    node: XmlNode,
    section: SavedRuleElement["section"],
    equipped?: boolean,
  ): SavedRuleElement => {
    const charelem = attribute(node, "charelem");
    return {
      ...ruleElement(node),
      ...(charelem === undefined ? {} : { charelem }),
      section,
      ...(equipped === undefined ? {} : { equipped }),
      specifics: specifics(node),
      statAdds: charelem === undefined ? [] : (statAdds.get(charelem) ?? []),
    };
  };
  const tally = first(sheet, "RulesElementTally");
  const loot = first(sheet, "LootTally");
  const elements = [
    ...(tally === undefined
      ? []
      : direct(tally, "RulesElement").map((node) => saved(node, "tally"))),
    ...(loot === undefined
      ? []
      : direct(loot, "loot").flatMap((holding) => {
          const equipped =
            (Number.parseInt(attribute(holding, "equip-count") ?? "0", 10) ||
              0) > 0;
          return direct(holding, "RulesElement").map((node) =>
            saved(node, "loot", equipped),
          );
        })),
  ];
  return { elements, stats };
}

function textStringsFrom(root: XmlNode): Record<string, string> {
  return Object.fromEntries(
    direct(root, "textstring").map((node) => [
      attribute(node, "name") ?? "",
      normalizedText(node),
    ]),
  );
}

export function importDnd4e(
  input: string,
  options: Dnd4eImportOptions = {},
): Dnd4eImportResult {
  const sourceXml = input;
  const root = parseTree(input.startsWith("\uFEFF") ? input.slice(1) : input);
  if (key(root.name) !== "d20character")
    throw new Error(`Expected D20Character root but found ${root.name}`);
  const gameSystem = attribute(root, "game-system");
  const version = attribute(root, "Version");
  const legality = attribute(root, "legality");
  const sheet = first(root, "CharacterSheet");
  const known = new Set([
    "charactersheet",
    "d20campaignsetting",
    "level",
    "textstring",
    "alternate",
    "grabbag",
    "ruleselementtally",
    "loot",
    "loottally",
    "abilityscores",
    "statblock",
    "journal",
    "companions",
    "powerstats",
    "details",
  ]);
  const unknownRootElements = root.children
    .map((node) => node.name)
    .filter((name) => !known.has(key(name)));
  const levelCount = direct(root, "Level").length;
  const selectedRules = selectedRulesFrom(sheet);
  const details = detailsFrom(sheet);
  for (const type of [
    "Race",
    "Class",
    "Theme",
    "Paragon Path",
    "Epic Destiny",
  ]) {
    const selected = selectedRules.find((rule) => key(rule.type) === key(type));
    const detailKey = type.replaceAll(" ", "");
    if (details[detailKey] === undefined && selected?.name) {
      details[detailKey] = selected.name;
    }
  }
  const powers = powersFrom(sheet);
  const loot = lootFrom(sheet);
  const abilities = abilitiesFrom(sheet);
  const rootAbilities = abilitiesFrom(root);
  const textStrings = textStringsFrom(root);
  const diagnostics: Dnd4eImportDiagnostic[] = [];
  if (gameSystem !== "D&D4E")
    diagnostics.push({
      severity: "warning",
      code: "root.game-system",
      message: `Unexpected game system: ${gameSystem ?? "missing"}`,
    });
  if (sheet === undefined)
    diagnostics.push({
      severity: "warning",
      code: "snapshot.missing",
      message:
        "No CharacterSheet cache is present; only limited metadata can be displayed until the rules engine is available.",
    });
  if (unknownRootElements.length > 0)
    diagnostics.push({
      severity: "info",
      code: "extensions.preserved",
      message: `${unknownRootElements.length} unknown root element(s) were preserved verbatim.`,
    });
  diagnostics.push({
    severity: "info",
    code: "snapshot.legacy-cache",
    message:
      "Displayed calculations come from the legacy CharacterSheet cache and have not yet been recalculated.",
  });
  const parsedBuild = buildFrom(
    root,
    sheet,
    Object.keys(rootAbilities).length === 0 ? abilities : rootAbilities,
    textStrings,
  );
  const content = options.matchMissingDefinitionsIn;
  let build = parsedBuild;
  let definitionMatching: Dnd4eDefinitionMatching | undefined;
  if (content !== undefined) {
    const levels = tallyLevelsFrom(sheet);
    const result = matchMissingDefinitions(parsedBuild, content, {
      savedLevel: (id) => levels.get(key(id)),
    });
    build = result.build;
    definitionMatching = result.matching;
    const { matched, ambiguous } = result.matching;
    if (matched.length > 0)
      diagnostics.push({
        severity: "info",
        code: "definitions.matched-by-name",
        message: `${matched.length} saved record(s) missing from the active content were matched to records with the same name; exports use the matched IDs.`,
      });
    for (const entry of ambiguous)
      diagnostics.push({
        severity: "warning",
        code: "definitions.ambiguous-name",
        message: `${entry.savedName} (${entry.type}) isn't in the active content, and ${entry.candidateIds.length} records share its name, so it wasn't matched.`,
      });
  }
  return {
    envelope: {
      format: "dnd4e",
      origin: "imported",
      ...(version === undefined ? {} : { version }),
      ...(gameSystem === undefined ? {} : { gameSystem }),
      ...(legality === undefined ? {} : { legality }),
      sourceXml,
    },
    snapshot: {
      details,
      abilities,
      stats: statsFrom(sheet),
      selectedRules,
      powers,
      loot,
      textStrings,
      levelCount,
      source: "legacy-cache",
    },
    build,
    report: {
      diagnostics,
      ...(version === undefined ? {} : { rootVersion: version }),
      ...(gameSystem === undefined ? {} : { gameSystem }),
      ...(legality === undefined ? {} : { legality }),
      levelCount,
      selectedRuleCount: selectedRules.length,
      powerCount: powers.length,
      lootCount: loot.length,
      unknownRootElements,
      usesLegacyCache: true,
      ...(definitionMatching === undefined ? {} : { definitionMatching }),
    },
  };
}

/** M3 is loss-preserving: until engine-backed edits exist, export the imported envelope byte-for-byte (apart from an optional BOM). */
export function exportDnd4e(envelope: LegacyEnvelope): string {
  return envelope.sourceXml;
}

export function comparePreservation(
  before: string,
  after: string,
): { readonly identical: boolean; readonly firstDifference?: number } {
  if (before === after) return { identical: true };
  const length = Math.min(before.length, after.length);
  let firstDifference = length;
  for (let index = 0; index < length; index += 1) {
    if (before[index] !== after[index]) {
      firstDifference = index;
      break;
    }
  }
  return { identical: false, firstDifference };
}
