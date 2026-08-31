#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { stderr, stdout } from "node:process";
import { promisify } from "node:util";
import { gunzip as gunzipCallback, gzip as gzipCallback } from "node:zlib";

import {
  buildContentPack,
  decodeContentPack,
  diffContentPacks,
  encodeContentPack,
  summarizeContentPack,
  validateContentPack,
  type ContentPack,
} from "@4ecb/content-pack";
import { D20RulesParser } from "@4ecb/legacy-wotc";

const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);

interface ParsedArguments {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string>;
}

function parseArguments(values: readonly string[]): ParsedArguments {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const name = value.slice(2);
    const optionValue = values[index + 1];
    if (optionValue === undefined || optionValue.startsWith("--")) {
      throw new Error(`Option --${name} requires a value`);
    }
    options.set(name, optionValue);
    index += 1;
  }
  return { positionals, options };
}

function requireOption(arguments_: ParsedArguments, name: string): string {
  const value = arguments_.options.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}

function printJson(value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readPack(path: string): Promise<ContentPack> {
  const bytes = await readFile(path);
  const decoded =
    bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes;
  return decodeContentPack(decoded.toString("utf8"));
}

async function writeAtomically(
  path: string,
  value: string | Uint8Array,
): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp`;
  if (typeof value === "string") await writeFile(temporaryPath, value, "utf8");
  else await writeFile(temporaryPath, value);
  await rename(temporaryPath, absolutePath);
}

async function build(arguments_: ParsedArguments): Promise<void> {
  const input = resolve(requireOption(arguments_, "input"));
  const output = resolve(requireOption(arguments_, "output"));
  const packId = requireOption(arguments_, "id");
  const name = requireOption(arguments_, "name");
  const sourceKey = arguments_.options.get("source-key") ?? basename(input);
  const parser = new D20RulesParser(sourceKey);

  stderr.write(`Parsing ${input}\n`);
  const stream = createReadStream(input, { encoding: "utf8" });
  let firstChunk = true;
  for await (const chunk of stream) {
    parser.write(firstChunk ? chunk.replace(/^\uFEFF/, "") : chunk);
    firstChunk = false;
  }

  const parsed = parser.close();
  const pack = await buildContentPack(parsed, { packId, name });
  const compressed = await gzip(Buffer.from(encodeContentPack(pack)), {
    level: 9,
  });
  await writeAtomically(output, compressed);
  const validation = await validateContentPack(pack);
  printJson({ output, summary: summarizeContentPack(pack), validation });
  if (!validation.valid) process.exitCode = 1;
}

async function inspect(arguments_: ParsedArguments): Promise<void> {
  const path = resolve(arguments_.positionals[1] ?? "");
  if (arguments_.positionals[1] === undefined)
    throw new Error("inspect requires a pack path");
  printJson(summarizeContentPack(await readPack(path)));
}

async function validate(arguments_: ParsedArguments): Promise<void> {
  const path = resolve(arguments_.positionals[1] ?? "");
  if (arguments_.positionals[1] === undefined)
    throw new Error("validate requires a pack path");
  const validation = await validateContentPack(await readPack(path));
  printJson(validation);
  if (!validation.valid) process.exitCode = 1;
}

async function diff(arguments_: ParsedArguments): Promise<void> {
  const beforePath = arguments_.positionals[1];
  const afterPath = arguments_.positionals[2];
  if (beforePath === undefined || afterPath === undefined) {
    throw new Error("diff requires before and after pack paths");
  }
  const [before, after] = await Promise.all([
    readPack(resolve(beforePath)),
    readPack(resolve(afterPath)),
  ]);
  printJson(diffContentPacks(before, after));
}

function printHelp(): void {
  stdout.write(`4ecb content tool

Usage:
  content-tool build --input rules.xml --output rules.4ecp --id PACK_ID --name "Pack name" [--source-key KEY]
  content-tool inspect PACK.4ecp
  content-tool validate PACK.4ecp
  content-tool diff BEFORE.4ecp AFTER.4ecp
`);
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const command = arguments_.positionals[0];
  switch (command) {
    case "build":
      await build(arguments_);
      break;
    case "inspect":
      await inspect(arguments_);
      break;
    case "validate":
      await validate(arguments_);
      break;
    case "diff":
      await diff(arguments_);
      break;
    case "help":
    case "--help":
    case undefined:
      printHelp();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  stderr.write(`${message}\n`);
  process.exitCode = 1;
});
