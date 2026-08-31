# Content-pack format

## Purpose and boundary

The content pack is the application's versioned, read-only internal corpus. It
is deliberately distinct from legacy `D20Rules` XML: XML remains an import
format, while the normalized pack is optimized for validation, local storage,
query indexing, and deterministic profile selection. Official game content is
never embedded in the public application or repository.

The current wire format is `4ecb-content-pack`, format version `1`. A `.4ecp`
file is canonical UTF-8 JSON followed by one newline, normally compressed as a
deterministic gzip stream. Readers identify gzip by the `1f 8b` magic bytes, so
the extension is advisory.

## Top-level representation

```text
ContentPack
├── format: "4ecb-content-pack"
├── manifest
├── entities[]
├── rejected[]
├── rawTopLevel[]
└── diagnostics[]
```

The manifest identifies the logical profile (`packId`, display `name`, game
system, and source key), declares the format version, counts records by type,
accounts for every input record, summarizes diagnostics, and contains a SHA-256
content digest. The digest covers every logical field except the digest itself;
it does not depend on gzip container bytes or the output filename.

Each normalized entity preserves:

- stable ID, name, open-ended type, source, revision date, and ordered original
  attributes;
- ordered categories and repeated `specific` fields;
- prerequisites, printable prerequisites, flavor, main text, and normalized
  rule statements;
- provenance and diagnostics;
- unknown attributes and extension nodes required for forward compatibility.

Rejected input records are retained with their reason instead of disappearing.
Unrecognized top-level XML is retained in `rawTopLevel`. The accounting invariant
is `topLevelRecords = acceptedRecords + rejectedRecords`; warnings are a subset
of accepted records and are reported independently.

## Determinism and validation

The streaming XML parser preserves source order. The builder emits properties in
a fixed construction order and does not include timestamps. Given byte-equivalent
logical input and identical build options, both canonical JSON and gzip output
must be byte-identical. Validation recomputes the digest, record/type counts,
accounting invariants, required identity fields, and case-insensitive unique IDs.

`packId` is a stable profile identity, not a content hash. Importing the same ID
and digest is idempotent; importing the same ID with a different digest is
rejected rather than silently replacing a profile. Later profile-update UX must
make replacement or migration explicit.

## Compatibility policy

Readers reject unsupported format versions. Any future incompatible shape gets
a new integer version and an explicit migration; version 1 semantics will not be
silently reinterpreted. Additive fields may be introduced only when version 1
readers can safely ignore them. Character documents refer to a profile identity
and digest, not to the current globally active pack.

Use `pnpm content-tool inspect`, `validate`, and `diff` to diagnose packs. The
implementation types are in `packages/content-pack`; this document is the stable
human-facing contract.
