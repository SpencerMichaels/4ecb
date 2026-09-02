import type {
  BuildAlternate,
  BuildElementIdentity,
  BuildInventoryEntry,
  BuildLegality,
  BuildOccurrence,
  CharacterBuild,
  LegacyCharacterSnapshot,
  LegacyEnvelope,
  LegacyLootSnapshot,
  LegacyPowerSnapshot,
  LegacyRuleElement,
  LegacyWeaponSnapshot,
} from "@4ecb/character-domain";
import { SaxesParser } from "saxes";

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
  const parsedLevels = direct(root, "Level").flatMap((levelNode, index) => {
    const rootElement = direct(levelNode, "RulesElement")[0];
    return rootElement === undefined
      ? []
      : [occurrenceFrom(rootElement, index + 1, `level:${index + 1}`)];
  });
  const parsedGrabbag = direct(root, "Grabbag").flatMap((container, index) =>
    direct(container, "RulesElement").map((node, childIndex) =>
      occurrenceFrom(node, 0, `grabbag:${index}:${childIndex}`),
    ),
  );
  const resolved = resolveReplacementLinks([...parsedLevels, ...parsedGrabbag]);
  const levelRoots = resolved.slice(0, parsedLevels.length);
  const grabbag = resolved.slice(parsedLevels.length);
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
  return {
    formatVersion: 1,
    effectiveLevel: Math.max(1, parsedLevels.length),
    levels: levelRoots.map((rootOccurrence, index) => ({
      level: index + 1,
      root: rootOccurrence,
    })),
    grabbag,
    inventory: inventoryFrom(root, sheet),
    alternates,
    baseAbilities: snapshotAbilities,
    textStrings,
  };
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

function textStringsFrom(root: XmlNode): Record<string, string> {
  return Object.fromEntries(
    direct(root, "textstring").map((node) => [
      attribute(node, "name") ?? "",
      normalizedText(node),
    ]),
  );
}

export function importDnd4e(input: string): Dnd4eImportResult {
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
    build: buildFrom(
      root,
      sheet,
      Object.keys(rootAbilities).length === 0 ? abilities : rootAbilities,
      textStrings,
    ),
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
