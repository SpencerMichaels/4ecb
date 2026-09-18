import type { ReactNode } from "react";

export type ProseBlock =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
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

function isRecognizableHeading(line: string): boolean {
  if (line.length > 120 || !/\p{L}/u.test(line)) return false;
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
export function proseBlocks(value: string): readonly ProseBlock[] {
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

  for (const sourceLine of value.replace(/\r\n?/gu, "\n").split("\n")) {
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

export function ProseBlocks({
  blocks,
  className,
}: {
  readonly blocks: readonly ProseBlock[];
  readonly className?: string;
}) {
  const content: ReactNode[] = blocks.map((block, index) => {
    if (block.kind === "heading") return <h6 key={index}>{block.text}</h6>;
    if (block.kind === "paragraph")
      return (
        <p className="prose-paragraph" key={index}>
          {block.text}
        </p>
      );
    const items = block.items.map((item, itemIndex) => (
      <li key={itemIndex}>{item}</li>
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
}: {
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <ProseBlocks
      blocks={proseBlocks(value)}
      {...(className === undefined ? {} : { className })}
    />
  );
}
