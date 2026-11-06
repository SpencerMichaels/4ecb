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
- optional `aliases`: other names the record is known by (D116 amendment,
  below), present only when non-empty;
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
├── format: "4ecb-campaign", version: 3 (1 and 2 still read)
├── campaignId          1-32 pack-ID characters
├── name                pack-name rules
├── revision            integer 1..999,999; the DM bumps it on every change
├── restrictions
│   ├── ids[]           record IDs not offered (legacy Restricted)
│   └── types[]         { type, allow: "campaign-only" }
├── patches[]           { id, field, expect, value } | { id, rule }; version 2+
│                       (rule patches and "prerequisites" from version 3)
├── houseRules          an embedded ContentPack, packId campaign.<id>.r<revision>
├── legacyHouseRulesXml the DM's RulesElement XML verbatim, for legacy export
└── contentDigest       SHA-256
```

The digest covers every other field, in that order, with the overlay standing
in as its own manifest digest; the overlay pack verifies itself. A campaign's
identity is `(campaignId, contentDigest)`; `revision` orders its versions, and
a store refuses the same ID and revision with a different digest.
`buildCampaign` sorts restricted IDs, type rules and patches ignoring case,
so the digest does not depend on how they were listed: patches by ID, a
record's field patches (by field) before its rule patches, which keep the
order authored because each sees the record the earlier ones left. IDs,
types and field patch (ID, field) pairs must be unique ignoring case.

**Versions.** `buildCampaign` writes version 3, which always carries
`patches` (possibly empty). A version-1 document has no `patches` field and
reads as having none; its digest input has no `patches` key, so version-1
documents (installed, in backups, hosted) keep their digests and load
unchanged. A version-2 document carries field patches only (no rule patches
and no `prerequisites` field, both refused there); each serializes in the
digest exactly as before, so version-2 documents keep their digests too.
Each version exists because the previous reader would misread the next: a
version-1 reader would ignore patches, and a version-2 reader would refuse
rule patches as malformed and treat a `prerequisites` patch as a specific
of that name; such readers refuse the newer document as an unsupported
version.

**Record aliases.** `ContentEntity.aliases` lists other names a record is
known by ("Also known as"), for a same-thing rename (Deva → Aasimar,
Supernal → Celestial); a different deity that should meet another's
requirements stays a counts-as record. It is part of an entity, and so of
the pack digest, only when present: records without aliases, and so every
stock pack, keep their digests. Validation: 1-32 aliases, each 1-120
trimmed characters without control characters, none repeating another or
the record's name ignoring case. Aliases come from two places. A `name`
field patch keeps the record's stock name as an alias (and drops the new
name from its aliases, if it was one). A house-rule or part record may
author them as a specific named `Also Known As` (comma-separated, matched
ignoring case and surrounding space): the D20Rules parser (legacy-wotc
`parser.ts`, shared by `content-tool build`, `campaign build` and the
browser's legacy house-rules path) consumes the field into `aliases` at
pack build, trimmed and deduplicated, dropping names the format can't hold
with a `record.aliases-dropped` warning. The legacy house-rule XML a
campaign keeps for export still carries the field verbatim, which the old
builder shows as an ordinary field. Name lookups match an alias as the
record's own name (`docs/rules-engine.md`); the builder's reference cards
show "Also known as: …" first, and the builder tables, Shop and
query-engine full-text index search aliases. A displayed prerequisite line
names a renamed record by its current name where the rule text resolves
the old name to it, keeping the line's wording; prose is never changed.
Nothing is stored for this: the rules engine derives the lines per
content set (`docs/rules-engine.md`, prerequisite display).

**Field patches.** A patch changes one field of a record the campaign does not
supply, so the record's other fields keep following server revisions (a
whole-record override would freeze them). `field` is `"name"` (the record's
name), `"prerequisites"` (the record's `<Prereqs>` line; version 3: an
empty `expect` means it has none, an empty `value` removes it) or a
specific's name (`Languages`, `Short Description`; matched ignoring case
and surrounding space); other top-level fields (description, flavor,
categories) are not patchable, and rules change through rule patches
(below). `expect` is the value the DM saw and `value` the campaign's. Limits: at most 10,000 patches; a field name of 1-120
trimmed characters that does not start with `_` (stored IR such as
`_Power Text IR` is built from the content and never patched); `expect` and
`value` at most 4,000 characters without control characters other than tab
and newline; `value` differs from `expect`; a name is never empty. A patch
on a record the campaign's own house rules supply is a build and
validation error: the DM edits that record instead.

**Rule patches** (version 3). A rule patch `{id, rule}` changes a record's
rule elements (`rules`: grant, select, statadd, textstring, modify… with
their attributes) the same way, so a campaign that only changes what a
record grants or offers needs no copy. `rule` is one operation, exactly
one of:

```text
{ "match": M, "count": N, "set": { "name": "ID_NEW" } }
{ "match": M, "count": N, "replaceId": { "from": "ID_OLD", "to": "ID_A|ID_B" } }
{ "match": M, "count": N, "replaceWith": E }
{ "match": M, "count": N, "remove": true }
{ "add": [E, …] }
{ "add": [E, …], "before": M }      or      "after": M
```

`M` is `{name, attributes?: {name: value}}`: rule elements named `name`
that carry every listed attribute with that value (element and attribute
names and values compared ignoring case; unlisted attributes are not
compared). `E` is a rule element `{name, attributes: {name: value},
text?}` (attributes in order; `text` is the element's inner text, such as
a select's prompt). `set` sets attributes on each matched element (added
when absent); `replaceId` replaces a whole token (an ID or list entry,
bounded by anything but letters, digits, `_` and `-`, so
`ID_FMP_LANGUAGE_1` never touches `ID_FMP_LANGUAGE_18`) in every
attribute value of each matched element, and an element matches only when
a value contains it; `replaceWith` replaces each matched element in place;
`remove` deletes it; `add` inserts its elements after the record's last
rule, or before or after the one element its `before` or `after` anchor
matches. Rule ordinals are renumbered to positions afterwards, as the
parser numbers them. Positions matter: a character's saved state keys a
granted element's occurrence by its rule's ordinal
(`<parent>:grant:<ordinal>`, and a saved grant holds its slot so the
evaluator does not grant that slot again), and a select's choices by the
select's ordinal, so a patch replacing a full copy that characters were
built on must reproduce the copy's order, which anchored adds do. For example (Pathfinder's Orc and Fey-Minded):

```text
{ "id": "ID_INTERNAL_GRANTS_ORC",
  "rule": { "match": { "name": "grant",
                       "attributes": { "name": "ID_FMP_LANGUAGE_19", "type": "Language" } },
            "set": { "name": "ID_4ECB_PF_LANGUAGE_ORCISH" } } }
{ "id": "ID_FMP_FEAT_2728",
  "rule": { "match": { "name": "select", "attributes": { "type": "Language" } },
            "replaceId": { "from": "ID_FMP_LANGUAGE_4", "to": "ID_4ECB_PF_LANGUAGE_SYLVAN" } } }
```

The match is the drift guard: an operation applies only when exactly
`count` (default 1; 1-1,000) elements match, so a server revision that
changed the element leaves the record's rules as the server has them.
`add` takes no match or count and applies only while none of its elements
(same name and the same attributes, ignoring case) is on the record
already and, when anchored, exactly one element matches the anchor (none
is `no-match`, several `ambiguous`). A record's rule patches apply in order, each to the record the
earlier ones left. Limits: element and attribute names of 1-120
characters (a letter, then letters, digits, `_`, `.`, `:` or `-`), at
most 64 attributes per match, `set` or element, attribute values and text
of at most 4,000 characters without control characters other than tab
and newline, at most 100 elements per `add`, and the shared 10,000
patches. An operation must change something (`set` values differing from
the match's, `replaceId` from ≠ to), and one on a house-rule record is a
build and validation error.

`decodeCampaign` reads at most 16 MiB of input and 16 MiB decoded (streaming,
before parsing), then checks the shape with counts before contents: at most
10,000 house-rule records, 50,000 restricted IDs, 32 type rules, 10,000
patches and 8 MiB of legacy XML. It then validates (identity, revision,
patches, overlay pack ID, the overlay's own validation and both digests) and
throws on any error.

`composeCampaignProfile(basePacks, campaign, options)` composes
`[...basePacks, campaign.houseRules]` with `last-pack-wins-v1`, then applies
the patches to the composed records (`applyCampaignPatches`): a patch applies
only when its record exists (ID ignoring case), the field occurs on it exactly
once, and its current value is exactly `expect`. Otherwise the record keeps
the server's value and the composed pack gets a `warning` diagnostic with
code `campaign.patch-not-applied` (target missing, field missing, field
repeated, or "the content has X, the patch expects Y"); composition never
fails over a patch. An applied `name` patch keeps the stock name as an
alias (`renamedEntity`, content-domain `aliases.ts`). It then applies the
rule patches (`applyCampaignRulePatches`): one that does not apply (record
missing, no element matches, a different number matches than `count`, or
an `add` element already present) leaves the record's rules as composed
and records a `warning` with code `campaign.rule-patch-not-applied` naming
the operation and the elements found. Patching does not re-run pack-build
parses: a patched field's stored IR is not rebuilt (hence no `_` fields).
Stored `_Prerequisite IR` is never stale: a campaign composition always has
at least two layers, and `composeContentPacks` drops stored prerequisite IR
from every record of a multi-layer pack, so the engine parses a patched
`prerequisites` line, and any prerequisite that names a patched rule's IDs,
against the composed records. Rule patches touch no specific, so the other
stored IR (`_Power Text IR`, `_Note Values IR`) is unaffected. It then
resolves
the restrictions against the patched records: an ID rule matches ignoring
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
persistence). Patches are authored in `campaign.json` as
`patches: [{id, field, expect, value} | {id, rule}]`, not in the house-rule
XML, which is the legacy `Houserules` block (RulesElement records only,
exported verbatim). `campaign build --against PACK.4ecp` lists every field
patch with its status (`applies`, `target-missing`, `field-missing`,
`field-ambiguous`, or `stock-differs` with the pack's `current` value beside
`expect`) and, under `rulePatches`, every rule patch in order with its
`operation`, status (`applies`, `target-missing`, `no-match`, `ambiguous`,
`present`) and the `matched` elements as XML, for example:

```text
{ "id": "ID_INTERNAL_GRANTS_ORC",
  "operation": "set name=\"ID_4ECB_PF_LANGUAGE_ORCISH\" on <grant name=\"ID_FMP_LANGUAGE_19\" type=\"Language\" />",
  "status": "applies",
  "matched": ["<grant name=\"ID_FMP_LANGUAGE_19\" type=\"Language\" />"],
  "rule": { … } }
```

It warns on each patch that would not apply: the drift guard to run against
each new server pack. Under `prerequisiteRenames` it counts the displayed
prerequisite lines that name a renamed record by its current name
(`renamedLines`) and lists, with a warning each, every line that keeps an
old name because the rules engine could not swap it safely (`unchanged`:
ID, record name, line, old name, occurrences and resolved references;
rules-engine `prerequisiteDisplayLines`). `campaign inspect` prints the version, `patches` (field
patches) and `rulePatches` counts. Legacy export drops patches of both kinds
silently (the `D20CampaignSetting` block cannot express them) and legacy
import creates none. The invite page's summary shows the counts ("Changed
fields", "Changed rules").

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
