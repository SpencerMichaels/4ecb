# Polish-pass reference

The kinds of stylistic and consistency problems found (and fixed) while
refining the builder, with the rule each fix settled on. Use it as a checklist
for a final pass over every screen: look for each kind of issue, not just the
instances listed.

## Layout and space

- **Wasted vertical space.** Stacked margins, paddings and gaps that add up
  (a tab bar's margin plus a pane's margin plus a workspace's padding; a flavor
  band's margin plus padding plus a grid gap). Rule: one gap between
  neighbours; a divider line (like the one above "About …") where a separation
  is wanted, not extra space.
- **Controls wider than their content.** Full-width button groups, a level
  dropdown far wider than its 1–2 digit values, fields stretched across the
  pane. Rule: size to content (segmented controls, compact inline-label fields,
  fixed short columns), and put short fields side by side on one line.
- **Labels on their own line.** A heading line above every field. Rule: label
  inside the field's frame (`inline-field`), or to its left; drop labels a
  control makes obvious (a search box).
- **Redundant headings.** Two headings saying the same thing ("Character
  identity / Character details", "Skill Training 3 of 3 / Paladin skills 3 of
  3", "Theme power · Level N" under a theme). Rule: one heading per level of
  structure; drop labels the context already states.
- **Columns that waste width.** Long header words over 2–3 character values,
  centred values in header-wide columns, columns that only repeat an icon
  (Action). Rule: abbreviate headers (Lvl, Atk, Def) with the full name in a
  tooltip, left-align short codes, let two-word values wrap.
- **Scrolling.** Whole-page scroll and elastic overscroll; panes that should
  scroll on their own (tables, detail cards) but didn't; tables sized against
  the window instead of the space actually left, so they overflow slightly.
  Rule: pin the page to the viewport; tables and detail panes scroll
  independently and fit the remaining space, re-fitting when content around
  them changes.
- **Thresholds that break at real zoom.** Layout switches keyed to window
  sizes the user's 140 % zoom falls under. Rule: check every media query and
  viewport threshold at 140 % zoom.
- **Content that stretches its column.** One long word sets a name column's
  width; a wide card squeezes the table beside it. Rule: check both panes at
  realistic widths after any width change.
- **Toolbars on their own row.** The library had a title row and then a
  separate row holding only Import / New Character. Rule: page actions sit in
  the page heading's row, on the right; the app's brand mark, not a generic
  page title, heads the home screen.
- **Edge padding that disagrees with internal gaps.** The builder's outer
  padding was first larger, then smaller, than the gap between sidebar and
  workspace. Rule: a container's edge padding equals the gap between its
  children, from one shared variable (`--builder-gap`), so they can't drift.
- **Filter rows that wrap.** Five power filters wrapped to two lines because
  each claimed a fixed minimum and its widest option ("All abilities",
  "Constitution"). Rule: one shrinkable row; abbreviate option text where
  the table already abbreviates (STR, Fort) while keeping full values; "All"
  rather than "All <plural>".
- **Native control chrome.** Number inputs reserve ~20 characters of width
  and show tiny spin buttons. Rule: give number fields an explicit width for
  their real range and hide spinners; typing and arrow keys still work.
- **Sticky things that grow with data.** Selected rows pin to the table edge,
  one per selection; with six backgrounds that filled the scroll area. Rule:
  any sticky stack whose size depends on data gets a budget (pinned rows use
  at most a third of the visible table); the rest scroll normally.

## Visual consistency

- **Rounded corners.** Pills and rounded boxes where the rest of the app is
  square. Rule: 2px radius everywhere (buttons, chips, icons, dialogs, badges);
  only true circles (status dots, spinner, portrait) stay round.
- **Hover and focus treatments.** The app-wide button hover underline leaking
  onto controls it doesn't suit (clear "x", favourite star, section toggles,
  table names); a thick focus outline around a search box; a focus ring left on
  the focused main landmark. Rule: each control picks one cue: rows tint on
  hover, names don't change, focus recolours a field's own border; keyboard
  focus stays visible.
- **Inconsistent selection cues.** A left bar for "selected" in one place, an
  underline in another. Rule: selection is an underline (tabs, level picker,
  segmented controls).
- **Icons.** Some chips with icons and others without; dated or off-brand icon
  choices; icons that duplicate a column. Rule: sibling controls either all
  have icons or none do; reuse the existing icon set (`Icon.tsx`) and its
  look-alikes rather than adding variants (`UserRound` for classes, not a
  second, slightly different `User`).
- **Text buttons beside icon buttons.** "Import .dnd4e" and "New Character"
  as bordered text buttons next to a bare Settings gear. Rule: a group of
  page actions is all bare icon buttons with tooltips and accessible names,
  styled like the builder's (`.page-actions` matches `.builder-status`), with
  the same divider between groups.
- **One icon for several entity types.** Classes, paragon paths and epic
  destinies all showed the class shield. Rule: each entity type a user picks
  separately gets its own icon (`entityTypeIcon`): class `character`,
  paragon path `crown`, epic destiny `sun`.
- **Card text sizes.** Theme, deity and class cards inherited the page's 12pt
  and rem sizes while power and item cards used 10.5pt / 10pt panel sizes, so
  the same pane showed two type scales. Rule: every card frame takes its sizes
  from the shared panel variables (`--panel-card-text-size`,
  `--panel-card-body-size`) and em units, never rem. Still open: power/item
  cards use Arial (like print) while choice cards use the app fonts.
- **Card proportions.** Short cards collapsed to a strip. Rule: builder cards
  are at least a printed card's proportions (`aspect-ratio: 2.47 / 3.405`,
  which only sets a minimum while overflow is visible); the body absorbs the
  extra height so the type bar stays at the bottom.
- **Bands that don't match their neighbours.** Flavor text on plain paper
  directly above a tinted keyword band; weapon-table stripes starting on a
  tinted row right under a tinted header. Rule: adjacent bands of the same
  role share a tint; striping starts on the plain row.
- **Dark-theme colors brighter than the app.** Dark card colors (at-will
  green, encounter red) were far more saturated than the muted navy UI. Rule:
  every hard-coded dark-theme color is checked against the surrounding
  palette; lower saturation and lightness, keep the hue, keep white-on-color
  text above 4.5:1. Item orange (`#e08a12`) still to review.
- **Capitalisation and wording.** "Str" vs "STR"; "Browse" (a verb) naming a
  filter; "Loading" for something that's generated; "1 warnings"; "character
  sheet" in one message and "X's sheet" in the next. Rule: ability
  abbreviations uppercase from one shared list; field names are nouns; verbs
  match what actually happens; plurals agree; a thing has one name across
  related messages, and fallbacks for missing values read naturally (no
  "character's character sheet").
- **Dismissals that nag.** "Not now" on the content-update dialog. Rule:
  never label an option "Not now", "Maybe later" or similar; they're the
  language of dark patterns that wear users down into consenting. Declining
  is "Cancel" (or a plain statement of what happens), with equal standing to
  the other choice.
- **Ordering.** Options in content order where convention differs (Female,
  Male). Rule: conventional order where one exists (`conventionalOptionOrder`).

## Interaction patterns

- **Small click targets.** Only the name text clickable in a row. Rule: whole
  row is the target (click = inspect, double-click = select/apply) with a
  hover tint, in every table (choices, inventory, shop).
- **Same gesture, different meaning.** One table selecting on single click
  while the others inspect. Rule: every table: click inspects, double-click
  or Enter selects; destructive results (overwriting picks) confirm first,
  harmless ones don't.
- **Unpredictable automation.** Auto-advancing to the next choice after a
  selection; "first time only" behaviours. Rule: the UI never moves on its own
  after a user action; defaults apply only on arrival.
- **Expand/collapse used where scrolling would do.** Rule: don't fold
  content just to shorten a card; use expand/collapse only to show one of
  several large things (the one-table-or-none accordion), and always let the
  open one be closed.
- **Hidden ways to deselect.** Removing a control removed the only way to
  undo a choice. Rule: when removing a control, check what else it was the
  only path for, and provide that path (reselect to deselect).
- **Detail pane out of step.** Opening a different table left the previous
  item showing. Rule: the details pane always reflects the visible table's
  selection, or "no selection".
- **Information you can't inspect.** Options with real rules text shown as
  bare buttons (racial traits, languages). Rule: anything with text to read is
  a table row with a details card; buttons only for bare labels.
- **Things that can't be favourited sensibly.** A favourite star on button
  choices. Rule: favouriting only where favourites have an effect (tables).
- **Confirmation of things the user can already see.** "N characters stored
  in this browser", "Imported X", "Exported X…", an import report panel.
  Rule: no status text for successes whose result is visible (the new row,
  the browser's download); report only failures and warnings.
- **Messages that displace the page.** An error box and import report pushed
  the character list down when they appeared. Rule: failures and warnings are
  floating toasts (`Toasts.tsx`) that stay until dismissed; errors announce as
  alerts, warnings as status; informational diagnostics (and any that are no
  longer true) aren't shown.
- **Standing banners.** Persistent storage was a buried Settings button.
  Rule: a banner is allowed only when it is actionable and present on
  arrival (the library's keep-my-characters banner), dismissible, with its
  action still reachable from its real home after dismissal; anything
  triggered by an action stays a toast. Character problems are never
  banners: they are issues in the badges.
- **Navigation that loses your place.** Settings' close always went to the
  library, even when opened from the builder. Rule: closing a page returns
  to where you came from (falling back to home) via a real link; Esc closes
  pages that have a close button, unless something inside handles it.
- **Sibling dialogs that disagree.** Missing close ×, an unstyled primary,
  "Not now" vs "Cancel", three spacing mechanisms. Rule: one dialog contract
  (`primitives.css`): × in every header, right-hand [Cancel] [Back]
  [Primary], extras on the left, dismiss is "Cancel", Esc equals Cancel.

## Information architecture

- **Rules buried under lore.** Race/class/background cards opened with long
  descriptions and a flat field list. Rule: rules first (summary, stat grid,
  traits and features listed in the card), lore after, unplaced fields kept
  under "More".
- **Mixed issue kinds.** House rules shown as warnings; warnings shown in the
  level picker and section tabs as well as the badges, disagreeing with them.
  Rule: navigation (level picker, section tabs) shows progress only;
  warnings, errors and house rules live in the tab-bar badges and their pages;
  house rules are not problems and have their own page.
- **Status that depended on where you were.** An issue badge that appeared
  only on the tab that loaded the data it needed. Rule: global status must be
  computed from data available on every tab.
- **Things in the wrong place.** Level editing in Details; the character name
  editable in two places; a Clear that cleared the selection rather than the
  search. Rule: each value has one home, where users expect it.
- **Locked where it should advise.** Alignment forced to the deity's. Rule:
  don't lock legal-but-unusual choices; mark them as house rules.
- **Settings defaults.** New, optional detail (entity sources) shown by
  default. Rule: extra detail is a setting, off by default.
- **Controls on a screen nothing leads to.** Print options lived in the
  screen sheet view, which every route skips for print preview. Rule: when
  routes or views are deferred or hidden, check what controls only existed
  there; move them, or drop the option if nobody needs it.
- **Settings grouped by the wrong surface.** "Use the best ability" sat under
  Printed sheet but changed builder cards too. Rule: trace where a setting
  actually applies before filing it; settings that span surfaces get their
  own section. Per-user preferences (paper size) are app settings, not
  per-character data.
- **Developer tools in the product.** Digests, quota numbers and raw XML
  import under "Advanced". Rule: user-facing screens hold only what users
  act on; diagnostics and conversion live in the content tool.

## Robustness behind the visuals

- **Styles that override visibility.** A `display` rule un-hiding a `hidden`
  tab or a closed `<dialog>` (an empty bordered box). Rule: any rule setting
  `display` on something that can be hidden guards with `:not([hidden])`;
  closed dialogs are hidden globally.
- **Specificity fights.** A hover or reset rule losing to a more specific
  global one (`background` shorthand wiping a tint, a `!important` margin
  surviving an override). Rule: check the cascade when a style "doesn't
  apply"; prefer raising specificity locally over `!important`.
- **Generic structural rules leaking into variants.** `.candidate-detail >
header` (padding, margin, divider) also matched the choice card's title
  band and outranked its own rule, leaving a line of space under it. Rule:
  when an element reuses a generic container's structure (`header` as a
  direct child), check which generic child rules still match it and override
  them explicitly.
- **Sticky layers in the wrong order.** A card's sticky title band and type
  bar shared a z-index, so when a card scrolled in from below the type bar
  (later in the DOM) drew over the title. Rule: overlapping sticky elements
  get explicit, ordered z-indexes; the title wins.
- **Mitred borders.** A thick coloured border meeting a thin divider at a
  slanted, "rounded"-looking corner. Rule: draw accent bars with inset shadows.
- **Duplicated lists and logic.** The same abbreviation list in three files;
  two "is this selection allowed" checks that disagreed. Rule: one shared
  source; UI surfaces derive from it.
- **Count text that changes width.** A "N shown" label resizing and shifting
  neighbouring controls. Rule: fixed width and tabular numerals for live
  counts.

## Final-pass checklist

For every screen (library, builder tabs, details, equipment, shop, sheet,
settings, dialogs), in light and dark themes and at 100 % and 140 % zoom:

- [ ] No stacked/oversized gaps; dividers instead of extra space.
- [ ] Controls sized to content; short fields share a line.
- [ ] No redundant headings or labels.
- [ ] Square corners except true circles.
- [ ] Hover, focus and selection cues match the rules above.
- [ ] Sibling controls consistent (icons, wording, capitalisation, order).
- [ ] Every table: whole-row click/double-click, details pane in step.
- [ ] Nothing moves on its own after a user action.
- [ ] Progress in navigation only; issues only in badges and their pages.
- [ ] No page-level scroll; panes scroll independently and fit their space.
- [ ] Hidden things stay hidden (tabs, dialogs, collapsed sections).
- [ ] Page actions in the heading row, all icon buttons; edge padding equals
      internal gaps.
- [ ] Every card (power, item, choice) shares one type scale, minimum
      proportions and band tints; sticky title above sticky footer.
- [ ] Dark-theme accent colors as muted as the rest of the palette.
- [ ] No success chatter; failures and warnings as floating toasts.
- [ ] Sticky stacks that grow with data are capped.
- [ ] Each entity type has its own icon; no near-duplicate icons.
- [ ] Every control reachable from some route; closes return where you were.
- [ ] Dialogs follow the shared contract; no "Not now" / "Maybe later".
- [ ] Banners only for standing, actionable states present on arrival.
- [ ] Settings filed by where they apply; no developer diagnostics.

## Current pass: findings (2026-10-18)

Found in an audit after the committed builder work (881b11a). Walked through
one at a time with the product owner; each records the proposal and, once
agreed, the decision and status. Decisions are recorded first; items 1–6 are
implemented together after the walkthrough.

1. **Print options unreachable** (information you can't reach). Paper,
   monochrome, blank HP and power/item card inclusion live only in the screen
   sheet view's "Print options" `<details>`, but every entry opens
   `?preview=1`, which hides that view, and Back returns to the builder.
   Decision: drop blank HP (the scratchpad covers it), power/item card
   inclusion (always included) and monochrome (a print-dialog setting); the
   sheet ignores those stored character fields. Paper size can't defer to
   the print dialog (fixed-size measured layout plus `@page size`), and it
   isn't per character: it becomes an app-wide Settings → Printed sheet
   Letter | A4 control, defaulting from the browser locale, and the
   per-character `paper` field is ignored. The preview toolbar keeps only
   Back and Print (icon buttons); the unreachable Print options panel goes.
   Status: implemented; visual review pending.
2. **Settings → Close always goes to the library** (navigation that loses
   your place). Opened from the builder, closing Settings drops you in the
   library. Decision: `App` remembers the last non-Settings route (with the
   builder's tab/level/section); Settings' × is a real link to it, falling
   back to `#/characters`. Esc also closes Settings, unless something else
   handles it first (an open dialog, a native select, an import in progress
   or a field being edited). Status: implemented; visual review pending.
3. **Settings ignores the message rules** (success chatter; messages that
   displace the page). Success lines ("Backed up N character record(s).",
   "Removed X from this browser.", "Import cancelled…"), inline error boxes,
   "Restore N record(s)". Decision: visible successes and non-events
   (cancelled, unchanged, not started) are removed; failures become error
   toasts carrying the real reason (bare "Import failed." lines go); the
   persistent-storage denial is a warning toast; the no-checksum note stays
   inside the restore preview; progress stays inline beside the control that
   started it, not at the page bottom; the "N characters use the previous
   content" note goes (the builder raises it per character); "Restore 1
   character / 3 characters". Status: implemented; visual review pending.
4. **One-off banners in the builder** (same status two ways). The
   bound-profile warning and "Rules evaluation failed…" render as banners
   above the tabs. Decision: both become error-kind character issues via
   `withCharacterIssues` (red badge, Diagnostics), and the banners go.
   "Game content isn't installed": Review opens the content-update dialog
   when other content is active (and the "content has been updated" warning
   is suppressed, one cause one issue), else links to Settings → Game
   content. "Rules couldn't be calculated" carries the worker's message and
   clears on the next successful evaluation (a state, so a badge, not a
   toast). Status: implemented; visual review pending.
5. **Sibling dialogs disagree.** Preset-replace has no close ×; "Use portrait"
   isn't primary; "Not now" vs "Cancel"; three different footer spacing
   mechanisms; per-dialog backdrop list. (Shop's Cancel, Back, primary order
   is correct: Back pairs with Next.) Decision: one contract in
   `primitives.css`: right-hand group [Cancel] [Back] [Primary], extra
   actions pushed left by `dialog-footer-start` (no spacer elements or
   wrapper divs); every main action `button-primary`; dismiss is always
   "Cancel" and Esc does the same; close × in every header; one
   `.dialog-shell::backdrop` rule. Status: implemented; visual review pending.
6. **Smaller items.** Decision: all agreed as follows (g dropped). Status:
   implemented; visual review pending.
   - a: empty state becomes an `h2` "No characters yet" plus "Create one with
     New character, or import a .dnd4e file from the legacy Character
     Builder."
   - b: disabled New character's tooltip/name: "Turn on game content in
     Settings to create a character".
   - c: Restore / Delete permanently report failures via `reportFailure`.
   - d: new Settings → Power cards section holding "Use the best ability"
     and "Show equipped to-hit bonus" (both affect builder and print); the
     rest stay, Paper size joins Printed sheet.
   - e: theme is a System | Light | Dark segmented control.
   - f: both stray radii become 2px.
   - g (dropped): Details' "?" marker is its only progress cue (Build's is
     inside the tab), so it stays.

   Found during the audit:
   - Library empty state says "from the active profile above" (nothing is
     above) and shows literal backticks around `.dnd4e`.
   - New character silently disabled with no active content; tooltip should
     say why.
   - Trash Restore / Delete permanently swallow failures (no
     `reportFailure`).
   - Settings files "Use the best ability…" and "Count coin weight" under
     Printed sheet though both affect builder, Equipment and Shop.
   - Theme picker is radio buttons where Details uses segmented controls;
     "System Default" capitalisation.
   - Stray radii: `.character-card-action` 3px; panel secondary combat band
     0.25rem.
   - Details tab shows a "?" attention marker; Build doesn't, though both can
     have unresolved choices.

7. **Advanced content options are developer tools** (information for the
   wrong audience). Decision: delete the section. Exact versions (pack IDs,
   digests) goes; `pnpm content-tool inspect` covers it. Raw rules XML and
   directory-scan import go: a new decision supersedes D021 (the browser
   installs `.4ecp` only; all conversion lives in the content tool), with
   `content-pack-format.md` and `implementation-status.md` updated; the web-only
   `legacy-rules-import` and `content-onboarding` modules go; package code
   stays for the tool. Persistence/quota numbers go. Persistent
   storage moves to a library banner (proposal below). Status: implemented;
   visual review pending.

   Banner decision: shown on the library when there is at least one
   character, persistence is supported and not yet granted. Text: "Your
   characters are saved in this browser. Browsers can clear saved site data
   to free up space, which would delete them. Ask the browser to keep them."
   with [Keep my characters] and ×. Granted: banner disappears silently.
   Refused: becomes a warning ("Your browser won't promise to keep them. Back
   up your characters now and then…") with [Back up characters] (the
   Settings backup). × hides it for good in this browser; Settings → Backups
   & storage keeps a small "Keep data in this browser" button beside its
   storage sentence. Status: implemented; visual review pending.

Also fixed while implementing (same kinds):

- Three copies of `download()` (library, Settings, content-update dialog)
  are one `download.ts`, which also holds the character backup used by
  Settings and the banner.
- Dialog close buttons were an `Icon`, a raw lucide `X` and a literal "×";
  all are `<Icon name="remove" />` labelled "Close". The Shop dialog's plain
  header and blurred backdrop now match the others.
- The library grid's top margin stacked on the heading's bottom margin.
- Keyboard reordering in Game content still announces "Moved X up/down" to
  screen readers (visually hidden), since that move isn't otherwise
  perceivable; the visible success line is gone.
