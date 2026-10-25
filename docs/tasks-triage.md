# Player task triage (2026-10-24)

## Complexity order and disposition

| Order | Task slice                                         | Complexity               | Disposition                                                                                            |
| ----- | -------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1     | Action Point action label                          | Trivial verification     | Already correct: Free Action; retain.                                                                  |
| 2     | Hu's inactive saved Divine Fortune                 | Small investigation      | Expected preserved selection; no missing choice or calculation defect.                                 |
| 3     | Plain feat reminder/reference titles               | Small                    | Implemented and regression tested.                                                                     |
| 4     | Retain Action Point benefit reminders              | Small                    | Implemented after owner approved all such benefits.                                                    |
| 5     | Battle Awareness and Arcane Prodigy missing grants | Small content correction | Existing power definitions can be granted; separate checkpoint.                                        |
| 6     | Symbol of Hope/Gouge loadout disagreement          | Medium                   | Slot resolver shared; remaining builder/sheet gap for Hu is item 7.                                    |
| 7     | Belt of Vigor ownership/equipment history          | Medium–large             | Confirmed raw transactions exposed as current holdings; repair projection and edit semantics together. |
| 8     | Remaining encounter-use feat powers                | Large audit/content work | Classify transitive grants, missing powers and passive modifiers before adding corrections.            |

This is an investigation and quick-win checkpoint, not closure of the equipment
or full feat-power work. Keep those items open in this order within M5.7.

## Action Point reminders

Owner decision: retain every Action Point benefit in "Remember in play", not
just Demonskin Tattoo, because a benefit can motivate spending the point.
Self, ally and beast-companion notes stay on their Action Point card as well.
The exception uses card identity and source provenance; ordinary power and
conditional-modifier deduplication stays in place. Synthetic coverage verifies
all three note groups and continued suppression of unrelated duplicates.

## Hu's inactive saved choice

The owner corrected the initial report: Divine Fortune is an **inactive saved
choice**, not a missing choice. Hu's level-1 saved Channel Divinity subtree
contains multiple classes' branches. The Divine Fortune selector requires
Cleric (`ID_FMP_CLASS_2`); Hu is an Avenger. His level-6 Versatile Channeler
selects Healer's Mercy separately and does not grant Cleric identity. The
original file's final RulesElementTally excludes Divine Fortune. D043 therefore
correctly preserves the saved pick, suppresses its contribution and explains
it in Diagnostics. No deletion, formula change or diagnostic suppression is
warranted. This conclusion uses saved topology, content requirements and the
original active tally, not a presumption that calculated caches are stale.

## Equipment follow-up boundaries

**Loadout slots.** Builder `resolveLoadoutAssignments` in
`apps/web/src/equipment-ui.ts` prioritizes the modern symbol slot for holy
symbols and both hands for a two-handed weapon. Imported holdings have no
explicit modern slots; the sheet forwards those empty slots, then
`SheetOverview.tsx` falls back to the item's authored legacy `Off-hand` slot.
Extract/reuse a shared resolver and project resolved slots into the sheet;
remove independent renderer inference. Validate imported two-handed weapon +
holy symbol, explicit modern assignments, edits and reloads.

Done: the resolver (`inventorySlotCandidates`, `inventoryRequiresBothHands`,
`resolveLoadoutAssignments`, `isAuthoredShield`) now lives in
`packages/sheet-model/src/loadout-slots.ts`; the builder re-exports it and
`buildEvaluatedSheetModel`/`buildSheetModel` project its slots into
`overview.inventory[].slots`. `SheetOverview.tsx` no longer reads the authored
Item Slot; an equipped holding the resolver cannot place reads "Held /
unspecified". Synthetic coverage: `loadout-slots.test.ts`.

Hu re-check: at level 8 his file's final LootTally and the modern
current-level aggregate both have Symbol of Hope equipped and Way-Leader Gouge
owned but **unequipped** (level-6 rows: Gouge 0/−1, Symbol 0/+1). The sheet
now shows Symbol of Hope in the Holy symbol slot and no weapon, matching
legacy. The builder Loadout still resolves over raw positive rows (the level-5
purchase: Gouge equipped, symbol not), so it disagrees until item 7 feeds it
current-level aggregated holdings.

**Inventory history.** Hu acquires Belt of Vigor at level 5 (+1 quantity,
+1 equipped) and removes it at level 6 (-1/-1). His final LootTally correctly
has zero. Native `D20Workspace.TallyLoot` accumulates these transactions, as
does modern `aggregateInventory`. EquipmentWorkspace and CharacterEditorPage
instead filter raw positive rows, exposing the historical purchase as if it
were still owned. Equipping it does not reverse its later removal. The item
already supplies the correct typed Healing Surge Value bonus; no derived-value
arithmetic correction is indicated.

Use current-level aggregated holdings in Equipment and map commands back to
history safely. Preserve original transactions. Validate removed items,
repeated purchases, negative equipment deltas, equip/unequip, quantity changes,
sales and viewing earlier levels. Merely hiding negative rows is not a fix.

## Broader feat-power audit

The merged private corpus has 56 feats mentioning encounter-limited uses with
no direct Power grant/select, including 22 multiclass feats. These are audit
candidates, **not 56 confirmed defects**: some grant powers transitively,
replace existing powers or modify passive/recovery behavior.

Battle Awareness (`ID_FMP_FEAT_911`) has a complete existing encounter power
(`ID_FMP_POWER_6592`, distinct from the same-named fighter utility); Arcane
Prodigy (`ID_FMP_FEAT_669`) likewise has `ID_FMP_POWER_9782`. Grant those existing
definitions through corrections before expanding scope.

Active-use candidates without same-named powers include Student of the Sword,
Defender of the Wild, Sly Dodge, Infernal Captain's Pact, Bravo, Warden's
Endurance, Brawling/Cyclone/Wrathful Warrior, Twilight Adept and Practiced
Killer. Trace transitive grants and exact actions before adding structural
power definitions. D089 forbids copying published prose into tracked
corrections; consider references to the privately loaded source description
or original concise summaries. Keep passive improvements as modifiers where
appropriate. Validate grants, usage, action type, sheet cards and absence of
duplicates on exact fixtures. The supplied characters are private diagnostics,
not public test dependencies or new same-profile legacy goldens.

## Quick presentation fixes and rules confirmation

**Feat reminder titles — implemented.** Feat reminders use the plain feat
name, including reminders reconstructed from a power's additional effects.
Chosen skills and granted class aliases remain in the feature model; the
character reference prints them in a `Choices` paragraph instead of appending
them to the feat heading. Other feature types retain their existing choice
headings. This handles the multiclass-feat pattern, not just Battle Awareness.
Public synthetic regressions cover an encounter-use feat with chosen Athletics
and a granted Fighter alias, and confirm the metadata survives on the reference.

**Action Point action type — confirmed correct; no change.** The recovered
original viewer's
`reverse-engineering/generated/decompiled/CharacterSheetViewer/CharTracker/ActionPointCard.cs`,
`Update()`, builds the Action Point rules text and explicitly identifies spending
a point as a free action. The current synthesized card's `Free Action` therefore
matches the behavioral oracle. This is direct original-application evidence,
not an inference from a cached character. The existing public universal-card
test asserts that classification.

Verification (project-local Nix):

```sh
nix develop path:. -c pnpm vitest run packages/sheet-model/src/feature-choices.test.ts packages/sheet-model/src/overview.test.ts packages/sheet-model/src/universal-action-cards.test.ts apps/web/src/SheetOverview.test.tsx
```

Result: 4 files / 109 tests passed. Release-wide checks and remaining task
dispositions are recorded by the coordinating change.
