# Selected Nerd Fonts symbols

`nerd-symbols-v3.4.0.woff2` is a WOFF2 subset of Nerd Fonts v3.4.0's
`SymbolsNerdFont-Regular.ttf`, not an application text font.

- Source: https://github.com/ryanoasis/nerd-fonts/tree/v3.4.0/patched-fonts/NerdFontsSymbolsOnly
- Included glyph: `nf-fa-dice_d20`, U+EEF5 (Font Awesome's number-free d20).
- Symbols-only font license: `LICENSE-Symbols.txt`.
- Font Awesome font license and attribution: `LICENSE-Font-Awesome.txt`.

Regenerate from the repository root:

```sh
nix develop path:. -c bash scripts/build-icon-font.sh
```

When adding selected glyphs, update both the script's Unicode list and the
Nerd Fonts registry in `src/Icon.tsx`. Do not add the entire font or a remote
font dependency; the application must remain self-contained and work offline.
