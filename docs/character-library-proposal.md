# Character library and trash proposal

Status: accepted and implemented (2026-10-21; commits `98d83ce`, `f748323`,
`d62b51e`, D092); visual review pending. Decisions made by the product owner
are marked **(decided)** and summarized at the end. Three of them were later
simplified by the product owner (2026-10-21, see "Later simplifications"):
the pane is just its header band (no stats), the library shows no
content-update indicator, and the table has no filter box. The sections
below describe the shipped design. Mockup (private, predates the
simplifications):
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
│ ┌──┬──────────────┬────┬───────┬─────────┐ │▓(portrait) Aldric Vey           ▓│
│ │  │ Name       ▲ │ Lv │ Race  │ Class   │ │▓           Human Paladin 11     ▓│
│ ├──┼──────────────┼────┼───────┼─────────┤ │▓           Divine Defender      ▓│
│ │◯ │ Aldric Vey   │ 11 │ Human │ Paladin │ │▓           Paragon path: Astral…▓│
│ │◯ │ Brisa        │  4 │ Elf   │ Ranger  │ │▓           Edited 2 hours ago   ▓│
│ │◯ │ Korrin       │  1 │ Dwarf │ Fighter │ │▓  ✎   │  ▤   │  ⇥   │  ⧉   │  🗑 ▓│
│ └──┴──────────────┴────┴───────┴─────────┘ │▓ Edit │Sheet │Export│Dupl. │Trash▓│
│   (Edited column at the far right,         └──────────────────────────────────┤
│    cut off in this sketch)                                                    │
└───────────────────────────────────────────────────────────────────────────────┘
  ▓ = navy pane header band; the table's top edge is level with its top
```

**Table** (decided: sortable, remembered)

- Columns: small portrait thumbnail, Name, Level, Race, Class, Edited
  (relative time with the exact time as a tooltip). Hybrid classes show as
  "Cleric / Wizard", as the metadata already does.
- Click a column header to sort it, with the same header styling and
  `aria-sort` behavior as the builder's selection tables. Default sort is
  Edited, newest first, which matches today's order.
- No filter box (product-owner decision, 2026-10-21): players won't have
  enough characters to need text search, sorting by Name covers quick
  lookup, and with nothing above it the table's top edge lines up with the
  pane header's. An empty library shows its message inside the table, which
  itself stays (no surprise controls).
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

**Detail pane** (decided: identity and role; actions live here; header
band only)

- **Pane header** (the navy header band, as on dialogs and detail cards)
  holds everything about who the character is (decided): a large portrait
  (the builder sidebar's size), the name, the identity line, a **role line**
  (power source plus role in title case, decided: "Divine Defender",
  "Martial Striker"; a hybrid shows both halves, "Divine Leader / Arcane
  Controller"), then small secondary lines for paragon path, epic destiny
  and "Edited …". There is no content-update indicator (product-owner
  decision, 2026-10-21): after a content update every character has one at
  once, and it isn't actionable until the character is opened, where the
  builder's status badge handles it.
- **Action toolbar** across the bottom of the pane header (decided): one
  evenly spaced row of five equal-width buttons, each an icon over a
  one-word label: Edit, Sheet, Export ▾ (.4ecb / .dnd4e, with the same busy
  spinner as today), Duplicate, Trash. Each button's tooltip and accessible
  name is the full action ("Edit build", "View character sheet"). It is one
  row at every pane width, and never wraps or stacks. Trash keeps the
  two-click arm, and its armed label is just "Confirm", so the row never
  reflows. The icons are the app's existing `Icon` names (`edit`, `sheet`,
  `export`, `duplicate`, `trash`).
- **No stats** (product-owner decision, 2026-10-21): the pane is just the
  header band. An earlier version showed the Play data card's stat body
  below it; the print Play data card keeps that shared body
  (`PlayDataStats`).
- Empty library: the pane shows the existing "No characters yet" guidance
  and the table shows an empty row. Both controls stay in place.

**Where the role line comes from**

Library metadata is id, title, level, race, class, paragon path, epic
destiny, updatedAt, content revision and the portrait (`characterMetadata`
in `character-repository.ts`). Only the role line needs evaluation.
Decided approach: a saved summary with a live fallback.

1. **Saved library summary.** When the builder saves a character with a
   fresh evaluation, it also writes a small `librarySummary` alongside the
   metadata. The summary holds just the role line (`LibrarySummaryValue`
   is `{ roleLine? }`; format version 4), stamped with
   `RULES_EVALUATION_CACHE_VERSION`, the character revision and the
   profile revision. It is a disposable cache, like the evaluation cache,
   and is never treated as a source of truth.
2. **Live fallback.** If the summary is missing or stale (imported and never
   opened, an engine version bump, a content update), selecting the row
   evaluates the character in the rules worker. This uses the evaluation path
   `.dnd4e` export already uses. The result is then backfilled into the
   summary.
3. **Never hang (decided).** The live evaluation runs off the main thread
   and nothing waits on it. Identity, paragon/epic, edited time and the
   action bar render at once from metadata. Only the role line waits: a
   placeholder bar holds its place while it loads. The table stays fully
   usable meanwhile. Selecting another row stops showing the pending
   result, but it still backfills the summary. If evaluation fails, the
   role line is simply left out and the rest of the pane keeps working.

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
│       Human Paladin 11 · Trashed 3 days ago        [↶][🗑]│
│ ( ◯ ) Aldric Vey (copy)                                 │
│       Human Paladin 11 · Trashed today             [↶][🗑]│
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

| Area                 | Files                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library table + pane | `CharacterLibraryPage.tsx` (split into `CharacterLibraryTable.tsx` and `CharacterLibraryDetail.tsx`); sort/remembered-state helpers in `character-library-ui.ts` with unit tests |
| Trash                | `TrashDialog.tsx`; new `EmptyTrashDialog.tsx`                                                                                                                                    |
| Styles               | `04-library.css` (table, pane, trash rows); remove `.character-grid` rules from `03-shared.css`; breakpoints in `14-responsive.css`                                              |
| Stats                | Extract the Play data card's stat body from `PrintCharacterCard` into a shared component (`PlayDataStats`, now used only by the print card)                                      |
| Summary              | `browser-storage`: `librarySummary` on metadata plus `purgeAll`/`emptyTrash`; builder save path writes the summary                                                               |
| Docs                 | `interface-design-brief.md`, a decision entry in `decisions.md`, `visual-review-checklist.md`, `implementation-status.md`                                                        |

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

## Later simplifications (product-owner decisions, 2026-10-21)

- **Identity line order.** The line under a character's name reads "Race Class
  N" ("Human Avenger 8"), in the pane and the trash rows; just "Level N" until
  a race or class is chosen.
- **Header-only pane.** The pane is just its navy header band; the Play data
  stats below it were removed. The library summary shrank to the role line
  (summary format version 4, so older summaries are misses), and the
  library's worker evaluation and the builder's summary write no longer
  build a sheet model.
- **No content-update indicator.** The table's name cell and the pane no
  longer flag a waiting content update: after a content update it applies to
  every character at once and isn't actionable until the character is
  opened, where the builder's `update` status badge already handles it.
- **No filter box.** Characters are few enough that sorting by Name covers
  quick lookup, and without it the table's top lines up with the pane
  header's.
