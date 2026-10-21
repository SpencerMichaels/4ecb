/**
 * Private coverage audit (docs/coverage-audit-proposal.md, steps 1 and 2):
 * classifies every content type in an exact pack against the checked-in
 * registry, and lists the reference fields that point from one entity to
 * another. It also lists every grant or select target the pack lacks (a
 * dangling ID does nothing in legacy or here), outside a reviewed allowlist.
 * Writes JSON and Markdown reports; the pack and reports stay ignored.
 *
 *   pnpm audit:coverage [PACK.4ecp] [--out=DIR]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import type { ContentEntity } from "@4ecb/content-domain";
import { decodeContentPack } from "@4ecb/content-pack";
import {
  RulesIndex,
  parseRules,
  type EvaluatedChoice,
} from "@4ecb/rules-engine";
import {
  SHEET_FEATURE_TYPES,
  SHEET_IDENTITY_TYPES,
  isFamiliarEntity,
} from "@4ecb/sheet-model";

import { legacyChoiceSection } from "../apps/web/src/builder-ui";
import { candidateReferenceIndex } from "../apps/web/src/CandidateSelectionTable";
import { detailStackEntries } from "../apps/web/src/detail-stack";
import {
  CONTENT_TYPE_COVERAGE,
  FOLLOWED_REFERENCE_FIELDS,
  PLUMBING_REFERENCE_FIELDS,
  type ContentTypeCoverage,
} from "../apps/web/src/content-type-coverage";
import { isItemEntity } from "../apps/web/src/EntityCard";
import { structuredEntityKind } from "../apps/web/src/StructuredEntityBody";

const decompress = promisify(gunzip);
const key = (value: string) => value.trim().toLocaleLowerCase();

interface TypeRow {
  readonly type: string;
  readonly entities: number;
  readonly selectRules: number;
  readonly grantRules: number;
  readonly coverage: ContentTypeCoverage | undefined;
  readonly detail: string;
  readonly builderSection: string | undefined;
  readonly problems: readonly string[];
}

interface ReferenceRow {
  readonly ownerType: string;
  readonly field: string;
  readonly targetTypes: Readonly<Record<string, number>>;
  readonly entities: number;
  readonly references: number;
  readonly examples: readonly string[];
  /** Share of the references the detail stack shows as cards. */
  readonly inStack: number;
  readonly followed: string | undefined;
  readonly plumbing: string | undefined;
}

function detailRenderer(entity: ContentEntity): string {
  if (key(entity.type) === "power") return "power card";
  if (isItemEntity(entity)) return "item card";
  if (isFamiliarEntity(entity)) return "familiar card";
  const structured = structuredEntityKind(entity);
  return structured === undefined ? "generic" : `structured (${structured})`;
}

/** Problems a registry entry has that code can show directly. */
function registryProblems(
  type: string,
  sample: ContentEntity,
  coverage: ContentTypeCoverage | undefined,
  selectRules: number,
): string[] {
  if (coverage === undefined) return ["not in the registry"];
  const problems: string[] = [];
  const identityTypes = new Set<string>(
    SHEET_IDENTITY_TYPES.map(([identityType]) => identityType),
  );
  if (coverage.kind === "presented")
    for (const surface of coverage.surfaces) {
      const listed =
        surface === "features"
          ? SHEET_FEATURE_TYPES.includes(type)
          : surface === "identity"
            ? // A hybrid's classes fill the Class identity line.
              identityTypes.has(type) || type === "Hybrid Class"
            : surface === "powers"
              ? key(type) === "power"
              : surface === "companions"
                ? isFamiliarEntity(sample)
                : surface === "items"
                  ? isItemEntity(sample)
                  : true;
      if (!listed) problems.push(`registry claims ${surface}; code disagrees`);
    }
  else if (SHEET_FEATURE_TYPES.includes(type))
    problems.push(`registry says ${coverage.kind}, but the sheet lists it`);
  if (coverage.kind === "internal" && selectRules > 0)
    problems.push("registry says internal, but a choice selects it");
  return problems;
}

/**
 * Grant or select targets known to be missing, with the reason each stays.
 * Anything else missing fails the audit, so new dangling IDs are caught.
 */
const MISSING_TARGET_ALLOWLIST: Readonly<Record<string, string>> = {
  "[Dilettante]":
    "Adept Dilettante's placeholder for the Dilettante power's class; legacy FindDilettante, unported (legacy-special-cases.ts).",
  ID_TIV_COMPANION_INVISIBLE_STALKER:
    "Summon Invisible Stalker's community summon card was never authored; adding it would copy the published stat block.",
  ID_PGF_CLASS_FEATURE_ENTANGLINGFLAIL:
    "Power Strike Specialization lists specializations from a part that is not supplied; the six supplied ones are offered.",
  ID_PGF_CLASS_FEATURE_PIERCINGSPEAR:
    "Power Strike Specialization lists specializations from a part that is not supplied.",
  ID_PGF_CLASS_FEATURE_RUPTURINGPICK:
    "Power Strike Specialization lists specializations from a part that is not supplied.",
  ID_PGF_CLASS_FEATURE_SMASHINGHAMMER:
    "Power Strike Specialization lists specializations from a part that is not supplied.",
  ID_PGF_POWER_WHIRLINGFLAIL:
    "Power Strike Specialization lists specializations from a part that is not supplied.",
};

interface MissingTarget {
  readonly target: string;
  /** "case-only": the ID matches a record only ignoring case. */
  readonly rule: "grant" | "select" | "case-only";
  readonly providers: readonly string[];
  readonly allowed: string | undefined;
}

/**
 * Grant targets the engine cannot resolve (by ID, else by name and type, as
 * RulesIndex.find does) and ID tokens in select categories that no entity's
 * ID, name or Category carries.
 */
function missingTargets(entities: readonly ContentEntity[]): MissingTarget[] {
  const index = new RulesIndex(entities);
  const categoryValues = new Set(
    entities.flatMap((entity) => [...index.categoryValues(entity)]),
  );
  const missing = new Map<
    string,
    { rule: MissingTarget["rule"]; providers: Set<string> }
  >();
  const note = (target: string, rule: MissingTarget["rule"], owner: string) => {
    const row = missing.get(`${rule}\0${target}`) ?? {
      rule,
      providers: new Set<string>(),
    };
    row.providers.add(owner);
    missing.set(`${rule}\0${target}`, row);
  };
  for (const entity of entities)
    for (const rule of parseRules(entity.id, entity.rules)) {
      if (rule.kind === "grant") {
        const target = index.find(rule.name, rule.type);
        if (target === undefined) note(rule.name.trim(), "grant", entity.id);
        // Lookups ignore case, so a case-only match resolves here; legacy
        // may differ, and the match can be the wrong record (horse-6).
        else if (
          key(target.id) === key(rule.name) &&
          target.id !== rule.name.trim()
        )
          note(rule.name.trim(), "case-only", entity.id);
      } else if (rule.kind === "select" && rule.category !== undefined) {
        for (const token of rule.category.split(/[|,]/)) {
          const value = token.trim().replace(/^!/, "");
          if (/^ID_/i.test(value) && !categoryValues.has(key(value)))
            note(value, "select", entity.id);
        }
      }
    }
  return [...missing]
    .map(([rowKey, row]) => {
      const target = rowKey.slice(rowKey.indexOf("\0") + 1);
      return {
        target,
        rule: row.rule,
        providers: [...row.providers].sort(),
        allowed: MISSING_TARGET_ALLOWLIST[target],
      };
    })
    .sort((left, right) => left.target.localeCompare(right.target));
}

function idTokens(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => /^ID_[A-Z0-9_()\-']+$/i.test(token));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const packPath = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? "tmp/content/full-local.4ecp",
  );
  const outDir = resolve(
    args.find((arg) => arg.startsWith("--out="))?.slice(6) ??
      "tmp/coverage-audit",
  );
  const encoded = await readFile(packPath);
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const entities = pack.entities;
  const byId = new Map(entities.map((entity) => [key(entity.id), entity]));

  // Step 1: type registry.
  const types = new Map<string, ContentEntity[]>();
  for (const entity of entities) {
    const type = entity.type.trim();
    types.set(type, [...(types.get(type) ?? []), entity]);
  }
  const selects = new Map<string, number>();
  const grants = new Map<string, number>();
  for (const entity of entities)
    for (const rule of parseRules(entity.id, entity.rules)) {
      if (rule.kind === "select" && rule.type !== undefined)
        selects.set(rule.type.trim(), (selects.get(rule.type.trim()) ?? 0) + 1);
      if (rule.kind === "grant") {
        const target = byId.get(key(rule.name))?.type.trim() ?? rule.type;
        if (target !== undefined)
          grants.set(target.trim(), (grants.get(target.trim()) ?? 0) + 1);
      }
    }
  const typeRows: TypeRow[] = [...types]
    .sort(([, left], [, right]) => right.length - left.length)
    .map(([type, members]) => {
      const sample = members[0]!;
      const coverage = CONTENT_TYPE_COVERAGE[type];
      const selectRules = selects.get(type) ?? 0;
      const section =
        selectRules > 0
          ? legacyChoiceSection({ type } as EvaluatedChoice)
          : undefined;
      return {
        type,
        entities: members.length,
        selectRules,
        grantRules: grants.get(type) ?? 0,
        coverage,
        detail: detailRenderer(sample),
        builderSection: section,
        problems: registryProblems(type, sample, coverage, selectRules),
      };
    });
  const staleRegistry = Object.keys(CONTENT_TYPE_COVERAGE).filter(
    (type) => !types.has(type),
  );

  // Step 2: reference fields (ID-valued specific fields).
  const referenceIndex = candidateReferenceIndex(
    new Map(entities.map((entity) => [entity.id, entity])),
  );
  // What the detail pane's stack shows under the entity as its root.
  const stacks = new Map<string, ReadonlySet<string>>();
  const shownInStack = (entity: ContentEntity) => {
    let shown = stacks.get(entity.id);
    if (shown === undefined) {
      shown = new Set(
        detailStackEntries(entity, referenceIndex).map(
          ({ entity }) => entity.id,
        ),
      );
      stacks.set(entity.id, shown);
    }
    return shown;
  };
  const references = new Map<
    string,
    {
      ownerType: string;
      field: string;
      targetTypes: Map<string, number>;
      owners: Set<string>;
      references: number;
      inStack: number;
      examples: string[];
    }
  >();
  for (const entity of entities)
    for (const specific of entity.specifics) {
      const targets = idTokens(specific.value).flatMap((token) => {
        const target = byId.get(key(token));
        return target === undefined || target.id === entity.id ? [] : [target];
      });
      if (targets.length === 0) continue;
      const ownerType = entity.type.trim();
      const field = specific.name.trim();
      const rowKey = `${ownerType}\0${field}`;
      const row = references.get(rowKey) ?? {
        ownerType,
        field,
        targetTypes: new Map<string, number>(),
        owners: new Set<string>(),
        references: 0,
        inStack: 0,
        examples: [],
      };
      for (const target of targets) {
        const targetType = target.type.trim();
        row.targetTypes.set(
          targetType,
          (row.targetTypes.get(targetType) ?? 0) + 1,
        );
      }
      const shown = shownInStack(entity);
      row.owners.add(entity.id);
      row.references += targets.length;
      row.inStack += targets.filter((target) => shown.has(target.id)).length;
      if (row.examples.length < 3)
        row.examples.push(
          `${entity.name} → ${targets
            .slice(0, 2)
            .map((target) => target.name)
            .join(", ")}`,
        );
      references.set(rowKey, row);
    }
  const referenceRows: ReferenceRow[] = [...references.values()]
    .map((row) => ({
      ownerType: row.ownerType,
      field: row.field,
      targetTypes: Object.fromEntries(
        [...row.targetTypes].sort(([, a], [, b]) => b - a),
      ),
      entities: row.owners.size,
      references: row.references,
      examples: row.examples,
      inStack: row.references === 0 ? 0 : row.inStack / row.references,
      followed: FOLLOWED_REFERENCE_FIELDS[`${row.ownerType}.${row.field}`],
      plumbing:
        PLUMBING_REFERENCE_FIELDS[`${row.ownerType}.${row.field}`] ??
        PLUMBING_REFERENCE_FIELDS[`*.${row.field}`],
    }))
    .sort((left, right) => right.entities - left.entities);

  const missing = missingTargets(entities);
  const unexpectedMissing = missing.filter(
    (row) => row.rule !== "case-only" && row.allowed === undefined,
  );

  await mkdir(outDir, { recursive: true });
  const report = {
    pack: {
      path: packPath,
      id: pack.manifest.packId,
      digest: pack.manifest.contentDigest,
    },
    types: typeRows,
    staleRegistry,
    references: referenceRows,
    missingTargets: missing,
  };
  await writeFile(
    resolve(outDir, "coverage.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const unshown = referenceRows.filter(
    (row) =>
      row.followed === undefined &&
      row.plumbing === undefined &&
      row.inStack < 0.95,
  );
  const cell = (value: string | number | undefined) =>
    String(value ?? "").replaceAll("|", "\\|");
  const lines = [
    "# Coverage audit",
    "",
    `Pack: ${packPath}`,
    "",
    "## Registry problems",
    "",
    ...typeRows
      .filter((row) => row.problems.length > 0)
      .map(
        (row) =>
          `- **${row.type}** (${row.entities}): ${row.problems.join("; ")}`,
      ),
    ...staleRegistry.map(
      (type) => `- **${type}**: in the registry, not in the pack`,
    ),
    "",
    "## Missing grant and select targets",
    "",
    "| Target | Rule | Providers | Allowlisted because |",
    "| --- | --- | --- | --- |",
    ...missing.map(
      (row) =>
        `| ${cell(row.target)} | ${row.rule} | ${cell(row.providers.slice(0, 3).join(", "))}${row.providers.length > 3 ? ` (+${row.providers.length - 3})` : ""} | ${cell(row.allowed ?? (row.rule === "case-only" ? "resolves ignoring case; check it is the intended record" : "**not allowlisted**"))} |`,
    ),
    "",
    "## Gaps (registry), by how often a character can get them",
    "",
    "| Type | Entities | Selected by | Granted by | Note |",
    "| --- | --- | --- | --- | --- |",
    ...typeRows
      .filter((row) => row.coverage?.kind === "gap")
      .sort(
        (a, b) => b.selectRules + b.grantRules - (a.selectRules + a.grantRules),
      )
      .map(
        (row) =>
          `| ${cell(row.type)} | ${row.entities} | ${row.selectRules} | ${row.grantRules} | ${cell(row.coverage?.kind === "gap" ? row.coverage.note : "")} |`,
      ),
    "",
    "## Choices placed in the builder's Other section",
    "",
    ...typeRows
      .filter((row) => row.builderSection === "Other")
      .map((row) => `- ${row.type} (${row.selectRules} select rules)`),
    "",
    "## All types",
    "",
    "| Type | Entities | Selects | Grants | Registry | Detail pane | Builder section |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...typeRows.map(
      (row) =>
        `| ${cell(row.type)} | ${row.entities} | ${row.selectRules} | ${row.grantRules} | ${row.coverage?.kind ?? "**missing**"} | ${row.detail} | ${row.builderSection ?? ""} |`,
    ),
    "",
    "## Reference fields not shown, by owning entities",
    "",
    "Not followed by the detail pane or sheet, not plumbing, and under 95% shown",
    "as cards in the detail stack.",
    "",
    "| Owner type | Field | Owners | Targets | Shown in stack | Example |",
    "| --- | --- | --- | --- | --- | --- |",
    ...unshown.map(
      (row) =>
        `| ${cell(row.ownerType)} | ${cell(row.field)} | ${row.entities} | ${cell(
          Object.entries(row.targetTypes)
            .map(([type, count]) => `${type} ${count}`)
            .join(", "),
        )} | ${Math.round(row.inStack * 100)}% | ${cell(row.examples[0])} |`,
    ),
    "",
    "## Reference fields shown",
    "",
    ...referenceRows
      .filter((row) => !unshown.includes(row) && row.plumbing === undefined)
      .map(
        (row) =>
          `- ${row.ownerType}.${row.field} (${row.entities}): ${
            row.followed ??
            `${Math.round(row.inStack * 100)}% as detail-stack cards`
          }`,
      ),
    "",
    "## Reference fields that are plumbing",
    "",
    ...referenceRows
      .filter((row) => row.plumbing !== undefined)
      .map(
        (row) =>
          `- ${row.ownerType}.${row.field} (${row.entities}): ${row.plumbing}`,
      ),
    "",
  ];
  await writeFile(resolve(outDir, "coverage.md"), lines.join("\n"));
  const problems = typeRows.filter((row) => row.problems.length > 0).length;
  console.log(
    `${typeRows.length} types, ${problems} with registry problems, ` +
      `${referenceRows.length} reference fields ` +
      `(${unshown.length} not shown), ` +
      `${unexpectedMissing.length} missing grant/select targets ` +
      `(${missing.filter((row) => row.allowed !== undefined).length} allowlisted, ` +
      `${missing.filter((row) => row.rule === "case-only").length} matching only ignoring case). ` +
      `Reports in ${outDir}.`,
  );
  if (problems > 0 || staleRegistry.length > 0 || unexpectedMissing.length > 0)
    process.exitCode = 1;
}

await main();
