# User guide and recovery handbook

This guide covers the current M5 offline builder beta. It explains the data
boundary and every shipped installation, import, migration, backup, recovery,
update, sheet, and export workflow. The remaining release limitations are
listed explicitly at the end.

## Before you begin

The public application contains no official D&D 4E rules data, legacy
application, decryption keys, or imported characters. You need:

- a current desktop Chromium- or Firefox-family browser for the verified
  automated PDF paths; Safari and tablet validation is scheduled for M5.5 after
  the interface design stabilizes;
- a private `.4ecp` content pack or a decrypted, fully merged `.dnd40.xml`
  rules file; and
- optionally, an existing `.dnd4e` character to import. A new authoritative
  character can instead start at level 1 from the active content profile.

Characters and private packs stay in the current browser profile's IndexedDB.
There is no account, sync service, server-side copy, or telemetry. Treat the
native JSON library backup and your original private source files as your
recovery copies.

While the application remains open, ordinary Build, Sheet, Compendium,
Characters, and Content navigation reuses loaded content and indexes. Refreshing
or closing the tab destroys that temporary in-memory state, so the next page
load reconstructs it once from IndexedDB; it does not require re-importing the
pack.

## Install or self-host the application

For a hosted deployment, open its HTTPS URL and use the browser's install
action when offered. Installation is optional; the same application works in a
normal tab. After the service worker finishes, the header reports that the
shell is ready offline.

To run the reference container from this repository, use only the project-local
Nix environment:

```sh
nix develop path:. --command docker build -t 4ecb .
nix develop path:. --command docker run --rm \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 8080:8080 4ecb
```

Open `http://localhost:8080`. Public deployments should put the container
behind HTTPS. See [Public PWA and Docker deployment](public-deployment.md) for
health checks, proxy/cache requirements, security headers, and the reserved
runtime-configuration boundary.

## Prepare private content

If you already have a `.4ecp` file or decrypted, fully merged `.dnd40.xml`, you
can import it directly in the browser. Encrypted legacy containers and loose
`.part` files are intentionally not accepted by the public application.

Repository users with the supplied ignored private inputs can build and verify
a portable pack locally:

```sh
nix develop path:. --command bash scripts/build-private-content.sh
```

For another decrypted rules file, use the content tool:

```sh
nix develop path:. --command pnpm content-tool build \
  --input /path/to/merged.dnd40.xml \
  --output /path/to/private.4ecp \
  --id my-private-profile \
  --name "My private content profile"
nix develop path:. --command pnpm content-tool validate /path/to/private.4ecp
```

Pack IDs are 1–64 ASCII letters, digits, dots, underscores, colons, or hyphens
and start with a letter or digit; names are 1–120 trimmed characters without
control characters. Pack input and streaming decoded data each have a 128 MiB
limit.

## First run and content import

1. Open **Content settings**.
2. Review **Persistence and quota**. Choose **Request persistent storage** if
   available. A grant reduces eviction risk but does not replace backups.
3. Choose **Import file**, then select a `.4ecp` or decrypted/merged
   `.dnd40.xml`. For rules XML, set the local profile ID and name first.
4. Wait for decoding, parsing, validation, and storage to complete. Cancelling
   the worker before completion saves no partial pack.
5. Review the ordered profile. A deployment-provided baseline stays first;
   imported personal packs can be ordered above it. Collision preview identifies
   stable IDs whose later definition wins.
6. Choose **Activate profile**. Downloads and imports alone never change the
   Compendium or any character. New characters bind to the exact ordered
   IDs/digests and `last-pack-wins-v1` policy; existing characters keep their
   prior binding until migration is previewed and explicitly adopted.

Server-advertised packs download into the same offline IndexedDB cache. Their
URLs are not private merely because they appear in runtime configuration:
anyone with deployment access can download them. Personal packs remain in this
browser and are never uploaded.

Chromium-family browsers also provide bounded, read-only directory discovery.
Firefox and Safari use **Import file**, which accepts the same source formats.
Directory discovery examines filenames first and reads only the candidate you
explicitly install.

Installing a pack with an existing ID replaces that installed revision. Stored
characters remain bound to their exact original digest and show a mismatch
until that revision is restored or a migration is previewed and adopted.

## Create, import, and manage characters

1. To start without the old application, enter a name under **Create a new
   character** and choose **Create and edit**. The record binds to the active
   pack ID and digest and starts at level 1 with the legacy point-buy baseline
   of `8, 10, 10, 10, 10, 10`. Spend the displayed 22 points in **Ability
   Scores**; the timeline remains unresolved until the exact budget is spent.
   Direct score entry is available for rolled or custom arrays, which are kept
   but identified as house rules when they do not satisfy point-buy legality.
   The profile supplies the remaining required mechanical choices.
2. To bring in an existing character instead, choose **Import .dnd4e**.
   Character files are limited to 10 MiB. Read the import report; unknown
   extensions remain preserved and warnings are not silently discarded.
3. Use **Edit build** for level history, ability inputs, choices, inventory,
   retraining, undo, and redo. The bound exact profile supplies candidates and
   rules evaluation. **Add level** uses that profile's canonical
   `ID_INTERNAL_LEVEL_n` definitions through level 30.
4. Use **View sheet** for the evaluated sheet and print controls. If the exact
   profile or evaluation is unavailable, the application shows a labeled
   legacy cached fallback instead of mixing calculated revisions.
5. **Duplicate** makes an independent browser record. **Move to trash** is
   recoverable from the Trash section; **Delete permanently** is not.

Title and notes are library metadata. They do not rewrite either `.dnd4e`
export target.

## Manage equipment, money, and practices

Open **Equipment** while editing a character. Its four tabs share one item
detail viewer:

1. **Loadout** assigns owned compatible items to explicit body, hand, ring, and
   other equipment slots. Imported characters may initially show a legacy
   equipped count without a known slot; assigning the item makes that placement
   explicit without discarding the imported count first.
2. **Inventory** edits quantities and the five copper, silver, gold, platinum,
   and astral denominations in carried or stored money. Sales remove one copy
   and credit carried money at the selected 20%, 50%, or 100% rate.
3. **Shop** searches the complete active-profile catalog in bounded pages.
   Filter by type, source, slot, rarity, tier, level, or known proficiency.
   Magic weapon and armor enchantments ask for a compatible mundane base.
   Buying spends carried money first and then stored money; unavailable,
   unpriced, and unaffordable records cannot be bought.
4. **Rituals & Practices** distinguishes known rituals, alchemical formulas,
   and martial practices from quantity-bearing scrolls. Owning a scroll does
   not mark the associated practice known. Spellbook alternates remain under
   **Build → Spellbook**.

Magic-item family rows are only a browsing convenience. Choose the exact `+N`
variant before buying; the character stores that exact content record.

## Adopt a different content revision

Do not use ordinary metadata saving to accept a new content revision.

1. Install the target pack and open the character in **Characters**.
2. In **Content profile**, select the migration target and choose **Preview
   migration**.
3. Review missing/changed definitions, calculated stat and power differences,
   target legality/completeness, and diagnostics. If the exact source revision
   is absent, the preview says that it can perform target-only checks.
4. Choose **Adopt this profile revision** only after reviewing the result.

Adoption is disabled when the target does not converge. The preview is bound to
the target pack ID and digest; replacing that pack under the same ID requires a
new preview.

## Export compatibility characters

An imported character has two explicit `.dnd4e` targets:

- **Original imported file (no edits)** downloads the preserved XML
  byte-for-byte. Browser build edits and library metadata are intentionally
  excluded.
- **Legacy Character Builder 0.07a** evaluates the authoritative build against
  its adopted exact pack revision, regenerates the representable build and
  sheet caches, re-imports the result, and blocks download if the semantic
  round trip differs.

Native-created characters have no imported original, so they expose only the
regenerated 0.07a target. That target writes authoritative base ability input
separately from the final regenerated ability cache so rule-derived bonuses do
not become new base scores when the file is re-imported.

Edited export also blocks on a missing/mismatched profile, nonconvergent
evaluation, an evaluation horizon behind the latest saved level, or invalid XML
characters. The public structural round-trip gate passes, but the curated
original Windows Character Builder launch matrix is still a release blocker.

## Sheets and PDF printing

On **View sheet**, select Letter or A4, optional blank hit points, power/item
cards, and color or monochrome. Settings persist per character. Choose **Print
or save PDF** and confirm the same paper size in the browser print dialog.

The automated production-artifact matrix covers current Chromium and Firefox,
Letter/A4, and color/monochrome with long and short card prose. Chromium output
is tagged; Firefox 154 output is currently untagged. Safari execution and
cross-engine raster inspection are deferred M5.5 visual-validation checks.

## Back up and restore

Choose **Back up library** after imports and meaningful edits and before browser
or application upgrades. The downloaded JSON contains active and trashed
characters, authoritative builds, preserved compatibility XML, profile
references, and sheet settings. It does not include content packs; retain the
matching `.4ecp` files separately.

To restore:

1. Choose **Restore backup** and select the JSON file (maximum 100 MiB).
2. Review the non-mutating preview: format version, checksum status, active and
   trashed counts, and IDs that will replace existing records.
3. Choose **Restore _n_ record(s)** only when the preview is correct.

Version-2 backups verify a SHA-256 payload checksum for integrity and fully
decode every nested record before one storage transaction. The checksum is not
proof of authenticity; restore only files you intended to use. Version-1
backups remain accepted with an explicit no-checksum warning.

## Updates, offline use, and recovery

- When an application update is ready, choose **Reload and update** or defer it.
  Reloading replaces the cached shell and retains IndexedDB data. Back up first
  whenever practical.
- A completed initial load installs the shell for offline use. Verify readiness
  before intentionally disconnecting. Private content and characters already
  stored in that browser remain local.
- Interrupted historical-record migration is journaled. Reopening the
  application restores the untouched schema-1 record or finishes the schema-2
  conversion before removing the journal.
- If a character reports a missing profile, reinstall the `.4ecp` with the same
  pack ID and digest. If only a newer revision is available, use migration
  preview/adoption.
- If site data was cleared, the browser profile was lost, or storage was
  evicted, restore the character backup and reinstall the matching private
  packs. The server or container has no recovery copy.
- If an update appears stuck, close other tabs for the same installation and
  accept the update prompt again. Do not clear site data unless you have current
  backups and private packs.

## Current release limitations

- Exact implemented rules are authoritative. Unsupported native special powers
  report `native-special-case`, absent beast scores report `companion-ability`,
  and unknown prerequisite prose reports `prerequisite.unverified`; original
  content and cached sheets stay recoverable. Item-set/inherent behavior requires
  an explicit imported or serialized activation and is not inferred from an
  absent campaign setting. See the [compatibility ledger](m4-compatibility-ledger.md).
- Edited exports have not completed the curated original Windows application
  launch matrix.
- Full supported-browser critical workflows, keyboard traversal,
  screen-reader announcements, 200% zoom/touch/tablet checks, Safari printing,
  cross-engine raster review, and representative-device performance timings
  are intentionally deferred to M5.5, after product-owner UI design.
- Runtime configuration is reserved and network-only but not consumed by the
  current application. It cannot currently enable features or change URLs.

Only the original-application matrix prevents the final M5 completion claim.
The compatibility limits above are the explicit, explainable automated support
boundary. UI/device items are later release-readiness work and do not block the
functional M5 boundary.
