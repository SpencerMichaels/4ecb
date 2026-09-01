# Original Character Builder launch matrix

This matrix is the remaining executable compatibility check for regenerated
`.dnd4e` files. A successful semantic re-import into 4eCB is a prerequisite,
not evidence that the original Windows application opened the file.

## Recovered local application contract

The ignored reference installation is rooted at `CharacterBuilder/` and its
entry point is `CharacterBuilder/CharacterBuilder.exe`. It is a .NET Framework
2.0 WPF application. `CharacterBuilder.exe.config` declares the `*.dnd4e`
extension, and the recovered `MainWindow.CharacterSpecified` startup path calls
`Load(args[0])` when exactly one non-option argument is supplied.

The unmodified executable reads `combined.dnd40.encrypted` relative to the
application directory. The ignored CBLoader installation is rooted at
`CBLoader/`; its cache is `CBLoader/Cache/combined.dnd40.merged.xml`. CBLoader
patches `ApplicationUpdate.Client.dll` in memory so the builder reads the
merged cache, then forwards unparsed arguments to the builder. The ignored
`CBLoader/default.cbconfig` names `C:\CharacterBuilder`; that path is
local-machine configuration, not a portable repository path.

## Rebuilding the candidates

All outputs below stay under ignored `tmp/legacy-launch-matrix/`. Run commands
from the repository root through the project shell:

```sh
mkdir -p tmp/legacy-launch-matrix
nix develop path:. -c pnpm content-tool build \
  --input fixtures/content/synthetic.dnd40.xml \
  --output tmp/content/synthetic.4ecp \
  --id synthetic --name 'Synthetic development content'
nix develop path:. -c pnpm regenerate:edited-dnd4e \
  reverse-engineering/fixtures/character/minimal-structure.dnd4e \
  tmp/content/synthetic.4ecp \
  tmp/legacy-launch-matrix/public-synthetic-structural-edited.dnd4e
nix develop path:. -c pnpm regenerate:edited-dnd4e \
  'Hu Sheng-Ming Level 8.dnd4e' \
  tmp/content/full-local.4ecp \
  tmp/legacy-launch-matrix/imported-hu-level-8-edited.dnd4e
nix develop path:. -c pnpm audit:native-workflow \
  tmp/content/full-local.4ecp --max-level=1 \
  --output=tmp/legacy-launch-matrix/native-level-1-edited.dnd4e
```

The public synthetic case is intentionally a structural/custom-content
diagnostic: its IDs are not present in the legacy database, so missing-content
handling must be recorded rather than treated as a same-profile pass. The two
private cases use the exact `local-wotc-and-custom` pack digest reported by the
commands. Private characters, packs, and regenerated outputs are never public
fixtures or commit inputs.

## Execution procedure

Use an isolated Windows VM or Wine prefix with Microsoft .NET Framework 2.0/3.5
WPF support. Do not install dependencies globally. With the ignored evidence
copied to the Windows environment, the preferred same-profile invocation is
CBLoader so that the merged rules cache is active:

```text
CBLoader.exe --no-config --cb-path=..\CharacterBuilder --cache-path=Cache --folder=Custom --no-update <absolute-character-path>
```

For each candidate, record whether the process reaches the builder window,
whether it displays the named character rather than the character list or an
error dialog, whether build and sheet views render, and whether Save As then
reopens. Capture the exact dialog/log text and retain the resulting file
privately. A direct invocation is a separate stock-database diagnostic:

```text
CharacterBuilder\CharacterBuilder.exe <absolute-character-path>
```

## Observed matrix — 2026-09-01

| Candidate                                  | Provenance                                        | Regeneration evidence                                                                                      | Original application result    |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `public-synthetic-structural-edited.dnd4e` | Public structural fixture + public synthetic pack | Converged but incomplete/illegal with five retained missing-content diagnostics; semantic re-import passed | Not run: no compatible runtime |
| `imported-hu-level-8-edited.dnd4e`         | Ignored imported character + exact private pack   | Level 8 converged and complete; semantic re-import passed; two legality diagnostics retained               | Not run: no compatible runtime |
| `native-level-1-edited.dnd4e`              | Ignored native exact-profile audit                | Complete, legal, converged, zero diagnostics; 14 choices; one equipped item; semantic re-import passed     | Not run: no compatible runtime |

This checkout's root and reverse-engineering Nix shells contain no Wine, Xvfb,
Winetricks, or Microsoft .NET Framework runtime. No project-local Wine prefix or
offline Framework installer is present, and no Wine package is already in the
Nix store. Therefore the original application was not launched here. Adding a
new Wine/.NET acquisition path would expand the declared toolchain and still
would not truthfully establish WPF compatibility without the Microsoft runtime.
The release criterion remains open until the procedure above records actual UI
results on a prepared compatibility host.
