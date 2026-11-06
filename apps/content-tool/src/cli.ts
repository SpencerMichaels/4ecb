// Argument, file and output helpers shared by the content tool's commands.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdout } from "node:process";
import { promisify } from "node:util";
import { gunzip as gunzipCallback, gzip as gzipCallback } from "node:zlib";

import { decodeContentPack, type ContentPack } from "@4ecb/content-pack";

export const gzip = promisify(gzipCallback);
export const gunzip = promisify(gunzipCallback);

export function isGzip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function printJson(value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function readPack(path: string): Promise<ContentPack> {
  const bytes = await readFile(path);
  const decoded = isGzip(bytes) ? await gunzip(bytes) : bytes;
  return decodeContentPack(decoded.toString("utf8"));
}

export async function writeAtomically(
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

export interface ParsedArguments {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string>;
}

export function parseArguments(values: readonly string[]): ParsedArguments {
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

export function requireOption(
  arguments_: ParsedArguments,
  name: string,
): string {
  const value = arguments_.options.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}
