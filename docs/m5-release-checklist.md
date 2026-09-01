# M5 release checklist

This is the durable closure matrix for the first supported offline MVP. A green
automated test is evidence for its stated boundary, not a substitute for the
named real-browser or original-application checks.

## Public automated gate

Run `nix develop path:. --command ./scripts/check.sh`. It must pass formatting,
lint, all TypeScript projects and public tests, the production/PWA build and
runtime-config cache assertion, deterministic content-pack build/validation,
and the query benchmark. Private corpus and character evidence stays ignored and
is run through the documented private scripts.

## Supported-client matrix

| Client                                 | Critical workflows                                                                          | Keyboard/semantics                                                          | Letter/A4 print                           | Status  |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------- |
| Current desktop Chromium               | Content/profile, compendium, character import/edit/sheet/export, backup, PWA update/offline | Top-level semantic audit and route focus pass; full workflow traversal open | Automated Letter/A4 color/monochrome pass | Partial |
| Current desktop Firefox                | Ordinary-file fallback required; full workflow open                                         | Open                                                                        | Automated Letter/A4 color/monochrome pass | Partial |
| Current desktop Safari, where feasible | Ordinary-file fallback required; full workflow open                                         | Open                                                                        | Open                                      | Open    |
| Current iPadOS Safari                  | Builder/sheet/content/backup workflow open                                                  | Reflow/touch/keyboard open                                                  | Print/PDF open                            | Open    |
| Current Android Chromium tablet        | Builder/sheet/content/backup workflow open                                                  | Reflow/touch/keyboard open                                                  | Platform print open                       | Open    |

Directory selection is progressive Chromium functionality. It never replaces
the ordinary `.4ecp` and decrypted/merged-rules file input used by every client.

## Accessibility checklist

- [x] One named primary navigation, one main landmark, a skip link, and a single
      application `h1`; live Chromium found no duplicate IDs or unnamed native
      controls on the empty-state Compendium, Characters, or Content settings pages.
- [x] Hash-route navigation moves programmatic focus to the new main landmark
      after the initial page load; the initial load does not steal focus.
- [x] Status and failure updates use polite live regions or alerts.
- [x] Native labels/legends cover current form controls; legality, profile,
      power-usage, and PWA states include text rather than color alone.
- [x] Normal-text palette pairs used by the shell and card headers meet the WCAG
      AA 4.5:1 contrast threshold. Item-card orange was darkened to meet it.
- [x] The shell no longer forces a 720 px viewport; dense compendium, library,
      editor, sheet, card, facts, and diagnostics layouts stack at tablet/narrow
      breakpoints without changing print rules.
- [ ] Traverse every create/edit/retrain/equip/save/export/restore action using
      only the keyboard in Chromium and Firefox.
- [ ] Run screen-reader announcements and validation-summary checks on the full
      installed-profile workflow.
- [ ] Verify 200% zoom/reflow and touch targets on the supported tablet matrix.

## Security and privacy checklist

- [x] Independent encoded and decoded pack limits, bounded directory discovery,
      bounded identity fields, complete nested pack/backup decoders, digest/checksum
      validation, and atomic storage writes have adversarial tests.
- [x] Imported strings are React text. The public source contract rejects raw
      executable-markup sinks.
- [x] Hosted HTML and the reference nginx image use restrictive content policy;
      the image additionally denies framing and unnecessary browser capabilities and
      sends no-sniff, no-referrer, and same-origin headers on every route.
- [x] The public build and image contain notices and no `.4ecp` or `.dnd4e`
      artifact. No analytics, telemetry, content upload endpoint, or decryption keys
      are present.
- [ ] Repeat the threat-model review after all remaining M5 behavior lands.

## Performance checklist

- [x] Query-engine full-corpus budgets are fixed and pass on the development
      host; the UI builds the index in a worker.
- [x] Rules evaluation and profile migration run in a worker and report elapsed
      time; the current complete private character evaluates in roughly 1.5 seconds.
- [x] Content parsing, pack construction, compression, and validation run in an
      import worker with progress and cancellation.
- [ ] Record full content import, level-30 edit/evaluation, initial shell, and
      print-preview timing on representative supported desktop/tablet hardware.

## User documentation checklist

- [x] Installation/self-hosting, private content preparation/import, storage
      persistence, exact-revision migration, both `.dnd4e` targets, sheets/PDF,
      backup inspection/restore, PWA updates/offline recovery, and destructive
      actions are documented in the user guide.
- [x] Known product, compatibility, browser/accessibility, performance, Safari
      print, Firefox tagging, and reserved runtime-configuration limitations are
      stated without an MVP completion claim.

## Compatibility, print, and durability closure

- [x] A native character can start at level 1 from an exact active profile,
      resolve required Race/Class/Feat and nested choices through the generic
      editor, advance with canonical level records through 30, persist/reload,
      and regenerate an edited `.dnd4e` with a semantic re-import gate.
      The ignored full-profile audit additionally resolves 63 real choices and
      8 retrainings on a Human/Fighter path, equips an item, constructs the
      authoritative sheet, and retains every replacement target through export.
      Psion, Shaman, Essentials Knight, and a distinct two-component Hybrid also
      complete level 30. All pass persistence, sheet, and
      edited-export semantic re-import gates, with only explicitly reported
      unverified prerequisites outside the zero-diagnostic
      Fighter/Psion/Shaman/Knight paths.
- [x] Repository reconstruction, historical database upgrade, checksummed
      backup/restore, malformed restore rejection, and interrupted migration are in
      the automated durability matrix.
- [x] Original `.dnd4e` preservation and edited 0.07a regeneration have public
      round-trip/escaping/profile-revision gates.
- [x] Pinned Chromium and Firefox generate five-page Letter and A4 PDFs in color
      and monochrome from 18 short/long-prose powers and six item cards. All pages
      have the requested dimensions, extracted text is complete, mutable hit points
      are blank, application chrome is absent, and no card reports DOM overflow.
      Chromium output is tagged; Firefox 154 output is not tagged.
- [ ] Open edited exports in the original Windows builder across the curated
      application matrix.
- [ ] Close the named M4 native exception and private exact-profile parity
      blockers without reclassifying cross-profile diagnostics as goldens.
- [x] Repeat the automated Letter/A4 color/monochrome PDF matrix in supported
      Firefox.
- [ ] Repeat the matrix in Safari and inspect Firefox/Safari raster output for
      visual regressions.

M5 is not complete while any unchecked item above maps to an MVP exit criterion.
