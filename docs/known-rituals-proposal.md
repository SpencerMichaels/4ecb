# Known rituals, formulas and practices proposal

Status: accepted by the product owner (2026-10-21); see "Product-owner
answers". All sections and the structured allowance counter are implemented (see
implementation-status.md). The sheet field is named `origin`, since
`source` is the book source.

## Problem

The product owner asked why rituals and recipes live in inventory, since a
character knows them rather than carries them, and whether the spellbook works
the same way.

Today:

- **Storage.** Rituals, alchemical formulas and martial practices are stored as
  `BuildInventoryEntry` holdings in `CharacterBuild.inventory`
  (`packages/character-domain/src/build.ts:86`, `:183`). That is the shape the
  legacy importer produces from `.dnd4e` `loot`.
- **Presentation.** Earlier decisions already treat them as learned references,
  not equipment (D044, D056, D057, D068). So the Equipment inventory hides them:
  `inventoryCategory` returns `undefined` for any Ritual
  (`apps/web/src/equipment-ui.ts:368`). The result is that **the builder has no
  list of what the character knows.** The only place it shows is the "Known"
  cell in Shop's ritual categories (`ShopWorkspace.tsx:531`, `:949`). There is
  no way to forget a ritual either, because the only remove and sell controls
  are in Inventory, which hides rituals.
- **Granted rituals appear nowhere.** The sheet builds `learnedReferences`
  from inventory holdings only (`packages/sheet-model/src/index.ts:1667`). The
  coverage matrix reports them as unpresented: _Last Sight Vision_ ← Level 5
  Student of Evard Feature, and _Bloodstinger Poison_ ← Duplicitous Nature
  (`tmp/coverage-matrix/coverage-matrix.md`, finding 12).
- **Free rituals and items are never given.** Legacy gives them through a
  `FREEBEE:` stat (see below). The modern code doesn't implement that at all:
  `grep FREEBEE` finds nothing in `packages/` or `apps/`, and it is missing
  from the legacy special-case inventory. Native characters therefore miss, for
  example, a druid's free _Animal Messenger_ and Ritual Book, a wizard's
  Spellbook, and an executioner's poison doses.

## Sources

### Legacy builder (oracle for behavior)

- **Rituals are loot.** A ritual is a `loot` record with `count`/`equip-count`,
  exactly like gear. For example `sample-chars/Piri.dnd4e:1707` has
  `<loot count="1" equip-count="0"><RulesElement name="Animal Messenger"
type="Ritual" …/></loot>` at level 1, plus the same record in `LootTally`.
  Piri is the only one of the 8 local sample characters with a ritual.
- **Ritual pages sit under Equipment.** The Equipment wizard section has the
  sub-tabs Gear, Rituals, Alchemical Formulas and Martial Practices
  (`CharacterBuilder/Character_Builder/MainWindow.cs:932-936`). The last three
  are all `RitualsPage`, one per `RitualCategory` named "Ritual", "Alchemical
  Formula" and "Martial Practice" (`RulesEngineCommon/GearPageData.cs:620-622`,
  `:797`). The Martial Practices tab is hidden when the content has none
  (`MainWindow.cs:966-968`).
- **Each page combines a catalog with the character's own lists.** Under the
  catalog are two lists:
  - **Books:** owned records of that category, i.e. the known ones.
  - **Scrolls:** owned Ritual Scrolls of that category.

  This is `RitualCategory.UpdateInternal` (`RulesEngineCommon/RitualCategory.cs`).
  The catalog filter offers All, **Known** (in Books) and Unknown. Each list
  has **Buy**, which pays the market price, and **Add**, which is free
  (`RitualsPage.cs` `BuyBook_Click`/`AddBook_Click`/`BuyScroll_Click`/
  `AddScroll_Click`). The page can also create a custom ritual
  (`CustomRitual`).

- **Free rituals and items (`FREEBEE`).** `MainWindow.GiveFreebees`
  (`MainWindow.cs:343-434`) runs from the Gear page, the Rituals page and
  auto-level. For each character stat named `FREEBEE:<id>` whose textstring
  `<id>` is not yet `Given`, it adds one copy of `<id>` as loot, then sets
  textstring `<id>` = `Given`. Because of that marker, a gift the player later
  removes is never re-added. Piri carries both the stats and the markers
  (`Piri.dnd4e:596-601`, `:1835-1840`). The pack has 33 `FREEBEE` rituals and
  more than 80 `FREEBEE` items and associates, for example:
  - Druid, Cleric, Artificer, Invoker and Psion `Grants` → Ritual Book
  - Wizard Spellbook class feature → Spellbook (Gear)
  - Herbalist → Brew Potion (`requires="5 level"`)
  - Vadalis Ritual Techniques → Commune With Nature and Phantom Steed
  - beast companions → Raise Beast Companion
  - executioner "… Recipe" class features → one dose of the poison
    (Magic Item)
  - warlock pact blades, Monk Unarmed Strike, elemental companion associates
- **A plain `grant type="Ritual"` doesn't create loot.** _Last Sight Vision_
  and _Bloodstinger Poison_ (`Duplicitous Nature` grants it twice) become
  granted rules elements under their provider. Legacy shows them on neither
  the Rituals page nor the sheet.
- **Printed sheet.** The legacy sheet has a single **"Rituals / Alchemy"**
  panel. By default it sits on page 2 beside Magic Items
  (`CharTracker/PanelFactory.cs:272-274`, `PageLayout.cs:579`).
  `PanelModelLootList` iterates character loot whose base type is Ritual and
  prints only `name (count) (E)`, with no text (`PanelModelLootList.cs:48-77`).
  Rituals get no cards, and granted rituals are not listed.
- **Spellbook.** The wizard spellbook works differently: it is a **Build**
  sub-tab ("Spellbook", after Powers). It is shown only when the character has
  the Spellbook class feature (`MainWindow.cs:925`, `:970-972`). Its entries
  are `alternate` power selections attached to the provider's `select …
spellbook="Power Daily N"` slots
  (`reverse-engineering/docs/03-character-save-format.md` "Alternates and
  spellbooks"). They print as ordinary power cards with a "SPELLBOOK"
  subtitle (`CharTracker/PowerCardPower.cs:296`). The physical Spellbook is a
  separate Gear `FREEBEE`.

### Content (private pack `tmp/content/full-local.4ecp`)

| Type          | `type` field                                                                            | Count |
| ------------- | --------------------------------------------------------------------------------------- | ----- |
| Ritual        | Ritual (251), Alchemical Formula (50), Martial Practice (25), none (45, read as Ritual) | 371   |
| Ritual Scroll | the same split; each has `_SupportsID` → its ritual                                     | 353   |

- `Category` holds the school (Exploration, Warding, Poison, Oil, Martial
  Practice, …).
- Alchemical formulas list the items they produce in `_RELATED_ITEMS`.
- Two community rituals (Explosive Runes, Glyph of Warding) carry rules that
  grant power cards. Known rituals must therefore keep feeding the evaluator
  just as inventory rituals do today.
- **Correction to the owner's example.** _Bloodroot Poison_ is not an
  Alchemist formula. "Bloodroot Poison Recipe" is an executioner **class
  feature** that grants and `FREEBEE`s the **Magic Item** "Bloodroot Poison
  (heroic tier)", a physical dose. The Alchemist feat only grants an Internal
  record. The real alchemical-formula grant is Duplicitous Nature →
  _Bloodstinger Poison_.

### Modern code

- **Shop.** Shop Browse holds the three learning categories with Buy and Give
  (`ShopWorkspace.tsx:339`, `equipment-ui.ts:528-533`). Both actions write a
  `purchase-inventory` holding (`build.ts:1028`).
- **Builder cards.** The builder detail card for a ritual is an `ItemCard`
  built by `sheetItemCard` (`BuilderCards.tsx:196`; `EntityCard.tsx:42`
  counts Ritual as an item type).
- **Sheet.** `learnedReferenceKind`/`learnedReference`
  (`sheet-model/src/index.ts:493-526`) produce `learnedReferences` with a
  `quantity`. These print as the reference-page group "Rituals & practices"
  (`SheetOverview.tsx:2243`, bucket 3 at `:2974`). The deferred on-screen
  sheet renders them through its own `LearnedReference` article
  (`CharacterSheetPage.tsx:118-150`). That is a third card renderer, which
  D079 says to avoid.
- **Spellbook.** Spellbook choices are Build-section choices
  (`builder-ui.ts:1554`, `legacyChoiceSection` → "Spellbook") stored as
  `CharacterBuild.alternates`.

## Proposal

### 1. A known list, separate from inventory

`CharacterBuild` gains `known: readonly BuildKnownEntry[]`, and
`formatVersion` goes to 2:

```ts
interface BuildKnownEntry {
  readonly id: string; // stable occurrence ID
  readonly acquiredLevel: number; // learned at; hidden when viewing below it
  readonly element: BuildElementIdentity; // exact Ritual record
  readonly acquisition: "bought" | "free";
  /** Only for imported loot: the original record, re-emitted on export. */
  readonly legacyLoot?: Omit<BuildInventoryEntry, "id" | "acquiredLevel">;
}
```

- **Kinds come from the record.** Ritual, formula and practice stay exact
  `Ritual` records told apart by their authored `type` (D044). No kind is
  stored.
- **No quantity.** A record is known or it isn't. Learning one that is already
  known is disabled, as Shop does today.
- **No price is stored.** The wallet change is the record, as with items.
  Buying deducts the market price, which is the cost of inscribing the ritual.
  "Learn free" covers class allowances and DM gifts, like legacy Add.
- **Commands.** `learn-known {entry, priceCopper}` (0 when free) and
  `forget-known {id}`, which gives no refund. Undo covers mistakes.
- **Evaluation.** The evaluator receives known entries as owned elements, so a
  ritual's own rules still apply.
- **What stays in inventory.**
  - Ritual Scrolls: consumables with a quantity. Owning a scroll never makes
    its ritual known (D044).
  - Physical books: Ritual Book, Spellbook.
  - Alchemical item doses.

### 2. Granted entries are derived and listed with their source

The Known list shown everywhere is the union of two things:

- **Learned:** the stored `known` entries.
- **Granted:** derived from the evaluation, never stored:
  - `grant type="Ritual"` occurrences (Last Sight Vision ← Student of Evard).
  - `FREEBEE:<ritual id>` stats (Animal Messenger ← Druid). Under D091 these
    count as granted, not as one-time gifts. Retraining away Herbalist then
    also removes Brew Potion, and the list always states why a ritual is known.

A granted entry shows "Granted by _provider_" and has no Forget control.
Entries are deduplicated by content ID, so Duplicitous Nature's double grant
shows once.

If an imported character has a stored copy of a granted ritual (Piri's
Animal Messenger), the list shows it once with the grant as its source. The
stored copy is kept, so it stays known if the grant later disappears, matching
legacy.

The "Free Rituals" text that classes emit is shown at the top of the tab, for
example: "As a wizard, you are entitled to three 1st-level rituals… At 5th,
11th, 15th, 21st and 25th level you gain two more". This is the
`textContributions` text. The allowance is shown, not enforced (see open
questions).

### 3. Free items (`FREEBEE` items) stay inventory gifts

For non-ritual targets this keeps the legacy behavior. When a `FREEBEE:<id>`
stat first appears and textstring `<id>` is not `Given`, the builder runs one
transactional command. The command adds one copy to inventory, priced 0, and
sets `<id>` = `Given`. Examples are the Ritual Book, the Spellbook, pact
blades and the executioner's poison dose.

These are physical, so the player can then sell or drop them, and the marker
prevents re-adding. This also resolves the coverage matrix's "Unpresented
Magic Item" finding (finding 10): the dose prints as an ordinary item card.
The recipe class feature is already in the features list.

Associates are out of scope (companion proposal, step 2). This is a separate
slice from §1–2 and should be added to the legacy special-case inventory.

### 4. Builder: a Rituals tab

A peer workspace after Shop: Build · Retraining · Details · Equipment · Shop ·
**Rituals**. The route is `tab=rituals`. The old `section=practices` deep link
moves here from Shop/Rituals.

The three learning categories move out of Shop Browse into this tab. Shop keeps
Ritual Scrolls under Consumables.

```
┌ Rituals ───────────────────────────────────────┬──────────────────────┐
│ Free rituals: As a druid you have been given   │  ┌ Animal Messenger ┐ │
│ Animal Messenger and one more 1st-level ritual.│  │ Ritual · Level 1  │ │
│                                                │  │ Exploration       │ │
│ Known (4)                    [+ Learn rituals] │  │ Time 10 minutes   │ │
│ Rituals                                        │  │ Duration Special  │ │
│  Animal Messenger   L1 Exploration  Nature     │  │ Component 10 gp   │ │
│     Granted by Druid                           │  │ Key skill Nature  │ │
│  Comprehend Lang.   L1 Exploration  Arcana     │  │ …                 │ │
│     Bought at level 1                 [Forget] │  └───────────────────┘ │
│  Last Sight Vision  L2 Divination   Arcana     │  Granted by Druid     │
│     Granted by Level 5 Student of Evard Feature│                       │
│ Alchemical formulas                            │                       │
│  Bloodstinger Poison L3 Poison   Nature        │                       │
│     Granted by Duplicitous Nature              │                       │
│ Martial practices      — none known —          │                       │
└────────────────────────────────────────────────┴──────────────────────┘
```

- **Known list.** The tab opens on the Known list, grouped Rituals /
  Alchemical formulas / Martial practices, with each group's empty state
  inside it. All three groups are always present (no surprise controls).
- **Learn rituals.** The button swaps the main pane to the existing catalog
  table, reused in learning mode. Its Known / Unknown / All filter is already
  there, and its actions read **Buy** and **Learn free**.
- **Detail pane.** The one card format (D079), with the source line below the
  card.

### 5. Sheet

- **Model.** `learnedReferences` comes from `build.known` plus the granted
  set. It drops `quantity` and gains
  `source: { kind: "learned" | "granted"; provider?: string }`. The
  legacy-cache path (`lootPresentations`) is unchanged, since a cache can't
  tell granted from learned.
- **Print.** Keep the "Rituals & practices" reference group, now including
  granted entries, each with a "Granted by …" line. No new print cards are
  added: ritual text is long, and the reference pages already fit it.
- **On-screen sheet (M6).** Replace the `LearnedReference` article with the
  same card the builder uses (D079).

### 6. Legacy import, export and migration

- **Import.** A level `loot` whose base element has type `Ritual` becomes a
  `BuildKnownEntry`:
  - same level and exact element
  - `acquisition: "free"`, since legacy doesn't record whether a ritual was
    paid for
  - the whole original record kept in `legacyLoot`

  Records with `count="0"` keep their `legacyLoot` but aren't known, the same
  rule Shop's `ownedCount` uses today. `Given` textstrings stay in
  `textStrings`. Ritual Scroll loot stays inventory.

- **Export (best-effort, D091).**
  - Each learned entry is written back as `loot` under its Level: from
    `legacyLoot` when present, otherwise `count="1" equip-count="0"`.
  - Each `FREEBEE`-granted ritual not already stored is written as loot plus
    `<textstring name="<id>">Given</textstring>`, which is what the old
    builder would have done itself.
  - `grant`-granted rituals add nothing: legacy keeps them as granted
    elements.
  - `LootTally` is regenerated with the rituals included.
- **Migration of saved characters.** On load, `upgradeRecord`
  (`browser-storage/src/character-repository.ts:626`) moves every inventory
  entry whose saved element type is `Ritual` into `known`, using the import
  mapping. The check reads the saved types, so it needs no content. It is
  restartable and never drops an entry.
- **Cache version.** Bump `RULES_EVALUATION_CACHE_VERSION`, because the
  evaluation gains the granted set.

### 7. Spellbook stays in Build

The spellbook is not a known-records list. It is a set of power selections:
each slot is a level-gated, retrainable `select` with its `alternate`
choices. Those choices decide which daily and utility spells the wizard can
prepare, and they print as power cards. Legacy also keeps it with Powers
under Build.

Moving it would split power choice across two tabs. Recommendation:

- Leave it in Build.
- The Rituals tab doesn't mention it.
- The physical Spellbook stays a Gear item.

Separately: spellbook spells now carry legacy's "SPELLBOOK" subtitle
(`SheetCard.spellbook`, see `character-import-and-sheets.md`).

## Open questions (recommendations in bold)

1. **Tab name:** "Rituals" or "Rituals & practices"? **"Rituals"** keeps the
   tab bar short. The groups inside name all three kinds, and the sheet keeps
   "Rituals & practices".
2. **Where learning happens:** move the three categories out of Shop into the
   Rituals tab, or keep them in Shop and have the tab link there? **Move
   them.** One page then holds both the catalog and the list, as legacy did.
3. **`FREEBEE` rituals:** derived, so they vanish with their provider, or a
   one-time stored gift as in legacy? **Derived** (D091: the new builder
   wins). Imported stored copies are kept.
4. **Free-ritual allowances** (a wizard's 3 + 2 per listed level): show the
   text only, or count "free rituals left"? **Text only for now.** Legacy
   never enforced them, and the content has no machine-readable count.
5. **Forget refunds:** none, with undo for mistakes? **No refund**, matching
   the rules: an inscribed ritual has no resale value.
6. **Legacy "Rituals / Alchemy" name list** on a printed page, in addition to
   the reference pages? **No** unless asked. The reference group heading and
   index already list them.
7. **`FREEBEE` items (§3):** do this slice now or after §1–2? **After, as its
   own slice.** It affects all items, including pact blades and Monk Unarmed
   Strike, and needs its own verification.

## Product-owner answers (2026-10-21)

1. **Tab name:** "Rituals". Tabs use single-word titles unless there's a very
   good reason.
2. **Learning:** moves out of Shop into the Rituals tab.
3. **`FREEBEE` rituals:** worked out from their provider; imported stored
   copies are kept.
4. **Free-ritual allowances:** ship the text first. Then add an explicit,
   machine-readable allowance field, via content corrections under D089, so
   the tab can show the allowance (e.g. "2 free 1st-level rituals left").
   Each allowance carries its count, its level limit and the levels at which
   it grows. "Learn free" records which pool a ritual came from.
5. **Removing a ritual:** the rules have no mechanic for forgetting one, so
   the action is an editing control labelled **Remove**, with no refund (undo
   covers mistakes). Replace "Forget"/`forget-known` throughout with
   "Remove"/`remove-known`.
6. **Printed name list:** no.
7. **`FREEBEE` items:** no preference; done after §1–2 as a separate slice.

## Verification

- **Public tests (synthetic content):**
  - the import maps Ritual loot to known, and Ritual Scroll loot stays
    inventory
  - export round-trip, including `Given` markers
  - the record migration is idempotent and never drops an entry
  - granted entries are listed with their provider and deduplicated
  - learn and forget commands with wallet changes
- **Private checks:**
  - Piri imports with Animal Messenger known, granted by Druid, and
    re-exports equivalently
  - the coverage matrix reports no unpresented Ritual
  - a native druid gets Animal Messenger without any inventory entry
- **Visual check** of the tab and the sheet group by the product owner.
