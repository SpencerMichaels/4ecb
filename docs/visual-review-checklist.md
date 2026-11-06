# Visual review checklist

**Approved (2026-11-05).** The product owner walked every pass and approved
them; M5.7 and M5.75 are closed. Keep the entries for future regression
walks.

**Summary (2026-11-04 compression).** Since the 2026-10-29 pare-down (121
items to 45 over 13 passes) the list had grown back to 55 items over 18
passes, 60 owner rows on the review page. Now it is 38 walk-through entries
over 23 passes, one entry per page you open, and `pnpm review:build`
reports 38 owner rows. What moved to code:

- Every "mixed" row's factual half is an automatic `review:verify` row, and
  the visual half is folded into that page's walk-through entry.
- The swap checks of the old Passes 14 and 15 are verified on new review
  characters: Lily (Skald Training's automatic Majestic Word → Skald's Aura
  swap; Ritual Caster under Bardic Training is no retraining target) and
  Raidon Kane (Plaguefire Body is no retraining target). The Paragon
  Multiclassing granted-target check is covered by the unit tests of
  `0aaa305` (`hybrid-powers.test.ts`, `build-projection.test.ts`).
- The psion's shared implement table is verified on a new review character,
  "Review – Psion L15 (Summon Thought Warrior)".
- The library's behaviour (labels and order, sort and selection memory,
  keys, the 36rem and 60rem breakpoints, the pane's lines, the role-line
  states, the trash order and wording) is checked by
  `character-library-ui.test.ts`, `CharacterLibraryDetail.test.tsx` and
  `TrashDialog.test.tsx`; the Empty-trash dialog's focus on Cancel and its
  Esc by `EmptyTrashDialog.focus.test.tsx`; the restore dialog's text,
  buttons, focus and outcomes by `SettingsPage.restore.test.tsx`; the
  Sheet Edit-mode toolbar, Sections menu and right-click by
  `CharacterSheetPage.editing.test.tsx`; the benefits-by-level heading
  being one button (click anywhere, Enter, Space) by
  `CandidateDetail.test.ts`; the pre-scroll arithmetic by
  `CandidateSelectionTable.prescroll.test.tsx`; the creature split's shared
  layout key by `creature-card.test.ts`; the CSS facts (selected-row bar,
  square count tag, role placeholder, familiar tile row and sizes,
  panel tiles' dark tints, Party pieces box) by `visual-review-styles.test.ts`.
- Dropped: the White Well summoned allies' "Unarmed row / Back to the Wall"
  question (their attacks now print on creature cards, D111, with neither),
  the Sprite familiar's two checks (same component and colours as the
  Arcane Wisp), and the beast card's "Ash for comparison".

Every automated check passes (2026-11-04).

## How to use this list

**Check every entry in light and dark theme, at 100% and 140% zoom.** For
an entry on a print preview, also open the browser's print preview
(Ctrl+P) once: printed cards and pages are light, with no focus rings and
no red "Text exceeds card" outline. Wherever a "·"-separated list wraps
(type bars, item footers, companion and creature stat lines, entry
headings, the page-1 player line, builder level summaries), the item that
starts the new line has no "·" in front of it; mid-line "·"s stay. Only
layout, legibility, colour, fit and "does this look right" are left here;
labels, text, order, numbers, routes and issue titles are checked by `pnpm review:verify`, whose results
are in `tmp/visual-review/index.html`. A failed check there is a bug, not
something to eyeball.

Each entry gives one **Where** (the page to open and what to click), then
**Expect** and **Wrong if**. Open questions are collected under
[Decisions](#decisions) at the end.

**Test characters.** Run `pnpm review:build` (it needs the private pack
`tmp/content/full-local.4ecp` and also runs `review:verify`), then in the app:

1. Settings → Content → **Import content pack…** and pick
   `tmp/visual-review/review-content.4ecp`.
2. Settings → Backups & storage → **Restore backup**, pick
   `tmp/visual-review/review-characters.4ecb`. Use Restore, not the library's
   Import, so the IDs stay fixed.

`tmp/visual-review/index.html` links each entry to its page. The
characters are named "Review – …" and have the ID `visual-review-<slug>`.
A path such as `beatrix` → `edit?tab=build&level=1&section=class` means
`#/characters/visual-review-beatrix/edit?tab=build&level=1&section=class`;
`beatrix` → `?preview=1` is its print preview, and `beatrix` → `sheet` is
`#/characters/visual-review-beatrix`. Builder tabs, left to right: Build,
Details, Loadout, Inventory, Shop, Retraining (each `tab=` slug is the tab
name in lower case; rituals are learned in the Shop and listed in the
Inventory, D114). The theme is Settings → Display → Color theme.

The passes run the native review characters first, then the imported player
saves (one print preview each), then the library, new characters, and the
live site.

## Pass 1: Beatrix (`beatrix`, revenant hexblade 8)

- [x] **Beatrix: pact, race and class cards.**
  - **Where:** `edit?tab=build&level=1&section=class`. Click the Pact Choice
    row's Fey Pact of the White Well and open every level section. Then
    click the Class rows Hexblade and Cleric (its About section has a
    table), and in the Race section Revenant.
  - **Expect:** each level heading shows a chevron, a bold title and a grey
    count; opened, the chevron turns and the bullets give way to cards.
    Each benefit card is followed by the power cards it grants, about
    0.75rem apart. Even gaps on every card: "**Prerequisite:** Hexblade"
    and "**Level:** 1" each on one line, paragraphs flush left, a trait
    name closer to its own text than to the next trait, equal space above
    and below a table, divider or lore heading. Folded again, the Race
    row reads "Revenant · Language: Elven" in grey on one line beside its
    title (at 140% zoom a long summary ends in "…" before the check mark).
  - **Wrong if:** headings clip or overlap, the focus ring is invisible in
    dark theme, a big gap sits at a card's bottom, a heading is glued to
    the text above it, space around a divider or table is uneven, or a
    folded summary wraps or pushes its status icon off the row.
- [x] **Beatrix: reference feature rows.**
  - **Where:** `?preview=1`, the Character Reference pages: Past life and the
    two Guardian Feature rows.
  - **Expect:** a long heading wraps onto a second line, clear of the
    "Level N" tag at the right.
  - **Wrong if:** the tag overlaps or pushes the text, or a heading is cut
    off with "…".
- [ ] **Beatrix: narrow-window sidebar drawer.**
  - **Where:** `edit?tab=build&level=1&section=class`; narrow the window
    below 63rem (about 1411px at 140% zoom, 1008px at 100%), then click the
    strip at the window's left edge, click it again, reopen it and press
    Esc, reopen it and click the level page. Also try a tall window and a
    short one (at 140% zoom), and with the drawer closed narrow the window
    step by step on Build (Class and Feats), Details, Inventory, Shop and
    Retraining.
  - **Expect:** closed, only a slim strip with a ">" shows at the window's
    left edge, as tall as the sidebar's content, and the tab bar starts
    just right of it; no space opens above or below. Clicking it slides the
    sidebar out over the workspace (which doesn't move or narrow) with the
    strip as its right edge, now "<", in the same border and colours; it
    slides back on the second click, Esc or a click outside. Open, the
    sidebar's portrait, name, stats and funds look exactly as when docked;
    in a short window the drawer stops at the window's bottom and scrolls
    inside. Hover and keyboard focus on the strip are visible. Widening
    the window brings back the docked sidebar with no strip. Each tab keeps
    its table and detail pane side by side down to about a 45rem window
    (about 1005px at 140%, 720px at 100%), then stacks the pane below;
    docked windows look as before.
  - **Wrong if:** the sidebar folds above the content, the strip runs the
    full window height when the content is shorter, the drawer pushes the
    workspace aside or slides under the tab bar, a horizontal scrollbar
    appears, the sidebar's stats wrap differently from the docked
    sidebar, the strip and panel look like two separate controls, the
    chevron doesn't flip, the strip is hard to see in dark theme, or a
    side-by-side tab's left column is so narrow its rows or filters
    overlap.
- [ ] **Beatrix: icon-only builder tabs.**
  - **Where:** `edit?tab=inventory`; narrow the window step by step from wide
    to below 48rem, docked and with the drawer, at 100% and 140% zoom;
    switch tabs while narrow and hover an icon-only tab. Then the same on
    "Review – Zilvra" (`zilvra`, more status badges) just above 63rem (about
    1411px at 140%).
  - **Expect:** the tab bar never scrolls. When the labels don't fit
    beside the status buttons, every tab but the selected one shows only
    its icon (the hover tooltip names it) and the selected one keeps its
    label; switching tabs moves the label without the bar jumping between
    modes. The status buttons stay at the right; on Zilvra at the narrowest
    docked width they sit on a row above the tabs, still at the right, and
    the tabs keep the rule under them.
  - **Wrong if:** a horizontal scrollbar appears in the tab bar, a label
    is cut off, icon-only tabs are cramped or unevenly spaced, the bar
    flickers between modes, the selected tab loses its label, or the
    status row sits left or below the rule.
- [ ] **Beatrix: narrow Shop and Inventory tables.**
  - **Where:** `edit?tab=shop`, then Inventory, in a window just above
    63rem (about 1411px at 140%, 1010px at 100%) with the sidebar docked,
    and again at 140% zoom on your usual window.
  - **Expect:** the Shop's Type, Slot and Subtype fields stack when the
    catalog column is narrow, and its search row wraps, all inside the
    column; the table headers (Name, Level, Price, Owned; Item, Quantity)
    each sit over their own column, and a too-narrow table scrolls
    sideways inside its frame with the item names still readable.
  - **Wrong if:** two headers overlap, a field or button runs under the
    detail pane, or the name column is only a few letters wide.

- [ ] **Beatrix: build overview.**
  - **Where:** `edit?tab=overview` (the Overview tab, second in the tab
    bar); scroll levels 1 to 8, then click Level 1's Race row, come back,
    click a Level 4 or 8 row (Ability Increases, a feat), and a Details row
    (Gender or Alignment). Click the Level 1 and Level 3 headings (and
    press Enter/Space on a focused heading) to collapse and reopen them,
    then switch tabs and back. Repeat at 140% zoom and in dark theme.
  - **Expect:** one "Level N" section per level, each headed by a navy
    band like the Inventory's item groups (chevron, "Level N", the count
    of its choices), then a list of rows in groups (Character, Feats,
    Powers, Other) separated only by a small gap; no line between rows or
    groups, so the bands are the only breaks. Each row reads its slot
    title in bold, then the picks in muted text that wraps rather than
    clipping, and the Build tab's green check (or amber "?" for an open
    required choice) at the right edge, aligned across rows. A level with
    no choices shows "No choices at this level" under its band, count 0.
    Clicking a band (or Enter/Space on it) folds that level to just its
    band, the chevron turning from down to right, and unfolds it again;
    the other levels stay as they were; after switching tabs every level
    is open again. A row highlights on hover and keyboard focus. Clicking
    a row opens the Build tab at that level and section with the choice's
    item expanded, scrolled to and focused (Details rows open Details on
    that choice).
  - **Wrong if:** any row or group has a line under it (e.g. after Level
    4's Ability Increases or within Level 1), a band looks different from
    the Inventory's group bands (colour, height, chevron, count), the
    band's text is hard to read in dark theme, a collapsed level leaves a
    gap or stray text, titles and picks don't line up into columns, long
    picks are cut off or push the status icon out of the row, the list
    overflows sideways at 140% zoom, the tab's icon looks like another
    tab's, or a click lands on the wrong level, section or item.

## Pass 2: White Well hexblade 25 (`hexblade-white-well`)

- [x] **White Well hexblade: the Legendary Hexblade section.**
  - **Where:** `edit?tab=build&level=1&section=class`, the Pact Choice row's
    Fey Pact of the White Well; open its Legendary Hexblade section.
  - **Expect:** the section's Level 11 / 12 / 16 / 20 subheadings and cards
    read like Beatrix's sections.
  - **Wrong if:** a subheading clips, or its cards sit unevenly.
- [x] **White Well hexblade: summoned creature cards.**
  - **Where:** `?preview=1`, the cards after Skills: Mourning Handmaiden and
    Spectral Protector (each may print as a stats card and a "— Actions"
    card).
  - **Expect:** tiles, Speed line and notes with the stats; the attacks and
    actions with the actions. Each entry's heading (name, keywords, action
    and usage) stands out from its lines.
  - **Wrong if:** a card overflows, an entry heading is hard to tell from its
    lines, or the stats and actions halves look unbalanced.
- [x] **White Well hexblade: level 25 gains.**
  - **Where:** `edit?tab=build&level=25` (no section tabs at this level).
  - **Expect:** the "No choices need attention at level 25" state, and under
    it a "Gained at this level" list: "Level 25 Greater Summon Warlock's Ally
    (White Well)" (Class Feature, "Can summon spectral protector") with
    "Greater Summon (White Well Pact)" (Daily power) indented beneath it.
    Readable at 140% zoom and in dark theme. Level 13 shows the empty state
    alone.
  - **Wrong if:** the page is blank, the list crowds or overlaps the empty
    state, internal entries (Spectral Protector's Attack, Aura…) are listed,
    or level 13 shows an empty "Gained" heading.

## Pass 3: Gnome wizard 5 (`wizard-gnome`)

- [x] **Gnome wizard: Order Adept card.**
  - **Where:** `edit?tab=build&level=1&section=theme`, Order Adept → "More…".
  - **Expect:** the card's rhythm matches Beatrix's cards, and the More…
    link sits at the left under the text.
  - **Wrong if:** More… floats right or overlaps the text, or the gaps are
    uneven.

## Pass 4: Fey warlock 11 (`warlock-fey`)

- [x] **Fey warlock: Arcane Wisp in the builder.**
  - **Where:** `edit?tab=build&level=11&section=feats`, Arcane Familiar's
    familiar row (Arcane Wisp).
  - **Expect:** in dark theme a dark navy card with light text; the
    Defense, HP and Speed tiles dark tinted (green, purple, teal) with light
    numbers; HP and Speed side by side on one row; the italic rules note ("A
    missed attack never damages it…") as large as the benefit text below it.
    The description ("Fey pact warlocks and others…") sits just under the
    title band, above the tiles, in the italic tinted flavor band of a power
    card's flavor text; with Settings' flavor text off it is gone.
  - **Wrong if:** the card stays white in dark theme, a tile is bright or its
    number hard to read, HP sits above Speed, the rules note is smaller than
    the benefit text, or the description sits at the bottom of the card or
    looks unlike a power card's flavor text.
- [x] **Fey warlock: printed Arcane Wisp card.**
  - **Where:** `?preview=1`, first card page, the 3rd card.
  - **Expect:** the Defense tiles on one row and HP and Speed side by side
    beneath them, Speed about three times as wide; the tiles, rules note and
    benefits shrunk together to fit; benefit headings in the card colour;
    each benefit paragraph on its own line ("Wisp's Escape: …" never runs
    into the next sentence); no description (mechanics only, D110); everything inside the card, with
    no red "Text exceeds card" outline. No review character has a familiar
    long enough to split; to see one, pick Hurrum (Dark Sun) as a familiar:
    it prints as "Hurrum" (tiles, senses, rules line) then "Hurrum — Notes"
    (benefits, quirks), side by side in the deck.
  - **Wrong if:** text runs past the card's bottom, HP sits above Speed, the
    text is much smaller than on the neighbouring cards, or a tile's number
    is cut off.

## Pass 5: Beast Mastery ranger 11 (`ranger-beast`)

- [x] **Beast ranger: Name and Appearance fields.**
  - **Where:** `edit?tab=build&level=1&section=companion`.
  - **Expect:** under the companion row, the short Name field (Ash), as wide
    as the Details tab's Player field, and beneath it a full-width
    multi-line Appearance box like the Details tab's Appearance note that
    grows as you type several lines. The beast card, printed
    (`?preview=1`) and in the Companion pane, stays titled "Ash — Wolf"
    whatever you type.
  - **Wrong if:** the fields overlap the table, Appearance is a one-line field
    or sits beside Name, the box doesn't grow, or the Appearance text shows
    on either card.

## Pass 6: Sentinel druid 25 (`sentinel-bear`)

- [x] **Sentinel druid: Bruin's printed card.**
  - **Where:** `?preview=1`, first card page, the 3rd card (Bruin).
  - **Expect:** one card, mechanics only (D110 amendment, 2026-11-04): the
    tiles, Speed, Claw attack, Trained skills, the Guardian Companion aura
    and the italic command line, all inside the card at a readable size
    (about 7.5 pt). No "Brown bears…" description; the builder's Companion
    pane still shows it, as flavor text: the italic tinted band just under
    the title, above the tiles, like a power card's flavor (gone with
    Settings' flavor text off).
  - **Wrong if:** any line runs past the bottom or under the "Beast
    Companion" band, the description prints, Bruin prints as two cards, or
    the pane's description sits at the bottom of the card.
  - **Split cards (no review character has one):** on a copy of the
    ranger-beast character choose the Horse (or Simian) at Build, level 1:
    Companion, then open `?preview=1`: a stats card then "Horse — Notes"
    (Mount Companion, command line), side by side; Edit mode hides or drags
    both together.

## Pass 7: Drow invoker 11 (`invoker-drow`)

- [x] **Drow invoker: Equipment and Shop.**
  - **Where:** `edit?tab=inventory`, select the Scarf of Reconciliation +2
    and look at its Caelynnvala's Boons card. Then in the Shop buy a
    Siberys Shard of Merciless Cold (heroic tier), a Longsword, Armor of
    Adaptable Resistance +1 and a Harper Pin (heroic tier), looking at the
    Shop's choice pages for the last two. Back in Inventory right-click the
    shard → Attach to → Rose Scythe of Chauntea, then right-click the
    Longsword, the armor and the pin.
  - **Expect:** "Party pieces" beside a small number box, the grey hint
    below; the scythe's "Augment: …" note muted with the row's columns
    aligned; the shard's menu with the scythe ticked, then Detach; the
    checkable "Wield two-handed" item; "Choose a damage type…" and "Choose
    a power…" menu items; every menu readable and unclipped.
  - **Wrong if:** the Party pieces label and box wrap apart or overflow the
    card, the hint is unreadable on the dark card, the augment note is
    warning-coloured, the columns shift, or a menu is clipped.
- [x] **Drow invoker: Rose Scythe properties.**
  - **Where:** `edit?tab=inventory`, select the Rose Scythe of Chauntea;
    then `?preview=1`, its item card.
  - **Expect:** the header rows hold only the scythe's short stats; the
    card body reads "Properties:" followed directly by its two bullets as a
    list (no "See Below" lead), in the body's normal text size, on both
    surfaces. The printed card still fits. The stat rows' text sits as far
    from the card's left edge as the keyword band and body text.
  - **Wrong if:** "See Below" still leads the list, the bullets print in
    the header rows, the list runs together as one paragraph, the body text
    is a different size from the card's other rules, the printed card
    overflows, or the stat rows' text is squeezed against the left border.
- [x] **Drow invoker: Blade Angel in power detail.**
  - **Where:** `edit?tab=build&level=9&section=powers`, select Summon Blade
    Angel.
  - **Expect:** under the power card, the creature's dark panel card with the
    same tiles, commands and per-implement rows as the print card.
  - **Wrong if:** the panel card overflows the detail pane, or the commands
    or their rows are unreadable on the dark card.
- [x] **Drow invoker: printed familiar and Blade Angel.**
  - **Where:** `?preview=1`: the Spiderling of Lolth familiar card, the Blade
    Angel creature card after it, and the Summon Blade Angel power card
    among the daily powers.
  - **Expect:** the familiar card fits like the Arcane Wisp's. On the Blade
    Angel card each command is followed by its three implement rows (Rose
    Scythe of Chauntea +2, Accurate rod of Corruption +2, No implement),
    without column headings, striped and divided like a power card's weapon
    table. The power card keeps its keyword and action bands and the
    Effect. Avenging Light's table also ends in "No implement"; the page-1
    Melee Basic Attack keeps "Unarmed".
  - **Wrong if:** a card overflows, the rows read as part of the command
    text or as belonging to the next command, the stripes or dividers are
    missing, an implement power prints an "Unarmed" row, or the creature
    card's text is unreadable at its size.

- [ ] **Drow invoker: rituals in the Inventory and Shop.**
  - **Where:** `edit?tab=inventory` at 140% zoom, in light and dark theme:
    scroll to "Rituals known" below the items, click a ritual, right-click
    it, then right-click a granted one (its line ends "Granted by
    Invoker"). Then the Shop: open the Type list, choose Rituals, then
    Alchemical formulas and back to All items.
  - **Expect:** "Rituals known" reads like the item groups above it, its
    count the same size and weight as the word; each row is the book icon,
    the name, and one muted line "Level N · Category · Key skill" (plus
    the source for a granted or free ritual), with no quantity buttons or
    trash icon. The detail pane shows the ritual's card. The right-click
    menu has Remove; on the granted ritual it is greyed, its tooltip saying
    why. In the Type list the three learning categories sit under a
    "Rituals and practices" heading after the items. In every category the
    toolbar (Type, Slot, Subtype, search, Affordable, Proficient, Filters)
    and the table's columns stay in the same places; the Level header is
    on one line; a learned ritual's row reads Known with its buttons
    disabled.
  - **Wrong if:** the count is smaller than the title, a detail line
    overlaps the next row or a long one isn't wrapped under the name, a
    row has a visible Remove/⋮ button, the menu is clipped, a toolbar
    control moves or disappears between categories, "Level" breaks onto
    two lines, or grey text is unreadable in dark theme.

## Pass 8: Arena fighter 11 (`fighter-arena`)

- [x] **Arena fighter: opening a filled choice.**
  - **Where:** `edit?tab=build&level=3&section=powers`, click the folded
    Steel Serpent Strike heading; then with the level picker level 6 Feats
    (Melee Training) and level 1 Powers (Bristling Defense, Spinning
    Sweep).
  - **Expect:** the table opens scrolled so the highlighted pick is the first
    row under the sticky column headers and the type band; a pick among
    the last rows sits as high as the list allows; a pick in the first few
    rows leaves the table at the top.
  - **Wrong if:** the pick sits at the table's bottom edge or behind the
    band, the table opens a row or two off, or a paged list opens on a page
    without the pick.
- [x] **Arena fighter: mounts in item detail.**
  - **Where:** `edit?tab=inventory`, select the Silver Dragon Steed, then the
    Warhorse; then in the Shop select a Kank (a Dark Sun mount).
  - **Expect:** under each item card, the creature's dark panel card with the
    print card's tiles and entries. The item card above it is short: name,
    price and the Mount type bar, with no description of its own (the
    creature card shows it). The Warhorse's load table at the bottom of its
    creature card, with no flavor band. The Kank's paragraph ("Kanks are
    docile insects…") as flavor text: the italic tinted band just under the
    creature card's title, above the defense tiles, like a power card's
    flavor; its speed and load table stays at the bottom. With Settings'
    flavor text off the Kank's paragraph is gone from the whole pane and its
    table stays.
  - **Wrong if:** the panel card overflows the detail pane, the meta text
    ("Melee basic attack · standard, at-will") is unreadable on the dark
    card, the table is clipped, the Kank's paragraph sits at the bottom or
    looks unlike a power card's flavor, the Warhorse shows an empty flavor
    band, the short item card looks broken (an empty body band), or the
    paragraph or a table shows on both cards.
- [x] **Arena fighter: print preview.**
  - **Where:** `?preview=1`: page 1's "Remember in play" reminders, then
    the cards after Skills: the Warhorse and the Silver Dragon Steed.
  - **Expect:** no Arena Training reminder (every effect is in the numbers:
    AC, and the Unarmed rows' improvised +2 and 1d8; owner 2026-11-05), and
    the reminders that remain fill the space without a gap. The Warhorse
    is one card with one row of defense and HP tiles and its load table at
    the bottom; the Warhorse item card (with the other item cards) is
    short: name, "Mount", price and type bar, with no load table. Now that
    its defense and HP tiles share one row, the Steed measures as one card
    at about the 6 pt floor (Firefox); if your browser
    still finds it overflowing, it is two adjacent cards, "Silver Dragon
    Steed" and "Silver Dragon Steed — Actions".
  - **Wrong if:** an Arena Training reminder is back, a card overflows, the
    Steed prints as one clipped card or with a "(continued)" card, the
    tiles wrap onto two rows, text is unreadable at the reduced size, the
    load table prints on both Warhorse cards, or the Warhorse item card
    looks broken without it (an empty body band).

## Pass 9: Psion 15 (`psion-thought-warrior`)

- [x] **Psion: the Thought Warrior's shared implement rows.**
  - **Where:** `?preview=1`, the two "Thought Warrior" creature cards after
    Skills.
  - **Expect:** the Standard Action and Immediate Interrupt print their text
    only; directly under the Opportunity Attack's text, the implement rows
    (no caption line naming the commands, owner 2026-11-05), striped and
    divided like a power card's weapon table.
  - **Wrong if:** a "Standard Action · Immediate Interrupt · Opportunity
    Attack" line appears, the rows read as belonging to the next command, or
    a card overflows.

- [ ] **Psion: the ritual choice in the Class flow.**
  - **Where:** `edit?tab=build&level=1&section=class` at 140% zoom.
  - **Expect:** the Psion flow's last step is a Ritual choice (D115): a
    two-row table, Sending and Tenser's Floating Disk, with Tenser's
    Floating Disk chosen; folded, the Class heading reads "Psion · … ·
    Ritual: Tenser's Floating Disk". There is no Ritual row in Other.
  - **Wrong if:** the step sits in its own section or under Other, the table
    lists other rituals, or its heading reads oddly (a bare "Ritual" with no
    context is acceptable only inside the Psion flow).

- [ ] **Psion: free rituals in the Inventory and Shop.**
  - **Where:** `edit?tab=inventory` at 140% zoom, in light and dark theme,
    below the items. Then the Shop: Type → Rituals, search "Tenser".
  - **Expect:** after the item groups, a full-width row holding a compact
    block: a bold "Free rituals" with a grey "(Psion)", then one line
    indented under it, "1 free 1st-level ritual", inset like the cells
    above. Under "Rituals known", Tenser's Floating Disk once, its muted
    line ending "Chosen for Psion"; right-click → Remove is inert with the
    reason. In the Shop its row reads Known with Buy and Learn free
    disabled.
  - **Wrong if:** the block reads like a paragraph or its lines don't sit
    under the heading, it touches the table's edge or squeezes into the
    Item column, Tenser's Floating Disk is listed twice or as "Learned
    free", or grey text is unreadable in dark theme.

## Pass 10: Hu's sheet editing (`hu`)

- [x] **Hu: sheet Edit mode.**
  - **Where:** `?preview=1`. Toggle View | Edit a few times. In Edit,
    open **Sections**: untick Play scratchpad and Session notes, drag Power
    & item cards to the top by its grip, click + on Play scratchpad twice
    and type 3 into Session notes' field. Right-click a power card and an
    item card. Then the browser's print preview.
  - **Expect:** Back and View | Edit stay put; Sections and Reset appear after
    them, Print stays at the right end, and cards look as in View. The
    Sections panel sits right under its button in the app's colours, each
    row with a faint grip, and pages go or move at once. While dragging,
    the row dims and a thin focus-coloured line marks where it will drop.
    The − [n] + steppers fit their rows. A hidden card keeps its header,
    type bar and border at full strength, its body blank with a large faint
    "Hidden". Unnumbered copy pages keep the footer's title and identity
    in place. The printout has no hidden cards and no gaps.
  - **Wrong if:** View | Edit jumps sideways, the toolbar wraps or scrolls
    sideways, the panel is clipped, overflows the window or sits behind the
    paper, a placeholder strip is left where a section was, the drop line is
    invisible or misplaced, the browser opens or searches the dragged text,
    a stepper crowds its label, a hidden card is hard to tell from a shown
    one, or a footer looks lopsided.

## Pass 11: Natan (`natan`)

- [x] **Natan: page 1 and the Play data card.**
  - **Where:** `?preview=1`: page 1's Conditional modifiers pane
    (resistances plus three combined defense rows), then the Play data card
    (first card page).
  - **Expect:** striping alternates continuously across groups; long effects
    wrap inside the Effect column and the Source column stays readable;
    reminders below fill the remaining space and overflow to page 2 with
    the "N more reminders" caption. The Play data card's note lines
    (Senses, then one Defenses line ending "conditional defenses in
    Conditional modifiers", 2026-11-05) sit inside the card at its 7pt note
    size, with room to spare below.
  - **Wrong if:** the pane pushes reminders off the page without a caption,
    rows overlap the footer, the Source column is crushed, the notes
    overflow or clip, or the Defenses line wraps awkwardly (a lone word on
    its last line is fine).

## Pass 12: Trey Spectre (`trey`)

- [x] **Trey: page 1 Conditional modifiers pane.**
  - **Where:** `?preview=1`, page 1's pane of five rows.
  - **Expect and wrong if:** as for Natan's pane.

## Pass 13: Idon Tkare (`idon`)

- [x] **Idon: page 1 and the Play data card.**
  - **Where:** `?preview=1`: the Conditional modifiers pane (Speed and
    Skills & checks rows), then the Play data card.
  - **Expect and wrong if:** as for Natan.

## Pass 14: Skye (`skye`)

- [x] **Skye: page 1 Conditional modifiers pane.**
  - **Where:** `?preview=1`, page 1's pane (saves only).
  - **Expect and wrong if:** as for Natan's pane.

## Pass 15: Piri (`piri`)

- [x] **Piri: Play data card.**
  - **Where:** `?preview=1`, the Play data card.
  - **Expect and wrong if:** as for Natan's Play data card (Piri has
    no Defenses line: no resistances or conditional defenses).

## Pass 16: Hystan (`hystan`)

- [x] **Hystan: type bars and the Play data card.**
  - **Where:** `?preview=1`: Twin Strike, Master Diplomat, Mighty Sprint and
    the Play data card. Then `edit?tab=build&level=1&section=powers`, the
    power cards in dark theme.
  - **Expect:** the type label on the left and "Ranger · Level 1" (and so
    on) on the right with a clear gap; the Play data notes inside the card.
  - **Wrong if:** the right-hand text collides with the type label, clips
    or overflows, or the notes overflow.

## Pass 17: Beldin (`beldin`)

- [x] **Beldin: Ardent Surge's type bar.**
  - **Where:** `?preview=1`, Ardent Surge; then its card at
    `edit?tab=build&level=1&section=powers`.
  - **Expect:** "ENCOUNTER (2×) … POWER" on one line with the class block at
    the right; the card fits its print slot.
  - **Wrong if:** the bar wraps or the right-hand text is pushed off.

## Pass 18: Raidon Kane (`raidon`)

- [x] **Raidon: type bar and movement technique.**
  - **Where:** `?preview=1`: Destined for Greatness, Five Storms and Dragon's
    Tail; then the Build tab with Five Storms selected.
  - **Expect:** Destined for Greatness's class block clear of its type label;
    where "ADROIT EXPLORER · LEVEL 12" wraps, "LEVEL 12" starts the second
    line with no "·" (narrow the window or print to see it; the same holds
    at 140% zoom and in Ctrl+P). On Five Storms and Dragon's Tail the free
    space sits between the attack and, at the card's foot, a full-width
    tinted band like the attack's action band: "≫ MOVEMENT TECHNIQUE · Move
    Action" with "Personal" (Five Storms) at its right, then the technique's
    rules at the body's padding; on the Build tab's panel card the band
    follows the attack with normal spacing. Both cards still fit (no red
    outline).
  - **Wrong if:** text collides or clips, a "·" begins or ends a line of
    the type bar or band, the band is inset or narrower than the action
    band above, a timer icon shows, or free space is left below the band.

## Pass 19: Jim Darkmagic (`jim`)

- [x] **Jim: Spellbook subtitle.**
  - **Where:** `?preview=1`: Expeditious Retreat and Freezing Cloud; then
    their panel cards on the Build tab.
  - **Expect:** a small uppercase "SPELLBOOK" at the right of the title band.
    On the Character Reference pages the Spellbook heading reads just
    "Spellbook", with no spell names after it (they are power cards).
  - **Wrong if:** it wraps under the name or pushes the name off, or the
    reference heading still reads "Spellbook: Expeditious Retreat, …".

## Pass 20: Sylestine (`sylestine`)

- [x] **Sylestine: Blink Dog card and Hybrid Talent.**
  - **Where:** `?preview=1`, the Trained Blink Dog card after Skills and the
    Arcane Wisp. Then `edit?tab=build&level=4&section=feats`, Hybrid
    Talent, and leave its option open to see its issue in the status
    badge's list.
  - **Expect:** the Blink Dog card fits, and its "Standard · At-Will" meta
    text is readable in dark theme. The Hybrid Talent section, its table
    headings and the issue row ("Level 4 Hybrid Talent", "Choose an option
    for Hybrid Talent.") wrap cleanly.
  - **Wrong if:** the card clips or overflows, or a heading or issue detail
    is clipped or overflows its row.
- [x] **Sylestine: Review lands on Hybrid Talent's choice.**
  - **Where:** `edit?tab=build&level=4&section=feats`, leave Hybrid
    Talent's option open, then open the unresolved badge (the "?" in the
    tab bar) and click Review on "Level 4 Hybrid Talent". Try it at 140%
    zoom, and once with the keyboard (Tab to Review, Enter).
  - **Expect:** the Build tab opens on Level 4, Feats, with Hybrid Talent
    expanded and scrolled so step 2's "Hybrid Talent" heading and its class
    feature table are in view (the feat table's pager may show above it).
    The page moves once, after the tables fill, with no visible bounce.
    With the keyboard, focus is on step 2 (a focus ring around it), so Tab
    goes into its table. Clicking a level tab or the level picker
    afterwards never scrolls on its own.
  - **Wrong if:** the page stays at the top of the feat table, scrolls and
    then jumps back, step 2's heading is hidden under anything, or focus
    stays on the badge list or the page.

## Pass 21: Character library

Open `#/characters` with the review characters restored.

- [ ] **Library: header and table.**
  - **Where:** the top of `#/characters` and its table; narrow the window
    below 36rem (about 800px at 140%) and below 60rem (about 1344px at
    140%). For the empty state, open the app in a private window before
    restoring anything.
  - **Expect:** title and version on the left; New, Import, Trash with its
    small square count tag, a thin divider, then Settings, on one line.
    Rows striped and tinted on hover, the selected row tinted with a thick
    accent bar on its left; portraits about 36px; the table's top border
    level with the top of the navy pane. Below 36rem only the icons remain;
    below 60rem the pane sits above the full-width table (2026-11-05). The empty library
    reads "No characters yet." centred inside the table. Use the keyboard
    on the table: there is a visible focus ring and the selection moves,
    not the page. With the default sort (Edited, newest first), scroll to
    the bottom of the table and Import any `sample-chars/*.dnd4e`: the
    page scrolls up just enough to show the new row at the top, selected
    (trash it afterwards).
  - **Wrong if:** after an import no new row is in view or selected, the
    labels wrap, the count tag is round or misaligned, the
    borders don't line up, a horizontal scrollbar appears, or the pane
    overlaps the table.
- [x] **Library: detail pane.**
  - **Where:** select "Review – Summer Sentinel Druid L25 (Bear)", "Review –
    Fey Warlock L11" and "Review – Hybrid Executioner/Fighter L27"; hover
    and use the five buttons. Duplicate a character and select the copy;
    edit `beatrix`'s name, wait 2 seconds and come back; select "Review –
    Missing content (Runepriest copy)".
  - **Expect:** a navy band: a white-bordered portrait about a third of the
    pane wide, the name in the large display font, then the identity, bold
    white role, and paler paragon, epic and Edited lines. Five equal
    buttons, each an icon over a word, in one row at any width; hover
    lightens a button and adds a light-blue bottom line; Export's menu
    opens below the pane with a spinner on .dnd4e; Trash turns pink, then
    dark red "Confirm". The copy shows a faint bar about 9rem wide where the
    role line goes, then the text, with no other line moving; the edited
    character shows no bar; the Missing content copy shows no role line.
  - **Wrong if:** a button wraps to two lines, the menu is clipped by the
    pane, lines jump while the role line loads, holding Arrow Down through
    the table feels sluggish, or a bar stays.
- [x] **Library: trash.**
  - **Where:** trash "Review – Update waiting" and "Review – Missing
    content", click Trash in the header, restore one, then click Empty
    trash….
  - **Expect:** a dialog of striped rows, each with a portrait or
    placeholder, a bold name and a grey "Race Class N · Trashed today"
    line, then Restore and Delete permanently. The footer has the Restore
    hint on the left and a red "Empty trash…" on the right. The "Empty
    trash?" dialog sits over the trash dialog.
  - **Wrong if:** the footer items swap sides or wrap, or the confirmation
    opens behind or beside the trash dialog.

## Pass 22: New characters

Library → New; each entry needs a fresh character.

- [x] **New hybrid: a pick that opens a step.**
  - **Where:** a Hybrid Barbarian/Cleric at level 1, Feats, Feat item:
    double-click Hybrid Talent; before picking the feature, use the
    unresolved-choices badge → Review on "Level 1 Class Feature". Also pick
    Toughness on another character.
  - **Expect:** the page jumps, with no animation, so the "2 Class Feature"
    heading sits near the top with a small margin; Review lands the same
    way. Picking the feature doesn't scroll again, and Toughness doesn't
    scroll at all.
  - **Wrong if:** step 2 stays below the feat table or off-screen, or a pick
    that opens nothing scrolls the page.
- [x] **New fighter: open-choice issue rows.**
  - **Where:** a fighter at level 1, Build tab, with Fighting Style left
    open; then its status badge's issue list.
  - **Expect:** the "Fighting Style" section, its option table, and the issue
    "Level 1 Fighting Style" / "Choose an option for Fighting Style."
    wrap cleanly.
  - **Wrong if:** a longer detail line is clipped or overflows its row.

## Pass 23: Live site and manual steps

These need the deployed app, an installed PWA, or your own content.

- [ ] **Installed app: title bar and icon.**
  - **Where:** in Chrome on macOS, first check the library shows a build
    commit from 2026-11-05 or later (accept **Reload and update** if
    offered), then uninstall and reinstall the PWA (address bar install
    icon; the manifest's colors only change on reinstall) and open it.
    Settings → Display → theme System, Light and Dark in turn, and under
    System switch macOS between Light and Dark. Then the Dock while it runs,
    Launchpad and Cmd-Tab. Repeat the title bar part in Safari (File → Add
    to Dock).
  - **Expect:** the title bar matches the page background (dark navy in
    dark mode, light grey-blue in light), switching at once. At launch,
    before the page loads, Chrome may briefly show its own default frame
    (dark grey in dark mode), never white. The "4E" tile sharp, the size of
    other app icons, with the 4's left corner and the E's right edge
    visible.
  - **Wrong if:** the title bar stays white or cream in dark mode, lags a
    reload behind, or ignores the macOS switch; the icon is generic, blank,
    blurry, cropped by the macOS mask, or sits in a white square. If the
    bar stays white, note the browser and the app window's DevTools
    (Cmd-Opt-I) Console result of
    `document.querySelector('meta[name=theme-color]')?.content`.
- [x] **Browser tab: favicon.**
  - **Where:** the app in a normal Chrome tab with the tab strip light (macOS
    Light) and dark (macOS Dark); hard-reload once (Cmd-Shift-R).
  - **Expect:** the blue rounded tile with a cream 4 and a light-blue E, both
    legible at tab size on either strip.
  - **Wrong if:** the old single-glyph icon shows, the E is lost, or the tile
    blurs into the dark strip.
- [x] **Settings: Restore backup dialog and confirmation.**
  - **Where:** Settings → Backups & storage: **Back up library**, then
    **Restore backup** with that file, in a window narrow enough to wrap
    the buttons; choose Keep both (or Replace them).
  - **Expect:** a modal dialog whose one sentence names every conflicting
    character, and Cancel, Keep both and a red Replace them on one row,
    wrapping cleanly when narrow. After the choice, a grey line under the
    Back up library / Restore backup buttons reads "Restored N characters."
    (with "(M to the trash)" when the backup holds trashed ones) and an
    "Open library" link that goes to `#/characters`.
  - **Wrong if:** the name list overflows or is cut off, the buttons wrap
    raggedly, the confirmation line is missing, crowds the buttons, or its
    link is unreadable in dark theme.
- [x] **Erdan: feature notes on your own content.**
  - **Where:** the review pack lacks Erdan's Disruptive Shot features, so
    import `sample-chars/Erdan 11.dnd4e` with your own content, then
    `?preview=1`, page 1 class features.
  - **Expect:** "Weapon Mastery — Gain +1 to damage rolls of weapon attacks"
    and "Level 7 Improved Disruptive Shot — Use three times per encounter".
  - **Wrong if:** "Disruptive Shot" or "Level 3 Improved Disruptive Shot"
    rows show, or a note ends in "@…".

## Decisions

Open judgement calls, not pass/fail checks. Look while you are on the
pass named.

1. **Card paragraphs and dividers** (Pass 1): with a gap between paragraphs,
   keep the small first-line indent on a following paragraph, or never
   indent card paragraphs? Keep the thin flavor divider on every choice
   card, or drop it everywhere?
2. **Class name in feature rows** (Pass 1): "Barbarian Agility" and "Fighter
   Talents" keep the class name because it starts the feature's own name,
   not a "Level N" slot name. OK?
3. **Familiar header colour** (Pass 4): in dark theme the builder card's
   header turns the generic dark green panel colour instead of the teal
   used in print. Keep it, or keep teal?
4. **Bear Companion Notes cards** (Pass 6): the sentinel also prints "Bear
   Companion Notes (1)" and "(2)" power cards, content powers that repeat
   the beast card's aura and notes. Keep them?
5. **Mount card arrangement** (Pass 8): do the one-row tiles and the load
   table at the bottom read well, or want another arrangement?
6. **Alias wording** (`hu` → `sheet`, Battle Awareness): its body reads
   "Choices: Athletics; counts as Fighter". Does that read well?
