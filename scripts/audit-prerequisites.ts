/**
 * Private prerequisite-coverage measurement. Internalizes every record's
 * machine-read `Prereqs` against an exact content pack and counts the clauses
 * the parser leaves unverified, grouped by distinct clause. The pack and the
 * output stay private.
 *
 *   tsx scripts/audit-prerequisites.ts [PACK.4ecp] [--limit=N] [--json=PATH]
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";
import {
  internalizePrerequisite,
  type PrerequisiteIr,
} from "@4ecb/rules-engine";

const decompress = promisify(gunzip);

function unverifiedLeaves(ir: PrerequisiteIr): string[] {
  if (ir.kind === "all" || ir.kind === "any")
    return ir.children.flatMap(unverifiedLeaves);
  return ir.kind === "unverified" ? [ir.text] : [];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const packPath = args.find((arg) => !arg.startsWith("--"));
  const limit = Number(
    args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? 60,
  );
  const jsonPath = args.find((arg) => arg.startsWith("--json="))?.slice(7);
  const encoded = await readFile(
    resolve(packPath ?? "tmp/content/full-local.4ecp"),
  );
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const definitions = pack.entities;
  const clauses = new Map<string, { uses: number; examples: string[] }>();
  let records = 0;
  let unverifiedRecords = 0;
  for (const subject of definitions) {
    if (subject.prerequisites === undefined) continue;
    const ir = internalizePrerequisite(subject.prerequisites, {
      owned: [],
      level: 1,
      abilities: {},
      definitions,
      subject,
    });
    if (ir === undefined) continue;
    records += 1;
    const leaves = unverifiedLeaves(ir);
    if (leaves.length > 0) unverifiedRecords += 1;
    for (const leaf of leaves) {
      const key = leaf.trim().replace(/[.]$/, "").toLocaleLowerCase();
      const entry = clauses.get(key) ?? { uses: 0, examples: [] };
      entry.uses += 1;
      if (entry.examples.length < 3)
        entry.examples.push(`${subject.id} ${subject.type} "${subject.name}"`);
      clauses.set(key, entry);
    }
  }
  const sorted = [...clauses].sort(
    (left, right) =>
      right[1].uses - left[1].uses || left[0].localeCompare(right[0]),
  );
  const uses = sorted.reduce((sum, [, entry]) => sum + entry.uses, 0);
  console.log(
    `${records} records with prerequisites; ${unverifiedRecords} with unverified clauses`,
  );
  console.log(`unverified clause uses: ${uses}; distinct: ${sorted.length}`);
  for (const [clause, entry] of sorted.slice(0, limit))
    console.log(
      `${String(entry.uses).padStart(4)}  ${clause}  [${entry.examples.join("; ")}]`,
    );
  if (jsonPath !== undefined)
    await writeFile(
      jsonPath,
      `${JSON.stringify(
        { uses, distinct: sorted.length, clauses: Object.fromEntries(sorted) },
        null,
        2,
      )}\n`,
    );
}

await main();
