import { CharacterRepository } from "@4ecb/browser-storage";
import type { CharacterRecord } from "@4ecb/character-domain";
import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
  projectBuildForLegacyExport,
  legacyExportedBuild,
} from "@4ecb/legacy-dnd4e";
import { projectBuildForEvaluation } from "@4ecb/rules-engine";

import { appContentRuntime } from "./app-runtime";
import { download } from "./download";
import { contentProfileMatchesRevision } from "./profile-migration";

/** Export files offered from the library and the builder (.4ecb, .dnd4e).
 *  Printing or saving a PDF is the character sheet's job. */

const repository = new CharacterRepository();

function fileBase(character: CharacterRecord): string {
  return character.title.replace(/[^a-z0-9_-]+/gi, "-");
}

/** The character as a native .4ecb backup file. */
export async function exportCharacterBackup(id: string): Promise<void> {
  const character = await repository.required(id);
  const backup = await repository.exportCharacter(character.id);
  download(
    `${fileBase(character)}.4ecb`,
    JSON.stringify(backup, null, 2),
    "application/json",
  );
}

/** The character regenerated as a legacy .dnd4e file, after checking that
 *  re-importing it gives back the same build. */
export async function exportCharacterDnd4e(id: string): Promise<void> {
  const character = await repository.required(id);
  const binding = character.profileBinding;
  if (binding?.contentDigest === undefined)
    throw new Error(
      "Regenerated .dnd4e export requires an exact content profile revision bound to this character.",
    );
  // The app's shared pack and rules worker, so an open character's warm
  // caches are reused rather than decoding and evaluating from scratch.
  const pack = await appContentRuntime.getPack(binding.packId);
  if (
    pack === undefined ||
    !contentProfileMatchesRevision(binding, pack.manifest)
  )
    throw new Error(
      "Regenerated .dnd4e export requires the exact content profile revision bound to this character.",
    );
  const client = await appContentRuntime.getRulesClient(
    binding.packId,
    binding.contentDigest,
  );
  // The writer reads occurrences, stats, overlays and powers, never
  // candidate catalogs, so the evaluation skips them.
  const evaluation = await client.evaluate({
    ...projectBuildForEvaluation(character.build, pack.entities),
    candidateDetailLevels: [],
  });
  const xml = exportEditedDnd4e({
    target: "legacy-builder-0.07a",
    envelope: character.legacy,
    snapshot: character.snapshot,
    build: character.build,
    evaluation,
    content: pack.entities,
  });
  const reimported = importDnd4e(xml);
  const comparison = compareEditedDnd4eRoundTrip(
    projectBuildForLegacyExport(
      legacyExportedBuild(character.build, evaluation, pack.entities),
    ),
    reimported.build,
  );
  if (!comparison.equivalent)
    throw new Error(
      `Edited export re-import check failed: ${comparison.differences.join(" ")}`,
    );
  download(`${fileBase(character)}.dnd4e`, xml, "application/xml");
}
