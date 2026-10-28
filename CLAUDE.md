# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A modern, offline-first web replacement for the legacy Windows D&D 4th Edition
Character Builder. The repo contains three things: the recovered compatibility
specification for the legacy application (`reverse-engineering/`), the working
replacement product (`apps/`, `packages/`), and the durable product/architecture
plan (`docs/`). The legacy `CharacterBuilder/` and `CBLoader/` directories are
the supplied original application, kept for reference/compatibility testing,
not modified.

**Read `AGENTS.md` first.** It defines mandatory workflow rules for coding
agents in this repo (milestone ownership, durable-doc updates, legacy-parity
investigation method, commit discipline). This file only adds commands and
architecture; it does not replace `AGENTS.md`.

## Environment

All installed tools and project commands must run inside the project-local Nix
shell — never assume global `node`/`pnpm`:

```sh
nix develop path:.
pnpm install --frozen-lockfile
```

## Common commands

Run from repo root:

```sh
pnpm dev                          # start the web app (apps/web)
pnpm build                        # typecheck then build apps/web
pnpm typecheck                    # typecheck all workspace packages
pnpm lint                         # eslint .
pnpm format / pnpm format:check   # prettier
pnpm test                         # vitest run (whole workspace)
pnpm test:watch                   # vitest watch
```

Single test / focused run (vitest picks up `apps/**/*.test.ts` and
`packages/**/*.test.ts`):

```sh
pnpm vitest run apps/web/src/routes.test.ts
pnpm vitest run -t "test name substring"
pnpm --filter @4ecb/rules-engine test     # if a package defines its own test script
```

Per-package typecheck (each package has its own `tsconfig.json`):

```sh
pnpm --filter @4ecb/character-domain typecheck
```

Content tool CLI (legacy import/merge/compile/inspect):

```sh
pnpm content-tool <args>          # tsx apps/content-tool/src/main.ts
```

Print/PDF and PWA build checks:

```sh
pnpm check:print                  # scripts/check-print.mjs (Chromium+Firefox+Poppler)
pnpm check:functional-baseline    # scripts/check-functional-baseline.mjs
```

Full public verification gate (run before declaring a milestone/checkpoint
done — mirrors CI, uses only synthetic content):

```sh
nix develop path:. --command bash scripts/check.sh
```

CI splits it: `public-checks` runs it with `FOURECB_SKIP_PRINT_CHECK=1` (and gates
image publishing), and a separate `print-checks` job runs `check:print`.

This runs format:check, lint, test, build, check:print, PWA artifact checks,
and a deterministic content-pack build/validate/diff/benchmark round-trip
against `fixtures/content/synthetic.dnd40.xml`.

Release (push to GitHub `main` and wait for the published image; the homelab
deploys it automatically — see `docs/public-deployment.md`):

```sh
scripts/deploy.sh    # --skip-checks, --no-wait
```

Content updates are separate from code releases (private data, homenet's deploy
key, Admin VLAN only): rebuild the corrections pack and push it to the homelab:

```sh
scripts/publish-content.sh    # --no-push, --rebuild
```

Private-corpus-only commands (require the supplied proprietary data; never
required by public tests/CI):

```sh
nix develop path:. --command bash scripts/build-private-content.sh
pnpm benchmark:query tmp/content/full-local.4ecp
pnpm audit:rules
pnpm audit:native-workflow
pnpm evaluate:character
pnpm evaluate:matrix
pnpm parity:baseline              # baselined legacy-cache parity, tmp/parity/ (--accept, --jobs N; ~1.5 min)
pnpm regenerate:edited-dnd4e
```

The locally built pack is `tmp/content/full-local.4ecp`; legacy sample
characters are in `sample-chars/*.dnd4e` (both ignored). They are the inputs for
checking real-character output against legacy PDFs, and `parity:baseline`
covers only them and the SampleHeroes: copy every player's legacy-builder save
(e.g. one attached to a bug report) into `sample-chars/` and re-accept the
baseline, never leave it in `scratch/` or Downloads.

Small-group deployment (static PWA container, no backend):

```sh
pnpm content-tool advertise /path/to/pack.4ecp   # writes ignored deploy/ (pack copy + runtime-config.json)
FOURECB_TAG=$(git rev-parse --short HEAD) docker compose up -d --build
```

The image serves `/private-packs/` from the read-only `deploy/` mount; see
`docs/public-deployment.md` and `docs/m5.7-beta-deployment.md` for status.

## Monorepo layout

pnpm workspace: `apps/*` and `packages/*`, TypeScript project references,
shared strict `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, ESNext/Bundler resolution). Each package exports
a single `src/index.ts` entry point.

```
apps/
  web/                 React + TypeScript + Vite PWA (the product)
  content-tool/        CLI: decrypt/import/merge/compile/inspect content packs
  session-relay/       (planned, post-MVP) opaque-envelope WebSocket relay
  dm/                  (planned, out of builder-1.0 scope)

packages/
  content-domain/      Normalized game entities and provenance
  content-pack/        Pack manifest, codecs, validation, migration
  character-domain/    Durable character aggregate + edit commands
  play-domain/         (planned) Mutable table/play state and deterministic operations
  rules-engine/        Choice, prerequisite, stat, and legality evaluator
  query-engine/        Full-text/facet/filter/sort query AST for the compendium
  sheet-model/         Evaluated snapshot -> semantic SheetDocument/cards
  legacy-wotc/         WotC.index / encrypted-container compatibility
  legacy-dnd4e/        Loss-preserving .dnd4e character import/export
  legacy-campaign/     (out of scope) .dndcamp compatibility
  session-protocol/    (planned) Pairing, capabilities, encrypted message schemas
  browser-storage/     IndexedDB repositories, transactions, migrations
  ui/                  (planned) Low-level accessible visual primitives (deliberately thin)

docs/                  Product plan, architecture, roadmap, decisions (source of truth)
reverse-engineering/   Legacy evidence, recovered spec, schemas, fixtures
```

Packages are independently testable domain/runtime boundaries. Feature UI
pages stay in `apps/web` until a second real consumer justifies extracting a
package — don't pre-extract.

## Architecture (read `docs/architecture.md` for full detail)

Core invariant: **stored inputs are authoritative; calculated snapshots are
reproducible; legacy caches are compatibility evidence, not the new source of
truth.**

Pipeline:

```
Legacy WotC data / .dnd4e --> compatibility adapters --> content profile / character record
character record + content profile + play state --> rules engine --> EvaluatedCharacterSnapshot
                                                                        /      |       \
                                                                  builder  sheet/print  phone play
```

- **CharacterRecord** (`character-domain`) is the durable, edited-by-command
  aggregate: identity, `buildTimeline[]` (level-by-level history; a flattened
  "current build" is a derived projection), selections, inventory, wealth,
  `legacyEnvelope` (preserves unrecognized legacy XML for loss-preserving
  export — never read back as a semantic source of truth). Every nested
  occurrence has a stable occurrence ID. Components never mutate nested fields
  directly; all edits go through transactional commands
  (`chooseElement`, `replaceSelection`, `retrainSelection`, `advanceLevel`,
  `addInventoryHolding`, `equipHolding`, ...).
- **PlayState** (planned `play-domain`; not built yet) is a separate mutable overlay (HP, surges,
  action points, effects, power uses) referencing a `baseRecordRevision`, with
  stable operation IDs — not folded into CharacterRecord.
- **EvaluatedCharacterSnapshot** is the disposable, cacheable, deterministic
  output of the rules engine: totals _and_ full provenance per modifier,
  legality diagnostics, resolved powers/equipment. Given identical versioned
  inputs, evaluation is deterministic.
- **Content packs** are immutable and content-addressed (manifest + normalized
  entities + rule IR + indexes + diagnostics). A **ContentProfile** is an
  ordered set of packs + resolution policy, materialized as another verified
  local pack so workers see one immutable input. Characters pin a resolved
  profile revision; installing a newer pack never silently changes them.
  Heavy text parsing of content (stat blocks, prose fields, rule strings)
  happens once, at pack generation (`legacy-wotc` import / `content-tool
build`), and is stored as normalized fields or IR in the pack; the app and
  rules engine only read those, computing just what depends on the character.
- **Rules engine** (`rules-engine`) implements the recovered rule language as
  explicit phases (resolve profile -> level/history context -> grants/removals
  -> choices -> prerequisites/legality -> stat/text/power statements ->
  equipment/weapon/implement resolution -> campaign/play effects ->
  diagnostics -> snapshot), not one opaque `calculate()`. Runs in a Web Worker.
  UI never accesses rules XML or implements formulas directly — it talks to
  rules/content-query/import workers via typed request/response messages.
- **sheet-model** converts a snapshot into a layout-neutral `SheetDocument`
  (sections + cards), consumed identically by browser reference view, print,
  and interactive play mode.
- **Legacy compatibility** is isolated in `legacy-wotc` (encrypted
  container/index/CBLoader semantics) and `legacy-dnd4e` (`.dnd4e` import/export,
  separating authoritative input from regenerated `CharacterSheet` caches).
  `.dndcamp` campaign support is out of scope. Import produces a structured report
  (mapped fields, preserved unknown data, missing refs, stale caches, lossy
  decisions); export is explicit about its target compatibility profile.
- **Browser persistence** (`browser-storage`) uses IndexedDB with separate
  logical repositories for packs/profiles/characters/play-state/indexes;
  content packs are digest-verified before activation; migrations are
  restartable and never evict user-authored documents.

### Web app routes (`apps/web`)

Hash routes (parsed/canonicalized in `routes.ts`, code-split per route):
`#/characters` (library), `#/characters/:id/edit?…` (builder workspaces:
build/retraining/details/equipment[+loadout]/shop/diagnostics/house-rules via query;
Diagnostics and House rules open from the status badges, Overview is gone), `#/characters/:id`
(sheet; `?preview=1` opens print preview, `?preview=1&edit=1` its Edit mode
for the per-character sheet layout: right-click hide/show and drag-to-reorder on cards
(`SheetEditTarget.tsx`), right-click hide/show on page-1 reminder rows
(`SheetOverview.tsx`; power-card riders offered off by default) and the
toolbar Sections menu of sections
(`SheetSectionsMenu.tsx`: hide/show and reorder) — D099, `?print=1` auto-opens the print
dialog), `#/settings`. The interactive (non-print) View sheet is deferred to M6,
so the builder tab and library sheet action link to `?preview=1`. Hash-route
changes move focus to the new main landmark. Every builder tab shares the
sticky character sidebar (`builder-layout`/`builder-sidebar` in
`CharacterEditorPage.tsx`: portrait, name, `BuilderCharacterStats`) and the
Build tab's "Level N" heading is the `LevelPicker` modal — D080; there is no
separate header or level rail.

### Printable sheet and derived values

- **Single source for numbers.** Every value shown on more than one surface
  (builder header, page 1, play cards, power cards, scratchpad) comes from
  evaluated stats or `packages/rules-engine/src/derived-values.ts` (healing
  surge value = HP/4 + the additive "Healing Surge Value" stat, bloodied,
  ability modifier, half level). Never re-derive a formula in UI/sheet code.
- **Evaluation cache.** Evaluations persist in IndexedDB keyed by
  `RULES_EVALUATION_CACHE_VERSION` (`rules-engine/src/evaluator.ts`); bump it
  whenever `EvaluatedCharacter`'s shape or semantics change.
- **Loadout slots.** `rules-engine/src/loadout-slots.ts` is the one loadout
  resolver (evaluator, Equipment tab, sheet; sheet-model and `equipment-ui.ts`
  re-export it). The evaluator takes the main hand, alternate-slot wear and
  versatile two-handed use from the resolved loadout (`legacyLoadoutState`,
  D101), never from raw legacy text strings. The resolver also applies the
  character's size facts (`EvaluatedCharacter.loadoutSlotContext`, passed as
  `loadoutContext(textStrings, slotContext)`; D102): a Small character's
  versatile weapon fills both hands, One Size Larger holds a two-handed
  weapon in one, and an equipped weapon the character can't wield is a
  house-rule character issue (`unwieldableWeaponIssues`). Equipment-tab
  per-item actions are right-click menus (`ItemContextMenu.tsx`), e.g. "Wield
  two-handed" (checked and inert when size forces it) and, on a dragonshard
  augment, "Attach to <item>"/"Detach" (`set-inventory-augment`; the host's
  `augmentEntryId`, resolved by `boundAugmentHolding`, else the imported loot
  `augment` CharLootID).
- **Stylesheets.** `apps/web/src/styles/index.css` imports every app
  stylesheet in cascade order: `primitives.css`, then `01-base.css` …
  `16-actions-notices.css`, split by surface without reordering rules. Put a
  new rule in the file of the surface it styles; tests read the combined CSS
  through `test-styles.ts` (`appStyles`).
- **Print layout.** `SheetOverview.tsx` renders page 1, continuations,
  scratchpad, reference pages, the card pages (its children) and Session
  Notes in the layout's section order (D099), fitting content by measuring
  hidden "probe" copies (`ov-pane-probe`, `ov-reminder-probe`). Power and
  item cards are `PowerCard.tsx`/`ItemCard.tsx` (fit hook in
  `use-print-card-fit.ts`) plus `PrintPlayCards.tsx`. The deck and its
  default order (Play data → Skills → Action Point → Second Wind → `sortedPowerCards`
  → items) come from `sheetCardDeck` in `sheet-model/src/card-deck.ts`, with
  stable provenance card keys; `applySheetLayout`
  (`sheet-model/src/sheet-layout.ts`) applies the character's `sheetLayout` (including its `cardOrder`
  and page-1 `reminders` choices over the overview's `reminderCandidates`)
  and item `showPowerCard` flags (D099). `print-item-presentation.ts` and
  `reference-power-index.ts` shape card/index text. `StatTiles.tsx` is shared
  by page 1, play cards and the builder header.
- **One card format (D079).** Every power/item card on every surface (print,
  screen sheet, builder detail panes) is `PowerCard`/`ItemCard` rendering a
  `SheetCard`: `layout="print"` is fixed-size and fitted, `layout="panel"` is
  fluid with builder slots. Builder panes get cards via `BuilderCards.tsx`
  (`BuilderCardContext` + `evaluatedBuilderCardSettings`: the evaluated
  `createSheetPowerCardFinder` card at the Build tab's viewed level or
  Equipment/Shop's current level; `sheetItemCard` for items). Panel cards use
  dark `--card-paper`/`--card-ink` on screen only; print stays light. Card type, usage, tone and action labels come only from
  `sheet-model/src/power-classification.ts` (`classifyPower`,
  `powerActionLabel`, `powerActionRank`) — never re-derive them in UI code.
  Other choices (class, race, feat…) use the same frame via
  `reference-entity-card` in `CandidateDetail.tsx`.
- **Special cards.** `sheet-model/src/universal-action-cards.ts` synthesizes
  Action Point (stacked `Action Point`/`ALLY.`/`BEAST.` textstrings via
  `EvaluatedCharacter.textContributions`) and Second Wind, mirroring the
  legacy `CharTracker` special cards. Second Wind's action and notes come only
  from `modify name="Second Wind"` overlays — never special-case races or
  powers in code; fix content errata in `content/corrections/*.part`, merged
  by `scripts/build-private-content.sh` after the CBLoader parity check.
- **Content updates.** Characters stay pinned to their content; an available
  update is a character issue of kind `update` (`contentUpdateIssue` in
  `builder-diagnostics.ts`, raised via `withCharacterIssues`), not a warning:
  its own status badge opens `ContentUpdateDialog.tsx` (`content-update.ts`,
  backed by `previewProfileMigration`) to move a character onto the active
  content.
  Raise new character issues the same way, never as one-off banners.
  Settings' content table logic lives in `content-profile-ui.ts`.
- **Legacy viewer source.** When available locally,
  `reverse-engineering/generated/decompiled/CharacterSheetViewer/CharTracker/`
  holds the decompiled legacy sheet/card logic — check it before inventing
  card behavior (it is ignored by git and not required by public tests).

## Legacy-parity investigation method

When a modern calculated value differs from a legacy sample character's value,
follow `AGENTS.md`'s method: treat the legacy engine as the behavioral oracle,
trace the original code path in `reverse-engineering/` before changing a
modern formula, and prefer "an unknown native factor is missing" over "the
legacy value is stale" absent direct evidence. Implement corrections from
recovered behavior and exact fixtures, never by curve-fitting formulas to
cached totals.

## Verification expectations

Milestones/checkpoints are not done from a dirty or unverified worktree. Use
the smallest layer that catches a problem while iterating (focused
`pnpm vitest run <file>`, package typecheck), then run `scripts/check.sh`
before a milestone or release checkpoint. Public tests and commits must never
require or include the proprietary legacy corpus; private-corpus diagnostics
stay separate and ignored by git. Update `docs/implementation-status.md` and
`docs/roadmap.md` in the same change that changes verified status.
