# Content tool

The content tool compiles decrypted `D20Rules` XML into the versioned internal
content-pack format. Run it only through the project-local Nix environment:

```sh
nix develop path:. --command pnpm content-tool build \
  --input fixtures/content/synthetic.dnd40.xml \
  --output tmp/content/synthetic.4ecp \
  --id synthetic \
  --name "Synthetic development content"
```

Commands:

- `build` streams XML, accounts for every top-level record, and atomically writes
  a deterministic gzip-compressed pack. Readers detect compression by its magic
  bytes rather than trusting the file extension.
- `inspect` prints the manifest and type/accounting summary.
- `validate` checks shape, counts, duplicate IDs, and the SHA-256 digest.
- `diff` reports added, removed, changed, and unchanged entity IDs.

Pack files and official content remain ignored by Git. The fixture used by CI is
synthetic and contains no copied game prose.

## Full private corpus

With the supplied ignored `CBLoader` files present, the repository script starts
from `combined.dnd40.original.xml`, applies `.part` files in lexical order using
the recovered reference merge semantics, optionally compares the result with the
cached merged ruleset, builds the pack, and validates it:

```sh
nix develop path:. --command bash scripts/build-private-content.sh
```

Pass an output path as the first argument when desired. Do not apply the parts
again to an encrypted file that decrypts to a previously merged CBLoader
snapshot; that would duplicate merge operations and destroy provenance.
