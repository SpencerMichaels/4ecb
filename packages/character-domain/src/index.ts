export * from "./build";

import { EQUIPMENT_SLOT_IDS, equippedQuantityFromSlots } from "./build";
import type { BuildElementIdentity, CharacterBuild } from "./build";

export const CHARACTER_SCHEMA_VERSION = 2 as const;

export interface CharacterProfileBinding {
  readonly packId: string;
  readonly contentDigest?: string;
  readonly layers?: readonly {
    readonly packId: string;
    readonly contentDigest: string;
  }[];
  readonly resolutionPolicy?: "last-pack-wins-v1";
}

export interface LegacyEnvelope {
  readonly format: "dnd4e";
  /** Missing on historical records; native records have no imported original. */
  readonly origin?: "imported" | "native";
  readonly version?: string;
  readonly gameSystem?: string;
  readonly legality?: string;
  /** The original UTF-8 XML. It is intentionally retained verbatim. */
  readonly sourceXml: string;
}

export interface LegacyRuleElement {
  readonly id?: string;
  readonly name: string;
  readonly type: string;
  readonly legality?: string;
  readonly description?: string;
}

export interface LegacyWeaponSnapshot {
  readonly name: string;
  readonly definitionIds?: readonly string[];
  readonly attackBonus?: string;
  readonly damage?: string;
  readonly attackStat?: string;
  readonly defense?: string;
  readonly hitComponents?: string;
  readonly damageComponents?: string;
  readonly conditions?: string;
}

export interface LegacyPowerSnapshot {
  readonly name: string;
  readonly id?: string;
  readonly usage?: string;
  readonly actionType?: string;
  readonly keywords?: string;
  readonly attackType?: string;
  readonly target?: string;
  readonly description?: string;
  readonly source?: string;
  readonly level?: string;
  readonly weapons: readonly LegacyWeaponSnapshot[];
}

export interface LegacyLootSnapshot {
  readonly name: string;
  readonly count: number;
  readonly equippedCount: number;
  readonly showPowerCard: boolean;
  readonly elements: readonly LegacyRuleElement[];
}

export interface LegacyCharacterSnapshot {
  readonly details: Readonly<Record<string, string>>;
  readonly abilities: Readonly<Record<string, number>>;
  readonly stats: Readonly<Record<string, string>>;
  readonly selectedRules: readonly LegacyRuleElement[];
  readonly powers: readonly LegacyPowerSnapshot[];
  readonly loot: readonly LegacyLootSnapshot[];
  readonly textStrings: Readonly<Record<string, string>>;
  readonly levelCount: number;
  readonly source: "legacy-cache" | "native-empty";
}

export interface SheetSettings {
  readonly paper: "letter" | "a4";
  readonly monochrome: boolean;
  readonly blankHitPoints: boolean;
  readonly includePowerCards: boolean;
  readonly includeItemCards: boolean;
}

export const DEFAULT_SHEET_SETTINGS: SheetSettings = {
  paper: "letter",
  monochrome: false,
  blankHitPoints: false,
  includePowerCards: true,
  includeItemCards: true,
};

export interface CharacterPortraitCrop {
  /** Horizontal center of the square crop, as a fraction of source width. */
  readonly x: number;
  /** Vertical center of the square crop, as a fraction of source height. */
  readonly y: number;
  /** Side length of the square crop, as a fraction of source width. */
  readonly size: number;
}

export interface CharacterPortrait {
  /** A browser-normalized source image retained so the crop can be adjusted. */
  readonly sourceDataUrl: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly crop: CharacterPortraitCrop;
  /** A small square rendering used by lists and printed sheets. */
  readonly renderedDataUrl: string;
}

export interface CharacterRecord {
  readonly schemaVersion: typeof CHARACTER_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
  readonly profileBinding?: CharacterProfileBinding;
  readonly legacy: LegacyEnvelope;
  readonly snapshot: LegacyCharacterSnapshot;
  readonly build: CharacterBuild;
  readonly sheetSettings: SheetSettings;
  readonly portrait?: CharacterPortrait;
}

export interface LegacyCharacterRecordV1 extends Omit<
  CharacterRecord,
  "schemaVersion" | "build"
> {
  readonly schemaVersion: 1;
}

export type StoredCharacterRecord = CharacterRecord | LegacyCharacterRecordV1;

export interface CharacterBackup {
  readonly format: "4ecb-character-backup";
  readonly version: 2;
  readonly exportedAt: string;
  readonly characterCount: number;
  readonly payloadDigest: string;
  readonly characters: readonly CharacterRecord[];
}

export interface LegacyCharacterBackup {
  readonly format: "4ecb-character-backup";
  readonly version: 1;
  readonly exportedAt: string;
  readonly characters: readonly StoredCharacterRecord[];
}

export type SupportedCharacterBackup = CharacterBackup | LegacyCharacterBackup;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function stringRecord(value: unknown): boolean {
  const record = object(value);
  return (
    record !== undefined &&
    Object.values(record).every((entry) => typeof entry === "string")
  );
}

function numberRecord(value: unknown): boolean {
  const record = object(value);
  return (
    record !== undefined &&
    Object.values(record).every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function ruleElement(value: unknown): boolean {
  const entry = object(value);
  return (
    entry !== undefined &&
    optionalString(entry.id) &&
    typeof entry.name === "string" &&
    typeof entry.type === "string" &&
    optionalString(entry.legality) &&
    optionalString(entry.description)
  );
}

function weaponSnapshot(value: unknown): boolean {
  const weapon = object(value);
  return (
    weapon !== undefined &&
    typeof weapon.name === "string" &&
    (weapon.definitionIds === undefined ||
      (Array.isArray(weapon.definitionIds) &&
        weapon.definitionIds.every((id) => typeof id === "string"))) &&
    [
      "attackBonus",
      "damage",
      "attackStat",
      "defense",
      "hitComponents",
      "damageComponents",
      "conditions",
    ].every((name) => optionalString(weapon[name]))
  );
}

function powerSnapshot(value: unknown): boolean {
  const power = object(value);
  return (
    power !== undefined &&
    typeof power.name === "string" &&
    [
      "id",
      "usage",
      "actionType",
      "keywords",
      "attackType",
      "target",
      "description",
      "source",
      "level",
    ].every((name) => optionalString(power[name])) &&
    Array.isArray(power.weapons) &&
    power.weapons.every(weaponSnapshot)
  );
}

function lootSnapshot(value: unknown): boolean {
  const loot = object(value);
  return (
    loot !== undefined &&
    typeof loot.name === "string" &&
    Number.isInteger(loot.count) &&
    typeof loot.count === "number" &&
    loot.count >= 0 &&
    Number.isInteger(loot.equippedCount) &&
    typeof loot.equippedCount === "number" &&
    loot.equippedCount >= 0 &&
    typeof loot.showPowerCard === "boolean" &&
    Array.isArray(loot.elements) &&
    loot.elements.every(ruleElement)
  );
}

function characterSnapshot(value: unknown): boolean {
  const snapshot = object(value);
  return (
    snapshot !== undefined &&
    (snapshot.source === "legacy-cache" ||
      snapshot.source === "native-empty") &&
    stringRecord(snapshot.details) &&
    numberRecord(snapshot.abilities) &&
    stringRecord(snapshot.stats) &&
    Array.isArray(snapshot.selectedRules) &&
    snapshot.selectedRules.every(ruleElement) &&
    Array.isArray(snapshot.powers) &&
    snapshot.powers.every(powerSnapshot) &&
    Array.isArray(snapshot.loot) &&
    snapshot.loot.every(lootSnapshot) &&
    stringRecord(snapshot.textStrings) &&
    Number.isInteger(snapshot.levelCount) &&
    typeof snapshot.levelCount === "number" &&
    snapshot.levelCount >= 0 &&
    snapshot.levelCount <= 30
  );
}

function elementIdentity(value: unknown): boolean {
  const identity = object(value);
  return (
    identity !== undefined &&
    optionalString(identity.definitionId) &&
    typeof identity.name === "string" &&
    typeof identity.type === "string" &&
    optionalString(identity.url)
  );
}

function inventoryElement(value: unknown, seen: WeakSet<object>): boolean {
  const identity = object(value);
  return (
    elementIdentity(value) &&
    identity !== undefined &&
    (identity.children === undefined ||
      (Array.isArray(identity.children) &&
        identity.children.every((child) => buildOccurrence(child, seen, 0))))
  );
}

function buildOccurrence(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): boolean {
  const occurrence = object(value);
  if (occurrence === undefined || depth > 100 || seen.has(occurrence))
    return false;
  seen.add(occurrence);
  return (
    typeof occurrence.id === "string" &&
    elementIdentity(occurrence.identity) &&
    Number.isInteger(occurrence.acquiredLevel) &&
    typeof occurrence.acquiredLevel === "number" &&
    occurrence.acquiredLevel >= 0 &&
    occurrence.acquiredLevel <= 30 &&
    (occurrence.legality === "rules-legal" ||
      occurrence.legality === "houserule") &&
    optionalString(occurrence.replacesId) &&
    Array.isArray(occurrence.children) &&
    occurrence.children.every((child) =>
      buildOccurrence(child, seen, depth + 1),
    ) &&
    typeof occurrence.unresolved === "boolean"
  );
}

function buildUserRule(value: unknown, depth: number): boolean {
  const rule = object(value);
  return (
    rule !== undefined &&
    depth <= 100 &&
    typeof rule.name === "string" &&
    /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(rule.name) &&
    Array.isArray(rule.attributes) &&
    rule.attributes.every((entry) => {
      const attribute = object(entry);
      return (
        attribute !== undefined &&
        typeof attribute.name === "string" &&
        /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(attribute.name) &&
        typeof attribute.value === "string"
      );
    }) &&
    typeof rule.text === "string" &&
    Array.isArray(rule.children) &&
    rule.children.every((child) => buildUserRule(child, depth + 1))
  );
}

function characterBuild(value: unknown): boolean {
  const build = object(value);
  if (build === undefined) return false;
  const seen = new WeakSet<object>();
  const knownEquipmentSlots = new Set<string>(EQUIPMENT_SLOT_IDS);
  const occupiedEquipmentSlots = new Set<string>();
  return (
    build.formatVersion === 1 &&
    Number.isInteger(build.effectiveLevel) &&
    typeof build.effectiveLevel === "number" &&
    build.effectiveLevel >= 1 &&
    build.effectiveLevel <= 30 &&
    Array.isArray(build.levels) &&
    build.levels.every((value) => {
      const frame = object(value);
      return (
        frame !== undefined &&
        Number.isInteger(frame.level) &&
        typeof frame.level === "number" &&
        frame.level >= 1 &&
        frame.level <= 30 &&
        buildOccurrence(frame.root, seen, 0) &&
        (frame.userEdit === undefined ||
          (() => {
            const userEdit = object(frame.userEdit);
            return (
              userEdit !== undefined &&
              buildOccurrence(userEdit.root, seen, 0) &&
              Array.isArray(userEdit.rules) &&
              userEdit.rules.every((rule) => buildUserRule(rule, 0))
            );
          })())
      );
    }) &&
    Array.isArray(build.grabbag) &&
    build.grabbag.every((entry) => buildOccurrence(entry, seen, 0)) &&
    Array.isArray(build.inventory) &&
    build.inventory.every((value) => {
      const entry = object(value);
      return (
        entry !== undefined &&
        typeof entry.id === "string" &&
        Number.isInteger(entry.acquiredLevel) &&
        typeof entry.acquiredLevel === "number" &&
        entry.acquiredLevel >= 0 &&
        entry.acquiredLevel <= 30 &&
        Number.isInteger(entry.quantity) &&
        typeof entry.quantity === "number" &&
        entry.quantity >= 0 &&
        Number.isInteger(entry.equippedQuantity) &&
        typeof entry.equippedQuantity === "number" &&
        entry.equippedQuantity >= 0 &&
        entry.equippedQuantity <= entry.quantity &&
        (entry.equippedSlots === undefined ||
          (() => {
            if (!Array.isArray(entry.equippedSlots)) return false;
            if (
              typeof entry.quantity !== "number" ||
              typeof entry.equippedQuantity !== "number"
            )
              return false;
            const quantity = entry.quantity;
            const equippedQuantity = entry.equippedQuantity;
            const localSlots = new Set<string>();
            const assignments = entry.equippedSlots.flatMap((value) => {
              const assignment = object(value);
              if (
                assignment === undefined ||
                typeof assignment.slot !== "string" ||
                !knownEquipmentSlots.has(assignment.slot) ||
                localSlots.has(assignment.slot) ||
                occupiedEquipmentSlots.has(assignment.slot) ||
                !Number.isInteger(assignment.quantityIndex) ||
                typeof assignment.quantityIndex !== "number" ||
                assignment.quantityIndex < 0 ||
                assignment.quantityIndex >= quantity
              )
                return [];
              localSlots.add(assignment.slot);
              return [
                {
                  slot: assignment.slot as (typeof EQUIPMENT_SLOT_IDS)[number],
                  quantityIndex: assignment.quantityIndex,
                },
              ];
            });
            if (assignments.length !== entry.equippedSlots.length) return false;
            for (const { slot } of assignments)
              occupiedEquipmentSlots.add(slot);
            return equippedQuantity === equippedQuantityFromSlots(assignments);
          })()) &&
        Array.isArray(entry.elements) &&
        entry.elements.every((element) => inventoryElement(element, seen)) &&
        optionalString(entry.name) &&
        (entry.showPowerCard === undefined ||
          typeof entry.showPowerCard === "boolean") &&
        stringRecord(entry.overrides) &&
        (entry.legality === "rules-legal" || entry.legality === "houserule")
      );
    }) &&
    Array.isArray(build.alternates) &&
    build.alternates.every((value) => {
      const alternate = object(value);
      return (
        alternate !== undefined &&
        typeof alternate.id === "string" &&
        typeof alternate.selectName === "string" &&
        elementIdentity(alternate.provider) &&
        buildOccurrence(alternate.choice, seen, 0)
      );
    }) &&
    numberRecord(build.baseAbilities) &&
    stringRecord(build.textStrings)
  );
}

function characterRecordBase(
  value: unknown,
): Record<string, unknown> | undefined {
  const record = object(value);
  const legacy = object(record?.legacy);
  const profile = object(record?.profileBinding);
  const settings = object(record?.sheetSettings);
  const portrait = object(record?.portrait);
  const portraitCrop = object(portrait?.crop);
  if (
    record === undefined ||
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    typeof record.title !== "string" ||
    typeof record.notes !== "string" ||
    typeof record.createdAt !== "string" ||
    Number.isNaN(Date.parse(record.createdAt)) ||
    typeof record.updatedAt !== "string" ||
    Number.isNaN(Date.parse(record.updatedAt)) ||
    !optionalString(record.deletedAt) ||
    (record.profileBinding !== undefined &&
      (profile === undefined ||
        typeof profile.packId !== "string" ||
        profile.packId.length === 0 ||
        !optionalString(profile.contentDigest) ||
        (profile.layers !== undefined &&
          (!Array.isArray(profile.layers) ||
            !profile.layers.every((layer) => {
              const value = object(layer);
              return (
                value !== undefined &&
                typeof value.packId === "string" &&
                value.packId.length > 0 &&
                typeof value.contentDigest === "string" &&
                value.contentDigest.length > 0
              );
            }))) ||
        (profile.resolutionPolicy !== undefined &&
          profile.resolutionPolicy !== "last-pack-wins-v1"))) ||
    legacy === undefined ||
    legacy.format !== "dnd4e" ||
    (legacy.origin !== undefined &&
      legacy.origin !== "imported" &&
      legacy.origin !== "native") ||
    !optionalString(legacy.version) ||
    !optionalString(legacy.gameSystem) ||
    !optionalString(legacy.legality) ||
    typeof legacy.sourceXml !== "string" ||
    !characterSnapshot(record.snapshot) ||
    settings === undefined ||
    (settings.paper !== "letter" && settings.paper !== "a4") ||
    typeof settings.monochrome !== "boolean" ||
    typeof settings.blankHitPoints !== "boolean" ||
    typeof settings.includePowerCards !== "boolean" ||
    typeof settings.includeItemCards !== "boolean" ||
    (record.portrait !== undefined &&
      (portrait === undefined ||
        !imageDataUrl(portrait.sourceDataUrl, 20 * 1024 * 1024) ||
        !imageDataUrl(portrait.renderedDataUrl, 5 * 1024 * 1024) ||
        !positiveInteger(portrait.sourceWidth, 4096) ||
        !positiveInteger(portrait.sourceHeight, 4096) ||
        portraitCrop === undefined ||
        !normalizedNumber(portraitCrop.x) ||
        !normalizedNumber(portraitCrop.y) ||
        typeof portraitCrop.size !== "number" ||
        !Number.isFinite(portraitCrop.size) ||
        portraitCrop.size <= 0 ||
        portraitCrop.size > 1 ||
        !portraitCropFitsSource(
          portraitCrop,
          portrait.sourceWidth,
          portrait.sourceHeight,
        )))
  )
    return undefined;
  return record;
}

function imageDataUrl(value: unknown, maximumLength: number): boolean {
  return (
    typeof value === "string" &&
    value.length <= maximumLength &&
    /^data:image\/(?:png|jpeg|webp);base64,/i.test(value)
  );
}

function positiveInteger(value: unknown, maximum: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= maximum
  );
}

function normalizedNumber(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function portraitCropFitsSource(
  crop: Record<string, unknown>,
  width: unknown,
  height: unknown,
): boolean {
  if (
    typeof crop.x !== "number" ||
    typeof crop.y !== "number" ||
    typeof crop.size !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  )
    return false;
  const halfWidth = crop.size / 2;
  const halfHeight = (crop.size * width) / height / 2;
  return (
    crop.size <= Math.min(1, height / width) &&
    crop.x >= halfWidth &&
    crop.x <= 1 - halfWidth &&
    crop.y >= halfHeight &&
    crop.y <= 1 - halfHeight
  );
}

export function isCharacterRecord(value: unknown): value is CharacterRecord {
  const record = characterRecordBase(value);
  return record?.schemaVersion === 2 && characterBuild(record.build);
}

export function isLegacyCharacterRecordV1(
  value: unknown,
): value is LegacyCharacterRecordV1 {
  return characterRecordBase(value)?.schemaVersion === 1;
}

export function newCharacterRecord(
  legacy: LegacyEnvelope,
  snapshot: LegacyCharacterSnapshot,
  build: CharacterBuild,
  options: {
    readonly id?: string;
    readonly now?: string;
    readonly profileBinding?: CharacterProfileBinding;
  } = {},
): CharacterRecord {
  const now = options.now ?? new Date().toISOString();
  const title = snapshot.details.name?.trim() || "Untitled character";
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: options.id ?? crypto.randomUUID(),
    title,
    notes: "",
    createdAt: now,
    updatedAt: now,
    ...(options.profileBinding === undefined
      ? {}
      : { profileBinding: options.profileBinding }),
    legacy,
    snapshot,
    build,
    sheetSettings: DEFAULT_SHEET_SETTINGS,
  };
}

const NATIVE_BASE_ABILITIES = {
  Strength: 8,
  Constitution: 10,
  Dexterity: 10,
  Intelligence: 10,
  Wisdom: 10,
  Charisma: 10,
} as const;

export function newNativeCharacterRecord(
  name: string,
  levelOne: BuildElementIdentity,
  profileBinding: CharacterProfileBinding,
  options: {
    readonly id?: string;
    readonly occurrenceId?: string;
    readonly now?: string;
  } = {},
): CharacterRecord {
  if (
    name.length === 0 ||
    name.length > 120 ||
    name !== name.trim() ||
    /[\u0000-\u001f\u007f]/.test(name)
  )
    throw new Error(
      "Character name must be 1-120 trimmed characters without control characters",
    );
  if (
    levelOne.definitionId === undefined ||
    levelOne.definitionId.length === 0 ||
    levelOne.type.toLocaleLowerCase() !== "level"
  )
    throw new Error("Native character creation requires a level 1 definition");
  if (
    profileBinding.packId.length === 0 ||
    profileBinding.contentDigest === undefined ||
    profileBinding.contentDigest.length === 0
  )
    throw new Error(
      "Native character creation requires an exact content profile",
    );
  const snapshot: LegacyCharacterSnapshot = {
    details: { name, Level: "1" },
    abilities: {},
    stats: {},
    selectedRules: [],
    powers: [],
    loot: [],
    textStrings: { Name: name },
    levelCount: 1,
    source: "native-empty",
  };
  const build: CharacterBuild = {
    formatVersion: 1,
    effectiveLevel: 1,
    levels: [
      {
        level: 1,
        root: {
          id: options.occurrenceId ?? `web:${crypto.randomUUID()}`,
          identity: levelOne,
          acquiredLevel: 1,
          legality: "rules-legal",
          children: [],
          unresolved: false,
        },
      },
    ],
    grabbag: [],
    inventory: [],
    alternates: [],
    baseAbilities: NATIVE_BASE_ABILITIES,
    textStrings: { Name: name },
  };
  return newCharacterRecord(
    {
      format: "dnd4e",
      origin: "native",
      version: "0.07a",
      gameSystem: "D&D4E",
      legality: "rules-legal",
      sourceXml:
        '<?xml version="1.0" encoding="UTF-8"?>\n<D20Character game-system="D&amp;D4E" Version="0.07a" legality="rules-legal"/>\n',
    },
    snapshot,
    build,
    {
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.now === undefined ? {} : { now: options.now }),
      profileBinding,
    },
  );
}

export function duplicateCharacterRecord(
  source: CharacterRecord,
  id: string = crypto.randomUUID(),
  now: string = new Date().toISOString(),
): CharacterRecord {
  const { deletedAt: _deletedAt, ...active } = source;
  void _deletedAt;
  return {
    ...active,
    id,
    title: `${source.title} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
}
