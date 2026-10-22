/**
 * Private legacy special-case inventory (docs/coverage-audit-proposal.md,
 * section 5). Decodes every string literal in the decompiled legacy engine
 * and applications, classifies it against an exact content pack, groups the
 * content-targeting ones by the member that uses them, and checks each group
 * against the modern code and the corrections pack. Writes ignored JSON and
 * Markdown reports; the decompiled code, the pack and the reports stay private.
 *
 *   pnpm audit:legacy-special-cases [PACK.4ecp] [--out=DIR]
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

import { decodeContentPack } from "@4ecb/content-pack";

import {
  classifyLiteral,
  extractManagedLiterals,
  findMemberSpans,
  findNativeLiteralUses,
  findSmartAssemblyDecoder,
  findSmartAssemblyKey,
  isContentTargeting,
  memberAt,
  parseNativeLiteralDeclarations,
  readSmartAssemblyString,
  type ContentVocabulary,
  type LiteralClass,
  type LiteralClassification,
} from "../apps/content-tool/src/legacy-literals";
import {
  LEGACY_SPECIAL_CASES,
  type LegacySpecialCaseStatus,
} from "../apps/content-tool/src/legacy-special-cases";
import { LEGACY_IGNORED_CLAUSES } from "@4ecb/rules-engine";

import {
  LEGACY_BOON_TYPES,
  LEGACY_BOON_TYPE_WORDS,
} from "../apps/web/src/equipment-ui";

const decompress = promisify(gunzip);
const DECOMPILED = "reverse-engineering/generated/decompiled";
const ASSEMBLIES = [
  "D20RulesEngine",
  "RulesEngineCommon",
  "CharacterBuilder",
  "CharacterSheetViewer",
] as const;
const ENGINE_ASSEMBLIES: ReadonlySet<string> = new Set(["D20RulesEngine"]);
const MODERN_ROOTS = ["packages", "apps"];
const CORRECTIONS = "content/corrections";

interface LiteralUse {
  readonly assembly: string;
  readonly file: string;
  readonly line: number;
  readonly member: string | undefined;
  readonly native: boolean;
}

interface LiteralRow {
  readonly text: string;
  readonly classification: LiteralClassification;
  readonly uses: LiteralUse[];
}

interface ModernHit {
  readonly literal: string;
  readonly files: readonly string[];
}

interface SpecialCaseRow {
  readonly member: string;
  readonly assembly: string;
  readonly location: string;
  readonly targets: readonly {
    readonly text: string;
    readonly kind: LiteralClass;
    readonly matches: Readonly<Record<string, number>>;
  }[];
  readonly vocabulary: readonly string[];
  readonly entities: number;
  readonly modern: readonly ModernHit[];
  readonly autoStatus: LegacySpecialCaseStatus;
  readonly status: LegacySpecialCaseStatus;
  readonly description: string | undefined;
  readonly note: string | undefined;
  readonly reviewed: boolean;
}

async function walk(dir: string, extension: RegExp): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
      files.push(...(await walk(path, extension)));
    } else if (extension.test(entry.name)) files.push(path);
  }
  return files;
}

function increment<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function nested(
  map: Map<string, Map<string, number>>,
  key: string,
  inner: string,
): void {
  const entry = map.get(key) ?? new Map<string, number>();
  increment(entry, inner);
  map.set(key, entry);
}

async function loadVocabulary(packPath: string): Promise<{
  vocabulary: ContentVocabulary;
  entities: number;
}> {
  const encoded = await readFile(packPath);
  const bytes =
    encoded[0] === 0x1f && encoded[1] === 0x8b
      ? await decompress(encoded)
      : encoded;
  const pack = decodeContentPack(bytes.toString("utf8"));
  const ids = new Map<string, string>();
  const names = new Map<string, Map<string, number>>();
  const types = new Map<string, number>();
  const fieldNames = new Map<string, number>();
  const fieldValues = new Map<string, Map<string, number>>();
  const statNames = new Map<string, number>();
  const prose = new Map<string, string[]>();
  const addProse = (field: string, value: string | undefined) => {
    if (value === undefined || value.length < 24) return;
    const list = prose.get(field) ?? [];
    list.push(value.toLocaleLowerCase());
    prose.set(field, list);
  };
  for (const entity of pack.entities) {
    const type = entity.type.trim();
    ids.set(entity.id.trim().toLocaleLowerCase(), type);
    nested(names, entity.name.trim().toLocaleLowerCase(), type);
    increment(types, type.toLocaleLowerCase());
    for (const specific of entity.specifics) {
      const field = specific.name.trim();
      increment(fieldNames, field.toLocaleLowerCase());
      const value = specific.value.trim();
      if (value.length > 0 && value.length <= 80)
        nested(fieldValues, value.toLocaleLowerCase(), field);
      addProse(field, value);
    }
    addProse("Prerequisites", entity.prerequisites);
    addProse("Description", entity.description);
    for (const rule of entity.rules) {
      const name = rule.attributes.find(
        (attribute) => attribute.name.toLocaleLowerCase() === "name",
      )?.value;
      if (rule.name.toLocaleLowerCase() === "statadd" && name !== undefined)
        increment(statNames, name.trim().toLocaleLowerCase());
    }
  }
  const corpora = [...prose].map(
    ([field, values]) => [field, values.join("\u0001")] as const,
  );
  const proseMatches = (lowerText: string) => {
    const found = new Map<string, number>();
    for (const [field, corpus] of corpora) {
      let count = 0;
      for (
        let index = corpus.indexOf(lowerText);
        index >= 0 && count < 1000;
        index = corpus.indexOf(lowerText, index + lowerText.length)
      )
        count += 1;
      if (count > 0) found.set(field, count);
    }
    return found;
  };
  return {
    vocabulary: {
      ids,
      names,
      types,
      fieldNames,
      fieldValues,
      statNames,
      proseMatches,
    },
    entities: pack.entities.length,
  };
}

async function collectLiterals(): Promise<Map<string, LiteralUse[]>> {
  const uses = new Map<string, LiteralUse[]>();
  const add = (text: string, use: LiteralUse) => {
    const list = uses.get(text) ?? [];
    list.push(use);
    uses.set(text, list);
  };
  for (const assembly of ASSEMBLIES) {
    const root = join(DECOMPILED, assembly);
    const files = await walk(root, /\.cs$/);
    let native = new Map<string, string>();
    if (assembly === "D20RulesEngine") {
      const module = await readFile(join(root, "-Module-.cs"), "utf8");
      native = new Map(
        parseNativeLiteralDeclarations(module).map((declaration) => [
          declaration.field,
          declaration.text,
        ]),
      );
    }
    const nativeFields = new Set(native.keys());
    const sources = new Map<string, string>();
    for (const file of files) sources.set(file, await readFile(file, "utf8"));
    // SmartAssembly-encrypted managed strings (CharacterBuilder).
    let encrypted:
      | { pattern: RegExp; decode: (position: number) => string | undefined }
      | undefined;
    for (const source of sources.values()) {
      const decoder = findSmartAssemblyDecoder(source);
      if (decoder === undefined) continue;
      const resource = new Uint8Array(
        await readFile(join(root, `-${decoder.resource}-`)),
      );
      const escaped = decoder.call.replace(/\./g, "\\.");
      const pattern = new RegExp(`\\b${escaped}\\((\\d+)\\)`, "g");
      const positions = [...sources.values()].flatMap((text) =>
        [...text.matchAll(pattern)].map((match) => Number(match[1])),
      );
      const key = findSmartAssemblyKey(resource, positions);
      if (key === undefined)
        throw new Error(`${assembly}: no SmartAssembly key`);
      encrypted = {
        pattern,
        decode: (position) => readSmartAssemblyString(resource, position - key),
      };
      break;
    }
    for (const [file, source] of sources) {
      const spans = findMemberSpans(source);
      const relativeFile = relative(root, file);
      for (const literal of extractManagedLiterals(source))
        add(literal.text, {
          assembly,
          file: relativeFile,
          line: literal.line,
          member: memberAt(spans, literal.line)?.name,
          native: false,
        });
      if (encrypted !== undefined)
        source.split("\n").forEach((lineText, index) => {
          for (const match of lineText.matchAll(encrypted.pattern)) {
            const text = encrypted.decode(Number(match[1]));
            if (text === undefined) continue;
            add(text, {
              assembly,
              file: relativeFile,
              line: index + 1,
              member: memberAt(spans, index + 1)?.name,
              native: false,
            });
          }
        });
      if (nativeFields.size === 0) continue;
      for (const use of findNativeLiteralUses(source, nativeFields))
        add(native.get(use.text)!, {
          assembly,
          file: relativeFile,
          line: use.line,
          member: memberAt(spans, use.line)?.name,
          native: true,
        });
    }
  }
  return uses;
}

interface ModernFile {
  readonly path: string;
  readonly lower: string;
}

async function loadModern(): Promise<{
  code: ModernFile[];
  corrections: ModernFile[];
}> {
  const code: ModernFile[] = [];
  for (const root of MODERN_ROOTS)
    for (const path of await walk(root, /\.(?:ts|tsx)$/)) {
      if (/\.test\.tsx?$/.test(path)) continue;
      if (path.endsWith("legacy-special-cases.ts")) continue;
      code.push({
        path,
        lower: (await readFile(path, "utf8")).toLocaleLowerCase(),
      });
    }
  const corrections: ModernFile[] = [];
  for (const path of await walk(CORRECTIONS, /\.part$/))
    corrections.push({
      path,
      lower: (await readFile(path, "utf8")).toLocaleLowerCase(),
    });
  return { code, corrections };
}

function containsToken(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`).test(
    haystack,
  );
}

function autoStatus(hits: readonly ModernHit[]): LegacySpecialCaseStatus {
  const files = hits.flatMap((hit) => hit.files);
  if (hits.length === 0 || files.length === 0) return "not-handled";
  if (files.some((file) => file.startsWith(CORRECTIONS))) return "declarative";
  if (files.some((file) => file.endsWith("exceptions.ts"))) return "code";
  return "code";
}

/**
 * `--show=A,B` prints decompiled members named (or ending with) `A` or
 * `B`, with literal references replaced by their decoded text, for review.
 */
async function show(list: string): Promise<void> {
  const names = list.split(",").map((name) => name.trim());
  const wanted = (member: string) =>
    names.some((name) => member === name || member.endsWith(`.${name}`));
  for (const assembly of ASSEMBLIES) {
    const root = join(DECOMPILED, assembly);
    const files = await walk(root, /\.cs$/);
    const native =
      assembly === "D20RulesEngine"
        ? new Map(
            parseNativeLiteralDeclarations(
              await readFile(join(root, "-Module-.cs"), "utf8"),
            ).map((declaration) => [declaration.field, declaration.text]),
          )
        : new Map<string, string>();
    const sources = new Map<string, string>();
    for (const file of files) sources.set(file, await readFile(file, "utf8"));
    let encrypted: ((line: string) => string) | undefined;
    for (const source of sources.values()) {
      const decoder = findSmartAssemblyDecoder(source);
      if (decoder === undefined) continue;
      const resource = new Uint8Array(
        await readFile(join(root, `-${decoder.resource}-`)),
      );
      const pattern = new RegExp(
        `\\b${decoder.call.replace(/\./g, "\\.")}\\((\\d+)\\)`,
        "g",
      );
      const positions = [...sources.values()].flatMap((text) =>
        [...text.matchAll(pattern)].map((match) => Number(match[1])),
      );
      const key = findSmartAssemblyKey(resource, positions)!;
      encrypted = (line) =>
        line.replace(pattern, (whole, position: string) => {
          const text = readSmartAssemblyString(
            resource,
            Number(position) - key,
          );
          return text === undefined ? whole : JSON.stringify(text);
        });
      break;
    }
    for (const [file, source] of sources) {
      const lines = source.split("\n");
      for (const span of findMemberSpans(source)) {
        if (!wanted(span.name)) continue;
        console.log(
          `// ${assembly}/${relative(root, file)}:${span.startLine} ${span.name}`,
        );
        for (const line of lines.slice(span.startLine - 1, span.endLine)) {
          let text = line
            .replace(
              /\((?:char|sbyte)\*\)Unsafe\.AsPointer\(ref (?:global::_003CModule_003E\.)?(\w+)\)/g,
              (whole, field: string) =>
                native.has(field) ? JSON.stringify(native.get(field)) : whole,
            )
            .replace(/global::_003CModule_003E\./g, "")
            .replace(/D20RulesEngine_002E/g, "")
            .replace(/_002E/g, ".");
          if (encrypted !== undefined) text = encrypted(text);
          console.log(text);
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const showName = args.find((arg) => arg.startsWith("--show="))?.slice(7);
  if (showName !== undefined) return show(showName);
  const packPath = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? "tmp/content/full-local.4ecp",
  );
  const outDir = resolve(
    args.find((arg) => arg.startsWith("--out="))?.slice(6) ??
      "tmp/legacy-special-cases",
  );
  const [{ vocabulary, entities }, uses, modern] = await Promise.all([
    loadVocabulary(packPath),
    collectLiterals(),
    loadModern(),
  ]);

  const literals: LiteralRow[] = [...uses].map(([text, list]) => ({
    text,
    classification: classifyLiteral(text, vocabulary),
    uses: list,
  }));
  const byKind = new Map<LiteralClass, number>();
  for (const row of literals) increment(byKind, row.classification.kind);
  const nativeLiterals = literals.filter((row) =>
    row.uses.some((use) => use.native),
  ).length;

  // Group content-targeting literals by the member that uses them.
  const members = new Map<
    string,
    {
      assembly: string;
      location: string;
      targets: Map<string, LiteralRow>;
      vocabulary: Set<string>;
    }
  >();
  for (const row of literals) {
    if (row.classification.kind === "ui-text") continue;
    for (const use of row.uses) {
      const member = `${use.assembly}:${use.member ?? use.file}`;
      const entry = members.get(member) ?? {
        assembly: use.assembly,
        location: `${use.file}:${use.line}`,
        targets: new Map<string, LiteralRow>(),
        vocabulary: new Set<string>(),
      };
      // Application UI matches headings in authored prose; only the
      // engine's prose matches are parser special cases.
      if (
        isContentTargeting(row.text, row.classification, {
          prose: ENGINE_ASSEMBLIES.has(use.assembly),
        })
      )
        entry.targets.set(row.text, row);
      else entry.vocabulary.add(row.text);
      members.set(member, entry);
    }
  }

  const modernHits = (text: string): ModernHit => {
    const lower = text.trim().toLocaleLowerCase();
    return {
      literal: text,
      files: [...modern.corrections, ...modern.code]
        .filter((file) => containsToken(file.lower, lower))
        .map((file) => file.path),
    };
  };

  const specialCases: SpecialCaseRow[] = [...members]
    // A reviewed member that uses only engine vocabulary (GiveFreebees's
    // "FREEBEE:" stat) is still a special case.
    .filter(
      ([key, entry]) =>
        entry.targets.size > 0 ||
        LEGACY_SPECIAL_CASES[key.slice(key.indexOf(":") + 1)] !== undefined,
    )
    .map(([key, entry]) => {
      const member = key.slice(key.indexOf(":") + 1);
      const annotation = LEGACY_SPECIAL_CASES[member];
      const targets = [...entry.targets.values()].map((row) => ({
        text: row.text,
        kind: row.classification.kind,
        matches: row.classification.matches,
      }));
      const hits = targets.map((target) => modernHits(target.text));
      const automatic = autoStatus(hits);
      const entityCount = targets.reduce(
        (sum, target) =>
          sum +
          Object.entries(target.matches)
            .filter(([match]) => !["type", "field", "stat"].includes(match))
            .reduce((inner, [, count]) => inner + count, 0),
        0,
      );
      return {
        member,
        assembly: entry.assembly,
        location: entry.location,
        targets,
        vocabulary: [...entry.vocabulary].sort(),
        entities: entityCount,
        modern: hits.filter((hit) => hit.files.length > 0),
        autoStatus: automatic,
        status: annotation?.status ?? automatic,
        description: annotation?.description,
        note: annotation?.note,
        reviewed: annotation !== undefined,
      };
    })
    .sort(
      (left, right) =>
        statusRank(left.status) - statusRank(right.status) ||
        right.entities - left.entities ||
        left.member.localeCompare(right.member),
    );

  const unreviewed = Object.keys(LEGACY_SPECIAL_CASES).filter(
    (member) => !specialCases.some((row) => row.member === member),
  );

  // Hand-list drift checks.
  const driftChecks = [
    listDrift(
      literals,
      "D20Workspace.RulesElementIsBoon",
      ["Magic Item Type"],
      [...LEGACY_BOON_TYPE_WORDS, ...LEGACY_BOON_TYPES],
      "apps/web/src/equipment-ui.ts LEGACY_BOON_*",
    ),
    listDrift(
      literals,
      "Ignore",
      [],
      LEGACY_IGNORED_CLAUSES,
      "rules-engine prerequisites.ts LEGACY_IGNORED_CLAUSES",
    ),
  ];

  const byStatus = new Map<LegacySpecialCaseStatus, number>();
  for (const row of specialCases) increment(byStatus, row.status);

  await mkdir(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    pack: packPath,
    packEntities: entities,
    literals: {
      distinct: literals.length,
      native: nativeLiterals,
      uses: literals.reduce((sum, row) => sum + row.uses.length, 0),
      byKind: Object.fromEntries(byKind),
    },
    specialCases: {
      total: specialCases.length,
      reviewed: specialCases.filter((row) => row.reviewed).length,
      byStatus: Object.fromEntries(byStatus),
    },
    driftChecks,
    staleAnnotations: unreviewed,
    cases: specialCases,
    inventory: literals
      .filter((row) => row.classification.kind !== "ui-text")
      .map((row) => ({
        text: row.text,
        kind: row.classification.kind,
        matches: row.classification.matches,
        uses: row.uses.map(
          (use) =>
            `${use.assembly}/${use.file}:${use.line}${use.member === undefined ? "" : ` ${use.member}`}`,
        ),
      })),
  };
  await writeFile(
    join(outDir, "legacy-special-cases.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    join(outDir, "legacy-special-cases.md"),
    markdown(report, specialCases),
  );
  console.log(
    `${literals.length} distinct literals (${nativeLiterals} native); ` +
      `${specialCases.length} special cases: ${[...byStatus]
        .map(([status, count]) => `${count} ${status}`)
        .join(", ")}; drift checks: ${driftChecks
        .map((check) => (check.ok ? "ok" : `DRIFT ${check.check}`))
        .join(", ")}`,
  );
  console.log(
    `Wrote ${relative(process.cwd(), outDir)}/legacy-special-cases.{json,md}`,
  );
  if (unreviewed.length > 0)
    console.log(
      `Annotations without a matching case: ${unreviewed.join(", ")}`,
    );
  const pending = specialCases.filter((row) => !row.reviewed);
  if (pending.length > 0)
    console.log(
      `Unreviewed cases: ${pending.map((row) => row.member).join(", ")}`,
    );
  if (driftChecks.some((check) => !check.ok)) process.exitCode = 1;
}

const STATUS_ORDER: readonly LegacySpecialCaseStatus[] = [
  "not-handled",
  "drift-risk",
  "code",
  "declarative",
  "out-of-scope",
  "generic",
];

function statusRank(status: LegacySpecialCaseStatus): number {
  return STATUS_ORDER.indexOf(status);
}

interface DriftCheck {
  readonly check: string;
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
}

/**
 * Compares the literals a legacy member uses (minus field names it reads)
 * with a modern hand-maintained list that mirrors it, case-insensitively.
 */
function listDrift(
  literals: readonly LiteralRow[],
  member: string,
  ignore: readonly string[],
  modern: Iterable<string>,
  label: string,
): DriftCheck {
  const fold = (text: string) => text.trim().toLocaleLowerCase();
  const legacy = new Set(
    literals
      .filter((row) => row.uses.some((use) => use.member === member))
      .map((row) => fold(row.text))
      .filter((text) => !ignore.map(fold).includes(text)),
  );
  const mirrored = new Set([...modern].map(fold));
  const missing = [...legacy].filter((text) => !mirrored.has(text));
  const extra = [...mirrored].filter((text) => !legacy.has(text));
  return {
    check: `${member} vs ${label}`,
    ok: legacy.size > 0 && missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ");
}

function markdown(
  report: {
    pack: string;
    literals: {
      distinct: number;
      native: number;
      byKind: Record<string, number>;
    };
    specialCases: {
      total: number;
      reviewed: number;
      byStatus: Record<string, number>;
    };
    driftChecks: readonly DriftCheck[];
    staleAnnotations: string[];
  },
  cases: readonly SpecialCaseRow[],
): string {
  const targetSummary = (row: SpecialCaseRow) =>
    row.targets
      .slice(0, 6)
      .map((target) => {
        const first = Object.keys(target.matches)[0];
        return `\`${cell(target.text.slice(0, 48))}\`${first === undefined ? "" : ` (${first})`}`;
      })
      .join(", ") +
    (row.targets.length > 6 ? `, +${row.targets.length - 6}` : "");
  const lines = [
    "# Legacy special-case inventory",
    "",
    `Pack: \`${report.pack}\``,
    "",
    `- ${report.literals.distinct} distinct literals (${report.literals.native} native).`,
    `- By class: ${Object.entries(report.literals.byKind)
      .sort((left, right) => right[1] - left[1])
      .map(([kind, count]) => `${kind} ${count}`)
      .join(", ")}.`,
    `- ${report.specialCases.total} special cases (members using content-targeting literals), ${report.specialCases.reviewed} reviewed.`,
    `- By status: ${Object.entries(report.specialCases.byStatus)
      .map(([status, count]) => `${status} ${count}`)
      .join(", ")}.`,
    "",
    "## Drift checks",
    "",
    ...report.driftChecks.map(
      (check) =>
        `- ${check.ok ? "OK" : "**DRIFT**"} ${check.check}${
          check.missing.length > 0
            ? `; missing: ${check.missing.join(", ")}`
            : ""
        }${check.extra.length > 0 ? `; extra: ${check.extra.join(", ")}` : ""}`,
    ),
    ...(report.staleAnnotations.length > 0
      ? [
          "",
          `Annotations without a case: ${report.staleAnnotations.join(", ")}`,
        ]
      : []),
    "",
  ];
  for (const status of STATUS_ORDER) {
    const rows = cases.filter((row) => row.status === status);
    if (rows.length === 0) continue;
    lines.push(
      `## ${status} (${rows.length})`,
      "",
      "| Member | Content hits | Targets | What it does | Modern |",
      "| --- | ---: | --- | --- | --- |",
      ...rows.map(
        (row) =>
          `| ${cell(row.member)}${row.reviewed ? "" : " (unreviewed)"} | ${row.entities} | ${targetSummary(row)} | ${cell(row.description ?? "")} | ${cell(
            row.note ??
              [...new Set(row.modern.flatMap((hit) => hit.files))]
                .slice(0, 3)
                .join(", "),
          )} |`,
      ),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

await main();
