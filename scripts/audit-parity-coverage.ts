/**
 * Private parity-set coverage audit. For each legacy comparison character
 * (the ignored player characters in `sample-chars/` plus the supplied
 * SampleHeroes), reports what its evaluation actually exercises:
 *
 * - modifier shapes (`apps/content-tool/src/modifier-shapes.ts`) of the
 *   statadd/textstring/modify rules the engine executed for it;
 * - owned records the native engine special-cases (EXCEPTION_IDS /
 *   EXCEPTION_NAMES and IDs named in the reviewed legacy special-case
 *   inventory), feats listed separately;
 * - item kinds: augments (bound or not), slotless items, `_AlwaysExecute`
 *   items, implements and off-hand implement bonuses, weapons used as
 *   implements, superior implements, item-set pieces, enhancement-less
 *   magic items, by Magic Item Type;
 *
 * and then which pack-wide shapes no comparison file exercises, joined with
 * `pnpm audit:modifiers` results (tmp/audit/modifiers.json) when present so
 * untested-and-ignored shapes rank first. Writes ignored
 * tmp/audit/parity-coverage.{json,md}.
 *
 *   pnpm audit:parity-coverage [PACK.4ecp] [CHARACTER.dnd4e ...]
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ContentEntity } from "@4ecb/content-domain";
import { importDnd4e } from "@4ecb/legacy-dnd4e";
import {
  EXCEPTION_IDS,
  EXCEPTION_NAMES,
  evaluateCharacter,
  projectBuildForEvaluation,
} from "@4ecb/rules-engine";

import { LEGACY_SPECIAL_CASES } from "../apps/content-tool/src/legacy-special-cases";
import {
  collectModifierUses,
  groupByShape,
  key,
  modifierShape,
  qualifierShapes,
  shapeVocabulary,
  type ModifierUse,
} from "../apps/content-tool/src/modifier-shapes";
import { loadPack } from "./native-character";

const OUTPUT_DIRECTORY = "tmp/audit";
const COMPARISON_DIRECTORIES = [
  "sample-chars",
  "CharacterBuilder/SampleChars/SampleHeroes",
];

async function comparisonFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const directory of COMPARISON_DIRECTORIES) {
    const names = await readdir(directory).catch(() => [] as string[]);
    files.push(
      ...names
        .filter((name) => name.toLocaleLowerCase().endsWith(".dnd4e"))
        .toSorted()
        .map((name) => join(directory, name)),
    );
  }
  return files;
}

function field(entity: ContentEntity, name: string): string | undefined {
  return entity.specifics.find((specific) => key(specific.name) === key(name))
    ?.value;
}

interface SpecialCaseRecord {
  readonly via: string;
  readonly status?: string;
}

/** Record IDs and names the native engine special-cases. */
function specialCaseIndex(): ReadonlyMap<string, SpecialCaseRecord[]> {
  const index = new Map<string, SpecialCaseRecord[]>();
  const add = (token: string, record: SpecialCaseRecord) =>
    index.set(key(token), [...(index.get(key(token)) ?? []), record]);
  for (const [name, id] of Object.entries(EXCEPTION_IDS))
    add(id, { via: `EXCEPTION_IDS.${name}`, status: "code" });
  for (const [name, value] of Object.entries(EXCEPTION_NAMES))
    add(value, { via: `EXCEPTION_NAMES.${name}`, status: "code" });
  for (const [member, entry] of Object.entries(LEGACY_SPECIAL_CASES))
    for (const id of `${entry.description} ${entry.note ?? ""}`.match(
      /\bID_[A-Z0-9_-]+/gu,
    ) ?? [])
      add(id, { via: member, status: entry.status });
  return index;
}

function isAugment(entity: ContentEntity): boolean {
  return /augment|dragonshard/iu.test(field(entity, "Magic Item Type") ?? "");
}

const IMPLEMENT_TYPE =
  /(implement|holy symbol|ki focus|orb|rod|staff|tome|totem|wand)/iu;

function itemKinds(
  entity: ContentEntity,
  bound: boolean,
  equipped: boolean,
): string[] {
  const type = key(entity.type);
  const magicType = field(entity, "Magic Item Type") ?? "";
  const kinds: string[] = [];
  if (type === "magic item")
    kinds.push(`magic item type: ${magicType || "<none>"}`);
  else kinds.push(`type: ${entity.type}`);
  if (isAugment(entity)) kinds.push(bound ? "augment (bound)" : "augment");
  if (
    type === "magic item" &&
    (field(entity, "Item Slot") ?? "").trim() === "" &&
    !/weapon|armor|arms|potion|consumable|ammunition|alchemical|elixir|whetstone|reagent|augment|dragonshard/iu.test(
      magicType,
    ) &&
    !IMPLEMENT_TYPE.test(magicType)
  )
    kinds.push(
      /wondrous/iu.test(magicType) ? "wondrous item" : "slotless magic item",
    );
  const alwaysExecute =
    (field(entity, "_AlwaysExecute") ?? "").trim() !== "" ||
    entity.rules.some(
      (rule) =>
        key(rule.name) === "modify" &&
        rule.attributes.some(
          (attribute) =>
            key(attribute.name) === "field" &&
            key(attribute.value) === "_alwaysexecute",
        ),
    );
  if (alwaysExecute) kinds.push("_AlwaysExecute");
  if (IMPLEMENT_TYPE.test(magicType) || type === "superior implement")
    kinds.push(
      type === "superior implement" ? "superior implement" : "implement",
    );
  if (
    entity.rules.some((rule) =>
      rule.attributes.some(
        (attribute) =>
          key(attribute.name) === "name" &&
          key(attribute.value) === "offhand implement bonus",
      ),
    )
  )
    kinds.push("offhand implement bonus");
  if (
    entity.rules.some((rule) =>
      rule.attributes.some(
        (attribute) =>
          key(attribute.name) === "field" &&
          /^_implement(for|equiv|asclass)/u.test(key(attribute.value)),
      ),
    ) ||
    (field(entity, "_ImplementEquiv") ?? "").trim() !== ""
  )
    kinds.push("weapon as implement");
  if ((field(entity, "_Item_Set_ID") ?? "").trim() !== "")
    kinds.push("item set piece");
  if (!equipped) kinds.push("carried, not equipped");
  return kinds;
}

interface FileCoverage {
  readonly file: string;
  readonly character: string;
  readonly level: number;
  readonly shapes: Readonly<Record<string, number>>;
  readonly qualifierShapes: Readonly<Record<string, number>>;
  readonly specialCases: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly via: readonly string[];
  }[];
  readonly itemKinds: Readonly<Record<string, readonly string[]>>;
  readonly offhandImplements: boolean;
}

interface ModifierAuditShape {
  readonly shape: string;
  readonly status: string;
  readonly entityCount: number;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const packPath =
    argv.find((argument) => argument.endsWith(".4ecp")) ??
    "tmp/content/full-local.4ecp";
  const requested = argv.filter((argument) => argument.endsWith(".dnd4e"));
  const files = requested.length > 0 ? requested : await comparisonFiles();
  const pack = await loadPack(packPath);
  const byId = new Map(pack.entities.map((entity) => [key(entity.id), entity]));
  const vocabulary = shapeVocabulary(pack.entities);
  const uses = collectModifierUses(pack.entities);
  const usesByEntity = new Map<string, ModifierUse[]>();
  for (const use of uses)
    usesByEntity.set(key(use.entityId), [
      ...(usesByEntity.get(key(use.entityId)) ?? []),
      use,
    ]);
  const specialCases = specialCaseIndex();
  const coverage: FileCoverage[] = [];
  for (const file of files) {
    const imported = importDnd4e(await readFile(resolve(file), "utf8"));
    const input = projectBuildForEvaluation(imported.build, pack.entities);
    const evaluation = evaluateCharacter(
      { ...input, candidateDetailLevels: [] },
      pack.entities,
    );
    // Rules the engine executed: a statadd's contribution id is
    // `<occurrence>:<rule ordinal>`; textstrings and overlays name their
    // provider occurrence.
    const executed = new Set<string>();
    for (const stat of Object.values(evaluation.stats))
      for (const contribution of stat.contributions)
        executed.add(key(contribution.id));
    const textProviders = new Set(
      (evaluation.textContributions ?? []).map(({ providerId }) =>
        key(providerId),
      ),
    );
    const overlayProviders = new Set(
      evaluation.overlays.map(({ providerOccurrenceId }) =>
        key(providerOccurrenceId),
      ),
    );
    const shapes: Record<string, number> = {};
    const qualifiers: Record<string, number> = {};
    const seenSpecial = new Map<string, FileCoverage["specialCases"][number]>();
    for (const occurrence of evaluation.occurrences) {
      const entity = byId.get(key(occurrence.definitionId));
      if (entity === undefined) continue;
      for (const token of [entity.id, entity.name]) {
        const records = specialCases.get(key(token));
        if (records === undefined) continue;
        const current = seenSpecial.get(key(entity.id));
        seenSpecial.set(key(entity.id), {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          via: [
            ...new Set([
              ...(current?.via ?? []),
              ...records.map(
                (record) =>
                  `${record.via}${record.status ? ` (${record.status})` : ""}`,
              ),
            ]),
          ],
        });
      }
      for (const use of usesByEntity.get(key(entity.id)) ?? []) {
        const ran =
          use.kind === "statadd"
            ? executed.has(key(`${occurrence.id}:${use.ordinal}`))
            : use.kind === "textstring"
              ? textProviders.has(key(occurrence.id))
              : overlayProviders.has(key(occurrence.id));
        if (!ran) continue;
        const shape = modifierShape(use, vocabulary);
        shapes[shape] = (shapes[shape] ?? 0) + 1;
        for (const qualifier of qualifierShapes(use, vocabulary))
          qualifiers[qualifier] = (qualifiers[qualifier] ?? 0) + 1;
      }
    }
    const kinds: Record<string, string[]> = {};
    const implementsEquipped: string[] = [];
    for (const entry of input.inventory.filter((item) => item.quantity > 0)) {
      const bound = Object.keys(entry.overrides ?? {}).some(
        (name) => key(name) === "augment",
      );
      const names = entry.definitionIds
        .map((id) => byId.get(key(id))?.name ?? id)
        .join(" + ");
      for (const id of entry.definitionIds) {
        const entity = byId.get(key(id));
        if (entity === undefined) continue;
        const entityKinds = itemKinds(
          entity,
          bound,
          entry.equippedQuantity > 0,
        );
        if (bound && !entityKinds.includes("augment (bound)"))
          entityKinds.push("bound to an augment");
        if (
          entry.equippedQuantity > 0 &&
          (entityKinds.includes("implement") ||
            entityKinds.includes("superior implement"))
        )
          implementsEquipped.push(names);
        for (const kind of entityKinds)
          kinds[kind] = [...new Set([...(kinds[kind] ?? []), names])];
      }
    }
    const ownsDualImplement = evaluation.occurrences.some(
      (occurrence) =>
        key(occurrence.definitionId) ===
        key(EXCEPTION_IDS.dualImplementSpellcaster),
    );
    coverage.push({
      file,
      character: imported.snapshot.details.name ?? file,
      level: input.level,
      shapes,
      qualifierShapes: qualifiers,
      specialCases: [...seenSpecial.values()],
      itemKinds: kinds,
      offhandImplements: ownsDualImplement && implementsEquipped.length >= 1,
    });
    process.stderr.write(`${file}: ${Object.keys(shapes).length} shapes\n`);
  }

  const modifierAudit = await readFile(
    `${OUTPUT_DIRECTORY}/modifiers.json`,
    "utf8",
  )
    .then(
      (text) => (JSON.parse(text) as { shapes: ModifierAuditShape[] }).shapes,
    )
    .catch(() => undefined);
  const auditStatus = new Map(
    (modifierAudit ?? []).map((entry) => [entry.shape, entry.status]),
  );
  const exercised = new Set(
    coverage.flatMap((file) => Object.keys(file.shapes)),
  );
  const groups = groupByShape(uses, (use) => modifierShape(use, vocabulary));
  const unexercised = groups
    .filter((group) => !exercised.has(group.shape))
    .map((group) => ({
      shape: group.shape,
      entityCount: group.entityCount,
      ruleCount: group.uses.length,
      audit: auditStatus.get(group.shape) ?? "unknown",
      examples: [...group.names.keys()].slice(0, 3),
    }));
  const statusRank = (status: string) =>
    status === "ignored"
      ? 0
      : status === "partial"
        ? 1
        : status === "unknown"
          ? 2
          : 3;
  const ranked = unexercised.toSorted(
    (left, right) =>
      statusRank(left.audit) - statusRank(right.audit) ||
      right.entityCount - left.entityCount,
  );
  const exercisedGaps = groups
    .filter(
      (group) =>
        exercised.has(group.shape) &&
        ["ignored", "partial"].includes(auditStatus.get(group.shape) ?? ""),
    )
    .map((group) => ({
      shape: group.shape,
      entityCount: group.entityCount,
      audit: auditStatus.get(group.shape) ?? "",
      files: coverage
        .filter((file) => file.shapes[group.shape] !== undefined)
        .map((file) => file.character),
    }));
  const report = {
    pack: packPath,
    modifierAudit: modifierAudit === undefined ? "absent" : "joined",
    files: coverage,
    totals: {
      packShapes: groups.length,
      exercisedShapes: exercised.size,
      unexercisedShapes: unexercised.length,
      unexercisedEntities: unexercised.reduce(
        (sum, entry) => sum + entry.entityCount,
        0,
      ),
    },
    unexercised: ranked,
    exercisedGaps,
  };
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(
    `${OUTPUT_DIRECTORY}/parity-coverage.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(`${OUTPUT_DIRECTORY}/parity-coverage.md`, markdown(report));
  process.stdout.write(
    `${JSON.stringify({ ...report.totals, report: `${OUTPUT_DIRECTORY}/parity-coverage.md` })}\n`,
  );
}

function markdown(report: {
  readonly pack: string;
  readonly modifierAudit: string;
  readonly files: readonly FileCoverage[];
  readonly totals: Readonly<Record<string, number>>;
  readonly unexercised: readonly {
    shape: string;
    entityCount: number;
    ruleCount: number;
    audit: string;
    examples: readonly string[];
  }[];
  readonly exercisedGaps: readonly {
    shape: string;
    entityCount: number;
    audit: string;
    files: readonly string[];
  }[];
}): string {
  const lines = [
    "# Parity-set coverage",
    "",
    `Pack: \`${report.pack}\`; modifier audit ${report.modifierAudit}.`,
    `Shapes: ${report.totals.exercisedShapes} of ${report.totals.packShapes} exercised by some comparison file; ${report.totals.unexercisedShapes} (${report.totals.unexercisedEntities} entity uses) by none.`,
    "",
    "## Per file",
    "",
  ];
  for (const file of report.files) {
    lines.push(
      `### ${file.character} (level ${file.level}) — \`${file.file}\``,
      "",
      `- Modifier shapes executed: ${Object.keys(file.shapes).length}`,
      `- Special-cased records: ${
        file.specialCases.length === 0
          ? "none"
          : file.specialCases
              .map(
                (entry) =>
                  `${entry.name} [${entry.type}] via ${entry.via.join(", ")}`,
              )
              .join("; ")
      }`,
      `- Off-hand implement (Dual Implement Spellcaster + implement): ${file.offhandImplements ? "yes" : "no"}`,
      `- Item kinds: ${Object.entries(file.itemKinds)
        .map(([kind, items]) => `${kind} (${items.length})`)
        .join(", ")}`,
      "",
    );
  }
  lines.push(
    "## Ignored/partial shapes a comparison file does exercise",
    "",
    "| Entities | Audit | Shape | Files |",
    "| ---: | --- | --- | --- |",
    ...report.exercisedGaps.map(
      (entry) =>
        `| ${entry.entityCount} | ${entry.audit} | \`${entry.shape}\` | ${entry.files.join(", ")} |`,
    ),
    "",
    "## Shapes no comparison file exercises",
    "",
    "Ranked ignored, partial, unprobed, then applied; by entity count.",
    "",
    "| Entities | Rules | Audit | Shape | Examples |",
    "| ---: | ---: | --- | --- | --- |",
    ...report.unexercised.map(
      (entry) =>
        `| ${entry.entityCount} | ${entry.ruleCount} | ${entry.audit} | \`${entry.shape}\` | ${entry.examples.join("; ").replaceAll("|", "\\|")} |`,
    ),
    "",
  );
  return `${lines.join("\n")}\n`;
}

await main();
