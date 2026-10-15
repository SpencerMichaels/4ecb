# Printed overview design study

Status: prototype for product-owner feedback, 2026-10-14. Not the production
sheet and not an accepted final layout or M5.6 exit checkpoint.

## Open

Run the normal development server through the project Nix environment:

```sh
nix develop path:. -c pnpm --filter @4ecb/web dev --host 127.0.0.1 --port 5174
```

Visit `http://127.0.0.1:5174/sheet-prototype.html`. This is a separate Vite
development entry, intentionally not linked from the production application or
included as a production build entry. The production character-sheet route,
physical card layout, stored characters, settings and evaluation are unchanged.

## Review surfaces

1. **Summary:** identity/portrait placeholder, a compact six-row ability table above
   Skills with full names and shared Ability/Score/Modifier/+½ level headings,
   prominent defenses and health references, movement/awareness, complete skill
   list with a prominent adjacent Languages panel, conditional/ally-facing reminders and abbreviated feat
   reminders. Mutable values point to the scratchpad instead of scattering
   writing boxes throughout the reference page.
   Skills use two alphabetically ordered, name-first columns followed by their
   bonuses and governing abilities. Both skill and ability tables have subtle
   alternating row fills. Trained skills retain a blue tint with two alternating
   shades and a matching swatch legend. Ability columns have equal widths and consistent padding;
   the last bonus includes the modifier plus rounded-down half level. Health has four equal cells (HP, bloodied, surges, surge
   value). Defenses has five label-first cells, including Saves and full Fortitude/
   Reflex labels. Movement/awareness uses a matching four-cell row; Speed has no
   unit suffix. Skill cells have horizontal padding. XP and AP do not appear on the
   summary. Feat reminders occupy
   available space beneath the left-column reminders rather than extending the
   page below the taller ability/skill column.
   The health panel is named Health. The approved ability table replaces the slash
   display and repeated cell legends; it retains both bonus values.
2. **Play scratchpad:** blank health/temp-HP fields, numbered fillable-on-paper
   surge hearts grouped with health, action points, skull death-save markers, six encounter-use columns, daily
   power tracking, an explicit Channel Divinity shared-use example with per-power
   action icons, an XP writing field, treasure/consumables and
   temporary effects. Quick reference and pertinent reminders are deliberately
   repeated. A small session/date field replaces the large heading and extended-rest
   field. The product owner's private quicksheet informs the organization;
   its private character/rules data is not embedded.
   Instructional tracking captions are omitted; the matrix and shared group
   structure carry that information visually.
3. **Feature reference:** readable variable-height full-description cards grouped
   into Class features, Racial traits and Feats,
   category icons/subheaders, preserved prose headings, a long-title case and
   multi-paragraph benefits. These are not fixed-size physical cards.
4. **Equipment and record:** slot-oriented equipped list, carried quantities,
   power frequency index with levels (or explicit nonlevel origins such as Item),
   advancement/XP, appearance/personality, companions and notes.

All content is synthetic and labelled illustrative, not an authoritative D&D
build or a calculated example. The portrait is a placeholder. No proprietary
definitions or sample files are required. Controls switch Letter/A4 and
monochrome in memory and expose the browser print action; writing areas and
hearts are paper affordances, not interactive Play state.

## Boundaries before integration

- Replace the fixtures with the shared sheet model only after visual feedback.
- Preserve both full feature rules and authored short descriptions; the current
  production model flattens features into abbreviated values.
- Determine reliable reminder inclusion and shared-resource relationships from
  recovered metadata; do not infer mechanical restrictions from this fixture.
- Implement real variable-count pagination and continuation for dense features,
  long notes, large inventories and many powers. Four fixture pages do not
  constitute a pagination solution.
- Carry through real inventory slots, loadout calculations, learned references,
  conditional defenses/movement and recovery/source boundaries.
- Confirm paper/ink usability and actual browser print output during integration;
  this prototype is not the production Letter/A4 print acceptance matrix.

Focused checks: prototype rendering tests, web TypeScript checks and prototype
lint. Browser review checks fixture content against page-footer bounds on Letter
and A4, along with monochrome controls. This does not resolve the existing dense
physical-card overflow assertion documented in `implementation-status.md`.
