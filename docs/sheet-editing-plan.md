# Editable character sheet — plan (owner-reviewed 2026-10-25)

Status: **approved; phases 0–1 done (2026-10-25, D099); phase 2 next.** Owner task (tasks.txt): allow editing the
character sheet with view and edit modes — moving/hiding cards, choosing
reference sections, pinning or removing reminders — and, if manual reminders
land, drop the "all Action Point riders are reminders" special case.

## Today

- The "character sheet" users see is the print preview
  (`#/characters/<id>?preview=1`); the interactive View sheet is deferred to M6.
- Pipeline: `buildEvaluatedSheetModel` → `withSheetOverview`
  (`packages/sheet-model/src/overview.ts`: features, reminders) → card deck
  (`sheetCardDeck` in sheet-model since phase 0, then `applySheetLayout`; 9
  per page) →
  `SheetOverview.tsx` probe-fits page 1, continuations, scratchpad, reference
  pages; page numbers chain via `onPageCount`.
- `CharacterRecord` already carries non-build metadata (`sheetSettings`,
  unused per D083; `portrait`) saved via `CharacterRepository.updateMetadata`;
  backups/duplicate copy the whole record.
- Missing stable IDs: reminders have none; item cards have none.
- Action Point special case: `overview.ts` `actionPointEffects` block, decision
  "Action Point reminder policy (2026-10-24)".
- Holdings' legacy `showPowerCard=false` already hides item cards, with no UI.

## 1. Data model (proposed D099)

An optional `CharacterRecord.sheetLayout` beside `sheetSettings`/`portrait`,
never in `build`: backups, export, duplicate and trash work unchanged; the
rules engine and `.dnd4e` import/export never see it; no schema bump.

```ts
// packages/character-domain/src/sheet-layout.ts
export interface SheetLayout {
  readonly version: 1;
  readonly hiddenSections?: readonly SheetSectionId[]; // "scratchpad" | "session-notes" | `reference:${ReferenceGroupId}`
  readonly hiddenCards?: readonly string[];
  readonly shownCards?: readonly string[]; // overrides default-hidden (imported showPowerCard=false)
  readonly cardOrder?: readonly string[];
  readonly reminders?: Readonly<Record<string, "show" | "hide">>;
  readonly customReminders?: readonly {
    readonly id: string;
    readonly label: string;
    readonly text: string;
    readonly category?: OverviewReminderCategory;
  }[];
}
```

- Store only deltas from defaults, so new cards/reminders get default
  behavior. Lenient normalizer drops malformed entries.
- `updateMetadata` gains `sheetLayout` (`null` = reset).
- **Stable keys built in sheet-model from provenance, never text:**
  `power:<definitionId>` (name fallback + `#n` for legacy caches/duplicates),
  `item:<holdingId>`, `item-set:<id>`, `companion:<id>`, `play:*`; reminders
  `feature:<definitionId>`, `item:<holdingId>:<property>`,
  `effect:<source>:<provider>`, `core:<featureId>:<label>`; fixed reference
  group constants.
- Vanished keys are ignored, not pruned (a temporary disappearance restores the
  choice); Reset clears all. Re-buys keep the holding ID (D097); a retrained
  power is a new card.

## 2. View / Edit UX

- Route: `#/characters/<id>?preview=1&edit=1`; toolbar
  "Sheet: View | Edit" segmented control (always present); Print works from
  either; `?print=1` stays view-only.
- Edit mode keeps the WYSIWYG paper preview. Cards are toggled on the paper
  (owner feedback 2026-10-25 replaced the first "Sheet contents" checkbox
  panel): right-clicking a card hides or shows it directly — no menu while
  hide/show is the only action (keyboard: focus it, Enter, Space, Menu key or
  Shift+F10). No visible per-card button and no touch gestures — owner: too
  noisy, desktop only for now. A plain click does nothing, leaving it for
  dragging cards later. Edit mode always shows hidden cards in their deck
  position, with their header and type bar as printed and the rest of the
  body blanked behind a large faint "Hidden" (border kept); View mode and
  printing always omit them. Legacy CharTracker had the card "Hide" menu item
  and a one-shot "Restore Hidden Power Cards".
- Sections are ticked in a toolbar **Pages** menu (owner 2026-10-25:
  right-clicking a whole page was unintuitive): a popover under the button
  with one ordinary checkbox per section in print order — Page 1 summary
  (with its continuation pages), Play scratchpad, each reference group,
  Session notes. No row is locked or disabled (e.g. hide page 1 to reprint
  only some cards); a section that prints nothing for this character is
  still an ordinary row. A hidden section simply does not render and later
  pages renumber; hiding everything leaves an empty preview with no notice.
  The menu closes on Escape (focus back to the button), an outside click or
  tabbing out.
- The toolbar packs from the start (Back, View | Edit, then Edit's Pages and
  Reset), so View | Edit never moves between modes; Print stays at the end.
- Silent saves via a serialized queue (no "Saved" notice, D098; failures show
  an actionable error). Keep layout in its own state so layout edits never
  re-evaluate the character.
- Global **Reset** in the toolbar (arm-then-confirm: "Reset", then "Confirm
  reset"; its accessible name says "Reset sheet layout to defaults"). It
  clears card and section choices.

## 3. Controls

**Must-have**

1. Section hide/show in the toolbar Pages menu: page 1 summary, scratchpad,
   each reference group, session notes; none locked.
2. Card hide/show by right-click (bulk group toggles dropped).
   Hiding a card removes only the card (scratchpad usage boxes, power index
   unchanged).
3. Reminder show/hide over every candidate, with per-row Default reset and a
   provenance hint for suppressed duplicates ("On the Action Point card").
4. Custom reminders (add/edit/delete; label, text, category). Typed numbers
   don't update — say so in the panel.
5. Reset (global and per section).
6. Remove the Action Point special case together with 3–4.

**Nice-to-have:** card reorder (click-and-drag; a right-click menu returns only if
a second card action, e.g. legacy-style Customize, is added); reminder ordering; one-off print scope (Everything / Sheet pages /
Cards); app-wide default layout; editing an auto reminder's text as
"copy to custom + hide original"; named print profiles (defer).

## 4. Applying it (sheet-model)

`packages/sheet-model/src/sheet-layout.ts`: a pure
`applySheetLayout(model, layout)` returning the resolved model, the ordered
deck, hidden sections and an editor model, shared by print, the future M6
view and play. The deck (`sheetCardDeck`) moves from the web app into
sheet-model with keys.

- Reminder dedup becomes decidable after the fact: `withSheetOverview` emits
  `reminderCandidates` with `id`, `defaultShown` and `coveredBy` surfaces
  instead of splicing; today's `reminders`/`summaryReminders` become the
  default-layout result. A candidate shows if pinned, or if default-shown and
  no covering surface is still visible (so hiding the Action Point card
  brings its riders back).
- Card order merge: default order, user-listed cards in their relative order,
  new cards after their nearest default predecessor.
- Action Point riders become ordinary candidates covered by the AP card; the
  2026-10-24 policy is superseded by D099.
- Layout only selects/orders model output; it never computes a value.

## 5. Phases

0. **Done.** Stable identity (item card IDs, deck into sheet-model); no
   visible change. Reminder candidate IDs/`coveredBy` move to phase 2.
1. **Done.** `SheetLayout` + persistence, route/toggle, right-click hide/show
   on cards, the toolbar Pages menu for sections, global reset (the first
   cut's "Sheet contents" panel was replaced the same day; section
   right-click and the "Show hidden" toggle were replaced on 2026-10-25).
2. Reminders: show/hide, custom reminders, provenance hints, AP special-case
   removal.
3. Card ordering by click-and-drag. (On-paper hide/show: done in phase 1.)
4. Optional: reminder ordering, print scope, app-wide default layout.

Each phase: synthetic tests (key stability, repository/backup round trip,
routes, page renumbering, no re-evaluation on layout save, fitting overflow,
`check:print` fixture) and docs (D099, architecture, user guide, status,
roadmap as an M5.x slice before M5.8).

## 6. Risks

Re-evaluation on every save; probe-measurement corruption (keep controls out
of measured regions and probe copies); both reminder lists must go through the
layout; weak keys for legacy-cache sheets; stale numbers in custom reminders;
scope creep into the M6 interactive view.

## 7. Owner decisions (2026-10-25)

1. **Item card hiding uses the legacy `showPowerCard` flag**, so it
   round-trips to the old builder, but it is presentation, not a build edit:
   like character detail text it must never trigger re-evaluation (strip it
   from the evaluation input/cache key; the sheet applies it after
   evaluation). `sheetLayout` covers every other card.
2. **No app-wide default layout for now**; maybe later.
3. **Reminders slot into the section matching their category** (feat, class
   feature, racial trait, item property, …). A custom reminder picks one of
   those categories; "Other reminders" is only the fallback when none fits.
4. **Cards move anywhere in the deck.**
5. **Layout edits do not touch "last modified".**
6. **A retrained power starts from defaults.**
7. **Pinned reminders may repeat other surfaces** — that is exactly what
   pinning is for.
8. **The builder links to View mode.**
