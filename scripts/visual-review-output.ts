/**
 * Writes the visual-review pages (scripts/build-visual-review.ts) from what
 * the last build left in the output directory: the cached characters,
 * page-input.json, and the verifier's verify.json when it matches the pack.
 * Both the build and the verifier (apps/web/scripts/verify-visual-review.ts)
 * call it, so the pages always show the latest verification.
 *
 *   index.html         every row; verified rows show their result
 *   index-visual.html  only what the owner still has to look at
 *   classification.json  row key -> auto / mixed (unlisted rows are visual)
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ContentPackManifest } from "@4ecb/content-pack";

import type { BuiltCharacter } from "./build-visual-review";
import { ROW_CLASSIFICATION } from "./visual-review-classification";
import {
  parseChecklist,
  renderReviewPage,
  type ChecklistItem,
  type ReviewPageSummary,
  type Verification,
} from "./visual-review-page";
import { reviewPlan, type ReviewPlan } from "./visual-review-plan";

export const CHECKLIST_PATH = "docs/visual-review-checklist.md";

/** What the build knows that the pages need, saved for later rewrites. */
export interface PageInput {
  readonly base: string;
  readonly packFile: string;
  readonly backupFile: string;
  readonly reviewPack: ContentPackManifest;
  readonly sourcePack: ContentPackManifest;
  readonly generatedAt: string;
}

/** The library-state copies of a character (plan variants). */
export function withVariants(
  plan: ReviewPlan,
  built: readonly BuiltCharacter[],
  reviewPack: Pick<ContentPackManifest, "packId" | "contentDigest">,
): BuiltCharacter[] {
  const result = [...built];
  for (const review of plan.reviews)
    for (const variant of review.variants ?? []) {
      const original = built.find(({ slug }) => slug === review.spec.slug);
      if (original === undefined) continue;
      result.push({
        slug: variant.slug,
        facts: original.facts,
        record: {
          ...original.record,
          id: `visual-review-${variant.slug}`,
          title: variant.title,
          build: {
            ...original.record.build,
            textStrings: {
              ...original.record.build.textStrings,
              Name: variant.title,
            },
          },
          profileBinding:
            variant.binding === "update"
              ? {
                  packId: reviewPack.packId,
                  contentDigest: reviewPack.contentDigest,
                }
              : {
                  packId: "visual-review-missing-content",
                  contentDigest: "0".repeat(64),
                },
        },
      });
    }
  return result;
}

export async function cachedCharacters(
  outDir: string,
  plan: ReviewPlan,
  packDigest: string,
): Promise<BuiltCharacter[]> {
  const built: BuiltCharacter[] = [];
  for (const { slug } of plan.characters) {
    const path = resolve(outDir, "cache", `${slug}.json`);
    if (!existsSync(path)) continue;
    const cached = JSON.parse(await readFile(path, "utf8")) as {
      packDigest: string;
      built: BuiltCharacter;
    };
    if (cached.packDigest === packDigest) built.push(cached.built);
  }
  return built;
}

export interface WrittenPages {
  readonly checklist: readonly ChecklistItem[];
  readonly unmapped: readonly ChecklistItem[];
  readonly unknownKeys: readonly string[];
  readonly unknownClassified: readonly string[];
  readonly summary: ReviewPageSummary;
  readonly verified: boolean;
}

export async function writeReviewPages(outDir: string): Promise<WrittenPages> {
  const input = JSON.parse(
    await readFile(resolve(outDir, "page-input.json"), "utf8"),
  ) as PageInput;
  const plan = reviewPlan();
  const built = withVariants(
    plan,
    await cachedCharacters(outDir, plan, input.reviewPack.contentDigest),
    input.reviewPack,
  );
  const checklist = parseChecklist(await readFile(CHECKLIST_PATH, "utf8"));
  const verifyPath = resolve(outDir, "verify.json");
  const loaded = existsSync(verifyPath)
    ? (JSON.parse(await readFile(verifyPath, "utf8")) as Verification)
    : undefined;
  const verification =
    loaded?.packDigest === input.reviewPack.contentDigest ? loaded : undefined;
  const common = {
    ...input,
    plan,
    built,
    checklist,
    classification: ROW_CLASSIFICATION,
    ...(verification === undefined ? {} : { verification }),
  };
  const full = renderReviewPage({ ...common, otherPage: "index-visual.html" });
  const visual = renderReviewPage({
    ...common,
    visualOnly: true,
    otherPage: "index.html",
  });
  await writeFile(resolve(outDir, "index.html"), full.html);
  await writeFile(resolve(outDir, "index-visual.html"), visual.html);
  await writeFile(
    resolve(outDir, "classification.json"),
    `${JSON.stringify(
      Object.fromEntries(
        [...full.rowKinds].map(([key, kind]) => {
          const value = ROW_CLASSIFICATION[key];
          return [
            key,
            value === undefined
              ? { kind }
              : value.kind === "auto"
                ? { kind, auto: value.auto }
                : { kind, auto: value.auto, visual: value.visual },
          ];
        }),
      ),
      null,
      2,
    )}\n`,
  );
  return {
    checklist,
    unmapped: full.unmapped,
    unknownKeys: full.unknownKeys,
    unknownClassified: full.unknownClassified,
    summary: full.summary,
    verified: verification !== undefined,
  };
}
