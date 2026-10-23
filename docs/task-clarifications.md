# Product-owner task clarifications

This file records decisions for the active `tasks.txt` queue so later task
agents can begin from durable repository context rather than conversation
history. The corresponding implementation task should move any lasting product
or architecture decision into the established specification or decision log.

## Attack-type icon task

This task is deferred by the product owner and is commented out in `tasks.txt`.
Retain the research below for the later design pass. The separate action-type
icon task remains active and should use the exact `tabletop-dashboard` symbols.

- The range/shape vocabulary must distinguish at least Melee, Ranged, Melee or
  Ranged, Close Burst, Close Blast, Area Burst, Area Wall, Aura, and Personal.
- Prefer a single-sword icon for Melee over crossed swords, if a suitable icon
  is available.
- The current arrow is acceptable for Ranged, but evaluate a bow icon as a
  potentially clearer alternative.
- Area Wall needs an immediately recognizable wall treatment, such as a castle
  wall or battlement, rather than an abstract hatched square.
- Close Burst means a radius centered on the attacker.
- The chosen Close Burst direction is a sun/radiance icon: one central point
  with rays clearly indicating outward emission.
- Close Blast means a cone originating from the attacker.
- Area Burst means a radius centered on a remote point chosen by the attacker.
- Area Wall means a line originating from a remote point chosen by the attacker.
- Before implementation, present a revised complete set of specific icons for
  every action type and attack/range shape, incorporating all feedback above
  and showing them at their intended UI size. Do not begin implementation until
  the product owner explicitly approves the full set.

## Arbitrary current-level task

Selecting level N should immediately set the character to level N. Every
unresolved choice from levels 1 through N remains visibly pending and editable
afterward; incomplete earlier choices must not block the level change.

## Class key-abilities task

- Do not use green highlighting, because green already communicates selected
  state in the ability controls.
- Put a literal key icon on the right side of each radio-button option that
  corresponds to one of the selected class's key abilities.
- Preserve the authored key-ability order because it communicates relative
  importance.
- Add a sentence immediately above the ability controls in the form “A/An
  {Class}'s key abilities are X, Y, and Z.” Use grammatically appropriate
  wording and the class's authored ordered values.

## Class-detail revamp task

Produce a proposal for product-owner approval before implementation. The initial
candidate hierarchy is identity/summary, combat essentials, proficiencies and
skills, features and build choices, descriptive text, then subdued source
metadata; this hierarchy is not yet approved.

## Build-tab table folding and pre-scroll task (queued 2026-10-22)

Done (commits `49b95e6`, `8554ab4`); owner checks are in the checklist's
"Build-tab folding and pre-scroll" section.

Feedback from a tester (Chris), relayed by the product owner. He was on an
older public build; none of the 2026-10-22 changes were public yet. Start this
only after the agents then editing `CharacterEditorPage.tsx` and `builder-ui.ts`
have committed.

1. **Fold filled choices on arrival.** Every table choice on a tab whose pick
   is already made starts folded when the tab loads, as level 1 does, even
   when the tab has only one choice (the old build folded only when a tab had
   more than one). Commit `34a2ef0` ("Fold filled Build-tab choices to their
   picks on arrival") appears to do this already. Verify it against the
   request on several levels and tabs (powers, feats, class features, a
   one-choice tab) and close any gap.
2. **Pre-scroll to the pick.** After a tab loads, its tables start folded. The
   first time after loading the tab that a table with a pick is expanded, the
   table is pre-scrolled so the selected row is the top row under the sticky
   column headers, or as high as it can go when it's near the bottom of the
   list. Later expansions in the same tab visit needn't re-scroll. Chris
   reported the "floating" selected row is not always obvious. The table
   already pre-scrolls on its first render (`initialCandidateScrollTop` in
   `candidate-table-initialization.ts`, used by `CandidateSelectionTable.tsx`),
   so find the cases where that misses. Unverified guesses: the table renders
   while its accordion is folded, so its height is zero and the measured
   position is wrong; the pick is inside a collapsed group or on another page
   (`candidate-table-paging.ts`); or the table is re-shown rather than
   remounted.

Hand the owner the visual checks in `docs/visual-review-checklist.md` (Where /
Expect / Wrong if format).

## Power-swap chain evaluation task (queued 2026-10-22)

Found while making the power-swap rows self-explanatory (commit `f1c1f0c`).
Start it when no other agent is editing `packages/rules-engine/src/evaluator.ts`.

When a later swap trades away an earlier swap's pick, the evaluator reports
that slot's final holder as every earlier swap's pick. On the visual-review
`executioner-fighter` (Hybrid Executioner/Fighter L27), the saved swaps are
Bristling Defense → Hurricane Strike (15), Hurricane Strike → Toppling Finish
(19), Toppling Finish → Hurricane Strike (25), and Bitter Harvest → Coward's
Reward (27). At levels 15 and 19 the evaluator marks Hurricane Strike (the
level-25 pick) as the selection, and the level-15 "Power to replace" table
doesn't list Bristling Defense. The rows' folded summaries read the saved build
and are correct, so they can disagree with the open tables at 15 and 19. The
fix belongs in the `replace` case of `evaluator.ts`: resolve each swap's own
selection through the replacement chain at its level. It is likely an
`EvaluatedCharacter` semantics change, so bump `RULES_EVALUATION_CACHE_VERSION`.
Follow AGENTS.md's legacy-parity method (the native `CheckReplaceElem` /
`VerifyDrop` paths) and remove the known-gap note from the "Essentials power
swaps" item in `docs/visual-review-checklist.md` once it's fixed.

## Queue commit policy

Once a task is confirmed complete, commit its work. Keep different tasks in
separate commits.
