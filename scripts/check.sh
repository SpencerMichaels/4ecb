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

echo "All public checks passed."
