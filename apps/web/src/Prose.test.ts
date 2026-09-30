import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Prose, proseBlocks } from "./Prose";

describe("shared prose renderer", () => {
  it("removes source indentation and treats every non-empty line as a paragraph", () => {
    const source =
      "    First paragraph.\r\n\tSecond paragraph.\r\n\r\n\r\n  Third paragraph.";

    expect(proseBlocks(source)).toEqual([
      { kind: "paragraph", text: "First paragraph." },
      { kind: "paragraph", text: "Second paragraph." },
      { kind: "paragraph", text: "Third paragraph." },
    ]);
    expect(source).toContain("    First paragraph.");
  });

  it("preserves recognizable headings and contiguous unordered and numbered lists", () => {
    expect(
      proseBlocks(
        [
          "  DIVINE SANCTION",
          "  Many paladin powers impose this mark.",
          "  Benefits:",
          "    • First benefit",
          "    *Second benefit",
          "",
          "  3. Third step",
          "  4) Fourth step",
        ].join("\n"),
      ),
    ).toEqual([
      { kind: "heading", text: "DIVINE SANCTION" },
      {
        kind: "paragraph",
        text: "Many paladin powers impose this mark.",
      },
      { kind: "heading", text: "Benefits" },
      {
        kind: "list",
        ordered: false,
        items: ["First benefit", "Second benefit"],
      },
      {
        kind: "list",
        ordered: true,
        start: 3,
        items: ["Third step", "Fourth step"],
      },
    ]);
  });

  it("escapes corpus text instead of interpreting it as HTML", () => {
    const markup = renderToStaticMarkup(
      createElement(Prose, {
        value: '<img src=x onerror="alert(1)">\n- <script>unsafe()</script>',
      }),
    );

    expect(markup).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(markup).toContain("&lt;script&gt;unsafe()&lt;/script&gt;");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<script>");
  });

  it("turns known legacy layout tags into readable plain-text blocks", () => {
    expect(
      proseBlocks(
        "<table><tr><th>Level</th><th>Hunter's Quarry</th></tr><tr><td>1</td><td>1d6</td></tr></table>",
      ),
    ).toEqual([
      { kind: "paragraph", text: "Level · Hunter's Quarry" },
      { kind: "paragraph", text: "1 · 1d6" },
    ]);

    const markup = renderToStaticMarkup(
      createElement(Prose, {
        value: "Use one option.<br>Then continue &amp; resolve it.",
      }),
    );
    expect(markup).toContain("Use one option.");
    expect(markup).toContain("Then continue &amp; resolve it.");
    expect(markup).not.toContain("&lt;br&gt;");
  });
});
