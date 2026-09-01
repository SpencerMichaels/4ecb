# Contributor and agent workflow

## Why this exists

This project spans reverse engineering, compatibility adapters, a rules engine,
browser storage, UI, printing, deployment, and eventually live play. Durable
context and explicit acceptance boundaries matter more than any one coding
session. This document defines how humans and coding agents should divide,
verify, and hand off work.

## Roles

### Milestone lead

A new roadmap milestone should normally begin with a fresh lead subagent when
that capability is available. A fresh context reduces accidental dependence on
stale implementation assumptions. The lead reads the repository documents,
audits current code and evidence, chooses coherent implementation slices, and
works toward the milestone's complete exit criteria.

The lead is not given a transcript as its primary specification. Its handoff
packet is the repository itself, especially:

1. `AGENTS.md`;
2. `docs/roadmap.md`;
3. `docs/implementation-status.md`;
4. `docs/architecture.md` and `docs/decisions.md`;
5. the subsystem specifications and compatibility ledgers relevant to the
   milestone; and
6. the current Git status and recent commits.

### Coordinator

The primary agent or human maintainer remains accountable for the milestone. It:

- defines or confirms scope and product authority;
- prevents agents from making overlapping changes in the shared worktree;
- reviews architecture and any divergence from durable decisions;
- checks that private evidence did not enter public artifacts;
- independently runs proportionate verification;
- updates or reviews the durable handoff; and
- declares completion only after mapping evidence to every exit criterion.

The coordinator should not duplicate the milestone lead's active implementation
work. It can review, investigate a separate read-only question, or prepare a
non-overlapping verification path while the lead works.

### Specialized contributor

Additional subagents are useful only for bounded, independent tasks—for example,
auditing a file format while another agent builds a non-overlapping UI fixture.
Each task needs explicit file/scope ownership and a result that the coordinator
can integrate. More agents are not inherently better when they share core files
or depend on serial design choices.

## Milestone lifecycle

### 1. Establish the boundary

Read the milestone goal, deliverables, and exit criteria. Audit the current
implementation and convert the milestone into coherent slices. Record material
assumptions. If a choice would change product scope or create a new external or
destructive effect, obtain direction rather than silently choosing.

### 2. Work in verified slices

Each slice should produce an independently understandable improvement:

- implement one coherent behavior or workflow;
- add exact public fixtures and focused tests;
- use private artifacts only as ignored diagnostic evidence;
- run focused formatting, lint, type, and behavior checks;
- inspect the actual browser/output when behavior is user-facing;
- update the relevant specification when the observed architecture changes;
  and
- create a focused checkpoint commit.

The lead may continue directly to the next approved slice when tests and evidence
are sound and no product decision is needed.

### 3. Maintain truthful compatibility evidence

Same-profile goldens are exact pass/fail evidence. Historical files whose source
content revision is unknown are diagnostic evidence. Reports must preserve that
distinction, show mismatches, and never relabel a cross-profile percentage as
exact parity.

Unknown or unsupported legacy behavior should remain visible and recoverable.
Use explicit diagnostics and compatibility ledgers; do not discard records,
invent calculated certainty, or weaken tests to claim completion.

### 4. Close the milestone

Before completion, the coordinator checks:

- every deliverable exists in the product or durable documentation;
- every exit criterion has direct evidence;
- public and relevant private verification pass;
- important UI flows were exercised in a real browser;
- accessibility, security, performance, or compatibility checks appropriate to
  the milestone were run;
- the worktree is clean and commits are coherent;
- `docs/implementation-status.md` and `docs/roadmap.md` state the true boundary;
  and
- every remaining blocker has an explicit, already approved resolution owner
  and milestone.

A later milestone owning “closure of blockers” does not permit vague deferral.
The blocker must be named, its impact described, and its validation path recorded.

## Standard verification layers

Use the smallest layer that catches a problem quickly, then broaden before a
checkpoint:

1. focused unit or package tests during iteration;
2. formatting, lint, and affected TypeScript projects;
3. production build and browser exercise for UI/worker/storage changes;
4. deterministic public fixtures and benchmarks where applicable;
5. ignored private-corpus audits or parity reports where applicable; and
6. `nix develop path:. -c bash scripts/check.sh` before milestone closure.

All installed tools and project commands must run from the project-local Nix
environment. Public CI must remain independent of proprietary application and
content files.

## Git and shared-worktree practices

- Inspect `git status` before and after a slice.
- Preserve unrelated edits and never reset another contributor's work.
- Coordinate ownership before two active agents touch the same file.
- Prefer small, coherent commits that describe outcomes.
- Do not commit generated private packs, imported characters, proprietary data,
  temporary reports, or local browser state.
- End a milestone with a clean worktree unless a known user-owned edit is
  explicitly documented.

## UI feedback policy

Initial UI work should establish information architecture, accessibility, and
complete workflows with restrained styling. Theming, animation, and subjective
visual polish require a tighter product-owner feedback loop and should not delay
functional milestone evidence.
