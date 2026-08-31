import {
  getAttribute,
  getElementText,
  normalizeDisplayText,
  type ContentAttribute,
  type ContentDiagnostic,
  type ContentElementNode,
  type ContentNode,
  type ParsedContentEntity,
  type ParsedContentSource,
  type RejectedContentRecord,
  type RuleStatement,
  type SpecificField,
} from "@4ecb/content-domain";
import { SaxesParser } from "saxes";

interface MutableElementNode {
  kind: "element";
  name: string;
  attributes: ContentAttribute[];
  children: ContentNode[];
}

function immutableElement(node: MutableElementNode): ContentElementNode {
  return node;
}

function directElements(
  node: ContentElementNode,
  expectedName: string,
): ContentElementNode[] {
  const expected = expectedName.toLocaleLowerCase();
  return node.children.filter(
    (child): child is ContentElementNode =>
      child.kind === "element" && child.name.toLocaleLowerCase() === expected,
  );
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function optionalText(
  node: ContentElementNode,
  name: string,
): string | undefined {
  const element = directElements(node, name)[0];
  if (element === undefined) return undefined;
  const value = normalizeDisplayText(getElementText(element));
  return value.length === 0 ? undefined : value;
}

function buildSpecifics(node: ContentElementNode): SpecificField[] {
  return directElements(node, "specific").map((element, ordinal) => ({
    name: getAttribute(element.attributes, "name") ?? "",
    value: normalizeDisplayText(getElementText(element)),
    extraAttributes: element.attributes.filter(
      (attribute) => attribute.name.toLocaleLowerCase() !== "name",
    ),
    ordinal,
  }));
}

function buildExtensions(node: ContentElementNode) {
  const knownElements = new Set([
    "category",
    "flavor",
    "prereqs",
    "print-prereqs",
    "specific",
    "rules",
  ]);
  return node.children.flatMap((child, ordinal) => {
    if (child.kind === "text") return [];
    if (
      child.kind === "element" &&
      knownElements.has(child.name.toLocaleLowerCase())
    )
      return [];
    return [{ ordinal, node: child }];
  });
}

function buildRules(node: ContentElementNode): RuleStatement[] {
  const statements: RuleStatement[] = [];
  for (const rulesElement of directElements(node, "rules")) {
    for (const child of rulesElement.children) {
      if (child.kind !== "element") continue;
      statements.push({
        name: child.name,
        attributes: child.attributes,
        text: normalizeDisplayText(getElementText(child)),
        children: child.children,
        ordinal: statements.length,
      });
    }
  }
  return statements;
}

function buildDescription(node: ContentElementNode): string {
  return normalizeDisplayText(
    node.children
      .filter((child) => child.kind === "text")
      .map((child) => child.value)
      .join(""),
  );
}

function makeDiagnostic(
  severity: ContentDiagnostic["severity"],
  code: string,
  message: string,
  ordinal: number,
  entityId?: string,
): ContentDiagnostic {
  return entityId === undefined
    ? { severity, code, message, ordinal }
    : { severity, code, message, ordinal, entityId };
}

export class D20RulesParser {
  readonly #sourceKey: string;
  readonly #parser: SaxesParser;
  readonly #stack: MutableElementNode[] = [];
  readonly #entities: ParsedContentEntity[] = [];
  readonly #rejected: RejectedContentRecord[] = [];
  readonly #rawTopLevel: ContentNode[] = [];
  readonly #diagnostics: ContentDiagnostic[] = [];
  readonly #seenIds = new Set<string>();
  #root: MutableElementNode | undefined;
  #gameSystem = "";
  #recordOrdinal = 0;
  #closed = false;

  constructor(sourceKey: string) {
    this.#sourceKey = sourceKey;
    this.#parser = new SaxesParser({ xmlns: false });

    this.#parser.on("opentag", (tag) => {
      const node: MutableElementNode = {
        kind: "element",
        name: tag.name,
        attributes: Object.entries(tag.attributes).map(([name, attribute]) => ({
          name,
          value: attribute,
        })),
        children: [],
      };

      const parent = this.#stack.at(-1);
      if (parent === undefined) {
        if (tag.name.toLocaleLowerCase() !== "d20rules") {
          throw new Error(`Expected D20Rules root but found ${tag.name}`);
        }
        this.#root = node;
        this.#gameSystem = getAttribute(node.attributes, "game-system") ?? "";
      } else if (
        !this.#isRoot(parent) ||
        tag.name.toLocaleLowerCase() !== "ruleselement"
      ) {
        parent.children.push(node);
      }

      this.#stack.push(node);
    });

    this.#parser.on("text", (value) => this.#appendText(value));
    this.#parser.on("cdata", (value) => this.#appendText(value));
    this.#parser.on("comment", (value) => {
      const parent = this.#stack.at(-1);
      if (parent === undefined) return;
      if (this.#isRoot(parent)) {
        this.#rawTopLevel.push({ kind: "comment", value });
      } else {
        parent.children.push({ kind: "comment", value });
      }
    });

    this.#parser.on("closetag", () => {
      const node = this.#stack.pop();
      if (node === undefined) throw new Error("XML parser stack underflow");
      const parent = this.#stack.at(-1);
      if (parent === undefined || !this.#isRoot(parent)) return;

      if (node.name.toLocaleLowerCase() === "ruleselement") {
        this.#acceptRecord(immutableElement(node));
      } else {
        this.#rawTopLevel.push(immutableElement(node));
      }
    });
  }

  write(chunk: string): void {
    if (this.#closed) throw new Error("Cannot write after closing the parser");
    this.#parser.write(chunk);
  }

  close(): ParsedContentSource {
    if (this.#closed) throw new Error("Parser has already been closed");
    this.#closed = true;
    this.#parser.close();
    if (this.#root === undefined)
      throw new Error("The document did not contain a D20Rules root");

    const warnedOrdinals = new Set(
      this.#diagnostics
        .filter((diagnostic) => diagnostic.severity === "warning")
        .flatMap((diagnostic) =>
          diagnostic.ordinal === undefined ? [] : [diagnostic.ordinal],
        ),
    );

    return {
      gameSystem: this.#gameSystem,
      sourceKey: this.#sourceKey,
      entities: this.#entities,
      rejected: this.#rejected,
      rawTopLevel: this.#rawTopLevel,
      diagnostics: this.#diagnostics,
      accounting: {
        topLevelRecords: this.#recordOrdinal,
        acceptedRecords: this.#entities.length,
        warnedRecords: warnedOrdinals.size,
        rejectedRecords: this.#rejected.length,
        rawTopLevelElements: this.#rawTopLevel.filter(
          (node) => node.kind === "element",
        ).length,
      },
    };
  }

  #isRoot(node: MutableElementNode): boolean {
    return node === this.#root;
  }

  #appendText(value: string): void {
    const parent = this.#stack.at(-1);
    if (parent === undefined) return;
    if (this.#isRoot(parent) && value.trim().length === 0) return;

    const last = parent.children.at(-1);
    if (last?.kind === "text") {
      parent.children[parent.children.length - 1] = {
        kind: "text",
        value: last.value + value,
      };
    } else {
      parent.children.push({ kind: "text", value });
    }
  }

  #acceptRecord(node: ContentElementNode): void {
    const ordinal = this.#recordOrdinal++;
    const id = getAttribute(node.attributes, "internal-id")?.trim() ?? "";
    const name = getAttribute(node.attributes, "name")?.trim() ?? "";
    const type = getAttribute(node.attributes, "type")?.trim() ?? "";

    if (id.length === 0 || name.length === 0 || type.length === 0) {
      const missing = [
        id.length === 0 ? "internal-id" : undefined,
        name.length === 0 ? "name" : undefined,
        type.length === 0 ? "type" : undefined,
      ].filter((value): value is string => value !== undefined);
      const reason = `Missing required attribute(s): ${missing.join(", ")}`;
      this.#rejected.push({ ordinal, reason, content: node });
      this.#diagnostics.push(
        makeDiagnostic("error", "record.missing-identity", reason, ordinal),
      );
      return;
    }

    if (this.#seenIds.has(id.toLocaleLowerCase())) {
      const reason = `Duplicate internal-id after merge: ${id}`;
      this.#rejected.push({ ordinal, reason, content: node });
      this.#diagnostics.push(
        makeDiagnostic("error", "record.duplicate-id", reason, ordinal, id),
      );
      return;
    }
    this.#seenIds.add(id.toLocaleLowerCase());

    const source = getAttribute(node.attributes, "source")?.trim() ?? "";
    if (source.length === 0) {
      this.#diagnostics.push(
        makeDiagnostic(
          "warning",
          "record.missing-source",
          "Record has no source",
          ordinal,
          id,
        ),
      );
    }

    const categories = directElements(node, "Category").flatMap((element) =>
      splitCommaList(getElementText(element)),
    );
    const revisionDate = getAttribute(node.attributes, "revision-date");
    const flavor = optionalText(node, "Flavor");
    const prerequisites = optionalText(node, "Prereqs");
    const printPrerequisites = optionalText(node, "print-prereqs");

    const base = {
      id,
      name,
      type,
      source,
      sources: splitCommaList(source),
      attributes: node.attributes.filter(
        (attribute) =>
          !["internal-id", "name", "type", "source", "revision-date"].includes(
            attribute.name.toLocaleLowerCase(),
          ),
      ),
      categories,
      specifics: buildSpecifics(node),
      rules: buildRules(node),
      description: buildDescription(node),
      extensions: buildExtensions(node),
      content: node.children,
      provenance: { sourceKey: this.#sourceKey, sourceOrdinal: ordinal },
    };

    this.#entities.push({
      ...base,
      ...(revisionDate === undefined ? {} : { revisionDate }),
      ...(flavor === undefined ? {} : { flavor }),
      ...(prerequisites === undefined ? {} : { prerequisites }),
      ...(printPrerequisites === undefined ? {} : { printPrerequisites }),
    });
  }
}

export function parseD20Rules(
  xml: string,
  sourceKey = "inline.xml",
): ParsedContentSource {
  const parser = new D20RulesParser(sourceKey);
  parser.write(xml.replace(/^\uFEFF/, ""));
  return parser.close();
}
