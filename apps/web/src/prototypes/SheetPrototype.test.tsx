import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abilityCheckBonus, SheetPrototype } from "./SheetPrototype";

describe("isolated sheet design prototype", () => {
  it("leads with skill names, superscripts training, subscripts abilities and leaves bonuses last", () => {
    const markup = renderToStaticMarkup(<SheetPrototype />);
    expect(markup).toContain(
      '<th scope="row">Athletics<sup class="sp-trained-marker" aria-hidden="true">T</sup><sub class="sp-skill-ability">STR</sub></th><td class="sp-skill-total">+11</td>',
    );
    const styles = readFileSync(
      new URL("./sheet-prototype.css", import.meta.url),
      "utf8",
    );
    expect(styles).toContain(".sp-ability-table tbody tr:nth-child(even)");
    expect(styles).toContain(".sp-skill-table tbody tr:nth-child(even)");
    expect(styles).not.toContain("tr.is-trained");
  });
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
    expect(markup).toContain("Channel Divinity");
    expect(markup).not.toContain("One use of either per encounter");
    expect(markup).not.toContain("Mark when used");
    expect(markup).not.toContain("Columns are separate encounters");
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
    expect(summary).toContain("Basic attacks");
    expect(summary).toContain("Dawnwatch Longsword +2");
    expect(summary).toContain("<span>Pass. Perception</span>");
    expect(summary).toContain('class="sp-training-key"');
    expect(summary).not.toContain('class="sp-skill-legend"');
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
    expect(markup).toContain('<th scope="col">+½ level</th>');
    expect(markup).toContain(
      '<th scope="row">Strength</th><td>18</td><td>+4</td><td>+8</td>',
    );
    expect(markup).not.toContain("sp-ability-bonuses");
    expect(markup).toContain('aria-label="Athletics, trained"');
    expect(abilityCheckBonus("-1", 7)).toBe("+2");
    expect(abilityCheckBonus("-2", 1)).toBe("-2");
    expect(abilityCheckBonus("-1", 2)).toBe("+0");
  });
  it("keeps XP and action points off the summary and groups saves with defenses", () => {
    const markup = renderToStaticMarkup(<SheetPrototype />);
    const summary = markup.split('id="summary"')[1]!.split("</article>")[0]!;
    expect(summary).not.toContain("Experience");
    expect(summary).not.toContain("Action points");
    expect(summary).toContain("<span>Surges</span>");
    expect(
      summary.indexOf("<span>Saves</span><strong>+1</strong>"),
    ).toBeLessThan(summary.indexOf(">Health</h3>"));
    expect(summary).toContain("<span>Fortitude</span><strong>21</strong>");
    expect(summary).toContain("<span>Reflex</span><strong>19</strong>");
    expect(summary).toContain("<span>Speed</span><strong>5</strong>");
    expect(summary).not.toContain("squares");
    expect(summary).toContain('class="sp-values sp-movement"');
    expect(summary.match(/class="sp-skill-table"/g)).toHaveLength(2);
    for (const id of ["scratchpad", "record"])
      expect(markup.split(`id="${id}"`)[1]!.split("</article>")[0]).toContain(
        "Experience",
      );
  });
});
