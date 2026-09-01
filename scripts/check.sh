#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
scratch_dir="$(mktemp -d -t 4ecb-public-check.XXXXXXXX)"
trap 'rm -rf -- "$scratch_dir"' EXIT

cd "$project_root"
pnpm format:check
pnpm lint
pnpm test
pnpm build

test -f apps/web/dist/sw.js
test -f apps/web/dist/manifest.webmanifest
test -f apps/web/dist/runtime-config.json
jq -e '.display == "standalone"' apps/web/dist/manifest.webmanifest >/dev/null
if find apps/web/dist -type f \( -name '*.4ecp' -o -name '*.dnd4e' \) \
  -print -quit | grep -q .; then
  echo "Private content artifact found in public web build" >&2
  exit 1
fi

build_pack() {
  local output="$1"
  pnpm content-tool build \
    --input fixtures/content/synthetic.dnd40.xml \
    --output "$output" \
    --id synthetic \
    --name "Synthetic development content"
}

build_pack "$scratch_dir/first.4ecp"
build_pack "$scratch_dir/second.4ecp"
cmp "$scratch_dir/first.4ecp" "$scratch_dir/second.4ecp"
pnpm content-tool validate "$scratch_dir/first.4ecp"
pnpm content-tool diff "$scratch_dir/first.4ecp" "$scratch_dir/second.4ecp"
pnpm benchmark:query "$scratch_dir/first.4ecp"

echo "All public checks passed."
