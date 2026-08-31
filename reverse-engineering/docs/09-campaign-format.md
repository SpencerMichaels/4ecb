# Campaign setting format (`.dndcamp`)

Campaign settings are standalone XML fragments and are also embedded directly in
`.dnd4e` files:

```xml
<D20CampaignSetting name="Example Campaign">
  <Restricted>
    <ID_EXAMPLE_FORBIDDEN />
  </Restricted>
  <Houserules>
    <RulesElement name="Example" type="Feat" internal-id="ID_EXAMPLE_CUSTOM" .../>
  </Houserules>
</D20CampaignSetting>
```

`name` is display metadata. The only recovered child containers are `Restricted`
and `Houserules`; unknown direct children make the legacy campaign parser fail and
should be retained with a diagnostic by a modern importer.

## `Restricted`

Each empty child normally uses the restricted record's internal ID as the **XML
element name**, an unusual but confirmed encoding. The loader decodes the child tag
and looks up that exact ID in the current rule database; missing IDs are ignored
(the internal restrict operation treats null as a no-op). Order is preserved on
save but has no evaluation meaning.

The loader also accepts a child named `RulesElement` with ordinary character-style
identity attributes, resolving by ID then `(name,type)`. This form is preferable in
a new internal representation, but emit the legacy ID-as-tag form for maximum old
builder compatibility.

Before using an ID as an XML name, the original writer substitutes:

| Character | Serialized token |
|---|---|
| `(` | `_LPAREN_` |
| `)` | `_RPAREN_` |
| `'` | `_APOS_` |

The loader performs the inverse substitutions. One supplied LFR campaign predates
or bypasses this escaping and contains literal parentheses in element names (for
example a Rod of Seven Parts internal ID), making the file not well-formed XML 1.0.
The legacy custom parser is lenient enough to consume such tag tokens. A compatible
importer should offer a narrowly scoped repair pass inside `Restricted`: replace
those three illegal characters in start/end tag names with the tokens above, record
that repair, and retain the original bytes. Do not use a generally lenient XML
parser for all files.

## `Houserules`

Children are full serialized `RulesElement` definitions. They are stored in the
workspace's rule database for this campaign, marked custom/house-rule, and can be
selected like normal content. Removing or switching campaign unlinks them from the
database. Identity resolution prevents a custom definition from overwriting an
existing official `(name,type)` unintentionally.

The writer uses the same element serializer as character occurrences in a mode
that includes the definition necessary to recreate the custom record. Preserve
unknown fields/rules and evaluate the standard nine-statement language.

## Runtime effect

Restricted records remain in the content catalog but are excluded from legal
choices, valid power/weapon combinations, and other eligibility checks. An already
selected restricted record is retained and becomes illegal/explainable. Campaign
house rules remain usable but cause house-rule legality where appropriate.

Loading a campaign triggers a complete character update. Importing a campaign from
a character temporarily loads that character, extracts/relinks its setting, then
restores the current workspace—another reason campaign policy must be independent
of derived character caches.
