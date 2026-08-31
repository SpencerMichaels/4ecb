# Modern D&D 4E Character Builder workspace

This workspace contains the supplied legacy Character Builder application and
data, the compatibility research, and the first production foundation for its
modern web replacement.

- Start with [`docs/README.md`](docs/README.md) for the product definition,
  architecture, MVP boundary, milestones, and architectural decisions.
- Start with
  [`reverse-engineering/docs/INDEX.md`](reverse-engineering/docs/INDEX.md) for
  the recovered game-data formats, `.dnd4e` compatibility, rule language, and
  legacy character-engine behavior.
- Use the project-local environment with `nix develop path:.`; do not install
  analysis or build dependencies globally. The narrower
  `nix develop path:./reverse-engineering` environment remains available for
  compatibility research in isolation.

## Development

Enter the environment and run the web shell:

```sh
nix develop path:.
pnpm install --frozen-lockfile
pnpm dev
```

The public verification suite uses only synthetic content:

```sh
nix develop path:. --command bash scripts/check.sh
```

Developers who possess the supplied private corpus can reproduce the complete
merge and pack build with:

```sh
nix develop path:. --command bash scripts/build-private-content.sh
```

Build the unprivileged production container with `docker build -t 4ecb .`, or
the live development target with `docker build --target development -t 4ecb-dev
.`. Neither image includes the ignored legacy application or official corpus.

Milestone M1 is complete. See [`docs/implementation-status.md`](docs/implementation-status.md)
for verified evidence and [`docs/roadmap.md`](docs/roadmap.md) for the next
milestone.
