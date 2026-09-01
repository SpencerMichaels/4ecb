export * from "./build";

import type { CharacterBuild } from "./build";

export const CHARACTER_SCHEMA_VERSION = 2 as const;

export interface CharacterProfileBinding {
  readonly packId: string;
  readonly contentDigest?: string;
}

export interface LegacyEnvelope {
  readonly format: "dnd4e";
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
  readonly source: "legacy-cache";
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
}

export interface CharacterBackup {
  readonly format: "4ecb-character-backup";
  readonly version: 1;
  readonly exportedAt: string;
  readonly characters: readonly CharacterRecord[];
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
