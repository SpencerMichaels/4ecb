/**
 * Private card-field coverage sweep. For every record of an exact pack
 * whose type renders as a card or reference entry, renders each surface
 * the app shows it on with the app's own components and functions
 * (`apps/web/src/card-field-coverage.tsx`): the printed card (PowerCard /
 * ItemCard / FamiliarCard), the builder's panel card (`CandidateDetailCard`:
 * the panel power/item/familiar card or the reference-entity-card), and the
 * printed reference entry (`references`, for features, feats, paths,
 * backgrounds, deities and known rituals). Then checks each non-empty
 * specific, the description, flavor and prerequisite line against each
 * surface's text.
 *
 * A field counts as shown verbatim, normalized (punctuation and case), as
 * names (an ID list shown by the records' names), reworded (most of its
 * words, e.g. with "(+N)" annotations or merged into another line), or only
 * as an icon's label (aria-label/title). Reports, per type and field name:
 * records with content, records where no surface shows it, and records
 * where some surfaces show it and others don't, with examples. Fields
 * `isUserFacingSpecific` rejects (`_` fields, legacy bookkeeping, ID lists)
 * and `CARD_FIELD_ALLOWLIST` entries are listed separately.
 *
 * Cards are built without a character (authored formulas, every level's
 * text), as a Build candidate's are before evaluation; character-dependent
 * filtering (irrelevant pact clauses, inapplicable item properties, a
 * summon's creature fields) is not exercised.
 *
 *   pnpm audit:card-fields [PACK.4ecp] [--examples=N] [--type=Power,...]
 *     [--json]
 * Writes ignored tmp/audit/card-fields.md (and .json with --json).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CARD_FIELD_ALLOWLIST,
  CARD_FIELD_MERGES,
  CARD_SURFACES,
  cardFieldCoverage,
  cardSurfaceTexts,
  type CardFieldRule,
  type CardSurface,
  type FieldCoverage,
} from "../apps/web/src/card-field-coverage";
import { contentEntitiesById } from "../packages/content-domain/src/index";

import { loadPack } from "./native-character";

/** Content types the app shows as cards or reference entries. */
const CARD_TYPES = new Set(
  [
    "Power",
    "Magic Item",
    "Weapon",
    "Armor",
    "Gear",
    "Superior Implement",
    "Ritual",
    "Ritual Scroll",
    "Item Set",
    "Item Set Benefit",
    "Class Feature",
    "Racial Trait",
    "Feat",
    "Background",
    "Background Choice",
    "Paragon Path",
    "Epic Destiny",
    "Theme",
    "Trait Package",
    "Deity",
    "Domain",
    "Race",
    "Class",
    "Hybrid Class",
    "Build",
    "Companion",
    "Familiar",
    "Associate",
    "God Fragment",
    "Language",
    "Skill",
    "Weapon Property",
  ].map((type) => type.toLocaleLowerCase()),
);

interface Example {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly surfaces?: string;
}

interface FieldStats {
  withContent: number;
  internal: number;
  allowlisted: number;
  nowhere: number;
  partial: number;
  /** How the shown copies appear, over all surfaces. */
  readonly presence: Record<string, number>;
  readonly partialSurfaces: Record<string, number>;
  readonly nowhereExamples: Example[];
  readonly partialExamples: Example[];
  readonly reworded: Example[];
}

function parseArgs(argv: readonly string[]) {
  const option = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    pack: resolve(
      argv.find((arg) => !arg.startsWith("--")) ??
        "tmp/content/full-local.4ecp",
    ),
    examples: Number(option("examples") ?? 4),
    types: option("type")
      ?.split(",")
      .map((type) => type.trim().toLocaleLowerCase()),
    json: argv.includes("--json"),
  };
}

const snippet = (value: string, length = 90) => {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

const cell = (value: string) => value.replaceAll("|", "\\|");

function shown(field: FieldCoverage, surface: CardSurface): boolean {
  const presence = field.surfaces[surface];
  return presence !== undefined && presence !== "missing";
}

/** The surfaces a field is checked on: those not allowlisted for it. */
const checked = (field: FieldCoverage, surfaces: readonly CardSurface[]) =>
  surfaces.filter((surface) => field.surfaces[surface] !== "hidden");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const pack = await loadPack(args.pack);
  const byId = contentEntitiesById(pack.entities);
  const content = { entities: pack.entities, byId };
  const stats = new Map<string, Map<string, FieldStats>>();
  const recordCounts = new Map<string, number>();
  const surfaceCounts = new Map<string, Record<string, number>>();
  const failures: string[] = [];
  const entities = pack.entities.filter((entity) => {
    const type = entity.type.trim().toLocaleLowerCase();
    return (
      CARD_TYPES.has(type) &&
      (args.types === undefined || args.types.includes(type))
    );
  });
  let done = 0;
  for (const entity of entities) {
    done += 1;
    if (done % 2000 === 0)
      process.stderr.write(`${done}/${entities.length} records…\n`);
    const type = entity.type.trim();
    let coverage: FieldCoverage[];
    let surfaces: CardSurface[];
    try {
      const texts = cardSurfaceTexts(entity, content);
      surfaces = CARD_SURFACES.filter((surface) => texts[surface]);
      coverage = cardFieldCoverage(entity, texts, content);
    } catch (error) {
      failures.push(
        `${entity.id} (${entity.name}): ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    recordCounts.set(type, (recordCounts.get(type) ?? 0) + 1);
    const surfaceKey = surfaces.join("+");
    const counts = surfaceCounts.get(type) ?? {};
    counts[surfaceKey] = (counts[surfaceKey] ?? 0) + 1;
    surfaceCounts.set(type, counts);
    const byField = stats.get(type) ?? new Map<string, FieldStats>();
    stats.set(type, byField);
    for (const field of coverage) {
      const name = field.kind === "specific" ? field.name : `(${field.kind})`;
      let entry = byField.get(name);
      if (entry === undefined) {
        entry = {
          withContent: 0,
          internal: 0,
          allowlisted: 0,
          nowhere: 0,
          partial: 0,
          presence: {},
          partialSurfaces: {},
          nowhereExamples: [],
          partialExamples: [],
          reworded: [],
        };
        byField.set(name, entry);
      }
      entry.withContent += 1;
      if (field.internal) {
        entry.internal += 1;
        continue;
      }
      const fieldSurfaces = checked(field, surfaces);
      if (fieldSurfaces.length === 0) {
        entry.allowlisted += 1;
        continue;
      }
      for (const surface of fieldSurfaces) {
        const presence = field.surfaces[surface] ?? "missing";
        entry.presence[presence] = (entry.presence[presence] ?? 0) + 1;
      }
      const example = (extra?: string): Example => ({
        id: entity.id,
        name: entity.name,
        value: snippet(field.value),
        ...(extra === undefined ? {} : { surfaces: extra }),
      });
      if (
        fieldSurfaces.some(
          (surface) => field.surfaces[surface] === "reworded",
        ) &&
        entry.reworded.length < args.examples
      )
        entry.reworded.push(
          example(
            fieldSurfaces
              .filter((surface) => field.surfaces[surface] === "reworded")
              .join(", "),
          ),
        );
      const shownOn = fieldSurfaces.filter((surface) => shown(field, surface));
      if (shownOn.length === 0) {
        entry.nowhere += 1;
        if (entry.nowhereExamples.length < args.examples)
          entry.nowhereExamples.push(example());
      } else if (shownOn.length < fieldSurfaces.length) {
        entry.partial += 1;
        const missing = fieldSurfaces.filter(
          (surface) => !shown(field, surface),
        );
        const missingKey = `missing on ${missing.join("+")}`;
        entry.partialSurfaces[missingKey] =
          (entry.partialSurfaces[missingKey] ?? 0) + 1;
        if (entry.partialExamples.length < args.examples)
          entry.partialExamples.push(example(missingKey));
      }
    }
  }

  const lines: string[] = [
    "# Card field coverage",
    "",
    `Pack: \`${args.pack}\` · ${entities.length} records · ${((Date.now() - started) / 1000).toFixed(0)} s`,
    "",
    "Surfaces: **print** (printed PowerCard/ItemCard/FamiliarCard), **panel** (builder CandidateDetailCard), **reference** (printed reference entry). Presence: verbatim, normalized (case/punctuation, or an ID list shown by name), reworded (≥85% of its words), icon (only an aria-label/title), missing.",
    "",
    "## Summary",
    "",
    "| Type | Records | Surfaces | Fields with content | Dropped everywhere | Dropped on some surfaces |",
    "|---|---:|---|---:|---:|---:|",
  ];
  const types = [...stats.keys()].sort(
    (left, right) =>
      (recordCounts.get(right) ?? 0) - (recordCounts.get(left) ?? 0),
  );
  const summary: Record<string, unknown> = {};
  for (const type of types) {
    const byField = stats.get(type)!;
    const userFacing = [...byField.values()];
    const total = (pick: (entry: FieldStats) => number) =>
      userFacing.reduce((sum, entry) => sum + pick(entry), 0);
    const surfaces = Object.entries(surfaceCounts.get(type) ?? {})
      .map(([key, count]) => `${key} (${count})`)
      .join(", ");
    const row = {
      records: recordCounts.get(type) ?? 0,
      fields: total(
        (entry) => entry.withContent - entry.internal - entry.allowlisted,
      ),
      nowhere: total((entry) => entry.nowhere),
      partial: total((entry) => entry.partial),
    };
    summary[type] = row;
    lines.push(
      `| ${type} | ${row.records} | ${surfaces} | ${row.fields} | ${row.nowhere} | ${row.partial} |`,
    );
  }
  for (const type of types) {
    const byField = stats.get(type)!;
    const fields = [...byField.entries()].sort(
      (left, right) =>
        right[1].nowhere +
        right[1].partial -
        (left[1].nowhere + left[1].partial),
    );
    lines.push(
      "",
      `## ${type}`,
      "",
      "| Field | With content | Internal | Allowlisted | Dropped everywhere | Dropped on some | Presence |",
      "|---|---:|---:|---:|---:|---:|---|",
    );
    for (const [name, entry] of fields)
      lines.push(
        `| ${cell(JSON.stringify(name))} | ${entry.withContent} | ${entry.internal} | ${entry.allowlisted} | ${entry.nowhere} | ${entry.partial} | ${Object.entries(
          entry.presence,
        )
          .map(([presence, count]) => `${presence} ${count}`)
          .join(", ")} |`,
      );
    for (const [name, entry] of fields) {
      if (
        entry.nowhere === 0 &&
        entry.partial === 0 &&
        entry.reworded.length === 0
      )
        continue;
      lines.push("", `### ${type} · ${JSON.stringify(name)}`, "");
      if (entry.nowhere > 0) {
        lines.push(`Dropped everywhere (${entry.nowhere}):`, "");
        for (const example of entry.nowhereExamples)
          lines.push(
            `- ${example.name} (\`${example.id}\`): ${cell(example.value)}`,
          );
        lines.push("");
      }
      if (entry.partial > 0) {
        lines.push(
          `Dropped on some surfaces (${entry.partial}: ${Object.entries(
            entry.partialSurfaces,
          )
            .map(([key, count]) => `${key} ${count}`)
            .join(", ")}):`,
          "",
        );
        for (const example of entry.partialExamples)
          lines.push(
            `- ${example.name} (\`${example.id}\`, ${example.surfaces}): ${cell(example.value)}`,
          );
        lines.push("");
      }
      if (entry.reworded.length > 0) {
        lines.push("Reworded (check these merges):", "");
        for (const example of entry.reworded)
          lines.push(
            `- ${example.name} (\`${example.id}\`, ${example.surfaces}): ${cell(example.value)}`,
          );
      }
    }
  }
  const ruleLine = (rule: CardFieldRule) =>
    `- ${rule.types === undefined ? "any type" : rule.types.join(", ")} · ${rule.fields.map((field) => JSON.stringify(field)).join(", ")}${rule.surfaces === undefined ? "" : ` (on ${rule.surfaces.join(", ")})`}${rule.values === undefined ? "" : ` matching \`${String(rule.values)}\``}${rule.records === undefined ? "" : " (some records)"}: ${rule.reason}`;
  lines.push(
    "",
    "## Deliberate merges (shown in another form)",
    "",
    ...CARD_FIELD_MERGES.map(ruleLine),
    "",
    "## Allowlisted (deliberately hidden; OPEN = a layout question for the owner)",
    "",
    ...CARD_FIELD_ALLOWLIST.map(ruleLine),
  );
  if (failures.length > 0) {
    lines.push("", `## Render failures (${failures.length})`, "");
    for (const failure of failures.slice(0, 50)) lines.push(`- ${failure}`);
  }
  const outDir = resolve("tmp/audit");
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "card-fields.md"), `${lines.join("\n")}\n`);
  if (args.json)
    await writeFile(
      resolve(outDir, "card-fields.json"),
      `${JSON.stringify(
        {
          summary,
          fields: Object.fromEntries(
            types.map((type) => [
              type,
              Object.fromEntries(stats.get(type)!.entries()),
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    );
  console.log(
    `${entities.length} records, ${failures.length} render failures; wrote tmp/audit/card-fields.md`,
  );
  console.table(summary);
}

await main();
