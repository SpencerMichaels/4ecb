#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
base_xml="${project_root}/CBLoader/Cache/combined.dnd40.original.xml"
parts_dir="${project_root}/CBLoader/Custom"
reference_merged="${project_root}/CBLoader/Cache/combined.dnd40.merged.xml"
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
  "$base_xml" "${parts[@]}" -o "$scratch_dir/merged.xml"

if [[ -f "$reference_merged" ]]; then
  python reverse-engineering/scripts/compare_rulesets.py \
    "$reference_merged" "$scratch_dir/merged.xml"
fi

pnpm content-tool build \
  --input "$scratch_dir/merged.xml" \
  --output "$output" \
  --id local-wotc-and-custom \
  --name "Local legacy rules corpus" \
  --source-key "legacy-base-plus-ordered-parts"
pnpm content-tool validate "$output"

echo "Private content pack written to $output"
