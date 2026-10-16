# Printed overview design study

Status: page-1 summary and scratchpad accepted by the product owner, 2026-10-15.
Reference-page
review and the separately noted summary-continuation styling correction remain;
M5.6 stays open.

Production reference first draft is implemented for feedback: full references
follow the existing power/item card pages. Origin sections sort entries by known
acquired/granted level then name, with core grants counted as level 1 and unknown
levels last. Evaluated grant ancestry and explicit legacy automatic grants
identify origins independently of publication Source. The Theme root is an identity/origin
overview, not a reference card, paralleling omission of whole Class/Race
descriptions. Separately granted theme features remain grouped under Theme, and
their granted powers retain their own cards. Background root cards show Benefit, Associated
Skills/Languages and prerequisites instead of narrative/Common Knowledge text.
Explicit prose "Benefit:" tails are a fallback; unresolved legacy-only text is
preserved with its existing unavailable-rules notice. Actual granted feature
descriptions remain complete. Equipment and power indexes
use full-width panes. Items opens with a two-column Equipped table (breaking after
Feet), then full-width Currency and Inventory panes; ordinary empty slots show an em dash, while conditional
implement/companion slots appear when occupied. Currency shows carried/stored
wallet amounts at the current level, with builder-style denomination columns. Nonzero
stored balances add Carried/Stored/Total rows (per-denomination counts, no
conversion); otherwise one Amount row has no carried/stored distinction.
Unknown/custom currency remains visible as text, never coerced to zero.
Inventory follows with two Item/Qty pairs per row and full-width category dividers;
a white center gutter separates the pairs, with quantities aligned toward their
own item names instead of toward the neighboring pair.
equipped superscripts stay attached to each item, and every owned item remains.
Features/rituals/character prose use stacked category-local
two-column blocks under full-width headings. Measured splits balance column
heights while preserving down-then-across level/name order. The power
index has Power, Level, Range, Target, Attack and Damage columns, with action
icons preceding names instead of a separate Action column. It uses authored,
weapon-independent formulas (STR+2 vs AC, 2[W]+STR), not an equipped weapon's
calculated totals. Separate multiattack lines retain their own formulas/targets.
Character-specific and universal at-wills share one green pane and one table
header. A full-width "Universal actions" divider precedes the universal
rows, using quiet rules/white background and the pane's green accent. It stays
with its first power and repeats at continuation starts as needed. Character-sheet
power cards (screen and print) sort specific at-will, universal at-will, encounter,
daily; within each group they share the tables' action hierarchy, then non-utility
before utility and alphabetical names. Rules-only cards follow actionable powers,
before items.
Explicit Rules Item records are full reference cards under
their declared origin (Divine Sanction under Class Features), not invokable
powers or a name-only rules index. Explicit origin fields precede grant ancestry;
unknown origins stay in Other Features. Their physical cards remain available,
and the full text does not become a page-1 reminder.
Universal availability comes from unconditional generic Level1Rules grants, not
power names or Core publication metadata. Unresolved provenance is not guessed.
Section headings,
level metadata and source footers use the accepted
muted pane vocabulary; long prose flows at normal size with measured continuation.
Category headings now appear only once at the start, with a subtle origin tint
shared by subsequent panes. References omit synthesized defensive/reminder
entities, retaining the existing features and powers. Power indexes use subtle
at-will green, encounter red and daily gray (neutral in monochrome).
Category titles are larger, unboxed headings with a stronger colored underline,
distinct from the smaller filled pane headers; pagination measures their height.
Whole categories stay on one page whenever their balanced two-column block fits
a fresh page; they move rather than split if remaining space is insufficient.
Larger categories still keep their first two cards together when feasible.
Single-entry categories and oversized pairs retain normal flow;
summary reminder continuation (without category headings) is unchanged.
This is a first draft, not final reference or M5.6 acceptance.
See `implementation-status.md` for the final accepted scratchpad refinements;
the study and initial integration descriptions below retain their historical
design context.

## Open

Run the normal development server through the project Nix environment:

```sh
nix develop path:. -c pnpm --filter @4ecb/web dev --host 127.0.0.1 --port 5174
```

Visit `http://127.0.0.1:5174/sheet-prototype.html`. This is a separate Vite
development entry, intentionally not linked from the production application or
included as a production build entry. For actual characters, open the normal
character View and choose **Print / save PDF**. Its print preview now uses the
approved layout with evaluated character data; the normal interactive View and
accepted fixed-size physical power/item cards remain unchanged. The prototype
and real overview share `sheet-overview.css`.

## Review surfaces

1. **Summary:** identity/portrait placeholder, a compact six-row ability table above
   Skills with full names and shared Ability/Score/Modifier/+½ level headings,
   prominent defenses and health references, movement/awareness, complete skill
   list with a prominent adjacent Languages panel, conditional/ally-facing reminders and abbreviated feat
   reminders. Mutable values point to the scratchpad instead of scattering
   writing boxes throughout the reference page.
   Skills use two alphabetically ordered, name-first columns with a superscript T
   for training and a muted subscript governing ability beside the name. The
   bonus is the rightmost cell. Both skill and ability tables have subtle neutral
   alternating row fills; training no longer changes row colors. Ability columns
   have equal widths and consistent padding;
   the last bonus includes the modifier plus rounded-down half level. Health has four equal cells (HP, bloodied, surges, surge
   value). Defenses has five label-first cells, including Saves and full Fortitude/
   Reflex labels. Movement/awareness uses a matching four-cell row; Speed has no
   unit suffix. Skill cells have horizontal padding. XP and AP do not appear on the
   summary. Basic attacks reuse the power-card weapon table component, with
   separate melee/ranged sections and Weapon/Attack/Damage columns. The fixture
   calculations are illustrative, not a new evaluation path. The initial study
   placed feat reminders below Languages; real-data feedback now combines them
   with feature/item reminders in one Remember in play panel on the left.
   Basic attacks sit below Languages in the right column, leaving more of the
   left column available for reminders. The training key sits in the unused bottom-right skill row;
   the Skills preamble is removed. Passive senses use compact `Pass.` labels.
   The health panel is named Health. The approved ability table replaces the slash
   display and repeated cell legends; it retains both bonus values.
2. **Play scratchpad:** blank health/temp-HP fields, numbered fillable-on-paper
   surge hearts grouped with health, action points, skull death-save markers, six encounter-use columns, daily
   power tracking, an explicit Channel Divinity shared-use example with per-power
   action icons, an XP writing field, treasure/consumables and
   temporary effects. Quick reference and pertinent reminders are deliberately
   repeated. A small session/date field replaces the large heading and extended-rest
   field. The product owner's private quicksheet informs the organization;
   its private character/rules data is not embedded.
   Instructional tracking captions are omitted; the matrix and shared group
   structure carry that information visually.
3. **Feature reference:** readable variable-height full-description cards grouped
   into Class features, Racial traits and Feats,
   category icons/subheaders, preserved prose headings, a long-title case and
   multi-paragraph benefits. These are not fixed-size physical cards.
4. **Equipment and record:** slot-oriented equipped list, carried quantities,
   power frequency index with levels (or explicit nonlevel origins such as Item),
   advancement/XP, appearance/personality, companions and notes.

All content is synthetic and labelled illustrative, not an authoritative D&D
build or a calculated example. The portrait is a placeholder. No proprietary
definitions or sample files are required. Controls switch Letter/A4 and
monochrome in memory and expose the browser print action; writing areas and
hearts are paper affordances, not interactive Play state.

## Real-data integration

### Scratchpad redesign (2026-10-15)

The production scratchpad is a paper working surface, not another reference
page. The wider left column anchors Health above encounter/daily power tracking;
the narrower right column holds Action points & milestones, Conditions &
temporary effects, Treasure & consumables, and Session notes with a secondary XP
field. A small running header and session/date line replace any large page title.
The duplicated Quick reference pane and arbitrarily selected two reminders are
removed. Health uses label-first Max HP/Bloodied/Surge HP reference cells, large
current/temp-HP writing boxes, a surge track and three death-save skulls.

Surges use outlined rectangular segments, one per surge, with a heart beside the
label. Up to ten surges receive a label at every boundary; larger totals label
multiples of five remaining plus each track's endpoints. The bar measures its
width and uses deliberately aligned additional tracks rather than shrinking
segments below roughly 4mm. The existing defensive 100-mark rendering bound is
retained with explicit additional-count text for pathological/custom values;
unknown values remain textual, never guessed. Marking is pencil-on-paper only;
this does not introduce persisted interactive Play state.

Body pane headings use slate blue, health reference cells violet, and the power
sections retain meaningful encounter-red/daily-gray headers. Monochrome uses
explicit grayscale. Neutral alternating rows and consistently placed action icons
support scanning. Tracking boxes retain boundaries for pencil marks. Conditions
use six generously spaced Effect/Ends rows; treasure and notes have ruled writing
areas. The accepted first-page layout and physical cards are unchanged.

Power tracking uses measured group/row heights, panel overheads, gaps and an
overflow caption, replacing the fixed seven-encounter/four-daily limits. Both
lists get alternating opportunities to occupy available space. Shared resources
remain indivisible groups; item powers and complete names are preserved. Overflow
continues immediately after the scratchpad on numerically labeled pages, using
full-width tables measured separately at that width. Resizing restores rows when
space returns. Oversized custom groups remain visible with an explicit warning
rather than being discarded or made unreadably small. Health and all right-side
writing areas retain their allocation when power lists grow.

Named weapon/implement reminder policy (2026-10-15): Named properties use explicit
show/reference-only sets in `item-reminders.ts`, rather than trigger-word matching
alone. Show Brutal, Defensive, High Crit, Versatile, Mounted, Empowered Crit,
Forceful, Shielding, Mobile and Blinking. Keep Off-hand, Heavy/Light Thrown, Load
Free/Minor, Reach, Small, Stout, Accurate, Deadly, Distant and Reaching in the
weapon reference/card rules, not reminders: they describe handling, targeting
geometry or unconditional statistics. Undeniable, Unerring, Unstoppable and
Energized (all damage-type variants) are also reference-only: their conditions
are known from the attack defense/power keywords, so authored item- or training-
provided bonus rules feed calculated totals rather than manual reminders.
Numbered properties retain their values; descriptions must still come from
authored content. Unknown custom traits and freeform enchanted-item Property
paragraphs retain the conservative actionability heuristic. Filtering affects
reminder selection only, never the source data, item cards or calculations.

Summary continuation (2026-10-15): The defensive-traits pane is named
**Resistances & Weaknesses**, reserving Defenses for AC/Fortitude/Reflex/Will.
The measured page-1 reminder selection now sends omitted reminders directly to
an optional summary continuation starting on physical page 2, suitable as the
summary's reverse side. No continuation page is emitted when all reminders fit.
The scratchpad follows these pages and its page labels adjust accordingly.
Continuation reminders retain category labels and distinct item-benefit bullets;
the shared measured reference-card paginator preserves unusually long entries
across adjacent continuation columns/pages rather than clipping or shrinking
them. Matching summary reminders are no longer repeated in the distant reference
reminder collection; reference-only expanded core-power descriptions and complete
feature/item rules remain available in the reference pages.

Latest summary refinement: Basic attacks use one Weapon/Attack/Damage table,
with a sword, bow or (for Unarmed) fist icon prefacing each weapon row. Repeated
melee/ranged subheadings and ability/defense formula indicators are removed.
Resolved weapon categories filter invalid melee/ranged combinations; Light Thrown
and Heavy Thrown melee weapons support both. Unknown custom/legacy capabilities
remain visible rather than being guessed from names; ranged Unarmed is omitted.
Rows sort by descending to-hit, then average displayed dice damage, with stable
ties and unknown values last. This does not change underlying power calculations
or the equipped-first ordering on physical power cards.
Verification: 60 focused overview/rules-power/sheet-model tests, web typecheck
and focused lint pass. A read-only private Hu evaluation resolves Way-Leader
Gouge and Unarmed as melee-only; neither produces a ranged overview row.
The abilities table reads score then full ability name, Modifier and +½ level;
score has no separate header. Ability names are bold and cells have no borders,
using alternating row backgrounds instead. A full-width numeric band below the
identity header presents four distinct groups: Defenses, Health, Initiative, Speed.
All eleven values use matching individual soft tiles, with labels above numbers.
Each group has a thin rounded outline and no visible group heading; semantic
group labels remain available. Field labels use darker, slightly heavier text.
Page 1 uses one muted slate-blue accent for all body pane headers, without
category-specific pane colors. The numeric band uses sage-green Defenses,
muted-violet Health, and teal Initiative/Speed to distinguish its groups.
Tints are limited to pane headers
and numeric tiles/outlines; body text and alternating table rows remain neutral.
Monochrome mode replaces these accents with explicit grayscale values, preserving
text-based/searchable PDF output. This palette does not recolor cards or later pages.
The portrait is circular; the identity line reads race, class,
then bare level (`Dwarf Paladin 7`). The redundant first-page running header
is omitted; the full-width identity separator and
later-page running headers remain.
The first-page name prefers 27pt, measures down to an 18pt minimum, and then
uses single-line ellipsis. Its full text remains in the heading and title tooltip;
fitting reruns on name, width and font changes and is independent of card sizing.
Passive Insight and Perception precede their active skill bonuses, e.g.
`Perception (25) +15`, not as separate rows. Vision and special senses occupy a
compact Senses pane above Skills in the left column.
Senses uses the shared Eye glyph; reminder categories reuse the builder's
class/race/feat/item icon mappings. Bold reminder names have no trailing colon.
Within each reminder, the bold title stays flush left and the entire description
block is inset 1em, including wrapped lines. Paragraphs have no vertical gap or
first-line indent. Spacing between independent
reminder entries is unchanged, preserving the distinction between item/feature
boundaries and multiple paragraphs of the same benefit.
Grouped reminders with multiple explicit benefits use a bullet per benefit inside
the inset description. Item-property projection retains the authored field/named-
property boundaries as structured elements alongside the compatible combined text;
it never splits elements by paragraph breaks. Multiple paragraphs within one
benefit remain in one list item. Lists provide the single inset (their nested
paragraph blocks do not add another), while single-element prose keeps the normal
block inset. The same renderer supports structured elements in any reminder
category; it does not guess structure for unannotated class-feature prose.
Languages form a single-column striped table in a narrow panel to the right of
Abilities, using the Basic Attacks row styling. Skills retain alternating row
backgrounds without inter-cell borders. All summary tables start with a shaded
first data row, with defensive categories maintaining continuous striping.
Below the numeric band, equal-width
columns prefer Senses, Skills, Abilities/Languages and Basic Attacks on
the left, with Resistances & Weaknesses above reminders on the right. Defensive traits consume
right-column reminder space, never left-column skill/ability space. Whole panes fill the left in
that order; the first that cannot fit and all following panes move to the right,
below Resistances & Weaknesses and above reminders. Abilities/Languages remain one fitting unit.
Measurements use equal-width hidden pane probes, account for inter-pane gaps and
the footer, and rerun for content, font and page-size changes. The layout can move
panes back when space increases. Reminder fitting uses only the right-column
space remaining after fixed/overflow panes. Tables are not split or text shrunk
to force a fit; pathological data too large for both columns retains the existing
visible overflow warning and full reference data rather than being clipped.
Reminders are split into
Class features, Racial features, Feats and Item properties panes by source
metadata; unattributed effects remain in Other reminders. Empty panes are omitted.
Measured fitting includes pane headings/padding and the overflow caption, and
all omitted entries continue directly after page 1. Scratchpad/reference reminder
sections retain their existing list layout.
The Item properties pane includes actionable named weapon/superior-implement
properties expanded from authored item text or matching property definitions,
alongside freeform enchantment properties. Property parameters remain in the
description rather than the entity name, so name-only tier abbreviation does not
erase meaningful arguments such as an energized damage type. Only equipped
positive-quantity items qualify; no named-item exception list is used.
An item's property paragraphs share one heading, rather than repeating its name
for each property. Basic Attacks and other evaluated variant tables use the same
composed inventory display name as item cards and reminders, including custom
names; original calculation names and numeric values are unchanged.
An optional Defensive traits panel leads the left column,
grouping resistances, vulnerabilities, authored immunity clauses and conditional
or death-saving-throw modifiers in a striped benefit/source table without visible
column/category headings. Compact numeric clauses read `Resist 5 fire` or
`Vulnerable 5 cold`; explicit immunity lists read `Immune to acid`. Authored
conditional prose is preserved. Related rows are adjacent without blank category
gaps, with continuous alternating backgrounds across category boundaries.
Source names are not embedded in benefit prose.
Rows begin with a capital letter (numeric modifiers retain their leading sign).
Structured save rows display `+5 racial bonus to saves vs poison`, or
`+2 to saves vs fear` when untyped; penalties and death saves use the same
projection, without attempting grammar substitutions in arbitrary authored text.
Only summary save rows abbreviate `against` to `vs`; model/reference wording and
source names retain their original text.
Wording follow-up verification: 43 focused projection/render tests, web typecheck
and focused lint pass; the full print matrix was not rerun for this text-only change.
It never inflates the universal Saves tile. The full-width divider below the
identity header is restored.
Player and company appear without field labels beneath the race/class/level line
in muted text, omitting blank values and using a center dot only between values.
Theme, paragon path and epic destiny remain in the header's
right identity box, with bordered rows and em dashes for missing values.
See `character-import-and-sheets.md` for the
structured-stat/prose detection and legacy-cache compatibility boundary.
Header follow-up verification: 14 focused render tests, lint, production build,
and the overview-only Letter/A4 color/monochrome PDF matrix pass with no overview
overflow. This does not replace the separately tracked full physical-card gate.
Surge value follows the recovered legacy sheet projection: floor(maximum HP / 4)
plus the additive `Healing Surge Value` stat (absent bonus = zero), not that raw
stat alone. Absent unconditional Saving Throws likewise displays `+0`; conditional
saving-throw benefits remain separate reminders, not part of that universal bonus.
Unknown HP still leaves surge value unknown.
Verified against recovered `PanelModelHitPoints`/`BasicUtils` display paths and
Hu's evaluated data (68 HP, surge value 17, unconditional saves +0). All 29 focused
overview/model/render tests, web typecheck and focused lint pass.
Display follow-up: Saves and Initiative retain explicit signs in the model.
The summary displays zero Saves as an em dash (`—`) to reduce noise; Initiative
still shows `+0`. Nonzero saving-throw bonuses remain signed; the model retains
the distinction between zero and unknown values.
The summary's surge-value label is shortened to **Surge HP**.
Reminder names omit parenthetical qualifiers for display only; original names
remain intact in the model and references. The Ability heading aligns with the
name column rather than the raw-score column; names use normal
ink.
This supersedes the initial prototype's ability-column order and separate
Movement & awareness panel.

The shared sheet model now retains full selected feature rules separately from
authored short descriptions, including prerequisites and user-facing fields.
Missing full rules are labelled rather than presenting abbreviations as complete.
Ability checks add rounded-down half level to the supplied/fallback ability
modifier in the model. Training uses explicit training stats or selected Skill
Training definitions. Missing training/vision remain unknown; absent unconditional
saves use the native sparse-stat zero convention.
Senses use explicit Vision/Senses stats and fields on active definitions plus
selected rules of type Vision (including names such as Low-light that do not
contain the word vision). Unselected definitions and incidental names mentioning
vision do not qualify. Known direct providers' special-sense sentences preserve
authored ranges and conditions; explicit numeric sense stats supply ranges when
no such sentence exists. Missing ranges are not invented. Duplicate modes are
collapsed, and redundant Normal vision is omitted when enhanced vision is known.
This is a display projection, not exhaustive parsing of temporary senses in
item/power prose; those remain available in their full descriptions.

The real output contains one summary, a scratchpad (with continuation usage
pages as needed), and measured two-column references before the existing cards.
Long prose/list/table content continues without discarding words or rows; reference
titles identify continuations. Optional summary reminders/feat summaries yield to
essential stats when space is tight. All full reference entries remain available.
Feat entries in Remember in play require an in-play condition, ally-facing benefit or changed
action in authored feat text, rather than taking the first short descriptions.
Passive proficiency/training/numeric grants and armor-only loadout conditions are
omitted from reminders. There is no separate Feat reminders category: one shared,
deduplicated candidate list supplies summary, scratchpad and full references.
The summary measures rendered entry heights and fills the available left-column
space, reserving room for an overflow caption only when entries truly do not fit.
There is no fixed entry-count or character-count cap. Oversized entries remain
in references while shorter later entries can still use the remaining space.
Basic-attack summaries retain up to two weapon alternatives per attack kind;
their whole pane moves to the right before sacrificing summary content.
Complete weapon alternatives remain on power cards.
When the summary omits alternatives, Basic Attacks puts a muted, right-aligned
`More on power cards…` note in its header instead of a body caption. Basic attacks
are ordinary entries in the Power Index, not separate reference tables/pages.
The note is omitted when all eligible alternatives are shown.
The note's trailing ellipsis is the single Unicode character `…`.
Grant/choice-only wrappers are omitted using authored Benefit text and grant/
selection metadata, without mistaking introductory flavor for an extra effect.
The exclusion also covers power-access/shared-usage containers: grant/select-only
definitions whose prose merely explains learning, invoking or sharing uses of
other powers. A cadence such as once per encounter is not itself an independent
reminder effect. Definitions with independent mechanical benefits remain outside
this exclusion, including manual effects not represented in native statements.
Full feature references, granted powers and usage tracking remain unchanged;
there is no feature-name denylist.
Core class powers are discovered from active level-1 Class Features with explicit
power grants/Powers/_DisplayPowers or power _ParentFeature links. Discovery is
restricted to the character's selected class identity. Evaluated level-one grant
ancestry must lead back through class grant containers/features/builds, not feats,
themes or later paths; legacy-only projection follows explicit automatic grant
edges through class/Grants/level-one feature records. Owned powers are required,
so inactive choices and replaced powers are not invented into reminders.
The first usefulness filter includes non-attack powers with ongoing
target-dependent Effect text, not instantaneous healing, ordinary attacks or
grant/shared-allowance containers. A temporary personal drawback alone does not
qualify as an ongoing target effect. Effect-only `vs Unknown` calculations are
not treated as evidence of an authored attack.
Reminders use the granted power name, a mechanically useful authored short
description when available, otherwise its evaluated Effect/Special/Requirement/
Trigger/Sustain text without arbitrary sentence truncation. Known calculated
conditional effects (such as extra damage dice) are deduplicated and retained.
Access-only/same-named feature reminders consolidate into the power reminder;
separate independent feature benefits remain available. Full feature/power
references are unchanged. This is conservative discovery and text selection,
not exhaustive classification of every class's core mechanics or automatic prose
summarization; long entries still follow the measured fit/reference fallback.
Product review subsequently removed these expanded core-power descriptions from
page 1. Its reminder candidates are captured before core-power expansion, retaining
the existing concise feature/conditional-effect reminders (including calculated
extra damage). The full reminder reference still receives discovered core-power
mechanics. Discovery and its provenance tests remain active for later use. Page-1
measurement and overflow counts use only its eligible concise candidate list.
Additional Effects resolve to a uniquely known selected provider (or exact ID),
using its authored Short Description once instead of repeating the bonus per
power. Missing summaries fall back to the feature description; complete authored
descriptions remain in feature references. Conditional stat contributions alone
are not substituted for authored summaries, since they can omit timing or scope.
Unresolved identical effects deduplicate across affected powers. Effects
from known access-only providers keep their Class/Racial/Feat source category
using the evaluated effect text rather than reintroducing grant-only descriptions.
Grant-only providers with no independent effect still produce no reminder.
Distinct effects and ambiguous providers remain recoverable.
Original power/card effects are unchanged.
This remains a display heuristic, not
proof that every excluded benefit is calculated; all feats retain full references.
Up to two highest-ranked basic-attack variants per attack kind appear in the summary; all valid alternatives
are retained on power cards. Unfittable custom data raises a visible overflow
warning rather than being silently clipped or shrunk below readable reference text.

Inventory includes items whose physical cards are hidden, preserves explicit
slot assignments, falls back to authored Item Slot, and labels unknown slots.
The equipped loadout and complete inventory have separate lookup tables. Basic
attacks appear in the Power Index. Equipped inventory uses Slot/Item columns,
ordered by the builder's body/held/other slot sequence, then name. "Inventory"
uses Item/Qty for full owned quantities, including equipped items marked with a
superscript E and a small legend. Equipped slot names use the builder slot icons.
Category subheaders use white backgrounds and quiet rules, distinct from row
striping, with category labels/order matching the
builder's category labels/order and shared authored-role classification. Unknown
items remain visible under Miscellaneous; unknown slots remain after known slots.
The power index preserves
levels, with absent levels explicit rather than manufactured. Item powers also
have an index and encounter/daily tracking regardless of card visibility.

Channel Divinity grouping uses its explicit power keyword, confirmed against
the local content metadata, retaining each action icon. No other shared resource
is inferred from names. Reminder candidates are authored conditional/ally-facing
class/racial/feat descriptions, equipped item properties and existing Additional
Effects; ally-facing reminders sort first. This is a conservative display
heuristic, not exhaustive mechanical analysis or a new calculation path. Theme/
background narrative is not classified as a combat reminder. The summary shows a
bounded subset with a count pointing to the complete reminder reference.

Paper tracking remains blank writing space, not persisted interactive Play state.
Private source characters and the quicksheet remain ignored. Public tests use
synthetic data. `scripts/check-print.mjs --overview-only` isolates overview PDF
pagination (including long-note continuation) from the unchanged dense-card gate;
it is not a substitute for the default full print check.

## Remaining review boundaries

- Continue product-owner feedback with actual characters, especially reminder
  selection, reference density, equipment organization and scratchpad overflow.
- Do not treat this presentation integration as a correction to pre-existing
  evaluation mismatches or as exhaustive reminder/shared-resource coverage.
- Complete M5.6 acceptance separately, including the existing dense physical-card
  overflow decision. Four synthetic prototype pages were not that acceptance gate.

Initial prototype checks covered rendering, TypeScript/lint, page-footer bounds
on Letter/A4 and monochrome controls. The integrated overview adds synthetic
model/render/pagination tests, real-character browser review, and an isolated
Chromium PDF matrix with long-note continuation and selectable text in all four
paper/color combinations. See `implementation-status.md` for measured results
and the unchanged dense physical-card overflow assertion.
