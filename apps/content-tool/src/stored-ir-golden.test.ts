/**
 * Guard against stale stored parses. The pack build parses content text once
 * and stores the result with a version (`_Power Text IR`, `_Prerequisite
 * IR`, `_Associate Stat Block`); the engine trusts a stored field whose
 * version matches. A parser change without a version bump would leave every
 * older pack with stale IR that synthetic tests never see.
 *
 * Each kind's output for the synthetic `stored-ir-golden/fixture.xml` is
 * committed as a golden together with its version constant and the fixture's
 * hash. Output that changes while both are unchanged fails: bump the
 * version. A new version (or fixture) needs the golden regenerated:
 *
 *   UPDATE_STORED_IR_GOLDEN=1 pnpm vitest run apps/content-tool/src/stored-ir-golden.test.ts
 *
 * Regenerating refuses to overwrite a golden whose output changed under the
 * same version and fixture.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { describe, expect, it } from "vitest";

import {
  ASSOCIATE_STAT_BLOCK_FIELD,
  ASSOCIATE_STAT_BLOCK_VERSION,
  POWER_TEXT_FIELD,
  POWER_TEXT_VERSION,
  PREREQUISITE_IR_FIELD,
  PREREQUISITE_IR_VERSION,
} from "@4ecb/content-domain";
import { parseD20Rules } from "@4ecb/legacy-wotc";
import { withStoredPrerequisiteIr } from "@4ecb/rules-engine";

const directory = new URL("./stored-ir-golden/", import.meta.url);
const fixture = readFileSync(new URL("fixture.xml", directory), "utf8");
const fixtureHash = createHash("sha256").update(fixture).digest("hex");
const updating = process.env.UPDATE_STORED_IR_GOLDEN === "1";
const UPDATE_COMMAND =
  "UPDATE_STORED_IR_GOLDEN=1 pnpm vitest run apps/content-tool/src/stored-ir-golden.test.ts";

const parsed = parseD20Rules(fixture, "stored-ir-golden/fixture.xml");
const entities = withStoredPrerequisiteIr(parsed.entities);

interface Golden {
  readonly version: number;
  readonly fixture: string;
  readonly output: Readonly<Record<string, unknown>>;
}

/** Each record's stored field, parsed, keyed by record ID. */
function storedFields(field: string): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const entity of entities) {
    const value = entity.specifics.find(({ name }) => name === field)?.value;
    if (value !== undefined) output[entity.id] = JSON.parse(value) as unknown;
  }
  return output;
}

const kinds = [
  {
    field: POWER_TEXT_FIELD,
    version: POWER_TEXT_VERSION,
    constant: "POWER_TEXT_VERSION (packages/content-domain/src/power-text.ts)",
    file: "power-text-ir.golden.json",
  },
  {
    field: PREREQUISITE_IR_FIELD,
    version: PREREQUISITE_IR_VERSION,
    constant:
      "PREREQUISITE_IR_VERSION (packages/content-domain/src/prerequisite-ir.ts)",
    file: "prerequisite-ir.golden.json",
  },
  {
    field: ASSOCIATE_STAT_BLOCK_FIELD,
    version: ASSOCIATE_STAT_BLOCK_VERSION,
    constant:
      "ASSOCIATE_STAT_BLOCK_VERSION (packages/content-domain/src/associate-stat-block.ts)",
    file: "associate-stat-block.golden.json",
  },
] as const;

describe("stored IR goldens", () => {
  it("parses the fixture without errors", () => {
    expect(
      parsed.diagnostics.filter(({ severity }) => severity === "error"),
    ).toEqual([]);
  });

  for (const { field, version, constant, file } of kinds) {
    it(`keeps ${field} unchanged unless its version is bumped`, () => {
      const output = storedFields(field);
      expect(Object.keys(output).length).toBeGreaterThan(0);
      const current: Golden = { version, fixture: fixtureHash, output };
      const path = new URL(file, directory);
      const golden = existsSync(path)
        ? (JSON.parse(readFileSync(path, "utf8")) as Golden)
        : undefined;
      const sameInputs =
        golden?.version === version && golden.fixture === fixtureHash;
      if (sameInputs && !isDeepStrictEqual(golden.output, output))
        expect.fail(
          `The pack build's ${field} output changed but ${constant} did not. ` +
            "Packs built before this change would keep the old parse: bump " +
            `the version, then regenerate the golden with: ${UPDATE_COMMAND}`,
        );
      if (sameInputs) return;
      if (updating) {
        writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
        return;
      }
      expect.fail(
        golden === undefined
          ? `${file} is missing; generate it with: ${UPDATE_COMMAND}`
          : `${file} records ${field} version ${golden.version} for ` +
              `${golden.fixture === fixtureHash ? "this" : "another"} fixture; ` +
              `${constant} is ${version}. Regenerate the golden with: ` +
              UPDATE_COMMAND,
      );
    });
  }
});
