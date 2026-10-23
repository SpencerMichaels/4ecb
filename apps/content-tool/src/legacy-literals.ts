/**
 * String-literal extraction for the decompiled legacy applications, used by
 * the private legacy special-case inventory (`pnpm audit:legacy-special-cases`,
 * docs/coverage-audit-proposal.md section 5). Everything here works on source
 * text supplied by the caller, so it is testable with synthetic inputs.
 *
 * Native (C++/CLI) literals decompile to static fields in `<Module>` whose
 * initial bytes survive only as a `/* Not supported: data(..) *\/` comment;
 * those bytes are the reliable decode (UTF-16LE for wide `_W` arrays,
 * single-byte for narrow `D` arrays). Managed assemblies keep ordinary C#
 * literals.
 */

export interface NativeLiteralDeclaration {
  /** Field identifier, as referenced from method bodies. */
  readonly field: string;
  readonly wide: boolean;
  readonly text: string;
  /** 1-based line of the declaration. */
  readonly line: number;
}

export interface SourceLiteral {
  readonly text: string;
  /** 1-based line. */
  readonly line: number;
}

export interface MemberSpan {
  /** Demangled member name (for example `D20Workspace.RulesElementIsBoon`). */
  readonly name: string;
  /** Enclosing type chain, outermost first. */
  readonly types: readonly string[];
  readonly startLine: number;
  readonly endLine: number;
}

/** Undoes ILSpy's `_00XX` identifier escaping (`_002E` is `.`). */
export function demangleIdentifier(identifier: string): string {
  return identifier.replace(/_00([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Decodes the hex bytes of a `data(..)` comment. Stops at the first
 * terminator; returns undefined when the bytes are not plausible text.
 */
export function decodeDataBytes(
  hex: string,
  wide: boolean,
): string | undefined {
  const bytes = hex
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 16));
  if (bytes.some((byte) => Number.isNaN(byte))) return undefined;
  const units: number[] = [];
  if (wide) {
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      const unit = bytes[index]! | (bytes[index + 1]! << 8);
      if (unit === 0) break;
      units.push(unit);
    }
  } else {
    for (const byte of bytes) {
      if (byte === 0) break;
      units.push(byte);
    }
  }
  const text = String.fromCharCode(...units);
  // Control characters other than whitespace mean this is not a string.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return undefined;
  return text;
}

const NATIVE_DECLARATION =
  /^\s*internal\s+(?:unsafe\s+)?static\s+(_0024ArrayType_0024_0024_0024BY\w*?_0024_0024CB(_W|D))\s+(\w+)\s*\/\*\s*Not supported: data\(([0-9A-Fa-f\s]*)\)\s*\*\/\s*;/;

/** Every wide or narrow constant string array declared in `-Module-.cs`. */
export function parseNativeLiteralDeclarations(
  source: string,
): NativeLiteralDeclaration[] {
  const declarations: NativeLiteralDeclaration[] = [];
  source.split("\n").forEach((lineText, index) => {
    const match = NATIVE_DECLARATION.exec(lineText);
    if (match === null) return;
    const wide = match[2] === "_W";
    const text = decodeDataBytes(match[4]!, wide);
    if (text === undefined) return;
    declarations.push({ field: match[3]!, wide, text, line: index + 1 });
  });
  return declarations;
}

/** Ordinary, verbatim and interpolated C# string literals, one per use. */
export function extractManagedLiterals(source: string): SourceLiteral[] {
  const literals: SourceLiteral[] = [];
  let line = 1;
  let index = 0;
  const length = source.length;
  while (index < length) {
    const char = source[index]!;
    if (char === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      while (index < length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (
        index < length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === "'") {
      // Character literal: skip it so `'"'` does not open a string.
      index += 1;
      while (
        index < length &&
        source[index] !== "'" &&
        source[index] !== "\n"
      ) {
        index += source[index] === "\\" ? 2 : 1;
      }
      index += 1;
      continue;
    }
    const verbatim =
      (char === "@" && source[index + 1] === '"') ||
      ((char === "$" || char === "@") &&
        (source[index + 1] === "@" || source[index + 1] === "$") &&
        source[index + 2] === '"');
    if (char === '"' || verbatim) {
      const prefixEnd = source.indexOf('"', index);
      const isVerbatim = source.slice(index, prefixEnd).includes("@");
      const startLine = line;
      let text = "";
      index = prefixEnd + 1;
      while (index < length) {
        const next = source[index]!;
        if (isVerbatim) {
          if (next === '"' && source[index + 1] === '"') {
            text += '"';
            index += 2;
            continue;
          }
          if (next === '"') break;
          if (next === "\n") line += 1;
          text += next;
          index += 1;
          continue;
        }
        if (next === "\\") {
          text += unescapeCSharp(source[index + 1] ?? "");
          index += 2;
          continue;
        }
        if (next === '"' || next === "\n") break;
        text += next;
        index += 1;
      }
      index += 1;
      literals.push({ text, line: startLine });
      continue;
    }
    index += 1;
  }
  return literals;
}

function unescapeCSharp(char: string): string {
  switch (char) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case "0":
      return "\0";
    default:
      return char;
  }
}

const TYPE_HEADER =
  /\b(?:class|struct|interface|enum|record)\s+([A-Za-z_][\w]*)/;
const MEMBER_HEADER =
  /^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|unsafe|override|virtual|extern|sealed|abstract|new|async|partial|readonly|implicit|explicit|operator)\s+)+[^=(]*?([A-Za-z_][\w]*)\s*(?:<[^>()]*>)?\s*(?:\(|$)/;
const CONTROL_HEADER =
  /^\s*(?:if|else|for|foreach|while|do|switch|try|catch|finally|using|lock|fixed|checked|unchecked|case|default|return|get|set|add|remove)\b/;

/**
 * Members (methods, constructors, properties) and their line spans, from
 * ILSpy-formatted C# where every block brace is on its own line or ends the
 * header line. Strings and comments are ignored while counting braces.
 */
export function findMemberSpans(source: string): MemberSpan[] {
  const lines = source.split("\n");
  const spans: MemberSpan[] = [];
  const stack: {
    kind: "type" | "member" | "block";
    name: string;
    startLine: number;
  }[] = [];
  let header = "";
  let headerLine = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = stripStringsAndComments(lines[index]!);
    for (const char of raw) {
      if (char === "{") {
        const text = header.trim();
        const enclosingMember = stack.some((entry) => entry.kind === "member");
        let entry: (typeof stack)[number] = {
          kind: "block",
          name: "",
          startLine: headerLine || index + 1,
        };
        const typeMatch = TYPE_HEADER.exec(text);
        if (!enclosingMember && typeMatch !== null) {
          entry = { ...entry, kind: "type", name: typeMatch[1]! };
        } else if (!enclosingMember && !CONTROL_HEADER.test(text)) {
          const memberMatch = MEMBER_HEADER.exec(text);
          if (memberMatch !== null)
            entry = { ...entry, kind: "member", name: memberMatch[1]! };
        }
        stack.push(entry);
        header = "";
        headerLine = 0;
      } else if (char === "}") {
        const entry = stack.pop();
        if (entry?.kind === "member") {
          const types = stack
            .filter((item) => item.kind === "type")
            .map((item) => item.name);
          spans.push({
            name: memberDisplayName(types, entry.name),
            types,
            startLine: entry.startLine,
            endLine: index + 1,
          });
        }
        header = "";
        headerLine = 0;
      } else if (char === ";") {
        header = "";
        headerLine = 0;
      } else {
        if (header.trim().length === 0 && char.trim().length > 0)
          headerLine = index + 1;
        header += char;
      }
    }
    header += " ";
  }
  return spans.sort((left, right) => left.startLine - right.startLine);
}

/**
 * The owning member name. Native functions in `<Module>` carry their C++
 * scope in the mangled identifier (`D20RulesEngine_002EFoo_002EBar`).
 */
function memberDisplayName(types: readonly string[], member: string): string {
  const demangled = demangleIdentifier(member);
  const owner = types.at(-1);
  if (demangled.includes(".")) {
    const parts = demangled.split(".");
    return parts.slice(parts[0] === "D20RulesEngine" ? 1 : 0).join(".");
  }
  return owner === undefined || owner === "_003CModule_003E"
    ? demangled
    : `${demangleIdentifier(owner)}.${demangled}`;
}

function stripStringsAndComments(line: string): string {
  let result = "";
  let index = 0;
  while (index < line.length) {
    const char = line[index]!;
    if (char === "/" && line[index + 1] === "/") break;
    if (char === "/" && line[index + 1] === "*") {
      const end = line.indexOf("*/", index + 2);
      if (end < 0) break;
      index = end + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      index += 1;
      while (index < line.length && line[index] !== char) {
        index += line[index] === "\\" ? 2 : 1;
      }
      index += 1;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

/** The innermost member containing a 1-based line, if any. */
export function memberAt(
  spans: readonly MemberSpan[],
  line: number,
): MemberSpan | undefined {
  let found: MemberSpan | undefined;
  for (const span of spans) {
    if (span.startLine > line) break;
    if (span.endLine >= line) found = span;
  }
  return found;
}

/** Uses of native literal fields in one source file. */
export function findNativeLiteralUses(
  source: string,
  fields: ReadonlySet<string>,
): SourceLiteral[] {
  const uses: SourceLiteral[] = [];
  const pattern =
    /_003F_003F_C_0040\w+|_003FA0x[0-9a-f]{8}_002Eunnamed_002Dglobal_002D\d+/g;
  source.split("\n").forEach((lineText, index) => {
    if (lineText.includes("Not supported: data(")) return;
    for (const match of lineText.matchAll(pattern)) {
      if (fields.has(match[0])) uses.push({ text: match[0], line: index + 1 });
    }
  });
  return uses;
}

export type LiteralClass =
  | "content-id"
  | "missing-content-id"
  | "content-name"
  | "type"
  | "field-name"
  | "field-value"
  | "stat-name"
  | "prose-fragment"
  | "engine-token"
  | "ui-text";

export interface ContentVocabulary {
  /** Lower-cased ID -> entity type. */
  readonly ids: ReadonlyMap<string, string>;
  /** Lower-cased name -> entity type -> count. */
  readonly names: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly types: ReadonlyMap<string, number>;
  readonly fieldNames: ReadonlyMap<string, number>;
  /** Lower-cased value -> field name -> count. */
  readonly fieldValues: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly statNames: ReadonlyMap<string, number>;
  /**
   * Finds a literal inside longer prose fields; returns field -> count.
   * Optional because it is expensive.
   */
  readonly proseMatches?: (
    lowerText: string,
  ) => ReadonlyMap<string, number> | undefined;
}

export interface LiteralClassification {
  readonly kind: LiteralClass;
  /** What matched: entity types, field names, and so on, with counts. */
  readonly matches: Readonly<Record<string, number>>;
}

const ID_PATTERN = /^ID_[A-Z0-9_]+$/i;

/** Heuristic for interface, format and diagnostic text. */
export function isUiText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (
    /%[-+ #0]*\d*(?:\.\d+)?(?:l|h|I64)?[sdifcuxXgeS]|\{\d+(?::[^}]*)?\}/.test(
      text,
    )
  )
    return true;
  if (/^[\W\d_]+$/.test(trimmed)) return true;
  if (/^<\/?[\w:]+|\/>$|^\w+:\/\//.test(trimmed)) return true;
  if (
    /\.(?:xml|dnd4e|exe|dll|png|jpe?g|xaml|txt|html?|pdf|ini|config)$/i.test(
      trimmed,
    )
  )
    return true;
  if (/[\\/]/.test(trimmed) && !/\s/.test(trimmed)) return true;
  return false;
}

function sortedCounts(matches: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(matches).sort((left, right) => right[1] - left[1]),
  );
}

/**
 * Classifies one decoded literal against the pack vocabulary. `matches`
 * records every vocabulary hit (`id:<type>`, `type`, `field`, `name:<type>`,
 * `value:<field>`, `stat`, `prose:<field>`); `kind` is the primary class. An
 * ID wins, then an entity type or field name (engine vocabulary), then a
 * content name, a field value, a stat name and a fragment of authored prose.
 * Anything left is an engine token, or UI text when it looks like formatting.
 */
export function classifyLiteral(
  text: string,
  vocabulary: ContentVocabulary,
): LiteralClassification {
  const trimmed = text.trim();
  const lower = trimmed.toLocaleLowerCase();
  if (ID_PATTERN.test(trimmed)) {
    const type = vocabulary.ids.get(lower);
    return type === undefined
      ? { kind: "missing-content-id", matches: {} }
      : { kind: "content-id", matches: { [`id:${type}`]: 1 } };
  }
  const matches: Record<string, number> = {};
  const typed = vocabulary.types.get(lower);
  const fielded = vocabulary.fieldNames.get(lower);
  const stat = vocabulary.statNames.get(lower);
  if (typed !== undefined) matches["type"] = typed;
  if (fielded !== undefined) matches["field"] = fielded;
  for (const [type, count] of vocabulary.names.get(lower) ?? [])
    matches[`name:${type}`] = count;
  for (const [field, count] of vocabulary.fieldValues.get(lower) ?? [])
    matches[`value:${field}`] = count;
  if (stat !== undefined) matches["stat"] = stat;
  const ui = isUiText(trimmed);
  const kind: LiteralClass | undefined =
    typed !== undefined
      ? "type"
      : fielded !== undefined
        ? "field-name"
        : vocabulary.names.has(lower)
          ? "content-name"
          : vocabulary.fieldValues.has(lower) && !ui
            ? "field-value"
            : stat !== undefined
              ? "stat-name"
              : undefined;
  if (kind !== undefined) return { kind, matches: sortedCounts(matches) };
  if (ui) return { kind: "ui-text", matches: {} };
  if (trimmed.length >= 8) {
    const prose = vocabulary.proseMatches?.(lower);
    if (prose !== undefined && prose.size > 0) {
      for (const [field, count] of prose) matches[`prose:${field}`] = count;
      return { kind: "prose-fragment", matches: sortedCounts(matches) };
    }
  }
  // Sentences that match nothing in the content are messages, not keys.
  if (/\s/.test(trimmed) && /[.!?:]$|^[A-Z][a-z]+ [a-z]+ [a-z]+/.test(trimmed))
    return { kind: "ui-text", matches: {} };
  return { kind: "engine-token", matches: {} };
}

/** Classes that name particular content rather than engine vocabulary. */
export const CONTENT_TARGETING_CLASSES: ReadonlySet<LiteralClass> = new Set([
  "content-id",
  "content-name",
  "field-value",
  "prose-fragment",
]);

/**
 * Entity types whose names are rule-language vocabulary (categories, weapon
 * groups, sizes, ...): a literal equal to one of them is an engine token.
 */
export const VOCABULARY_ENTITY_TYPES: ReadonlySet<string> = new Set(
  [
    "Background Association",
    "Background Choice",
    "Category",
    "CountsAsClass",
    "CountsAsFeature",
    "CountsAsRace",
    "Gender",
    "Grants",
    "Information",
    "Internal",
    "Language",
    "Level",
    "Money",
    "Power Source",
    "Proficiency",
    "Size",
    "Skill",
    "Skill Training",
    "Tier",
    "Vision",
    "Weapon Group",
    "Weapon Property",
    "source",
    "tag",
  ].map((type) => type.toLocaleLowerCase()),
);

/** Enumerated fields whose short values are engine vocabulary. */
export const VOCABULARY_FIELDS: ReadonlySet<string> = new Set(
  [
    "Action Type",
    "Armor",
    "Armor Category",
    "Armor Type",
    "Attack Type",
    "Category",
    "Damage",
    "Damage Stat",
    "Display",
    "Group",
    "Implement",
    "Implements",
    "Item Slot",
    "Power Type",
    "Power Usage",
    "Properties",
    "Size",
    "Tier",
    "Type",
    "Weapon",
    "_AlternateSlot",
    "_AlwaysExecute",
    "_BasicAttack",
    "_ImplementEquiv",
    "_IsEnchant",
    "_UniversalImplement",
    "Associated Skills",
    "Market Price",
    "Component Cost",
  ].map((field) => field.toLocaleLowerCase()),
);

/** Prose fragments matching more fields than this are generic phrasing. */
const SPECIFIC_PROSE_LIMIT = 300;

/**
 * Whether a classified literal names particular content (and so marks a
 * special case) rather than engine vocabulary that merely matches content.
 */
export function isContentTargeting(
  text: string,
  classification: LiteralClassification,
  options: { readonly prose?: boolean } = {},
): boolean {
  const { kind, matches } = classification;
  if (!CONTENT_TARGETING_CLASSES.has(kind)) return false;
  if (kind === "content-id") return true;
  // Numbers and two-letter tokens name nothing in particular.
  if (!/[a-z]{3}/i.test(text)) return false;
  const entries = Object.entries(matches);
  const names = entries.filter(([key]) => key.startsWith("name:"));
  const values = entries.filter(([key]) => key.startsWith("value:"));
  const specificName = names.some(
    ([key]) => !VOCABULARY_ENTITY_TYPES.has(key.slice(5).toLocaleLowerCase()),
  );
  const specificValue = values.some(
    ([key]) =>
      text.trim().length > 30 ||
      !VOCABULARY_FIELDS.has(key.slice(6).toLocaleLowerCase()),
  );
  if (kind === "prose-fragment")
    return (
      options.prose !== false &&
      text.trim().length >= 10 &&
      entries.reduce((sum, [, count]) => sum + count, 0) <= SPECIFIC_PROSE_LIMIT
    );
  return specificName || specificValue;
}

/**
 * SmartAssembly string encryption (used by CharacterBuilder): call sites
 * read `Class.Method(position)`, and the decoder reads a length-prefixed
 * base64 UTF-8 record at `position - key` of an embedded resource, where
 * `key` folds the assembly's public key token.
 */
export interface SmartAssemblyDecoder {
  /** `Class.Method` as written at call sites, e.g. `_0004._0017_0002`. */
  readonly call: string;
  /** Resource file name (GUID in braces, as embedded). */
  readonly resource: string;
}

/** Finds the decoder method and resource name in decompiled source. */
export function findSmartAssemblyDecoder(
  source: string,
): SmartAssemblyDecoder | undefined {
  const resource = /GetManifestResourceStream\("\{([0-9a-f-]{36})\}"\)/i.exec(
    source,
  );
  if (resource === null) return undefined;
  const before = source.slice(0, resource.index);
  const method = [
    ...before.matchAll(/public static string (\w+)\(int P_0\)/g),
  ].at(-1);
  const type = [...before.matchAll(/\bclass (\w+)/g)].at(-1);
  if (method === undefined || type === undefined) return undefined;
  return { call: `${type[1]!}.${method[1]!}`, resource: resource[1]! };
}

/** Reads one record; undefined when the bytes are not a valid record. */
export function readSmartAssemblyString(
  resource: Uint8Array,
  position: number,
): string | undefined {
  if (position < 0 || position >= resource.length) return undefined;
  let offset = position;
  const first = resource[offset++]!;
  let length: number;
  if ((first & 0x80) === 0) length = first;
  else if ((first & 0x40) === 0)
    length = ((first & 0x3f) << 8) + resource[offset++]!;
  else {
    length =
      ((first & 0x1f) << 24) +
      (resource[offset]! << 16) +
      (resource[offset + 1]! << 8) +
      resource[offset + 2]!;
    offset += 3;
  }
  if (offset + length > resource.length) return undefined;
  if (length === 0) return "";
  const base64 = new TextDecoder().decode(
    resource.subarray(offset, offset + length),
  );
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0)
    return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    );
  } catch {
    return undefined;
  }
}

/**
 * Recovers the position key without the public key token: the 16-bit key
 * for which every observed call position decodes to a valid record.
 */
export function findSmartAssemblyKey(
  resource: Uint8Array,
  positions: readonly number[],
): number | undefined {
  const sample = [...new Set(positions)].slice(0, 64);
  for (let key = 0; key <= 0xffff; key += 1) {
    const decoded = sample.map((position) =>
      readSmartAssemblyString(resource, position - key),
    );
    if (
      decoded.every((text) => text !== undefined) &&
      decoded.filter((text) => text !== "").length * 2 >= decoded.length
    )
      return key;
  }
  return undefined;
}

/**
 * Members whose field reads serialize or display a record rather than
 * decide engine behavior: writers, readers and loaders, and file-level
 * tables outside any member.
 */
export function isSerializationMember(member: string): boolean {
  if (/\.cs$/.test(member)) return true;
  const last = member.slice(member.lastIndexOf(".") + 1);
  return /^(?:Write|Save|Read|Load|Serialize|Deserialize|ToXML|FromXML)/.test(
    last,
  );
}

/**
 * A plain accessor (`WeaponItem.Damage` reading "Damage"): its only field
 * is its own name, so the behavior lives in its callers.
 */
export function isFieldAccessor(
  member: string,
  fields: readonly string[],
): boolean {
  const fold = (text: string) => text.replace(/[\s_]/g, "").toLowerCase();
  const last = fold(member.slice(member.lastIndexOf(".") + 1));
  return fields.length > 0 && fields.every((field) => fold(field) === last);
}

/**
 * Whether a field-name literal marks engine behavior keyed on a field (a
 * special case like ShouldExecute's "Item Slot"/"_AlwaysExecute"). In the
 * engine assemblies every field counts; in the applications only the
 * underscore-prefixed fields, which are engine hooks rather than display
 * fields, do.
 */
export function isBehaviorField(
  field: string,
  options: { readonly engine: boolean },
): boolean {
  const trimmed = field.trim();
  if (!/[a-z]{3}/i.test(trimmed)) return false;
  return options.engine || trimmed.startsWith("_");
}
