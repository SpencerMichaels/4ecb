# Functional and performance baseline

This document defines the public, repeatable Stage 0 baseline used by the
[functional refactor plan](functional-refactor-plan.md). It measures the
production application with synthetic content only. Private packs and
characters remain local diagnostics and must never be copied into this report,
its screenshots, or commits.

## Reproduction

Build first, then run the browser baseline from the project-local environment:

```sh
nix develop path:. -c pnpm build
nix develop path:. -c pnpm check:functional-baseline -- \
  --runs=3 --output=docs/evidence/functional-baseline-2026-09-23
```

The harness starts the production Vite preview and a fresh headless Chromium
profile at 1440 × 1000. It installs a deterministic public pack containing 420
feats and 260 Shop records, plus one native character with an inventory holding.
Three runs exercise cold library load, a direct editor load, warm reopen,
Build → Overview → Equipment → Shop → Sheet, a broad candidate filter, Shop
typing/filtering, save/undo/redo, browser back/forward, and direct hashes.

The JSON report is the raw evidence. Timing guardrails are reported there but
are not ordinary CI assertions because shared-host scheduling makes them
brittle. The harness does fail on missing or broken behavior, browser exceptions,
console warnings/errors, malformed instrumentation, or an invalid fixture. The
fixture itself is a normal deterministic unit test. The established Chromium
and Firefox PDF gate remains authoritative for cross-engine print geometry,
text, tags, overflow, paper size, color, and monochrome.

## Metric definitions

- **Bundle bytes:** each production JavaScript and CSS asset's file size and
  deterministic gzip-9 size. Main-route and aggregate assets remain distinct.
- **Worker requests:** intercepted `Worker` constructions, including their
  resolved production asset URL. Counts are compared before and after warm
  workspace navigation.
- **IndexedDB reads:** intercepted `get`, `getAll`, and `getAllKeys` calls on
  object stores and indexes. Record count is the number of returned values.
  Bytes approximate structured-clone payload size as JSON UTF-8 bytes plus
  `ArrayBuffer`/typed-array byte lengths. This is deliberately an application
  comparison metric, not browser disk allocation.
- **Long task:** a Chromium `PerformanceObserver` `longtask` entry. Interaction
  evidence considers entries attributed between input dispatch and the second
  animation frame; whole-journey long tasks remain present in each raw run.
- **Mounted row:** one rendered candidate result row, excluding its group
  heading, or one rendered Shop result row, excluding category headings.
- **Query to paint:** programmatic input event start through two animation-frame
  callbacks and the resulting row-count read.
- **Direct editor:** top-level navigation start until the character-name control
  and first-evaluation performance measure are present.
- **Warm reopen:** same-document library → editor hash change until the
  `4ecb:character-first-evaluation` measure appears.
- **Variance:** minimum, median, maximum, and sample standard deviation. Search
  summaries contain nine samples (three terms × three runs); journey summaries
  contain three samples.

## 2026-09-23 public baseline

Environment: Linux 6.18.48, AMD Ryzen 7 PRO 5850U, 16 logical CPUs, Chromium
152.0.7977.64, production preview, 1440 × 1000 viewport. These are development-
host comparison figures, not representative-device release budgets.

| Metric                                                |                                 Result |
| ----------------------------------------------------- | -------------------------------------: |
| Main application JavaScript                           |     600,058 bytes / 172,260 gzip bytes |
| Aggregate JavaScript including workers/service worker |           844,554 / 244,778 gzip bytes |
| CSS                                                   |             83,307 / 15,719 gzip bytes |
| Direct editor, median (range)                         |                 118.9 ms (115.4–156.3) |
| Warm reopen, median (range)                           |                    58.0 ms (57.1–60.0) |
| Candidate query-to-paint, median (range)              |                    28.6 ms (18.4–32.0) |
| Shop query-to-paint, median (range)                   |                    31.2 ms (15.5–56.7) |
| Candidate mounted rows                                | **420 (guardrail failure; limit 200)** |
| Shop mounted rows                                     |                             200 (pass) |
| Interaction-attributed long tasks                     |                               0 (pass) |
| Workers created during warm tab changes               |                               0 (pass) |

The cold library read six records and approximately 797,000 payload bytes. Two
content-pack reads accounted for approximately 794,218 bytes; two character
reads accounted for approximately 2,676 bytes. The first direct editor run read
six records and approximately 1,192,771 bytes, of which three content-pack reads
accounted for approximately 1,191,327 bytes. These figures make Stage 1's
metadata-read target measurable.

The synthetic candidate table honestly reproduces the current unbounded-DOM
violation with 420 mounted result rows. The Shop reaches its existing 200-row
bound. Warm navigation created no additional worker. Warm cached evaluation was
visible within 60.1 ms in all three runs. Although measured search interactions
contained no attributed long task, complete journeys did contain 61–108 ms long
tasks; the raw report retains their timestamps rather than attributing them to a
specific interaction without trace evidence.

## Evidence

- [Raw three-run report](evidence/functional-baseline-2026-09-23/functional-baseline.json)
- [Candidate table](evidence/functional-baseline-2026-09-23/candidate-table.png)
- [Inventory](evidence/functional-baseline-2026-09-23/inventory.png)
- [Funds dialog](evidence/functional-baseline-2026-09-23/funds-dialog.png)
- [Shop](evidence/functional-baseline-2026-09-23/shop.png)
- [Sheet View](evidence/functional-baseline-2026-09-23/sheet-view.png)
- [Print-media preview](evidence/functional-baseline-2026-09-23/print-preview.png)

The screenshots were reviewed at their captured resolution. They contain only
the public fixture and show the expected selector, Inventory, dialog, Shop,
sheet, and print-media surfaces without clipping in the captured viewport.
