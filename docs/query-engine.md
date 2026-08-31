# Compendium query engine

## Contract

`@4ecb/query-engine` owns a versioned, serializable query AST and the current
physical index. UI code, saved searches, future builder choice dialogs, and the
worker protocol depend on the AST rather than index internals.

A version 1 query contains:

- text terms and quoted phrases;
- include/exclude values for typed facets;
- numeric ranges named by normalized field;
- an optional relationship target;
- a sort key and direction; and
- a bounded offset/limit page.

Supported typed facets are type, source, tier, usage, action, keyword, item slot,
rarity, class, race, ability, and category. Values within one included facet are
ORed; different facets and ranges are ANDed; any excluded value rejects the
record. Facet counts ignore their own active filter so users can build genuine
multi-select queries. ID-valued facets such as class and legacy categories are
resolved to record display names without changing authoritative stored fields.

Text is Unicode-normalized, case-insensitive, and tokenized without stemming.
Every term must occur. Quoted phrases must occur in normalized contiguous text.
The index covers identity, source, categories, flavor, prerequisites, main text,
specific fields, rule names/attributes/text/nested nodes, and preserved extension
text. Name matches receive greater relevance weight than body matches.

Sorting by relevance, name, type, level, or source always uses name and stable ID
as deterministic tie breakers. Missing numeric levels sort after known levels in
both directions. Page limits are confined to 1-200 records.

## Relationships

The index resolves stable IDs found in attributes, categories, specific values,
prerequisites, and rules. Detail pages expose sorted outbound and inbound edges.
The `relatedTo` predicate returns the union of both directions. It is evidence of
content relationships, not yet a semantic interpretation of rule execution;
M4's rules engine will add evaluated grant and choice context.

## Worker and persistence behavior

The browser query worker reads the active encoded pack directly from IndexedDB,
decompresses it, and constructs the index without blocking React. Changing page
or active profile terminates construction safely. A tab restart reconstructs the
rebuildable index from the immutable stored pack; no user record owns index data.

Compendium routes use `#/compendium?...`, and entity pages use
`#/compendium/entity/:id?...`. Fragment state is never sent in the HTTP request.
Saved searches store only a label and serialized query in local storage; they do
not copy entity text or the private pack.

## M2 performance budgets and evidence

The benchmark command is:

```sh
pnpm benchmark:query PACK.4ecp
```

For a full corpus (at least 30,000 records), automated thresholds are:

| Operation                                  |    Budget |
| ------------------------------------------ | --------: |
| Worker index construction                  | 10,000 ms |
| Unfiltered 38k-record stable sort/faceting |    750 ms |
| Representative filtered/text query         |    150 ms |

On the 2026-08-31 development host with 38,339 records, the final release-gate
run was approximately 4,978 ms to construct the index, 456 ms for the
deliberately worst-case unfiltered query, 0.4 ms for two-term relevance search,
57 ms for combined power/usage/level filters, 36 ms for a broad phrase, and 80
ms for a source include/exclude query. Browser measurements were consistent:
construction was roughly 4.0-4.5 seconds and common filtered searches reported
1 ms or less.

The 10-second construction and 150/750-millisecond interaction limits are the
conservative desktop/tablet alpha budgets. A physical-device matrix remains part
of the M5 supported-browser release pass; crossing these budgets earlier blocks
the relevant milestone and requires a persisted or precompiled index evaluation.
