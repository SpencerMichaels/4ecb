# Legacy Character Builder visual language

## Purpose and evidence boundary

This report records the visual language recovered from the final desktop
Character Builder and Character Sheet Viewer. It is an implementation guide for
a modern interface that remains immediately recognizable as the 4E Character
Builder; it is not a direction to reproduce the legacy application's beveled
Windows chrome.

The findings come from these primary artifacts:

- `CharacterBuilder/CharacterBuilder.exe` and
  `CharacterBuilder/CharacterSheetViewer.exe`;
- the extracted BAML resource dictionaries and raster assets under
  `reverse-engineering/generated/decompiled/CharacterBuilder/` and
  `reverse-engineering/generated/decompiled/CharacterSheetViewer/`;
- recovered code in `Character_Builder.App`, `MainWindow`, `PowerDisplay`,
  `GearPageInfoPanel`, `ExpanderChoice`, and the Character Sheet Viewer's
  `PowerCard*` classes;
- direct dimensions and quantized-color samples of the extracted PNG assets.

Named WPF colors below use their standard sRGB values. Hex values found in code
or BAML are reproduced exactly. Texture colors are representative quantized
samples, not claims that a textured image is a single flat color.

Confidence terminology:

- **Exact** means a value or mapping is assigned directly by recovered code.
- **Recovered resource** means a value is serialized in the application's BAML
  resource dictionary and its role follows the adjacent resource declarations
  and runtime resource lookups.
- **Sampled** means the value is a dominant cluster measured from a raster
  asset.
- **Derived** means it is a recommendation for the modern product, not a legacy
  value.

## What makes the legacy builder recognizable

The durable visual identity is a combination of:

1. deep ink/navy framing around pale ice-blue, cream, and parchment work areas;
2. stable semantic colors for power usage and items;
3. dense, square-edged lists and information blocks, with colored title bars and
   thin separators rather than isolated floating cards;
4. compact check, house-rule, equipment, and attack-area symbols;
5. a practical sans-serif UI with occasional old-style serif display type;
6. a three-part working composition: navigation/summary, choices, and a
   persistent information viewer.

The large faux-metal borders, raster-sliced glossy buttons, leather-like tab
art, parchment noise, and drop shadows are period chrome. They should not be
copied literally. The semantic color, information density, and spatial grammar
should be retained.

## Exact semantic colors

### Power and item cards

The Character Sheet Viewer's `PowerCardPower.UpdatePowerCardPower`,
`PowerCard.Liner*`, and `PowerCardItem.UpdatePowerCardItem` establish the most
complete and unambiguous legacy mapping.

| Meaning | Legacy border/header | Legacy light liner | Evidence |
| --- | --- | --- | --- |
| At-will power | `DarkGreen` / `#006400` | `#AADDAA` | Exact |
| Encounter power | `DarkRed` / `#8B0000` | `#DDBBBB` | Exact |
| Daily power | `Gray` / `#808080` | `LightGray` / `#D3D3D3` | Exact |
| Utility power | `Navy` / `#000080` | `#BBBBDD` | Exact |
| Item, magic item, magic weapon, item set | `DarkOrange` / `#FF8C00` | `#FFE3CC` | Exact |

The orange mapping is an item identity, not necessarily the item's contained
power frequency. A magic-item card keeps its orange border, while an at-will,
encounter, or daily power found on the item may replace the liner tint with the
corresponding green, red, or gray liner. The modern UI should likewise be able
to express both dimensions: **item** as entity type and **usage** as frequency.

The builder's information viewer uses a less complete compact mapping in
`PowerDisplay.BrushForUsage`: at-will is `SeaGreen` (`#2E8B57`), encounter and
encounter-special are `DarkRed` (`#8B0000`), and other usages fall back to
black. That fallback is not evidence that utility and daily lack identities;
the sheet viewer explicitly assigns navy and gray to them.

Additional sheet-card identities are exact but secondary to the requested
builder theme:

| Meaning | Border/header | Liner |
| --- | --- | --- |
| Action point | `DarkRed` / `#8B0000` | `#DDBBBB` |
| Second wind | `Navy` / `#000080` | `#DDBBBB` |
| Character summary and skills cards | `Purple` / `#800080` | `#FF99FF` |

These secondary colors should be used only where the same concepts need a
compact visual label. Purple is not a general-purpose application accent.

### Builder shell and information surfaces

The main resource dictionary supplies the following palette. The names are the
legacy resource keys used by the recovered WPF code.

| Resource or role | Legacy value | Confidence |
| --- | --- | --- |
| `PHBBrush`, the principal rules/header navy | `#1D3D5D` | Recovered resource |
| `NeutralBrush` | `#DEDCCB` | Recovered resource |
| selected list state | `SteelBlue` / `#4682B4` | Recovered resource |
| alternate selection | `#8070A0` | Recovered resource |
| table/list resting row (`TableOff`) | `#D6D5C3` | Recovered resource |
| table/list alternating/active row (`TableOn`) | `#FFFFFF` | Recovered resource and runtime lookup |
| list/gradient neutrals | `#DAD9C6`, `#D5D4BF`, `#DEDCCB`, `#CECCBB` | Recovered resources |
| application fade/checker base | `#D5D4BF` and transparent | Exact code plus recovered resource |
| checkered detail tint | ARGB `#73CECCDB` | Exact code (`App.Checker1`) |
| dark header/wine accent | `#160000` | Recovered resource |
| hybrid informational headings | `#1F405D`; special rules `#5B2537` | Recovered BAML |
| familiar/companion heading | `#4E5E32` | Recovered BAML; code uses the near-identical `#4E5E33` |
| house-rule feat text | `Crimson` / `#DC143C` | Exact |

The extracted backgrounds reinforce this palette:

| Asset | Representative sampled colors | Intended impression |
| --- | --- | --- |
| `TileIce.png` | `#EEF2F6`, `#F1F4F8`, `#EBEFF5` | cool primary work canvas |
| `LightBlueTexture.png` | `#C6D6E1`, `#CAD9E3`, `#BBCEDB` | light blue supporting pane |
| `TileDkBlue.png` | `#202947`, `#212C4C`, `#1B243E` | deep navy shell |
| `TileBlue.png` | `#2F3C60`, `#313E65`, `#324168` | raised navy navigation |
| `DarkBlueTexture.png` | `#023052`, `#004366`, `#0C1F3D` | saturated blue title/splash area |
| `TileCream.png` | `#FBF1DD`, `#FBEDD8`, `#FAE9D0` | warm rules/detail surface |
| `SeamlessParchment.png` | `#F3E9D2`, `#F1E6CC`, `#EAD6B9` | character/document surface |
| `TileGreen.png` | `#CDD2C7`, `#D0D4CA`, `#C3C9BC` | subdued green contextual surface |

The old low-pane illustrations for class, race, powers, feats, skills, and
retraining are overwhelmingly cool neutral gray (`#9B9EA3` to `#CDD0D7`). They
do not establish separate semantic colors for those choice categories. Avoid
inventing a rainbow for every builder pane.

### Status and action imagery

Raster sampling confirms these additional cues:

- the 16 px valid-choice mark is a green tick centered near `#078D30`, with a
  gray variant for a subdued/unavailable state;
- the 15 px house-rule badge is a yellow-green **H** (`#ABA000`) inside the
  principal navy (`#1D3D5D`);
- coin, equip, and sell images use gold/yellow with near-black outlines;
- notes use an off-white parchment sheet with a near-black outline;
- delete is a neutral gray/black trash can rather than a red emoji;
- legacy primary action buttons are deep glossy blue; equipment/secondary
  buttons use gold; a prominent next action is orange. The sampled raster
  clusters include blue `#245293`, gold `#D8AF1D`, red `#9A0E0D`, and orange
  `#D85C08`/`#EE8723`.

Those button samples document hierarchy, not a requirement to reproduce gloss,
ornaments, or sliced-image borders.

## Typography

The builder resource dictionary embeds repeated `Tahoma` font-family values and
`Goudy Old Style` for display use. Recovered code typically uses 14–18 px for
major choice labels and headings, while `FancyHeader` uses a dense 12 px title
and 10 px right-side metadata. Most list and body text inherits the compact UI
style.

The Character Sheet Viewer explicitly creates a `Times New Roman` typeface for
card field measurement. Power-card body fields are commonly 8–10 px because
the printed cards have fixed dimensions (`233 × 321` legacy device pixels).
This is evidence for a compact print artifact, not permission to use 8 px text
in the interactive web UI.

Recommended modern stacks:

```css
--font-ui: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
--font-display: "Goudy Old Style", "Palatino Linotype", Palatino, Georgia, serif;
--font-sheet: Georgia, "Times New Roman", serif;
```

Use the UI stack for controls, lists, descriptions, values, and ordinary
headings. Use the display stack sparingly for the character name, page identity,
or a top-level section title. Reserve the sheet stack for a print template that
intentionally recalls the legacy paper/card style. Do not render whole builder
screens in a decorative serif face.

No legacy font file is embedded in the recovered application. Before bundling a
specific replacement webfont, choose one with an explicit redistributable
license; otherwise use the system stacks above.

## Icon inventory and modern treatment

### Functional inventory

The embedded builder assets establish these concepts:

- valid/selected choice: check mark;
- inactive or unavailable choice: subdued check;
- house rule: `H` house badge;
- buy/currency: coin;
- equip: pointing/equipping hand;
- notes: parchment/document;
- sell: currency coin;
- delete: trash can;
- library hierarchy: folder closed and folder open.

The Character Sheet Viewer adds four important 4E attack-area silhouettes:

- melee: sword;
- ranged: bow and arrow;
- close blast (`icon_spray`): a point projecting a wedge of arrows;
- area burst: arrows radiating from a central point.

`PowerCardPower.SetIconBoxes` combines those silhouettes with the parsed range,
blast, or burst number. Their meaning therefore must not be conveyed by shape
alone: expose an accessible text equivalent such as “Close blast 3.”

### Implementation guidance

- Use simple monochrome SVG icons at a 16, 20, or 24 px optical size. Let them
  inherit `currentColor`; semantic context supplies the hue.
- Prefer a small, consistent open-licensed subset (for example Font Awesome
  Free or another bundled SVG set) and add purpose-built blast/burst glyphs.
  Nerd Font code points are acceptable only if the corresponding font is
  reliably bundled; missing private-use glyphs are otherwise brittle.
- Preserve the silhouettes and meaning, not the legacy pixels. The extracted
  attack images are 28–64 px black rasters and the status/action images are only
  15–27 px; scaling them would look soft in a modern high-DPI interface.
- Always pair status icons with text or an accessible name. Color is a redundant
  cue, never the only legality/usage signal.
- Do not use emoji. Emoji introduce platform-dependent color and conflict with
  the compact monochrome visual language.
- Do not reuse the D&D/Character Builder logos, app icon, dragon art, or branded
  title imagery as ordinary UI decoration. They are not necessary to preserve
  the functional visual language and remain part of the proprietary legacy
  artifact.

## Geometry, density, and hierarchy

The legacy application defaults to `1024 × 768`. `MainWindow` sets the left
panel to 163 px and selects a context-sensitive right information column of 250,
375, or 500 px. The center is the active choice workspace. This is strong
evidence for the modern editor's existing timeline/choice/detail composition:

```text
navigation or character summary | active choices | persistent information
```

The exact fixed widths should not carry over. Preserve the proportions and
roles with responsive constraints: a compact navigation rail, a main column
that receives remaining space, and a readable sticky detail column around
`22–34rem` when the viewport permits. Collapse the composition progressively on
small screens.

Legacy layout code commonly uses 2–5 px spacing inside list rows, 5–10 px
between related blocks, and 10–20 px before a distinct stat section. Headers are
full width. Many choices are plain rows against alternating backgrounds, not a
stack of individually elevated cards. Even where the WPF templates use a
`CornerRadius`, it belongs to ornate floating-panel and button chrome; it is not
a pervasive card language.

Modern translation:

- group related decisions under a single full-width section bar;
- use compact rows with a 1 px divider or alternating low-contrast surface;
- mark selection with a 3–4 px semantic leading edge, stronger row fill, check
  icon, and type weight;
- give the currently inspected row a distinct focus/selection treatment and
  update one persistent detail pane;
- use square corners by default and at most a restrained 2–3 px radius where
  native form affordance benefits from it;
- use shadows only for true layering such as a menu, dialog, or sticky pane
  crossing content;
- avoid pill containers, rounded badges for ordinary metadata, nested bordered
  cards, large empty padding, and slow decorative animation;
- keep hover/press transitions around 80–140 ms and animate only state or
  spatial continuity.

## Proposed modern token palette

These are derived implementation tokens. The legacy values above remain the
evidence; these values adjust contrast and surface behavior for a contemporary
web application.

### Light

| Token | Proposed value | Derivation/use |
| --- | --- | --- |
| canvas | `#EEF2F6` | sampled ice workspace |
| surface | `#FFFFFF` | legacy active table surface |
| surface subdued | `#F5F3EA` | flattened neutral/parchment mix |
| surface warm | `#FBF1DD` | sampled cream detail surface |
| ink | `#191919` | legacy sheet proxy black |
| ink muted | `#596270` | cool readable secondary text |
| border | `#C9CFD7` | flattened cool legacy neutrals |
| border strong | `#9AA8B8` | section boundaries |
| brand/navy | `#1D3D5D` | exact principal legacy navy |
| shell deep | `#202947` | sampled dark shell texture |
| selection | `#315F89` | darker, accessible descendant of SteelBlue |
| focus | `#236FA1` | visible blue focus ring |

Use the exact legacy power/item colors for a narrow stripe, icon, or border.
For a solid title bar with normal-sized text, use an accessible darkened tone or
dark text rather than assuming white text works over every raw color. In
particular, raw `DarkOrange` needs dark text or a darker header companion.

Suggested solid-header companions are at-will `#006400`, encounter `#8B0000`,
daily `#595959`, utility `#000080`, and item `#9A4A00`. Suggested light row/card
tints are the exact liners `#AADDAA`, `#DDBBBB`, `#D3D3D3`, `#BBBBDD`, and
`#FFE3CC`, softened toward white when used over a large area.

### Dark

The legacy application contains no dark theme. This palette is deliberately
derived from its dark navy textures rather than made as a generic charcoal
theme.

| Token | Proposed value | Use |
| --- | --- | --- |
| canvas | `#111727` | darkest blue-black page |
| surface | `#182239` | main work surface |
| surface raised | `#202D49` | inspected/raised region |
| surface warm | `#29261F` | restrained warm detail surface |
| ink | `#F2F4F7` | primary text |
| ink muted | `#B7C1D1` | secondary text |
| border | `#34445E` | ordinary divider |
| border strong | `#51637C` | section/focus boundary |
| brand | `#7EAED2` | light descendant of PHB navy |
| selection | `#294F71` | selected row fill |
| focus | `#72C1F0` | visible focus ring |

Dark-mode semantic accents should remain clearly recognizable but be lighter
and slightly less saturated than the legacy borders: at-will `#63C37A`,
encounter `#F07474`, daily `#B8BEC7`, utility `#829BFF`, and item `#F2A73B`.
Use them as title text, a leading stripe, icon color, or a compact label against
the dark surface. For large tinted regions, mix the accent into the surface at
roughly 12–18% rather than filling the region with a luminous color.

Do not mechanically invert the light palette. Cream/parchment becomes a subtle
warm dark surface; navy becomes the spatial foundation; semantic hues retain
their established meaning. Test every foreground/background pairing to WCAG AA
and retain text/icon labels because red/green usage distinctions are not
color-blind-safe by themselves.

## Component-level application

### Application shell and navigation

Use the dark navy family for the global header and primary navigation in both
themes. Replace raster tabs with flat text-and-icon navigation. An active tab may
use a pale/raised surface and a strong navy or brand-colored rule; inactive tabs
remain integrated with the shell. Avoid separate rounded capsules for each tab.

### Timeline and choice lists

Use one continuous surface per level or logical group. Completed rows get a
green check and compact summary. Unresolved required rows get stronger weight
and the normal selection/attention accent; house-ruled rows get the **H** symbol
and explicit “House rule” text. Unavailable choices remain legible and visibly
disabled without borrowing the house-rule mark.

Power and item options get their semantic stripe/icon even in compact lists.
The type must also be printed (`At-will`, `Encounter`, `Daily`, `Utility`,
`Item`) so the color never carries meaning alone.

### Detail viewer and cards

Use a single sticky viewer with a square, colored header strip and a quiet body
surface. Preserve the legacy header grammar: strong name on the left, concise
level/type metadata on the right, flavor text immediately below, then compact
labeled rules rows. A power card should not become a large rounded dashboard
tile.

Use the full five-color mapping consistently in the builder, compendium, sheet
preview, print cards, and eventual play mode. Centralize entity-kind and usage
tokens so those surfaces cannot drift.

### Controls

Primary actions use the blue/navy family; equipment and item-affecting actions
may use gold/orange accents. Destructive actions use a trash icon plus explicit
label and conventional danger treatment, not the item/encounter red mapping by
itself. Inputs should be rectangular, compact, and visibly focused. Avoid glossy
gradients and ornamental end caps from the old sliced button images.

## Uncertainties and limits

- The BAML artifacts preserve resource names and values but were not recovered
  as original source XAML. Exact code assignments are stronger evidence than an
  association inferred from serialized resource ordering.
- The builder's compact information viewer intentionally colors only at-will and
  encounter power text; the complete five-way mapping comes from the separately
  shipped Character Sheet Viewer. The latter is the higher-confidence oracle
  for cross-surface semantic identity.
- Some extracted backgrounds and buttons include anti-aliased edges,
  transparency, highlights, and texture. Sampled dominant clusters should not
  be mistaken for source design tokens.
- Tahoma, Goudy Old Style, and Times New Roman are referenced by name, not
  embedded. Availability and redistribution are platform-dependent.
- The legacy application has no dark mode. Every dark value in this report is a
  modern derived proposal and requires browser contrast and product-owner visual
  review.
- The recovered icon set is not exhaustive of every Windows/system icon the
  application may have displayed. The inventory above covers the embedded,
  product-specific functional concepts relevant to the builder workflow.

## Acceptance guidance for the redesign

A first theme pass should be considered faithful when:

1. a player can identify at-will, encounter, daily, utility, and item content at
   a glance from the established green/red/gray/blue/orange system, with text as
   a redundant label;
2. the main builder reads as a dense navigation/choices/details tool rather than
   a loose collection of rounded cards;
3. check, house-rule, equipment, note, and attack-area concepts use consistent
   compact monochrome iconography;
4. the light theme uses cool ice and warm cream surfaces inside navy framing;
5. the dark theme feels like the same navy-led product and preserves semantic
   hue identity without neon saturation;
6. typography is primarily clean system sans-serif with restrained old-style
   display accents;
7. focus, selected, invalid, unavailable, and house-rule states remain
   distinguishable without color alone and meet automated contrast checks.

