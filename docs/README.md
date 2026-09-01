# Modern D&D 4E Character Builder plan

This directory is the durable product and implementation plan for the modern
character builder. It builds on the recovered compatibility specification in
[`../reverse-engineering/docs/INDEX.md`](../reverse-engineering/docs/INDEX.md)
without treating the legacy application's internal implementation as the new
application's architecture.

## Documents

1. [Product definition](product-definition.md) defines the users, product
   principles, MVP, final product, and non-goals.
2. [Architecture](architecture.md) defines the domain boundaries, persisted
   documents, content system, web application, character-sheet renderer, mobile
   play mode, synchronization protocol, deployment, and testing strategy.
3. [Roadmap](roadmap.md) breaks delivery into independently useful milestones
   with explicit entry and exit criteria.
4. [Decision log](decisions.md) records settled architectural decisions and the
   few decisions intentionally deferred until implementation evidence exists.
5. [Content-pack format](content-pack-format.md) specifies the portable internal
   corpus representation and compatibility rules.
6. [Implementation status](implementation-status.md) records completed work,
   verification evidence, and the next stopping boundary.
7. [Query engine](query-engine.md) specifies compendium query semantics,
   worker/index behavior, URL state, and measured performance budgets.
8. [Character import and sheets](character-import-and-sheets.md) specifies the
   M3 character record, lossless legacy envelope, local repository, sheet model,
   and current compatibility boundary.
9. [Rules engine](rules-engine.md) specifies the recovered evaluator,
   authoritative build boundary, parity evidence, and M5 blockers.
10. [M4 compatibility ledger](m4-compatibility-ledger.md) records exact-golden
    policy, exception-family disposition, the historical diagnostic baseline,
    and the M4 exit-criterion mapping.
11. [Contributor and agent workflow](contributor-workflow.md) defines milestone
    ownership, fresh-context handoffs, coordinator review, verification layers,
    commits, and completion rules.

## Definition hierarchy

- A **milestone** is a bounded body of work with demonstrable acceptance
  criteria. Several useful pre-MVP milestones exist.
- The **MVP** is the first release that can credibly replace the legacy builder
  for creating, maintaining, printing, importing, and exporting characters.
- The **final product** adds the complete player experience around that builder:
  mobile play, device handoff, optional linked sessions, custom content tools,
  and production hardening.
- The future **DM application** is an adjacent product. This repository must
  provide its stable session protocol and player-side integration, but the full
  DM UI is not required to call the character-builder product complete.

## Status

The reverse-engineering specification remains the compatibility evidence base.
Milestones M1 through M4 are implemented and verified. M4 is a builder beta;
the compatibility ledger names the native exception and cross-profile findings
that must close before M5 can be called the public MVP.
See the [roadmap](roadmap.md) and [implementation status](implementation-status.md).
