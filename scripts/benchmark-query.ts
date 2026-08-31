#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { decodeContentPack } from "@4ecb/content-pack";
import {
  CompendiumIndex,
  normalizeCompendiumQuery,
  type CompendiumQuery,
} from "@4ecb/query-engine";

interface BenchmarkResult {
  readonly name: string;
  readonly elapsedMilliseconds: number;
  readonly resultCount: number;
}

const input = process.argv[2];
if (input === undefined) {
  throw new Error("Usage: pnpm benchmark:query PACK.4ecp");
}

const bytes = await readFile(resolve(input));
const decoded =
  bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
const pack = decodeContentPack(decoded.toString("utf8"));

const buildStarted = performance.now();
const index = new CompendiumIndex(pack.entities);
const buildMilliseconds = performance.now() - buildStarted;

const cases: ReadonlyArray<{
  readonly name: string;
  readonly query: Partial<CompendiumQuery>;
}> = [
  { name: "unfiltered-name-sort", query: {} },
  {
    name: "full-text-relevance",
    query: {
      text: "magic missile",
      sort: { key: "relevance", direction: "ascending" },
    },
  },
  {
    name: "power-facets-and-level",
    query: {
      facets: [
        { key: "type", include: ["Power"], exclude: [] },
        { key: "usage", include: ["Encounter"], exclude: [] },
      ],
      ranges: [{ field: "level", minimum: 1, maximum: 10 }],
      sort: { key: "level", direction: "ascending" },
    },
  },
  { name: "quoted-phrase", query: { text: '"immediate interrupt"' } },
  {
    name: "include-and-exclude-source",
    query: {
      facets: [
        {
          key: "source",
          include: ["Player's Handbook"],
          exclude: ["Player's Handbook 2"],
        },
      ],
    },
  },
];

const results: BenchmarkResult[] = [];
for (const benchmark of cases) {
  index.query(normalizeCompendiumQuery(benchmark.query));
  const started = performance.now();
  const result = index.query(normalizeCompendiumQuery(benchmark.query));
  results.push({
    name: benchmark.name,
    elapsedMilliseconds: performance.now() - started,
    resultCount: result.total,
  });
}

const fullCorpus = pack.entities.length >= 30_000;
const failures = fullCorpus
  ? [
      ...(buildMilliseconds > 10_000
        ? [`Index build exceeded 10000 ms: ${buildMilliseconds}`]
        : []),
      ...results.flatMap((result) => {
        const budget = result.name === "unfiltered-name-sort" ? 750 : 150;
        return result.elapsedMilliseconds > budget
          ? [
              `${result.name} exceeded ${budget} ms: ${result.elapsedMilliseconds}`,
            ]
          : [];
      }),
    ]
  : [];

console.log(
  JSON.stringify(
    {
      packId: pack.manifest.packId,
      contentDigest: pack.manifest.contentDigest,
      recordCount: pack.entities.length,
      buildMilliseconds,
      results,
      budgets: {
        fullCorpusThreshold: 30_000,
        indexBuildMilliseconds: 10_000,
        broadQueryMilliseconds: 750,
        typicalQueryMilliseconds: 150,
      },
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exitCode = 1;
