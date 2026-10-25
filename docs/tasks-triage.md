# Player task triage (2026-10-24)

## Complexity order and disposition

| Order | Task slice                                         | Complexity               | Disposition                                                                                   |
| ----- | -------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| 1     | Action Point action label                          | Trivial verification     | Already correct: Free Action; retain.                                                         |
| 2     | Hu's inactive saved Divine Fortune                 | Small investigation      | Preserved silently, no UI (owner 2026-10-25); no missing choice or calculation defect.        |
| 3     | Plain feat reminder/reference titles               | Small                    | Implemented and regression tested.                                                            |
| 4     | Retain Action Point benefit reminders              | Small                    | Implemented after owner approved all such benefits.                                           |
| 5     | Battle Awareness and Arcane Prodigy missing grants | Small content correction | Done: `content/corrections/9C-feat-powers.part` grants the existing powers.                   |
| 6     | Symbol of Hope/Gouge loadout disagreement          | Medium                   | Slot resolver shared; remaining builder/sheet gap for Hu is item 7.                           |
| 7     | Belt of Vigor ownership/equipment history          | Medium–large             | Done (D097): inventory, loadout and wealth are one current state; history kept for export.    |
| 8     | Remaining encounter-use feat powers                | Large audit/content work | Done: 99 audited; 1 existing power granted, 18 structural powers added, 3 left for the owner. |

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
correctly preserves the saved pick and suppresses its contribution. No deletion,
formula change or evaluator change is warranted. Owner decision (2026-10-25):
dormant picks are silent in the UI — no Diagnostics note or badge — and kept for
export, since a `.dnd4e` storage artifact reads as a bug to a player. This
conclusion uses saved topology, content requirements and the
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

**Done (D097, `d14c19c`).** Owner decision: inventory, loadout and every
currency denomination are one current state on every surface; no per-level
view. `CharacterBuild.inventory` now holds only current concrete holdings
(one per item), the imported loot rows are kept verbatim as
`inventoryHistory`, and stored characters migrate through a journalled
format-3 build upgrade. Equipment, Shop, Loadout, the sheet and every
evaluation (including an earlier level viewed in the Build tab) read the
holdings, so all equip/buy/sell/quantity edits change the current state.
Buying an owned item adds to its holding. Legacy export writes the history
then one delta row per changed item at the current level (an unedited import
writes its rows back unchanged). The wallet is the latest stored value at
any level; edits write that key. Synthetic coverage:
`character-domain/src/inventory-holdings.test.ts`, the legacy round trip in
`legacy-dnd4e/src/index.test.ts`, the earlier-level evaluation in
`build-projection.test.ts` and the format-2 reload in
`character-repository.test.ts`.

Hu acceptance (private, `tmp/inventory-history/hu.ts`): imported holdings
are Symbol of Hope equipped (Holy symbol slot), Way-Leader Gouge carried and
no Belt of Vigor (he wears Belt of Vim), matching his LootTally on builder
and sheet. Equipping the Gouge puts it in both hands on both; buying Belt of
Vigor lists it, and equipping it fills Waist (Belt of Vim returns to
carried), Healing Surge Value stat 0 → 1, surge value 17 → 18.

## Broader feat-power audit

The merged private corpus has 56 feats mentioning encounter-limited uses with
no direct Power grant/select, including 22 multiclass feats. These are audit
candidates, **not 56 confirmed defects**: some grant powers transitively,
replace existing powers or modify passive/recovery behavior.

Battle Awareness (`ID_FMP_FEAT_911`) has a complete existing encounter power
(`ID_FMP_POWER_6592`, distinct from the same-named fighter utility); Arcane
Prodigy (`ID_FMP_FEAT_669`) likewise has `ID_FMP_POWER_9782`.

**Done.** `content/corrections/9C-feat-powers.part` appends one Power grant to
each feat (no copied prose). The rebuilt pack's CBLoader parity check is clean
(38339 records, none missing/extra/changed). Hu, Beldin and Trey (all with
Battle Awareness) each gain exactly one "Battle Awareness Feat" power and card,
Encounter, Immediate Interrupt; none of their legacy saves lists it and none
has the same-named fighter utility, so nothing is doubled. A private probe
(Trey with Arcane Prodigy instead) gains one Encounter Free Action power, and
the feat's tier stat is 1 at level 12. `pnpm parity:baseline` is unchanged
(it compares only powers the legacy save cached).

**Item 8 audit (2026-10-25).** The merged corpus (CBLoader parts plus
`content/corrections`) has 99 feats whose text or short description states a
limited use ("once per encounter/day/round", "1/encounter", "1/day",
"1/round") and that have no direct or transitive Power grant/select; 23 are
multiclass. (The earlier count of 56 used a narrower encounter-only search.)
Each was traced through its rules, selected class features, `_DisplayPowers`,
power-replace targets and every unreferenced classless power record. The
legacy builder shows no power for any of them: its power lists contain only
granted Power elements, and the two private saves with a feat that now gets
a card (GeranHulmaster's Student of the Sword, RaidonKane's Larger than Life)
list none.

| Class                                 | Count                | Feats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Disposition                                                                                                                                                                                                                                   |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) existing record, not granted      | 1                    | Blade Initiate (`ID_FMP_POWER_7691` "Swordmage Warding", Daily Minor)                                                                                                                                                                                                                                                                                                                                                                                                                                               | Granted in `9C-feat-powers.part`; name kept (it names the invoked class feature, not a variant of the feat's).                                                                                                                                |
| (c) new structural record             | 17 feats, 18 records | Bravo, Brawling Warrior, Cyclone Warrior, Defender of the Wild, Infernal Captain's Pact, Student of the Sword, Sly Dodge, Twilight Adept, Warden's Endurance, Wrathful Warrior, Practiced Killer, Berserker's Fury, Student of the Plague (records on its Flamespeed and Larger than Life traits), Secret of Enduring Vigor, Secret of Escape, Glorious Victory, Fast Manifestation                                                                                                                                 | `ID_4ECB_POWER_*` records (Display "Feat Power", usage, action, target/trigger/requirement, original one-line effect summary; no copied prose) granted by the feat or trait and named after it. A trigger with no stated action is No Action. |
| (b) already granted transitively      | 2                    | Pact Initiate, Focused Talent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Their selected class feature grants the power and modifies its usage.                                                                                                                                                                         |
| (b) replaces/swaps a power            | 2                    | Psionic Complement, Psionic Dabbler                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Existing `replace` rules.                                                                                                                                                                                                                     |
| (b) Action Point benefit              | 3                    | Arcane Mastery, Inspiring Leader, Tactical Leader                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Already on the Action Point card (textstrings).                                                                                                                                                                                               |
| (b) grants a class feature            | 2                    | Battle Berserker (Berserker Fury, 1/day), Sneak of Shadows (Sneak Attack)                                                                                                                                                                                                                                                                                                                                                                                                                                           | The feature is not a power in its own class either; reminder stays.                                                                                                                                                                           |
| (b) modifies another power or feature | 25                   | Avernian Emissary Wrath, Body Fuel, Champion of Nature, Daring Performer, Draji Aspirant, Effortless Dilettante, Golden Lion of Urik, Halfling Beast Mastery, Holy Dilettante, Improved Tome of Readiness, Killer's Insight, Nibenay's Glory Practice, Nibenese Bride, Persistent Challenge, Prophetic Preparation, Ruinspoke Scrounger, Sneaky Gnome, Sniper's Aim, Spirit Master of Lalali-Puy, Spirit Talker of Lalali-Puy, Sudden Call, Tyrian Bureaucrat, Velvet Blade Trick, Vital Form, Yellow Cloak of Urik | Rider on an existing power/feature; no power.                                                                                                                                                                                                 |
| (b) resource recovery rider           | 13                   | Arcane/Divine/Martial/Monastic/Primal/Psionic Vampire, Critical Reserve, Elemental Warrior, Gambler's Word, Primal Resurgence, Renewed by Blood, Spare Infusion, Student of the Athanaeum                                                                                                                                                                                                                                                                                                                           | Regains a surge, power point or power use when something else happens; reminder.                                                                                                                                                              |
| (b) ritual cost/mastery               | 18                   | Binding/Deception/Divination/Exploration/Scrying/Travel/Warding Mastery, Master Communicator, Mother's Bloom, Pupil of the All-Father, River-Born Ritualist, Vistani Guardian/Healer/Jongleur/Pathfinding/Seer/Thief, Wild Sage                                                                                                                                                                                                                                                                                     | Ritual allowance (freebee statadds); no power.                                                                                                                                                                                                |
| (b) once-per-round rider              | 13                   | Betrayal of Body, Cleaving Axe, Clever Tail, Commanding Form, Cosmic Blade Channeling, Duty's Virtue, Eldritch Fusillade Expertise, Marked Scourge, Shard Link, Springing Charge, Stinging Swarm, Storm Blade Channeling, Whip Training                                                                                                                                                                                                                                                                             | Not a limited-use power.                                                                                                                                                                                                                      |
| owner judgment                        | 3                    | Far Thought, Coincidental Success, Secret of Reawakening                                                                                                                                                                                                                                                                                                                                                                                                                                                            | See below.                                                                                                                                                                                                                                    |

Total 99 (1 + 17 + 78 class (b) + 3). Student of the Plague's other trait,
Sight of the Unseen, already grants darkvision.

Owner-judgment items, with recommendations:

- **Far Thought** grants permanent `Telepathy` vision, but the feat allows
  5 minutes of telepathy once per day. Recommend a Daily power and removing
  the permanent sense; not done because it changes Senses output.
- **Coincidental Success** (skill-challenge check rider) and **Secret of
  Reawakening** (aspect change and racial-power recovery on recovering from
  dying): recommend leaving them as reminders (not combat powers).
- **Psionic Vampire**'s second clause (once per encounter, minor action:
  lose a surge for 2 power points) could be a card; recommend leaving it with
  the recovery riders unless the owner wants mixed-clause feats split.

Related findings outside this regex (not changed): Ranger's Powerful Strike
and Disrupting Shot describe a power swap but have only `_DisplayPowers` and
no `replace` rule; Blowgun Expert's `power-replace="uncanny aim:…"` and Gythka
Novice's `"Gythka Claw Scoop:…"` name no power (the records are "Uncanny Aim
(Blowgun)" and "Gythka Claw Swoop"), so those swaps cannot resolve. Feats that
add uses of an existing power (Epic Recovery, Discipline Adept, Reaping
Renewal, …) are (b) modifiers.

Verification: `scripts/build-private-content.sh` CBLoader parity check
clean (38339 records, none missing/extra/changed); the pack has 38373
records (+18) and an unchanged 41 import warnings. A private synthetic probe
(`tmp/feat-powers/item8-probe.ts`) gives each of the 19 feats/traits (and
Path of Destruction) exactly one power and one card with the expected usage
and action at levels 1, 11 and 21, none unsupported. Before/after across the
31 `sample-chars` and 9 SampleHeroes: only GeranHulmaster gains one
Student of the Sword card (Encounter, Free) and RaidonKane one Larger than
Life card (Daily, Free); no duplicate cards. `pnpm parity:baseline` has no
new mismatches (it compares only powers the legacy save cached).

Card and reminder both shown (the 97266f2 rule keeps a reminder whose text
has a number, bonus or "when you hit"; to be refined by the coordinator):
Blade Initiate, Bravo, Brawling Warrior, Cyclone Warrior (also has a tier
statadd), Infernal Captain's Pact, Student of the Sword, Berserker's Fury
and Flamespeed (synthetic probe); GeranHulmaster shows the Student of the
Sword card plus the reminders of the feat and of its Student of One-Handed
Weapons class feature. The other 11 drop their reminder.

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

## Follow-ups from owner review (2026-10-24)

- The Battle Awareness feat power's record name ("Battle Awareness Feat") is
  corrected to the feat's name in `9C-feat-powers.part`. Of 107 feat → power
  grants, the only other suffixed name was Path of Destruction (Channel
  Divinity) (`ID_FMP_POWER_8178`, feat `ID_FMP_FEAT_1706`); by owner decision
  (2026-10-25) it is renamed "Path of Destruction" there too. The unrelated
  Tharashk Wayfinder daily of that name (`ID_FMP_POWER_7609`) is referenced
  only by ID. No private sample has the feat.
- References print `displayPrerequisites` (print-prereqs, else plain-prose
  Prereqs), never rule grammar such as `~MULTICLASS` or `!ID_…`.
- Reminder vs. card (refined after item 8): a grant/select-only feature
  (stats named for itself allowed, e.g. tier scaling) whose own power has a
  card — a feat's power, a power named for the feature, or, for a choice
  naming its feat in `_SupportsID`, its feat's — is access-only unless its
  text has an amount the card does not show. A feature granting other carded
  powers (a pact's spell and boon) is access-only unless its text adds an
  amount, bonus, penalty, "in addition" or a "when you use/spend/hit" effect
  (Covenant of Malediction keeps its manifestation). Across the 31 private
  samples this drops Battle Awareness and Mage's Spellbook (its card has the
  same preparation text and table); all 19 item-8 feats and Path of
  Destruction show one card and no reminder.
