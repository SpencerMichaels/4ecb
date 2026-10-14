import type { ReactNode } from "react";

export type ProseBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | {
      readonly kind: "table";
      readonly headers?: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly start?: number;
      readonly items: readonly string[];
    };

const BULLET_LINE = /^[-*•✦]\s*(\S.*)$/u;
const NUMBERED_LINE = /^(\d+)[.)]\s+(\S.*)$/u;
const HEADING_CONNECTORS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/**
 * Some legacy compendium fields contain presentation-only table or paragraph
 * tags. Convert only that small, known-safe vocabulary to plain-text structure;
 * unfamiliar markup remains literal text and is escaped by React.
 */
function normalizeLegacyStructure(value: string): string {
  return value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/?(?:table|thead|tbody|tfoot|tr|p|div)(?:\s[^>]*)?>/giu, "\n")
    .replace(/<(?:td|th)(?:\s[^>]*)?>/giu, "")
    .replace(/<\/(?:td|th)>/giu, " · ")
    .replace(/\s*·\s*\n/gu, "\n")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function isRecognizableHeading(line: string): boolean {
  if (line.length > 120 || !/\p{L}/u.test(line) || line.includes(" · "))
    return false;
  if (line.endsWith(":")) return true;

  const letters = line.match(/\p{L}/gu) ?? [];
  if (
    letters.length > 1 &&
    letters.every((letter) => letter === letter.toLocaleUpperCase())
  )
    return true;

  if (/[.!?;]$/u.test(line)) return false;
  const words = line.split(/\s+/u);
  return (
    words.length <= 12 &&
    words.every((word, index) => {
      const bare = word.replaceAll(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!bare) return true;
      if (index > 0 && HEADING_CONNECTORS.has(bare.toLocaleLowerCase()))
        return true;
      return /^(?:\p{Lu}|\p{N})/u.test(bare);
    })
  );
}

/**
 * Interprets legacy authored prose without changing the imported value.
 * Every non-empty source line is one block; source indentation and repeated
 * blank lines are presentation noise, while contiguous list markers remain a
 * semantic list.
 */
function plainProseBlocks(value: string): readonly ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let list:
    | {
        ordered: boolean;
        start?: number;
        items: string[];
      }
    | undefined;

  const flushList = () => {
    if (list === undefined) return;
    blocks.push({ kind: "list", ...list });
    list = undefined;
  };

  for (const sourceLine of normalizeLegacyStructure(value)
    .replace(/\r\n?/gu, "\n")
    .split("\n")) {
    const line = sourceLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const numbered = line.match(NUMBERED_LINE);
    const bullet = numbered === null ? line.match(BULLET_LINE) : null;
    if (numbered !== null || bullet !== null) {
      const ordered = numbered !== null;
      const text = (numbered?.[2] ?? bullet?.[1] ?? "").trim();
      if (list === undefined || list.ordered !== ordered) {
        flushList();
        list = {
          ordered,
          ...(numbered === null ? {} : { start: Number(numbered[1]) }),
          items: [],
        };
      }
      list.items.push(text);
      continue;
    }

    flushList();
    blocks.push(
      isRecognizableHeading(line)
        ? { kind: "heading", text: line.replace(/:$/u, "") }
        : { kind: "paragraph", text: line },
    );
  }
  flushList();
  return blocks;
}

/** Legacy tables occur both as HTML cells and tab-separated lines inside
 * <table>. Extract text only; never inject corpus markup into the DOM. */
function legacyTable(
  value: string,
): Extract<ProseBlock, { kind: "table" }> | undefined {
  const taggedRows = [
    ...value.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr\s*>/giu),
  ];
  const rows =
    taggedRows.length > 0
      ? taggedRows.map((row) =>
          [
            ...(row[1] ?? "").matchAll(
              /<(td|th)(?:\s[^>]*)?>([\s\S]*?)<\/(?:td|th)\s*>/giu,
            ),
          ].map((cell) => normalizeLegacyStructure(cell[2] ?? "").trim()),
        )
      : value
          .trim()
          .split(/\r?\n/u)
          .filter((line) => line.trim())
          .map((line) =>
            line
              .split("\t")
              .map((cell) => normalizeLegacyStructure(cell).trim()),
          );
  const columns = rows[0]?.length ?? 0;
  if (
    columns < 2 ||
    rows.length < 2 ||
    rows.some((row) => row.length !== columns)
  )
    return undefined;
  const hasHeaders =
    taggedRows.length === 0 || /<th(?:\s|>)/iu.test(taggedRows[0]?.[1] ?? "");
  return hasHeaders
    ? { kind: "table", headers: rows[0]!, rows: rows.slice(1) }
    : { kind: "table", rows };
}

export function proseBlocks(value: string): readonly ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let start = 0;
  for (const match of value.matchAll(
    /<table(?:\s[^>]*)?>([\s\S]*?)<\/table\s*>/giu,
  )) {
    const table = legacyTable(match[1] ?? "");
    if (table === undefined) continue;
    blocks.push(...plainProseBlocks(value.slice(start, match.index)), table);
    start = match.index + match[0].length;
  }
  return [...blocks, ...plainProseBlocks(value.slice(start))];
}

export function ProseBlocks({
  blocks,
  className,
  renderText = (text) => text,
}: {
  readonly blocks: readonly ProseBlock[];
  readonly className?: string;
  readonly renderText?: (text: string) => ReactNode;
}) {
  const content: ReactNode[] = blocks.map((block, index) => {
    if (block.kind === "table")
      return (
        <table className="prose-table" key={index}>
          {block.headers === undefined ? null : (
            <thead>
              <tr>
                {block.headers.map((text, column) => (
                  <th scope="col" key={column}>
                    {renderText(text)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((text, column) => (
                  <td key={column}>{renderText(text)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    if (block.kind === "heading")
      return <h6 key={index}>{renderText(block.text)}</h6>;
    if (block.kind === "paragraph")
      return (
        <p className="prose-paragraph" key={index}>
          {renderText(block.text)}
        </p>
      );
    const items = block.items.map((item, itemIndex) => (
      <li key={itemIndex}>{renderText(item)}</li>
    ));
    return block.ordered ? (
      <ol key={index} start={block.start}>
        {items}
      </ol>
    ) : (
      <ul key={index}>{items}</ul>
    );
  });

  return (
    <div className={["prose-blocks", className].filter(Boolean).join(" ")}>
      {content}
    </div>
  );
}

export function Prose({
  value,
  className,
  renderText,
}: {
  readonly value: string;
  readonly className?: string;
  readonly renderText?: (text: string) => ReactNode;
}) {
  return (
    <ProseBlocks
      blocks={proseBlocks(value)}
      {...(className === undefined ? {} : { className })}
      {...(renderText === undefined ? {} : { renderText })}
    />
  );
}
