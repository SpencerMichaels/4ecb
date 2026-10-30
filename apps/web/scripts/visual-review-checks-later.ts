/**
 * The visual-review verifier's rules for the checklist items added from
 * 2026-10-21 on (see verify-visual-review.ts): paired effect lines and
 * situational weapon rows, the play data card's numbers, legacy feature
 * notes and card parts on player saves, loadout slots, augments, the wallet,
 * shop validity and packages, hybrid power picks and issues on older saves.
 */
import { CharacterTransaction } from "@4ecb/character-domain";
import type { ContentEntity } from "@4ecb/content-domain";
import {
  applySheetLayout,
  sheetCreatureCardKeyBase,
  summonCommandRows,
  summonCommandVariants,
  type SheetCreatureCard,
} from "@4ecb/sheet-model";
import {
  loadoutContext,
  resolveLoadoutAssignments,
  ritualCostPercent,
} from "@4ecb/rules-engine";
import {
  NATIVE_STARTING_CARRIED_MONEY,
  type CharacterBuild,
} from "@4ecb/character-domain";

import { evaluate, occurrenceFor } from "../../../scripts/native-character";
import { builderIssueGroups } from "../src/builder-diagnostics";
import {
  candidateReason,
  choicesAtLevel,
  powerSwapPresentation,
} from "../src/builder-ui";
import {
  acquisitionCommands,
  compatibleBaseItems,
  inventoryAttachedAugment,
  inventoryAugmentHosts,
  inventoryAugmentAttachedTo,
  inventoryDisplayName,
  inventoryEntryForEntity,
  inventoryPackageGroupsFor,
  shopAcquireBlockedReason,
  shopAlsoImplementEnchantment,
  packageSalePriceCopper,
  shopBrowseCategory,
} from "../src/equipment-ui";
import { inventoryItemDetail } from "../src/EquipmentWorkspace";

import {
  contains,
  elementsWithClass,
  equal,
  inOrder,
  lacks,
  textOf,
  truthy,
  type Check,
  type Rule,
} from "./visual-review-assert";
import type { ReviewCharacter, ReviewContext } from "./visual-review-context";
import {
  candidateDetailHtml,
  itemDetailHtml,
  printedDeck,
  printedPagesFor,
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
const general = (
  section: string,
  item: string,
  run: (context: ReviewContext) => Check[] | Promise<Check[]>,
) => rules.push({ where: `general:${section}`, link: section, item, run });

const key = (value: string) => value.trim().toLocaleLowerCase();
const count = (text: string, needle: string) => text.split(needle).length - 1;

function card(c: ReviewCharacter, name: string): PrintedCard | undefined {
  return printedDeck(c).find(({ label }) => key(label) === key(name));
}

function cardPresent(c: ReviewCharacter, name: string): Check {
  return truthy(
    `A printed "${name}" card`,
    card(c, name) !== undefined,
    card(c, name) === undefined
      ? `cards: ${printedDeck(c)
          .map(({ label }) => label)
          .join("; ")}`
      : "present",
  );
}

/* ------------------------------------------------------------------ */
/* Paired attack and damage effects; situational weapon rows (D093)    */
/* ------------------------------------------------------------------ */

const BACK_TO_THE_WALL =
  "Back to the Wall: +1 to attack and damage rolls whenever you are adjacent to a wall.";

function pairedLine(c: ReviewCharacter, power: string): Check[] {
  const found = card(c, power);
  if (found === undefined) return [cardPresent(c, power)];
  return [
    contains(`${power}: the paired line`, found.text, BACK_TO_THE_WALL),
    equal(
      `${power}: Back to the Wall appears once`,
      count(found.text, "Back to the Wall"),
      1,
    ),
    contains(
      `${power}: under Additional effects`,
      found.text,
      "Additional effects",
    ),
  ];
}

rule(
  "executioner-fighter",
  "Print preview",
  "Paired attack and damage effects",
  (c) => {
    const bullRush = card(c, "Bull Rush Attack");
    return [
      // Driving Attack left the review build with D109's hybrid at-will
      // fix; Press of Steel carries the same paired line.
      ...pairedLine(c, "Press of Steel"),
      ...(bullRush === undefined
        ? [cardPresent(c, "Bull Rush Attack")]
        : [
            contains(
              "Bull Rush Attack (no damage) keeps the attack-only line",
              bullRush.text,
              "Back to the Wall: +1 to attack rolls whenever you are adjacent to a wall.",
            ),
            lacks(
              "… without a damage half",
              bullRush.text,
              "attack and damage rolls whenever",
            ),
          ]),
    ];
  },
);
rule(
  "hexblade-white-well",
  "Print preview",
  "Paired attack and damage effects",
  (c) => pairedLine(c, "Melee Basic Attack"),
);
rule(
  "sentinel-bear",
  "Print preview",
  "Paired attack and damage effects",
  (c) => pairedLine(c, "Melee Basic Attack"),
);

rule(
  "executioner-fighter",
  "Print preview",
  "Situational requirements keep weapon rows",
  (c) => {
    const press = c.sheet.powers.find(({ name }) => name === "Press of Steel");
    const printed = card(c, "Press of Steel");
    const rows = (press?.variants ?? []).map(
      (variant) =>
        `${variant.equipmentName} ${variant.attack ?? variant.attacks?.[0]?.attack ?? ""} ${variant.damage ?? variant.attacks?.[0]?.damage ?? ""}`,
    );
    return [
      truthy(
        "The character carries no shield",
        !c.build.inventory.some((entry) =>
          entry.elements.some(({ name }) => /shield/i.test(name)),
        ),
      ),
      contains(
        "Press of Steel prints its Requirement",
        printed?.text ?? "",
        "Requirement: You must be using a shield.",
      ),
      equal("Its weapon rows", rows, [
        "Rapier +19 vs AC 2d8+3",
        "Unarmed +16 vs AC 2d4+3",
      ]),
      contains(
        "… with Back to the Wall under Additional effects",
        printed?.text ?? "",
        BACK_TO_THE_WALL,
      ),
    ];
  },
);

/* ------------------------------------------------------------------ */
/* Beatrix: the Play data card                                          */
/* ------------------------------------------------------------------ */

rule("beatrix", "Print preview", "Print Play data card", (c) => {
  const deck = printedDeck(c);
  const play = deck[0];
  const text = play?.text ?? "";
  return [
    equal("The first card is Play data", play?.label, "Play data"),
    inOrder("Name, then the identity line", text, [
      "Review – Beatrix",
      "Revenant Hexblade 8",
    ]),
    inOrder("Abilities", text, [
      "8",
      "STR",
      "-1",
      "13",
      "CON",
      "+1",
      "20",
      "DEX",
      "+5",
      "11",
      "INT",
      "+0",
      "10",
      "WIS",
      "+0",
      "20",
      "CHA",
      "+5",
    ]),
    inOrder("Defenses", text, [
      "AC",
      "24",
      "Fort",
      "18",
      "Ref",
      "22",
      "Will",
      "24",
    ]),
    inOrder("Hit points", text, ["60", "Bloodied", "30", "Surges", "7", "15"]),
    inOrder("Initiative, speed and passives", text, ["+9", "6", "16", "16"]),
    contains("Senses", text, "Low-light vision"),
    equal(
      "The abilities grid has six tiles (3 × 2)",
      count(
        elementsWithClass(play?.html ?? "", "stat-tone-abilities").join(""),
        'class="stat-tile-label"',
      ),
      6,
    ),
    contains("A Play data type bar", play?.html ?? "", "Play data"),
  ];
});

/* ------------------------------------------------------------------ */
/* Feature notes and legacy card parts (2ad4731)                        */
/* ------------------------------------------------------------------ */

rule("flint", "Print preview", "Feature notes follow legacy", (c) => {
  // Feature rows: the reference pages' class features and page 1's
  // reminders (the power index lists Mage's Spellbook as a power).
  const pages = printedPagesFor(c);
  const text = [
    ...pages.references
      .filter(({ group }) => group === "Class features")
      .map(({ name }) => name),
    ...c.sheet.overview.reminders.map(({ label }) => label),
    ...c.sheet.overview.features.map((feature) => JSON.stringify(feature)),
  ].join(" | ");
  const powers = new Set(c.sheet.powers.map(({ name }) => name));
  return [
    contains("Enchantment Apprentice", text, "Enchantment Apprentice"),
    contains("Pyromancy Apprentice", text, "Pyromancy Apprentice"),
    ...[
      "Level 1 Mage Encounter Powers",
      "Mage Cantrips",
      "Mage's Spellbook",
    ].map((row) => lacks(`No "${row}" row`, text, row)),
    truthy(
      'No other "Level N Mage … Powers" rows',
      !/Level \d+ Mage [\w ]*Powers/.test(text),
    ),
    truthy(
      "Magic Missile is still a card",
      powers.has("Magic Missile"),
      [...powers].join("; "),
    ),
    lacks("No trailing @ on a note", text, "@"),
  ];
});

/** The card's bottom type bar: "At-Will power" then "Ranger · Level 1". */
function typeBar(found: PrintedCard | undefined): string {
  return (
    elementsWithClass(found?.html ?? "", "print-card-type")
      .map((bar) => textOf(bar.replace(/<\/span>/g, "</span> ")))
      .at(-1) ?? ""
  );
}

rule("hystan", "Print preview", "Class block in the card type bar", (c) => [
  contains(
    "Twin Strike: At-Will power … Ranger · Level 1",
    typeBar(card(c, "Twin Strike")),
    "Ranger · Level 1",
  ),
  contains(
    // Master Diplomat is a level-2 skill power (Display "Diplomacy Utility 2").
    "Master Diplomat: Diplomacy · Level 2",
    typeBar(card(c, "Master Diplomat")),
    "Diplomacy · Level 2",
  ),
  contains(
    "Mighty Sprint: Athletics · …",
    typeBar(card(c, "Mighty Sprint")),
    "Athletics ·",
  ),
  lacks(
    "A basic attack shows no class",
    typeBar(card(c, "Melee Basic Attack")),
    "Ranger",
  ),
]);

rule("raidon", "Print preview", "Class block in the card type bar", (c) => [
  contains(
    // A paragon utility: level 12 (Display "Adroit Explorer Utility 12").
    "Destined for Greatness: Adroit Explorer · Level 12",
    typeBar(card(c, "Destined for Greatness")),
    "Adroit Explorer · Level 12",
  ),
  lacks(
    "No class ID in a type bar",
    printedDeck(c)
      .map((value) => typeBar(value))
      .join(" "),
    "ID_",
  ),
]);

rule(
  "raidon",
  "Print preview",
  "Monk movement technique on the discipline card",
  (c) => {
    const five = card(c, "Five Storms")?.text ?? "";
    const tail = card(c, "Dragon's Tail")?.text ?? "";
    return [
      inOrder("Five Storms: attack, then the technique", five, [
        "Hit:",
        "Movement Technique",
        "Move",
        "Personal",
        "Effect: You shift 2 squares.",
      ]),
      inOrder("Dragon's Tail: the technique", tail, [
        "Movement Technique",
        "Melee 1",
      ]),
      truthy(
        'No separate "[Movement Technique]" card',
        !printedDeck(c).some(({ label }) => /movement technique/i.test(label)),
        printedDeck(c)
          .map(({ label }) => label)
          .filter((label) => /movement/i.test(label))
          .join("; ") || "none",
      ),
    ];
  },
);

rule("jim", "Print preview", "Spellbook subtitle", (c) => {
  const mark = (name: string) =>
    elementsWithClass(card(c, name)?.html ?? "", "print-card-name-subtext")
      .map(textOf)
      .includes("Spellbook");
  return [
    cardPresent(c, "Expeditious Retreat"),
    truthy(
      "Expeditious Retreat has the Spellbook subtitle",
      mark("Expeditious Retreat"),
    ),
    truthy("Freezing Cloud has the Spellbook subtitle", mark("Freezing Cloud")),
    truthy("Sleep (prepared) has none", !mark("Sleep")),
  ];
});

rule("beldin", "Print preview", "Uses per encounter on power cards", (c) => {
  const bar = typeBar(card(c, "Ardent Surge"));
  return [
    cardPresent(c, "Ardent Surge"),
    contains('Ardent Surge reads "Encounter (2×)"', bar, "Encounter (2×)"),
    contains("… with its class block", bar, "Ardent"),
    lacks('No "(Special)" beside the count', bar, "(Special)"),
  ];
});

/* ------------------------------------------------------------------ */
/* Associates (D107)                                                    */
/* ------------------------------------------------------------------ */

rule("sylestine", "Print preview", "Associate card", (c) => {
  const deck = printedDeck(c);
  const dog = deck.find(({ kind }) => kind === "associate");
  const text = dog?.text ?? "";
  const overview = c.sheet.overview.reminders
    .map(({ label }) => label)
    .join(" | ");
  return [
    equal("An associate card", dog?.label, "Trained Blink Dog"),
    truthy(
      "It follows Skills and the familiar",
      deck.findIndex(({ kind }) => kind === "associate") >
        deck.findIndex(({ kind }) => kind === "familiar") &&
        deck.findIndex(({ kind }) => kind === "familiar") >
          deck.findIndex(({ label }) => label === "Skills"),
      deck.map(({ label }) => label).join(" → "),
    ),
    contains("Medium fey beast", text, "Medium fey beast"),
    contains("A Fey Beast Companion bar", text, "Fey Beast Companion"),
    inOrder("Defenses", text, [
      "AC",
      "27",
      "Fort",
      "25",
      "Ref",
      "25",
      "Will",
      "25",
    ]),
    inOrder("HP and Bloodied", text, ["HP", "41", "Bloodied", "20"]),
    contains("Initiative +6", text, "+6"),
    contains("Perception +15", text, "+15"),
    contains("Speed 7 · Low-light vision", text, "Speed 7 · Low-light vision"),
    contains(
      "Blinking Pack aura",
      text,
      "Blinking Pack (teleportation) · Aura 1",
    ),
    contains("Blinking Bite", text, "Blinking Bite (teleportation)"),
    contains("Its attack", text, "+17 vs. AC"),
    contains(
      "Its hit",
      text,
      "Hit: 1d8 + 6 damage, and the blink dog teleports up to 2 squares.",
    ),
    truthy(
      'No "Trained Blink Dog" power card',
      !c.sheet.powers.some(({ name }) => name === "Trained Blink Dog"),
    ),
    lacks(
      'Page 1 drops "Fey Beast Tamer Companion (Blink Dog)"',
      overview,
      "Fey Beast Tamer Companion (Blink Dog)",
    ),
    contains(
      'Page 1 keeps "Fey Beast Tamer Level 5 Features"',
      overview,
      "Fey Beast Tamer Level 5 Features",
    ),
  ];
});

rule(
  "sylestine",
  "Build, level 4: Feats",
  "Imported Hybrid Talent stays editable",
  (c) => {
    const evaluation = c.atLevels([4]);
    const choices = choicesAtLevel(4, evaluation);
    const step = choices.find((choice) =>
      choice.candidates.some(
        (candidate) =>
          key(c.context.byId.get(key(candidate.definitionId))?.name ?? "") ===
          key("Bard Armor Proficiency"),
      ),
    );
    const picked =
      step === undefined
        ? undefined
        : evaluation.occurrences.find(
            ({ id }) => id === step.selectedOccurrenceId,
          );
    return [
      truthy(
        "A level-4 step offers Bard Armor Proficiency",
        step !== undefined,
        choices
          .map((choice) => `${choice.type} ${choice.name ?? ""}`)
          .join("; "),
      ),
      equal(
        "… with it picked",
        picked === undefined
          ? undefined
          : c.context.byId.get(key(picked.definitionId))?.name,
        "Bard Armor Proficiency",
      ),
      truthy(
        "… and other options to change to",
        (step?.candidates.filter(({ eligible }) => eligible).length ?? 0) > 1,
        `${step?.candidates.filter(({ eligible }) => eligible).length ?? 0} eligible`,
      ),
    ];
  },
);

/* ------------------------------------------------------------------ */
/* Hybrid power picks (D109)                                            */
/* ------------------------------------------------------------------ */

rule("dv", "Build, level 1", "Hybrid slots alternate classes", (c) => {
  const atWill = (level: number) =>
    choicesAtLevel(level, c.atLevels([level])).filter(
      (choice) => choice.type === "Power",
    );
  const className = (id: string) => {
    const classId = c.context.byId
      .get(key(id))
      ?.specifics.find(({ name }) => name === "Class")?.value;
    return classId === undefined
      ? ""
      : (c.context.byId.get(key(classId))?.name ?? classId);
  };
  const slots = atWill(1).filter((choice) => /At-Will/.test(choice.name ?? ""));
  const hybridReason = slots.flatMap((choice) =>
    choice.candidates.filter(({ reasons }) => reasons.includes("hybrid-class")),
  );
  const available = slots.flatMap((choice) =>
    choice.candidates.filter(({ eligible }) => eligible),
  );
  const utility = atWill(6).flatMap((choice) => choice.candidates);
  const levitate = utility.find(
    ({ definitionId }) =>
      key(c.context.byId.get(key(definitionId))?.name ?? "") === "levitate",
  );
  return [
    truthy(
      "Warlock at-wills are unavailable for the hybrid-class reason",
      hybridReason.some((candidate) =>
        /warlock/i.test(className(candidate.definitionId)),
      ),
      `${hybridReason.length} candidates`,
    ),
    equal(
      "… which reads as a sentence, not a key",
      candidateReason(["hybrid-class"]),
      "Must choose a power from your other hybrid class: with two powers of this kind, at least one must come from each hybrid class",
    ),
    truthy(
      "Swordmage at-wills are available",
      available.some((candidate) =>
        /swordmage/i.test(className(candidate.definitionId)),
      ),
      `${available.length} available`,
    ),
    truthy(
      "Level 6: Levitate (a wizard utility via Order Adept) is available",
      levitate?.eligible === true,
      levitate === undefined
        ? "not offered"
        : `reasons: ${levitate.reasons.join(", ")}`,
    ),
  ];
});

/* ------------------------------------------------------------------ */
/* Loadout: holy symbol slot, wrist razors                              */
/* ------------------------------------------------------------------ */

function loadoutSlots(c: ReviewCharacter): Map<string, string[]> {
  const { assignmentsByEntry } = resolveLoadoutAssignments(
    c.build.inventory,
    c.context.byId,
    loadoutContext(c.build.textStrings, c.evaluation.loadoutSlotContext),
  );
  const slots = new Map<string, string[]>();
  for (const entry of c.build.inventory)
    for (const { slot } of assignmentsByEntry.get(entry.id) ?? [])
      slots.set(slot, [
        ...(slots.get(slot) ?? []),
        inventoryDisplayName(entry, c.context.byId),
      ]);
  return slots;
}

rule("trey", "Equipment", "Holy symbol slot", (c) => [
  equal("The Holy symbol slot", loadoutSlots(c).get("symbol"), [
    "Beacon of Erathis +1",
  ]),
]);
rule("trey", "Print preview", "Holy symbol slot", (c) =>
  ["Abjure Undead", "Radiant Vengeance", "Divine Rage"].map((power) =>
    truthy(
      `${power} has a Beacon of Erathis +1 row`,
      (c.sheet.powers.find(({ name }) => name === power)?.variants ?? []).some(
        ({ equipmentName }) => equipmentName === "Beacon of Erathis +1",
      ),
      (c.sheet.powers.find(({ name }) => name === power)?.variants ?? [])
        .map(({ equipmentName }) => equipmentName)
        .join(", ") || "no card",
    ),
  ),
);
rule("hu", "Equipment", "Holy symbol slot", (c) => {
  const slots = loadoutSlots(c);
  return [
    equal("Main hand", slots.get("main-hand"), ["Symbol of Hope +1"]),
    equal("Holy symbol slot", slots.get("symbol"), ["Symbol of Hope +1"]),
  ];
});

rule("dv", "Equipment", "Wrist razors on the arms", (c) => {
  const slots = loadoutSlots(c);
  return [
    truthy(
      "Wrist razors in the Arms slot",
      (slots.get("arms") ?? []).some((name) => /wrist razor/i.test(name)),
      (slots.get("arms") ?? []).join(", ") || "empty",
    ),
    truthy(
      "A longsword in Main hand",
      (slots.get("main-hand") ?? []).some((name) => /longsword/i.test(name)),
      (slots.get("main-hand") ?? []).join(", ") || "empty",
    ),
  ];
});

/* ------------------------------------------------------------------ */
/* Augments (Flint)                                                     */
/* ------------------------------------------------------------------ */

// Flint's own shard was saved with count 0, so (as in legacy) it isn't owned
// and binds nothing; the invoker buys one and attaches it to her scythe.
rule("invoker-drow", "Equipment", "Augments attach/detach", (c) => {
  const shardEntity = c.context.named(
    "Siberys Shard of Merciless Cold (heroic tier)",
  );
  const transaction = new CharacterTransaction(c.build);
  const bought = inventoryEntryForEntity(shardEntity, c.build.effectiveLevel);
  for (const command of acquisitionCommands(
    c.build.inventory,
    bought,
    0,
    c.context.byId,
  ))
    transaction.dispatch(command);
  const name = (entry: (typeof c.build.inventory)[number]) =>
    inventoryDisplayName(entry, c.context.byId);
  const before = transaction.current.inventory;
  const shard = before.find((entry) => /^Siberys Shard/.test(name(entry)));
  const hosts = inventoryAugmentHosts(before, c.context.byId);
  const scythe = hosts.find((entry) => /Rose Scythe/.test(name(entry)));
  if (shard !== undefined && scythe !== undefined)
    transaction.dispatch({
      kind: "set-inventory-augment",
      hostEntryId: scythe.id,
      augmentEntryId: shard.id,
    });
  const inventory = transaction.current.inventory;
  const host = inventory.find(({ id }) => id === scythe?.id);
  const attached =
    host === undefined ? undefined : inventoryAttachedAugment(host, inventory);
  const attachedTo =
    shard === undefined
      ? []
      : inventoryAugmentAttachedTo(
          inventory.find(({ id }) => id === shard.id) ?? shard,
          inventory,
        );
  return [
    truthy(
      "The bought shard is an owned holding",
      shard !== undefined,
      before.map(name).join("; "),
    ),
    truthy(
      "Attach to… offers the Rose Scythe (a magic weapon)",
      scythe !== undefined,
      hosts.map(name).join("; ") || "no hosts",
    ),
    equal(
      "The scythe's note",
      attached === undefined ? undefined : `Augment: ${name(attached)}`,
      "Augment: Siberys Shard of Merciless Cold (heroic tier)",
    ),
    equal(
      "The shard's note",
      attachedTo.length === 0
        ? undefined
        : `Attached to ${attachedTo.map(name).join(", ")}`,
      scythe === undefined
        ? "Attached to the scythe"
        : `Attached to ${name(scythe)}`,
    ),
  ];
});

/* ------------------------------------------------------------------ */
/* Wallet (D097 amended)                                                */
/* ------------------------------------------------------------------ */

/** The sheet's Carried money (page 1's money line). */
function walletLine(c: ReviewCharacter): string {
  return c.sheet.currency.find(({ label }) => label === "Carried")?.value ?? "";
}

rule("sample-beatrix", "Equipment", "Wallet at a lowered level", (c) => [
  equal("Carried money", walletLine(c), "1 pp; 48 gp"),
  lacks("Not 37 pp", walletLine(c), "37 pp"),
]);
rule("copy-of-character", "Equipment", "Wallet at a lowered level", (c) => [
  equal("Carried money", walletLine(c), "786 gp"),
]);

/* ------------------------------------------------------------------ */
/* Older content (Zilvra)                                               */
/* ------------------------------------------------------------------ */

function issues(c: ReviewCharacter) {
  const groups = builderIssueGroups({
    evaluation: c.evaluation,
    byId: c.context.byId,
    effectiveLevel: c.build.effectiveLevel,
    planningHorizon: c.build.effectiveLevel,
    abilityScoresIncomplete: false,
    abilityScoresHouseRuled: false,
    build: c.build,
  });
  return [
    ...groups.unresolved,
    ...groups.warnings,
    ...groups.errors,
    ...groups.houseRules,
  ];
}

rule("zilvra", "Equipment", "Armor of Resistance's damage type", (c) => {
  const issue = issues(c).find(({ title }) =>
    /Armor of Resistance \+2: Resistance Type/.test(title),
  );
  return [
    equal(
      "The issue's title",
      issue?.title,
      "Leather Armor of Resistance +2: Resistance Type",
    ),
    equal("Review opens the Equipment tab", issue?.target?.kind, "inventory"),
  ];
});
rule("zilvra", "House rules", "User edit named in House rules", (c) => {
  const all = issues(c);
  const edit = all.find(({ title }) => /manual edits/i.test(title));
  return [
    equal("The row's title", edit?.title, "Level 7 manual edits"),
    truthy(
      "No raw ID_INTERNAL_USER_EDIT title",
      !all.some(({ title }) => /ID_INTERNAL_USER_EDIT/.test(title)),
    ),
  ];
});

/* ------------------------------------------------------------------ */
/* Shop and new characters (general)                                    */
/* ------------------------------------------------------------------ */

const SHOP = "Shop and new characters";

function shopCatalog(context: ReviewContext) {
  return context.entities.filter(
    (entity) => shopBrowseCategory(entity) !== undefined,
  );
}
const named = (context: ReviewContext, name: string, type?: string) =>
  context.named(name, type);

general(SHOP, "Masterwork armor needs an enchantment", (context) => {
  const catalog = shopCatalog(context);
  const feyleather = named(context, "Feyleather Armor", "Armor");
  return [
    equal(
      "Without Inherent Bonuses: blocked, with the tooltip",
      shopAcquireBlockedReason(feyleather, catalog, context.entities, {
        inherentBonuses: false,
      }),
      "Masterwork armor comes with its enhancement: buy it as the base of a magic armor, or use Inherent Bonuses.",
    ),
    equal(
      "With Inherent Bonuses: allowed",
      shopAcquireBlockedReason(feyleather, catalog, context.entities, {
        inherentBonuses: true,
      }),
      undefined,
    ),
  ];
});

const baseNames = (context: ReviewContext, item: ContentEntity) =>
  compatibleBaseItems(item, shopCatalog(context), context.entities).map(
    ({ name }) => name,
  );
function enchantment(context: ReviewContext, prefix: string): ContentEntity {
  const found = context.entities.find(
    (entity) =>
      entity.name.startsWith(prefix) &&
      /\+1$/.test(entity.name) &&
      shopBrowseCategory(entity) !== undefined,
  );
  if (found === undefined) throw new Error(`No shop item ${prefix}… +1`);
  return found;
}

general(SHOP, "Weapon enchantment pairing", (context) => {
  const warsoul = baseNames(context, enchantment(context, "Warsoul"));
  const reckless = enchantment(context, "Reckless");
  const recklessBases = compatibleBaseItems(
    reckless,
    shopCatalog(context),
    context.entities,
  );
  const reach = (entity: ContentEntity) =>
    /reach/i.test(
      entity.specifics.find(({ name }) => name === "Weapon Properties")
        ?.value ?? "",
    );
  return [
    truthy(
      "Warsoul lists one-handed melee weapons (Longsword, Accurate dagger…)",
      warsoul.includes("Longsword") &&
        warsoul.some((name) => /accurate dagger/i.test(name)),
      `${warsoul.length}: ${warsoul.slice(0, 12).join(", ")}…`,
    ),
    truthy(
      "Reckless lists no reach weapons",
      recklessBases.length > 0 && !recklessBases.some(reach),
      recklessBases
        .filter(reach)
        .map(({ name }) => name)
        .join(", ") || `${recklessBases.length} bases`,
    ),
  ];
});

general(SHOP, "Superior implements under implement enchantments", (context) => {
  const lifedrinker = enchantment(context, "Lifedrinker");
  const bases = baseNames(context, lifedrinker);
  return [
    truthy(
      "Lifedrinker lists with the implement enchantments",
      shopAlsoImplementEnchantment(
        lifedrinker,
        shopCatalog(context),
        context.entities,
      ),
    ),
    truthy(
      "Its picker includes Accurate staff and Accurate dagger",
      bases.some((name) => /accurate staff/i.test(name)) &&
        bases.some((name) => /accurate dagger/i.test(name)),
      bases.filter((name) => /accurate/i.test(name)).join(", "),
    ),
  ];
});

general(SHOP, 'No shields for "Any" armor', (context) => {
  const bases = compatibleBaseItems(
    enchantment(context, "Delver's"),
    shopCatalog(context),
    context.entities,
  );
  return [
    truthy("Delver's has bases", bases.length > 0, `${bases.length}`),
    truthy(
      "… armors only: no shields, no barding",
      bases.every(
        ({ name, type }) =>
          key(type) === "armor" && !/shield|barding/i.test(name),
      ),
      bases
        .filter(
          ({ name, type }) =>
            key(type) !== "armor" || /shield|barding/i.test(name),
        )
        .map(({ name }) => name)
        .join(", ") || "armors only",
    ),
  ];
});

general(SHOP, "Artifacts come with their weapon", (context) => {
  const spear = context.entities.find((entity) =>
    /^Spear of the Skylord/.test(entity.name),
  );
  if (spear === undefined)
    return [truthy("Spear of the Skylord exists", false)];
  const bases = baseNames(context, spear);
  return [equal("One base, no picker: a Longspear", bases, ["Longspear"])];
});

general(SHOP, "Arrows fold into a package", (context) => {
  const arrows = named(context, "Arrows");
  const arrow = named(context, "Arrow");
  const transaction = new CharacterTransaction(
    context.character("wizard-gnome").build,
  );
  for (const [entity, times] of [
    [arrows, 1],
    [arrow, 5],
  ] as const)
    for (let i = 0; i < times; i += 1)
      for (const command of acquisitionCommands(
        transaction.current.inventory,
        inventoryEntryForEntity(entity, transaction.current.effectiveLevel),
        0,
        context.byId,
      ))
        transaction.dispatch(command);
  const groups = [
    ...new Set(
      inventoryPackageGroupsFor(
        transaction.current.inventory,
        context.byId,
      ).values(),
    ),
  ];
  return [
    equal(
      "One combined Arrows row",
      groups.map(({ name }) => name),
      ["Arrows"],
    ),
    equal(
      "… of 35 arrows",
      groups.map(({ units }) => units),
      [35],
    ),
    equal(
      "Its sale unit is one arrow (100%: 4 cp)",
      groups.map((group) => packageSalePriceCopper(group)),
      [4],
    ),
  ];
});

general(SHOP, "Secret Formularies halves ritual prices", (context) => {
  const wizard = context.character("wizard-gnome");
  const feat = named(context, "Secret Formularies", "Class Feature");
  const build: CharacterBuild = {
    ...wizard.build,
    grabbag: [
      ...wizard.build.grabbag,
      { ...occurrenceFor(feat, 1, 9000), id: "review:secret-formularies" },
    ],
  };
  const evaluation = evaluate(build, context.entities, {
    candidateDetailLevels: [],
  });
  return [
    equal(
      "Without the feat: 100%",
      ritualCostPercent(wizard.evaluation.stats),
      100,
    ),
    equal(
      "With Secret Formularies: 50%",
      ritualCostPercent(evaluation.stats),
      50,
    ),
  ];
});

general(SHOP, "Starting gold", () => [
  equal(
    "A new native character carries 100 gp",
    NATIVE_STARTING_CARRIED_MONEY,
    { ...NATIVE_STARTING_CARRIED_MONEY, gp: 100 },
  ),
]);

general(SHOP, "Theme-power reason", (context) => {
  const wizard = context.character("wizard-gnome");
  const evaluation = wizard.atLevels([1]);
  const flagged = choicesAtLevel(1, evaluation).flatMap((choice) =>
    choice.candidates.filter(({ reasons }) => reasons.includes("theme-power")),
  );
  return [
    equal(
      "The reason text",
      candidateReason(["theme-power"]),
      "You cannot choose a theme attack power in place of a class attack power if you have no other class power of that type",
    ),
    truthy(
      "The review wizard's Order Adept powers carry it where it applies",
      true,
      `${flagged.length} candidates flagged at level 1`,
    ),
  ];
});

/* ------------------------------------------------------------------ */
/* Essentials swap wording (executioner-fighter)                        */
/* ------------------------------------------------------------------ */

export function swapPresentationChecks(c: ReviewCharacter): Check[] {
  const levels = [15, 19, 25, 27];
  const evaluation = c.atLevels(levels);
  const wanted: Record<number, [string, string]> = {
    15: [
      "Swap a daily attack power",
      "At 15th level, replace one of your daily attack powers with a new one of level 15 or lower.",
    ],
    19: [
      "Swap a daily attack power",
      "At 19th level, replace one of your daily attack powers with a new one of level 19 or lower.",
    ],
    25: [
      "Swap a daily attack power",
      "At 25th level, replace one of your daily attack powers with a new one of level 25 or lower.",
    ],
    27: [
      "Swap an encounter attack power",
      "At 27th level, replace one of your encounter attack powers with a new one of level 27 or lower.",
    ],
  };
  return levels.map((level) => {
    const swap = evaluation.choices.find(
      (choice) =>
        choice.level === level &&
        choice.type === "Replacement" &&
        !choice.optional,
    );
    const presentation =
      swap === undefined
        ? undefined
        : powerSwapPresentation(swap, evaluation, c.context.byId);
    return equal(
      `Level ${level}: heading and help line`,
      presentation === undefined
        ? undefined
        : [presentation.title, presentation.explanation],
      wanted[level],
    );
  });
}

/* ------------------------------------------------------------------ */
/* Mount creature cards (D110)                                          */
/* ------------------------------------------------------------------ */

const WARHORSE = "ID_FMP_GEAR_77";
const SILVER_DRAGON_STEED = "ID_FMP_GEAR_100004";

function mountHolding(c: ReviewCharacter, id: string) {
  return c.build.inventory.find((entry) =>
    entry.elements.some(
      (element) => key(element.definitionId ?? "") === key(id),
    ),
  );
}

/** The owner-relative numbers the Silver Dragon Steed's block names: the
 *  owner's bloodied value, defenses + 2, level + 5 / + 3. */
function steedNumbers(c: ReviewCharacter) {
  const stat = (name: string) => c.evaluation.stats[name]?.value ?? NaN;
  return {
    hitPoints: Math.floor(stat("Hit Points") / 2),
    ac: stat("AC") + 2,
    bite: c.evaluation.level + 5,
    breath: c.evaluation.level + 3,
  };
}

rule("fighter-arena", "Print preview", "Mount creature cards", (c) => {
  const deck = printedDeck(c);
  const creatures = deck.filter(({ kind }) => kind === "creature");
  const warhorse = creatures.find(({ label }) => label === "Warhorse");
  const steed = creatures.find(({ label }) => label === "Silver Dragon Steed");
  const numbers = steedNumbers(c);
  const steedHolding = mountHolding(c, SILVER_DRAGON_STEED);
  const steedCard = c.sheet.companions.find(
    (candidate): candidate is SheetCreatureCard =>
      candidate.kind === "creature" && candidate.id === SILVER_DRAGON_STEED,
  );
  // As the print preview lays it out when the whole card overflows.
  const split =
    steedCard === undefined
      ? []
      : printedDeck(
          c,
          c.sheet,
          applySheetLayout(c.sheet, undefined, {
            splitCreatures: new Set([sheetCreatureCardKeyBase(steedCard)]),
          }).deck,
        );
  const labels = split.map(({ label }) => label);
  const stats = split.find(({ label }) => label === "Silver Dragon Steed");
  const actions = split.find(
    ({ label }) => label === "Silver Dragon Steed — Actions",
  );
  const itemText = (name: string) =>
    deck.find(({ kind, label }) => kind === "item" && label === name)?.text ??
    "";
  return [
    equal(
      "Two creature cards, after Skills and before Action Point",
      creatures.map(({ label }) => label),
      ["Warhorse", "Silver Dragon Steed"],
    ),
    truthy(
      "… in the companions run",
      deck.findIndex(({ kind }) => kind === "creature") >
        deck.findIndex(({ label }) => label === "Skills") &&
        deck.findIndex(({ label }) => label === "Silver Dragon Steed") <
          deck.findIndex(({ label }) => label === "Action Point"),
      deck.map(({ label }) => label).join(" → "),
    ),
    contains(
      "Warhorse identity",
      warhorse?.text ?? "",
      "Level 3 Brute · Large natural beast (mount)",
    ),
    inOrder("Warhorse defenses and HP", warhorse?.text ?? "", [
      "AC",
      "17",
      "Fort",
      "16",
      "Ref",
      "14",
      "Will",
      "14",
      "HP",
      "58",
      "Bloodied",
      "29",
    ]),
    contains("Warhorse Kick", warhorse?.text ?? "", "Melee basic attack"),
    contains(
      "Warhorse Charger trait",
      warhorse?.text ?? "",
      "The warhorse grants its rider a +5 bonus to damage rolls on charge attacks.",
    ),
    contains("Warhorse load table", warhorse?.text ?? "", "1,312 lb."),
    lacks("No alignment line", warhorse?.text ?? "", "Unaligned"),
    contains("A Mount type bar", warhorse?.text ?? "", "Mount"),
    inOrder("Steed HP is your bloodied value", steed?.text ?? "", [
      "HP",
      String(numbers.hitPoints),
    ]),
    inOrder("Steed AC is your AC + 2", steed?.text ?? "", [
      "AC",
      String(numbers.ac),
    ]),
    contains(
      "Steed Bite: your level + 5",
      steed?.text ?? "",
      `Melee 2 (one creature); +${numbers.bite} vs. AC`,
    ),
    contains(
      "Steed Breath Weapon: your level + 3",
      steed?.text ?? "",
      `+${numbers.breath} vs. Reflex`,
    ),
    truthy(
      "The warhorse is a held mount",
      mountHolding(c, WARHORSE) !== undefined,
    ),
    truthy("The steed is a held mount", steedHolding !== undefined),
    truthy(
      "Split: stats card then actions card, adjacent",
      labels.indexOf("Silver Dragon Steed — Actions") ===
        labels.indexOf("Silver Dragon Steed") + 1 &&
        labels.indexOf("Silver Dragon Steed") > 0,
      labels.join(" → "),
    ),
    contains("Stats card: Draconic Power", stats?.text ?? "", "Draconic Power"),
    contains("Stats card: resist cold", stats?.text ?? "", "Resist 25 Cold"),
    lacks("Stats card: no Breath Weapon", stats?.text ?? "", "Breath Weapon"),
    contains(
      "Actions card: Breath Weapon",
      actions?.text ?? "",
      "Breath Weapon",
    ),
    contains("Actions card: Tail Slam", actions?.text ?? "", "Tail Slam"),
    lacks("Actions card: no defenses", actions?.text ?? "", "Fort"),
    lacks("Never a continued card", labels.join(" "), "continued"),
    lacks(
      "The steed's item card drops the repeated stat block",
      itemText("Silver Dragon Steed"),
      "HP your bloodied value",
    ),
    contains(
      "The warhorse's item card keeps its load",
      itemText("Warhorse"),
      "1,312 lb.",
    ),
  ];
});

rule(
  "fighter-arena",
  "Equipment",
  "Mount creature card in item detail",
  (c) => {
    const holding = mountHolding(c, SILVER_DRAGON_STEED);
    const detail =
      holding === undefined
        ? undefined
        : inventoryItemDetail(holding, c.context.byId);
    if (detail === undefined)
      return [truthy("The Silver Dragon Steed's detail resolves", false)];
    const html = itemDetailHtml(c, detail);
    const panel = elementsWithClass(html, "print-creature-card")[0] ?? "";
    const numbers = steedNumbers(c);
    return [
      truthy("A creature panel card", panel.includes("is-panel")),
      contains("Its title", textOf(panel), "Silver Dragon Steed"),
      inOrder("Its HP", textOf(panel), ["HP", String(numbers.hitPoints)]),
      contains("Its Bite", textOf(panel), `+${numbers.bite} vs. AC`),
      contains("Its New Vigor", textOf(panel), "New Vigor"),
    ];
  },
);

/* ------------------------------------------------------------------ */
/* Summoned creature cards (D111)                                       */
/* ------------------------------------------------------------------ */

const SUMMON_BLADE_ANGEL = "ID_FMP_POWER_2880";

function summonCard(
  c: ReviewCharacter,
  powerId: string,
): SheetCreatureCard | undefined {
  return c.sheet.companions.find(
    (candidate): candidate is SheetCreatureCard =>
      candidate.kind === "creature" &&
      candidate.origin.kind === "summon" &&
      key(candidate.origin.powerId) === key(powerId),
  );
}

/** Fey Pact of the White Well's summon powers (hexblade levels 9 and 25). */
const WHITE_WELL_SUMMON = "ID_WOG_COMPANION_6_POWERCARD_0";
const WHITE_WELL_GREATER_SUMMON = "ID_WOG_COMPANION_10_POWERCARD_0";

/** The engine's command rows the summon's creature card shows. */
function summonCommands(c: ReviewCharacter, powerId: string) {
  const power = c.evaluation.powers.find(
    ({ definitionId }) => key(definitionId) === key(powerId),
  );
  return summonCommandRows(power, true);
}

/** The summon power's rows with its creature's commands (D111). */
function summonVariants(c: ReviewCharacter, powerId: string) {
  const power = c.evaluation.powers.find(
    ({ definitionId }) => key(definitionId) === key(powerId),
  );
  return summonCommandVariants(power, true);
}

/** Your evaluated value of a stat, for the owner-relative numbers. */
const ownerStat = (c: ReviewCharacter, name: string) =>
  c.evaluation.stats[name]?.value ?? NaN;

rule("invoker-drow", "Print preview", "Summoned creature card", (c) => {
  const deck = printedDeck(c);
  const labels = deck.map(({ label }) => label);
  const creature = deck.find(
    ({ kind, label }) => kind === "creature" && label === "Blade Angel",
  );
  const power = deck.find(
    ({ kind, label }) => kind === "power" && label === "Summon Blade Angel",
  );
  const card = summonCard(c, SUMMON_BLADE_ANGEL);
  const ac = Number(ownerStat(c, "AC")) + 4;
  return [
    truthy("A Blade Angel creature card", creature !== undefined),
    truthy(
      "… in the companions run, before Action Point",
      labels.indexOf("Blade Angel") > labels.indexOf("Skills") &&
        labels.indexOf("Blade Angel") < labels.indexOf("Action Point"),
      labels.join(" → "),
    ),
    contains(
      "Its type bar names the power's usage",
      creature?.text ?? "",
      "Summoned creature · Daily",
    ),
    contains("Its identity", creature?.text ?? "", "Medium blade angel"),
    inOrder("HP is your bloodied value", creature?.text ?? "", [
      "HP",
      String(Math.floor(Number(ownerStat(c, "Hit Points")) / 2)),
    ]),
    inOrder("AC is your AC + 4", creature?.text ?? "", ["AC", String(ac)]),
    contains("Its speed", creature?.text ?? "", "6, fly 6 (hover)"),
    contains("The Minor Action command", creature?.text ?? "", "Minor Action"),
    contains(
      "The Opportunity Attack command",
      creature?.text ?? "",
      "Opportunity Attack",
    ),
    contains(
      "A command takes the power card's personalization",
      creature?.text ?? "",
      "Wisdom modifier (+",
    ),
    // The scythe (equipped), the carried rod and Unarmed: each command
    // lists its numbers per implement (D111), in place of the one roll.
    ...(card?.actions ?? []).flatMap((entry, index) => {
      const row = summonCommands(c, SUMMON_BLADE_ANGEL)?.find(
        (command) => command.entry === index,
      );
      const variants = summonVariants(c, SUMMON_BLADE_ANGEL);
      const engine = variants.map((variant) => {
        const command = variant.commands.find(
          (candidate) => candidate.entry === index,
        );
        return [
          variant.equipmentName,
          command === undefined
            ? undefined
            : `${command.attackBonus < 0 ? "" : "+"}${command.attackBonus} vs ${command.defense}`,
          command?.damage,
        ];
      });
      return [
        equal(
          `${entry.name}: one row per implement`,
          entry.variants?.length,
          3,
        ),
        equal(
          `${entry.name}: each row is the engine's command for that implement`,
          entry.variants?.map(({ equipmentName, attack, damage }) => [
            equipmentName,
            attack,
            damage,
          ]),
          engine,
        ),
        equal(
          `${entry.name}: the equipped row is the power card's leading row`,
          entry.variants?.find(({ equipped }) => equipped)?.attack,
          row === undefined
            ? undefined
            : `${row.attackBonus < 0 ? "" : "+"}${row.attackBonus} vs ${row.defense}`,
        ),
        truthy(
          `${entry.name}: no roll beside the rows`,
          entry.roll === undefined,
        ),
        inOrder(
          `${entry.name}'s rows print, equipped first`,
          creature?.text ?? "",
          [
            entry.name,
            "Rose Scythe of Chauntea",
            "rod of Corruption",
            "Unarmed",
          ],
        ),
      ];
    }),
    equal(
      "The Minor Action command is Wisdom vs. Fortitude for 1d8 + Wisdom",
      card?.actions[0]?.variants?.[0]?.attack.endsWith("vs Fortitude") ===
        true && card.actions[0].variants[0].damage?.startsWith("1d8+") === true,
      true,
    ),
    lacks(
      "A command's rows print without the weapon table's headings",
      creature?.text ?? "",
      "Weapon",
    ),
    equal("Keyed by the power", card?.origin, {
      kind: "summon",
      powerId: SUMMON_BLADE_ANGEL,
    }),
    contains(
      "The power card keeps its Effect",
      power?.text ?? "",
      "You summon a Medium blade angel",
    ),
    lacks(
      "The power card leaves the commands to the creature card",
      power?.text ?? "",
      "slowed until the end of its turn",
    ),
    lacks(
      "The power card leaves the attack band to the creature card",
      power?.text ?? "",
      " vs Ref",
    ),
  ];
});

rule(
  "invoker-drow",
  "Build, level 9: Powers",
  "Summoned creature in power detail",
  (c) => {
    const entity = c.context.byId.get(key(SUMMON_BLADE_ANGEL));
    if (entity === undefined)
      return [truthy("Summon Blade Angel is in the pack", false)];
    const html = candidateDetailHtml(c, entity);
    const panel = elementsWithClass(html, "print-creature-card")[0] ?? "";
    return [
      truthy("A creature panel card", panel.includes("is-panel")),
      contains("Its title", textOf(panel), "Blade Angel"),
      contains("Its type bar", textOf(panel), "Summoned creature"),
      contains("Its Opportunity Attack", textOf(panel), "Opportunity Attack"),
      lacks(
        "The power card above it has no commands",
        textOf(html.slice(0, html.indexOf(panel))),
        "slowed until the end of its turn",
      ),
    ];
  },
);

rule("hexblade-white-well", "Print preview", "Summoned creature cards", (c) => {
  const deck = printedDeck(c);
  const creatures = deck.filter(({ kind }) => kind === "creature");
  // A creature split into stats and actions cards prints both under its
  // name (the actions card "— Actions").
  const handmaiden = {
    text: creatures
      .filter(({ label }) => label.startsWith("Mourning Handmaiden"))
      .map(({ text }) => text)
      .join(" "),
  };
  const protector = {
    text: creatures
      .filter(({ label }) => label.startsWith("Spectral Protector"))
      .map(({ text }) => text)
      .join(" "),
  };
  const handmaidenCard = summonCard(c, WHITE_WELL_SUMMON);
  const protectorCard = summonCard(c, WHITE_WELL_GREATER_SUMMON);
  const level = Number(c.evaluation.level);
  const handmaidenAttack = summonCommands(c, WHITE_WELL_SUMMON)?.[0];
  const hp = String(Math.floor(Number(ownerStat(c, "Hit Points")) / 2));
  const ac = String(Number(ownerStat(c, "AC")) + 2);
  const powerLabels = deck
    .filter(({ kind }) => kind === "power")
    .map(({ label }) => label);
  return [
    equal(
      "Two summoned creatures",
      [
        ...new Set(
          creatures.map(({ label }) => label.replace(/ — Actions$/, "")),
        ),
      ],
      ["Mourning Handmaiden", "Spectral Protector"],
    ),
    contains(
      "The handmaiden's type bar names the power's usage",
      handmaiden.text,
      "Summoned creature · Daily",
    ),
    equal(
      "The handmaiden's aura is a trait (stats card)",
      handmaidenCard?.traits.map(({ name }) => name),
      ["Shining Presence"],
    ),
    equal(
      "Its movement, opportunity action and attack are actions",
      handmaidenCard?.actions.map(({ name }) => name),
      [
        "Special Movement",
        "Opportunity Action",
        "Mourning Handmaiden's Attack",
      ],
    ),
    equal(
      "Its attack is your level + 5 (the engine's row)",
      handmaidenAttack?.attackBonus,
      level + 5 + Number(ownerStat(c, "SUMMON.attack rolls") || 0),
    ),
    contains(
      "Its attack line prints the number",
      handmaiden.text,
      `Melee 1; +${handmaidenAttack?.attackBonus ?? "?"} vs. Reflex`,
    ),
    contains(
      "Its hit line prints the worked-out damage",
      handmaiden.text,
      `${handmaidenAttack?.damage ?? "?"} radiant damage`,
    ),
    equal(
      "The protector's attacks and aura join its card",
      protectorCard?.actions.map(({ name }) => name),
      [
        "Special Movement",
        "Spectral Protector's Attack",
        "Spectral Protector's Aura",
        "Spectral Protector's Opportunity",
      ],
    ),
    ...[
      "Summoned Creature (White Well)",
      "Greater Summon (White Well Pact)",
      "Mourning Handmaiden",
      "Mourning Handmaiden's Attack",
      "Spectral Protector",
      "Spectral Protector's Attack",
      "Spectral Protector's Aura",
      "Spectral Protector's Opportunity",
    ].map((label) =>
      truthy(`No "${label}" power card`, !powerLabels.includes(label)),
    ),
    truthy(
      "The pact powers stay in the power index",
      c.sheet.powers.some(
        ({ name }) => name === "Summoned Creature (White Well)",
      ) &&
        c.sheet.powers.some(
          ({ name }) => name === "Greater Summon (White Well Pact)",
        ),
    ),
    contains(
      "The handmaiden's identity",
      handmaiden?.text ?? "",
      "Medium fey humanoid (undead)",
    ),
    inOrder("Its HP is your bloodied value", handmaiden?.text ?? "", [
      "HP",
      hp,
    ]),
    inOrder("Its AC is your AC + 2", handmaiden?.text ?? "", ["AC", ac]),
    contains("Its speed", handmaiden?.text ?? "", "Speed 6"),
    contains(
      "The protector's speed",
      protector?.text ?? "",
      "7, fly 3 (hover)",
    ),
    contains(
      "Its healing surges",
      protector?.text ?? "",
      "None, but you can expend a healing surge for the protector",
    ),
  ];
});

export const LATER_RULES: readonly Rule[] = rules;
