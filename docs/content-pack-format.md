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

## Layered profiles

A profile is an ordered list of exact `(packId, contentDigest)` references plus
the `last-pack-wins-v1` resolution policy. Entity IDs resolve from first to
last; a later definition replaces an earlier definition with the same stable ID
and produces a collision diagnostic. The result is materialized as a locally
verified pack whose digest binds the complete resolution. Characters retain
that materialized identity, ordered source references, and policy. Existing
single-pack settings migrate as one-layer profiles.

Runtime configuration may advertise an ordered server baseline. Verified bytes
are cached in IndexedDB, while imported personal packs remain above the baseline
and never upload. Download/import changes availability only; profile activation
and character migration remain explicit.

## Campaign documents

A campaign (D116) is a DM's house-rule content and restrictions as a portable
document, layered over the server's packs for the characters that belong to
it. A `.4ecc` file is canonical UTF-8 JSON followed by one newline, gzip
optional (identified by magic bytes, as for `.4ecp`):

```text
CampaignDocument
├── format: "4ecb-campaign", version: 1
├── campaignId          1-32 pack-ID characters
├── name                pack-name rules
├── revision            integer 1..999,999; the DM bumps it on every change
├── restrictions
│   ├── ids[]           record IDs not offered (legacy Restricted)
│   └── types[]         { type, allow: "campaign-only" }
├── houseRules          an embedded ContentPack, packId campaign.<id>.r<revision>
├── legacyHouseRulesXml the DM's RulesElement XML verbatim, for legacy export
└── contentDigest       SHA-256
```

The digest covers every other field, in that order, with the overlay standing
in as its own manifest digest; the overlay pack verifies itself. A campaign's
identity is `(campaignId, contentDigest)`; `revision` orders its versions, and
a store refuses the same ID and revision with a different digest.
`buildCampaign` sorts restricted IDs and type rules ignoring case, so the
digest does not depend on how they were listed; IDs and types must be unique
ignoring case.

`decodeCampaign` reads at most 16 MiB of input and 16 MiB decoded (streaming,
before parsing), then checks the shape with counts before contents: at most
10,000 house-rule records, 50,000 restricted IDs, 32 type rules and 8 MiB of
legacy XML. It then validates (identity, revision, overlay pack ID, the
overlay's own validation and both digests) and throws on any error.

`composeCampaignProfile(basePacks, campaign, options)` composes
`[...basePacks, campaign.houseRules]` with `last-pack-wins-v1` and resolves
the restrictions against the composed records: an ID rule matches ignoring
case (in the composed record's spelling; an ID with no record is kept as
listed, for legacy round trips), and a type rule restricts every record of
that type whose ID the house rules do not supply, so an overlay record that
replaces a stock ID is campaign content. Type rules are resolved again on
every composition, so records in later server revisions are covered. The
materialized pack carries an optional top-level field:

```text
campaign: { campaignId, revision, contentDigest, restrictedIds[] }
```

It is part of the pack digest only when present, so every pack without it
keeps its digest. Restricted records stay in the pack; the rules engine
declines to offer them. A materialized campaign profile is never a base layer
of another.

`pnpm content-tool campaign build` writes a `.4ecc` from a `campaign.json`
manifest and house-rule XML, `campaign inspect` prints one, and
`advertise-campaign` hosts it (`docs/public-deployment.md`); the browser stores
installed documents as described in `docs/architecture.md` (Browser
persistence).

## Compatibility policy

Readers reject unsupported format versions. Any future incompatible shape gets
a new integer version and an explicit migration; version 1 semantics will not be
silently reinterpreted. Additive fields may be introduced only when version 1
readers can safely ignore them. Character documents refer to a profile identity
and digest, not to the current globally active pack.

Use `pnpm content-tool inspect`, `validate`, and `diff` to diagnose packs. The
implementation types are in `packages/content-pack`; this document is the stable
human-facing contract.

## Browser onboarding

**Content settings** accepts either a portable `.4ecp` or a decrypted/merged
`.dnd40.xml` file. Portable packs are decoded and digest-validated in a worker.
Legacy rules XML is parsed and normalized in the worker, assigned the local
profile ID and name entered by the user, encoded as a compressed pack, validated,
and only then committed to IndexedDB. A 128 MiB input cap applies before a
worker receives either format, and streaming gzip decode stops once output
exceeds 128 MiB before JSON parsing. The known complete local corpus is roughly
70 MiB decoded, leaving headroom without accepting unbounded expansion. The
runtime decoder then validates every manifest count, diagnostic, entity,
specific field, rule statement, preserved node, extension, rejection, and
provenance field before digest validation or IndexedDB storage. It accepts at
most 100,000 records and 100 preserved-node nesting levels; the known corpus has
38,339 records.

IndexedDB schema 5 stores encoded pack payloads separately from a small
manifest/origin projection used by settings and startup listings. Public
decoded-object and encoded-byte installation APIs always validate before their
atomic payload/projection write. Import workers and same-origin advertised-pack
downloads may use the internal storage seam only through an artifact created by
decoding and validating those exact bytes (and, for advertised packs,
configured ID/digest comparison); the seam is not exported from the root
storage API. Generated legacy packs encode first and then decode/validate that
exact artifact once.

The web application installs portable `.4ecp` packs only (D082, superseding
D021's browser rules-XML and directory onboarding). It deliberately does not
parse rules XML, open encrypted official containers, import decryption keys,
follow update URLs, or merge loose `.part` files. Those operations remain in
the project-local Nix content-tool workflow; its private `.4ecp` output is the
portable onboarding path.
