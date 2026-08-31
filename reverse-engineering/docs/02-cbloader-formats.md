# CBLoader extension, index, cache, and encryption formats

This behavior is confirmed from the pinned CBLoader source and the supplied cache.

## Part discovery and precedence

CBLoader recursively discovers `*.part` files beneath configured directories and
orders them by `FileInfo.Name` (the basename), using the platform's normal string
ordering. It starts with the official encrypted database, then processes parts in
that order. For reproducibility, a new implementation should define ordinal,
case-insensitive basename order and report basename collisions rather than depend
on filesystem enumeration.

Each part is an XML document rooted at `D20Rules`. Top-level operations are matched
case-insensitively.

## Whole-record replacement: `RulesElement`

A top-level `RulesElement` creates or replaces the record with the same exact
`internal-id`. Its accepted record attributes are `name`, `type`, `internal-id`,
`source`, and `revision-date`. The whole mixed body is the new value.

## Incremental mutation: `AppendNodes`

```xml
<AppendNodes internal-id="ID_TARGET">
  ...record attributes and child fragments...
</AppendNodes>
```

If the target is absent, an empty record is created. Supplied allowed attributes
are added/overwritten. Child behavior is:

- `Category`: split on commas, trim, union into the target category set;
- `rules`: append each contained rule in order;
- `specific`, `Prereqs`, `print-prereqs`, and `Flavor`: append as root fields;
- meaningful mixed text: append to main text, separated by a newline.

This is append, not an upsert by `specific/@name`; duplicates are meaningful.

## Fan-out mutation: `MassAppend`

```xml
<MassAppend ids="ID_ONE, ID_TWO"> ...fragments... </MassAppend>
```

The comma-separated IDs are trimmed. Fragments are appended only to already
existing targets. Container attributes are not copied into targets.

## Selective removal: `RemoveNodes`

`RemoveNodes internal-id="…"` acts only on an existing target. Its children are
commands:

| Child | Effect |
|---|---|
| `Category` | Clear every category, regardless of child body. |
| `specific name="X"` | Remove every field with exactly that name. |
| `Prereqs` | Remove all prerequisite fields. |
| `print-prereqs` | Remove all printable-prerequisite fields. |
| `Flavor` | Remove all flavor fields. |
| `MainText` | Remove the record's mixed main text. |
| `Attribute name="X"` | Remove record attribute `X`. |
| `rules` | Remove all executable rules. |

Field-kind matching is case-insensitive in source. `specific/@name` removal uses
the stored name comparison in the merger; preserve exact names to avoid surprises.
Unknown removal commands produce warnings.

## Deletion and raw nodes

- `DeleteElement internal-id="…"` removes the entire logical record.
- `AppendRawElements` preserves each child verbatim in a raw top-level list. Raw
  nodes are emitted after all logical `RulesElement` records.
- top-level `Changelog` and `UpdateInfo` are metadata and do not enter the merged
  rule database.

## `.part` update metadata

A part may include:

```xml
<UpdateInfo>
  <Version>...</Version>
  <Filename>...</Filename>
  <PartAddress>...</PartAddress>
  <VersionAddress>...</VersionAddress>
  <V2Address>...</V2Address>
  <Description pin="True" category="...">...</Description>
</UpdateInfo>
<Changelog>...</Changelog>
```

`VersionAddress` is the legacy version endpoint. `V2Address` is the newer shared
version listing. `Filename` is deprecated/checking metadata; `PartAddress` is the
payload URL. These values are untrusted distribution input and must never be used
without HTTPS, size limits, path confinement, and XML hardening.

## `.index` (`PartIndex`)

An index is XML rooted at `PartIndex` and can contain:

- `UpdateInfo`: metadata for the index itself;
- `Redirect from="…" to="…"`: URL-prefix migration;
- `Part`: a `Filename` plus `PartAddress`; downloaded `.part` references may
  recursively introduce more parts;
- `Obsolete` containing `Filename`: local files to retire.

The supplied `WotC.index` is version 3.1. Filename validation is security-critical:
reject absolute paths, separators, traversal, device names, and writes outside a
dedicated import directory. Disable DTDs and external entities in every XML reader.

## Merge cache state

CBLoader XML-serializes a `MergeInfo` containing its assembly version, encryption
metadata, and for each input the filename and `LastWriteTime`. Exact equality
allows reuse of the merged cache. This is not a portable content-addressed cache.
A replacement should use hashes of canonical input bytes plus merger version and
ordered provenance, while still being able to read legacy `merge_state.xml`.

## Encrypted official container

The legacy encrypted-container format (including the supplied
`combined.dnd40.encrypted`) is:

```text
offset  size  meaning
0       16    .NET Guid.ToByteArray() update/key identifier
16      ...   AES-CBC-PKCS7 ciphertext
```

Decrypt ciphertext using AES-CBC with the resolved key and IV equal to the first
16 bytes of `.NET Guid.ToByteArray()` for application GUID
`2a1ddbc4-4503-4392-9548-d0010d1ba9b1`. PKCS#7-unpad the plaintext, then GZip
decompress it to UTF-8 `D20Rules` XML. Encryption performs the inverse: GZip, AES,
then prefix the update GUID bytes.

The supplied encrypted file is not byte-identical to
`combined.dnd40.original.xml`: decrypting it yields a 37,406-record, CBLoader-marked
merged snapshot from a prior run, while `original.xml` is the separately extracted
27,240-record official base and `merged.xml` is the current 38,339-record merge.
This distinction is why compatibility tests must identify a container by content
digest/provenance rather than infer that every file named `combined...encrypted`
is pristine official input.

.NET GUID byte layout is mixed-endian: the first 4-byte, 2-byte, and 2-byte fields
are little-endian; the remaining eight bytes retain display order. Do not write the
16 bytes obtained by simply stripping hyphens from the textual GUID.

### Key resolution

CBLoader can obtain keys from:

1. protected Windows registry entries (DPAPI `LocalMachine`) using entropy bytes
   `19 25 49 62 0c 41 55 1c 15 2f` (hex);
2. `HeroicDemo.update` application XML;
3. `CBLoaderKeyStore` XML in namespace
   `http://cbloader.github.io/CBLoader/ns/KeyStore/v1`;
4. the base64 fallback key in `CharacterBuilder/RegPatcher.dat`.

The key-store root carries update-key entries whose `Id` is a GUID and whose text
is base64 key bytes, plus `WriteGuid` and `FallbackKey` values. Preserve unknown
entries for forward compatibility.

### Legacy integrity hash

The rules engine verifies a 32-bit DJB2-style hash over UTF-16 code units:

```text
h = 5381
for each UTF-16 code unit c:
    h = (h * 33 + c) mod 2^32
```

CBLoader normalizes the generated XML's BOM/newlines and appends a marker plus a
five-character preimage so the merged document reaches the demo engine's expected
hash. This is compatibility padding, not cryptographic integrity. A web engine
should accept and preserve it but use a real digest for its own cache validation.
