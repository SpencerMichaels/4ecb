/**
 * The visual-review verifier's per-character rules (see
 * verify-visual-review.ts): one rule per factual row of a review
 * character's page.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CharacterTransaction,
  type CharacterBuild,
} from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  commandForEvaluatedChoice,
  eligibleRitualAllowances,
  freeRitualAllowanceTexts,
  itemSetPartyCountName,
  knownRecords,
  ritualAllowanceStatuses,
  type EvaluatedCharacter,
} from "@4ecb/rules-engine";
import {
  classifyPowerCard,
  classifyPowerEntity,
  deityDomainsText,
  hybridClassName,
  FAMILIAR_RULES_REMINDER,
  powerActionLabel,
  sheetFamiliarCard,
  sheetItemSetCard,
} from "@4ecb/sheet-model";

import {
  evaluate,
  findOccurrence,
  replacementCommand,
} from "../../../scripts/native-character";
import { beastCompanionTitle } from "../src/BeastCompanionCard";
import { parsePartyPieces } from "../src/BuilderItemSetCard";
import { builderIssueGroups } from "../src/builder-diagnostics";
import {
  candidateReason,
  choiceSelectionTableKind,
  choiceTableSummary,
  contentSpecificValue,
  isCandidateVisible,
  isOptionalRetrainingChoice,
  legacyChoiceSection,
  retrainingCategory,
  themePowerGroups,
} from "../src/builder-ui";
import { candidateReferenceIndex } from "../src/CandidateSelectionTable";
import { CompanionNameFields } from "../src/CompanionNameFields";
import {
  detailStackEntries,
  namedClassFeatures,
  offeredDetailEntities,
} from "../src/detail-stack";
import {
  catalogItemDetail,
  inventoryItemDetail,
} from "../src/EquipmentWorkspace";
import {
  practiceKind,
  SHOP_BROWSE_CATEGORIES,
  shopBrowseCategory,
} from "../src/equipment-ui";
import { FamiliarCard } from "../src/FamiliarCard";
import { freebeeGiftCommand } from "../src/freebee-gifts";
import { HideFlavortextContext } from "../src/HideFlavortextContext";
import { ItemCard } from "../src/ItemCard";
import { ItemSetCard } from "../src/ItemSetCard";
import { PowerCard } from "../src/PowerCard";
import {
  RetrainingWorkspace,
  retrainingCategories,
} from "../src/RetrainingWorkspace";
import {
  KNOWN_RECORD_GROUPS,
  knownRecordKind as knownRecordKindOf,
  knownRecordSourceLabel,
  ritualAllowanceLabel,
  RitualsWorkspace,
} from "../src/RitualsWorkspace";
import { canonicalHashRedirect } from "../src/routes";

import { swapPresentationChecks } from "./visual-review-checks-later";

import {
  contains,
  createElement,
  elementsWithClass,
  equal,
  inOrder,
  lacks,
  markup,
  textOf,
  truthy,
  type Check,
  type Rule,
} from "./visual-review-assert";
import type { ReviewCharacter, ReviewContext } from "./visual-review-context";
import {
  candidateDetailHtml,
  choicesAt,
  entityName,
  itemDetailHtml,
  onScreenFeatureLabels,
  printedCard,
  printedDeck,
  printedPagesFor,
  selectedDefinition,
  type PrintedCard,
} from "./visual-review-surfaces";

const rules: Rule[] = [];
function rule(
  where: string,
  link: string,
  item: string,
  run: (
    c: ReviewCharacter,
    context: ReviewContext,
  ) => Check[] | Promise<Check[]>,
): void {
  rules.push({
    where,
    link,
    item,
    run: (context) => run(context.character(where), context),
  });
}

const key = (value: string) => value.trim().toLocaleLowerCase();

/* ------------------------------------------------------------------ */
/* Shared checks                                                       */
/* ------------------------------------------------------------------ */

/** A reference entry's heading as printed: "Name: choice". */
function referenceHeadings(c: ReviewCharacter): string[] {
  return printedPagesFor(c).references.map((entry) =>
    entry.choice === undefined ? entry.name : `${entry.name}: ${entry.choice}`,
  );
}

function printedHeading(c: ReviewCharacter, heading: string): Check[] {
  const headings = referenceHeadings(c);
  return [
    truthy(
      `Reference heading "${heading}"`,
      headings.includes(heading),
      headings.includes(heading)
        ? "present"
        : `headings with that name: ${JSON.stringify(headings.filter((value) => key(value).startsWith(key(heading.split(":")[0]!))))}`,
    ),
    contains(
      `Printed pages show "${heading}"`,
      printedPagesFor(c).text,
      heading,
    ),
  ];
}

function onScreenFeature(c: ReviewCharacter, label: string): Check {
  const labels = onScreenFeatureLabels(c.sheet);
  return truthy(
    `On-screen feature list has "${label}"`,
    labels.includes(label),
    labels.includes(label)
      ? "present"
      : `rows with that name: ${JSON.stringify(labels.filter((value) => key(value).startsWith(key(label.split(":")[0]!))))}`,
  );
}

/** Background cards in order, then "Background benefit: …" with its text. */
function backgroundCards(
  c: ReviewCharacter,
  expectedBackgrounds: readonly string[],
): Check[] {
  const entries = printedPagesFor(c).references.filter(
    (entry) => entry.group === "Background",
  );
  const names = entries.map((entry) => entry.name);
  const benefit = entries.at(-1);
  const benefitText = JSON.stringify(benefit?.parts ?? []);
  return [
    equal("Background cards, then the benefit card", names, [
      ...expectedBackgrounds,
      "Background benefit",
    ]),
    truthy(
      'The benefit card names its choice ("Background benefit: …")',
      benefit?.choice !== undefined && benefit.choice !== "",
      `choice ${JSON.stringify(benefit?.choice)}`,
    ),
    truthy(
      "The benefit card has its Benefit text",
      /"label":"Benefit"/.test(benefitText),
      benefitText.slice(0, 200),
    ),
    contains(
      "Printed pages show the benefit heading",
      printedPagesFor(c).text,
      `Background benefit: ${benefit?.choice ?? ""}`,
    ),
  ];
}

function classIdentity(c: ReviewCharacter, expected: string): Check[] {
  const value = c.sheet.identity.find(({ label }) => label === "Class")?.value;
  return [
    equal("Class identity value", value, expected),
    contains("Printed identity shows it", printedPagesFor(c).text, expected),
  ];
}

/** An inventory item (by name) and its sheet item card. */
function freeItem(c: ReviewCharacter, name: string): Check[] {
  const entry = c.build.inventory.find((holding) =>
    holding.elements.some((element) => key(element.name) === key(name)),
  );
  const card = c.sheet.items.find((item) => key(item.name).includes(key(name)));
  return [
    truthy(
      `${name} is in the inventory`,
      entry !== undefined,
      entry === undefined
        ? `inventory: ${c.build.inventory.map((holding) => holding.name ?? holding.elements.map((element) => element.name).join(" + ")).join("; ")}`
        : `holding ${entry.id}`,
    ),
    truthy(
      `${name} has a sheet item card`,
      card !== undefined,
      card === undefined
        ? `item cards: ${c.sheet.items.map((item) => item.name).join("; ")}`
        : card.name,
    ),
  ];
}

/** Whether a detail pane renders the item card (not a reference card). */
function itemCardDetail(html: string, name: string): Check[] {
  return [
    contains(
      `Detail pane renders an item card for ${name}`,
      html,
      "print-item-card",
    ),
    lacks("No reference-entity card", html, "reference-entity-card"),
  ];
}

/** The power kind a swap must match: usage and attack/utility. */
function powerKind(c: ReviewCharacter, id: string): string {
  const entity = c.context.byId.get(key(id));
  if (entity === undefined) return `unknown ${id}`;
  if (key(entity.type) !== "power") return key(entity.type);
  const classification = classifyPowerEntity(entity);
  return `${classification.usage ?? "?"} ${classification.utility ? "utility" : "attack"}`;
}

/** Every required (Essentials) swap is filled and offers only powers of
 *  the new power's kind to lose. */
function requiredSwaps(c: ReviewCharacter): Check[] {
  const levels = Array.from(
    { length: c.build.effectiveLevel },
    (_, i) => i + 1,
  );
  const evaluation = c.atLevels(levels);
  const swaps = evaluation.choices.filter(
    (choice) => key(choice.type) === "replacement" && !choice.optional,
  );
  const checks: Check[] = [
    truthy(
      `${c.slug} has required power swaps`,
      swaps.length > 0,
      `${swaps.length}${swaps.length === 0 ? "" : ` at levels ${swaps.map(({ level }) => level).join(", ")}`}`,
    ),
  ];
  for (const swap of swaps) {
    // A pick a later swap replaces again (a chain) is no longer an evaluated
    // occurrence; read it from the stored build.
    const stored =
      swap.selectedOccurrenceId === undefined
        ? undefined
        : findOccurrence(c.build, swap.selectedOccurrenceId);
    const selected =
      selectedDefinition(c, swap, evaluation) ??
      (stored?.identity.definitionId === undefined
        ? undefined
        : c.context.byId.get(key(stored.identity.definitionId)));
    checks.push(
      truthy(
        `Level ${swap.level} swap is filled`,
        selected !== undefined,
        selected?.name ?? "unfilled",
      ),
    );
    if (selected === undefined) continue;
    const wanted = powerKind(c, selected.id);
    const offered = (swap.replacementOptions ?? []).map((option) => ({
      name:
        c.context.byId.get(key(option.definitionId))?.name ??
        option.definitionId,
      kind: powerKind(c, option.definitionId),
    }));
    const wrong = offered.filter((option) => option.kind !== wanted);
    checks.push(
      truthy(
        `Level ${swap.level} swap (${selected.name}, ${wanted}) offers only ${wanted} powers to lose`,
        offered.length > 0 && wrong.length === 0,
        wrong.length === 0
          ? offered.map(({ name }) => name).join(", ")
          : `other kinds: ${wrong.map(({ name, kind }) => `${name} (${kind})`).join(", ")}`,
      ),
    );
  }
  return checks;
}

/* ------------------------------------------------------------------ */
/* Beatrix                                                             */
/* ------------------------------------------------------------------ */

const WHITE_WELL = "ID_WOG_HEXBLADE_TRAIT_PACKAGE_4";

rule("beatrix", "Build, level 1: Class", "Trait package benefits", (c) => {
  const pact = c.context.entity(WHITE_WELL);
  const references = candidateReferenceIndex(c.context.byId);
  const entries = detailStackEntries(pact, references);
  const parts = entries.filter(
    ({ relationship }) => relationship === undefined,
  );
  const granted = entries.filter(
    ({ relationship }) => relationship !== undefined,
  );
  // Each part is followed by what it grants: no granted card comes before
  // the first part.
  const firstPart = entries.findIndex(
    ({ relationship }) => relationship === undefined,
  );
  const cantrips = c.context.entity("ID_FMP_CLASS_FEATURE_130");
  const cantripEntries = detailStackEntries(cantrips, references);
  return [
    truthy(
      "The stack has about 38 cards after the pact card",
      entries.length >= 30 && entries.length <= 46,
      `${entries.length} cards: ${parts.length} benefits, ${granted.length} granted`,
    ),
    equal("The stack starts with a benefit card", firstPart, 0),
    truthy(
      'Granted cards are labelled "Granted <type>"',
      granted.every(({ relationship }) => /^Granted [a-z]/.test(relationship!)),
      [...new Set(granted.map(({ relationship }) => relationship))].join(", "),
    ),
    truthy(
      'Granted powers say "Granted power"',
      granted.some(({ relationship }) => relationship === "Granted power"),
      `${granted.filter(({ relationship }) => relationship === "Granted power").length} granted powers`,
    ),
    truthy(
      'Choice options (Arcanist Cantrips) are labelled "Granted power"',
      cantripEntries.length > 0 &&
        cantripEntries.every(
          ({ relationship }) => relationship === "Granted power",
        ),
      cantripEntries
        .map(
          ({ entity, relationship }) =>
            `${entity.name} (${relationship ?? "part"})`,
        )
        .join(", "),
    ),
  ];
});

/** The rendered level sections of an option's detail pane. */
function levelSections(
  c: ReviewCharacter,
  entity: ContentEntity,
  characterLevel: number,
  paragonPathId?: string,
) {
  const html = candidateDetailHtml(c, entity, undefined, {
    ...c.cards(),
    characterLevel,
    ...(paragonPathId === undefined ? {} : { paragonPathId }),
  });
  return {
    html,
    sections: elementsWithClass(html, "detail-level-section").map(
      (section) => ({
        title: textOf(
          elementsWithClass(section, "detail-level-title")[0] ?? "",
        ),
        count: textOf(
          elementsWithClass(section, "detail-level-count")[0] ?? "",
        ).replace(/^·\s*:?\s*/, ""),
        open: /^<div class="detail-level-section is-open"/.test(section),
        bullets: elementsWithClass(section, "detail-level-benefit").map(textOf),
        subheadings: elementsWithClass(section, "detail-level-subheading").map(
          textOf,
        ),
      }),
    ),
  };
}

rule("beatrix", "Build, level 1: Class", "Benefits by level", (c) => {
  const pact = c.context.entity(WHITE_WELL);
  const legendary = c.context.named("Legendary Hexblade", "Paragon Path");
  const views = [1, 9, 12].map((level) => ({
    level,
    ...levelSections(c, pact, level),
  }));
  const first = views[0]!;
  const chosen = levelSections(c, pact, 12, legendary.id);
  const level9 = first.sections.find(({ title }) => title === "Level 9");
  const pactCard = textOf(
    first.html.slice(0, first.html.indexOf("candidate-detail-benefits")),
  );
  const others = [
    c.context.named("Alchemist", "Theme"),
    c.context.entity("ID_FMP_PARAGON_PATH_14"),
    c.context.named("Archmage", "Epic Destiny"),
  ].map((entity) => ({ entity, view: levelSections(c, entity, 1) }));
  return [
    equal(
      "Sections",
      first.sections.map(({ title }) => title),
      [
        "Level 1",
        "Level 7",
        "Level 9",
        "Legendary Hexblade (Levels 11–20)",
        "Valiant Hexblade (Levels 11–20)",
        "Level 25",
      ],
    ),
    truthy(
      'Toggles read like "Level 9 · 1 feature, 3 powers"',
      level9 !== undefined &&
        /^\d+ (feature|power)s?(, \d+ (feature|power)s?)*$/.test(level9.count),
      `Level 9 · ${level9?.count ?? "?"}`,
    ),
    ...views.map(({ level, sections }) =>
      equal(
        `Viewed at level ${level}: sections at or below it start open`,
        sections.map(
          ({ title, open }) => `${title}:${open ? "open" : "folded"}`,
        ),
        sections.map(({ title }) => {
          const start = Number(/(\d+)/.exec(title)?.[1] ?? 0);
          return `${title}:${start <= level ? "open" : "folded"}`;
        }),
      ),
    ),
    truthy(
      "Folded sections list their benefits as bullets; open ones don't",
      first.sections.every(({ open, bullets }) =>
        open ? bullets.length === 0 : bullets.length > 0,
      ),
      first.sections
        .map(({ title, bullets }) => `${title}: ${bullets.join(", ") || "—"}`)
        .join(" | "),
    ),
    truthy(
      "Path sections use plain Level subheadings",
      first.sections
        .filter(({ title }) => /Hexblade \(Levels/.test(title))
        .every(
          ({ subheadings }) =>
            subheadings.length > 0 &&
            subheadings.every((value) => /^Level \d+$/.test(value)),
        ),
      first.sections
        .filter(({ subheadings }) => subheadings.length > 0)
        .map(({ title, subheadings }) => `${title}: ${subheadings.join(", ")}`)
        .join(" | "),
    ),
    equal(
      "With Legendary Hexblade chosen, only its path section remains",
      chosen.sections
        .map(({ title }) => title)
        .filter((title) => /Hexblade/.test(title)),
      ["Legendary Hexblade (Levels 11–20)"],
    ),
    inOrder(
      'The pact card: flavor, one "Prerequisite: Hexblade" line, then the benefits line',
      pactCard,
      [
        (pact.flavor ?? "").slice(0, 40),
        "Prerequisite: Hexblade",
        "You gain the following benefits:",
      ],
    ),
    ...others.map(({ entity, view }) =>
      truthy(
        `${entity.name} has level sections`,
        view.sections.length > 1,
        view.sections
          .map(({ title, count }) => `${title} · ${count}`)
          .join(" | "),
      ),
    ),
  ];
});

rule("beatrix", "Build, level 1: Class", "White Well pact summary", (c) => {
  const choice = choicesAt(c, 1).find(
    (item) => key(item.type) === "trait package",
  );
  if (choice === undefined) return [truthy("A pact choice at level 1", false)];
  const kind = choiceSelectionTableKind(choice);
  const pact = c.context.entity(WHITE_WELL);
  return [
    truthy(
      "The pact choice offers Fey Pact of the White Well",
      choice.candidates.some(
        ({ definitionId }) => key(definitionId) === key(WHITE_WELL),
      ),
    ),
    equal(
      "The table row's summary",
      kind === undefined ? undefined : choiceTableSummary(pact, kind),
      "You have the Fey pact of the White Well.",
    ),
  ];
});

/** A class's detail card: the heading line and the Key abilities row. */
function classCard(c: ReviewCharacter, entity: ContentEntity) {
  const html = candidateDetailHtml(c, entity);
  const rows = elementsWithClass(html, "entity-stat-grid").flatMap((grid) =>
    [...grid.matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map(
      ([, label, value]) => [textOf(label!), textOf(value!)] as const,
    ),
  );
  // The authored fields, independent of the card's own parsing: the first
  // word of "Striker. You …" and "Arcane. You …"; the key abilities as
  // written ("Charisma, Dexterity, …").
  const firstWord = (field: string) =>
    /^\s*([A-Za-z]+)/.exec(contentSpecificValue(entity, field) ?? "")?.[1];
  return {
    // The lede leads with the heading: "Arcane Striker. You wield …".
    lede: elementsWithClass(html, "entity-card-lede").map(textOf),
    ledeHtml: elementsWithClass(html, "entity-card-lede").join(""),
    text: textOf(html),
    shortDescription: (
      contentSpecificValue(entity, "Short Description") ?? ""
    ).trim(),
    rows,
    expectedSummary: [firstWord("Power Source"), firstWord("Role")]
      .filter(Boolean)
      .join(" "),
    expectedKeyAbilities: (contentSpecificValue(entity, "Key Abilities") ?? "")
      .split(/\s*,\s*/)
      .filter(Boolean)
      .join(", "),
  };
}

rule("beatrix", "Build, level 1: Class", "Class detail card", (c) => {
  const choice = choicesAt(c, 1).find((item) => key(item.type) === "class");
  const evaluation = c.atLevels([1]);
  const selected =
    choice === undefined
      ? undefined
      : selectedDefinition(c, choice, evaluation);
  const hexblade = c.context.named("Hexblade", "Class");
  const paladin = c.context.named("Paladin", "Class");
  return [
    equal("The Class row's pick", selected?.name, "Hexblade"),
    ...[
      [hexblade, "Arcane Striker"],
      [paladin, "Divine Defender"],
    ].flatMap(([entity, heading]) => {
      const card = classCard(c, entity as ContentEntity);
      const name = (entity as ContentEntity).name;
      const keyRow = card.rows.filter(([label]) => label === "Key abilities");
      return [
        equal(
          `${name}: the lede reads "${heading}." then the short description`,
          card.lede,
          [[`${heading}.`, card.shortDescription].filter(Boolean).join(" ")],
        ),
        equal(
          `${name}: the heading is the power source then the role`,
          heading,
          card.expectedSummary,
        ),
        equal(
          `${name}: one "Key abilities" row lists the class's key abilities`,
          keyRow.map(([, value]) => value),
          [card.expectedKeyAbilities],
        ),
        truthy(
          `${name}: only "${heading}." is bold, the rest normal weight`,
          new RegExp(`<strong[^>]*>${heading}\\.</strong>`).test(
            card.ledeHtml,
          ) && (card.ledeHtml.match(/<strong[\s>]/g) ?? []).length === 1,
          card.ledeHtml.slice(0, 240),
        ),
        inOrder(`${name}: About comes before Class features`, card.text, [
          `About ${name}`,
          "Class features",
        ]),
        equal(
          `${name}: the row heads the class traits grid`,
          card.rows.findIndex(([label]) => label === "Key abilities"),
          card.rows.findIndex(([label]) => label === "Armor") - 1,
        ),
      ];
    }),
  ];
});

// Beatrix (hexblade 8) has no required swap yet; the hybrid executioner's
// level-27 encounter swap (Coward's Reward) is the review's Essentials swap.
rule(
  "beatrix",
  "Build, level 1: Class",
  "Essentials power swaps",
  (c, context) =>
    [
      ...requiredSwaps(c),
      ...requiredSwaps(context.character("executioner-fighter")),
      ...swapPresentationChecks(context.character("executioner-fighter")),
    ].filter((check) => check.pass || !check.label.startsWith("beatrix has")),
);

rule("beatrix", "Build, level 1: Race", 'Revenant "Past life"', (c) => {
  const evaluation = c.atLevels([1]);
  const choice = choicesAt(c, 1, evaluation).find(
    (item) => key(item.type) === "countsasrace",
  );
  return [
    truthy(
      "A Past life (CountsAsRace) choice at level 1",
      choice !== undefined,
    ),
    equal(
      "Its Build section",
      choice === undefined ? undefined : legacyChoiceSection(choice),
      "Race",
    ),
    equal(
      "Its pick",
      choice === undefined
        ? undefined
        : selectedDefinition(c, choice, evaluation)?.name,
      "Eladrin",
    ),
  ];
});

rule("beatrix", "Retraining", "Essentials power swaps", (c) => {
  const levels = Array.from(
    { length: c.build.effectiveLevel },
    (_, i) => i + 1,
  );
  const evaluation = c.atLevels(levels);
  const retraining = evaluation.choices.filter(
    (choice) =>
      key(choice.type) === "replacement" &&
      choice.optional &&
      (choice.name ?? "").trim() === "" &&
      choice.level <= c.build.effectiveLevel,
  );
  const withPowers = retraining.filter((choice) =>
    (choice.replacementOptions ?? []).some(
      (option) =>
        key(c.context.byId.get(key(option.definitionId))?.type ?? "") ===
        "power",
    ),
  );
  return [
    truthy(
      "The Retraining tab lists levels 2 to 8",
      [2, 3, 4, 5, 6, 7, 8].every((level) =>
        retraining.some((choice) => choice.level === level),
      ),
      `levels ${retraining.map(({ level }) => level).join(", ")}`,
    ),
    truthy(
      "Each offers powers to retrain",
      withPowers.length === retraining.length,
      `${withPowers.length} of ${retraining.length}`,
    ),
  ];
});

rule("beatrix", "Equipment", "Superior implements", (c) => {
  const entry = c.build.inventory.find((holding) =>
    holding.elements.some((element) => /accurate/i.test(element.name)),
  );
  if (entry === undefined)
    return [truthy("An accurate rod in the inventory", false)];
  const detail = inventoryItemDetail(entry, c.context.byId);
  if (detail === undefined) return [truthy("Its detail resolves", false)];
  return itemCardDetail(itemDetailHtml(c, detail), detail.displayName);
});

rule("beatrix", "Equipment", "A free item appears", (c) => [
  // The gift is the pact weapon; its card reads the artifact's name, as the
  // legacy builder names it (e7ba7f6).
  ...freeItem(c, "Fey Pact of the White Well Weapon").slice(0, 1),
  truthy(
    'It has an item card, "Sword of the White Well"',
    c.sheet.items.some(({ name }) => name === "Sword of the White Well"),
    c.sheet.items.map(({ name }) => name).join("; "),
  ),
]);

rule("beatrix", "Equipment", "Pact weapon named by its artifact", (c) =>
  pactWeaponNames(c),
);

/** Beatrix's pact weapon reads "Sword of the White Well" everywhere. */
function pactWeaponNames(c: ReviewCharacter): Check[] {
  const holding = c.build.inventory.find((entry) =>
    entry.elements.some(
      ({ name }) => key(name) === key("Fey Pact of the White Well Weapon"),
    ),
  );
  const detail =
    holding === undefined
      ? undefined
      : inventoryItemDetail(holding, c.context.byId);
  const powerRows = printedDeck(c)
    .filter(({ kind }) => kind === "power")
    .map(({ text }) => text)
    .join(" ");
  const itemNames = c.sheet.items.map(({ name }) => name);
  return [
    equal(
      "The inventory row (and loadout slot) name",
      detail?.displayName,
      "Sword of the White Well",
    ),
    truthy(
      'The item card is "Sword of the White Well"',
      itemNames.includes("Sword of the White Well"),
      itemNames.join("; "),
    ),
    contains(
      "Melee Basic Attack has a Sword of the White Well row",
      printedCard(c, "Melee Basic Attack").text,
      "Sword of the White Well",
    ),
    lacks(
      'No power card names it "… + Sword of the White Well"',
      powerRows,
      "Weapon + Sword of the White Well",
    ),
    lacks(
      "No power card repeats the base after the name",
      powerRows,
      "Sword of the White Well Fey Pact",
    ),
    truthy(
      'The rod still reads "Accurate rod of the Feywild +2"',
      itemNames.includes("Accurate rod of the Feywild +2"),
      itemNames.join("; "),
    ),
  ];
}

rule("beatrix", "Print preview", "Sub-choices on feature rows", (c) => {
  // The pact and power-slot rows ("Pact Choice: …", "Daily Power: …") are
  // off the sheet since 2ad4731: their _CS_ShortDescription is a bare "@",
  // which the legacy CharTracker leaves off too.
  const headings = referenceHeadings(c);
  return [
    ...printedHeading(c, "Past life: Eladrin"),
    equal(
      "Two Guardian Feature rows (Levels 1 and 5)",
      headings.filter((heading) => heading === "Guardian Feature").length,
      2,
    ),
    truthy(
      'No heading repeats a "Level N" tag or the class ("Hexblade … Power")',
      !headings.some((heading) => /^Level \d|Hexblade \w+ Power/.test(heading)),
      headings.join(" | "),
    ),
    lacks(
      "No dangling choice lead-in",
      printedPagesFor(c).text,
      "You gain one of the following",
    ),
  ];
});

rule("beatrix", "Print preview", "Background benefit card", (c) => [
  ...backgroundCards(c, ["Luskan"]),
]);

rule("beatrix", "Print preview", "Granted aliases on feature rows", (c) =>
  printedHeading(c, "Fey Pact of the White Well Boon: counts as Fey Pact"),
);

/** Proficiencies after Equipped and Inventory, labelled, lower case. */
function proficiencies(c: ReviewCharacter): Check[] {
  const items = printedPagesFor(c).references.filter(
    (entry) => entry.group === "Items",
  );
  const pane = items.find((entry) => entry.id === "proficiencies");
  const lines = (pane?.parts ?? []).map((part) => ({
    label: part.label,
    text: part.block.kind === "paragraph" ? part.block.text : "",
  }));
  const labels = lines.map(({ label }) => label);
  return [
    equal(
      "Items pages: Worn/Held Items, Carried Items, then Proficiencies",
      items.map((entry) => entry.name),
      ["Worn/Held Items", "Carried Items", "Proficiencies"],
    ),
    truthy(
      "Lines are labelled Armor / Shields / Weapons / Implements (in that order)",
      labels.length > 0 &&
        labels.every((label) =>
          ["Armor", "Shields", "Weapons", "Implements"].includes(label ?? ""),
        ) &&
        labels.join() ===
          ["Armor", "Shields", "Weapons", "Implements"]
            .filter((label) => labels.includes(label))
            .join(),
      labels.join(", "),
    ),
    truthy(
      "Values are lower case",
      lines.every(({ text }) => text === text.toLocaleLowerCase()),
      lines.map(({ label, text }) => `${label}: ${text}`).join(" | "),
    ),
  ];
}

rule("beatrix", "Print preview", "Proficiencies pane", (c) => proficiencies(c));

/** The deity entry right after the backgrounds, church icon, Domains line
 *  first. */
function printedDeity(c: ReviewCharacter, deity: string): Check[] {
  const pages = printedPagesFor(c);
  const groups = [...new Set(pages.references.map((entry) => entry.group))];
  const entry = pages.references.find((value) => value.group === "Deity");
  const first = entry?.parts[0];
  const at = pages.html.indexOf(`<h3>${deity}</h3>`);
  const before = at < 0 ? "" : pages.html.slice(Math.max(0, at - 600), at);
  return [
    equal("Deity entry", entry?.name, deity),
    equal(
      "The Deity group follows Background (or what precedes it when there is none)",
      groups[groups.indexOf("Deity") - 1],
      groups.includes("Background")
        ? "Background"
        : groups
            .filter((group) =>
              ["Class features", "Racial traits", "Theme"].includes(group),
            )
            .at(-1),
    ),
    equal("Its first line is Domains", first?.label, "Domains"),
    truthy(
      "Its heading has the church icon",
      /lucide-church/.test(before),
      at < 0 ? `${deity} heading not found` : "church icon before the name",
    ),
    truthy(
      "The description follows the Domains line",
      (entry?.parts.length ?? 0) > 1,
      `${entry?.parts.length ?? 0} parts`,
    ),
  ];
}

rule("beatrix", "Print preview", "Printed Deity entry", (c) =>
  printedDeity(c, "Sehanine"),
);

rule("beatrix", "Sheet (on screen)", "Granted aliases on feature rows", (c) => [
  onScreenFeature(c, "Fey Pact of the White Well Boon: counts as Fey Pact"),
]);

/* ------------------------------------------------------------------ */
/* White Well hexblade (level 25)                                      */
/* ------------------------------------------------------------------ */

const HEXBLADE_25 = "hexblade-white-well";

rule(HEXBLADE_25, "Build, level 1: Class", "Benefits by level", (c) => {
  const pact = c.context.entity(WHITE_WELL);
  const legendary = c.context.named("Legendary Hexblade", "Paragon Path");
  const views = [1, 11, 25].map((level) => ({
    level,
    ...levelSections(c, pact, level),
  }));
  return [
    equal(
      "The character's paragon path",
      entityName(c, c.cards().paragonPathId),
      legendary.name,
    ),
    ...views.map(({ level, sections }) =>
      equal(
        `Viewed at level ${level}: only Legendary Hexblade's path section`,
        sections
          .map(({ title }) => title)
          .filter((title) => /Hexblade \(Levels/.test(title)),
        ["Legendary Hexblade (Levels 11–20)"],
      ),
    ),
    // The White Well's own Legendary Hexblade features (_1D to _6D).
    equal(
      "Legendary Hexblade's section: the White Well features' levels",
      views[0]!.sections.find(({ title }) => /^Legendary Hexblade/.test(title))
        ?.subheadings,
      ["Level 11", "Level 12", "Level 16", "Level 20"],
    ),
    ...views.map(({ level, sections }) =>
      equal(
        `Viewed at level ${level}: sections at or below it start open`,
        sections.map(
          ({ title, open }) => `${title}:${open ? "open" : "folded"}`,
        ),
        sections.map(({ title }) => {
          const start = Number(/(\d+)/.exec(title)?.[1] ?? 0);
          return `${title}:${start <= level ? "open" : "folded"}`;
        }),
      ),
    ),
  ];
});

rule(HEXBLADE_25, "Build, level 11", "Other detail stacks", (c) =>
  detailStack(c, c.context.named("Legendary Hexblade", "Paragon Path")),
);

/** A printed card's table cells, as text. */
const tableCells = (html: string): string[] =>
  [...html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) =>
    textOf(cell!),
  );

rule(HEXBLADE_25, "Print preview", "Summoned allies", (c) => {
  const deck = printedDeck(c);
  const level = c.build.effectiveLevel;
  const attacks = [
    ["ID_WOG_COMPANION_6_POWERCARD_2", "Ref"],
    ["ID_WOG_COMPANION_10_POWERCARD_2", "Will"],
    ["ID_WOG_COMPANION_10_POWERCARD_4", "Will"],
  ] as const;
  const checks: Check[] = [equal("The character's level", level, 25)];
  for (const [id, defense] of attacks) {
    const name = c.context.entity(id).name;
    const printed = deck.find(({ label }) => key(label) === key(name));
    const evaluated = c.evaluation.powers.find(
      ({ definitionId }) => key(definitionId) === key(id),
    );
    const bonuses = (evaluated?.variants ?? []).flatMap((variant) =>
      (variant.attacks ?? []).map(({ attackBonus }) => attackBonus),
    );
    // "your level + 5": the published bonus; no ability, weapon or
    // implement applies.
    const expected = level + 5;
    checks.push(
      truthy(`${name} is printed`, printed !== undefined),
      contains(
        `${name}: the attack header`,
        printed?.text ?? "",
        `Level+5 vs ${defense}`,
      ),
      equal(
        `${name}: the evaluated attack bonus is your level + 5`,
        [...new Set(bonuses)],
        [expected],
      ),
      truthy(
        `${name}: the card's table prints +${expected}`,
        tableCells(printed?.html ?? "").includes(`+${expected}`),
        tableCells(printed?.html ?? "").join(" | "),
      ),
    );
  }
  const unknown = deck.filter(({ text }) => /unknown/i.test(text));
  const dashed = deck.filter(({ text }) => /— vs /.test(text));
  checks.push(
    truthy(
      'No printed card reads "UNKNOWN"',
      unknown.length === 0,
      unknown.map(({ label }) => label).join(", ") || `${deck.length} cards`,
    ),
    lacks(
      'The printed pages have no "UNKNOWN"',
      printedPagesFor(c).text.toLocaleUpperCase(),
      "UNKNOWN",
    ),
    truthy(
      "No attack header falls back to a dash",
      dashed.length === 0,
      dashed.map(({ label }) => label).join(", ") || "none",
    ),
  );
  return checks;
});

/* ------------------------------------------------------------------ */
/* Hystan and Hu                                                       */
/* ------------------------------------------------------------------ */

rule("hystan", "Print preview", "Granted aliases on feature rows", (c) =>
  printedHeading(c, "Dual Heritage: counts as Elf, Human"),
);
rule("hystan", "Print preview", "Background benefit card", (c) =>
  backgroundCards(c, ["Martial - Local Hero", "Occupation - Hunter"]),
);
rule("hystan", "Sheet (on screen)", "Granted aliases on feature rows", (c) => [
  onScreenFeature(c, "Dual Heritage: counts as Elf, Human"),
]);

rule("hu", "Print preview", "Background benefit card", (c) => {
  const backgrounds = printedPagesFor(c).references.filter(
    (entry) =>
      entry.group === "Background" && entry.name !== "Background benefit",
  );
  return [
    equal("Six background cards", backgrounds.length, 6),
    ...backgroundCards(
      c,
      backgrounds.map((entry) => entry.name),
    ),
  ];
});
rule("hu", "Print preview", "Granted aliases on feature rows", (c) => [
  ...printedHeading(c, "Battle Awareness"),
  truthy(
    "Battle Awareness choices remain in its reference body",
    printedPagesFor(c)
      .references.find(({ name }) => name === "Battle Awareness")
      ?.parts.some(
        ({ label, block }) =>
          label === "Choices" &&
          block.kind === "paragraph" &&
          block.text === "Athletics; counts as Fighter",
      ) === true,
  ),
]);
rule("hu", "Sheet (on screen)", "Granted aliases on feature rows", (c) => [
  onScreenFeature(c, "Battle Awareness"),
]);

/* ------------------------------------------------------------------ */
/* Hybrids, proficiencies                                              */
/* ------------------------------------------------------------------ */

/** The two hybrid halves, in the order the build chose them. */
function hybridHalves(c: ReviewCharacter): string {
  const evaluation = c.atLevels([1]);
  return choicesAt(c, 1, evaluation)
    .filter(({ type }) => key(type) === "hybrid class")
    .map((choice) => selectedDefinition(c, choice, evaluation))
    .map((entity) =>
      entity === undefined ? "?" : hybridClassName(entity, c.context.byId),
    )
    .join(" / ");
}

rule("executioner-fighter", "Print preview", "Hybrid characters", (c) => [
  // The plan's "Executioner / Fighter" assumed an order; the line follows
  // the build's hybrid class choices.
  equal(
    "The hybrid halves in build order",
    hybridHalves(c).split(" / ").toSorted(),
    ["Executioner", "Fighter"],
  ),
  ...classIdentity(c, hybridHalves(c)),
  lacks(
    'Not "Hybrid"',
    c.sheet.identity.find(({ label }) => label === "Class")?.value ?? "",
    "Hybrid",
  ),
]);
rule("artificer-ardent", "Print preview", "Hybrid characters", (c) => [
  equal(
    "The hybrid halves in build order",
    hybridHalves(c),
    "Artificer / Ardent",
  ),
  ...classIdentity(c, "Artificer / Ardent"),
]);

rule("runepriest-scholar", "Print preview", "Serene Blade runepriest", (c) => {
  const weapons = c.sheet.proficiencies?.find(({ kind }) => kind === "Weapons");
  return [
    truthy(
      'Weapons proficiencies include "military heavy blade" (the checklist says "blades"; the proficiency is named in the singular)',
      weapons?.values.includes("military heavy blade") === true,
      weapons?.values.join(", ") ?? "no Weapons line",
    ),
    contains(
      "The printed Proficiencies pane shows it",
      printedPagesFor(c).text,
      "military heavy blade",
    ),
  ];
});

/* ------------------------------------------------------------------ */
/* Rituals tab                                                         */
/* ------------------------------------------------------------------ */

function ritualsHtml(
  c: ReviewCharacter,
  category?: "rituals",
  build: CharacterBuild = c.build,
  evaluation: EvaluatedCharacter = c.evaluation,
): string {
  return markup(
    createElement(RitualsWorkspace, {
      build,
      entities: c.context.entities,
      byId: c.context.byId,
      evaluation,
      walletCopper: 1_000_000,
      category,
      onCategoryChange: () => undefined,
      onLearn: () => undefined,
      onRemove: () => undefined,
    }),
  );
}

function ritualStatuses(c: ReviewCharacter) {
  return ritualAllowanceStatuses(
    c.build,
    c.evaluation,
    (id) => c.context.byId.get(key(id)),
    c.build.effectiveLevel,
  );
}

function knownRows(c: ReviewCharacter) {
  const statuses = ritualStatuses(c);
  const provider = (allowance: string) =>
    statuses.find(
      ({ allowance: candidate }) => key(candidate.key) === key(allowance),
    )?.allowance.provider;
  return knownRecords(
    c.build,
    c.evaluation,
    (id) => c.context.byId.get(key(id)),
    c.build.effectiveLevel,
  ).map((record) => ({
    record,
    name: record.entity?.name ?? record.element.name,
    source: knownRecordSourceLabel(record, provider),
  }));
}

/** The counter lines under the provider's Free rituals text. */
function ritualCounter(c: ReviewCharacter, provider: string): Check[] {
  const html = ritualsHtml(c);
  const statuses = ritualStatuses(c).filter(
    ({ allowance }) => key(allowance.provider) === key(provider),
  );
  const nameOf = (id: string) => c.context.byId.get(key(id))?.name ?? id;
  const labels = statuses.map((status) => ritualAllowanceLabel(status, nameOf));
  const counters = elementsWithClass(html, "rituals-allowance-count").map(
    textOf,
  );
  return [
    truthy(
      `${provider} has a free-ritual counter`,
      labels.length > 0,
      labels.join(" | ") || "none",
    ),
    ...labels.map((label) =>
      truthy(
        `The Rituals tab shows "${label}" under the Free rituals text`,
        counters.includes(label),
        counters.join(" | "),
      ),
    ),
  ];
}

rule("piri", "Rituals tab", "Rows", (c) => {
  const rows = knownRows(c).filter(
    ({ record }) => record.source.kind === "granted",
  );
  return [
    truthy(
      'A granted ritual reads "Granted by Druid"',
      rows.some(({ source }) => source === "Granted by Druid"),
      rows.map(({ name, source }) => `${name}: ${source}`).join("; "),
    ),
    contains(
      "The Rituals tab shows it",
      textOf(ritualsHtml(c)),
      "Granted by Druid",
    ),
  ];
});
rule("piri", "Rituals tab", "Free-ritual counter", (c) =>
  ritualCounter(c, "Druid"),
);

function printedGrantedRituals(c: ReviewCharacter, provider: string): Check[] {
  const entries = printedPagesFor(c).references.filter(
    (entry) => entry.group === "Rituals & practices",
  );
  const granted = c.sheet.learnedReferences.filter(
    ({ origin }) => origin?.kind === "granted",
  );
  return [
    truthy(
      `The sheet has rituals granted by ${provider}`,
      granted.some(({ origin }) => origin?.provider === provider),
      granted
        .map(({ name, origin }) => `${name} (${origin?.provider})`)
        .join("; "),
    ),
    ...granted.map(({ name, origin }) => {
      const entry = entries.find((value) => value.name === name);
      const first = entry?.parts[0];
      return equal(
        `${name}'s printed entry starts "Granted by: ${origin?.provider}"`,
        first === undefined
          ? undefined
          : `${first.label}: ${first.block.kind === "paragraph" ? first.block.text : ""}`,
        `Granted by: ${origin?.provider}`,
      );
    }),
    contains(
      "The printed pages show it",
      printedPagesFor(c).text,
      `Granted by: ${provider}`,
    ),
  ];
}

rule("piri", "Print preview", "Printed reference pages", (c) =>
  printedGrantedRituals(c, "Druid"),
);

rule("wizard-gnome", "Rituals tab", "Free-ritual counter", (c) => [
  ...ritualCounter(c, "Spellbook"),
  contains(
    "The Spellbook counter reads as the checklist says",
    textOf(ritualsHtml(c)),
    "free 1st-level rituals and 2 free rituals of level 5 or lower left",
  ),
]);

rule("wizard-gnome", "Rituals tab", "Known-list source line", (c) => {
  const row = knownRows(c).find(({ name }) => name === "Comprehend Language");
  return [
    equal(
      "Comprehend Language's source line",
      row?.source,
      "Learned free at level 1 (Spellbook)",
    ),
    inOrder(
      "The Rituals tab row shows it under the name",
      textOf(ritualsHtml(c)),
      ["Comprehend Language", "Learned free at level 1 (Spellbook)"],
    ),
  ];
});

rule("wizard-gnome", "Rituals tab", '"Learn X free" dialog', (c) => {
  // The wizard's Spellbook is one allowance (two level pools), so Learn free
  // needs no choice; the dialog is for several allowances, as a psion's
  // own allowance beside the Spellbook (the checklist's example).
  const disk = c.context.named("Tenser's Floating Disk", "Ritual");
  const eligible = (statuses: ReturnType<typeof ritualStatuses>) =>
    eligibleRitualAllowances(statuses, disk, c.build.effectiveLevel);
  const own = eligible(ritualStatuses(c));
  const psion = c.context.entities.find(
    (entity) =>
      /psion/i.test(entity.name) &&
      entity.specifics.some(({ name }) => name === "_FreeRitualAllowance"),
  );
  const build: CharacterBuild =
    psion === undefined
      ? c.build
      : {
          ...c.build,
          grabbag: [
            ...c.build.grabbag,
            {
              id: "verify:psion-allowance",
              identity: {
                definitionId: psion.id,
                name: psion.name,
                type: psion.type,
              },
              acquiredLevel: 1,
              legality: "houserule",
              children: [],
              unresolved: false,
            },
          ],
        };
  const evaluation = evaluate(build, c.context.entities, {
    candidateDetailLevels: [],
  });
  const both = eligibleRitualAllowances(
    ritualAllowanceStatuses(
      build,
      evaluation,
      (id) => c.context.byId.get(key(id)),
      build.effectiveLevel,
    ),
    disk,
    build.effectiveLevel,
  );
  return [
    equal(
      "The wizard alone: one allowance fits (no dialog)",
      own.map(({ provider }) => provider),
      ["Spellbook"],
    ),
    truthy(
      `With a psion's allowance too (${psion?.name ?? "none found"}), several fit, so Learn free asks`,
      both.length > 1,
      both.map(({ provider }) => provider).join("; "),
    ),
  ];
});

rule("invoker-drow", "Rituals tab", "The Rituals tab", (c) => {
  const source = readFileSync(
    resolve("apps/web/src/CharacterEditorPage.tsx"),
    "utf8",
  );
  const shop = source.indexOf('<Icon name="shopping-cart" /> Shop');
  const rituals = source.indexOf('<Icon name="book-marked" /> Rituals');
  const html = ritualsHtml(c);
  const text = textOf(html);
  const allowances = freeRitualAllowanceTexts(c.evaluation);
  const records = knownRows(c);
  return [
    truthy(
      "The Rituals tab button (book-marked icon) follows Shop",
      shop >= 0 && rituals > shop,
      `Shop at ${shop}, Rituals at ${rituals} in CharacterEditorPage.tsx`,
    ),
    ...allowances.map(({ text: allowance, provider }) =>
      contains(
        `"Free rituals: …" with the provider (${provider}) in parentheses`,
        text,
        `Free rituals: ${allowance} (${provider})`,
      ),
    ),
    truthy("The invoker has Free rituals text", allowances.length > 0),
    inOrder("Then Known (N) and Learn rituals", text, [
      "Free rituals:",
      `Known ${records.length}`,
      "Learn rituals",
    ]),
  ];
});

rule("invoker-drow", "Rituals tab", "Free-ritual counter", (c) => [
  ...ritualCounter(c, "Invoker"),
  contains(
    "Its one free ritual is used",
    textOf(ritualsHtml(c)),
    "All 1 free ritual used",
  ),
]);

rule("invoker-drow", "Rituals tab", "Groups", (c) => {
  const text = textOf(ritualsHtml(c));
  const empty = KNOWN_RECORD_GROUPS.filter(({ kind }) =>
    knownRows(c).every(({ record }) => knownRecordKindOf(record) !== kind),
  );
  return [
    inOrder(
      "The three groups, in order",
      text,
      KNOWN_RECORD_GROUPS.map(({ label }) => label),
    ),
    ...empty.map(({ label, empty: emptyText }) =>
      contains(`${label} shows its empty state`, text, emptyText),
    ),
    contains(
      "Empty states use the empty-row style",
      ritualsHtml(c),
      'class="rituals-empty-row"',
    ),
  ];
});

rule("invoker-drow", "Rituals tab", "Rows", (c) => {
  const html = ritualsHtml(c);
  const rows = elementsWithClass(html, "table-clickable-row");
  const granted = knownRows(c).find(
    ({ source }) => source === "Granted by Invoker",
  );
  const row = rows.find(
    (value) => granted !== undefined && value.includes(granted.name),
  );
  const level =
    granted?.record.entity === undefined
      ? "—"
      : (contentSpecificValue(granted.record.entity, "Level") ?? "—");
  const category =
    granted?.record.entity === undefined
      ? "—"
      : (contentSpecificValue(granted.record.entity, "Category") ?? "—");
  const skill =
    granted?.record.entity === undefined
      ? "—"
      : (contentSpecificValue(granted.record.entity, "Key Skill") ?? "—");
  return [
    truthy(
      "A ritual granted by Invoker",
      granted !== undefined,
      granted?.name ?? "none",
    ),
    contains("Its row has the book icon", row ?? "", "lucide-book "),
    inOrder(
      "Name, source line, Level, Category, Key skill",
      textOf(row ?? ""),
      [granted?.name ?? "?", "Granted by Invoker", level, category, skill],
    ),
    contains(
      "The source line uses the muted source style",
      row ?? "",
      'class="rituals-known-source"',
    ),
  ];
});

rule("invoker-drow", "Rituals tab", "Remove", (c) => {
  const html = ritualsHtml(c);
  const rows = knownRows(c);
  return rows
    .map(({ record, name }) =>
      record.source.kind === "learned"
        ? contains(
            `Learned ${name} has Remove (trash icon)`,
            html,
            `aria-label="Remove ${name}"`,
          )
        : lacks(
            `Granted ${name} has no Remove`,
            html,
            `aria-label="Remove ${name}"`,
          ),
    )
    .concat([
      truthy(
        "There are both learned and granted entries",
        rows.some(({ record }) => record.source.kind === "learned") &&
          rows.some(({ record }) => record.source.kind === "granted"),
        rows
          .map(({ name, record }) => `${name} (${record.source.kind})`)
          .join("; "),
      ),
    ]);
});

rule("invoker-drow", "Rituals tab", "Detail card", (c) => {
  const row = knownRows(c).find(({ record }) => record.entity !== undefined);
  const detail =
    row?.record.entity === undefined
      ? ""
      : itemDetailHtml(
          c,
          {
            entities: [row.record.entity],
            displayName: row.record.entity.name,
            effectiveLevel: c.build.effectiveLevel,
          },
          { note: row.source },
        );
  return [
    contains(
      `The selected row's card has its source (${row?.source}) as the subheading`,
      detail,
      `<p class="candidate-relationship">${row?.source ?? ""}</p>`,
    ),
    contains(
      "With nothing selected, the empty state",
      textOf(ritualsHtml(c)),
      "Choose a ritual to inspect it",
    ),
  ];
});

rule("invoker-drow", "Rituals tab: learn", "Learning view", (c) => {
  const html = ritualsHtml(c, "rituals");
  const text = textOf(html);
  const select = elementsWithClass(html, "shop-type-select")[0] ?? "";
  const options = [
    ...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g),
  ].map((match) => match[2]!);
  return [
    contains('A "← Known rituals" back button', html, "lucide-arrow-left"),
    contains("… labelled Known rituals", text, "Known rituals"),
    truthy(
      "The Type select lists only the three catalogs",
      ["Rituals", "Alchemical formulas", "Martial practices"].every((label) =>
        options.includes(label),
      ) &&
        !options.includes("All items") &&
        !options.includes("Consumables"),
      `options: ${options.slice(0, 20).join(", ")}${select === "" ? "" : ""}`,
    ),
    contains(
      'A "Search rituals…" placeholder',
      html,
      'placeholder="Search rituals…"',
    ),
    contains("A Known chip", text, "Known"),
    contains("Buy buttons", html, 'aria-label="Buy '),
    contains("Learn free buttons (title)", html, 'title="Learn free"'),
  ];
});

rule("invoker-drow", "Shop", "Shop", (c) => {
  const labels = SHOP_BROWSE_CATEGORIES.map(({ label }) => label);
  const scroll = c.context.entities.find(
    (entity) => practiceKind(entity) === "scroll",
  );
  return [
    truthy(
      "The Shop's Type list has no Rituals, Alchemical formulas or Martial practices",
      !labels.some((label) =>
        ["Rituals", "Alchemical formulas", "Martial practices"].includes(label),
      ),
      labels.join(", "),
    ),
    equal(
      `A Ritual Scroll (${scroll?.name ?? "none"}) is under Consumables`,
      scroll === undefined ? undefined : shopBrowseCategory(scroll),
      "consumables",
    ),
  ];
});

rule("invoker-drow", "Old link: Shop rituals", "Old links", (c) => {
  const hash = `#/characters/${c.record.id}/edit?tab=shop&category=rituals`;
  return [
    equal(
      "tab=shop&category=rituals canonicalizes to the Rituals tab's learning view",
      canonicalHashRedirect(hash),
      `#/characters/${c.record.id}/edit?tab=rituals&category=rituals`,
    ),
  ];
});
rule("invoker-drow", "Old link: section=practices", "Old links", (c) => {
  const hash = `#/characters/${c.record.id}/edit?tab=equipment&section=practices`;
  return [
    equal(
      "tab=equipment&section=practices canonicalizes to the Rituals tab",
      canonicalHashRedirect(hash),
      `#/characters/${c.record.id}/edit?tab=rituals`,
    ),
  ];
});

rule("invoker-drow", "Print preview", "Printed reference pages", (c) =>
  printedGrantedRituals(c, "Invoker"),
);

rule("invoker-drow", "Sheet (on screen)", "On-screen sheet", (c) => {
  const source = readFileSync(
    resolve("apps/web/src/CharacterSheetPage.tsx"),
    "utf8",
  );
  const section = source.slice(source.lastIndexOf("Rituals &amp; practices"));
  return [
    truthy(
      "The character has learned references to show",
      c.sheet.learnedReferences.length > 0,
      c.sheet.learnedReferences.map(({ name }) => name).join(", "),
    ),
    truthy(
      '"Rituals & practices" renders each as <ItemCard layout="panel">',
      /<ItemCard[\s\S]{0,200}card=\{reference\.card\}[\s\S]{0,40}layout="panel"/.test(
        section.slice(0, 1500),
      ),
      "CharacterSheetPage.tsx",
    ),
    ...c.sheet.learnedReferences.map((reference) =>
      contains(
        `${reference.name} renders as a panel item card`,
        markup(
          createElement(ItemCard, { card: reference.card, layout: "panel" }),
        ),
        "print-item-card is-panel",
      ),
    ),
  ];
});

/* ------------------------------------------------------------------ */
/* Beast companions                                                    */
/* ------------------------------------------------------------------ */

function companionChoice(c: ReviewCharacter) {
  const evaluation = c.atLevels([1]);
  const choice = choicesAt(c, 1, evaluation).find(
    (item) => key(item.type) === "companion",
  );
  return { evaluation, choice };
}

rule(
  "ranger-beast",
  "Build, level 1: Companion",
  "Builder Companion pane",
  (c) => {
    const { evaluation, choice } = companionChoice(c);
    const chosen =
      choice === undefined
        ? undefined
        : selectedDefinition(c, choice, evaluation);
    const other = choice?.candidates.find(
      (candidate) =>
        candidate.eligible &&
        key(candidate.definitionId) !== key(chosen?.id ?? ""),
    );
    const otherEntity =
      other === undefined
        ? undefined
        : c.context.byId.get(key(other.definitionId));
    const chosenHtml =
      chosen === undefined ? "" : candidateDetailHtml(c, chosen);
    const otherHtml =
      otherEntity === undefined ? "" : candidateDetailHtml(c, otherEntity);
    return [
      equal("The companion choice's pick", chosen?.name, "Wolf"),
      contains(
        "The chosen wolf's pane is the beast card",
        chosenHtml,
        "print-beast-card is-panel",
      ),
      contains(
        '… titled with its name and category (plan: "Ash — wolf")',
        textOf(chosenHtml),
        "Ash — Wolf",
      ),
      contains(
        `Another beast (${otherEntity?.name}) gets a beast card preview`,
        otherHtml,
        "print-beast-card is-panel",
      ),
    ];
  },
);

rule(
  "sentinel-bear",
  "Build, level 1: Companion",
  "Builder Companion pane",
  (c) => {
    const bear = c.context.entity("ID_WOG_COMPANION_2");
    const html = candidateDetailHtml(c, bear);
    const card = c.cards().beastCardFor(bear);
    const ability = (name: string) =>
      card?.abilities.find((value) => value.name === name)?.score;
    return [
      contains(
        "The bear's pane is the beast card",
        html,
        "print-beast-card is-panel",
      ),
      // The checklist's "e.g. bear: 16 Str, 15 Con" matches neither bear
      // record (the ranger's Bear is 16 Str, 14 Con; the sentinel's 20 Str,
      // 17 Con); the pane shows the evaluated scores.
      truthy(
        "The pane shows the evaluated Strength and Constitution",
        card !== undefined &&
          textOf(html).includes(`${ability("Strength")}STR`) &&
          textOf(html).includes(`${ability("Constitution")}CON`),
        `Str ${ability("Strength")}, Con ${ability("Constitution")} (record ${contentSpecificValue(bear, "Strength")}/${contentSpecificValue(bear, "Constitution")})`,
      ),
    ];
  },
);

rule(
  "ranger-beast",
  "Build, level 1: Companion",
  "Name and Appearance",
  (c) => {
    const html = markup(
      createElement(CompanionNameFields, {
        build: c.build,
        onDispatch: () => undefined,
      }),
    );
    const beast = c.sheet.companions.find((card) => card.kind === "beast");
    return [
      contains("A Name input", textOf(html), "Name"),
      contains("… holding Ash", html, 'value="Ash"'),
      contains("An Appearance input", textOf(html), "Appearance"),
      equal(
        "The card title",
        beast === undefined || beast.kind !== "beast"
          ? undefined
          : beastCompanionTitle(beast),
        // The plan wrote "wolf"; the category is authored "Wolf".
        "Ash — Wolf",
      ),
    ];
  },
);

rule("ranger-beast", "Retraining", "Retraining", (c) => {
  const level = c.build.effectiveLevel;
  const evaluation = c.atLevels([level]);
  const categories = retrainingCategories(evaluation);
  const retrain = evaluation.choices.find(
    (choice) => choice.level === level && isOptionalRetrainingChoice(choice),
  );
  const companionOptions = (retrain?.replacementOptions ?? []).filter(
    (option) =>
      retrainingCategory(c.context.byId.get(key(option.definitionId))?.type) ===
      "companion",
  );
  const checks: Check[] = [
    truthy(
      'A "Retrain a companion" option',
      categories.includes("companion"),
      categories.join(", "),
    ),
    truthy(
      `Level ${level} offers the beast to retrain`,
      companionOptions.length > 0,
      companionOptions
        .map(({ definitionId }) => entityName(c, definitionId))
        .join(", ") || "none",
    ),
  ];
  // Retrain the wolf into another beast and read the Kind cell.
  if (retrain !== undefined && companionOptions.length > 0) {
    const detailed = c.atLevels([level], [retrain.id]);
    const live =
      detailed.choices.find(({ id }) => id === retrain.id) ?? retrain;
    const companion = {
      ...live,
      replacementOptions: (live.replacementOptions ?? []).filter(
        (option) =>
          retrainingCategory(
            c.context.byId.get(key(option.definitionId))?.type,
          ) === "companion",
      ),
    };
    const replacement = replacementCommand(
      c.build,
      companion,
      c.context.entities,
      c.context.byId,
      detailed,
      {
        preferred: new Set(),
        excluded: new Set(
          companion.replacementOptions.map(({ definitionId }) =>
            key(definitionId),
          ),
        ),
      },
      1,
    );
    if (replacement === undefined) {
      checks.push(
        truthy(
          "A beast to retrain the wolf into",
          false,
          "no eligible candidate",
        ),
      );
    } else {
      const transaction = new CharacterTransaction(c.build);
      transaction.dispatch(replacement.command);
      const after = evaluate(transaction.current, c.context.entities, {
        candidateDetailLevels: [level],
        includePowers: false,
      });
      const html = markup(
        createElement(RetrainingWorkspace, {
          evaluation: after,
          build: transaction.current,
          entities: c.context.entities,
          byId: c.context.byId,
          rollbackRevision: 0,
          selectedLevel: level,
          onSelectLevel: () => undefined,
          onRequestDetails: () => undefined,
          onDispatch: () => undefined,
        }),
      );
      const row =
        elementsWithClass(html, "table-clickable-row").find((value) =>
          value.includes(`<td>${level}</td>`),
        ) ?? "";
      checks.push(
        contains(
          `After retraining the wolf into a ${entityName(c, replacement.definitionId)}, the Kind column reads Companion`,
          row,
          "<td>Companion</td>",
        ),
      );
    }
  }
  return checks;
});

/** Beast powers: a "Beast +N vs AC" header and a "Beast damage" line. */
function beastPowerCards(c: ReviewCharacter): Check[] {
  const deck = printedDeck(c);
  const beastPowers = c.sheet.powers.filter((card) =>
    (card.variants ?? []).some((variant) => variant.attacker === "beast"),
  );
  const checks: Check[] = [
    truthy(
      "The character has beast powers",
      beastPowers.length > 0,
      beastPowers.map(({ name }) => name).join(", "),
    ),
  ];
  for (const power of beastPowers) {
    const printed = deck.find((card) => card.card === power);
    const attack = power.variants?.find(
      (variant) => variant.attacker === "beast",
    );
    checks.push(
      truthy(
        `${power.name}: "Beast +N vs AC" header`,
        /Beast \+\d+ vs (AC|Fort|Ref|Will)/.test(printed?.text ?? ""),
        attack?.attack ?? "no beast attack",
      ),
      contains(
        `${power.name}: "Beast damage" line`,
        printed?.text ?? "",
        "Beast damage",
      ),
      lacks(`${power.name}: no weapon table`, printed?.html ?? "", "<table"),
    );
  }
  return checks;
}

rule("ranger-beast", "Print preview", "Beast Mastery ranger", (c) => {
  const beastPowers = c.sheet.powers.filter((card) =>
    (card.variants ?? []).some(
      (variant) =>
        variant.attacker === "beast" ||
        variant.attacks?.some(({ attacker }) => attacker === "beast"),
    ),
  );
  return [
    truthy(
      "Beast attack powers have numbers (attack bonus and damage)",
      beastPowers.length > 0 &&
        beastPowers.every((card) =>
          (card.variants ?? []).every((variant) =>
            (variant.attacks ?? [])
              .filter(({ attacker }) => attacker === "beast")
              .every(
                ({ attack, damage }) =>
                  /[+-]\d+ vs/.test(attack) && damage !== undefined,
              ),
          ),
        ),
      beastPowers
        .map(
          (card) =>
            `${card.name}: ${(card.variants ?? []).flatMap((variant) => (variant.attacks ?? []).filter(({ attacker }) => attacker === "beast").map(({ attack, damage }) => `${attack} / ${damage}`)).join(", ")}`,
        )
        .join("; "),
    ),
    truthy(
      'No "Companion: X" power card',
      !c.sheet.powers.some(({ name }) => /^companion:/i.test(name)),
      c.sheet.powers
        .filter(({ name }) => /companion/i.test(name))
        .map(({ name }) => name)
        .join(", ") || "none",
    ),
  ];
});

rule("ranger-beast", "Print preview", "Printed beast card", (c) => {
  const labels = printedDeck(c).map(({ label, kind }) => `${kind}:${label}`);
  const skills = labels.indexOf("play-skills:Skills");
  return [
    truthy(
      "The beast card follows the Skills card",
      labels[skills + 1]?.startsWith("beast:") === true,
      labels.slice(0, skills + 3).join(" → "),
    ),
    truthy(
      "… before any familiar",
      labels.findIndex((label) => label.startsWith("familiar:")) < 0 ||
        labels.findIndex((label) => label.startsWith("familiar:")) > skills + 1,
    ),
  ];
});

rule("ranger-beast", "Print preview", "Beast power cards", (c) => {
  const team = c.sheet.powers.find(({ name }) => name === "Distracting Team");
  const printed = printedDeck(c).find(({ card }) => card === team);
  return [
    ...beastPowerCards(c),
    truthy("Distracting Team is printed", printed !== undefined),
    contains(
      "Distracting Team keeps its weapon table",
      printed?.html ?? "",
      "<table",
    ),
    contains("… with beast cells", printed?.text ?? "", "Beast"),
  ];
});

rule("sentinel-bear", "Print preview", "Printed beast card", (c) => {
  const beast = printedDeck(c).find(({ kind }) => kind === "beast");
  return [
    truthy("A printed beast card", beast !== undefined),
    contains(
      'Its Surges tile reads "Yours"',
      beast?.text ?? "",
      "Surges Yours",
    ),
  ];
});
rule("sentinel-bear", "Print preview", "Beast power cards", (c) =>
  beastPowerCards(c),
);

/* ------------------------------------------------------------------ */
/* Detail stacks                                                       */
/* ------------------------------------------------------------------ */

/** An option's detail stack: its parts and what each grants. */
function detailStack(
  c: ReviewCharacter,
  entity: ContentEntity,
  expected?: { readonly min: number; readonly max: number },
): Check[] {
  const references = candidateReferenceIndex(c.context.byId);
  const themePowers = themePowerGroups(entity, c.context.byId.values()).flatMap(
    (group) => group.powers.map((power) => power.id),
  );
  const entries = detailStackEntries(entity, references, themePowers);
  const html = candidateDetailHtml(c, entity);
  const missing = entries.filter(
    ({ entity: part }) => !textOf(html).includes(part.name),
  );
  return [
    truthy(
      `${entity.name}'s stack${expected === undefined ? " has cards" : ` has about ${Math.round((expected.min + expected.max) / 2)} cards`}`,
      expected === undefined
        ? entries.length + themePowers.length > 0
        : entries.length >= expected.min && entries.length <= expected.max,
      `${entries.length} cards (${entries.filter(({ relationship }) => relationship === undefined).length} parts, ${entries.filter(({ relationship }) => relationship !== undefined).length} granted)${themePowers.length === 0 ? "" : ` + ${themePowers.length} theme powers`}: ${entries
        .slice(0, 12)
        .map(({ entity: part }) => part.name)
        .join(", ")}${entries.length > 12 ? ", …" : ""}`,
    ),
    truthy(
      "The detail pane renders every stack card",
      missing.length === 0,
      missing.length === 0
        ? `${entries.length} rendered`
        : `missing: ${missing.map(({ entity: part }) => part.name).join(", ")}`,
    ),
  ];
}

rule("sentinel-bear", "Build, level 21", "Other detail stacks", (c) =>
  detailStack(c, c.context.named("Archmage", "Epic Destiny")),
);
rule("wizard-gnome", "Build, level 1: Race", "Other detail stacks", (c) =>
  detailStack(c, c.context.named("Elemental Manifestation", "Racial Trait"), {
    min: 20,
    max: 32,
  }),
);
rule("wizard-gnome", "Build, level 1: Class", "Other detail stacks", (c) => {
  const references = candidateReferenceIndex(c.context.byId);
  const cleric = c.context.named("Cleric", "Class");
  const warlord = c.context.named("Warlord", "Class");
  const channel = namedClassFeatures(cleric, references).find(
    ({ name }) => name === "Channel Divinity",
  );
  const presence = namedClassFeatures(warlord, references).find(
    ({ name }) => name === "Commanding Presence",
  );
  const channelPowers =
    channel === undefined
      ? []
      : detailStackEntries(channel, references).filter(
          ({ relationship }) => relationship === "Granted power",
        );
  return [
    ...(presence === undefined
      ? [truthy("Warlord's Commanding Presence", false, "not found")]
      : detailStack(c, presence)),
    equal(
      "Cleric's Channel Divinity lists 12 powers",
      channelPowers.length,
      12,
    ),
  ];
});
rule("wizard-gnome", "Build, level 1: Theme", "Other detail stacks", (c) =>
  detailStack(c, c.context.named("Alchemist", "Theme")),
);
rule("warlock-fey", "Build, level 11", "Other detail stacks", (c) =>
  detailStack(c, c.context.entity("ID_FMP_PARAGON_PATH_14")),
);
rule("invoker-drow", "Details", "Other detail stacks", (c) => {
  const lolth = c.context.named("Lolth", "Deity");
  const references = candidateReferenceIndex(c.context.byId);
  const domains = detailStackEntries(lolth, references).filter(
    ({ entity }) => key(entity.type) === "domain",
  );
  return [
    ...detailStack(c, lolth),
    truthy(
      "Lolth's stack has her domain cards",
      domains.length > 0,
      domains.map(({ entity }) => entity.name).join(", "),
    ),
  ];
});

rule("invoker-drow", "Details", "Builder deity card", (c) => {
  const avandra = c.context.entity("ID_FMP_DEITY_1");
  const html = candidateDetailHtml(c, avandra);
  const text = textOf(html);
  const domains = deityDomainsText(avandra, (id) =>
    c.context.byId.get(key(id)),
  );
  const firstDomain = detailStackEntries(
    avandra,
    candidateReferenceIndex(c.context.byId),
  ).find(({ entity }) => key(entity.type) === "domain");
  const description = avandra.description.trim().split("\n")[0]!.slice(0, 40);
  return [
    truthy(
      "Avandra has domains",
      domains !== undefined && domains !== "",
      domains ?? "none",
    ),
    inOrder('"Domains: …" above the description, domain cards below', text, [
      `Domains: ${domains ?? ""}`,
      description,
      firstDomain?.entity.name ?? "(a domain card)",
    ]),
  ];
});

/* ------------------------------------------------------------------ */
/* Gnome wizard                                                        */
/* ------------------------------------------------------------------ */

rule("wizard-gnome", "Build, level 1: Race", "Gnome characters", (c) => [
  equal(
    "Race",
    c.sheet.identity.find(({ label }) => label === "Race")?.value,
    "Gnome",
  ),
  truthy("It evaluates complete", c.evaluation.complete),
  truthy(
    "… and legal",
    c.evaluation.legal,
    c.built.facts.diagnostics.slice(0, 3).join("; "),
  ),
]);

rule("wizard-gnome", "Build, level 1: Spellbook", "Wizard spellbook", (c) => {
  const evaluation = c.atLevels([1]);
  const choice = choicesAt(c, 1, evaluation).find(
    ({ spellbook }) => spellbook !== undefined,
  );
  if (choice === undefined)
    return [truthy("A spellbook choice at level 1", false)];
  const current = selectedDefinition(c, choice, evaluation);
  const next = choice.candidates.find(
    (candidate) =>
      candidate.eligible &&
      key(candidate.definitionId) !== key(current?.id ?? ""),
  );
  if (next === undefined) return [truthy("Another spellbook option", false)];
  const entity = c.context.entity(next.definitionId);
  const command = commandForEvaluatedChoice(
    c.build,
    choice,
    evaluation.occurrences,
    c.context.entities,
    {
      id: "verify:spellbook",
      identity: {
        definitionId: entity.id,
        name: entity.name,
        type: entity.type,
      },
      acquiredLevel: choice.level,
      legality: "rules-legal",
      children: [],
      unresolved: false,
    },
    (index) => `verify:spellbook:placeholder:${index}`,
  );
  if (command === undefined)
    return [truthy("The spellbook pick command", false, "no command")];
  const transaction = new CharacterTransaction(c.build);
  transaction.dispatch(command);
  const after = evaluate(transaction.current, c.context.entities, {
    candidateDetailLevels: [1],
    includePowers: false,
  });
  const again = after.choices.find(({ id }) => id === choice.id);
  const picks = (value: EvaluatedCharacter) =>
    value.choices
      .filter(({ spellbook }) => spellbook !== undefined)
      .map((item) => selectedDefinition(c, item, value)?.name);
  return [
    equal(
      `Replacing ${current?.name} with ${entity.name} sticks after re-evaluation`,
      again === undefined
        ? undefined
        : selectedDefinition(c, again, after)?.name,
      entity.name,
    ),
    equal(
      "The other spellbook picks are unchanged",
      picks(after).filter((name) => name !== entity.name),
      picks(evaluation).filter((name) => name !== current?.name),
    ),
  ];
});

rule(
  "wizard-gnome",
  "Build, level 4: Feats",
  '"Already owned" candidates',
  (c) => {
    const evaluation = c.atLevels([4]);
    const choice = choicesAt(c, 4, evaluation).find(
      ({ type }) => key(type) === "feat",
    );
    const earlier = evaluation.choices
      .filter(({ level, type }) => level < 4 && key(type) === "feat")
      .map((item) => selectedDefinition(c, item, evaluation))
      .filter((entity): entity is ContentEntity => entity !== undefined);
    return earlier
      .map((feat) => {
        const candidate = choice?.candidates.find(
          ({ definitionId }) => key(definitionId) === key(feat.id),
        );
        return truthy(
          `${feat.name} (taken earlier) is unavailable at level 4: "Already owned"`,
          candidate !== undefined &&
            !candidate.eligible &&
            candidateReason(candidate.reasons).includes("Already owned"),
          candidate === undefined
            ? "not a candidate"
            : `${candidate.eligible ? "eligible" : "unavailable"}: ${candidateReason(candidate.reasons)}`,
        );
      })
      .concat([
        truthy(
          "Feats taken before level 4",
          earlier.length > 0,
          earlier.map(({ name }) => name).join(", "),
        ),
      ]);
  },
);

rule(
  "wizard-gnome",
  "Build, level 5: Powers",
  "Order Adept with a spellbook",
  (c) => {
    const evaluation = c.atLevels([5]);
    const theme = c.context.entity("ID_FMP_THEME_851");
    const themePowers = new Set(
      themePowerGroups(theme, c.context.byId.values()).flatMap((group) =>
        group.powers.map((power) => key(power.id)),
      ),
    );
    const powerChoices = choicesAt(c, 5, evaluation).filter(
      (choice) => choiceSelectionTableKind(choice) === "power",
    );
    const offered = powerChoices.flatMap((choice) =>
      choice.candidates
        .filter(
          (candidate) =>
            isCandidateVisible(candidate, false) &&
            themePowers.has(key(candidate.definitionId)),
        )
        .map(
          ({ definitionId }) =>
            `${entityName(c, definitionId)} (${choice.type})`,
        ),
    );
    return [
      truthy(
        "The Order Adept theme has powers",
        themePowers.size > 0,
        `${themePowers.size}`,
      ),
      truthy(
        "Level 5 has power choices",
        powerChoices.length > 0,
        powerChoices.map(({ type, name }) => name ?? type).join(", "),
      ),
      truthy(
        "No level-5 power choice offers an Order Adept power",
        offered.length === 0,
        offered.join(", ") || "none offered",
      ),
    ];
  },
);

rule("wizard-gnome", "Equipment", "A free item appears", (c) =>
  freeItem(c, "Spellbook"),
);

/** Powers an item's detail pane lists as cards. */
function itemPowers(c: ReviewCharacter, entity: ContentEntity) {
  const html = itemDetailHtml(c, {
    entities: [entity],
    displayName: entity.name,
    effectiveLevel: c.build.effectiveLevel,
  });
  const powers = elementsWithClass(html, "print-power-card");
  return { html, powers };
}

rule("wizard-gnome", "Shop: implements", "Equipment item details", (c) => {
  const wands = c.context.entities.filter((entity) =>
    /wand/i.test(contentSpecificValue(entity, "Magic Item Type") ?? ""),
  );
  const listed = wands
    .map((wand) => ({
      wand,
      offered: offeredDetailEntities(
        wand,
        candidateReferenceIndex(c.context.byId),
      ).filter(({ type }) => key(type) === "power"),
    }))
    .filter(({ offered }) => offered.length > 0);
  const sample = listed[0];
  const shown = sample === undefined ? undefined : itemPowers(c, sample.wand);
  return [
    truthy(
      "Wands grant powers",
      listed.length > 0,
      `${listed.length} of ${wands.length} wands name powers`,
    ),
    truthy(
      `${sample?.wand.name}'s detail pane lists its powers`,
      shown !== undefined && shown.powers.length === sample!.offered.length,
      `${shown?.powers.length ?? 0} power cards for ${sample?.offered.map(({ name }) => name).join(", ")}`,
    ),
  ];
});

function eyeOfVecna(c: ReviewCharacter): Check[] {
  const eye = c.context.entities.find((entity) =>
    /^(the )?eye of vecna$/i.test(entity.name),
  );
  if (eye === undefined)
    return [truthy("The Eye of Vecna", false, "not found")];
  const offered = offeredDetailEntities(
    eye,
    candidateReferenceIndex(c.context.byId),
  ).filter(({ type }) => key(type) === "power");
  const { powers, html } = itemPowers(c, eye);
  return [
    truthy(
      `${eye.name} names powers`,
      offered.length > 0,
      offered.map(({ name }) => name).join(", "),
    ),
    equal(
      `${eye.name}'s detail pane lists them as cards`,
      powers.length,
      offered.length,
    ),
    ...offered.map((power) =>
      contains(`… ${power.name}`, textOf(html), power.name),
    ),
  ];
}
rule("wizard-gnome", "Shop: special items", "Equipment item details", (c) =>
  eyeOfVecna(c),
);
rule("wizard-gnome", "Shop: special items", "Other detail stacks", (c) =>
  eyeOfVecna(c),
);

/** Evaluated stats with one chosen definition removed from the build. */
function statsWithout(c: ReviewCharacter, definitionId: string) {
  const occurrence = c.evaluation.occurrences.find(
    (value) => key(value.definitionId) === key(definitionId),
  );
  const transaction = new CharacterTransaction(c.build);
  if (
    occurrence !== undefined &&
    findOccurrence(c.build, occurrence.id) !== undefined
  )
    transaction.dispatch({
      kind: "remove-occurrence",
      occurrenceId: occurrence.id,
    });
  return evaluate(transaction.current, c.context.entities, {
    candidateDetailLevels: [],
  }).stats;
}

/* ------------------------------------------------------------------ */
/* Familiars                                                           */
/* ------------------------------------------------------------------ */

function familiarChoice(c: ReviewCharacter, familiar: string): Check[] {
  const levels = Array.from(
    { length: c.build.effectiveLevel },
    (_, i) => i + 1,
  );
  const evaluation = c.atLevels(levels);
  const choice = evaluation.choices.find(
    ({ type }) => key(type) === "familiar",
  );
  const chosen =
    choice === undefined
      ? undefined
      : selectedDefinition(c, choice, evaluation);
  const html = chosen === undefined ? "" : candidateDetailHtml(c, chosen);
  return [
    equal(
      `The familiar choice's pick (level ${choice?.level})`,
      chosen?.name,
      familiar,
    ),
    contains(
      "Its detail pane is the familiar card in panel layout",
      html,
      "print-familiar-card is-panel",
    ),
    contains("… named", textOf(html), familiar),
  ];
}
rule("warlock-fey", "Build, level 11", "Familiar choice", (c) =>
  familiarChoice(c, "Arcane Wisp"),
);
rule("artificer-ardent", "Build, level 1: Feats", "Familiar choice", (c) =>
  familiarChoice(c, "Sprite"),
);

/** The familiar card right after Skills, and no "Familiar: X" power. */
function printedFamiliar(
  c: ReviewCharacter,
  name: string,
): { checks: Check[]; card: PrintedCard | undefined } {
  const deck = printedDeck(c);
  const skills = deck.findIndex(({ kind }) => kind === "play-skills");
  const at = deck.findIndex(
    ({ kind, label }) => kind === "familiar" && label === name,
  );
  const companions = deck
    .slice(skills + 1)
    .findIndex(({ kind }) => kind !== "beast" && kind !== "familiar");
  return {
    card: deck[at],
    checks: [
      truthy(
        `The ${name} card follows Skills (after any beast)`,
        at > skills && (companions < 0 || at < skills + 1 + companions),
        deck
          .slice(0, Math.max(at, skills) + 2)
          .map(({ label }) => label)
          .join(" → "),
      ),
      truthy(
        `No "Familiar: ${name}" power card`,
        !c.sheet.powers.some((power) => /^familiar:/i.test(power.name)),
        c.sheet.powers
          .filter((power) => /familiar/i.test(power.name))
          .map((power) => power.name)
          .join(", ") || "none",
      ),
    ],
  };
}

rule("warlock-fey", "Print preview", "Familiar card", (c) => {
  const { checks, card } = printedFamiliar(c, "Arcane Wisp");
  const familiar = card?.card.kind === "familiar" ? card.card : undefined;
  const hidden =
    familiar === undefined
      ? ""
      : markup(
          createElement(
            HideFlavortextContext.Provider,
            { value: true },
            createElement(FamiliarCard, { card: familiar }),
          ),
        );
  return [
    ...checks,
    contains('Speed "fly 8 (hover)"', card?.text ?? "", "fly 8 (hover)"),
    contains("The rules line", card?.text ?? "", FAMILIAR_RULES_REMINDER),
    truthy(
      "Hide flavor text drops the description",
      familiar?.description !== undefined &&
        textOf(card?.html ?? "").includes(familiar.description.slice(0, 30)) &&
        !textOf(hidden).includes(familiar.description.slice(0, 30)),
      familiar?.description?.slice(0, 60) ?? "no description",
    ),
  ];
});

rule("artificer-ardent", "Print preview", "Familiar card", (c) => {
  const { checks, card } = printedFamiliar(c, "Sprite");
  const familiar = card?.card.kind === "familiar" ? card.card : undefined;
  const without =
    familiar === undefined
      ? undefined
      : sheetFamiliarCard(
          c.context.named("Sprite", "Familiar"),
          statsWithout(c, "ID_FMP_FEAT_1710"),
        ).defenses.ac;
  return [
    ...checks,
    contains('Speed "6, fly 6"', card?.text ?? "", "Speed 6, fly 6"),
    equal(
      "Vigorous Familiar adds AC +1 (vs. the familiar without it)",
      familiar?.defenses.ac === undefined || without === undefined
        ? undefined
        : familiar.defenses.ac - without,
      1,
    ),
  ];
});

rule(
  "invoker-drow",
  "Print preview",
  "Familiar card",
  (c) => printedFamiliar(c, "Spiderling of Lolth").checks,
);

/* ------------------------------------------------------------------ */
/* Hybrid executioners                                                 */
/* ------------------------------------------------------------------ */

const AS_HYBRID_FEATURE = "ID_CDJ_CLASS_FEATURE_HYBRID_ASSASSINS_STRIKE";
const AS_HYBRID_POWER = "ID_CDJ_POWER_HYBRID_ASSASSINS_STRIKE";

/** Assassin's Strike upgrade choices at a level. */
function upgradeChoices(
  c: ReviewCharacter,
  level: number,
  evaluation: EvaluatedCharacter,
) {
  return choicesAt(c, level, evaluation).filter((choice) => {
    const provider = evaluation.occurrences.find(
      ({ id }) => id === choice.providerOccurrenceId,
    );
    return (
      key(provider?.definitionId ?? "") === key(AS_HYBRID_FEATURE) ||
      choice.candidates.some(({ definitionId }) =>
        /_ASSASSINS_STRIKE_\d+$/i.test(definitionId),
      )
    );
  });
}

for (const level of [7, 13, 17, 23, 27])
  rule(
    "executioner-fighter",
    `Build, level ${level}`,
    "Assassin's Strike (Hybrid)",
    (c) => {
      const evaluation = c.atLevels([7, 13, 17, 23, 27]);
      const choices = upgradeChoices(c, level, evaluation);
      const choice = choices[0];
      const selected =
        choice === undefined
          ? undefined
          : evaluation.occurrences.find(
              ({ id }) => id === choice.selectedOccurrenceId,
            )?.definitionId;
      const visible = (choice?.candidates ?? []).filter((candidate) =>
        isCandidateVisible(candidate, false, selected),
      );
      return [
        equal(`One upgrade choice at level ${level}`, choices.length, 1),
        equal(
          "It shows exactly one option",
          visible.map(({ definitionId }) => entityName(c, definitionId)),
          visible.length === 1
            ? visible.map(({ definitionId }) => entityName(c, definitionId))
            : ["(one option)"],
        ),
      ];
    },
  );

rule(
  "executioner-fighter",
  "Build, level 7",
  "Hybrid executioner without Assassin's Strike",
  (c) => {
    const upgrade = c.context.entity(
      "ID_CDJ_CLASS_FEATURE_LV7_ASSASSINS_STRIKE_1",
    );
    const prerequisites =
      upgrade.printPrerequisites ?? upgrade.prerequisites ?? "";
    return [
      truthy(
        "The upgrade's prerequisite lists Assassin's Strike (Hybrid) first",
        prerequisites.trim().startsWith("Assassin's Strike (Hybrid)"),
        JSON.stringify(prerequisites),
      ),
    ];
  },
);

rule(
  "executioner-rogue",
  "Build, level 7",
  "Hybrid executioner without Assassin's Strike",
  (c) => {
    const evaluation = c.atLevels([7]);
    return [
      truthy(
        "The character has no Assassin's Strike (Hybrid)",
        !evaluation.occurrences.some(
          ({ definitionId }) => key(definitionId) === key(AS_HYBRID_POWER),
        ),
      ),
      equal(
        "No upgrade choice at level 7",
        upgradeChoices(c, 7, evaluation).length,
        0,
      ),
    ];
  },
);

rule("executioner-fighter", "Equipment", "A free item appears", (c) => {
  // The hybrid's Poison Use (Hybrid) now picks a recipe (Bloodroot Poison
  // Recipe), whose FREEBEE gives one dose, once.
  const gifts = c.build.inventory.filter((holding) =>
    /poison/i.test(holding.elements.map(({ name }) => name).join(" ")),
  );
  const pending = freebeeGiftCommand(c.build, c.evaluation, c.context.byId);
  return [
    truthy(
      "The hybrid has Poison Use (Hybrid)",
      c.evaluation.occurrences.some(
        ({ definitionId }) =>
          key(definitionId) === key("ID_CDJ_CLASS_FEATURE_40012"),
      ),
    ),
    equal("No free item is pending", pending, undefined),
    equal(
      "Its recipe's poison, once",
      gifts.map((holding) =>
        holding.elements.map(({ name }) => name).join(" + "),
      ),
      ["Bloodroot Poison (heroic tier)"],
    ),
  ];
});

function assassinsStrike(text: string, label: string): Check[] {
  return [
    contains(`${label}: "Additional effects"`, text, "Additional effects"),
    contains(`${label}: "+4d10 extra damage."`, text, "+4d10 extra damage."),
  ];
}
rule(
  "executioner-fighter",
  "Print preview",
  "Assassin's Strike (Hybrid)",
  (c) =>
    assassinsStrike(
      printedCard(c, "Assassin's Strike (Hybrid)").text,
      "Printed card",
    ),
);
rule(
  "executioner-fighter",
  "Build, level 1: Powers",
  "Assassin's Strike (Hybrid)",
  (c) =>
    assassinsStrike(
      textOf(candidateDetailHtml(c, c.context.entity(AS_HYBRID_POWER))),
      "Builder panel card",
    ),
);

/** A printed card's weapon rows. */
function weaponRows(c: ReviewCharacter, power: string): string[] {
  return (
    c.sheet.powers.find(({ name }) => name === power)?.variants ?? []
  ).map(({ equipmentName }) => equipmentName);
}

rule("executioner-fighter", "Print preview", "Power weapon rows", (c) => {
  const bola = weaponRows(c, "Bola Takedown");
  const coward = weaponRows(c, "Coward's Reward");
  return [
    equal(
      "Bola Takedown's weapon rows: only the bola",
      bola.filter((name) => name !== "Unarmed"),
      ["Bola"],
    ),
    truthy("… and no unarmed row", !bola.includes("Unarmed"), bola.join(", ")),
    truthy(
      "Coward's Reward lists the rapier",
      coward.includes("Rapier"),
      coward.join(", "),
    ),
    truthy("… not the bola", !coward.includes("Bola"), coward.join(", ")),
  ];
});

rule("executioner-rogue", "Print preview", "Power weapon rows", (c) => {
  const grapple = weaponRows(c, "Throw Grapple");
  const lightBlade = c.sheet.powers.filter((card) =>
    card.fields.some(
      ({ label, value }) =>
        label === "Requirement" &&
        /crossbow, a light blade, or a sling/i.test(value),
    ),
  );
  const named = c.sheet.powers.flatMap((card) => {
    const requirement =
      card.fields.find(({ label }) => label === "Requirement")?.value ?? "";
    const weapon =
      /must (?:use this power with|be wielding) an? ([a-z ]+)\.$/i.exec(
        requirement,
      )?.[1];
    if (
      weapon === undefined ||
      /light blade|melee weapon|hand free|crossbow/i.test(weapon)
    )
      return [];
    const rows = (card.variants ?? []).map(
      ({ equipmentName }) => equipmentName,
    );
    return [{ name: card.name, weapon, rows }];
  });
  return [
    truthy(
      "Throw Grapple has a no-weapon row",
      grapple.includes("Unarmed"),
      grapple.join(", "),
    ),
    truthy(
      'Powers needing "a crossbow, a light blade, or a sling" list only the light blade',
      lightBlade.length > 0 &&
        lightBlade.every((card) =>
          (card.variants ?? []).every(({ equipmentName }) =>
            /short sword/i.test(equipmentName),
          ),
        ),
      lightBlade
        .map(
          (card) =>
            `${card.name}: ${(card.variants ?? []).map(({ equipmentName }) => equipmentName).join(", ")}`,
        )
        .join("; "),
    ),
    ...named.map(({ name, weapon, rows }) =>
      truthy(
        `${name} (needs a ${weapon}) lists only allowed weapons`,
        rows.every(
          (row) =>
            key(row).includes(key(weapon)) ||
            (key(weapon) === "grappling hook" && row === "Unarmed"),
        ),
        rows.join(", ") || "no rows",
      ),
    ),
  ];
});

rule("executioner-rogue", "House rules", '"Equipped item requirement"', (c) => {
  const groups = builderIssueGroups({
    evaluation: c.evaluation,
    byId: c.context.byId,
    effectiveLevel: c.build.effectiveLevel,
    planningHorizon: c.build.effectiveLevel,
    abilityScoresIncomplete: false,
    abilityScoresHouseRuled: false,
  });
  const all = [...groups.houseRules, ...groups.warnings, ...groups.errors];
  const issue = all.find(({ title, detail }) =>
    /equipped item requirement/i.test(`${title} ${detail}`),
  );
  return [
    truthy(
      "An Equipped item requirement issue",
      issue !== undefined,
      issue === undefined
        ? all.map(({ title }) => title).join("; ")
        : `${issue.kind}: ${issue.title} — ${issue.detail}`,
    ),
    contains(
      "… naming the Warsoul Weapon",
      issue === undefined ? "" : `${issue.title} ${issue.detail}`,
      "Warsoul",
    ),
    equal("… under House rules", issue?.kind, "house-rule"),
  ];
});

/* ------------------------------------------------------------------ */
/* Drow invoker: god fragment, item sets, Rose Scythe                  */
/* ------------------------------------------------------------------ */

function fragmentPower(c: ReviewCharacter): Check[] {
  const card = c.sheet.powers.find(({ name }) => /^Fragment of /.test(name));
  const printed = printedDeck(c).find((value) => value.card === card);
  const encounters = printedDeck(c)
    .filter(
      ({ card: value }) =>
        value.kind === "power" &&
        classifyPowerCard(value as never).usage === "encounter",
    )
    .map(({ label }) => label);
  return [
    truthy(
      "The fragment's power card is on the sheet",
      card !== undefined,
      card?.name ?? "none",
    ),
    equal("Its usage", card?.usage, "Encounter"),
    equal(
      "Its action",
      card === undefined ? undefined : powerActionLabel(card.actionType),
      "Free",
    ),
    contains(
      "… with the Free action icon",
      printed?.html ?? "",
      'action-type-icon" aria-hidden="true" title="Free"',
    ),
    // The checklist's "keyword band": the fragment's authored Keywords are
    // empty, so the card has none.
    equal("Its keywords (authored empty)", card?.keywords ?? "", ""),
    truthy(
      "It is printed among the encounter powers",
      card !== undefined && encounters.includes(card.name),
      encounters.join(", "),
    ),
  ];
}

rule("invoker-drow", "Build, level 11: Feats", "Awaken God Fragment", (c) => {
  const evaluation = c.atLevels([11]);
  const feat = choicesAt(c, 11, evaluation).find(
    ({ type }) => key(type) === "feat",
  );
  const fragment = choicesAt(c, 11, evaluation).find(
    ({ type }) => key(type) === "god fragment",
  );
  return [
    equal(
      "The level-11 feat",
      feat === undefined
        ? undefined
        : selectedDefinition(c, feat, evaluation)?.name,
      "Awaken God Fragment",
    ),
    equal(
      "Its fragment choice",
      fragment === undefined
        ? undefined
        : selectedDefinition(c, fragment, evaluation)?.name,
      "Fragment of Avandra",
    ),
    ...fragmentPower(c),
  ];
});
rule("invoker-drow", "Print preview", "Awaken God Fragment", (c) => {
  const entry = printedPagesFor(c).references.find(
    ({ name }) => name === "Awaken God Fragment",
  );
  return [
    truthy("A reference entry", entry !== undefined),
    truthy(
      '… with a "Constant Benefits" line',
      entry?.parts.some(({ label }) => label === "Constant Benefits") === true,
      (entry?.parts ?? []).map(({ label }) => label ?? "text").join(", "),
    ),
    contains(
      'Printed as "Constant Benefits:"',
      printedPagesFor(c).text,
      "Constant Benefits:",
    ),
    ...fragmentPower(c),
  ];
});
rule("invoker-drow", "Sheet (on screen)", "Awaken God Fragment", (c) => {
  const card = c.sheet.powers.find(({ name }) => /^Fragment of /.test(name));
  return [
    truthy(
      "The on-screen Powers grid includes the fragment's card",
      card !== undefined,
      card?.name ?? "none",
    ),
    contains(
      "… rendered as a panel power card",
      card === undefined
        ? ""
        : markup(
            createElement(PowerCard, {
              card,
              characterLevel: c.build.effectiveLevel,
              layout: "panel",
            }),
          ),
      "print-power-card is-panel",
    ),
  ];
});

function inventoryDetail(
  c: ReviewCharacter,
  name: RegExp,
  partyPieces = false,
  build: CharacterBuild = c.build,
) {
  const entry = build.inventory.find((holding) =>
    holding.elements.some((element) => name.test(element.name)),
  );
  const detail =
    entry === undefined
      ? undefined
      : inventoryItemDetail(entry, c.context.byId);
  return detail === undefined
    ? ""
    : itemDetailHtml(c, detail, { partyPieces, cards: c.cards(build) });
}

function itemSetPanel(html: string, label: string): Check[] {
  return [
    contains(`${label}: an Item Set panel card`, html, "print-item-set-card"),
    contains(`${label}: … in panel layout`, html, "is-panel"),
    contains(`${label}: … subheaded "Item set"`, textOf(html), "Item set"),
  ];
}

rule("invoker-drow", "Equipment", "Equipment and Shop item detail", (c) =>
  itemSetPanel(
    inventoryDetail(c, /Scarf of Reconciliation/),
    "Scarf of Reconciliation",
  ),
);
rule("fighter-arena", "Equipment", "Equipment and Shop item detail", (c) =>
  itemSetPanel(
    inventoryDetail(c, /Clear-Blood Baldric/),
    "Clear-Blood Baldric",
  ),
);
rule(
  "invoker-drow",
  "Shop: implements",
  "Equipment and Shop item detail",
  (c) => {
    const piece = c.context.entity("ID_FMP_MAGIC_ITEM_7453");
    const html = itemDetailHtml(
      c,
      catalogItemDetail(
        piece,
        undefined,
        c.build.effectiveLevel,
        c.context.byId,
      ),
      { partyPieces: true },
    );
    return [
      ...itemSetPanel(html, `${piece.name} (Shop)`),
      contains("The Party pieces field", textOf(html), "Party pieces"),
      contains(
        "… with its hint",
        textOf(html),
        "Pieces of this set you and your allies wield",
      ),
    ];
  },
);
rule("invoker-drow", "Shop: implements", "Superior implements", (c) => {
  const symbol = c.context.entities.find(
    (entity) =>
      /^accurate symbol$/i.test(entity.name) ||
      (/accurate/i.test(entity.name) && /symbol/i.test(entity.name)),
  );
  if (symbol === undefined)
    return [truthy("An accurate symbol", false, "not found")];
  return itemCardDetail(
    itemDetailHtml(
      c,
      catalogItemDetail(
        symbol,
        undefined,
        c.build.effectiveLevel,
        c.context.byId,
      ),
    ),
    symbol.name,
  );
});

const BOONS = "ID_FMP_ITEM_SET_33";

function withText(
  c: ReviewCharacter,
  name: string,
  value: string,
): CharacterBuild {
  const transaction = new CharacterTransaction(c.build);
  transaction.dispatch({ kind: "set-text", name, value });
  return transaction.current;
}

rule("invoker-drow", "Equipment", "Party pieces field", (c) => {
  const countName = itemSetPartyCountName(BOONS, c.build.textStrings);
  const set = c.context.entity(BOONS);
  const cardFor = (build: CharacterBuild) => {
    const evaluation = evaluate(build, c.context.entities, {
      candidateDetailLevels: [],
    });
    return {
      evaluation,
      card: sheetItemSetCard(
        set,
        (id) => c.context.byId.get(key(id)),
        evaluation.itemSets,
        build.textStrings,
      ),
    };
  };
  const unset = cardFor(c.build);
  const counted = cardFor(withText(c, countName, "3"));
  const cleared = cardFor(withText(c, countName, ""));
  const changed = Object.keys(counted.evaluation.stats).filter(
    (name) =>
      counted.evaluation.stats[name]?.value !==
      unset.evaluation.stats[name]?.value,
  );
  const unsetHtml = markup(
    createElement(ItemSetCard, { card: unset.card, layout: "panel" }),
  );
  const clearedHtml = markup(
    createElement(ItemSetCard, { card: cleared.card, layout: "panel" }),
  );
  return [
    equal("Unset, the count is blank", unset.card.partyPieces, undefined),
    equal(
      "Entering 3 marks the 3-piece benefit active",
      counted.card.benefits.map(
        ({ pieceCount, active }) => `${pieceCount}:${active}`,
      ),
      counted.card.benefits.map(
        ({ pieceCount }) => `${pieceCount}:${pieceCount <= 3}`,
      ),
    ),
    truthy(
      "… and changes the totals",
      changed.length > 0,
      changed.slice(0, 6).join(", ") || "no stat changed",
    ),
    equal(
      "Clearing it returns to a blank",
      cleared.card.partyPieces,
      undefined,
    ),
    contains(
      "… with nothing dimmed (count-unknown card)",
      clearedHtml,
      "is-count-unknown",
    ),
    equal("… the same as before", clearedHtml, unsetHtml),
    equal("-1 is rejected", parsePartyPieces("-1"), undefined),
    equal("1.5 is rejected", parsePartyPieces("1.5"), undefined),
    equal("0 is accepted", parsePartyPieces("0"), { pieces: 0 }),
  ];
});

rule("invoker-drow", "Print preview", "Item Set card", (c) => {
  const deck = printedDeck(c);
  const at = deck.findIndex(
    ({ kind, label }) => kind === "item-set" && label === "Caelynnvala's Boons",
  );
  const set = deck[at];
  const pieceIds =
    set?.card.kind === "item-set" ? set.card.pieceIds.map(key) : [];
  const lastPiece = deck.reduce(
    (last, { card }, index) =>
      card.kind === "item" &&
      card.id !== undefined &&
      pieceIds.includes(key(card.id))
        ? index
        : last,
    -1,
  );
  return [
    truthy(
      "The set card follows its last piece's card",
      at >= 0 && at === lastPiece + 1,
      deck
        .slice(Math.max(0, lastPiece - 1), at + 2)
        .map(({ label }) => label)
        .join(" → "),
    ),
    contains(
      'Its "Party pieces" label (the checklist\'s "Group pieces")',
      set?.text ?? "",
      "Party pieces",
    ),
    contains(
      "… a Group type tag",
      set?.html ?? "",
      "<span>Item Set</span><span>Group</span>",
    ),
    contains(
      "… and its note",
      set?.text ?? "",
      "Counts the set's pieces you and your allies wield.",
    ),
  ];
});

rule("invoker-drow", "Print preview", "Printed group-set card", (c) => {
  const set = c.context.entity(BOONS);
  const unsetCard = c.sheet.itemSets?.find(({ id }) => key(id) === key(BOONS));
  const build = withText(
    c,
    itemSetPartyCountName(BOONS, c.build.textStrings),
    "3",
  );
  const evaluation = evaluate(build, c.context.entities, {
    candidateDetailLevels: [],
  });
  const setCard = sheetItemSetCard(
    set,
    (id) => c.context.byId.get(key(id)),
    evaluation.itemSets,
    build.textStrings,
  );
  const unset =
    unsetCard === undefined
      ? ""
      : markup(createElement(ItemSetCard, { card: unsetCard }));
  const counted = markup(createElement(ItemSetCard, { card: setCard }));
  const locked = setCard.benefits.filter(({ active }) => !active).length;
  return [
    contains(
      'Unset: "Party pieces" with a blank line',
      unset,
      '<dt>Party pieces</dt><dd><span class="print-write-in">',
    ),
    contains("… and full-strength benefits", unset, "is-count-unknown"),
    contains("With 3: the count", counted, "<dt>Party pieces</dt><dd>3</dd>"),
    truthy(
      "… locked benefits dimmed (not active)",
      locked > 0 && !counted.includes("is-count-unknown"),
      `${locked} locked`,
    ),
  ];
});

rule("invoker-drow", "Print preview", "Printed Deity entry", (c) => {
  const entry = printedPagesFor(c).references.find(
    ({ group }) => group === "Deity",
  );
  const pages = printedPagesFor(c).html;
  const at = pages.indexOf("<h3>Avandra</h3>");
  const body = at < 0 ? "" : pages.slice(at, pages.indexOf("</section>", at));
  return [
    ...printedDeity(c, "Avandra"),
    truthy(
      "The description keeps its bullets",
      /<li|•/.test(body),
      `${entry?.parts.length ?? 0} parts`,
    ),
  ];
});

rule("warlock-fey", "Build, level 1: Class", "Wizard spellbook", (c) => {
  const evaluation = c.atLevels([1]);
  const choice = choicesAt(c, 1, evaluation).find((item) =>
    item.candidates.some(({ definitionId }) =>
      /ELDRITCH_BLAST_CONSTITUTION/i.test(definitionId),
    ),
  );
  if (choice === undefined)
    return [truthy("Eldritch Blast's ability choice", false, "not found")];
  const names = choice.candidates.map(({ definitionId }) =>
    entityName(c, definitionId),
  );
  const current = selectedDefinition(c, choice, evaluation);
  const pick = (build: CharacterBuild, target: string) => {
    const live = evaluate(build, c.context.entities, {
      candidateDetailLevels: [1],
      includePowers: false,
    });
    const item = live.choices.find(({ id }) => id === choice.id) ?? choice;
    const entity = c.context.entity(
      choice.candidates.find(
        ({ definitionId }) => entityName(c, definitionId) === target,
      )!.definitionId,
    );
    const command = commandForEvaluatedChoice(
      build,
      item,
      live.occurrences,
      c.context.entities,
      {
        id: `verify:eldritch:${target}`,
        identity: {
          definitionId: entity.id,
          name: entity.name,
          type: entity.type,
        },
        acquiredLevel: 1,
        legality: "rules-legal",
        children: [],
        unresolved: false,
      },
      (index) => `verify:eldritch:${target}:${index}`,
    );
    const transaction = new CharacterTransaction(build);
    if (command !== undefined) transaction.dispatch(command);
    const after = evaluate(transaction.current, c.context.entities, {
      candidateDetailLevels: [1],
      includePowers: false,
    });
    const again = after.choices.find(({ id }) => id === choice.id);
    return {
      build: transaction.current,
      name:
        again === undefined
          ? undefined
          : selectedDefinition(c, again, after)?.name,
    };
  };
  const other = names.find((name) => name !== current?.name)!;
  const changed = pick(c.build, other);
  const back = pick(changed.build, current?.name ?? "");
  return [
    equal("It offers Charisma and Constitution", names.toSorted(), [
      "Eldritch Blast Charisma",
      "Eldritch Blast Constitution",
    ]),
    equal(`Changing it to ${other}`, changed.name, other),
    equal("… and back", back.name, current?.name),
  ];
});

rule("invoker-drow", "Equipment", "Rose Scythe of Chauntea", (c) =>
  roseScythe(c, "builder"),
);
rule("invoker-drow", "Print preview", "Rose Scythe of Chauntea", (c) =>
  roseScythe(c, "print"),
);

function roseScythe(c: ReviewCharacter, where: "builder" | "print"): Check[] {
  const stat = c.evaluation.stats["implement:attack"];
  const rose = stat?.contributions.find(({ providerName }) =>
    /Rose Scythe/i.test(providerName ?? ""),
  );
  const holding = c.build.inventory.find((entry) =>
    entry.elements.some(({ name }) => /Rose Scythe/i.test(name)),
  );
  const transaction = new CharacterTransaction(c.build);
  if (holding !== undefined)
    transaction.dispatch({ kind: "remove-inventory", entryId: holding.id });
  const without = evaluate(transaction.current, c.context.entities, {
    candidateDetailLevels: [],
  });
  const power = c.evaluation.powers.find(
    (value) =>
      value.keywords.includes("Implement") && (value.variants?.length ?? 0) > 0,
  );
  const bonus = (evaluation: EvaluatedCharacter) =>
    evaluation.powers.find(
      ({ definitionId }) => definitionId === power?.definitionId,
    )?.variants?.[0]?.attackBonus;
  const card = c.sheet.powers.find(({ id }) => id === power?.definitionId);
  return [
    truthy(
      "The Rose Scythe's implement attack bonus applies",
      rose?.applied === true,
      rose === undefined
        ? "no Rose Scythe contribution to implement:attack"
        : `${rose.value} (${rose.applied ? "applied" : rose.reason})`,
    ),
    truthy(
      `${power?.name ?? "An implement power"} attacks better with it than without`,
      (bonus(c.evaluation) ?? 0) > (bonus(without) ?? 0),
      `with ${bonus(c.evaluation)}, without ${bonus(without)}`,
    ),
    ...(where === "print"
      ? [
          // The header shows the formula (D085); the number is in the
          // scythe's own row of the weapon table.
          contains(
            `The printed ${card?.name} card has a Rose Scythe row`,
            printedDeck(c).find((value) => value.card === card)?.text ?? "",
            "Rose Scythe of Chauntea",
          ),
          contains(
            `The printed ${card?.name} card shows its +${bonus(c.evaluation)} attack`,
            printedDeck(c).find((value) => value.card === card)?.text ?? "",
            `+${bonus(c.evaluation)}`,
          ),
        ]
      : []),
  ];
}

/* ------------------------------------------------------------------ */
/* Arena fighter                                                       */
/* ------------------------------------------------------------------ */

rule("fighter-arena", "Print preview", "Sub-choices on feature rows", (c) => {
  const reminder = c.sheet.overview?.reminders.find(
    ({ choice }) => choice !== undefined && /Arena/.test(`${choice}`),
  );
  return [
    truthy(
      "A page-1 reminder names its choice",
      reminder !== undefined,
      reminder === undefined ? "none" : `${reminder.label}: ${reminder.choice}`,
    ),
    contains(
      "… printed on page 1",
      printedPagesFor(c).text,
      `${reminder?.label}: ${reminder?.choice}`,
    ),
  ];
});

/** A conditional or applied weapon contribution total from one provider. */
function contributionTotal(
  c: ReviewCharacter,
  stats: readonly string[],
  provider: RegExp,
  condition?: RegExp,
) {
  return stats
    .flatMap((name) => c.evaluation.stats[name]?.contributions ?? [])
    .filter(
      (value) =>
        provider.test(value.providerName ?? "") &&
        (condition === undefined
          ? value.applied
          : condition.test(value.condition ?? "")),
    )
    .reduce((sum, value) => sum + (value.numericValue ?? 0), 0);
}

const tierStep = (level: number, values: readonly [number, number, number]) =>
  values[level >= 21 ? 2 : level >= 11 ? 1 : 0];

rule(
  "fighter-arena",
  "Print preview",
  "Spear Expertise [Arena Fighter]",
  (c) => {
    const total = contributionTotal(
      c,
      ["weapon,spear group:damage", "weapon,arena group:damage"],
      /Spear Expertise/,
      /charging/,
    );
    return [
      equal(
        `Charging damage with the arena spear at level ${c.build.effectiveLevel} (+1/+2/+3 by tier)`,
        total,
        tierStep(c.build.effectiveLevel, [1, 2, 3]),
      ),
    ];
  },
);

rule("fighter-arena", "Print preview", "Githzerai Blade Master", (c) => {
  const expected = tierStep(c.build.effectiveLevel, [2, 3, 4]);
  const glaive = c.evaluation.powers
    .find(({ name }) => name === "Melee Basic Attack")
    ?.variants?.find(({ equipmentName }) => equipmentName === "Glaive");
  const fromFeat = (glaive?.damageComponents ?? [])
    .filter(({ source }) => /Githzerai Blade Master/.test(source ?? ""))
    .reduce((sum, { value }) => sum + value, 0);
  return [
    equal(
      `Arena damage from the feat at level ${c.build.effectiveLevel} (+2/+3/+4 by tier)`,
      contributionTotal(c, ["arena group:damage"], /Githzerai Blade Master/),
      expected,
    ),
    equal("The glaive rows include it", fromFeat, expected),
    truthy(
      "Glaive Melee Basic Attack damage",
      glaive !== undefined,
      `${glaive?.damage} (${(glaive?.damageComponents ?? []).map(({ label, value }) => `${label} ${value}`).join(", ")})`,
    ),
  ];
});

rule("fighter-arena", "Print preview", "Numbers", (c) => [
  equal(
    "Dungeoneering bonus from Aleheart (2 pieces)",
    contributionTotal(c, ["Dungeoneering Misc"], /Aleheart/),
    2,
  ),
  equal(
    "Endurance bonus from Aleheart (2 pieces)",
    contributionTotal(c, ["Endurance Misc"], /Aleheart/),
    2,
  ),
]);

rule("fighter-arena", "Print preview", "Item Set card", (c) => {
  const deck = printedDeck(c);
  const at = deck.findIndex(({ kind }) => kind === "item-set");
  const set = deck[at];
  const card = set?.card.kind === "item-set" ? set.card : undefined;
  const pieceIds = (card?.pieceIds ?? []).map(key);
  const lastPiece = deck.reduce(
    (last, { card: value }, index) =>
      value.kind === "item" &&
      value.id !== undefined &&
      pieceIds.includes(key(value.id))
        ? index
        : last,
    -1,
  );
  const benefits = elementsWithClass(set?.html ?? "", "print-item-set-benefit");
  return [
    equal("The printed set", card?.name, "Aleheart Companions' Gear"),
    truthy(
      "It follows its last piece's card",
      at === lastPiece + 1,
      deck
        .slice(Math.max(0, lastPiece - 1), at + 2)
        .map(({ label }) => label)
        .join(" → "),
    ),
    contains("Pieces / Tier row", set?.html ?? "", "<dt>Pieces</dt><dd>2</dd>"),
    contains("… Tier", set?.html ?? "", "<dt>Tier</dt>"),
    truthy(
      "The 2-piece benefit: check icon and (active)",
      (benefits[0] ?? "").includes("is-active") &&
        (benefits[0] ?? "").includes("lucide-check") &&
        textOf(benefits[0] ?? "").includes("(active)"),
      textOf(benefits[0] ?? "").slice(0, 80),
    ),
    truthy(
      "The 4-piece benefit is not active (dimmed)",
      benefits[1] !== undefined && !benefits[1].includes("is-active"),
      textOf(benefits[1] ?? "").slice(0, 80),
    ),
    lacks("No set introduction in print", set?.html ?? "", "print-card-flavor"),
  ];
});

/* ------------------------------------------------------------------ */
/* Runepriest scholar, monk                                            */
/* ------------------------------------------------------------------ */

/** Language choices offering Draconic, Dwarven or Elven at a level. */
function scholarLanguageChoices(
  c: ReviewCharacter,
  evaluation: EvaluatedCharacter,
  level: number,
) {
  const three = ["Draconic", "Dwarven", "Elven"];
  return choicesAt(c, level, evaluation).filter(
    (choice) =>
      key(choice.type) === "language" &&
      choice.candidates.some(({ definitionId }) =>
        three.includes(entityName(c, definitionId)),
      ),
  );
}

rule("runepriest-scholar", "Build, level 5", "Scholar", (c) => {
  // The review runepriest knows all three by level 10; at level 5 with one
  // of them missing the Level 5 Scholar Feature offers it.
  const languages = c
    .atLevels([1])
    .occurrences.filter(({ definitionId }) =>
      ["Draconic", "Dwarven", "Elven"].includes(entityName(c, definitionId)),
    );
  const transaction = new CharacterTransaction(c.build);
  transaction.dispatch({ kind: "set-effective-level", level: 5 });
  const removable = languages.find(
    ({ id }) => findOccurrence(transaction.current, id) !== undefined,
  );
  if (removable !== undefined)
    transaction.dispatch({
      kind: "remove-occurrence",
      occurrenceId: removable.id,
    });
  const evaluation = evaluate(transaction.current, c.context.entities, {
    candidateDetailLevels: [5],
    includePowers: false,
  });
  const choices = scholarLanguageChoices(c, evaluation, 5);
  const offered = choices.flatMap((choice) =>
    choice.candidates
      .filter(({ eligible }) => eligible)
      .map(({ definitionId }) => entityName(c, definitionId)),
  );
  return [
    truthy(
      `At level 5 without ${removable === undefined ? "one of them" : entityName(c, removable.definitionId)}`,
      removable !== undefined,
      removable === undefined
        ? "no removable Draconic/Dwarven/Elven pick"
        : "removed",
    ),
    truthy(
      "A Draconic/Dwarven/Elven choice is offered",
      choices.length === 1 &&
        offered.length > 0 &&
        offered.every((name) =>
          ["Draconic", "Dwarven", "Elven"].includes(name),
        ),
      `${choices.length} choice(s): ${offered.join(", ")}`,
    ),
  ];
});

rule("runepriest-scholar", "Build, level 10", "Scholar", (c) => {
  const evaluation = c.atLevels([5, 10]);
  return [
    equal(
      "No such language choice at level 10",
      scholarLanguageChoices(c, evaluation, 10).length,
      0,
    ),
    truthy(
      "… and no unresolved language choice anywhere",
      !evaluation.choices.some(
        (choice) =>
          key(choice.type) === "language" &&
          !choice.optional &&
          choice.selectedOccurrenceId === undefined,
      ),
    ),
  ];
});

function monkWithGifts(c: ReviewCharacter) {
  const command = freebeeGiftCommand(c.build, c.evaluation, c.context.byId);
  const transaction = new CharacterTransaction(c.build);
  if (command !== undefined) transaction.dispatch(command);
  return { command, build: transaction.current };
}

rule("monk", "Build (first open)", "Older native characters", (c) => {
  const { command, build } = monkWithGifts(c);
  const added = build.inventory.filter(
    ({ id }) => !c.build.inventory.some((entry) => entry.id === id),
  );
  const again = freebeeGiftCommand(
    build,
    evaluate(build, c.context.entities, { candidateDetailLevels: [] }),
    c.context.byId,
  );
  return [
    truthy(
      "Opening it gives the missing gifts",
      command !== undefined && added.length > 0,
      added
        .map(({ elements }) => elements.map(({ name }) => name).join(" + "))
        .join("; ") || "nothing given",
    ),
    equal("A second open gives nothing more", again, undefined),
  ];
});
rule("monk", "Equipment", "A free item appears", (c) => {
  const { build } = monkWithGifts(c);
  const unarmed = build.inventory.find(({ elements }) =>
    elements.some(({ name }) => /unarmed/i.test(name)),
  );
  return [
    truthy(
      "The monk gets an Unarmed Strike",
      unarmed !== undefined,
      unarmed?.elements.map(({ name }) => name).join(" + ") ?? "none",
    ),
    equal(
      "… equipped in the off-hand",
      unarmed?.equippedSlots?.map(({ slot }) => slot),
      ["off-hand"],
    ),
  ];
});

export const CHARACTER_RULES: readonly Rule[] = rules;
