# Modern D&D 4E Character Builder workspace

This workspace contains the supplied legacy Character Builder application and
data, the completed compatibility research, and the durable plan for its modern
web replacement.

- Start with [`docs/README.md`](docs/README.md) for the product definition,
  architecture, MVP boundary, milestones, and architectural decisions.
- Start with
  [`reverse-engineering/docs/INDEX.md`](reverse-engineering/docs/INDEX.md) for
  the recovered game-data formats, `.dnd4e` compatibility, rule language, and
  legacy character-engine behavior.
- Use the project-local environment with
  `nix develop path:./reverse-engineering`; do not install analysis or build
  dependencies globally.

The modern application has not yet been scaffolded. The next implementation
work is milestone M1 in [`docs/roadmap.md`](docs/roadmap.md).

