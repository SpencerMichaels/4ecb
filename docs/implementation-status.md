# Implementation status

## M5.6 initial View and print-structure checkpoint (2026-09-30)

Scratchpad defenses strip (2026-10-16): Health now starts with a compact,
single-line AC/Fort/Ref/Will bar above its four health reference cells.
It uses the same calculated defenses as page 1, with 10pt regular-case inline labels and 11pt
values instead of the health cells' taller label-over-17pt-value layout.
Slate-blue and monochrome styling match the health pane; missing values remain
explicit em dashes. Verification: 87 focused overview/layout tests and the
production/PWA build pass through Nix. A focused Letter/17-surge preview was
rendered and visually inspected; the strip fits without changing the health
pane's outer height. The neighboring pane is titled Conditions; its right-hand
header note displays a known nonzero saving-throw modifier (e.g. +1 to saves),
omitting zero/unknown values. This label/header follow-up passes all 69 overview
tests and web typecheck through Nix, including positive/negative saves and
zero/unknown omission. No full milestone gate was rerun for this layout trial.
The subsequent regular-case/10pt-label styling adjustment also passes the 69
overview tests; no broader test run was repeated for that small visual edit.
The defense-icon trial was removed after owner feedback: the strip retains
text-only 10pt labels. Icons beside the four large health numbers now use 55%
opacity to reduce visual noise without muting the numbers or labels.
Verification: 87 focused overview/layout tests and web typecheck pass through
Nix; no broader print/milestone gate was repeated for this styling follow-up.

Scratchpad health-value icon trial (2026-10-16): Max HP/Bloodied/Surges/Surge HP
now place Heart/Droplets/Zap/Heart Plus beside their large numbers with a 0.04in
gap, with numbers centered independently of the icons below the labels.
Icons are 13pt beside 17pt numbers. Owner feedback restores this arrangement
after the beside-label trials.
The four cells and connected surge bar use slate blue
instead of violet; monochrome remains grayscale. No extra heading row is added.
An empty value reserves a small writing space beside its icon. Page-1 cells and
other numeric groups remain unchanged. This is for owner visual feedback.
Verification: 86 focused overview/layout tests and the production/PWA build
pass through Nix. A style regression covers independently centered numbers and
matching slate backgrounds. The renderer test verifies all four icon
identities and unchanged resource values. No full print/milestone gate was rerun
for this small styling trial; a focused Letter/17-surge preview was rendered
and visually inspected. M5.6 remains open.

Balanced surge wrapping (2026-10-16): 18 surges is now the Letter-oriented
two-row threshold, yielding 9+9 (19: 10+9; 20: 10+10). Larger or narrower bars
use as many measured rows as needed, balanced evenly with extras on earlier
rows. Both rows share the same slot width; shorter rows remain left-aligned.
Sequential remaining-count labels and the explicit 100-mark safety bound stay
intact. This supersedes the previous fill-first/overflow-only behavior.
Verification: 85 focused overview/layout tests, web typecheck, focused lint and
production/PWA build pass. The public print fixture now has 18 surges and checks
9+9 explicitly; all eight Chromium/Firefox Letter/A4 color/monochrome overview
cases pass, including narrow-track reflow and restoration. The Letter preview
was visually inspected. Commands: Nix-wrapped focused `vitest run`, web
`typecheck`/`build`, `eslint`, and `node scripts/check-print.mjs --overview-only
--include-card-pages --firefox-scratchpad --scratchpad-preview`. The existing
full milestone/dense-card gate remains separate; M5.6 is still open.

Health tracker spacing (2026-10-16): gaps within death-save skulls and action-point
circles shrink from 0.1in to 0.04in; icon sizes and label/group placement stay
unchanged. Surge wrapping remains fill-first, overflow-only on subsequent rows,
not balanced; all rows retain the same segment width. This is a small styling
follow-up, not a change to surge counts, wrapping or tracking behavior.
Verification: all 16 focused scratchpad layout/style tests pass via Nix. The
full print/milestone suite was not rerun for this spacing-only edit.

Reusable notes-template follow-up (2026-10-16): Session Notes now follows all
reference and enabled card pages at the document's end. Its page-number element
is omitted entirely, and it does not advance any character-sheet page numbers.
The remaining pages retain continuous 1…N numbering. Recorded character XP is
no longer prefilled: Notes/Treasure/XP are blank ruled writing areas intended
for repeat printing; the right-aligned Date field remains. Identity/section
footer and pane styling are retained. Public renderer/PDF checks explicitly
verify this final unnumbered template rather than weakening numbered-page checks.
Verification: 68 focused overview tests, web typecheck, focused lint and
production/PWA build pass. All eight Chromium/Firefox Letter/A4 color/monochrome
overview PDF cases pass, verifying continuous numbered character pages followed
by exactly the unnumbered template, with no overflow or extra blank pages. The
updated template preview was visually inspected. Commands: Nix-wrapped focused
`vitest run`, web `typecheck`/`build`, `eslint`, and
`node scripts/check-print.mjs --overview-only --include-card-pages
--firefox-scratchpad --reference-preview`. No full milestone/dense-card gate was
rerun; M5.6 remains open.

BA-flag cache invalidation correction (2026-10-16): the preceding eligibility
change omitted the required engine-cache version bump. Version v8 results could
still be accepted from persistent storage with no `basicAttackKind`, so a fresh
private evaluation passed while existing browser sheets could omit the row.
`RULES_EVALUATION_CACHE_VERSION` now advances to
`evaluated-character-v9-2026-10-16-effective-basic-attack-flags`, invalidating
derived results only, not character/profile/content data. Runtime regression
tests seed old flagged-power projections without eligibility metadata and
require a fresh worker evaluation with the flag, including the former v8 key.
After loading the updated app, sheets recompute rather than reuse old results.
Verification: 129 focused runtime-cache/overview/power tests pass, including
old-v8-cache rejection and fresh BA-flag preservation. Web/rules typechecks,
focused lint and production/PWA build pass through Nix. No full print/milestone
gate was rerun: this changes cache identity, not layout or character data. The
connected browser tab could not be inspected because its control connection
timed out; reopening/reloading the updated browser document is still needed to
confirm the owner's live Hu sheet. M5.6 remains open.

Basic-attack alternatives (2026-10-16): owned powers with effective authored
`_BasicAttack` = Melee/Ranged now join the summary table. Active rule overlays
are authoritative, including Power of Skill; no feat-name/prose heuristic is
used. Typed `basicAttackKind` passes through evaluation and sheet projection,
remaining separate from equipment `basicAttackTypes` and hidden from printed
rules fields. Each flagged nonstandard power gets one row labelled only by its
power name, using eligible equipped/main-hand-first math with best-available
fallback. Ordinary MBA/RBA weapon alternatives and numeric ranking stay intact;
ranged implement powers are not rejected because their staff is a melee weapon.
The power's original ability and damage remain unchanged, not substituted with
generic Strength-based MBA math. Full riders/other weapon alternatives stay on
power cards. Cached recovery recognizes direct authored flags only; it does not
invent missing feat overlays.

Recovered `IsBasicAttack` and `BuildKeywordSet` show that effective BA flags also
qualify basic-specific numeric channels. The evaluator now propagates that tag
to attack/damage stat matching and conditional reminders, including feat-added
flags rather than only raw fields. Evidence is recorded in the legacy exception
notes. A read-only private Hu diagnostic using the current local pack finds
Overwhelming Strike flagged Melee with Power of Skill and unflagged after
removing that feat; its projected main-hand calculation is +12 vs AC, 2d6+8.
This is current-profile diagnostic evidence, not a same-profile legacy golden.
Public tests use synthetic rules/data only; private character/corpus artifacts
remain ignored.
Verification: all 340 rules-engine/sheet-model/overview tests, their three
package typechecks, focused lint and production/PWA build pass. A read-only Hu
evaluation confirms selected/deselected feat eligibility as described above;
this is separate from public tests. All eight Chromium/Firefox Letter/A4
color/monochrome overview print cases pass with no overflow or numbering loss.
Commands: Nix-wrapped `vitest run packages/rules-engine/src
packages/sheet-model/src apps/web/src/SheetOverview.test.tsx`, package
`typecheck`, focused `eslint`, web `build`, and `node scripts/check-print.mjs
--overview-only --include-card-pages --firefox-scratchpad --scratchpad-preview`.
No full milestone/dense-card gate was rerun; M5.6 remains open.

Shared tracker alignment (2026-10-16): Channel Divinity's encounter boxes align
to the top group-heading line, using the same top inset as the name cell rather
than centering through the multi-power row. Ordinary single-power rows retain
their existing alignment. All 82 focused overview/layout tests pass via Nix;
the full print/milestone suite was not rerun for this small alignment change.
No calculation, grouping, pagination or milestone status changes.

Notes date follow-up (2026-10-16): Date returns only at the right of the separate
Session notes pane header, reusing the 1.25in × 0.25in rounded handwriting box
and bold 10pt label. The combat scratchpad remains Date/XP-free. The header-note
slot supplies right alignment without a separate row. Renderer and print
assertions now distinguish the notes-page Date from the intentionally absent
scratchpad field. No page order, numbering or persisted character data changes.
Verification: all 67 focused overview tests and web typecheck pass through the
project Nix environment. The full print/milestone suite was not rerun for this
small header edit; M5.6's existing blocker is unchanged.

Shared encounter/session-notes follow-up (2026-10-16): Channel Divinity now
recognizes the authored Channel Divinity specific field, not just a keyword.
Inspection of the private original definitions for Ingi's two Channel Divinity
powers confirms Keywords contains only Divine while a separate field states the
shared limit; this explains the prior recognition failure. Both sheet-model
paths project explicit `sharedUsage` metadata without inventing a keyword.
Recognized members share one indivisible encounter row/box set, placed at the
earliest member's normal sorted position (owner-selected option 2). Within it,
powers sort by action then alphabetically, retaining action icons; utility type
does not override that internal alphabetical tie-breaker. Name-only matches
remain excluded.

Date and XP are removed from the combat scratchpad. A separate Session Notes
page follows it and any usage continuations, before references/cards. Most of
the page is ruled notes space; the lower row has Treasure and XP panes. Recorded
XP (including zero) is retained in the XP header when present. No Date field is
added. The page uses standard pane styling, identity footer and continuous
numbering; it is paper-only, not persisted session/XP state.
Verification: 188 focused overview/pagination/sheet-model tests, web and
sheet-model typechecks, focused lint and production/PWA build pass. All eight
Chromium/Firefox Letter/A4 color/monochrome overview print cases pass with no
overflow, including notes-page ruled-area/clearance/order checks and shifted
continuous numbering. Notes and scratchpad previews visually inspected.
Commands: focused `vitest run`, package `typecheck`, `eslint`, web `build`, and
`node scripts/check-print.mjs --overview-only --include-card-pages
--firefox-scratchpad --reference-preview --scratchpad-preview`, through project
Nix. No full milestone/dense-card gate was rerun; M5.6 remains open.

Scratchpad visual follow-up (2026-10-16): immediate interrupts now use Lucide
`trending-up`. Consumables uses the 20% item-gold/white combat-subheading tint
rather than the saturated title color; stock boxes/count controls right-align.
Channel Divinity investigation: existing `usageGroups` merges recognized members
across action types into one indivisible row with one set of encounter boxes.
Recognition currently requires an explicit comma-delimited Channel Divinity
keyword. A mixed-standard/free-action renderer regression test confirms sorting
alone does not split recognized members. Broader recognition and preferred group
placement are pending owner review; no Channel Divinity behavior changed here.
Verification: 76 focused overview/stock/action-icon tests, focused lint, web
typecheck and production/PWA build pass using the project Nix environment.
Print assertions now expect the muted header and right-aligned boxes; the full
print matrix was not rerun for these small styling changes. M5.6 remains open.

Consumables styling follow-up (2026-10-16): remaining-stock circles are replaced
by the exact square boxes shared by Encounter/Daily power tables. Pane borders
now match ordinary panes; only the header uses item-card gold. Rows use the same
item-category icon mapping as cards, preserving physical-base and composed-item
type metadata in both sheet projections. Parenthetical annotations are hidden
unless distinct owned consumable names would otherwise collide; exact duplicate
names alone do not force annotations back on. Shared immediate-interrupt icons
now use Lucide `zap-off`; the old octagon-specific scaling is removed.
Verification: 238 focused stock/overview/icon/style/item-presentation/sheet-model
tests pass, along with web/sheet-model typechecks, focused lint and production
build. The eight Chromium/Firefox Letter/A4 color/monochrome overview print cases
pass, checking shared box dimensions, ordinary pane borders, item icons, exact
stock coverage and pagination. Scratchpad preview visually inspected; the final
header-divider color reset uses the inherited pane rule and does not alter
geometry. No full milestone or dense-card gate was rerun; the known M5.6 blocker
remains unchanged. Verification used Nix-wrapped focused `vitest run`, package
`typecheck`, `eslint`, web `build`, and `node scripts/check-print.mjs
--overview-only --include-card-pages --firefox-scratchpad --scratchpad-preview`.

Consumable scratchpad feedback (2026-10-16): the rejected bottom-of-item-card
Remaining strip stays reverted. Session notes and Treasure & consumables blank
writing panes are removed; Date/XP retain a compact row below Health/Conditions.
Encounter powers occupy the wider left column, while Daily powers and then
Consumables stack independently on the right. The consumables header matches
item-card gold/yellow, with circles for stocks up to five and a remaining-count
box for larger/custom quantities. All owned consumables/ammunition qualify from
authored category/type/power metadata, including hidden-card items; names are
not guessed. Empty stock is omitted. Optional item type is preserved in both
sheet projections. All three tracking streams use measured pagination without
changing character/inventory data. The discarded card-strip trial remains
recoverable in Git history.
Verification: 83 focused overview/stock/pagination tests plus all 106 sheet-model
tests, web and sheet-model
typechecks, focused lint, production/PWA build, and all eight Chromium/Firefox
Letter/A4 color/monochrome overview print cases pass. Geometry checks cover gold
and monochrome headers, right-column positioning, circles/count box, exact-once
row retention and dense tracking continuations. Scratchpad preview visually
inspected. Commands: focused `vitest run`, package `typecheck`, `eslint`, web
`build`, and `node scripts/check-print.mjs --overview-only --include-card-pages
--firefox-scratchpad --reference-preview --scratchpad-preview`, all through the
project Nix environment. No full milestone/dense-card gate was rerun; M5.6 remains
open with its previously recorded dense physical-card blocker.

Inventory weight-noise follow-up (2026-10-16): unspecified/blank item weights
are omitted entirely, not rendered as zero or an em dash. Explicit numeric zero
and weight overrides remain visible. Native aggregate encumbrance semantics are
unchanged: known definitions without Weight still contribute zero to the total.
Verification: 77 focused overview/encumbrance tests and web typecheck pass.
The preceding Character Details column-heading removal is retained. No full
print/milestone suite was rerun for these small display changes.

Identity-header feedback (2026-10-16): the single four-column grid and its
internal gutter are replaced by two separately bordered, content-sized tables
side by side. Size/Deity/Alignment occupy the left table; Theme/Paragon path/
Epic destiny the right. The combined width cap, right alignment, wrapped values
and em-dash blanks remain unchanged.
Verification: 65 focused overview tests, web typecheck and production/PWA build
pass. Print geometry assertions now target the two-table structure; the full
print/milestone matrix was not rerun for this visual feedback change.

Paired identity-header trial (2026-10-16): page 1 now uses a right-aligned,
content-sized four-column identity table. Rows pair Size/Theme, Deity/Paragon
path and Alignment/Epic destiny. A 62% width cap leaves room for the character
name; label tracks fit the longest label and value tracks wrap only as needed.
Empty values remain em dashes. The three mechanical identity fields are removed
from the reference Details table; Gender/Age/Height/Weight/RPGA remain there.
This supersedes the prior pending status-line proposal and is for owner feedback.
Verification: 65 overview tests, web typecheck, focused lint, formatting and
production build pass. All eight Chromium/Firefox Letter/A4 color/monochrome
overview print cases pass with no overflow and continuous numbering. Added
geometry assertions check three four-cell rows in reading order within the
header. The generated summary preview was visually inspected. No full milestone
or dense-card content gate was rerun.

Coin-weight preference (2026-10-16): Settings now offers “Count coin weight,”
enabled by default, persisted per browser with session fallback when storage is
unavailable. Character sheets rebuild their model when it changes. Both evaluated
and legacy-cache encumbrance/load omit carried coins when disabled; wallets,
per-item weights, limits and character/export data remain unchanged. Unknown
money does not block gear-only encumbrance, but unknown gear still does.
The proposed page-1 identity status line is not implemented yet: its scope is
Size, Deity and possibly Alignment only, not physical-description trivia.
Verification: 195 focused sheet-model/overview/settings-contract tests,
sheet-model/web typechecks, focused lint, formatting and production/PWA build
pass. Tests cover default-on counting, off-state load changes, both projection
paths, custom money, unknown gear and unchanged wallets. A stale source-shape
assertion now follows the reference title variable introduced by the prior
footer refactor; its page-title requirement is retained. No print-layout or
full milestone suite was rerun for this calculation/settings-only change.

Inventory follow-up (2026-10-16): encumbrance now appears as a compact line
inside Inventory, replacing the separate pane. Each item cell has a muted,
right-aligned quantity-inclusive weight; per-row fractions are retained before
the native aggregate stock-weight truncation. Unknown weights remain em dashes.
Character Details remains in place pending the product owner's choice of a
page-1 status-line design; no header redesign has been implemented in this slice.
Verification: 168 focused sheet-model/overview tests, sheet-model/web typechecks,
focused lint, formatting and production build pass. Four Chromium Letter/A4
color/monochrome overview cases pass with no overflow and continuous numbering;
the updated Items preview was visually inspected. Firefox/full milestone gates
were not rerun for this refinement.

Final print audit follow-up (2026-10-16): all four requested corrections are
implemented for owner feedback. Items has a carried-weight/normal-limit/load
pane. Character Record opens with populated physical/identity details (Size,
Gender, Age, Height, Weight, Alignment, Deity, RPGA) before descriptive notes;
Size stays out of the page-1 identity header. Both evaluated and legacy sheet
paths retain these fields. Encumbrance follows the recovered native gear,
coin-weight, StrLoadAdjust and Weight Discount paths; see the sheet specification
for exact semantics and unknown-data boundaries. Private diagnostic Hu results
are 65/130 lb in both cached and evaluated projections; Ingi is 70/100 lb in
both. These are supplied-file diagnostics, not a new exhaustive same-profile
parity claim.

Reminder overflow now reuses page-1 category panes, inset descriptions and
multi-benefit bullets in measured two-column pages directly after the summary.
There is no large continuation title or reference-card restyling. Category
headings repeat when needed; an oversized indivisible reminder stays intact and
raises the existing overflow warning. Card margins now carry the same ruled
identity/title/page footer as the overview. Letter grids move upward 0.05in for
footer clearance; fixed sleeve sizes and inter-card gaps do not change. A4 card
placement is unchanged. The prior Date-box size/font/corner feedback is retained.

Verification: 193 focused sheet-model/overview/print-layout/scratchpad tests,
sheet-model and web typechecks, focused lint, formatting and production/PWA build
pass. The legacy-shape variant test now explicitly types its removed equipmentId
as optional (test-only typing repair; no runtime or assertion relaxation).
`node scripts/check-print.mjs --overview-only --include-card-pages --firefox-scratchpad --reference-preview`
passes all eight Chromium/Firefox Letter/A4 color/monochrome cases: 16 pages each,
continuous numbering, no overview overflow, fixed card sizes and footer clearance.
It verifies compact continuation panes with matching page-1 heading colors,
Character Details, encumbrance, and card-footer contents. An additional four-case
Chromium pass generated previews for visual review of Details, reminder overflow,
Items and card-page footers. Native Hu/Ingi diagnostics used the supplied files
and local private content; no private data is required by public tests.
The full milestone gate and known dense-card content-overflow assertion were not
rerun or relaxed. Owner review and that existing blocker remain; M5.6 stays open.

Scratchpad working-surface redesign (2026-10-15): The product owner accepts both
the first-page summary and scratchpad. The accepted scratchpad layout has
Health with a three-circle action-point tracker beside Effect/Ends, a full-width Encounter/Daily
tracking pair, then wider Session notes beside Treasure/consumables with XP. Slate pane headers, violet health
reference cells, encounter-red/daily-gray tracking headings and explicit grayscale
reuse the accepted visual vocabulary. Current/temp HP retain at least 0.7in writing boxes,
temporary effects six 0.42in rows. Redundant quick-reference/two-short-reminder
panes are removed. Surge hearts become markable segmented bars with boxes at
least as wide as they are tall, remaining-count labels inside every box
and deliberate aligned additional tracks. Unknown/very large custom totals remain
explicit; the existing 100-mark rendering bound is not a silent truncation.

Scratchpad Encounter/Daily lists sort by action (standard, move, minor, free,
reaction), then attack/non-utility before explicitly metadata-labeled Utility,
then alphabetically. No Action sorts with free; immediate interrupts and
opportunity actions sort with reactions; unrecognized actions follow known ones.
Shared-use groups stay intact, positioned by their first sorted member, with
members sorted by the same precedence. Item-granted powers participate too.
Sorting verification: all 30 overview tests, web typecheck and focused lint pass.
Scratchpad item-power names omit enhancement suffixes and parenthetical
heroic/paragon/epic tiers; full item names remain in the reference index and
underlying character data. The compact-name regression brings overview coverage
to 31 passing tests; web typecheck passes.
Scratchpad Health now mirrors the summary's four reference values (Max HP,
Bloodied, Surges, Surge HP) with tighter cell padding. Death-save skulls sit
beside their label rather than at the opposite edge of the pane; HP writing
areas and the segmented surge bar are unchanged.
Verification: 32 overview tests and production build pass; the refreshed-build
overview print check passes Letter/A4 in color/monochrome with no overflow,
including assertions for four health cells and left-grouped death-save skulls.
Page 1 ability names use regular weight, matching the other left-column table
labels; this isolated CSS adjustment does not alter values or layout structure.
Surge bars are continuous at all counts, with every box numbered from the total
down to one and no visual grouping gaps. Encounter and Daily panes share a row,
across the full page body, with Encounter receiving 1.5 times Daily's width.
A sole pane fills the available
width; containers below 3.6in fall back to stacked panes. Pagination measures the
actual narrow/wide row heights and uses the maximum pane height when adjacent,
rather than adding both heights. Full names, shared-use grouping and adjacent
overflow pages remain intact.
The redundant surges `X/day` marker is removed. Health and action points occupy
the upper left, Conditions the upper right; Treasure and Session Notes sit below
the full-width power pair. Their writing-area heights are reserved before power
pagination, so long power lists cannot consume those areas. Both hidden width
probes and visible trackers use full page width.
The full-width follow-up passes the same 43 focused tests, typecheck, build,
lint and eight Chromium/Firefox print-layout variants; the new assertions check
full body-width trackers and removal of the redundant surge count. The generated
preview was reviewed. Writing-area stability checks allow less than 0.5px of
subpixel rounding after Firefox reflows, rather than exact floating-point equality;
overflow, row completeness and reserved-area checks are unchanged.
The separate Action points & milestones pane is removed: milestones are not
tracked, and Action points has one 0.28in writing box beside Death saves inside
Health. The upper Health/Conditions panes stretch to matching bottom edges;
power panes remain full width and the other writing-area sizes are unchanged.
Verification: 32 overview tests, production build and focused lint pass; all
eight overview Chromium/Firefox layout variants pass, including matching upper
pane bottoms, exactly one small AP box and no milestone text. Generated preview
reviewed; no full milestone suite was run for this refinement.
Health's standalone heart/Surges heading is removed; the numeric reference cell
remains simply “Surges.” Death saves/APs are anchored at the bottom of the
stretched Health pane with normal content padding below, rather than leaving
an unused line beneath them. Surge tracking sits above Current/Temporary HP,
immediately below the numeric reference row so it is closer to the Surges total.
The surge bar has a pale violet backing with a short connector to the Surges
reference cell, matching its background (neutral gray in monochrome); individual
segments stay white for pencil marks. This replaces the removed standalone label
with a visual association rather than another caption.
Verification: production build and focused lint pass. The heading removal,
bar-before-HP ordering and bottom-tracker padding pass all eight Chromium/Firefox
overview layout variants; the final connector styling passes four Chromium
Letter/A4 color/monochrome variants and was visually reviewed. Assertions require
the backing/connector to match the reference-cell color. No full unit/milestone
suite rerun for these markup/style refinements.
Surge numbers now sit inside their boxes, removing the extra label strip below.
All bars label each box, counting down to the last box (one remaining), with no
separate zero boundary label; sparse numbering was removed after visual feedback.
The connector now spans the full width of the Surges reference cell rather than
a thin stem; the bar's backing has even vertical padding.
Verification: all 11 focused layout/surge tests and production build pass. Four
Chromium overview variants pass with assertions that labels stay within boxes
and connector width matches the Surges cell; the generated preview was reviewed.
Firefox/full milestone suites were not rerun for this refinement.
The subsequent every-box numbering change passes all 11 focused surge/layout
tests; its print expectation is updated, with no full print rerun for this
text-only follow-up.
Surge wrapping now derives column capacity from the actual row width, box height
and inter-box gap, replacing the fixed 18px estimate. Additional rows retain the
first row's column widths rather than stretching the last few boxes. Focused
tests cover the exact square-box boundary and 20/25-surges split over two rows;
the rendered regression narrows a track, verifies wrapping with width >= height,
then restores its original width and single row.
Verification: all 12 focused layout/surge tests, production build and focused
lint pass. All eight Chromium/Firefox overview variants pass, including the new
wrapping/restoration check. The every-box print expectation now compares DOM
strings with strings (previously numeric expected values); the numbering itself
is unchanged. No full milestone suite was run.
Scratchpad spacing/header follow-up: the surge bar-to-reference gap now matches
the 0.05in reference-cell gap, including the connector height. Current/Temp HP
boxes flex to consume spare Health height above the bottom trackers, retaining
their 0.7in minimum. Power panes use the same 1.5:1 split and 0.15in gutter as
the upper/lower panes. Encounter tracking uses fixed 0.22in square writing boxes
within each row, preserving their shape even beside multi-line power names.
The scratchpad now follows the reference pages' footer-only running layout:
name · race class level at left (ellipsis for long identities), centered
Scratchpad, and page number at right. Date now occupies the right side of the
Session notes heading, followed by a small bordered writing box. Page 1 uses
the same identity/title/number footer with Character Summary centered, replacing
its differing source-status note (source provenance remains on the page's
data-sheet-source attribute).
Optional summary/power-usage continuations also use footers rather than running
top headers; measurement probes use the same geometry. No standalone date row
occupies body space. The first-page identity header remains unchanged.
Footer/Date-placement consistency verification: 73 focused overview/scratchpad tests, web
typecheck, focused lint and production build pass. All eight Chromium/Firefox
Letter/A4 color/monochrome print cases pass, with continuous numbering 1–16
and no overview overflow. The scratchpad preview was visually inspected.
The full milestone gate was not rerun; M5.6 remains open.
Verification for this spacing/header follow-up: 45 focused overview/layout
tests, web typecheck, production build and focused lint pass. All eight
Chromium/Firefox overview variants pass the added gap, HP-fill, column-split,
square-box and session-header checks. The generated Chromium preview was
visually reviewed. No full milestone/card gate was run.
Action points now use three hollow circle marks, matching Death saves' three
skulls in size and spacing, rather than a single numeric box. This is a paper
tracking affordance, not a new calculated cap or persisted Play-state rule.
Encounter tracking columns alternate subtle vertical backgrounds;
the name column is unstriped and row stripes are removed. Daily now uses the
same table styling rather than horizontal row striping.
Verification: 33 focused overview tests and production build pass; four
Chromium overview variants verify three hollow AP icons and alternating tracking
column backgrounds with no name-column stripe. The generated preview was
reviewed; Firefox/full milestone suites were not rerun for this style follow-up.
Encounter tracking has ten numbered columns, and Daily has five numbered
columns. Their numbers sit in the colored pane-title band, directly aligned with the tracking
boxes. A shared width variable and matching header/body padding keep centers
aligned; screen-reader column headers remain but occupy no visible row. Both
retain vertical column stripes and an unstriped name column. Squares increase from
0.2in to 0.22in, with 0.26in column widths. Faint horizontal rules between power
rows span the name and all tracking cells, guiding the eye without restoring
row backgrounds. Column widths are set through a colgroup. Both tables share
one renderer and measured row/heading pagination; encounter and daily measurements
are scoped independently so daily rows cannot be counted as encounters.
Shared-use groups remain one encounter tracking row.
Verification: 71 focused overview/scratchpad tests, web typechecking, focused
lint and production build pass. Four Chromium overview print variants verify
1–10/1–5 headers, vertical stripes, horizontal dividers, and complete measured
dense-tracker continuation without overflow. Scratchpad preview visually inspected;
Firefox/full milestone gates were not rerun.
The merged-title-band follow-up passes the same 71 focused tests, web typechecking,
lint/build and four Chromium overview variants. It checks number/box centers
within one pixel and confirms the accessible table header has no visible row
height; the scratchpad preview was visually inspected.
Health/header polish: the Surges reference cell has square bottom corners where
it joins its connector; race/class/level use regular weight while the character
name remains bold. Death-save skulls precede their label, mirroring AP circles
at the opposite outside edge of the pane. All 34 focused overview tests pass,
including assertions covering
the identity span and skull/label ordering; no full print rerun for this polish.
Treasure/consumables and Session Notes now expand together to the available
bottom edge above the footer, including their ruled writing areas; XP stays at
the bottom of Notes. A shared hidden record-pane probe measures minimum natural
height (at least 1in treasure lines and 1.25in note lines). Power pagination
reserves that minimum, not the expanded visible height, avoiding a feedback loop
that would push powers off the page. Visible records then consume remaining
height. Dense-power checks now require minimum writing areas and stable bottom
alignment rather than identical record heights before/after power growth.
Verification: 46 focused overview/layout tests, web typecheck, production build
and focused lint pass. Four Chromium PDF and four Firefox print-preview geometry
variants pass bottom-edge alignment, dense-power minimum-space preservation,
exact-once power coverage and restoration checks. Generated preview reviewed;
no full milestone/card suite was run.
Firefox overflow-warning follow-up: expanding records reproduced a false
warning with a content/footer gap of 7.99993896484375px against Paper's strict
8px guard, while the record panes themselves had an 8px gap. Scratchpad now
targets 9px clearance so fractional layout rounding stays safely within that
unchanged guard. The rendered check explicitly requires the visible warning
flag to be false, including after resize/restoration, rather than checking only
physical page overflow with a looser measurement margin.
Verification: production build and all eight Chromium/Firefox overview variants
pass, explicitly including absence of the warning before and after resizing.
No full milestone suite rerun for this one-pixel clearance correction.
XP's label now sits inside its bordered writing area at the upper left, matching
the HP-box label style. Scratchpad Current/Temporary HP use a 3:1 width split,
giving Current HP three quarters of the available row while preserving their
shared expanding height. This does not alter any resource calculation.
All 34 focused overview tests pass; no full print/milestone rerun for this
small label/proportion adjustment.
The visible scratchpad header now reads “Scratchpad” in the center and bold
“Date” beside the upper-right writing line (replacing “Session / date”).
All 34 focused overview tests pass; no full print rerun for this text-only tweak.
Verification: 43 focused overview/layout tests, web typecheck, focused lint and
production build pass. `node scripts/check-print.mjs --overview-only
--firefox-scratchpad --scratchpad-preview` passes all four Chromium PDF variants
and four Firefox print-preview geometry variants, with exact-once power coverage,
side-by-side pane proportions and no surge grouping gaps. The overflow stress
fixture now uses 160px rows (80px rows all fit in parallel columns), retaining
the same overflow/restoration assertions. The generated Chromium preview was
visually reviewed. No full milestone/card gate was run.

Measured row/group heights and panel/caption gaps replace fixed power-count
limits. Encounter and daily lists share available space, shared-use groups remain
intact, and excess rows continue on immediately adjacent pages at a separately
measured full width. Resizing restores rows; no text shrink is used. Handwriting
areas and health do not move or contract as power lists grow. Oversized custom
groups remain visible with an overflow warning. These are paper affordances,
not persisted Play state. The isolated prototype's stale even-row CSS assertions
now reflect the previously accepted first-row-shaded production convention.

Verification via the project Nix environment: 44 focused overview/scratchpad/
prototype tests, web typecheck, focused lint and production build pass.
`node scripts/check-print.mjs --overview-only --firefox-scratchpad` passes all four
Letter/A4 × color/monochrome Chromium PDF checks (11 overview fixture pages each,
no overflow) and four Firefox print-preview geometry checks. Both engines verify
13 markable surge segments in one bar with 13/10/5/0 labels, preserved writing
space, correct projected Surge HP, exact-once power coverage, dense-row measured
continuations and restoration after space returns. A Chromium scratchpad screenshot
was visually reviewed (`--scratchpad-preview`). Synthetic fixture surge input was
corrected from a displayed total to the native additive-bonus convention; no rules
formula changed. No full milestone/physical-card suite was run. M5.6 remains open
for reference-page refinement and the separately recorded
summary-continuation formatting issue.

Reference first draft (2026-10-15): implemented for owner feedback. Printed order
is summary/optional nearby reminder continuation, scratchpad/usage continuations,
the existing power/item card pages, then full character references. Card pages
remain outside the overview's typography wrapper so their accepted presentation
does not inherit reference styles. No rules calculations or mutable Play state
are changed.

Feature references have visible origin sections (class, race, theme, background,
paragon path, epic destiny, feats, other), sorted by known acquired/granted level
then name, with unknown levels last and explicitly marked. Evaluated occurrence
ancestry resolves generic features to their granting origin; legacy fallback
follows explicit automatic grants from selected origins. Core starting grants
count as level 1. Publication Source remains separate. Full feature/feat rules
remain present, including precalculated and access-only selections excluded from
page-1 reminders. Identical authored Benefit/Flavor text already present in the
description is not repeated. Theme root overviews (identity/origin narratives,
like a whole Class/Race description) are not printed as feature cards. Their
separately granted features retain native feature types and Theme provenance,
so they remain in Theme references; granted powers keep their power cards. This
is a root-entity boundary, not a name/length-based flavor-text heuristic, and
does not remove full descriptions from actual feature cards or change the model.
Background root references retain authored Benefit, Associated Skills/Languages
and prerequisites, excluding story/Common Knowledge/campaign fields. Explicitly
labeled prose Benefit tails are retained when no structured Benefit exists.
Story-only background roots produce no empty card; unresolved legacy-only text
is preserved rather than semantically guessed away. Full raw feature descriptions
remain in the model, and actual granted feature cards are not abbreviated. An
explicit Background Benefit is retained in overview fields even when identical
to its description, so mechanics-only projection cannot lose it as a duplicate.

Reference headings use subtle origin-category tints without the oversized
repeated page title or per-card category strip. Variable-height panes retain
readable body text, quiet source footers, known level metadata and explicit
missing-full-text notices. Each category has one prominent opening heading,
with its tint carried by subsequent pane headers and borders across columns and
pages. Feature/ritual/character-record categories now form vertically stacked
full-width sections: a single heading above a category-local two-column block.
Contiguous level/name order runs down the left column then down the right, with
the split balanced by measured card heights; the next category starts beneath
both columns. Large categories continue onto later pages without repeating their
opening heading. Oversized cards retain measured prose continuations, and the
whole category is moved intact to a fresh page if its balanced block fits there
but not in the remaining space. Only categories larger than a page split, keeping
their first two cards with the heading when feasible. This applies to every
category, not just the last one (often Feats).
Summary reminder continuation and full-width indexes remain separate. Category
titles are larger, unboxed and underlined to distinguish them from pane headers.
References present existing character entities: synthetic defensive summaries
and expanded reminder entries are omitted; page-1 defensive traits remain unchanged.
At-will/encounter/daily index panes use subtle green/red/gray headers, with neutral
monochrome output. Internally chunked long paragraphs
rejoin within each rendered pane; only actual continuation boundaries divide
them. Reference continuations repeat titles and retain their complete parts.

Recorded XP appears as a small "Recorded: …" label within the existing scratchpad
XP writing box, aligned to the right of its XP label and leaving writing space
below, within Treasure & consumables on the right. Session notes occupies the
wider left pane; both panes continue filling the available height. XP does not
appear in page-1 identity metadata, restoring the compact
three-row Theme/Paragon/Epic box. The standalone Advancement card remains removed,
so XP alone cannot create a Character Record page. Missing XP leaves the writing
box blank; explicit zero remains visible.
Verification: 58 focused overview tests and web typechecking pass. The print
matrix was not rerun for this small placement adjustment.
The subsequent pane swap passes 72 focused overview/scratchpad tests, including
Session notes first and XP scoped to Treasure & consumables. The print matrix
was not rerun for this simple order/ownership swap.

Items and power indexes use full-width panes. Items opens with Currency above
two-column Equipped (breaking after Feet like the builder), then Inventory.
The independent Equipped tables size slot labels to their contents like the
builder, keeping Holy Symbol unwrapped without over-widening the left labels.
Inventory has
two category columns, assigning each category to the shorter column by estimated
printed lines and preserving category order within each column. Whole categories remain in one column, even if that leaves a
shorter/empty partner column. Measured pagination moves categories intact;
only a category taller than a fresh page column may split, repeating its heading.
Equipped lists open
ordinary slots with an em dash, preserving builder slot order/icons; conditional
implement/companion slots appear when occupied. Currency uses current-level
carried/stored wallet text (latest applicable per-level key, legacy details as
fallback). Currency reuses page-1-style numeric groups with small denomination
labels above prominent counts in softly tinted cells. Carried and Stored are
always side by side, with no separate Total group or denomination conversion. Unknown/custom text is
preserved below the groups and never silently converted to zero. Inventory uses a
reserved leading quantity prefix (2×, 3×; blank for one) rather than a Qty column;
item names naturally indent beneath flush-left category headings. Row striping
restarts with a shaded row in each category, including continuation starts.
The generic reference-table odd-tbody rule excludes Inventory: its type-selector
specificity previously overrode the clear category-local rows after odd-length
categories. The print harness verifies computed backgrounds for two consecutive
three-item categories, not merely the assigned stripe classes.
Verification: production build and all four Chromium overview-only print cases
pass, including that computed-style regression; Firefox was not rerun.
Redundant carried/stored character-note cards are omitted. Equipment/Currency
are measured as a stacked block; inventory pagination retains complete category groups
and repeats category headings at continuation starts. The equipment-layout
follow-up passes 57 focused overview/sheet-model tests, web typechecking, focused
lint, and the production build. The Chromium overview-only Letter/A4 ×
color/monochrome print check passes without overflow and verifies the paired
panes, open slots, four inventory columns, and per-item equipped markers. Firefox
and the full physical-card/milestone suite were not rerun for this feedback slice.
The subsequent two-column Equipped/full-width wallet refinement passes 56 focused
overview/wallet tests, web typechecking, focused lint and production build, plus
the same four Chromium overview print cases with no overflow. The Items page was
visually inspected using nonzero carried/stored synthetic balances. Wallet tests
cover zero/absent stored funds, per-denomination totals, unknown/custom text and
unknown versus known-zero balances. The category-preserving Inventory/numeric
Currency follow-up passes 61 focused overview/wallet tests, including wrapped-name
line estimates, intact-category pagination, and oversized-category preservation.
Web typechecking, focused lint and the production build pass; the four Chromium
overview print cases remain free of overflow. The print harness retries temporary
directory cleanup briefly to tolerate Chromium's late profile writes. Owner visual
review remains open. The slot-width/category-striping/quantity-prefix refinement
passes 62 focused overview/wallet tests. Currency now precedes Equipped, with
Carried and Stored always side by side and no Total group; explicit zero balances
and unknown/custom balances remain distinct. A known zero Stored balance fades
its whole group to 50% opacity without changing layout; unknown/custom balances
do not fade. That opacity-only follow-up passes eight focused wallet tests;
the print matrix was not rerun for it. Web typechecking, focused lint,
production build, and four Chromium overview print cases pass; rendered Items
pages were visually inspected. Firefox/full milestone gates were not rerun.
Features,
rituals and character prose use category-local two-column blocks. The power index columns are
Power, Level, Range, Target, Attack and Damage. Action icons precede power names;
item-power indexes likewise place icons beside item names, leaving Item/Usage
columns. Attack/damage values use weapon-independent authored formulas, preserving
intrinsic power offsets (STR+2 vs AC) and [W] expressions rather than selecting an
equipped weapon. Multiattack phases retain their own formulas and explicit
targets; secondary targets are not inherited without authored metadata. Missing
authored formulas point to the card, never reverse-engineer a cached total. Unfamiliar
damage formulas point to the card rather than absorbing riders. Legacy range,
target and level are retained separately as index metadata, without adding them
to physical-card rule fields. References now precede physical power/item cards.
Numbering is continuous from summary through summary/scratchpad continuations,
references, and cards (1 through N; no R prefix). The overview owns measured
scratchpad/reference page counts and passes the next page offset to card rendering.
Fixed card dimensions remain unchanged; card-page numbers sit in the existing
bottom margin on the same full-sheet named Letter/A4 pages used by the overview.
Verification: 88 focused overview/scratchpad/print-layout tests, web typechecking,
focused lint, and production build pass. The print-layout source contract now
follows the previously extracted defaultPrintAttacks helper and still asserts its
legacy fallback path; attack calculations are unchanged. Running
`node scripts/check-print.mjs --overview-only --include-card-pages --firefox-scratchpad`
through Nix passes eight Chromium/Firefox Letter/A4 color/monochrome cases,
including every printed PDF footer numbered 1–16, references before cards, exact
card sizes and footer bounds, and no extra blank transition pages. This explicit
document-order diagnostic includes card pages but does not evaluate the separately
recorded dense-card content-overflow blocker. The default gate's assertion stays
unchanged.
Basic attacks are regular Power Index entries; their standalone alternatives
tables and page-link plumbing are removed. Page-1 omitted-weapon notes point to
power cards, which retain the complete comparison tables.
Character-specific at-wills and universal at-will actions share one green pane
and one set of column headings. A full-width "Universal actions" table
subheading introduces the universal rows, using white fill and quiet green rules;
it stays attached to its first power and repeats at continuation starts. The sheet
model marks universal powers only from unconditional generic
Level1Rules grants (including generic grant containers, excluding conditioned or
later-level grants). Class/power names and publication Source do not establish
universal availability. With unavailable content, provenance remains unknown
rather than guessed. Explicit nonempty Rules Item fields identify rules records
such as Divine Sanction: their complete Rules Item text becomes a normal feature
reference card under explicit class/race/theme/background/path/destiny origin
metadata, falling back to evaluated/grant ancestry and then Other Features.
Non-reference metadata is not dumped into the body; authored additional fields
and source are retained. No separate name-only rules index remains. The underlying
power/physical card remains intact. Reference-only projections are added after
summary/reminder/defensive processing so long rules descriptions cannot change
page-1 reminder or defensive-trait inference. Power Type Feature or No Action
alone never cause exclusion.
Only the power index switches back to formulas; physical-card calculations and
weapon comparison tables retain their accepted behavior.
Character-sheet power cards on screen and in print sort specific at-will,
universal at-will, encounter, daily. Within each group, the shared table/card
action hierarchy comes first (standard, move, minor, free/no action, reaction,
unknown), then non-utility/attack before explicit utility and alphabetical names.
Unknown usage
follows known usage; Rules Item cards follow actionable powers, before items.
This changes no builder-dialog/table or scratchpad action ordering.
"Equipped by slot" is a Slot/Item lookup using the builder's body/held/other
slot order, labels and icons (unknown slots last), then item name. "Inventory" includes
all owned quantities (including equipped holdings) in Item/Qty columns, with a
superscript E indicating equipped holdings and a small legend. It is divided by the builder's inventory
category labels/order. The UI injects its existing authored-role classifier into
both evaluated and legacy sheet projections; the sheet model retains optional
category metadata rather than duplicating UI taxonomy or guessing from names.
No private corpus or UI dependencies enter the shared model. Unknown categories
remain visible under Miscellaneous. Category rows are table row-group headers,
kept with their first item and repeated at continuation starts.
Category subheaders have white backgrounds and quiet rules instead of a tint
that blends with alternating row fills. Reference pages omit the running top
header; their three-part footer has name · race class level at left, Character
Reference centered, and the continuous page number at right. Long identity text truncates on one
line rather than displacing the centered title. Scratchpad/summary continuations
now follow this footer-only layout too; page 1 now uses identity/title/number
instead of a source-status note. Reference measurement probes use
the same footer layout and omit the header too, reclaiming that content space.
The footer refinement passes 56 focused overview tests, web typechecking, focused
lint, production build, and all four Chromium overview print cases without
overflow. Rendered reference pages were visually inspected; Firefox/full milestone
gates were not rerun.
Verification of these lookup-table refinements: all 40 overview tests pass,
including explicit/fallback slot ordering, carried spares and updated basic-attack
reference links. No full print matrix was rerun for this small table change.

Reference feedback follow-up verification (2026-10-15): 54 focused web
overview/index/layout tests, web typecheck, focused lint and production build
pass. `node scripts/check-print.mjs --overview-only --firefox-scratchpad
--reference-preview` passes all four Chromium PDF and four Firefox variants
(13 overview fixture pages, no overflow). Checks include one opening heading per
category, absence of synthetic defensive/reminder entries, three distinct usage
tints in color and neutral monochrome headers. Feature/index previews were
visually reviewed. Owner review of the reference draft remains open.

Category-opening reflow follow-up: 55 focused overview/index/layout tests pass,
including two-card keep-together, sufficient remaining space, oversized-pair
fallback and unchanged summary continuation. Web typecheck, focused lint,
formatting and production build pass. The overview-only Chromium/Firefox print
matrix again passes all eight variants with no overview overflow (13 fixture
pages). The larger unboxed category titles are included in these measurements.

Category-local two-column follow-up: 58 focused overview/index/layout tests,
web typecheck, focused lint and production build pass. Tests cover balanced
contiguous ordering, stacked origins, page deferral and complete oversized-card
continuations. The public print fixture now includes four class features and two
racial traits so browser checks exercise populated paired columns and full-width
category headings, not just one-card sections. All four Chromium PDF and four
Firefox overview variants pass (13 fixture pages; no overflow), with complete
entry coverage and unchanged index/card boundaries. The feature preview was
visually reviewed. Owner reference review remains open.

Builder-aligned equipment follow-up: 98 focused overview/equipment/model tests,
web typecheck, focused lint, formatting and production build pass. The
overview-only Chromium/Firefox matrix passes all eight variants (13 fixture
pages, no overflow), including Slot/Item equipped headers and grouped Item/Qty
Inventory headers. Tests cover canonical slot order, authored slot fallback,
carried/spare quantities, category metadata projection and shared builder
classification. M5.6 reference review remains open.

Whole-category reflow follow-up: all 44 focused overview tests pass. Parameterized
Feats/Racial traits regressions verify intact movement to a fresh page, even
before a later category, while genuinely oversized categories still split and
preserve all entries. The existing space-available case remains covered. No full
print matrix was rerun for this small pagination-policy adjustment.

Theme-root follow-up: inspected the ignored Guardian Theme definition and its
explicit level-1/5/10 Class Feature grants; the root contains origin narrative,
while benefits are separate features. 48 focused overview/provenance tests pass,
including omission of a synthetic Theme root while preserving a granted Class
Feature under Theme. No private text was added to public fixtures. No full print
matrix was rerun for this reference-entry selection adjustment.

Background follow-up: inspected the ignored background definitions' explicit
Benefit/Associated Skills/Associated Languages/Common Knowledge structure.
65 focused overview/model tests pass, covering compact mechanical fields,
description-equal Benefits, inline Benefit fallback, flavor-only omission and
unresolved legacy text preservation. Web typecheck and focused lint pass. No full
print matrix was rerun for this content-selection adjustment.

Inventory/header follow-up: 59 focused overview/scratchpad tests, web typecheck,
focused lint, formatting and production build pass. The overview-only print
matrix passes four Chromium PDFs and four Firefox variants (13 fixture pages,
no overflow), checking page-number-only reference footers, equipped slot icons,
full-inventory inclusion of a fully equipped holding, and unchanged summary
continuation/scratchpad numbering. Unit tests cover total stack quantities,
equipped superscripts and the retained page-top identity header. Owner reference
review remains open; M5.6 is not closed.

Consolidated power-index follow-up: 82 focused overview/index/print-attack/
scratchpad tests, web typecheck, focused lint, formatting and production build
pass. The shared default variant/phase helper is extracted from the accepted
physical-card path without changing its selection semantics; indexes consume
those existing results rather than recalculating attack math. Tests cover
equipped-main preference, distinct secondary totals, equipped off-hand fallback,
unknown cached secondary totals and basic-power inclusion without separate
tables. All eight overview-only Chromium/Firefox variants pass (13 fixture pages,
no overflow), checking six index columns, inline action icons, calculated/explicit
unknown attack cells and absence of standalone basic tables. The index preview
was visually reviewed. Reference review and M5.6 remain open.

Weapon-independent/grouped-index follow-up: inspected ignored generic starting
grants and the explicit Divine Sanction Rules Item definition. 162 focused
sheet-model/overview/index/print-attack tests, web typecheck, focused lint,
formatting and production build pass. Regressions verify ignoring equipped/cache
totals, preserving authored per-phase formulas, rules-item separation without
excluding legitimate No Action powers, conditional/later-level grant rejection,
and conservative behavior without content. The overview-only Chromium/Firefox
matrix passes all eight variants (13 fixture pages, no overflow), checking
formula/explicit See-card attack cells rather than weapon-specific totals.
The cache-only public print fixture cannot supply authored formulas; exact
formula and grouping assertions live in synthetic model/UI tests. Original
cards and physical-card math remain unchanged. Reference review remains open.

Full rules-card follow-up: removed the name-only Rules references index. Rules
Item records project their complete authored text into origin-grouped feature
cards, retaining native identity/source and any additional authored fields.
71 focused overview/model/provenance tests, web typecheck, focused lint and
formatting pass. Tests cover full Class Features text, explicit Class routing,
historical missing-ID field fallback, unknown-origin preservation, no new page-1
reminders, original power retention and absence of the name-only index. No full
print matrix was rerun for this content-placement refinement. M5.6 remains open.

Card-order/terminology follow-up: renamed Common to Universal at-will actions;
its pane-to-subheading redesign awaits owner choice. Applied the requested
specific at-will/universal at-will/encounter/daily card order to screen and print,
with utility metadata and alphabetical tie-breaks; rules-only cards follow
actionable powers. 55 focused card-order/index/overview tests, web typecheck and
focused lint pass. Input card arrays are not mutated. No full print matrix was
rerun for this ordering-only refinement.

At-will consolidation/action-order follow-up: implemented the owner's option 1,
one at-will pane/table with an internal Universal at-will actions divider and no
repeated column headings or separate universal card. The table category-row
mechanism retains heading/first-power attachment and continuation context.
Cards and power tables share one action-rank helper; within usage groups action
rank precedes utility and alphabetical tie-breaks. 68 focused order/overview/
index/scratchpad tests, web typecheck, focused lint, formatting and production
build pass. Tests assert the single table header, six-column subsection, absence
of a separate universal pane, all action ranks and action-before-utility behavior.
No full print matrix was rerun for this feedback iteration; owner visual review
and M5.6 remain open.

Verification: 139 focused sheet-model/overview/index/layout tests, web typecheck,
focused lint and production build pass. The overview-only print check passes
four Chromium Letter/A4 color/monochrome PDFs (13 overview fixture pages each)
and four Firefox geometry variants, covering post-card ordering, isolated card
styles, reference-entry coverage, separate Range/Target columns, table bounds,
scratchpad invariants and long-note preservation. The PDF text check normalizes
extracted whitespace before checking the final note phrase, since natural
paragraph flow can wrap it across lines; no words or evidence are dropped.
Feature and index previews were visually reviewed. `--reference-preview` retains
optional diagnostic screenshots. No full milestone/physical-card gate was run;
owner reference review, summary-continuation styling and the recorded dense-card
boundary remain open. M5.6 is not closed.

Calculated superior-implement modifiers (2026-10-15): Attack/damage projection
now consumes comma-conjoined, item-limited stat channels using each attack's
defense and the power's keywords. This follows recovered native `CalcKeywords`,
`IsKeyword`, `IsLimiterName`, and shared typed maxima; no property-name-derived
second bonus is invented. Item- and training-feat-provided rules both work,
preserving training requirements and tier-scaled expressions. Unenchanted
Superior Implement bases also appear as variants. Bonuses do not leak between
inventory alternatives or from weapon expertise onto implement attacks, and
matching channels deduplicate provenance and obey typed stacking. Undeniable,
Unerring, Unstoppable and Energized move from manual reminders to reference-only
traits because their encoded conditions are now resolved by the calculator.
Evaluation cache v8 invalidates pre-fix v7 totals.

Verification through `nix develop path:. -c ...`: 273 tests pass across the rules
and sheet-model suites plus app-runtime and print-variant tests (`pnpm exec
vitest run packages/rules-engine/src packages/sheet-model/src
apps/web/src/app-runtime.test.ts apps/web/src/PrintPowerVariants.test.tsx`).
Rules-engine/web typechecks, focused lint and web production build pass. The
ignored `tmp/audit-qualified-implement-bonuses.ts` checks 42 controlled cases
using actual local superior-implement/training/tier definitions: seven implements,
levels 8/18/28, trained/untrained. These are local-content calculation diagnostics
with synthetic spells, not original-application character-export goldens. Public
fixtures are synthetic; proprietary content remains ignored. The earlier
sheet-model test-file typecheck limitation remains separately recorded; no full
milestone/physical-print gate was run, and M5.6 remains open.

Named weapon/implement reminder classification (2026-10-15): Explicit
show/reference-only trait sets replace prose-trigger guessing for the known
weapon/implement property families. Handling/loading/thrown/reach/size traits and
unconditional numerical traits stay in item rules, not reminders. Situational
benefits (including Brutal, High Crit, Versatile, Defensive and triggered superior
implement benefits) retain authored explanations. Numeric/damage-type parameters
normalize for policy lookup without being removed from displayed descriptions.
Unknown custom traits retain the existing heuristic; independent freeform magic
item properties are unaffected. See `sheet-overview-prototype.md` for both lists.

Verification: 69 focused item-reminder/sheet-model/overview tests pass, including
all known classification families, numeric parameters, authored Full Text and
generic-definition paths, custom fallback and independent enchanted properties.
A read-only local-corpus Greatbow check confirms Properties=Load Free and zero
reminders. Focused lint and the web production build pass. Package typecheck
fails at the pre-existing, unchanged
`packages/sheet-model/src/index.test.ts:922` (`delete older.equipmentId`, TS2790);
that exact line is also present in HEAD. This is not a milestone closure.
Remaining review issue: summary continuation still uses reference-card styling
rather than page-1 reminder panes, and its one-reminder caption needs singular
grammar. Removing ineligible traits can remove unnecessary continuation pages,
but does not correct that separate presentation mismatch.

Numeric-group color swap (2026-10-15): Swapped the complete Defenses and Health
palettes (text, tint and separator): Defenses is sage green, Health muted violet.
Other colors and layout are unchanged. Updated focused browser color assertions;
only diff/whitespace checks were run for this direct palette swap.

Defense-group accent feedback (2026-10-15): The Defenses numeric group now uses
muted violet, distinct from the body panes' slate blue. Health remains sage green
and Initiative/Speed teal; grayscale behavior is unchanged. Production build and
all four Chromium overview-only Letter/A4 × color/monochrome checks pass, including
the updated numeric-group color assertion. No full milestone gate was rerun.

Numeric-band palette clarification (2026-10-15): The uniform slate-blue treatment
applies only to body pane headers. The top numeric groups retain their previous
colors: slate-blue Defenses, sage-green Health, teal Initiative/Speed. All numeric
labels, fills and borders follow those group colors; body panes stay slate blue.
Verification: production build and four Chromium overview-only Letter/A4 ×
color/monochrome checks pass, including explicit numeric-group and uniform-pane
color assertions. No full unit/milestone gate was rerun for this CSS correction.

Unified summary accent (2026-10-15): All first-page overview pane headers and
numeric groups share muted slate-blue text, tint and separators. Category-specific
rust, ochre, green and teal overrides are removed; layout, headings and icons carry
the grouping instead. Body text/striped rows remain neutral, monochrome retains
explicit grayscale, and physical power/item card usage colors are unchanged.
This supersedes the earlier functional summary palette experiments below.
Verification: production build and all four Chromium overview-only Letter/A4 ×
color/monochrome checks pass, with shared slate-blue tint assertions and no
overview overflow. Full unit/milestone gates were not rerun for this CSS change.

Summary naming/color feedback (2026-10-15): The defensive-traits pane and its
reference entry are now named Resistances & Weaknesses, reserving Defenses for
AC/Fortitude/Reflex/Will. Senses inherits the same teal accent, tint and separator
color as Skills/Abilities/Languages rather than a separate lavender palette.
Verification: 28 focused overview tests and production build pass; all four
Chromium overview-only Letter/A4 × color/monochrome checks pass without overflow,
including matching Senses/informational-pane accent assertions. No full milestone
gate was rerun for this label/style refinement.

Summary pane placement feedback (2026-10-15): Senses now precedes Skills in the
left-column flow, followed by Abilities/Languages and Basic Attacks. The Defenses
trait pane is fixed above the right-column reminders, so additional defensive
traits consume reminder space rather than displacing Skills or Abilities. Whole
left-pane overflow handling and adjacent reminder continuation remain unchanged.
Verification: 28 focused overview tests, focused lint and production build pass.
All four Chromium overview-only Letter/A4 × color/monochrome checks pass without
overflow, including a new regression assertion that growing the Defenses pane
leaves the left-pane placement unchanged. No full milestone gate was run.

Adjacent summary reminder continuation (2026-10-15): The defensive-traits pane
is now titled Defenses. Reminders omitted by measured page-1 fitting continue
immediately on an optional summary page 2, before the scratchpad. Category labels
and distinct item-benefit bullets are retained. Shared measured reference-card
pagination handles unusually long reminders across adjacent continuation pages;
the scratchpad's page labels follow the actual continuation count. Matching
summary reminders are removed from the later reference reminder collection;
expanded reference-only core-power descriptions and full feature/item rules
remain. Hidden measurement surfaces retain layout geometry in print media while
staying clipped and invisible, allowing continuations to be added or removed
after a paper-size/media change.

Verification: 28 focused overview tests, web typecheck, focused lint and production
build pass. All four Chromium overview-only Letter/A4 × color/monochrome checks
pass (12 normal fixture pages each, no overview overflow). Each also forces
reminder overflow and verifies an adjacent page 2 with all omitted reminders,
scratchpad relabeling to page 3, and removal/restored numbering when space
returns. No full milestone/physical-card suite or Firefox print matrix was run
for this slice. M5.6 remains open for real-character review.

Reminder wrapping feedback (2026-10-15): Reminder paragraphs use `text-wrap:
pretty` as progressive enhancement; Firefox currently falls back to normal
wrapping. A `balance` experiment was verified in headless Firefox 154 but rejected
after visual review because the evenly balanced lines looked awkward. Existing
paragraph grouping, bullets and insets are unchanged. No full-sheet pagination
or milestone gate was rerun for this CSS-only adjustment.

Structured reminder benefit bullets (2026-10-15): Grouped item-property reminders
now retain distinct authored property fields/named-property explanations as
structured elements in addition to their compatible combined text. Multi-element
reminders render one bullet per element under the shared heading, with no second
inset on nested paragraphs. Paragraph breaks inside one property stay within that
same bullet. The shared renderer accepts elements in any reminder category, but
does not invent boundaries in unannotated prose. Group fitting still measures the
whole entry as one unit; original text and reference data remain recoverable.

Verification: 51 focused item/model/render tests, web typecheck, focused lint and
production build pass. A read-only native Ingi check confirms Defensive Warhammer
+2 has two elements. Browser checks verify visible bullet style and a single
description inset; all four overview-only Letter/A4 × color/monochrome print
checks pass (12 measured pages each, no overview overflow). Full milestone and
physical-card gates remain separate.

Reminder block-inset feedback (2026-10-15): Bold reminder titles stay flush left;
the entire description block is now inset 1em, including wrapped lines. Paragraph
first-line indents are removed, with no extra paragraph gaps and unchanged spacing
between independent entries. This supersedes the first-line-indent experiments.
Verification: production build and formatting pass; browser assertions check the
block inset, zero paragraph indents/gaps and preserved inter-entry spacing. All
four overview-only Letter/A4 × color/monochrome print checks pass without overflow. Full
unit/milestone checks were not rerun for this CSS-only adjustment.

Reminder paragraph grouping (2026-10-15): Paragraphs within a reminder now have
zero internal vertical gaps/margins; the first paragraph stays flush left and
later paragraphs use a 1em first-line indent. Existing spacing between independent
entries remains intact across item/class/racial/feat reminders. Verification:
production build and all four overview-only Letter/A4 × color/monochrome checks
pass with no overview overflow. A focused browser style assertion checks zero
paragraph gaps, subsequent indentation and positive inter-entry spacing. The
full unit/milestone suite was not rerun for this CSS-only change.

Concise page-one reminders restored (2026-10-15): Page 1 now uses reminder
candidates captured before expanded core-power descriptions are consolidated.
This removes the newly added Oath/Challenge descriptions from the summary while
retaining earlier concise feature/effect reminders, including calculated quarry
damage. Core class-power discovery, provenance checks and full reminder references
remain intact. Summary fitting/probes/overflow counts use only summary-eligible
candidates; reference-only expansions do not trigger a misleading overflow count.
Verification: 52 focused overview/render/core-discovery tests, web typecheck and
focused lint pass. Regression coverage preserves concise candidates separately
and verifies expanded text is absent on page 1 but retained in references. No
calculation or layout-structure change; full print/suite gates were not rerun.

Core class-power reminders (2026-10-15): Added metadata-driven discovery through
the selected class's level-one feature grants and explicit feature-to-owned-power
links, including intermediate Grants containers and evaluated grant ancestry.
The usefulness filter selects non-attack ongoing target-dependent powers; it does
not restore ordinary attacks, instantaneous healing with only a temporary personal
drawback, or grant/shared-use containers. Selected class identity prevents other
active class records from supplying unrelated core powers. Reminder names/text
come from the granted power (useful authored summaries first, otherwise full
evaluated mechanical fields), merging known conditional damage once rather than
duplicating its feature reminder. Full feature references, power cards, builds,
calculations and evaluation-cache semantics are unchanged.

Private-data checks: Hu has one Oath of Enmity reminder alongside Censure of Unity;
Ingi's current native backup has Divine Challenge; Silaqui retains one Hunter's
Quarry reminder with its authored designation summary and calculated extra-damage
text. An additional fighter sample retains its existing feature reminders rather
than duplicating its attack power. The first broad probe also surfaced an
instantaneous healing candidate; selected-class and personal-drawback safeguards
exclude it. These are local content evaluations, not new same-profile golden
parity claims. No proprietary definitions/descriptions enter public fixtures.

Verification: 58 focused core-power/overview/model/render tests, web typecheck,
focused lint, formatting and production build pass. All four overview-only
Letter/A4 × color/monochrome print checks pass (12 measured pages each, no overview
overflow); full physical-card
and milestone exit gates remain separate. M5.6 is still open for real-sheet review.
Discovery remains conservative when level/grant ownership metadata is unavailable;
long mechanical reminders use the existing measured-fit/reference fallback rather
than losing restrictions through automatic truncation.

Known-source conditional reminder categories (2026-10-15): Additional Effects
whose selected feature is an access-only power grant now retain that feature's
known source category while keeping the evaluated effect text. Previously this
fallback incorrectly assigned Other reminders even after resolving a Class
Feature provider. Grant-only features without an independent effect remain
excluded; unknown sources remain Other reminders, with no named-feature exception.
A private Silaqui evaluation reproduces the old misclassification and confirms
one Hunter's Quarry entry under Class features after the fix. The small pending
header-note follow-up uses a Unicode ellipsis (`More on pg R…`).
Verification: 41 focused overview/render tests, web typecheck and focused lint
pass. No calculation or layout change; the print matrix/full suite was not rerun.

Compact Basic Attacks reference note (2026-10-15): Removed the two-line body
caption about additional weapons. When eligible alternatives are omitted, a
muted right-aligned header note now reads `More on pg R…`, using the first
Basic attack alternatives page from measured reference pagination and the sheet's
existing R-page labels. Until pagination resolves it says `More in references`;
there is no note when all eligible variants fit. Weapon calculations and reference
contents are unchanged. Verification: 25 focused rendering/fitting tests, web
typecheck, focused lint, formatting and production build pass. All four
overview-only Letter/A4 × color/monochrome PDF checks pass (12 measured pages
each, no overview overflow); full milestone/physical-card gates remain separate.

Palette feedback (2026-10-15): Health changes from rose to sage green to distinguish
it from rust-colored attacks. The separate Senses pane uses lavender rather than
sharing the teal Skills/Abilities/Languages accent. Grayscale overrides are
unchanged. Browser palette checks distinguish these pairs; production build and
all four overview-only Letter/A4 × color/monochrome print checks pass with no
overview overflow. No calculation or layout changes; the full suite was not rerun
for this color-only adjustment.

Functional summary palette / eligibility-cache invalidation (2026-10-15): Page 1
uses muted rust for Basic Attacks, slate blue for Defensive Traits/Defenses, teal
for informational panes and Initiative/Speed, ochre for Reminders, and soft rose
for Health. Color is confined to headings/icons and numeric-group accents; body
text and table stripes remain neutral. Monochrome mode explicitly replaces these
accents with grayscale without rasterizing PDF text. Later pages/cards are unchanged.

The evaluation-cache revision advances from v6 to v7 to invalidate results created
before weapon basic-attack eligibility/inventory-identity metadata was added. The
old revision could admit variants without eligibility metadata; the UI deliberately
retains unknown/custom cases rather than pretending they are known-invalid. Fresh
local evaluation marks Hu's Way-Leader Gouge melee-only, consistent with its base
weapon metadata and absence from the legacy ranged-basic-attack variants. The
owner's live cached value was not inspected; the concrete invalidation gap is
fixed without altering character documents, weapon formulas or unknown-data policy.
Reloading the app adopts the new version and recomputes derived results.

Verification: 77 focused runtime/render/power tests, web typecheck, focused lint,
formatting and production build pass. Runtime tests reject both the previous v6
cache and pre-multiattack versions while preserving exact current-version reuse.
Chromium checks distinguish functional accent groups and confirm grayscale
monochrome output. All four overview-only Letter/A4 × color/monochrome PDF checks
pass (12 measured pages each, no overview overflow), including existing pane-flow
and long-name checks. Full physical-card/milestone gates remain separate; M5.6
remains open for product review.

Summary presentation consistency (2026-10-15): Bold reminder names no longer have
trailing colons. Senses uses a shared Eye icon; class/racial reminder panes reuse
the builder's class/race mappings instead of showing the feat icon for every
non-item category. Skills/Abilities now shade the first row, consistent with
Languages, Basic Attacks and continuous Defensive Traits striping. First-page
names fit from 27pt to a minimum 18pt, then use single-line ellipsis with the full
name retained in the heading/title tooltip. Name/font/width changes remeasure the
heading without changing stored identity or card typography.

Verification: 24 focused rendering/fitting tests, web typecheck, focused lint,
formatting and production build pass. Chromium presentation checks verify the Eye
glyph, shaded first table rows, the 18pt floor/ellipsis under a very long name,
and restoration after the diagnostic. All four overview-only Letter/A4 ×
color/monochrome PDF checks pass (12 measured pages each, no overview overflow),
alongside the pane overflow/restoration checks. Full physical-card and milestone
exit gates remain separate; M5.6 is still open.

Opportunistic summary columns (2026-10-15): Preferred left order is Defensive
Traits, Skills, Abilities/Languages (one unit), then Basic Attacks. Senses leads
the right column. Measured whole-pane fitting keeps a prefix on the left and
moves the first unfitting pane plus its ordered suffix below Senses and above
Reminders. Reminder fitting uses only the remaining right-column space. Equal-
width hidden probes and resize/font/content checks allow panes to return left
when room increases; no table splitting or fit-driven text shrinking is added.
Basic Attacks retains its usual two alternatives per attack kind rather than
dropping alternatives merely because the left column is full. Full references
and the existing visible overflow warning remain the recovery boundary for data
too large for both columns.

Verification: all 22 focused rendering/fitting tests, web typecheck, focused lint,
formatting and production build pass. The Chromium print check now forces actual
last-pane overflow using a temporary CSSOM height constraint, verifies placement
before reminders/above the footer, then verifies restoration after removing it.
All four overview-only Letter/A4 × color/monochrome PDF checks pass (12 measured
pages each, no overview overflow). Full physical-card/milestone gates remain
separate; M5.6 is still open for product review.

Summary Senses pane (2026-10-15): Vision and special senses now appear below
Defensive Traits and above Basic Attacks, rather than in a small line under Skills.
Projection reads explicit Vision/Senses fields on selected definitions, matching
stats and selected rules of type Vision. This covers racial Low-light metadata
without guessing from arbitrary feature names. Duplicates collapse; enhanced
vision suppresses redundant Normal vision. Special-sense direct-provider sentences
retain authored ranges/conditions, with explicit numeric sense stats as a range
fallback; missing ranges are not invented. Temporary senses expressed only in
item/power prose are not exhaustively inferred and remain in full descriptions.
The earlier approved identity label-column widening (0.85in to 0.95in) is included.

Verification: 48 focused senses/overview/model/render tests, web typecheck, focused
lint, formatting and production build pass. Read-only private-content checks show
Low-light vision for Silaqui and Normal vision for Hu without adding private data
to public fixtures. The print fixture now explicitly has Low-light vision; all
four overview-only Letter/A4 × color/monochrome PDF checks pass (12 measured pages
each, no overview overflow). Full physical-card/milestone gates remain separate;
M5.6 is still open for product review.

Identity subtitle refinement (2026-10-15): Player/company subtitles now omit field
labels and blank values, adding a center dot only between actual values. An empty
subtitle takes no space; the three-row identity box retains its labeled em-dash
placeholders. All 20 focused rendering tests pass, including a blank-company case.
No calculation or structural print change; the full print matrix was not rerun.

Compact identity follow-up (2026-10-15): Player and Company move from the bordered
box to a muted line beneath race/class/level, separated by a center dot. The box
now has only Theme, Paragon path and Epic destiny, reducing its height and pressure
on summary-body space. Missing values still use em dashes in both locations.
Verification: all 19 focused overview rendering tests and focused lint pass;
formatting is checked. This small follow-up does not change calculations; the
print matrix/full milestone gate was not rerun.

Identity details box / development-module diagnosis (2026-10-15): Summary identity
details now always show Player, Company, Theme, Paragon path and Epic destiny in a
bordered label/value box, with delimited rows and em dashes for absent/blank fields.
Sparse metadata no longer leaves isolated labels floating in the header.

The reported missing createEvaluatedPowerTextPersonalizer export was reproduced
as a port-5173 development-server response containing only an empty source map.
The source export exists; a fresh query returned the full module. Refreshing the
source invalidated the stale transform, after which both the original timestamped
URL and the unqualified URL returned the function again. No application export or
calculation change was necessary; a browser reload may still be needed to recover
from the failed module load. The initiating cause of the cached empty transform
has not been established.

Verification: 34 focused rendering/overview tests, web typecheck, focused lint
and production build pass. All four overview-only Letter/A4 × color/monochrome
PDF checks pass (12 measured pages each, no overview overflow). Full physical-card
and milestone exit gates remain separate; M5.6 is still open.

Concise feature reminders (2026-10-15): Matching Additional Effects no longer
replace an authored Short Description with the feature's full prose. Both direct
feature candidates and matched effect providers prefer the same authored summary,
with description fallback when absent. This preserves timing/scope omitted by
conditional stat contributions while avoiding flavor and grant text when a
mechanical summary is available. Complete feature references and original power
effects are unchanged. Synthetic coverage checks legacy/native provider matching,
deduplication, summary preference and missing-summary fallback.

Verification: 22 focused overview/model tests, focused lint and web typecheck
pass. No layout or calculation changes; the print matrix/full milestone gates
were not rerun for this text-selection fix. M5.6 remains open.

Grouped item properties / consistent variant names (2026-10-15): Item Properties
now groups distinct property paragraphs under one heading per item display name,
retaining every property and treating the group as one measured fitting unit.
Evaluated power variants carry inventory identity so sheet projection can reuse
the existing composed/custom inventory display name instead of the calculation
engine's raw component-name string. Exact native power:inventory IDs support
older in-memory evaluations without equipmentId; unresolved/unarmed names fall
back unchanged. Numerical calculations and rules identities are unchanged.

Verification: 84 focused property/model/render/power tests, web typecheck, focused
lint and production build pass. A local private-definition diagnostic confirms
one Aversion Quickbeam staff +2 heading containing all extracted properties.
All four overview-only Letter/A4 × color/monochrome PDF checks pass (12 measured
pages each, no overview overflow). Full physical-card and milestone exit gates
remain separate.

Weapon/implement property reminders (2026-10-14): Fixed two general extraction
gaps behind the owner's Quickbeam/Aversion examples. Declared `Properties`
keywords now resolve authored explanations from the same item's Full Text first
and matching Weapon Property definitions second, retaining numeric/parenthetical
parameters and nested examples. Freeform `Property` condition detection also
recognizes target-dependent wording such as `against ... enemies subject to your
effects`, rather than requiring the old small when/if/while vocabulary. The
shared inventory projection covers both native and legacy sheets and does not
depend on printing an item card. Carried/zero-quantity items, plain always-on
numeric bonuses, powers/flavor/group prose and missing descriptions are not
invented into reminders; complete original fields remain recoverable. This is
still a conservative display heuristic, not exhaustive mechanical analysis.

Verification: 43 focused property/model/render tests, web typecheck, focused lint
and production build pass. A read-only private-definition diagnostic yields
Quickbeam's Energized (thunder) and Forceful entries plus Aversion's conditional
defense property, without private definitions in public fixtures. The
overview-only Letter/A4 × color/monochrome PDF matrix passes (12 measured pages
each, no overview overflow). The physical-card/milestone gate remains separate.

Dedicated reminder column / compact defensive rows (2026-10-14): The left column
now contains Defensive Traits above Basic Attacks, then Abilities/Languages and
Skills. The right column is dedicated to source-categorized Class features,
Racial features, Feats and Item properties panes. Unattributed effects remain in
Other reminders, and empty categories are omitted. Source categories are carried
by the sheet projection, not inferred from displayed names. Measured fitting
accounts for each pane's heading, padding, row gaps and the overflow caption;
unfittable entries stay in full references. The left-column fit check includes
the blocks following Basic Attacks when choosing one/two variants per attack
kind. Its alternatives note now explicitly points to all eligible weapon rows in
the reference pages.

Defensive rows retain benefit and source columns but no visible column/category
headings; numeric clauses are self-contained (`resist 5 fire`, `vulnerable 5 cold`)
and immunity lists read `immune to ...`. Related categories remain adjacent and
spaced apart without dropping authored conditions or changing calculations.
Verification: 39 focused model/render/fit tests, web typecheck, lint and production
build pass. All four overview-only Letter/A4 × color/monochrome PDF checks pass
(12 measured pages each, no overview overflow). Physical cards/full milestone
acceptance remain separate; M5.6 is still open for product review.

Defensive table / AC investigation (2026-10-14): The full-width identity divider
is restored. Defensive traits use a striped Bonus/Source table with related
resistance, immunity, vulnerability and saving-throw groups; native applied
contributors and per-condition providers are retained separately from bonus text,
and cached totals explicitly retain legacy-cache provenance. Full references
keep both the benefits and sources.

Ingi's reported AC 15 was traced against both supplied private `.dnd4e` and native
`.4ecb` exports, the exact bound content digest, typed item contributions and the
recovered `CharSummaryCard` AC projection. Both exports evaluate to the legacy
total 26: 10 base + 3 half level + 9 plate + 2 enhancement + 2 shield. The owner
confirmed the browser also displays 26 after a full reload. No formula, cached
total, content definition or saved equipment state was changed to fit the report;
the transient browser-state discrepancy was not independently reproduced.

Verification for this slice: 75 focused overview/model/defensive projection and
evaluator tests, web typecheck, focused lint and production build pass. The
overview-only Letter/A4 × color/monochrome print matrix also passes (12 measured
pages each, no overview overflow). Physical cards and the full milestone gate
remain separate.

Defensive traits / identity header follow-up (2026-10-14): The first-page body
now groups resistances, vulnerabilities, authored self-immunity clauses,
conditional saves and death-save modifiers in an optional Defensive traits panel
between Basic Attacks and Reminders. The projection follows recovered
`BasicUtils.BuildResistancesString`/`BuildSavingThrowString`: signed `resist:*`
totals map to resistance/vulnerability, while conditional contributions retain
their values, bonus types, conditions and providers separately, without summing
or inflating universal Saves. Equipment-inapplicable contributions are excluded;
unresolved conditions stay explicit. Authored immunity wording is preserved whole;
this is conservative extraction, not exhaustive prose interpretation. Legacy
snapshots do not acquire invented conditional provenance. Full references retain
the same defensive list. Player/theme/path/destiny/company move to the header's
right identity block, with no empty placeholders.

Verification: 37 focused projection/model/render tests, web typecheck, focused
lint and production build pass. The populated overview-only Chromium Letter/A4
× color/monochrome PDF matrix passes (12 measured pages each, no overview
overflow, defensive text retained). A read-only local reference evaluation shows
its two expected resistance entries. The full suite / unchanged physical-card
gate was not rerun; M5.6 remains open for overview review and existing exit gates.

Summary sign/passive refinement (2026-10-14): Positive Initiative includes + in
the Movement pane and scratchpad reference; existing signs, zero and unknown
values are preserved. Passive Insight/Perception appear in parentheses beside
their ordinary skill bonuses, replacing separate footer rows. Source calculations
are unchanged. Live Silaqui review confirms +12 and +8 (18)/+15 (25), with no
skill-cell/table overflow and the summary still fitting its page. Focused rendering
coverage checks both inline placement and initiative sign edge cases; no full
print matrix was rerun for this small display adjustment.

Compact summary grouping (2026-10-14): Basic attacks now share one icon-led
Weapon/Attack/Damage table, with no separate melee/ranged headings or STR/DEX vs
AC indicators. Melee uses sword, ranged bow-arrow; ranged Unarmed is omitted from
overview attack tables. The existing evaluated attack/damage values and source
variants are unchanged. Abilities show raw score before abbreviated name, followed
by Modifier and +½ level; no separate Score header. A vertical Initiative/Speed
pane sits to the left of Abilities. Passive senses move into Skills footer rows,
with Vision retained nearby. Live Silaqui preview has no page/cell overflow;
the narrow Movement header fits after a compact heading adjustment.
Verification: all ten focused overview tests, web typechecking, focused lint and
the production build pass. Chromium overview-only Letter/A4 × color/monochrome
PDF checks pass with no overview overflow. The full public/physical-card matrix
was not rerun for this summary-layout refinement.

Power-access reminder exclusion (2026-10-14): Grant/select-only definitions are
not reminders merely because their prose describes once-per-encounter activation
or a shared allowance. They must supply an independent mechanical benefit rather
than only access to other powers. Authored mixed benefits (including manual
movement/roll effects not encoded in native statements) remain eligible for the
existing reminder rules. The implementation uses rule structure and benefit text,
not a Channel Divinity special case; its full feature reference, powers and
shared-use tracker are preserved. Seventeen focused overview/model tests, web
typechecking and focused lint pass. The full print matrix was not rerun for this
selection-only change.
A read-only exact-profile evaluation confirms four reminders for Hu, with
Channel Divinity retained as a full feature but not a reminder; all 21 powers
remain in the sheet model.

Reminder fitting/source refinement (2026-10-14): Remember in play now measures
rendered entries and fills available left-column space rather than enforcing a
four-entry/320-character cap. It reserves the overflow caption only when needed;
long entries remain in full references. Basic-attack summaries can reduce their
weapon rows when the right column would otherwise overflow, retaining complete
alternatives in references. Live Silaqui review fits nine reminders and keeps both
columns above the footer (20/22 px clearance).

Grant/choice-only feats/features are excluded using actual Benefit text and
grant/select metadata rather than introductory flavor; mixed benefits remain
eligible. Additional Effects resolve exact provider IDs or uniquely known selected
names/suffixes and reuse the feature's full authored rule once, not once per
affected power. Unattributed identical effects deduplicate without merging
different texts. Original power/card effects and full references are unchanged.
A read-only exact-profile evaluation of Hu yields one Censure of Unity reminder,
no Level 1 Ordained Priest Feature wrapper, and five total reminder entries.
Verification: 23 focused sheet-model/render tests, web typechecking, focused lint
and formatting pass, along with the production web build and Chromium
overview-only Letter/A4 × color/monochrome PDF checks
(12 measured pages each, no overview overflow). The full public suite and
unchanged dense physical-card gate were not rerun for this focused change.

Summary geography (2026-10-14): Basic attacks move to the right column directly
below Languages, leaving the left column's remaining space for Remember in play.
Focused rendering coverage asserts column membership and ordering; calculations,
physical cards and reference contents are unchanged.
Verification: all seven overview rendering tests pass. The full test/print matrix
was not rerun for this small layout move.

Unified reminders (2026-10-14): The summary now has one Remember in play panel
for actionable feats, features and item benefits. The separate Feat reminders
category is removed; summary, scratchpad and full reminder reference consume the
same deduplicated model list. Up to four entries fit in the summary before the
existing measured compact fallback; all remaining entries stay in references.
Focused rendering coverage checks mixed origins, one heading, no duplicated feat
entry and preservation of the full feat reference.
Verification: 12 focused model/render tests, web typechecking and focused lint
pass. The full print matrix was not rerun for this category consolidation.

Feat-reminder refinement (2026-10-14): Summary feat reminders no longer take the
first four arbitrary short descriptions. The model marks authored in-play
conditions, ally-facing benefits and changed actions as reminder candidates,
excluding passive grants and armor-only loadout conditions from feat reminders
and the general reminder list. Full feat references remain intact. Hu's local
definitions confirm proficiency, trained-skill bonuses and unarmored AC as the
reported passive cases. Synthetic tests cover these patterns alongside retained
action/shift/ally-facing reminders; this is a display heuristic, not an evaluator
completeness assertion.
Verification: 12 focused overview/model tests pass, along with web typechecking
and focused lint. A read-only local projection of Hu excludes the three reported
feats and retains Battle Awareness. The full print matrix was not rerun for this
reminder-selection-only change.

Real-data overview integration (2026-10-14): The reviewed prototype now supplies
the normal character print preview: one summary, a paper scratchpad with usage
continuations, and measured full-description reference pages before the accepted
physical cards. Interactive View, saved characters and card rendering are not
changed. Full feature/feat rules and authored summaries are separate model
values; prerequisites, explicit training/slots, carried spares, learned references,
power levels, item powers (including hidden-card items), XP and narrative records
remain available. Reminder candidates retain authored text and prioritize allies;
Channel Divinity grouping requires its explicit keyword. Missing data and
oversized custom content remain explicit. See D078 and
`sheet-overview-prototype.md` for heuristics and review boundaries.

Overview verification: `nix develop path:. -c node scripts/check-print.mjs --overview-only`
passes Chromium Letter/A4 × color/monochrome. The long-note fixture produces 12
measured pages in each case, all matching the generated PDF page count/dimensions,
with no overview overflow, tagged/selectable text, blank-HP behavior and the final
continued-note marker retained. This diagnostic deliberately excludes physical
cards; the default gate retains every card assertion. Browser review of Silaqui's
actual evaluated print preview confirms no overview page crosses its footer
(minimum 37 px clearance); summary, scratchpad, usage continuation and seven
reference pages remain available for owner feedback. The accepted physical-card
overflow blocker is unchanged. M5.6 remains open.

Checkpoint verification: `nix develop path:. -c bash scripts/check.sh` passes
formatting, lint, all 696 tests in 83 files, workspace typechecks and the
production/PWA build. The default print check then stops on the same unchanged
Synthetic power 01 dense-card assertion (279/256 px at the 6.5 pt floor).
The fixture, assertion and minimum font remain intact. Later public-check stages
are not reached; this is not a clean full-gate or milestone completion claim.
Separately, `nix develop path:. -c node scripts/check-built-pwa.mjs` passes;
the built web output contains no `.4ecp` or `.dnd4e` artifacts.

Earlier overview prototype (2026-10-14): A separate development entry at
`/sheet-prototype.html` presents four print-sized synthetic review pages:
summary, play scratchpad, full feature/feat references, and equipment/character
record. The scratchpad follows the private quicksheet's organizational pattern,
including numbered surge hearts and a multi-encounter matrix without copying
private rules or character content. Letter/A4 and monochrome controls are local
to the prototype. At that earlier checkpoint production sheets, card layouts,
data and settings were untouched; the integration above supersedes that boundary.
See `sheet-overview-prototype.md` for review scope and integration boundaries.
This is a design review artifact, not finalized pagination or milestone closure.
Feedback revisions: abilities are a compact six-row table above Skills, showing
full names, score, modifier and modifier plus rounded-down half level. Shared
headings use Ability/Score/Modifier/+½ level; four equal-width columns replace
slash expressions and repeated legends. Browser measurements confirm equal
column widths (within subpixel rounding), including no cell overflow on Letter/A4.
Skills use two name-first columns with superscript T training markers, muted
subscript governing abilities beside the name and rightmost bonuses. Ability/
skill tables have neutral alternating row fills; training no longer changes
row colors. The training key occupies the unused bottom-right skill row; there
is no Skills preamble. Passive senses use `Pass.` labels on one line. Basic
attacks now reuse `PrintPowerVariants` for melee/ranged weapon, attack and damage
tables, with synthetic illustrative loadouts. Feat reminders move below Languages
in the right column to keep combat references together on the left.
Health uses four equal HP/bloodied/surges/surge-value cells. Saving throws sit
in a fifth label-first defense cell (Saves); Fortitude/Reflex use full names.
Movement/awareness matches Health's four-cell row, with labels above values and
unqualified Speed. Skill cells have horizontal padding. The summary panel is now
named Health.
Summary XP/AP are removed; XP has scratchpad writing space and
a details-page advancement record. Tracking instructions/captions are removed.
Languages has a dedicated panel beside Skills. Scratchpad surges join
health, skulls replace death-save dots, the large heading/rest field are removed,
and the Channel Divinity example retains each power's action icon. Feature cards
are grouped by category; the power index shows levels or nonlevel origins.
Verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/prototypes/SheetPrototype.test.tsx`
passes 7 focused render/style tests; web typecheck and prototype lint pass at the
basic-attack checkpoint. In-app browser
review confirms all four fixture pages stay above their footers with no horizontal
page overflow on Letter (minimum clearance 49 px) and A4 (minimum 116 px).
Monochrome toggling is confirmed visually. Browser print/PDF output and arbitrary
real-data pagination are not acceptance-tested by this isolated review slice.

Printed-card product review accepted (2026-10-14): The product owner approved
the accumulated power/item card changes for a checkpoint commit. This includes
readable adaptive fitting, grouped item powers and metadata, weapon property
values, Additional Effects with provenance, inactive sibling clause filtering,
wrapped titles with anchored badges/icons, first-row keywords, softer internal
dividers and compact sustain action indicators. Private corpus/recovered sources
remain ignored; public regression coverage uses synthetic content. Next work is
the printable sheet's first two reference pages. M5.6 is still open; product
acceptance of cards does not remove the documented dense-card overflow boundary
or substitute for the complete milestone exit criteria.
Checkpoint verification: `nix develop path:. -c bash scripts/check.sh` passes
formatting, lint, all 679 tests in 80 files, workspace typechecks and the
production/PWA build. It then fails the unchanged print-overflow assertion on
Chromium Letter color Synthetic power 01: body 279/256 px at the 6.5 pt floor.
This supersedes the earlier 279/222 px measurement below, but is not a passing
print matrix. Later checks in the script are not reached. The fixture/assertion
are preserved; dense-card continuation/overflow presentation remains deferred
to a separate product decision before M5.6 print-fit acceptance. No claim of
full public-check or milestone completion is made by this checkpoint.
Separately, `nix develop path:. -c node scripts/check-built-pwa.mjs` passes;
the built web output contains no `.4ecp` or `.dnd4e` artifacts.

Card-header refinement (2026-10-14): Long titles now wrap naturally without
scaling title text; utility W/E/D badges remain fixed at the top right. Title
action icons align with the first text line, including wrapped titles. Keywords
return to the first subheader row, retaining their muted background and key icon.
Immediate Interrupt's octagon glyph uses an 80% optical scale within its unchanged
icon box to balance the font-based action symbols across app and printed cards.
Internal horizontal/vertical subheader rules are softened to 35% card color;
the bottom edge retains the prominent full-color divider. Cards remain fixed-size
and excess content remains subject to the existing fitting/overflow boundary.
Verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts apps/web/src/print-card-fit.test.ts`
passes 18 focused tests. The full print matrix was not rerun for this style edit.
Sustain follow-up: authored Sustain action fields add a second action-cell line
with `step-forward` and the action type, preserving the complete clause in the
body. Ordinary cards retain their single action line. Distinct sustain types
remain individually visible; repeated labels are deduplicated in the header.
Verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-power-attacks.test.ts apps/web/src/print-layout.test.ts`
passes 33 tests; `nix develop path:. -c pnpm --filter @4ecb/web typecheck` passes.

Class-feature clause filtering (2026-10-14): Personalized evaluated View/print
cards now omit confirmed inactive sibling clauses using the parent Class Feature
selection/category relationship, not hardcoded Censure/Covenant names. Ambiguous,
custom, unresolved, multi-pick and composite families retain their text; generic
Build details and legacy-cache sheets remain unchanged. See D077. The private Hu
diagnostic retains Fury's Advance's Unity clause and omits Angelic Alacrity's
Pursuit clause, with Pursuit/Retribution identified as inactive siblings. A local
content diagnostic with a selected-Wrath fixture retains Wrath and hides
Preservation/Malediction clauses. The latter is not a full Fei Zhu import replay
(only the PDF reference is available), and neither diagnostic is a same-profile
golden. Verification: `nix develop path:. -c pnpm exec vitest run packages/sheet-model/src/power-feature-clauses.test.ts packages/sheet-model/src/index.test.ts`
passes 12 tests; `nix develop path:. -c pnpm typecheck` passes workspace checks.
This presentation change does not close M5.6 or resolve the documented dense-card
overflow blocker.

Additional-effects checkpoint (2026-10-14): Printed power cards now show selected
variant conditional attack/damage reminders, keyword `:info` text, and recovered
striker extra damage. Conditional bonuses retain their provider/provenance and
stay out of ordinary totals. Legacy fallback retains selected weapon `Conditions`
verbatim as legacy-cache; equipped/saved main-hand evidence takes precedence over
the historical first-cache fallback. No reminders are pooled across inventory
alternatives. Populated effects participate in the body's existing fitting;
empty cards omit the section and its reserved writing area. Fixed geometry and
the 6.5 pt floor remain.
Empty-section follow-up verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts apps/web/src/print-card-fit.test.ts`
passed 16 focused tests; populated effects remain in the fitted body.
Known effect providers now appear as bold leading `Name:` labels rather than
trailing parenthetical/hyphenated prose. This is presentation-only: reminder text
and provenance remain unchanged in the model; unidentified legacy text remains
verbatim rather than guessing names from parenthetical conditions.
Provider-label follow-up verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-additional-effects.test.ts apps/web/src/print-layout.test.ts packages/sheet-model/src/index.test.ts`
passed 22 focused tests; web typecheck passed.
See D076 and `character-import-and-sheets.md` for the source/selection boundary.
The original private Hu sample produces Censure of Unity reminders on all 11
cards whose first cached weapon contains that condition, with the same evaluated
+1 amount and authored condition; all 11 projected reminder strings match the
first legacy weapon cache exactly. This is diagnostic comparison against the
local profile, not a new same-profile golden. Native special Action Point cards,
dwarf Second Wind reminders and specialized generated keyword families remain
separate parity work. Verification: 68 tests in the focused rules-power,
sheet-model, print-layout and runtime-cache suites pass; workspace typecheck and
production/PWA build pass. `nix develop path:. -c pnpm check:print` verifies the
new synthetic populated effects before reproducing the existing Chromium Letter
color Synthetic power 01 overflow (279/222 px at 6.5 pt). Its assertion and dense
fixture remain intact. This does not close M5.6 or its print overflow blocker.

Printed-card text-size checkpoint (2026-10-14): Display now offers a persistent,
browser-local preferred size of 6.5–10 pt in half-point steps, default 8 pt.
The preference sets body text, weapon tables, keywords, subheaders, and
proportional titles/labels/footers, with readable floors for compact text.
Automatic fitting now reduces body text, weapon tables, keywords and subheaders
(including additional attacks and item actions) together, preventing fixed
subheadings from squeezing multiattack prose too far. Titles and footers retain
their preferred sizes consistently across cards. Both item and power cards
start at the preferred size and shrink gradually only on overflow, retaining
fixed physical dimensions with a raised 6.5 pt minimum. Saved 6 pt preferences
are raised to the new minimum. The previous body-only fitting checkpoint passed
11 focused tests and all eight browser/paper/color print variants.
Readable-floor follow-up: 50 focused fit/layout/attack/item tests, web typecheck
and production build pass. The rebuilt `nix develop path:. -c pnpm check:print`
currently fails on the deliberately oversized Synthetic power 01: body 279 px
in 222 px available on Chromium Letter color at 6.5 pt. Keep that fixture and
assertion unchanged; do not conceal the overflow by shrinking below the floor.
Screen print preview marks cards that still exceed their fixed geometry. A
continuation/overflow presentation decision remains necessary before M5.6 exit;
this is not a completed print-fit acceptance checkpoint.
Focused card-fit/layout/settings/item/sheet-model tests pass (62 tests in five
files), web typecheck and production build pass, and `nix develop path:. -c pnpm
check:print` passes all eight Chromium/Firefox Letter/A4 color/monochrome variants
with 24 cards, five pages, no measured overflow, and short cards retaining 8 pt.
Local UI review confirms persistence of a 10 pt preference across reload,
individual fitting on Silaqui with no measured overflow at 8 or 10 pt, and
restoration of the default 8 pt preference afterward. Full milestone acceptance
remains separate.

The first reviewable M5.6 slice replaces the browser's print-preview-like
character route with a dedicated read-only View while retaining print as a
separate projection over the same semantic model.

- View now provides an at-a-glance summary, sticky section navigation, powers,
  equipment/item references, learned rituals/formulas/practices, features,
  notes, explicit recovery guidance, and direct Characters, Build, and
  Print/save-PDF actions. The print action first opens an explicit in-app
  preview of the actual print projection, with paper/color context, a return to
  View, and a second action that invokes the browser's print/save dialog; it no
  longer depends on a browser exposing print-media changes clearly. Screen
  references remain available regardless of which optional card groups the user
  includes on paper.
- The print projection now follows the recovered legacy sheet's purpose-built
  page grammar rather than flowing the whole semantic model through generic
  columns. Page one is a bounded character dashboard; page two is a bounded
  power/equipment/learned-reference index plus portrait and note panels. Feature
  groups are compact name indexes, so long descriptions can no longer collide,
  overlap, or force narrow columns off the physical page.
- Print cards have a dedicated renderer and the recovered fixed 233:321 aspect
  contract. They paginate explicitly in three-by-three pages (nine cards), use
  fixed physical dimensions for Letter and A4, and trim or reduce type inside
  the boundary rather than growing. Power cards project compact action/range and
  attack/defense/target bands, authored rules clauses, calculated equipped
  variants, and a compact usage-first type bar. Item cards project their legacy
  stat grid, properties/powers, and footer. Flavor, source citations, and
  presentation-only metadata are deliberately absent from physical cards;
  browser View retains its richer interactive cards. Composed magic-item cards
  now merge public base and enchantment fields so weapon/armor statistics are
  not lost behind the enchantment record.
- Item-card follow-up (2026-10-01): title bars now use the equipment/shop's
  category icons and readable bold sans-serif type. Physical statistics wrap
  without four/eight-entry caps; both recovered `Armor Bonus` and `AC Bonus`
  are supported. The revised combat-focused subheader groups melee weapons as
  Proficiency / Damage / Critical; ranged-capable weapons as Range / Proficiency
  / Damage / Critical on one wrapping row; implements as Enhancement / Critical; armor/shields
  as AC bonus / Enhancement then nonzero Check / Speed penalties. Missing fields
  and empty rows disappear. Weapon enhancement is omitted because it is already
  in the title. Other item types also omit Enhancement when the same numeric
  bonus is already in their title. Combat rows retain the earlier bold uppercase
  labels (Prof/Crit abbreviations) and use dot separators without boxed
  cells. Category, group, hands, armor type, rarity, and key ability move to
  compact metadata prose on the footer's left; slot/weight/price share its right
  with dot separators. Only worn items show slots, not weapons or implements.
  Critical entries with riders or conditional wording are freeform rules
  and remain labeled Critical lines in the body, not subheader values.
  Activated powers and freeform Property entries stay in the body.
  Item activation headers read usage/keywords from either field labels or body
  prefixes, including No Action and consumables. Inset headings use muted green/
  red/gray power-subheading backgrounds (#aaddaa/#ddbbbb/#d3d3d3) and dark text for
  At-Will/Encounter/Daily, matching power subheaders; Consumable and
  unknown headers retain their orange tint. Action and capitalized usage sit
  together with one bullet, not right-aligned at opposite ends. Regular-weight,
  comma-separated keywords align below the action text, not the icon. Disabling
  icons removes the icon column; monochrome headers remain light with dark text.
  Each complete inset item-power subsection has a 1px usage-colored border
  around both heading and padded white rules body, or orange for Consumable;
  monochrome uses a black border. General item rules remain outside the box.
  Enclosed-power follow-up: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts`
  passed all 11 focused layout tests.
  Usage-color/inline-frequency/aligned-keyword follow-up:
  `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts`
  passed 11 focused layout tests; no full-suite rerun for this visual adjustment.
  Icons align to the action's first line when it wraps. Consumable prefixes
  without a colon (Coin of Good Luck) are recognized without losing Effect or
  Special clauses. Explicit Trigger/Effect/etc. clauses have
  bold labels; authored Augment clauses receive a separate labeled row within
  their power rather than being mistaken for passive item properties. Unknown
  activation forms stay intact.
  Separated-header follow-up verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-item-presentation.test.ts apps/web/src/print-layout.test.ts apps/web/src/Prose.test.ts`
  passed 56 focused tests; web typecheck passed. Private Coin of Good Luck
  diagnostic resolves Consumable/Free and preserves both Effect and Special.
  Verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-item-presentation.test.ts apps/web/src/print-layout.test.ts apps/web/src/Prose.test.ts`
  passed 52 focused tests; web typecheck passed. Private definition diagnostics
  confirm Flowform's Encounter/Augmentable/No Action header with separate
  Trigger, Effect and Augment 1 clauses; Guardian's Whistle resolves its label
  metadata into Daily/Teleportation/Move; Cape resolves Daily/Teleportation/
  Immediate Reaction.
  Weapon keyword `Properties` occupy a wrapping
  regular final stat-subheader row, without repeating them in the body.
  Following product-owner feedback, item Properties follows the numeric
  subheader rather than preceding it.
  Its bottom divider is omitted; power Keywords borders remain unchanged.
  Item stats have a full-color bottom boundary even for a single Crit cell;
  Properties now shares the stat row labels, values, background and spacing,
  rather than the separate Keywords-band styling. When present it is the final
  subheader row and has no bottom boundary; stat-only subheaders retain theirs.
  Paragraph-style `Property` entries remain in the body.
  Shared prose now renders legacy HTML-cell and tab-delimited tables as lightly
  styled semantic tables rather than concatenated or accidentally bold headings.
  The local Hunter's Quarry Effect parses as one two-column table with three
  data rows and no accidental heading; original content remains unchanged.
  Table cells remain escaped text; corpus HTML attributes are not rendered.
  Verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/Prose.test.ts apps/web/src/print-layout.test.ts apps/web/src/power-level-text.test.ts apps/web/src/print-item-presentation.test.ts`
  passed 50 focused tests; web typecheck passed. Existing dense-card print-fit
  blocker remains separate; no full-suite rerun for these presentation changes.
  Weapon keyword values retain authored casing with regular subheader value
  weight, rather than uppercasing every property name. A shared helper now recovers
  omitted numeric qualifiers from exact headings in authored Full Text
  Properties blocks. Hu's gouge projects Brutal 1 across item details, sheet
  cards and weapon metadata. Explicit values and ambiguous/missing evidence stay
  unchanged; raw properties remain context tags. The evaluation cache version
  is bumped for corrected weapon-property metadata.
  Verification: `nix develop path:. -c pnpm exec vitest run packages/content-domain/src/index.test.ts packages/rules-engine/src/powers.test.ts packages/sheet-model/src/index.test.ts apps/web/src/EntityCard.test.ts`
  passed 79 tests; `nix develop path:. -c pnpm exec vitest run apps/web/src/app-runtime.test.ts packages/rules-engine/src/powers.test.ts`
  passed 52 tests. Workspace typecheck passed. Private gouge diagnostic confirms
  original compact `Brutal` remains unchanged while projection is `Brutal 1`.
  General body rules (Special, Property, Critical riders and unknown notes)
  follow activated powers; only explicit Prerequisite/Requirement fields precede
  them. Authored order is retained within each group and on cards without powers;
  Special/Augment clauses within a power remain associated with that power.
  General-rule ordering verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-item-presentation.test.ts apps/web/src/print-layout.test.ts`
  passed 51 focused tests. Power Jewel's standalone Special field is confirmed
  in the local definition and now follows its activated Power subsection.
  Item-power usage/action headings are compact body subsections, aligned
  with rule text, using a tinted rounded strip inset within the body rather
  than a subheader-style grid, cell dividers, or edge-to-edge borders.
  A modest adaptive gap separates them from passive rules; action symbols follow
  the existing card icon setting and precede Usage / Action text.
  Follow-up verification: focused item-presentation/accessibility tests pass
  (38 tests), web typecheck passes, and local visual review confirms Bracers of
  Archery's passive Property precedes its icon-bearing Daily/Minor header.
  Grouped-layout checkpoint (2026-10-14): `nix develop path:. -c pnpm exec
vitest run apps/web/src/print-item-presentation.test.ts
apps/web/src/print-layout.test.ts apps/web/src/EntityCard.test.ts
apps/web/src/accessibility-contract.test.ts packages/sheet-model/src/index.test.ts`
  passes 80 tests in five files. Web typecheck, focused ESLint, and production
  build pass; `nix develop path:. -c pnpm check:print` passes all eight browser /
  paper / color variants. Visual review on Silaqui confirms melee/ranged rows,
  compact armor bonuses, dot-separated right footer details, and no measured
  item-body/footer overflow. Full milestone acceptance remains separate.
  Recognized item-power and consumable prefixes become compact usage/action headings; unknown wording
  remains intact. Category and level share the orange bottom bar, with slot,
  weight, and price in a compact footer; numeric weights/prices receive units.
  Ordinary weapons, armor, and gear are no longer universally labeled magic
  items. Weapon proficiency values are explicitly signed (Prof +3). Item-power
  body text receives a small side inset matching heading content padding.
  Recognized heroic/paragon/epic tier parentheses move from printed item titles
  into footer metadata; other parentheses and stored names remain unchanged.
  Focused item/layout tests pass (37 tests), and web typecheck passes for this
  follow-up. Inventory quantity is omitted from physical cards. Explicit flavor is
  omitted; unstructured custom instructions are
  preserved when no structured rules replace them. Shared category mapping
  uses neutral item/base-type metadata in the sheet model, not UI icons there.
  Recovered `PowerCardItem.UpdatePowerCardItem` informed base/enchantment field
  ownership. Public focused fixtures cover weapon, armor, implement,
  consumable, passive, and custom projections; the print matrix still uses
  generic synthetic item descriptions rather than every structured category.
  Product-owner review and M5.6's broader acceptance remain open.
  Verification: `nix develop path:. -c pnpm exec vitest run
apps/web/src/print-item-presentation.test.ts apps/web/src/EntityCard.test.ts
apps/web/src/print-layout.test.ts packages/sheet-model/src/index.test.ts`
  passes 45 tests across four files. Web typecheck, focused ESLint, and production
  build pass. Visual review on the supplied character confirmed category icons,
  wrapping stat bands, grouped powers, and bounded long-title body layout.
  Item stat cells place labels and values inline on a shared baseline, wrapping
  long values without forcing short values onto a separate line.
  Ammunition uses Lucide `bow-arrow` through the shared item mapping, including
  mundane gear category metadata, across shop, equipment, details, and print.
  `nix develop path:. -c pnpm check:print` passes all eight Chromium/Firefox
  Letter/A4 color/monochrome variants: 24 cards, five pages, no measured card,
  header-band, target, or table overflow. The matrix now covers a long item title
  and checks body boundaries as well as internal scroll overflow. Full milestone
  validation is deferred until the M5.6 acceptance checkpoint.
- Printed title line boxes use a 1.2 line-height to preserve descenders inside
  the clipped single-line header; usage bars and item footers vertically center
  their text. Power titles use bold Arial, matching the sans-serif body. The
  action/range and attack/target bands share text sizing and 0.1-inch icon boxes
  for equal single-line heights; long targets can still expand without clipping.
  Action/range and primary attack/target dividers share a per-card first-column
  width, measured from their widest intrinsic first cell at each fitted size.
  Reset that width before refitting so smaller preferences do not retain a stale
  split; secondary inset attack sections are unaffected.
  Shared-column verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts apps/web/src/print-card-fit.test.ts`
  passed 16 focused tests; web typecheck passed.
  Subsequent attack headers use rounded tinted strips inset in the body,
  matching item-power headings without repeating the main subheader's dividers.
  Their rule text uses the same side inset as item-power text. Inset headers
  match their card's main subheader tint (including monochrome); row-leading
  separators and their occupied space are removed after target/stat fields wrap,
  recalculated during fit; wrapped target icons align with the attack icon above.
  Secondary headers accept only explicit authored phase targets, not copied
  primary target text from equipment variants. Same-target restrictions remain
  in their original Hit prose.
  Utility power title headers now include a fixed-size W/E/D badge at the right
  for At-Will/Encounter/Daily, with green/red/gray backgrounds and white text.
  The blue-utility option does not alter its usage color; monochrome keeps the
  letter in dark text on white. Titles truncate before displacing the badge.
  Badge verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts`
  passed all 10 layout-contract tests; no full-suite rerun for this visual tweak.
  Verification for wrapped separator alignment and authored secondary targets:
  `nix develop path:. -c pnpm exec vitest run apps/web/src/print-power-attacks.test.ts apps/web/src/print-card-fit.test.ts apps/web/src/print-layout.test.ts`
  passed 21 tests; `nix develop path:. -c pnpm --filter @4ecb/web typecheck`
  passed. The local Assess and Strike definition has only a primary Target field;
  the primary Hit constrains its secondary attack to that same target.
  Authored target fields are omitted from the printed body only when the same
  target text is already displayed in that specific attack's header.
  A browser-local Display setting (on by default) moves action symbols into
  printed power titles and uses a generic timer beside the action description.
  Turning it off restores the symbol beside that description; actionless powers,
  item cards, and interactive cards are unchanged.
  Power Keywords now occupy an optional band immediately above the usage footer,
  below Additional effects, using
  the same bottom divider, spacing and icon size as action/attack rows, but a
  slightly more muted background (12% card color versus their 20%).
  A key icon replaces the visible Keywords label; values stay regular
  weight. Empty/whitespace-only keywords omit the entire row. There is no
  duplicate body property. Power card grids use five rows when keywords exist and four
  otherwise, with the body as the third flexible row and unchanged dimensions.
  Bottom-band placement verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts apps/web/src/print-card-fit.test.ts`
  passed 16 focused tests.
  Key-icon subheader follow-up verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts apps/web/src/print-card-fit.test.ts`
  passed 16 focused tests; web typecheck passed. Full browser print-fit acceptance
  remains a separate checkpoint.
  Keywords-placement verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-layout.test.ts apps/web/src/print-card-fit.test.ts`
  passed 16 focused tests; web typecheck passed. Full browser print-fit acceptance
  remains separate from this feedback change and its existing dense-card blocker.
  Printed action labels retain No Action (including authored qualifiers); only
  redundant Action suffixes such as Standard Action are abbreviated.
  Action-label regression verification: `nix develop path:. -c pnpm exec vitest run apps/web/src/print-power-attacks.test.ts apps/web/src/print-layout.test.ts`
  passed 28 focused tests.
  Action symbol glyphs share a font-relative downward optical adjustment across
  print titles, subheaders, item powers and interactive cards/selection summaries.
  Separate per-surface shifts are removed to avoid inconsistent alignment;
  interactive action-icon boxes align to the heading center rather than baseline.
  Shared alignment and independent Additional Effects regression verification:
  `nix develop path:. -c pnpm exec vitest run apps/web/src/ActionTypeIcon.test.ts apps/web/src/selection-summary-style.test.ts apps/web/src/print-layout.test.ts packages/rules-engine/src/powers.test.ts packages/sheet-model/src/index.test.ts`
  passed 63 tests across five files; no full-suite rerun for this optical tweak.
  Immediate Interrupt uses the octagon-minus icon across print and interactive
  action displays; other action symbols are unchanged.
  Printed attack targets use the crosshair icon rather than the bullseye.
  Empty printed action/type bands retain their spacing but omit the internal
  divider and icons (for example, Divine Sanction); sword icons appear only
  beside nonempty attack-type text.
  Card-label audit (2026-10-14): removed synthesized Recovery rules sections;
  healing/temporary-hit-point sentences remain solely in their authored Hit or
  Effect fields. The other synthesized rules label, Compatibility, is replaced
  by separate interactive calculation warnings, never physical-card sections.
  Rules-engine recovery metadata remains available for calculations. Remaining
  body labels originate from authored public fields or established prerequisite
  metadata. Additional effects is verified in recovered `PowerCardPower.cs`;
  approved Attack/Damage table and header labels are presentation, not new rules.
  Verification: `nix develop path:. -c pnpm exec vitest run
packages/sheet-model/src/index.test.ts apps/web/src/print-layout.test.ts`
  passes 11 tests; web typecheck passes. The synthetic fixture contains recovery
  metadata and unsupported calculations while asserting only authored card
  fields and separately preserved calculation warnings.
  The printed attack-type cell uses a fixed sword icon to identify the field,
  independent of its melee/ranged/area text.
  Printed to-hit cells use Lucide's dices to distinguish the attack roll from
  attack type. The brief Nerd Fonts integration was reverted after visual
  feedback: its d20 glyph was too detailed at card-header size. No icon font,
  font preload, font-readiness print path, or font-generation tooling remains.
- The compact power header now removes the redundant word `Action`, uses the
  same icon-left rhythm for action/range and attack/target, combines the authored
  attack stat and defense into one cell, and lets the target cell grow vertically
  inside the fixed card so target text is never ellipsized. Both combat-band
  icons stay aligned to the top-left of their cells when either value wraps.
  The action/range and attack/target rows share one continuous header-band
  background in both color and monochrome output. Printed rule text
  reduces the corpus's established tier forms (`Level N:` alternatives,
  `Increase damage to ... at Nth level`, and Dragon Breath-style `Increase to
+N bonus and ... damage at Nth level` chains) to the highest tier applicable
  to the character. The same reduction now applies to character-view power
  cards. Damage replacement preserves the rest of a Hit effect; prose that does
  not match those forms remains untouched. Repeated full attack alternatives
  such as `Strength +2 vs. Reflex, Constitution +2 vs. Reflex, or Dexterity +2
vs. Reflex` use the configured highest-ability selection and established
  tie-break rules.
- Printed power identity is now usage-first. At-Will, Encounter, and Daily
  choose the default green, red, or gray treatment; Utility is retained as an
  explicit qualifier in the bottom type bar rather than replacing frequency or
  requiring a three-checkbox matrix. A Utility card's footer is always blue,
  while its other accents use the usage color by default. The off-by-default
  Display preference extends Utility blue to the entire card treatment. Numeric
  level shares the bottom bar, and the redundant class/source footer is omitted.
  Both modes leave the actual usage text visible. Item cards likewise omit the paper-oriented
  frequency matrix and source fallback while retaining authored item-power
  usage in their rules text. Focused print-layout/accessibility contracts, the
  web typecheck, and the Chromium/Firefox Letter/A4 color/monochrome print
  matrix pass with 24 fixed cards, five pages, and no card, band, or target
  overflow. Live Silaqui review covered both preference states and the compact
  attack form. Utility classification now relies only on explicit `Power Type:
Utility` metadata: attackless non-Utility cards such as Opportunity Attack,
  Divine Challenge, Divine Sanction, and other feature/rules-item powers keep
  their actual identity and omit a fabricated attack band. The paper title no
  longer includes a used-state checkbox; action symbols are optically centered,
  and Opportunity Action uses the reaction symbol instead of the standard-action
  dot. Authored body spacing now preserves logical groups: Hit/Miss/Effect and
  Trigger/Effect stay tight, while independent clauses start a separated
  section. Compact cards halve that section gap and condensed cards remove it to
  preserve fixed geometry. Weapon-compatible powers now place one concise
  attack/damage line per compatible owned weapon after the authored rules. Each
  line contains only weapon name, total bonus, and damage; equipment-state
  labels and the defense already shown in the header are omitted. Inventory
  alternatives remain visible, and the equipped-first variant still drives the
  compact attack header. Weapon lines inherit the same size and line height as
  other body text. Print cards now start at normal size and measure the rendered
  body against the available height, using compact/condensed text only when it
  actually overflows; hidden metadata, removed level variants, and omitted
  flavor no longer cause premature shrinking (including Divine Sanction).
  Summaries now consistently use a compact bottom table with one row per
  weapon and calculation cells such as `+12 → 2d8 + 5`, omitting the word
  `damage` and damage types already available in authored Hit/item rules.
  Single attacks and identical repeated calculations use a labeled
  three-column weapon/to-hit/damage table; distinct calculations retain combined
  cells and add numbered attack-column headers.
  When all of each weapon's phase bonuses match but damage differs, the table
  instead uses one shared Attacks column and Dmg 1/Dmg 2/etc. columns.
  All table forms sort equipped main/off-hand variants first, followed by other
  equipped implements/weapons and then inventory alternatives; within-group
  order and the underlying model are preserved.
  This consistent-layout follow-up passes eight focused print tests, the web
  build, focused lint, and all eight print-matrix cases; the harness checks every
  weapon table for cell overflow, not just the first table.
  The subsequent styling refinement uses soft alternating row backgrounds
  rather than cell borders, with slightly stronger multiattack-header shading.
  Automatic column sizing replaces the fixed 30%
  weapon column to reduce unnecessary name wrapping; focused print contracts
  cover the style and sizing boundary.
  Weapon names now use normal body weight, and the table sits at the bottom of
  the available body area rather than immediately following short prose. The
  minimum section gap and non-shrinking content preserve separation while the
  existing adaptive fit still measures the complete rules-plus-table body.
  This bottom-alignment refinement passes ten focused print tests, the web
  build, and all eight Chromium/Firefox print cases without body or table-cell
  overflow.
- Multiattack investigation confirmed the weapon-list limitation also affects
  attacks with the same ability but different damage or weapon roles. The local
  merged corpus's Ranger Sudden Strike uses Strength for both phases but has
  separate off-hand and main-hand Hit formulas; Driving Offensive likewise has
  different damage per phase. Prayer of Two Paths (Paladin) changes from
  Strength vs AC to Charisma vs Will. The evaluator now calculates damage and
  types separately for each ordered attack phase using the existing recovered
  component path. Explicit main/off-hand roles constrain equipped phase cells,
  while inventory alternatives remain hypothetical loadouts. Collapse compares
  resolved ability, numerical to-hit, damage expression, and availability rather
  than defense, intrinsic-bonus, or hand-role labels. Distinct columns retain
  simple Attack 1/Attack 2 titles; abilities are already in the body headers.
  Unavailable companion phases show a dash and retain the compatibility
  diagnostic; legacy snapshots without per-phase data keep their recorded
  primary summary and do not invent secondary values. Ongoing damage and riders
  remain in the full authored Hit text.
  A printed legacy-cache fallback now also retains every authored phase header
  and Hit block, showing a dash for secondary totals unavailable in the cache.
  Generic Attack fields after a secondary-section marker remain in that phase
  rather than being regrouped with the primary attack.
  Verification: 14 focused print/phase tests, the web typecheck, and focused lint
  pass. A read-only private diagnostic using Silaqui's imported inputs and the
  local Assess and Strike definition emits both calculated phases (Reflex
  off-hand and AC main-hand). The precise reported live card was not available
  in the inspected saved Silaqui views, so this verifies the fallback defect and
  calculation path, not a reproduction of the product owner's missing card.
  Follow-up: the engine cache revision is now v4 to invalidate persisted v3
  evaluations created before phase-aware calculations. The earlier renderer
  fallback preserved the secondary header but could not populate absent totals;
  fresh evaluation supplies the actual phase totals and damage. Secondary
  target cells remain blank without explicit phase-specific target metadata:
  copying the primary's `one creature` could imply a new choice when the first
  Hit instead requires attacking that same creature.
  Cache/target regression verification passes 64 focused tests across powers,
  runtime caching, printed phases, variants, and layout, plus the web typecheck
  and focused lint. Refreshing an already open app starts the new cache revision;
  character builds and serialized legacy snapshots are unchanged.
- Per-attack weapon-table checkpoint (2026-10-01): the focused rules-engine,
  sheet-model, printed-variant, and print-layout suites pass 50 tests. Workspace
  typechecks, focused lint, and the web build pass. `pnpm check:print` exercises
  the actual table component with public synthetic multiattack data in all eight
  Chromium/Firefox Letter/A4 color/monochrome cases: 24 cards, five pages, no
  body/band/target or table-cell overflow, and matching weapon/body text sizes.
  The harness now enters Firefox's in-app print preview before measuring; print
  media hides the preview controls and restores the physical page width in both
  browsers. The private Silaqui level-8 diagnostic retains 71/71 comparable
  cached power-field matches with no unsupported fields or mismatches. This is
  a cache comparison, not an exact same-profile multiattack golden.
- Rendered-fit checkpoint (2026-10-01): `pnpm exec vitest run
apps/web/src/print-layout.test.ts`, the web typecheck/build, focused ESLint,
  and `pnpm check:print` pass through `nix develop path:. -c`. The print fixture
  now includes deliberately crowded prose and checks body overflow, matching
  weapon/body font sizes, and preservation of normal size on a short card.
  Chromium 152 and Firefox 154 pass all eight Letter/A4 color/monochrome cases:
  24 cards, five pages, no body/band/target overflow, and short-card body size
  6.7pt (8.93333px/8.9375px respectively). The action-symbol box now reserves
  enough height for the glyph without overflowing its header cell.
- Attack calculation and print projection are now phase-aware. The rules engine
  retains every authored attack's ordinal, resolved ability, intrinsic power
  bonus, defense, target, final total, and component provenance; primary and
  subsequent attacks are calculated independently. Printed cards render these
  as compact `⚔ +12 · STR+2 vs AC | target` rows, followed immediately by that
  phase's Hit and associated Effect clauses. Multiattack bands use their
  top-to-bottom order without ordinal prefixes; the weapon table retains
  numbered columns. A browser-local default-on Display
  toggle now hides equipped totals from printed attack bands when requested,
  leaving `STR vs AC` / `STR+2 vs Ref` while preserving all weapon-table totals
  and interactive cards, independently of weapon-table layout. This preference
  slice passes 47 focused header/layout/variant/accessibility tests, the web
  typecheck, and focused lint. Putting the complete to-hit first and separating the
  authored formula with a centered dot preserves a power's intrinsic `+2` without
  mistaking it for the total. Header-only defense abbreviations use `Fort` and
  `Ref`. The combined attack cell fits its content while long targets wrap in
  the remaining width.
  Requirements and other setup rules now follow the first attack band rather
  than splitting the two compact header bands, while still preceding Hit.
  Legacy cached weapon variants carry
  their recorded attack stat and an explicit zero intrinsic bonus into the
  shared sheet model, preventing a personalized `Charisma (+4)` annotation from
  being mistaken for an authored `Charisma +4` power formula.
- Evaluated cards now apply the canonical user-facing-field predicate after
  overlays, suppress machine metadata and ID tokens, preserve repeated authored
  combat clauses in ordinal order, and expose supported flavor and printable
  prerequisites. Known legacy table/paragraph layout tags become safe readable
  prose; unfamiliar markup is still escaped rather than interpreted.
- Rituals, alchemical formulas, and martial practices are semantic learned
  references rather than physical equipment or item cards. Ritual Scrolls
  remain physical equipment. Custom and unresolved inventory remains visible;
  it is not discarded to make the partition appear cleaner.
- Focused sheet-model/prose/structural tests, workspace typechecks, the
  production PWA build, and the Chromium/Firefox Letter/A4 print matrix are the
  checkpoint gate. The print matrix now asserts exactly two reference pages plus
  one page per nine-card chunk, fixed non-overflowing card boxes, all expected
  card content, hidden application chrome, paper dimensions, and color and
  monochrome modes. A live exact-profile Silaqui pass confirmed bounded summary
  pages, fixed card geometry, compact utility handling, and the absence of
  flavor on physical cards. Product-owner review is still required; this
  checkpoint does not close M5.6.
- The per-attack checkpoint passes the full repository gate: formatting, lint,
  566 tests, every workspace typecheck, production/PWA build, Chromium and
  Firefox Letter/A4 color/monochrome print checks with 24 fixed cards and no
  card/header/target overflow, deterministic public-pack checks, and the query
  benchmark. Live Silaqui review confirms the compact formula/total/target row,
  complete long Grab Attack target, recorded `DEX` fallback for legacy cached
  Quick Formation, and `Fort`/`Ref` header abbreviations.

## Extend two-click confirmation to the character library page (2026-09-28)

Follow-up to the same-day native-confirm() removal: the product owner asked
for the same click-to-arm, click-again-to-confirm pattern on the character
library page's (`/characters`) "Move to trash" button, alongside the
"Delete permanently" button already converted there.

- Extracted the pattern into a shared `useArmedAction(triggerAttribute)`
  hook (`useArmedAction.ts`) — only one id armed at a time, with the same
  outside-click/Escape dismissal both existing implementations already used
  independently. Refactored `EquipmentWorkspace.tsx`'s Remove button and
  `CharacterLibraryPage.tsx`'s "Delete permanently" button onto it (now
  three call sites; duplicating the dismissal listener a third time crossed
  the threshold worth generalizing).
- Applied the same hook to the active character card's "Move to trash"
  button: first click arms it (icon `trash` → `warning`, filled
  `var(--danger)` background, title "Click again to move to trash"),
  second click moves it to trash. Added the matching
  `.character-card-action.danger-action[data-armed="true"]` CSS rule.
- Verification: full web suite (548/548), typecheck, lint,
  `scripts/check.sh` all pass. Manual CDP verification of the trash
  button's full state machine (unarmed → armed → Escape-disarmed →
  re-armed → confirmed-and-moved-to-trash) confirms the exact
  title/aria-label/icon/`data-armed` transitions and that
  `Page.javascriptDialogOpening` never fires.

## M5.5 complete — builder and Equipment interface closure (2026-09-28)

The product owner gave final approval to the shipped builder, library,
Inventory/Loadout, Shop, unavailable-option, and item-acquisition interactions
on 2026-09-28. That approval follows the recorded prototype and production
review passes rather than replacing them: the combined Shop/ritual/practice
surface was accepted live on 2026-09-22, and the final review covered the
subsequent per-choice purchase pages, recursively nested item choices, sibling
Power detail card, destructive-only two-click confirmation, immediate
reversible equipment changes, and matched Equipment/Shop wallet sizing.

Every M5.5 exit criterion has direct evidence:

| Exit criterion                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Result |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Product-owner approval                                                | Recorded accepted passes for the library, builder, navigation, candidate tables, Loadout, Inventory, shared cards, Shop, and rituals/practices, followed by the 2026-09-28 final approval of the shipped interaction.                                                                                                                                                                                                                                                             | Pass   |
| Complete principal Equipment workflows without the retired Compendium | Inventory-first Equipment and its Loadout swap share one inspector; peer Shop Browse covers items, rituals, formulas, and practices with exact acquire/manage/learn semantics. Stale Compendium routes recover to Characters, and D062 records that Shop uses its own memoized main-thread filter rather than the retired general query worker.                                                                                                                                   | Pass   |
| Approved unavailable candidates and item-owned choices                | Every candidate table owns its focused rules-illegal toggle. Shop resolves each item-owned choice, including a selected candidate's recursively required choices, before acquisition; the stored occurrence tree retains exact evaluator and legacy-export identity. Resolved names and sibling Power cards keep the result attached to the item.                                                                                                                                 | Pass   |
| Functional/browser and structural safeguards                          | The current gate passes 548/548 tests, formatting, lint, every TypeScript project, production/PWA build, Chromium/Firefox Letter/A4 print checks, deterministic content checks, and the query benchmark. Focused live Chromium passes cover the production Shop and final Equipment interactions; automated Firefox print/layout coverage remains green. Semantic labels, ordinary keyboard controls, responsive sizing, and reduced-motion behavior remain continuous contracts. | Pass   |
| Reconciled durable and user-facing documentation                      | `roadmap.md`, `interface-design-brief.md`, `decisions.md`, this status record, the repository summaries, architecture/checklist boundary, and `user-guide.md` now describe the shipped topology and the same deliberate deferrals.                                                                                                                                                                                                                                                | Pass   |

M5.5 is therefore complete. M5.6 owns only the refined browser View parity
surface. M5.7 owns final UI cleanup and invited-beta hostability preparation;
M5.8 owns the beyond-parity desktop/tablet Play foundation, and M6 depends on
M5.8 before phone adaptation. M9 owns the lightweight best-effort
browser/visual-print, security, migration, representative-device, and
release-performance hardening pass. D063 explicitly
removes a formal accessibility-certification or cross-client support-matrix
program. The native equipment edge cases retained in D044 and exact rules
limitations retained by the M5 support contract remain visible compatibility
work, not hidden M5.5 blockers. The coordinator reran
`nix develop path:. -c bash scripts/check.sh` on the exact documentation-closure
tree: all 548 tests, formatting, lint, workspace typechecks, production/PWA
build, Chromium/Firefox Letter/A4 print checks, deterministic public-pack checks,
and the query benchmark pass.

## Give the Equipment tab's wallet the same fixed width as Shop's (2026-09-28)

Product-owner report: on the Equipment tab, the wallet summary sat in a
`minmax(0, 1fr)` grid cell next to the Loadout/Inventory toggle and
stretched to fill it — expanding leftward across most of the pane instead
of staying a compact, fixed-size pill the way it appears in the Shop tab's
right rail (where its width comes for free from the rail's own
`clamp(28rem, 41vw, 32rem)` column).

- Added a `.funds-pane` rule giving it that identical `clamp(28rem, 41vw,
32rem)` width (plus `max-width: 100%` so it can still shrink on a narrow
  Equipment row rather than overflow) and `justify-self: end`, so within its
  still-flexible grid cell it hugs the right edge instead of stretching.
  Applies to both `FundsPane` usages (Equipment's inline placement and
  Shop's sticky rail placement) — harmless in the Shop rail, where the
  computed width already matched exactly (same `vw`-based expression,
  context-independent), confirmed via CDP (`getBoundingClientRect().width`
  512px in both tabs, and the Equipment wallet's right edge flush with its
  row's right edge — no leftover stretch space).
- Verification: full web suite (548/548 — no existing test covers this
  layout), typecheck, lint, `scripts/check.sh` (including the print
  computed-style contract, which didn't need updating) all pass.

## Replace native confirm() dialogs with in-place two-click confirmation (2026-09-28)

Product-owner request: the browser's native `confirm()` popup is clunky and
inconsistent with the rest of the UI. Audited every use in the app (4 total,
all in `EquipmentWorkspace.tsx`/`CharacterLibraryPage.tsx`) against the
stated principle — only confirm an action that's destructive or
irreversible — and handled each accordingly:

- **Equipment inventory "Remove" button** (destructive: loses the item with
  no proceeds) — replaced the native confirm with click-to-arm,
  click-again-to-confirm on the button itself. First click sets
  `data-armed="true"`: the icon swaps from `trash` to `warning`
  (`TriangleAlert`) and the button fills solid `var(--danger)` (its baseline
  is already the danger _text_ color, so the armed state needed a stronger,
  distinct signal — a filled background plus an icon change, not relying on
  color alone). The tooltip/aria-label switch to "Click again to remove"
  (and note the unequip side effect when relevant). Clicking elsewhere or
  pressing Escape disarms it, reusing the same dismiss-on-outside-click
  convention `openSaleId`'s sale menu already established in this file
  (`pointerdown` + `Escape` listeners keyed by a `data-*-trigger` attribute).
  Tooltip text also changed from "Remove without proceeds" to "Remove".
- **Equip-displace confirm** ("This will replace an item in the first
  compatible occupied Loadout slot.") — removed outright, no replacement.
  Displacing a Loadout occupant is reversible (re-equip it), so per the
  stated principle it doesn't warrant confirmation at all. The double-click
  equip/unequip toggle now always proceeds immediately; the row's tooltip
  wording was adjusted to state the replacement as fact rather than
  "after confirmation."
- **Quantity-reduction/sell-forces-unequip confirm** ("has no unequipped
  copies... will also unequip one copy") — also removed outright, same
  reasoning: unequipping is reversible, not data loss. The `−` quantity
  button and each sell-percentage option now act immediately.
- **Character library "Delete permanently" button** (genuinely destructive
  _and_ irreversible — purges from the trash) — this one does warrant
  confirmation, so it got the same two-click armed-button treatment as
  Remove rather than losing confirmation entirely: first click arms it
  (`data-armed="true"`, filled danger background, label changes to "Click
  again to delete permanently"), second click purges. Same outside-click/
  Escape dismissal convention as the Equipment button.
- Zero `window.confirm`/`window.alert`/`window.prompt` calls remain anywhere
  in `apps/web/src` (verified by grep).
- Verification: full web suite (548/548 — no existing tests referenced the
  removed confirm text or covered this interactive flow, so none needed
  updating), typecheck, lint, `scripts/check.sh` all pass. Manual CDP
  verification of the Remove button's full state machine (unarmed → armed →
  Escape-disarmed → re-armed → confirmed-and-removed) confirms the exact
  title/aria-label/icon/`data-armed` transitions at each step and that
  `Page.javascriptDialogOpening` never fires. Product-owner manually
  verified the interaction end-to-end.

## Resolve a chosen item power's own further choice at purchase time (2026-09-28)

Product-owner bug report: buying Genasi Soul Armor and picking its Ashfall
Evasion power caused a new "Ashfall Evasion Wisdom/Charisma/Intelligence"
choice to appear in the Build tab, grouped under "Race" — and locked
(unselectable). Root cause: item-owned choices are projected into the
rules evaluator so a chosen power's own effects apply, but Ashfall Evasion
itself has its own embedded choice (which ability governs it — an ordinary
part of how that power is authored, unrelated to genasi-ness). Once active,
the evaluator's generic per-occurrence scan found that embedded choice and
surfaced it as a real build-level choice: bucketed under "Race" because the
Build tab groups purely by the select rule's raw content-authoring type
label ("Racial Trait"), with no awareness of the actual grantor; locked
because resolving a choice requires locating its provider in the
character's normal level-by-level history, which the lookup never searches
inside inventory items for.

Rather than teaching that machinery to also reach into inventory items,
resolve it entirely within the Shop dialog, the same way as everything
else — as another page in the same purchase flow, using the exact
recursive occurrence-nesting the evaluator's projection step already
understands, so the evaluator sees it as already answered and never
surfaces it as an open build-level choice at all:

- `AcquisitionDialogPage`'s item-choice variant now carries a `slotPath:
readonly number[]` instead of a flat `slotIndex: number`, so a page can
  represent an arbitrarily nested choice (`[0]` = the item's own first
  choice; `[0, 0]` = that choice's chosen candidate's own first choice).
- New `itemChoicePages(entity, entities, characterLevel, selections)`
  (`ShopWorkspace.tsx`) depth-first-discovers every currently-needed page:
  each of `entity`'s own slots, and — once a slot has an answer — that
  candidate's own further choices, recursively. A candidate's choices only
  become visible once it's picked, so the page list grows as `selections`
  fills in; nothing guesses ahead at what an unpicked candidate might need.
  `acquisitionDialogPages` now takes the resulting path list directly
  (signature change, existing tests updated) instead of a bare count.
- New `resolveItemChoiceOccurrences(...)` mirrors that same recursion but
  builds the actual `BuildOccurrence` tree to store — each resolved
  sub-choice nested under its parent candidate's own occurrence, matching
  exactly where `build-projection.ts`'s existing projection step already
  looks for one. Confirmed this needs no evaluator-side changes at all: the
  projection's `visit` is already recursive over `occurrence.children`.
- `itemChoiceSelections` changed from `Map<number, string>` to `Map<string,
string>`, keyed by dot-joined path (`"0"`, `"0.0"`). Changing a choice now
  prunes any selections nested under it (`onChoose` deletes keys with that
  prefix) so switching to a candidate without a sub-choice doesn't leave a
  stale, harmless-but-confusing leftover answer for a different candidate's
  slot shape.
- Verification: 4 new unit tests covering nested-page discovery, nested
  occurrence resolution, and the stale-selection-pruning edge case, plus 2
  new `acquisitionDialogPages` cases for the new signature — full web suite
  548/548, typecheck, lint, `scripts/check.sh` all pass. Product-owner
  manually verified end-to-end: picking the power with its own further
  choice now presents it as a second page in the same dialog, and after
  the purchase completes, nothing related to it appears anywhere else in
  the Build tab.

## Move the Shop dialog's Resulting item/Price into the footer (2026-09-25)

Product-owner correction: "Resulting item"/"Price" lived in the dialog's
scrollable body, alongside the candidate list — on a page with a long list
(28 compatible base items, say), they could scroll out of view along with
everything else, even though the earlier scroll-gap fix already guaranteed
the _footer_ stays pinned.

- Moved `<dl className="shop-physical-summary">` out of
  `.shop-physical-dialog-body` and into `<footer>`, as its first child; the
  Cancel/Back/Next-or-Confirm buttons now live in a new sibling
  `.shop-physical-dialog-actions` wrapper. The footer already never scrolls
  (it's outside the flex-column body's `overflow-y: auto` region), so this
  makes the summary permanently visible regardless of list length or scroll
  position.
- Redesigned `.shop-physical-summary` for its new home: a compact two-row
  block (`font-size: 0.8rem`) that takes the remaining footer width
  (`flex: 1; min-inline-size: 0`) and truncates a long resulting name with
  an ellipsis rather than wrapping or pushing the action buttons
  (`flex: none` on the actions wrapper) off-screen. `.shop-physical-dialog
  > form > footer`changed from`justify-content: flex-end`to`space-between`to place the summary on the left and actions on the
right; split that rule out from the one shared with`.wallet-dialog`,
which keeps its own unrelated footer unchanged (`flex-end`, no summary).
- Verification: full web suite (302/302), typecheck, lint,
  `scripts/check.sh` all pass. Manual CDP verification: scrolled a 28-item
  candidate list to its true bottom and confirmed the footer — including
  "Resulting item"/"Price" — stays visible the entire time, on both the
  normal (45rem) and complex-choice-widened (58rem) dialog states.

## Fix: resolved-choice Power card was nested, not a sibling (2026-09-25)

Product-owner correction on the same-day secondary-detail-card checkpoint:
the resolved-choice Power card was placed _inside_ the item's own primary
card (via `EntityCardBody`'s `afterFields`, the same slot `ItemDetail`
already used for an item's own unconditionally-granted powers) rather than
as a sibling card immediately after it — unlike how a granted power is
shown in the Build choice inspector (`CandidateDetail.tsx`), where a
granted entity is a true sibling `CandidateDetailCard` in
`.candidate-detail-stack`, never nested inside the entity that grants it.

- `ItemDetail` (`EquipmentWorkspace.tsx`) no longer merges
  `resolvedChoicePowers` into `grantedPowerCards`/any component's
  `afterFields`. It now builds a separate `resolvedChoicePowerCards` list
  and renders it as a sibling of `primaryCard`, reusing the existing
  `formulaItem` sibling-wrapping branch (`.candidate-detail-stack`) that
  previously only fired for alchemical formula items — both a resolved
  Power choice and a formula item can now cause that wrapper, independently
  or together.
- An item's own unconditionally-granted powers (`composedGrantedPowers`,
  entirely unrelated to item-owned choices) are unchanged — still nested
  via `afterFields`, since the correction only concerns resolved item-owned
  choices.
- Strengthened the regression test (`EquipmentWorkspace.test.ts`) to assert
  structure, not just presence: the resolved Power's card must render after
  the primary card's own `</aside>` closes, confirmed via string-index
  comparison on the rendered markup (the SSR-only test convention this
  codebase uses for interactive component coverage).
- Verification: full workspace suite (544/544), typecheck, lint,
  `scripts/check.sh` all pass. Manual CDP verification confirms the
  rendered DOM: the Power card element is a direct child of
  `.candidate-detail-stack` and `.contains()` from the primary `<aside>`
  returns false for it.

## Shop acquisition dialog: per-choice pages and a detail card for complex choices (2026-09-25)

Follow-up to the same-day secondary-detail-card checkpoint: the product
owner approved a proposed design and asked for it, plus one refinement —
give each item-owned choice its own dialog page instead of stacking
multiple choices on one page.

- **`AcquisitionDialogPage` is now a discriminated union**
  (`{kind: "item-choice", slotIndex} | {kind: "physical"}`) instead of a
  flat `"item-choices" | "physical"` string. `acquisitionDialogPages`
  produces one `item-choice` page per slot, in slot order, before the
  physical page — so an item like Book of Undeniable Fire (two Power
  choices) now gets three pages total instead of one crowded page. Every
  page-comparison call site in `ShopWorkspace.tsx` (the header, the Next/
  disabled guards, the Resulting-item text, the Confirm/Buy/Give label)
  switched from string equality to `.kind`/`.slotIndex` checks.
- **A choice whose candidates are Powers now shows a two-column picker +
  detail-card layout**, reusing `.choice-selection-layout`/
  `.choice-editor-fields` — the exact same primitive Build's choice editors
  already use for "pick from a list, see the full card for whatever's
  selected." Left column: the existing `CompactChoiceButtons`. Right column:
  a full detail card for whichever candidate is currently selected
  (defaulting to the first, so something's visible immediately), built by
  exporting the previously-private `CandidateDetailCard` from
  `CandidateDetail.tsx` and calling it with just `entity` — it already
  handles a missing `candidate`/`relationship`/`themePowerLevel` and reads
  `hideFlavortext` from context itself, so no new card-rendering code was
  needed. A simple choice (resistance type, language) keeps the original
  single-column, no-detail-card layout — decided by a new exported pure
  predicate, `isComplexItemChoice(candidates)`, checking for a `"power"`
  candidate type (the same threshold `ItemDetail`'s granted-power filter and
  the resolved-choice secondary card both already use).
- **The dialog widens for a complex-choice page and narrows back down for
  every other page** (`shop-physical-dialog--detail`, 58rem vs. the normal
  45rem) — `.choice-selection-layout`'s two columns want more room than a
  single compact button list does, and confirmed via CDP that this resizing
  is clean (no layout jank, no reintroduction of the earlier scroll-gap bug
  — the detail card has no nested `overflow:auto` of its own, so it doesn't
  trigger the same `<dialog>` sizing quirk that a previous checkpoint fixed
  for the base-item list).
- Verification: two new `acquisitionDialogPages` cases (multi-slot
  pagination) plus a new `isComplexItemChoice` unit test; full workspace
  suite (544/544, +3), typecheck, lint, `scripts/check.sh` all pass. Manual
  CDP verification against a new three-page synthetic fixture (Power choice
  → resistance-type choice → base-armor pairing): page 1 renders the wide
  two-column layout with "Fireheart Blast" previewed by default and swaps to
  "Iceheart Blast" on click; page 2 renders the narrow single-column layout
  for the resistance-type pick; Back from page 3 to page 1 preserves both
  earlier selections; the final inventory entry composes both choices
  correctly ("Dual-Soul Public Plate of Probing +2 (Fireheart Blast, Fire)").

## Item-owned choice: show the chosen Power as a secondary detail card (2026-09-25)

Product-owner report: buying an item like Genasi Soul Armor (armor with an
item-owned choice resolving to a specific Power) showed no secondary detail
card for the chosen Power in Equipment's item detail pane, unlike how a
power such as Valorous Smite shows a granted power (e.g. Divine Challenge)
as a nested card beneath it. Traced the gap: `grantedDetailEntities`
(`builder-ui.ts`) — the existing mechanism behind that nested-card pattern —
only reads an entity's own unconditional `grant` rules; an item-owned choice
is a `select` rule resolved at purchase time and stored as a
`BuildOccurrence` child on the inventory entry's last element, which nothing
before this change ever resolved into a `ContentEntity` for card rendering
(`inventoryDisplayName` resolved it only far enough to read its `.name` for
the parenthesized-suffix string, then discarded the entity).

- Extracted `resolvedItemChoices(entry, byId)` (`equipment-ui.ts`) out of
  `inventoryDisplayName`'s inline logic — same resolution, now returning
  `{name, entity}` per resolved (non-`unresolved`) child instead of just a
  joined string, so both the display name and any future consumer share one
  source of truth. `inventoryDisplayName` itself is unchanged in behavior.
- `InspectedItemDetail` (`EquipmentWorkspace.tsx`) gained an optional
  `resolvedChoiceEntities` field; `inventoryItemDetail` populates it via
  `resolvedItemChoices`. `catalogItemDetail` (pre-purchase Shop browsing)
  doesn't set it — there's no resolved choice before a purchase exists.
- `ItemDetail` now merges `resolvedChoiceEntities` (filtered to
  `type === "power"`, matching the exact filter already used for granted
  powers — feats and other granted types don't get their own card there
  either) into the same `EmbeddedPowerCard` list as granted powers, attached
  to the item's last (enchantment) component — the same one the resolved
  child actually lives under. Reuses the existing primitive exactly as-is;
  no new card component needed.
- A resolved choice that ISN'T a power (a resistance type, a language) still
  shows only in the parenthesized name suffix, unchanged — those aren't
  card-worthy entities and getting one would just be noise.
- Verification: three new unit tests (`EquipmentWorkspace.test.ts`) —
  `inventoryItemDetail` resolves the chosen entity; `ItemDetail` renders a
  nested `theme-power-card` for a resolved Power; a resolved non-Power choice
  renders no such card. Full workspace suite (542/542, +3), typecheck, lint,
  `scripts/check.sh` all pass. Manual CDP verification against a synthetic
  fixture modeled on Genasi Soul Armor (armor enchantment with its own
  `select type="Power"` choice, paired with a base armor): after purchase,
  Equipment's detail pane for "Soul Public Plate of Probing +2 (Fireheart
  Blast)" shows a nested "Fireheart Blast" power card with its own
  usage/type/level line and flavor text, matching the Valorous
  Smite/Divine Challenge pattern.

## Shop acquisition dialog follow-up fixes (2026-09-24)

Four more product-owner review items on the same dialog, after using it hands-on:

- **Restored the "Resulting item"/"Price" summary on page 1**, but page 1's
  "Resulting item" always uses the generic form (e.g. "Armor of Resistance +2
  (Fire)") regardless of any base-item already picked on page 2 (persisted in
  `selectedPhysicalId` if the user went Back), while page 2 still shows the
  fully composed specific name (e.g. "Banded Mail of Resistance +2 (Fire)").
  Added `genericPreviewName`, computed identically to the existing
  `previewName` but always passing `undefined` for the physical base to
  `inventoryEntryForEntity`, so it can't pick up a stale page-2 selection.
- **The physical-item list's Name and Type columns are both now sortable**,
  matching the sort-button convention used by every other selector table in
  the app (`selection-sort-button` + chevron, toggling ascending/descending
  on repeat clicks). Added `physicalSort` state (defaulting to name/
  ascending, matching `compatibleBaseItems`'s existing name-sorted return
  order) and a `selectPhysicalSort` toggler mirroring the existing
  `sort`/`selectSort` pattern, scoped to this dialog only. The list isn't a
  real `<table>` (it's a radiogroup of `<label>` rows), so `aria-sort` —
  which the spec ties to `columnheader`/`row header` roles — isn't
  appropriate here; used a `data-sort-active` attribute instead and extended
  the shared chevron opacity/rotation CSS to match on it as an alternative to
  `th[aria-sort]`.
- **Fixed a real bug: page 2 left a large blank scrollable area below the
  footer.** Root cause, found via `scrollHeight`/`clientHeight` diagnostics
  in a raw-CDP repro with a 28-item candidate list: `.shop-physical-list` had
  its own `max-block-size: 20rem; overflow: auto` to keep long lists from
  growing the dialog, but `<dialog>` elements are `overflow: auto` and
  `height: fit-content` by UA default — nesting one auto-sizing scroll
  container inside another made Chromium compute the _outer_ `<dialog>`'s
  `scrollHeight` from the _inner_ list's unclamped content height (nearly
  1400px) while its rendered `clientHeight` stayed correctly clamped
  (~650px), so the dialog itself became independently, spuriously
  scrollable — revealing a gap of pure phantom overflow below the footer.
  Fixed by giving `.shop-physical-dialog` an explicit `max-block-size:
min(88vh, 42rem)` and `overflow: hidden` (so it can never itself scroll),
  making `form` a `flex: 1` column with its own `overflow: hidden`, and
  wrapping everything between `<header>` and `<footer>` in a single new
  `.shop-physical-dialog-body` (`flex: 1 1 auto; min-block-size: 0;
overflow-y: auto`) — the one legitimate scroll container. Removed the
  now-redundant per-child `max-block-size`/`overflow` from
  `.shop-physical-list` itself. Result: header and footer (Cancel/Back/
  Confirm) are always pinned and reachable; the body scrolls as one region
  only when content genuinely exceeds the dialog's height cap, with no
  phantom trailing space. Verified via the same CDP repro (a 28-item
  synthetic list, matching the real "Armor of Resistance" candidate count) at
  both a typical (1000px) and a short (800px) viewport height, scrolling the
  body to its true end and confirming the last row, summary, and footer sit
  flush with no gap.
- **The base-item list's rows didn't highlight on hover**, unlike every row
  in the main Shop browse table (`.shop-table tbody tr:hover`), which was
  jarring since both look and behave like item tables. `.shop-physical-list
label` previously only styled `:has(input:checked)` (selected) and
  `:has(input:focus-visible)`; added a matching `:hover` background
  (`var(--surface-subtle)`, the same token and `100ms` transition as the
  main table) plus `cursor: pointer`, ordered before the `:checked` rule so
  a selected row's accent background still wins over hover. The row
  background alone didn't match the main table's full hover treatment
  though — there, hovering also turns the item _name_ the focus color and
  underlines it (`.table-inspect-button:hover`); added the equivalent
  `label:hover .shop-physical-choice > strong` rule so the name itself
  reacts the same way.
- Verification: full public web suite (297/297), typecheck, lint, and
  `scripts/check.sh` all pass; manual CDP verification as above, plus a
  synthetic mouse-move check confirming the hovered row's computed
  `background-color` changes.

## Shop acquisition dialog simplification (2026-09-24)

Product-owner review of the two-page acquisition dialog (`.shop-physical-dialog`
in `ShopWorkspace.tsx`) asked for less chrome now that the item-owned-choice
naming design (previous checkpoint) carries most of the information the
removed elements used to convey:

- **Removed the "Step X of Y: ..." eyebrow line from both pages.** The dialog
  header is now just the `<h2>` and the close button.
- **Page 1's `<h2>` now shows the choice's own label** (the same text
  previously passed as `CompactChoiceButtons`'s `label` prop, e.g. "Choose
  damage type") instead of a generic "Buy/Give {item}" heading, and the
  redundant `selection-subsection-heading` legend inside
  `CompactChoiceButtons` is gone for this caller. Added a `hideLabel` prop to
  `CompactChoiceButtons` (`ChoiceEditors.tsx`) that keeps `label` as the
  fieldset's accessible name (via a `visually-hidden` legend) without
  rendering it visibly, for callers — like this one — that already show the
  same text as their own heading. Page 1's "Resulting item"/"Price" summary
  (`dl.shop-physical-summary`) is removed entirely; a single item-owned choice
  with no base-item pairing doesn't need a preview.
- **Page 2's `<h2>` is now "Choose base {kind} type"**, where `{kind}` is the
  same item-kind text the detail card's `entity-kind` eyebrow shows (e.g.
  "Armor", "Weapon") rather than the dialog's own `nouns.singular` value —
  those two disagreed in edge cases (the noun helper adds shield/holy-symbol
  special cases the card label doesn't have). Extracted the shared kind
  computation out of `EntityCard.tsx`'s `itemCardLabel` into a new exported
  `itemKindLabel(entity, physicalBase?)` (same logic, just without the
  trailing level `itemCardLabel` appends), and `itemCardLabel` now calls it
  instead of duplicating the logic. Corrected same day after initial review
  used `nouns.singular` instead. "Resulting item" is reformatted to the same
  composed name `inventoryDisplayName` produces elsewhere (base + enchantment + bonus
  suffix + parenthesized choice), computed from a live preview
  `BuildInventoryEntry` built from the current page-1/page-2 selections
  (`inventoryEntryForEntity`, already existed for the commit path) instead of
  the previous ad hoc `"{item} · {base}"` string. "Price" is unchanged.
- **The final submit button reads "Confirm" whenever page 2 (the physical/
  base-item page) is the last page**, replacing "Buy"/"Give" there; the
  single-page item-choices-only case (no base-item pairing needed) still
  reads "Buy"/"Give", since the product owner's request was scoped to "the
  2nd page".
- Deduplicated the `itemChoiceChildren`-construction logic that used to be
  inline in the submit handler only — it's now a single `useMemo`-free
  `resolvedItemChoiceChildren` computed value shared by both the live preview
  and the actual commit, so they can't drift.
- Verification: updated the one test (`builder-header-integration.test.ts`)
  that asserted on `CompactChoiceButtons`'s legend source text literally;
  full public web suite (297/297) and `scripts/check.sh` pass. Manual
  end-to-end verification through a production build via raw CDP confirms
  both pages render as described, the Back/Next/Confirm flow preserves
  selections, and the final inventory entry is unaffected
  ("Public Bastard Sword of Probing +2 (Fire)").

## Item-owned choice design simplification, round 3 (2026-09-24)

Further product-owner review simplified the design rather than continuing to
patch it:

- **A resolved item-owned choice now shows in the item's own display name**,
  as a parenthesized suffix — `Banded Mail of Resistance +2 (Fire)` — instead
  of a separate "Properties" line in the detail card. `inventoryDisplayName`
  (`equipment-ui.ts`) appends every resolved (non-`unresolved`) child on the
  holding's last element, stripped to its bracketed variant via the same
  `parentheticalName` helper the pickers use, comma-joined if an item ever has
  more than one such choice. An item with no resolved choice is unaffected.
  This is the single shared naming path already used by Inventory, Loadout,
  Shop, and the detail card header (`inventoryItemDetail`/`catalogItemDetail`
  both route through it), so the change is visible everywhere consistently.
- **The Equipment-workspace item-choice editor (previous two checkpoints) is
  removed entirely** — the product owner judged it redundant now that the
  name itself carries the information, given every purchase already resolves
  its choice through the Shop wizard (mandatory before Buy/Give completes)
  and legacy `.dnd4e` imports either already carry the recovered choice or
  didn't in the original game either. Removed as dead code, not just hidden:
  the `item-choice-panel` JSX and its CSS; the `onChooseInventoryChild` prop
  threaded from `CharacterEditorPage.tsx` through `EquipmentWorkspace`/
  `ItemDetail`; the `entry`/`entities` props `ItemDetail` only needed for
  this; the `choose-inventory-child` `CharacterCommand` (character-domain)
  and its reducer case; and `unresolvedInventoryItemChoices` (rules-engine),
  which in fact had no other caller even before this round. The Shop
  purchase-time wizard (page 1 of the acquisition dialog) is unaffected and
  remains the only way a choice is made — this is a real, acknowledged scope
  reduction: an already-owned holding whose choice was never resolved (never
  actually observed, but theoretically possible from an unusual import) now
  has no in-app editor. `itemChoiceSlots`/`itemChoiceCandidates`/
  `CompactChoiceButtons` remain in Shop's own dialog, which still needs them.
- **The composed bonus prefix is now a suffix, matching the legacy builder's
  "Item +X" convention, for every item type.** `formatInventoryItemName`
  (character-domain) previously special-cased armor/weapon/implement
  composition to read `+2 Banded Mail of Resistance`; other item types
  already displayed correctly because they fall through to using the raw
  (already suffix-authored) entity name unchanged. Changed the one line
  constructing the composed name so armor/weapon/implement items match
  everything else: `Banded Mail of Resistance +2`. Confirmed this is
  display-only — `formatInventoryItemName` has exactly three callers
  (`equipment-ui.ts`'s `inventoryDisplayName`, `sheet-model`'s card/equipment
  labels, and its own tests); `legacy-dnd4e`'s byte-preserving export does
  not call it, so the legacy-compatibility export contract is untouched.
- Verification: updated/added unit tests across `character-domain`,
  `equipment-ui.test.ts`, `sheet-model`, and `EquipmentWorkspace.test.ts` for
  the suffix ordering and the parenthesized-choice suffix (including the
  ordering between them: bonus before choice). Full public suite: 539/539
  tests (down from 546 — 8 removed with the deleted editor, all replaced or
  superseded by the naming tests), typechecks, lint, production/PWA build,
  and the print/style-contract gate all pass (`scripts/check.sh`). Manual
  end-to-end verification through a production build via raw CDP: buying an
  item needing only its own choice (no base pairing) now shows
  "Armor of Probing (Fire)" in Inventory; buying one needing both a
  choice and a base-item pairing (through the two-page wizard, unaffected)
  shows the full composed form, "Public Bastard Sword of Probing +2 (Fire)";
  clicking either item in Equipment confirms no Properties panel renders. No
  console errors.

## Item-owned choice product-owner review fixes, round 2 (2026-09-24)

Four more issues from continued product-owner review, all fixed and verified:

- **Compatibility header removed; its info was already available and more
  precise elsewhere.** The product owner pointed out that an enchantment's
  own "Armor"/"Weapon" specific field (already surfaced in
  `.item-card-descriptors` — the same field `compatibleBaseItems` in
  `equipment-ui.ts` reads) already names the exact compatible base types,
  making the separate compatibility header from the prior checkpoint
  redundant. Removed it entirely (`ItemDetail`'s use of `item.compatibility`,
  the `InspectedItemDetail.compatibility` field, and the `onInspect`
  4th argument in both `ShopWorkspace.tsx` and `EquipmentWorkspace.tsx`).
  `EntityCard.tsx`'s `itemDescriptorRows` now leads with the "Armor"/"Weapon"
  field instead of leaving it in the unordered tail group, so the same
  information is emphasized where it already lived.
- **Header/flavor-text spacing, found via the same investigation.** The
  `.candidate-detail > header.primary-detail-heading` box contributes its own
  bottom margin (`--entity-card-header-margin-bottom`, 0.85rem) _and_ flavor
  text (`.candidate-flavor`) supplies its own top padding (0.8rem); composed
  and top-level-power cards already zeroed the header's margin to avoid
  stacking both, but an ordinary single-entity card (e.g. an uncomposed Shop
  enchantment) never got the same treatment. Added
  `header.primary-detail-heading:has(+ .candidate-flavor) { --entity-card-header-margin-bottom: 0; }`
  so any card immediately followed by flavor text gets the same tight,
  single-source spacing. `scripts/check-print.mjs`'s computed-style contract
  gate had a hardcoded `"13.6px"` expectation for exactly this "ordinary
  header, then flavor" case — updated to `"0px"` to match the corrected,
  intentional rhythm (not a regression: the gate is what caught that this
  spacing is now shared code, verifying the fix rather than blocking it).
- **Item-owned choice candidates showed the full redundant name.** Real
  corpus candidates are named like `Armor of Resistance +2 (Fire)`, not just
  `Fire` — every option in a picker repeated the item's own name. Reused the
  existing `parentheticalName` helper (until now module-private in
  `builder-ui.ts`, already used by `groupParameterizedCandidates` for the
  established "Name (Parameter)" family/variant split, e.g. `Weapon
Proficiency (Greatbow)`) to display just the bracketed variant
  (`.variant`) wherever a candidate or an already-resolved choice is shown,
  falling back to the full name for any candidate that isn't
  parenthetically shaped. The stored `BuildOccurrence`/`ContentEntity` name
  is unchanged — only the display label is stripped.
- **Picker styling didn't distinguish header from choices.** Both item-choice
  pickers (the Shop dialog's page 1 and the Equipment-workspace editor) used
  ad hoc `<input type="radio">` markup with no dedicated styling, so the
  heading and the options read as the same weight. Exported the existing
  `CompactChoiceButtons` component (previously module-private in
  `ChoiceEditors.tsx`; already the established pattern for Gender/Alignment/
  retraining-target pickers elsewhere in the builder — a `<fieldset>` legend
  heading plus a button grid with a clear selected/bordered state) and reused
  it in both surfaces instead of hand-rolled markup, deleting the
  now-dead `.shop-item-choice-label`/`.item-choice-options` CSS.
- Verification: `EntityCard.test.ts` and `EquipmentWorkspace.test.ts` cover
  the descriptor-row promotion and the parenthetical-name stripping
  (unresolved picker and locked display) with a real "Armor of Resistance +2
  (Fire)"-shaped fixture, not just plain names. Full public suite: 546/546
  tests, workspace typechecks, lint, production/PWA build, and the updated
  Chromium/Firefox print/style-contract gate all pass (`scripts/check.sh`).
  Manual end-to-end verification extended the probe fixture with a `flavor`
  field and a realistic parenthetical candidate-name pattern, driven through
  a production build via raw CDP: the Shop dialog and the Equipment editor
  both now show plain "Fire"/"Poison" as clearly bordered `CompactChoiceButtons`
  options (selected state highlighted, matching the app's established
  choice-picker look) instead of full-name radio rows; the resolved/locked
  display also shows the stripped name; inspecting the weapon enchantment
  in Shop shows "Weapon" as the first descriptor row with no compatibility
  header, and the measured gap between the header and its flavor text
  dropped from a doubled margin to exactly the flavor element's own padding
  (0px extra). No console errors.

## Item-owned choice product-owner review fixes (2026-09-24)

Three issues the product owner found testing the prior two checkpoints against
the real corpus's Armor of Resistance, all now fixed and verified:

- **Candidate list was wrong, not just noisy.** `itemChoiceCandidates`
  (`equipment-ui.ts`) filtered only by content `type`, ignoring the select
  rule's `Category` expression entirely (`ItemChoiceSlot.category` was
  captured but never read). Real corpus "Class Feature"-typed records include
  many unrelated entities (ability scores, other features) narrowed only by
  Category, so every one of them offered as a "resistance type." Fixed by
  reusing the rules engine's own production matching — `RulesIndex.type`,
  `RulesIndex.categoryValues`/`categoryAliases`, and
  `matchesCategory`/`parseCategoryExpression` from `expressions.ts` — rather
  than reimplementing category logic; a small `WeakMap`-cached `RulesIndex`
  per `entities` array avoids rebuilding it per slot/render. `level` is now an
  optional third parameter (Shop passes `characterLevel`, the Equipment
  editor passes the holding's `acquiredLevel`) for the rare numeric/`$$LEVEL`
  category term; `$$`-dynamic prefixes and the five class/power-specific
  exceptions layered onto ordinary category matching do not apply to item
  properties and were deliberately not ported.
- **Shop dialog crammed both choices into one crowded page.** Restructured
  into a paginated wizard: item-owned choices are page 1, a compatible-base
  pairing is page 2 (only when both are actually needed — either alone still
  shows as a single page with no Back/Next, matching prior behavior). Footer
  shows Back (not on page 1) and Next/Buy·Give (Next advances when the
  current page is answered; the last page keeps the existing Buy/Give
  submit). The eyebrow reads "Step X of Y: …" only when there are multiple
  pages. Page sequencing is an extracted pure function,
  `acquisitionDialogPages(itemChoiceCount, physicalChoiceCount)`, directly
  unit-tested — the interactive paging itself isn't, since this codebase's
  React component tests are `renderToStaticMarkup`-only and cannot reach a
  dialog's post-click state; manual end-to-end verification (below) covers
  that gap.
- **Compatibility note visually inside the header, unstyled since it was
  first written.** Investigated via full git archaeology
  (`git log -p --follow` / `git log -S` across `EntityCard.tsx`/
  `styles.css`): this was never a regression from the M5.5 CSS-primitives
  consolidation or from this feature's own commits — `.shop-detail-compatibility`
  has had zero dedicated CSS since its introduction on 2026-09-22, always
  rendered through `EntityCardHeader`'s shared `subheading` slot (which is
  correctly still used for other header-level notes like "Unavailable"/
  "Replaces X" in `CandidateDetail.tsx` — untouched). It only became visible
  as a real issue once the new Properties panel started sitting directly
  below it. Fixed by moving Shop's compatibility note out of the header
  subheading and rendering it as an ordinary body row reusing the existing
  `.entity-card-rules` treatment (the same visual language as "PRICE"/
  "WEAPON" specific-field rows), so it now sits in the card's normal
  dark-background body, not the tone-colored header band.
- Verification: new unit tests — `equipment-ui.test.ts` (Category narrows a
  shared-type candidate pool to the correct subset, decoys excluded),
  `ShopWorkspace.test.ts` (`acquisitionDialogPages` page-sequencing table),
  `EquipmentWorkspace.test.ts` (compatibility markup sits after `</header>`).
  Full public suite: 545/545 tests, workspace typechecks, lint,
  production/PWA build, and Chromium/Firefox print checks all pass
  (`scripts/check.sh`). Manual end-to-end verification used an extended
  version of the prior checkpoints' public probe fixture — a `select`
  rule with an explicit `Category: Resistance` plus two matching candidates
  and two same-type decoys ("Dexterity", "Unrelated Class Feature") that must
  not appear — driven through a production preview build via raw CDP:
  - Purchasing an item needing only its own choice (no base pairing) still
    shows the correct two-candidate list (decoys excluded) with the earlier
    single-page flow intact.
  - Purchasing an item needing both an item-owned choice and a base-item
    pairing (a weapon enchantment) shows the wizard: page 1 "Step 1 of 2:
    Choose its properties" with Next disabled until a candidate is picked, a
    "Back" button appearing only from page 2 onward, page 2 "Step 2 of 2:
    Choose a compatible weapon" with the physical radiogroup and a "Buy"
    submit, Back correctly returning to page 1 with the earlier selection
    retained, and the finished purchase landing in Inventory correctly
    composed.
  - The Equipment-workspace editor (previous checkpoint) still offers only
    the correctly filtered candidates and still locks live on selection.
  - Inspecting a Shop weapon enchantment shows its "Compatible weapons"
    note as a normal body row beneath the header, not inside the
    tone-colored title band.
  - No browser console errors in any of the above.

## Equipment-workspace item-owned choice editor checkpoint (2026-09-24)

- Closes the M5.5 item-owned-choice deliverable's second half. The shared
  `ItemDetail` card (used identically by Inventory, Loadout, and Shop) now
  accepts an optional owned `entry` plus `entities`/`onChooseInventoryChild`.
  When the inspected holding's own element has unresolved `itemChoiceSlots`,
  it renders a "Properties" panel: one radiogroup per unresolved slot
  (candidates via the same `itemChoiceCandidates` helper the Shop dialog
  uses, now shared in `equipment-ui.ts`), or, once a slot has a resolved
  child, a locked read-only row (lock icon + slot label + chosen name) that
  is not re-editable — matching the product owner's "fixed at purchase,
  forever" model. Selecting a candidate dispatches the new
  `choose-inventory-child` command directly.
- `EquipmentWorkspace` tracks the inspected holding by `entryId` (not just
  the earlier detail snapshot) and re-derives the live `BuildInventoryEntry`
  from `build.inventory` on every render, so a choice made in the panel
  flips to locked immediately without needing to re-click the row. Shop
  catalog inspection (not an owned holding) continues to clear this and
  shows no properties panel, matching that a not-yet-purchased item has
  nothing to edit here — its own prompt is the purchase-time modal from the
  previous checkpoint.
- Verification: three new `EquipmentWorkspace.test.ts` cases (unresolved
  slot offers every candidate, a resolved slot renders locked and not as a
  radio input, catalog inspection omits the panel entirely) plus the
  existing `equipment-ui.test.ts`/`ShopWorkspace.test.ts` suites, all
  passing. Full public suite: 542/542 tests, workspace typechecks, lint,
  production/PWA build, and Chromium/Firefox print checks all pass
  (`scripts/check.sh`). Manual end-to-end verification extended the prior
  checkpoint's public probe fixture with a second, pre-owned holding that
  has the item's `select` rule but no stored child (simulating an import or
  a purchase made before this existed), driven through a production preview
  build via raw CDP: opening it in Equipment shows the properties panel with
  both candidates and no lock; clicking "Resist Poison" flips it to
  "🔒 Class Feature: Resist Poison" in the same render pass, with no
  options remaining and no console errors.
- This closes both named M5.5 item-owned-choice deliverables (purchase-time
  prompt and Equipment-workspace editor). What remains for M5.5 overall is
  product-owner review of the shipped interaction and reconciling the final
  milestone documentation — see `docs/roadmap.md`'s M5.5 closure status.

## Shop purchase-time item-owned choice checkpoint (2026-09-24)

- The Shop acquisition flow now prompts for an item's own choices (for
  example Armor of Resistance's damage type) at purchase time, using the same
  dialog and state machine as the existing enchantment-to-base-item picker
  rather than a separate flow. `beginAcquire` now also computes
  `itemChoiceSlots(entity)` (content-only, no character context needed) and
  opens the modal whenever either a base-item pairing or an item-owned choice
  is required; the previous instant-commit fast path is unchanged when
  neither is needed.
- The dialog renders the compatible-base-item radiogroup only when more than
  one physical option exists (unchanged), and one additional radiogroup per
  required item-owned choice slot, each listing every entity whose `type`
  matches the slot's required category. The eyebrow copy adapts to which
  sections are present ("Choose a compatible weapon", "Choose its
  properties", or both combined). Submission is blocked until every required
  slot has a selection; the resolved choices are built into
  `BuildOccurrence` children and passed through `inventoryEntryForEntity`'s
  new fourth parameter, which attaches them beneath the purchased item's own
  element (not the base item's, when both are present).
- Verification: new unit test in `equipment-ui.test.ts` covers
  `inventoryEntryForEntity`'s new parameter (with and without a base item,
  and the unchanged no-choice case). Full public suite: 539/539 tests,
  workspace typechecks, lint, production/PWA build, and Chromium/Firefox
  print checks all pass (`scripts/check.sh`). Manual end-to-end verification
  used a purpose-built public fixture (one Magic Item with a `select
Class Feature` rule and two candidate class features, no base-item pairing
  needed) driven through a production preview build via raw CDP: the Shop
  listed the item, Buy opened the dialog with eyebrow "Choose its
  properties", no physical-item section, one "Choose class feature"
  radiogroup listing both candidates, Buy disabled until a candidate was
  selected; after selecting and submitting, the item appeared in Inventory
  with no console errors.
- Not yet built: an Equipment-workspace surface for holdings whose
  item-owned choice is still unresolved (covers `.dnd4e` imports and any
  future edge cases where a purchase produced no prompt). That is the next
  checkpoint and closes out this M5.5 item.

## Item-owned choice domain foundation checkpoint (2026-09-24)

- `packages/rules-engine/src/build-projection.ts` gains `itemChoiceSlots(entity)`,
  a pure content-only helper (parses `select` rules via the existing `parseRules`)
  that reports the item-owned choice slots an item's own rules require (for
  example Armor of Resistance's damage type), independent of any character —
  safe to call before the item is ever owned, at Shop purchase time.
  `unresolvedInventoryItemChoices(inventory, entities)` scans every owned
  holding and reports which item-owned choice slots are still unfilled,
  regardless of equip state.
- This closes a real evaluation gap found while investigating: the existing
  evaluator already surfaces a pending item-owned choice as an
  `EvaluatedChoice` when the item is equipped (confirmed by probing), but
  never when it is carried unequipped — so a freshly purchased item produced
  no prompt at all. Rather than changing the core per-occurrence evaluation
  loop (risking leaking an unequipped item's other rules, like stat bonuses,
  into the character), the new functions are a separate, read-only surface
  that Shop and the Equipment workspace call directly; they do not touch
  `projectBuildForEvaluation`'s existing occurrence-materialization path at
  all, so no evaluated numeric output changes.
- `packages/character-domain/src/build.ts` gains the `choose-inventory-child`
  `CharacterCommand`: sets one child occurrence at `(entryId, elementIndex,
index)` under `BuildInventoryElement.children`. Distinct from `choose`
  because item-owned children live under inventory elements, not the
  level/grabbag occurrence tree `updateOccurrence` walks — `choose` cannot
  reach them today.
- New unit tests: 4 in `build-projection.test.ts` for the two rules-engine
  functions, 1 in `character-domain/src/index.test.ts` (sets, replaces, and
  rejects an unknown entry/element) for the new command. Full public suite:
  538/538 tests, workspace typechecks, lint, production/PWA build, and
  Chromium/Firefox print checks all pass (`scripts/check.sh`).
- Not yet wired to any UI: the Shop acquisition flow does not yet prompt for
  item-owned choices at purchase, and no Equipment-workspace surface yet lists
  or edits holdings with an unresolved item-owned choice. Both are the next
  checkpoint.

## Illegal-options toggle checkpoint (2026-09-24)

- Every `CandidateSelectionTable` now exposes a small icon-only toggle button
  at the top-right of its toolbar (after the result count), matching the
  legacy builder's placement. It uses lucide's `Scale` glyph (`Icon
name="scale"`) to signal a rules-legality filter, carries `aria-pressed`,
  `aria-label`, and a native `title` tooltip that both flip with the boolean
  state ("Show illegal options" / "Hide illegal options", with the tooltip
  spelling out "options the rules do not allow you to pick" so the exclusion
  reason — not general unavailability — is explicit), and its pressed state
  reuses the existing Favorites-toggle visual treatment.
- The underlying filtering mechanism (`isCandidateVisible` in `builder-ui.ts`,
  and the `visible`/`visibleCandidates` derivations in `ChoiceEditors.tsx`)
  was already implemented and unit-tested; it had been headless since the
  compact-layout density pass removed its control pending this redesign. This
  checkpoint only adds the control.
- `ReplacementEditor`, `ChoiceEditor`, and `RepeatedCandidateTableEditor` each
  now own local `showAll` state (`useState`, not a shared context) rather than
  reading the removed `ShowAllChoicesContext`. Because each is mounted keyed
  by `choice.id` at its call site, the toggle naturally resets to off when the
  focused choice changes, matching the documented "local to the focused
  choice, resets when focus changes" behavior with no extra reset code.
  `SkillTrainingEditor` has no candidate table (it uses a toggle-list
  presentation) and keeps its existing always-filtered behavior unchanged.
- `ShowAllChoicesContext` is removed as dead code: it had no `Provider`
  anywhere in the app and always evaluated to `false`.
- A new `accessibility-contract.test.ts` case source-verifies the toggle
  button's wiring, styling, and that each of the three choice editors owns
  local `showAll` state (component prop names are `showIllegal` /
  `onToggleShowIllegal`, matching the user-facing wording). Full public suite:
  533/533 tests, workspace typechecks, lint, production/PWA build, and
  Chromium/Firefox print checks all pass (`scripts/check.sh`). Manual
  verification used a production preview build against the existing public
  420-feat synthetic fixture (raw CDP, no extension available): the button
  renders at the table's top-right corner, toggling it flips
  `aria-pressed`/label/title with no console errors; that fixture has no
  ineligible candidates, so it does not exercise row reveal — the reveal logic
  itself is covered by the pre-existing `isCandidateVisible` unit tests, which
  are unchanged.
- Unrelated pre-existing Prettier drift in
  `packages/rules-engine/src/build-projection.ts` (present before this
  checkpoint, blocking `scripts/check.sh`'s formatting gate for anyone) was
  fixed as a small aside; the change is whitespace-only.

## Current stopping point

Milestones M1 through M5.5 are complete at their stated release boundaries. M4 is
the builder beta: it delivers the authoritative rules-backed editor and records
native parity risks. M5 is the functional MVP/core builder release. Profile
migration preview and explicit adoption are implemented, and the product owner
successfully opened, saved, and reopened several regenerated real level-8
characters in the original builder. Functional print regression coverage is complete in
Chromium and Firefox. M5.5 closes the approved builder, library, and Equipment
interfaces. M5.6 now owns only the refined browser View parity surface; M5.7
owns final UI cleanup and invited-beta hostability preparation; M5.8 owns the
beyond-parity desktop/tablet Play foundation, which M6 phone adaptation depends
on. A lightweight best-effort browser check belongs to M9. This project does not run a formal
cross-browser/device support matrix or an accessibility-certification program
(decision D063); continuous structural safeguards remain required throughout.
The installable PWA, update/offline
UX, content onboarding, public-distribution boundary, production Docker guide,
and authoritative exact-profile browser sheet are verified checkpoints.
The content model now supports an administrator-advertised immutable baseline
plus ordered local personal overlays. Same-origin downloads are size-bounded,
identity/digest verified, and cached for offline use; availability does not
imply activation. Profiles preview last-layer-wins collisions, materialize an
exact digest for existing workers, and preserve single-pack activation as a
one-layer migration. New character bindings record ordered layer digests and
the resolution policy. Personal packs have no upload path.
The focused Chromium workflow rendered a migrated one-layer profile, previewed
one layer with zero overrides and a resolved digest, and completed explicit
activation without console errors. Tablet and 375 px phone settings layouts
were also checked; the phone viewport had no horizontal overflow.
The first manual Hu attempt failed before opening because regenerated empty
`textstring` values self-closed; the legacy parser requires an explicit body.
Body-required leaves now serialize as paired tags, and that correction opens in
the original builder. The open then exposed evaluated ability totals written in
the base-allocation sheet field (Hu Wisdom 20 instead of 16). Both ability
scores then preserved the base allocation and Wisdom loaded correctly, but the
next run showed Strength and Intelligence one point high. Recovered native save
code proved that our extra root score block and levels-first ordering were
non-native; level-up choices themselves were not duplicated. Export now follows
the native sheet/campaign/levels/grabbag/text order, emits one sheet score block,
and rejects duplicate occurrence tokens. The newest correction opens in the
original builder, and PDFs exported there from the original and regenerated Hu
records are visually identical under manual comparison. Subsequent product-owner
testing successfully saved and reopened several regenerated real level-8
characters. That representative evidence closes the M5 legacy-application
criterion; future character-specific failures remain tracked compatibility bugs.

## Functional refactor Stage 0 baseline accepted (2026-09-23)

- A deterministic public fixture now supplies 420 feat candidates and 260 Shop
  records without depending on the ignored private corpus. Its normal unit test
  verifies stable encoding, content-pack validity, profile binding, and the
  expected high-cardinality shape.
- The production-preview Chromium harness covers cold library, direct editor,
  warm reopen, Build → Overview → Equipment → Shop → Sheet, broad candidate and
  Shop filtering, save/undo/redo, browser back/forward, and deep links. It
  records raw/gzip bundle sizes, worker construction, approximate IndexedDB
  records/bytes read, Long Tasks, mounted rows, query-to-paint, environment,
  run count, and variance. Timing remains evidence rather than a brittle CI
  assertion; broken behavior and browser errors are hard failures.
- The three-run public evidence records a 600,058-byte / 172,260-byte-gzip main
  bundle, 118.9 ms median direct-editor readiness, 58.0 ms median warm reopen,
  28.6 ms median candidate query-to-paint, and 31.2 ms median Shop query-to-
  paint. Warm tab changes created no worker, and interaction-attributed Long
  Tasks remained absent.
- The candidate table fails the approved DOM guardrail honestly with 420
  mounted rows; Shop passes at exactly 200. Cold library reads approximately
  797,000 payload bytes, dominated by two content-pack reads, while the first
  direct editor reads approximately 1,192,771 bytes, dominated by three pack
  reads. These remain owned by Stages 3 and 1 respectively.
- Candidate, Inventory, funds-dialog, Shop, sheet, and print-media screenshots
  were reviewed. Existing Chromium/Firefox PDF checks remain authoritative for
  cross-engine print output. The coordinator accepted the baseline, including
  its honest 420-row failure and full verification evidence. Stage 0 is complete;
  Stage 1 — Storage and cache mechanics is the next stopping point.

## Functional refactor Stage 1 implementation checkpoint (2026-09-23)

- IndexedDB schema 5 adds transactionally maintained character/pack metadata
  sidecars plus a distinct rendered-thumbnail store. Upgrades backfill schemas
  1–4 without replacing payload stores or migration journals; lazy character
  migration, backup restore, trash/restore, purge, install, and removal keep
  projection writes atomic. Already-version-5 development databases with an
  incomplete pack sidecar now self-repair missing or orphaned projections from
  the authoritative store; healthy listings inspect keys only and do not clone
  encoded pack values. Metadata never carries the retained portrait source.
- The character library reads and partitions summaries once. Pack list,
  manifest, and activation checks no longer clone encoded packs. Public decoded
  and encoded install APIs still validate. The internal seam can store only a
  runtime proof created by decoding and validating the exact stored bytes;
  corrupt, mismatched, and forged artifacts are rejected.
- Exact evaluation promise caching now has one application-runtime owner. Hits
  refresh the 32-entry LRU recency, while persistent cache version/profile/input
  isolation and malformed/read/write failure recovery remain unchanged.
- The comparable public three-run baseline records 1,822 median cold-library
  payload bytes (-99.77%) and 469,440 direct-editor bytes (-60.64%). Direct
  editor, warm reopen, and main-bundle gzip changed +2.0%, +3.6%, and +0.6%,
  within the approved 10% guardrail. No interaction Long Task or warm-tab worker
  appeared; the known candidate-row failure remains Stage 3 work.
- Portrait list reads fetch only the rendered thumbnail sidecar, which is still
  bounded by the domain's 5 MiB accepted data-URL limit. Tests prove that a
  large retained source image and legacy source XML remain only in the
  authoritative character record and are absent from both listing stores.
- Focused Stage 1 suites pass 46 tests. The full public gate passes formatting,
  lint, 69 files / 512 tests, all workspace typechecks, the production/PWA
  build, Chromium and Firefox print matrices, deterministic content checks, and
  the query benchmark. The coordinator independently reran the full gate on the
  final tree and accepted every Stage 1 exit criterion. Stage 1 is complete;
  Stage 2 — Route-level lazy loading is the next stopping point.

## Functional refactor Stage 2 complete (2026-09-23)

- Settings, the character editor, and the character sheet now ship as
  independent route chunks; the library remains in the initial shell.
  `HideFlavortextContext` lives in its own dependency-light module so the shell
  no longer imports the shared card implementation solely to provide display
  state.
- Direct Settings/editor/sheet hashes begin only their requested chunk before
  mounting the shell. This preserves direct-link readiness without loading any
  workspace chunk on the default library route. Later navigation uses an
  accessible Suspense landmark, focuses the resolved main landmark, and sends a
  failed chunk to the reloadable application error boundary.
- The final-tree comparable three-run production baseline records a 113,334-byte
  gzip initial graph, 34.6% below Stage 1 and below the 120 KiB target. Against
  Stage 0, direct editor (122.9 ms), warm reopen (57.6 ms), candidate interaction
  (29.0 ms), and Shop interaction (31.3 ms) remain within the 10% guardrail. No interaction Long
  Task or warm-tab worker was observed.
- All route chunks and workers remain in the service-worker precache. A direct
  sheet reload passed with network emulation offline, the production journey
  retained back/forward behavior and session state, and blocked-chunk recovery
  reached the captured error UI. The existing Chromium/Firefox print matrix
  remains the authoritative print gate.
- Raw measurements and reviewed screenshots are in
  `docs/evidence/functional-stage2-2026-09-23/`, including representative
  Firefox Settings/library routes and Chromium loading/recovery states. The
  known 420-row candidate failure remains Stage 3 work. The full public gate
  passes formatting, lint,
  70 files / 518 tests, workspace typechecks, production/PWA build,
  Chromium/Firefox print matrices, content determinism/validation, and the query
  benchmark. The coordinator and product owner accepted every Stage 2 exit
  criterion with no deferred incompatibility. Stage 2 is complete; Stage 3 —
  Bound Builder candidate rendering is next.

## Functional refactor Stage 3 complete (2026-09-23)

- The Builder candidate selector, its favorites store, and its inspection-
  initialization context moved from `CharacterEditorPage.tsx` into
  `apps/web/src/CandidateSelectionTable.tsx` with no behavioral change beyond
  the paging added in this stage. Filtering, favorites, type grouping, feat-
  family folding, and sorting still run over the whole candidate corpus;
  `apps/web/src/candidate-table-paging.ts` then bounds the mounted rows to 200
  per page (candidate and feat-family rows), repeating a section header on
  every page it spans and placing a collapsed or trailing section on the page
  where its rows would begin.
- The table opens on the page containing the initially selected row and pins
  that page against later selection or expansion changes; filtering, the
  Favorites toggle, and any sort change return to page 1; changing page scrolls
  the table's own viewport to the top. Selection never reorders rows. Paging
  reuses the Shop's `.equipment-pagination` control markup and only appears
  when more than one page exists.
- The product owner approved a lighter Stage 3 verification bar for this
  personal-use application: focused regression tests, the full public
  `scripts/check.sh` gate, and one desktop Chromium pass with before/after
  screenshots, rather than the plan's full cross-browser/tablet/dark-mode
  matrix.
- `apps/web/src/candidate-table-paging.test.ts` covers empty/short/exactly-200/
  thousands-row totals, stale-page clamping after the result set shrinks, the
  page containing an out-of-window selected row, and section-header repetition
  across pages and at collapse boundaries. `scripts/check-functional-baseline.mjs`
  adds a first-run `checkCandidatePaging()` browser check that walks every page
  via Next, asserting the pager label, a scroll reset to the top on each page
  change, that sorting and filtering both return to page 1, and that no page
  ever exceeds 200 mounted rows.
- The final-tree public gate and functional-baseline harness both pass: the
  candidate DOM guardrail that failed at 420 rows in the Stage 0 baseline now
  passes at exactly 200; every `checkCandidatePaging()` assertion passed
  against the full 420-row synthetic fixture; interaction metrics (63.1 ms warm
  reopen, 28.4 ms median candidate query-to-paint, 33.9 ms median Shop query-
  to-paint, no interaction Long Task, no warm-tab worker) remain within the
  Stage 0 guardrails. Raw evidence and reviewed screenshots (including
  `candidate-table-page-2.png`) are in
  `docs/evidence/functional-stage3-2026-09-23/`; the added pager does not crowd
  the table at the established 1440x1000 desktop viewport.
- No evaluator or persistence semantics changed. Stage 4 — deciding Shop's
  indexing architecture — is next and requires the plan's product decision gate
  before any implementation begins.

## Functional refactor Stage 5 complete (2026-09-23)

- Following the Stage 3/4 precedent, the product owner approved a minimal
  verification bar for this stage's small, behavior-preserving fix: one
  focused test, the full `scripts/check.sh` gate, and a manual browser check,
  rather than the plan's full evaluator-goldens/cancellation/Chromium+Firefox
  matrix.
- The single rules worker processes `evaluate` requests strictly FIFO and runs
  each one synchronously to completion. The editor previously always
  dispatched the (usually hidden) planning evaluation before the visible
  current-level evaluation whenever a user browsed a future level — a normal,
  supported workflow. `evaluationDispatchOrder` (new, in
  `builder-evaluation-plan.ts`) decides which distinct evaluation requests are
  needed given the current/selected/planning horizons and returns them in
  priority order, so `CharacterEditorPage.tsx` now dispatches any distinct
  current- or selected-level request before the planning request. Which result
  a coincident consumer receives is unchanged; no priority queue,
  cancellation, batching, or incremental evaluation was introduced.
- `builder-evaluation-plan.test.ts` covers every branch of
  `evaluationDispatchOrder`. Web typecheck and the full
  `nix develop path:. -c bash scripts/check.sh` gate pass. A manual dev-server
  browser check confirmed the header stays pinned to the current effective
  level while browsing an unpopulated future level, and that editing at the
  current level still evaluates and updates the header.
- That manual check also surfaced an unrelated, pre-existing bug (confirmed via
  `git stash` to reproduce identically without this change): a URL-
  canonicalization effect around `CharacterEditorPage.tsx:4417` can crash the
  editor with a React "Maximum update depth exceeded" error when navigating
  from a level with available choices to one with none and back. The product
  owner asked for this to be fixed as a follow-up aside; see the next entry.

## Functional refactor Stage 6 complete — program closed (2026-09-23)

- Following the Stage 3–5 pattern, the product owner rejected Stage 6's full
  planned scope (extracting controller/state hooks out of the orchestration
  component itself, dialog-lifecycle/sortable-header extraction, and replacing
  source-text tests with rendered behavioral tests) as disproportionate risk
  for a personal-use application with no concrete driving problem — the audit
  finding behind this stage was only that `CharacterEditorPage.tsx` is long,
  not a measured defect. Approved scope: low-risk file splits only, moving
  already-distinct helper components verbatim and leaving the orchestration
  component's internals untouched.
- Extracted `CharacterOverview.tsx`, `CandidateDetail.tsx`,
  `BaseAbilityScoreEditor.tsx`, `ChoiceEditors.tsx` (the cohesive
  `ChoiceEditor`/`ChoiceFlowSection`/`RepeatedChoiceGroup`/
  `RepeatedCandidateTableEditor`/`RetrainingControls`/`BackgroundChoiceGroup`/
  `SkillTrainingEditor`/`AbilityIncreaseEditor`/`BuildPresetPanel`/
  `CompactChoiceButtons`/`ReplacementEditor` cluster), `CharacterDetailsEditor.tsx`,
  and a small shared `builder-choice-context.tsx` from `CharacterEditorPage.tsx`.
  Exact line ranges were relocated with `sed`, not retyped, eliminating
  transcription risk; small pure helpers shared across the new file boundaries
  moved to the existing `builder-ui.ts`. `CharacterEditorPage.tsx` shrank from
  5,882 to 2,337 lines (-60%); the 2,100-line orchestration component itself
  was left unchanged.
- The four affected source-text contract tests
  (`accessibility-contract.test.ts`, `candidate-table-initialization-contract.test.ts`,
  `builder-header-integration.test.ts`, `option-details-empty-state.test.ts`)
  were updated to read each assertion from its new file location — the same
  style of check, redirected, not replaced with a different test approach.
- Full workspace typecheck, lint, the complete 71-file/529-test suite, and
  `nix develop path:. -c bash scripts/check.sh` all pass with no regressions.
  A live dev-server smoke test (seeded synthetic fixture, raw CDP, no browser
  extension available) exercised every extracted file's real render path —
  Ability Scores, the Feats candidate table, Overview, Character details, and
  clicking a feat to populate the detail pane — with zero browser console
  errors or exceptions.
- Stage 6 is complete under the approved reduced scope. This closes the
  functional refactor and performance program: Stages 0–6 are all complete or
  complete-as-adjusted, each with an explicit product-owner scope decision
  recorded in `docs/functional-refactor-plan.md` where the approved scope
  differed from the original audit-driven plan.

## Level-navigation crash fix (2026-09-23)

- Manual browser verification during Stage 5 found that navigating from a
  level with available choices to one with none and back (e.g. level 1 to
  level 2 in the synthetic fixture) could crash the character editor with a
  React "Maximum update depth exceeded" error.
- Root cause: `CharacterEditorPage.tsx`'s canonicalization effect (which syncs
  derived `activeLevelSection` to the URL via `onNavigate`) called `onNavigate`
  unconditionally on every dependency change, even when the target navigation
  already matched the current URL. This could oscillate against the companion
  effect that reads the URL's section back into `selectedSectionByLevel`.
  Fixed by adding a guard so the effect is a no-op once the URL already
  matches the canonical level/section.
- Verified by reproducing the exact original crash sequence against a dev
  server both before the fix (crash reproduced, and confirmed via `git stash`
  to be present without the unrelated Stage 5 change too) and after (no
  crash, no console errors, URL settles at the correct preferred section).
  Full `nix develop path:. -c bash scripts/check.sh` passes. No new automated
  test was added — the guard sits inline in tightly-coupled render-time
  derived state, and extracting it would be a larger refactor than this
  quick-aside fix's scope — so the manual browser reproduction is the
  regression evidence.

## Functional refactor Stage 4 complete (2026-09-23)

- Stage 4's original scope called for prototyping and measuring two competing
  Shop indexing architectures. The product owner rejected that as
  disproportionate for this personal-use application and approved a direct
  code-reading audit instead, clarifying that "unnecessary resource (re)loads"
  and "exponential/geometric complexity" were illustrative examples of the
  magnitude worth fixing, not an exhaustive checklist.
- The audit found `ShopWorkspace.tsx`'s filtering pipeline (category → advanced
  filters → search → slot/subtype → family grouping → sort) is a chain of
  `useMemo`s, each linear in record count and memoized on its real
  dependencies, with `entities`/`byId` loaded once per character session
  rather than reconstructed per render. No exponential/geometric complexity or
  unnecessary reload was found, so no new Shop indexing architecture is
  adopted; Shop's existing main-thread approach is unchanged.
- Separately, the audit confirmed by exhaustive grep and the production bundle
  report that the M2 general query worker (`query.worker.ts`,
  `QueryWorkerClient`, `AppContentRuntime.getQueryClient`) had zero production
  callers — Shop never adopted it after its 2026-09-22 redesign — yet it was
  still built, shipped (~58 KB / ~17 KB gzip as `query.worker-BDBrJK5s.js`),
  and precached by the service worker. That dead code was removed from
  `apps/web`; `@4ecb/query-engine` and `scripts/benchmark-query.ts` (still
  exercised by `scripts/check.sh`) are unaffected.
- This is recorded as `decisions.md` D062, with a superseding status note added
  to D017, and `docs/query-engine.md`'s contract and worker/persistence
  sections updated to describe the current state.
- Verification: updating `app-runtime.ts` (dropped `QueryRuntimeClient`,
  `QueryEntry`, `getQueryClient`, and the `createQueryClient` option) and its
  focused test file, then deleting `query.worker.ts`, `query-client.ts`, and
  `query-worker-messages.ts`. The web package typecheck passes, the focused
  `app-runtime.test.ts` suite passes 10/10, the production build no longer
  emits a `query.worker` chunk, and the full
  `nix develop path:. -c bash scripts/check.sh` gate passes. Stage 5 —
  Evaluation scheduling is next.

## M5.5 shared visual-contract consolidation checkpoint (2026-09-23)

- Cross-workspace selection headings now use authoritative named typography
  roles, with explicit compact Overview and panel variants instead of
  feature-selector overrides.
- Candidate, Inventory, and Shop category rows share one collapsible
  table-section primitive. Inventory and Shop item glyphs share one item-icon
  primitive, while density, equipped state, and proficiency badges remain
  deliberate surface variants. Dialog shells and primary/icon button anatomy
  are likewise shared without merging Shop filter toggles into action buttons.
- Detail-card header and flavor rhythm is expressed through the shared card
  anatomy and variant variables. The previous Shop-only header correction is no
  longer necessary; composed-item and top-level-power values remain unchanged.
- Verified unused timeline, legacy choice-container, old Equipment-catalog, and
  superseded editor selectors were removed. Adjacent duplicate rules were
  merged, and stable brand colors now use the existing tokens where doing so
  does not alter theme behavior.
- Shared primitives have moved to `styles/primitives.css`, imported before the
  feature stylesheet. CSS-reading tests concatenate both sources in runtime
  order, and the Chromium print/layout gate now also asserts computed heading
  typography and detail-card spacing.

## M5.5/M5.6 roadmap reconciliation checkpoint (2026-09-18)

**Superseded milestone assignment (2026-09-28):** D064 retains the architectural
Play-before-phone sequence but splits the work differently. M5.6 now owns only
browser View parity, M5.7 owns final UI cleanup and invited-beta hostability,
M5.8 owns the complete desktop/tablet Play/PlayState foundation described below,
and M6 depends on M5.8. The bullets that follow record the earlier assignment
for historical context rather than the current roadmap boundary.

- M5.5 now closes the builder, library, and complete Equipment interface rather
  than owning comprehensive release certification. Loadout has received its
  focused pass; Inventory, Shop, and Rituals & Practices still require equivalent
  workflow refinement and live product-owner approval. Redesigned unavailable-
  option browsing and Equipment-owned editing for item-granted choices are also
  explicit closure work.
- New M5.6 establishes the shared sheet/local-play foundation before phone work:
  an authoritative desktop/tablet View sheet, a distinct Play sheet backed by
  versioned `PlayState`, deterministic commands/history/undo, and approved shared
  sheet/card interaction semantics. M6 is narrowed to the purpose-built phone
  adaptation and portable/offline mobile workflow.
- M9 retains a lightweight browser workflow, visual-print, security,
  data-migration, and release-performance check. D063 later removed the formal
  keyboard-only, screen-reader, zoom/reflow, touch-target, and cross-client
  certification matrix. Continuous semantic structure, labels, focus behavior,
  ordinary keyboard use, contrast, reduced motion, and responsive sizing remain
  required throughout.
- D054 records the sequencing decision as superseded in this respect by D063.
  The roadmap, product definition,
  architecture, interface brief, sheet specification, M5 checklist, deployment
  notes, and user guide now use the same ownership boundaries.

## M5.5 builder-header statistics checkpoint (2026-09-18)

- The compact builder identity header now includes a wide, shallow statistics
  strip sourced exclusively from the evaluation at the character's current
  effective level. It shows evaluated maximum HP, Speed, signed Initiative,
  AC/Fortitude/Reflex/Will, and Strength through Charisma; navigating to an
  earlier choice or a future planning level cannot change these totals.
- HP, movement, defenses, and abilities use four visually distinct clusters
  without visible group headings. Ability scores occupy a centered three-column,
  two-row arrangement with fixed label/value tracks so each top and bottom pair
  shares its left edges. Missing current evaluation values remain stable em
  dashes rather than falling back to imported snapshot caches.
- Every available numeric total exposes the evaluator's applied contribution
  provenance in a native multiline tooltip on the value itself. The tooltip
  presents a player-facing total and signed breakdown, translates opaque legacy
  level-node labels from their rule metadata, and never recomputes a stat in the
  web UI.
- Character sheet is now a peer top-level navigation tab. Unresolved choices,
  warnings, and save state sit at the tab bar's trailing edge, followed by
  icon-only Undo and Redo controls with accessible labels and native tooltips.
  The identity/stat row and the tab/status row progressively stack at narrower
  widths without introducing a vertical tab scrollbar.
- Imported legacy equipment records only `equip-count`, not modern hand, ring,
  or body-slot assignments. Loadout now projects those active counts into
  deterministic compatible open slots after preserving every explicit modern
  assignment. This keeps the visible loadout consistent with the evaluator:
  selecting an already-active imported item is no longer a no-op disguised as
  equipping it, and clearing the inferred slot atomically materializes the
  modern assignment change so equipment-backed header defenses update. Entries
  that cannot be placed without ambiguity remain rules-active and visibly
  explained rather than being silently unequipped.

### Builder diagnostics refinement (2026-09-22)

- Builder status now keeps four compact, nonzero icon counts for unresolved
  choices, evaluator warnings, evaluator errors, and explicit house rules.
  House-ruledness is no longer folded into warning totals, and required-choice
  engine diagnostics are represented only by the corresponding unresolved item.
- The header and Diagnostics workspace consume the same deduplicated structured
  issue groups. Diagnostics now explains what each issue is and what it affects,
  and provides a Review action to the exact choice or level-1 ability-score pane
  where the evaluator exposes a stable target.
- Unknown rules explicitly state that their source representation is preserved
  while their mechanical effect is not calculated. Intentional house-rule
  selections remain active and exportable while being reported separately from
  actual evaluation failures.

## M5.5 candidate-table initialization checkpoint (2026-09-18)

- Opening a Build category or Character details pane now gives its first shared
  candidate table sole responsibility for initializing the adjacent detail card.
  Its first existing selection is inspected in established choice order; an
  unselected first table leaves the card blank rather than allowing a later table
  to claim it. A scope gate prevents subsequent mounts or rerenders from
  overwriting explicit user inspection.
- Every shared candidate table independently captures its first existing
  selection at mount and positions that row directly beneath the sticky header
  in its own scroll viewport. Native scroll bounds keep rows near the table end
  visible when they cannot reach the top. Selection changes, evaluation
  rerenders, filters, and sorting do not repeat the positioning, clear filters,
  or alter established row order.
- Focused unit coverage fixes first-selection order, first-table ownership,
  explicit-inspection precedence, sticky-header scroll geometry, and the
  non-negative top bound. The existing shared-table accessibility contract
  continues to reject the removed user-triggered locator and `scrollIntoView`.
  The focused initialization/selection suites pass 30/30. The full
  `scripts/check.sh` gate passes formatting, lint, all 406 public tests, every
  workspace typecheck, the production/PWA build, Chromium and Firefox Letter/A4
  print checks, deterministic synthetic content-pack checks, and the query
  benchmark.

## M5.5 two-column loadout checkpoint (2026-09-18)

- Loadout is split into two ordered stacks. Body-location slots run Head through
  Feet in the left column; hands, implements, rings, and Tattoo occupy the right
  column. Every slot is one horizontal icon/name-and-select row, and the pane no
  longer renders per-slot Shop buttons. The Shop tab and its filters are
  unchanged; this intentionally supersedes the earlier shortcut presentation.
- The final Lucide glyph sequence is HardHat, Medal, Shirt, BicepsFlexed, Hand,
  SquareStar, Footprints and Sword, Shield, Church, Focus, Gem, Gem, Stamp. The
  installed Lucide 1.39.0 set has no Helmet, Belt, Pants, or standalone
  Latin-cross/crucifix alternative. The product owner approved the existing
  SquareStar for Waist instead of a custom belt glyph; HardHat and Church remain
  the approved fallbacks, and Tattoo reuses the existing Stamp glyph.
- Holy symbol and Ki focus visibility is gated by their exact evaluator-active
  Proficiency definition IDs. Companion, Familiar, and Mount remain strictly
  conditional on compatible owned inventory and retain PawPrint.
- Focused verification passes all 28 Equipment UI and accessibility-contract
  tests, the web TypeScript check, affected-file ESLint and Prettier checks, and
  whitespace validation. A read-only search of the local full content pack
  confirms both exact proficiency IDs used by the visibility gates.

## M5.5 loadout slot-metadata checkpoint (2026-09-18)

- Loadout eligibility now accumulates `Item Slot` and `Magic Item Type` across
  every resolved definition in a holding instead of treating those authored
  classifications as fallbacks. The full-corpus `Magic Holy Symbol +1` record
  consequently retains its `Off-hand` hand choices and also appears in the
  dedicated Holy symbol dropdown because it is explicitly typed `Holy Symbol`.
  No display-name inference is involved.
- A focused public fixture covers an item carrying both classifications and
  verifies all three resulting loadout choices.
- Focused verification passes all 6 Equipment UI tests, both web TypeScript
  projects, affected-file ESLint, and whitespace checks.

## M5.5 loadout correction checkpoint (2026-09-18)

- Mundane shield definitions carry authored `Armor Type` value `Shield` and
  `Item Slot` value `Off-hand`. Loadout now uses that base-item domain identity to place any such
  shield only in Off hand. A composed magic shield's `Arms Slot Item`/`Arms`
  metadata remains valid magic-item classification but no longer relocates the
  physical shield to Arms. The former display-name check and Arms result are
  removed; a name-neutral composed public fixture fixes the precedence rule.
- Each Loadout stack now sizes its own icon-and-label track to its longest label
  and uses a compact consistent gap before the dropdown. Dropdowns shrink with
  their column, cap at `18rem`, and the two stacks still collapse to one column
  at the existing `48rem` responsive boundary.
- Committing any non-empty slot selection immediately shows that holding in the
  shared equipment detail viewer. Focusing a populated slot restores its current
  item to the viewer. Transient native-select popup highlights are not previewed:
  supported browser/platform controls do not expose a reliable pre-commit event,
  and cancellation could otherwise leave the viewer out of sync. The native
  selects remain unchanged and use only reliable focus/committed-change events.
- The product owner approved Lucide SquareStar for Waist and explicitly rejected
  a custom glyph. One shared slot-icon map now supplies Loadout, item-card, and
  selection-chip item imagery, eliminating the former detail-card `badge`,
  `crown`, `sun`, and plain-circle variants. A composed shield explicitly passes
  its physical base identity to shared presentation, so an Arms-classified magic
  enchantment cannot replace the shield icon with the strong-arm icon. Ordinary
  armor uses the canonical Body `Shirt` icon; only an armor definition with
  authored `Armor Type: Shield` uses the Off-hand `Shield` icon.
- Loadout now derives both compatible options and the displayed assignment from
  current authored slot eligibility. A stale Arms assignment for a composed
  shield is therefore not presented as an Arms-slot item; the base armor's
  authored `Armor Type: Shield` still makes Off hand its sole candidate.
- A read-only full-profile audit found four `Armor Type: Shield` base records,
  all four authored `Item Slot: Off-hand`, plus 15 shield-compatible magic
  definitions carrying the distinct `Arms Slot Item`/`Arms` classification.
  Focused Equipment/Loadout/accessibility coverage passes 31/31. The full
  `scripts/check.sh` gate passes formatting, lint, all 411 public tests across 57
  files, every workspace typecheck, the production/PWA build, Chromium and
  Firefox Letter/A4 print checks, deterministic synthetic content-pack checks,
  and the query benchmark. The build retains the existing large-chunk advisory.

## M5.5 inventory-interface candidate (2026-09-18)

### Role-based Inventory sections (2026-09-19)

- Inventory holdings now project into collapsible Adventuring gear, Ammunition,
  Armor & shields, Companion, familiar & mount, Consumables, Implements,
  Special items, Weapons, Wondrous items, Worn items, and Miscellaneous
  sections. Empty groups are omitted, counts describe holding
  rows, category order is fixed, and the original order within each group is
  retained. All populated groups initially expand except Miscellaneous, and
  subsequent expansion state survives Inventory edits for the component
  lifetime.
- Classification uses all resolved holding components and all repeated authored
  specifics, with consumable/ammunition and physical-base precedence. It now
  shares the accepted modern Browse role projection: ordinary Gear is
  Adventuring gear, mechanically active carried magic is Wondrous items, and
  nonphysical rewards are Special items. Missing/custom definitions still fall
  back to Miscellaneous. Display names, flavor, and descriptions do not decide
  a category. Public coverage uses synthetic definitions only; the earlier
  private-corpus counts used the superseded Inventory-specific taxonomy.

- Inventory now foregrounds a compact combined Funds total in stable
  AD/PP/GP/SP/CP stat cells, including zero values. Quick adjust accepts one
  signed or unsigned integer denomination amount, credits positives to carried,
  and deducts negatives from carried before stored. Validation and safe wallet
  arithmetic precede one batch of canonical per-level text updates. Its Edit
  disclosure retains separate carried and stored CP/SP/GP/PP/AD inputs and shows
  a read-only normalized total, preserving the recovered per-level text-string
  model and existing carried-first purchase/stored-fallback/sale-to-carried
  behavior. Success briefly emphasizes only changed total cells; errors retain
  the input and use a non-layout-shifting red flash. Both states are announced
  accessibly and honor reduced motion.
- Each holding is a stable row with the shared canonical item icon (including the
  physical base for composed equipment), an icon-mounted check or compact
  equipped ratio, compact quantity controls, and trailing sell/remove icons.
  Unknown-slot historical counts use a question marker plus accessible text. The
  sale menu exposes 20%, 50%, and 100% one-copy proceeds in one directly
  comparable unit selected from the exact 20% baseline; unpriced items explain
  their disabled sale action and remain removable without proceeds after
  confirmation. One controlled menu is open at a time and dismisses on outside
  pointer interaction or Escape.
- Inventory row double-clicks reuse the existing Loadout resolution and command
  callback. They unequip exact current assignments or select the first open
  compatible slot in visible Loadout order, including the paired-hand bundle;
  occupied fallback requires confirmation. Unresolved historical equipped counts
  remain untouched and point to Loadout instead of receiving invented slots.
- Reductions retain equipped copies before unequipped copies, warn before they
  must unequip, and reindex exact slot assignments. In-place domain replacement
  prevents quantity edits from reordering rows, and zero-quantity holdings are
  removed. Historical equipped counts with unknown slots remain visible rather
  than receiving invented assignments.
- Focused character-domain, Equipment, Loadout, and accessibility tests pass
  62/62, both web TypeScript projects pass, changed files are Prettier-clean, and
  whitespace validation passes. Live product-owner review approved this
  Inventory candidate.

## M5.5 composed item-detail checkpoint (2026-09-18)

- Equipment inspection now retains the inspected holding rather than reducing
  it to the last definition ID. Inventory rows and loadout dropdowns therefore
  present a composed weapon or armor under its natural inventory name. Composed
  weapons render as one card: the base supplies physical statistics while the
  enchantment supplies flavor, level, price, rarity, critical effect, magic
  rules, and granted powers. Storage-only or redundant fields are suppressed;
  ordered, deduplicated sources share one final footer.
- Shop enchantments continue to render independently before a base is chosen.
  Selecting a compatible base immediately switches the same detail pane to the
  composed projection, so shop preview, Inventory, and Loadout cannot diverge.
- This reproduces the recovered `CharacterLootItem.Element` plus
  `ExtraInfoElement` flow through `DDIUIHelpers.UpdateInfoViewer` and
  `App.ConcatViewer`. Public regression coverage uses synthetic base and
  enchantment records; no proprietary corpus fixture is committed.
- The approved production projection for **+2 Defensive Warhammer** uses an
  Enhancement line followed by four compact semantic descriptor lines,
  content-sized separators, an unbroken
  rules-label column, and optically compensated flavor spacing. Synthetic tests
  cover composition, field ownership and order, multiple base properties,
  duplicate Full Text suppression, source deduplication, and the shared
  Inventory/Loadout/Shop inspection inputs. Live verification against the local
  complete corpus confirms the composed card at 512 px and 307 px widths with
  no horizontal overflow and a measured flavor-spacing difference under 0.04
  px. A production Loadout follow-up removed the shared tinted-header's 0.85 rem
  trailing margin from unified composed-item cards; direct DOM
  measurement now records 13.195 px above and 13.156 px below the rendered
  flavor line at both 480 px and 288 px card widths. Standalone Warhammer
  remains complete and compact. `scripts/check.sh`
  passes formatting, lint, all 424 public tests across 62 files, every workspace
  typecheck, the production/PWA build, Chromium and Firefox Letter/A4 print
  checks, deterministic synthetic content-pack checks, and the query benchmark.
  The build retains the existing large-chunk advisory.
- Shared item headers and descriptors now keep slot location out of ordinary
  magic-item type labels (`Neck Slot Item 6` becomes `Item 6`). Such cards use
  an Enhancement line followed by Price, Slot, and Rarity; the user-facing
  descriptor is `Slot`, not `Item Slot`. Standalone and composed magic weapons
  likewise restore Enhancement as the first descriptor line. Composed shield
  details project the physical base's Off hand slot instead of the paired
  enchantment's Arms category. Composed magic armor and shields now use the
  same unified projection as weapons: physical defensive statistics, category,
  type, slot, weight, icon, and source are combined with the enchantment's
  level, enhancement, magical price, rarity, flavor, properties, granted
  powers, and source. Its compact descriptor rows are Enhancement; Armor bonus,
  Check, Speed; Category, Type, Slot; and Price, Weight, Rarity. Generic Armor
  applicability, duplicate Full Text, and storage-boundary subheadings are
  suppressed. Live corpus checks cover Absence Amulet +3, Acidic Weapon +1,
  +2 Bloodiron Plate Armor, and Hammer Heavy Shield. The latter two were
  exercised through the production Shop composition path, and Hammer Heavy
  Shield was then verified unchanged in Inventory and Loadout. Desktop and
  327 px mobile measurements have no horizontal overflow. Shield enchantments
  whose magic-item family is Arms use authored `_IsEnchant: Shield` metadata to
  offer compatible physical shields in Shop; no display-name inference is
  involved. The complete public gate passes all 430 tests, typechecks, build,
  Chromium/Firefox print checks, deterministic content-pack checks, and query
  benchmark.

## M5.5 selection-chip and background-table checkpoint (2026-09-18)

- The shared large-candidate table keeps a sticky selection summary directly
  between its filter controls and column headers only while the candidate rows
  have vertical overflow. A shared DOM measurement
  observes both the scroll viewport and table content, so filtering, disclosure,
  container/viewport resizing, and candidate changes update its visibility;
  horizontal overflow alone does not show it. It renders **No selection** or one
  chip per selected item; compact radio/button choices are unchanged.
- Each chip name opens its detail card and its trailing X unresolves the exact
  backing choice. The former locate-in-table action and prose **Current
  selection(s)** wording are removed everywhere `CandidateSelectionTable` is
  used. Chips now reuse the detail-card leading-icon renderer and visual-language
  tone helpers: entity-family, authored power-action, and corpus-specific item
  icons match the associated detail header. Their compact header treatment uses
  the same soft tone fill and shared card tokens: a 3px full-tone top edge scales
  the card's 5px accent, the 1px full-tone bottom divider is retained, and 1px
  neutral side edges replace the former uniform tone box. The centered icon and
  bold name share the card header's `1.15` line-height with compact padding and
  gap tokens. The icons are decorative; inspect/remove labels, contrast-safe
  hover/focus treatment, existing selection limits, and table ordering remain
  unchanged.
- Up to six repeated Background choices now share one candidate table. The
  presentation retains exact evaluator-slot assignment, candidate legality,
  autosave, undo, and the established selection limit.
- Column headers remain visible as one sticky, opaque, full-width header group
  rather than independently floating cells. Separate zero-spacing table borders
  remove the top and left compositing seams while preserving shared column
  sizing. The Class table also labels its compact power-source column **Power**.
- Focused component coverage verifies empty and multi-chip rendering, shared
  neutral/power/item icons and tones, detail buttons, removal buttons, and the
  absence of the locator. The accessibility
  contract verifies the shared chip treatment, one-table Background structure,
  sticky placement, and preservation of the existing no-checkmark row model.
- Focused verification passes all 41 selection-summary render, shared-header
  style, EntityCard, and accessibility-contract tests. Live browser inspection
  confirms the 14.40px entity SVG and power-action icon slots remain centered
  within 0.01px of the bold chip name. The power-action slot now contains an
  11.20px glyph line box instead of the inherited 16px line box, with a 0.64px
  logical-block optical correction for the symbol font; its rasterized visual
  center is within 0.26px of the bold text across three antialiasing thresholds.
  Ordinary Lucide chip icons and 16.80px detail-header action icons are
  unchanged. The same check confirms visible 3px keyboard focus outlines and
  per-tone top and bottom accents with neutral side borders in the dark theme.
- Verification: `nix develop path:. -c scripts/check.sh` passes formatting,
  lint, all 413 public tests across 58 files, every workspace TypeScript check,
  the production/PWA build, Chromium and Firefox Letter/A4 print checks,
  deterministic synthetic content-pack checks, and the query benchmark. The
  build retains the existing large-chunk advisory.

## M5.5 per-level Next navigation checkpoint (2026-09-17)

- Every mounted per-level category pane now ends with a bottom-right **Next**
  button in the choice surface. Required unresolved evaluator choices disable
  it; optional-only/empty categories and warning-only states do not. Level-1
  point buy participates as the required non-evaluator Ability Scores state.
- Next uses the established category and level activation paths, updates the
  canonical builder URL, and focuses the newly active tab. It advances to the
  next category in the selected level, then to the first category of the next
  level only when that level is no higher than the character's current
  effective level. The last category at the current-level boundary keeps a
  visible disabled button and never creates future planning levels.
- Focused builder tests cover required-choice gating, optional categories,
  intra-level navigation, cross-level navigation, and the current-level
  boundary. The accessibility contract also fixes the control to the choice
  column rather than the shared detail pane. The focused suites pass 71/71;
  the full public test suite passes 369/369 alongside lint, every workspace
  typecheck, the production/PWA build, built-PWA validation, and Chromium and
  Firefox Letter/A4 print checks. `scripts/check.sh` still stops at its initial
  formatting gate on the unrelated pre-existing
  `apps/web/src/equipment-ui.test.ts`; this change leaves that file untouched.

## M5.5 implement-proficiency prerequisite parity correction (2026-09-17)

- Recovered native prerequisite grammar `Can use the X implement` now resolves
  to the exact typed `Implement Proficiency (X)` definition. The resulting
  element prerequisite passes only when that definition is owned; a known but
  unowned proficiency fails instead of remaining unverified.
- The private full-content audit found 41 records using the exact grammar across
  nine implement spellings. Every spelling, including plural `Ki focuses`, maps
  uniquely to an existing Proficiency definition. Devout Protector Expertise's
  authored machine prerequisite remains unchanged.
- A focused synthetic regression follows the original Paladin -> Paladin
  Implements -> Implement Proficiency (Holy Symbol) fixed-point grant chain into
  a selected level-2 Devout Protector-style feat. The candidate is rules-legal
  and no prerequisite warning or failure is emitted.
- The same read-only scenario against `tmp/content/full-local.4ecp` activates the
  exact holy-symbol proficiency and returns Devout Protector Expertise eligible
  and rules-legal with no prerequisite diagnostics.
- `RULES_EVALUATION_CACHE_VERSION` advanced to
  `evaluated-character-v2-2026-09-17`, invalidating persisted browser evaluation
  snapshots created before the prerequisite semantics changed.
- Verification: the focused prerequisite and evaluator suites pass 47/47 via
  `nix develop path:. -c pnpm exec vitest run packages/rules-engine/src/prerequisites.test.ts packages/rules-engine/src/evaluator.test.ts`.

## M5.5 builder identity-header checkpoint (2026-09-17)

- The Build header now gives its portrait more visual weight and presents the
  character name as a directly editable, accessible field. Name edits use the
  established `set-text` command, optimistic autosave queue, and repository
  title synchronization, so the header and Character details share one durable
  update path. The unfocused field preserves the former plain-heading look with
  no visible textbox border or fill; pointer hover adds a subtle underline and
  keyboard focus replaces it with a thicker accent-colored underline rather
  than a rectangular outline. The name and subtitle visible text share the same
  horizontal start edge.
- The subtitle is limited to the available race, class, and current level in
  natural space-separated form such as `Dwarf Paladin 7`; XP, placeholder
  labels, and visual separators are absent.
- Current-level editing has moved from the header to the Character details
  Identity group. It retains the full 1–30 range, canonical intervening-frame
  creation, effective-level command, autosave behavior, and responsive native
  select semantics.
- Focused tests pass 74/74, and the full public suite passes 354/354 alongside
  lint, workspace typechecks, the production/PWA build, built-PWA validation,
  and Chromium/Firefox Letter/A4 print checks. Live desktop and 375 px checks
  verified name persistence across reload, a restored test record, no header
  level control or XP, the Character details level selector, no page-level
  horizontal overflow, and no browser console errors. `scripts/check.sh` still
  stops at its initial formatting gate on the unrelated pre-existing
  `apps/web/src/equipment-ui.test.ts`; this change leaves that file untouched.

## M5.5 compact character library checkpoint (2026-09-17)

- Character cards present only the portrait, character name, level/race/class
  summary, and top-right actions for editing the build, opening the sheet,
  exporting, duplicating, and moving the character to recoverable trash.
- Profile diagnostics, migration controls, and editable library-only title and
  notes no longer compete with character identity on the library surface. Their
  stored data and the underlying migration and recovery infrastructure remain
  intact.
- The export icon opens an on-demand menu with exactly three user formats:
  checksummed single-character `.4ecb`, regenerated current-state `.dnd4e`, and
  the character-sheet PDF print flow. The untouched imported XML is no longer a
  user export option, but remains embedded as preservation input when regenerated
  `.dnd4e` retains unknown legacy fields.
- Every icon action has an accessible name, tooltip, keyboard focus treatment,
  and a distinct danger treatment for trash. The export button exposes expanded
  state and its controlled panel, supports Escape-to-close with focus return,
  and keeps its three choices out of the tab order until opened.

## M5.5 composed shield naming checkpoint (2026-09-16)

- The shared inventory-name formatter now composes mundane shield bases with
  non-`+N` magic shield templates, so `Heavy Shield` plus
  `Storm Shield (heroic tier)` displays as `Storm Heavy Shield`. Exact holding
  IDs, saved elements, pricing, compatibility, and non-shield names are
  unchanged.
- The two focused character-domain and Equipment UI test files pass all 21
  tests, and the affected character-domain and web TypeScript checks pass in
  the project Nix environment.

## M5.5 unified production detail-card implementation (accepted 2026-09-16)

- The approved temporary power/equipment study is implemented in the shared
  production `EntityCard` path; production does not import or depend on the
  prototype files. Power headers contain the action symbol and name on the left
  and authored usage, lower-case power type, and level on the right. Attack type
  is a text-only body descriptor; Level, Power Type, and Power Usage do not
  repeat in the body. The exact `Attack Type: Personal` case displays as
  **Range: Personal** without mutating imported data; ordinary attack geometries
  retain **Attack Type**. This avoids colliding with the independent authored
  Power Type already shown in the header. Utility no longer overrides the
  authored at-will, encounter, or daily usage color. Power and item headers use
  the approved soft tinted background with normal text and a full-tone border
  accent.
- Power and item bodies now place flavor before a text-only descriptor strip and
  aligned rules rows with a fixed 4.75rem label column. Top-level cards retain a
  small Source footer. Resolvable granted powers use the same actual power
  header as an initially open disclosure and omit the embedded Source footer;
  an authored item `Power` field remains an inline rules clause.
- Recovered `PowerDisplay.BuildSpecificFields` explicitly renders Action Type
  plus Attack Type, Target/Targets, and Attack; its standard exclusion list is
  power type, power usage, class, level, keywords, action type, attack type,
  attack, target, targets, and display. `CheckerSpecifics` then retains authored
  order for every other visible field and preserves duplicate values. The modern
  stable adaptation puts Requirement/Prerequisite and Trigger first, preserves
  authored Primary/Secondary/Tertiary combat phases and unknown/custom clauses,
  moves Sustain and Aftereffect near the end, and guarantees exact Special last.
- Item headers resolve a compact user-facing type/level/rarity label and the
  approved corpus-backed Lucide family, including one `Sword` for mundane and
  magic weapons and artifact/dragonshard precedence. Focused tests cover usage
  tone, item labels/icons, structured rendering, default-open embedding, Source
  suppression, and inline item-power text.
- Verification passes all 117 web tests across 22 files, the web TypeScript
  checks, affected-file ESLint, formatting, and the production PWA build.
  Product-owner visual verification accepted the unified cards and the widened,
  responsive Shop detail column; focused follow-up checks passed after the final
  width adjustment.

## M5.5 builder browser-history checkpoint (2026-09-16)

- Build, Overview, Character details, Equipment, and Diagnostics now have
  bookmarkable editor hashes and push browser history. Build includes the
  selected level and available choice-section tab; Equipment includes Loadout,
  Inventory, Shop, or Rituals & Practices. Level-rail and nested-tab changes are
  therefore restored by Back/Forward before the edit route returns to the
  character library.
- Overview choice links create one final Build level/section destination.
  Invalid, retired, inapplicable, and currently unavailable nested values fall
  back and canonicalize by replacement. Same-route activation and route/state
  synchronization do not duplicate entries. Filters, accordions, inspected
  rows, choice edits, and other form state remain outside history.
- Focused route tests cover every workspace, nested-state scoping, invalid
  values, push/replace deduplication, and modeled Back/Forward restoration.
  Live browser verification opened a real level-8 character and observed the
  canonical Build/Feats, Overview, Equipment/Loadout, and Equipment/Inventory
  hashes. `nix develop path:. -c scripts/check.sh` passes all 319 tests across
  45 files, all workspace TypeScript checks, the production/PWA build,
  Chromium and Firefox print checks, deterministic public-pack checks, and the
  public query benchmark.

## M5.5 contextual content surface checkpoint (2026-09-16)

- The standalone Compendium navigation item, search/detail routes, saved-query
  UI, and page-only renderers are removed. Powers, feats, classes, equipment,
  and other entities remain available through their contextual builder and
  Equipment tables using the shared entity-card presentation.
- Empty, unknown, and retired `#/compendium` hashes resolve to Characters; the
  application replaces legacy Compendium hashes with `#/characters` so stale
  bookmarks recover to a coherent supported destination.
- The shared query worker, typed query engine, application-scoped index cache,
  and entity-card helpers remain because builder and Equipment flows use them.

## M5.5 radio selection checkpoint (2026-09-15)

- Custom compact choices no longer add a check glyph to the selected option.
  Clearable sets use toggle-button semantics and clicking the selected button
  clears it; mandatory sets retain `radiogroup`/`radio` semantics. Both retain
  the green selected background and border treatment. The shared change covers
  Gender, Alignment, replacement targets, parameterized choices, and other
  compact choice sets without changing unrelated X removal actions.
- The radio-styled paired ability-increase buttons likewise rely on their green
  selected treatment while retaining `aria-pressed`. Their displayed scores now
  apply pending selection deltas immediately and reconcile without double
  application when the authoritative evaluation catches up. The paired-choice
  header also keeps the same box layout as it moves between incomplete and
  complete states. Native theme radio inputs are unchanged, and the check glyph
  for the non-radio completed-level empty state remains in place.
- Focused accessibility-contract tests protect both sides of that distinction.
  The checkpoint command `nix develop path:. -c scripts/check.sh` passes all
  298 tests across 44 files, all workspace TypeScript checks, the production/PWA
  build, Chromium and Firefox print checks, deterministic public-pack checks,
  and the public query benchmark.
- The clear-on-repeat and immediate-score follow-up passes all 305 tests across
  44 files, ESLint, the web TypeScript checks, formatting, and the whitespace
  diff check in the project-local Nix environment.

## M5.5 action-type icon checkpoint (2026-09-15)

- Power-choice tables now use the same monochrome Unicode action symbols as
  `tabletop-dashboard`: standard `●`, minor `◔`, move `≫`, free `○`, immediate
  reaction `↻`, immediate interrupt `↯`, and no/unspecified action `–`.
- Each glyph is presentational text rather than an SVG or icon-font character.
  The exact authored Action Type value remains the tooltip and accessible name;
  the unspecified fallback retains its existing explicit label.
- Attack/range icons are unchanged. Their separate redesign remains deferred
  pending product-owner approval of the complete icon set recorded in
  [task-clarifications.md](task-clarifications.md).

Focused action-symbol and rendered-accessibility tests pass. The checkpoint
command `nix develop path:. -c scripts/check.sh` passes all 296 tests across 44
files, all workspace TypeScript checks, and the production build.

## M5.5 level-scoped ability totals checkpoint (2026-09-16)

- The level-1 Ability Scores pane shows point buy, racial/other bonus, and
  calculated total as three numeric columns per ability, using rules-engine
  stat contributions rather than hand-summed values.
- The level-1 editor and later ability-increase editors consume an evaluation
  scoped to the selected pane level. Historical and planned panes therefore
  include choices through that level while excluding later-level increases.
- Pending ability select/deselect clicks add only their unevaluated delta and
  clear when the level-scoped evaluation catches up, preserving immediate
  feedback without double application.

Focused tests cover an effective-level 8 build at levels 1, 4, and 8, including
immediate level-4 select/deselect behavior and the caught-up result. All 55
focused builder/accessibility tests and the web TypeScript check pass.

## M5.5 power selector sorting checkpoint (2026-09-16)

- Power selection tables default to Level descending, placing the highest-level
  candidates first. Other selection-table kinds retain Name ascending as their
  default, and switching table kinds restores the appropriate default sort.

The focused accessibility contract test and live web-app verification pass.

## M5.5 semantic description columns checkpoint (2026-09-16)

- Candidate headers named Description or Short Description are non-sortable by
  semantic label; unrelated fields such as deity Alignment use the normal
  sortable-header path without position- or entity-specific exceptions.
- Deity selection tables add a presentation-only Description column derived
  from the first sentence of each deity's full description. The Deity and
  Alignment columns size compactly to their contents while Description takes
  the remaining width. Stored content and detail-page prose are unchanged.

All 55 focused builder/accessibility tests, the web TypeScript check, and live
web-app verification pass.

## M5.5 content-sized table columns checkpoint (2026-09-16)

- Candidate selection tables now use automatic column layout: identity and
  short metadata columns size compactly, while prose/Description columns take
  the remaining width and wrap normally. Oversized fixed percentages and class/
  background minimum widths were removed.
- Equipment inventory, shop, and ritual/practice tables give item names the
  flexible width while quantity, type, level, price, and action columns remain
  compact. Character-overview tables were audited and already used intrinsic
  sizing, so they required no change.

The focused accessibility contract test, web TypeScript check, and live
web-app verification pass.

## M5.5 unified entity cards checkpoint (2026-09-16)

- Compendium, builder selection details, Equipment details, granted entities,
  and embedded theme powers now share one entity-card header/body renderer.
  Context wrappers add only controls and contextual metadata such as
  collapsibility, selection state, price, navigation, or relationships.
- Shared power headers retain the approved action icon, normal-weight lowercase
  attack type, and right-aligned usage/level in every context. Flavor,
  description, prerequisites, specifics, and subdued Source ordering are also
  shared; Short Description is omitted everywhere.
- The global Hide flavortext preference is persisted and applies to every
  entity-card surface.

All 55 focused builder/accessibility tests and the web TypeScript check pass.
The shared card presentation was verified live across Compendium, builder,
Equipment, and embedded/collapsible cards.

## M5.5 Shop redesign implementation checkpoint (2026-09-22)

- The accepted Shop prototype is now implemented against production content,
  holdings, wallet commands, and shared item cards. One alphabetical Browse
  control covers the modern role taxonomy plus rituals, formulas, and martial
  practices; ritual scrolls are Consumables. Dynamic Slot and Subtype filters,
  optional legacy categories, Source/Rarity/Tier filters, reversible Name/Level/
  Price/Owned sorting, and session-persistent preferences replace the former
  one-table query form. Affordable and Proficient start enabled; learning
  categories substitute the Known toggle while retaining disabled Slot/Subtype
  controls for layout stability. First-time Shop visits open Adventuring gear
  rather than the expensive All Items view; returning during the same browser
  session restores the last Browse, search, filter, and sort configuration.
- All Items uses the same high-level headings as Browse. Dense rows use canonical
  item icons, fixed right-aligned numeric/action columns, independent Buy and
  Give controls, and a bottom-right not-proficient cue. Give records an exact
  holding at zero cost. Nonpurchaseable or unpriced records keep a disabled Buy
  icon with the approved tooltip and remain giveable; proficiency never blocks
  acquisition. Transaction feedback relies on the existing save-state and
  changed inventory/funds rather than verbose messages.
- Exact terminal `+N` families collapse to the highest eligible level not above
  the character, display `N+` when higher matching variants exist, remember an
  explicit session choice, and expand deterministically low-to-high. Shop-only
  aliases remove Weapon/Armor/Shield/implement carrier words from table and
  detail headings without changing canonical IDs or names.
- The descriptive detail card no longer contains acquisition controls. Funds are
  independently sticky above the normally scrolling detail cards and use the
  same denomination summary and Edit modal as Equipment. Shop exposes Quick
  adjust directly as an icon-triggered popover whose preselected field submits
  with Enter; the shared modal is reserved for explicit denomination editing.
  Both compact summaries omit the redundant visible Funds label while retaining
  their accessible section name. Compatible physical-item selection is a separate dialog using
  authored compatibility. Standard magic implements create the standalone
  `[Magic Item]` legacy shape; superior implements create the exact ordered
  `[Superior Implement, Magic Item]` shape. A one-choice case bypasses the
  dialog. Single-type implement cards use a qualifier such as
  `Implement Enchantment (Staff)` and omit a redundant compatibility row.
- The follow-up full-corpus taxonomy audit normalizes every `Ritual Scroll`
  record to the player-facing **Scrolls** subtype instead of leaking the type of
  the supported practice, collapses generic consumable labels to **Other**, and
  disables Slot or Subtype controls that have only one represented choice.
  Authored mount, worn/tattoo, universal-implement, and special-item evidence
  now closes previously unclassified or misplaced edge cases, while internal
  companion-advancement and workaround definitions remain outside the catalog.
  Inspecting an alchemical formula follows its exact `_RELATED_ITEMS` IDs and
  renders the highest created-item variant not above character level as a
  regular secondary detail card, falling back to the lowest variant.
- Follow-up verification passes 62 focused Shop, Equipment, helper,
  profile-resolution, and accessibility tests plus all 484 public tests across
  67 files. Web TypeScript, affected lint, formatting, and diff checks pass.
  The earlier production/PWA, print, deterministic-pack, and benchmark checks
  were not rerun for this follow-up.
- Focused verification passes 68 Shop, Equipment, routing, helper, and
  accessibility tests. The complete public gate passes all 475 tests across 66 files, every
  workspace TypeScript check, the production/PWA build, Chromium and Firefox
  Letter/A4 print matrices, deterministic public-pack rebuild/validation, and
  the public query benchmark. An ignored private-pack diagnostic confirms that
  the authored Group compatibility returns exactly four superior staffs for
  Staff of Ruin and four superior holy symbols for Symbol of Victory.
  The product owner completed the production live-review pass on 2026-09-22
  after an element-for-element visual reconciliation with the accepted
  prototype. The production denomination-cell treatment was retained by
  explicit preference. This accepts the combined Shop and ritual/practice
  interface without declaring the remaining M5.5 closure work complete.

- Display settings now offer **Keep large amounts in gold**. When enabled,
  automatic adjustments, purchases, and sales normalize CP/SP overflow through
  GP without promoting it to PP or AD. Explicitly entered PP and AD remain
  visible and persisted until spending requires a larger coin to be broken;
  exact total value, carried/stored order, and legacy currency export are
  unchanged.

## M5.5 Equipment/Shop navigation candidate (2026-09-19)

- Equipment now opens directly on Inventory with no nested tab strip. Loadout is
  a route-backed alternate main pane with responsive slot stacks. Inventory and
  Loadout buttons swap that left pane in place while the shared item detail
  viewer remains fixed on the right.
- Shop is a peer top-level character-editor tab. Its Browse select covers Items,
  Rituals, Alchemical formulas, Martial practices, and Ritual scrolls while
  retaining the existing exact query, Buy/Learn/Known, affordability, pagination,
  and inventory semantics.
- Canonical hashes use `tab=equipment` with optional `loadout=1`, or `tab=shop`
  with an optional category. Legacy Equipment section hashes still resolve:
  Inventory opens Equipment, Loadout opens its pane, Shop opens Shop/Items, and
  Rituals & Practices opens Shop/Rituals.
- This candidate passes the web TypeScript check and 67 focused route, Equipment,
  Loadout, builder-header, and accessibility-contract tests. It remains subject
  to live product-owner review.

## M5.5 shared class-card organization checkpoint (2026-09-16)

- Class and Hybrid Class specifics are organized by the shared entity-card
  renderer into Role & Power Source, Starting Statistics, Proficiencies &
  Training, Class Features & Build, Flavor, and an Other fallback.
- The organization applies identically in Compendium, builder selection
  details, and every other entity-card context. Context wrappers retain only
  controls and contextual metadata.
- Every authored user-facing field is retained exactly once; duplicate fields
  remain visible, while legacy Implements and Implement values share one
  labeled row. Non-class cards retain the standard Details presentation.

Focused grouping, rendered-card, shared-context contract, formatting, web
TypeScript checks, and live product-owner verification pass.

## M5.5 equipment workspace checkpoint (2026-09-14)

- Equipment is now a full peer workspace with Loadout, Inventory, Shop, and
  Rituals & Practices tabs and one shared details column. Loadout exposes the
  recovered Body, paired hand, Head, Neck, Arms, Hands, paired Ring, Waist,
  Feet, Symbol, Ki Focus, and Tattoo locations; Companion, Familiar, and Mount
  locations appear when compatible owned content requires them. Slot selectors
  list only holdings whose authored item-slot metadata is compatible.
- `BuildInventoryEntry` retains legacy `equippedQuantity` and adds optional
  exact slot/copy assignments. Historical imports remain valid without guessed
  slot identity. Domain commands enforce stable slot IDs, copy indices, global
  slot exclusivity, and equipped-count synchronization. Regenerated `.dnd4e`
  export retains the legacy count projection; a focused round-trip fixture
  verifies that app-native slot identity is omitted rather than written into an
  invented compatibility field.
- The wallet reads inherited per-level **Carried Money** and **Stored Money**
  from the exact legacy `_PER_LEVEL_<N>_...` keys. Copper, silver, gold,
  platinum, and astral denominations use the recovered 10/10/100/100 exchange
  rates. Editing writes the current effective-level key. Purchases are atomic,
  consume carried funds before stored funds, and reject insufficient funds;
  20%, 50%, and 100% sales remove one exact copy and credit carried money.
- Shop and Rituals & Practices reuse the application-retained Compendium query
  worker, deterministic name sorting, typed source/type/slot/rarity/tier facets,
  level ranges, a character-aware known-proficiency/not-confirmed filter, and
  200-record previous/next pages. The full corpus is never rendered as one DOM
  table. Buy controls reject `_CannotBeBought`, unpriced, unaffordable, and
  already-known practice records. Proficiency wording remains conservative
  because this checkpoint does not introduce an alternate item-proficiency
  formula outside the evaluator.
- Terminal `+N` magic-item variants are grouped only by stripped name plus
  magic type, slot, armor, and weapon compatibility fields. The worker applies
  exact filters first; each displayed variant remains an exact selectable and
  purchased content ID. Magic armor and weapon enchantments require a
  compatible base, preserve the ordered base/enchantment IDs, honor common
  native `Any`, melee/ranged/handed/thrown/group/name and minimum-enhancement
  gates, and use the enchantment price as the transaction value.
- Ritual records are split by authored subtype into rituals, alchemical
  formulas, and martial practices. Exact Ritual ownership is unique/known;
  exact Ritual Scroll ownership remains a separate quantity-bearing inventory
  record and never implies knowledge. Spellbook alternates remain in Build.

Focused public verification passes 29 tests across the equipment UI, character
domain, and legacy import/export packages. The 2026-09-14 checkpoint command
`nix develop path:. -c scripts/check.sh` passes all 287 tests across 42 files,
all workspace TypeScript checks, the production/PWA build, Chromium and Firefox
Letter/A4 print checks, deterministic public-pack rebuild and validation, and
the public query benchmark. A live Equipment interaction run is not claimed:
the in-app browser had no installed content profile and could not reach the
local development server in this environment. The coordinator's independent
browser review remains the next live full-profile evidence gate.

Deferred recovered complexities are explicit: dependent hand/ring movement,
versatile/staff modes, holy-symbol name storage, magic-implement and shield
equivalence, double-weapon secondary ends, augments, package lot reconciliation,
automatic equipment, custom item/ritual creation, and relocating item-owned
choices into Equipment. These remain visible as ordinary holdings/evaluator
evidence; the implementation does not discard or fabricate them.

## Legacy construction-logic audit (2026-09-02)

A systematic documentation-only audit traced the original builder pages through
`D20Workspace` and the recovered native engine for candidate enumeration,
prerequisite internalization, Show Illegal behavior, grant/drop topology, choice
slots, fixed-point phases, level/history operations, replacements, suggestions,
ownership/duplicates, and save effects. The resulting
[construction-logic ledger](../reverse-engineering/docs/11-construction-logic-audit.md)
corrects the prior universal-order claim, records that suggestions guide Auto Pick
without changing legality, separates source entitlement from active/provider
ownership, refines the update/convergence sequence, and records the history-exit
and stale-evaluation boundary of native save. No production code or public fixture
depends on the decompiled application or ignored private corpus.

The P0 ownership follow-up is now implemented in the public evaluator model.
Candidate decisions separately report source entitlement, rules legality,
active definition/occurrence membership, and owning provider occurrences;
evaluated snapshots also expose the deduplicated membership projection. A
configured source list includes Core and recursively follows `_RequiresID`,
while an absent list retains the existing all-content-entitled local behavior.
Focused engine tests cover configured/unconfigured sources, dependency
entitlement, imported blocked occurrences, and provider identities. Builder
tests verify that unavailable source content remains explainable but cannot be
chosen as a house rule; rules-illegal content retains the explicit Show
Unavailable workflow.

The P1 construction-conformance follow-up adds public synthetic differentials
for deferred future grants, multi-iteration generated topology, level-one
grabbag timing, named definition drops, explicit replacement source identities
across ordinary/retrain/multiclass/power-swap/power-replace modes, replacement
chains, spellbook alternates, impossible replacement completeness, and current-
level regenerated export that rejects a historical evaluation and replaces
stale imported caches. Typed per-level `UserEdit` providers and recursive rule
statements now survive import, current-level projection, regenerated export,
and semantic re-import. Projection now synthesizes stable character-local
entities for them, and the evaluator executes their stat/grant/select effects
through the ordinary fixed-point path before regenerating sheet caches.

Named-select drops follow a saved selection through its active replacement
chain, blank selects materialize an available default and restart topology, and
an `existing` select with no active candidate does not make the character
incomplete. Contextual duplicate clearing now covers exact definitions and the
native one-hop Proficiency/Skill Training pass-through, preserves defaults and
same-definition replacement sources, removes derived descendants, and restarts
topology. The native prior-level active-mask edge remains documented for a later
temporal-membership model; it is not approximated with acquisition level.
Optional Auto Pick and UI sorting remain outside this follow-up.

The evaluator now also reconciles durable saved children with statement-level
`requires`. An inactive provider rule suppresses its selected child and entire
subtree from active membership and rule execution without deleting the saved
choice; reactivation restores that choice. Missing providers in imported/custom
data retain the existing recoverability behavior. This closes the concrete
Ranger gap recovered from `ID_INTERNAL_GRANTS_RANGER`: Beast Mastery disables
the Prime Shot/Running Attack selector through
`requires="!ID_FMP_CLASS_FEATURE_1030"`, so Prime Shot can no longer remain
active alongside Beast Mastery.

The current M5.5 interaction pass replaces feat and power dropdowns with
searchable tables backed by authored legacy metadata. Feats expose printable
prerequisites in search/details and Short Description in the table, avoiding a
redundant prerequisite column for already-legal rows; powers expose flavor plus
icon-only action and attack types whose exact labels remain accessible. Repeated
at-will and other same-category slots share one multi-select table, and selected
rows update optimistically. Rows are organized into collapsible legacy-derived
type sections: authored feat subtypes take priority before prerequisite-derived
Race/Class/Skill/tier groups, while powers use their skill or owner metadata.
The former 150-row cap has been removed: every matching row is available without
changing the search. In the Silaqui/full-corpus browser check, all 335 matching
feat groups were present and expanding the 181-row General section took about
0.28 seconds through the browser control layer, so virtualization is not yet
justified. Any feat or power candidate can be starred without selecting it;
favorites persist by content ID across reloads and combine with text search and
type filtering. The complete public check passes all 265 tests, workspace
typechecks, the production/PWA build, both browser print suites, deterministic
content-pack checks, and the query benchmark; a clean live reload reported no
browser warnings or errors.

Candidate details now follow unconditional executable `grant` metadata for
user-facing feats and powers. The granted record appears as a second full card
below the inspected option; for Archer Fighting Style this resolves the authored
`ID_FMP_FEAT_127` link and shows Defensive Mobility. The UI does not parse prose
to guess relationships, and it withholds conditional/internal grants from this
unqualified presentation. Public synthetic coverage verifies grant-card
resolution, inactive-select suppression/reactivation, and preservation of
genuinely orphaned compatibility records. The complete public check passes all
275 tests, every workspace typecheck, the production/PWA build, Chromium and
Firefox print checks, deterministic content-pack checks, and the query benchmark.

Character portraits are now browser-local, portable character metadata. The
shared editor accepts bounded PNG/JPEG/WebP/GIF uploads, normalizes the decoded
source to a 1600-pixel maximum edge, and provides pointer/touch panning plus
wheel and range-control zoom within a circular crop. It retains normalized crop
coordinates for later adjustment and caches a 512-pixel rendering. Circular
portraits appear on library cards, unobtrusively in the builder heading, and in
the printable sheet header. Portrait editing is intentionally confined to the
builder; the library and sheet are read-only presentation surfaces.
Portraits survive repository reconstruction, duplication, and checksummed JSON
backup/restore while remaining outside legacy export. Focused validation covers
record rejection, persistence/removal, and crop bounds. Live Chromium validation
loaded a synthetic landscape PNG under the existing strict image CSP, panned and
saved it, confirmed it survived reload and appeared on all three requested
surfaces, and reported no console errors. The complete public check passes all
270 tests, workspace typechecks, the production/PWA build, Chromium and Firefox
print checks, deterministic content-pack checks, and the query benchmark.

The M5.5 runtime pass moves immutable content-derived state out of route
components and into a bounded application-scoped cache. Decoded packs,
initialized rules workers, the most recent exact evaluation inputs, and built
Compendium indexes now survive Build/Sheet/Compendium/Characters navigation in
the same document. Content/profile changes explicitly invalidate the cache;
failed or least-recently-used worker entries terminate cleanly. Focused tests
cover concurrent decode/initialization deduplication, exact evaluation
memoization, invalidation, and worker disposal. Live Chromium verification built
the 38,339-record index once in 6,019 ms, navigated Compendium → Characters →
Compendium, reused the original completed index without presenting Cancel
indexing, and logged no warnings or errors. Full browser refresh remains one
intentional reconstruction from IndexedDB.

Verification for this slice: `nix develop path:. -c pnpm --filter
@4ecb/character-domain typecheck`, the equivalent `@4ecb/rules-engine` and
`@4ecb/legacy-dnd4e` typechecks, and `nix develop path:. -c pnpm vitest run
packages/character-domain packages/rules-engine packages/legacy-dnd4e` all
pass. The package run covers 145 passing tests in 16 files.

The final public checkpoint `nix develop path:. -c scripts/check.sh` passes 248
tests, every workspace typecheck, the production/PWA build, Chromium and Firefox
print checks, deterministic pack build/diff, and query benchmarks. The ignored
full-pack diagnostic covers all eight user samples: cached powers match 482/482
comparable fields and numeric stats match 536/537. The sole numeric difference
remains Idon Tkare's previously investigated `Barbarian Agility` cache value
(legacy 0, evaluated 1). Silaqui is 67/67 numeric and 71/71 power fields with no
evaluation diagnostics. A profile-identity-cached definition lookup prevents
resolved prerequisite parsing from rescanning all 38,339 definitions for every
candidate.

## M5.5 first builder-interface draft

- The working rules-backed editor now uses the approved hybrid structure: a
  compact portrait-and-identity header, tiered 1–30 level rail, and a
  selected-level workspace whose mechanical categories are horizontal tabs.
  Race, class, current level, and XP appear beside the portrait; unresolved and
  warning totals appear beside local save state. The redundant overview panel,
  role/plan facts, and routine successful-evaluation prose are removed. Only the active
  Class, Race, Background, Theme, Ability Scores, Companion, Skills, Powers,
  Spellbook, Feats, or optional Retraining category is mounted, and each visited
  level remembers its active category. Unresolved decisions are prominent,
  completed selections stay visible in compact form, and a chosen target creates every intervening
  level in one autosaved transaction without advancing the current effective
  level.
- The level rail no longer expands into an overlay. A sibling **Overview** tab
  provides category checklists for Character, Ability Scores, Companion, Skills,
  Powers, Spellbook, Feats, Retraining, and Other without shifting the choice and
  option detail panes, while the rail remains compact direct navigation within
  Build. Overview replaces both the former popout and bottom history disclosure,
  and deliberately omits the duplicate raw “Stored features” occurrence tree.
  Each row identifies its owning level and choices are ordered by level within
  their pane. Its planned-level toggle starts off and reveals only future levels
  containing saved selections; untouched plan frames stay absent. History rows navigate
  back to the owning level and category, and completed optional retraining is
  retained as history without becoming a required decision. Ordinary detail
  surfaces use natural document height; only large candidate tables retain
  bounded internal scrolling. Live Silaqui verification found one history list
  for each displayed level, no “Stored features” subtree, no untouched level 9,
  and a level-8 feat row that returned to Build with level 8 and Feats active.
- Overview checklists now remove pane-specific redundancy: Character omits its
  constant level, Feats and Skills omit constant choice labels, and unselected
  optional Background slots do not render. Regular ability increases at levels
  4 and 8 each render as one paired row. Optional retraining has dedicated
  `From → To` columns; feature-driven replacements remain in their actual content
  pane. Silaqui's unresolved Rapid Shot replacement renders in Powers as
  `8 | At-Will | —`, with the green At-Will row tone. Content-sized wrapping
  produced approximately 290 px compact panes and 402 px Power/Retraining panes
  in live browser verification instead of uniformly stretched panels. All
  navigable checklist cells share the same plain-text treatment, including the
  Character Choice and Power Type columns; their controls do not render as
  raised form buttons.
- Retraining provenance also appears on the resulting checklist item as a
  superscript **R**, joined by exact selected occurrence rather than a name
  heuristic. Its native tooltip and accessible label state the original item
  and level. Live Silaqui verification showed `Nimble Strike → Fading Strike`
  in Retraining and exactly one marker beside Fading Strike reading
  “Retrained from Nimble Strike at level 6.”
- The compact rail now exposes all 30 levels under collapsible Heroic, Paragon,
  and Epic headings. A loaded character starts with only its current tier open;
  other tiers can be expanded independently. Selecting a not-yet-built level
  creates every intervening frame, opens that level, and leaves the effective
  character level unchanged. The separate plan-horizon selector is removed;
  current level remains an explicit compact control in the identity header.
  Live Silaqui verification selected unplanned level 9, observed the saved
  horizon and current-level options extend through 9 while effective level
  remained 8, and restored the test record through undo. Reopening the builder
  restored Heroic-open/Paragon-and-Epic-closed defaults; the 1280px layout used
  an 88px rail, left 1113px for choices, and had no header overlap or horizontal
  overflow. The 2026-09-14 public check passed all 270 tests, typechecks,
  production/PWA build, Chromium/Firefox print checks, deterministic content
  checks, and query benchmark.
- The level-category tabs use native tab semantics, stable status color and
  icons, and Left/Right/Home/End keyboard navigation without typography or
  layout shifts. Timeline links activate the category that owns their target;
  selecting level-1 ability work likewise opens Ability Scores directly.
  Candidate tables retain the sole intentional inner scrollbar and grow with
  taller desktop viewports, while ordinary forms keep their natural height.
  Live full-profile verification on 2026-09-14 confirmed the complete seven-tab
  level-1 order, one mounted tab panel and one keyboard tab stop, per-level tab
  memory, ArrowLeft focus/content movement, no page-level horizontal overflow,
  visible ordinary-panel overflow, and table-only automatic overflow. The same
  checkpoint passed all 270 public tests, workspace typechecks, production/PWA
  build, Chromium/Firefox print checks, deterministic content checks, and query
  benchmark.
- The selected level is now the non-interactive leading title in the category
  strip rather than a separate pane heading. The outer choice pane no longer
  contributes a surface, border, inset warning, or padding: selection and detail
  surfaces sit independently against the page background. The redundant
  **Build workspace** eyebrow is removed, tier headings align left, and **Show
  unavailable options** is temporarily removed pending its later redesign.
  Live Silaqui inspection confirmed equal 46.4px level-title/tab heights, one
  keyboard tab stop, no heading exposed as a tab, transparent zero-border and
  zero-padding outer choice chrome, and no horizontal overflow.
- Desktop feat and power tables now use a 24rem minimum rather than the obsolete
  12rem fallback left over from the removed overview chrome, and subtract 30rem
  rather than 34rem when growing with a taller viewport. At the constrained
  1280×720 browser viewport, the Silaqui feat table grew from 192px to 384px
  while retaining its bounded row scroll and no horizontal overflow.
- Feat and power rows now separate browsing from commitment: single-click pins
  details, hover/focus do nothing, and double-click selects. Enter is the
  keyboard selection equivalent; Space remains inspection-only. Live Silaqui
  verification single-clicked Bloodhound Style without changing the selected
  feat, double-clicked it to replace Archery Mastery, selected Cruel Cut Style
  with Enter, and restored Archery Mastery through the normal undo path after
  each mutation.
- Verification on 2026-09-14 passed the complete public check (270 tests,
  workspace typechecks, production/PWA build, print checks, deterministic
  content checks, and query benchmark). Live full-corpus verification at 1280px
  confirmed the Build rail and focused selection layout, then confirmed the
  separate Overview history and its level/category navigation without a second
  raw occurrence list.
- The builder evaluates the current character and the full saved planning
  timeline as separate projections. Future choices can be inspected and edited
  out of order without entering current calculations. Lowering **Show plan
  through** hides levels for the session and never mutates saved frames; a
  durable separately hidden horizon remains a named schema follow-up rather
  than being encoded in unrelated character fields. Changing or extending the
  plan immediately invalidates both displayed projections: future levels show
  an evaluating state until a result for the exact saved horizon arrives,
  rather than rendering a stale current-level result as “no choices.”
- Choice surfaces show valid candidates by default. **Show all options for this
  choice** is local to the focused choice, exposes same-category candidates
  blocked by objective rules, excludes category mismatches, resets when focus
  changes, and marks an intentionally selected unavailable candidate as a house
  rule. The focused/selected record renders in an adjacent source,
  prerequisite, description, and mechanical-detail pane. The UI adds no
  popularity or recommendation inference.
- Autosave now exposes loading, saving, saved, and failure states independently
  from rules evaluation. Selection controls update optimistically while a
  serialized background queue persists rapid edits. Storage failure rolls the
  complete pending suffix back to the last persisted build; undo and redo retain
  the same commit-before-success contract. The application shell adds system/light/dark theme preference,
  simple inline monochrome icons, and semantic color tokens preserving the
  established at-will, encounter, daily, and item mappings.
- Global navigation now occupies the branded application header and contains
  only Characters, Compendium, and Settings. The Characters page starts or
  imports characters without a second introductory/create panel; the builder
  owns its Character sheet action. Settings contains browser-local display
  preference (System Default, Light, or Dark), character-library backup and
  restore, and the complete Content configuration surface.
- Interactive state changes use color, icons, fills, and inset markers without
  changing typography or control geometry. Timeline entries retain identical
  font metrics and height when unresolved, selected, warned, or complete; skill
  buttons reserve the same two-line status area for trained, available, and
  unavailable explanations so choices do not shift during interaction.
- Future planning no longer blocks or contaminates compatibility output. The
  canonical legacy-export projection trims frames, nested choices, inventory,
  and alternates above `effectiveLevel`; the library uses that same projection
  for its post-export semantic re-import gate. The full native record remains
  unchanged.
- Production in-app-browser verification on 2026-09-02 used an uncommitted
  public 11-record synthetic profile. It created and completed a native level-1
  Human Fighter, planned through level 4 while current level remained 1,
  selected an objectively unavailable future feat through the temporary
  show-all mode, exercised autosave/undo/redo and the dark override, and passed
  regenerated 0.07a semantic re-import with the future plan retained only in
  the native record. At 900 px and 375 px the builder collapsed to one column
  with no horizontal overflow; the browser console had no warnings or errors.
- A Silaqui-focused oracle pass traced three prototype discrepancies through
  native `CategoryMatch`, replacement, and loot serialization paths. Completed
  retraining now retains its inactive source option; power-only `$$CLASS`
  matching recognizes the selected theme through `Class`/`_ThemePower`; and an
  exactly matched current loot tally recovers item selections omitted from the
  level acquisition record. Silaqui now has zero unresolved choices, Sly Gambit
  is legal in the level-7 encounter slot, and the existing Poison armor choice
  suppresses the false level-8 prompt while cached parity remains 67/67 numeric
  and 71/71 power fields.
- The second product-review pass changes the main interaction unit from one
  choice to one level. A selected level now renders all of its choice sections;
  timeline Background and Skill Training entries are aggregated summaries that
  navigate to their grouped controls. Silaqui's two selected backgrounds remain
  visible under one primary section while further optional slots reveal through
  **Add another background…**. Her five Skill Training slots render as one
  eight-skill toggle list with a live `5 out of 5` count and adjacent details.
  The later selection-chip checkpoint above supersedes that progressive
  Background presentation with one shared table.
  Browser verification exercised optimistic untrain/train, restored the original
  skills through undo, and found no fresh console errors or horizontal overflow
  at 1200 px or 375 px.
- Player-facing detail and sheet-card surfaces no longer dump internal content
  metadata. Raw categories, underscore-prefixed relationship fields, and
  uppercase underscore-delimited machine-token values remain available to the
  rules/query/export layers but are omitted from display. The builder and
  compendium now use `printPrerequisites` for authored prerequisite prose and
  never present the rules-engine `prerequisites` expression as player text.
- Silaqui's selected Rapid Shot Mastery now exposes the legacy optional power
  replacement at level 8, limited to her leveled Ranger at-will attacks; live
  verification replaced Fading Strike with Rapid Shot, observed immediate and
  persisted selection, then restored the original build through undo. Large
  parenthetical feat families now render as a family selector followed by a
  parameter selector while dispatching the original exact candidate. Live
  verification changed `Weapon Proficiency (Greatbow)` to the Handaxe variant,
  confirmed the exact timeline identity, and restored Greatbow through undo.
- Dependent rules choices now collapse into one numbered progressive section.
  Silaqui's level-8 feat, Rapid Shot Mastery selection, and resulting at-will
  replacement appear under one Archery Mastery heading and one timeline entry;
  the three exact saved occurrences and legacy export topology are unchanged.
- Repeated positional slots from one rule now share one section and timeline
  summary with an `X of Y chosen` status. A complete private-corpus audit found
  the generic treatment applies to paired ability increases, level-1 at-will
  powers, and hybrid-class pairs; Background and Skill Training remain under
  their existing specialized controls. Live Silaqui verification confirmed one
  level-8 ability section with Dexterity and Constitution as its two slots and
  one level-1 Power section with two slots.
- Choice-list filtering is now one temporary level-wide **Show unavailable
  options** control. Ability-increase groups omit repeated filter prose and
  empty candidate-detail cards. Generic optional replacements are presented as
  collapsed, category-specific retraining actions and are omitted from timeline
  summaries; existing retraining remains visible as completed history. Live
  Silaqui verification confirmed the unused level-5 actions, category-filtered
  Power editor and cancellation, and her saved level-6 Power retraining.
- The selected-level workspace now follows the legacy builder's recovered
  mechanical pane order: Class, Race, Background, Theme, Ability Scores,
  Companion, Skills, Powers, Spellbook, and Feats. Gender, alignment, and deity
  live outside the level timeline in a sibling Character details tab, matching the legacy
  builder's Build/Details separation. Gender and Alignment render as visible
  button/radio grids; Deity uses the shared candidate table with Name and
  Alignment columns, filtering, persistent favorites, Clear, and detail
  inspection. Opening Character details requests full candidates for those
  choice levels while other workspaces retain bounded candidate expansion.
  Choice controls occupy one ordered middle list and update a single sticky
  detail viewer; no per-choice detail cards remain mounted. Single decisions no
  longer inherit the numbered progressive-flow chrome reserved for genuinely
  dependent multi-step choices. Live Silaqui verification confirmed the
  first-level group/row order, click-to-inspect Alignment details, one mounted
  detail viewer, no inline duplicates, and no horizontal overflow.
- Live Silaqui verification confirmed that level 1 and its timeline contain no
  identity choices, Character details orders Gender, Alignment, and Deity
  without nested headings, switching tabs hides the build workspace, and the
  374 px viewport has neither horizontal overflow nor browser-console errors.
- Rules choices no longer use dropdowns merely to encode “Unresolved.” Sets of
  at most eight compact candidates use visible stable button grids; larger and
  information-rich choices use the shared searchable/favorite table. This also
  covers retraining targets/results and one-shot starting presets, whose Apply
  action remains explicit. The only remaining builder dropdown is the compact
  numeric current-level control. Live Silaqui verification exposed five
  table-backed Ranger presets, 135 deities with authored alignments, visible
  Gender/Alignment choices, and exactly one `select` in the builder main area.
- Equipment and Diagnostics now occupy peer workspace tabs beside Build,
  Overview, and Character details. Their prior bottom disclosures are removed;
  existing inventory quantities/equipped quantities and evaluator diagnostics
  remain unchanged pending the dedicated equipment redesign.
- Class selection uses its authored Short Description and adds compact Role and
  Power Source columns. The compound legacy values are parsed into label and
  retained-description pairs (for example, `Striker` plus its explanatory
  prose). Starting-preset rows use only the first sentence of the full authored
  description while the details pane continues to show the complete record.
- Class-feature choices now use shared candidate tables with Short Description
  summaries instead of radio-button grids. Nested choices recover an authored
  parent feature name from evaluator/provider provenance or a shared parent
  category—covering Avenger's Censure—while anonymous direct class rules retain
  the generic Class Feature heading. Overview uses the same names. Starting
  presets now follow the Class table and are collapsed by default.
- Candidate tables default to alphabetical Name order and preserve their order
  when a row is selected. Clicking another column heading sorts by that column
  with Name as the tie-breaker; clicking the active heading reverses it. They
  communicate selection through the existing green row highlight without a
  second checkmark. Tables with six or fewer visible rows now size to their
  contents rather than inheriting the large-table viewport height.
- Power tables now show authored levels and participate in the shared sortable
  table behavior. Resolved theme headings include their
  theme name. Ordinary class utility slots now include the legacy `Any Class`
  category, restoring race-qualified utility powers alongside authored class,
  trained-skill, and theme powers; prerequisite legality still filters powers
  for other races or untrained skills.
- Theme candidate details now list their structured `Class`/`_ThemePower`
  members and direct power grants under collapsible per-level headings. Direct
  grants without authored levels appear at level 1, and duplicate grant/member
  relationships render only once.
- Background candidate tables now show a sortable **Associated Skills** column
  from the authored `Associated Skills` field. Empty metadata remains visibly
  unspecified; the UI does not infer associations from benefit or description
  prose.
- Ability Scores panes now read the selected class's structured `Key Abilities`
  field and present its values in authored order in a grammatically formed
  sentence above the controls. Matching radio and level-up button options carry
  a right-aligned, assistively labeled key icon without adding another
  selected-state color; missing class or key-ability metadata leaves both
  treatments absent.
- Base ability scores now live only in the level-1 Ability Scores group, before
  racial increases, and no longer appear as an unrelated editor below the level
  workspace. The editor now mirrors the legacy 22-point-buy path: new native
  characters start from `8, 10, 10, 10, 10, 10`, escalating-cost steppers show
  points remaining and next-increase cost, exact allocations complete the level
  timeline item, and invalid/custom arrays remain editable with a house-rule
  status. Regular and companion level increases share one six-button control
  accepting two distinct choices, matching the recovered legacy
  `AbilityLeveling.LevelChoices` grouping, but companion increases now live in
  the separate Companion category with beast-companion, familiar, and
  companion-owned follow-up choices. The recovered `CompanionPage` displays
  both Companion and Familiar choices and mounts beast ability leveling there;
  the full corpus contains no player-selectable companion feat slots.
  Live Silaqui verification confirmed her existing standard allocation
  is recognized as complete, decrementing a score immediately reports the point
  difference, undo restores it, and the control has no horizontal overflow at
  374 px. A replacement choice with exactly one visible result treats that
  result as implied: choosing the source to replace dispatches the exact
  replacement immediately and omits the redundant **With** control. Live
  Silaqui verification selected Fading Strike and observed Rapid Shot applied,
  then restored the original build through undo.
- Paired ability-score increases now render as one ordered six-button selector
  with a live `N of 2 chosen` count. Selected abilities can be cleared, duplicate
  selection is impossible, and the other four abilities are disabled once both
  exact rules-engine slots are occupied. Live Silaqui level-8 verification
  confirmed immediate optimistic selection/clearing, restoration of her
  Constitution/Dexterity choices, and no horizontal overflow at 374 px.
- Character details now implements the complete recovered legacy text-field
  pattern: character/player/company/RPGA identity, age/height/weight, the three
  rule-backed identity choices, and Personality, Appearance, Character
  Background, Companions, Session/Campaign, and RPGA notes. Text edits update
  optimistically, autosave after a short pause or blur, survive `.dnd4e` export,
  refresh corresponding derived sheet fields, and keep the library title in sync
  with Character Name. Live Silaqui verification confirmed all fields load,
  temporary rename and restoration update immediately, the page has no console
  errors, and it has no horizontal overflow at 374 px.
- Silaqui's false level-6 house-rule warning was a presentation bug: warning
  detection flattened candidate decisions from every possible replacement
  target. It now evaluates the selected replacement only, correctly recognizing
  the imported Nimble Strike to Fading Strike retraining as rules-legal.
- A direct legacy-resource and recovered-code audit now documents the builder's
  visual language. The web shell uses its PHB navy, SteelBlue selection cue,
  neutral/ice/cream surfaces, and exact at-will, encounter, daily, utility, and
  item identities. Choice categories, entity details, compendium results, and
  navigation use tree-shaken Lucide monochrome symbols alongside text. The layout is
  denser and square-edged, with full-width bars and dividers replacing pill and
  floating-card chrome; a contrast-checked derived dark palette preserves the
  same semantic meanings. Live Silaqui checks covered light and dark desktop
  rendering plus both themes at 374 px, including an encounter-power detail
  pane, without clipped controls or horizontal spill.
- Timeline rows now use one category icon rather than a category icon plus a
  redundant completion check: unresolved icons are muted, completed icons are
  colored, and house rules retain a warning treatment. Presentation labels are
  independent of evaluator names, remove redundant `Choose` prefixes, and show
  usage before `Power` without repeating the surrounding level. Eligible entity
  details no longer carry a positive legality badge; unavailable choices and
  selected house rules remain explicit. Live Silaqui verification confirmed the
  concise level-1 labels, the single-icon rows, and an Encounter Power detail
  without a `Rules-legal` marker.
- Choice chrome now applies one hierarchy rule across generic, repeated,
  progressive, background, and skill controls: category bars are not echoed by
  type eyebrows, ordinary controls omit the visible **Selection** boilerplate,
  and subordinate labels remain only where they distinguish real steps or
  slots. Silaqui's level-1 repeated group and timeline now say **At-Will
  Powers**, with only **Power 1** and **Power 2** beneath it. Her background
  benefit is a two-stage **Benefit type** and exact parameter control covering
  language, skill bonuses, class skills, and named benefits without changing
  the stored candidate. Background-association and exact-background
  prerequisites now limit those options to benefits supplied by at least one
  selected background; Silaqui consequently sees only Nature, Perception, and
  Athletics for both skill-bonus and add-class-skill choices. The unconfirmed
  Dragon 383 +1-to-two-skills form is intentionally not synthesized.
- Skill Training now separates different evaluator scopes rather than combining
  them into one ambiguous toggle list. Silaqui sees one **Dungeoneering or
  Nature** selector (`1 of 1`) followed by **Ranger skills** (`4 of 4`), with
  duplicate choices disabled across scopes. A filled one-slot scope replaces
  its selection when another eligible skill is clicked, without requiring an
  intermediate deselection.
  Level-1 point buy now uses one full-width row per ability and reports points
  as `X out of 22 points spent`; browser inspection confirmed the steppers no
  longer collide in the middle pane.
- Choice candidates now apply the legacy executable `Prereqs` expression before
  presentation. Silaqui's level-1 feat selector drops from 3,330 candidates to
  299 candidates plus its placeholder by default; **Show unavailable options**
  restores the full list, including Arcane Admixture IV. The implementation
  resolves prerequisite names/IDs through indexed definition tokens and caches
  each result per evaluation. Direct inspection of the legacy engine confirms
  `_INTERNAL_PREREQS` is an in-memory tree parsed from `Prereqs`, not a separate
  XML metadata field; `print-prereqs` remains display-only. The recovered
  `A, B, or C` grammar also eliminates Silaqui's false Archery Mastery warning.
- Planned prerequisite checks now use each choice's effective acquisition level
  rather than the final planning horizon. Same-level ability increases and
  owned features can unlock a choice, while later planned levels cannot leak
  backward; selected earlier choices retain a failed-prerequisite diagnostic if
  they qualify only later. Bounded build-prefix snapshots reuse the ordinary
  topology/stat pipeline. Public regression fixtures cover ability, level, and
  owned-feature prerequisites. The full Silaqui profile remains 67/67 numeric
  and 71/71 power-field matches with zero diagnostics; its scoped evaluation
  measured approximately 4.8 seconds cold and 0.55 seconds warm in the
  development runner, and a live level-1-to-8 plan expansion settled in 0.85
  seconds. The complete public check passes all 264 tests plus workspace
  typechecks, the production/PWA build, browser print checks, deterministic
  content-pack checks, and the query benchmark.
- Choice controls now recognize the same arbitrarily deep generated-grant
  ancestry that the build projection can materialize. This keeps an unresolved
  racial-trait selector enabled when its race grants an intermediate feature
  before exposing the actual choice. A single ordinary choice beneath a
  category bar no longer repeats its individual title, and grouped feat
  selectors suppress the redundant visible **Feat** field label while retaining
  an accessible control name.
- Rules reevaluation is now stale-while-revalidate for an unchanged planning
  horizon: the worker updates in the background while the last complete choice
  workspace remains mounted and optimistic controls remain responsive. A small
  profile-revision-keyed result cache reuses the unchanged current-level
  projection during future-level edits and recent exact projections during
  undo/redo. Only creating a genuinely new planning horizon shows the loading
  state because no result for those new levels exists yet.
- Full-profile evaluation now reuses immutable rules indexes, known-definition
  tokens, and compiled prerequisite trees. Prerequisite ownership tests use the
  evaluator's existing normalized token set instead of repeatedly scanning and
  normalizing every owned definition. A four-pass Silaqui/full-pack development
  benchmark improved from approximately 13.1 seconds on every pass to 5.7
  seconds cold and 1.5 seconds warm. A live level-10 selection kept the complete
  workspace visible throughout reevaluation and settled end-to-end in about
  2.3 seconds before the test plan and choice were restored through undo.
- Builder evaluations now expand complete candidate lists only for the viewed
  level. Other levels retain their exact choice topology, selected-candidate
  legality, and the active candidates needed by `existing` rules. The scoped
  result omits category mismatches that **Show unavailable options** is not
  allowed to reveal. Nested ordinary-retraining candidates are generated only
  after the user opens a retraining editor; completed selections retain their
  selected replacement while collapsed.
- On Silaqui, the ordinary level-8 builder projection now carries 3,861 direct
  candidate decisions instead of 144,490, and three nested replacement
  decisions instead of 112,597. Warm evaluation fell to approximately 0.45
  seconds (about 2.7 seconds cold). A live future level-10 selection remained
  usable while reevaluating and settled end-to-end in 0.69 seconds; opening a
  feat-retraining editor populated its on-demand target choices, and all test
  edits were restored through undo/cancel. Exhaustive compatibility evaluation
  remains available and unchanged in shape; category-parser reuse also reduced
  its warm benchmark from about 1.5 to 1.2 seconds.
- Optional additions now have a complete reversible interaction. A newly
  revealed empty background slot can be removed; a completed extra background
  can be removed without touching the required primary slot; and completed
  ordinary retraining exposes the same accessible X action, which clears the exact
  replacement slot so the evaluator restores its source selection. Removal uses
  the ordinary optimistic save and undo transaction. Focused browser checks
  covered empty background and retraining cancellation plus the presence of
  removal actions on Silaqui; a public command regression covers completed
  background and retraining slots.
- The level workspace now uses one **Level X** heading, with no redundant
  current/choices labels. Required choices at or below the effective level use
  stable warning color and inset markers; completed choices use the established
  colored icons without repeating **Complete**, while future-plan choices remain
  visually neutral and do not increase unresolved counts. Optional backgrounds
  and retraining share a compact accessible X removal action.
- Legacy Build records are now optional one-shot starting presets rather than
  persistent level-1 selections. They use one dropdown plus Apply button, and
  the selected preset's authored description and structured suggestion list
  appear in the shared right-hand detail pane. Eligible presets fill only
  matching open legal choices in one undoable batch, leave existing work
  untouched, report the applied count or a no-match result immediately, and are
  omitted from the timeline and unresolved counts; imported Build occurrences
  remain preserved for exact compatibility. Focused tests cover suggestion
  parsing, multi-slot preset application, and evaluator completeness. A live
  full-profile test selected Hunter Ranger and applied 12 class-feature, feat,
  skill, and power choices to a fresh Ranger in one action.
- Incomplete current-level groups and their individual subsections now give the
  header a substantially stronger warning fill while leaving the choice contents
  on their ordinary surface background. A fresh-character browser check verified
  the treatment in the dark theme; future-plan groups remain neutral. The
  temporary test character was moved to the recoverable app trash afterward.
- Ordinary choice dropdowns now commit **Unresolved** through an exact-slot
  character command and optimistically clear the control and detail pane rather
  than snapping back to the prior selection. A live Silaqui check cleared Hunter
  Fighting Style, observed the saved unresolved state and header-only warning
  treatment after reevaluation, then restored Hunter Fighting Style through
  Undo.
- A live Silaqui check confirmed the level-8 heading is simply **Level 8**, the
  timeline reads **Feat · Archery Mastery**, and the progressive mastery flow
  still offers both **Twin Strike** and **Fading Strike** as replacement targets.
  The earlier level-1 at-wills remain present; domain and evaluator regressions
  separately enforce later-frame replacement overlays and retention of earlier
  choices when a later selector grants another use.
- A representative cross-character builder review found that the bundled
  level-3 Wizard Jim Darkmagic displayed two generic required **Power** choices
  even though his alternate Daily and Utility spellbook selections were saved.
  Recovered `D20RulesEngine.ParseAlternate` calls
  `FindProvider(provider, SelectName)` and replaces the element in that exact
  `spellbook` select slot. Evaluation now projects the preserved alternate
  envelope through the same provider/rule relationship, and editing upserts the
  alternate rather than creating an ordinary level child. Jim consequently
  moves from two unresolved choices/two errors to complete, legal, and zero
  diagnostics; the UI presents **Daily Spell** and **Utility Spell** beneath a
  distinct **Spellbook** group. Live testing changed the daily alternate,
  persisted it, undid it, and confirmed Freezing Cloud after reload.
- Continuing that review found false unresolved level-3/7 encounter slots on
  Japheth and Raidon. Both choose an already-known power again through Adroit
  Explorer's `existing="true"` Ambitious Effort feature. Native
  `CheckPrevious`/`AlreadyHas` evaluates duplication at the original choice's
  historical level, so the later extra-use occurrence must not erase it. The
  evaluator now preserves both occurrence identities while keeping one active
  definition membership. The same review found that level-13/15 `powerswap`
  gains were being checked against the displaced level-3/1 category; gain
  legality now uses the replacement rule's category, matching native
  `UpdateReplacement`. Japheth is consequently complete, legal, and diagnostic
  free; Raidon has no unresolved slots or category errors.
- The nine bundled heroes now have no unexplained required builder choices
  except Binwin's item-owned resistance choice, which remains assigned to the
  deferred equipment-pane work. Six evaluate complete/legal without
  diagnostics. Geran retains two explicitly serialized house-rule powers and
  unverified legacy feat prerequisites. Raidon retains three missing-definition
  diagnostics for two cached Monk class-feature records and one generated
  Focused Expertise variant absent from the installed pack, plus two unverified
  legacy feat prerequisites; the importer preserves that evidence rather than
  inventing rules for it.
- `nix develop path:. -c scripts/check.sh` passes 262 tests across 40 files,
  formatting, ESLint, all TypeScript projects, the production/PWA build,
  Chromium/Firefox Letter and A4 print artifacts, deterministic content checks,
  and the query benchmark.

This is a coherent prototype checkpoint, not M5.5 completion. Product-owner
closure of Inventory, Shop, Rituals & Practices, unavailable-option browsing,
and item-owned Equipment choices remains. The later milestone ownership for
sheet/play design, supported-client release checks, and comprehensive
accessibility certification is recorded in the roadmap and D054.

## M5 checkpoints

### Automated closure boundary and final security review

- Exact implemented compatibility families remain authoritative. Five
  identified native `SpecialCase` entities, absent-companion ability
  substitution, unknown prerequisite prose, and unparsed power expressions keep
  stable diagnostics; no cached field or selection is discarded to improve a
  percentage.
- Item-set and inherent-bonus rules are supported when imported or serialized
  content activates their ordinary rules. No available private character or
  settings artifact activates the recovered implicit campaign fallback, so M5
  does not synthesize one. A same-profile activation artifact is the required
  future differential.
- Public cross-tier fixtures plus full-profile Fighter, Psion, Shaman, Knight,
  Hybrid Cleric/Fighter, Hu, fixed-special, and companion-blocker audits cover
  the generic automated boundary. Unknown-revision caches remain diagnostics.
- The advertised-baseline extension adds one same-origin read boundary. Runtime
  configuration pins identity/digest; downloads and decoding are bounded and
  validated before IndexedDB storage, never auto-activate, and add no upload
  endpoint. Native creation, migration, evaluation, sheets, and regenerated
  export retain their prior trust boundaries. Bounded
  decoders, schema-validated workers/storage, text-only rendering, XML escaping,
  checksummed backup, atomic migration, CSP, and corpus-exclusion gates cover
  the completed behavior. Residual local-device access, weakened deployment
  headers, unsupported rules, and the manual legacy application remain
  documented operator/user risks.

### Seven-sample private compatibility correction pass

- A new ignored seven-character corpus exposed three importer/evaluator defects
  without changing the same-profile golden contract. Power damage contributions
  now deduplicate by serialized rule-contribution provenance, so one rule seen
  through overlapping implement/weapon channels applies once while distinct
  providers remain additive.
- Cached power variants now match evaluated loadouts by their serialized
  weapon/magic-item definition set when available. Unknown older records fall
  back to order-insensitive canonical display tokens; rendered name order is no
  longer treated as identity. Public synthetic differentials cover Dwarven
  Thrower, Luckblade, and Foe-Seeking ordering.
- Legacy race selections nested under a generated Grants subtree are recovered
  only when the parent race's category leaves exactly one matching descendant.
  Both observed private cases now have zero unresolved choices; ambiguous
  structures retain the ordinary required-choice diagnostic.
- Exact public power fixtures cover Howling Strike's combined `[W]` plus extra
  die, Knockdown Assault's ability-only damage, and Call of the Beast's deferred
  conditional damage. Follow-up recovered-code slices add qualified implement
  aliases, actual melee/ranged weapon-channel selection, power weapon-field
  bonuses, weapon-reach attack-branch selection, Rage Strike's literal output,
  versatile two-handed damage, and serialized two-hand slot keywords. Across
  the seven ignored samples, all seven evaluations converge and complete with
  zero unresolved choices; the expanded eight-character diagnostic is 536/537
  numeric aliases and 482/482 power fields with no unsupported power branches. These caches
  are not known-profile goldens. All eight regenerated edited exports pass
  semantic re-import.
- The hybrid surge discrepancy was a real evaluator gap: native `half-point`
  contributions carry a signed half within their target stat, combine before
  truncation, and truncate before linked stats consume the result. The observed
  hybrid's serialized `3` and `4` surge components therefore represent 3.5 and
  4.5 and correctly add the missing whole point; public synthetic tests also pin
  the lone-half link boundary and negative half direction.
- The two armor discrepancies were also evaluator gaps, not content drift.
  Recovered `EquipLoot` calls `EssentialsMagicArmor` after composing base armor
  with its enchantment. Its native heavy-armor table adds +1 to a non-masterwork
  base at enhancement +2, while leaving enhancement as a distinct typed bonus;
  this produces the serialized 7 and 8 Armor contributions from current bases 6
  and 7. Public fixtures pin the +2 adjustment and the nonzero-minimum masterwork
  bypass.
- The one remaining numeric cache difference is retained as internally
  inconsistent evidence: one feature cache omits the base bonus that both its
  own serialized description and dependent defense contribution retain. Three
  older skill-power selections in ordinary level utility slots also remain
  `choice.ineligible`: the current exact pack exposes skill-power substitution
  through a separate feat selection, and the recovered native category matcher
  does not authorize bypassing the level rule's class category. No cache total
  or legality diagnostic was suppressed to improve the aggregate.

### Companion ability provenance guard

- Recovered power parsing treats `beast's <ability> modifier` as the selected
  companion's score, not the character's same-named score. Until companion
  occurrences and their stat blocks are connected to power evaluation, these
  clauses are removed from ordinary character-ability math and reported as
  `companion-ability:<power-id>`.
- A public synthetic fixture prevents the prior silent substitution. An ignored
  full-profile level-9 audit selected the corresponding beast power through a
  complete, legal workflow, but did not materialize its requested companion;
  that run is blocker reproduction, not companion parity evidence.
- No local character or settings artifact activates the recovered inherent-bonus
  entity, so inherent fallback behavior remains unimplemented rather than being
  inferred from the entity alone.

### Fixed-output native power special cases

- Power math now ports the recovered early-return behavior for `Bond of
Censure`: its conditional movement prose yields `1d10`, or `2d10` at level
  21, without incorrectly adding the mentioned Intelligence modifier. Ordinary
  implement enhancement still applies after that native branch.
- Three recovered hit-text branches now retain their fixed `ongoing 10` output:
  the exact Brilliant Beacon radiant line, Baleful Gaze of the Basilisk's
  stunned/poison line, and Contagion's longer failed-save line.
- Public same-profile fixtures cover heroic/epic Bond output, +1 implement
  enhancement, and all three ongoing forms. Other recovered `SpecialCase`
  strings remain explicitly tagged `native-special-case:<power-id>` rather than
  receiving guessed math.
- The ignored supplied Hu level-8 exact-profile comparison improved from 49/52
  to 52/52 cached power fields while retaining 72/72 numeric aliases. Its two
  legality diagnostics are unchanged. The unrelated nine-character historical
  matrix remains 501/509 aliases and 277/371 power fields with 67 conditional
  variants; those unknown-revision caches remain diagnostics, not goldens.
- A follow-up exact-pack inventory identified six remaining native branches.
  The level-5 Dexterity ongoing branch has a reproducible, zero-diagnostic
  native selection path and now produces `ongoing 10+<Dexterity modifier>`.
  The other five identified entities remain unsupported pending equivalent
  exact-profile selection or character evidence.

### Conditional striker power projections

- The renderer-neutral power model now separates conditional damage from the
  ordinary hit total. The recovered `Hunter's Quarry`, `Warlock's Curse`, and
  `Sneak Attack` class-feature IDs use evaluated tier-scaled dice, optional flat
  bonuses, and rule-generated die-size text overrides with named cadence and
  provenance.
- Hybrid quarry, curse, and sneak-attack IDs apply only to powers from their
  Ranger, Warlock, or Rogue class category. Sneak Attack additionally checks the
  recovered crossbow/light-blade/shortbow/sling weapon families. Unknown class
  feature variants carrying those names remain visible in `unsupported` rather
  than receiving guessed behavior.
- Exact public fixtures require epic `3d8+2` quarry damage to stay outside the
  ordinary `1d8` hit, verify hybrid class-power exclusion, enforce Sneak Attack
  weapon eligibility, and retain an unknown-variant diagnostic. Evaluated
  textstring rules now feed power math, so content-authored die overrides are
  authoritative rather than limited to imported text input. Edited 0.07a export
  regenerates these expressions in each weapon variant's `Conditions` cache.
- The ignored historical matrix remains 501/509 numeric aliases and 277/371
  cached power fields. Its new diagnostic-only projection records 67 conditional
  variants: 48 Hunter's Quarry and 19 Warlock's Curse. This is regression and
  plausibility evidence, not same-profile parity.

### Explicit hand pairing and dual-implement selection

- Power evaluation now consumes the durable `_INTERNAL_MainHandWeapon` value,
  identifies the selected equipped main hand and a distinct equipped off hand,
  and exposes both roles and the paired equipment name on calculated variants.
  Alternate legal variants remain present, matching the legacy `PowerStats`
  boundary rather than treating current hand selection as inventory deletion.
- The recovered `Dual Implement Spellcaster` native exception recognizes the
  exact feat ID or name. For implement powers, only the selected main-hand
  variant receives the distinct off-hand implement's enhancement as an
  explainable damage component. An ambiguous multi-off-hand state adds no bonus
  rather than inventing a pairing. Swapping unequal +3/+2 implements in the public
  same-profile differential swaps attack enhancement and off-hand damage bonus
  exactly; an off-hand-only weapon fixture also proves stable explicit pairing.
- The ignored nine-character historical matrix remains 501/509 comparable
  numeric aliases and 277/371 cached power fields after the change. Those
  unknown-revision caches are regression diagnostics, not goldens. The native
  `SpecialCase` and situational striker/conditional tails use the later explicit
  diagnostic boundary.

### First-class native character creation

- The Characters route can create a profile-bound native record without an
  imported `.dnd4e`. Creation requires the active pack's canonical
  `ID_INTERNAL_LEVEL_1`, pins its ID and digest, persists six base ability inputs
  of 10, and enters the existing rules-worker editor.
- Required Race, Class, Feat, and generated nested choices are supplied by the
  level/content rules and use the same generic durable choice commands as
  imported builds. The editor's shared canonical-level constructor advances the
  same build through level 30.
- Native records carry a minimal 0.07a compatibility envelope explicitly marked
  as native. Their `.dnd4e` compatibility export uses the same regenerated 0.07a
  path as imported records; native `.4ecb` and sheet PDF are also available.
  Root-level authoritative ability input is written separately from the derived
  sheet cache so a rule-derived bonus cannot become a compounded base score
  after re-import.
- The public synthetic profile now includes level 1, Class, Race, Feat, and
  nested Race Ability Bonus candidates. Unit/integration smoke coverage resolves
  all required identity choices, advances level 1 through 30, rejects missing
  canonical levels/inexact profiles/unsafe names, and round-trips a native build
  whose base Dexterity 10 evaluates to 12.

Live production-browser verification on 2026-09-01 imported and activated the
seven-record public profile, created a native character, displayed the required
generic choices, resolved Race/Class/Feat and nested ability choice to a
complete legal build, reloaded with every selection persisted, exposed only the
edited export target, and passed its semantic re-import gate without console
warnings or errors. This closes the old-application dependency for starting a
character; the remaining M4 compatibility and legacy-application matrices still
blocked complete M5 closure at this checkpoint. D063 later removed the formal
accessibility-certification program; continuous safeguards do not block this
functional milestone.
The complete public gate passes 143 tests across 30 files plus formatting,
ESLint, every TypeScript project, the production/PWA build, Chromium/Firefox
print artifacts, deterministic content checks, and the query benchmark.

### Full-profile native advancement audit

- `pnpm audit:native-workflow PACK.4ecp [--max-level=N]
[PREFERRED_DEFINITION_ID ...]` builds a native record from an exact private
  pack, resolves prerequisite-aware candidates deterministically, advances
  through canonical levels, follows ordinary and power-swap retraining, equips
  an item, JSON-decodes the saved record, constructs the authoritative sheet,
  and requires edited `.dnd4e` semantic re-import parity. Private content and
  output remain ignored evidence. Its JSON report repeats `maxLevel` and every
  preferred definition ID so results remain reproducible independently of
  terminal history.
- The audit exposed and closed generic durability defects: out-of-order
  sibling choices no longer create sparse arrays; generated choices can
  materialize through arbitrarily nested grant ancestors; a provider cannot
  select itself recursively; and active replacement chains satisfy every prior
  select/replacement slot while later retraining targets only the active chain.
  Level-qualified replacements use the rule's effective level even when their
  provider was granted at level 1. Primary-class grant ancestry extends
  `CountsAsClass` aliases for Essentials choices, Hybrid Class `_BaseClass`
  aliases feed both `$$CLASS` and `$$HYBRID`, and repeated multi-slot choices
  exclude already selected siblings.
- Durable nested occurrences use the enclosing legacy level while projection
  propagates the effective grant/select level through descendants. This retains
  correct advancement timing and makes edited legacy XML semantic re-import
  exact for later choices nested beneath a level-1 class. The audit resolves
  dependency-ready choices before temporarily blocked parent-level slots.
- On 2026-09-01, an explicit Human/Fighter path against the 38,339-record local
  profile reached level 30 complete at every level, resolved 63 choices and 8
  retrainings, retained all 8 replacement targets, equipped one item, survived
  domain serialization, produced an authoritative sheet with 20 cards plus one
  item card, and passed regenerated 0.07a semantic re-import. Bracketed
  definition prerequisites such as `Blood Thirst [Multiclass Vampire] feat`
  are now verified by typed name, and prerequisite-aware retraining avoids an
  illegal custom power. The rerun is complete and legal with zero diagnostics.
  This is one real-profile workflow, not evidence that every class/build family
  passes M5 criterion 2.
- The same 38,339-record profile now has additional deterministic family
  evidence. Human/Psion reaches level 30 complete and legal with 63 choices,
  nine retrainings, zero diagnostics, and exact persistence/sheet/export gates.
  Human/Shaman reaches level 30 complete and legal with 61 choices, eight
  retrainings, and zero diagnostics after the same prerequisite-aware candidate
  policy. Human/Knight reaches level 30 complete and legal with 50 choices and
  zero diagnostics, exercising the Essentials class-alias and nested
  future-grant paths. A Hybrid shell with two distinct imported component
  classes historically reached level 30 complete with 68 resolved choices,
  eight intact retraining links, and two preserved unverified prerequisites,
  but that report did not retain its preferred component IDs and cannot be
  reproduced exactly. A newly recorded Hybrid Cleric/Fighter request reaches
  level 30 complete and legal with 65 resolved choices, eight intact
  retrainings, and zero diagnostics. Broader class/build sampling remains useful
  future evidence rather than an allowlist requirement.

### Profile migration preview and explicit adoption

- A character's pinned profile can no longer be changed by an ordinary library
  metadata save. Changing or accepting a content revision requires a separate
  preview and explicit adoption action.
- Preview evaluation runs in the rules worker. It checks every definition ID
  referenced by authoritative level history, grabbag, alternates, and inventory;
  compares referenced definitions when the exact source pack is installed; and
  reports calculated stat, power, completeness, legality, convergence, and
  diagnostic changes.
- A stored source digest is checked before treating an installed pack as the
  source revision. If that exact revision is unavailable, the UI says so and
  reports target-only compatibility evidence rather than fabricating a delta.
- Missing or illegal target content remains visible and adoptable when the
  evaluator converges, preserving the project's editable-invalid-state policy.
  Nonconvergent target evaluation blocks adoption.

Verification on 2026-08-31 used the project-local Nix environment: two focused
profile-migration tests, affected TypeScript projects, and affected ESLint files
passed. A live browser run installed and activated a public synthetic pack,
imported the public `.dnd4e` structural fixture, previewed its four missing
definition references, and explicitly adopted the profile with no console
warnings or errors. The full public suite is rerun before the checkpoint commit.

### Storage persistence, migration recovery, and verified backup

- New native backups are format version 2. Their manifest records the character
  count and a SHA-256 digest over the complete ordered character payload. Restore
  rejects a changed payload or count before opening a write transaction.
- Every restored record also passes the character-domain decoder, including
  required metadata, snapshot arrays and scalar maps, sheet settings, nested
  authoritative occurrences, inventory quantities, alternates, and build
  bounds. A self-checksummed payload cannot use the integrity field to bypass
  structural validation.
- Backup selection now performs a non-mutating preview first. It reports format
  version, checksum availability, active/trashed counts, and IDs that will
  replace existing records; restore requires a separate explicit action. Legacy
  version-1 backups remain structurally validated and are clearly labeled as
  unchecksummed.
- IndexedDB schema 3 adds a character migration journal. Lazy schema-1 migration
  writes the untouched prior record before conversion and removes the journal
  only in the same transaction that commits schema 2. Startup recovery restores
  a journaled prior record if an interrupted migration left the character
  missing, then restarts the ordinary migration.
- A reconstruction test saves native metadata, exact profile binding, and every
  sheet preference, discards the repository instance, and requires a newly
  constructed repository over the same database to return the complete record.
  An application-upgrade fixture creates the historical database version 2 with
  a schema-1 character, legacy object-form pack, and active-profile setting. The
  current repositories upgrade it to database version 3, migrate the character,
  preserve and read the pack and setting, create the journal store, and leave no
  stale journal entry.
- Content settings display the browser's current persistence decision, storage
  use, quota, and percentage used. A user-triggered action requests persistent
  storage where the API is supported and explains a denied request without
  treating it as durable-backup success.

Focused browser-storage tests cover checksummed round trip, tamper rejection, a
self-checksummed malformed schema-2 record, legacy backup inspection, repository
reconstruction, historical application upgrade, and a simulated interrupted
migration recovery. Live
browser verification displayed the persistence/quota facts against the public
synthetic profile; backup export reported one complete record. The automated
restart, application-upgrade, restore, and interrupted-migration matrix covers
the four durability cases in M5 exit criterion 5. D063 later removed the formal
accessibility traversal program while retaining continuous safeguards. The original
checkpoint public suite passed 98 tests
across 23 files plus formatting, ESLint, every TypeScript project, the
production/PWA build, deterministic content checks, and the query benchmark.
After adding the comprehensive domain decoder and crafted self-checksummed
malformed-record fixture, that public suite passed 100 tests. The current full
M5 public gate, including the durability matrix, passes 119 tests across 26
files.

### Installable PWA and public Docker boundary

- The production PWA presents explicit first-offline readiness, offline state,
  deferred update, and browser installation controls. Updates never silently
  reload the editor; the user chooses when to activate a waiting worker.
- Every application route carries the unofficial-product, local-data, and
  no-official-corpus notice. `NOTICE.md` establishes the repository, hosted
  build, CI, and image distribution boundary without treating it as legal
  advice.
- The production image serves immutable application assets from `/app/static`
  while keeping the reserved `/app/runtime-config.json` separately replaceable,
  outside the service-worker precache, and network-only. The application does
  not yet consume its fields. The image runs as the upstream unprivileged nginx
  user with a read-only root filesystem and a bounded writable `/tmp` in the
  documented invocation.
- The public suite now requires a standalone web manifest, service worker,
  runtime configuration, a generated-worker assertion that the configuration is
  network-only rather than precached, and absence of `.4ecp` and `.dnd4e`
  artifacts from the production web build. The deployment guide documents
  HTTPS, reverse-proxy caching, health checks, update behavior, and the
  browser-local backup boundary.

Verification on 2026-08-31 used a production build in the project-local Nix
environment and a live Chromium browser. The installed service worker announced
offline readiness, restored the application after the preview server was fully
stopped, detected a rebuilt release, offered **Reload and update** and **Later**,
and deferred without console warnings or errors. The production Docker image
built successfully, returned `ok` from `/healthz`, served the external runtime
configuration, contained its service worker, manifest, and notice, and contained
no `.4ecp` or `.dnd4e` artifacts. It passed the same checks while running
read-only with a bounded temporary filesystem. Core security review remains an
M5 concern; supported-client performance belongs to M9. D063 later removed the
formal accessibility matrix. The checkpoint public suite passes 102 tests across 24 files plus
formatting, ESLint, every TypeScript project, the production/PWA build,
deterministic content checks, and the query benchmark.

### Explicit original and edited `.dnd4e` export targets

- The library exposes two non-ambiguous targets. **Original imported file (no
  edits)** keeps the byte-exact M3 envelope path; **Legacy Character Builder
  0.07a** serializes current authoritative state and regenerated caches.
- Edited export requires a converged evaluation from the exact adopted content
  pack digest and the latest saved level. It writes fresh document-local
  occurrence tokens, repairs replacement links when their target remains
  representable, escapes XML content, and regenerates details, abilities, stats,
  selected-rule and loot tallies, and power calculations.
- Level history, grabbag, inventory, alternates, and text values come from the
  build. Opaque campaign and unknown root blocks remain byte-exact; companion
  journal, and unknown sheet blocks are carried into the regenerated sheet.
- Every edited download is re-imported first and compared with the build while
  ignoring regenerated local IDs. A difference in levels, choices, replacement
  topology, inventory, alternates, abilities, or text blocks the download.

Public structural fixtures cover edited ability/text/inventory state, XML
escaping, preserved opaque data, fresh tokens, repaired replacements,
regenerated sheet caches, semantic re-import, and the latest-level guard. These
checks establish the writer boundary but do not substitute for opening a
curated exported corpus in the original Windows application. M5 exit criterion
4 remains open until that launch matrix is recorded. The complete public gate
passes 108 tests across 24 files plus formatting, ESLint, every TypeScript
project, the production/PWA build and cache-boundary assertion, deterministic
content checks, and the query benchmark. A live Chromium run selected and
downloaded both targets against the public synthetic character: edited export
reported a passed semantic re-import, original export explicitly reported that
local edits were excluded, and the final post-fix flows added no console errors.

The original-application boundary now has a repeatable candidate builder and
an exact recovered launch contract in `docs/legacy-builder-launch-matrix.md`.
The 2026-09-01 candidate set includes a public custom-content diagnostic, an
ignored exact-profile imported level-8 character, and an ignored native
exact-profile level-1 character. All three pass edited-export semantic
re-import; the native case is complete, legal, converged, and diagnostic-free.
This host could not execute the Windows matrix because neither project Nix
shell contains Wine/Xvfb, no project-local prefix or offline Microsoft .NET
Framework runtime exists, and no Wine package is already available in the Nix
store. No original-application pass is claimed; M5 exit criterion 4 remains
open pending observed UI results on a prepared compatibility host.

### Authoritative browser sheet with recoverable fallback

- `sheet-model` now projects a converged `EvaluatedCharacter` into identity,
  current ability/stat sections, selected feature groups, aggregated inventory,
  item cards, and every evaluated power/equipment variant. Field overlays and
  current content prose feed the cards. The visible equipment summary and cards
  both come from that model, including edited quantity and equipped state; the
  legacy snapshot remains a separate fallback input.
- The sheet evaluates in the rules worker only when the installed pack ID and
  digest match the character binding. Worker initialization repeats the digest
  assertion so a same-ID pack replacement cannot be evaluated after an earlier
  UI check.
- Missing or mismatched content, nonconvergence, and worker errors retain the
  imported sheet cache with an explicit warning. Sparse preserved characters do
  not gain fabricated zero-valued abilities.
- The existing Letter/A4, blank-hit-point, monochrome, power-card, item-card,
  and browser-print controls now operate on the authoritative model when that
  model is available. Supported-browser pagination goldens remain open.

Focused tests cover current engine stats over stale cached values, identity
updates, evaluated weapon variants, authoritative equipment quantities and
equipped state, inventory cards,
nonconvergence rejection, sparse-value preservation, and exact revision gating.
A live Chromium run opened the public synthetic character against its exact
bound digest, displayed the authoritative evaluation state and regenerated
inventory, omitted unknown abilities instead of showing zeroes, and produced no
console warnings or errors. The full public-suite result is recorded with the
checkpoint commit: 105 tests across 24 files plus formatting, ESLint, every
TypeScript project, the production/PWA build and cache-boundary assertion,
deterministic content checks, and the query benchmark.

### Data-directory and portable-pack onboarding

- Content settings accepts portable `.4ecp` files and decrypted/merged
  `.dnd40.xml` through the ordinary file input. Rules XML is compiled with the
  production parser/content-pack builder in a worker, compressed, validated, and
  committed only after validation succeeds.
- Browsers with the File System Access API expose a read-only directory picker.
  Discovery examines names only, stops after four nested levels or 2,000
  entries, and offers supported candidates for a separate install action.
  Handles are kept only in component memory.
- Browsers without that progressive API receive an explicit Firefox/Safari-safe
  fallback message and use the ordinary file picker for the same formats.
- The UI documents that encrypted containers and loose `.part` files must be
  processed with the local Nix content tool. The public app does not retain
  decryption keys or interpret legacy update metadata.
- Pack input and decompressed output have separate 128 MiB checks. Gzip output is
  consumed incrementally and cancelled before JSON parsing when it crosses the
  decoded cap, preventing a small compressed pack from expanding without bound.
- Local profile IDs are limited to 64 safe ASCII identifier characters, and
  display names to 120 trimmed, control-free characters. The checks run before
  worker creation; generated packs enforce them again, and encoded portable
  packs are decoded and revalidated inside the storage repository before commit.

Public tests cover source classification, bounded read-only discovery without
opening candidate files, deterministic browser-side compilation of the
synthetic rules XML, compressed pack decode, and digest equality. Live Chromium
rendering confirms the directory control and labeled ordinary-file fallback;
the actual OS directory chooser remains a user-mediated system surface. The
onboarding page produced no Chromium console errors. The complete public gate
passes 117 tests across 26 files plus formatting, ESLint, every TypeScript
project, the production/PWA build and cache-boundary assertion, deterministic
content checks, and the query benchmark. Adversarial cases additionally cover a
small gzip expanding past the decoded limit, an oversized encoded input,
oversized generated output, unsafe/oversized profile identifiers, control
characters, and storage-boundary revalidation.

### Public import and rendering security pass

- Portable-pack decoding now validates the complete nested normalized domain
  before digest checking or IndexedDB storage. Manifest counts, entities,
  attributes, specific fields, rule statements and children, extensions,
  preserved/rejected nodes, diagnostics, and provenance are all required.
- Packs are limited to 100,000 accepted or rejected records and preserved XML
  nodes to 100 levels of nesting in addition to the independent encoded and
  decoded byte limits. The complete known private corpus remains below both
  record and byte ceilings.
- Hosted HTML carries a same-origin CSP. The reference nginx image applies that
  policy with frame denial, no-sniff, no-referrer, same-origin opener/resource,
  and least-privilege browser-feature headers to health, configuration, asset,
  and application routes. A public test also prevents executable-markup sinks
  from entering the React application source.

Focused adversarial tests reject an incomplete nested rule and a preserved node
beyond the depth ceiling before validation/storage. A production build loaded
under the HTML policy in live Chromium, installed its service worker, reported
offline readiness, rendered content onboarding, and produced no console warning
or error. The rebuilt image ran with a read-only root and bounded temporary
filesystem; application, immutable-asset, runtime-configuration, and health
routes all returned the required security policy while retaining their distinct
cache behavior. The complete public gate passes 123 tests across 27 files. This
checkpoint is a structural and security baseline, not a formal accessibility
certification; D063 removes such a program from the roadmap.

### Structural accessibility and responsive-shell baseline

- Hash-route changes now move focus to the new `main` landmark while preserving
  the browser's ordinary initial focus. The focus helper has missing-landmark and
  successful-handoff tests.
- The 720 px body minimum was removed. At tablet/narrow breakpoints the header,
  navigation, compendium workspace, library/editor forms, sheet columns/cards,
  and fact grids wrap or stack; fixed three-column card rules remain scoped to
  print.
- A palette contract checks every normal-size shell/status/action/power/item
  foreground/background pair at the WCAG AA 4.5:1 threshold. The item-card
  orange was darkened because its prior white-text contrast did not pass.
- The durable checklist distinguishes this low-cost structural baseline from
  M9's lightweight browser/visual-print hardening. D063 later removed the formal
  keyboard/screen-reader/zoom/touch certification matrix.

Live production Chromium found one `h1`, one `main`, no duplicate IDs, and no
unnamed native interactive controls on the top-level empty-state Settings,
Characters, and Compendium routes. Clicking between routes placed focus on the
new `main` with `tabIndex=-1`; the fresh initial load kept body focus and the
updated shell had no forced minimum width or console warnings/errors. The full
public gate passes 127 tests across 29 files. D063 later removed formal
keyboard-only and assistive-technology certification; lightweight browser and
visual-print validation belongs to M9.

### Chromium and Firefox Letter/A4 functional PDF regression gate

- Chromium 152, Firefox 154, geckodriver 0.37, and Poppler are pinned in the
  project-local Nix shell. The public gate starts the production preview and
  ephemeral headless browser profiles, seeds a synthetic schema-2 character,
  and prints the real sheet route through Chromium's debugging protocol and the
  standard Firefox WebDriver print command.
- The fixture contains 18 powers with alternating long/short prose, six item
  cards, features, skills, equipment, and blank hit points. Four variants cover
  Letter/A4 crossed with color/monochrome.
- Each browser/variant combination produces a five-page PDF. Every page—not just
  the first—measures 612 × 792 points for Letter or approximately 595 × 842 for
  A4. Extracted text contains both section headings and the first/last power and
  item, while the mutable hit-point value and application chrome are absent. All
  24 cards report no DOM overflow, and monochrome variants compute white headers
  with black text. Chromium output is tagged; Firefox 154 output is explicitly
  recorded as untagged.
- Firefox ignores the named-page switch when a global Letter page is present.
  The character sheet therefore installs a same-origin global print stylesheet
  for the persisted Letter/A4 choice; named pages remain a progressive
  enhancement. Both engines now honor the selected paper size.

The harness deletes its browser profile and PDFs and uses only public synthetic
data. `scripts/check.sh` includes this real-browser print gate after the
production build. It closes M5's functional Letter/A4 boundary. Safari/device
execution and cross-engine raster inspection are M9 visual-validation work.

### User and recovery documentation

The maintained user guide now covers hosted/PWA and reference-Docker
installation, project-local private pack construction, bounded content and
character import, storage persistence, exact-revision profile migration, both
compatibility export targets, sheet/PDF controls, checksummed backup inspection
and restore, application updates, offline and migration recovery, destructive
actions, and troubleshooting. It also names the current blank-character,
compatibility, legacy-launch, current browser evidence, deferred M9/M10
validation, Firefox tagging, and reserved-runtime-configuration limitations.
This closes the documentation boundary in M5 exit criterion 10; it does not
claim that the later supported-client or accessibility matrices have run.

## M4 delivered

- `rules-engine` parses every rule opcode and attribute found in the 38,339
  entity private corpus: 54,012 statements audit with no unknown opcode,
  attribute, or unexplained required field.
- Fixed-point grants and choices, category expressions, stat modifiers and
  aliases, text updates, field overlays, equipped-item predicates, structured
  prerequisites, provenance, and editable incomplete/illegal states.
- Schema-2 records with an authoritative level-tree build, stable occurrence
  IDs, retained retraining links, base abilities, inventory, text values, and a
  lazy migration from the M3 read-only record.
- Transactional commands with undo/redo for abilities, effective level, level
  frames, choices, retraining, inventory, and text values.
- A desktop/tablet character editor for abilities, advancement, choices,
  materialized nested grants, focused retraining/replacements, inventory
  quantities/equipment, history, and engine diagnostics.
- A private-corpus audit and a supplied-character parity reporter, kept outside
  the distributable public fixtures.
- A renderer-neutral power result model with explicit equipment variants,
  attack/damage components, ordinary weapon and implement math, level-scaled
  hit lines, chosen abilities, enhancement/proficiency, weapon-group and
  implement-category bonuses, primary attacks, and effect-only calculations.
- Legacy alternates/spellbooks participate in ownership and power evaluation;
  serialized grants suppress duplicate fixed-point grants. Equipment projection
  recognizes weapon groups, magic implements, dual-use staves, and mundane holy
  symbols in the forms used by the corpus.
- Psionic parents materialize their augment-version records; heavy-thrown and
  weapon-as-implement calculations, multiple ability modifiers, ongoing damage,
  high-crit/brutal metadata, and recovery effects broaden the power model.
- Observed compound equipment selectors and common published prerequisite prose
  are evaluated, with unknown prose explicitly reported as unverified.
- Full-pack evaluation runs in a dedicated browser worker, preserving a
  responsive editor and one engine-owned calculation boundary.
- A distributable three-character golden matrix spans heroic, paragon, and epic
  play; martial, psionic, and primal sources; dual weapons and implements;
  companions, custom content, advancement, and retraining.

## M4 verification record

On 2026-08-31, the supplied level-8 character converged in one fixed-point
iteration and matched all 72 comparable cached numeric aliases. Its only
remaining legality findings are its explicit house-rule selection and one
custom feat prerequisite the imported content cannot prove. The public suite
also matches all 52 comparable cached attack/damage fields across its power
variants. The bundled nine-character cross-profile diagnostic matrix matches
513/514 numeric aliases and 331/371 cached power fields. The remaining sample
differences are concentrated in historical content revisions, removed internal
definitions, hand-specific calculations, and named native power exceptions.
The public suite passes 91 tests plus formatting, ESLint, all TypeScript
projects, the production/PWA build, deterministic content checks, and the query
benchmark. Live browser verification loaded the 38,339-record profile in the
rules worker, completed evaluation, persisted an edit, and restored it through
undo. See [m4-compatibility-ledger.md](m4-compatibility-ledger.md) for the M4
acceptance boundary and exact M5 blocker inventory.

## M3 delivered

- `character-domain`, `legacy-dnd4e`, and `sheet-model` packages separating the
  versioned durable record, compatibility adapter, and semantic rendering model.
- A SAX-based `.dnd4e` importer that extracts details, final cached stats,
  selections, level count, text strings, inventory, powers, and weapon
  calculations without dropping the source envelope.
- Exact legacy-envelope export and an export/re-import preservation diff. No-edit
  exports keep comments, whitespace, order, unknown attributes/elements, and
  opaque link tokens unchanged.
- IndexedDB schema v2 with character list/get/put, metadata and content-profile
  binding, sheet preferences, duplication, recoverable trash, permanent purge,
  and full native JSON backup/restore.
- An accessible local character library with `.dnd4e` import reports, explicit
  missing-profile state and rebinding, metadata editing, backup/restore, and
  checked legacy export.
- A browser sheet with summary sections, familiar usage-colored power/item
  cards, bound-content enrichment, cached-value warnings, blank hit points,
  Letter/A4 selection, monochrome mode, card inclusion switches, and browser
  print/save-to-PDF entry point.

## M3 verification record

On 2026-08-31:

- formatting, ESLint, all TypeScript projects, 35 unit/integration tests, and the
  production Vite/PWA build passed;
- the supplied private level-8 character imported as Hu Sheng-ming with 8 level
  records, 185 selected rules, 21 powers, 24 carried/equipped loot entries, and
  113 cached stat aliases; exact export/re-import comparison found no differing
  character;
- the live browser exercised file import, IndexedDB persistence, the structured
  import report, library navigation, final ability/defense/skill values, all 45
  power and item cards, and a reload after changing A4 plus blank-HP settings;
- rendered card geometry formed three stable columns and reported zero
  horizontal or vertical overflow for all 45 cards at the tested desktop
  viewport; print CSS uses explicit Letter/A4 page rules, three-column grids,
  and `break-inside: avoid` for sections and cards; and
- the seven-page legacy-generated Letter PDF was rendered and visually inspected
  as the reference for section hierarchy, usage colors, and three-by-three card
  density. The modern sheet intentionally omits legacy ornamental chrome.

The private character and reference PDF remain ignored local evidence. Public
tests use only synthetic XML. See
[character-import-and-sheets.md](character-import-and-sheets.md) for the storage,
compatibility, and known-limitations contract.

## M2 delivered

- A versioned serializable query AST and dependency-free `query-engine` package
  with Unicode tokenization, quoted phrases, relevance, include/exclude facets,
  numeric ranges, stable sorting/paging, self-excluding facet counts, and
  bidirectional stable-ID relationships.
- A dedicated worker that loads the active immutable pack from IndexedDB,
  constructs the index away from React, services typed query/detail requests,
  and is safely terminated on cancellation or profile/page changes.
- Cross-type search and explicit pages for powers, feats, magic items, weapons,
  armor, gear, races, classes, paths, destinies, backgrounds, themes, and
  rituals, plus searchable values for every typed facet.
- Fragment-addressed queries and entity details, browser-local named saved
  searches, accessible include/exclude controls, level ranges, sort controls,
  result/empty/loading/error states, and stable pagination.
- Compact IndexedDB pack storage using verified encoded `.4ecp` bytes with
  transparent reads of older M1 object-form installations.
- A reproducible full-pack benchmark with enforced index, broad-query, and
  representative-query budgets.

## M2 verification record

On 2026-08-31:

- formatting, ESLint, all TypeScript projects, 24 unit/integration tests, the
  production Vite/PWA build, and the synthetic public suite passed;
- every full-corpus benchmark stayed within budget: approximately 4,978 ms
  index construction, 456 ms unfiltered, and 0.4-80 ms representative queries;
- the browser exercised full text, exact fragment restoration, entity-type and
  level filters, source exclusion, named saved-query persistence, stable detail
  URLs, ID-resolved outbound relationships, and worker reconstruction after
  reload against all 38,339 private records;
- the unprivileged production Docker PWA imported and activated the private
  pack; after its server was stopped completely, an offline reload restored the
  application and returned all 38,339 IndexedDB-backed records.

The query contract and budgets are maintained in
[query-engine.md](query-engine.md). The public suite builds and benchmarks only
synthetic content; `pnpm benchmark:query tmp/content/full-local.4ecp` exercises a
private local pack.

## M1 delivered

- A pnpm/TypeScript monorepo and project-local Nix toolchain with pinned lock
  files, formatting, linting, type checking, unit tests, production build, and
  public CI.
- `content-domain`, `legacy-wotc`, and `content-pack` packages with streaming
  `D20Rules` parsing, normalized records, preservation of unknown data,
  diagnostics, total record accounting, deterministic serialization, digest
  validation, summaries, and pack diffs.
- A command-line content tool with `build`, `inspect`, `validate`, and `diff`.
- A typed IndexedDB repository supporting verified install, collision rejection,
  list/get, activate/deactivate, and removal without touching future user data.
- A minimal React/Vite PWA shell with a typed import worker, gzip decoding,
  validation, progress, cancellation, error containment, local persistence,
  pack lifecycle controls, and a deliberately basic record inspector.
- Unprivileged development and production Docker targets with a production
  health check and SPA/offline asset serving.
- Synthetic distributable XML for public tests plus a private-corpus script that
  reproduces CBLoader's ordered merge with the verified reference merger before
  building a pack.

## Verification record

On 2026-08-31 the following passed in the root Nix environment:

- formatting, ESLint, TypeScript checks, 10 unit tests, Vite production build,
  and PWA service-worker generation;
- two independent synthetic builds compared byte-for-byte, followed by pack
  validation and a zero-change semantic diff;
- the reverse-engineering smoke suite, including schemas, sample characters,
  campaign XML, decryption/hash evidence, and merge semantics;
- the supplied full private merged corpus: 38,339 accepted records, zero
  rejected records, 41 explicit missing-source warnings, zero unaccounted raw
  top-level records, and a valid approximately 5.6 MiB compressed pack;
- browser import of both synthetic and full packs, activation, filtering,
  normalized detail rendering, IndexedDB persistence, and no console errors.

The public CI and repository do not require or contain the private corpus. Run
`nix develop path:. --command bash scripts/check.sh` for the public suite. With
the supplied ignored legacy files present, run `nix develop path:. --command
bash scripts/build-private-content.sh` for the ordered full-corpus path. Do not
feed a previously merged/decrypted CBLoader snapshot back through the parts
merger; begin from `combined.dnd40.original.xml` as the script does.

## Deferred by design

- M5 owns the explicitly recorded native exception blockers, regenerated
  `.dnd4e` snapshots, exhaustive cross-browser print goldens, profile adoption,
  and MVP parity closure.
- M5.8 owns desktop/tablet play state, M6 adapts it to phones, and M7 owns
  encrypted relay-linked sessions.
- Visual theming, animation, and fine interaction polish wait for the tighter
  user feedback loop requested for later UI work.

## Theme detail-card checkpoint (2026-09-16)

- Theme-granted powers are listed directly in ascending level order without
  per-level wrapper panes. Each power's one-line header shows its action symbol,
  name, lowercase authored attack/range type, usage and level, followed by the
  disclosure chevron. The whole header is its keyboard-operable expand/collapse
  control, and every card starts expanded.
- Collapsed power cards contain only their header and outer border. Theme
  descriptions initially show their first authored paragraph with accessible
  More…/Less… controls.
- Source is suppressed from ordinary facts and specifics, then shown as subdued
  text at the bottom of candidate, granted, power, and equipment detail cards.

The product owner verified the complete interaction and presentation live.
Focused verification passed 52 tests covering theme descriptions, action icons,
and detail-card structure.

## Historical loadout shop-shortcut checkpoint (2026-09-16; superseded 2026-09-18)

- At this checkpoint, Loadout slots offered shop shortcuts that switched to the
  Shop tab, populated the existing Slot dropdown, reset pagination, and left
  filtering, counts, and paging in the ordinary query path. Ring positions
  shared `Ring`; hand positions used the nearest distinct authored values.
- `Holy Symbol` follows the recovered legacy shop category: magic records
  contribute it from `Magic Item Type`, while the mundane `Gear` record is
  included by the legacy exact-name exception. Holy symbols retain their
  physical `Off-hand` facet too. Ki Focus and Tattoo already use authored
  `Item Slot` values.

The product owner verified those shortcuts, existing-filter integration,
pagination, and Holy Symbol results live at that checkpoint. D053 subsequently
removed the per-slot buttons; the current Loadout leaves shopping to the Shop
tab. All 308 public tests, formatting, lint, TypeScript checks, and whitespace
checks passed at the historical checkpoint.

## Shop text-search submission checkpoint (2026-09-17)

- Shop text entry is held as a draft and reaches the existing catalog query only
  when its accessible form is submitted. Enter and the visible Search button
  both apply the value; submitting an empty value clears the text filter.
- At this checkpoint, submission reset the 200-record page offset. Facets still
  applied immediately, and tab switches plus the then-present loadout slot
  shortcuts retained their existing filtering and pagination behavior. D053
  subsequently removed those shortcuts.

## Retraining dismissal checkpoint (2026-09-16)

- The Retraining pane uses the same icon-only X control before and after a
  target is selected. It cancels an unfinished choice or removes a completed
  retraining while retaining state-specific accessible labels.

The product owner verified both states live.

## Arbitrary-level planning checkpoint (2026-09-16)

- The Current level control offers levels 1–30 and can jump directly to any
  target, creating intervening frames with unresolved choices rather than
  requiring lower levels to be completed first.
- The level rail distinguishes untouched, partially completed, and fully
  completed future levels with accessible labels and gray empty, half-filled,
  and filled markers. Reached levels with unresolved choices use an orange
  half-filled marker; reached complete levels retain the green marker.

The product owner verified direct level changes and every marker state live.
All 311 public tests, formatting, lint, TypeScript checks, and whitespace checks
pass.

## M5.5 Theme tab checkpoint (2026-09-16)

- The level-1 Theme selector is a peer tab immediately after Background instead
  of sharing the Background tab. The existing exact choice, candidate table,
  selection state, detail cards, keyboard tab behavior, and ordering within the
  Theme section are unchanged.
- Build navigation accepts the bookmarkable `theme` section and restores it
  through the same canonical hash path as every other choice tab.
- Overview continues to group Theme under Character, suppress an unselected
  optional Theme the same way as before, and retain its concise timeline label;
  only the Build-tab placement changes.

## M5.5 racial ability bonus placement checkpoint (2026-09-17)

- The exact level-1 `Race Ability Bonus` choice is presented inside the
  point-buy table's `Race` column instead of as a separate selector. Each score
  shows a dash, a fixed racial modifier, or a compact ability-choice button
  when it is one of the selected race's flexible bonus options. Clicking the
  selected button again clears the choice.
- Fixed modifiers follow the selected race's complete authored grant closure,
  including `Race -> Grants -> Race Ability Bonus` chains. Flexible options
  come from the race's authored select rule: its `Category` list when present,
  or every ability-bonus definition when omitted. Presentation therefore stays
  complete even when an imported character's evaluated choice reports only its
  currently selected candidate.
- Race, Racial Trait, and Language choices remain in Race. The table preserves
  immediate optimistic totals for both point-buy edits and flexible racial
  bonus selection while the rules worker catches up.
- This is presentation-only: evaluator ownership, occurrence identity,
  serialization, selection commands, level ordering, existing tab-navigation
  mechanisms, and calculated ability-score values are unchanged.
- The level-1 Race tab omits the redundant outer `Racial Trait` subsection
  heading while retaining the selector's own heading. Race, Language, and all
  other multi-choice subsection headings remain unchanged.

## Authored planning-horizon checkpoint (2026-09-17)

- Future-level browsing still retains intervening empty frames through level
  30, but those frames no longer extend evaluation after the builder is
  reopened. The planning horizon is now the highest of the current level, the
  visible level, and durable authored state such as saved/imported choices,
  user edits, grabbag entries, or alternates. Inventory metadata is excluded:
  an item's acquisition/item level does not represent a character-planning
  level and must not force unrelated future choice evaluation.
- The ignored Alysa fixture imports truthfully at level 8 with eight populated
  frames; the erroneous level-12 progress came from four later persisted empty
  browse-ahead frames being counted as authored plan depth. A public synthetic
  regression preserves all 12 frames while requiring a reopen horizon of 8,
  future browsing at 12, and restoration of horizon 12 when an ability increase
  is saved there.
- Focused verification passed 44 builder UI tests and the web TypeScript check.

## Inventory horizon provenance checkpoint (2026-09-17)

- Inventory entry and nested item-property acquisition levels no longer extend
  the choice-planning horizon. They control equipment availability during an
  evaluation, but are not evidence that the character has authored choices at
  that level.
- A level-8 build carrying level-26 equipment metadata now evaluates choices
  through level 8. Saved level-frame choices, user edits, grabbag selections,
  and alternates continue to extend the horizon normally.
- The temporary foreground/background scheduling workaround was removed; the
  bogus level-26 evaluation is no longer requested.

## Character initial-load performance checkpoint (2026-09-17)

- Candidate-scoped evaluated snapshots persist in a separate 24-entry LRU
  IndexedDB cache. Keys include an explicit rules semantic version, exact pack
  ID/content digest, canonical projected build input, candidate/replacement
  detail scopes, and power-output mode. Input, profile, version, level, or
  projection changes miss safely; malformed entries are deleted, and every
  storage/hash/quota failure falls back to canonical worker evaluation.
- Rules workers now validate the small stored manifest at initialization and
  defer full pack decoding until a cache miss. Concurrent current/planning/
  selected-level misses share one decode. An unchanged repeat open can use the
  persistent result without decoding the corpus a second time in the worker.
- Build requests expand candidates only for the visible level; Character
  details expands its own choice levels; Overview, Equipment, and Diagnostics
  request no presentation-only catalogs. Distinct historical/current Build
  evaluations still expand the visible level required by ability and choice
  controls. Results publish independently as each horizon completes.
- The editor's detail surfaces use content entities and do not consume
  evaluated attack/loadout variants, so editor evaluations use
  `includePowers: false`. Sheet evaluations retain the compatibility-default
  power output while omitting unused choice catalogs. Public evaluator tests
  prove that explicit/default power output is unchanged and that omitting power
  materialization changes no other evaluated field.
- Immutable content-ID indexes are reused by build projections, including
  character-local user-edit overlays without cloning the 38,339-record map.
  Power evaluation also shares one lookup map between loadout and power phases.
- Best-effort `4ecb:*` Performance Timeline entries expose character storage,
  content readiness, projection, worker initialization/content/evaluation,
  round-trip, persistent-versus-worker source, and first-result timings.
- A local 38,339-record Silaqui level-8 scoped benchmark measured approximately
  5.03 s cold / 0.49 s warm without power materialization versus 5.31 s cold /
  0.58 s warm with powers on this host. The no-powers result was about 917 KB
  serialized versus 946 KB. These are development-runner evidence, not browser
  budgets; the larger repeat-open gain comes from bypassing worker decode and
  evaluation on an exact persistent hit.
- Focused verification passes 103 tests covering cache hit/miss/version/profile/
  input behavior, malformed recovery, read/write failure fallback, LRU storage,
  route scoping, independent publication, power compatibility, pack manifests,
  the planning-horizon regression, and the evaluator. Web, browser-storage, and
  rules-engine TypeScript checks plus targeted lint pass. The full 347-test
  suite, workspace typechecks, production/PWA build, and Chromium/Firefox print
  checks also pass. The `scripts/check.sh` wrapper stops at its initial formatting
  gate because the unrelated, otherwise clean `apps/web/src/equipment-ui.test.ts`
  is not Prettier-clean; this checkpoint leaves that pre-existing file untouched.

## Key-ability presentation checkpoint (2026-09-17)

- Every ability-selection treatment now places the assistively labeled key icon
  immediately after the authored ability name. The level-up score remains a
  separate trailing value, and level-1 point-buy rows use the same shared
  name-and-marker presentation.
- The selected class's grammatically formed key-ability sentence now occupies
  the heading area in both the level-1 point-buy pane and later ability-increase
  panes. In point buy it sits above compact **Base**, **Race**, and **Total**
  column labels rather than a verbose explanation of those columns.
- This remains presentation-only: authored key-ability order, score evaluation,
  choice occurrence identity, selection commands, and serialization are
  unchanged.
- Point-buy numeric fields suppress browser-native spinner chrome because the
  pane already supplies explicit minus and plus controls. They remain native
  number inputs with manual entry, keyboard stepping, min/max constraints,
  Enter commit, and Escape rollback. Key markers use the app's muted monochrome
  Lucide outline treatment rather than an accent-colored glyph.
- The level-1 pane no longer repeats a visible **Point buy** title: its hidden
  heading still names the region for assistive technology, while the class
  key-abilities sentence remains left-aligned opposite the point-spend status.
  The ability-name, **Base**, **Race**, and **Total** columns are aligned and
  content-sized as one compact group with moderate fixed spacing. **Race** and
  **Total** headers and values are centered, so fixed and selectable racial
  bonuses share one centerline. Each ability-row border ends after **Total**;
  any spare pane width remains empty outside the row to its right.
  Per-row `Next +1` copy has also been removed. Each explicit minus/plus control
  retains a full accessible name with the ability, destination, and exact
  refund/cost, while its visible tooltip is limited to concise economics such
  as `Refunds 1 point` or `Costs 2 points`. Minimum, maximum, and recoverable
  custom-range states use similarly concise titles. The reset action is visibly
  **Reset** and retains a fuller accessible name.
- Focused key-ability/accessibility coverage passes 68 tests, the full public
  suite passes all 363 tests, and web TypeScript checking plus targeted lint
  pass. The broader workspace typecheck, production/PWA build, Chromium and
  Firefox print checks, deterministic synthetic-pack checks, and query
  benchmark recorded for the underlying checkpoint were not rerun for this UI
  refinement. The `scripts/check.sh` wrapper still stops at its initial gate on
  the pre-existing `apps/web/src/equipment-ui.test.ts` formatting issue recorded
  above; every file changed by this checkpoint is Prettier-clean.

## Class deity-choice parity checkpoint (2026-09-17)

- The evaluator now reproduces the recovered native `ShouldChooseDeity`
  predicate from selected Class and Hybrid Class metadata. A deity is required
  when `_PARSED_CLASS_FEATURE` or `Hybrid Talent Options` contains `Channel
Divinity`, except for the native function's explicit, case-insensitive
  `Warpriest` exclusion.
- In the complete local corpus this covers Cleric, Paladin, Invoker, Avenger,
  Hybrid Cleric, Hybrid Paladin, Hybrid Invoker, and Hybrid Avenger. The rule is
  metadata-driven rather than hard-coded to those eight names, preserving the
  recovered behavior.
- Covered builds reuse the existing level-1 Deity choice below Starting Presets
  in the Class pane. The same occurrence remains editable in Character details;
  Class completion, Next-button gating, unresolved counts, and level-rail state
  treat it as required. Changing to an uncovered class makes the choice optional
  without deleting an existing deity selection.
- The ignored merged corpus distinguishes deity compatibility from identity.
  Cleric says the deity must be compatible with the character alignment and
  Avenger has no exact-alignment rule. Paladin says the alignment must be
  identical to the patron deity's, while Invoker says it must match. The
  `_BaseClass` links carry only the latter two rules to Hybrid Paladin and
  Hybrid Invoker. Therefore the exact synchronization set is Paladin, Invoker,
  Hybrid Paladin, and Hybrid Invoker; Cleric, Avenger, and their hybrids remain
  editable, and Warpriest remains excluded from `ShouldChooseDeity` entirely.
- For that exact set, choosing or changing a deity automatically saves the
  matching Alignment occurrence. Character details disables the Alignment
  control, places a lock icon before the selected alignment, suppresses its
  normal hover affordance, and explains the active class, deity, and alignment.
  Moving to a nonmatching class removes the constraint without deleting the
  saved choice, so the ordinary Alignment control becomes editable again.
- Focused rules-engine and builder tests pass 121 tests, and the full workspace
  TypeScript check passes. Live browser verification with a Paladin confirms
  the Deity table follows Starting Presets, selecting there updates Character
  details, Avandra saves and locks Good with the explanatory note, and changing
  to Fighter hides the Class copy and unlocks Alignment without clearing either
  saved selection.

## M5.7 inline power-value checkpoint (2026-09-28)

- Recovered native behavior confirms that `RulesElementField` passes authored
  prose through a word-based named-ability replacement step. It is not encoded
  as structured substitution tokens in the content. The original formatter
  appends signed values to named modifiers, leaves generic/choice-based
  `ability modifier` text alone, and does not expand half-level expressions.
- The shared sheet model now appends authoritative signed values to unambiguous
  named ability modifiers and to `half your level`, `one-half your level`, and
  `1/2 level` variants. It does not double-annotate existing parentheticals or
  guess among multiple abilities unless the explicit best-ability preference
  described below is enabled. Browser View and print therefore receive the same
  personalized card prose without changing source content or rules math. Build
  option details and powers shown inside Equipment now use that same formatter,
  so in-app detail cards, browser View, and print cannot diverge.
- Hu's legacy PDF confirms `Wisdom modifier (+5)` alongside its separate weapon
  calculation line. Fei Zhu's image-only legacy PDF confirms named modifiers
  such as `Wisdom modifier (+4)`, an unexpanded generic `ability modifier`, and
  the unexpanded `5 + 1/2 level` form that this cleanup intentionally improves.
- Focused sheet-model coverage passes four tests, including named modifiers,
  ambiguous choices, existing annotations, and both textual and fractional
  half-level forms. Package TypeScript checking also passes.

## M5.7 Settings simplification and best-ability checkpoint (2026-09-28)

- Settings now foregrounds Display, Backups & storage, and Game content. The
  ordinary content card reports readiness and recognizable content names,
  accepts portable packs, and provides a short review/use flow. Exact layer
  ordering, digests, collision IDs, raw XML import, directory discovery, pack
  removal, and quota diagnostics remain recoverable under collapsed Advanced
  content management.
- A browser-local, default-on Display preference resolves multi-ability modifier
  and attack phrases to the highest available modifier. Equal modifiers prefer
  the higher underlying score, then the selected class's authored key-ability
  order, then the power's authored order. Missing values leave the prose
  untouched, and disabling the preference retains the authored alternatives.
  The setting feeds the shared formatter used by in-app power detail cards and
  the sheet model, so Build, Equipment, browser View, and print agree without
  altering stored characters or rules calculations.
- Focused power-card, Settings contract, and sheet-model tests pass 51 tests.
  Web and sheet-model TypeScript checks pass. The full 550-test suite, workspace
  typechecks, targeted lint, production/PWA build, and Chromium/Firefox
  Letter/A4 color/monochrome print matrix also pass. A live narrow-width browser
  pass confirms the three primary cards, default checked preference,
  persistence after toggling/reload, and collapsed Advanced content management.

## M5.7 interactive weapon-variant checkpoint (2026-09-29)

- Evaluated power variants now retain their authoritative weapon-damage die,
  equipped state, main/off-hand role, and existing paired-weapon identity. The
  rules engine continues to retain every compatible owned variant rather than
  filtering calculations to the currently equipped weapon.
- In-app power details and browser View default to the equipped main hand, then
  another equipped variant, then the first compatible inventory option. A
  selector updates the displayed attack, damage, and optional `[W]` expansion;
  a collapsed comparison table keeps every compatible weapon visible and
  selectable without changing the character's equipment.
- Two default-on Display preferences independently control compact interactive
  ability values and selected-weapon dice expansion. Compact values use native
  tooltip markup such as an underlined `+4` titled `Charisma modifier`. Neither
  abbreviation is used in print.
- The evaluated sheet model now represents one power card with attached weapon
  variants instead of duplicating the full card per weapon. Print retains full
  ability phrases and authored `[W]` text, then lists concise attack/damage
  lines for every compatible owned variant. Each line contains the weapon name,
  total attack bonus, and damage expression only; equipment-state labels and
  the repeated defense are omitted. The equipped-first default remains the
  compact header calculation while inventory alternatives remain visible near
  the bottom of the card body. Phase-specific multiattack damage remains a
  model limitation: attacks are structured per phase, but damage is currently
  stored once per weapon variant.
- Focused rules-engine, sheet-model, and web coverage passes 99 tests. The full
  554-test suite, workspace TypeScript checks, lint, production/PWA build, and
  Chromium/Firefox Letter/A4 color/monochrome print matrix pass with all 24
  synthetic cards present and unclipped. Live validation against an imported
  character confirms equipped-first ordering, inventory comparisons, selection
  without equipment mutation, `1d12 + 5` and `1d4 + 5` prose expansion, compact
  Dexterity tooltips, and the balanced operator spacing required for forms such
  as `2[W] + 4`.
- A follow-up Build review against Ingi first exposed that candidate powers were
  not evaluated, but live product review established that weapon-specific
  calculations made selection dialogs harder to scan. Build power details now
  intentionally keep authored formulas and abbreviate ability names (`STR`,
  `DEX`, and so on). Attack and complete Hit clauses use the same aligned rule
  rows as Requirement, Effect, and other fields rather than introducing a
  second colored card section. Damage remains beside every associated hit
  effect, including conditions and movement. Compact numbered labels such as
  `TARGET 1`, `ATTACK 1`, `TARGET 2`, and `ATTACK 2` distinguish multiattack
  phases without adding vertical divider rows. Each Attack shares one aligned
  visual group with its adjacent Hit rows and following Effect rows, so their
  descriptions start on the same horizontal line and no divider breaks a single
  combat sequence. A before-attack Effect remains a separate unconditional
  setup row above that group. Requirements and Triggers lead;
  otherwise Target, Effect, Attack, Hit, and bridging Effect clauses retain
  authored order, which preserves explicit before/after-attack timing. Weapon
  selection and calculated variants remain available in Equipment and browser
  View, where they support using the finished character. The Source divider now
  spans the same full card width as the preceding rule dividers. Focused
  coverage includes complete Hit prose, explicit before-attack Effect ordering,
  phase transitions, and compact numbered labels. Clearly damage-only Hit rows
  display as `DAMAGE` with the redundant word “damage” removed from their
  formula; conditions, movement, ongoing damage, and other riders retain the
  complete `HIT` label and prose. The full 558-test suite and all public checks
  pass. Internal descriptor, rule, and Source separators use a lower-contrast
  divider than the card outline so row structure does not compete with the card
  boundary. Undivided Attack, Hit/Damage, and associated Effect rows use half
  the normal inter-row spacing while preserving the group's outer padding.

## M5.7 sticky builder-table headers (2026-09-29)

- Builder candidate tables keep their column headings pinned to the top of the
  table's own scrolling viewport, including powers, feats, classes, races,
  backgrounds, themes, deities, and other shared choice lists. Horizontal
  scrolling remains unchanged. Power and feat subcategory rows form a second
  sticky tier beneath the column headings; the current category remains named
  and collapsible until the next category replaces it.
