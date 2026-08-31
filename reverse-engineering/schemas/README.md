# Compatibility schemas

The Relax NG schemas are deliberately **structural smoke schemas**, not closed
content models. Both legacy ecosystems are extension-friendly: record types,
`specific` names, character wrappers, and custom nodes are open-ended. Rejecting
unknown content would be less compatible than the original parser.

Validate with the pinned environment:

```sh
nix develop path:./reverse-engineering --command \
  xmllint --noout --relaxng reverse-engineering/schemas/d20rules.rng FILE

nix develop path:./reverse-engineering --command \
  xmllint --noout --relaxng reverse-engineering/schemas/d20character.rng FILE
```

Semantic validation—unique IDs after merge, required statement attributes,
reference resolution, graph links, and choice alignment—belongs in the importer
and evaluator. The exhaustive observed attribute catalogs are in `../generated/`.

`d20campaign.rng` validates well-formed campaign files. One supplied LFR campaign
contains literal parentheses in XML tag names and intentionally fails any conforming
XML validator; the exact compatibility repair is documented in
`../docs/09-campaign-format.md`.
