import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";
import { parseRules } from "@4ecb/rules-engine";

const decompress = promisify(gunzip);

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sorted(map: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map].sort(
      ([left, leftCount], [right, rightCount]) =>
        rightCount - leftCount || left.localeCompare(right),
    ),
  );
}

async function main(): Promise<void> {
  const path = resolve(process.argv[2] ?? "tmp/content/full-local.4ecp");
  const encoded = await readFile(path);
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const opcodeCounts = new Map<string, number>();
  const unknownOpcodeCounts = new Map<string, number>();
  const unknownAttributeCounts = new Map<string, number>();
  const dynamicPrefixCounts = new Map<string, number>();
  const missingRequired: Array<{
    entityId: string;
    ordinal: number;
    opcode: string;
    fields: string[];
  }> = [];
  let ruleCount = 0;

  for (const entity of pack.entities) {
    for (const rule of parseRules(entity.id, entity.rules)) {
      ruleCount += 1;
      increment(opcodeCounts, rule.kind);
      if (rule.kind === "unknown")
        increment(unknownOpcodeCounts, rule.statementName);
      for (const attribute of rule.source.unknownAttributes)
        increment(
          unknownAttributeCounts,
          `${rule.kind}.${attribute.name.toLocaleLowerCase()}`,
        );
      if (rule.kind === "select" && rule.category !== undefined) {
        const prefix = rule.category.split(",", 1)[0]?.trim();
        if (prefix?.startsWith("$$")) increment(dynamicPrefixCounts, prefix);
      }
      const fields: string[] = [];
      if (
        ["statadd", "textstring", "statalias"].includes(rule.kind) &&
        "name" in rule &&
        rule.name.length === 0
      )
        fields.push("name");
      if (
        ["statadd", "textstring"].includes(rule.kind) &&
        "value" in rule &&
        rule.value.length === 0
      )
        fields.push("value");
      if (["grant", "suggest"].includes(rule.kind) && rule.name.length === 0)
        fields.push("name/type");
      if (rule.kind === "select") {
        if (rule.type.length === 0) fields.push("type");
      }
      if (rule.kind === "modify" && rule.field.length === 0)
        fields.push("Field");
      if (fields.length > 0)
        missingRequired.push({
          entityId: entity.id,
          ordinal: rule.source.ordinal,
          opcode: rule.kind,
          fields,
        });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        pack: {
          id: pack.manifest.packId,
          digest: pack.manifest.contentDigest,
          entities: pack.entities.length,
        },
        ruleCount,
        opcodeCounts: sorted(opcodeCounts),
        unknownOpcodes: sorted(unknownOpcodeCounts),
        unknownAttributes: sorted(unknownAttributeCounts),
        dynamicPrefixes: sorted(dynamicPrefixCounts),
        missingRequired,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
