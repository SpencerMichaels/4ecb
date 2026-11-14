import type { CharacterBackup, CharacterRecord } from "@4ecb/character-domain";
import type { ContentPack } from "@4ecb/content-pack";
import {
  projectBuildForEvaluation,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import { buildEvaluatedSheetModel } from "@4ecb/sheet-model";
import type { CharacterSnapshot } from "@kit";

import { appContentRuntime } from "./app-runtime";
import { buildInfo } from "./build-info";
import { characterSnapshot } from "./character-snapshot";
import { inventoryCategory } from "./equipment-ui";
import { contentProfileMatchesRevision } from "./profile-migration";

/**
 * A stored character evaluated on the exact content revision it is bound
 * to, through the app's shared pack and rules worker (an open character's
 * warm caches are reused). The evaluation skips candidate catalogs: its
 * callers read occurrences, stats, overlays and powers.
 */
export async function evaluateStoredCharacter(
  character: CharacterRecord,
  purpose: string,
): Promise<{ pack: ContentPack; evaluation: EvaluatedCharacter }> {
  const binding = character.profileBinding;
  if (binding?.contentDigest === undefined)
    throw new Error(
      `${purpose} requires an exact content profile revision bound to this character.`,
    );
  const pack = await appContentRuntime.getPack(binding.packId);
  if (
    pack === undefined ||
    !contentProfileMatchesRevision(binding, pack.manifest)
  )
    throw new Error(
      `${purpose} requires the exact content profile revision bound to this character.`,
    );
  const client = await appContentRuntime.getRulesClient(
    binding.packId,
    binding.contentDigest,
  );
  const evaluation = await client.evaluate({
    ...projectBuildForEvaluation(character.build, pack.entities),
    candidateDetailLevels: [],
  });
  return { pack, evaluation };
}

/** The character's printed numbers for other apps, or undefined when it
 *  can't be evaluated (no bound content, nonconvergent, incomplete). */
async function storedCharacterSnapshot(
  character: CharacterRecord,
  exportedAt: string,
): Promise<CharacterSnapshot | undefined> {
  try {
    const { pack, evaluation } = await evaluateStoredCharacter(
      character,
      "A character snapshot",
    );
    if (!evaluation.converged) return undefined;
    const byId = new Map(
      pack.entities.map((entity) => [entity.id.toLocaleLowerCase(), entity]),
    );
    // The sheet page's default preferences: none changes a snapshot number.
    const model = buildEvaluatedSheetModel(
      character.snapshot,
      character.build,
      evaluation,
      pack.entities,
      {
        inventoryCategory: (elements) => inventoryCategory({ elements }, byId),
      },
    );
    return characterSnapshot({
      sourceId: character.id,
      title: character.title,
      model,
      evaluation,
      exportedAt,
      appVersion: buildInfo.commit,
    });
  } catch {
    return undefined;
  }
}

/**
 * A .4ecb backup with each character's evaluated `CharacterSnapshot` (the
 * shared kit's, for 4e DM Dashboard) in a top-level `snapshots` list. They
 * are derived data, outside `payloadDigest`, and 4ecb's own import ignores
 * them; a character that can't be evaluated has none, and the export still
 * succeeds. Characters are evaluated one at a time on the shared worker.
 */
export async function withCharacterSnapshots<Campaign>(
  backup: CharacterBackup<Campaign>,
): Promise<CharacterBackup<Campaign>> {
  const snapshots: CharacterSnapshot[] = [];
  for (const character of backup.characters) {
    const snapshot = await storedCharacterSnapshot(
      character,
      backup.exportedAt,
    );
    if (snapshot !== undefined) snapshots.push(snapshot);
  }
  return { ...backup, snapshots };
}
