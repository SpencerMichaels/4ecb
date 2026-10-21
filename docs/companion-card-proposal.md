# Beast companion card proposal

Status: accepted by the product owner (2026-10-21); see "Product-owner
answers". Step 2 of `familiar-card-proposal.md`. Associates and summoned creatures are left to a
later step 3 (see "Scope").

## Problem

A beast companion has no stat block. What the sheet shows today for a Beast
Mastery ranger (checked against the full local pack):

- A **"Companion: Bear" at-will power card** from the community card set
  (see "Community card sets"). Its defenses, hit points and ability scores are
  hand-copied for each level, so they ignore everything that improves the
  beast: Resilient Beast, Sturdy Beast, Human Beast Mastery, Companion's
  Defender, the hybrid −1 penalty (`BEAST.*` stats). They also ignore the
  player's real Companion Ability Increase picks. Instead, each pick
  combination is enumerated as its own helper element: up to 34 variants at
  level 28 for one beast.
- The **Beast Melee Basic Attack** card (`ID_INTERNAL_POWER_BEAST_MELEE_BASIC_ATTACK`)
  and every ranger beast power (predator strike, …) print with no attack or
  damage numbers. `powers.ts` flags them `companion-ability:<id>` as
  unsupported (`powers.ts` ~2340–2350), because the engine has no beast attack
  bonus, `[B]` die or beast ability modifier.
- The builder already offers the companion choice and the six Companion
  Ability Increase choices (the `Companion` section in `builder-ui.ts`), and the
  engine already sums their `Companion.<Ability>` stats. Nothing reads them.
- Heroes of the Forgotten Kingdoms sentinels get their wolf or bear as two
  "Notes" utility cards, with no hit points, defenses or attack bonus.

The coverage registry lists `Companion` and `Companion Ability Increase` as
gaps (`apps/web/src/content-type-coverage.ts`). The coverage matrix has no
generated character that picks a beast companion: its three `Companion`
selects and the twelve Companion Ability Increase selects show up only as "not
reached". Its "Unpresented Companion" rows (390) are Animal Master and Quasit
helper elements, which this step does not cover (see "Scope").

## Sources

### Legacy application (oracle)

The sheet viewer adds a **Companion panel** when the character has a Companion
choice (`CharTracker/CharacterSheetDisplay.cs:1698`). The panel fills itself
only when the character has Beast Mastery (`ID_FMP_CLASS_FEATURE_1030`), and it
takes the chosen element's numbers from `BeastBlock`
(`CharTracker/PanelModelCompanion.cs:344–437`). The sentinel's Wolf and Bear
Companion features grant Beast Mastery, so they get the panel too. The `.dnd4e`
writer also saves one `BeastBlock.ToXML()` per Companion element into
`<Companions>` (`-Module-.cs` `WriteCompanions`, ~11978).

Every number is a character stat plus a field on the companion record. There
is **no separate companion evaluation**. `GetCompanionStat(stat)`
(`CompanionStatBlock.cs:41`) sums the character's `ALLY.<stat>`,
`COMPANION.<stat>` and `BEAST.<stat>`. The type prefix is `BEAST_STRING`
(`BeastBlock.cs:12`), and only unconditional statadds count. `L` is the
character's level.

| Panel field  | Legacy computation                                                                                                            | Code                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Name         | `_COMPANION_NAME` + " - Level L " + (`_COMPANION_APPEARANCE` or element name), both textstrings                               | `BeastBlock.Update` :442                                     |
| Abilities    | character stat `Companion.<Ability>`: the record's own statadds, Companion Ability Increase picks, Beast Mastery +1s at 11/21 | `BeastAbilityScore`, `-Module-.cs` :7090                     |
| Size         | `Size` field                                                                                                                  | `SetSize` :307                                               |
| Speed        | `Speed` + GetCompanionStat(`Speed`), then `, ` + `Secondary Speed`                                                            | `SetSpeed` :316                                              |
| Vision       | always "Low-light"                                                                                                            | panel :405                                                   |
| Defenses     | field (`Armor Class`, `Fortitude Defense`, …) + L + GetCompanionStat(`AC`, `Fortitude Defense`, …)                            | `SetDefenses` :340                                           |
| Hit points   | `Hit Points at 1st Level` + L × `Hit Points per Level Gained` + GetCompanionStat(`Hit Points`)                                | `BeastHitPoints` :18348                                      |
| Surges       | HP / 4, "(2 + GetCompanionStat(`Healing Surges`) surges per day)". The panel hard-codes "2 surges per day"                    | `BeastHealingSurges` :18362, `SetHitPoints` :372, panel :407 |
| Attack bonus | L + `Attack Bonus` + GetCompanionStat(`attack rolls`)                                                                         | `BeastAttackBonus` :18329                                    |
| Damage       | `Damage` field (the `[B]` die)                                                                                                | `BeastDamage` :18317                                         |
| Basic attack | "`Attack`; +N vs. AC; `Damage` + `Ability Score` modifier damage."                                                            | `SetBasicAttack` :403                                        |
| Power        | `Power` field (shown when present)                                                                                            | panel; `SetBeastPower` :281                                  |
| Skills       | names of the `Trained Skills` IDs                                                                                             | `SetTrainedSkills` :413                                      |

Beast powers use the same numbers. "Beast's attack bonus" is
`BeastAttackBonus` (`CalcBAB` :23982), `[B]` is the `Damage` die
(`FigureWeaponDice` :24208), and "beast's Strength modifier" is the modifier
of `Companion.Strength` (`AbilModRepl` :34090, `ParseBeastAbilityMod` :24407).
One native special case, `CalcBeast` (:25947), adds your Wisdom modifier to
_enclose the prey_ for a cat, spider or wolf. Companion Ability Increase
choices are the choices whose type starts with "Companion Ability Increase"
(`AbilityLeveling.cs:12`).

**"Companion Class" is unrelated.** The `requires="Companion Class"` statadds
in `.dnd4e` files (for example `scratch/bisect2/Beatrix.dnd4e` ~129–173) come
from `ID_INTERNAL_LEVEL_1`. They switch the base defense and HP rules for a
_Dungeon Master's Guide 2_ companion **character** built as the main character
(`ID_INTERNAL_INTERNAL_COMPANION_CLASS`, granted by the DMG2 Defender, Leader,
Striker and Controller classes, DMG2 p. 27). They are ordinary requirements
the engine already evaluates, not a beast evaluation context.

### Rulebooks

- **_Martial Power_ pp. 38–42 (Beast Mastery):**
  - The beast's level equals yours.
  - Each category gives "Defenses: AC X + level, …", "Hit Points: A + B per
    level" (the per-level amount is multiplied by your full level, so a
    1st-level bear has 16 + 10 = 26) and "Attack Bonus: Level + N".
  - Damage is a `[B]` die plus an ability modifier.
  - It has two healing surges, and its surge value is a quarter of its hit
    points.
  - It has low-light vision.
  - Ability increases: +1 to two scores at 4, 8, 14, 18, 24 and 28; +1 to all
    at 11 and 21.
  - Commands (p. 41): attack and defend are standard actions, move is a move
    action, an opportunity attack takes an immediate interrupt.
  - It can use second wind when you do. Adjacent to it, you can spend a minor
    action and one of your surges to heal it. It follows the normal death and
    dying rules.
  - No skill-bonus formula is given, only trained skill names.
- **_Heroes of the Forgotten Kingdoms_ pp. 89–90 (sentinel animal
  companion):**
  - **HP: your bloodied value.** Defenses: the listed base + your level.
    Attack: your level + 5.
  - Damage: die + your Wisdom and Constitution modifiers, stepping up at 13
    and 23.
  - It shares your healing surges, and its initiative is yours.
- _Player's Handbook 3_ hybrid Beast Mastery: −1 to the beast's attacks and
  defenses (in the content as `BEAST.*` −1). _Eberron Player's Guide_ (griffon)
  and _Dragon_ 392 (horse, simian) add categories in the Martial Power format.
- Not sources:
  - _Player's Handbook 2_ and _Primal Power_ have no beast companion rules.
  - _Dungeon Master's Guide 2_ companion characters are the "Companion Class"
    above.
  - The _Rules Compendium_ PDF is a scan with no extractable text.

### Content

The pack has 1,827 `Companion` records. 13 are real beast companions with stat
fields (all with `Attack Bonus` and `Damage`):

- 8 _Martial Power_ beasts, plus the Vadalis-bred Griffon and the _Dragon_ 392
  Horse and Simian. These 11 are chosen through Beast Mastery's
  `select type="Companion" category="ID_FMP_CLASS_5"`.
- The sentinel Wolf and Bear Companion, chosen through the sentinel trait
  package.

The other records:

- 8 Hexblade summon lore records (`ID_WOG_COMPANION_3–10`), with no fields.
- The Veiled Horde Shadow, a fixed-statistics minion from a consumable item,
  with no `Attack Bonus`.
- The community helper elements.

What content stats feed the companion numbers:

- Every companion record repeats its ability scores as
  `Companion.<Ability>` statadds.
- Beast Mastery adds the 11th/21st-level +1s and the Companion Ability
  Increase selects.
- Feats and items add `BEAST.*`: AC/defenses (9/6), saving throws (11),
  `Hit Points` (4), `attack rolls` (4), `Healing Surges`, `Speed`, skill misc
  bonuses and resistances.
- `ALLY.*` stats exist but are nearly all conditional.

The sentinel's hit points come from `BEAST.Hit Points = +Pet Hit Points`, a
community-style running total of 6 + 2½ per level. That approximates half a
sentinel's HP without the Constitution score, so it is not the bloodied value.

There are no legacy samples with a companion. None of `sample-chars/*.dnd4e`,
`~/Downloads/*.dnd4e` or `scratch/` contains a `Companion` element, and every
`<Companions>` block is empty. This matches the D091 deferred-decisions audit.

## Proposal

### Scope

- **In:** the 13 beast companions above: Beast Mastery, hybrid Beast Mastery
  and the sentinel.
- **Out, step 3:**
  - Associates: 54 `Associate` records from _Heroes of the Feywild_, _Heroes
    of the Elemental Chaos_, _Dragon_ 405/414 and _The Book of Vile Darkness_.
    Their stat blocks exist only as description prose or `_Associated Power`
    cards.
  - Hexblade summons.
  - Animal Master minions (_Dragon_ 399), which have no Companion record at
    all.
  - The Veiled Horde Shadow.
  - Their community card sets.

  None of these has a legacy panel to follow, and most follow "your bloodied
  value" or minion rules rather than per-level formulas. They need their own
  data decision.

### Engine model

- **No second evaluation context.** As in legacy, companion numbers are
  derived values over the character's evaluated stats and the chosen record's
  fields.
- **Formulas.** `rules-engine/src/derived-values.ts` gains
  `beastCompanionStatistics(record fields, stats, level)`. It returns:
  - abilities (score and modifier);
  - AC/Fort/Ref/Will;
  - hit points, bloodied value and surge value (the existing `bloodiedValue`
    and `healingSurgeValue`);
  - surges per day;
  - speed;
  - attack bonus;
  - damage die and damage ability modifier.

  `companionStatBonus` widens its kind to `"FAMILIAR" | "BEAST"`. Each formula
  is the legacy row above; nothing is re-derived in UI or sheet code.

- **Snapshot.** The evaluator calls it once and records
  `EvaluatedCharacter.beastCompanion`: the occurrence and record ID, the
  statistics, and the contributing `ALLY.`/`COMPANION.`/`BEAST.` stat
  contributions as provenance. Bump `RULES_EVALUATION_CACHE_VERSION`. The beast
  is the evaluated `Companion` occurrence whose record has `Attack Bonus` and
  `Damage` fields, a structural test with no IDs.
- **Beast powers.** `powers.ts` reads the snapshot for "beast's attack bonus"
  (attack = the beast attack bonus, with no half level or proficiency), `[B]`
  and "beast's X modifier". It then drops the `companion-ability:` unsupported
  marker. _Enclose the prey_'s Wisdom rider becomes a correction (D089): a
  `statadd name="ID_FMP_POWER_4370:damage" value="+ABILITYMOD(wis)"` on the
  Cat, Spider and Wolf records, replacing the `CalcBeast` special case.
- **Before the beast is chosen** (builder candidate pane), the abilities are
  the candidate record's own fields plus the character's `Companion.<Ability>`
  contributions from other sources, such as increases and tier +1s. Once the
  beast is chosen this equals legacy.
- **Name and appearance** are the legacy textstrings `_COMPANION_NAME` and
  `_COMPANION_APPEARANCE`, edited with the existing `set-text` command, so they
  round-trip with imported `.dnd4e` files.

### Card layout

There is one beast companion card in the familiar card's frame
(`FamiliarCard.tsx` and the Play data frame). It is `kind: "beast"` in
`sheet-model`'s `companions` list, fitted by `use-print-card-fit`, with the
existing stat-tile tones. The beast's basic attack and the ranger's beast powers
stay ordinary power cards, now with numbers, so the stat card has room. The
summary attack line repeats the same derived numbers.

```
┌──────────────────────────────────────────┐
│ Ash — timber wolf                        │  name — appearance (else category)
│ Level 8 Medium beast · Wolf              │  identity: level, size, category
├──────────────────────────────────────────┤
│ AC 22  Fort 20  Ref 20  Will 21          │  defense tiles
│ HP 78  Bloodied 39  Surge 19  Surges 2   │  health tiles
│ Speed 7 · Low-light vision               │
│ Str 16 +3  Con 14 +2  Dex 15 +2          │  ability tiles (score, modifier)
│ Int 6 −2   Wis 15 +2  Cha 6 −2           │
│ Bite +12 vs. AC · 1d8 + 3 damage         │  basic attack summary
│ Trained  Endurance, Perception           │
│ Combat advantage  When a wolf has combat │  Charge / Combat Advantage /
│ advantage against a target, …            │  Opportunity Attacks / Power /
│                                          │  Mount Companion fields
│ Attack or defend: standard action. Move: │  fixed command line, our words
│ move action. Opportunity attack: interrupt│ (sentinel: its own command line)
│ Uses second wind with you.               │
│ Description (flavor; hidden with "Hide    │
│ flavor text")                            │
├──────────────────────────────────────────┤
│ Beast Companion                          │  type bar
└──────────────────────────────────────────┘
```

The mockup is a level 8 wolf with increases Str+Dex at 4 and Str+Wis at 8.
The numbers match the Martial Power formulas, and its HP and defenses match the
community table for level 8.

For a sentinel companion:

- **HP** reads the character's bloodied value (see open question 1).
- **Surges** reads "Shares yours". The record's `BEAST.Healing Surges −2`
  leaves it 0.
- **Command line:** commands cost the same action as the companion's action.

### Where it appears

1. **Printed deck:** after the Skills card, before the familiar card, then
   Action Point.
2. **Builder:** the Companion choice's detail pane shows the same card in
   `layout="panel"` (D079), like the familiar pane. Name and appearance inputs
   sit in the Build tab's Companion section, beside the choice and the
   Companion Ability Increase picks. They are always present when the character
   has a Companion choice.
3. Page 1 and the Character Profile are unchanged.

## Community card sets

Step 2 replaces the beast part of "Tivaan's Companion Cards": the 11 fake
"Companion: X" power cards and their 1,515 per-level and per-pick helper
elements. The sentinel's "Notes" cards are supplied data and stay. Mechanism,
following `91-familiar-cards.part`:

- Each of the 11 cards becomes an inert `Internal` record under the same ID,
  so imported CBLoader-era characters still resolve and no fake card prints.
- The 11 companion records' rules are rebuilt with `RemoveNodes`/`AppendNodes`
  without the 29 helper grants each. The rules are structure and numbers, not
  prose (D089). The helpers then stay in the pack, ungranted, so their IDs
  still resolve. Whether a `modify` with no target is silent decides whether
  this step is required or only cleanup.

**Cross-check:** the hand tables agree with the legacy formulas on 323 of 328
level rows for HP, defenses and surge value. The five that disagree are
typos:

- Bear 1 HP 22 (26).
- Bear 10 AC 24 / Fort 22 (swapped).
- Bear 17 AC 39 (29).
- Boar 10 surge 29 (23).
- Raptor 9 surge 14 (16).

This also confirms the "level × per level" HP formula. The private check
asserts this table with those five exceptions.

Left for step 3:

- the Fey Beast set (4 cards, 116 helpers);
- the Animal Master set (5 cards, 145 helpers);
- the Sarifal Feywarden cards (2);
- the _Book of Vile Darkness_ quasit (1 card, 29 helpers).

## Open questions (with recommendations)

1. **Sentinel hit points.** The content's `Pet Hit Points` omits Constitution;
   the book says "your bloodied value". Recommend following the book (D091).
   A correction replaces the `Pet Hit Points` chain with a field only this app
   reads, which the derived value maps to `bloodiedValue` of the character's
   HP.
2. **Conditional bonuses** (Nimble Companion +2 AC against opportunity
   attacks, Companion's Defender while adjacent, …). Legacy drops them.
   Recommend listing them under the defense tiles, as conditional notes are on
   page 1.
3. **Skills.** Recommend trained names as legacy shows them, plus any
   `BEAST.<skill>` misc bonuses as notes. No skill-bonus formula, since none is
   published.
4. **Surges per day.** Recommend `BeastBlock`'s 2 + bonuses (Sturdy Beast +1)
   over the panel's hard-coded 2.
5. **Deck order.** Recommend beast before familiar; both after Skills.
6. **Associates and the remaining community sets.** Recommend a separate
   step 3 proposal, as scoped above.
7. **Companion retraining** (Martial Power p. 42: swap the beast at level-up).
   Recommend relying on the existing retraining of the Companion choice; no new
   flow.

## Product-owner answers (2026-10-21)

1. **Sentinel hit points:** follow the book (_Heroes of the Forgotten
   Kingdoms_ pp. 89–90): the companion's HP is your bloodied value. A content
   correction replaces the community `Pet Hit Points` running total, which
   leaves out Constitution.
2. **Conditional companion bonuses:** shown as notes on the card, analogous to
   a power card's additional effects.
3. **Skills:** neither _Martial Power_ nor the D&D Insider compendium entries
   give a companion skill formula; they list only trained skills. The general
   creature rule applies (_Monster Manual_, "Ability Scores" and "Skills"). A
   skill check is the ability modifier plus one-half the creature's level, with
   +5 for a trained skill, and the beast's level is yours (_Martial Power_
   p. 39). Show every trained skill's total, plus `BEAST.<skill>` bonuses. The
   implementation should confirm the +5 trained bonus against the _Dungeon
   Master's Guide_ monster-creation rules.
4. **Healing surges:** two plus bonuses (_Martial Power_ p. 39, plus feats such
   as Sturdy Beast), not the legacy panel's fixed 2. The sentinel's companion
   shares yours.
5. **Deck order:** beast before familiar, both after Skills.
6. **Associates and the remaining community sets:** left as they are for now.
   Recorded as a possible future improvement (step 3) in
   `docs/implementation-status.md`.
7. **Changing companions:** through the Retraining tab. _Martial Power_ p. 42:
   "Instead of changing a feat, a power, or a skill selection when you retrain,
   you can change your beast companion selection." So a swap **uses that
   level's retraining**, and the Retraining tab must offer the companion choice
   as one of the level's mutually exclusive retraining options. Editing the
   original companion choice in Build stays available, as legacy's Companion
   page does, and rewrites history rather than recording a swap.

## Verification

- **Unit tests (synthetic content):**
  - `beastCompanionStatistics` against Martial Power's bear at levels 1/11/21:
    abilities with increases, defenses, HP, surges and attack, with `BEAST.*`
    and hybrid −1 bonuses.
  - Beast power numbers: predator strike's beast attack bonus, `[B]` and
    beast's Strength modifier.
  - The sheet-model card, and the snapshot cache-version bump.
- **Private checks (full pack):**
  - All 13 beasts produce a card at levels 1–30, and their HP, defenses and
    surge values equal the community tables except the five typos.
  - No "Companion: X" card remains.
  - Beast powers lose `companion-ability:` unsupported markers.
  - The coverage matrix gains Beast Mastery ranger and sentinel forks, so the
    Companion and Companion Ability Increase selects are reached, and the
    registry moves `Companion` from gap to presented.
- **Legacy oracle:** ask the product owner to save, in the legacy builder, a
  Beast Mastery ranger with a named wolf at level 8 or higher, with Resilient
  Beast or Sturdy Beast. Its `<Companions><Beast>` block is `BeastBlock`
  output and gives exact expected values for an import test.
- **Visual check** of the printed deck and builder pane by the product owner.

## Size estimate

About two familiar-sized slices, roughly 1,500–2,000 lines with tests:

1. Engine: derived values, snapshot and beast power numbers.
2. Sheet-model, web card, deck, builder pane and name inputs, plus the
   corrections and private checks.
