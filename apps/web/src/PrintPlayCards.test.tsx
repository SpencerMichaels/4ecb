import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterPortrait } from "@4ecb/character-domain";
import type { CharacterSheetModel } from "@4ecb/sheet-model";

import { PrintCharacterCard, PrintSkillsCard } from "./PrintPlayCards";

const value = (label: string, v: string) => ({ label, value: v });
const model = {
  identity: [
    value("Race", "Dwarf"),
    value("Class", "Paladin"),
    value("Level", "7"),
  ],
  defenses: [
    value("AC", "24"),
    value("Fortitude", "20"),
    value("Reflex", "16"),
    value("Will", "19"),
  ],
  resources: [
    value("Hit Points", "71"),
    value("Healing Surges", "13"),
    value("Healing Surge Value", "17"),
    value("Initiative", "2"),
    value("Speed", "5"),
  ],
  senses: [value("Passive Insight", "18"), value("Passive Perception", "13")],
  overview: {
    bloodied: "35",
    vision: "Low-light vision",
    saves: "+1",
    defensiveTraits: [
      { label: "Resistance", value: "Fire 5", source: "Cloak" },
      { label: "Resistance", value: "Cold 7", source: "Feat" },
      { label: "Vulnerability", value: "Radiant 5", source: "Curse" },
      { label: "Saving throws", value: "+2 against poison", source: "Dwarf" },
    ],
    abilities: [{ name: "Strength", score: "16", modifier: "+3", check: "+6" }],
    skills: [
      { name: "Athletics", ability: "STR", bonus: "+10", trained: true },
      { name: "Bluff", ability: "CHA", bonus: "+7", trained: false },
    ],
  },
} as unknown as CharacterSheetModel;

describe("printed play-data cards", () => {
  it("shows defenses, health, movement, passives and ability scores", () => {
    const html = renderToStaticMarkup(
      <PrintCharacterCard
        model={model}
        name="Ingi"
        portrait={
          { renderedDataUrl: "data:image/png;base64,AA==" } as CharacterPortrait
        }
        blankHP={false}
      />,
    );
    expect(html).toContain(
      '<p class="print-play-identity">Dwarf Paladin 7</p>',
    );
    expect(html).toContain('class="print-play-portrait"');
    expect(html).toContain("<strong>Senses</strong> Low-light vision");
    expect(html).toContain("<strong>Saves</strong> +1; +2 vs poison");
    expect(html).toContain("<strong>Resistances</strong> 5 fire, 7 cold");
    expect(html).toContain("<strong>Vulnerabilities</strong> 5 radiant");
    expect(html).not.toContain("Immunities");
    expect(html).toContain("<dt>AC</dt><dd>24</dd>");
    expect(html).toContain("<dt>Bloodied</dt><dd>35</dd>");
    expect(html).toContain("<dt>Surge HP</dt><dd>17</dd>");
    expect(html).toContain("<dt>Init</dt><dd>+2</dd>");
    expect(html).toContain("<dt>Pass. Insight</dt><dd>18</dd>");
    expect(html).toContain(
      '<dt><span class="stat-tile-lead">16</span><span class="stat-tile-label">STR</span></dt><dd>+3</dd>',
    );
    expect(html).toContain("<span>Play data</span>");
    expect(
      renderToStaticMarkup(
        <PrintCharacterCard
          model={model}
          name="Ingi"
          portrait={undefined}
          blankHP
        />,
      ),
    ).toContain("<dt>Max HP</dt><dd></dd>");
  });

  it("lists every skill with ability, bonus and training", () => {
    const html = renderToStaticMarkup(<PrintSkillsCard model={model} />);
    expect(html).toContain(
      '<p class="print-play-trained-key"><sup class="print-play-trained">T</sup> Trained</p>',
    );
    expect(html).toContain('<th scope="col">Skill</th>');
    expect(html).not.toContain("<header>");
    expect(html).toContain(
      'Athletics<sup class="print-play-trained" aria-label="Trained">T</sup>',
    );
    expect(html).toContain(
      '<td class="print-play-skill-ability">CHA</td><td class="print-play-skill-bonus">+7</td>',
    );
  });
});
