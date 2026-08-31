# Evidence, scope, and confidence

## Supplied evidence

The analysis covers the full supplied directory, principally:

- `CharacterBuilder/CharacterBuilder.exe` and every adjacent managed assembly;
- the mixed C++/CLI `D20RulesEngine.dll` and its recovered method bodies;
- `CBLoader/Cache/combined.dnd40.encrypted`, a prior CBLoader-patched encrypted
  snapshot, the extracted official XML, and the current final merged XML;
- all 42 supplied `.part` files and both copies of `WotC.index`;
- nine sample `.dnd4e` characters and two `.dndcamp` campaign files;
- the public CBLoader source pinned at commit
  `669630abccc07407f5436f6639c562afbee8bdc8`.

The assemblies were decompiled with ILSpy 9.1.0.7988 in the project-local Nix
environment. `D20RulesEngine.dll` is mixed-mode, so ILSpy recovers the native
logic as a very large synthetic `-Module-.cs`; names and control flow are useful,
but some native constant references remain anonymous. Those constants were
resolved against UTF-16 strings in the binary and the XML corpus where necessary.

## Confidence labels

- **Confirmed**: read directly from executable code or CBLoader source and
  corroborated by data.
- **Observed**: present in every relevant supplied sample, but a more permissive
  parser may accept additional forms.
- **Inferred**: the strongest explanation of code/data behavior; should receive a
  focused differential test when a runnable Windows harness is available.

Unless explicitly marked otherwise, normative statements in these documents are
confirmed. Counts and enumerations describe this corpus, not necessarily every
third-party extension ever authored.

## Corpus measurements

The official decrypted database has 27,240 `RulesElement` records; the supplied
CBLoader merge has 38,339. The official record-type distribution begins with
8,240 powers, 8,190 magic items, 3,112 class features, 3,077 feats, 622
backgrounds, 490 paragon paths, 311 rituals, 238 proficiencies, and 190 weapons.
The exhaustive distribution is in
`../generated/profiles/game-data-original.json`.

Official executable-rule counts are: 12,584 `statadd`, 9,280 `grant`, 1,738
`modify`, 1,687 `suggest`, 1,013 `textstring`, 668 `select`, 303 `replace`, ten
`statalias`, and four `drop` statements.

The recovered reference merger was run over the official base plus all 42 parts.
Its output semantically matches the supplied current merge for all 38,339 records,
all raw top-level elements, attributes, ordered fields, rule nodes (including the
15 records with meaningful text inside `rules`), and main text. The comparison is
reproducible with `scripts/merge_parts.py` and `scripts/compare_rulesets.py`.

## Limitations and next empirical step

The supplied engine is an x86 Windows mixed-mode C++/CLI binary and cannot be
executed directly in the Linux analysis environment. Static recovery is unusually
complete, and saved derived data supplies many test oracles, but absolute parity
should ultimately be checked by a small Windows differential harness: load the
same rules and character in both engines, then compare choices, legality, tally,
stats, powers, and serialized output after each edit.

No network service or live update endpoint is required for the new application's
core operation. URLs in indexes are legacy distribution metadata and should be
treated as untrusted inputs.
