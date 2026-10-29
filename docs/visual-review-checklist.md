# Visual review checklist

**Summary (2026-10-29 pare-down).** The list had 121 open items. One was
obsolete (the old "Beast Mastery ranger" card check, which repeated "Beast
power cards"), and 74 were factual. Their labels, text, order, numbers,
links, issues and the CSS that decides their look are now checked by code:
`pnpm review:verify` and `apps/web/src/visual-review-styles.test.ts`, plus
the unit tests named in their commits. Those items are gone from this list.
The 46 items left are the ones that need your eyes, merged into 41 items
over 11 passes. Each pass is one character or one page, and you walk it
once. The 45 rows `review:verify` lists for the owner are these items;
every automated check passes (2026-10-28, after `f22c5fc`).

## How to use this list

Each item says:

- **Where:** the character, the page or tab, the level, and what to click.
- **Expect:** what you should see when it's right.
- **Wrong if:** the signs that it's broken.
- **Decide:** (some items) a judgement call for you, not a pass/fail check.

Only layout, legibility, colour and dark theme, fit at 140% zoom, print fit
and "does this look right" are left here. Labels, text, counts, order,
numbers on cards, routes, issue titles and the CSS rules behind them are
checked by `pnpm review:verify`. It renders the review characters' pages in
code and checks the facts. Its results are in `tmp/visual-review/index.html`.
A failed check there is a bug, not something to eyeball.

**Test characters.** Run `pnpm review:build` (it needs the private pack
`tmp/content/full-local.4ecp` and also runs `review:verify`), then in the app:

1. Settings → Content → **Import content pack…** and pick
   `tmp/visual-review/review-content.4ecp`.
2. Settings → Backups & storage → **Restore backup**, pick
   `tmp/visual-review/review-characters.4ecb`. Use Restore, not the library's
   Import, so the IDs stay fixed.

`tmp/visual-review/index-visual.html` links each remaining item to its page.
The characters are named "Review – …" and have the ID
`visual-review-<slug>`. In this list, a path such as `beatrix` →
`edit?tab=build&level=1&section=class` means
`#/characters/visual-review-beatrix/edit?tab=build&level=1&section=class`.
`beatrix` → `?preview=1` is its print preview, and `beatrix` → `sheet` is
`#/characters/visual-review-beatrix`. The slugs used below are:

- `beatrix`: Beatrix, revenant hexblade 8 (Fey Pact of the White Well).
- `hexblade-white-well`: human White Well hexblade 25 with Legendary Hexblade.
- `hu`: the sample Hu Sheng-Ming (avenger 8, six backgrounds).
- `ranger-beast`: Beast Mastery ranger 11 with a wolf named Ash.
- `sentinel-bear`: elf sentinel druid 25 with a bear named Bruin.
- `warlock-fey`: elf fey warlock 11 with an Arcane Wisp familiar.
- `artificer-ardent`: hybrid artificer/ardent 11 with a Sprite familiar.
- `invoker-drow`: drow invoker 11 with a Spiderling of Lolth familiar and
  two Caelynnvala's Boons pieces.
- `fighter-arena`: githzerai arena fighter 11.
- `wizard-gnome`: gnome wizard 5.
- Player saves and SampleHeroes, imported unchanged: `hystan`, `piri`,
  `beldin`, `flint`, `raidon` (Raidon Kane), `jim` (Jim Darkmagic),
  `sylestine`, `trey` (Trey Spectre), `natan`, `dv`, `zilvra`.
- The library copies "Review – Update waiting" and "Review – Missing
  content" (runepriest).

Builder tabs, left to right: Build, Details, Loadout, Inventory (route
`tab=equipment`), Shop, Rituals, Retraining. The print preview runs page 1,
Scratchpad, the Character Reference pages, the card pages (nine cards each)
and Session Notes. The theme is Settings → Display → Color theme. Check each
pass in light and dark theme and at 100% and 140% zoom unless the item says
otherwise.

## Pass 1: Beatrix

Open `beatrix` → `edit?tab=build&level=1&section=class`, open the Pact
Choice row and click Fey Pact of the White Well. Then go to her print
preview and Inventory.

- [ ] **Trait package benefits.**
  - **Where:** the pact's detail pane, with every level section open.
  - **Expect:** the stack reads cleanly. Each benefit card is followed by the
    power cards it grants. The cards sit about 0.75rem apart.
  - **Decide:** a power under a sub-feature (Soul Step under the Boon) looks
    like a sibling of it. Would indenting, or a "from …Boon" label, help? Is
    the 0.75rem gap right?
- [ ] **Benefits by level** (pacts, themes, paragon paths, epic destinies).
  - **Where:** the same pane. Then `hexblade-white-well` →
    `edit?tab=build&level=1&section=class`, same pact (only its Legendary
    Hexblade section). Dark theme and 140% zoom too.
  - **Expect:** each heading shows a chevron, a bold title and a grey count.
    A click anywhere on the heading opens it, and so do Enter and Space when
    it has focus. The chevron turns and the bullet list gives way to cards.
  - **Wrong if:** a click on the count or a bullet does nothing, headings
    clip or overlap at 140%, or the focus ring is invisible in dark theme.
- [ ] **Choice card rhythm.**
  - **Where:** the pact card and its Boon, Reward and Weapon cards. Then the
    Race section → Revenant, the Class section → Hexblade and Cleric (its
    About section has a table), and `wizard-gnome` →
    `edit?tab=build&level=1&section=theme` → Order Adept → "More…".
  - **Expect:** even gaps. "**Prerequisite:** Hexblade" sits on one line and
    "**Level:** 1" on one line. Paragraphs start flush left. A trait name sits
    closer to its own text than to the next trait. A table, a divider or a
    lore heading has equal space above and below. The More… link sits at the
    left under the text. The spacing rules are checked in
    `detail-card-spacing.test.ts`; this item is about how they look.
  - **Wrong if:** a big gap at the bottom of a card, a heading glued to the
    text above it, or uneven space around a divider or table.
  - **Decide:** with a gap between paragraphs, is the small first-line indent
    on a following paragraph still wanted, or should card paragraphs never
    indent? Keep the thin flavor divider on every choice card, or drop it
    everywhere?
- [ ] **Sub-choices on feature rows.**
  - **Where:** `beatrix` → `?preview=1`, Character Reference pages (Past
    life, the two Guardian Feature rows). `fighter-arena` → `?preview=1`,
    page 1 reminders ("Arena Training: Arena Weapon (Glaive), Arena Weapon
    (Spear)").
  - **Expect:** a long heading wraps onto a second line, clear of the
    "Level N" tag at the right.
  - **Wrong if:** the tag overlaps or pushes the text, or a heading is cut off
    with "…".
  - **Decide:** "Barbarian Agility" and "Fighter Talents" keep the class name
    because it starts the feature's own name, not a "Level N" slot name. OK?

## Pass 2: White Well hexblade 25

- [ ] **Summoned allies**
  - **Where:** `hexblade-white-well` → `?preview=1`, the first card page:
    Mourning Handmaiden's Attack, Spectral Protector's Attack and Spectral
    Protector's Opportunity. The numbers and headers are checked
    automatically.
  - **Decide:** each weapon row is labelled "Unarmed", and your own Back to
    the Wall line appears under Additional effects. Is that fine for a
    summoned ally? Legacy CharTracker prints the native engine's conditions
    for each power, so the recovered viewer code doesn't settle it.

## Pass 3: Familiars

- [ ] **Familiar choice:**
  - **Where:** `warlock-fey` → `edit?tab=build&level=11&section=feats`, Arcane
    Familiar's familiar row (Arcane Wisp). `artificer-ardent` (Sprite) works
    the same way. Check it in dark theme.
  - **Expect:** in dark theme, a dark navy card with light text. The print
    preview stays white.
  - **Wrong if:** the card stays white in dark theme, or text is unreadable.
  - **Decide:** in dark theme the header turns the generic dark green panel
    colour instead of the teal used in print. Keep it, or keep teal?
- [ ] **Familiar card**
  - **Where:** `warlock-fey` → `?preview=1`, first card page, the 3rd card.
    Then `artificer-ardent` and `invoker-drow`, same place.
  - **Expect:** the Defense, HP and Speed tiles sit side by side, with Speed
    about three times as wide. Benefit headings are in the card colour.
    Everything fits inside the card.
  - **Wrong if:** text runs past the card's bottom, the text is much smaller
    than on the neighbouring cards, or a tile overflows.

## Pass 4: Beast companions

- [ ] **Printed beast card**
  - **Where:** `sentinel-bear` → `?preview=1`, first card page, 3rd card
    (Bruin). `ranger-beast` (Ash) for comparison.
  - **Expect:** Bruin's level-25 stat block, traits and Guardian Companion
    aura fit on one card at the same text size as its neighbours.
  - **Wrong if:** text runs past the bottom, or it's far smaller than the
    cards beside it.
  - **Decide:** the sentinel also prints "Bear Companion Notes (1)" and "(2)"
    power cards, content powers that repeat the beast card's aura and notes.
    Keep them?
- [ ] **Name and Appearance**
  - **Where:** `ranger-beast` → `edit?tab=build&level=1&section=companion`.
  - **Expect:** the "Name" (Ash) and "Appearance" single-line fields sit side
    by side under the companion row, laid out like the Details tab's inline
    fields.
  - **Wrong if:** the fields overlap the table or wrap badly at 140%.
  - **Decide:** is a one-line Appearance field enough?

## Pass 5: Drow invoker's item set

- [ ] **Party pieces field**
  - **Where:** `invoker-drow` → `edit?tab=equipment` → Scarf of
    Reconciliation +2, the Caelynnvala's Boons card. Dark theme, 140% zoom.
    The values, dimming and validation are checked automatically.
  - **Expect:** under "Item set", the "Party pieces" label sits beside a small
    number box about 5 characters wide, with the grey hint below.
  - **Wrong if:** the label and box wrap apart or overflow the card at 140%,
    or the hint is unreadable on the dark card.

## Pass 6: Character library and trash

Open `#/characters` with the review characters restored. The role-line
wording and the trash dialog's singular and plural text are checked
automatically.

- [ ] **Header:**
  - **Where:** the top of `#/characters`. Narrow the window for the
    phone-width labels. To see New disabled, turn every pack off in Settings
    → Content.
  - **Expect:** "4E Character Builder" and the version on the left. On the
    right: New, Import, Trash with a small square-cornered count tag, a thin
    divider, then Settings, each with a one-word label. Update shows only
    when a new app version is waiting. Below 36rem (a window of about 800px
    at 140%) only the icons remain. New, disabled, shows the tooltip "Turn on
    game content in Settings to create a character".
  - **Wrong if:** the labels wrap, the count tag is round or misaligned, or
    New's tooltip doesn't show.
- [ ] **Table:**
  - **Where:** `#/characters`. For the empty state, open the app in a private
    window before restoring anything.
  - **Expect:** an uppercase header row. The sorted column has a chevron, and
    a click flips it. Rows are striped and tint on hover. The selected row is
    tinted, with a thick accent bar on its left edge. Portraits are about
    36px. The table's top border lines up with the top of the navy pane. An
    empty library reads "No characters yet." centred inside the table.
  - **Wrong if:** a filter box appears, the borders don't line up, or the
    empty text is outside the table.
- [ ] **Keyboard and mouse:**
  - **Where:** click any row, then use the keyboard.
  - **Expect:** Arrow Up and Down move one row, and Home and End jump to the
    first and last, with the pane following. Enter or a double-click opens
    the builder. Middle-click on a name opens it in a new tab. Sort by Level,
    select a row and reload: both are kept.
  - **Wrong if:** the page scrolls instead of the selection moving, there's
    no focus ring, or the sort resets on reload.
- [ ] **Pane band:**
  - **Where:** select "Review – Summer Sentinel Druid L25 (Bear)", then
    "Review – Fey Warlock L11", then "Review – Hybrid Executioner/Fighter
    L27".
  - **Expect:** a navy band. The portrait has a white border and is about a
    third of the pane wide. The name is in the large display font, then the
    identity line, then the bold white role line, then the paler paragon,
    epic and "Edited today" lines (with the exact-time tooltip). The five
    action buttons close the band, with nothing below it.
  - **Wrong if:** stat tiles or a content-update badge appear, or the lines
    are out of this order.
- [ ] **Action row:**
  - **Where:** select any character and use the five buttons under the band.
  - **Expect:** five equal-width buttons, each an icon over a word, in one row
    at any width. A long word truncates with "…". Hover lightens a button and
    adds a light-blue bottom line. Export opens a small menu (.4ecb, .dnd4e)
    below the pane, and .dnd4e shows a spinner until the download starts.
    Trash turns its label pink, and the first click turns the button dark
    red, reading "Confirm".
  - **Wrong if:** a button wraps to two lines, the menu is clipped by the
    pane, or Trash deletes on one click.
- [ ] **Role line loading:**
  - **Where:** Duplicate any review character, then select the copy.
  - **Expect:** for a moment, a faint translucent bar about 9rem wide where
    the role line goes, then the role text. The other lines don't shift.
    Holding Arrow Down through the table doesn't stall.
  - **Wrong if:** a spinner, the text "Calculating…", lines jumping, or a
    sluggish selection.
- [ ] **Saved role line:**
  - **Where:** open `beatrix` in the builder, change any text (e.g. Details →
    Name), wait about 2 seconds, and go back to `#/characters`.
  - **Expect:** no placeholder bar flashes on that character.
- [ ] **Role line error:**
  - **Where:** select "Review – Missing content (Runepriest copy)".
  - **Expect:** name, identity and Edited lines but no role line, and all
    five buttons work.
  - **Wrong if:** a placeholder bar stays, an error text appears in the band,
    or the buttons are disabled.
- [ ] **Narrow (< 60rem, about a 1344px window at 140% zoom):**
  - **Where:** `#/characters` at 140% zoom, with the window narrowed below
    about 1344px.
  - **Expect:** the table is full width with Name, Level and Class, and the
    navy pane sits under it.
  - **Wrong if:** a horizontal scrollbar appears, or the pane overlaps the
    table.
- [ ] **Trash dialog:**
  - **Where:** trash "Review – Update waiting", then "Review – Missing
    content", and click Trash in the header.
  - **Expect:** a dialog titled "Trash (2)" with striped rows, most recently
    trashed first. Each row has a portrait or placeholder, a bold name, and
    "Race Class N · Trashed today" (hover for the exact time), then Restore
    and Delete permanently (which arms to a warning icon). The footer has the
    Restore hint on the left and a red "Empty trash…" on the right.
  - **Wrong if:** the footer items swap sides or wrap, or Empty trash… is
    enabled with nothing in the trash.
- [ ] **Empty trash confirmation:**
  - **Where:** restore one of the two, then click Empty trash….
  - **Expect:** the "Empty trash?" dialog opens over the trash dialog, with
    Cancel focused. Esc closes only the confirmation. After deleting, the
    trash reads "The trash is empty." and the header tag reads 0.
  - **Wrong if:** focus starts on Delete, or Esc closes both dialogs.

## Pass 7: Arena fighter's Build tab

- [ ] **Opening a filled choice scrolls to its pick.**
  - **Where:** `fighter-arena` → `edit?tab=build&level=3&section=powers`,
    then use the level picker for level 6 Feats and level 1 Powers. Click the
    folded heading: Steel Serpent Strike (3), Melee Training (6), then
    Bristling Defense and Spinning Sweep (1). Folding on arrival is checked
    automatically.
  - **Expect:** the table opens already scrolled so the highlighted pick is
    the first row under the sticky column headers and the type band. A pick
    among the last rows sits as high as the list allows. A pick in the first
    few rows leaves the table at the top.
  - **Wrong if:** the table opens at the top with the pick at its bottom
    edge, the pick sits behind the band, the table opens one or two rows
    off, or a paged list opens on a page without the pick.

## Pass 8: New characters

Library → New. These need a fresh character each.

- [ ] **"Learn X free" dialog**
  - **Where:** a psion: New, pick the Psion class at level 1, then Rituals →
    Learn rituals, search "Tenser", and click the gift (Learn free) button.
    Which allowances apply is checked automatically.
  - **Expect:** a tidy dialog titled "Learn Tenser's Floating Disk free",
    with one radio button per allowance plus "None (a gift)", and Cancel and
    Learn free buttons. The part of each option after "·" is grey.
  - **Wrong if:** the options crowd or wrap badly, or the grey detail is
    unreadable in dark theme.
- [ ] **A pick that opens a step scrolls to it.**
  - **Where:** a new hybrid character (e.g. Hybrid Barbarian/Cleric), level
    1, Feats tab, Feat item. Double-click Hybrid Talent. Then, before picking
    the feature, use the unresolved-choices badge → Review on "Level 1 Class
    Feature". Also pick Toughness on another character. Check at 140% zoom
    too.
  - **Expect:** the page jumps, with no animation, so the "2 Class Feature"
    heading sits near the top with a small margin. Review lands the same
    way. Picking the feature doesn't scroll again, and Toughness doesn't
    scroll at all.
  - **Wrong if:** step 2 stays below the feat table or off-screen, or a pick
    that opens nothing scrolls the page.

## Pass 9: Hu's sheet editing

Open `hu` → `?preview=1`, the print preview of Hu Sheng-Ming. Labels,
keyboard toggles, Alt+Arrow moves, copy counts, focus behaviour,
drag-and-drop order, saving, page numbering and print omission are checked
by tests. These items cover only layout and feel.

- [ ] **Edit toolbar.**
  - **Where:** click **View** and **Edit** in the toolbar's "Sheet" control
    several times.
  - **Expect:** Back and View | Edit stay exactly where they are in both
    modes. Edit adds **Sections** and **Reset** after them, with Reset greyed
    while nothing has changed. Print stays at the right end. Cards and pages
    look exactly as in View.
  - **Wrong if:** View | Edit jumps sideways, the toolbar wraps badly or
    scrolls sideways at 140%, or Reset's label is long.
- [ ] **Sections menu: show and hide.**
  - **Where:** Edit mode → **Sections**. Untick Play scratchpad and Session
    notes, then Overview. Press Escape, reopen, and click on the paper.
  - **Expect:** a small panel right under the button, in the app's theme
    colours, with nine rows. Each row has a faint grip and an ordinary
    checkbox. Unticking removes those pages at once, and the panel stays
    open.
  - **Wrong if:** the panel is clipped, overflows the window at 140%, is
    unreadable in dark theme, sits behind the paper, or a placeholder strip
    is left where a section was.
- [ ] **Sections menu: reorder.**
  - **Where:** drag Power & item cards by its grip to the top, then drag
    Session notes between Overview and Play scratchpad.
  - **Expect:** a grab hand over the grip. While dragging, the row dims and a
    thin focus-coloured line shows on the top or bottom edge of the row under
    the pointer, matching where it drops. On drop the pages move at once.
  - **Wrong if:** the drop line is invisible in dark theme or doesn't match
    where the row lands, or the browser opens or searches the dragged text.
- [ ] **Sections menu: copies.**
  - **Where:** click + on Play scratchpad twice and type 3 into Session
    notes' field. Then open the browser's print preview (Ctrl+P).
  - **Expect:** each of those rows ends with a compact − [n] + group that
    fits on the row. Unnumbered copy pages keep the footer's title and
    identity where they were, with the right end simply empty.
  - **Wrong if:** the stepper wraps or crowds the label, the number field is
    unreadable in dark theme, or the footer looks lopsided.
- [ ] **Card right-click feel.**
  - **Where:** right-click a power card and an item card. Left-click a card.
    Tab to a card and press Enter. Then the browser's print preview (Ctrl+P).
  - **Expect:** right-click hides a card at once, with no menu. It stays in
    place with its header and type bar at full strength and its border kept.
    The body is blank with a large faint "Hidden". The browser's print
    preview has no hidden cards and no focus ring.
  - **Wrong if:** a hidden card is hard to tell from a shown one, its header
    is faded or covered, body text shows through, or the printout has gaps.
- [ ] **Alias wording**
  - **Where:** `hu` → `sheet`, Battle Awareness.
  - **Decide:** its body reads "Choices: Athletics; counts as Fighter". Does
    that read well?

## Pass 10: Player saves' print previews

Each is one character's `?preview=1`. Their text and numbers are checked
automatically. Look only at fit and legibility.

- [ ] **Page 1 Conditional modifiers pane.**
  - **Where:** `natan` (resistances plus three combined defense rows) and
    `trey` (five rows). Then import `sample-chars/idon tkare at 6th.dnd4e`
    (Speed and Skills & checks rows) and `Skye.dnd4e` (saves only) from the
    library.
  - **Expect:** striping alternates continuously across groups. Long effects
    wrap inside the Effect column, and the Source column stays readable.
    Reminders below still fill the remaining space and overflow to page 2
    with the "N more reminders" caption.
  - **Wrong if:** the pane pushes reminders off the page without a caption,
    rows overlap the footer, or the Source column is crushed.
- [ ] **Play data card lines.**
  - **Where:** the Play data card (first card page) of `natan`, `piri` and
    `hystan`, and of Idon if imported.
  - **Expect:** the note lines (Defenses, Saves, Resistances…, Other,
    Initiative, Speed, Allies) sit at the card's 7pt note size, all inside
    the card.
  - **Wrong if:** the notes overflow the card's bottom edge or clip.
- [ ] **Uses per encounter on power cards.**
  - **Where:** `beldin` → `?preview=1`, Ardent Surge. Then its card on the
    Build tab, in dark theme.
  - **Expect:** the type bar "ENCOUNTER (2×) … POWER" stays on one line with
    the class block at the right, and the card fits its print slot in the
    browser's print preview.
  - **Wrong if:** the bar wraps or the right-hand text is pushed off.
- [ ] **Class block in the card type bar.**
  - **Where:** `hystan` → `?preview=1`: Twin Strike, Master Diplomat, Mighty
    Sprint. `raidon` → `?preview=1`: Destined for Greatness. Then Hystan's
    Build tab power cards in dark theme.
  - **Expect:** the type label on the left and "Ranger · Level 1" (and so on)
    on the right, with a clear gap between them.
  - **Wrong if:** the right-hand text collides with the type label, clips or
    overflows.
- [ ] **Monk movement technique on the discipline card.**
  - **Where:** `raidon` → `?preview=1`: Five Storms and Dragon's Tail. Then
    its Build tab with Five Storms selected.
  - **Expect:** after the attack and Hit lines, a thin rule, "MOVEMENT
    TECHNIQUE", and a band ("Move" + "Personal"), all inside the card.
  - **Wrong if:** the section is clipped or its band runs past the card edge.
- [ ] **Spellbook subtitle.**
  - **Where:** `jim` → `?preview=1`: Expeditious Retreat and Freezing Cloud.
    Their panel cards in dark theme too.
  - **Expect:** a small uppercase "SPELLBOOK" at the right of the title band,
    light in print.
  - **Wrong if:** it wraps under the name or pushes the name off.
- [ ] **Associate card (D107).**
  - **Where:** `sylestine` → `?preview=1`, the Trained Blink Dog card after
    Skills and her Arcane Wisp. Then Edit mode.
  - **Expect:** the card fits at 140% zoom and is light in print. The
    "Standard · At-Will" meta text is readable in dark theme. In Edit mode it
    hides and shows by right-click and reorders by drag.
  - **Wrong if:** the card clips or overflows.
- [ ] **Erdan's feature notes.** The local content pack lacks Erdan's
      Disruptive Shot features, so this can't be checked in code. Flint's
      half of this check is automated.
  - **Where:** import `sample-chars/Erdan 11.dnd4e` with your own content,
    then `?preview=1`, page 1 class features.
  - **Expect:** "Weapon Mastery — Gain +1 to damage rolls of weapon attacks"
    and "Level 7 Improved Disruptive Shot — Use three times per encounter".
  - **Wrong if:** "Disruptive Shot" or "Level 3 Improved Disruptive Shot"
    rows show, or a note ends in "@…".

## Pass 11: Equipment-tab menus

- [ ] **Augments attach/detach.**
  - **Where:** `invoker-drow` → `edit?tab=shop`, buy a Siberys Shard of
    Merciless Cold (heroic tier). In Inventory, right-click the shard →
    Attach to → the Rose Scythe of Chauntea. The notes' text and the hosts
    offered are checked automatically. (Flint's own shard was saved with
    count 0, so, as in legacy, it isn't owned and shows no binding.)
  - **Expect:** the scythe's "Augment: …" note is muted and the row's columns
    stay aligned. Right-clicking the shard opens a menu with the scythe
    ticked, then "Detach". The menu is readable at 140% zoom and in dark
    theme.
  - **Wrong if:** a warning-coloured note, misaligned columns, or a clipped
    menu.
- [ ] **Wield two-handed (D101/D102).**
  - **Where:** right-click a Longsword (an Inventory row or loadout slot) on
    a medium character, then on a halfling or gnome. The menu's states,
    tooltip and effects are checked by tests.
  - **Expect:** the checkable "Wield two-handed" item, and the Small
    character's muted, checked version, both read well.
  - **Wrong if:** the menu is clipped at 140% zoom or unreadable in dark
    theme.
