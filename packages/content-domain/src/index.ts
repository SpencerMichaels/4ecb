export type DiagnosticSeverity = "error" | "warning" | "info";

export interface ContentDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly entityId?: string;
  readonly ordinal?: number;
}

export interface ContentAttribute {
  readonly name: string;
  readonly value: string;
}

export interface ContentTextNode {
  readonly kind: "text";
  readonly value: string;
}

export interface ContentCommentNode {
  readonly kind: "comment";
  readonly value: string;
}

export interface ContentElementNode {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: readonly ContentAttribute[];
  readonly children: readonly ContentNode[];
}

export type ContentNode =
  ContentTextNode | ContentCommentNode | ContentElementNode;

export interface SpecificField {
  readonly name: string;
  readonly value: string;
  readonly extraAttributes: readonly ContentAttribute[];
  readonly ordinal: number;
}

export interface RuleStatement {
  readonly name: string;
  readonly attributes: readonly ContentAttribute[];
  readonly text: string;
  readonly children: readonly ContentNode[];
  readonly ordinal: number;
}

export interface ContentProvenance {
  readonly sourceKey: string;
  readonly sourceOrdinal: number;
}

export interface EntityExtension {
  readonly ordinal: number;
  readonly node: ContentNode;
}

export interface ContentEntity {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly source: string;
  readonly sources: readonly string[];
  readonly revisionDate?: string;
  readonly attributes: readonly ContentAttribute[];
  readonly categories: readonly string[];
  readonly flavor?: string;
  readonly prerequisites?: string;
  readonly printPrerequisites?: string;
  readonly specifics: readonly SpecificField[];
  readonly rules: readonly RuleStatement[];
  readonly description: string;
  readonly extensions: readonly EntityExtension[];
  readonly provenance: ContentProvenance;
}

export interface ParsedContentEntity extends ContentEntity {
  readonly content: readonly ContentNode[];
}

export interface RejectedContentRecord {
  readonly ordinal: number;
  readonly reason: string;
  readonly content: ContentElementNode;
}

export interface ContentAccounting {
  readonly topLevelRecords: number;
  readonly acceptedRecords: number;
  readonly warnedRecords: number;
  readonly rejectedRecords: number;
  readonly rawTopLevelElements: number;
}

export interface ParsedContentSource {
  readonly gameSystem: string;
  readonly sourceKey: string;
  readonly entities: readonly ParsedContentEntity[];
  readonly rejected: readonly RejectedContentRecord[];
  readonly rawTopLevel: readonly ContentNode[];
  readonly diagnostics: readonly ContentDiagnostic[];
  readonly accounting: ContentAccounting;
}

export function getAttribute(
  attributes: readonly ContentAttribute[],
  name: string,
): string | undefined {
  const expected = name.toLocaleLowerCase();
  return attributes.find(
    (attribute) => attribute.name.toLocaleLowerCase() === expected,
  )?.value;
}

export function getElementText(node: ContentElementNode): string {
  return node.children
    .map((child) => {
      if (child.kind === "text") return child.value;
      if (child.kind === "element") return getElementText(child);
      return "";
    })
    .join("");
}

export function normalizeDisplayText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}
