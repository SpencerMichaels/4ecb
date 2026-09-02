import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";
import {
  compareEditedDnd4eRoundTrip,
  exportEditedDnd4e,
  importDnd4e,
} from "@4ecb/legacy-dnd4e";
import {
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

const decompress = promisify(gunzip);

async function main(): Promise<void> {
  const [inputArgument, packArgument, outputArgument] = process.argv.slice(2);
  if (
    inputArgument === undefined ||
    packArgument === undefined ||
    outputArgument === undefined
  )
    throw new Error(
      "Usage: pnpm regenerate:edited-dnd4e INPUT.dnd4e PACK.4ecp OUTPUT.dnd4e",
    );

  const [sourceXml, encodedPack] = await Promise.all([
    readFile(resolve(inputArgument), "utf8"),
    readFile(resolve(packArgument)),
  ]);
  const packBytes =
    encodedPack[0] === 0x1f && encodedPack[1] === 0x8b
      ? await decompress(encodedPack)
      : encodedPack;
  const pack = decodeContentPack(packBytes.toString("utf8"));
  const imported = importDnd4e(sourceXml);
  const evaluation = evaluateCharacter(
    projectBuildForEvaluation(imported.build, pack.entities),
    pack.entities,
  );
  const xml = exportEditedDnd4e({
    target: "legacy-builder-0.07a",
    envelope: imported.envelope,
    snapshot: imported.snapshot,
    build: imported.build,
    evaluation,
    content: pack.entities,
  });
  const reimported = importDnd4e(xml);
  const comparison = compareEditedDnd4eRoundTrip(
    imported.build,
    reimported.build,
  );
  if (!comparison.equivalent)
    throw new Error(
      `Edited export failed semantic re-import: ${comparison.differences.join(" ")}`,
    );
  for (const [ability, expected] of Object.entries(
    imported.build.baseAbilities,
  )) {
    const actual = reimported.snapshot.abilities[ability];
    if (actual !== expected)
      throw new Error(
        `Edited export CharacterSheet base ability ${ability} is ${String(actual)}; expected ${expected}.`,
      );
  }

  const outputPath = resolve(outputArgument);
  await writeFile(outputPath, xml, "utf8");
  process.stdout.write(
    `${JSON.stringify(
      {
        input: resolve(inputArgument),
        packId: pack.manifest.packId,
        contentDigest: pack.manifest.contentDigest,
        output: outputPath,
        evaluation: {
          level: evaluation.level,
          converged: evaluation.converged,
          complete: evaluation.complete,
          legal: evaluation.legal,
          diagnostics: evaluation.diagnostics.length,
        },
        export: "semantic-round-trip-passed",
      },
      null,
      2,
    )}\n`,
  );
}

await main();
