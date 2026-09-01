# Repository agent instructions

These instructions apply to the entire repository.

## Durable context

- Treat `docs/README.md`, `docs/roadmap.md`, `docs/implementation-status.md`,
  `docs/decisions.md`, and the relevant subsystem specifications as the source
  of truth. Conversation history is not the project record.
- Record material architecture decisions, compatibility boundaries, milestone
  status, verification evidence, and deferred blockers in the repository during
  the same change that establishes them.
- Preserve the reverse-engineering evidence and ignored private corpus. Public
  tests and commits must not require or include proprietary data.

## Milestone ownership

- Prefer a fresh lead subagent for each new milestone when subagents are
  available. Give it a clean context and direct it to the durable project docs
  rather than copying a long prior conversation.
- The primary agent remains the coordinator: it owns scope, reviews
  architectural deviations, prevents overlapping edits, independently verifies
  the result, and decides whether exit criteria are met.
- Additional agents are appropriate only for concrete, separable work with
  non-overlapping files or clearly coordinated ownership.
- A milestone lead may advance through coherent slices autonomously while the
  approved roadmap supplies the decisions. It must stop for a genuine product
  decision, new authority, destructive action, or scope expansion.

## Completion and handoff

- A milestone is complete only when every documented exit criterion passes or a
  remaining incompatibility is explicitly recorded under an already approved
  later resolution plan. Code existing or tests passing in isolation is not
  sufficient.
- Distinguish exact same-profile goldens from diagnostics that compare artifacts
  created by different or unknown content revisions.
- Keep invalid, incomplete, custom, and legacy data recoverable and explainable;
  never improve a percentage by discarding evidence or silently relaxing an
  assertion.
- At each coherent stopping point, leave the worktree understandable: focused
  commits, updated status/roadmap documents, commands used for verification,
  measured results, and a concise remaining-work statement.

## Engineering workflow

- Use only the project-local Nix environment for installed tools and project
  commands: `nix develop path:. -c ...` (or the documented narrower
  reverse-engineering environment).
- Use `apply_patch` for hand-authored file edits. Preserve unrelated user changes
  and coordinate before editing files another active agent owns.
- Run focused tests while iterating and `scripts/check.sh` before a milestone or
  release checkpoint. Add private-corpus diagnostics when relevant, but keep
  them separate from the public suite.
- Make coherent checkpoint commits after verification. Do not declare a
  milestone complete from a dirty or unverified worktree.
- Build UI structure and functionality first. Defer visual theming, animation,
  and subjective polish to a tighter feedback loop with the product owner.

See `docs/contributor-workflow.md` for the full milestone lifecycle and handoff
checklists.
