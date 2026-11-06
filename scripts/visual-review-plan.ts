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

/** Summon Blade Angel (invoker attack 9), a special-command summon (D111). */
const SUMMON_BLADE_ANGEL = "ID_FMP_POWER_2880";
/** Summon Thought Warrior (psion attack 15), augmentable (D111). */
const SUMMON_THOUGHT_WARRIOR = "ID_FMP_POWER_13352";

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
            "Beatrix: pact, race and class cards",
            "The White Well pact's stack and level sections, the Hexblade and Cleric class cards, the Revenant race card: rhythm, headings, focus ring.",
          ],
          [
            "Trait package benefits",
            "Select the Pact choice row (Fey Pact of the White Well): pact card, each benefit's card, each followed by the power cards it grants, unlabelled (~38 cards).",
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
          [
            "Folded section summaries",
            'Folded, the Race item reads "Revenant · Language: Elven" and the Class item "Hexblade" (the pact is its own row).',
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
        path: "tab=inventory",
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
            "Beatrix: reference feature rows",
            'Past life and the two Guardian Feature rows wrap clear of the "Level N" tag.',
          ],
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
          [
            "Concrete reminders",
            "Page 1's Remember in play: Superior Will reads 'Make saving throw…' (its Will bonus is in Will); no Fey Pact of the White Well Reward or Rod Expertise reminder (their damage, attack and AC/Reflex bonuses are in the numbers).",
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
        // Destined Scion: Heroes of the Forgotten Kingdoms' hexblade destiny.
        "ID_FMP_EPIC_DESTINY_797",
      ],
      expectLegal: true,
      required: [
        WHITE_WELL,
        "ID_FMP_PARAGON_PATH_796",
        // The pact summons; their community cards merge into the
        // creatures (D111).
        "ID_WOG_COMPANION_6_POWERCARD_0",
        "ID_WOG_COMPANION_10_POWERCARD_0",
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
            "White Well hexblade: the Legendary Hexblade section",
            "The pact's Legendary Hexblade section opened: subheadings and cards.",
          ],
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
            "White Well hexblade: summoned creature cards",
            "Mourning Handmaiden and Spectral Protector creature cards: fit, entry headings, balanced halves.",
          ],
          [
            "Summoned allies",
            'On the creature cards: Mourning Handmaiden\'s Attack "+30 vs. Reflex"; Spectral Protector\'s Attack and Opportunity "+30 vs. Will", each your level + 5; no "UNKNOWN" on any card.',
          ],
          [
            "Summoned creature cards",
            'Mourning Handmaiden and Spectral Protector creature cards after Skills ("Summoned creature · Daily", HP your bloodied value, your defenses + 2, speed), with their auras as traits and their movement, opportunity actions and attacks as actions; no pact power cards and no separate trait or attack cards.',
          ],
          [
            "Paired attack and damage effects",
            "Melee Basic Attack: one Back to the Wall line for attack and damage.",
          ],
        ],
      },
      {
        label: "Build, level 25",
        path: build(25),
        items: [
          [
            "White Well hexblade: level 25 gains",
            "The empty state, then the Gained at this level list under it.",
          ],
          [
            "Gained at this level",
            "No section tabs (only the optional retrain, which is on Retraining); the list names the White Well's level 25 feature and, under it, its Greater Summon power.",
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
            "Hystan: type bars and the Play data card",
            "Twin Strike, Master Diplomat, Mighty Sprint and the Play data card; then the Build tab's power cards in dark theme.",
          ],
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
            "Hu: sheet Edit mode",
            "View | Edit, the Sections menu (hide, reorder, copies), right-click hiding, then the browser's print preview.",
          ],
          [
            "Background benefit card",
            'Six background cards, then "Background benefit: …" with its Benefit text.',
          ],
          [
            "Granted aliases on feature rows",
            'The heading is "Battle Awareness"; the reference body retains "Choices: Athletics; counts as Fighter".',
          ],
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
        ],
      },
      {
        label: "Equipment",
        path: "tab=inventory",
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
            'The druid\'s free-ritual block: "Free rituals (Druid)" and a line per allowance left, or no block once used; no rule sentence.',
          ],
        ],
      },
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Piri: Play data card",
            "The Play data card's note lines fit inside the card.",
          ],
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
            "Beast ranger: Name and Appearance fields",
            "The short Name field with the multi-line Appearance box beneath it.",
          ],
          [
            "Builder Companion pane",
            "The chosen wolf's card; select another beast for a candidate preview.",
          ],
          [
            "Name and Appearance",
            'Name ("Ash") input and a multi-line Appearance box; the card title reads "Ash — Wolf".',
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
            "Sentinel druid: Bruin's printed card",
            "Bruin's level-25 card is mechanics only (no description) and fits one card. Split cards: choose a Horse to see stats + Notes.",
          ],
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
          [
            "Listed picks left off reminder rows",
            "Page-1 reminder: Druid Wilderness Knacks names no knack (each has its own reference entry).",
          ],
          [
            "Reference heading drops listed picks",
            'Character Reference pages: the heading reads "Druid Wilderness Knacks"; Beast Empathy and Mountain Guide are entries of their own.',
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
        items: [
          [
            "Gnome wizard: Order Adept card",
            "Order Adept → More…: card rhythm, More… at the left.",
          ],
          ["Other detail stacks", "Theme list: select Alchemist."],
        ],
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
            'Under "Free rituals (Spellbook)": e.g. "2 free 1st-level rituals and 2 free rituals of level 5 or lower" (one of the 1st-level ones is used).',
          ],
          [
            "Known-list source line",
            'Comprehend Language reads "Learned free at level 1 (Spellbook)".',
          ],
          [
            '"Learn X free" dialog',
            'Learn free on a 1st-level ritual learns it straight away (one allowance, no dialog). The dialog itself needs a psion (the Psion 15 review character\'s Rituals tab). Each option reads "Psion · …" with what that allowance still covers.',
          ],
        ],
      },
      {
        label: "Equipment",
        path: "tab=inventory",
        items: [
          [
            "Gnome wizard: Wield when Small",
            "Buy a Longsword, right-click it: no Wield two-handed item; wielded, it fills both hands.",
          ],
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
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Tome of Binding reminder",
            "Page 1's Remember in play: Tome of Binding reads '…creatures summoned gain a +1 bonus to damage rolls.' (its Constitution modifier).",
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
            "Fey warlock: Arcane Wisp in the builder",
            "Arcane Familiar's Arcane Wisp card: dark navy in dark theme, dark tinted tiles, HP and Speed on one row, the rules note at body size, the description as flavor text under the header.",
          ],
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
            "Fey warlock: printed Arcane Wisp card",
            "The familiar card's tiles (HP and Speed on one row) and fit.",
          ],
          [
            "Familiar card",
            'Arcane Wisp after the Skills card: speed "fly 8 (hover)"; no "Familiar: X" power card; mechanics only (no description). Check fit, the defense/HP/speed tiles, the rules line and Hide flavor text.',
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
        path: "tab=inventory",
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
        // A special-command summon (D111): its creature card.
        { id: SUMMON_BLADE_ANGEL, from: 9 },
      ],
      freeRituals: [{ name: "Make Whole", allowance: "Invoker" }],
      items: [
        { id: "ID_TIV_MAGIC_ITEM_DRAGON_MAGAZINE_412-18-2", equip: true },
        { id: "ID_FMP_MAGIC_ITEM_7468", equip: true },
        { id: "ID_FMP_MAGIC_ITEM_7459", equip: true },
        // A carried implement: Summon Blade Angel's commands print a row
        // per implement on its creature card (D111).
        { id: "ID_FMP_MAGIC_ITEM_872" },
      ],
      expectLegal: true,
      required: [
        "ID_TIV_THEME_DRAGON_MAGAZINE_413-2",
        "ID_TIV_FAMILIAR-413-5",
        "ID_FMP_DEITY_1",
        "ID_FMP_FEAT_2269",
        "ID_TIV_MAGIC_ITEM_DRAGON_MAGAZINE_412-18-2",
        SUMMON_BLADE_ANGEL,
      ],
    },
    purpose:
      "Female drow invoker of Avandra, Widow of Arach-Tinilith theme (Spiderling of Lolth), Awaken God Fragment, the Rose Scythe of Chauntea, two of Caelynnvala's Boons (a group set) and Summon Blade Angel.",
    links: [
      {
        label: "Rituals tab",
        path: "tab=rituals",
        items: [
          [
            "The Rituals tab",
            "Tab after Shop with a book-marked icon; no Free rituals rule sentence, then Known (N) and Learn rituals.",
          ],
          [
            "Free-ritual counter",
            "Its one free ritual is used (Make Whole), so the tab has no free-ritual block.",
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
        path: "tab=inventory",
        items: [
          [
            "Drow invoker: Equipment and Shop",
            "Party pieces field; buy a shard, a Longsword, Armor of Adaptable Resistance +1 and a Harper Pin; the right-click menus.",
          ],
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
            "Equipped Rose Scythe; its implement bonus applies to invoker implement powers (compare the attack numbers with it unequipped). Its bulleted Properties are in the item card's body as a list, not its header rows.",
          ],
          [
            "Drow invoker: Rose Scythe properties",
            'Select the Rose Scythe: "Properties: See Below" and its two bullets in the card body, not the header rows.',
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
            "Drow invoker: printed familiar and Blade Angel",
            'Spiderling of Lolth, Blade Angel and Summon Blade Angel cards: fit, implement rows (the last "No implement").',
          ],
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
            "The implement bonus shows in implement power attack lines; the scythe's item card has its bulleted Properties in the body.",
          ],
          [
            "Drow invoker: Rose Scythe properties",
            "The scythe's item card: Properties and its bullets in the body, the card still fits.",
          ],
          [
            "Summoned creature card",
            'Summon Blade Angel keeps its Effect but no attack band; a "Blade Angel" card after the familiar, "Summoned creature · Daily" in its type bar, with the Minor Action and Opportunity Attack commands, each with its own "Attack … · Damage …" row.',
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
      {
        label: "Build, level 9: Powers",
        path: build(9, "powers"),
        items: [
          [
            "Drow invoker: Blade Angel in power detail",
            "Summon Blade Angel's dark creature panel card.",
          ],
          [
            "Summoned creature in power detail",
            "Select Summon Blade Angel: its creature panel card under the power card.",
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
        path: "tab=inventory",
        items: [
          [
            "Arena fighter: mounts in item detail",
            "The Silver Dragon Steed and Warhorse panel cards (no flavor band); a Kank in the Shop, its paragraph as flavor text under the header and its load table at the bottom; the item cards above show no description of their own.",
          ],
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
            "Arena fighter: print preview",
            "The Warhorse card and the Steed's two cards; the Warhorse item card without the load table.",
          ],
          [
            "Arena Training applied, not reminded",
            "No Arena Training reminder on page 1: its AC bonus (not in heavy armor) is in AC and its improvised-weapon bonus on the Unarmed rows.",
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
            'After Skills: the Warhorse on one card, the Silver Dragon Steed on one card at about 6 pt (or, if it overflows there, a stats card and a "— Actions" card).',
          ],
        ],
      },
      {
        label: "Build, level 3: Powers",
        path: build(3, "powers"),
        items: [
          [
            "Arena fighter: opening a filled choice",
            "Open the folded Steel Serpent Strike heading; then level 6 Feats and level 1 Powers with the level picker.",
          ],
        ],
      },
    ],
  },
  {
    spec: {
      kind: "native",
      slug: "psion-thought-warrior",
      title: "Review – Psion L15 (Summon Thought Warrior)",
      level: 15,
      classes: ["ID_FMP_CLASS_437"],
      preferred: [
        "ID_FMP_RACE_7",
        "ID_FMP_CLASS_437",
        // Augmentable summon whose adjacent commands share one implement
        // table on the creature card (D111).
        { id: SUMMON_THOUGHT_WARRIOR, from: 15 },
      ],
      // Two implements with different enhancements: per-implement rows.
      items: [
        { id: "ID_FMP_MAGIC_ITEM_845", equip: true },
        { id: "ID_FMP_MAGIC_ITEM_924" },
      ],
      expectLegal: true,
      required: [SUMMON_THOUGHT_WARRIOR],
    },
    purpose:
      "Human psion with Summon Thought Warrior and two implements (an orb +1 and a staff +3): one shared implement table under adjacent creature commands.",
    links: [
      {
        label: "Print preview",
        path: preview,
        items: [
          [
            "Shared implement table (D111)",
            "Thought Warrior: the Standard Action and Immediate Interrupt commands print text only, then one uncaptioned table under the Opportunity Attack, one row per implement.",
          ],
          [
            "Psion: the Thought Warrior's shared implement rows",
            'The "Thought Warrior" creature card (or its "— Actions" card).',
          ],
        ],
      },
      {
        label: "Rituals tab",
        path: "tab=rituals",
        items: [
          [
            "Free rituals block",
            '"Free rituals (Psion)", then "1 free 1st-level ritual" and "1 free ritual: Sending or Tenser\'s Floating Disk"; no rule sentence.',
          ],
          [
            "Known table",
            "Name, Level, Category, Key skill and Remove columns; three padded group rows with their empty states.",
          ],
          [
            "Learn free dialog",
            "Learn rituals → Tenser's Floating Disk → Learn free: two Psion options and None (a gift).",
          ],
          [
            "Psion: Rituals tab",
            "The free-rituals block, the Known table's columns and group rows, and the Learn free dialog for Tenser's Floating Disk, at 140% zoom and in both themes.",
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
          [
            "Sub-choices on reminder rows",
            'Page-1 reminder "Level 5 Scholar Feature: Dungeoneering" and reference heading "Scholar Feature: Dungeoneering": a pick with no card or entry of its own stays named.',
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
        path: "tab=inventory",
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
                "Beldin: Ardent Surge's type bar",
                "Ardent Surge's bar on one line; then its Build tab card.",
              ],
              [
                "Uses per encounter on power cards",
                'Ardent Surge\'s type bar: "Encounter (2×)" on one line with the level at the right.',
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
                "Raidon: type bar and movement technique",
                "Destined for Greatness, Five Storms and Dragon's Tail; then the Build tab with Five Storms selected.",
              ],
              [
                "Class block in the card type bar",
                'Destined for Greatness: "Adroit Explorer · Level 11" at the right of the type bar.',
              ],
              [
                "Separators drop at a wrapped line's start",
                'Destined for Greatness: "Adroit Explorer · Level 12" is one "·" list; where it wraps, "Level 12" starts its line without a "·".',
              ],
              [
                "Monk movement technique on the discipline card",
                'Five Storms and Dragon\'s Tail: the "Movement Technique · Move Action" band at the foot of the card, after the free space.',
              ],
            ],
          },
          {
            label: "Retraining",
            path: "tab=retraining",
            items: [
              [
                "Retraining drops class-feature feats and swap gains",
                "Plaguefire Body (gained by the Student of the Plague swap) is not a retraining target.",
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
                "Jim: Spellbook subtitle",
                "Expeditious Retreat and Freezing Cloud; then their panel cards; the Spellbook heading on the Character Reference pages.",
              ],
              [
                "Spellbook subtitle",
                'Expeditious Retreat and Freezing Cloud: "Spellbook" at the right of the title band; not on Sleep.',
              ],
              [
                "Spellbook reference heading",
                'Character Reference pages: the Spellbook heading reads just "Spellbook"; its spells are power cards, so it does not name them.',
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
                "Sylestine: Blink Dog card and Hybrid Talent",
                "The Trained Blink Dog card; then Build level 4 Feats, Hybrid Talent and its issue row.",
              ],
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
              [
                "Hybrid Talent's open choice wording",
                'Headed "Hybrid Talent", never "Class Feature"; left open, its issue says what to choose.',
              ],
              [
                "Hybrid Talent's Review lands on its choice",
                "Left open, its issue's Review targets step 2 of the feat's flow on the Feats tab, whose section is rendered and focusable.",
              ],
              [
                "Sylestine: Review lands on Hybrid Talent's choice",
                "Leave Hybrid Talent's option open; from the status badge's list, Review scrolls to step 2 and focuses it.",
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
            path: "tab=inventory",
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
        title: "Review – Zilvra (L9, older content)",
        source: "sample-chars/Zilvra at 8th.dnd4e",
        // Saved on stock content (complete there); the full pack's Armor of
        // Resistance adds the damage-type select the review needs open.
        expectComplete: false,
        purpose:
          "Player save made on older content: an armor's missing damage type and a level-7 manual edit.",
        links: [
          {
            label: "Equipment",
            path: "tab=inventory",
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
            path: "tab=inventory",
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
                "Trey: page 1 Conditional modifiers pane",
                "Five conditional rows: wrapping, striping and fit.",
              ],
              [
                "Holy symbol slot",
                "Abjure Undead, Radiant Vengeance, Divine Rage: Beacon of Erathis +1 rows.",
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
                "Natan: page 1 and the Play data card",
                "The Conditional modifiers pane and the Play data card's note lines.",
              ],
              [
                "Play data Defenses line",
                'One Defenses line, "Resist 11 necrotic, 11 radiant; conditional defenses in Conditional modifiers"; the conditional defense bonuses are in page 1\'s Conditional modifiers pane, and no reminder repeats them.',
              ],
              [
                "Militant Dawn not reminded",
                "No Militant Dawn reminder on page 1: its radiant damage equals Natan's Charisma modifier (−1), a bonus that does nothing (D112).",
              ],
            ],
          },
        ],
      },
      {
        slug: "idon",
        title: "Review – Idon Tkare (L6)",
        source: "sample-chars/idon tkare at 6th.dnd4e",
        purpose:
          "Player save: Speed and Skills & checks rows in the Conditional modifiers pane.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Idon: page 1 and the Play data card",
                "Conditional modifiers pane and the Play data card's note lines.",
              ],
            ],
          },
        ],
      },
      {
        slug: "skye",
        title: "Review – Skye",
        source: "sample-chars/Skye.dnd4e",
        purpose: "Player save: a Conditional modifiers pane of saves only.",
        links: [
          {
            label: "Print preview",
            path: preview,
            items: [
              [
                "Skye: page 1 Conditional modifiers pane",
                "A pane of saving-throw rows only.",
              ],
            ],
          },
        ],
      },
      {
        slug: "lily",
        title: "Review – Lily (Bard, Skald Training)",
        source: "sample-chars/Lily.dnd4e",
        purpose:
          "Player save: Skald Training's automatic Majestic Word → Skald's Aura swap, and Ritual Caster under Bardic Training kept out of retraining.",
        links: [
          {
            label: "Build, level 4",
            path: build(4),
            items: [
              [
                "Skald Training swaps Majestic Word on its own",
                "The replacement shows Majestic Word → Skald's Aura, filled, with no issue.",
              ],
            ],
          },
          {
            label: "Retraining",
            path: "tab=retraining",
            items: [
              [
                "Retraining drops class-feature feats and swap gains",
                "Ritual Caster (under Bardic Training) is not a retraining target.",
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
            path: "tab=inventory",
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
            path: "tab=inventory",
            items: [["Wallet at a lowered level", "The wallet reads 786 gp."]],
          },
        ],
      },
    ] as const
  ).map((entry): ReviewCharacter => ({
    spec: {
      kind: "import",
      slug: entry.slug,
      title: entry.title,
      source: entry.source,
      ...("expectComplete" in entry
        ? { expectComplete: entry.expectComplete }
        : {}),
      required: [],
    },
    purpose: entry.purpose,
    links: entry.links,
  })),
];

const general: GeneralSection[] = [
  {
    title: "Character library",
    steps:
      "Open #/characters with the review characters restored. The Missing content copy exercises the role line error. (The header's Update button is the app's own update and appears only when a new app version is waiting; no review copy makes it show.)",
    items: [
      [
        "Library: header and table",
        "Header, table, the 36rem and 60rem narrow layouts, the empty state (a private window before restoring), keyboard focus, and Import scrolling to the topmost imported row.",
      ],
      [
        "Library: detail pane",
        "The navy band for the Sentinel L25, Fey Warlock L11 and a hybrid; the five buttons; the role line while loading, after an edit and on the Missing content copy.",
      ],
      ["Library: trash", "The trash dialog and the Empty trash? confirmation."],
      [
        "Pane band",
        'Select e.g. the Sentinel L25 (epic lines), the Fey Warlock L11 (paragon) and a hybrid ("X / Y" role line).',
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
      [
        "Item choices named from their options",
        "Armor of Adaptable Resistance asks for a damage type, Harper Pin for a power.",
      ],
    ],
  },
  {
    title: "New characters",
    steps:
      "Open #/characters → New; each check needs a fresh character, so no review character covers it.",
    items: [
      [
        "New hybrid: a pick that opens a step",
        "Hybrid Barbarian/Cleric, level 1 Feats: double-click Hybrid Talent; then Review on its issue; Toughness elsewhere.",
      ],
      [
        "New fighter: open-choice issue rows",
        "Fighter at level 1 with Fighting Style left open: the section and its issue row.",
      ],
    ],
  },
  {
    title: "Live site and manual steps",
    steps:
      "These need an installed PWA (Chrome on macOS), a normal browser tab, Settings' own restore, or your own content for Erdan; see the checklist for the exact steps.",
    items: [
      [
        "Installed app: title bar and icon",
        "Reinstall the PWA; the title bar under each theme; the Dock, Launchpad and Cmd-Tab icon.",
      ],
      [
        "Browser tab: favicon",
        "Light and dark tab strips after a hard reload.",
      ],
      [
        "Settings: Restore backup dialog and confirmation",
        'Back up library, then restore that file: the conflict dialog\'s layout, then the "Restored N characters." line with its Open library link.',
      ],
      [
        "Erdan: feature notes on your own content",
        "Import sample-chars/Erdan 11.dnd4e with your own content; page 1 class features.",
      ],
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
