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

1. **Summary:** identity/portrait placeholder, ability scores and modifiers,
   prominent defenses and health references, movement/awareness, complete skill
   list, languages, conditional/ally-facing reminders and abbreviated feat
   reminders. Mutable values point to the scratchpad instead of scattering
   writing boxes throughout the reference page.
2. **Play scratchpad:** blank health/temp-HP fields, numbered fillable-on-paper
   surge hearts, action points, death saves, six encounter-use columns, daily
   power tracking, an explicit shared-use example, treasure/consumables and
   temporary effects. Quick reference and pertinent reminders are deliberately
   repeated. The product owner's private quicksheet informs the organization;
   its private character/rules data is not embedded.
3. **Feature reference:** readable variable-height full-description cards,
   category icons/subheaders, preserved prose headings, a long-title case and
   multi-paragraph benefits. These are not fixed-size physical cards.
4. **Equipment and record:** slot-oriented equipped list, carried quantities,
   power frequency index, appearance/personality, companions and notes.

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
