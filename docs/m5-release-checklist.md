# M5 functional closure checklist

This is the durable functional closure matrix for the first offline builder MVP.
It deliberately does not make exhaustive UI, device, assistive-technology, or
cross-engine visual validation an M5 blocker: those checks apply to the designed
interface and are owned by M5.5. A green automated test is evidence only for its
stated boundary.

## Public automated gate

Run `nix develop path:. --command ./scripts/check.sh`. It must pass formatting,
lint, all TypeScript projects and public tests, the production/PWA build and
runtime-config cache assertion, deterministic content-pack build/validation,
and the query benchmark. Private corpus and character evidence stays ignored and
is run through the documented private scripts.

## Functional browser evidence retained in M5

| Client                   | Functional evidence                                                                                                  | Structural baseline                           | Print regression                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| Current desktop Chromium | Live structural and focused product flows pass; broader functional smoke runs remain appropriate as behavior changes | Top-level semantic audit and route focus pass | Automated Letter/A4 color/monochrome pass |
| Current desktop Firefox  | Ordinary-file fallback is implemented; targeted functional checks remain appropriate as behavior changes             | Structural contracts shared with Chromium     | Automated Letter/A4 color/monochrome pass |

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

These checks establish a low-cost implementation baseline. Full workflow
keyboard traversal, screen-reader testing, zoom/reflow review, and touch-target
approval are M5.5 checks against the designed interface.

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

Representative desktop/tablet interaction and rendering timings are fixed and
measured in M5.5 after the UI design stabilizes. Development-host engine/query
budgets remain active during M5.

## User documentation checklist

- [x] Installation/self-hosting, private content preparation/import, storage
      persistence, exact-revision migration, both `.dnd4e` targets, sheets/PDF,
      backup inspection/restore, PWA updates/offline recovery, and destructive
      actions are documented in the user guide.
- [x] Known product, compatibility, current browser evidence, deferred M5.5 UI
      validation, Firefox tagging, and reserved runtime-configuration limitations
      are stated without an MVP completion claim.

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
      application matrix. The executable/config/cache paths, direct-open
      argument contract, three-candidate regeneration commands, and manual
      observation fields are recorded in `docs/legacy-builder-launch-matrix.md`.
      The 2026-09-01 host had no project-local Wine/Xvfb/.NET Framework runtime,
      so all original-application rows remain explicitly unexecuted.
- [ ] Close the named M4 native exception and private exact-profile parity
      blockers without reclassifying cross-profile diagnostics as goldens. The
      fixed-output slice covers Bond of Censure and three exact ongoing-10 hit
      forms plus the Dexterity-modifier ongoing branch, with Hu now 52/52 on
      exact-profile cached power fields and a zero-diagnostic level-5 native
      selection audit; five identified native special entities remain
      explicitly unsupported.
- [x] Repeat the automated Letter/A4 color/monochrome PDF matrix in supported
      Firefox.

Safari/device print execution and cross-engine raster inspection are M5.5
visual-validation work. They do not block the functional M5 boundary.

## Deferred UI stabilization and release-readiness matrix (M5.5)

The following work is intentionally recorded here for continuity but does not
block M5:

- complete keyboard traversal in Chromium and Firefox;
- screen-reader announcement and validation-summary testing;
- 200% zoom, reflow, and touch-target review;
- full desktop Safari, iPadOS Safari, and Android Chromium tablet workflows;
- Safari/device print and Firefox/Safari raster inspection;
- representative supported-device interaction and rendering timings; and
- final visual accessibility review after the product-owner design pass.

M5 is not complete while an unchecked item in its functional, security,
compatibility, or durability sections maps to an M5 exit criterion. Items in
this deferred section are owned by M5.5.
