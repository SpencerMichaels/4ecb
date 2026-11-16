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
 * Some legacy compendium fields contain presentation-only table, paragraph
 * or `<rule>` callout tags (inline emphasis is dropped at pack build).
 * Convert only that small, known-safe vocabulary to plain-text structure;
 * unfamiliar markup remains literal text and is escaped by React.
 */
function normalizeLegacyStructure(value: string): string {
  return value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(
      /<\/?(?:table|thead|tbody|tfoot|tr|p|div|rule)(?:\s[^>]*)?>|<\/(?:table|rule)(?=\s|$)/giu,
      "\n",
    )
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
function plainProseBlocks(
  value: string,
  trailing = false,
): readonly ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let lastLine = "";
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
    lastLine = line;
    blocks.push(
      isRecognizableHeading(line)
        ? { kind: "heading", text: line.replace(/:$/u, "") }
        : { kind: "paragraph", text: line },
    );
  }
  flushList();
  // A heading introduces following content; one with nothing after it is prose.
  if (trailing && blocks.at(-1)?.kind === "heading")
    blocks[blocks.length - 1] = { kind: "paragraph", text: lastLine };
  return blocks;
}

/** An artifact's concordance row ends in its score change ("+1d10",
 *  "–2", "5"); a line without one wraps on into the next line. */
const SCORE_ROW = /^(.*\S)\s+([+\-–−]?\d+(?:d\d+)?)$/u;
const SCORE = /^[+\-–−]?\d+(?:d\d+)?$/u;

/** The rows of a table authored without tabs whose every row ends in a
 *  score (the artifacts' concordance tables): the label, wrapped lines
 *  joined, and the score. Undefined for any other shape. */
function scoreRows(value: string): string[][] | undefined {
  const lines = value
    .split(/\r?\n/u)
    .map((line) => normalizeLegacyStructure(line).trim())
    .filter((line) => line !== "");
  const rows: string[][] = [];
  let label: string[] = [];
  for (const line of lines) {
    const match = line.match(SCORE_ROW);
    if (match === null) {
      label.push(line);
      continue;
    }
    rows.push([[...label, match[1] ?? ""].join(" "), match[2] ?? ""]);
    label = [];
  }
  return label.length === 0 && rows.length >= 2 ? rows : undefined;
}

/** Legacy tables occur both as HTML cells and tab-separated lines inside
 * <table>, and the concordance tables as score-ended lines without tabs.
 * Extract text only; never inject corpus markup into the DOM. */
function legacyTable(
  value: string,
): Extract<ProseBlock, { kind: "table" }> | undefined {
  const taggedRows = [
    ...value.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr\s*>/giu),
  ];
  const tabRows = (separator: string | RegExp) =>
    value
      .trim()
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) =>
        line
          .split(separator)
          .map((cell) => normalizeLegacyStructure(cell).trim()),
      );
  const uniform = (table: readonly (readonly string[])[]) =>
    table.every((row) => row.length === table[0]?.length);
  let rows =
    taggedRows.length > 0
      ? taggedRows.map((row) =>
          [
            ...(row[1] ?? "").matchAll(
              /<(td|th)(?:\s[^>]*)?>([\s\S]*?)<\/(?:td|th)\s*>/giu,
            ),
          ].map((cell) => normalizeLegacyStructure(cell[2] ?? "").trim()),
        )
      : tabRows("\t");
  // A doubled tab in one row (the Unconquered Standard of Arkhosia's
  // concordance) is spacing, not an empty cell, when collapsing it evens
  // the rows out.
  if (taggedRows.length === 0 && !uniform(rows)) {
    const collapsed = tabRows(/\t+/u);
    if (uniform(collapsed)) rows = collapsed;
  }
  if (taggedRows.length === 0 && !value.includes("\t")) {
    const scored = scoreRows(value);
    return scored === undefined ? undefined : { kind: "table", rows: scored };
  }
  const columns = rows[0]?.length ?? 0;
  if (
    columns < 2 ||
    rows.length < 2 ||
    rows.some((row) => row.length !== columns)
  )
    return undefined;
  // A tab-separated table's first row names its columns, unless it ends in
  // a score: a concordance table starts with "Starting score\t5".
  const hasHeaders =
    taggedRows.length === 0
      ? !SCORE.test(rows[0]?.at(-1) ?? "")
      : /<th(?:\s|>)/iu.test(taggedRows[0]?.[1] ?? "");
  return hasHeaders
    ? { kind: "table", headers: rows[0]!, rows: rows.slice(1) }
    : { kind: "table", rows };
}

const SEE_BELOW_LEAD = /^see below\s*[:.]?$/iu;

/** The books' "See Below:" pointed from a stat block down to the bulleted
 *  rules after it; in a card or pane the list follows directly, so a field
 *  whose first line only says "see below" drops that line when a list comes
 *  next, on every surface. Display only: the stored text keeps it. */
function withoutSeeBelowLead(
  blocks: readonly ProseBlock[],
): readonly ProseBlock[] {
  const [lead, next] = blocks;
  return (lead?.kind === "heading" || lead?.kind === "paragraph") &&
    SEE_BELOW_LEAD.test(lead.text.trim()) &&
    next?.kind === "list"
    ? blocks.slice(1)
    : blocks;
}

const TABLE_OPEN = /<table(?:\s[^>]*)?>/giu;
const TABLE_END = /<\/table(?:\s*>|(?=\s|$))|<table(?:\s[^>]*)?>/iu;

/**
 * The legacy tables in a value, tolerating the corpus's unbalanced markup:
 * a table ends at its `</table>` (also when authored without its `>`, as
 * in the Skull of Sartine and Unconquered Standard of Arkhosia artifacts),
 * at a second `<table>` (authored where the closing tag belonged, as in the
 * Wave artifact), or at the end of the text. A stray `</table>` outside a
 * table is only a line break.
 */
function legacyTableSpans(
  value: string,
): { start: number; end: number; body: string }[] {
  const spans: { start: number; end: number; body: string }[] = [];
  TABLE_OPEN.lastIndex = 0;
  for (;;) {
    const open = TABLE_OPEN.exec(value);
    if (open === null) break;
    const bodyStart = open.index + open[0].length;
    const close = TABLE_END.exec(value.slice(bodyStart));
    const bodyEnd = close === null ? value.length : bodyStart + close.index;
    const end = close === null ? bodyEnd : bodyEnd + close[0].length;
    spans.push({
      start: open.index,
      end,
      body: value.slice(bodyStart, bodyEnd),
    });
    TABLE_OPEN.lastIndex = end;
  }
  return spans;
}

export function proseBlocks(value: string): readonly ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let start = 0;
  for (const span of legacyTableSpans(value)) {
    const table = legacyTable(span.body);
    if (table === undefined) continue;
    blocks.push(...plainProseBlocks(value.slice(start, span.start)), table);
    start = span.end;
  }
  return withoutSeeBelowLead([
    ...blocks,
    ...plainProseBlocks(value.slice(start), true),
  ]);
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
