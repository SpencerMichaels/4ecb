/**
 * Private audit of record drift: which content each legacy save was made on.
 *
 * A .dnd4e save stores, for every element it selected or holds, the
 * specifics its builder saw and (in the StatBlock, by `charelem`) the
 * statadds that element's record carried. This compares that evidence with
 * the record of the same ID in the full pack (CBLoader merge plus
 * content/corrections) and in the stock pack (WotC `original.xml` only) and
 * reports, per save, the elements matching the full pack only, the stock
 * pack only, both, or neither (with the differing lines), plus houserule
 * placeholders whose IDs exist only in the full pack (CBLoader-only records
 * the player's builder lacked).
 *
 * How saved statadds relate to record rules (checked on the samples): the
 * value takes the export writer's legacy form (`legacyStatAddValue`); a bare
 * stat name ("Initiative Misc") is saved as a +1 link to it; statlinks name
 * the Stat, not an alias ("Strength", never "str"); `condition` is saved as
 * `conditional`; `requires` is kept verbatim; `half-point` and `freebee:`
 * statadds are not saved as such; a base armor's armor bonus is saved as
 * adjusted for its magic armor; and an equipped holding the builder didn't
 * count as worn saves no statadds. Specifics are compared as text (whitespace and case folded), except
 * builder-internal `_` fields; the saved "Flavor" is the record's
 * description.
 *
 * Each save is classified (full / stock / partial/other CBLoader /
 * mixed/unexplained / indistinguishable) and compared with its
 * tmp/parity/content-profiles.json entry. Read-only; never edits the mapping.
 *
 *   pnpm audit:record-drift [SAVE.dnd4e ...] [--full PACK] [--stock PACK]
 *                           [--verbose]
 *
 * --verbose also lists the differences behind full-only and stock-only
 * matches, not only the neither-pack ones.
 */
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import {
  legacyStatAddValue,
  savedCharacterRules,
  type SavedRuleElement,
} from "@4ecb/legacy-dnd4e";

import { loadPackEntities } from "./legacy-parity";

// The root package doesn't depend on content-domain; take its types from here.
type ContentEntity = Awaited<ReturnType<typeof loadPackEntities>>[number];
type RuleStatement = ContentEntity["rules"][number];

const CONTENT_PROFILES = "tmp/parity/content-profiles.json";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value ?? fallback;
};
const fullPath = option("--full", "tmp/content/full-local.4ecp");
const stockPath = option("--stock", "tmp/content/stock-local.4ecp");
const verbose = args.includes("--verbose");
const files = args.filter((arg) => !arg.startsWith("--"));
const saves =
  files.length > 0
    ? files
    : readdirSync("sample-chars")
        .filter((file) => file.endsWith(".dnd4e"))
        .sort((left, right) => left.localeCompare(right))
        .map((file) => join("sample-chars", file));

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const fold = (value: string) =>
  value
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]!)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

type Pack = ReadonlyMap<string, ContentEntity>;

async function pack(path: string): Promise<Pack> {
  if (!existsSync(path))
    throw new Error(
      `${path} is missing; build it with scripts/build-private-content.sh${path.includes("stock") ? " --stock" : ""}`,
    );
  return new Map(
    (await loadPackEntities(path)).map((entity) => [fold(entity.id), entity]),
  );
}

/** Folds a stat name or alias to its Stat's own name, per the save. */
type Canonical = (name: string) => string | undefined;

/** A statadd's attributes in the folded form both sides are compared in. */
function signature(
  stat: string,
  attributes: Readonly<Record<string, string>>,
  canonical: Canonical,
): string {
  const folded = new Map(
    Object.entries(attributes)
      .map(([name, value]) => [fold(name), fold(value)] as const)
      .filter(([, value]) => value !== ""),
  );
  // A bare stat name is a +1 link to that stat (native ParseStatAdd).
  const text = folded.get("string");
  if (text !== undefined && canonical(text) !== undefined) {
    folded.delete("string");
    folded.set("value", "1");
    folded.set("statlink", text);
  }
  const link = folded.get("statlink");
  if (link !== undefined) folded.set("statlink", canonical(link) ?? link);
  return [
    canonical(stat) ?? fold(stat),
    ...[...folded]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`),
  ].join(" ");
}

const attributeOf = (rule: RuleStatement, name: string) =>
  rule.attributes.find((attribute) => fold(attribute.name) === name)?.value;

interface ExpectedStatAdd {
  readonly key: string;
  /** Not always saved, so its absence is no difference. */
  readonly optional: boolean;
}

/** A record's statadd rule in the shape a save's StatBlock stores it. */
function ruleStatAdd(
  rule: RuleStatement,
  canonical: Canonical,
): ExpectedStatAdd {
  const attributes: Record<string, string> = {};
  let stat = "";
  for (const { name, value } of rule.attributes) {
    const folded = fold(name);
    if (folded === "name") stat = value;
    // The StatBlock keeps none of these (a hybrid's half-point statadds
    // are saved as plain ones).
    else if (["level", "half-point", "zero"].includes(folded)) continue;
    else if (folded === "value")
      Object.assign(attributes, legacyStatAddValue(value));
    // Native StatBlock spells a rule's condition "conditional".
    else if (folded === "condition") attributes.conditional = value;
    else attributes[folded] = value;
  }
  return {
    key: signature(stat, attributes, canonical),
    // A class's `freebee:` grants are not stats.
    optional: fold(stat).startsWith("freebee:"),
  };
}

/**
 * A base armor's armor bonus is saved as adjusted for its magic armor (the
 * "Magic appears at higher item levels" rule), so it is no content evidence.
 */
const isArmorBonus = (record: ContentEntity, stat: string, type?: string) =>
  fold(record.type) === "armor" &&
  ["ac", "armor class"].includes(fold(stat)) &&
  fold(type ?? "") === "armor";

/** Two texts with their first difference marked, each kept short. */
function excerpt(saved: string, record: string) {
  const left = saved.replace(/\s+/g, " ").trim();
  const right = record.replace(/\s+/g, " ").trim();
  let index = 0;
  while (
    index < left.length &&
    left[index]?.toLowerCase() === right[index]?.toLowerCase()
  )
    index += 1;
  const start = Math.max(0, index - 30);
  const cut = (text: string) =>
    `${start > 0 ? "…" : ""}${text.slice(start, start + 110)}${text.length > start + 110 ? "…" : ""}`;
  return `saved "${cut(left)}" / record "${cut(right)}"`;
}

interface Comparison {
  /** Undefined when the pack has no record with this ID. */
  readonly matches?: boolean;
  readonly differences: readonly string[];
  /** Whether the save stored anything to compare. */
  readonly evidence: boolean;
}

function compare(
  saved: SavedRuleElement,
  record: ContentEntity | undefined,
  canonical: Canonical,
): Comparison {
  if (record === undefined) return { differences: [], evidence: false };
  const differences: string[] = [];
  let evidence = false;
  for (const [name, value] of Object.entries(saved.specifics)) {
    if (name === "" || name.startsWith("_") || fold(value) === "") continue;
    if (fold(record.type) === "armor" && fold(name) === "armor bonus") continue;
    const field =
      record.specifics.find((specific) => fold(specific.name) === fold(name))
        ?.value ??
      (fold(name) === "flavor"
        ? (record.flavor ?? record.description)
        : undefined);
    evidence = true;
    if (field === undefined)
      differences.push(`specific ${name}: saved, record has none`);
    else if (fold(field) !== fold(value))
      differences.push(`specific ${name}: ${excerpt(value, field)}`);
  }
  // A holding's statadds reach the StatBlock only when the builder counted
  // it as worn, which equip-count alone doesn't show: a holding with none
  // saved is no statadd evidence.
  if (saved.section === "tally" || saved.statAdds.length > 0) {
    const expected = record.rules
      .filter(
        (rule) =>
          fold(rule.name) === "statadd" &&
          !isArmorBonus(
            record,
            attributeOf(rule, "name") ?? "",
            attributeOf(rule, "type"),
          ),
      )
      .map((rule) => ruleStatAdd(rule, canonical));
    if (expected.length > 0 || saved.statAdds.length > 0) evidence = true;
    const unmatched = [...expected];
    for (const add of saved.statAdds) {
      if (isArmorBonus(record, add.stat[0] ?? "", add.attributes.type))
        continue;
      const key = signature(add.stat[0] ?? "", add.attributes, canonical);
      const index = unmatched.findIndex((rule) => rule.key === key);
      if (index >= 0) unmatched.splice(index, 1);
      else differences.push(`saved statadd: ${key}`);
    }
    for (const rule of unmatched)
      if (!rule.optional) differences.push(`record statadd: ${rule.key}`);
  }
  return { matches: differences.length === 0, differences, evidence };
}

type Bucket = "both" | "full" | "stock" | "neither";

interface ElementResult {
  readonly element: SavedRuleElement;
  readonly bucket: Bucket;
  readonly full: Comparison;
  readonly stock: Comparison;
}

interface SaveResult {
  readonly file: string;
  readonly elements: readonly ElementResult[];
  /** Placeholders whose IDs the full pack has and the stock pack lacks. */
  readonly cbloaderPlaceholders: readonly string[];
  /** Real (non-placeholder) saved records the stock pack lacks. */
  readonly cbloaderRecords: readonly string[];
  /** Saved IDs neither pack has (homebrew, renamed, or newer content). */
  readonly unknownIds: readonly string[];
  readonly classification: string;
  readonly suggestion?: "full" | "stock";
}

/** Whether a neither-pack element's statadds match neither pack either. */
const rulesDrift = (result: ElementResult) =>
  result.bucket === "neither" &&
  [result.full, result.stock].every((side) =>
    side.differences.some((difference) => difference.includes("statadd")),
  );

const label = (element: SavedRuleElement) =>
  `${element.name} [${element.type}] ${element.id ?? "(no id)"}`;

function auditSave(
  file: string,
  xml: string,
  full: Pack,
  stock: Pack,
): SaveResult {
  const saved = savedCharacterRules(xml);
  const statNames = new Map<string, string>();
  for (const aliases of saved.stats) {
    const own = fold(aliases[0] ?? "");
    for (const alias of aliases) statNames.set(fold(alias), own);
  }
  const canonical: Canonical = (name) => statNames.get(fold(name));
  const elements: ElementResult[] = [];
  const cbloaderPlaceholders = new Set<string>();
  const cbloaderRecords = new Set<string>();
  const unknownIds = new Set<string>();
  const seen = new Set<string>();
  for (const element of saved.elements) {
    if (element.id === undefined) continue;
    const id = fold(element.id);
    // An instance (charelem) is compared once.
    const instance = `${element.charelem ?? ""}\0${id}`;
    if (seen.has(instance)) continue;
    seen.add(instance);
    const inFull = full.has(id);
    const inStock = stock.has(id);
    const placeholder =
      fold(element.legality ?? "") === "houserule" &&
      Object.keys(element.specifics).length === 0 &&
      element.statAdds.length === 0;
    if (!inFull && !inStock) unknownIds.add(label(element));
    if (placeholder) {
      if (inFull && !inStock) cbloaderPlaceholders.add(label(element));
      continue;
    }
    if (inFull && !inStock) cbloaderRecords.add(label(element));
    const fullResult = compare(element, full.get(id), canonical);
    const stockResult = compare(element, stock.get(id), canonical);
    if (!fullResult.evidence && !stockResult.evidence) continue;
    const bucket: Bucket =
      fullResult.matches === true
        ? stockResult.matches === true
          ? "both"
          : "full"
        : stockResult.matches === true
          ? "stock"
          : "neither";
    elements.push({ element, bucket, full: fullResult, stock: stockResult });
  }
  const count = (bucket: Bucket) =>
    elements.filter((result) => result.bucket === bucket).length;
  const fullOnly = count("full");
  const stockOnly = count("stock");
  let classification: string;
  let suggestion: SaveResult["suggestion"];
  if (stockOnly > 0 || cbloaderPlaceholders.size > 0) {
    if (cbloaderRecords.size > 0) {
      classification = "partial/other CBLoader";
      suggestion = "full";
    } else if (fullOnly > 0) {
      classification = "mixed/unexplained";
      suggestion = "full";
    } else {
      classification = "stock";
      suggestion = "stock";
    }
  } else if (fullOnly > 0 || cbloaderRecords.size > 0) {
    classification = "full";
    suggestion = "full";
  } else classification = "indistinguishable";
  return {
    file,
    elements,
    cbloaderPlaceholders: [...cbloaderPlaceholders].sort(),
    cbloaderRecords: [...cbloaderRecords].sort(),
    unknownIds: [...unknownIds].sort(),
    classification,
    ...(suggestion === undefined ? {} : { suggestion }),
  };
}

function report(
  results: readonly SaveResult[],
  profiles: Readonly<Record<string, string>>,
) {
  const lines: string[] = [];
  for (const result of results) {
    const of = (bucket: Bucket) =>
      result.elements.filter((element) => element.bucket === bucket);
    lines.push(
      "",
      `== ${basename(result.file, ".dnd4e")}: ${result.classification} (profile: ${profiles[result.file] ?? "unmapped"})`,
      `   compared ${result.elements.length}: both ${of("both").length}, full only ${of("full").length}, stock only ${of("stock").length}, neither ${of("neither").length} (${result.elements.filter(rulesDrift).length} with statadds matching neither)`,
    );
    if (result.cbloaderPlaceholders.length > 0)
      lines.push(
        `   CBLoader-only houserule placeholders: ${result.cbloaderPlaceholders.join("; ")}`,
      );
    if (result.cbloaderRecords.length > 0)
      lines.push(
        `   CBLoader-only saved records (${result.cbloaderRecords.length}): ${result.cbloaderRecords.slice(0, 5).join("; ")}${result.cbloaderRecords.length > 5 ? "; ..." : ""}`,
      );
    if (result.unknownIds.length > 0)
      lines.push(`   IDs in neither pack: ${result.unknownIds.join("; ")}`);
    const detail = (bucket: Bucket, title: string) => {
      for (const element of of(bucket)) {
        lines.push(
          `   ${title}${rulesDrift(element) ? " (statadds)" : ""}: ${label(element.element)}`,
        );
        if (bucket !== "stock")
          for (const difference of element.stock.differences)
            lines.push(`      vs stock: ${difference}`);
        if (bucket !== "full")
          for (const difference of element.full.differences)
            lines.push(`      vs full:  ${difference}`);
      }
    };
    if (verbose) {
      detail("full", "full only");
      detail("stock", "stock only");
    } else
      for (const bucket of ["full", "stock"] as const)
        if (of(bucket).length > 0)
          lines.push(
            `   ${bucket} only: ${of(bucket)
              .map((element) => element.element.name)
              .join("; ")}`,
          );
    detail("neither", "neither");
  }

  lines.push("", "Summary (classification vs content-profiles.json):");
  const width = Math.max(...results.map((r) => basename(r.file).length));
  for (const result of results) {
    const profile = profiles[result.file];
    const verdict =
      result.suggestion === undefined
        ? ""
        : profile === undefined
          ? `  -> propose "${result.suggestion}"`
          : profile === result.suggestion
            ? ""
            : `  -> DISAGREES: propose "${result.suggestion}"`;
    const counts = (bucket: Bucket) =>
      result.elements.filter((element) => element.bucket === bucket).length;
    lines.push(
      `  ${basename(result.file).padEnd(width)}  ${result.classification.padEnd(22)} profile=${(profile ?? "-").padEnd(5)} full=${counts("full")} stock=${counts("stock")} neither=${counts("neither")}/${result.elements.filter(rulesDrift).length} placeholders=${result.cbloaderPlaceholders.length}${verdict}`,
    );
  }
  // The same neither-pack records across saves point at one content source.
  const shared = new Map<string, string[]>();
  for (const result of results)
    for (const element of result.elements.filter(rulesDrift)) {
      const id = label(element.element);
      shared.set(id, [
        ...(shared.get(id) ?? []),
        basename(result.file, ".dnd4e"),
      ]);
    }
  lines.push(
    "",
    "Records whose saved statadds match neither pack, with the saves holding them:",
    ...[...shared]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, holders]) => `  ${id}: ${holders.join(", ")}`),
  );
  return lines.join("\n");
}

const [full, stock] = await Promise.all([pack(fullPath), pack(stockPath)]);
const profiles = existsSync(CONTENT_PROFILES)
  ? ((
      JSON.parse(await readFile(CONTENT_PROFILES, "utf8")) as {
        characters?: Record<string, string>;
      }
    ).characters ?? {})
  : {};
const results: SaveResult[] = [];
for (const file of saves)
  results.push(
    auditSave(file, await readFile(resolve(file), "utf8"), full, stock),
  );
console.log(report(results, profiles));
