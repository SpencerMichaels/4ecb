import type { ContentPackManifest } from "@4ecb/content-pack";
import type { ContentProfileDefinition } from "@4ecb/browser-storage";
import type { ProfileMigrationPreview } from "@4ecb/rules-engine";

import {
  contentProfileMatchesRevision,
  type ContentProfileRevision,
} from "./profile-migration";
import type { ProfileMigrationPreviewProgress } from "./rules-worker-messages";

/** True when the character is pinned to content other than the active content. */
export function needsContentUpdate(
  binding: ContentProfileRevision | undefined,
  active: ContentPackManifest | undefined,
): boolean {
  return (
    binding !== undefined &&
    active !== undefined &&
    !contentProfileMatchesRevision(binding, active)
  );
}

/** Player-facing names for the stats a sheet shows; everything else is internal. */
const STAT_LABELS: Readonly<Record<string, string>> = {
  "hit points": "Hit points",
  "healing surges": "Healing surges",
  speed: "Speed",
  initiative: "Initiative",
  ac: "Armor Class",
  "armor class": "Armor Class",
  "fortitude defense": "Fortitude",
  fortitude: "Fortitude",
  "reflex defense": "Reflex",
  reflex: "Reflex",
  "will defense": "Will",
  will: "Will",
  strength: "Strength",
  constitution: "Constitution",
  dexterity: "Dexterity",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma",
  "passive insight": "Passive Insight",
  "passive perception": "Passive Perception",
  ...Object.fromEntries(
    [
      "Acrobatics",
      "Arcana",
      "Athletics",
      "Bluff",
      "Diplomacy",
      "Dungeoneering",
      "Endurance",
      "Heal",
      "History",
      "Insight",
      "Intimidate",
      "Nature",
      "Perception",
      "Religion",
      "Stealth",
      "Streetwise",
      "Thievery",
    ].map((skill) => [skill.toLowerCase(), skill]),
  ),
};

interface PowerSummary {
  readonly name?: string;
  readonly usage?: string;
  readonly actionType?: string;
  readonly variants?: readonly {
    readonly attackBonus?: number;
    readonly damage?: string;
  }[];
}

function parsePower(value: string | undefined): PowerSummary | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value) as PowerSummary;
  } catch {
    return undefined;
  }
}

const lower = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? "unknown";
const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

function powerChangeLines(
  before: PowerSummary | undefined,
  after: PowerSummary | undefined,
): string[] {
  const name = after?.name ?? before?.name ?? "A power";
  if (before === undefined) return [`New power: ${name}`];
  if (after === undefined) return [`No longer has the ${name} power`];
  const lines: string[] = [];
  if (lower(before.actionType) !== lower(after.actionType))
    lines.push(
      `${name}: ${lower(before.actionType)} → ${lower(after.actionType)}`,
    );
  if (lower(before.usage) !== lower(after.usage))
    lines.push(`${name}: ${lower(before.usage)} → ${lower(after.usage)}`);
  const beforeAttack = before.variants?.[0]?.attackBonus;
  const afterAttack = after.variants?.[0]?.attackBonus;
  if (
    beforeAttack !== undefined &&
    afterAttack !== undefined &&
    beforeAttack !== afterAttack
  )
    lines.push(
      `${name}: attack ${signed(beforeAttack)} → ${signed(afterAttack)}`,
    );
  const beforeDamage = before.variants?.[0]?.damage;
  const afterDamage = after.variants?.[0]?.damage;
  if (beforeDamage && afterDamage && beforeDamage !== afterDamage)
    lines.push(`${name}: damage ${beforeDamage} → ${afterDamage}`);
  return lines;
}

export interface ContentUpdateSummary {
  /** Plain sentences such as "Hit points: 67 → 69". */
  readonly changes: readonly string[];
  /** Names of things this character uses that the new content lacks. */
  readonly missing: readonly string[];
  /** Things this character uses whose rules or text changed, by name. */
  readonly updatedRules: readonly string[];
  /** Plain lines for selections the new content no longer grants. */
  readonly removals: readonly string[];
  /** Saved selections to remove when the player updates. */
  readonly removedOccurrenceIds: readonly string[];
  /** False when the character cannot be calculated with the new content. */
  readonly canUpdate: boolean;
  /** False when the old content is not installed, so changes are unknown. */
  readonly changesKnown: boolean;
}

export function describeContentUpdate(
  preview: ProfileMigrationPreview,
): ContentUpdateSummary {
  const stats = preview.statChanges.flatMap((change) => {
    const label = STAT_LABELS[change.name.trim().toLowerCase()];
    return label === undefined
      ? []
      : [`${label}: ${change.before ?? "none"} → ${change.after ?? "none"}`];
  });
  const powers = preview.powerChanges.flatMap((change) =>
    powerChangeLines(parsePower(change.before), parsePower(change.after)),
  );
  return {
    changes: [...new Set([...stats, ...powers])],
    missing: [
      ...new Set(
        preview.missingDefinitions.map(
          (definition) => definition.name ?? "An unnamed item",
        ),
      ),
    ],
    updatedRules: [
      ...new Set(
        preview.changedDefinitions.map(
          (definition) =>
            `${definition.name} (${definition.type.toLowerCase()})`,
        ),
      ),
    ],
    removals: preview.removedSelections.map(
      (selection) =>
        `${selection.name}${selection.type ? ` (${selection.type.toLowerCase()})` : ""} — no longer included by ${selection.providerName} (${selection.providerType.toLowerCase()})`,
    ),
    removedOccurrenceIds: preview.removedSelections.map(
      (selection) => selection.occurrenceId,
    ),
    canUpdate: preview.target.converged,
    changesKnown: preview.sourceAvailable,
  };
}

/** The binding a character gets when it adopts the active content. */
export function activeProfileBinding(
  manifest: ContentPackManifest,
  activeProfile: ContentProfileDefinition | undefined,
): ContentProfileRevision & { readonly contentDigest: string } {
  return {
    packId: manifest.packId,
    contentDigest: manifest.contentDigest,
    ...(activeProfile?.materializedPackId === manifest.packId
      ? {
          layers: activeProfile.layers,
          resolutionPolicy: activeProfile.resolutionPolicy,
        }
      : {}),
  };
}

/**
 * "(2/3) Calculating with the new content (40%)" for a running migration
 * preview. Without the old content there's nothing to compare, so the last
 * step is skipped. Decoding holds at 99% for the final parse, like the
 * character loading screens.
 */
export function contentUpdateProgressDetail(
  progress: ProfileMigrationPreviewProgress,
): string {
  const steps = [
    ["content", "Opening game content"],
    ["target", "Calculating with the new content"],
    ...(progress.sourceAvailable
      ? [["source", "Calculating with the old content"] as const]
      : []),
  ] as const;
  const step = steps.findIndex(([id]) => id === progress.step);
  const label = steps[step]?.[1] ?? "";
  const percent =
    progress.total <= 0
      ? undefined
      : Math.min(
          progress.step === "content" ? 99 : 100,
          Math.floor((100 * progress.completed) / progress.total),
        );
  return `(${step + 1}/${steps.length}) ${label}${
    percent === undefined ? "" : ` (${percent}%)`
  }`;
}
