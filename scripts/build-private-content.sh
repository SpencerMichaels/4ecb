#!/usr/bin/env bash
# Builds a private content pack from the supplied legacy data.
#
#   scripts/build-private-content.sh [OUT]          # full pack (default
#       tmp/content/full-local.4ecp): stock WotC data + every CBLoader part
#       (checked against CBLoader's own merged cache) + 4ecb corrections.
#   scripts/build-private-content.sh --stock [OUT]  # stock pack (default
#       tmp/content/stock-local.4ecp): combined.dnd40.original.xml alone.
#
# The stock pack is a parity oracle, not product content. Some players'
# legacy builders ran stock WotC data without CBLoader parts; `pnpm
# parity:baseline` evaluates the saves listed in tmp/parity/
# content-profiles.json against it, so content differences don't hide engine
# ones. It takes no 4ecb corrections: they patch CBLoader-merged records (most
# target part-only IDs) or deliberately diverge from legacy, and the legacy
# builder that made those saves had neither.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
base_xml="${project_root}/CBLoader/Cache/combined.dnd40.original.xml"
parts_dir="${project_root}/CBLoader/Custom"
reference_merged="${project_root}/CBLoader/Cache/combined.dnd40.merged.xml"

if [[ "${1:-}" == "--stock" ]]; then
  output="${2:-${project_root}/tmp/content/stock-local.4ecp}"
  if [[ ! -f "$base_xml" ]]; then
    echo "Required private input is missing: $base_xml" >&2
    exit 1
  fi
  cd "$project_root"
  pnpm content-tool build \
    --input "$base_xml" \
    --output "$output" \
    --id "${PACK_ID:-local-wotc-stock}" \
    --name "${PACK_NAME:-Local stock WotC rules (parity oracle)}" \
    --source-key "legacy-base-only"
  pnpm content-tool validate "$output"
  echo "Stock content pack written to $output"
  exit 0
fi

output="${1:-${project_root}/tmp/content/full-local.4ecp}"
scratch_dir="$(mktemp -d -t 4ecb-private-content.XXXXXXXX)"
trap 'rm -rf -- "$scratch_dir"' EXIT

for required in "$base_xml" "$parts_dir"; do
  if [[ ! -e "$required" ]]; then
    echo "Required private input is missing: $required" >&2
    exit 1
  fi
done

shopt -s nullglob
parts=("$parts_dir"/*.part)
if (( ${#parts[@]} == 0 )); then
  echo "No .part files were found in $parts_dir" >&2
  exit 1
fi

cd "$project_root"
python reverse-engineering/scripts/merge_parts.py \
  "$base_xml" "${parts[@]}" -o "$scratch_dir/cbloader.xml"

# Parity check against CBLoader's own cache, before 4ecb corrections.
if [[ -f "$reference_merged" ]]; then
  python reverse-engineering/scripts/compare_rulesets.py \
    "$reference_merged" "$scratch_dir/cbloader.xml"
fi

# 4ecb's own corrections (content/corrections/*.part) apply last.
corrections=("$project_root"/content/corrections/*.part)
if (( ${#corrections[@]} > 0 )); then
  python reverse-engineering/scripts/merge_parts.py \
    "$scratch_dir/cbloader.xml" "${corrections[@]}" -o "$scratch_dir/merged.xml"
else
  cp "$scratch_dir/cbloader.xml" "$scratch_dir/merged.xml"
fi

pnpm content-tool build \
  --input "$scratch_dir/merged.xml" \
  --output "$output" \
  --id "${PACK_ID:-local-wotc-and-custom}" \
  --name "${PACK_NAME:-Local legacy rules corpus}" \
  --source-key "legacy-base-plus-ordered-parts"
pnpm content-tool validate "$output"

echo "Private content pack written to $output"
