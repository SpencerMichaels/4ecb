# Handoff: editable sheet, phase 2 (reminders)

> **Update (2026-10-25):** the owner postponed phase 2 and had **phase 3
> (card ordering) built first**: in Edit mode a card's overlay drags onto
> another card, on any page (native drag and drop, focus-coloured drop-edge
> rule; drag only, no keyboard reorder), stored as `SheetLayout.cardOrder`
> and merged in `applySheetLayout` (D099). The overlays are now
> `draggable`, so a plain click on a card still does nothing but pressing
> and dragging moves it — keep that in mind if phase 2 adds pointer
> behaviour to page 1.

Written 2026-10-25 at the end of the session that built phases 0–1. Read this
with [`sheet-editing-plan.md`](sheet-editing-plan.md) (the plan and owner
decisions) and D099 in [`decisions.md`](decisions.md). Where this doc and the
plan disagree about **UI controls**, this doc wins: the plan's control
designs predate the owner's feedback below.

## Where things stand

- **Phase 0 (done):** stable provenance card keys and the card deck in
  sheet-model (`packages/sheet-model/src/card-deck.ts`, `sheetCardDeck`).
- **Phase 1 (done):** per-character `CharacterRecord.sheetLayout`
  (`packages/character-domain/src/sheet-layout.ts`, lenient
  `normalizeSheetLayout`, optional field, no schema bump), saved via
  `CharacterRepository.updateMetadata` without moving `updatedAt`;
  `applySheetLayout` (`packages/sheet-model/src/sheet-layout.ts`) applied
  after evaluation; route `#/characters/<id>?preview=1&edit=1`; toolbar
  "Sheet: View | Edit". Item card hiding writes the holding's legacy
  `showPowerCard` flag but never re-evaluates (the evaluation input already
  drops it).
- **Edit-mode UI as it now stands** (several owner iterations, see below):
  - **Cards:** right-click a card toggles hide/show directly — no menu, no
    visible button (`apps/web/src/SheetEditTarget.tsx`, an absolutely
    positioned overlay per card in `CharacterSheetPage.tsx`). Keyboard:
    focus the overlay, Enter/Space/Menu key/Shift+F10. A plain click does
    nothing (reserved for dragging cards in phase 3).
  - **Hidden cards in Edit mode:** always shown (no toggle); header and the
    bottom type bar (`.print-card-type`, "ENCOUNTER POWER · LEVEL 3") at full
    strength, the rest of the body blank behind a large faint "HIDDEN"
    (`.sheet-concealed-card` wrapper, `display: contents`). View mode and
    print never show them (`usePrinting`/`beforeprint`).
  - **Sections:** a toolbar **Sections** popover (`SheetSectionsMenu.tsx`)
    with one row per section in print order — Overview (the `summary` id:
    page 1 by default, with its continuation pages), Play scratchpad, each
    reference group, Power & item cards (`cards`), Session notes — each an
    ordinary checkbox, none locked. Rows reorder by drag or Alt+Up/Alt+Down
    (`sectionOrder` in `SheetLayout`, stored only when it differs from the
    default); `SheetOverview` renders sections in that order with chained
    page numbers. Play scratchpad and Session notes print unnumbered (they
    take no page number) and their rows have a − [n] + copies stepper
    (`sectionCopies`, stored only above 1). Landed in `7496961` (section
    checkboxes, toolbar fixes), `2b279b3` (reorder, Sections/Overview names)
    and the copies commit after them — check `git log` before starting.
  - **Reset** (short label; armed state "Confirm reset") restores everything.

## Phase 2 scope

1. Hide or show any "Remember in play" reminder on page 1, including
   auto-generated ones and ones currently suppressed as duplicates.
2. Pinning: a reminder the user explicitly shows stays even when it repeats
   another surface (owner: "this is explicitly what they are for").
3. Custom reminders: add / edit / delete (label + text). Each goes in the
   reminder section matching its category (feat, class feature, racial
   trait, item property, …); "Other reminders" only as the fallback.
4. Remove the Action Point special case (decision "Action Point reminder
   policy (2026-10-24)" at the top of `decisions.md`; code: the
   `actionPointEffects` block before `redundant()` in
   `packages/sheet-model/src/overview.ts`; test: "keeps self, ally and
   companion Action Point benefits beside their card" in
   `reminder-dedup.test.ts`). AP benefits become ordinary candidates covered
   by the AP card: hidden by default, back automatically if the AP card is
   hidden, or pinned. Supersede the 2026-10-24 decision in D099.
5. Plumbing (plan §4): give each reminder a stable id from provenance
   (`feature:<definitionId>`, `item:<holdingId>:<property>`,
   `effect:<source>:<provider>`, `core:<featureId>:<label>`), and make dedup
   decidable after the layout: `withSheetOverview` emits candidates with
   `defaultShown` and `coveredBy` (surfaces that already show them) instead
   of splicing; `reminders`/`summaryReminders` become the default-layout
   result; `applySheetLayout` decides (explicit hide → drop; explicit show →
   keep; else shown if `defaultShown` and no covering surface is still
   visible — a hidden card counts as not visible).

## Proposed interaction (CONFIRM WITH THE OWNER BEFORE BUILDING)

Following the pattern the owner settled on:

- Right-click a reminder row on page 1 to hide/show it (same as cards).
  Edit mode shows hidden/suppressed reminders (marked, like hidden cards);
  View/print don't. Right-clicking a suppressed duplicate shows it = pinning,
  so pinning may need no separate control.
- Custom reminders: an "Add reminder" entry (toolbar or the Sections-style
  menu); right-clicking a custom reminder offers Edit / Delete — two
  actions, so a small menu is justified there (the owner's rule: no menu for
  a single action).
- Open questions: where "Add reminder" lives; how hidden reminders look in
  Edit mode (page-1 rows are probe-fitted, so a revealed hidden reminder
  takes space — decide whether Edit mode fits them or lists them
  separately); whether hiding a reminder that overflowed to a continuation
  page works the same.

## Owner rules learned this session (all in auto-memory too)

- **Desktop only;** no touch affordances. Per-item actions use right-click
  like the legacy builder; **no per-item ⋮ buttons** (too noisy). Keep
  invisible keyboard access.
- **No menu for a single action;** right-click acts directly.
- **No non-actionable or success notices** (D098): silent saves; only
  failures show an actionable error.
- **No speculative guards or locks** (e.g. "nothing to print" disabling,
  "always printed" page 1). Don't add restrictions the owner didn't ask for.
- **Controls always present,** empty states inside; no "Not now" labels.
- **Never surface `.dnd4e` storage artifacts** as user-facing issues.
- **No duplicate sheet info** unless the user pins it.
- **Keep docs current** (CLAUDE.md included) without asking.
- Progress messages from subagents: "step x of y / %", **no time ETAs**.
- The owner browses at **140% zoom**; check layouts there and in dark mode.

## Pitfalls hit this session

- An absolutely positioned grid item with only a start line spans to the
  grid's edge: always give `N / span 1` on both axes.
- `apps/web/src/test-styles.ts` (`appStyles`) can't load under
  `// @vitest-environment jsdom` (`import.meta.url` isn't `file:`); put CSS
  assertions in a node-environment test such as `print-layout.test.ts`.
- Keep layout/flag state separate from `character` in
  `CharacterSheetPage.tsx`; the repository's returned record carries a
  fresh `build`, and the evaluation effect depends on it (a jsdom test
  asserts exactly one `evaluate` call across edits — keep it passing).
- Never put edit controls inside probe/measured regions (`ov-measure`,
  `ov-pane-probe`, `ov-reminder-probe`) — page-1 reminders are probe-fitted,
  which matters directly for phase 2.
- `pnpm check:print` can't run in this environment (headless Chromium times
  out waiting for its debugging target); say so rather than fight it. Real
  Firefox print can be checked via headless Firefox/geckodriver + Poppler
  (see `tmp/treasure-ruling/` approach in commit 0eb3664's report).
- Another session sometimes has uncommitted `packages/rules-engine` edits
  (ki-focus work); don't commit or revert files you didn't change.

## Verification

```sh
nix develop path:. --command bash -c 'pnpm vitest run packages/sheet-model apps/web && pnpm typecheck && pnpm lint && pnpm format:check'
nix develop path:. --command bash -c 'FOURECB_SKIP_PRINT_CHECK=1 bash scripts/check.sh'
nix develop path:. --command pnpm parity:baseline   # private corpus; sheet-model changes
```

Private reminder probes from this session live in `tmp/feat-powers/`
(`reminder-probe.ts` lists each sample's reminders; diff before/after a
change). Characters useful for reminders: Hu Sheng-Ming (Action Point
riders, Battle Awareness), Natan (Covenant of Malediction).
