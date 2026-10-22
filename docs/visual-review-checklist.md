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
      blades".
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

## Character library and trash

Check in light and dark themes and at 140% zoom.

- [ ] **Header:** New, Import, Trash plus a count tag, divider, Update (only
      when an update is waiting), Settings (gear), each with a one-word
      label. Labels collapse to icons at phone width. New's disabled
      tooltip gives the reason.
- [ ] **Table:** uppercase header, sort chevrons, striped rows, hover tint,
      selected row tint with the accent bar, 2.25rem portraits, and the
      Edited tooltip with the exact time. The filter (and its clear x)
      shows a no-match message inside the table.
- [ ] **Keyboard and mouse:** Arrow Up/Down and Home/End move the selection
      with a visible focus ring. Enter and double-click open the builder,
      and middle-click on a name opens a new tab. The sort and selection
      survive a reload.
- [ ] **Pane band:** portrait size, name font, identity line, role line
      ("Divine Defender", hybrids "X / Y"), paragon and epic lines, Edited
      tooltip, and the Update available badge contrast.
- [ ] **Action row:** five equal buttons (Edit, Sheet, Export, Duplicate,
      Trash) that never wrap, with hover and focus states. The Export menu
      hangs below the sticky pane, with its spinner during a .dnd4e export.
      Trash arms to a red "Confirm".
- [ ] **Stats:** the Play data layout (abilities 3×2, Defenses, Health,
      Init | Speed | Passive senses, note lines) matches the Play data card.
      The print Play data card looks unchanged.
- [ ] **Loading:** import a .dnd4e (or Duplicate a character) and select it.
      The tiles keep their size with "—", "Calculating stats…" shows with
      the spinner, and the role line shows a placeholder bar, then
      everything fills in. Arrowing quickly through rows stays responsive.
- [ ] **Saved summary:** edit a character in the builder, wait about 2s,
      return to the library. Its stats appear immediately.
- [ ] **Error:** a character whose content isn't installed shows "Stats
      unavailable" with a tooltip, and the rest of the pane works.
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
