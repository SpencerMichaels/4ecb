# Visual review checklist

Owner's pending visual checks for work done in the 2026-10-20/21 coverage and
parity sessions. The owner reviews them together at the end, so new items are
appended as agents finish. Tick items off, or turn them into follow-up issues.

## How to use this list

Each item says:

- **Where:** the character, the page or tab, the level, and what to click.
- **Expect:** what you should see when it's right: exact labels, order, rough
  counts, colours and sizes.
- **Wrong if:** the failure signs to look for.
- **Decide:** (some items) a judgement call for you, not a pass/fail check.

**Test characters.** Run `pnpm review:build` (needs the private pack
`tmp/content/full-local.4ecp`), then in the app:

1. Settings → Content → **Import content pack…** and pick
   `tmp/visual-review/review-content.4ecp`.
2. Settings → Backups & storage → **Restore backup**, pick
   `tmp/visual-review/review-characters.4ecb`. Use Restore, not the library's
   Import, so the IDs stay fixed.

`tmp/visual-review/index-visual.html` links each item to its page. The
characters are named "Review – …" and have the ID `visual-review-<slug>`. In
this list, a path such as `beatrix` → `edit?tab=build&level=1&section=class`
means `#/characters/visual-review-beatrix/edit?tab=build&level=1&section=class`,
`beatrix` → `?preview=1` is its print preview, and `beatrix` → `sheet` is
`#/characters/visual-review-beatrix`. The slugs are:

- `beatrix`: Beatrix, revenant hexblade 8 (Fey Pact of the White Well, Luskan,
  Sehanine), imported from `scratch/bisect2/Beatrix.dnd4e`.
- `hexblade-white-well`: human White Well hexblade 25 with Legendary Hexblade.
- `hystan`, `hu`, `piri`: the samples `sample-chars/Hystan.dnd4e` (half-elf
  ranger 8), `Hu Sheng-Ming Level 8.dnd4e` (avenger, six backgrounds; not
  legal as imported) and `Piri.dnd4e` (shifter druid 7).
- `ranger-beast`: Beast Mastery ranger 11 with a wolf named Ash.
- `sentinel-bear`: elf sentinel druid 25 (Steadfast Sentinel, Demigod) with a
  bear named Bruin.
- `wizard-gnome`: gnome wizard 5, Order Adept theme.
- `warlock-fey`: elf fey warlock 11, Feytouched, Arcane Wisp familiar.
- `executioner-fighter`: hybrid executioner/fighter 27 with Assassin's Strike
  (Hybrid), a bola and a rapier.
- `executioner-rogue`: dwarf hybrid executioner/rogue 7, deliberately not
  legal (Warsoul Weapon, house-ruled Throw Grapple).
- `artificer-ardent`: hybrid artificer/ardent 11 with a Sprite familiar.
- `invoker-drow`: drow invoker 11 of Avandra, Widow of Arach-Tinilith theme,
  Awaken God Fragment, Rose Scythe of Chauntea, two Caelynnvala's Boons
  pieces.
- `fighter-arena`: githzerai arena fighter 11 with a glaive, a spear and two
  Aleheart Companions' Gear pieces.
- `runepriest-scholar`: human runepriest 10, Serene Blade, Scholar theme, plus
  the "Update waiting" and "Missing content" copies.
- `monk`: human monk 1, saved without its free items.

Other legacy samples are in `sample-chars/*.dnd4e` and `scratch/**/*.dnd4e`
(import them from the library). Chopper Farlund is a fighter with Two-handed
Weapon Talent, and Alysa Redfield a hybrid fighter/warlord.

Builder tabs, left to right: Build, Details, Loadout, Inventory (route
`tab=equipment`), Shop, Rituals, Retraining. The print preview runs page 1
("Character Summary" footer), Scratchpad, the Character Reference pages, the
card pages ("Power & Item Cards", nine cards each: Play data, Skills, then any
beast or familiar, Action Point, Second Wind, powers, items) and Session Notes.
The theme is Settings → Display → Color theme; Hide flavortext is under
Settings → Builder & Equipment.

## Builder detail panes

- [ ] **Trait package benefits.**
  - **Where:** `beatrix` → `edit?tab=build&level=1&section=class`. Open the Pact
    Choice row and click Fey Pact of the White Well so the right-hand detail
    pane shows it.
  - **Expect:** the pact's own card first. Below it, fold-out level sections:
    "Level 1 · 3 features, 3 powers", "Level 7 · 1 feature, 1 power", "Level 9 ·
    1 feature, 3 powers", "Legendary Hexblade (Levels 11–20) · 6 features, 4
    powers", "Valiant Hexblade (Levels 11–20) · 6 features, 4 powers" and "Level
    25 · 1 feature, 5 powers". Only Level 1 is open. In order, it holds Fey Pact
    of the White Well Boon, Soul Step, Fey Pact of the White Well Reward, Fey
    Pact of the White Well Weapon, Moonfire Blade and Well of Light. Each power
    card has a small grey uppercase "Granted power" under its title. With every
    section open there are 38 cards (20 of them granted powers), about 0.75rem
    apart.
  - **Wrong if:** the benefits only appear inside the Hexblade class card, whose
    Class features should list just the generic Pact Boon, Pact Reward and Pact
    Weapon. Also wrong: a granted power above the feature that grants it, or a
    power card without the "Granted power" label.
  - **Decide:** a power under a sub-feature (Soul Step under the Boon) looks
    like a sibling of it. Would indenting, or a "from …Boon" label, help? Is the
    0.75rem gap right?
- [ ] **Other detail stacks.**
  - **Where:** each is a separate pane. Feytouched: `warlock-fey` →
    `edit?tab=build&level=11`, Paragon path row. Legendary Hexblade:
    `hexblade-white-well` → `edit?tab=build&level=11`, Paragon path row.
    Archmage: `sentinel-bear` → `edit?tab=build&level=21`, Epic destiny row
    (it's unavailable to a druid; that's fine). Alchemist: `wizard-gnome` →
    `edit?tab=build&level=1&section=theme`. Avandra, then Lolth: `invoker-drow`
    → `edit?tab=details`, Deity.
  - **Expect:** Feytouched: Level 11 open (Slashing Wake, Feytouched Action,
    Will of the Feywild), then folded Level 12, 16 and 20. Legendary Hexblade:
    26 cards, six features each followed by the curse, invocation or
    transformation it grants. Archmage: Level 21 (Spell Recall), then 24, 26
    (Shape Magic) and 30. Alchemist: Level 1 open, with Level 1 Alchemist
    Feature and the Alchemist feat ("Granted feat"), then folded Level 2, 5, 6
    and 10 (Aqua Regia, Alchemist's Escape, Goblin Oil). Avandra: her card, then
    the domain cards Change, Freedom and Luck. Lolth: Darkness and Trickery.
  - **Wrong if:** a card is missing, appears twice or overlaps another, or a
    section opens empty.
  - Elemental Manifestation (about 26 cards), Commanding Presence (6) and
    Channel Divinity (12 powers) get their stacks only where the feature itself
    is the option. Picking Genasi, Warlord or Cleric in the Race or Class list
    shows the race or class card with these as one-paragraph entries inside it,
    which is expected.
- [ ] **White Well pact summary** in the pact table.
  - **Where:** `beatrix` → `edit?tab=build&level=1&section=class`, the Pact
    Choice row's option table.
  - **Expect:** the Fey Pact of the White Well row's description reads "You have
    the Fey pact of the White Well."
  - **Wrong if:** it shows the long flavor text ("You have sought out the Lady
    of the White Well…"), or nothing.
- [ ] **Superior implements** (e.g. accurate symbol) use the item card.
  - **Where:** `beatrix` → `edit?tab=equipment`, click Accurate rod of the
    Feywild +2. Then `invoker-drow` → `edit?tab=shop&category=implements`,
    search "accurate symbol" and click it.
  - **Expect:** an item card with a coloured header, the item's name, its
    enhancement and properties, and a type bar at the bottom, like any other
    magic item.
  - **Wrong if:** a plain text reference card, a power card, or the empty
    "Option Details" box.
- [ ] **Equipment item details:**
  - **Where:** `wizard-gnome` → `edit?tab=shop&category=implements`, search
    "Hawthorn Wand" and click Hawthorn Wand +2. Then
    `edit?tab=shop&category=special-items` and click The Eye of Vecna.
  - **Expect:** the item card, then one power card per granted power: Altered
    Luck for the wand; Eyebite, Mire the Mind and Eye of the Warlock for the
    Eye.
  - **Wrong if:** only the item card shows, or the powers are listed by name
    without cards.
- [ ] **Revenant "Past life"** choice appears under Race, not Other.
  - **Where:** `beatrix` → `edit?tab=build&level=1&section=race`.
  - **Expect:** a "Past life" row in the Race section, picked as Eladrin.
  - **Wrong if:** the row sits in an Other section, or is unpicked.
- [ ] **Familiar choice:**
  - **Where:** `warlock-fey` → `edit?tab=build&level=11&section=feats`, Arcane
    Familiar's familiar row (Arcane Wisp). Check it in light and in dark theme.
    `artificer-ardent` (Sprite, taken at level 2) works the same way.
  - **Expect:** the same card as in print: paw-print icon and "Arcane Wisp",
    "Tiny familiar · Paragon Tier", Defenses AC 18 Fort 19 Ref 19 Will 21, HP 1,
    Speed "fly 8 (hover)", an italic rules line, Constant and Active benefits,
    an italic description, and a "Familiar" type bar. Light theme: white card.
    Dark theme: dark navy card with light text. The print preview stays white
    either way.
  - **Wrong if:** a plain text reference card shows, or the card stays white in
    dark theme.
  - **Decide:** in dark theme the header turns the generic dark green panel
    colour instead of the teal used in print. Keep it, or keep teal?
- [ ] **Multi-card detail stacks**
  - **Where:** stacks: the White Well pact (Trait package benefits above),
    `invoker-drow` → `edit?tab=equipment` → Scarf of Reconciliation +2 (item
    card plus Item set card), and the Eye of Vecna (Equipment item details
    above). A lone card: `beatrix` → `edit?tab=build&level=1&section=powers` →
    Crown of Stars.
  - **Expect:** in a stack, short cards such as Soul Step end just below their
    text. The lone Crown of Stars card keeps the printed card's shape, about 1.4
    times as tall as wide, even if that leaves space under the text.
  - **Wrong if:** stacked short cards have a large empty bottom, or the lone
    card shrinks to its text. Class, race, theme, background and deity panes are
    35% wider and always fit their content; that's expected.
- [ ] **Benefits by level** (pacts, themes, paragon paths, epic destinies).
  - **Where:** the White Well pact pane (Trait package benefits above). Then
    `hexblade-white-well` → `edit?tab=build&level=1&section=class`, same pact.
    And the Feytouched, Alchemist and Archmage panes (Other detail stacks).
    Repeat in dark theme and at 140% zoom.
  - **Expect:** each heading has a chevron, a bold title ("Level 9") and a grey
    count ("· 1 feature, 3 powers"). A folded section lists its benefit names as
    bullets (Level 7: White Well Pact Weapon Retribution; Level 9: Summon
    Warlock's Ally (White Well)). Clicking anywhere on the heading, or Enter or
    Space when it has focus, opens it: the chevron turns down, the bullets go,
    and the cards appear. Path sections have small grey uppercase subheadings:
    Level 11, Level 12, Level 16, Level 20. On `hexblade-white-well`, which took
    Legendary Hexblade, only that path's section remains. Sections open up to
    the Build tab's viewed level, so the pact (a level-1 choice) opens only
    Level 1, while a paragon path viewed at 11 opens Level 11.
  - **Wrong if:** bullets remain after opening, a click on the count or a bullet
    does nothing, headings clip or overlap at 140%, the focus ring is invisible
    in dark theme, or the Valiant section shows on the Legendary character.
- [ ] **Class detail card**
  - **Where:** `beatrix` → `edit?tab=build&level=1&section=class`, Class row,
    click Hexblade, then Paladin.
  - **Expect:** one paragraph under the name: bold "Arcane Striker." followed by
    normal-weight "You wield a deadly weapon forged with magic, …". Paladin:
    bold "Divine Defender." then "A holy warrior …". In the traits grid: HP at
    1st, HP per level, Healing surges, Defenses, Key abilities ("Charisma,
    Dexterity, Constitution, Intelligence"), Armor and so on. Below the grid,
    "About Hexblade" comes before the "Class features" list. Race and
    background descriptions are also normal weight.
  - **Wrong if:** the whole paragraph is bold, the heading sits on its own line,
    Key abilities is missing, doubled, or not just above Armor, or the Class
    features list comes before About.
- [ ] **Summoned allies**
  - **Where:** `hexblade-white-well` → `?preview=1`, the first card page:
    Mourning Handmaiden's Attack (7th card), Spectral Protector's Attack (8th)
    and Spectral Protector's Opportunity (10th).
  - **Expect:** attack lines "Level+5 vs Ref" for the Handmaiden and "Level+5 vs
    Will" for the Protector. Each weapon table has one row: Unarmed, +30, 2d8+21
    (Handmaiden); Unarmed, +30, 2d12+21 (Protector's Attack); Unarmed, +30, —
    (Opportunity, which deals a flat 5).
  - **Wrong if:** "UNKNOWN" on any of the 37 cards or the pages, "— vs …", or
    +55 (the bonus counted twice).
  - **Decide:** the row is labelled "Unarmed", and your own Back to the Wall
    line appears under Additional effects. Fine for a summoned ally? (Legacy
    CharTracker just prints the native engine's conditions for each power, so
    the recovered viewer code doesn't settle it.)
- [ ] **Paired attack and damage effects**
  - **Where:** `executioner-fighter` → `?preview=1`, the Driving Attack card;
    `hexblade-white-well` and `sentinel-bear` → `?preview=1`, Melee Basic
    Attack; the same cards in the Build tab's detail pane.
  - **Expect:** one line under Additional effects: "Back to the Wall: +1 to
    attack and damage rolls whenever you are adjacent to a wall." The Bull
    Rush Attack card (no damage) keeps "+1 to attack rolls …" alone. A source
    whose two bonuses differ would read "+1 to attack rolls and +2 to damage
    rolls …" on one line.
  - **Wrong if:** Back to the Wall appears twice on a card, or a line from
    another source or with another condition has been folded into it.

## Printed sheet: cards

- [ ] **Familiar card**
  - **Where:** `warlock-fey` → `?preview=1`, first card page, 3rd card. Then
    `artificer-ardent` and `invoker-drow`, same place. Then turn on Hide
    flavortext.
  - **Expect:** Arcane Wisp: AC 18 Fort 19 Ref 19 Will 21, HP 1 and Speed "fly 8
    (hover)" tiles side by side (Speed about three times as wide). Sprite: AC 20
    (Vigorous Familiar's +1 included), Speed "6, fly 6", Senses Low-light
    vision. Spiderling of Lolth: Speed "4, climb 4 (spider climb)". All three
    have the italic rules line starting "A missed attack never damages it.",
    benefit headings in the card colour, and an italic description last. Hide
    flavortext removes only that description.
  - **Wrong if:** text runs past the card's bottom, the text is much smaller
    than the neighbouring cards, a tile overflows, or a "Familiar: …" power card
    appears.
- [ ] **Power weapon rows:**
  - **Where:** `executioner-fighter` → `?preview=1`, the Bola Takedown and
    Coward's Reward cards. `executioner-rogue` → `?preview=1`, the Throw Grapple
    and Hounding Assault cards.
  - **Expect:** Bola Takedown: a single Bola row, no Unarmed. Coward's Reward: a
    single Rapier row (the bola isn't an ordinary melee weapon). Throw Grapple:
    one Unarmed row. Hounding Assault ("a crossbow, a light blade, or a sling"):
    only Warsoul Short sword +1.
  - **Wrong if:** a row for every carried weapon, the bola under Coward's
    Reward, or an empty table. Zadatl Grab, Crescendo Sword and the cleric
    "simple weapon" powers are known open gaps (implementation-status).
- [ ] **Situational requirements keep weapon rows (D093)**
  - **Where:** `executioner-fighter` → `?preview=1`, the Press of Steel card
    (the character has no shield). Also its card in the Build tab's level-9
    detail pane.
  - **Expect:** the card still prints "Requirement: You must be using a
    shield.", and its weapon table has a Rapier row (+19, 2d8+3) and an
    Unarmed row (+16, 2d4+3), with the attack line and under Additional
    effects "Back to the Wall: +1 to attack and damage rolls whenever you are
    adjacent to a wall." Powers that name the attacking weapon still filter:
    Bola Takedown keeps its single Bola row.
  - **Wrong if:** Press of Steel has an empty weapon table or no Additional
    effects, the Requirement line is gone, or a weapon-naming power (Bola
    Takedown, Coward's Reward) gains rows for other weapons.
- [ ] **Assassin's Strike (Hybrid)**
  - **Where:** `executioner-fighter` → `?preview=1`, Assassin's Strike (Hybrid)
    card. `edit?tab=build&level=1&section=powers` → Assassin's Strike (Hybrid).
    Then `edit?tab=build&level=7`, 13, 17, 23 and 27.
  - **Expect:** both cards end with "Additional effects" and "+4d10 extra
    damage." The upgrade row at each level offers exactly one option: "Level 7
    Assassin's Strike Upgrade 1", 13 "… Upgrade 2", 17 "… 3", 23 "… 4", 27 "…
    5". Level 27 is deliberately left unpicked.
  - **Wrong if:** a level offers several upgrades, or the line is missing or
    shows a different dice count.

## Printed sheet: pages

- [ ] **Hybrid characters:**
  - **Where:** `artificer-ardent` → `?preview=1`, page 1 identity block. Then
    `executioner-fighter`.
  - **Expect:** Class "Artificer / Ardent", and "Fighter / Executioner".
  - **Wrong if:** "Hybrid", or only one class.
- [ ] **Proficiencies pane**
  - **Where:** `beatrix` → `?preview=1`, Character Reference pages, after the
    Worn/Held Items and Carried Items panes.
  - **Expect:** "Armor: cloth, leather, hide, chainmail", "Weapons: simple
    melee, military melee, simple ranged, fey pact of the white well weapon",
    "Implements: rod, wand". There's no Shields line because she has none.
  - **Wrong if:** capitalised values, the pane before Carried Items, or an empty
    label.
- [ ] **Sub-choices on feature rows.**
  - **Where:** `beatrix` → `?preview=1`, Character Reference pages (Class
    features, Racial traits). `fighter-arena` → `?preview=1`, page 1 reminders.
    The imported Chopper Farlund sample (Two-handed Weapon Talent) works too.
  - **Expect:** "Pact Choice: Fey Pact of the White Well", "Past life: Eladrin",
    "Daily Power: Crown of Stars" (Level 1), "Utility Power: Ethereal Stride"
    (Level 2), "Daily Power: Crown of Madness" (Level 5), "Utility Power:
    Shadowslip" (Level 6) and "Guardian Feature" (Levels 1 and 5), each with
    its "Level N" tag at the right. The four power rows have no text under the
    heading. A long one wraps onto a second line, clear of the tag. Page 1 of
    the arena fighter has "Arena Training: Arena Weapon (Glaive), Arena Weapon
    (Spear)"; its reference row is "Fighter Talents: Arena Training" with no
    text. `hexblade-white-well` reads the same way ("Utility Power: Charm of
    Hearts").
  - **Wrong if:** the tag overlaps or pushes the text, a heading is cut off with
    "…", or the choice after the colon is missing. A heading repeats its tag
    ("Level 2 …") or Beatrix's class ("Hexblade Utility Power"), or a row
    shows only "You gain one of the following … of your choice." or "Choose
    one of the following fighter talents."
  - **Decide:** "Barbarian Agility" and "Fighter Talents" keep the class name
    because it starts the feature's own name, not a "Level N" slot name. OK?
- [ ] **Background benefit card**
  - **Where:** `hu` → `?preview=1`, Character Reference pages, Background group.
    Then `hystan` and `beatrix`.
  - **Expect:** Hu: Disbeliever, Occupation - Mystic Slayer, Occupation -
    Zealous Slayer, Parentage - Impoverished, Recent Life - Explorer of the
    Ancient and Tomb Robber, then "Background benefit: History class skill" with
    "Benefit: Add History to your list of class skills." Hystan: Martial - Local
    Hero, Occupation - Hunter, then "Background benefit: Diplomacy class skill".
    Beatrix: "Luskan" with no suffix, then "Background benefit: Luskan Benefit"
    (Stealth and Thievery).
  - **Wrong if:** the benefit entry is missing, comes before a background, or
    the heading reads "Luskan: Luskan Benefit".
- [ ] **Granted aliases on feature rows:**
  - **Where:** for `hystan`, `hu` and `beatrix`: `?preview=1` Character
    Reference pages, and `sheet` (the on-screen feature list).
  - **Expect:** "Dual Heritage: counts as Elf, Human" (Hystan), "Battle
    Awareness: Athletics; counts as Fighter" (Hu) and "Fey Pact of the White
    Well Boon: counts as Fey Pact" (Beatrix), the same on both surfaces.
  - **Wrong if:** the alias is missing, or shows on only one surface.
  - **Decide:** does "Athletics; counts as Fighter" read well?

## Builder status

- [ ] **"Already owned" candidates:**
  - **Where:** `wizard-gnome` → `edit?tab=build&level=4&section=feats`, the
    level 4 feat row. Turn on Show illegal options (scales icon), then search
    "Ritual Caster".
  - **Expect:** Distant Advantage, Melee Training and Ritual Caster (taken
    earlier) are listed as unavailable. Clicking one shows "Unavailable" and
    "Already owned" in the detail pane.
  - **Wrong if:** they can be picked normally, or are hidden even with illegal
    options shown.
- [ ] **Essentials power swaps**
  - **Where:** `executioner-fighter` → `edit?tab=build&level=15`, the power
    replacement row; then levels 19, 25 and 27. Also `beatrix` →
    `edit?tab=retraining&level=8`.
  - **Expect:** the row is headed "Swap a daily attack power" at 15, 19 and 25
    and "Swap an encounter attack power" at 27. Folded, it shows the trade:
    "Bristling Defense → Hurricane Strike" (15), "Hurricane Strike → Toppling
    Finish" (19), "Toppling Finish → Hurricane Strike" (25), "Bitter Harvest →
    Coward's Reward" (27). Open, a line reads "At 15th level, replace one of
    your daily attack powers with a new one of level 15 or lower." (the level
    and kind change to match), then step "1 Power to replace", a table of only
    the swapped kind held at that level, with the folded trade's first power
    picked (at 15: Bristling Defense, Driving Attack and Press of Steel; at 19:
    Driving Attack, Press of Steel and Hurricane Strike; at 25: Driving Attack,
    Press of Steel and Toppling Finish; at 27: Assassin's Strike (Hybrid),
    Spinning Sweep, Steel Serpent Strike and Bitter Harvest), then step "2 New
    power": the level's legal powers of that kind and level cap with the
    folded trade's second power picked (Hurricane Strike at 15, Toppling
    Finish at 19). An empty swap shows "Choose the power to replace first."
    until you pick one. A status-badge issue for an empty swap reads "Level 15
    daily attack power swap". Beatrix's Retraining tab lists levels 2–8; a
    level's "Retrain a power" item shows the same two steps.
  - **Wrong if:** the row still reads "Replacement", the help line names the
    wrong level or kind, the first table offers feats, skills or utility
    powers, a pick doesn't stick, a power is listed twice (check Bitter Harvest
    at 27), an open table's picks disagree with the folded trade, step 2 reads
    "No matching powers", or a filled swap still shows as missing in the
    status badges.
- [ ] **Wizard spellbook**
  - **Where:** `wizard-gnome` → `edit?tab=build&level=1&section=spellbook`. Then
    `warlock-fey` → `edit?tab=build&level=1&section=class`, Eldritch Blast's
    ability row.
  - **Expect:** replace Summon Dretch with Summon Dust Devil, switch to another
    tab and back: Summon Dust Devil is still picked, and Thunderstaff and Glib
    Tongue haven't changed. Eldritch Blast offers Charisma and Constitution;
    switching to Constitution and back works.
  - **Wrong if:** a pick reverts, or the Eldritch Blast row is read-only.
- [ ] **Gnome characters** load and evaluate.
  - **Where:** `wizard-gnome` → `edit?tab=build&level=1&section=race`.
  - **Expect:** the builder opens normally with Race Gnome, and the status
    badges show no errors.
  - **Wrong if:** an error screen, an endless loading state, or an error badge.
- [ ] **Scholar (Hybrid Sentinel/Shaman etc.):**
  - **Where:** `runepriest-scholar` → `edit?tab=build&level=5`, then `level=10`.
  - **Expect:** at level 5, a language choice offering Draconic, Dwarven and
    Elven. At level 10, none, and no unresolved language choice anywhere.
  - **Wrong if:** no choice at 5, another one at 10, or other languages offered.
- [ ] **Serene Blade runepriest:**
  - **Where:** `runepriest-scholar` → `?preview=1`, Character Reference pages,
    Proficiencies.
  - **Expect:** "Weapons: simple melee, simple ranged, military heavy blade".
  - **Wrong if:** "military heavy blades", capitalised, or missing.
- [ ] **"Equipped item requirement"**
  - **Where:** `executioner-rogue` → `edit?tab=house-rules`, or click the House
    rules status badge. The dwarf has the Warsoul short sword equipped on
    purpose.
  - **Expect:** an "Equipped item requirement" issue: "Warsoul Weapon +1: You
    must have the living construct racial trait to use this item."
  - **Wrong if:** no issue, or it shows as an error rather than a house rule.

## Rituals tab (known rituals)

- [ ] **The Rituals tab**
  - **Where:** `invoker-drow` → `edit?tab=rituals`.
  - **Expect:** the tab sits between Shop and Retraining, with a book-and-ribbon
    icon. At the top, bold "Free rituals:", then "As an invoker you have been
    given the Hand of Fate ritual, and you are entitled to an additional free
    1st-level ritual…", then a grey "(Invoker)". Under it, "All 1 free ritual
    used". Then a "Known" heading with a small count tag "2", and a "Learn
    rituals" button with a book icon on the right.
  - **Wrong if:** the tab is elsewhere or iconless, the provider is missing, or
    the count tag is wrong.
- [ ] **Groups**
  - **Where:** as above, the Known table.
  - **Expect:** three groups, in order Rituals, Alchemical formulas, Martial
    practices. The empty ones read "No alchemical formulas known." and "No
    martial practices known." in grey italics.
  - **Wrong if:** an empty group is hidden, or the empty text is upright or
    black.
- [ ] **Rows:**
  - **Where:** as above, and `piri` → `edit?tab=rituals`.
  - **Expect:** Hand of Fate: book icon, name, a grey line "Granted by Invoker"
    under the name, then Level 4, Category Divination, Key skill "Religion (no
    check)". Piri's Animal Messenger reads "Granted by Druid".
  - **Wrong if:** the source line is the same colour as the name, or sits in its
    own column.
- [ ] **Remove**
  - **Where:** as above. Restoring the backup undoes a removal.
  - **Expect:** Make Whole (learned) has a trash button. The first click turns
    it solid red with a warning icon (tooltip "Click again to remove"); a second
    click removes it. Hand of Fate (granted) has no button.
  - **Wrong if:** a granted entry has the button, or one click removes.
- [ ] **Learning view:**
  - **Where:** click Learn rituals (`invoker-drow` →
    `edit?tab=rituals&category=rituals`).
  - **Expect:** a back-arrow "Known rituals" button. A Type select with only
    Rituals, Alchemical formulas and Martial practices. A search box reading
    "Search rituals…". Affordable and Known filter chips. A Known column reading
    "Known" on Hand of Fate and Make Whole. Each row has a cart (Buy) and a gift
    (Learn free) button, both disabled on known rows.
  - **Wrong if:** item types appear in the select, or known rows can be bought
    again.
- [ ] **Detail card:**
  - **Where:** the Known list (`invoker-drow` → `edit?tab=rituals`). Click Hand
    of Fate, then reload with nothing selected.
  - **Expect:** Hand of Fate's card has a small grey uppercase subheading
    "Granted by Invoker". With nothing selected, the pane reads "Choose a ritual
    to inspect it…".
  - **Wrong if:** no subheading, or a blank pane.
- [ ] **Shop:**
  - **Where:** `invoker-drow` → `edit?tab=shop&category=items`, the Type select.
    Then pick Consumables and search "Scroll of".
  - **Expect:** All items, Adventuring gear, Ammunition, Armor & shields, Armor
    & shield enchantments, "Companion, familiar & mount", Consumables, Implement
    enchantments, Implements, Special items, Weapons, Weapon enchantments,
    Wondrous items, Worn items. Consumables lists ritual scrolls (e.g. Scroll of
    Aberrant Totemic Link).
  - **Wrong if:** any ritual catalog appears, or the scrolls are gone.
- [ ] **Printed reference pages:** granted entries show "Granted by: X".
  - **Where:** `invoker-drow` → `?preview=1` and `piri` → `?preview=1`, the
    Character Reference pages' ritual entries.
  - **Expect:** Hand of Fate's entry starts "Granted by: Invoker", and Piri's
    Animal Messenger "Granted by: Druid".
  - **Wrong if:** the line is missing or names the wrong source.
- [ ] **On-screen sheet:**
  - **Where:** `invoker-drow` → `sheet`, the "Rituals & practices" section.
  - **Expect:** Hand of Fate and Make Whole as the same item cards the builder
    panes use (dark in dark theme).
  - **Wrong if:** plain text rows, or a different card style.
- [ ] **Old links:**
  - **Where:** paste
    `#/characters/visual-review-invoker-drow/edit?tab=shop&category=rituals`,
    then `…/edit?tab=equipment&section=practices`.
  - **Expect:** the first opens the Rituals learning view (the address becomes
    `?tab=rituals&category=rituals`). The second opens the Rituals Known list
    (`?tab=rituals`).
  - **Wrong if:** either lands on Shop or Inventory, or shows an error.
- [ ] **Free-ritual counter:**
  - **Where:** the Rituals tab of `wizard-gnome`, `piri` and `invoker-drow`.
  - **Expect:** a semi-bold line under each "Free rituals:" paragraph. Wizard:
    "2 free 1st-level rituals and 2 free rituals of level 5 or lower left"
    (Comprehend Language used one). Piri: "1 free 1st-level ritual left".
    Invoker: "All 1 free ritual used".
  - **Wrong if:** the line is missing, the counts differ, or it isn't bolder
    than the text above it.
- [ ] **"Learn X free" dialog**
  - **Where:** a psion: in the library, New, pick the Psion class at level 1.
    Then Rituals → Learn rituals, search "Tenser", and click the gift (Learn
    free) button. Also on `wizard-gnome`, where Learn free on a 1st-level ritual
    should learn it straight away (one allowance, no dialog).
  - **Expect:** a dialog "Learn Tenser's Floating Disk free" with "Use a free
    ritual from" radio buttons, one per allowance, plus "None (a gift)", and
    Cancel and Learn free buttons. Cancel learns nothing. The psion's two
    options read "Psion · 1 free 1st-level ritual left" and "Psion · 1 free
    ritual left: Sending or Tenser's Floating Disk" (the part after "·" in grey).
  - **Wrong if:** the psion learns it without asking, the wizard gets the
    dialog, or two options read the same.
- [ ] **Known-list source line:** "Learned free at level N (Spellbook)".
  - **Where:** `wizard-gnome` → `edit?tab=rituals`.
  - **Expect:** Comprehend Language's grey line reads "Learned free at level 1
    (Spellbook)".
  - **Wrong if:** "Granted", no level, or no provider.

## Character library and trash

Check in light and dark themes and at 140% zoom. Where: `#/characters` with
the review characters restored, unless an item says otherwise.

- [ ] **Header:**
  - **Where:** the top of `#/characters`. For the phone-width labels, narrow the
    window.
  - **Expect:** "4E Character Builder" and the version on the left. On the
    right: New, Import, Trash with a small square-cornered count tag (0 until
    something is trashed), a thin vertical divider, Update, and Settings with a
    gear, each with a one-word label. Update is the app's own update: it shows
    only when a newer version of the app is waiting (on the deployed site after
    a release), not for content. Below 36rem (a window of about 800px at 140%)
    only the icons remain. Turn every pack off in Settings → Content and hover
    New: it looks disabled, with the tooltip "Turn on game content in Settings
    to create a character".
  - **Wrong if:** the labels wrap, the count tag is round or misaligned, or
    New's tooltip doesn't show.
- [ ] **Table:**
  - **Where:** `#/characters`. For the empty state, open the app in a private
    window before restoring anything.
  - **Expect:** an uppercase header row: portrait, Name (bold), Level, Race,
    Class, Edited (grey "today", "yesterday" …). The sorted column has a
    chevron, and a click flips it. Rows are striped and tint on hover. The
    selected row is tinted, with a thick accent bar on its left edge. Portraits
    are about 36px. Hover an Edited cell for a tooltip like "Oct 22, 2026, 3:10
    PM". There's no filter box, so the table's top border lines up with the top
    of the navy pane. An empty library reads "No characters yet." centred inside
    the table.
  - **Wrong if:** a filter box appears, the table's top border sits above or
    below the navy band's top, or the empty text is outside the table.
- [ ] **Keyboard and mouse:**
  - **Where:** `#/characters`. Click any row, then use the keyboard.
  - **Expect:** after clicking a row, Arrow Up and Down move one row, and Home
    and End jump to the first and last, with the pane following each move. Enter
    or a double-click opens the builder. Middle-click on a name opens it in a
    new tab. Sort by Level, select a row, reload: both are kept.
  - **Wrong if:** the page scrolls instead of the selection moving, there's no
    focus ring, or the sort resets on reload.
- [ ] **Pane band:**
  - **Where:** select "Review – Summer Sentinel Druid L25 (Bear)", then "Review
    – Fey Warlock L11", then "Review – Hybrid Executioner/Fighter L27".
  - **Expect:** a navy band. The portrait has a white border and is about a
    third of the pane wide. The name is in the large display font, then the
    identity line (e.g. "Revenant Hexblade 8" for Beatrix). A bold white role
    line: "Primal Leader", "Arcane Striker", and "Martial Defender / Martial and
    Shadow Striker". Then paler small lines: "Paragon path: Steadfast Sentinel"
    and "Epic destiny: Demigod" (sentinel), "Paragon path: Feytouched"
    (warlock), and "Edited today" with the exact-time tooltip. The five action
    buttons close the band, with nothing below it.
  - **Wrong if:** stat tiles or a content-update badge appear, or the lines are
    out of this order.
- [ ] **Action row:**
  - **Where:** `#/characters`, select any character, then use the five buttons
    under the navy band.
  - **Expect:** five equal-width buttons, each an icon over a word, in one row
    at any width (a long word truncates with "…"). Hover lightens a button and
    adds a light-blue bottom line. Export opens a small menu (.4ecb, .dnd4e)
    below the pane, and choosing .dnd4e shows a spinner in the button until the
    download starts. Trash turns its label pink, and the first click turns the
    button dark red, reading "Confirm".
  - **Wrong if:** a button wraps to two lines, the menu is clipped by the pane,
    or Trash deletes on one click.
- [ ] **Role line loading:**
  - **Where:** Duplicate any review character, then select the copy.
  - **Expect:** for a moment, a faint translucent bar about 9rem wide where the
    role line goes, then the role text. The name and other lines don't shift.
    Holding Arrow Down through the table doesn't stall.
  - **Wrong if:** a spinner, the text "Calculating…", lines jumping, or a
    sluggish selection.
- [ ] **Saved role line:**
  - **Where:** open `beatrix` in the builder, change any text (e.g. Details →
    Name), wait about 2 seconds, and go back to `#/characters`.
  - **Expect:** no placeholder bar flashes on that character.
  - **Wrong if:** the placeholder shows before the role.
- [ ] **Role line error:**
  - **Where:** select "Review – Missing content (Runepriest copy)".
  - **Expect:** name, identity and Edited lines but no role line, and all five
    buttons work.
  - **Wrong if:** a placeholder bar stays forever, an error text appears in the
    band, or the buttons are disabled.
- [ ] **Print Play data card:** looks unchanged.
  - **Where:** `beatrix` → `?preview=1`, first card page, 1st card.
  - **Expect:** the name, then "Revenant Hexblade 8". Abilities in a 3 × 2 grid
    (8 STR −1, 13 CON +1, 20 DEX +5, 11 INT +0, 10 WIS +0, 20 CHA +5). Defenses
    AC 24, Fort 18, Ref 22, Will 24. Max HP 60, Bloodied 30, Surges 7, Surge
    HP 15. Init +9, Speed 6, Pass. Insight 16, Pass. Perc. 16. Senses Low-light
    vision. A teal "Play data" type bar.
  - **Wrong if:** a tile overflows, the grid isn't 3 × 2, or the card looks
    different from a recent printout.
- [ ] **Narrow (< 60rem, about a 1344px window at 140% zoom):**
  - **Where:** `#/characters` at 140% zoom, with the window narrowed below about
    1344px.
  - **Expect:** the table is full width with Name, Level and Class, and the navy
    pane sits under it.
  - **Wrong if:** a horizontal scrollbar appears, or the pane overlaps the
    table.
- [ ] **Trash dialog:**
  - **Where:** trash "Review – Update waiting", then "Review – Missing content",
    and click Trash in the header.
  - **Expect:** a dialog titled "Trash (2)". Rows are striped, Missing content
    first (trashed last). Each has a portrait or placeholder, a bold name, and
    "Race Class N · Trashed today" (hover for the exact time), then Restore
    (undo icon) and Delete permanently (trash icon, arming to a warning icon).
    The footer has "Restore puts a character back in the library." on the left
    and a red "Empty trash…" on the right.
  - **Wrong if:** oldest first, the footer items swap sides or wrap, or Empty
    trash… is enabled with nothing in the trash.
- [ ] **Empty trash confirmation:**
  - **Where:** restore one of the two, so exactly one is trashed, then click
    Empty trash….
  - **Expect:** an "Empty trash?" dialog over the trash dialog: "Permanently
    delete 1 character? This can't be undone.", with Cancel (focused) and
    "Delete 1 character". With two trashed it reads "Permanently delete 2
    characters?". Esc closes only the confirmation. After deleting, the trash
    reads "The trash is empty." and the header tag reads 0.
  - **Wrong if:** "1 characters", focus on Delete, or Esc closes both dialogs.

## Free items

- [ ] **A free item appears**
  - **Where:** the Inventory tab (`edit?tab=equipment`) and `?preview=1` item
    cards of `beatrix`, `wizard-gnome` and `monk`. For the rest, make a new
    character and take Student of Sword Magic, Elemental Pact (hexblade), the
    Bloodroot Poison Recipe (executioner), the Harper Agent theme, or Trapsmith.
  - **Expect:** Beatrix: Fey Pact of the White Well Weapon (card "Fey Pact of
    the White Well Weapon + Sword of the White Well"). Wizard: Spellbook. Monk:
    Monk Unarmed Strike, equipped in the off-hand. New characters get, in order
    of the picks above: Spellbook, Blade of Chaos, Bloodroot Poison (heroic
    tier), Harper Pin (heroic tier) and Trap-Making Kit. The hybrid
    `executioner-fighter`'s Poison Use (Hybrid) gives no poison.
  - **Wrong if:** an item is missing, doubled, or in the inventory without a
    card.
- [ ] **Undo and Remove:**
  - **Where:** library → New. On Build level 1 pick the Wizard class, check
    Inventory, then click Undo (the curved-arrow icon in the builder header).
    Pick Wizard again and remove the Spellbook in Inventory.
  - **Expect:** a Spellbook appears with the Wizard pick, and one Undo takes
    back both the class and the Spellbook. A removed Spellbook stays gone after
    other edits and a reload.
  - **Wrong if:** Undo leaves the Spellbook, needs two clicks, or a removed
    Spellbook comes back.
- [ ] **Older native characters**
  - **Where:** open "Review – Monk L1 (gifts not yet given)" in the builder,
    then its Inventory tab.
  - **Expect:** Monk Unarmed Strike is there after the first open, once.
    Reopening adds nothing more.
  - **Wrong if:** no item, or a second copy on the next open.

## Conditions fixed (requires scan)

- [ ] **Hybrid executioner without Assassin's Strike (Hybrid):**
  - **Where:** `executioner-rogue` → `edit?tab=build&level=7` (no Assassin's
    Strike). Then `executioner-fighter` → `edit?tab=build&level=7`, click the
    upgrade option.
  - **Expect:** the rogue has no Assassin's Strike upgrade row. On the fighter,
    the option's Prerequisite line starts "Assassin's Strike (Hybrid) Power".
  - **Wrong if:** the rogue gets an upgrade row, or the prerequisite starts with
    something else.
- [ ] **Order Adept with a spellbook**
  - **Where:** `wizard-gnome` → `edit?tab=build&level=5&section=powers`, each
    power row's options. Feature 318 is the wizard's Spellbook.
  - **Expect:** none of the four Order Adept theme powers is offered there.
  - **Wrong if:** any Order Adept power appears among the class power options.
- [ ] **Spear Expertise [Arena Fighter]:**
  - **Where:** `fighter-arena` → `?preview=1`, the Melee Basic Attack card.
  - **Expect:** under Additional effects, "Spear Expertise [Arena Fighter]: +2
    to damage rolls when you are charging." at level 11 (+1 heroic, +3 epic).
  - **Wrong if:** +3 at level 11, or the line is missing.
- [ ] **Githzerai Blade Master with an arena glaive:** +2 arena damage.
  - **Where:** as above, the Glaive row.
  - **Expect:** Glaive, +13, 2d4+7. The +7 includes the feat's +3 at paragon
    tier (+2 heroic, +4 epic), and the Spear row reads 1d8+7.
  - **Wrong if:** the glaive damage is 2d4+4, or no different from the unarmed
    row.
- [ ] **Rose Scythe of Chauntea**
  - **Where:** `invoker-drow` → `?preview=1`, the Avenging Light card.
  - **Expect:** a "Rose Scythe of Chauntea Scythe +2" row reading +13 and
    1d10+8, above an Unarmed row reading +11 and 1d10+6.
  - **Wrong if:** there's no scythe row, or it's no better than Unarmed.

## Beast companion powers

- [ ] **Beast Mastery ranger:**
  - **Where:** `ranger-beast` → `?preview=1`, the Beast Melee Basic Attack and
    Feral Ambush cards.
  - **Expect:** the attack line "Beast +15 vs AC" (the tidied header) and a
    "Beast damage 1d8+2" line. The beast's stat card is now Ash's own card (see
    Beast companion card).
  - **Wrong if:** "BEAST vs AC" without a number, a "Companion: Wolf" power
    card, or a weapon table on Feral Ambush.

## Domains, god fragments, item sets

- [ ] **Builder deity card**
  - **Where:** `invoker-drow` → `edit?tab=details`, Deity section, Avandra.
  - **Expect:** Avandra's card: "Domains: Change, Freedom, Luck", then "The god
    of change, Avandra delights in …". Below the card, the domain cards Change,
    Freedom and Luck.
  - **Wrong if:** the Domains line is below the description or missing, or there
    are no domain cards.
- [ ] **Printed Deity entry**
  - **Where:** `beatrix` → `?preview=1` (Sehanine) and `invoker-drow` →
    `?preview=1` (Avandra), Character Reference pages.
  - **Expect:** a Deity entry with a church icon before the name. Sehanine
    follows the Background group; Avandra follows Theme (the invoker has no
    background). The first line is "Domains: …", then the description, and
    Avandra keeps its bullet list.
  - **Wrong if:** no icon, Domains after the description, or the bullets run
    together as one paragraph.
- [ ] **Awaken God Fragment**
  - **Where:** `invoker-drow` → `edit?tab=build&level=11&section=feats` (the
    feat and its Fragment of Avandra choice), then `?preview=1`, then `sheet`.
  - **Expect:** the reference entry (Feats) has a "Constant Benefits:" line. The
    Fragment of Avandra card has the Free action icon, no keyword line, and
    "Trigger: You use a divine encounter or daily attack power."; it's marked
    Encounter. It prints between Scourge of Heaven and Preserver's Rebuke, and
    also shows in the on-screen Powers grid.
  - **Wrong if:** it sits with the at-wills or dailies, shows an empty keyword
    band, or is missing on screen.
- [ ] **Item Set card**
  - **Where:** `fighter-arena` → `?preview=1`, the last card (Aleheart
    Companions' Gear). Then `invoker-drow` → `?preview=1`, Caelynnvala's Boons.
  - **Expect:** Aleheart, with an orange header, comes right after the
    Clear-Blood Baldric card: a row with Pieces 2 and Tier Heroic, then a check
    icon and "2 pieces (active): You gain a +2 item bonus to Dungeoneering
    checks and Endurance checks." at full strength, and "4 pieces: … resist
    poison …" faded to about 60%. No intro paragraph. Caelynnvala's Boons
    follows Darkfire Gloves: "Party pieces" with a blank write-in line, the
    italic "Counts the set's pieces you and your allies wield.", benefits at
    full strength, and an "Item Set" type bar with a "Group" tag.
  - **Wrong if:** the header isn't orange, the locked benefit isn't faded, an
    intro paragraph appears, or the card is away from its pieces.
- [ ] **Equipment and Shop item detail:**
  - **Where:** `invoker-drow` → `edit?tab=equipment` → Scarf of Reconciliation
    +2. `fighter-arena` → `edit?tab=equipment` → Clear-Blood Baldric (heroic
    tier). `invoker-drow` → `edit?tab=shop&category=implements`, search
    "Bowstring of Accuracy".
  - **Expect:** the item card, then the set's card with a small "Item set"
    subheading: Caelynnvala's Boons, Aleheart Companions' Gear, and for the
    bowstring its set, with the Party pieces field.
  - **Wrong if:** no set card, or the set card comes before the item.
- [ ] **Numbers:**
  - **Where:** `fighter-arena` → `?preview=1`, the Skills card. Then unequip
    Hide Armor of Dwarven Vigor +2 in Inventory.
  - **Expect:** Dungeoneering +10 and Endurance +13 with both pieces; each drops
    by 2 with one piece unequipped.
  - **Wrong if:** no change when a piece is unequipped.
- [ ] **Party pieces field**
  - **Where:** `invoker-drow` → `edit?tab=equipment` → Scarf of Reconciliation
    +2, the Caelynnvala's Boons card. In dark theme, at 140% zoom.
  - **Expect:** under "Item set", a "Party pieces" label beside a small number
    box (about 5 characters wide), with the grey hint "Pieces of this set you
    and your allies wield, yours included. Leave empty if unknown." Enter 3: "3
    pieces" gets the check and "(active)", "5 pieces" fades, and Speed goes up
    by 1. Clear it: blank, nothing faded. Type -1 or 1.5: the value isn't kept,
    and the hint changes to "Enter a whole number of pieces, 0 or more, or leave
    it empty."
  - **Wrong if:** the label and box wrap apart or overflow the card at 140%, or
    the hint is unreadable on the dark card.
- [ ] **Printed group-set card:**
  - **Where:** `invoker-drow` → `?preview=1`, Caelynnvala's Boons. Then set
    Party pieces to 3 (see above) and look again. Compare with Aleheart on
    `fighter-arena`.
  - **Expect:** unset: "Party pieces ____" and both benefits at full strength.
    At 3: "Party pieces 3", "3 pieces (active)" with a check, "5 pieces" faded.
    Aleheart still shows Pieces and Tier.
  - **Wrong if:** a "0" instead of the blank line, or nothing faded at 3.

## Beast companion card

- [ ] **Printed beast card**
  - **Where:** `ranger-beast` → `?preview=1` and `sentinel-bear` → `?preview=1`,
    first card page, 3rd card.
  - **Expect:** Ash: "Ash — Wolf", "Level 11 Medium beast", AC 25 Fort 23 Ref 23
    Will 24, HP 102, Bloodied 51, Surge 25, Surges 2, an ability row, "Speed 7 ·
    Low-light vision", "Bite +15 vs AC · 1d8+2 damage", Trained, Combat
    Advantage, an italic rules line and the description. Bruin: "Bruin — Bear
    Companion", "Level 25", AC 38 Fort 40 Ref 36 Will 40, HP 78, Surges "Yours",
    "Claw +30 vs AC · 2d12+16 damage", and Guardian Companion (Aura 1).
  - **Wrong if:** Bruin's text runs past the bottom or is far smaller than the
    cards beside it.
  - **Decide:** the sentinel also prints "Bear Companion Notes (1)" and "(2)"
    power cards, content powers that repeat the beast card's aura and notes.
    Keep them?
- [ ] **Builder Companion pane:**
  - **Where:** `ranger-beast` → `edit?tab=build&level=1&section=companion`.
    Click the chosen Wolf, then Bear. Also `sentinel-bear`, same path.
  - **Expect:** the same beast card as in print, fluid width: "Ash — Wolf", then
    a Bear preview card. The sentinel's Bruin card shows Str 20, Con 17.
  - **Wrong if:** a plain text reference card shows, or the preview is empty.
- [ ] **Name and Appearance**
  - **Where:** as above.
  - **Expect:** "Name" (Ash) and "Appearance" single-line fields side by side
    under the companion row, laid out like the Details tab's inline fields.
    Renaming updates the card title ("<name> — Wolf").
  - **Wrong if:** the fields overlap the table, or the title doesn't follow the
    name.
  - **Decide:** is a one-line Appearance field enough?
- [ ] **Retraining:**
  - **Where:** `ranger-beast` → `edit?tab=retraining&level=11`.
  - **Expect:** retrain kinds skill, feat, power and companion, the last as
    "Retrain a companion" offering the Wolf. Retrain it into a Bear: the retrain
    table's Kind cell reads "Companion".
  - **Wrong if:** no companion option, or Kind is blank or reads "Power".
- [ ] **Beast power cards:**
  - **Where:** `ranger-beast` → `?preview=1`: Feral Ambush, Beast Melee Basic
    Attack and Distracting Team. `sentinel-bear` → `?preview=1`: Animal Attack
    (Bear).
  - **Expect:** Feral Ambush: "Beast +15 vs AC" and "Beast damage 1d8+2", no
    table. Animal Attack (Bear): "Beast +30 vs AC". Distracting Team keeps a
    table with Attack 1 and Attack 2 columns: Unarmed, +9 → 1d4+4, then +15 →
    2d8+2 for the beast.
  - **Wrong if:** a weapon table on a beast-only power, or Distracting Team
    without its beast cells.

## Detail card spacing

Choice cards in the builder's detail pane (everything but power, item,
familiar and companion cards) now share one vertical rhythm: about 0.6rem
between blocks, 0.25rem under a heading, and no browser-default margins.
`apps/web/src/detail-card-spacing.test.ts` checks this from the CSS; these
items check that it looks right.

- [ ] **Prerequisite line.**
  - **Where:** `beatrix` → `edit?tab=build&level=1&section=class`. Open the Pact
    Choice row and click Fey Pact of the White Well.
  - **Expect:** under the italic flavor text, a thin divider, then one line
    "**Prerequisite:** Hexblade" (bold label, flush left). A gap the same size
    as the one above it, then "You gain the following benefits:" as its own
    paragraph, also flush left. A choice with several prerequisites shows them
    on one line separated by "; " (e.g. an epic destiny's "21st level; fey
    origin").
  - **Wrong if:** a "PREREQUISITES" heading with the value on the line below,
    "You gain the following benefits:" sitting right under "Hexblade" as if it
    were a second prerequisite, or either line indented.
- [ ] **Class feature card fields.**
  - **Where:** as above, the Fey Pact of the White Well Boon card in the open
    Level 1 section (also Reward and Weapon).
  - **Expect:** flavor, divider, "You gain the soul step power." flush left,
    then after a normal gap one line "**Level:** 1". No "DETAILS" heading.
    Other short fields read the same way (a deity's "**Alignment:** Good", a
    feat's "**Tier:** Heroic"); a long prose field puts its label on one line
    and its text just below.
  - **Wrong if:** no space between the description and the fields, "Level" and
    "1" on separate lines, a first line indented, or a big empty gap at the
    bottom of the card.
- [ ] **Paragraph indents.**
  - **Where:** a card with several paragraphs: Fey Pact of the White Well
    Reward, or `wizard-gnome` → `edit?tab=build&level=1&section=theme`, click
    Order Adept, then "More…".
  - **Expect:** the first paragraph, and any paragraph after a heading or list,
    starts flush left; only a paragraph that follows another paragraph has a
    small first-line indent. The theme's "More…"/"Less…" link sits at the left
    under the text, a normal gap below it.
  - **Wrong if:** every paragraph indented, or the More… link stretched across
    the card with its label centred.
  - **Decide:** with a gap between paragraphs, is the continuation indent still
    wanted, or should card paragraphs never indent?
- [ ] **Race, class and background cards.**
  - **Where:** `beatrix` → `edit?tab=build&level=1&section=race`, click
    Revenant; then the class section, click Hexblade, then Cleric (its About
    section has a table); `hu` → `edit?tab=build&level=1&section=background`,
    any background.
  - **Expect:** the same gaps as on the pact card. The divider under the flavor
    text has equal space above and below. Each racial trait or class feature
    name sits just above its text (closer than the gap between traits), as do
    the small lore headings (Playing, Male names…). A table in the text has a
    normal gap above and below.
  - **Wrong if:** a trait name touching its text with no space, a lore heading
    with a large gap above it, or uneven gaps around a divider or table.
- [ ] **Flavor divider on every choice card.**
  - **Where:** any feat, paragon path, theme or class feature card with flavor
    text, e.g. the pact card above.
  - **Expect:** a thin divider between the italic flavor and the rules, as race,
    class and background cards already had.
  - **Decide:** keep the divider on all choice cards, or drop it everywhere?

## Item names

- [ ] **Pact weapon named by its artifact.**
  - **Where:** `beatrix` → `edit?tab=equipment` (Inventory and the main-hand
    loadout slot); then `beatrix` → `?preview=1`, the Melee Basic Attack and
    other weapon power cards and the item card.
  - **Expect:** the pact weapon reads "Sword of the White Well" everywhere,
    as the legacy builder names it. Her rod still reads "Accurate rod of the
    Feywild +2".
  - **Wrong if:** any name with a " + " in it ("Fey Pact of the White Well
    Weapon + Sword of the White Well"), or the base repeated after the name
    ("Sword of the White Well Fey Pact of the White Well Weapon").

## Build-tab folding and pre-scroll

- [ ] **Filled choices arrive folded.**
  - **Where:** `fighter-arena` → `edit?tab=build&level=3&section=powers` (a tab
    with one choice), then with the level picker level 6's Feats and Powers
    tabs, level 1's Class tab and level 1's Powers tab.
  - **Expect:** every table choice on each of these tabs arrives as a closed
    heading showing its pick and a check: "Steel Serpent Strike" at 3, "Melee
    Training" and "Bodyguard's Stance" at 6, the class and each class-feature
    row (the talent and arena-weapon rows) and the four powers at 1. No table
    is open until you click a heading. Open one, go to another level with the
    level picker and come back: the tab is folded again. A tab with an empty
    slot still opens that slot's table on arrival.
  - **Wrong if:** a tab's only choice arrives open as a bare table, any filled
    row arrives open, or a heading you opened is still open when you return.
- [ ] **Opening a filled choice scrolls to its pick.**
  - **Where:** the same tabs: click the folded heading at level 3 Powers
    (Steel Serpent Strike), level 6 Feats (Melee Training) and level 1 Powers
    (Bristling Defense, then Spinning Sweep).
  - **Expect:** the table opens already scrolled so the highlighted pick is
    the first row under the sticky column headers and the type band ("Class"
    for powers): headers, band, pick, then the rows after it. A pick among the
    last rows sits as high as the list allows, with the last row at the
    bottom. A pick in the first few rows leaves the table at the top. Close
    and reopen the same heading: it may stay where you left it or scroll to
    the pick again; either is fine.
  - **Wrong if:** the table opens at the top with the pick hanging at its
    bottom edge, the pick sits behind the band or covers the row after it,
    the table opens one or two rows off, or on a list long enough to page it
    opens on a page without the pick.

## Conditional modifiers (2026-10-23)

These use imported sample characters (`sample-chars/*.dnd4e`). Texts, group
order and which reminders were dropped are verified by tests and a
sample-character diff; check only layout and fit.

- [ ] **Page 1 Conditional modifiers pane.**
  - **Where:** Natan 12 → `?preview=1` (resistances plus three combined
    defense rows), Idon tkare at 6th (Speed and Skills & checks rows),
    Trey Spectre 12 (five rows), Skye (saves only); at 100% and 140% zoom.
  - **Expect:** the right column's first pane is titled "Conditional
    modifiers" with the same Effect/Source table as before: Resistances,
    Immunities, Vulnerabilities, Saving throws rows first, then Defenses,
    Initiative, Speed, Skills & checks, Health, Allies. Striping alternates
    continuously across groups. Long effects ("+1 to all defenses against
    attacks made by bloodied creatures") wrap inside the Effect column; the
    Source column stays readable. Reminders below still fill the remaining
    space and overflow to page 2 with the "N more reminders" caption.
  - **Wrong if:** the pane pushes reminders off the page without a caption,
    rows overlap the footer, the Source column is crushed, or striping breaks
    between groups.
  - **Decide:** whether the groups need visible group labels (they are only
    screen-reader labels now; each row's text names its stat).
- [ ] **Play data card lines.**
  - **Where:** the same characters' Play data card (print preview, cards
    pages): Natan 12, Idon, Piri, Hystan.
  - **Expect:** note lines Defenses, Saves, Resistances…, Other, Initiative,
    Speed, Allies, each only when it has text, at the card's 7pt note size,
    all inside the card.
  - **Wrong if:** the notes overflow the card's bottom edge or clip.
- [ ] **Builder stat-tile tooltips.**
  - **Where:** Hystan → builder, hover the sidebar AC tile; Idon and Piri →
    hover Speed; Natan 12 → hover AC/Fort/Ref/Will. Light and dark mode.
  - **Expect:** the tooltip ends with "Conditional:" and one line per entry,
    "+4 to AC against opportunity attacks you provoke by making a ranged
    attack (Hunter Fighting Style)".
  - **Wrong if:** a tile without conditional entries shows "Conditional:".

## Sheet Edit mode (2026-10-25, D099 phases 0–1, on-paper menus)

Labels, menu semantics (button, right-click, Menu key/Shift+F10, long
press, Escape), saving, page numbering, print omission of hidden things and
"no re-evaluation" are verified by tests; check only layout and feel. Any
character works; Hu (`hu`) has item cards and several reference groups.

- [ ] **Corner menu buttons on the paper.**
  - **Where:** `hu` → `?preview=1`, click **Edit** in the toolbar's "Sheet"
    control; at 100% and 140% browser zoom, light and dark mode.
  - **Expect:** the toolbar shows View | Edit, a **Show hidden** checkbox,
    **Reset sheet to defaults** (greyed while nothing is hidden) and Print.
    Every card has a small white square ⋮ button in its top-right corner,
    and the first page of the scratchpad, each reference group and session
    notes has one in its top-right corner; page 1 has none. Cards keep
    exactly the size and text fit they have in View. View mode shows none of
    these controls.
  - **Wrong if:** a button hides something important on the card (name,
    usage), a card's text size changes between View and Edit, the toolbar
    wraps badly or scrolls sideways at 140%, or the ⋮ is unreadable in dark
    mode.
- [ ] **Menu feel.**
  - **Where:** the same page: click a card's ⋮; right-click elsewhere on a
    card; on a phone or touch screen, long-press a card.
  - **Expect:** a small menu ("Hide card") opens under the button or at the
    pointer, inside the window even near its right/bottom edge, in the app's
    theme colours; the browser's own context menu doesn't appear; scrolling
    or clicking elsewhere closes it; a long press doesn't select text.
  - **Wrong if:** the menu is clipped by the page edge, opens behind the
    toolbar, or a long press also opens the native callout.
- [ ] **Hide, Show hidden, Show again.**
  - **Where:** hide a power, an item and the Play scratchpad from their
    menus; tick **Show hidden**; then Print preview (Ctrl+P) with it ticked.
  - **Expect:** hidden cards vanish and later cards close up 9 per page;
    with **Show hidden** they return in place, dimmed with grey stripes, a
    dashed outline and a dark "Hidden" tag; the scratchpad is a short dimmed
    strip "Hidden · Play scratchpad" with its own ⋮ (**Show section**). The
    browser's print preview never contains hidden cards, the strip or any ⋮.
    Reload: choices persist and **Show hidden** is off again. Reset (click
    twice) restores everything.
  - **Wrong if:** a dimmed card is hard to tell from a shown one, the
    "Hidden" tag covers the card name badly, the strip is unreadable in dark
    mode, or the printout has gaps or wrong page numbers.

## Granted choices in a feat's flow (2026-10-25)

- [ ] **A pick that opens a step scrolls to it.**
  - **Where:** a new hybrid character (e.g. Hybrid Barbarian/Cleric), level
    1, Feats tab, Feat item; double-click Hybrid Talent (expand General if
    needed). Then pick a feature. Also pick Toughness on another character.
  - **Expect:** the page jumps (no animation) so the "2 Class Feature"
    heading sits near the top with a small margin, listing the hybrid
    classes' features; picking the feature doesn't scroll again; Toughness
    doesn't scroll at all. Same at 140% zoom.
  - **Wrong if:** step 2 stays below the feat table, or a pick that opens
    nothing scrolls the page.
- [ ] **Review leads to the step.**
  - **Where:** the same character before picking the feature: the
    unresolved-choices badge → Review on "Level 1 Class Feature".
  - **Expect:** level 1 Feats tab, the Feat item open, the page scrolled to
    "2 Class Feature"; picking a feature clears the issue.
  - **Wrong if:** Review lands on the Class tab, or step 2 is off-screen.
- [ ] **Imported Hybrid Talent stays editable.**
  - **Where:** import `sample-chars/Sylestine.dnd4e`, level 4 → Feats, open
    "Feat: Hybrid Talent, Bard Armor Proficiency".
  - **Expect:** step 2 shows Bard Armor Proficiency selected and changeable.
