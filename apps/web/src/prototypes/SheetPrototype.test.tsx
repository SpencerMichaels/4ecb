import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { abilityCheckBonus, SheetPrototype } from "./SheetPrototype";

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
  it("prioritizes combat references, groups languages with skills and uses skull death markers", () => {
    const markup = renderToStaticMarkup(<SheetPrototype />);
    const summary = markup.split('id="summary"')[1]!.split("</article>")[0]!;
    expect(summary.indexOf("Defenses")).toBeLessThan(
      summary.indexOf(">Abilities</h3>"),
    );
    expect(summary.indexOf("Movement &amp; awareness")).toBeLessThan(
      summary.indexOf(">Abilities</h3>"),
    );
    expect(summary).toMatch(/sp-skills-column[\s\S]*Languages/);
    const scratchpad = markup
      .split('id="scratchpad"')[1]!
      .split("</article>")[0]!;
    expect(scratchpad.match(/lucide-skull/g)).toHaveLength(3);
    expect(scratchpad.indexOf("Ten healing surge hearts")).toBeLessThan(
      scratchpad.indexOf(">Resources</h3>"),
    );
    expect(scratchpad).not.toContain("<h2>");
    expect(scratchpad).not.toContain("Extended rest");
    const shared = scratchpad
      .split('class="sp-shared-resource"')[1]!
      .split("</tr>")[0]!;
    expect(shared).toContain("Channel Divinity");
    expect(shared.match(/action-type-icon/g)).toHaveLength(2);
  });
  it("groups reference cards by category and labels indexed powers with levels or nonlevel origins", () => {
    const markup = renderToStaticMarkup(<SheetPrototype />);
    for (const title of ["Class features", "Racial traits", "Feats"])
      expect(markup).toContain(`<h3>${title}</h3>`);
    expect(markup).toContain(
      "<span>Radiant Strike</span><small>Level 1</small>",
    );
    expect(markup).toContain(
      "<span>Boots of the Wayfarer</span><small>Item</small>",
    );
  });
  it("puts both ability bonuses above skills and clearly marks trained rows", () => {
    const markup = renderToStaticMarkup(<SheetPrototype />);
    expect(markup.indexOf(">Abilities</h3>")).toBeLessThan(
      markup.indexOf(">Skills</h3>"),
    );
    expect(markup).toContain("<dt>Mod</dt><dd>+4</dd>");
    expect(markup).toContain("<dt>Mod + ½ lvl</dt><dd>+8</dd>");
    expect(markup).toContain(
      'aria-label="Trained"><span class="sp-trained-marker">T</span>',
    );
    expect(abilityCheckBonus("-1", 7)).toBe("+2");
    expect(abilityCheckBonus("-2", 1)).toBe("-2");
    expect(abilityCheckBonus("-1", 2)).toBe("+0");
  });
});
