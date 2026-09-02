# Interface design brief

This brief records the product-owner direction for M5.5. It governs the durable
builder interface and supplies the interaction language that later phone play
mode should extend. It is a product direction, not permission to copy another
application's protected visual assets.

## Product character

- Present as a modern web application rather than a recreation of the legacy
  desktop program or a decorative digital character sheet.
- Use Pathbuilder 2e as the principal reference for information structure and
  workflow: per-level choices remain visible in a sidebar and the selected
  choice opens a focused editor in the main pane.
- Keep the design clean, minimal, fast, and information-focused. Avoid decorative
  flourishes and slow animation. Motion is appropriate only when it communicates
  state, location, causality, or progress, and must not delay interaction.
- Use simple monochrome interface icons from a consistent open icon system or
  original equivalents. Do not use emoji as application iconography.
- Support light and dark themes, initially following the browser/operating-system
  preference and allowing an explicit user override.

## D&D 4E visual language

- Preserve the recognizable legacy D&D 4E color mappings and icon concepts for
  semantic game information such as at-will, encounter, daily, and item powers,
  defenses, abilities, and other established stat categories.
- Re-create those meanings in an original, modern component system rather than
  copying legacy UI chrome or proprietary bitmap assets.
- Color and icons reinforce meaning but do not become the only carrier of state.

## Builder interaction model

- Use a guided workflow by default while allowing users to inspect choices from
  later levels without first completing every earlier choice.
- Use a hybrid structure: an always-available build/character overview, an
  ordered per-level choice sidebar, and focused detail/selection content in the
  main pane.
- Show valid choices by default. Provide an explicit persistent mode that shows
  all options, including illegal or currently unavailable choices, with the
  reason for their status. Selecting an illegal option remains an intentional
  user action rather than an accidental consequence of changing the filter.
- Keep important evaluation, save, and validation feedback immediate and
  comprehensible. Interaction responsiveness is a product requirement.

## Priority journey

Optimize the first design and prototype around this end-to-end journey:

1. Create a new character against the active content profile.
2. Make guided build choices and inspect upcoming choices.
3. Advance directly to a desired level while resolving required decisions.
4. Review the completed build and its remaining warnings or illegal choices.
5. Produce a readable printed character sheet for use in a game.

Import, retraining, compendium browsing, and detailed correction workflows must
remain supported, but they are secondary when resolving early design tradeoffs.

## Validation sequencing

M5.5 first establishes and receives product-owner approval for the principal
interaction design. Comprehensive accessibility certification and the broad
browser, operating-system, assistive-technology, and physical-device matrix may
be scheduled closer to 1.0. Semantic HTML, labeled controls, keyboard-operable
native primitives, reduced-motion behavior, readable contrast, and non-forced
responsive sizing remain continuous engineering constraints so later validation
does not require a wholesale rewrite.
