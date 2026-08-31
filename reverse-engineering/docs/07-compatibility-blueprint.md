# Compatibility-oriented implementation blueprint

## Recommended subsystem boundary

Build the evaluator as a platform-neutral library with no browser, database, or
framework dependencies at its core:

```text
legacy bytes
  -> hardened lossless parsers
  -> ordered definition/character documents
  -> normalized indexed model
  -> fixed-point evaluator
  -> immutable evaluated snapshot + diagnostics
  -> web API / UI / legacy writer / sheet renderer
```

The evaluator should be usable in server tests and a browser worker from identical
fixtures. TypeScript is a practical choice for a web-first application, but the
model below is language-independent.

## Suggested modules

### `legacy-xml`

- parse/write `D20Rules`, `.part`, `PartIndex`, `.dnd4e`, and `.dndcamp`;
- retain unknown nodes, mixed text, order, casing, and provenance;
- enforce no DTD/entity expansion, byte/depth/count limits, and safe filenames;
- allocate/rewrite document-local character occurrence links.

### `content-loader`

- decrypt/encrypt official containers when a user supplies/possesses a key;
- deterministic CBLoader merge with a complete operation log;
- validate IDs/references and create immutable indexes by ID, name/type, type,
  source, and category;
- content-addressed cache keyed by ordered input hashes and merger version.

### `rules-ir`

- parse the nine statements into a tagged union;
- parse `requires` and category strings into compatibility ASTs;
- retain the exact source node beside the normalized form;
- represent unknown attributes/statements without evaluation.

### `character-model`

- authoritative level frames and occurrence graph;
- choices/placeholders, replacement links, alternates, campaign, text, user edits,
  grabbag, and inventory;
- imported derived snapshot and extension bag;
- commands with undo metadata rather than direct object mutation.

### `evaluator`

- explicit skeleton/full/psionic/tally/validation phases;
- maximum 30 fixed-point iterations and convergence trace;
- immutable field overlays and stat contributions;
- structured candidate decisions and legality/completeness diagnostics;
- recovered exception handlers isolated behind named, testable functions.

### `calculators`

- point buy and ability modifiers;
- inventory price/weight/slots/proficiency/set benefits;
- power/weapon/implement combinations;
- companion/familiar/beast blocks;
- `CharacterSheet` projection.

## Persistence model

Store uploaded content blobs by digest and build a dataset revision from an ordered
list of blobs/merge operations. Store authoritative characters as versioned domain
commands or normalized snapshots plus the original `.dnd4e` blob. Derived
evaluation snapshots can be cached by:

```text
hash(dataset revision, campaign policy, authoritative character revision,
     evaluator compatibility version)
```

Never make display names foreign keys. Never make native `charelem` strings global
IDs. Use new stable occurrence UUIDs internally and map them to scoped legacy link
tokens at import/export.

## Import modes

Offer three explicit results:

1. **Fully evaluated**: all referenced definitions exist; fresh derived snapshot.
2. **Evaluated with compatibility diagnostics**: stubs/illegal choices remain but
   the graph converged.
3. **Preserved only**: syntax was safely parsed but an unsupported extension or
   engine error prevents trustworthy recomputation; show imported sheet cache and
   allow lossless export.

Never discard data simply because evaluation fails.

## Conformance test layers

### Format tests

- parse/write/parse preserves normalized XML meaning and extension bags;
- every supplied `.part`, index, character, and campaign parses;
- decrypt output matches its own recorded plaintext digest and parses to the
  expected record set (do not assume the supplied encrypted snapshot is pristine);
- merge yields the same semantic record map as supplied merged XML.

### Rule microtests

Synthetic definitions should cover each statement attribute, odd `requires`
precedence, category OR/negation/dynamic prefixes, numeric levels, linked/cyclic
stats, typed positive/negative stacking, zero/nonzero buckets, wearing predicates,
positional blank choices, modifications, replacement history, and convergence.

### Golden character tests

For every supplied `.dnd4e`, import authoritative state, evaluate, and compare:

- owned record tally and occurrence legality;
- all required choices and candidates;
- ability scores and every `StatBlock` value/contribution;
- loot tally/equipment and costs/weight;
- power/weapon calculation blocks;
- completeness, global legality, and serialized authoritative graph.

Snapshot differences should be semantic: ignore comments/indentation, generated
link token values, and stable ordering only where the legacy format makes it
nonsemantic.

### Windows differential harness

Before declaring parity, automate the original engine in an isolated Windows VM.
For a matrix of small commands—choose, clear, level, retrain, equip, add custom
bonus, save/reload—capture old and new snapshots after every update. This will
resolve the remaining inferred native constants and expose data-dependent special
cases no sample character exercises.

## Delivery sequence

1. Lossless parsers, safe CBLoader merger, and searchable content catalog.
2. Character importer/exporter with occurrence graph but no calculations.
3. Rule IR, fixed-point topology, category/prerequisite filtering, and choices.
4. Stats/legality, then equipment and power calculations.
5. Full advancement/retraining/spellbook/psionics and hard-coded exceptions.
6. Differential parity suite, sheet projection, companions/journal, then polished
   modern UI.

This order makes the content browser useful early without baking UI assumptions
into the hardest compatibility layer.

## Security and legal-operational notes

Treat legacy content as untrusted. Limit XML resources, sanitize rendered prose,
never execute URLs or embedded markup, isolate import extraction, and make update
downloads opt-in. Keep user-provided game data separate from application code; the
new project can implement a clean engine without redistributing proprietary corpus
content.
