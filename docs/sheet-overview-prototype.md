# Printed overview design study

Status: approved prototype integrated into the production print overview for
real-character feedback, 2026-10-14. M5.6 remains open.

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
The abilities table reads score then STR/CON/DEX/INT/WIS/CHA, Modifier and +½ level;
score has no separate header, and full ability names remain available as abbreviation
titles; abbreviations are bold. Initiative and Speed are compact numeric tiles
in the main identity header's right side, not a separate Movement pane or part
of Health/Defenses. The portrait is circular; the identity line reads race, class,
then bare level (`Dwarf Paladin 7`). The redundant first-page running header and
full-width identity separator are omitted; later-page running headers remain.
Passive Insight and Perception precede their active skill bonuses, e.g.
`Perception (25) +15`, not as separate rows. Vision remains in Skills.
Languages form a vertical list in a narrow panel to the right of Abilities;
Skills and Basic attacks follow below. Initiative/Speed share one soft header
background with a subtle internal divider rather than isolated tiles. The unified
summary, scratchpad and reference heading is now simply **Reminders**.
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
Display follow-up: Saves and Initiative use explicit signs, including `+0`.
Reminder names omit parenthetical qualifiers for display only; original names
remain intact in the model and references. The Ability heading aligns with the
abbreviation column rather than the raw-score column; abbreviations use normal
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
Basic-attack summaries prefer two weapon alternatives, reducing to one when the
right column needs room; complete alternatives remain in references.
Grant/choice-only wrappers are omitted using authored Benefit text and grant/
selection metadata, without mistaking introductory flavor for an extra effect.
The exclusion also covers power-access/shared-usage containers: grant/select-only
definitions whose prose merely explains learning, invoking or sharing uses of
other powers. A cadence such as once per encounter is not itself an independent
reminder effect. Definitions with independent mechanical benefits remain outside
this exclusion, including manual effects not represented in native statements.
Full feature references, granted powers and usage tracking remain unchanged;
there is no feature-name denylist.
Additional Effects resolve to a uniquely known selected provider (or exact ID),
using its complete authored rule once instead of repeating the bonus per power.
Unresolved identical effects deduplicate across affected powers; distinct effects
and ambiguous providers remain recoverable. Original power/card effects are unchanged.
This remains a display heuristic, not
proof that every excluded benefit is calculated; all feats retain full references.
Up to two highest-ranked basic-attack variants per attack kind appear in the summary; all valid alternatives
are retained in references. Unfittable custom data raises a visible overflow
warning rather than being silently clipped or shrunk below readable reference text.

Inventory includes items whose physical cards are hidden, preserves explicit
slot assignments, falls back to authored Item Slot, and labels unknown slots.
Equipped quantities and carried spares are separate. The power index preserves
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
