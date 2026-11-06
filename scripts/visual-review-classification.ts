/**
 * Which review-page rows (scripts/visual-review-plan.ts, keyed as the page's
 * checkboxes are: `<slug>|<link index>|<item title>` or
 * `general|<section index>|<item title>`) code can verify. "auto" rows are
 * checked by apps/web/scripts/verify-visual-review.ts and need no owner
 * checkbox; "mixed" rows have a factual part verified there and a visual
 * part (`visual`) left for the owner; any row not listed is visual.
 *
 * Since the 2026-11-04 compression no row is mixed: an item's factual part
 * is an "auto" row under its old title, and what is left to look at is one
 * walk-through entry per character page in the checklist, named
 * "<Character>: …" so no old title is a prefix of it.
 */
export type RowClass =
  | { readonly kind: "auto"; readonly auto: string }
  | { readonly kind: "mixed"; readonly auto: string; readonly visual: string };

const auto = (text: string): RowClass => ({ kind: "auto", auto: text });

export const ROW_CLASSIFICATION: Readonly<Record<string, RowClass>> = {
  // Beatrix
  "beatrix|0|trait package benefits": auto(
    'The pact\'s detail stack: the pact card, then each benefit card, each followed by the cards it grants, with no "Granted power" label; the card count; choice options (Arcanist Cantrips) as granted cards.',
  ),
  "beatrix|0|white well pact summary": auto(
    'The pact table row summary text is "You have the Fey pact of the White Well."',
  ),
  "beatrix|0|benefits by level": auto(
    'Sections (Level 1, 7, 9, both hexblade paths, 25), "Level 9 · 1 feature, 3 powers" counts, open by viewed level (1, 9, 12), bullets only while folded, plain Level subheadings in path sections, a chosen path leaving only its section, the pact card\'s flavor → Prerequisites → benefits order, and sections for Alchemist, Feytouched and Archmage.',
  ),
  "beatrix|0|essentials power swaps": auto(
    "The required replacement choices exist, are filled, and offer only powers of the matching kind to lose.",
  ),
  "beatrix|0|class detail card": auto(
    'The Hexblade card\'s heading line is "Arcane Striker" (power source, then role; Paladin\'s "Divine Defender" too), and one "Key abilities" row at the head of the class traits grid lists the class\'s key abilities as authored.',
  ),
  "beatrix|1|revenant past life": auto(
    "The Past life (CountsAsRace) choice is in the Race section, picked as Eladrin.",
  ),
  "beatrix|1|folded section summaries": auto(
    'Folded summaries: the main pick, then each filled sub-choice as "Slot: pick" ("Revenant · Language: Elven"; Hexblade; Piri\'s "Druid · Power: Pounce · Power: Call of the Beast · Power: Savage Rend").',
  ),
  "beatrix|2|essentials power swaps": auto(
    "The Retraining tab lists the replacement levels and their options match the power kind.",
  ),
  "beatrix|3|superior implements": auto(
    "The accurate rod's detail pane renders the item card (not a power or reference card).",
  ),
  "beatrix|3|a free item appears": auto(
    "The pact weapon gift is in the inventory and has a sheet item card.",
  ),
  "beatrix|4|sub-choices on feature rows": auto(
    'Reference headings "Past life: Eladrin" and two "Guardian Feature" rows, none repeating a "Level N" tag or the class, with no dangling "You gain one of the following …" text (the pact and power-slot rows are off the sheet, as legacy: 2ad4731).',
  ),
  "beatrix|4|background benefit card": auto(
    'The Luskan card has no suffix and a "Background benefit: …" card with its Benefit text follows it.',
  ),
  "beatrix|4|granted aliases on feature rows": auto(
    'The printed feature row reads "Fey Pact of the White Well Boon: counts as Fey Pact".',
  ),
  "beatrix|4|proficiencies pane": auto(
    "Proficiencies follows Worn/Held Items and Carried Items with Armor / Shields / Weapons / Implements lines in lower case.",
  ),
  "beatrix|4|printed deity entry": auto(
    "Sehanine's entry follows Background, with the church icon, a Domains line, then the description.",
  ),
  "beatrix|4|concrete reminders": auto(
    "Superior Will's reminder leaves out its +2 Will (in Will); no White Well Reward reminder (its Pact Reward is on Eldritch Bolt's damage) and no Rod Expertise reminder (D112).",
  ),
  "beatrix|5|granted aliases on feature rows": auto(
    "The on-screen feature list shows the same alias text.",
  ),
  "beatrix|6|build overview rows": auto(
    'The Overview tab lists levels 1 to 8 (3 and 7 without choices); Level 1\'s rows in order: Character (Class, Pact Choice, "Race — Revenant · Language: Elven", Past life, both Background rows, Theme), Feats, Powers ("Daily power — Crown of Stars"), then Other (Ability Scores as the point-buy scores, "Race Ability Bonus — +2 CHA", Skill Training, Deity, Gender), each with the Build tab\'s title and folded picks, all complete; Level 4\'s ability increase reads "+1 CHA, +1 DEX".',
  ),
  // White Well hexblade (level 25)
  "hexblade-white-well|0|benefits by level": auto(
    "With Legendary Hexblade chosen, only its path section remains, with Level 11 / 12 / 16 / 20 subheadings, and the sections at or below the viewed level (1, 11, 25) start open.",
  ),
  "hexblade-white-well|1|other detail stacks": auto(
    "Legendary Hexblade's stack lists its features and powers.",
  ),
  "hexblade-white-well|3|gained at this level": auto(
    "Build level 25 has no section tabs (its only choice is the optional retrain) and lists the White Well's level 25 feature with its Greater Summon power under it; level 13 shows the empty state with nothing gained.",
  ),
  "hexblade-white-well|2|summoned allies": auto(
    'Mourning Handmaiden\'s Attack is headed "Level+5 vs Ref" and Spectral Protector\'s Attack and Opportunity "Level+5 vs Will", each evaluated and printed as your level + 5 (+30 at level 25); no printed card or page reads "UNKNOWN", and no attack header falls back to a dash.',
  ),
  "hexblade-white-well|2|summoned creature cards (d111)": auto(
    "Mourning Handmaiden and Spectral Protector creature cards: fey humanoid (undead) identity, HP your bloodied value, AC your AC + 2, speed, healing surges; the pact power card drops the stat block.",
  ),
  // Hystan
  "hystan|0|granted aliases on feature rows": auto(
    '"Dual Heritage: counts as Elf, Human" on the printed feature rows.',
  ),
  "hystan|0|background benefit card": auto(
    "Two background cards, then the background benefit card with its Benefit text.",
  ),
  "hystan|1|granted aliases on feature rows": auto(
    "The Dual Heritage alias in the on-screen feature list.",
  ),
  // Hu
  "hu|0|background benefit card": auto(
    'Six background cards, then "Background benefit: …" with its Benefit text.',
  ),
  "hu|0|granted aliases on feature rows": auto(
    'The printed feat heading is "Battle Awareness"; its reference body retains "Choices: Athletics; counts as Fighter".',
  ),
  "hu|1|granted aliases on feature rows": auto(
    'The on-screen feature label is "Battle Awareness"; choices belong in its body.',
  ),
  // Piri
  "piri|0|rows": auto(
    'The druid-granted ritual\'s Inventory row reads "Granted by Druid".',
  ),
  "piri|0|free-ritual counter": auto(
    'The druid\'s free-ritual block in the Inventory, before the known groups: no rule sentence, and a "Free rituals (Druid)" heading with a line per allowance left (none once used).',
  ),
  "piri|1|printed reference pages": auto(
    'Granted ritual entries show "Granted by: Druid".',
  ),
  // Beast Mastery ranger
  "ranger-beast|0|builder companion pane": auto(
    "The chosen wolf's detail pane is the beast card; another beast gets a candidate preview card.",
  ),
  "ranger-beast|0|name and appearance": auto(
    'Name ("Ash") and Appearance inputs render in the Companion section; the card title reads "Ash — wolf".',
  ),
  "ranger-beast|1|retraining": auto(
    'A "Retrain a companion" option exists with beast options; a companion retrain\'s Kind cell reads "Companion".',
  ),
  "ranger-beast|2|beast mastery ranger": auto(
    'Beast attack powers have beast attack and damage numbers; no "Companion: X" power card.',
  ),
  "ranger-beast|2|printed beast card": auto(
    "The beast card is printed right after the Skills card, before any familiar.",
  ),
  "ranger-beast|2|beast power cards": auto(
    '"Beast +N vs AC" header and "Beast damage" line on beast powers; Distracting Team keeps its table with beast cells.',
  ),
  // Sentinel (bear)
  "sentinel-bear|0|builder companion pane": auto(
    "The bear's card in the Companion pane (candidate preview: 16 Str, 15 Con).",
  ),
  "sentinel-bear|1|other detail stacks": auto(
    "Archmage's detail stack lists its features and powers.",
  ),
  "sentinel-bear|2|printed beast card": auto(
    'The Surges tile reads "Yours"; no description prints.',
  ),
  "sentinel-bear|2|beast power cards": auto(
    '"Beast +N vs AC" header and "Beast damage" lines on the companion powers.',
  ),
  // Gnome wizard
  "wizard-gnome|0|gnome characters": auto(
    "The gnome evaluates, complete and legal.",
  ),
  "wizard-gnome|0|other detail stacks": auto(
    "Genasi's Elemental Manifestation stack lists its sub-options (about 26 cards).",
  ),
  "wizard-gnome|1|other detail stacks": auto(
    "Warlord's Commanding Presence and Cleric's Channel Divinity (12 powers) stacks.",
  ),
  "wizard-gnome|2|other detail stacks": auto(
    "Alchemist's stack lists its features and powers.",
  ),
  "wizard-gnome|3|wizard spellbook": auto(
    "Replacing a spellbook pick keeps the new pick after re-evaluation.",
  ),
  "wizard-gnome|4|already owned candidates": auto(
    'Feats taken earlier are unavailable at level 4 with the reason "Already owned".',
  ),
  "wizard-gnome|5|order adept with a spellbook": auto(
    "No class power choice at level 5 offers an Order Adept theme power.",
  ),
  "wizard-gnome|6|free-ritual counter": auto(
    'The "Free rituals (Spellbook)" block\'s line ("… free 1st-level rituals and … free rituals of level 5 or lower"), with no rule sentence.',
  ),
  "wizard-gnome|6|known-list source line": auto(
    'Comprehend Language\'s Inventory row reads "Learned free (Spellbook)", no level.',
  ),
  "wizard-gnome|6|learn x free dialog": auto(
    "The wizard's Spellbook is one allowance (no dialog); with a psion's allowance beside it, Tenser's Floating Disk fits both, so Learn free asks.",
  ),
  "wizard-gnome|7|gnome wizard: wield when small": auto(
    'A Small character\'s versatile Longsword has no "Wield two-handed" menu item and fills both hands; a Medium character keeps the toggle.',
  ),
  "wizard-gnome|7|a free item appears": auto(
    "The Spellbook gift is in the inventory and has a sheet item card.",
  ),
  "wizard-gnome|8|equipment item details": auto(
    "A wand's detail pane lists the powers it grants.",
  ),
  "wizard-gnome|9|equipment item details": auto(
    "The Eye of Vecna's detail pane lists its conditional powers.",
  ),
  "wizard-gnome|9|other detail stacks": auto(
    "The Eye of Vecna's detail stack.",
  ),
  "wizard-gnome|10|tome of binding reminder": auto(
    "Tome of Binding's reminder states the bonus as the evaluated Constitution modifier, printed on page 1 (D112).",
  ),
  // Fey warlock
  "warlock-fey|0|wizard spellbook": auto(
    "Eldritch Blast's ability choice offers Charisma and Constitution and can be changed and back.",
  ),
  "warlock-fey|1|other detail stacks": auto(
    "Feytouched's stack lists its features and powers.",
  ),
  "warlock-fey|1|familiar choice": auto(
    "The familiar choice's detail pane is the Arcane Wisp familiar card in panel layout.",
  ),
  "warlock-fey|2|familiar card": auto(
    'Arcane Wisp card after Skills, speed "fly 8 (hover)", HP and Speed tiles in one row, the rules line, no "Familiar: X" power card, no description on the printed card, Hide flavor text drops the builder pane description.',
  ),
  // Hybrid executioner/fighter
  "executioner-fighter|0|assassin's strike (hybrid)": auto(
    "The level-7 upgrade choice shows exactly one available option.",
  ),
  "executioner-fighter|0|hybrid executioner without assassin's strike (hybrid)":
    auto("The upgrade's prerequisite lists Assassin's Strike (Hybrid) first."),
  "executioner-fighter|1|assassin's strike (hybrid)": auto(
    "The level-13 upgrade choice shows exactly one available option.",
  ),
  "executioner-fighter|2|assassin's strike (hybrid)": auto(
    "The level-17 upgrade choice shows exactly one available option.",
  ),
  "executioner-fighter|3|assassin's strike (hybrid)": auto(
    "The level-23 upgrade choice shows exactly one available option.",
  ),
  "executioner-fighter|4|assassin's strike (hybrid)": auto(
    "The level-27 upgrade choice shows exactly one available option.",
  ),
  "executioner-fighter|5|a free item appears": auto(
    "The hybrid's Poison Use (Hybrid) picks Bloodroot Poison Recipe, whose poison is given once.",
  ),
  "executioner-fighter|6|assassin's strike (hybrid)": auto(
    '"Additional effects: +4d10 extra damage." on the printed card.',
  ),
  "executioner-fighter|6|power weapon rows": auto(
    "Bola Takedown lists only the bola; Coward's Reward lists the rapier, not the bola.",
  ),
  "executioner-fighter|6|hybrid characters": auto(
    'Class identity line "Executioner / Fighter".',
  ),
  "executioner-fighter|7|assassin's strike (hybrid)": auto(
    'The builder panel card also shows "+4d10 extra damage".',
  ),
  // Hybrid executioner/rogue
  "executioner-rogue|0|hybrid executioner without assassin's strike (hybrid)":
    auto("No Assassin's Strike upgrade choice at level 7."),
  "executioner-rogue|1|equipped item requirement": auto(
    "An Equipped item requirement issue names the Warsoul Weapon; its Review targets the Warsoul Weapon's Inventory row.",
  ),
  "executioner-rogue|2|power weapon rows": auto(
    "Throw Grapple has a no-weapon row; rogue weapon powers list only the allowed weapons.",
  ),
  // Hybrid artificer/ardent
  "artificer-ardent|0|familiar choice": auto(
    "The familiar choice's detail pane is the Sprite familiar card in panel layout.",
  ),
  "artificer-ardent|1|hybrid characters": auto(
    'Class identity line "Artificer / Ardent".',
  ),
  "artificer-ardent|1|familiar card": auto(
    'Sprite with Vigorous Familiar: AC +1, speed "6, fly 6"; no "Familiar: Sprite" power card.',
  ),
  // Drow invoker
  "invoker-drow|0|no rituals tab": auto(
    'No Rituals tab or workspace; no Free rituals rule sentence (its one free ritual is used, so no free-ritual block); "Rituals known (N)" in the Inventory, no source naming a level.',
  ),
  "invoker-drow|0|free-ritual counter": auto(
    "The invoker's one free ritual is used, so the Inventory has no free-ritual block.",
  ),
  "invoker-drow|0|groups": auto(
    "Only the kinds known have a group, in order after the item categories, each count inside the item categories' label.",
  ),
  "invoker-drow|0|rows": auto(
    'Each row has the book icon, the name, then Level, Category, Key skill and "Granted by Invoker" on the muted detail line.',
  ),
  "invoker-drow|0|remove": auto(
    "Known rows have no buttons besides the name; their right-click menu's Remove is inert, with the reason, for a granted ritual.",
  ),
  "invoker-drow|0|detail card": auto(
    "A selected row's card has its source as the subheading.",
  ),
  "invoker-drow|1|rituals category": auto(
    'Shop → Rituals: the three learning categories after the items in the Type select, "Search rituals…", Affordable / Proficient / Filters (no Known chip), Buy / Learn free, a learned ritual Known and disabled.',
  ),
  "invoker-drow|2|shop": auto(
    "The Shop's Type list has Rituals, Alchemical formulas and Martial practices; All items lists no ritual; Ritual Scrolls are under Consumables.",
  ),
  "invoker-drow|3|old links": auto(
    "tab=rituals (with or without a category) canonicalizes to the Shop's learning category.",
  ),
  "invoker-drow|4|old links": auto(
    "tab=equipment&section=practices canonicalizes to the Shop's Rituals category.",
  ),
  "invoker-drow|5|printed reference pages": auto(
    'Granted ritual entries show "Granted by: Invoker".',
  ),
  "invoker-drow|6|on-screen sheet": auto(
    '"Rituals & practices" renders the learned references as panel item cards.',
  ),
  "invoker-drow|7|builder deity card": auto(
    'Avandra\'s card: "Domains: …" above the description, domain cards below.',
  ),
  "invoker-drow|7|other detail stacks": auto(
    "Lolth's stack lists her domain cards.",
  ),
  "invoker-drow|8|awaken god fragment": auto(
    "The feat and its fragment choice; the fragment's Encounter power card (Free action, keyword band) among the encounter powers.",
  ),
  "invoker-drow|9|equipment and shop item detail": auto(
    "The Scarf of Reconciliation's detail pane has an Item Set panel card.",
  ),
  "invoker-drow|9|party pieces field": auto(
    "Entering a count marks unlocked benefits active and changes totals; clearing returns to blank with nothing dimmed; -1 and 1.5 are rejected with the changed hint.",
  ),
  "invoker-drow|9|rose scythe of chauntea": auto(
    "The Rose Scythe's implement bonus applies to invoker implement attacks (compared with it unequipped).",
  ),
  "invoker-drow|10|superior implements": auto(
    "An accurate symbol's Shop detail pane renders the item card.",
  ),
  "invoker-drow|10|equipment and shop item detail": auto(
    "A Caelynnvala's Boons piece in the Shop has the Item Set panel card and the Party pieces field.",
  ),
  "invoker-drow|11|printed deity entry": auto(
    "Avandra's entry follows Background, with the church icon, a Domains line, then the description with its bullets.",
  ),
  "invoker-drow|11|awaken god fragment": auto(
    'Reference entry with a "Constant Benefits:" line; the fragment\'s Encounter power card among the encounter powers.',
  ),
  "invoker-drow|11|familiar card": auto(
    'The "Spiderling of Lolth" card is printed after Skills.',
  ),
  "invoker-drow|11|item set card": auto(
    'Caelynnvala\'s Boons card after its last item card with the "Group pieces" label and its note.',
  ),
  "invoker-drow|11|printed group-set card": auto(
    'Unset: "Party pieces" with a blank line, full-strength benefits; with a count: the count and locked benefits dimmed.',
  ),
  "invoker-drow|11|rose scythe of chauntea": auto(
    "The implement bonus shows in the printed implement attack lines.",
  ),
  "invoker-drow|11|summoned creature card (d111)": auto(
    'A "Blade Angel" creature card in the companions run with the "Summoned creature" type bar, Medium blade angel, HP your bloodied value, AC your AC + 4, speed 6, fly 6 (hover), its Minor Action and Opportunity Attack commands with personalized modifiers; Summon Blade Angel keeps its Effect and drops the commands.',
  ),
  "invoker-drow|13|summoned creature in power detail (d111)": auto(
    "Summon Blade Angel's detail pane has a creature panel card with its commands; the power card above it has none.",
  ),
  "invoker-drow|12|awaken god fragment": auto(
    "The fragment's Encounter power card is on the on-screen sheet.",
  ),
  // Githzerai arena fighter
  "fighter-arena|0|equipment and shop item detail": auto(
    "The Clear-Blood Baldric's detail pane has an Item Set panel card.",
  ),
  "fighter-arena|0|mount creature card in item detail (d110)": auto(
    "The Silver Dragon Steed's detail pane has a creature panel card with its owner-relative HP, Bite and New Vigor.",
  ),
  "fighter-arena|1|mount creature cards (d110)": auto(
    'Warhorse and Silver Dragon Steed creature cards after Skills: identity, defense and HP tiles, Kick, Charger, load table, no alignment; the steed\'s owner-relative HP, AC, Bite and Breath Weapon; a split puts the stats card then the "— Actions" card; the item cards keep load and drop the repeated block.',
  ),
  "fighter-arena|1|arena training applied, not reminded": auto(
    "No Arena Training reminder or candidate; AC carries Arena Training's applied +2 (level 11, hide armor); the Unarmed Melee Basic Attack row gets its +2 proficiency bonus and a 1d8 die.",
  ),
  "fighter-arena|1|spear expertise [arena fighter]": auto(
    "Charging damage with a spear uses the lower heroic/paragon value.",
  ),
  "fighter-arena|1|githzerai blade master with an arena glaive": auto(
    "+2 arena damage on the glaive rows.",
  ),
  "fighter-arena|1|numbers": auto(
    "Aleheart (2 pieces): +2 Dungeoneering and Endurance.",
  ),
  "fighter-arena|1|item set card": auto(
    'Aleheart\'s card after its last item card: Pieces/Tier row, "(active)" and the check icon on the 2-piece benefit, the 4-piece one marked inactive, no set introduction.',
  ),
  // Runepriest
  "runepriest-scholar|0|scholar (hybrid sentinel/shaman etc.)": auto(
    "A Draconic/Dwarven/Elven choice at level 5 when one is missing.",
  ),
  "runepriest-scholar|1|scholar (hybrid sentinel/shaman etc.)": auto(
    "No such language choice from level 10.",
  ),
  "runepriest-scholar|2|serene blade runepriest": auto(
    'Proficiencies reads "military heavy blades".',
  ),
  "runepriest-scholar|2|sub-choices on reminder rows": auto(
    'The page-1 reminder reads "Level 5 Scholar Feature: Dungeoneering" and the reference heading "Scholar Feature: Dungeoneering" (a skill has no card or entry of its own).',
  ),
  // Monk
  "monk|0|older native characters": auto(
    "Opening the character gives the missing gifts (the app's first-open gift command).",
  ),
  "monk|1|a free item appears": auto(
    "After the gifts, the monk's Unarmed Strike is equipped in the off-hand.",
  ),
  // General: library
  "general|0|pane band": auto(
    'Role lines ("Divine Defender"-style, hybrids "X / Y") for the review characters.',
  ),
  "general|0|empty trash confirmation": auto(
    "The singular wording with one character.",
  ),
  // General: free items
  "general|1|undo and remove": auto(
    "Picking Wizard gives the Spellbook; without the pick nothing is given; one Undo takes back an edit and the gift amended into it; removing the Spellbook keeps it gone (its marker).",
  ),
  "general|1|a free item appears": auto(
    "Student of Sword Magic, a hexblade's pact weapon, an executioner's poison, Harper Agent's Harper Pin and the Trap-Making Kit each give their item.",
  ),
  // Added with the 2026-10-29 checklist pare-down.
  "beatrix|3|pact weapon named by its artifact": auto(
    'The pact weapon reads "Sword of the White Well" in Inventory and the loadout, on its item card and on weapon power rows; the rod keeps "Accurate rod of the Feywild +2".',
  ),
  "beatrix|4|print play data card": auto(
    "The Play data card's identity, 3 × 2 abilities, defenses, hit points, initiative, speed, passives and senses.",
  ),
  "hexblade-white-well|2|paired attack and damage effects": auto(
    "Melee Basic Attack has one Back to the Wall line for attack and damage, under Additional effects.",
  ),
  "sentinel-bear|2|listed picks left off reminder rows": auto(
    "The Druid Wilderness Knacks reminder names no knack (each has its own reference entry), on the printed page 1 too.",
  ),
  "sentinel-bear|2|reference heading drops listed picks": auto(
    'The reference heading reads "Druid Wilderness Knacks"; Beast Empathy and Mountain Guide have entries of their own.',
  ),
  "sentinel-bear|2|paired attack and damage effects": auto(
    "Melee Basic Attack has one Back to the Wall line for attack and damage, under Additional effects.",
  ),
  "executioner-fighter|6|paired attack and damage effects": auto(
    "Press of Steel has one paired Back to the Wall line; Bull Rush Attack keeps the attack-only line.",
  ),
  "executioner-fighter|6|situational requirements keep weapon rows (d093)":
    auto(
      "Press of Steel without a shield keeps its Requirement, Rapier +19 2d8+3 and Unarmed +16 2d4+3 rows, and Back to the Wall.",
    ),
  "hystan|0|class block in the card type bar": auto(
    'Type bars end "Ranger · Level 1" (Twin Strike), "Diplomacy · Level 2" (Master Diplomat), "Athletics · …" (Mighty Sprint); a basic attack shows no class.',
  ),
  "hu|2|holy symbol slot": auto(
    "Symbol of Hope +1 is in both Main hand and the Holy symbol slot.",
  ),
  "beldin|0|uses per encounter on power cards": auto(
    'Ardent Surge\'s type bar reads "Encounter (2×)" with its class block and no "(Special)".',
  ),
  "flint|0|feature notes follow legacy (`_cs_shortdescription`)": auto(
    'Enchantment and Pyromancy Apprentice listed; no "Level N Mage … Powers", Mage Cantrips or Mage\'s Spellbook rows; Magic Missile still a card.',
  ),
  "invoker-drow|9|augments attach/detach": auto(
    'A Siberys Shard of Merciless Cold (heroic tier) bought and attached to the Rose Scythe: the scythe reads "Augment: …" and the shard "Attached to …"; an augment can attach only to owned magic weapons or staffs.',
  ),
  "raidon|0|class block in the card type bar": auto(
    'Destined for Greatness ends "Adroit Explorer · Level 12" (a paragon utility); no class ID in any type bar.',
  ),
  "raidon|0|separators drop at a wrapped line's start": auto(
    'Destined for Greatness\'s "Adroit Explorer · Level 12" is one DotList (its "·" is CSS, dropped where "Level 12" wraps to a line start), and no printed type bar or item footer carries a literal "·".',
  ),
  "raidon|0|monk movement technique on the discipline card": auto(
    'Five Storms and Dragon\'s Tail carry the "Movement Technique · Move Action" band after the attack, the free space and any weapon table (additional effects last); no separate technique card.',
  ),
  "jim|0|spellbook subtitle": auto(
    'Expeditious Retreat and Freezing Cloud carry the "Spellbook" subtitle; Sleep does not.',
  ),
  "jim|0|spellbook reference heading": auto(
    'The Spellbook reference heading reads "Spellbook", naming none of its spells (they are power cards).',
  ),
  "sylestine|0|associate card (d107)": auto(
    "The Trained Blink Dog card after Skills and the familiar: its type, bar, defenses, HP, speed, aura, Blinking Bite; no power card for it; page 1 reminders as specified.",
  ),
  "sylestine|1|imported hybrid talent stays editable": auto(
    "Hybrid Talent's step offers and has Bard Armor Proficiency picked, with other options.",
  ),
  "dv|0|hybrid slots alternate classes; order adept utilities": auto(
    "The second at-will slot marks Warlock at-wills with the hybrid reason sentence; Swordmage at-wills available; Levitate available at level 6.",
  ),
  "dv|1|wrist razors on the arms (d101)": auto(
    "DV's loadout has the wrist razors in Arms and the longsword in Main hand.",
  ),
  "sylestine|1|hybrid talent's open choice wording": auto(
    "The Build tab heads the feat's feature choice “Hybrid Talent”; opened, its issue is “Level 4 Hybrid Talent” — “Choose an option for Hybrid Talent.”",
  ),
  "sylestine|1|hybrid talent's review lands on its choice": auto(
    "Left open, the “Level 4 Hybrid Talent” issue targets step 2 of the feat's flow (its choice ID) on the Feats tab; Review's first landing id is that step's section, which the flow renders with tabindex -1.",
  ),
  "zilvra|0|armor of resistance's damage type from the equipment tab": auto(
    'The "Leather Armor of Resistance +2: Resistance Type" issue reviews to the Equipment tab.',
  ),
  "zilvra|1|user edit named in house rules": auto(
    'The House rules row reads "Level 7 manual edits"; no raw ID title.',
  ),
  "trey|0|holy symbol slot": auto(
    "Beacon of Erathis +1 is in the Holy symbol slot.",
  ),
  "trey|1|holy symbol slot": auto(
    "Abjure Undead, Radiant Vengeance and Divine Rage have Beacon of Erathis +1 rows.",
  ),
  "natan|0|play data defenses line": auto(
    'The Play data card\'s one Defenses line reads "Resist 11 necrotic, 11 radiant; conditional defenses in Conditional modifiers"; page 1\'s Conditional modifiers pane has the three "… to all defenses …" rows; no reminder repeats them.',
  ),
  "natan|0|militant dawn not reminded": auto(
    "No Militant Dawn reminder candidate or printed reminder: Natan's Charisma modifier is not positive (D112).",
  ),
  "sample-beatrix|0|wallet at a lowered level": auto(
    'Carried money reads "1 pp; 48 gp", not 37 pp.',
  ),
  "copy-of-character|0|wallet at a lowered level": auto(
    'Carried money reads "786 gp".',
  ),
  "general|2|masterwork armor needs an enchantment": auto(
    "Feyleather Armor is blocked with the masterwork tooltip without Inherent Bonuses and allowed with it.",
  ),
  "general|2|weapon enchantment pairing": auto(
    "Warsoul lists one-handed melee bases (Longsword, Accurate dagger); Reckless lists no reach weapon.",
  ),
  "general|2|superior implements under implement enchantments": auto(
    "Lifedrinker lists under implement enchantments with Accurate staff and Accurate dagger bases.",
  ),
  "general|2|no shields for any armor": auto(
    "Delver's bases are armors only: no shields or barding.",
  ),
  "general|2|artifacts come with their weapon": auto(
    "Spear of the Skylord has one base, a Longspear (no picker).",
  ),
  "general|2|arrows fold into a package": auto(
    "Arrows once and Arrow five times make one Arrows row of 35, sold one arrow (4 cp) at a time.",
  ),
  "general|2|secret formularies halves ritual prices": auto(
    "Ritual cost is 100% without the feat and 50% with Secret Formularies.",
  ),
  "general|2|starting gold": auto("A new native character carries 100 gp."),
  "general|2|item choices named from their options": auto(
    "Armor of Adaptable Resistance +1's choice reads “Choose a damage type” and Harper Pin (heroic tier)'s “Choose a power” (Shop pages and Equipment menu wording).",
  ),
  "general|2|theme-power reason": auto(
    "The theme-power restriction's reason sentence.",
  ),
  // Added with the 2026-11-04 checklist compression.
  "psion-thought-warrior|1|free rituals block": auto(
    '"Free rituals (Psion)", then only "1 free 1st-level ritual" (Sending or Tenser\'s Floating Disk is a Build-tab choice, D115); no rule sentence.',
  ),
  "psion-thought-warrior|1|known groups": auto(
    "The Inventory keeps its Item, Quantity and actions columns; a known group only for a kind the psion knows.",
  ),
  "psion-thought-warrior|1|chosen ritual": auto(
    'Tenser\'s Floating Disk is listed once, "Chosen for Psion", uses no free-ritual allowance, and reads Known in the Shop with Buy disabled.',
  ),
  "psion-thought-warrior|2|psion ritual choice (d115)": auto(
    "The level-1 Ritual choice offers Sending and Tenser's Floating Disk, Tenser's Floating Disk chosen; the folded Class row ends \"Ritual: Tenser's Floating Disk\", and no Other row lists it.",
  ),
  "psion-thought-warrior|0|shared implement table (d111)": auto(
    "Thought Warrior: the commands, then one uncaptioned table (no line naming the commands) with one row per implement (orb +1, staff +3, Unarmed), each printed once.",
  ),
  "lily|0|skald training swaps majestic word on its own": auto(
    "The level-4 replacement gives up Majestic Word and is filled with Skald's Aura, with no issue; Skald's Aura prints, Majestic Word does not.",
  ),
  "lily|1|retraining drops class-feature feats and swap gains": auto(
    "Ritual Caster (held under Bardic Training) is not a retraining target; other targets remain.",
  ),
  "raidon|1|retraining drops class-feature feats and swap gains": auto(
    "Plaguefire Body (the Student of the Plague swap's gain) is not a retraining target; other targets remain.",
  ),
};
