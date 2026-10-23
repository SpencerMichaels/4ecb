/**
 * Private legacy special-case inventory (docs/coverage-audit-proposal.md,
 * section 5). Decodes every string literal in the decompiled legacy engine
 * and applications, classifies it against an exact content pack, groups the
 * content-targeting ones by the member that uses them, and checks each group
 * against the modern code and the corrections pack. Engine members keyed on
 * field-name literals (ShouldExecute's "Item Slot"/"_AlwaysExecute") are cases
 * too. A claimed status needs evidence (a public test or a private fixture
 * character); claims without it are reported as unverified, and the impact
 * columns count matching pack records and private sample characters. Writes
 * ignored JSON and Markdown reports; the decompiled code, the pack, the sample
 * characters and the reports stay private.
 *
 *   pnpm audit:legacy-special-cases [PACK.4ecp] [--out=DIR]
 */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  isBehaviorField,
  isContentTargeting,
  isFieldAccessor,
  isSerializationMember,
  memberAt,
  parseNativeLiteralDeclarations,
  readSmartAssemblyString,
  type ContentVocabulary,
  type LiteralClass,
  type LiteralClassification,
} from "../apps/content-tool/src/legacy-literals";
import {
  GAP_WORDING,
  LEGACY_SPECIAL_CASES,
  parseEvidence,
  verificationOf,
  type LegacySpecialCaseStatus,
  type LegacySpecialCaseVerification,
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
/** Assemblies where every field-name literal can key behavior. */
const FIELD_ENGINE_ASSEMBLIES: ReadonlySet<string> = new Set([
  "D20RulesEngine",
  "RulesEngineCommon",
]);
const MODERN_ROOTS = ["packages", "apps"];
const CORRECTIONS = "content/corrections";
/**
 * Fields filled in more records than this are general vocabulary (Keywords,
 * Power Usage); the impact columns count only rarer, hook-like fields.
 */
const RARE_FIELD_LIMIT = 1500;
/** Private characters the impact column counts (both ignored by git). */
const SAMPLE_CHARACTER_DIRS = [
  "sample-chars",
  "CharacterBuilder/SampleChars/SampleHeroes",
];

type Entity = ReturnType<typeof decodeContentPack>["entities"][number];
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
  /** Field-name literals that key engine behavior (ShouldExecute's "Item Slot"). */
  readonly fields: readonly string[];
  /** How the member became a case: content literals, field literals or both. */
  readonly source: "content" | "field" | "content+field" | "annotation";
  readonly entities: number;
  /** Private sample characters owning a record the case targets. */
  readonly characters: readonly string[];
  readonly modern: readonly ModernHit[];
  readonly autoStatus: LegacySpecialCaseStatus;
  readonly status: LegacySpecialCaseStatus;
  readonly verification: LegacySpecialCaseVerification;
  readonly evidence: readonly string[];
  /** Evidence pointers that do not resolve (missing file, test or fixture). */
  readonly brokenEvidence: readonly string[];
  /** The note admits a gap that the claimed status does not. */
  readonly contradiction: boolean;
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
  entities: readonly Entity[];
  /** Lower-cased field name -> entities with a non-empty value. */
  filledFields: ReadonlyMap<string, number>;
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
  const filledFields = new Map<string, number>();
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
      if (value.length > 0) increment(filledFields, field.toLocaleLowerCase());
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
    entities: pack.entities,
    filledFields,
  };
}

interface SampleCharacter {
  readonly file: string;
  readonly entities: readonly Entity[];
}

/** The pack records each private sample character owns (by internal-id). */
async function loadSampleCharacters(
  entities: readonly Entity[],
): Promise<SampleCharacter[]> {
  const byId = new Map(
    entities.map((entity) => [entity.id.trim().toLocaleLowerCase(), entity]),
  );
  const characters: SampleCharacter[] = [];
  for (const dir of SAMPLE_CHARACTER_DIRS)
    for (const file of (await walk(dir, /\.dnd4e$/)).sort()) {
      const xml = await readFile(file, "utf8");
      const owned = new Map<string, Entity>();
      for (const match of xml.matchAll(/internal-id="([^"]+)"/g)) {
        const id = match[1]!.trim().toLocaleLowerCase();
        const entity = byId.get(id);
        if (entity !== undefined) owned.set(id, entity);
      }
      characters.push({ file, entities: [...owned.values()] });
    }
  return characters;
}

/** Whether a record is one a case's literal targets. */
function entityMatches(entity: Entity, text: string, kind: LiteralClass) {
  const lower = text.trim().toLocaleLowerCase();
  const fold = (value: string | undefined) =>
    (value ?? "").trim().toLocaleLowerCase();
  switch (kind) {
    case "content-id":
      return fold(entity.id) === lower;
    case "content-name":
      return fold(entity.name) === lower;
    case "field-value":
      return entity.specifics.some(
        (specific) => fold(specific.value) === lower,
      );
    case "field-name":
      return entity.specifics.some(
        (specific) =>
          fold(specific.name) === lower && specific.value.trim() !== "",
      );
    case "prose-fragment":
      return (
        fold(entity.description).includes(lower) ||
        fold(entity.prerequisites).includes(lower) ||
        entity.specifics.some((specific) =>
          fold(specific.value).includes(lower),
        )
      );
    default:
      return false;
  }
}

/** Evidence pointers that do not resolve to a test name or a fixture file. */
async function brokenEvidence(evidence: readonly string[]): Promise<string[]> {
  const broken: string[] = [];
  for (const text of evidence) {
    const parsed = parseEvidence(text);
    if (parsed === undefined) {
      broken.push(text);
      continue;
    }
    if (parsed.kind === "private") {
      const ok = await access(parsed.fixture).then(
        () => true,
        () => false,
      );
      if (!ok) broken.push(text);
      continue;
    }
    const source = await readFile(parsed.file, "utf8").catch(() => undefined);
    if (
      source === undefined ||
      !source.includes(parsed.test) ||
      (parsed.case !== undefined && !source.includes(parsed.case))
    )
      broken.push(text);
  }
  return broken;
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
  const [{ vocabulary, entities: packEntities, filledFields }, uses, modern] =
    await Promise.all([
      loadVocabulary(packPath),
      collectLiterals(),
      loadModern(),
    ]);
  const entities = packEntities.length;
  const characters = await loadSampleCharacters(packEntities);

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
      fields: Map<string, LiteralRow>;
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
        fields: new Map<string, LiteralRow>(),
        vocabulary: new Set<string>(),
      };
      // Engine behavior keyed on a field name (ShouldExecute's "Item Slot"
      // and "_AlwaysExecute"), outside serialization code.
      if (
        row.classification.kind === "field-name" &&
        !isSerializationMember(use.member ?? use.file) &&
        isBehaviorField(row.text, {
          engine: FIELD_ENGINE_ASSEMBLIES.has(use.assembly),
        })
      )
        entry.fields.set(row.text, row);
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

  const fieldKeyed = (
    member: string,
    fields: ReadonlyMap<string, LiteralRow>,
  ) => fields.size > 0 && !isFieldAccessor(member, [...fields.keys()]);
  const unsortedCases: SpecialCaseRow[] = await Promise.all(
    [...members]
      // A reviewed member that uses only engine vocabulary (GiveFreebees's
      // "FREEBEE:" stat) is still a special case.
      .filter(([key, entry]) => {
        const member = key.slice(key.indexOf(":") + 1);
        return (
          entry.targets.size > 0 ||
          fieldKeyed(member, entry.fields) ||
          LEGACY_SPECIAL_CASES[member] !== undefined
        );
      })
      .map(async ([key, entry]): Promise<SpecialCaseRow> => {
        const member = key.slice(key.indexOf(":") + 1);
        const annotation = LEGACY_SPECIAL_CASES[member];
        const keyed = fieldKeyed(member, entry.fields);
        const targets = [
          ...entry.targets.values(),
          ...(keyed ? entry.fields.values() : []),
        ].map((row) => ({
          text: row.text,
          kind: row.classification.kind,
          matches: row.classification.matches,
        }));
        const hits = targets.map((target) => modernHits(target.text));
        const automatic = autoStatus(hits);
        // Impact counts only fields rare enough to be hooks: a member that
        // also reads Keywords or Power Usage is not about every power.
        const impactTargets = targets.filter(
          (target) =>
            target.kind !== "field-name" ||
            (filledFields.get(target.text.trim().toLocaleLowerCase()) ?? 0) <=
              RARE_FIELD_LIMIT,
        );
        const entityCount = impactTargets.reduce(
          (sum, target) =>
            sum +
            (target.kind === "field-name"
              ? (filledFields.get(target.text.trim().toLocaleLowerCase()) ?? 0)
              : Object.entries(target.matches)
                  .filter(
                    ([match]) => !["type", "field", "stat"].includes(match),
                  )
                  .reduce((inner, [, count]) => inner + count, 0)),
          0,
        );
        const owning = characters
          .filter((character) =>
            character.entities.some((entity) =>
              impactTargets.some((target) =>
                entityMatches(entity, target.text, target.kind),
              ),
            ),
          )
          .map((character) => character.file);
        const status = annotation?.status ?? automatic;
        const evidence = annotation?.evidence ?? [];
        return {
          member,
          assembly: entry.assembly,
          location: entry.location,
          targets,
          vocabulary: [...entry.vocabulary].sort(),
          fields: [...entry.fields.keys()].sort(),
          source:
            entry.targets.size > 0
              ? keyed
                ? "content+field"
                : "content"
              : keyed
                ? "field"
                : "annotation",
          entities: entityCount,
          characters: owning,
          modern: hits.filter((hit) => hit.files.length > 0),
          autoStatus: automatic,
          status,
          verification:
            annotation === undefined
              ? "unverified"
              : verificationOf(annotation),
          evidence,
          brokenEvidence: await brokenEvidence(evidence),
          contradiction:
            ["code", "declarative", "drift-risk"].includes(status) &&
            GAP_WORDING.test(annotation?.note ?? ""),
          description: annotation?.description,
          note: annotation?.note,
          reviewed: annotation !== undefined,
        };
      }),
  );
  const specialCases = unsortedCases.sort(
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
  const byVerification = new Map<LegacySpecialCaseVerification, number>();
  for (const row of specialCases) increment(byVerification, row.verification);
  const findings = specialCases
    .filter(
      (row) =>
        row.status === "not-handled" ||
        row.status === "partial" ||
        row.verification === "unverified" ||
        row.contradiction ||
        row.brokenEvidence.length > 0,
    )
    .sort(
      (left, right) =>
        findingRank(left) - findingRank(right) ||
        right.characters.length - left.characters.length ||
        right.entities - left.entities ||
        left.member.localeCompare(right.member),
    );

  await mkdir(outDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    pack: packPath,
    packEntities: entities,
    sampleCharacters: characters.map((character) => character.file),
    literals: {
      distinct: literals.length,
      native: nativeLiterals,
      uses: literals.reduce((sum, row) => sum + row.uses.length, 0),
      byKind: Object.fromEntries(byKind),
    },
    specialCases: {
      total: specialCases.length,
      reviewed: specialCases.filter((row) => row.reviewed).length,
      fieldKeyed: specialCases.filter((row) => row.source !== "content").length,
      byStatus: Object.fromEntries(byStatus),
      byVerification: Object.fromEntries(byVerification),
      contradictions: specialCases
        .filter((row) => row.contradiction)
        .map((row) => row.member),
      brokenEvidence: specialCases.flatMap((row) =>
        row.brokenEvidence.map((text) => `${row.member}: ${text}`),
      ),
    },
    driftChecks,
    staleAnnotations: unreviewed,
    findings: findings.map((row) => row.member),
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
    markdown(report, specialCases, findings),
  );
  console.log(
    `${literals.length} distinct literals (${nativeLiterals} native); ` +
      `${specialCases.length} special cases: ${[...byStatus]
        .map(([status, count]) => `${count} ${status}`)
        .join(", ")}; ${byVerification.get("unverified") ?? 0} unverified; ` +
      `drift checks: ${driftChecks
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
  if (report.specialCases.contradictions.length > 0)
    console.log(
      `Notes contradicting their status: ${report.specialCases.contradictions.join(", ")}`,
    );
  if (report.specialCases.brokenEvidence.length > 0)
    console.log(
      `Evidence that does not resolve: ${report.specialCases.brokenEvidence.join("; ")}`,
    );
  if (
    driftChecks.some((check) => !check.ok) ||
    report.specialCases.contradictions.length > 0 ||
    report.specialCases.brokenEvidence.length > 0
  )
    process.exitCode = 1;
}

const STATUS_ORDER: readonly LegacySpecialCaseStatus[] = [
  "not-handled",
  "partial",
  "drift-risk",
  "code",
  "declarative",
  "out-of-scope",
  "generic",
];

function statusRank(status: LegacySpecialCaseStatus): number {
  return STATUS_ORDER.indexOf(status);
}

/** Findings order: gaps first, then partial, then unverified claims. */
function findingRank(row: SpecialCaseRow): number {
  if (!row.reviewed) return 0;
  if (row.status === "not-handled") return 1;
  if (row.status === "partial") return 2;
  return 3;
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
    sampleCharacters: readonly string[];
    literals: {
      distinct: number;
      native: number;
      byKind: Record<string, number>;
    };
    specialCases: {
      total: number;
      reviewed: number;
      fieldKeyed: number;
      byStatus: Record<string, number>;
      byVerification: Record<string, number>;
      contradictions: readonly string[];
      brokenEvidence: readonly string[];
    };
    driftChecks: readonly DriftCheck[];
    staleAnnotations: string[];
  },
  cases: readonly SpecialCaseRow[],
  findings: readonly SpecialCaseRow[],
): string {
  const targetSummary = (row: SpecialCaseRow) =>
    row.targets
      .slice(0, 6)
      .map((target) => {
        const first =
          target.kind === "field-name"
            ? "field"
            : Object.keys(target.matches)[0];
        return `\`${cell(target.text.slice(0, 48))}\`${first === undefined ? "" : ` (${first})`}`;
      })
      .join(", ") +
    (row.targets.length > 6 ? `, +${row.targets.length - 6}` : "");
  const modernCell = (row: SpecialCaseRow) =>
    cell(
      row.note ??
        [...new Set(row.modern.flatMap((hit) => hit.files))]
          .slice(0, 3)
          .join(", "),
    );
  const characterName = (file: string) =>
    file.slice(file.lastIndexOf("/") + 1).replace(/\.dnd4e$/, "");
  const lines = [
    "# Legacy special-case inventory",
    "",
    `Pack: \`${report.pack}\`; ${report.sampleCharacters.length} private sample characters.`,
    "",
    `- ${report.literals.distinct} distinct literals (${report.literals.native} native).`,
    `- By class: ${Object.entries(report.literals.byKind)
      .sort((left, right) => right[1] - left[1])
      .map(([kind, count]) => `${kind} ${count}`)
      .join(", ")}.`,
    `- ${report.specialCases.total} special cases (members using content-targeting literals, or engine members keyed on field names: ${report.specialCases.fieldKeyed}), ${report.specialCases.reviewed} reviewed.`,
    `- By status: ${Object.entries(report.specialCases.byStatus)
      .map(([status, count]) => `${status} ${count}`)
      .join(", ")}.`,
    `- Evidence: ${Object.entries(report.specialCases.byVerification)
      .map(([state, count]) => `${state} ${count}`)
      .join(
        ", ",
      )}. A code, declarative, partial or drift-risk status needs a public test or a private fixture character that exercises it.`,
    ...(report.specialCases.contradictions.length > 0
      ? [
          `- **Notes contradicting their status:** ${report.specialCases.contradictions.join(", ")}.`,
        ]
      : []),
    ...(report.specialCases.brokenEvidence.length > 0
      ? [
          `- **Evidence that does not resolve:** ${report.specialCases.brokenEvidence.join("; ")}.`,
        ]
      : []),
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
    `## Findings (${findings.length})`,
    "",
    "Not handled, partial, or claimed without evidence; ranked by status, then sample characters, then pack records. Characters own a record a target literal (or a rare field) names, so the member runs for them; whether it changes their numbers is in the note.",
    "",
    "| Member | Status | Characters touched | Records | What it does | Modern |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...findings.map(
      (row) =>
        `| ${cell(row.member)} | ${row.reviewed ? row.status : "unreviewed"}${
          row.verification === "unverified" && row.reviewed
            ? ", unverified"
            : ""
        } | ${row.characters.length}${
          row.characters.length > 0
            ? ` (${row.characters.slice(0, 4).map(characterName).join(", ")}${row.characters.length > 4 ? ", ..." : ""})`
            : ""
        } | ${row.entities} | ${cell(row.description ?? "")} | ${modernCell(row)} |`,
    ),
    "",
  ];
  for (const status of STATUS_ORDER) {
    const rows = cases.filter((row) => row.status === status);
    if (rows.length === 0) continue;
    lines.push(
      `## ${status} (${rows.length})`,
      "",
      "| Member | Records | Chars | Targets | What it does | Modern | Evidence |",
      "| --- | ---: | ---: | --- | --- | --- | --- |",
      ...rows.map(
        (row) =>
          `| ${cell(row.member)}${row.reviewed ? "" : " (unreviewed)"}${row.source === "field" ? " (field)" : ""} | ${row.entities} | ${row.characters.length} | ${targetSummary(row)} | ${cell(row.description ?? "")} | ${modernCell(row)} | ${
            row.verification === "unverified"
              ? "**unverified**"
              : cell(row.evidence.join("; "))
          } |`,
      ),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

await main();
