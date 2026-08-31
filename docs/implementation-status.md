# Implementation status

## Current stopping point

Milestones M1 and M2 are complete. The application is now a useful local-first,
offline compendium alpha, but it is deliberately not yet a character builder.
The next work is M3: loss-preserving `.dnd4e` import, a local character library,
read-only sheets, printing, and familiar power/item cards.

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

- M3 owns `.dnd4e` compatibility, character storage, read-only sheets, printing,
  and power cards.
- M4 and M5 own the character engine/editor and MVP parity closure.
- M6 and M7 own mobile play state and encrypted relay-linked sessions.
- Visual theming, animation, and fine interaction polish wait for the tighter
  user feedback loop requested for later UI work.
