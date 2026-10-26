# User guide and recovery handbook

This guide covers the current offline builder and its M5.5-designed builder,
library, and Equipment interfaces. It explains the data boundary and every
shipped installation, import, migration, backup, recovery, update, sheet, and
export workflow. The remaining release limitations are listed explicitly at
the end.

## Before you begin

The public application contains no official D&D 4E rules data, legacy
application, decryption keys, or imported characters. You need:

- a current desktop Chromium- or Firefox-family browser for the verified
  automated PDF paths; broader Safari and tablet release checks are scheduled
  for 1.0 hardening;
- a private `.4ecp` content pack or a decrypted, fully merged `.dnd40.xml`
  rules file; and
- optionally, an existing `.dnd4e` character to import. A new authoritative
  character can instead start at level 1 from the active content profile.

Characters and private packs stay in the current browser profile's IndexedDB.
There is no account, sync service, server-side copy, or telemetry. Treat the
native JSON library backup and your original private source files as your
recovery copies.

While the application remains open, ordinary character and Settings navigation
reuses loaded content and indexes. Refreshing
or closing the tab destroys that temporary in-memory state, so the next page
load reconstructs it once from IndexedDB; it does not require re-importing the
pack.

## Install or self-host the application

For a hosted deployment, open its HTTPS URL and use the browser's install
action when offered. Installation is optional; the same application works in a
normal tab. Once it has loaded, it also works offline; it doesn't announce
this. When a new version is available, an update icon (an arrow in a circle)
appears in the top bar to the left of Settings; clicking it reloads into the
new version and keeps your characters.

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

1. Open **Settings**, then find **Game content**.
2. Choose **Add content pack** and select a `.4ecp` file. Wait for decoding,
   validation, and storage to complete. Cancelling before completion saves no
   partial pack.
3. Choose **Review content changes**, inspect the short replacement summary,
   then choose **Use this content**. New characters bind to the exact ordered
   IDs/digests and `last-pack-wins-v1` policy; existing characters keep their
   prior binding until migration is previewed and explicitly adopted.

Open **Advanced content management** to reorder several added packs, inspect
exact identities and overridden record IDs, import decrypted/merged
`.dnd40.xml` rules data, scan a local content directory, or review exact browser
quota details. Set the local profile ID and name before importing rules XML. A
deployment-provided group-content layer stays first. Downloads and imports
alone never change the content available to the builder or any character.

Under **Backups & storage**, request persistent storage if the Advanced browser
storage details offer it. A grant reduces eviction risk but does not replace
backups.

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

1. To start without the old application, choose **New Character** on the
   **Characters** page. The new record opens immediately in the builder and can
   be named under **Character details**. It binds to the active pack ID and
   digest and starts at level 1 with the legacy point-buy baseline
   of `8, 10, 10, 10, 10, 10`. Spend the displayed 22 points in **Ability
   Scores**; the timeline remains unresolved until the exact budget is spent.
   Direct score entry is available for rolled or custom arrays, which are kept
   but identified as house rules when they do not satisfy point-buy legality.
   The profile supplies the remaining required mechanical choices.
2. To bring in an existing character instead, choose **Import** and pick a
   `.dnd4e` or `.4ecb` file. `.dnd4e` files are limited to 10 MiB. Read the
   import report; unknown extensions remain preserved and warnings are not
   silently discarded. A `.4ecb` package is added as-is, with its portrait and
   content binding; importing one whose character is already in the library
   adds a second copy rather than replacing it.
3. Use **Edit build** for level history, ability inputs, choices, inventory,
   retraining, undo, and redo. The bound exact profile supplies candidates and
   rules evaluation. **Current level** under **Character details** can jump to
   levels 1–30 and uses the profile's canonical `ID_INTERNAL_LEVEL_n`
   definitions for each intervening frame.
4. Use **Character sheet** for the evaluated sheet and print controls. If the exact
   profile or evaluation is unavailable, the application shows a labeled
   legacy cached fallback instead of mixing calculated revisions.
5. **Duplicate** makes an independent browser record. **Move to trash** is
   recoverable from the Trash section; **Delete permanently** is not.

Title and notes remain native record metadata and do not directly rewrite the
compatibility document.

## Manage equipment, money, and practices

Open **Equipment** while editing a character. Inventory is the main view;
**Loadout** swaps the left pane without moving the shared detail viewer.

- **Loadout** assigns owned compatible items to explicit body, hand, ring, and
  other equipment slots. Imported characters may initially show a legacy
  equipped count without a known slot; assigning the item makes that placement
  explicit without discarding the imported count first.
- **Inventory** edits quantities and the five copper, silver, gold, platinum,
  and astral denominations in carried or stored money. Sales remove one copy
  and credit carried money at the selected 20%, 50%, or 100% rate. Its
  collapsible headings use the same physical-role names as modern Shop Browse.
  Quantity reduction, sale, and loadout displacement immediately apply their
  reversible unequip effects. **Remove** discards a holding without proceeds
  and therefore requires two clicks on the same armed button; Escape or an
  outside click cancels the armed state.
- **Shop** is a peer editor tab. Browse by modern role, slot, subtype, source,
  rarity, or tier; the Filters disclosure also exposes the original builder's
  category names. Rituals, alchemical formulas, and martial practices are Browse
  categories, while ritual scrolls appear under Consumables. Affordable and
  Proficient filters start enabled; proficiency never prevents acquisition.
  **Buy** spends carried money first and then stored money. **Give** adds the
  exact item without spending money and remains available for items that cannot
  be purchased. The Funds Edit button opens the same carried/stored editor and
  Quick adjust workflow used by Equipment.

Magic-item family rows are only a browsing convenience. The collapsed row picks
the closest level not above the character; expand it to choose another exact
`+N` variant. Weapon, armor, shield, and superior-implement enchantments then ask
for an exact compatible physical item. Choosing the standard implement option
stores the standalone magic item required by legacy `.dnd4e`; choosing a
superior implement stores its exact ordered composition.

If the selected item grants one or more choices, Shop presents one acquisition
page for each choice before the compatible-base page. Choosing a candidate that
has its own required choice adds that nested page to the same flow. Power
choices include a full adjacent detail card; simpler choices use a compact
picker. The completed holding keeps the exact nested occurrence tree, displays
resolved choices as parenthesized suffixes everywhere its name appears, and
shows a resolved Power as a sibling detail card after the item card. These
choices are fixed for that acquired copy rather than appearing later as Build
tasks.

Each rules candidate table has its own control for showing rules-illegal
options. Those rows remain inspectable and explain why they cannot ordinarily
be selected; enabling one as a house rule does not change its exact content
identity.

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

## Export characters

Open the export icon on a character card and choose one of three formats:

- **.4ecb** creates a checksummed, versioned native package containing the
  complete current character record, including its portrait. Import it from
  the character library's **Import** button (adds a copy, never overwrites), or
  restore it from **Settings → Character library** like a full-library JSON
  backup (replaces a character with the same ID).
- **.dnd4e** always evaluates and regenerates the current edited state for
  Legacy Character Builder 0.07a. It re-imports the result and blocks download
  if the semantic round trip differs. The imported original XML remains
  embedded internally so unknown legacy fields can be retained, but the
  untouched original file is not a separate export choice.
- **PDF** opens the evaluated character sheet and starts the browser print/save
  PDF flow when the sheet is ready. Sheet paper, card, hit-point, and monochrome
  preferences still apply.

Regenerated `.dnd4e` writes authoritative base ability input separately from
the final regenerated ability cache so rule-derived bonuses do not become new
base scores when the file is re-imported.

Edited export also blocks on a missing/mismatched profile, nonconvergent
evaluation, an evaluation horizon behind the latest saved level, or invalid XML
characters. The public structural round-trip gate and the accepted
representative original Windows Character Builder open/save/reopen matrix pass.
That evidence does not promise that every future character-specific export is
free of an ordinary compatibility bug.

## Sheets and PDF printing

On **View sheet**, select Letter or A4, optional blank hit points, power/item
cards, and color or monochrome. Settings persist per character. Choose **Print
or save PDF** and confirm the same paper size in the browser print dialog.

The print preview's toolbar switches **Sheet: View | Edit**. **Edit** keeps
the paper preview and lets you right-click any card, or the first page of any
optional section — the play scratchpad, each full-reference group (features,
item reference, power index, rituals & practices, character profile) and
session notes; page 1 always prints. From the keyboard, Tab to a card or
section and press Enter, Space, the Menu key or Shift+F10. Each right-click
hides it, and right-clicking a hidden one shows it again.
Hidden things leave the preview exactly as they leave the printout. Tick
**Show hidden** in the toolbar to see them again in place: a hidden
card keeps its header and its bottom type bar (such as "Encounter Power ·
Level 3"), with a large faint "Hidden" where its text was
(sections as a short "Hidden" placeholder), and right-click them to bring
them back; printing never includes
hidden things, whether or not **Show hidden** is ticked. Hiding a power's
card keeps it on the scratchpad and in the power index, and page numbers
close up around hidden pages. An item's card
choice is saved on the item itself, so it carries over when the character is
exported to the original Character Builder. **Reset sheet to defaults** (click
again to confirm) prints everything again. Changes save automatically, are
kept per character in backups and copies, and don't change the character's
"last modified" time; printing (**Print or save PDF**, or **PDF** from the
library) always uses the saved choices.

The sheet's **Worn/Held Items** pane lists equipped gear by loadout slot, and
**Carried Items** lists only the copies that are not equipped (three daggers
with one equipped shows two). The encumbrance total still counts everything.

The browser-level **Settings → Display → Count coin weight** checkbox controls
whether carried coins contribute to sheet encumbrance. It starts enabled; turn
it off for groups that ignore coin weight. Stored coins never count. Changing
this preference does not change the recorded money or item weights.

The browser-level **Settings → Display** option **Use the best ability in power
descriptions** is enabled by default. When power prose offers several abilities,
View and print show only the highest available modifier and its value. Equal
modifiers prefer the higher underlying ability score, then the class's key
abilities in their authored order, then the power's first listed option. Turn
the setting off to retain the complete authored list. Named single-ability
modifiers and half-level expressions continue to show their current values
either way.

The automated production-artifact matrix covers current Chromium and Firefox,
Letter/A4, and color/monochrome with long and short card prose. Chromium output
is tagged; Firefox 154 output is currently untagged. Safari execution and
cross-engine raster inspection are deferred to 1.0 hardening.

## Back up and restore

Open **Settings** and choose **Back up library** after imports and meaningful
edits and before browser or application upgrades. The downloaded JSON contains active and trashed
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
  pack ID and digest. Activating a different profile does not silently change
  the character's pinned revision.
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
- Broad supported-client workflows, Safari printing, cross-engine raster review,
  and representative-device performance timings are deferred to 1.0 hardening.
  This project does not run a formal keyboard-only, screen-reader, 200%
  zoom/reflow, touch-target, or cross-client certification matrix (D063);
  structural safeguards remain continuous, and reported problems are ordinary
  bugs.
- Runtime configuration is reserved and network-only but not consumed by the
  current application. It cannot currently enable features or change URLs.

M5 and M5.5 are complete at the accepted functional and designed-interface
boundaries. The compatibility limits above remain explicit and recoverable.
M5.6 owns only the refined browser View parity surface; M5.7 owns final UI
cleanup and preparation of the existing Docker/PWA foundation for the product
owner's invited beta group. Desktop/tablet Play state and interaction move to
the beyond-parity M5.8 milestone, which M6 phone play depends on. The lightweight
browser, visual-print, security, migration, representative-device, and
release-performance hardening pass remains owned by M9.
