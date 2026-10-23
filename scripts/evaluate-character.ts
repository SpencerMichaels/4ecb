import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compareCharacterParity, loadPackEntities } from "./legacy-parity";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const matchMissingByName = !args.includes("--no-name-matching");
  const [characterPath, packPath] = args.filter((arg) => !arg.startsWith("--"));
  if (characterPath === undefined)
    throw new Error(
      "Usage: pnpm evaluate:character CHARACTER.dnd4e [PACK.4ecp] [--no-name-matching]",
    );
  const [xml, entities] = await Promise.all([
    readFile(resolve(characterPath), "utf8"),
    loadPackEntities(packPath ?? "tmp/content/full-local.4ecp"),
  ]);
  process.stdout.write(
    `${JSON.stringify(
      compareCharacterParity(xml, entities, { matchMissingByName }),
      null,
      2,
    )}\n`,
  );
}

await main();
