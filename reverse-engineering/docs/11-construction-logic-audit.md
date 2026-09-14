# Legacy Character Builder construction-logic audit

## Scope and evidence boundary

This audit traces the original builder's construction path from the recovered
`Character_Builder` pages into `D20Workspace` and the native functions recovered
in `D20RulesEngine/-Module-.cs`. It covers candidate enumeration, prerequisites,
visibility, grants/drops, choice slots, fixed-point updates, levels, replacements,
suggestions, duplicate/ownership behavior, and saving. The ignored
`CBLoader/Cache/combined.dnd40.merged.xml` corpus was used only to corroborate
that the recovered statement forms occur in real data. No decompiled source or
private corpus content is copied into public fixtures.

Every behavior reported in the ledger is **Confirmed** under the labels in
[00-evidence-and-scope.md](00-evidence-and-scope.md): it comes from direct
executable control flow and is corroborated by callers or data. The confidence
column further distinguishes **high** recovery clarity from **medium** where
native names or string constants are obscured. This ledger does not guess through
unclear code.

## End-to-end entry points

| Surface | Recovered entry points traced | Result |
|---|---|---|
| General choices | `ExpanderD20Choice.MakeChecklist`, `ExpanderChoice.Construct`, `FillOutListBox`, `M_D20Choice.Choose` | Pages enumerate active `D20Choice` objects by a predefined type order, then render the engine's per-type candidates. Choosing updates the occurrence and the application performs a workspace update. |
| Feats, powers, skills | `FeatPage.DisplayFeatTree`, `PowerPage` candidate tree, `SkillPage`, `D20Choice.Legal`, `LegalExplanation` | Legal and source-owned options are shown by default. Show Illegal includes failed/unowned options with an explanation; specialized pages group and sort independently. |
| Topology | `ExecuteRules`, `ExecuteRulesStatement`, `VerifyGrant`, `VerifySelect`, `VerifyReplace`, `VerifyDrop`, `VerifyChild` | Ordered rule positions own ordered child occurrences. Skeleton passes create/align those children and choices before normal stat/text/modify/suggest execution. |
| Update | `D20Workspace.DoUpdate`, `UpdateInternal`, `UpdateSelections`, `RecordCharElements`, `DoDeferred`, `EraseUnownedSelections` | The engine rebuilds derived state and repeats when a topology operation sets the restart flag. |
| Replacement UI | `ReplacementsPage.DisplayToLose`, `DisplayToGain`, `ChooseToLose`; engine `BuildReplaceList`, `UpdateReplacement`, `ReplaceElement` | Replacement is a two-stage choice: select an owned occurrence to lose, rebuild, then choose a legal gain candidate derived from that source/mode. |
| Levels/history | `D20Workspace.LevelUp`, `Delevel`, `History`; `LevelPage.SyncLevel`, `History_Click` | Level frames contain internal level records and durable per-level state. History changes only the evaluation horizon; delevel explicitly destroys trailing frames. |
| Save | `MainWindow.DoSave`, `D20Workspace.Save`, `SaveCharacter` | Save exits history mode and writes regenerated sheet caches plus authoritative campaign, level, loot, user-edit, grabbag, and text state. |

## Behavior ledger

| Area | Confirmed behavior | Prior documentation | Audit disposition | Confidence | Likely modern impact |
|---|---|---|---|---|---|
| Candidate domain | `SetChoiceType` attaches the choice to the type database's complete element array. Candidate index is the record's type ordinal; parallel bitsets store legal and already-selected state. | `04` said database/type order plus suggestion ranking. | Corrected: suggestions never reorder the core array. | High | Keep stable content ordinals separate from UI sorting and recommendation metadata. |
| Candidate legality | `UpdateArrays` initializes all bits legal, then clears legality for failed `CheckLegality`, category/dynamic-class restrictions, selected-theme restrictions, and hard-coded exceptions. It separately marks definitions already active at the choice level. | Broadly documented in `04`/`05`; `Prereqs` had recently been corrected from display-only to executable. | Confirmed and sharpened. | High | Candidate decisions need distinct reasons for prerequisite, category, dynamic class, duplicate, and entitlement failures. |
| `Prereqs` internalization | Database load calls `InternalizePrereqs`; semicolon blocks become AND branches. `InternalizeBlock`/`InternalizeOr` resolve names/IDs, type limits, levels, tiers, abilities, training, proficiency, class/source tests, and special predicates into `Prereq` nodes. A tilde marker creates negated prerequisites for same-type records carrying that marker. `CheckLegality` evaluates the tree. | `04` now identifies `_INTERNAL_PREREQS`; D030 makes it authoritative. | Confirmed. Exact native token coverage is not yet exhaustively transcribed, so this audit does not claim a complete grammar beyond traced branches. | High for the pipeline; medium for the full token catalog | Replace heuristic prose splitting with a database-resolved prerequisite IR incrementally. The current blanket success for most uppercase tilde markers is a confirmed mismatch: they express mutual exclusion. Retain explicit unverified diagnostics until every native token family is evidenced. |
| Printable prerequisites | `print-prereqs` is consulted when producing a friendly failure reason, not when deciding the boolean. `FeatPage` uses `choice.Legal`; `CategoryForFeat` can inspect the internal tree for grouping. | Previously ambiguous, recently corrected. | Confirmed. | High | Never feed printable prose into eligibility. Preserve it for display and explanation matching only. |
| Visibility / Show Illegal | Generic, feat, power, and skill paths hide failed or unowned candidates by default and reveal them under their Show Illegal state. The selected record is appended/recovered even when it falls outside the normal visible set. | `06` required explaining unavailable options but did not fully state the selection boundary. | Expanded in `05`. | High | “Show unavailable” must not mutate candidates; selected illegal/missing options must remain visible and repairable. |
| Choosing illegal vs unowned | `D20Choice.Choose(index)` checks `RulesElementIsOwned` (source entitlement), not `Legal(index)`. Thus Show Illegal can select a prerequisite/category-illegal record; update then marks the occurrence/character illegal. It cannot ordinarily select a source-unowned candidate through this API. | Ownership and legality were conflated. | Corrected in `05`. | High | Model entitlement and rules legality separately. A single `eligible` boolean loses a native distinction important to house-rule UX. |
| Slot creation | `select/@number` causes `VerifySelect` to align exactly that many positional child occurrences. Each child owns one `D20Choice`; optional comes from the rule. Validation discards and reconstructs a malformed child list rather than shifting later slots. | Documented at a high level. | Confirmed and sharpened. | High | Stable slot identity should include provider occurrence, rule ordinal, and slot ordinal; malformed imported topology should be diagnosed before deterministic reconstruction. |
| Choice resolution | Loaded children are copied into the choice when type-compatible. `D20Choice.Update` first calls `IsActive`; a statement-level failed `requires` returns before choice synchronization, so its serialized child remains recoverable but is not active/tallied. Update synchronizes an active chosen definition into the child occurrence. Defaults can fill blanks; changing a selection erases its derived children. The Ranger grant record confirms the generic negative-requirement form: its Prime Shot/Running Attack select requires `!ID_FMP_CLASS_FEATURE_1030` (Beast Mastery). | Statement-level `requires` had been described as candidate eligibility, which was imprecise. | Corrected in `04` and `05`. | High | Reconcile active topology separately from durable saved topology. An inactive provider rule suppresses its child and subtree without deleting them, and reactivation restores the saved choice. |
| Grants | Each grant owns a positional child. In skeleton mode it sets level bounds, assigns the definition, conditionally executes the child, and may defer it to a future level. Global active membership is deduplicated by definition while the occurrence tree remains intact. | “Tally tracks providers” was directionally correct but imprecise. | Clarified here; no stronger provider-count claim is made. | High | Preserve occurrence topology even when active-definition membership collapses duplicates. Do not serialize only a set of IDs. |
| Drops | A drop either unlinks every active occurrence of a named/type definition or resolves a named select (following its replacement chain) and unlinks that chosen occurrence. Rebuild restores membership when the dropping provider stops applying. | Broadly documented. | Confirmed. | High | Implement named-select drops and replacement-chain resolution, not only definition-ID suppression. |
| Fixed point | Each update clears derived membership/stats/mods/suggestions, replays two skeleton passes per level, drains deferred children, executes every active occurrence and then the full level roots, applies psionic/equipment phases, then updates choices. Topology changes restart the whole process. | Phase order was compressed and attributed deferred work to every pass. | Corrected in `05`. | High | Compare modern evaluator phase order, especially deferred future-level grants, grabbag timing, equipment-before-choice refresh, and restarts caused by defaults/duplicate clearing. |
| Convergence bound | The restart flag is tested after each `UpdateInternal`; failure occurs when the post-pass counter exceeds 30, allowing entry into a 31st pass. The path returns false without a useful native convergence explanation. | Stated simply as a 30-iteration cap. | Corrected and separated legacy fact from modern diagnostic requirement. | High | Pick and document an intentional modern bound; test nonconvergence without relying on an assumed exact “30 executions” parity. |
| Completeness | An active, nonoptional choice with no chosen definition makes the character incomplete. A replacement or `existing` select with no possible lose target is specially exempted. Completeness and legality remain separate. | Mostly documented. | Confirmed with the no-target exception. | High | Avoid reporting impossible replacement/existing slots as ordinary missing required choices. |
| Duplicate handling | `D20Choice.CheckPrevious` clears a chosen definition when that exact definition, or its narrowly defined pass-through target, is already active at the relevant level. `PassThru` follows exactly one rule only when the chosen wrapper's sole rule is a `grant` resolving to stock `Proficiency` or `Skill Training`; it is not general semantic equivalence. The check excludes the choice's own occurrence and its children. It retains a choice whose definition name case-insensitively matches the literal or `[Character Text Key]` default, and retains the exact definition of the current replacement source. An earlier-level duplicate counts only when the definition was also active at the immediately preceding level; same/later-level and unlevelled occurrences pass the auxiliary level gate. `Selected` remains a separate active-membership bit. | Described as generic duplicate-choice invalidity. | Sharpened from `D20Choice.CheckPrevious`, `PassThru`, `AlreadyHas`, and `InternalRule.GetDefault`. | High | Duplicate policy is contextual, not a blanket legality failure. Keep default, pass-through, replacement-source, and historical level-mask behavior explicit. |
| Entitlement ownership | `RulesElementIsOwned` recursively checks a record dependency field and then source categories against the entitlement list (with Core added). With no entitlement list, every definition is owned. | “Ownership” mixed content access with provider topology. | Separated from occurrence membership. | High | Rename concepts in diagnostics/domain code: source-entitled, active definition, and owning provider are three different relations. |
| Suggestions | Full rule execution appends unique suggested definitions in rule encounter order. Feats put them in a preferred category. `AutoComplete` tries eligible/unselected suggestions first, then specialized and fallback heuristics; a fallback can choose randomly. | `04`/`05` said suggestions never satisfy a slot. | Corrected. | High | If Auto Pick is a compatibility goal, implement suggestion-first behavior and make randomness controllable for tests. Normal manual evaluation must remain deterministic. |
| Presentation order | Generic expanders preserve source buckets and optionally sort by display name; feats, powers, skills, and replacements have specialized sort/group logic. | One universal domain-order statement. | Corrected in `04`/`06`. | High | Preserve engine candidate identity/order while allowing explicit per-surface view models. Do not infer serialization identity from locale/display order. |
| Replacement/retraining | Replace choices first build an occurrence list to lose. After `ChooseToLose` and update, the gain type/category derives from mode and source. The chosen source remains linked and is included even if inactive; replacement traversal supports chains. Multiclass, powerswap, power-replace, ordinary, and retrain paths have distinct filters/exceptions. | High-level description was accurate. | Confirmed; exact exception details remain in `08-hard-coded-exceptions.md`. | High | Keep target-occurrence identity in commands and persistence. Candidate legality must be evaluated against the selected target, not a type-wide union. |
| Level acquisition | `LevelUp` exits history, appends internal “Level N” frames, initializes money at level 1, carries forward per-level text keys, then updates. `Delevel` exits history, deletes trailing frames, then updates. | Broadly documented. | Confirmed; carried per-level text behavior was missing. | High | Advancement and delevel are transactions over frames and per-level strings, not just a numeric level field. |
| History | `History(level)` changes a cutoff pointer and updates when the horizon changes. Choices acquired later become inactive without deleting their durable frame state. | Documented. | Confirmed. | High | All active queries and caches must be keyed by effective horizon; save/export must deliberately leave history mode. |
| Save effects | `Save` calls `History(-1)`, which updates only if that changes the horizon, and otherwise requests no fresh update before serialization. It writes generated sheet caches before campaign and authoritative per-level state, then writes grabbag/text strings. Only after successful output does it set in-memory `Character Save File`; the UI clears dirty state and registers the file. | Save was listed only as a workflow. | Added to `06`. | High | Ensure export waits for the latest successful evaluation, never exports a history snapshot, and tests path/dirty-state semantics separately from byte generation. |

## Prioritized implementation follow-ups

1. **P0 — prerequisite IR parity:** replace the modern evaluator's heuristic
   semicolon/comma parser with a resolved prerequisite tree matching
   `InternalizePrereqs`/`CheckPrereq`. Remove the blanket-success treatment of
   tilde markers and implement their same-type mutual exclusion. Build the
   token-family ledger from code before converting any other `unverified` result
   to pass or fail.
2. **P0 — separate ownership dimensions:** represent source entitlement, active
   definition membership, provider occurrence ownership, and rules legality as
   distinct facts and diagnostics. Preserve the native ability to house-rule a
   legal-bit failure without treating unowned content identically.
3. **P1 — update-phase differential fixtures:** add synthetic tests for two
   skeleton passes, future-level deferred grants, named-select drops, default-
   caused restart, duplicate clearing/pass-through, grabbag timing, and an
   impossible replacement slot's completeness exception.
4. **P1 — replacement target fidelity:** expand fixtures across ordinary,
   retrain, multiclass, powerswap, power-replace, spellbook, and chained
   replacement modes with explicit source occurrence identities.
5. **P1 — save/history contract:** verify that regenerated export is based on a
   current full-level evaluation, not a historical horizon or stale worker
   result, and that authoritative level/user-edit/grabbag state survives a
   semantic re-import independently of generated sheet caches.
6. **P2 — Auto Pick compatibility:** if retained as a product feature, implement
   suggestion-first selection and inject deterministic randomness for tests.
7. **P2 — explicit presentation policies:** document and test view sorting per
   domain while keeping engine candidate ordinals stable and locale-independent.

## Unresolved evidence boundaries

- The complete native vocabulary accepted by `InternalizeItem` and every
  hard-coded prerequisite callback is larger than the connective path audited
  here. It must be transcribed from code/corpus families before claiming an
  exhaustive grammar.
- Several decompiled static strings are encoded as generated symbols, so this
  audit describes their control-flow role without assigning unevidenced field
  names or player-facing wording.
- Native auto-completion eventually uses `rand()` seeded from wall-clock time.
  This is confirmed nondeterminism in the optional Auto Pick workflow, not
  permission for nondeterminism in ordinary evaluation.
