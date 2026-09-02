# Character save format (`.dnd4e`)

## Envelope and compatibility strategy

Supplied characters are UTF-8 XML rooted at:

```xml
<D20Character game-system="D&amp;D4E" Version="0.07a"
              legality="rules-legal">
  ...
</D20Character>
```

`legality` is observed as `rules-legal` or `houserule`. The loader validates the
root, game-system, and an accepted version family, then dispatches recognized
children case-insensitively. Several presentation-only containers are deliberately
skipped or parsed only as cached data. Unknown blocks are recursively consumed;
a modern importer should additionally retain them for lossless round trips.

The file mixes two very different classes of data:

1. **Authoritative edit state**: level element trees, loot acquisition/equipment,
   alternates, user field edits, text strings, campaign settings, and grabbag.
2. **Regenerated snapshot**: `CharacterSheet`, including final stats, tallies,
   power calculations, companions, and journal presentation.

Never reconstruct the editable character solely from `CharacterSheet`. Conversely,
when a referenced game-data record is unavailable, retain the serialized snapshot
and element stub so the file can be shown and exported without data loss.

## Root children

The engine recognizes these logical children (some may occur inside containers):

| Element | Role |
|---|---|
| `CharacterSheet` | Derived/export snapshot; regenerated on save. |
| `D20CampaignSetting` | Campaign and legality/source policy. |
| `Level` | One acquisition/edit history frame per character level. |
| `textstring` | User/runtime string state. |
| `alternate` | Alternate choice attached to a provider/select rule. |
| `Grabbag` | Unleveled freeform/house-rule selections. |
| `RulesElementTally` | Derived selected-element cache. |
| `loot` / `LootTally` | Authoritative level loot or derived current inventory. |
| `AbilityScores`, `StatBlock` | Base input in old forms or derived snapshot. |
| `Journal`, `Companions`, `PowerStats`, `Details` | Presentation/export data. |

The parser tolerates wrapper blocks and recursively dispatches their contents,
which explains variation among historical versions.

## Level history and element trees

Each `Level` contains a recursive `RulesElement` tree rooted in the internal level
record (normally `ID_INTERNAL_LEVEL_n`), plus loot and edits acquired at that
level. The `Level` itself carries no observed attributes; its root record identifies
the number.

Serialized element attributes are:

| Attribute | Meaning |
|---|---|
| `internal-id` | Preferred lookup of the game-data record. |
| `name`, `type` | Fallback lookup and display if the ID disappeared. |
| `legality` | A non-legal value marks this occurrence as house-ruled. |
| `replaces` | Link to the occurrence displaced by replacement/retraining. |
| `charelem` | Serialization-local occurrence-link token. |
| `url` | Optional body/reference retained for missing illegal stubs. |

`charelem` values look like hexadecimal native pointers in supplied files. They are
not persistent object identities. Treat them as opaque IDs scoped to one document,
rewrite them consistently on export, and never expose them as web resource IDs.

Nested `RulesElement` order corresponds to the provider rule order. A blank nested
element (missing ID and sometimes blank name/type) is a real unresolved choice
placeholder. Do not remove it: it affects completeness and preserves positional
alignment with grant/select/replace rules.

On load, resolution is:

1. find exact `internal-id` in the current database;
2. if necessary find by `(name,type)`;
3. if still absent but sufficient serialized identity exists, create an illegal
   stub and preserve its URL/body;
4. otherwise keep an unresolved slot.

## Loot

An authoritative level `loot` occurrence has observed attributes:

- `count` and `equip-count` (integer quantities);
- optional display `name`;
- `Weight` (decimal), `Damage`, and `ShowPowerCard` overrides.

It contains up to two record references: a mundane base item and an enchantment.
The runtime combines these into one inventory entry. Quantity and equipped quantity
are separate; equipment-dependent rules test the equipped tally. Notes use
`LOOTNOTE_...` text strings. `LootTally` is the regenerated, field-expanded view and
must not override acquisition history.

An item definition may itself own a `select` (for example the damage type of
Armor of Resistance). The selected child can be absent from the authoritative
level `loot` record while appearing nested under the same definition in the
current `CharacterSheet/LootTally`. This is structural choice state, not a
calculated numeric cache. An importer may recover it only after an exact ordered
definition-identity match to an active positive acquisition, and must preserve
the nested occurrence/token as a child of the corresponding item definition.
It must not use the tally to change acquisition level, quantities, equipment
state, or mismatched item identities.

Preserve unknown loot attributes because custom items and older serializer versions
may add field overrides.

## Alternates and spellbooks

An `alternate` associates an alternate selection with a provider:

```xml
<alternate SelectName="..." name="..." type="..."
           internal-id="...">
  <RulesElement .../>
</alternate>
```

`SelectName` locates the provider's named `select` statement. The outer identity is
the provider; the child is the alternate choice. The engine uses this for
spellbooks/prepared powers and other alternate power sets. An importer must retain
alternates even if the provider currently fails prerequisites.

## Text strings and edits

`textstring` has a `name` and escaped text body. Names are open-ended. Observed
conventions include:

- `_PER_LEVEL_n_...`: value scoped to a level;
- `_INTERNAL_...`: engine/UI state;
- `CUR_...` and `USAGE_...`: current resource/use state;
- `LOOTNOTE_...` and `NOTE_...`: user notes;
- `LAYOUT_DATA...`: sheet layout/presentation state.

Rules also emit text strings; user-authored state and regenerated state should be
distinguished internally even though legacy XML shares this representation.

Field edits serialize a target element identity, field name, and replacement value
(as an attribute or body depending historical form). These feed runtime `modify`
overrides. Unknown field edits must survive even if the referenced record is absent.

## `CharacterSheet` derived snapshot

The save path emits these sections in order:

1. `Details` (name, level, race, class/build/path/destiny and descriptive fields);
2. `AbilityScores`;
3. `StatBlock`;
4. `RulesElementTally`;
5. `LootTally`;
6. `PowerStats`;
7. `Companions`;
8. `Journal`.

A `Stat` carries final `name`/`value` and nested `alias` and `statadd` provenance.
Derived `statadd` entries may include `statlink`, `type`, `charelem`, `Level`,
conditions, ability-modifier flags, and string data. `PowerStats` contains each
power's copied `specific` fields and one or more `Weapon` calculation blocks with
attack, damage, defense, and component values.

These blocks are excellent compatibility test oracles. They are caches: after any
authoritative edit, recompute them rather than incrementally trusting stale values.

## Writer requirements

A compatible writer should:

- emit UTF-8 and XML-escape all user content;
- use stable game-data IDs plus `(name,type)` fallback;
- preserve unresolved slots, stubs, unknown extensions, campaign data, alternates,
  per-level acquisition, and link topology;
- allocate fresh document-local occurrence tokens and repair `replaces` links;
- regenerate `CharacterSheet` from a completed evaluation;
- retain the imported snapshot separately when evaluation is impossible.
