# Familiar card proposal

Status: accepted by the product owner (2026-10-20). Step 1 of 2; step 2
(beast/animal companion stat block) is a later, separate proposal.

## Problem

A player reported that the character sheet has no place for an arcane
familiar. What the sheet shows today, checked by adding Arcane Familiar + Sprite
to a copy of a real character and evaluating it against the full pack:

- The **Arcane Familiar** feat appears in the feat list with its short
  description.
- The chosen **familiar** (a `Familiar` element, e.g. Sprite) appears nowhere
  directly. Its rules apply (Sprite's +2 Arcana is in the Arcana total).
- A **"Familiar: Sprite" at-will power card** appears among the powers. It does
  not come from WotC data but from a community card set (see "Community card
  sets" below). It covers 92 of the pack's 103 familiars; the other 11 (Shadow
  Raven, Bound Quasit, Kivit, …) show nothing at all. Its text is a hand copy
  that can be wrong. The Sprite card says speed 2 and "Speed 4, fly 6", but
  the familiar element and the D&D Insider compendium entry (_Heroes of the
  Feywild_ p. 132) both give speed 4, fly 6.

## Sources

### Legacy application (oracle for what it showed)

The legacy sheet viewer adds a **Familiar panel** to the printed layout whenever
the character has a familiar choice
(`CharTracker/CharacterSheetDisplay.cs`, `PanelTypes.FAMILIAR`), alongside a
Companion panel for beast companions. The panel is `FamiliarBlock`
(`D20RulesEngine/FamiliarBlock.cs`) and shows only:

| Panel field       | Source                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Name              | familiar element name                                                                                                  |
| Description       | familiar element description (lore)                                                                                    |
| Senses            | `Senses` field                                                                                                         |
| Speed             | `Speed` field **+** character stats `ALLY.Speed` + `COMPANION.Speed` + `FAMILIAR.Speed`, then `, ` + `Secondary Speed` |
| Constant Benefits | `Constant Benefits` field                                                                                              |
| Active Benefits   | `Power` field                                                                                                          |

That `ALLY.` + `COMPANION.` + `FAMILIAR.` sum is the legacy `GetCompanionStat`
helper (`CompanionStatBlock.cs`). The beast companion block uses it for every
stat.

Content coverage across the 103 familiars: Speed/Power/Constant Benefits 94,
Secondary Speed 92, Senses 90, Size 88, Tier 88, Quirks 9.

### Rulebook (_Arcane Power_, pp. 137–139)

The legacy panel omits the general familiar rules because they live only in the
book, not in the content data:

- **Defenses:** a familiar uses your defenses.
- **Hit points:** 1, but a missed attack never damages it. If destroyed, it
  reappears in passive mode after your next short or extended rest. It dies and
  returns with you.
- **Skills and checks:** it uses your bonuses for all skill and ability checks.
- **Size:** Tiny. **Can't attack, can't flank**, can't manipulate objects
  unless noted.
- **Modes:** a minor action switches between them.
  - **Passive:** on your person, can't be targeted or damaged.
  - **Active:** moves its speed when you spend a move action, stays within 20
    squares, and provides its active benefits.
- **Constant benefits** apply in either mode while it has at least 1 hit point.
- Its **senses** are the familiar's own, not yours.

Content then adds bonuses to the familiar's own defenses and speed, never the
character's:

- Vigorous Familiar: +1 AC and +2 speed.
- Bonded Raven (paragon feature): +2 to all defenses.
- Familiar's Baldric: +1/+2/+3 item bonus to all defenses.
- Shared Speed: +1 speed.

They are recorded as `FAMILIAR.AC`, `FAMILIAR.Fortitude Defense`, …,
`FAMILIAR.Speed`. Arcane Familiar's "+1 per additional familiar feat" is text
only, with no rule behind it.

## Proposal

### Content and model

- `sheet-model` gains a `companions` list of companion cards. Step 1 fills it
  with `kind: "familiar"` from the evaluated `Familiar` occurrences; step 2 adds
  `kind: "beast"`. These are not `SheetCard` powers.
- Card fields are the legacy panel's fields, plus:
  - **Size:** from the content, defaulting to Tiny per the rulebook.
  - **Quirks:** display-only.
  - **Defenses:** AC/Fort/Ref/Will, each your defense plus the
    `ALLY.`/`COMPANION.`/`FAMILIAR.` bonus.
  - **Hit points:** 1.
- **All familiar numbers** (speed, defenses) are calculated once in
  `rules-engine/src/derived-values.ts`, using the legacy `GetCompanionStat`
  sum. The card never adds numbers itself.
- **A short fixed rules line** covers HP 1 (a miss never damages it), uses your
  skill/check bonuses, can't attack, and active/passive by minor action. It is
  written in our own words, like the synthesized Action Point/Second Wind
  cards.
- **The community "Familiar: X" power cards are removed** from the pack, so the
  familiar is not shown twice with conflicting numbers. The mechanism (a
  content correction or a build-time exclusion) is chosen during
  implementation. There is no special-casing by name in code.

### Layout

The card is a fixed-size printed card in the same frame as the **Play data**
character card (`PrintCharacterCard`): a title band with the name and an
identity line, `StatGroup` tiles, then labelled notes, and a type bar that
reads **Familiar**. It uses the existing stat-tile tones and card ink, with
no new visual language.

```
┌──────────────────────────────────────────┐
│ Sprite                                   │  title band
│ Tiny familiar · Heroic                   │  identity line (Size, Tier)
├──────────────────────────────────────────┤
│ AC 18  Fort 14  Ref 16  Will 17          │  Defenses tiles (defenses tone)
│ HP 1   Speed 4, fly 6                    │  health / movement tiles
│ Senses  Low-light vision                 │
│ HP 1; a miss never damages it. Uses your │  fixed rules line
│ skill bonuses; can't attack. Minor action│
│ to switch active/passive.                │
│ Constant benefits                        │
│ • +2 bonus to Arcana checks.             │
│ • Arcana to sense magic as a minor action│
│ Active benefits                          │
│ Light: As a minor action, you command    │
│ the sprite to shed bright light …        │
│ Quirks (when present)                    │
│ Sprites are almost as common in the …    │  description; hidden with
│                                          │  "Hide flavor text"
├──────────────────────────────────────────┤
│ Familiar                                 │  type bar
└──────────────────────────────────────────┘
```

Text is fitted with the existing `use-print-card-fit` hook, like power and item
cards.

### Where it appears

1. **Printed card deck:** right after the Skills card, before Action Point,
   grouped with the other "who you are at the table" cards. (Legacy appends the
   panel after the power cards.)
2. **Builder:** the familiar choice's detail pane shows this same card in
   `layout="panel"`, following D079 (one card format on every surface). That
   way a player sees the full familiar before picking it. Before the familiar is
   chosen, its defenses come from the character's defenses at the level being
   viewed.
3. Page 1 and the Character Profile are unchanged.

## Community card sets

`scripts/build-private-content.sh` merges every `CBLoader/Custom/*.part` file
into the pack, as CBLoader did. These are community content files supplied
with the legacy application, not reverse-engineered output. Most of what the
contributor Tivaan added across them is legitimate data (items, feats, themes,
race and class powers). The **card sets** are the elements whose source is
"Tivaan's … Card(s)": fake power cards meant to print a companion's statistics
from CBLoader-era sheets.

| Source                                    | Fake power cards                                              | Per-level helper elements |
| ----------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| Tivaan's Familiar Cards                   | 94 ("Familiar: Bat", …)                                       | —                         |
| Tivaan's Companion Cards                  | 11 ("Companion: Bear", "Companion: Wolf", … beast companions) | 1,660                     |
| Tivaan's Fey Beast Companion Cards        | 4 ("Trained Displacer Beast", …)                              | 116                       |
| Tivaan's Animal Companion Cards           | 5 ("Animal Master's Companion: Cat", …, minion companions)    | —                         |
| Tivaan's Sarifal Feywarden Companion Card | 2                                                             | —                         |

The cards are granted by the chosen element: 92 familiars, 328 companions, 271
class features and 2 powers. The per-level helpers are `Companion`-typed
elements ("Animal Companion Cat 5", …). Each one `modify`s the card's Defenses,
Hit Points, Healing Surge Value, ability scores and title for one companion
level, so the beast numbers are **hand-tabulated per level**. They are not
calculated from the character, so feats or items that improve a companion don't
change them. This is how animal companions "appear" today.

Step 1 removes only the familiar set. Step 2 replaces the companion sets with
real calculated stat blocks, and their tabulated numbers become a useful
cross-check while building it.

## Product-owner answers (2026-10-20)

- **Deck position:** after the Skills card, as proposed.
- **Fake familiar cards:** replace them with the new card.
- **Which familiar:** the owner is asking the player.
- **Familiar defenses and hit points:** shown on the card, as proposed above.
  The base values come from _Arcane Power_ (your defenses, 1 hit point) and
  the `FAMILIAR.*` bonuses are added to them.

## Verification

- Unit tests for the sheet-model familiar card and the derived familiar
  speed/defenses (synthetic content).
- A private check that all 103 pack familiars produce a card, that no
  "Familiar: X" power card remains, and that a Vigorous Familiar character shows
  AC +1 and speed +2.
- A visual check of the printed deck and builder pane by the product owner.
