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

| Client                                 | Critical workflows                                                                          | Keyboard/semantics                                                          | Letter/A4 print     | Status  |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------- | ------- |
| Current desktop Chromium               | Content/profile, compendium, character import/edit/sheet/export, backup, PWA update/offline | Top-level semantic audit and route focus pass; full workflow traversal open | Open                | Partial |
| Current desktop Firefox                | Ordinary-file fallback required; full workflow open                                         | Open                                                                        | Open                | Open    |
| Current desktop Safari, where feasible | Ordinary-file fallback required; full workflow open                                         | Open                                                                        | Open                | Open    |
| Current iPadOS Safari                  | Builder/sheet/content/backup workflow open                                                  | Reflow/touch/keyboard open                                                  | Print/PDF open      | Open    |
| Current Android Chromium tablet        | Builder/sheet/content/backup workflow open                                                  | Reflow/touch/keyboard open                                                  | Platform print open | Open    |

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

## Compatibility, print, and durability closure

- [x] Repository reconstruction, historical database upgrade, checksummed
      backup/restore, malformed restore rejection, and interrupted migration are in
      the automated durability matrix.
- [x] Original `.dnd4e` preservation and edited 0.07a regeneration have public
      round-trip/escaping/profile-revision gates.
- [ ] Open edited exports in the original Windows builder across the curated
      application matrix.
- [ ] Close the named M4 native exception and private exact-profile parity
      blockers without reclassifying cross-profile diagnostics as goldens.
- [ ] Produce and inspect Letter and A4 color/monochrome PDFs with short and long
      card prose in supported browser print engines; record dimensions, page count,
      extracted text, and clipping/overflow evidence.

M5 is not complete while any unchecked item above maps to an MVP exit criterion.
