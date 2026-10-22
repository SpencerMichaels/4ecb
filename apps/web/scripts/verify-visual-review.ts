/**
 * Private verifier for the visual-review page's factual rows
 * (scripts/visual-review-classification.ts): checks the review characters
 * built by scripts/build-visual-review.ts against the checklist's text,
 * values, card order, candidates and command behaviour, using the same
 * evaluation, sheet model, builder helpers and static React markup the app
 * renders. Writes verify.json beside the page and rewrites the pages
 * (scripts/visual-review-output.ts). Layout, fit, colour and interaction
 * stay with the owner.
 *
 *   pnpm review:verify [--out=tmp/visual-review] [--only=slug,...]
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ROW_CLASSIFICATION } from "../../../scripts/visual-review-classification";
import {
  matchItem,
  parseChecklist,
  rowKey,
  type Verification,
} from "../../../scripts/visual-review-page";
import {
  CHECKLIST_PATH,
  writeReviewPages,
} from "../../../scripts/visual-review-output";
import type { Check, Rule } from "./visual-review-assert";
import { CHARACTER_RULES } from "./visual-review-checks-characters";
import { GENERAL_RULES } from "./visual-review-checks-general";
import { loadReviewContext } from "./visual-review-context";

function parseArgs(argv: readonly string[]) {
  const option = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    outDir: resolve(option("out") ?? "tmp/visual-review"),
    only: option("only")?.split(",").filter(Boolean),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const context = await loadReviewContext(args.outDir);
  const checklist = parseChecklist(await readFile(CHECKLIST_PATH, "utf8"));
  const keyFor = (rule: Rule): string => {
    const item = matchItem(checklist, rule.item);
    if (item === undefined)
      throw new Error(`No checklist item starts with "${rule.item}"`);
    const items = (entries: readonly (readonly [string, string])[]) =>
      entries.some(([name]) => matchItem(checklist, name) === item);
    if (rule.where.startsWith("general:")) {
      const title = rule.where.slice("general:".length);
      const index = context.plan.general.findIndex(
        (section) => section.title === title && items(section.items),
      );
      if (index < 0) throw new Error(`No general section ${title}`);
      return rowKey(`general|${index}`, item);
    }
    const review = context.plan.reviews.find(
      ({ spec }) => spec.slug === rule.where,
    );
    const index =
      review?.links.findIndex(
        (link) => link.label === rule.link && items(link.items),
      ) ?? -1;
    if (index < 0)
      throw new Error(`${rule.where} has no link "${rule.link}" with it`);
    return rowKey(`${rule.where}|${index}`, item);
  };

  const rows: Record<string, { checks: Check[]; error?: string }> = {};
  for (const rule of [...CHARACTER_RULES, ...GENERAL_RULES]) {
    if (
      args.only !== undefined &&
      !args.only.includes(rule.where.replace(/^general:.*/, "general"))
    )
      continue;
    const key = keyFor(rule);
    if (ROW_CLASSIFICATION[key] === undefined)
      process.stderr.write(`  ${key}: checked but classified visual\n`);
    const row = (rows[key] ??= { checks: [] });
    const ruleStarted = Date.now();
    try {
      row.checks.push(...(await rule.run(context)));
    } catch (error) {
      row.error = (error as Error).stack ?? String(error);
    }
    process.stderr.write(
      `  ${key}: ${row.error === undefined ? row.checks.filter(({ pass }) => !pass).length : "ERROR"} failed (${((Date.now() - ruleStarted) / 1000).toFixed(1)}s)\n`,
    );
  }
  const unchecked = Object.keys(ROW_CLASSIFICATION).filter(
    (key) => rows[key] === undefined,
  );

  const verification: Verification = {
    generatedAt: new Date().toISOString(),
    packDigest: context.pack.manifest.contentDigest,
    rows,
  };
  // A partial run (--only) keeps the other rows' last results.
  if (args.only !== undefined) {
    try {
      const previous = JSON.parse(
        await readFile(resolve(args.outDir, "verify.json"), "utf8"),
      ) as Verification;
      if (previous.packDigest === verification.packDigest)
        Object.assign(verification.rows, { ...previous.rows, ...rows });
    } catch {
      // No earlier results.
    }
  }
  await writeFile(
    resolve(args.outDir, "verify.json"),
    `${JSON.stringify(verification, null, 2)}\n`,
  );
  const pages = await writeReviewPages(args.outDir);

  const failed = Object.entries(verification.rows).filter(
    ([, row]) =>
      row.error !== undefined || row.checks.some(({ pass }) => !pass),
  );
  process.stdout.write(
    `Verified ${Object.keys(verification.rows).length} rows in ${((Date.now() - started) / 1000).toFixed(0)}s: ${Object.keys(verification.rows).length - failed.length} passed, ${failed.length} failed; ${pages.summary.visual} rows left for the owner.\n`,
  );
  if (args.only === undefined)
    for (const key of unchecked)
      process.stdout.write(`  not checked yet: ${key}\n`);
  for (const [key, row] of failed) {
    process.stdout.write(`  FAILED ${key}\n`);
    if (row.error !== undefined)
      process.stdout.write(`    error: ${row.error.split("\n")[0]}\n`);
    for (const check of row.checks.filter(({ pass }) => !pass))
      process.stdout.write(`    ✗ ${check.label}: ${check.detail}\n`);
  }
}

await main();
