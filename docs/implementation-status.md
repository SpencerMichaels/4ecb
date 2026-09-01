# Implementation status

## Current stopping point

Milestones M1 through M3 are complete. M4 now has a verified vertical slice: an
authoritative character build, recovered rule-language evaluator, transactional
editor, and exact cached-stat parity for the supplied legacy character. M4 is
not complete; advanced power exceptions, broader golden-character coverage,
several legacy exception families, and focused replacement/grant editing remain.

## M4 checkpoint delivered

- `rules-engine` parses every rule opcode and attribute found in the 38,339
  entity private corpus: 54,012 statements audit with no unknown opcode,
  attribute, or unexplained required field.
- Fixed-point grants and choices, category expressions, stat modifiers and
  aliases, text updates, field overlays, equipped-item predicates, structured
  prerequisites, provenance, and editable incomplete/illegal states.
- Schema-2 records with an authoritative level-tree build, stable occurrence
  IDs, retained retraining links, base abilities, inventory, text values, and a
  lazy migration from the M3 read-only record.
- Transactional commands with undo/redo for abilities, effective level, level
  frames, choices, retraining, inventory, and text values.
- A desktop/tablet character editor for abilities, advancement, choices,
  inventory quantities/equipment, history, and engine diagnostics.
- A private-corpus audit and a supplied-character parity reporter, kept outside
  the distributable public fixtures.
- A renderer-neutral power result model with explicit equipment variants,
  attack/damage components, ordinary weapon and implement math, level-scaled
  hit lines, chosen abilities, enhancement/proficiency, weapon-group and
  implement-category bonuses, primary attacks, and effect-only calculations.
- Legacy alternates/spellbooks participate in ownership and power evaluation;
  serialized grants suppress duplicate fixed-point grants. Equipment projection
  recognizes weapon groups, magic implements, dual-use staves, and mundane holy
  symbols in the forms used by the corpus.

## M4 checkpoint verification

On 2026-08-31, the supplied level-8 character converged in one fixed-point
iteration and matched all 72 comparable cached numeric aliases. Its only
remaining legality findings are its explicit house-rule selection and one
custom feat prerequisite the imported content cannot prove. The public suite
also matches all 52 comparable cached attack/damage fields across its power
variants. The bundled nine-character diagnostic matrix currently matches
501/509 numeric aliases and 260/371 cached power fields. The remaining sample
differences are concentrated in historical content revisions, dual-weapon and
monk/weapon-as-implement exceptions, and a small set of class-specific rules.
The public suite passes 77 tests plus formatting, ESLint, and all TypeScript
projects. See [rules-engine.md](rules-engine.md) for the evaluator boundary,
performance result, and remaining closure work.

## M3 delivered

- `character-domain`, `legacy-dnd4e`, and `sheet-model` packages separating the
  versioned durable record, compatibility adapter, and semantic rendering model.
- A SAX-based `.dnd4e` importer that extracts details, final cached stats,
  selections, level count, text strings, inventory, powers, and weapon
  calculations without dropping the source envelope.
- Exact legacy-envelope export and an export/re-import preservation diff. No-edit
  exports keep comments, whitespace, order, unknown attributes/elements, and
  opaque link tokens unchanged.
- IndexedDB schema v2 with character list/get/put, metadata and content-profile
  binding, sheet preferences, duplication, recoverable trash, permanent purge,
  and full native JSON backup/restore.
- An accessible local character library with `.dnd4e` import reports, explicit
  missing-profile state and rebinding, metadata editing, backup/restore, and
  checked legacy export.
- A browser sheet with summary sections, familiar usage-colored power/item
  cards, bound-content enrichment, cached-value warnings, blank hit points,
  Letter/A4 selection, monochrome mode, card inclusion switches, and browser
  print/save-to-PDF entry point.

## M3 verification record

On 2026-08-31:

- formatting, ESLint, all TypeScript projects, 35 unit/integration tests, and the
  production Vite/PWA build passed;
- the supplied private level-8 character imported as Hu Sheng-ming with 8 level
  records, 185 selected rules, 21 powers, 24 carried/equipped loot entries, and
  113 cached stat aliases; exact export/re-import comparison found no differing
  character;
- the live browser exercised file import, IndexedDB persistence, the structured
  import report, library navigation, final ability/defense/skill values, all 45
  power and item cards, and a reload after changing A4 plus blank-HP settings;
- rendered card geometry formed three stable columns and reported zero
  horizontal or vertical overflow for all 45 cards at the tested desktop
  viewport; print CSS uses explicit Letter/A4 page rules, three-column grids,
  and `break-inside: avoid` for sections and cards; and
- the seven-page legacy-generated Letter PDF was rendered and visually inspected
  as the reference for section hierarchy, usage colors, and three-by-three card
  density. The modern sheet intentionally omits legacy ornamental chrome.

The private character and reference PDF remain ignored local evidence. Public
tests use only synthetic XML. See
[character-import-and-sheets.md](character-import-and-sheets.md) for the storage,
compatibility, and known-limitations contract.

## M2 delivered

- A versioned serializable query AST and dependency-free `query-engine` package
  with Unicode tokenization, quoted phrases, relevance, include/exclude facets,
  numeric ranges, stable sorting/paging, self-excluding facet counts, and
  bidirectional stable-ID relationships.
- A dedicated worker that loads the active immutable pack from IndexedDB,
  constructs the index away from React, services typed query/detail requests,
  and is safely terminated on cancellation or profile/page changes.
- Cross-type search and explicit pages for powers, feats, magic items, weapons,
  armor, gear, races, classes, paths, destinies, backgrounds, themes, and
  rituals, plus searchable values for every typed facet.
- Fragment-addressed queries and entity details, browser-local named saved
  searches, accessible include/exclude controls, level ranges, sort controls,
  result/empty/loading/error states, and stable pagination.
- Compact IndexedDB pack storage using verified encoded `.4ecp` bytes with
  transparent reads of older M1 object-form installations.
- A reproducible full-pack benchmark with enforced index, broad-query, and
  representative-query budgets.

## M2 verification record

On 2026-08-31:

- formatting, ESLint, all TypeScript projects, 24 unit/integration tests, the
  production Vite/PWA build, and the synthetic public suite passed;
- every full-corpus benchmark stayed within budget: approximately 4,978 ms
  index construction, 456 ms unfiltered, and 0.4-80 ms representative queries;
- the browser exercised full text, exact fragment restoration, entity-type and
  level filters, source exclusion, named saved-query persistence, stable detail
  URLs, ID-resolved outbound relationships, and worker reconstruction after
  reload against all 38,339 private records;
- the unprivileged production Docker PWA imported and activated the private
  pack; after its server was stopped completely, an offline reload restored the
  application and returned all 38,339 IndexedDB-backed records.

The query contract and budgets are maintained in
[query-engine.md](query-engine.md). The public suite builds and benchmarks only
synthetic content; `pnpm benchmark:query tmp/content/full-local.4ecp` exercises a
private local pack.

## M1 delivered

- A pnpm/TypeScript monorepo and project-local Nix toolchain with pinned lock
  files, formatting, linting, type checking, unit tests, production build, and
  public CI.
- `content-domain`, `legacy-wotc`, and `content-pack` packages with streaming
  `D20Rules` parsing, normalized records, preservation of unknown data,
  diagnostics, total record accounting, deterministic serialization, digest
  validation, summaries, and pack diffs.
- A command-line content tool with `build`, `inspect`, `validate`, and `diff`.
- A typed IndexedDB repository supporting verified install, collision rejection,
  list/get, activate/deactivate, and removal without touching future user data.
- A minimal React/Vite PWA shell with a typed import worker, gzip decoding,
  validation, progress, cancellation, error containment, local persistence,
  pack lifecycle controls, and a deliberately basic record inspector.
- Unprivileged development and production Docker targets with a production
  health check and SPA/offline asset serving.
- Synthetic distributable XML for public tests plus a private-corpus script that
  reproduces CBLoader's ordered merge with the verified reference merger before
  building a pack.

## Verification record

On 2026-08-31 the following passed in the root Nix environment:

- formatting, ESLint, TypeScript checks, 10 unit tests, Vite production build,
  and PWA service-worker generation;
- two independent synthetic builds compared byte-for-byte, followed by pack
  validation and a zero-change semantic diff;
- the reverse-engineering smoke suite, including schemas, sample characters,
  campaign XML, decryption/hash evidence, and merge semantics;
- the supplied full private merged corpus: 38,339 accepted records, zero
  rejected records, 41 explicit missing-source warnings, zero unaccounted raw
  top-level records, and a valid approximately 5.6 MiB compressed pack;
- browser import of both synthetic and full packs, activation, filtering,
  normalized detail rendering, IndexedDB persistence, and no console errors.

The public CI and repository do not require or contain the private corpus. Run
`nix develop path:. --command bash scripts/check.sh` for the public suite. With
the supplied ignored legacy files present, run `nix develop path:. --command
bash scripts/build-private-content.sh` for the ordered full-corpus path. Do not
feed a previously merged/decrypted CBLoader snapshot back through the parts
merger; begin from `combined.dnd40.original.xml` as the script does.

## Deferred by design

- The remainder of M4 owns advanced power branches and broader rules/golden-
  character coverage, focused replacement/grant editing, and unresolved native
  exception families.
- M5 owns regenerated `.dnd4e` snapshots, exhaustive cross-browser print
  goldens, and MVP parity closure.
- M6 and M7 own mobile play state and encrypted relay-linked sessions.
- Visual theming, animation, and fine interaction polish wait for the tighter
  user feedback loop requested for later UI work.
