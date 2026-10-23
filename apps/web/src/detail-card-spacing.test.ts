import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ContentEntity, RuleStatement } from "@4ecb/content-domain";
import type { CandidateDecision } from "@4ecb/rules-engine";

import {
  authoredBuilderCardSettings,
  BuilderCardContext,
} from "./BuilderCards";
import { CandidateDetail } from "./CandidateDetail";
import {
  auditCard,
  CardStyleSheet,
  cardDocument,
  formatFindings,
  headingStyleFindings,
  unevenGapFindings,
  type CardAudit,
  type Finding,
} from "./test-card-style-audit";

/*
 * Spacing audit of the builder's detail cards for choices other than powers
 * and items (`reference-entity-card`, D079) and the stacks around them: each
 * fixture below is rendered by `CandidateDetail`, styled with the app's
 * stylesheets, and checked by `test-card-style-audit.ts`. A new card variant
 * or body branch belongs in `FIXTURES`. Set FOURECB_CARD_AUDIT=verbose to
 * print every gap measured.
 */

function entity(
  id: string,
  name: string,
  type: string,
  fields: Readonly<Record<string, string>>,
  extra: Partial<ContentEntity> = {},
): ContentEntity {
  return {
    id,
    name,
    type,
    source: "Synthetic Test",
    sources: ["Synthetic Test"],
    attributes: [],
    categories: [],
    specifics: Object.entries(fields).map(([fieldName, value], ordinal) => ({
      name: fieldName,
      value,
      extraAttributes: [],
      ordinal,
    })),
    rules: [],
    description: "",
    extensions: [],
    provenance: { sourceKey: "test", sourceOrdinal: 0 },
    ...extra,
  };
}

function grant(id: string, type: string, level?: number): RuleStatement {
  return {
    name: "grant",
    attributes: [
      { name: "name", value: id },
      { name: "type", value: type },
      ...(level === undefined ? [] : [{ name: "level", value: String(level) }]),
    ],
    text: "",
    children: [],
    ordinal: 0,
  };
}

const FLAVOR =
  "A long-standing pact binds you to a power beyond the mortal world.";
const PARAGRAPHS =
  "You gain a bonus to the damage rolls of your attack powers.\nThe bonus increases at 5th level.";

const power = entity("POWER_STEP", "Soul Step", "Power", {
  "Power Usage": "Encounter",
  "Action Type": "Move Action",
  Effect: "You teleport 3 squares.",
});
const boon = entity(
  "FEATURE_BOON",
  "Test Pact Boon",
  "Class Feature",
  {
    "Short Description": "You gain the soul step power.",
    Level: "1",
    Powers: "POWER_STEP",
  },
  {
    flavor: FLAVOR,
    description: "You gain the soul step power.",
    rules: [grant("POWER_STEP", "Power")],
  },
);
const reward = entity(
  "FEATURE_REWARD",
  "Test Pact Reward",
  "Class Feature",
  { Level: "1", "Pact Reward": "" },
  { flavor: FLAVOR, description: PARAGRAPHS },
);
const later = entity(
  "FEATURE_LATER",
  "Test Pact Mastery",
  "Class Feature",
  { Level: "9", "Rules Item": "MASTERY:\nYou never miss.\nYou never tire." },
  { description: "Your pact deepens." },
);
const pact = entity(
  "PACT_TEST",
  "Test Pact",
  "Trait Package",
  {
    _PARSED_CLASS_FEATURE: "FEATURE_BOON,FEATURE_REWARD,FEATURE_LATER",
    "Short Description": "You have the test pact.",
  },
  {
    flavor: FLAVOR,
    printPrerequisites: "Hexblade",
    description: "You gain the following benefits:",
  },
);
const feat = entity(
  "FEAT_TEST",
  "Test Feat",
  "Feat",
  {
    Tier: "Heroic",
    Special: "You can take this feat more than once.",
  },
  {
    flavor: FLAVOR,
    printPrerequisites: "Dex 13\nTrained in Acrobatics",
    description: "Benefit: You gain a +2 bonus to Acrobatics checks.",
  },
);
const pathFeature = entity(
  "PATH_ACTION",
  "Test Path Action",
  "Class Feature",
  { Level: "11" },
  { description: "When you spend an action point, you gain combat advantage." },
);
const pathFeatureLater = entity(
  "PATH_LATER",
  "Test Path Insight",
  "Class Feature",
  { Level: "16" },
  { description: "You gain a +2 bonus to Insight checks." },
);
const paragonPath = entity(
  "PATH_TEST",
  "Test Path",
  "Paragon Path",
  { "Class Features": "PATH_ACTION,PATH_LATER" },
  {
    flavor: FLAVOR,
    printPrerequisites: "Hexblade",
    description: PARAGRAPHS,
  },
);
const destinyFeature = entity(
  "DESTINY_IMMORTALITY",
  "Test Immortality",
  "Class Feature",
  { Level: "30" },
  { description: "You join the ranks of the immortals." },
);
const epicDestiny = entity(
  "DESTINY_TEST",
  "Test Destiny",
  "Epic Destiny",
  { "Class Features": "DESTINY_IMMORTALITY" },
  {
    printPrerequisites: "21st level",
    description: "Immortality: You live forever.",
  },
);
const domain = entity(
  "DOMAIN_MOON",
  "Moon",
  "Domain",
  {},
  { description: "The moon's light guides travelers." },
);
const deity = entity(
  "DEITY_TEST",
  "Test Deity",
  "Deity",
  { Domains: "DOMAIN_MOON", Alignment: "Good" },
  { description: "A goddess of the moon.\nHer followers travel by night." },
);
const theme = entity(
  "THEME_TEST",
  "Test Theme",
  "Theme",
  { Level: "1" },
  {
    flavor: FLAVOR,
    description:
      "Order adepts study magic in academies.\nThey are respected scholars.",
  },
);
const trait = entity(
  "TRAIT_TEST",
  "Test Trait",
  "Racial Trait",
  {},
  { description: "You can see in dim light." },
);
const race = entity(
  "RACE_TEST",
  "Test Race",
  "Race",
  {
    "Ability Scores": "+2 Strength, +2 Wisdom",
    Size: "Medium",
    Speed: "6 squares",
    "Racial Traits": "TRAIT_TEST",
    Playing: "Test folk are steady.",
    "Short Description": "Steady folk.",
  },
  { flavor: FLAVOR, description: "Test folk live in the hills." },
);
const classFeature = entity(
  "FEATURE_CLASS",
  "Test Curse",
  "Class Feature",
  {},
  { description: "You curse an enemy." },
);
const testClass = entity(
  "CLASS_TEST",
  "Test Class",
  "Class",
  {
    Role: "Striker. You deal damage.",
    "Power Source": "Arcane. You draw on magic.",
    "Key Abilities": "Charisma, Constitution",
    "Hit Points at 1st Level": "12 + Constitution score",
    "Healing Surges": "6 + Constitution modifier",
    "Armor Proficiencies": "Cloth, leather",
    _PARSED_CLASS_FEATURE: "FEATURE_CLASS",
    Creating: "Choose a pact.",
  },
  { flavor: FLAVOR, description: "Test class description." },
);
const background = entity(
  "BACKGROUND_TEST",
  "Test Background",
  "Background",
  {
    Benefit: "You gain a +2 bonus to History checks.",
    "Associated Skills": "History, Insight",
    "Common Knowledge": "Scholars gather in libraries.",
  },
  { description: "You grew up among books.", printPrerequisites: "Human" },
);
const alignment = entity(
  "ALIGNMENT_GOOD",
  "Good",
  "Alignment",
  {},
  { description: "Protect the weak." },
);
const ritual = entity(
  "RITUAL_TEST",
  "Test Ritual",
  "Ritual",
  { Level: "1", Category: "Travel", "Component Cost": "10 gp" },
  { description: "You open a door." },
);
const familiar = entity(
  "FAMILIAR_TEST",
  "Test Familiar",
  "Familiar",
  { "Constant Benefits": "You gain darkvision." },
  { description: "A small spirit companion." },
);

const ALL = [
  power,
  boon,
  reward,
  later,
  pact,
  feat,
  pathFeature,
  pathFeatureLater,
  paragonPath,
  destinyFeature,
  epicDestiny,
  domain,
  deity,
  theme,
  trait,
  race,
  classFeature,
  testClass,
  background,
  alignment,
  ritual,
  familiar,
];
const byId = new Map(ALL.map((item) => [item.id.toLocaleLowerCase(), item]));

/** Every body branch of the detail card, with the stacks that follow it. */
const FIXTURES: readonly (readonly [string, ContentEntity])[] = [
  ["generic entity", alignment],
  ["trait package (stack by level)", pact],
  ["class feature", boon],
  ["class feature with prose field", later],
  ["feat", feat],
  ["theme", theme],
  ["paragon path", paragonPath],
  ["epic destiny", epicDestiny],
  ["deity and domain", deity],
  ["race", race],
  ["class", testClass],
  ["background", background],
  ["ritual", ritual],
  ["familiar", familiar],
];

const candidateFor = (option: ContentEntity) =>
  ({
    definitionId: option.id,
    eligible: true,
    rulesLegal: true,
    reasons: [],
  }) as unknown as CandidateDecision;

function renderFixture(option: ContentEntity): string {
  return renderToStaticMarkup(
    createElement(
      BuilderCardContext.Provider,
      { value: authoredBuilderCardSettings(30) },
      createElement(CandidateDetail, {
        candidate: candidateFor(option),
        entity: option,
        byId,
      }),
    ),
  );
}

/** Power, item and familiar cards are the printed card format (PowerCard,
 * ItemCard), audited by the print checks, not here. */
const PRINT_FORMAT = ".print-reference-card";
const STACK =
  ".candidate-detail-stack, .candidate-detail-benefits, .detail-level-cards, .theme-power-cards";

const HEADING_ROLES = {
  "card section heading": ".reference-card-body h5",
  "prose heading": ".reference-card-body .prose-blocks > h6",
  "lore field heading": ".reference-card-body .entity-lore-field > h6",
  "field label": ".reference-card-body .candidate-fields dt",
  "stat label": ".reference-card-body .entity-stat-grid dt",
  "trait name": ".reference-card-body .entity-trait-list strong",
};

function auditFixtures(viewport: { width: number; height: number }) {
  const styles = new CardStyleSheet(viewport);
  const audits: CardAudit[] = FIXTURES.map(([name, option]) => {
    const document = cardDocument(renderFixture(option));
    const root = document.body.firstElementChild!;
    const audit = auditCard(styles, root, {
      card: name,
      gapScope: (element) =>
        element.closest(PRINT_FORMAT) === null &&
        (element.closest(".reference-card-body") !== null ||
          element.matches(STACK)),
      dividerScope: (element) =>
        element.closest(".reference-card-body") !== null,
      headingRoles: HEADING_ROLES,
    });
    return {
      ...audit,
      findings: audit.findings.filter(
        (finding) => !finding.path.includes("print-reference-card"),
      ),
    };
  });
  const gaps = audits.flatMap((audit) => audit.gaps);
  const findings: Finding[] = [
    ...audits.flatMap((audit) => audit.findings),
    ...unevenGapFindings(
      gaps.filter((gap) => gap.parent.includes("reference-card-body")),
    ),
    ...headingStyleFindings(audits),
  ];
  if (process.env.FOURECB_CARD_AUDIT === "verbose")
    process.stdout.write(
      `${gaps
        .map(
          (gap) =>
            `${gap.card} | ${gap.parent} | ${gap.before} -> ${gap.after}: ${String(gap.gap)}px`,
        )
        .join("\n")}\n`,
    );
  return findings;
}

describe("detail card spacing audit", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ])
    it(`finds no spacing problems at ${String(viewport.width)}px`, () => {
      const findings = auditFixtures(viewport);
      expect(formatFindings(findings)).toBe("");
    });
});

describe("the card style audit", () => {
  const audit = (css: string, markup: string) => {
    const styles = new CardStyleSheet({ width: 1440, height: 900 }, css);
    const root = cardDocument(`<div class="body">${markup}</div>`).body
      .firstElementChild!;
    const result = auditCard(styles, root, {
      card: "probe",
      gapScope: () => true,
      dividerScope: () => true,
      headingRoles: { label: "dt" },
    });
    return [...result.findings, ...unevenGapFindings(result.gaps)].map(
      ({ kind, detail }) => `${kind}: ${detail}`,
    );
  };

  it("reports browser-default spacing no rule overrides", () => {
    expect(audit("", "<dl><dt>Level</dt><dd>1</dd></dl>")).toEqual(
      expect.arrayContaining([
        "ua-fallback: margin-top is the browser default 1em (no rule sets it)",
        "ua-fallback: margin-left is the browser default 40px (no rule sets it)",
        'split-short-field: "Level" and its short value "1" sit on separate lines',
      ]),
    );
    // Overridden by any rule; inline label and value share a line.
    expect(
      audit(
        "dl, dd, p { margin: 0 } .body { display: grid; gap: 4px } dt, dd { display: inline }",
        "<dl><dt>Level</dt><dd>1</dd></dl><p>x</p>",
      ),
    ).toEqual([]);
  });

  it("reports touching blocks, uneven gaps and lopsided dividers", () => {
    const css = `p, section { margin: 0 } .body { display: grid; gap: 8px }
      .tight { margin-bottom: -8px }
      section { border-top: 1px solid; padding-top: 2px }`;
    expect(
      audit(
        css,
        "<p>a</p><p>b</p><p>c</p><p class='tight'>d</p><p>e</p><section><p>f</p></section>",
      ),
    ).toEqual([
      "no-gap: no space between p.tight and p",
      "uneven-gap: divider has 8px above but 2px below",
    ]);
    expect(
      audit(
        "p { margin: 0 } .body { display: grid; gap: 8px } .wide { margin-top: 4px }",
        "<p>a</p><p>b</p><p>c</p><p class='wide'>d</p>",
      ),
    ).toEqual([
      "uneven-gap: 12px between p and p.wide; the usual block gap is 8px",
    ]);
  });

  it("reports preserved source whitespace, stray indents and stretched buttons", () => {
    expect(
      audit(
        `p, div { margin: 0 } .body { display: grid; gap: 8px }
         .pre { white-space: pre-wrap } p { text-indent: 1.5em }`,
        "<div class='pre'>\n  1</div><p>first</p><p>second</p><button style='padding: 0'>More</button>",
      ),
    ).toEqual([
      'preserved-whitespace: white-space: pre-wrap keeps the source\'s "\\n  1" whitespace',
      "first-line-indent: text-indent 24px on text that doesn't continue a paragraph",
      "stretched-control: stretched across its grid column (no justify-self)",
    ]);
  });
});
