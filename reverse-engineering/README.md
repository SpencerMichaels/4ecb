# D&D 4E Character Builder reverse-engineering workspace

This directory contains compatibility research for the supplied legacy Character
Builder distribution. It is intentionally separated into:

- `docs/`: authored, implementation-oriented specifications.
- `schemas/`: machine-readable descriptions of recovered formats.
- `fixtures/`: small representative inputs and expected outputs.
- `scripts/`: reproducible inspection and validation utilities.
- `generated/`: machine-generated inventories, reports, and decompiled evidence.
- `reference/`: pinned external primary-source material used during analysis.
- `tools/`: local analysis tools and wrappers.

The reproducible analysis environment is defined in `flake.nix`. From the
repository root, enter it with `nix develop path:./reverse-engineering`; no
host-global packages are required. (`path:` is intentional because the supplied
directory is not itself a Git checkout.)

Generated decompiler output is evidence, not original source code. The authored
documentation distinguishes directly confirmed behavior, experimentally verified
behavior, and inference.

Start with [`docs/INDEX.md`](docs/INDEX.md). It separates the persistence formats,
rule language, runtime lifecycle, application workflows, and implementation plan.

Run the reproducible smoke suite with:

```sh
reverse-engineering/scripts/check.sh
```

Add `--full` to re-merge and semantically compare the complete 38,339-record
dataset and regenerate all structural profiles.
