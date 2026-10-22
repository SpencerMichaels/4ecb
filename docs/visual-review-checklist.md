# Visual review checklist

Owner's pending visual checks for work done in the 2026-10-20/21 coverage and
parity sessions. The owner reviews them together at the end, so new items are
appended as agents finish. Tick items off, or turn them into follow-up issues.

Good test characters: Beatrix (revenant hexblade, Fey Pact of the White Well,
Luskan background), Hystan and Hu Sheng-Ming (several backgrounds), plus any
wizard, ranger, druid or half-elf.

## Builder detail panes

- [ ] **Trait package benefits.** Selecting a hexblade pact (e.g. Fey Pact of
      the White Well) shows the pact card, then each benefit's card, each
      followed by its powers labelled "Granted power". Check:
  - the long stacks (about 38 cards for the Fey and binder pacts);
  - that a power under a sub-option isn't visually nested under it (would
    indenting or a "from X" label help?);
  - "Granted …" also labelling choice options such as cantrips;
  - the 0.75rem spacing inside the benefits section.
- [ ] **Other detail stacks.** Paragon paths (Feytouched), epic destinies
      (Archmage), themes (Alchemist), deities (Avandra → domain cards), racial
      traits with sub-options (Elemental Manifestation, about 26 cards),
      Commanding Presence, Eye of Vecna. Channel Divinity on its own lists 12
      powers.
- [ ] **White Well pact summary** in the pact table: "You have the Fey pact of
      the White Well."
- [ ] **Superior implements** (e.g. accurate symbol) use the item card.
- [ ] **Equipment item details:** artifacts and wands list the powers they
      grant conditionally.
- [ ] **Revenant "Past life"** choice appears under Race, not Other.
- [ ] **Familiar choice:** the detail pane shows the familiar card (panel
      layout, dark theme on screen).

- [ ] **Multi-card detail stacks** (owner request): in a stack of several
      cards (White Well pact, an item with powers or a set), each card is only
      as tall as its content. A lone detail card keeps the printed
      proportions.

- [ ] **Benefits by level** (pacts, themes, paragon paths, epic destinies):
      e.g. Fey Pact of the White Well viewed at levels 1, 9 and 12.
  - Sections: Level 1, 7, 9, Legendary Hexblade (Levels 11–20), Valiant
    Hexblade (Levels 11–20), Level 25.
  - Toggles read like "Level 9 · 1 feature, 3 powers". While folded they
    show bulleted names; click anywhere or press Enter/Space to expand, and
    the bullets disappear.
  - Path sections use plain Level subheadings. A chosen path leaves only its
    own section.
  - The pact card reads flavor, Prerequisites, then "You gain the following
    benefits:".
  - Also check Alchemist, Feytouched and Archmage.
  - At 140% zoom and in dark theme: headings wrap without clipping, and the
    focus ring is visible.

- [ ] **Class detail card** (e.g. Hexblade on the Class tab): heading line
      "Arcane Striker", and a "Key abilities" row in the class traits grid
      (Charisma, Dexterity, …).

## Printed sheet: cards

- [ ] **Familiar card** after the Skills card (e.g. Sprite with Vigorous
      Familiar: AC +1, speed "6, fly 6"; Arcane Wisp "fly 8 (hover)"; Widow of
      Arach-Tinilith "Spiderling of Lolth"). There should be no "Familiar: X"
      power card. Check fit, the defense, HP and speed tiles, the rules line,
      and Hide flavor text.
- [ ] **Power weapon rows:** powers with a weapon Requirement list only the
      allowed weapons.
  - The 30 named-weapon powers (bola, net, "rapier or short sword", "longsword
    and another melee weapon", …) now have rows.
  - Throw Grapple has a no-weapon row.
  - Coward's Reward lists ordinary melee weapons.

- [ ] **Assassin's Strike (Hybrid)** with upgrades: "Additional effects:
      +Nd10 extra damage." on the printed and panel cards. The Build tab's
      upgrade choices at levels 7/13/17/23/27 each offer one option.

## Printed sheet: pages

- [ ] **Hybrid characters:** the Class identity line reads "Artificer /
      Ardent", not "Hybrid".
- [ ] **Proficiencies pane** on the Character Reference pages after Equipped
      and Inventory: labelled lines (Armor, Shields, Weapons, Implements), in
      lower case.
- [ ] **Sub-choices on feature rows.**
  - Card headings such as "Pact Choice: Fey Pact of the White Well", "Past
    life: Eladrin" and "Level 1 Hexblade Daily Power: Crown of Stars"; check
    wrapping next to the "Level N" tag.
  - Page-1 reminder labels with a choice (a fighter's Fighting Style or Weapon
    Talent shows it better than Beatrix).
- [ ] **Background benefit card** after the background cards: "Background
      benefit: …" with its Benefit text. Hu Sheng-Ming has six backgrounds
      before it; Beatrix's Luskan card no longer has a suffix.
- [ ] **Granted aliases on feature rows:** "Dual Heritage: counts as Elf,
      Human" (Hystan), "Battle Awareness: Athletics; counts as Fighter" (Hu),
      "Fey Pact of the White Well Boon: counts as Fey Pact" (Beatrix). Does
      "; counts as" read well after a choice? Check both the printed and
      on-screen feature lists.

## Builder status

- [ ] **"Already owned" candidates:** a choice no longer offers something the
      character already has; it shows as unavailable with that reason.
- [ ] **Essentials power swaps** (e.g. Hexblade, Binder, Blackguard, DMG2
      companion classes): the required replacement choices can be filled in
      the Build/Retraining replacement editor, and only offer powers of the
      matching kind to lose.
- [ ] **Wizard spellbook** picks stick, and item or default choices (e.g. a
      warlock's Eldritch Blast) can be edited.
- [ ] **Gnome characters** load and evaluate.

- [ ] **Scholar (Hybrid Sentinel/Shaman etc.):** a Draconic/Dwarven/Elven
      choice at level 5 when one is missing; none from level 10.
- [ ] **Serene Blade runepriest:** Proficiencies reads "military heavy
      blade" (the proficiency's own name).
- [ ] **"Equipped item requirement"** house-rule issue: equip a
      living-construct or ki-focus item without qualifying.

## Rituals tab (known rituals)

- [ ] **The Rituals tab** after Shop, with a book-marked icon. At the top, the
      Free rituals text block, with the provider in parentheses. Then "Known
      (N)" and **Learn rituals**.
- [ ] **Groups** Rituals / Alchemical formulas / Martial practices, always
      shown, with italic empty states.
- [ ] **Rows:** a book icon, the name, a muted source line ("Granted by
      Druid"), Level, Category and Key skill.
- [ ] **Remove** (trash icon, armed red state) on learned entries only.
      Granted entries have none.
- [ ] **Learning view:** a "← Known rituals" back button, the Type select
      limited to the three catalogs, a "Search rituals…" placeholder, a Known
      chip and column, and Buy / Learn free buttons.
- [ ] **Detail card:** the source as its subheading, plus the empty-state
      text.
- [ ] **Shop:** the Type list no longer has Rituals, Alchemical formulas or
      Martial practices. Ritual Scrolls are still under Consumables.
- [ ] **Printed reference pages:** granted entries show "Granted by: X".
- [ ] **On-screen sheet:** "Rituals & practices" uses the standard panel item
      cards.
- [ ] **Old links:** Shop ritual links and `section=practices` land on the
      Rituals tab.

- [ ] **Free-ritual counter:** a bold line under each "Free rituals:" text,
      e.g. "3 free 1st-level rituals and 2 free rituals of level 5 or lower
      left" (wizard at level 5), or "All … used".
- [ ] **"Learn X free" dialog** when several allowances fit (e.g. a psion
      learning Tenser's Floating Disk): choose a pool, "None (a gift)" or
      Cancel.
- [ ] **Known-list source line:** "Learned free at level N (Spellbook)".

## Character library and trash

Check in light and dark themes and at 140% zoom.

- [ ] **Header:** New, Import, Trash plus a count tag, divider, Update (only
      when an update is waiting), Settings (gear), each with a one-word
      label. Labels collapse to icons at phone width. New's disabled
      tooltip gives the reason.
- [ ] **Table:** uppercase header, sort chevrons, striped rows, hover tint,
      selected row tint with the accent bar, 2.25rem portraits, and the
      Edited tooltip with the exact time. No filter box: the table's top
      edge lines up with the top of the pane's navy band. An empty library
      shows "No characters yet." inside the table.
- [ ] **Keyboard and mouse:** Arrow Up/Down and Home/End move the selection
      with a visible focus ring. Enter and double-click open the builder,
      and middle-click on a name opens a new tab. The sort and selection
      survive a reload.
- [ ] **Pane band:** portrait size, name font, identity line, role line
      ("Divine Defender", hybrids "X / Y"), paragon and epic lines, Edited
      tooltip. The pane is just the band: nothing below it, and no
      content-update indicator in the pane or the table.
- [ ] **Action row:** five equal buttons (Edit, Sheet, Export, Duplicate,
      Trash) that never wrap, with hover and focus states. The Export menu
      hangs below the sticky pane, with its spinner during a .dnd4e export.
      Trash arms to a red "Confirm".
- [ ] **Role line loading:** import a .dnd4e (or Duplicate a character) and
      select it. The role line shows a placeholder bar, then fills in;
      nothing else in the band moves. Arrowing quickly through rows stays
      responsive.
- [ ] **Saved role line:** edit a character in the builder, wait about 2s,
      return to the library. Its role line appears immediately.
- [ ] **Role line error:** a character whose content isn't installed shows no
      role line (and no placeholder), and the rest of the pane works.
- [ ] **Print Play data card:** looks unchanged.
- [ ] **Narrow (< 60rem, about a 1344px window at 140% zoom):** the pane
      moves under the table, Race and Edited hide, and nothing scrolls
      sideways.
- [ ] **Trash dialog:** portraits and placeholders, striped rows, "Trashed …"
      tooltip, newest first. The footer hint sits on the left and Empty
      trash… on the right, disabled when the trash is empty.
- [ ] **Empty trash confirmation:** stacks above the trash dialog, focus
      starts on Cancel, Esc cancels and leaves the trash dialog open, and
      the singular wording reads right with 1 character. Afterwards the
      trash shows "The trash is empty." and the library count reads 0.

## Free items

- [ ] **A free item appears** in Equipment inventory and as a sheet item card
      when you pick a class or feature that gives it (Ritual Book, Spellbook,
      also from Student of Sword Magic; pact weapons; poison doses; Harper
      Pin; Trap-Making Kit). A monk's Unarmed Strike is equipped in the
      off-hand.
- [ ] **Undo and Remove:** undoing that pick also removes the gift. Removing
      the gift keeps it gone.
- [ ] **Older native characters** get their missing gifts the first time
      they're opened.

## Conditions fixed (requires scan)

- [ ] **Hybrid executioner without Assassin's Strike (Hybrid):** no upgrade
      choice at 7/13/17/23/27. With the power, the upgrade's prerequisite
      lists it first.
- [ ] **Order Adept with a spellbook** (or feature 318): Order Adept powers
      are no longer offered as class powers.
- [ ] **Spear Expertise [Arena Fighter]:** lower charging damage at heroic
      and paragon tier.
- [ ] **Githzerai Blade Master with an arena glaive:** +2 arena damage.
- [ ] **Rose Scythe of Chauntea** on a divine or primal character: the
      implement bonus applies.

## Beast companion powers

- [ ] **Beast Mastery ranger:** the beast's attack powers show numbers (beast
      attack bonus vs. defense, [B] damage), and there's no "Companion: X"
      power card. The print header currently reads "BEAST vs AC"; the UI
      slice will tidy that up. The stat card itself comes with the UI slice.

## Domains, god fragments, item sets

- [ ] **Builder deity card** (Details tab): a "Domains: …" line above the
      description, with the domain cards below.
- [ ] **Printed Deity entry** after Background (church icon): the Domains
      line, then the description with its bullets.
- [ ] **Awaken God Fragment** reference entry: a "Constant Benefits:" line.
      The fragment's Encounter power card (Free action icon; this fragment has no keywords)
      sits among the encounter powers, printed and on screen.
- [ ] **Item Set card** (orange) after the set's last item card:
  - the Pieces/Tier row;
  - a check icon and "(active)" on unlocked benefits, with locked ones
    dimmed;
  - no set introduction in print.

  Group sets show a "Party pieces" label, a "Group" tag on the type bar and an
  italic note.

- [ ] **Equipment and Shop item detail:** an Item Set panel card under a set
      piece.
- [ ] **Numbers:** 2+ equipped pieces of a set now give its unlocked bonuses
      (e.g. Aleheart: +2 Dungeoneering and Endurance).
- [ ] **Party pieces field** (group item sets, e.g. Caelynnvala's Boons): in
      the Equipment and Shop item detail, a field and hint under "Item set" on
      the dark panel card (check the layout at 140% zoom).
  - Entering a count marks the unlocked benefits active and changes the
    totals.
  - Clearing it returns to a blank with nothing dimmed.
  - -1 and 1.5 are rejected, with a changed hint.
- [ ] **Printed group-set card:** unset shows "Party pieces" with a blank line
      and full-strength benefits; set shows the count with locked benefits
      dimmed. Non-group sets still read Pieces and Tier.

## Beast companion card

- [ ] **Printed beast card** between Skills and the familiar:
  - does the full stat block fit one card at high levels with several traits?
  - a sentinel's Surges tile reads "Yours".
- [ ] **Builder Companion pane:** the chosen beast's card, and a candidate
      preview (e.g. the bear).
- [ ] **Name and Appearance** inputs in the Companion section, and the card
      title (e.g. "Ash — Wolf").
- [ ] **Retraining:** a "Retrain a companion" option, with the Kind column
      reading "Companion".
- [ ] **Beast power cards:** a "Beast +N vs AC" header and a "Beast damage"
      line instead of the weapon table. Mixed powers (Distracting Team) keep
      their table with beast cells.
