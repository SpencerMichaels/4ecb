# Character library and trash proposal

Status: accepted and implemented (2026-10-21; commits `98d83ce`, `f748323`,
`d62b51e`, D092); visual review pending. Decisions made by the product owner
are marked **(decided)** and summarized at the end. Mockup (private):
https://claude.ai/artifact/MoTG4dNJiNW4kVD96Rb6VK

## Problem

The Characters page (`CharacterLibraryPage.tsx`) is the plainest surface in
the app. Characters show as a grid of tiles
(`.character-grid`, `minmax(30rem, 1fr)`): a 5rem portrait, the name, one
"Level N Race Class" line, and five inline icon buttons. It looks nothing like
the builder, where choices are picked from a sortable selection table with a
detail card beside it (`CandidateSelectionTable` + `CandidateDetail`), and the
character sits in a sticky sidebar with portrait and stat tiles
(`builder-sidebar`, `BuilderCharacterStats`). With more than a few characters,
the tiles are slow to scan, and the only way to see anything beyond the
identity line is to open the builder.

The trash dialog (`TrashDialog.tsx`) is a bare list of names, each with
Restore and Delete permanently. Two characters with the same name, or a copy
made by Duplicate, can't be told apart. There is no portrait, no level or
class, and no indication of when the character was trashed.

## Proposal

### 1. Characters page: table plus detail pane

A two-column layout that reuses the builder's split: a character table on the
left and a sticky detail pane on the right, the same proportions and pane
styling as the builder's selection table with its detail card.

```
┌ 4E Character Builder ──────── [+ New][Import][Trash 3] | [Update][⚙ Settings] ┐
├────────────────────────────────────────────┬──────────────────────────────────┤
│ [ Filter characters…               ]       │▓(portrait) Aldric Vey           ▓│
│ ┌──┬──────────────┬────┬───────┬─────────┐ │▓           Level 11 Human Paladin▓│
│ │  │ Name       ▲ │ Lv │ Race  │ Class   │ │▓           Divine Defender      ▓│
│ ├──┼──────────────┼────┼───────┼─────────┤ │▓           Paragon path: Astral…▓│
│ │◯ │ Aldric Vey   │ 11 │ Human │ Paladin │ │▓           Edited 2 hours ago   ▓│
│ │◯ │ Brisa        │  4 │ Elf   │ Ranger  │ │▓  ✎   │  ▤   │  ⇥   │  ⧉   │  🗑 ▓│
│ │◯ │ Korrin       │  1 │ Dwarf │ Fighter │ │▓ Edit │Sheet │Export│Dupl. │Trash▓│
│ └──┴──────────────┴────┴───────┴─────────┘ │ [19 STR +4][14 CON +2][10 DEX +0]│
│   (Edited column at the far right,         │ [10 INT +0][13 WIS +1][19 CHA +4]│
│    cut off in this sketch)                 │ [AC 27][Fort 24][Ref 21][Will 23]│
│                                            │ [Max HP][Bloodied][Surges][SrgHP]│
│                                            │ [Init][Speed][Pass.Ins][Pass.Pc.]│
│                                            │ Senses Normal vision             │
└────────────────────────────────────────────┴──────────────────────────────────┘
  ▓ = navy pane header band
```

**Table** (decided: sortable, filterable, remembered)

- Columns: small portrait thumbnail, Name, Level, Race, Class, Edited
  (relative time with the exact time as a tooltip). Hybrid classes show as
  "Cleric / Wizard", as the metadata already does.
- Click a column header to sort it, with the same header styling and
  `aria-sort` behavior as the builder's selection tables. Default sort is
  Edited, newest first, which matches today's order.
- A filter box above the table matches name, race and class, using the same
  input styling as the selection-table search. When nothing matches, the
  empty-state message goes inside the table and the table itself stays
  (no surprise controls).
- Single click (or arrow keys on the focused row) selects a row and fills the
  detail pane. Double-click or Enter opens the builder (decided). The name
  cell is also a real link to `#/characters/:id/edit`, so middle-click and
  "open in new tab" work.
- The selected row and the sort column/direction are remembered per browser
  in `localStorage` (decided). A remembered selection that no longer exists
  falls back to the first row.
- The portrait thumbnail is the existing `PortraitImage` at about 2.25rem.
  It uses the cached 512px rendering the library already loads, so it costs
  no extra I/O.

**Detail pane** (decided: identity, key stats, role; actions live here)

- **Pane header** (the navy header band, as on dialogs and detail cards)
  holds everything about who the character is (decided): a large portrait
  (the builder sidebar's size), the name, the identity line, a **role line**
  (power source plus role, one title-cased word each as in the class table, e.g. Berserker is "Martial Defender", decided: "Divine Defender",
  "Martial Striker"; a hybrid shows both halves, "Divine Leader / Arcane
  Controller"), then small secondary lines for paragon path, epic destiny,
  "Edited …", and the content-update status badge when there is one: the
  same `update` character issue the builder raises, not a banner.
- **Action toolbar** across the bottom of the pane header (decided): one
  evenly spaced row of five equal-width buttons, each an icon over a
  one-word label: Edit, Sheet, Export ▾ (.4ecb / .dnd4e, with the same busy
  spinner as today), Duplicate, Trash. Each button's tooltip and accessible
  name is the full action ("Edit build", "View character sheet"). It is one
  row at every pane width, and never wraps or stacks. Trash keeps the
  two-click arm, and its armed label is just "Confirm", so the row never
  reflows. The icons are the app's existing `Icon` names (`edit`, `sheet`,
  `export`, `duplicate`, `trash`).
- **Stats in the Play data card's layout and order** (decided: matches the
  first card on the cards page, `PrintCharacterCard` in
  `PrintPlayCards.tsx`):
  1. Ability scores: compact 3 × 2 tiles, score then abbreviation then
     modifier ("19 STR +4").
  2. Defenses: AC, Fort, Ref, Will.
  3. Health: Max HP, Bloodied, Surges, Surge HP.
  4. One row: Initiative | Speed | Passive senses (Pass. Insight, Pass.
     Perc.), in the card's 1 : 1 : 2.2 proportions.
  5. The card's note lines when present: Senses, Saves, Resistances,
     Vulnerabilities, Immunities, Other.

  The card's stat body is extracted into one shared component that both the
  print card and the detail pane render, sized in em through `StatGroup`.
  The two can't drift apart, and every number still comes from evaluated
  stats and `derived-values.ts`. Nothing is re-derived in library code.

- Empty library: the pane shows the existing "No characters yet" guidance
  and the table shows an empty row. Both controls stay in place.

**Where the stats and role come from**

Library metadata today is only id, title, level, race, class, updatedAt and
the portrait (`characterMetadata` in `character-repository.ts`). Stats and
role need evaluation. Decided approach: a saved summary with a live
fallback.

1. **Saved library summary.** When the builder saves a character with a
   fresh evaluation, it also writes a small `librarySummary` alongside the
   metadata. The summary holds role/power source, paragon/epic names, and the
   Play data stat values and note lines, stamped with `RULES_EVALUATION_CACHE_VERSION`
   and the profile revision. It is a disposable cache, like the evaluation
   cache, and is never treated as a source of truth.
2. **Live fallback.** If the summary is missing or stale (imported and never
   opened, an engine version bump, a content update), selecting the row
   evaluates the character in the rules worker. This uses the evaluation path
   `.dnd4e` export already uses. The result is then backfilled into the
   summary.
3. **Never hang (decided).** The live evaluation runs off the main thread
   and nothing waits on it. Identity, paragon/epic, edited time and the
   action bar render at once from metadata. Only the stat tiles and role
   line show a loading state: the tiles keep their size, with "—" values
   and the app's loading ring, so nothing jumps when the values arrive. The
   table stays fully usable meanwhile. Selecting another row stops showing
   the pending result, but it still backfills the summary. If evaluation
   fails, the tiles show "Stats unavailable" with the error in a tooltip,
   and the rest of the pane keeps working.

Paragon path and epic destiny names can come straight from the build
(`buildElementNames`, as race and class already do), so they never wait on
evaluation.

**Header**

The page header keeps its controls, reordered to New, Import, Trash (with
its count as a small pill), then Update and Settings (the gear icon) after
the divider (decided). Each button now shows a one-word text label beside
its icon (decided): "New", "Import", "Trash", "Update" when an update is
waiting, and "Settings". "New" keeps "New character" as its tooltip and
accessible name. There is plenty of room for the labels. Only the page
header changes this way. The builder's header, which is tighter, keeps its
icon-only controls. At phone width the labels drop back to icon-only, with
the tooltips and accessible names unchanged.

**Narrow screens / 140% zoom**

Below the breakpoint where the builder already stacks its split
(`14-responsive.css`), the detail pane drops below the table. The table keeps
Name, Level and Class and hides Race and Edited. The thresholds must hold at
the product owner's 140% browser zoom.

### 2. Trash dialog

The dialog becomes a compact version of the library table, so trashed
characters look like the characters they were.

```
┌ Trash ───────────────────────────────────────────── [×] ┐
│ ( ◯ ) Aldric Vey                                        │
│       Level 11 Human Paladin · Trashed 3 days ago  [↶][🗑]│
│ ( ◯ ) Aldric Vey (copy)                                 │
│       Level 11 Human Paladin · Trashed today       [↶][🗑]│
├─────────────────────────────────────────────────────────┤
│                                          [Empty trash]  │
└─────────────────────────────────────────────────────────┘
```

- Each row shows the portrait at the table-thumbnail size, the name, the
  identity line, and "Trashed N days ago" from the stored `deletedAt`
  (decided), with the exact time as a tooltip. Rows use the library table's
  row styling, so the two surfaces read as one.
- Restore and Delete permanently stay per row. Delete permanently keeps its
  two-click arm.
- **Empty trash** (decided) is in the dialog footer and is disabled while the
  trash is empty (the control is never hidden). Because it destroys many
  characters at once, it opens an **explicit confirmation dialog** (decided)
  and does not use the two-click arm. The dialog says "Permanently delete N
  characters? This can't be undone." It lists the names when there are only a
  few, and has Cancel and "Delete N characters" (danger) buttons. Focus starts
  on Cancel. It is built on `dialog-shell`, like the preset-replace
  confirmation.
- Order: most recently trashed first.

## Implementation outline

All UI work is in `apps/web`:

| Area                 | Files                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library table + pane | `CharacterLibraryPage.tsx` (split into `CharacterLibraryTable.tsx` and `CharacterLibraryDetail.tsx`); sort/filter/remembered-state helpers in `character-library-ui.ts` with unit tests |
| Trash                | `TrashDialog.tsx`; new `EmptyTrashDialog.tsx`                                                                                                                                           |
| Styles               | `04-library.css` (table, pane, trash rows); remove `.character-grid` rules from `03-shared.css`; breakpoints in `14-responsive.css`                                                     |
| Stats                | Extract the Play data card's stat body from `PrintCharacterCard` into a shared component used by the print card and the detail pane                                                     |
| Summary              | `browser-storage`: `librarySummary` on metadata plus `purgeAll`/`emptyTrash`; builder save path writes the summary                                                                      |
| Docs                 | `interface-design-brief.md`, a decision entry in `decisions.md`, `visual-review-checklist.md`, `implementation-status.md`                                                               |

Suggested slices, each committed separately:

1. Trash dialog restyle, "Trashed N ago", Empty trash with its confirmation
   dialog (needs only a `purge`-all repository method).
2. Library table with sort, filter and remembered state; detail pane with
   identity, paragon/epic and actions (no stats yet).
3. Stats and role in the detail pane: library summary, live fallback, and
   backfill.
4. Responsive pass, then a batched visual review by the product owner.

**Coordination note:** `packages/browser-storage/src/character-repository.ts`
currently has uncommitted changes from another workstream. Slices 1 and 3
touch that file, so they should start after that work lands, or be
coordinated with it. Slice 2 is web-only and can start immediately.

## Resolved questions (2026-10-21)

- Stats come from a saved summary with a non-blocking live fallback.
- The role line uses title case ("Divine Defender").
- The detail pane shows no Notes excerpt and no content-set name.
