import { describe, expect, it } from "vitest";

import {
  classifyLiteral,
  decodeDataBytes,
  demangleIdentifier,
  extractManagedLiterals,
  findMemberSpans,
  findNativeLiteralUses,
  findSmartAssemblyDecoder,
  findSmartAssemblyKey,
  isBehaviorField,
  isContentTargeting,
  isFieldAccessor,
  isSerializationMember,
  isUiText,
  memberAt,
  parseNativeLiteralDeclarations,
  readSmartAssemblyString,
  type ContentVocabulary,
} from "./legacy-literals";

const hex = (bytes: readonly number[]) =>
  bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
const wide = (text: string) =>
  hex([...text, "\0"].flatMap((char) => [char.charCodeAt(0), 0]));

describe("native literal decoding", () => {
  it("decodes wide and narrow data comments", () => {
    expect(decodeDataBytes(wide("Glory Boon"), true)).toBe("Glory Boon");
    expect(decodeDataBytes("62 6F 6F 6E 00", false)).toBe("boon");
    expect(decodeDataBytes("01 02 00", false)).toBeUndefined();
  });

  it("parses string declarations and finds their uses by member", () => {
    const module = [
      "internal class _003CModule_003E",
      "{",
      `\tinternal static _0024ArrayType_0024_0024_0024BY0L_0040_0024_0024CB_W _003F_003F_C_0040_1BG_0040AAAA_0040_003F_0024AAG_0040/* Not supported: data(${wide("Glory Boon")}) */;`,
      `\tinternal static _0024ArrayType_0024_0024_0024BY04_0024_0024CBD _003FA0x12345678_002Eunnamed_002Dglobal_002D3/* Not supported: data(62 6F 6F 6E 00) */;`,
      "\tinternal static int _003FA0x12345678_002Eunnamed_002Dglobal_002D4/* Not supported: data(01 00 00 00) */;",
      "\tinternal unsafe static bool D20RulesEngine_002EFoo_002EIsBoon(char* text)",
      "\t{",
      "\t\tif (stristr(text, (char*)Unsafe.AsPointer(ref global::_003CModule_003E._003F_003F_C_0040_1BG_0040AAAA_0040_003F_0024AAG_0040)) != null)",
      "\t\t{",
      "\t\t\treturn true;",
      "\t\t}",
      "\t\treturn stristr(text, (sbyte*)Unsafe.AsPointer(ref _003FA0x12345678_002Eunnamed_002Dglobal_002D3)) != null;",
      "\t}",
      "}",
    ].join("\n");
    const declarations = parseNativeLiteralDeclarations(module);
    expect(declarations.map(({ text, wide }) => [text, wide])).toEqual([
      ["Glory Boon", true],
      ["boon", false],
    ]);
    const uses = findNativeLiteralUses(
      module,
      new Set(declarations.map((declaration) => declaration.field)),
    );
    expect(uses.map((use) => use.line)).toEqual([8, 12]);
    const spans = findMemberSpans(module);
    expect(memberAt(spans, 8)?.name).toBe("Foo.IsBoon");
    expect(memberAt(spans, 12)?.name).toBe("Foo.IsBoon");
    expect(memberAt(spans, 3)).toBeUndefined();
  });

  it("demangles identifiers", () => {
    expect(demangleIdentifier("D20RulesEngine_002EFoo_002EBar")).toBe(
      "D20RulesEngine.Foo.Bar",
    );
  });
});

describe("managed literal extraction", () => {
  it("reads ordinary, verbatim and escaped literals and skips comments", () => {
    const source = [
      "namespace Demo;",
      "public class Shop",
      "{",
      '\t// "not a literal"',
      "\tpublic string Kind(string type)",
      "\t{",
      '\t\tif (type == "Glory Boon" && type != @"C:\\path") return "a\\"b";',
      '\t\treturn \'"\' + "x";',
      "\t}",
      "\tpublic string Name",
      "\t{",
      "\t\tget",
      "\t\t{",
      '\t\t\treturn "Battle Scars";',
      "\t\t}",
      "\t}",
      "}",
    ].join("\n");
    const literals = extractManagedLiterals(source);
    expect(literals.map(({ text, line }) => [text, line])).toEqual([
      ["Glory Boon", 7],
      ["C:\\path", 7],
      ['a"b', 7],
      ["x", 8],
      ["Battle Scars", 14],
    ]);
    const spans = findMemberSpans(source);
    expect(memberAt(spans, 7)?.name).toBe("Shop.Kind");
    expect(memberAt(spans, 14)?.name).toBe("Shop.Name");
  });
});

describe("SmartAssembly strings", () => {
  const record = (text: string) => {
    const base64 = Buffer.from(text, "utf8").toString("base64");
    return [base64.length, ...Buffer.from(base64, "ascii")];
  };

  it("finds the decoder and recovers the position key", () => {
    const source = [
      "internal sealed class _0004",
      "{",
      "\tpublic static string _0017_0002(int P_0)",
      "\t{",
      '\t\t_0001 = executingAssembly.GetManifestResourceStream("{c2dbdd61-3768-4b7f-8311-13a5b05144f8}");',
      "\t}",
      "}",
    ].join("\n");
    expect(findSmartAssemblyDecoder(source)).toEqual({
      call: "_0004._0017_0002",
      resource: "c2dbdd61-3768-4b7f-8311-13a5b05144f8",
    });
    const first = record("Magic Item Type");
    const resource = new Uint8Array([...first, ...record("Battle Scars")]);
    const key = 4660;
    const positions = [key, key + first.length];
    expect(findSmartAssemblyKey(resource, positions)).toBe(key);
    expect(readSmartAssemblyString(resource, positions[1]! - key)).toBe(
      "Battle Scars",
    );
    expect(readSmartAssemblyString(resource, 3)).toBeUndefined();
  });
});

describe("literal classification", () => {
  const vocabulary: ContentVocabulary = {
    ids: new Map([["id_fmp_feat_1", "Feat"]]),
    names: new Map([
      ["power attack", new Map([["Feat", 1]])],
      ["heavy blade", new Map([["Weapon Group", 1]])],
    ]),
    types: new Map([["feat", 10]]),
    fieldNames: new Map([["magic item type", 50]]),
    fieldValues: new Map([
      ["glory boon", new Map([["Magic Item Type", 9]])],
      ["one-hand", new Map([["Item Slot", 40]])],
    ]),
    statNames: new Map([["speed", 12]]),
    proseMatches: (text) =>
      text === "turn undead class feature"
        ? new Map([["Prerequisites", 3]])
        : undefined,
  };

  it("classifies by the most specific vocabulary hit", () => {
    expect(classifyLiteral("ID_FMP_FEAT_1", vocabulary).kind).toBe(
      "content-id",
    );
    expect(classifyLiteral("ID_FMP_FEAT_9", vocabulary).kind).toBe(
      "missing-content-id",
    );
    expect(classifyLiteral("Feat", vocabulary).kind).toBe("type");
    expect(classifyLiteral("Magic Item Type", vocabulary).kind).toBe(
      "field-name",
    );
    expect(classifyLiteral("Power Attack", vocabulary)).toEqual({
      kind: "content-name",
      matches: { "name:Feat": 1 },
    });
    expect(classifyLiteral("Glory Boon", vocabulary).kind).toBe("field-value");
    expect(classifyLiteral("Speed", vocabulary).kind).toBe("stat-name");
    expect(classifyLiteral("Turn Undead class feature", vocabulary).kind).toBe(
      "prose-fragment",
    );
    expect(classifyLiteral("%s (%d)", vocabulary).kind).toBe("ui-text");
    expect(classifyLiteral("Could not save the file.", vocabulary).kind).toBe(
      "ui-text",
    );
    expect(classifyLiteral("two-melee-offhand", vocabulary).kind).toBe(
      "engine-token",
    );
  });

  it("separates content-targeting literals from engine vocabulary", () => {
    const targets = (text: string, prose?: boolean) =>
      isContentTargeting(
        text,
        classifyLiteral(text, vocabulary),
        prose === undefined ? {} : { prose },
      );
    expect(targets("ID_FMP_FEAT_1")).toBe(true);
    expect(targets("Power Attack")).toBe(true);
    expect(targets("Glory Boon")).toBe(true);
    expect(targets("Heavy Blade")).toBe(false);
    expect(targets("One-hand")).toBe(false);
    expect(targets("Turn Undead class feature")).toBe(true);
    expect(targets("Turn Undead class feature", false)).toBe(false);
    expect(targets("Magic Item Type")).toBe(false);
  });

  it("recognizes formatting as UI text", () => {
    expect(isUiText("{0} of {1}")).toBe(true);
    expect(isUiText("portrait.png")).toBe(true);
    expect(isUiText("<Weapon>")).toBe(true);
    expect(isUiText("Glory Boon")).toBe(false);
  });
});

describe("field-keyed engine members", () => {
  it("treats writers, readers and file-level tables as serialization", () => {
    expect(isSerializationMember("?A0x7f38ca63.WriteElemFields")).toBe(true);
    expect(isSerializationMember("SaveElement")).toBe(true);
    expect(isSerializationMember("BeastBlock.ToXML")).toBe(true);
    expect(isSerializationMember("D20RulesEngine/FamiliarBlock.cs")).toBe(true);
    expect(isSerializationMember("ShouldExecute")).toBe(false);
    expect(isSerializationMember("EquipLoot")).toBe(false);
  });

  it("skips plain accessors named for the one field they read", () => {
    expect(isFieldAccessor("WeaponItem.Damage", ["Damage"])).toBe(true);
    expect(isFieldAccessor("D20Currency.Gold", ["Gold"])).toBe(true);
    expect(isFieldAccessor("ItemSet.Benefits", ["Benefits"])).toBe(true);
    expect(
      isFieldAccessor("ShouldExecute", ["Item Slot", "_AlwaysExecute"]),
    ).toBe(false);
    expect(isFieldAccessor("BeastHitPoints", ["Hit Points"])).toBe(false);
  });

  it("keys engine behavior on any field but applications only on hook fields", () => {
    expect(isBehaviorField("Item Slot", { engine: true })).toBe(true);
    expect(isBehaviorField("Item Slot", { engine: false })).toBe(false);
    expect(isBehaviorField("_AlwaysExecute", { engine: false })).toBe(true);
    expect(isBehaviorField("*", { engine: true })).toBe(false);
  });
});
