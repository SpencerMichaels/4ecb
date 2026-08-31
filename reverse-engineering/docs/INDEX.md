# Character Builder compatibility specification

This is an implementation-oriented recovery of the supplied D&D 4th Edition
Character Builder. The target is behavioral and file compatibility, not a literal
UI clone.

## Documents

1. [Evidence and scope](00-evidence-and-scope.md) explains what was inspected and
   the confidence labels used here.
2. [Game-data format](01-game-data-format.md) specifies the decrypted `D20Rules`
   XML database.
3. [CBLoader formats](02-cbloader-formats.md) specifies `.part`, `.index`, merge,
   cache, and encrypted-container behavior.
4. [Character-save format](03-character-save-format.md) specifies `.dnd4e` files
   and distinguishes authoritative inputs from regenerated caches.
5. [Rule language](04-rule-language.md) specifies the nine executable statements,
   category expressions, prerequisites, conditions, and stat arithmetic.
6. [Character engine](05-character-engine.md) specifies the fixed-point update
   pipeline, choices, legality, levels, retraining, loot, and derived values.
7. [Application workflows](06-application-workflows.md) maps the legacy product's
   high-level capabilities to domain operations required by a replacement.
8. [Compatibility blueprint](07-compatibility-blueprint.md) proposes subsystem
   boundaries, import/export behavior, and a conformance strategy.
9. [Recovered exceptions](08-hard-coded-exceptions.md) inventories behavior that
   is not data-driven and therefore must not be lost in a generic interpreter.
10. [Campaign files](09-campaign-format.md) specifies `.dndcamp` restrictions and
    embedded house rules, including a malformed legacy-ID edge case.

The modern product architecture, release scope, and implementation milestones
are maintained separately in [`../../docs/README.md`](../../docs/README.md).

## Machine-readable and reproducible material

- `../generated/profiles/` contains exhaustive path, tag, attribute, and value
  inventories for the supplied corpora.
- `../generated/decompiled/` is decompiler evidence, not maintainable source.
- `../reference/cbloader-source/` is the pinned public CBLoader source used to
  confirm merge and encryption behavior.
- `../schemas/` contains permissive compatibility schemas.
- `../fixtures/` contains small, synthetic conformance cases without copied game
  prose.
- `../scripts/` and `../tools/` contain reproducible analysis utilities.

## Compatibility priorities

The replacement should preserve, in order:

1. lossless import/export of legacy `.dnd4e`, `.dndcamp`, `.part`, and `.index`
   content, including unknown extensions;
2. the original evaluator's observable choice, legality, stat, and equipment
   results;
3. stable IDs and source/category semantics;
4. the original builder's workflows;
5. legacy presentation caches only where another consumer depends on them.

The XML is effectively the public compatibility boundary. Native pointer-shaped
`charelem` values and `CharacterSheet` calculations are serialized caches, not
portable identity or primary character state.
