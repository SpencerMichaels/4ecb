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
- Treat a level, rather than an individual slot, as the main builder workspace.
  Selecting a level shows one scrollable page with a subsection for every
  choice at that level. The sidebar remains a compact status summary and may
  navigate to a subsection without hiding the others.
- When a user selects a target level, create the complete level timeline
  immediately and present its unresolved decisions. Include every level through
  the target: unresolved items are prominent, completed levels remain visible in
  a compact form, and future choices may be inspected out of order.
- Treat only unresolved decisions at or below the effective character level as
  incomplete. Future-plan decisions remain neutral until that level becomes
  current. Communicate completion and attention primarily through stable icon
  color and subsection-header fills rather than repeated status prose. Keep the
  selection contents on their ordinary surface color; state changes must not
  alter typography or move adjacent controls.
- Distinguish the character's current effective level from the build-planning
  horizon. Choices above the current level are preserved, visible, and editable
  so a player can plan many levels ahead, but they are inactive in current
  calculations and compatibility exports. Lowering the planning horizon hides
  rather than deletes preserved future choices; raising it restores them.
- Show candidates belonging to the choice category and currently legal by
  default. Each selection surface provides a temporary control that also
  reveals same-category options blocked by prerequisites or another objective
  rules limitation, with the reason for their status. Records that do not match
  the choice category are never browsing options for that slot. Do not persist
  this mode on the character or automatically apply it to later choice lists.
  Selecting an illegal option remains an intentional user action rather than an
  accidental consequence of changing the filter.
- Do not label choices as popular or recommended. The application may present
  objective legality, prerequisites, source, and mechanical consequences; it
  must not invent subjective build advice.
- Use Build, Character sheet, Compendium, Characters/library, and Content/settings
  as the initial top-level information architecture. This remains subject to
  prototype review because navigation is easier to judge in context.
- Keep a compact character overview available during building: name, optional
  portrait/token, race, class, level, role, experience, and unresolved or warning
  count.
- Keep important evaluation, save, and validation feedback immediate and
  comprehensible. Interaction responsiveness is a product requirement.
- Selecting an option updates the visible control and its detail pane
  immediately; IndexedDB persistence and rules reevaluation continue in the
  background. Every information-bearing selection surface keeps the focused or
  selected option's source, prerequisites, description, and mechanical fields
  in an adjacent detail pane.
- Repeated Background slots use one primary **Choose background** section;
  already selected extras remain visible and optional empty slots appear one at
  a time through **Add another background…**. A revealed empty slot can be
  removed with the same compact X action used for a completed optional
  background; removing one never clears the required primary background.
- Legacy Build records are starting presets, not persistent mechanical choices.
  Present them after class selection as one dropdown and an explicit Apply
  action. The selected preset drives the shared detail pane, with its authored
  description followed by the suggested feature, feat, skill, and power list.
  Applying it fills only matching, currently open, rules-legal level-1 choices,
  reports the result immediately, and never overwrites work already chosen. An
  imported legacy Build occurrence remains preserved internally for round-trip
  compatibility without appearing as a to-do.
- Skill Training uses one toggle list rather than repeated dropdowns. It shows
  every category-valid skill, marks trained skills, permits direct train/untrain
  toggles, and announces **X out of Y skills chosen** while preserving the
  evaluator's positional slots underneath.
- Large parenthetical feat families use progressive two-stage selection: choose
  the feat family first, then its weapon, implement, skill, or other parameter.
  This is presentation-only; the selected exact legacy feat remains visible in
  the timeline and is the identity stored by the character.
- Autosave every committed character change. Show concise saving, saved, and
  failure states without interrupting ordinary work, retain transactional undo
  and redo, and never imply persistence before the storage commit succeeds.
- An ordinary dropdown's **Unresolved** option is a real edit: it replaces that
  exact saved slot with an unresolved placeholder, immediately updates the
  control, autosaves, and remains undoable. It must never be a visual-only value
  that snaps back on reevaluation.

## Character-sheet templates

- Screen-oriented builder views and printed sheets are distinct layouts sharing
  the same authoritative sheet model.
- Printing supports an explicit sheet-template selection so multiple formats can
  coexist without forking character data or calculation behavior.
- The first template is a close modern implementation of the legacy sheet. Its
  principal compatibility goal is familiar information geography: users should
  find a given value in roughly the same part of the same page as before.
- A later modern template may substantially redesign hierarchy, density, and
  pagination while retaining the recognizable 4E power and stat semantics.
- Template identity and relevant print options must be explicit in previews and
  exports; adding a template must not change existing saved characters' rules
  interpretation.

Rules choices created by the immediately preceding selection are presented as
one progressive choice flow, not as independent level cards. The first chosen
entity names the flow when available, and numbered steps keep the initiating
choice, its dependent feature choice, and any resulting replacement together.
This is presentation-only: each step still dispatches and stores its exact
rules-engine occurrence. Archery Mastery therefore reads as one section that
flows from the feat to Rapid Shot Mastery to the at-will power being replaced.

Repeated positional slots emitted by one rules selection are likewise one
section with an explicit completion count. Each slot remains independently
selectable and stored. This covers the paired ability increases at levels 4,
8, and later intervals, the usual pair of level-1 at-will powers, and the two
class slots of a hybrid character. Slot-specific controls such as Background
and Skill Training retain their more specialized grouped presentations.

The temporary **Show unavailable options** control is level-wide rather than
repeated in every choice. Compact choices whose candidate records add no useful
player-facing explanation, notably ability increases, omit the empty detail
pane and supporting filter prose.

Ordinary optional replacement rules are presented as retraining, matching the
player-facing game concept. An unused retraining slot is absent from the level
timeline and initially renders only **Retrain a skill…**, **Retrain a feat…**,
and **Retrain a power…** actions for categories actually available. Activating
one reveals a category-filtered editor that can be cancelled before a choice is
made. An imported or completed retraining remains visible in the level pane as
history, but not as a required timeline decision, and can be explicitly removed
with the same compact X affordance used for other optional additions to restore
the replaced selection. Special replacements that
are consequences of another choice, such as Rapid Shot Mastery, remain inside
that choice's progressive flow rather than being relabeled as retraining.

## Priority journey

Optimize the first design and prototype around this end-to-end journey:

1. Create a new character against the active content profile.
2. Make guided build choices and inspect upcoming choices.
3. Advance directly to a desired level while resolving required decisions.
4. Review the completed build and its remaining warnings or illegal choices.
5. Produce a readable printed character sheet for use in a game.

Import, retraining, compendium browsing, and detailed correction workflows must
remain supported, but they are secondary when resolving early design tradeoffs.

## Deferred equipment-choice presentation

The legacy builder unusually displays item-owned selections, such as Armor of
Resistance's damage type, in the wearer's Class pane. Preserve that underlying
choice and its legacy export topology, but do not treat the placement as a
modern information-architecture requirement. When the character equipment pane
is fully designed, item configuration should be reviewed there with a clear
link back to any character-level consequences. Until then, inventory-owned
choices remain evaluable and recoverable without cluttering level advancement.

## Validation sequencing

M5.5 first establishes and receives product-owner approval for the principal
interaction design. Comprehensive accessibility certification and the broad
browser, operating-system, assistive-technology, and physical-device matrix may
be scheduled closer to 1.0. Semantic HTML, labeled controls, keyboard-operable
native primitives, reduced-motion behavior, readable contrast, and non-forced
responsive sizing remain continuous engineering constraints so later validation
does not require a wholesale rewrite.
