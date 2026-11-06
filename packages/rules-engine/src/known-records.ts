import {
  knownElementKey,
  type BuildElementIdentity,
  type BuildKnownAcquisition,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";

import type { EvaluatedCharacter } from "./evaluator";

/**
 * Known rituals, alchemical formulas and martial practices are the union of
 * the build's stored (learned) entries and records granted by its current
 * evaluation. Granted records are derived, never stored, so retraining away a
 * provider also removes what it granted, and the list always states why a
 * record is known (D091: the new builder wins over legacy's one-time gift).
 */

/**
 * How the evaluation gives a record: `grant type="Ritual"`, a legacy
 * `FREEBEE:<id>` free-gift stat, or the player's pick in a
 * `select type="Ritual"` (a Psion's Sending or Tenser's Floating Disk,
 * D115). A chosen record is known through its choice, like a granted one:
 * it is changed in the Build tab, never removed from the Inventory, and
 * never uses a free-ritual allowance.
 */
export type GrantedKnownVia = "grant" | "freebee" | "choice";

export interface GrantedKnownRecord {
  readonly definitionId: string;
  /** Display name of the granting or choosing element ("Druid", "Psion"). */
  readonly provider: string;
  readonly via: GrantedKnownVia;
  readonly acquiredLevel?: number;
}

export type KnownRecordSource =
  | {
      readonly kind: "learned";
      readonly entryId: string;
      readonly acquisition: BuildKnownAcquisition;
      readonly acquiredLevel: number;
      /** The free-ritual allowance it was learned from (ritual-allowances.ts). */
      readonly allowance?: string;
    }
  | {
      readonly kind: "granted";
      readonly provider: string;
      readonly via: GrantedKnownVia;
      /** A stored copy (an imported legacy gift) kept in case the grant goes. */
      readonly storedEntryId?: string;
    };

export interface KnownRecord {
  readonly element: BuildElementIdentity;
  readonly entity?: ContentEntity;
  readonly source: KnownRecordSource;
}

export type EntityLookup = (id: string) => ContentEntity | undefined;

const FREEBEE_STAT = /^freebee:(.+)$/iu;

function isRitual(entity: ContentEntity | undefined): entity is ContentEntity {
  return entity?.type.trim().toLocaleLowerCase() === "ritual";
}

/**
 * Records the evaluation gives: `grant type="Ritual"`, `FREEBEE:` stats and
 * Ritual choices, once each (a grant wins over a gift, a gift over a
 * choice).
 */
export function grantedKnownRecords(
  evaluation: Pick<EvaluatedCharacter, "occurrences" | "stats">,
  entityById: EntityLookup,
): readonly GrantedKnownRecord[] {
  const result = new Map<string, GrantedKnownRecord>();
  const occurrences = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const providerName = (occurrence: { readonly parentId?: string }) => {
    const parent =
      occurrence.parentId === undefined
        ? undefined
        : occurrences.get(occurrence.parentId);
    return parent === undefined
      ? ""
      : (entityById(parent.definitionId)?.name ?? "");
  };
  for (const occurrence of evaluation.occurrences) {
    if (occurrence.kind !== "grant") continue;
    const entity = entityById(occurrence.definitionId);
    if (!isRitual(entity)) continue;
    const id = entity.id.toLocaleLowerCase();
    if (result.has(id)) continue;
    result.set(id, {
      definitionId: entity.id,
      provider: providerName(occurrence),
      via: "grant",
      acquiredLevel: occurrence.acquiredLevel,
    });
  }
  for (const stat of Object.values(evaluation.stats)) {
    const target = FREEBEE_STAT.exec(stat.name.trim())?.[1]?.trim();
    if (target === undefined || target === "") continue;
    if (typeof stat.value !== "number" || stat.value <= 0) continue;
    const entity = entityById(target);
    if (!isRitual(entity)) continue;
    const id = entity.id.toLocaleLowerCase();
    if (result.has(id)) continue;
    const contribution = stat.contributions.find(({ applied }) => applied);
    const providerLevel =
      contribution === undefined
        ? undefined
        : occurrences.get(contribution.providerId)?.acquiredLevel;
    result.set(id, {
      definitionId: entity.id,
      provider: contribution?.providerName ?? "",
      via: "freebee",
      ...(providerLevel === undefined ? {} : { acquiredLevel: providerLevel }),
    });
  }
  for (const occurrence of evaluation.occurrences) {
    if (occurrence.kind !== "choice") continue;
    const entity = entityById(occurrence.definitionId);
    if (!isRitual(entity)) continue;
    const id = entity.id.toLocaleLowerCase();
    if (result.has(id)) continue;
    result.set(id, {
      definitionId: entity.id,
      provider: providerName(occurrence),
      via: "choice",
      acquiredLevel: occurrence.acquiredLevel,
    });
  }
  return [...result.values()];
}

/**
 * Every record the character knows at the evaluated level, once per content
 * ID. A record that is both stored and granted (or chosen) shows its grant
 * as the source and keeps the stored copy's ID: an imported psion's Sending
 * loot, once it fills the Psion's choice, is listed once.
 */
export function knownRecords(
  build: Pick<CharacterBuild, "known">,
  evaluation:
    Pick<EvaluatedCharacter, "level" | "occurrences" | "stats"> | undefined,
  entityById: EntityLookup,
  level: number = evaluation?.level ?? 30,
): readonly KnownRecord[] {
  const granted =
    evaluation === undefined ? [] : grantedKnownRecords(evaluation, entityById);
  const stored = new Map<string, CharacterBuild["known"][number]>();
  for (const entry of build.known) {
    if (entry.acquiredLevel > level) continue;
    const id = knownElementKey(entry.element);
    if (!stored.has(id)) stored.set(id, entry);
  }
  const result: KnownRecord[] = [];
  const shown = new Set<string>();
  for (const grant of granted) {
    const entity = entityById(grant.definitionId);
    const id = grant.definitionId.toLocaleLowerCase();
    const copy = stored.get(id);
    shown.add(id);
    result.push({
      element: copy?.element ?? {
        definitionId: grant.definitionId,
        name: entity?.name ?? grant.definitionId,
        type: entity?.type ?? "Ritual",
      },
      ...(entity === undefined ? {} : { entity }),
      source: {
        kind: "granted",
        provider: grant.provider,
        via: grant.via,
        ...(copy === undefined ? {} : { storedEntryId: copy.id }),
      },
    });
  }
  for (const [id, entry] of stored) {
    if (shown.has(id)) continue;
    const entity =
      entry.element.definitionId === undefined
        ? undefined
        : entityById(entry.element.definitionId);
    result.push({
      element: entry.element,
      ...(entity === undefined ? {} : { entity }),
      source: {
        kind: "learned",
        entryId: entry.id,
        acquisition: entry.acquisition,
        acquiredLevel: entry.acquiredLevel,
        ...(entry.allowance === undefined
          ? {}
          : { allowance: entry.allowance }),
      },
    });
  }
  return result;
}

export interface FreeRitualAllowanceText {
  readonly text: string;
  readonly provider: string;
  /** The providing element, which may also carry a structured allowance. */
  readonly providerId: string;
}

/**
 * The "Free Rituals" text a class or feat emits ("As a wizard, you are
 * entitled to three 1st-level rituals…"). It is shown, not enforced; the
 * structured counts are in `ritual-allowances.ts`.
 */
export function freeRitualAllowanceTexts(
  evaluation: Pick<EvaluatedCharacter, "textContributions"> | undefined,
): readonly FreeRitualAllowanceText[] {
  const seen = new Set<string>();
  return (evaluation?.textContributions ?? []).flatMap(
    ({ name, value, providerName, definitionId }) => {
      const text = value.trim().replace(/^\*\s*/u, "");
      if (name.trim().toLocaleLowerCase() !== "free rituals" || text === "")
        return [];
      if (seen.has(text)) return [];
      seen.add(text);
      return [{ text, provider: providerName, providerId: definitionId }];
    },
  );
}
