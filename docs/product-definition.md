# Product definition

## Vision

Build a modern, public, offline-first web application that preserves the full
character-building behavior and legacy file compatibility of the discontinued
D&D 4th Edition Character Builder while improving discovery, usability,
printing, portability, custom-content support, and at-the-table play.

The application should feel like a contemporary character builder rather than a
Windows application running in a browser. The legacy application is an oracle
for file and rules compatibility, not a visual specification.

## Primary users and jobs

### Character builder

A player on a desktop or tablet can:

- create a character from level 1 or at a higher starting level;
- make, revisit, retrain, and validate all rules-driven selections;
- manage equipment, wealth, rituals, companions, notes, and campaign settings;
- understand why a choice is available, unavailable, required, or invalid;
- inspect every calculated value and the modifiers that produced it;
- save automatically without an account or network connection;
- import and export files accepted by the original builder; and
- view and print a useful character sheet with familiar power cards.

### Compendium user

A player or GM can quickly search powers, feats, items, classes, races,
backgrounds, rituals, and other game elements using full text, typed filters,
facets, sorting, and shareable local query state.

### Player at the table

A player on a phone can:

- see current defenses, movement, senses, attacks, and other important values;
- apply damage, healing, temporary HP, surges, action points, and death saves;
- read powers and mark limited-use powers as used or recharged;
- track conditions, durations, bonuses, penalties, and other status effects;
- change the current equipment loadout and record treasure or notes; and
- optionally join an encrypted session that a future DM application can see.

### Self-hoster

A self-hoster can deploy the application as a small Docker workload, configure
an optional session relay, supply a private content pack, upgrade safely, and
back up portable user-owned files without maintaining user accounts.

## Product principles

1. **Local-first, account-free.** Character ownership must not depend on an
   operator account or central database. Network features are optional.
2. **Compatibility at the boundaries.** Legacy formats are import/export
   adapters, not the internal domain model.
3. **Deterministic and explainable rules.** Calculated values must be reproducible
   and expose modifier provenance.
4. **Versioned content, rules, and schemas.** Existing characters do not silently
   change when content or engine behavior changes.
5. **Progressive capability.** The application remains useful without a relay,
   without a full content corpus, and while offline.
6. **Different devices, purpose-built interfaces.** Building targets desktop and
   tablet; play targets phones; printing targets paper. They share domain logic,
   not a compromised universal layout.
7. **User data remains portable.** Every local document has an export path and a
   documented migration strategy.
8. **Public distribution does not imply content redistribution.** Application
   code and proprietary game data remain separable.
9. **Structure before visual polish.** Early UI work prioritizes information
   architecture, complete workflows, accessible interaction, responsive layout,
   and clear system states. Visual identity, elaborate theming, animation, and
   decorative polish are developed later through short user-feedback cycles.

## Product scope by release boundary

### Pre-MVP deliverables

These milestones are useful, testable releases but are not yet a replacement
character builder:

- a versioned content compiler and pack inspector;
- a fast, advanced compendium browser;
- read-only `.dnd4e` import, character inspection, and sheet preview;
- loss-preserving `.dnd4e` round trips; and
- progressively expanding rules-engine parity reports.

### MVP: minimum viable legacy-builder replacement

The MVP is deliberately substantial. It is the first release suitable for a
player to use instead of the legacy builder.

It includes:

- a publicly deployable React/TypeScript PWA and Docker image;
- account-free IndexedDB persistence, backups, restore, and schema migrations;
- client-side import of legally obtained legacy game data or a locally compiled
  versioned content pack;
- advanced compendium search and filtering across all supported element types;
- import and export of `.dnd4e` with unknown extensions preserved where
  possible;
- creation and editing of level 1-30 characters through the generic choice and
  rules engine, rather than a hand-coded subset of classes;
- races, classes, builds, ability scores, skills, feats, powers, equipment,
  retraining, level history, paragon paths, epic destinies, rituals, companions,
  campaign restrictions, and the hard-coded exceptions identified by the
  compatibility research;
- legality diagnostics and a modifier/provenance explanation for derived values;
- browser character-sheet viewing;
- print/save-to-PDF layouts for US Letter and A4;
- configurable blank play fields and selectable sheet sections;
- familiar, printable power and item cards; and
- automated compatibility, rules, import/export, storage, accessibility, and
  print-regression tests at the agreed MVP quality bar.

The MVP does **not** require:

- a mobile play-mode UI;
- cross-device transfer or a hosted relay;
- live player/DM sessions;
- a graphical custom-content authoring tool;
- a complete DM application;
- cloud accounts or permanent server-side character storage; or
- pixel-for-pixel reproduction of the old user interface or branded sheet; or
- a finished visual identity, elaborate animation system, or highly polished
  theme. The MVP must be coherent, readable, accessible, and structurally sound,
  but visual refinement is a separate feedback-driven workstream.

### Final character-builder product

The final product includes the MVP plus:

- an installable, phone-first play mode;
- structured play state for HP, resources, power use, conditions, durations,
  equipment overrides, treasure, and session notes;
- encrypted one-time desktop-to-phone transfer using QR pairing, with manual file
  transfer as a fallback;
- an optional self-hostable WebSocket relay with short-lived rooms and no user
  accounts;
- a versioned session protocol with player, DM, and read-only capabilities,
  idempotent operations, audit history, and reconnection behavior;
- player-side linked-session integration suitable for the future DM application;
- custom content-pack import, overlay ordering, conflict diagnostics, and a
  graphical editor for commonly authored content;
- polished campaign-profile management and campaign restrictions;
- install/update/offline UX, recovery tools, performance budgets, security
  review, accessibility review, localization-ready text boundaries, and complete
  operator documentation; and
- stable, documented public extension formats for content packs, characters,
  portable play bundles, and session messages; and
- a cohesive visual design and restrained motion system refined with the product
  owner through short prototype/review iterations after workflows are stable.

The full DM application's encounter building, monster management, maps, and DM
workflow remain a separate product. The character builder is responsible for a
compatible protocol and player projection, not that entire UI.

## Character-sheet requirements

The sheet has three modes generated from the same semantic sheet model:

1. **Browser view:** readable, accessible character reference with live derived
   values.
2. **Print preview:** page-aware layout with controls for paper size, included
   sections, card orientation, color, and which mutable fields are blank.
3. **Play view:** interactive cards and mutable values backed by `PlayState`.

Printing defaults to leaving current HP, temporary HP, current surge use,
conditions, death-save failures, and limited-power usage blank while retaining
maximums and other derived values. The user can override each category.

Power cards retain the recognizable information hierarchy and usage color
families of 4E—name, usage, keywords, action, range, attack, defense, target,
trigger, effect, hit/miss, weapon variants, and source—using an original visual
design without Wizards logos or copied branded assets.

## Public distribution and content boundary

The public application and its default Docker image must not contain the full
proprietary 4E rules corpus unless the project later obtains a license or legal
review that explicitly permits it.

The public distribution will instead provide:

- application source and binaries;
- synthetic compatibility fixtures;
- freely distributable community packs where their licenses permit it;
- client-side selection/import of an installed legacy-builder data directory;
- a project-local Nix content tool that creates a private portable content pack;
  and
- optional mounting or serving of that pack in a self-hosted deployment.

The official [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
and [Wizards Terms of Use](https://company.wizards.com/en/legal/terms) are the
current policy references. This plan is an engineering risk boundary, not legal
advice. A public release must include an appropriate unofficial-content notice
and avoid Wizards trademarks and trade dress beyond legally permitted
references.

## Non-functional requirements

### Offline and resilience

- Once installed and supplied with a content profile, all non-session workflows
  operate without a network.
- Every mutation is transactionally stored and recoverable after an interrupted
  tab or browser restart.
- Storage failures and quota pressure are visible; backups are never implied to
  exist when they do not.
- Characters, profiles, and custom packs can be exported independently.

### Performance

- The application shell becomes interactive without loading the entire corpus.
- Rules evaluation and indexing run outside the UI thread.
- Typical filtered compendium interactions feel immediate after indexing.
- A character edit recalculates incrementally or quickly enough to preserve
  direct-manipulation feedback.
- Large data imports expose progress and can be cancelled safely.

Concrete budgets will be benchmarked and fixed during M2 and M4 rather than
invented before representative content and engine workloads exist.

### Accessibility

- During core implementation, semantic headings, labels, basic keyboard
  operation, focus management, and text alternatives are structural acceptance
  criteria.
- M5.5 validates complete builder and compendium workflows with keyboard and
  selected screen readers after the interface is designed.
- Color is never the only signal for power usage, legality, or status.
- Print output remains legible in monochrome.

### Browser support

- M5 functional builder: current stable desktop Chromium and Firefox, with
  ordinary-file fallbacks for progressive APIs.
- M5.5 designed builder: current desktop Safari plus iPadOS Safari and
  Chromium-based Android tablet validation where hardware is available.
- Phone play mode: current iOS Safari and Android Chromium when M6 ships.
- Progressive APIs such as directory selection always have ordinary file-input
  and portable-pack fallbacks.

### Privacy and security

- No analytics, crash upload, or telemetry is enabled by default.
- Imported official content and character files remain local unless the user
  explicitly initiates encrypted transfer or session participation.
- Transfer/session encryption keys remain client-side and are not placed in
  server-visible URL components or logs.
- Custom content is untrusted data and cannot execute JavaScript or inject raw
  HTML.
