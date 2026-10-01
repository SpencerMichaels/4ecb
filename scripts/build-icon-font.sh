#!/usr/bin/env bash
set -euo pipefail

# Run through nix develop path:. -c bash scripts/build-icon-font.sh.
# Keep this list in sync with the Nerd Fonts registry in apps/web/src/Icon.tsx.
task_dir=$(mktemp -d)
trap 'rm -f "$task_dir/SymbolsNerdFont-Regular.ttf"; rmdir "$task_dir"' EXIT
curl -fsSL \
  https://raw.githubusercontent.com/ryanoasis/nerd-fonts/v3.4.0/patched-fonts/NerdFontsSymbolsOnly/SymbolsNerdFont-Regular.ttf \
  -o "$task_dir/SymbolsNerdFont-Regular.ttf"
pyftsubset "$task_dir/SymbolsNerdFont-Regular.ttf" \
  --unicodes=U+EEF5 --flavor=woff2 --no-recalc-timestamp \
  --output-file=apps/web/public/fonts/nerd-symbols-v3.4.0.woff2
