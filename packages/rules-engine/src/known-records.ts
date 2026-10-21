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

export type GrantedKnownVia = "grant" | "freebee";

export interface GrantedKnownRecord {
  readonly definitionId: string;
  /** Display name of the granting element ("Druid", "Duplicitous Nature"). */
  readonly provider: string;
  /** `grant type="Ritual"`, or a legacy `FREEBEE:<id>` free-gift stat. */
  readonly via: GrantedKnownVia;
  readonly acquiredLevel?: number;
}

export type KnownRecordSource =
  | {
      readonly kind: "learned";
      readonly entryId: string;
      readonly acquisition: BuildKnownAcquisition;
      readonly acquiredLevel: number;
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

/** Records the evaluation grants: `grant type="Ritual"` and `FREEBEE:` stats. */
export function grantedKnownRecords(
  evaluation: Pick<EvaluatedCharacter, "occurrences" | "stats">,
  entityById: EntityLookup,
): readonly GrantedKnownRecord[] {
  const result = new Map<string, GrantedKnownRecord>();
  const occurrences = new Map(
    evaluation.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  for (const occurrence of evaluation.occurrences) {
    if (occurrence.kind !== "grant") continue;
    const entity = entityById(occurrence.definitionId);
    if (!isRitual(entity)) continue;
    const id = entity.id.toLocaleLowerCase();
    if (result.has(id)) continue;
    const parent =
      occurrence.parentId === undefined
        ? undefined
        : occurrences.get(occurrence.parentId);
    const provider =
      parent === undefined ? undefined : entityById(parent.definitionId);
    result.set(id, {
      definitionId: entity.id,
      provider: provider?.name ?? "",
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
  return [...result.values()];
}

/**
 * Every record the character knows at the evaluated level, once per content
 * ID. A record that is both stored and granted shows its grant as the source
 * and keeps the stored copy's ID.
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
      },
    });
  }
  return result;
}

export interface FreeRitualAllowanceText {
  readonly text: string;
  readonly provider: string;
}

/**
 * The "Free Rituals" text a class or feat emits ("As a wizard, you are
 * entitled to three 1st-level rituals…"). It is shown, not enforced.
 */
export function freeRitualAllowanceTexts(
  evaluation: Pick<EvaluatedCharacter, "textContributions"> | undefined,
): readonly FreeRitualAllowanceText[] {
  const seen = new Set<string>();
  return (evaluation?.textContributions ?? []).flatMap(
    ({ name, value, providerName }) => {
      const text = value.trim().replace(/^\*\s*/u, "");
      if (name.trim().toLocaleLowerCase() !== "free rituals" || text === "")
        return [];
      if (seen.has(text)) return [];
      seen.add(text);
      return [{ text, provider: providerName }];
    },
  );
}
