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
7. [Query engine](query-engine.md) specifies contextual content-query
   semantics, worker/index behavior, and measured performance budgets.
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
12. [Public PWA and Docker deployment](public-deployment.md) defines the
    proprietary-content boundary, existing container foundation, M5.7 invited-
    beta hostability work, runtime configuration, offline/update behavior, and
    later hardening boundary.
13. [M5 functional closure checklist](m5-release-checklist.md) maps security,
    compatibility, durability, and functional browser/print evidence to M5, and
    records the later lightweight M9 browser check (this project runs no
    formal accessibility-certification or cross-client support matrix; see
    decision D063).
14. [User guide and recovery handbook](user-guide.md) covers installation,
    private content, character/profile workflows, compatibility export, sheets,
    backup/restore, updates, recovery, and current limitations.
15. [Original Character Builder launch matrix](legacy-builder-launch-matrix.md)
    records the recovered executable/data contract, curated regenerated
    candidates, repeatable execution procedure, and observed runtime results.
16. [Functional refactor and performance plan](functional-refactor-plan.md)
    records the approved staged audit follow-up, measurable performance and
    regression gates, architecture decision point, and per-stage evidence log.
17. [Functional and performance baseline](functional-performance-baseline.md)
    defines the public synthetic browser workload, metric collection protocol,
    current measurements, guardrail results, and visual evidence used by that
    refactor program.
18. [Printed overview design study](sheet-overview-prototype.md) documents the
    M5.6 summary/scratchpad/reference-page design study, real-data print integration,
    and remaining review boundaries.

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
Milestones M1 through M5.6 are implemented and verified. M5 is the functional
builder MVP, M5.5 closes the designed builder, library, and Equipment
interfaces, and M5.6 closes the printable character sheet; the interactive
browser View sheet is deferred to M6 alongside the mobile interface. M5.7 performs final UI cleanup and invited-beta hosting
preparation. The beyond-parity desktop/tablet Play foundation moves to M5.8;
M6 depends on it before adapting play to phones.
See the [roadmap](roadmap.md) and [implementation status](implementation-status.md).
