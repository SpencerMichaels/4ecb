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
# CI runs the print check as its own job (print-checks in .github/workflows/ci.yml)
# so it doesn't hold up image publishing; locally it runs here unless skipped.
if [[ "${FOURECB_SKIP_PRINT_CHECK:-}" != 1 ]]; then
  pnpm check:print
fi

test -f apps/web/dist/sw.js
test -f apps/web/dist/manifest.webmanifest
test -f apps/web/dist/runtime-config.json
jq -e '.display == "standalone"' apps/web/dist/manifest.webmanifest >/dev/null
node scripts/check-built-pwa.mjs
if find apps/web/dist -type f \( -name '*.4ecp' -o -name '*.4ecc' -o -name '*.dnd4e' \) \
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

# Campaign documents (D116): deterministic build, checked against the pack
# (every field patch must still apply: the drift guard), then decoded and
# verified again by inspect.
build_campaign() {
  pnpm --silent content-tool campaign build \
    --manifest fixtures/campaigns/synthetic/campaign.json \
    --output "$1" \
    --against "$scratch_dir/first.4ecp" >"$1.json"
}

build_campaign "$scratch_dir/first.4ecc"
build_campaign "$scratch_dir/second.4ecc"
cmp "$scratch_dir/first.4ecc" "$scratch_dir/second.4ecc"
jq -e '.against.patches | length == 2 and all(.status == "applies")' \
  "$scratch_dir/first.4ecc.json" >/dev/null
pnpm --silent content-tool campaign inspect "$scratch_dir/first.4ecc" |
  jq -e '.validation.valid and .houseRules.recordCount == 4 and .patches == 2' >/dev/null
# Record aliases (D116): the authored "Also Known As" is parsed at build.
gzip -dc "$scratch_dir/first.4ecc" |
  jq -e '[.houseRules.entities[] | select(.aliases == ["Sea Mother"])] | length == 1' >/dev/null
pnpm --silent content-tool advertise-campaign "$scratch_dir/first.4ecc" \
  --out-dir "$scratch_dir/deploy" >/dev/null
jq -e '.campaigns | length == 1' "$scratch_dir/deploy/runtime-config.json" >/dev/null

echo "All public checks passed."
