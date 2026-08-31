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

The reverse-engineering and compatibility specification is the current evidence
base. Product implementation has not begun. The next executable milestone is
M1 in the [roadmap](roadmap.md).

