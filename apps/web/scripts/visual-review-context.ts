/**
 * The review characters as the app would see them, for the private
 * visual-review verifier (verify-visual-review.ts): the review pack composed
 * into the characters' bound profile, each cached character record
 * (scripts/build-visual-review.ts), and memoized evaluations, sheet models
 * and builder card settings with the app's default preferences.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CharacterBuild, CharacterRecord } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import { composeContentPacks, type ContentPack } from "@4ecb/content-pack";
import type { EvaluatedCharacter } from "@4ecb/rules-engine";
import {
  buildEvaluatedSheetModel,
  type CharacterSheetModel,
} from "@4ecb/sheet-model";

import { evaluate, key, loadPack } from "../../../scripts/native-character";
import type { BuiltCharacter } from "../../../scripts/build-visual-review";
import {
  reviewPlan,
  type ReviewPlan,
} from "../../../scripts/visual-review-plan";
import {
  evaluatedBuilderCardSettings,
  type BuilderCardSettings,
} from "../src/BuilderCards";
import { ACTIVE_PROFILE_NAME } from "../src/content-profile-ui";
import { inventoryCategory } from "../src/equipment-ui";

/** The app's default sheet and card preferences (CharacterSheetPage). */
export const DEFAULT_PREFERENCES = {
  resolveAbilityChoices: true,
  proficientEquipmentOnly: true,
  abbreviateAbilityValues: true,
  countCoinWeight: true,
} as const;

export class ReviewCharacter {
  #sheetEvaluation: EvaluatedCharacter | undefined;
  #sheet: CharacterSheetModel | undefined;
  #levelEvaluations = new Map<string, EvaluatedCharacter>();
  #cards = new Map<string, BuilderCardSettings>();

  constructor(
    readonly context: ReviewContext,
    readonly built: BuiltCharacter,
  ) {}

  get slug(): string {
    return this.built.slug;
  }

  get record(): CharacterRecord {
    return this.built.record;
  }

  get build(): CharacterBuild {
    return this.built.record.build;
  }

  /** The sheet's evaluation (no candidate details, with powers). */
  get evaluation(): EvaluatedCharacter {
    return (this.#sheetEvaluation ??= evaluate(
      this.build,
      this.context.entities,
      { candidateDetailLevels: [] },
    ));
  }

  get sheet(): CharacterSheetModel {
    return (this.#sheet ??= sheetModelFor(
      this.context,
      this.record,
      this.build,
      this.evaluation,
    ));
  }

  /** The Build tab's evaluation with candidate details at these levels. */
  atLevels(
    levels: readonly number[],
    replacementChoiceIds: readonly string[] = [],
  ): EvaluatedCharacter {
    const cacheKey = `${levels.join(",")}|${replacementChoiceIds.join(",")}`;
    let result = this.#levelEvaluations.get(cacheKey);
    if (result === undefined) {
      result = evaluate(this.build, this.context.entities, {
        candidateDetailLevels: levels,
        candidateDetailReplacementChoiceIds: replacementChoiceIds,
        includePowers: false,
      });
      this.#levelEvaluations.set(cacheKey, result);
    }
    return result;
  }

  /** Builder detail-pane cards for this character's current state. */
  cards(build: CharacterBuild = this.build): BuilderCardSettings {
    const cacheKey = build === this.build ? "current" : JSON.stringify(build);
    let result = this.#cards.get(cacheKey);
    if (result === undefined) {
      const evaluation =
        build === this.build
          ? this.evaluation
          : evaluate(build, this.context.entities, {
              candidateDetailLevels: [],
            });
      result = evaluatedBuilderCardSettings(
        build,
        evaluation,
        this.context.entities,
        DEFAULT_PREFERENCES,
      );
      this.#cards.set(cacheKey, result);
    }
    return result;
  }
}

export function sheetModelFor(
  context: ReviewContext,
  record: CharacterRecord,
  build: CharacterBuild,
  evaluation: EvaluatedCharacter,
): CharacterSheetModel {
  return buildEvaluatedSheetModel(
    record.snapshot,
    build,
    evaluation,
    context.entities,
    {
      countCoinWeight: DEFAULT_PREFERENCES.countCoinWeight,
      resolveAbilityChoices: DEFAULT_PREFERENCES.resolveAbilityChoices,
      proficientEquipmentOnly: DEFAULT_PREFERENCES.proficientEquipmentOnly,
      inventoryCategory: (elements) =>
        inventoryCategory({ elements }, context.byId),
    },
  );
}

export class ReviewContext {
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly #characters = new Map<string, ReviewCharacter>();

  constructor(
    readonly pack: ContentPack,
    readonly entities: readonly ContentEntity[],
    readonly plan: ReviewPlan,
    readonly built: readonly BuiltCharacter[],
  ) {
    this.byId = new Map(entities.map((entity) => [key(entity.id), entity]));
  }

  character(slug: string): ReviewCharacter {
    let result = this.#characters.get(slug);
    if (result === undefined) {
      const built = this.built.find((candidate) => candidate.slug === slug);
      if (built === undefined)
        throw new Error(`No cached review character ${slug}`);
      result = new ReviewCharacter(this, built);
      this.#characters.set(slug, result);
    }
    return result;
  }

  entity(id: string): ContentEntity {
    const entity = this.byId.get(key(id));
    if (entity === undefined) throw new Error(`No definition ${id}`);
    return entity;
  }

  /** Content by exact (case-insensitive) name, optionally of one type. */
  named(name: string, type?: string): ContentEntity {
    const found = this.entities.find(
      (entity) =>
        key(entity.name) === key(name) &&
        (type === undefined || key(entity.type) === key(type)),
    );
    if (found === undefined)
      throw new Error(`No ${type ?? "definition"} named ${name}`);
    return found;
  }
}

/** Loads the review pack and every cached review character. */
export async function loadReviewContext(
  outDir: string,
): Promise<ReviewContext> {
  const pack = await loadPack(resolve(outDir, "review-content.4ecp"));
  const plan = reviewPlan();
  const built: BuiltCharacter[] = [];
  for (const { slug } of plan.characters) {
    const cached = JSON.parse(
      await readFile(resolve(outDir, "cache", `${slug}.json`), "utf8"),
    ) as { packDigest: string; built: BuiltCharacter };
    if (cached.packDigest !== pack.manifest.contentDigest)
      throw new Error(
        `${slug}: cached for another pack; rerun pnpm review:build`,
      );
    built.push(cached.built);
  }
  const binding = built[0]?.record.profileBinding;
  if (binding === undefined) throw new Error("No review characters cached");
  const composed = await composeContentPacks([pack], {
    packId: binding.packId,
    name: ACTIVE_PROFILE_NAME,
  });
  if (composed.pack.manifest.contentDigest !== binding.contentDigest)
    throw new Error("The composed review profile differs from the binding");
  return new ReviewContext(pack, composed.pack.entities, plan, built);
}
