/**
 * The visual-review plan (scripts/build-visual-review.ts): the review
 * characters, and for each one the pages to open and the checklist items
 * (docs/visual-review-checklist.md) to verify there. Items are named by the
 * start of their bold title, case-insensitive; a name that matches no item
 * is reported, and an item no page names is listed as unmapped.
 */
import type { CharacterSpec } from "./build-visual-review";

/** A page of one character: `path` is "sheet", "preview", or the builder
 *  query after `/edit?` (for example "tab=build&level=5&section=powers"). */
export interface ReviewLink {
  readonly label: string;
  readonly path: string;
  /** [checklist item title prefix, what to look at on this page]. */
  readonly items: readonly (readonly [string, string])[];
}

export interface ReviewCharacter {
  readonly spec: CharacterSpec;
  /** One line on why this character is in the set. */
  readonly purpose: string;
  readonly links: readonly ReviewLink[];
  /** Records that copy this one with a different content binding. */
  readonly variants?: readonly ReviewVariant[];
}

/** A copy of a character bound to other content, for library states. */
export interface ReviewVariant {
  readonly slug: string;
  readonly title: string;
  /** "missing": a pack no browser has; "update": the plain review pack,
   *  which differs from the active profile, so an update is waiting. */
  readonly binding: "missing" | "update";
  readonly purpose: string;
}

export interface GeneralSection {
  readonly title: string;
  /** Where to go (rendered as a paragraph; `#/…` hashes become links). */
  readonly steps: string;
  readonly items: readonly (readonly [string, string])[];
}

export interface ReviewPlan {
  readonly characters: readonly CharacterSpec[];
  readonly reviews: readonly ReviewCharacter[];
  readonly general: readonly GeneralSection[];
}

const HYBRID = "ID_INTERNAL_CLASS_HYBRID";
const AS_HYBRID_POWER = "ID_CDJ_POWER_HYBRID_ASSASSINS_STRIKE";
/** Assassin's Strike (Hybrid) upgrade records (content/corrections
 *  97-hybrid-assassins-strike.part); one is open at each level. */
const upgrade = (prefix: "CDJ" | "4ECB", level: number, k: number) =>
  `ID_${prefix}_CLASS_FEATURE_LV${level}_ASSASSINS_STRIKE_${k}`;
const UPGRADES_TO_23 = [
  upgrade("CDJ", 7, 1),
  upgrade("CDJ", 13, 1),
  upgrade("4ECB", 13, 2),
  upgrade("CDJ", 17, 1),
  upgrade("CDJ", 17, 2),
  upgrade("4ECB", 17, 3),
  upgrade("CDJ", 23, 1),
  upgrade("CDJ", 23, 2),
  upgrade("4ECB", 23, 3),
  upgrade("4ECB", 23, 4),
];
const UPGRADES_27 = [
  upgrade("CDJ", 27, 1),
  upgrade("CDJ", 27, 2),
  upgrade("CDJ", 27, 3),
  upgrade("4ECB", 27, 4),
  upgrade("4ECB", 27, 5),
];

/** Fey Pact of the White Well (hexblade). */
const WHITE_WELL = "ID_WOG_HEXBLADE_TRAIT_PACKAGE_4";

const preview = "preview";
const sheet = "sheet";
const build = (level: number, section?: string) =>
  `tab=build&level=${level}${section === undefined ? "" : `&section=${section}`}`;

const reviews: ReviewCharacter[] = [
  {
    spec: {
      kind: "import",
      slug: "beatrix",
      title: "Review – Beatrix (Revenant Hexblade L8)",
      source: "scratch/bisect2/Beatrix.dnd4e",
      required: ["ID_WOG_HEXBLADE_CLASS_FEATURE_1D"],
    },
    purpose:
      "Imported revenant hexblade: Fey Pact of the White Well, Luskan background, an accurate rod, Essentials power swaps.",
    links: [
      {
        label: "Build, level 1: Class",
        path: build(1, "class"),
        items: [
          [
            "Trait package benefits",
            'Select the Pact choice row (Fey Pact of the White Well): pact card, each benefit\'s card, each followed by its "Granted power" cards (~38 cards).',
          ],
          [
            "White Well pact summary",
            'The pact table row reads "You have the Fey pact of the White Well."',
          ],
          [
            "Essentials power swaps",
            "Hexblade swaps: open each required replacement in the Build replacement editor; only powers of the matching kind are offered to lose.",
          ],
          [
            "Choice card rhythm",
            "The White Well pact's card and its benefit cards: even gaps, the Prerequisite line, flush-left paragraphs, the flavor divider.",
          ],
          [
            "Benefits by level",
            "The White Well pact's level sections (the pact choice exists only at Build level 1, so only Level 1 starts open; open the later sections by clicking them); also Alchemist, Feytouched and Archmage.",
          ],
          [
            "Class detail card",
            'Select the Class row (Hexblade): the card\'s heading line reads "Arcane Striker"; a "Key abilities" row with the other class traits.',
          ],
        ],
      },
      {
        label: "Build, level 1: Race",
        path: build(1, "race"),
        items: [
          [
            'Revenant "Past life"',
            "The Past life choice (Eladrin) sits under Race, not Other.",
          ],
        ],
      },
      {
        label: "Retraining",
        path: "tab=retraining&level=8",
        items: [
          [
            "Essentials power swaps",
            "The same replacement choices can be filled from the Retraining editor.",
          ],
        ],
      },
      {
        label: "Equipment",
        path: "tab=equipment",
        items: [
          [
            "Superior implements",
            "Select the Accurate rod + Rod of the Feywild +2: the detail pane uses the item card.",
          ],
          [
            "A free item appears",
            "The Fey Pact of the White Well Weapon (pact weapon gift) is in the inventory.",
          ],
          [
            "Pact weapon named by its artifact",
            'The pact weapon reads "Sword of the White Well" in Inventory, the loadout and on the cards.',
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Sub-choices on feature rows",
            'Reference headings "Past life: Eladrin" and two "Guardian Feature" rows; check wrapping next to "Level N".',
          ],
          [
            "Print Play data card",
            "The first card: identity, abilities, defenses, hit points and senses.",
          ],
          [
            "Background benefit card",
            'The Luskan card has no suffix; a "Background benefit: …" card follows it.',
          ],
          [
            "Granted aliases on feature rows",
            '"Fey Pact of the White Well Boon: counts as Fey Pact".',
          ],
          [
            "Proficiencies pane",
            "Character Reference pages, after Worn/Held Items and Carried Items: Armor / Shields / Weapons / Implements lines, lower case.",
          ],
          [
            "Printed Deity entry",
            "Sehanine after Background (church icon): Domains line, then the description.",
          ],
        ],
      },
      {
        label: "Sheet (on screen)",
        path: sheet,
        items: [
          [
            "Granted aliases on feature rows",
            "The on-screen feature list shows the same alias text.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "hexblade-white-well",
      title: "Review – White Well Hexblade L25 (Legendary Hexblade)",
      level: 25,
      classes: ["ID_FMP_CLASS_793"],
      preferred: [
        "ID_FMP_RACE_7",
        "ID_FMP_CLASS_793",
        WHITE_WELL,
        "ID_FMP_PARAGON_PATH_796",
      ],
      expectLegal: true,
      required: [
        WHITE_WELL,
        "ID_FMP_PARAGON_PATH_796",
        "ID_WOG_COMPANION_6_POWERCARD_2",
        "ID_WOG_COMPANION_10_POWERCARD_2",
        "ID_WOG_COMPANION_10_POWERCARD_4",
      ],
    },
    purpose:
      "Human hexblade of the White Well at level 25 with Legendary Hexblade: the Mourning Handmaiden and Spectral Protector summoned allies.",
    links: [
      {
        label: "Build, level 1: Class",
        path: build(1, "class"),
        items: [
          [
            "Benefits by level",
            "The White Well pact's level sections with Legendary Hexblade chosen: only its path section (the White Well's own features at levels 11, 12, 16 and 20). The pact choice is only on Build level 1, so only Level 1 starts open; click the others open.",
          ],
        ],
      },
      {
        label: "Build, level 11",
        path: build(11),
        items: [
          [
            "Other detail stacks",
            "Paragon path: the Legendary Hexblade stack.",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Summoned allies",
            'Mourning Handmaiden\'s Attack "Level+5 vs Ref"; Spectral Protector\'s Attack and Opportunity "Level+5 vs Will", each with its number; no "UNKNOWN" on any card.',
          ],
          [
            "Paired attack and damage effects",
            "Melee Basic Attack: one Back to the Wall line for attack and damage.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "import",
      slug: "hystan",
      title: "Review – Hystan (Half-Elf Ranger L8)",
      source: "sample-chars/Hystan.dnd4e",
      required: [],
    },
    purpose: "Imported half-elf ranger with Dual Heritage and two backgrounds.",
    links: [
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Granted aliases on feature rows",
            '"Dual Heritage: counts as Elf, Human".',
          ],
          [
            "Background benefit card",
            "Two background cards, then the background benefit card.",
          ],
          [
            "Class block in the card type bar",
            'Twin Strike "Ranger · Level 1", Master Diplomat "Diplomacy · Level 6", Mighty Sprint "Athletics · …" at the right of the type bar.',
          ],
        ],
      },
      {
        label: "Sheet (on screen)",
        path: sheet,
        items: [
          [
            "Granted aliases on feature rows",
            "Dual Heritage alias in the on-screen feature list.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "import",
      slug: "hu",
      title: "Review – Hu Sheng-Ming (Human Avenger L8)",
      source: "sample-chars/Hu Sheng-Ming Level 8.dnd4e",
      expectLegal: false,
      required: [],
    },
    purpose:
      "Imported avenger with six backgrounds and Battle Awareness. Not legal as imported (a feat prerequisite and a house-ruled feat from the legacy file).",
    links: [
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Background benefit card",
            'Six background cards, then "Background benefit: …" with its Benefit text.',
          ],
          [
            "Granted aliases on feature rows",
            'The heading is "Battle Awareness"; the reference body retains "Choices: Athletics; counts as Fighter".',
          ],
          ["Edit toolbar", "View | Edit, Sections, Reset, Print."],
          ["Sections menu: show and hide", "The Sections panel."],
          ["Sections menu: reorder", "Drag rows by their grip."],
          ["Sections menu: copies", "The − [n] + steppers."],
          ["Card right-click feel", "Right-click cards in Edit mode."],
        ],
      },
      {
        label: "Sheet (on screen)",
        path: sheet,
        items: [
          [
            "Granted aliases on feature rows",
            'The feature label is "Battle Awareness"; its body retains "Choices: Athletics; counts as Fighter".',
          ],
          [
            "Alias wording",
            'Decide whether "Choices: Athletics; counts as Fighter" reads well.',
          ],
        ],
      },
      {
        label: "Equipment",
        path: "tab=equipment",
        items: [
          [
            "Holy symbol slot",
            "Loadout: Symbol of Hope +1 in both Main hand and the Holy symbol slot.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "import",
      slug: "piri",
      title: "Review – Piri (Shifter Druid L7)",
      source: "sample-chars/Piri.dnd4e",
      required: [],
    },
    purpose:
      "Imported druid with Ritual Caster, a Ritual Book and a druid-granted ritual: the Rituals tab.",
    links: [
      {
        label: "Rituals tab",
        path: "tab=rituals",
        items: [
          [
            "Rows",
            'The druid-granted ritual\'s source line reads "Granted by Druid".',
          ],
          [
            "Free-ritual counter",
            "The bold line under the druid's Free rituals text.",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Printed reference pages",
            'Granted ritual entries show "Granted by: Druid".',
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "ranger-beast",
      title: "Review – Beast Mastery Ranger L11",
      level: 11,
      classes: ["ID_FMP_CLASS_5"],
      preferred: [
        "ID_FMP_RACE_7",
        "ID_FMP_CLASS_5",
        "ID_FMP_CLASS_FEATURE_1030",
        "ID_FMP_COMPANION_8",
        "ID_FMP_POWER_10600",
      ],
      text: { _COMPANION_NAME: "Ash" },
      items: [{ id: "Longbow", equip: true }],
      expectLegal: true,
      required: [
        "ID_FMP_CLASS_FEATURE_1030",
        "ID_FMP_COMPANION_8",
        "ID_FMP_POWER_10600",
      ],
    },
    purpose:
      'Human Beast Mastery ranger with a wolf named "Ash" and Distracting Team (a mixed beast/weapon power).',
    links: [
      {
        label: "Build, level 1: Companion",
        path: build(1, "companion"),
        items: [
          [
            "Builder Companion pane",
            "The chosen wolf's card; select another beast for a candidate preview.",
          ],
          [
            "Name and Appearance",
            'Name ("Ash") and Appearance inputs; the card title reads "Ash — wolf".',
          ],
        ],
      },
      {
        label: "Retraining",
        path: "tab=retraining&level=11",
        items: [
          [
            "Retraining",
            'A "Retrain a companion" option; the Kind column reads "Companion".',
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Beast Mastery ranger",
            'Beast attack powers show numbers; no "Companion: X" power card.',
          ],
          [
            "Printed beast card",
            "The beast card sits between Skills and the familiar slot.",
          ],
          [
            "Beast power cards",
            '"Beast +N vs AC" header and a "Beast damage" line; Distracting Team keeps its table with beast cells.',
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "sentinel-bear",
      title: "Review – Summer Sentinel Druid L25 (Bear)",
      level: 25,
      classes: ["ID_FMP_CLASS_779"],
      preferred: [
        "ID_FMP_RACE_4",
        "ID_FMP_CLASS_779",
        "ID_WOG_SENTINEL_TRAIT_PACKAGE_2",
        "ID_WOG_COMPANION_2",
        "ID_FMP_PARAGON_PATH_782",
        "ID_FMP_EPIC_DESTINY_54",
      ],
      text: { _COMPANION_NAME: "Bruin" },
      expectLegal: true,
      required: [
        "ID_WOG_SENTINEL_TRAIT_PACKAGE_2",
        "ID_WOG_COMPANION_2",
        "ID_FMP_PARAGON_PATH_782",
        "ID_FMP_EPIC_DESTINY_54",
      ],
    },
    purpose:
      'Elf sentinel of summer at level 25 with a bear companion ("Bruin"): the beast card at a high level.',
    links: [
      {
        label: "Build, level 1: Companion",
        path: build(1, "companion"),
        items: [
          [
            "Builder Companion pane",
            "The bear's card (candidate preview e.g. bear: 16 Str, 15 Con).",
          ],
        ],
      },
      {
        label: "Build, level 21",
        path: build(21),
        items: [
          [
            "Other detail stacks",
            "Epic destiny list: select Archmage (unavailable is fine) and check its stack.",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Printed beast card",
            'Does the full stat block fit one card at level 25 with several traits? Surges tile reads "Yours".',
          ],
          [
            "Beast power cards",
            '"Beast +N vs AC" header and "Beast damage" lines on the companion powers.',
          ],
          [
            "Paired attack and damage effects",
            "Melee Basic Attack: one Back to the Wall line for attack and damage.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "wizard-gnome",
      title: "Review – Gnome Wizard L5 (Order Adept)",
      level: 5,
      classes: ["ID_FMP_CLASS_9"],
      preferred: ["ID_FMP_RACE_20", "ID_FMP_CLASS_9", "ID_FMP_THEME_851"],
      freeRituals: [{ name: "Comprehend Language", allowance: "Spellbook" }],
      expectLegal: true,
      required: ["ID_FMP_RACE_20", "ID_FMP_THEME_851", "ID_FMP_GEAR_33"],
    },
    purpose:
      "Gnome wizard with the Order Adept theme at level 5: spellbook, free Spellbook gift, free-ritual allowances (one already used).",
    links: [
      {
        label: "Build, level 1: Race",
        path: build(1, "race"),
        items: [
          ["Gnome characters", "The gnome loads and evaluates."],
          [
            "Other detail stacks",
            "Race list: select Genasi. Its race card lists Elemental Manifestation as one paragraph inside the card (expected); the ~26-card stack appears only where the manifestation itself is the option.",
          ],
        ],
      },
      {
        label: "Build, level 1: Class",
        path: build(1, "class"),
        items: [
          [
            "Other detail stacks",
            "Class list: Warlord and Cleric. Their class cards list Commanding Presence and Channel Divinity as one paragraph each inside the card (expected); the stacks appear only where the feature itself is the option.",
          ],
        ],
      },
      {
        label: "Build, level 1: Theme",
        path: build(1, "theme"),
        items: [["Other detail stacks", "Theme list: select Alchemist."]],
      },
      {
        label: "Build, level 1: Spellbook",
        path: build(1, "spellbook"),
        items: [
          [
            "Wizard spellbook",
            "Change a spellbook pick, leave and come back: it sticks.",
          ],
        ],
      },
      {
        label: "Build, level 4: Feats",
        path: build(4, "feats"),
        items: [
          [
            '"Already owned" candidates',
            "The feat taken at level 1 or 2 shows as unavailable with an already-owned reason.",
          ],
        ],
      },
      {
        label: "Build, level 5: Powers",
        path: build(5, "powers"),
        items: [
          [
            "Order Adept with a spellbook",
            "The class power lists don't offer Order Adept powers.",
          ],
        ],
      },
      {
        label: "Rituals tab",
        path: "tab=rituals",
        items: [
          [
            "Free-ritual counter",
            'e.g. "2 free 1st-level rituals and 2 free rituals of level 5 or lower left" (one of the 1st-level ones is used).',
          ],
          [
            "Known-list source line",
            'Comprehend Language reads "Learned free at level 1 (Spellbook)".',
          ],
          [
            '"Learn X free" dialog',
            'Learn free on a 1st-level ritual learns it straight away (one allowance, no dialog). The dialog itself needs a psion: New → Psion class at level 1 → Rituals → Learn rituals → Tenser\'s Floating Disk → Learn free. Each option reads "Psion · …" with what that allowance still covers.',
          ],
        ],
      },
      {
        label: "Equipment",
        path: "tab=equipment",
        items: [
          [
            "A free item appears",
            "The Spellbook gift is in the inventory (and on the sheet as an item card).",
          ],
        ],
      },
      {
        label: "Shop: implements",
        path: "tab=shop&category=implements",
        items: [
          [
            "Equipment item details",
            "Select a wand: the powers it grants conditionally are listed.",
          ],
        ],
      },
      {
        label: "Shop: special items",
        path: "tab=shop&category=special-items",
        items: [
          [
            "Equipment item details",
            "Select an artifact (e.g. The Eye of Vecna): its conditional powers are listed.",
          ],
          [
            "Other detail stacks",
            "Eye of Vecna's detail stack (search for it if it isn't in this category).",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "warlock-fey",
      title: "Review – Fey Warlock L11 (Feytouched, Arcane Wisp)",
      level: 11,
      classes: ["ID_FMP_CLASS_7"],
      preferred: [
        "ID_FMP_RACE_4",
        "ID_FMP_CLASS_7",
        "ID_FMP_CLASS_FEATURE_772",
        "ID_FMP_PARAGON_PATH_14",
        { id: "ID_FMP_FEAT_738", from: 11 },
        "ID_FMP_FAMILIAR_37",
      ],
      expectLegal: true,
      required: [
        "ID_FMP_CLASS_FEATURE_772",
        "ID_FMP_PARAGON_PATH_14",
        "ID_FMP_FAMILIAR_37",
      ],
    },
    purpose:
      "Elf fey-pact warlock with the Feytouched paragon path and an Arcane Wisp familiar (Arcane Familiar taken at 11).",
    links: [
      {
        label: "Build, level 1: Class",
        path: build(1, "class"),
        items: [
          [
            "Wizard spellbook",
            "Default/item choices: change Eldritch Blast's ability (Charisma/Constitution) and back.",
          ],
        ],
      },
      {
        label: "Build, level 11",
        path: build(11),
        items: [
          [
            "Other detail stacks",
            "Paragon path: the Feytouched stack. Its powers aren't nested under sub-options.",
          ],
          [
            "Familiar choice",
            "Arcane Familiar's familiar choice: the Arcane Wisp familiar card (panel layout, dark on screen).",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Familiar card",
            'Arcane Wisp after the Skills card: speed "fly 8 (hover)"; no "Familiar: X" power card. Check fit, the defense/HP/speed tiles, the rules line and Hide flavor text.',
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "executioner-fighter",
      title: "Review – Hybrid Executioner/Fighter L27",
      level: 27,
      classes: ["ID_CDJ_HYBRID_CLASS_40001", "ID_FMP_HYBRID_CLASS_353"],
      preferred: [
        "ID_FMP_RACE_7",
        HYBRID,
        "ID_CDJ_HYBRID_CLASS_40001",
        "ID_FMP_HYBRID_CLASS_353",
        AS_HYBRID_POWER,
        ...UPGRADES_TO_23,
        "ID_FMP_CLASS_FEATURE_3536",
        "ID_FMP_CLASS_FEATURE_HYBRID_LEAGUE_OF_WHISPERS",
        // Cleave: a hybrid's two at-wills come one from each class (D109).
        "ID_FMP_POWER_992",
        // Press of Steel: a shield-requirement daily (D093).
        "ID_FMP_POWER_10480",
        { id: "ID_FMP_POWER_4360", from: 27 },
      ],
      // League of Whispers offers Bola Takedown or Hidden Sting/Wasp Strike;
      // the fighter half fills the class at-will slot (D109).
      excluded: [...UPGRADES_27, "ID_FMP_POWER_13797"],
      keep: [AS_HYBRID_POWER, "ID_FMP_POWER_10480"],
      items: [{ id: "ID_FMP_WEAPON_76", equip: true }, { id: "Rapier" }],
      expectLegal: true,
      required: [
        AS_HYBRID_POWER,
        "ID_CDJ_CLASS_FEATURE_LV7_ASSASSINS_STRIKE_1",
        "ID_FMP_POWER_13796",
        "ID_FMP_POWER_4360",
      ],
    },
    purpose:
      "Human hybrid executioner/fighter with Assassin's Strike (Hybrid) and its upgrades at 7/13/17/23 (the encounter power at 27 is Coward's Reward), League of Whispers (Bola Takedown), a bola and a rapier.",
    links: [
      ...[7, 13, 17, 23, 27].map((level): ReviewLink => ({
        label: `Build, level ${level}`,
        path: build(level),
        items: [
          [
            "Assassin's Strike (Hybrid)",
            `The level-${level} upgrade choice offers exactly one option${level === 27 ? " (left unpicked here: the level-27 encounter power is Coward's Reward)" : ""}.`,
          ],
          ...(level === 7
            ? ([
                [
                  "Hybrid executioner without Assassin's Strike",
                  "With the power: the upgrade's prerequisite lists Assassin's Strike (Hybrid) first.",
                ],
              ] as const)
            : []),
        ],
      })),
      {
        label: "Equipment",
        path: "tab=equipment",
        items: [["A free item appears", "Poison doses (Poison Use gift)."]],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Assassin's Strike (Hybrid)",
            '"Additional effects: +4d10 extra damage." on the printed card.',
          ],
          [
            "Power weapon rows",
            "Bola Takedown lists only the bola; Coward's Reward lists ordinary melee weapons (the rapier), not the bola.",
          ],
          [
            "Hybrid characters",
            'Class identity line "Executioner / Fighter", not "Hybrid".',
          ],
          [
            "Paired attack and damage effects",
            "Press of Steel: one Back to the Wall line; Bull Rush Attack keeps the attack-only line.",
          ],
          [
            "Situational requirements keep weapon rows",
            "Press of Steel without a shield: the Requirement line, Rapier and Unarmed rows, Additional effects.",
          ],
        ],
      },
      {
        label: "Build, level 1: Powers",
        path: build(1, "powers"),
        items: [
          [
            "Assassin's Strike (Hybrid)",
            'The panel card in the builder also shows "+4d10 extra damage".',
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "executioner-rogue",
      title:
        "Review – Hybrid Executioner/Rogue L7 (no Assassin's Strike, house rule)",
      level: 7,
      classes: ["ID_CDJ_HYBRID_CLASS_40001", "ID_FMP_HYBRID_CLASS_356"],
      preferred: [
        "ID_FMP_RACE_2",
        HYBRID,
        "ID_CDJ_HYBRID_CLASS_40001",
        "ID_FMP_HYBRID_CLASS_356",
      ],
      excluded: [AS_HYBRID_POWER],
      items: [
        { id: "ID_FMP_MAGIC_ITEM_1198", base: "Short sword", equip: true },
        { id: "ID_FMP_WEAPON_74" },
        { id: "ID_FMP_GEAR_21" },
      ],
      grabbag: ["ID_FMP_POWER_12831"],
      expectLegal: false,
      required: ["ID_FMP_MAGIC_ITEM_1198", "ID_FMP_POWER_12831"],
    },
    purpose:
      "Dwarf hybrid executioner/rogue without Assassin's Strike (Hybrid), deliberately NOT legal: an equipped Warsoul Weapon (living-construct only) and a house-ruled Throw Grapple power with a grappling hook.",
    links: [
      {
        label: "Build, level 7",
        path: build(7),
        items: [
          [
            "Hybrid executioner without Assassin's Strike",
            "No Assassin's Strike upgrade choice at level 7.",
          ],
        ],
      },
      {
        label: "House rules",
        path: "tab=house-rules",
        items: [
          [
            '"Equipped item requirement"',
            "An Equipped item requirement issue for the Warsoul Weapon.",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Power weapon rows",
            'Throw Grapple has a no-weapon row; rogue powers ("crossbow, light blade, or sling") list only the allowed weapons.',
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "artificer-ardent",
      title: "Review – Hybrid Artificer/Ardent L11 (Sprite)",
      level: 11,
      classes: ["ID_FMP_HYBRID_CLASS_536", "ID_FMP_HYBRID_CLASS_588"],
      preferred: [
        "ID_FMP_RACE_7",
        HYBRID,
        "ID_FMP_HYBRID_CLASS_536",
        "ID_FMP_HYBRID_CLASS_588",
        "ID_FMP_FEAT_738",
        "ID_FMP_FAMILIAR_102",
        "ID_FMP_FEAT_1389",
        "ID_FMP_FEAT_1710",
      ],
      expectLegal: true,
      required: ["ID_FMP_FEAT_738", "ID_FMP_FAMILIAR_102", "ID_FMP_FEAT_1710"],
    },
    purpose:
      "Human hybrid artificer/ardent with a Sprite familiar and Vigorous Familiar (via Mark of Handling).",
    links: [
      {
        label: "Build, level 1: Feats",
        path: build(1, "feats"),
        items: [
          [
            "Familiar choice",
            "Arcane Familiar's familiar choice shows the Sprite familiar card (panel layout, dark on screen).",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Hybrid characters",
            'Class identity line reads "Artificer / Ardent".',
          ],
          [
            "Familiar card",
            'Sprite with Vigorous Familiar: AC +1, speed "6, fly 6"; no "Familiar: Sprite" power card.',
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "invoker-drow",
      title: "Review – Drow Invoker L11 (God Fragment, Widow)",
      level: 11,
      classes: ["ID_FMP_CLASS_127"],
      preferred: [
        "ID_FMP_RACE_16",
        "ID_FMP_CLASS_127",
        "ID_INTERNAL_GENDER_FEMALE",
        "ID_TIV_THEME_DRAGON_MAGAZINE_413-2",
        "ID_FMP_DEITY_1",
        { id: "ID_FMP_FEAT_2269", from: 11 },
      ],
      freeRituals: [{ name: "Make Whole", allowance: "Invoker" }],
      items: [
        { id: "ID_TIV_MAGIC_ITEM_DRAGON_MAGAZINE_412-18-2", equip: true },
        { id: "ID_FMP_MAGIC_ITEM_7468", equip: true },
        { id: "ID_FMP_MAGIC_ITEM_7459", equip: true },
      ],
      expectLegal: true,
      required: [
        "ID_TIV_THEME_DRAGON_MAGAZINE_413-2",
        "ID_TIV_FAMILIAR-413-5",
        "ID_FMP_DEITY_1",
        "ID_FMP_FEAT_2269",
        "ID_TIV_MAGIC_ITEM_DRAGON_MAGAZINE_412-18-2",
      ],
    },
    purpose:
      "Female drow invoker of Avandra, Widow of Arach-Tinilith theme (Spiderling of Lolth), Awaken God Fragment, the Rose Scythe of Chauntea and two of Caelynnvala's Boons (a group set).",
    links: [
      {
        label: "Rituals tab",
        path: "tab=rituals",
        items: [
          [
            "The Rituals tab",
            "Tab after Shop with a book-marked icon; Free rituals text with the provider in parentheses, then Known (N) and Learn rituals.",
          ],
          [
            "Free-ritual counter",
            "The bold line under the invoker's Free rituals text (its one free ritual is used: Make Whole).",
          ],
          [
            "Groups",
            "Rituals / Alchemical formulas / Martial practices always shown; italic empty states.",
          ],
          [
            "Rows",
            'Book icon, name, muted source line ("Granted by Invoker"), Level, Category, Key skill.',
          ],
          [
            "Remove",
            "Trash icon with an armed red state on learned entries only; granted ones have none.",
          ],
          [
            "Detail card",
            "Select a row: the source as the card's subheading; with nothing selected, the empty-state text.",
          ],
        ],
      },
      {
        label: "Rituals tab: learn",
        path: "tab=rituals&category=rituals",
        items: [
          [
            "Learning view",
            '"← Known rituals" back button, Type select with only the three catalogs, "Search rituals…", a Known chip and column, Buy / Learn free buttons.',
          ],
        ],
      },
      {
        label: "Shop",
        path: "tab=shop&category=items",
        items: [
          [
            "Shop",
            "The Type list has no Rituals, Alchemical formulas or Martial practices; Ritual Scrolls are still under Consumables.",
          ],
        ],
      },
      {
        label: "Old link: Shop rituals",
        path: "tab=shop&category=rituals",
        items: [["Old links", "Lands on the Rituals tab (learning view)."]],
      },
      {
        label: "Old link: section=practices",
        path: "tab=equipment&section=practices",
        items: [["Old links", "Lands on the Rituals tab."]],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Printed reference pages",
            'Granted ritual entries show "Granted by: Invoker".',
          ],
        ],
      },
      {
        label: "Sheet (on screen)",
        path: sheet,
        items: [
          [
            "On-screen sheet",
            '"Rituals & practices" uses the standard panel item cards.',
          ],
        ],
      },
      {
        label: "Details",
        path: "tab=details",
        items: [
          [
            "Builder deity card",
            `Avandra's card: "Domains: …" above the description, domain cards below.`,
          ],
          [
            "Other detail stacks",
            "Deity list: select another deity (e.g. Lolth) to compare its domain cards.",
          ],
        ],
      },
      {
        label: "Build, level 11: Feats",
        path: build(11, "feats"),
        items: [
          [
            "Awaken God Fragment",
            "The feat and its fragment choice; the fragment's Encounter power card (Free action icon, keyword band) among the encounter powers.",
          ],
        ],
      },
      {
        label: "Equipment",
        path: "tab=equipment",
        items: [
          [
            "Equipment and Shop item detail",
            "Select the Scarf of Reconciliation: an Item Set panel card under it.",
          ],
          [
            "Augments attach/detach",
            "Buy a Siberys Shard of Merciless Cold (heroic tier) in the Shop, then right-click it → Attach to → Rose Scythe of Chauntea: the scythe's muted Augment note and the shard's Attached to note.",
          ],
          [
            "Party pieces field",
            'Caelynnvala\'s Boons: the Party pieces field and hint under "Item set" (check at 140% zoom). Enter a count, clear it, try -1 and 1.5.',
          ],
          [
            "Rose Scythe of Chauntea",
            "Equipped Rose Scythe; its implement bonus applies to invoker implement powers (compare the attack numbers with it unequipped).",
          ],
        ],
      },
      {
        label: "Shop: implements",
        path: "tab=shop&category=implements",
        items: [
          [
            "Superior implements",
            "Select an accurate symbol: the item card is used.",
          ],
          [
            "Equipment and Shop item detail",
            "Select a Caelynnvala's Boons piece in the Shop: the Item Set panel card and Party pieces field.",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Printed Deity entry",
            "Avandra after Background (church icon): Domains line, then the description with its bullets.",
          ],
          [
            "Awaken God Fragment",
            'Reference entry with a "Constant Benefits:" line; the fragment\'s Encounter power card among the encounter powers.',
          ],
          [
            "Familiar card",
            'Widow of Arach-Tinilith: "Spiderling of Lolth" card after Skills.',
          ],
          [
            "Item Set card",
            'Caelynnvala\'s Boons (orange) after its last item card: "Group pieces" label and italic note.',
          ],
          [
            "Printed group-set card",
            'Party pieces unset: "Party pieces" with a blank line and full-strength benefits. Set a count in Equipment, then reprint: the count, locked benefits dimmed.',
          ],
          [
            "Rose Scythe of Chauntea",
            "The implement bonus shows in implement power attack lines.",
          ],
        ],
      },
      {
        label: "Sheet (on screen)",
        path: sheet,
        items: [
          [
            "Awaken God Fragment",
            "The fragment's Encounter power card on screen.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "fighter-arena",
      title: "Review – Githzerai Arena Fighter L11",
      level: 11,
      classes: ["ID_FMP_CLASS_3"],
      preferred: [
        "ID_FMP_RACE_18",
        "ID_FMP_CLASS_3",
        "ID_FMP_CLASS_FEATURE_2893",
        "ID_INTERNAL_ARENA_WEAPON_(SPEAR)",
        "ID_INTERNAL_ARENA_WEAPON_(GLAIVE)",
        "ID_FMP_FEAT_1772",
        "ID_FMP_FEAT_3150_V2",
      ],
      items: [
        { id: "ID_FMP_WEAPON_23", equip: true },
        { id: "Spear" },
        { id: "ID_FMP_MAGIC_ITEM_6931", base: "Hide Armor", equip: true },
        { id: "ID_FMP_MAGIC_ITEM_6940", equip: true },
        // Mounts (D110): a published stat block that fits one card, and an
        // owner-relative one that prints as stats and actions cards.
        { id: "ID_FMP_GEAR_77" },
        { id: "ID_FMP_GEAR_100004" },
      ],
      expectLegal: true,
      required: [
        "ID_FMP_CLASS_FEATURE_2893",
        "ID_INTERNAL_ARENA_WEAPON_(GLAIVE)",
        "ID_FMP_FEAT_1772",
        "ID_FMP_FEAT_3150_V2",
        "ID_FMP_MAGIC_ITEM_6940",
      ],
    },
    purpose:
      "Githzerai fighter with Arena Training (spear, glaive), Githzerai Blade Master and Spear Expertise [Arena Fighter], a glaive, two Aleheart Companions' Gear pieces, a Warhorse and a Silver Dragon Steed.",
    links: [
      {
        label: "Equipment",
        path: "tab=equipment",
        items: [
          [
            "Equipment and Shop item detail",
            "Select the Clear-Blood Baldric: an Item Set panel card under it.",
          ],
          [
            "Mount creature card in item detail",
            "Select the Silver Dragon Steed: its creature panel card under the item card.",
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Sub-choices on feature rows",
            "Page-1 reminder labels with a choice: the Fighter Weapon Talent row shows Arena Training.",
          ],
          [
            "Spear Expertise [Arena Fighter]",
            "Charging damage with a spear is the lower (paragon) value.",
          ],
          [
            "Githzerai Blade Master with an arena glaive",
            "+2 arena damage on the glaive rows.",
          ],
          ["Numbers", "Aleheart (2 pieces): +2 Dungeoneering and Endurance."],
          [
            "Item Set card",
            'Aleheart after its last item card: Pieces/Tier row, check icon and "(active)" on the 2-piece benefit, the 4-piece one dimmed; no set introduction.',
          ],
          [
            "Mount creature cards",
            'After Skills: the Warhorse on one card, the Silver Dragon Steed as a stats card and a "— Actions" card.',
          ],
        ],
      },
      {
        label: "Build, level 3: Powers",
        path: build(3, "powers"),
        items: [
          [
            "Opening a filled choice scrolls to its pick",
            "Open the folded Steel Serpent Strike heading; then level 6 Feats and level 1 Powers with the level picker.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "runepriest-scholar",
      title: "Review – Human Runepriest L10 (Scholar, Serene Blade)",
      level: 10,
      classes: ["ID_FMP_CLASS_602"],
      preferred: [
        "ID_FMP_RACE_7",
        "ID_FMP_CLASS_602",
        "ID_FMP_CLASS_FEATURE_4261",
        "ID_FMP_THEME_854",
      ],
      expectLegal: true,
      required: ["ID_FMP_CLASS_FEATURE_4261", "ID_FMP_THEME_854"],
    },
    purpose:
      "Human runepriest with the Serene Blade runic artistry and the Scholar theme.",
    links: [
      {
        label: "Build, level 5",
        path: build(5),
        items: [
          [
            "Scholar",
            "A Draconic/Dwarven/Elven choice at level 5 (when one is missing).",
          ],
        ],
      },
      {
        label: "Build, level 10",
        path: build(10),
        items: [["Scholar", "No such language choice from level 10."]],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Serene Blade runepriest",
            'Proficiencies reads "military heavy blades".',
          ],
        ],
      },
    ],
    variants: [
      {
        slug: "update-waiting",
        title: "Review – Update waiting (Runepriest copy)",
        binding: "update",
        purpose:
          "Bound to the review pack itself rather than the active profile, so a content update is waiting.",
      },
      {
        slug: "missing-content",
        title: "Review – Missing content (Runepriest copy)",
        binding: "missing",
        purpose: "Bound to a pack no browser has: the role line error case.",
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "monk",
      title: "Review – Monk L1 (gifts not yet given)",
      level: 1,
      classes: ["ID_FMP_CLASS_362"],
      preferred: ["ID_FMP_RACE_7", "ID_FMP_CLASS_362"],
      giveFreeItems: false,
      expectLegal: true,
      required: ["ID_FMP_CLASS_362"],
    },
    purpose:
      "Human monk saved without its free items, as an older native character would be.",
    links: [
      {
        label: "Build (first open)",
        path: build(1),
        items: [
          [
            "Older native characters",
            "Opening it gives the missing gifts (watch the Equipment tab next).",
          ],
        ],
      },
      {
        label: "Equipment",
        path: "tab=equipment",
        items: [
          [
            "A free item appears",
            "The monk's Unarmed Strike is equipped in the off-hand.",
          ],
        ],
      },
    ],
  },

  /* Player saves (sample-chars/) and SampleHeroes for the later checks. */
  ...(
    [
      {
        slug: "beldin",
        title: "Review – Beldin Hammertongue (Ardent L11)",
        source: "sample-chars/Beldin Hammertongue 11.dnd4e",
        purpose: "Player save: Ardent Surge's two uses per encounter.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Uses per encounter on power cards",
                'Ardent Surge\'s type bar: "Encounter (2×)" on one line with the level at the right.',
              ],
            ],
          },
          {
            label: "Build, level 1: Powers",
            path: build(1, "powers"),
            items: [
              [
                "Uses per encounter on power cards",
                "Ardent Surge's builder card: the same bar, in dark theme too.",
              ],
            ],
          },
        ],
      },
      {
        slug: "flint",
        title: "Review – Flint (Mage L6)",
        source: "sample-chars/Flint.dnd4e",
        purpose: "Player save: mage feature rows hidden as legacy hides them.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Feature notes follow legacy",
                'Enchantment and Pyromancy Apprentice listed; no "Level N Mage … Powers" rows.',
              ],
            ],
          },
        ],
      },
      {
        slug: "raidon",
        title: "Review – Raidon Kane (SampleHero monk)",
        source: "CharacterBuilder/SampleChars/SampleHeroes/RaidonKane.dnd4e",
        purpose:
          "SampleHero monk: a class block in a card's type bar and full-discipline movement techniques.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Class block in the card type bar",
                'Destined for Greatness: "Adroit Explorer · Level 11" at the right of the type bar.',
              ],
              [
                "Monk movement technique on the discipline card",
                "Five Storms and Dragon's Tail: the Movement Technique section inside the card.",
              ],
            ],
          },
        ],
      },
      {
        slug: "jim",
        title: "Review – Jim Darkmagic (SampleHero wizard)",
        source: "CharacterBuilder/SampleChars/SampleHeroes/Jim_Darkmagic.dnd4e",
        purpose: "SampleHero wizard: spellbook powers' subtitle.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Spellbook subtitle",
                'Expeditious Retreat and Freezing Cloud: "Spellbook" at the right of the title band; not on Sleep.',
              ],
            ],
          },
        ],
      },
      {
        slug: "sylestine",
        title: "Review – Sylestine (Hybrid bard, blink dog)",
        source: "sample-chars/Sylestine.dnd4e",
        purpose:
          "Player save: a Trained Blink Dog associate and an imported Hybrid Talent.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Associate card",
                "The Trained Blink Dog card after Skills and the Arcane Wisp.",
              ],
            ],
          },
          {
            label: "Build, level 4: Feats",
            path: build(4, "feats"),
            items: [
              [
                "Imported Hybrid Talent stays editable",
                "Hybrid Talent's step 2 has Bard Armor Proficiency picked.",
              ],
            ],
          },
        ],
      },
      {
        slug: "dv",
        title: "Review – DV (Hybrid swordmage/warlock)",
        source: "sample-chars/DV.dnd4e",
        purpose:
          "Player save: hybrid at-will alternation, Order Adept utilities and wrist razors in the Arms slot.",
        links: [
          {
            label: "Build, level 1",
            path: build(1),
            items: [
              [
                "Hybrid slots alternate classes",
                "The second at-will slot: Warlock at-wills unavailable with the hybrid reason.",
              ],
            ],
          },
          {
            label: "Equipment",
            path: "tab=equipment",
            items: [
              [
                "Wrist razors on the arms",
                "Loadout: the razors in Arms, the longsword in Main hand.",
              ],
            ],
          },
        ],
      },
      {
        slug: "zilvra",
        title: "Review – Zilvra (L8, older content)",
        source: "sample-chars/Zilvra at 8th.dnd4e",
        purpose:
          "Player save made on older content: an armor's missing damage type and a level-7 manual edit.",
        links: [
          {
            label: "Equipment",
            path: "tab=equipment",
            items: [
              [
                "Armor of Resistance's damage type",
                'The "Resistance Type" issue routes to the Equipment tab.',
              ],
            ],
          },
          {
            label: "House rules",
            path: "tab=house-rules",
            items: [
              [
                "User edit named in House rules",
                'A "Level 7 manual edits" row.',
              ],
            ],
          },
        ],
      },
      {
        slug: "trey",
        title: "Review – Trey Spectre (L12)",
        source: "sample-chars/Trey Spectre 12.dnd4e",
        purpose:
          "Player save: a holy symbol in its own loadout slot, and five conditional-modifier rows on page 1.",
        links: [
          {
            label: "Equipment",
            path: "tab=equipment",
            items: [
              [
                "Holy symbol slot",
                "Loadout: Beacon of Erathis +1 in the Holy symbol slot.",
              ],
            ],
          },
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Holy symbol slot",
                "Abjure Undead, Radiant Vengeance, Divine Rage: Beacon of Erathis +1 rows.",
              ],
              [
                "Page 1 Conditional modifiers pane",
                "Five conditional rows: layout and fit at 100% and 140%.",
              ],
            ],
          },
        ],
      },
      {
        slug: "natan",
        title: "Review – Natan (L12)",
        source: "sample-chars/Natan 12.dnd4e",
        purpose:
          "Player save: resistances and three combined defense rows in the Conditional modifiers pane.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Page 1 Conditional modifiers pane",
                "Resistances plus three combined defense rows: wrapping, striping and fit.",
              ],
              [
                "Play data card lines",
                "The Play data card's note lines fit inside the card.",
              ],
            ],
          },
        ],
      },
      {
        slug: "sample-beatrix",
        title: "Review – Beatrix (player save, wallet)",
        source: "sample-chars/Beatrix.dnd4e",
        purpose: "The player's own Beatrix save: the wallet at her level.",
        links: [
          {
            label: "Equipment",
            path: "tab=equipment",
            items: [
              ["Wallet at a lowered level", "The wallet reads 1 pp; 48 gp."],
            ],
          },
        ],
      },
      {
        slug: "copy-of-character",
        title: "Review – copy of character (wallet)",
        source: "sample-chars/copy of character.dnd4e",
        purpose: "Player save whose wallet sits at its own level: 786 gp.",
        links: [
          {
            label: "Equipment",
            path: "tab=equipment",
            items: [["Wallet at a lowered level", "The wallet reads 786 gp."]],
          },
        ],
      },
    ] as const
  ).map(({ slug, title, source, purpose, links }): ReviewCharacter => ({
    spec: { kind: "import", slug, title, source, required: [] },
    purpose,
    links,
  })),
];

const general: GeneralSection[] = [
  {
    title: "Character library",
    steps:
      "Open #/characters. Check in light and dark themes and at 140% zoom. The review characters give a populated table; the Missing content copy exercises the role line error. (The header's Update button is the app's own update and appears only when a new app version is waiting; no review copy makes it show.)",
    items: [
      [
        "Header",
        "New, Import, Trash + count, divider, Update (only when a new app version is waiting), Settings; labels collapse at phone width; New's disabled tooltip (turn content off in Settings to see it).",
      ],
      [
        "Table",
        "Uppercase header, sort chevrons, striping, hover/selected tints, 2.25rem portraits, Edited tooltip. An empty library: use a private window before restoring.",
      ],
      [
        "Keyboard and mouse",
        "Arrow Up/Down, Home/End, Enter, double-click, middle-click a name; sort and selection survive a reload.",
      ],
      [
        "Pane band",
        'Select e.g. the Sentinel L25 (epic lines), the Fey Warlock L11 (paragon) and a hybrid ("X / Y" role line).',
      ],
      [
        "Action row",
        "Five equal buttons; Export menu below the sticky pane with the .dnd4e spinner; Trash arms to a red Confirm.",
      ],
      [
        "Role line loading",
        "Duplicate a review character (or Import a .dnd4e) and select it.",
      ],
      [
        "Saved role line",
        "Edit a review character in the builder, wait ~2s, return to the library.",
      ],
      [
        "Role line error",
        'Select "Review – Missing content": no role line or placeholder; the rest of the pane works.',
      ],
      [
        "Narrow",
        "Below 60rem (~1344px window at 140%): pane under the table, Race and Edited hidden, no sideways scroll.",
      ],
      [
        "Trash dialog",
        "Trash a couple of the review copies (e.g. Update waiting, then Missing content) and open Trash.",
      ],
      [
        "Empty trash confirmation",
        "Empty trash… with exactly one trashed character first (singular wording), then check the empty state and count.",
      ],
    ],
  },
  {
    title: "Undoing a free item",
    steps:
      "Open #/characters, New. On Build level 1 pick the Wizard class: a Spellbook appears in Equipment. Then Undo.",
    items: [
      [
        "Undo and Remove",
        "Undo removes the Spellbook; picking Wizard again and removing the Spellbook in Equipment keeps it gone.",
      ],
      [
        "A free item appears",
        "Other gifts the same way: Student of Sword Magic (swordmage feat), a hexblade's pact weapon, an executioner's poison, Harper Agent theme (Harper Pin), Trap-Making Kit.",
      ],
    ],
  },
  {
    title: "Shop and new characters",
    steps:
      "Checked in code against the review content: shop validity, enchantment pairing, packages, ritual prices, starting gold and the theme-power reason. Open #/characters → New to look for yourself.",
    items: [
      [
        "Masterwork armor needs an enchantment",
        "Feyleather Armor without and with Inherent Bonuses.",
      ],
      [
        "Weapon enchantment pairing",
        "Warsoul and Reckless list their own base weapons.",
      ],
      [
        "Superior implements under implement enchantments",
        "Lifedrinker lists accurate staff and dagger.",
      ],
      ['No shields for "Any" armor', "Delver's lists armors only."],
      [
        "Artifacts come with their weapon",
        "Spear of the Skylord is one holding on a Longspear.",
      ],
      [
        "Arrows fold into a package",
        "Arrows and Arrow fold into one row of arrows.",
      ],
      [
        "Secret Formularies halves ritual prices",
        "Ritual cost percent 50 with the feat.",
      ],
      ["Starting gold", "A new character's Carried Money."],
      ["Theme-power reason", "The theme-power restriction's reason text."],
    ],
  },
];

export function reviewPlan(): ReviewPlan {
  return {
    characters: reviews.map(({ spec }) => spec),
    reviews,
    general,
  };
}
