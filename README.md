# Modern D&D 4E Character Builder workspace

This workspace contains the supplied legacy Character Builder application and
data, the compatibility research, and the working compendium alpha for its
modern web replacement.

- Start with [`docs/README.md`](docs/README.md) for the product definition,
  architecture, MVP boundary, milestones, and architectural decisions.
- Start with
  [`reverse-engineering/docs/INDEX.md`](reverse-engineering/docs/INDEX.md) for
  the recovered game-data formats, `.dnd4e` compatibility, rule language, and
  legacy character-engine behavior.
- Contributors and coding agents must follow [`AGENTS.md`](AGENTS.md) and the
  [durable milestone workflow](docs/contributor-workflow.md).
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

Import `tmp/content/full-local.4ecp`, activate it under Content settings, and
open the Compendium to search the complete local corpus. Query state is kept in
the URL fragment and saved searches remain in browser-local storage.

Measure the query engine against a private pack with:

```sh
nix develop path:. --command pnpm benchmark:query tmp/content/full-local.4ecp
```

Build the unprivileged production container with `nix develop path:. --command
docker build -t 4ecb .`, or the live development target with `nix develop path:.
--command docker build --target development -t 4ecb-dev .`. Neither image
includes the ignored legacy application or official corpus. The
[public deployment guide](docs/public-deployment.md) also documents read-only
operation, runtime configuration, HTTPS, health checks, PWA updates, and the
proprietary-content boundary. The repository-wide
[public distribution notice](NOTICE.md) applies to every hosted build and image.

Milestones M1 through M4 are complete, and M5 is in progress. See
[`docs/implementation-status.md`](docs/implementation-status.md) for verified
evidence and [`docs/roadmap.md`](docs/roadmap.md) for the current milestone.
