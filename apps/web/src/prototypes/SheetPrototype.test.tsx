import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetPrototype } from "./SheetPrototype";

describe("isolated sheet design prototype", () => {
  it("provides all four reference surfaces without real character data", () => {
    const markup = renderToStaticMarkup(<SheetPrototype />);
    for (const id of ["summary", "scratchpad", "features", "record"])
      expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain("no character data changed");
    expect(markup).toContain("Illustrative content, not calculated rules");
    expect(markup).toContain("Paper");
    expect(markup).toContain("Monochrome");
  });
  it("keeps tracking spaces, shared usage, and full rules explicit", () => {
    const markup = renderToStaticMarkup(<SheetPrototype />);
    expect(
      markup.match(/viewBox="0 0 24 24" aria-hidden="true"><path/g),
    ).toHaveLength(10);
    expect(markup).toContain("One use of either per encounter");
    expect(markup).toContain("Current HP");
    expect(markup).toContain("Temporary HP");
    expect(markup).toContain("Conditions &amp; temporary effects");
    expect(markup).toContain("When an effect would move you");
  });
});
