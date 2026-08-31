# Implementation status

## Current stopping point

Milestone M1, the workspace and content-pack foundation, is complete. The next
work is M2's compendium query/index vertical slice. Character documents, rules
evaluation, sheet rendering, play state, and relay networking remain later
milestones; no temporary versions of those domains were smuggled into M1.

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

- M2 owns real query indexes, facets, advanced filters, paging, and performance
  budgets. M1's substring filter is only an import/inspection proof.
- M3 owns `.dnd4e` compatibility, character storage, read-only sheets, printing,
  and power cards.
- M4 and M5 own the character engine/editor and MVP parity closure.
- M6 and M7 own mobile play state and encrypted relay-linked sessions.
- Visual theming, animation, and fine interaction polish wait for the tighter
  user feedback loop requested for later UI work.
