import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compareCharacterParity, loadPackEntities } from "./legacy-parity";

async function main(): Promise<void> {
  const characterPath = process.argv[2];
  if (characterPath === undefined)
    throw new Error(
      "Usage: pnpm evaluate:character CHARACTER.dnd4e [PACK.4ecp]",
    );
  const [xml, entities] = await Promise.all([
    readFile(resolve(characterPath), "utf8"),
    loadPackEntities(process.argv[3] ?? "tmp/content/full-local.4ecp"),
  ]);
  process.stdout.write(
    `${JSON.stringify(compareCharacterParity(xml, entities), null, 2)}\n`,
  );
}

await main();
