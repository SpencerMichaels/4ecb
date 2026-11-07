# Visual review checklist

**Approved (2026-11-05).** The product owner walked every pass and approved
them; M5.7 and M5.75 are closed. Keep the entries for future regression
walks.

**Reference pages and Session notes are off by default (2026-11-06, D099
amendment).** A sheet without layout choices prints only the overview, the
play scratchpad and the cards. For an entry on the Character Reference
pages or Session notes, first turn them on: `?preview=1` → Edit →
**Sections**, tick the reference groups (or Session notes), then back to
View. Untick them to turn them off again.

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

**Campaigns (2026-11-06).** Pass 24 adds five walk-through entries for
D116, folded from the 35 checks of the campaign steps; they need a built
campaign rather than a review character, so the review page lists them
under its general sections.

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
  - **Where:** `?preview=1` with Feature reference ticked in Sections, the
    Character Reference pages: Past life and the two Guardian Feature rows.
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
- [ ] **Beatrix: Inventory and Shop end at the window.** Added 2026-11-06;
      the CSS rule, the table's place in its scroller and the room left for
      what follows it (the pager) are unit-tested and the drawer-layout
      height was measured on a DOM skeleton, this is the real page.
  - **Where:** `edit?tab=inventory` with every band open (Worn items,
    Adventuring gear, Rituals, …) until the list is longer than the
    window, then the Shop (All items); at 140% zoom in your usual window,
    then narrowed below 63rem (about 1411px at 140%) so the sidebar
    becomes the drawer, and in a short window. Select a row each time.
    Then the Build tab's Level 1 feat choice (a table over 200 rows, so
    with a "Rows 1–200 of N" pager) in the same two layouts.
  - **Expect:** the table's frame ends just above the Shop's pager
    (Previous · "1–200 of N" · Next), and the pager just above the
    window's bottom edge, in the docked and the drawer layout alike; the
    Inventory's frame (no pager) ends just above the window's bottom edge.
    The wheel scrolls the rows inside it while the Item / Quantity header
    stays put; the page itself has no scrollbar to reach the last row or
    the pager. Collapsing bands shrinks the frame to its rows. The item
    card sits beside the table, as in the Shop. Loadout is unchanged. The
    feat table and its pager fit the same way.
  - **Wrong if:** you must scroll the page to reach the pager or to see
    the last row, the frame ends far above the window bottom with a long
    list, the header scrolls away, or the table stays tall after
    collapsing bands.

- [ ] **Beatrix: striped tables.**
  - **Where:** `edit?tab=inventory` (scroll through Worn items), then the
    Shop (All items, then Type → Rituals), then Retraining; compare each
    with the Build tab's feat table (`edit?tab=build&level=2`, Feat).
    Hover a few rows, click one to select it in the Shop and Retraining,
    and Tab onto a row's name. Light and dark theme, at 140% zoom.
  - **Expect:** every table's rows alternate plain and shaded in the same
    two colours as the feat table; under each navy group band (Armor &
    shields, Worn items, Adventuring gear, …) the first row is plain and
    the shading alternates from there. Hovering a row tints it blue over
    either shade; a selected Shop or Retraining row keeps its blue
    selection tint and accent bar on a shaded row too; a focused name
    still shows its focus ring/underline.
  - **Wrong if:** two neighbouring rows share a shade inside one group, a
    group's first row is shaded, a band takes a stripe colour, a table's
    shades differ from the feat table's, the hover tint or a selection
    disappears on a shaded row, the disabled "−" quantity button or muted
    text becomes hard to read on a shaded row, or the stripes are
    invisible in dark theme.

- [ ] **Beatrix: build overview.**
  - **Where:** `edit?tab=overview` (the Overview tab, second in the tab
    bar); scroll levels 1 to 8, hover a few rows and Tab through them,
    then click Level 1's Race row, come back, click a Level 4 or 8 row
    (Ability Increases, a feat), and a Details row (Gender or Alignment).
    Click the Level 1 and Level 3 headings (and press Enter/Space on a
    focused heading) to collapse and reopen them, then switch tabs and
    back. Compare with the Build tab's feat or power table. Repeat at 140%
    zoom and in dark theme.
  - **Expect:** one "Level N" section per level, each headed by a navy
    band like the Inventory's item groups (chevron and "Level N" only, no
    number after it), then its rows flush under the band in the candidate
    tables' alternating stripes (plain, shaded, plain…, the same two
    colours as the feat/power tables in both themes): the first row under
    every band is plain and the shading alternates straight through the
    level's Character, Feats, Powers and Other rows, with no line and no
    gap between rows or groups, so the bands are the only breaks. Each row
    reads its slot title in bold, then the picks in muted text that wraps
    rather than clipping, and the Build tab's green check (or amber "?"
    for an open required choice) at the right edge, aligned across rows. A
    level with no choices shows "No choices at this level" under its
    band. Hovering a row tints it the tables' blue over its stripe;
    keyboard focus draws the focus ring and underlines the row's title, as
    a focused table name does. Clicking a band (or Enter/Space on it)
    folds that level to just its band, the chevron turning from down to
    right, and unfolds it again; the other levels stay as they were; after
    switching tabs every level is open again. Clicking a row opens the
    Build tab at that level and section with the choice's item expanded,
    scrolled to and focused (Details rows open Details on that choice).
  - **Wrong if:** a band shows a count, two neighbouring rows share a
    shade (e.g. at the Theme → Feat or Feat → Daily power boundary in
    Level 1), the stripe colours differ from the feat/power tables', a gap
    or line splits a level's rows, a band looks different from the
    Inventory's group bands (colour, height, chevron), the band's text or
    a hovered/striped row's text is hard to read in dark theme, a
    collapsed level leaves a gap or stray text, titles and picks don't
    line up into columns, long picks are cut off or push the status icon
    out of the row, the list overflows sideways at 140% zoom, the tab's
    icon looks like another tab's, or a click lands on the wrong level,
    section or item.

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

- [ ] **Drow invoker: Equipment and Shop.**
  - **Where:** `edit?tab=inventory`, select the Scarf of Reconciliation +2
    and look at its Caelynnvala's Boons card. Then in the Shop buy a
    Siberys Shard of Merciless Cold (heroic tier), a Longsword, Armor of
    Adaptable Resistance +1 and a Harper Pin (heroic tier), looking at the
    Shop's choice pages for the last two. Back in Inventory select the
    shard and press "Attach to Rose Scythe of Chauntea" above its card,
    then select the Longsword, the armor and the pin; right-click each of
    them too. Also in the Loadout, focus the Longsword's slot. At 140%
    zoom and in both themes.
  - **Expect:** "Party pieces" beside a small number box, the grey hint
    below; the scythe's "Augment: …" note muted with the row's columns
    aligned; above each selected item's card a row of plain buttons: the
    shard's "Attach to …" toggles (the scythe's with a check and the accent
    fill once on) and Detach (greyed until attached, tooltip saying why);
    the Longsword's "Wield two-handed" toggle; "Choose a damage type…" and
    "Choose a power…" buttons opening the choice dialog; each right-click
    menu lists the same actions in the same order and state; every row and
    menu readable and unclipped.
  - **Wrong if:** the Party pieces label and box wrap apart or overflow the
    card, the hint is unreadable on the dark card, the augment note is
    warning-coloured, the columns shift, a menu is clipped, the button row
    overflows the pane or squeezes the card, a toggle's on state shows only
    by colour, or the pane and the menu disagree.
- [ ] **Drow invoker: grouped Conditional modifiers rows.**
  - **Where:** `?preview=1`, page 1's Conditional modifiers pane (also at
    140% zoom).
  - **Expect:** the Scarf of Reconciliation is three rows ("+2 item bonus to
    Intimidate and Stealth checks while you have a drow ally within 10
    squares of you", then Arcana and History, then Perception and Nature),
    each wrapping inside the Effect column with the Source column readable;
    the reminders below gain the freed space.
  - **Wrong if:** a row's wrap pushes the Source column narrow or overlaps,
    or the pane is taller than before.
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
    scroll to "Rituals" below the items, click a ritual, click its trash
    Remove once (it arms; press Escape), right-click it, then hover and
    right-click a granted one (its greyed Remove button and menu item say
    "Granted by Invoker; it can't be removed."). Then the Shop: open the Type
    list, choose Rituals, then Alchemical formulas and back to All items.
  - **Expect:** "Rituals" (no "known") reads like the item groups above
    it, its count the same size and weight as the word; each row is the
    book icon and the name alone, left-aligned in the Item column exactly
    where item names sit (no subtitle line, no "Learned free"/"Granted
    by"), the Quantity column empty and the actions column holding the
    same trash Remove as the item rows, in the same place; the first click
    arms it (red, warning icon) and a second removes a learned ritual. The detail pane
    shows the ritual's card: under the name a shaded subheader, one line
    "CATEGORY Exploration · TIME 10 minutes · SKILL Nature" (one-word
    labels; a long skill list wraps inside it); the body opens with
    "Duration: …" and "Cost: …" lines (and "Prerequisite: …" when there is
    one) in the body's rule style, then the description, the market price in the footer and "Ritual …
    Level N" in the type bar. Choose a martial practice (Alter Ego, on a
    character that knows one, or in the Shop's Martial practices): its
    description shows too and the type bar reads "Martial Practice". In
    the Shop's Alchemical formulas choose Acidic Fire, then Woundpatch: the
    card's icon is the flask its row shows (a practice's the dumbbell, a
    ritual's the book), "Cost:" reads "Item's price", and after the
    description a "Creates:" line lists the versions ("Acidic Fire — level
    5 (50 gp), 10 (200 gp), …, 30 (125,000 gp)"; Woundpatch's three
    levels) in the body's rule style, wrapping within the card. The
    right-click menu has Remove; on the granted ritual both Removes are
    greyed, their tooltip saying why. In the Type list the three learning categories
    follow the items as ordinary entries, with no group heading. In every
    category the toolbar (Type, Slot, Subtype, search, Affordable,
    Proficient, Filters) and the table's columns stay in the same places;
    the Level header is on one line; a learned ritual's row reads Known
    with its buttons disabled.
  - **Wrong if:** the count is smaller than the title, a ritual name sits
    at the right or in a different column/indent than item names, the
    card has no description or repeats the subheader fields in its body,
    a formula's card shows a book or "See below", the Creates line is
    clipped, cramped or styled unlike the body text,
    a known row has no Remove button or one out of line with the item
    rows', a granted ritual's Remove arms or looks enabled, a ⋮ button
    appears, the menu is clipped, a toolbar
    control moves or disappears between categories, "Level" breaks onto
    two lines, or grey text is unreadable in dark theme.
- [ ] **Drow invoker: Angelic Harrier weapon table.**
  - **Where:** `?preview=1`, the Angelic Harrier power card; then
    `edit?tab=build` at level 1, select Angelic Harrier and look at its
    card. At 140% zoom and in both themes.
  - **Expect:** the weapon table's "Dmg 1"/"Dmg 2" headings and every
    to-hit and damage value sit on one line; a long implement name wraps
    instead (its continuation hanging under its first word). The printed
    card still fits at a readable size.
  - **Wrong if:** "Dmg 2" (or any heading or number) breaks over two lines,
    the weapon column stays wide while a number column wraps, the table
    overflows the card, or the printed card's text shrinks noticeably
    compared with its neighbours.
- [ ] **Drow invoker: Play data card width.**
  - **Where:** `?preview=1`, the first card page's Play data card (the
    review name is longer than the card); then the browser's print preview.
    At 140% zoom.
  - **Expect:** the name sits on one line; a name too long for the card
    first shrinks, down to the size of the "Drow Invoker 11" line under it
    and no smaller, and only then is cut off with "…" (hover shows the full
    name). Every stat
    group (abilities, defenses, HP row, Init/Speed/passives, Senses and
    Defenses lines) fits inside the card's border, with the same right
    margin as the Skills card beside it.
  - **Wrong if:** the stat tiles or note lines run past the card's right
    border or are cut off there, the name wraps onto a second line, is
    cut off while still larger than the line under it, ends up smaller
    than that line, or the card is wider than its neighbours.
- [ ] **Drow invoker: Spiderling speed on one line (2026-11-06).**
  - **Where:** `?preview=1`, the Spiderling of Lolth familiar card; then in
    the builder open the familiar choice from `edit?tab=overview` (the
    familiar feat's row) and select Spiderling of Lolth for its pane card. Also
    the Blade Angel creature card's Speed/senses line. At 140% zoom and in
    both themes.
  - **Expect:** the Speed tile's "6, climb 6 (spider climb)" (or the
    record's speed) sits on one line, a little smaller than the HP number
    if it has to be; the Senses line stays on one line. On the creature
    (and any beast or associate) card the Speed and senses items each stay
    whole: senses may move to the next line, but "climb"/"fly" never
    breaks away from its speed. The printed card still fits with no red
    "Text exceeds card" outline.
  - **Wrong if:** the speed wraps between words while still larger than
    the card's small text, the value is cut off or runs past the tile's
    edge, it shrinks far more than needed (much smaller than the senses
    text when there is room), or the card's other text shrinks
    noticeably compared with before.

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
    above. Under "Rituals", Tenser's Floating Disk once, its name alone
    (no "Chosen for Psion" line); right-click → Remove is inert with the
    reason "Chosen for Psion; it can't be removed." In the Shop its row
    reads Known with Buy and Learn free disabled.
  - **Wrong if:** the block reads like a paragraph or its lines don't sit
    under the heading, it touches the table's edge or squeezes into the
    Item column, Tenser's Floating Disk is listed twice or with a
    source line, or grey text is unreadable in dark theme.

## Pass 10: Hu's sheet editing (`hu`)

- [x] **Hu: sheet Edit mode.**
  - **Where:** `?preview=1`. Toggle View | Edit a few times. In Edit,
    open **Sections**: untick Play scratchpad, tick Session notes, drag Power
    & item cards to the top by its grip, click + on Play scratchpad twice
    and type 3 into Session notes' field. Right-click a power card and an
    item card. Then the browser's print preview.
  - **Expect:** Back, Print and View | Edit stay put; Sections and the
    hint appear after them, and cards look as in View. The
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
- [ ] **Hu: Edit mode toolbar hint (D099 amendment, 2026-11-06).**
  - **Where:** `?preview=1&edit=1`. Look at the toolbar, then a utility
    power card's top-right corner and page 1's reminder panels. Right-click
    a card and a reminder row. Switch to View, then open the browser's
    print preview from Edit. At 140% zoom and in both themes.
  - **Expect:** after Sections, small muted text "Right-click a
    card or reminder to hide or show it; drag cards to reorder."; no eye
    icons anywhere, so the power card's [E] [D] [W] usage icons are fully
    visible; right-click flips a card or row as before. The hint is gone in
    View and in the print preview.
  - **Wrong if:** the hint is too faint to read or louder than the
    buttons, it moves a button, it wraps awkwardly at 140% zoom, or an eye
    icon remains.
- [ ] **Hu: sheet toolbar (D099 amendment, 2026-11-06, toolbar cleanup).**
  - **Where:** `?preview=1` then `?preview=1&edit=1`, at 140% zoom and
    in both themes; narrow the window until the toolbar wraps.
  - **Expect:** Back, Print, View | Edit (and in Edit, Sections) are one
    height in one row, with no "Sheet" label and no Reset; in Edit the
    hint fills the rest of the row and, when narrow, drops to its own line
    under the buttons. Back's tooltip reads "Return to builder" from the
    builder (or opened directly), "Return to library" from the library.
  - **Wrong if:** any of the four controls is taller or shorter than the
    others, their text or icons sit off-centre, Print or Sections moves
    between View and Edit, or the hint's wrapping pushes a button onto a
    new line.
- [ ] **Hu: scratchpad magic item dailies (2026-11-06).** Added 2026-11-06,
      redone the same day (one row, labels above, panel renamed); the box
      counts per tier, the markup and the even spacing are tested
      (`derived-values.test.ts`, `SheetOverview.test.tsx`, `check:print`
      measures the row), this is the row's look.
  - **Where:** Hu Sheng-Ming Level 8, `?preview=1`, the Play scratchpad's
    Resources panel (it was "Health"), at 140% zoom and in both themes;
    then the browser's print preview in Letter and in A4 (Settings → paper
    size). Repeat on a paragon character (Beldin Hammertongue 11 or Max
    Unger 12).
  - **Expect:** the panel heading reads "Resources" (heart icon). One
    tracker row, two lines tall, every label above its marks in the grey
    of the "Current HP"/"Temporary HP" labels: "Death saves" over three
    skulls; "Item dailies + Milestones" over one unbroken row of boxes, one
    solid box at heroic (two at paragon, three at epic) then four dashed
    ones, every box the same distance apart, label and boxes on one centre
    line like the other three trackers;
    "Action points" over three circles on the right. Boxes match the daily
    power boxes below in size and stroke. The tracking tables below still
    start on the first page where they did.
  - **Wrong if:** the row wraps at either paper size, there is a wider gap
    between the solid and dashed boxes, the dashed boxes are hard to tell
    from the solid ones (or vanish in print), a label sits below its
    marks or off its marks' centre, or the panel's height pushes power
    tracking to an extra page.
- [ ] **Beldin: printed Power Points (2026-11-06).** Added 2026-11-06,
      tracker redone the same day; the value, its absence below 1 and the
      boxes/write-in choice are unit-tested (`overview.test.ts`,
      `sheet-gaps.test.ts`, `SheetOverview.test.tsx`), and `check:print`
      measures three boxes in the row; this is the tile's and the tracker's
      look.
  - **Where:** Beldin Hammertongue 11 (pool 9) and Azreille (pool 4),
    `?preview=1`: page 1's numeric band, then the Play scratchpad's
    Resources panel; at 140% zoom and in both themes, then the browser's
    print preview in Letter and in A4. For the boxes, a new level-1 Psion
    (pool 2). Compare with a non-psionic (Hu Sheng-Ming Level 8).
  - **Expect:** page 1's Health group shows Max HP, Bloodied, Surges, Surge
    HP, then "Pwr Pts" 9, its tiles the same size as the Defenses tiles;
    Initiative and Speed keep their single tiles. On the scratchpad's
    tracker row, between Item dailies and Action points, "Power points"
    above a small bordered write-in box followed by "/ 9" (Azreille "/ 4"),
    the same box as the Consumables pane's counts but row height; the
    level-1 Psion shows two solid pencil boxes instead. The row stays two
    lines tall. Hu's page 1 and scratchpad have no tile and no tracker.
  - **Wrong if:** "Pwr Pts" or any Health/Defenses label is cut off with
    an ellipsis, the band overflows the page width, the tracker wraps or
    crowds its neighbours, the write-in box is invisible in print or taller
    than the other marks, or the panel's growth pushes power tracking to
    an extra page.

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

- [ ] **Piri: rituals on the sheet.** Added 2026-11-06; that no source
      line remains is verified automatically, this is the look.
  - **Where:** `?preview=1` with Rituals & practices ticked in Sections,
    the reference pages' "Rituals & practices" entries (Animal Messenger is druid-granted); then the on-screen sheet's
    Rituals & practices cards, light and dark theme.
  - **Expect:** each entry starts with the ritual's description, then its
    fields under the card's one-word labels (Skill, Cost, Price; the label
    text itself is unit-tested); each card starts with its subheader
    right under the name, no gap where a heading line was.
  - **Wrong if:** "Granted by" or "Chosen for" shows anywhere, or a card
    keeps an empty band above its subheader.

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
- [x] **Beldin: an augmentable power is one card (D118).**
  - **Where:** `?preview=1`, the power cards: Stygian Strike, Energizing
    Strike and Adept's Insight; then the Build tab at level 11, the paragon
    path's power choice, Stygian Strike's detail pane (and Energizing Strike's
    at level 1).
  - **Expect:** one card per power, titled with the plain name (no "(Augment
    N)"): the unaugmented attack band and rules (Stygian Strike +18 vs Will,
    1d10+11), then an "Augment 2" heading and "Hit: As above, and you or one
    ally can make a melee basic attack …". Energizing Strike has "Augment 1"
    and "Augment 2" sections; Augment 2 starts with "Staggering Flail +3:
    2d10+11 damage" and "Unarmed: 2d4+8 damage" lines before its Hit. Adept's
    Insight (a feature card) shows "Augment 1 / Effect: You instead add
    1d4+1 …". The builder pane shows the same card. The longer printed cards
    still fit their slot (smaller text at worst) and look right in dark mode
    in the builder and at 140% zoom.
  - **Expect (scratchpad):** the Encounter powers table has one row each for
    Stygian Strike and Adept's Insight; a row ending in a parenthetical wraps
    before the "(", never inside it.
  - **Wrong if:** a version still has its own card or row, an augment
    section is missing or repeats the whole base Hit where the book says "As
    above", the augment heading looks unlike the card's other labels, or a
    card overflows its print slot.

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
    On the Character Reference pages (Feature reference ticked in
    Sections) the Spellbook heading reads just
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
- [ ] **Sylestine: Overview names the pact choice.**
  - **Where:** `edit?tab=overview`, level 12 (and the Build tab's level 12
    for comparison).
  - **Expect:** the row reads "Twofold Pact: Dark Pact", as on the Build
    tab.
  - **Wrong if:** it reads "Eldritch Pact: Dark Pact".

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
- [ ] **Akagi: at-will group heading.**
  - **Where:** import `sample-chars/Akagi 4 2.dnd4e` with your own content;
    Build tab level 1, then the Overview's level 1.
  - **Expect:** both head the at-will group "At-Will Powers".
  - **Wrong if:** the two differ (one reads just "Powers").
- [ ] **Multiclass power swap stays on the Build tab.**
  - **Where:** any character with a multiclass feat taking Novice Power
    (level 4+) or Paragon Multiclassing; that level's Build tab, then
    Retraining.
  - **Expect:** the swap is on the Build tab at its level, and step 2 lists
    powers after a double-click in step 1; Retraining doesn't show it.
  - **Wrong if:** the swap appears only under Retraining, or step 2 is
    empty.
- [ ] **Wren: power swap and retraining replacements.**
  - **Where:** import `sample-chars/Wren.dnd4e` with your own content.
    Build tab, level 13: open the power swap and double-click a power in
    step 1. Then Retraining, level 30: open "Retrain a power", look at step
    2, double-click a step-1 power; repeat under "Retrain a feat".
  - **Expect:** the Build-tab swap's step 2 lists about 53 powers. On
    Retraining, before a pick step 2 reads "Double-click a power in step 1
    to choose it." ("a feat" under feats); after the double-click it
    briefly reads "Listing the replacements…", then lists them.
  - **Wrong if:** either step 2 stays empty, says "No matching powers."
    while loading, or the prompt names the wrong kind.

## Pass 24: Campaigns (D116)

Added 2026-11-06, not yet walked. The campaign UI's labels, states and
outcomes are checked by its unit tests (`CampaignSettings`,
`campaign-settings-ui`, `runtime-content`, `CharacterCampaignField`, `content-update`, `imported-campaign`,
`builder-diagnostics`); these entries are the layout and the end-to-end
flow. No review character covers them.

**Setup.** Build the Pathfinder campaign:
`pnpm content-tool campaign build --manifest content/campaigns/pathfinder/campaign.json --output tmp/campaigns/pathfinder.4ecc --against tmp/content/full-local.4ecp`
(or the synthetic one from `fixtures/campaigns/synthetic/campaign.json`).
For the hosted entries, also host it on a local container:
`pnpm content-tool advertise-campaign tmp/campaigns/pathfinder.4ecc --out-dir deploy`
and restart it (`docs/public-deployment.md`). For a second revision, bump
`revision` in a copy of `campaign.json` (restrict another deity, e.g.
Moradin, or an item a character holds), build and import or advertise it.

- [ ] **Settings → Campaigns: table, row buttons and remove.**
  - **Where:** `#/settings` in a browser with no campaigns, then Import
    campaign… with the built `.4ecc` (not hosted); use its row's Export
    and Remove buttons, with and without a character in the campaign; once
    at 140% zoom. Also import a `.4ecp` or a corrupted file.
  - **Expect:** the Campaigns panel under Game content spans both columns;
    the empty table keeps its headers with a muted "No campaigns in this
    browser." row and Import campaign… below. Columns read Name,
    Description, Revision, Characters. A row shows the bold name with the
    muted ID under it; Description (Pathfinder: "Replaced 4e's gods and
    languages with their equivalents from Pathfinder's campaign
    setting.") takes the spare width, wraps and is cut off after three
    lines like the builder tables' Description column, and a campaign
    without one (e.g. one created from a legacy save) has an empty cell;
    Revision and Characters narrow and right-aligned. The row buttons sit
    at the row's right end, the same size and style as the content packs table's Replace…/Remove; a
    disabled one is greyed with a hover reason. Esc in the inline remove
    confirmation closes only it. The confirmation sits under the row; a
    bad file is a "Couldn't import <file>" toast. Right-click
    on a row opens only the browser's own menu.
  - **Wrong if:** the table or the Import button is hidden when empty, a
    row button is missing instead of disabled, the name is squeezed to
    one word per line by the Description column at 140% zoom, the
    buttons wrap awkwardly or overflow at 140% zoom, the confirmation
    overlaps the table, Esc also leaves the page, or a Copy invite link
    button is still there.
- [ ] **Hosted campaigns: automatic install, Remove disabled.**
  - **Where:** the local container advertising the campaign, in a clean
    browser profile (or after removing the campaign in a browser where it
    was imported and not hosted): load the app, wait a moment on the
    library, then open `#/settings` → Campaigns and a character's Details
    → Campaign select. Hover the hosted row's Remove; then open an old
    invite link `#/campaigns/join/pathfinder`. Once at 140% zoom and in
    dark theme.
  - **Expect:** with no click, the hosted campaign is listed in Settings →
    Campaigns (name, description, revision, 0 characters) and offered in
    the Details select; no Join button or invite page anywhere. Its Remove
    is visible, greyed like the other disabled row buttons, with the hover
    reason "Hosted by your group's server", and clicking it does nothing.
    The old invite link lands on Settings with the address bar reading
    `#/settings`.
  - **Wrong if:** the campaign needs a reload or a click to appear, a
    toast or banner reports the background download, Remove is hidden or
    opens the confirmation, the greyed button is illegible in dark theme,
    or the old link shows a blank page or the library.
- [ ] **Pathfinder character: Details, deity, items and Shop.**
  - **Where:** a character in the campaign: Details → Campaign select;
    Build → Deity with Show all off and on; a character that worships
    Moradin (or holds a restricted item) moved into the campaign, its
    house-rule issue's Review; the Shop's All items, a category and a
    search; then a character outside any campaign. With no campaigns
    installed, the Details select once more.
  - **Expect:** the Campaign select matches the Player/Company inline
    fields with a muted "Campaign" prefix; with no campaigns it offers only
    None with a hint and Settings link below. Choosing a campaign asks
    "Move <name> into <campaign>?" and None asks "Take <name> out of its
    campaign?"; Cancel leaves the select unchanged. Show all off lists only
    the campaign's 77 deities (revision 9), in bands Inner Sea major
    deities 19, Other deities 28, Elven 3, Dwarven 10 (Torag among them),
    Eldest 9 and Archdevils 8, in that order; Barbatos's card subheader
    has a "COUNTS AS Bel" line, Moloch's "COUNTS AS Bane, Glasya",
    Dispater's no Counts as line, and each card's source reads "Pathfinder". On, the
    stock ones are greyed and
    unselectable, labelled "Unavailable in this campaign". The worshipper has one
    issue, "Moradin is not used in this campaign.", whose Review opens the
    Deity choice; a restricted held item stays held, its issue's Review
    selecting it in the Inventory. The Shop never lists a restricted item,
    nor offers a restricted base weapon in the purchase dialog. The
    outside character's Deity list and Shop are unchanged.
  - **Wrong if:** a restricted option is selectable or worded as an
    "allowed sources" problem, an issue is reported twice, or greyed rows
    are illegible at 140% or in dark theme.
- [ ] **Deity table Domains column and counts-as search (D042 amendment).**
  - **Where:** at 140% zoom, light and dark theme: a stock character's
    Build → level 1 → Deity, then Details → Deity; widen and narrow the
    window, and open/close the sidebar drawer below 63rem. Type "Moradin"
    in the filter; then a Pathfinder campaign character's Deity table with
    "Moradin" (and "Pharasma" or another stock name its deities count as),
    its Race table with a stock race name its counts-as races stand in
    for, and a language choice filtered the same way. Also
    "Protection" in a deity filter.
  - **Expect:** with room (table at least 40rem wide), columns read Deity,
    Alignment, Domains, Description; Domains lists the domain names
    ("Creation, Earth") or "—", wraps within about 10rem and sorts. Narrower,
    Domains disappears with no gap or empty column, and Description takes
    the space; each pantheon band and the "No matching deities" row still
    span the full table width at both widths, with their counts at the
    right edge. "Moradin" lists Moradin and the deities that count as him
    (Torag in the campaign); a race or language is found by what it counts
    as; "Protection" finds deities of that domain.
  - **Wrong if:** a blank or sliver column stays when Domains is hidden,
    a band stops short of the right edge or overhangs it, the switch
    follows the window instead of the table (e.g. Domains squeezed beside
    the detail pane), or a Torag worshipper's "must worship Moradin" feat
    loses its "met through Torag" note.
- [ ] **Deity card subheader.** Added 2026-11-06; lines, order, omissions
      and the body are unit-tested (`deity-card.test.tsx`), this is the look.
  - **Where:** at 140% zoom, light and dark theme: a stock character's
    Build → level 1 → Deity, click Avandra (all three fields), then a deity
    without domains if the list has one (else any); Details → Deity, the
    same cards; a Pathfinder campaign character's Deity, click Barbatos
    (Counts as) and Dispater (none). Then print preview's Character
    Reference page, the Deity entry.
  - **Expect:** under the title band a shaded subheader in the ritual
    cards' style, small uppercase one-word labels, no rules between its
    lines: "ALIGNMENT Good · PANTHEON Core" on the first line, "DOMAINS
    Change, Luck, Trickery" on the next, and on a counts-as deity "COUNTS
    AS Bel" on a third; an empty field or line is simply absent. The body
    starts with the description; no "Alignment", "Pantheon", "Domains:"
    or "Counts as:" line repeats below it; domain cards follow the card
    as before. The printed Deity entry lists Alignment, Pantheon, Domains
    (and any Counts as) before its description.
  - **Wrong if:** the subheader looks different from a ritual card's
    (other tint, divider lines between its rows, mixed-case labels), its
    padding doesn't line up with the title band's text, Pantheon wraps
    under Alignment while there is room, the subheader is unreadable in
    dark theme, or a field shows twice.
- [ ] **Feat card subheader.** Added 2026-11-06; lines, order, omissions
      and body lines are unit-tested (`entity-card-fields.test.tsx`), this
      is the look.
  - **Where:** at 140% zoom, light and dark theme: any character's Build →
    a feat choice; click Weapon Focus (no Type), then Armor of Bahamut
    (Type "Divinity"), Arcane Initiate (Type "Multiclass Wizard") and
    Power of Creation (Powers and Associated Power Info; a divine
    character sees it).
  - **Expect:** under the title band the deity cards' shaded subheader:
    "TIER Heroic · TYPE Divinity" (just "TIER Heroic" without a type).
    The body reads "Prerequisite: …", the benefit text, then "Powers: …",
    "Associated Power Info: …" and "Special: …" lines when the feat has
    them; no "Tier:" line at the end any more.
  - **Wrong if:** the subheader differs from a deity or ritual card's, a
    long multiclass Type pushes Tier onto its own line, or Tier or Type
    shows again in the body.
- [ ] **Duplicate card fields dropped.** Added 2026-11-06; which rows go
      is unit-tested, this is the look of what remains.
  - **Where:** at 140% zoom: a fighter's Build → level 1 → Class, the
    Combat Challenge feature card in the "Level 1" fold; a dragonborn's
    Race → Dragon Breath trait card; any paragon path card (e.g. Kensei)
    and an epic destiny (Archmage: its Immortality section); a monk's Shop
    → Ki Focus of Fury +2 (or any ki focus), a Flaming Longsword +2, a
    Club (Large) if listed, and the artifact Axe of the Dwarvish Lords
    (Details or Inventory, if a character holds it); print
    preview's Character Reference for a level-21 character's epic destiny.
  - **Expect:** no "Level: 1", "Type: At-Will" or "Power Name: Spells"
    lines; the Immortality section starts with its text (or its own
    heading such as "Living the Destiny"), not a repeated "Immortality"
    line; the ki focus has no "Implement: Ki Focus" and the magic items no
    "Enhancement: +2 attack rolls and damage rolls" rule (an artifact
    without "+N" in its name keeps its Enhancement); the club no "Size".
  - **Wrong if:** a card loses a line that was not a duplicate (an
    artifact's enhancement, a class feature's Type that grants no power),
    or a card body now opens with a stray empty gap where a row was.
- [ ] **Class card subheader.** Added 2026-11-06; lines and body lines are
      unit-tested and checked on the real Hexblade and Paladin
      (review:verify), this is the look.
  - **Where:** at 140% zoom, light and dark theme: Build → level 1 →
    Class, click Hexblade, Paladin, Warden and Ranger; a hybrid character's Hybrid class choice (e.g.
    Hybrid Fighter).
  - **Expect:** under the title the shaded subheader: "ROLE Striker ·
    SOURCE Arcane", then "HP 12+ Constitution Score · LEVEL 5 · SURGES
    6+ Constitution Modifier" (the three may wrap onto two lines at 140%,
    a field never splitting), then "DEFENSES +1 Fortitude, +1 Will". The
    body opens with the short description in plain text (no bold "Arcane
    Striker."), then "Abilities: …", "Armor: …", "Weapons: …",
    "Implements: …", "Trained: …", "Class skills: …", "Builds: …" lines,
    then About and the class features.
  - **Wrong if:** the HP line overflows the card or splits a value
    oddly, the body lines look unlike a feat card's "Powers:" lines, or
    role, source, hit points or defenses also appear in the body.
- [ ] **Background card subheader.** Added 2026-11-06; lines, omissions
      and order are unit-tested, this is the look.
  - **Where:** at 140% zoom, light and dark theme: Build → level 1 →
    Background; click Bloodstone Runehammer (Forgotten Realms,
    Geography), Occupation - Artisan (General), Spirit Binder (Dark Sun,
    Campaign) and Wandering Duelist (Scales of War); then print preview's
    Character Reference, the Background entry of a character that has one.
  - **Expect:** "CAMPAIGN Forgotten Realms · TYPE Geography" under the
    title; only "TYPE Occupation" for a General one; only "CAMPAIGN Dark
    Sun" for a campaign background; a card with neither has no
    subheader. The body: "Prerequisite: …" (when it has one), "Skills:
    …", "Languages: …", the description, Benefit, Common knowledge; no
    small uppercase "Forgotten Realms · Geography" line in the body any
    more. The printed entry reads "Skills: …", "Languages: …", then
    "Benefit: …".
  - **Wrong if:** "Scales of War Adventure Path" overflows the card, or
    the campaign shows twice.
- [ ] **Race card subheader.** Added 2026-11-06; lines and body lines are
      unit-tested, this is the look.
  - **Where:** at 140% zoom, light and dark theme: Build → level 1 →
    Race; click Dragonborn, Halfling, Bullywug ("6 squares (swamp
    walk)") and Pixie (Heroes of the Feywild; needs the rebuilt pack).
  - **Expect:** "SIZE Medium · SPEED 6 squares · VISION Normal", then
    "HEIGHT 6' 2"-6' 8" · WEIGHT 220-320 lb."; the body opens with the
    short description, then "Abilities: …", "Languages: …", "Skills: …"
    lines, then Racial traits and About. The Pixie reads "SPEED 4
    squares, fly 6 (Limited Flight)" on the first line, and its racial
    traits end with Limited Flight.
  - **Wrong if:** the first line wraps between a label and its value,
    the old two-column stat grid remains, or a field shows twice.
- [ ] **Skill, god fragment, alchemical item and special armor
      subheaders.** Added 2026-11-06; lines are unit-tested, this is the
      look.
  - **Where:** at 140% zoom, light and dark theme: Build → level 1 →
    skill training, click Diplomacy; a Chosen of a god fragment choice if a
    character has one (else skip); Shop → Alchemical items, Icening (Level
    5); Shop → Armor, Feyweave Armor and Githweave Armor; Build → Paragon
    Path, any path card.
  - **Expect:** Diplomacy: "ABILITY Charisma" under the title, the
    description below. A god fragment: "QUIRKS Abrasive, intimidating,
    lively", then "Constant Benefits: …" in the body. Icening: "TIME 1
    hour · COST 100 gp · SKILL Arcana" as one line, the power below.
    Feyweave Armor: "AC BONUS +1", then "MINIMUM +4" (and a "BONUS" when
    the armor has one: Githweave "BONUS +1 Will"); no "Minimum Enhancement Bonus:"
    rule in the body. A paragon path: no subheader, "Prerequisite: …"
    above its text.
  - **Wrong if:** the alchemical line wraps a label away from its value,
    or a field also shows in the body.
- [ ] **Theme section icon.** Added 2026-11-06; the icon name is
      unit-tested, this is the look.
  - **Where:** any character's Build → level 1, the Theme section heading,
    then click a theme in its table.
  - **Expect:** the heading's icon is the same glyph as the Background
    section's and the theme card's title icon.
  - **Wrong if:** the heading still shows the generic content icon, or
    the heading and the card disagree.
- [ ] **One label per status: "Unavailable" or "Illegal".**
  - **Where:** a Pathfinder campaign character, Build → Deity, Show all
    on: a stock deity's row, then click it for its card. A feat table with
    Show all on: a row whose prerequisites are unmet, and its card; hover
    each badge. Build → skill training: a skill that can't be chosen.
    Inventory → select a held item whose saved choice is restricted → its
    Choose… button and its dialog.
  - **Expect:** the same badge with a left bar everywhere (tone per
    status, next item), and no
    other reason text or box anywhere. The stock deity's row and card read
    "Unavailable in this campaign". The unmet feat's row and card read
    "Illegal: does not meet prerequisites" (several rule reasons: the first
    plus "(+N more)"; hovering shows them all). The skill's status line
    reads the same "Illegal: …" wording. In the dialog the kept pick's
    button shows "Unavailable in this campaign" on its own line under the
    name.
  - **Wrong if:** a reason appears twice, a "Does not meet prerequisites"
    line or box sits beside the badge, a row's badge overflows or clips its
    cell or stretches full width at 140%, or the badge is unreadable in
    dark theme.
- [ ] **Badge tones: Illegal red, Unavailable and Unverified amber.**
  - **Where:** same places as above; also a feat table with Show all on
    and a feat whose prerequisite the engine can't parse (its badge reads
    "Unverified: prerequisites can't be checked"). Check light and dark
    theme at 140% zoom.
  - **Expect:** "Illegal: …" badges are the soft red background with dark
    red text and left bar (light) / dark red background with pink text
    (dark), matching other error surfaces; "Unavailable …" and
    "Unverified: …" badges keep the amber look. Same size and shape for
    all three.
  - **Wrong if:** an Illegal badge is amber, an Unverified badge is red,
    the red is hard to read in dark theme, or the badges differ in size,
    padding or bar.
- [ ] **Content updates: new server and campaign revisions.**
  - **Where:** a non-campaign character after a server content update; a
    campaign character's editor left open while the second campaign
    revision is imported or fetched; its update badge → Review, then
    Update; reopen the dialog later. (A character whose campaign isn't
    installed staying on its pinned pack with no badge is checked by
    `campaign-profile.test.ts`.)
  - **Expect:** the non-campaign dialog reads as before, with no campaign
    wording. The campaign badge appears without a reload; Review shows
    "Preparing <campaign>" while the page stays responsive (scroll, close),
    then the progress; the intro names "the current game content with
    <campaign> (revision N)". The "Not used in <campaign>" section lists
    e.g. "Moradin (deity)", styled like "Will be removed"; after Update
    those are house-rule issues and earlier restrictions aren't repeated.
    Reopening skips Preparing almost at once.
  - **Wrong if:** the page freezes while preparing, the badge needs a
    reload, or the new section looks different from the dialog's others.
- [ ] **Legacy .dnd4e: campaign export and import.**
  - **Where:** Export a campaign character and a non-campaign one from the
    library; import the campaign one with the campaign installed, then in
    a browser without it; a hand-edited save restricting an unknown
    `<RulesElement name="Lost God" type="Deity"/>`; an ordinary sample save.
    Cancel or Esc each dialog once. In the old builder, if available, open
    the exported campaign character.
  - **Expect:** with the campaign installed, "Put <name> in <campaign>?"
    (Cancel, Put in), 34rem wide and laid out like the content-update
    dialog; Put in goes on to the move review (Preparing…, what the
    campaign doesn't use), then the library row and Details show the
    campaign. Without it, "Create a campaign for <name>?" with record
    counts, "Creating campaign…", the move review, and the campaign in
    Settings. The unresolved list ("Lost God (Deity)", "and N more") wraps
    cleanly. Cancel or Esc leaves the character in the library outside any
    campaign with no leftover dialog or focus trap; the ordinary save shows
    no campaign dialog. The old builder offers the campaign's deities and
    hides the stock ones.
  - **Wrong if:** the dialogs differ in width or button order from the
    content-update dialog, or focus stays trapped after closing.
- [ ] **Pathfinder languages (campaign revision 4; revision 10 lists;
      revision 11 open choice).** Added 2026-11-06; the choice contents
      are checked by a private probe, these are the surfaces.
  - **Where:** a new character in the Pathfinder campaign: Race step with
    a Gnome, Genasi, Tiefling and Thri-Kreen (race cards and their
    language picks); the Human's "choice of one other"; backgrounds with
    language associations (benefit list): Occupation - Bounty Hunter,
    Tablelands - Herder and Blazestone; a Shifter's Shifter - Sembia
    background; the sheet's Languages line; a saved character with a
    Primordial pick (e.g. Azreille) moved into the campaign.
  - **Expect:** race cards read the Pathfinder lines ("Common, Gnomish,
    Sylvan"; Genasi "Common, choice of Aquan, Auran, Ignan, or Terran";
    Thri-Kreen "Common, choice of one language other than the common
    ones"). Genasi shows one language choice of the four tongues;
    Tiefling's pick lists the 11 common and 26 regional languages plus
    Abyssal and Infernal; the Human's lists the 37 only (revision 10); the
    Thri-Kreen's lists the 55 others, banded Regional, Uncommon, Ancient,
    no Common band (revision 11). Backgrounds list "Learn Celestial",
    "Learn Jotun", "Learn Undercommon" and "Learn an elemental tongue"
    (which opens a choice of four) where they associate those. Bounty
    Hunter's benefit list has exactly one "Learn another language" row,
    which opens a choice of 53 (the 55 without Abyssal and Celestial,
    Varisian among them), and no Learn Hallit, Thassilonian, Tien,
    regional, Tian or planar row (revision 11); Tablelands - Herder's has
    one "Learn another language" opening all 55. With Show all on, the
    stock Learn Damaran, Learn Netherese and the other setting rows appear
    greyed "Unavailable in this campaign", and the other "Learn another
    language" greyed for its prerequisite. Bounty Hunter's card reads
    "Associated Languages: Any one other than Abyssal or Celestial.";
    Blazestone's "Jotun, an elemental tongue"; Tablelands - Herder's "Any
    language other than the common ones". Shifter - Sembia's card Benefit
    reads "Add a language of your choice other than the common ones to
    your list of known languages.", its Associated Languages "Any language
    other than the common ones", and the background opens one language
    choice of the 55 (no Thassilonian grant). A Deva cleric's Holy Speech
    reads "fluent in Celestial" (from revision 5, with no "met through"
    note: Celestial is the language Supernal under its own name). The
    saved Primordial pick has one "Primordial is not used in this
    campaign." issue whose Review opens its choice.
  - **Wrong if:** a stock name (Giant, Deep Speech, Supernal, Primordial,
    or a setting language such as Netherese or Chondathan) shows on a
    background card's Associated Languages or Benefit line or anywhere a
    player picks, a CountsAsLanguage ("Supernal", "Primordial") appears in
    the Languages list, two eligible "Learn another language" rows show at
    once, or a race or background is greyed out over a language.
- [ ] **Language table bands and the language card's Group (D042
      amendment, 2026-11-07).** Added 2026-11-07; band contents and order
      are unit-tested and probed, this is the look.
  - **Where:** at 140% zoom, light and dark theme: a new Pathfinder
    character, Human, Build → level 1 → the race's "choice of one other"
    language table, with Show all off, then on; collapse and reopen the
    Regional band; type "ti" in the filter; click Tien to see its card.
    Then a Tiefling's language pick, and the Linguist feat's picks (any
    language), where Thassilonian's card is. Then a character outside any
    campaign, the same Human language table.
  - **Expect:** the Pathfinder table has open bands "Common" (10, Common
    itself already known) and "Regional" (26), styled exactly like the
    Deity table's pantheon bands (chevron toggle, muted count), rows
    alphabetical inside each; Show all adds an "Other" band last holding
    the greyed stock languages ("Unavailable in this campaign"). A
    Tiefling's pick shows Common, Regional, then Uncommon (Abyssal,
    Infernal); Linguist's picks show Common, Regional, Uncommon,
    Ancient, Other in that order. Collapsing Regional keeps its band row and count. Filtering
    "ti" shows Taltien and Tien (and any other match) under their bands
    only. Tien's card subheader reads "GROUP Regional", with no "Also
    known as" line (revision 11) and no "Language Group" body line;
    Thassilonian's reads "GROUP Ancient", Jotun's "Also known as: Giant". The
    outside character's table has no bands at all, as before.
  - **Wrong if:** a stock (non-campaign) language table shows any band,
    the bands are out of order or start collapsed, a band row's width
    doesn't span the table, or the Group subheader wraps oddly beside the
    title.
- [ ] **Record aliases ("Also known as").** Added 2026-11-06; matching and
      search are unit-tested, this is the card line.
  - **Where:** a campaign with a `name` patch or an "Also Known As" record
    (the synthetic fixture's Crag Folk race and Tide Mother deity, or the
    Pathfinder Celestial language): the Race step's card, the Deity
    step's card, and each table's filter box typed with the old name.
  - **Expect:** the card's first body line reads "**Also known as:**
    Cliffkin" (or "Sea Mother") in the same label style as the
    Prerequisite line, above the flavor and stat grid (a deity's domains
    are its subheader, above the body); the
    "Also Known As" field does not appear again in the field list; typing
    the old name in the table filter keeps the renamed row.
  - **Wrong if:** the line sits below the fields, uses a different label
    style from "Prerequisite:", or a record without aliases shows an empty
    "Also known as" line.
- [ ] **Content-type icons (owner mapping, 2026-11-06).** Added
      2026-11-06; each type's icon is unit-tested (`item-icons.test.ts`,
      `visual-language.test.ts`), this is the look of the four new glyphs
      beside the old ones.
  - **Where:** at 140% zoom, light and dark theme: a new character's Build
    → level 1 (the Class step's section icon, the class table, Starting
    presets, Languages, a cleric's Deity card with its Domain cards); a
    ranger with Beast Mastery or a wizard with Arcane Familiar (the
    companion/familiar table rows); a cleric's Battle Cleric Armaments or
    Weapon Training (Proficiency rows). Shop: search "Bag of Holding"
    (Wondrous Item), "Riding Horse" (Mount), "Superior Implement" rows
    (e.g. an Accurate Staff, a Ki Focus). Print preview: page 1's
    Languages and Class features panels; with Sections → reference groups
    on, the Class features, Paragon paths, Epic destinies, Theme, Power
    index and Item power index headings.
  - **Expect:** Class, its section, class features and trait packages
    show the person (the class table's glyph), never the Shield; racial
    traits the race pair; companion and familiar rows and a mount the paw
    print; proficiencies the badge check; Domain cards a globe; Language
    rows and the page-1 Languages panel the Languages glyph; Starting
    presets a signpost; Bag of Holding an amphora; a superior staff the
    wand, a superior ki focus the focus; the reference headings crown,
    sun, scroll, bolt and backpack. Each new glyph sits on the same
    baseline, size and stroke as its neighbours.
  - **Wrong if:** a new glyph is larger, heavier, filled or off-centre
    next to the others, reads as an existing glyph (the amphora as a
    potion flask, the globe as the orb's orbit), or any of these still
    shows the generic grid or the Feat sparkles.

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
