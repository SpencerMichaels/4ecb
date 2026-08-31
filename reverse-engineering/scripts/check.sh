#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
re_root="${repo_root}/reverse-engineering"
tmp_dir="$(mktemp -d -t 4ecb-check.XXXXXXXX)"
trap 'rm -rf -- "$tmp_dir"' EXIT

run_nix() {
  nix develop "path:${re_root}" --command "$@"
}

run_nix dotnet build "${re_root}/tools/LegacyDataTool/LegacyDataTool.csproj" --configuration Release --nologo

run_nix xmllint --noout --relaxng "${re_root}/schemas/d20rules.rng" \
  "${repo_root}/CBLoader/Cache/combined.dnd40.original.xml"
run_nix xmllint --noout --relaxng "${re_root}/schemas/d20rules.rng" \
  "${repo_root}/CBLoader/Cache/combined.dnd40.merged.xml"
for input in "${repo_root}"/CBLoader/Custom/*.part; do
  run_nix xmllint --noout --relaxng "${re_root}/schemas/d20rules.rng" "$input"
done
for input in "${repo_root}"/CharacterBuilder/SampleChars/SampleHeroes/*.dnd4e; do
  run_nix xmllint --noout --relaxng "${re_root}/schemas/d20character.rng" "$input"
done
run_nix xmllint --noout --relaxng "${re_root}/schemas/d20campaign.rng" \
  "${repo_root}/CharacterBuilder/SampleChars/RPGA_GeneralCampaigns.dndcamp"

run_nix python "${re_root}/scripts/merge_parts.py" \
  "${re_root}/fixtures/merge/00-base.xml" "${re_root}/fixtures/merge/10-patch.part" \
  -o "${tmp_dir}/fixture-merged.xml"
run_nix python "${re_root}/scripts/compare_rulesets.py" \
  "${re_root}/fixtures/merge/expected.xml" "${tmp_dir}/fixture-merged.xml"

run_nix dotnet run --project "${re_root}/tools/LegacyDataTool" -- decrypt \
  "${repo_root}/CBLoader/Cache/combined.dnd40.encrypted" "${tmp_dir}/decrypted.xml" \
  "${repo_root}/CharacterBuilder/HeroicDemo.update" \
  1941ae2805160aaf8e92b0ba60a0be3f3af16471b6dbcc689776375ffa0c4291

legacy_hash="$(run_nix dotnet run --project "${re_root}/tools/LegacyDataTool" -- legacy-hash "${tmp_dir}/decrypted.xml")"
test "$legacy_hash" = "0x150e178e"

if [[ "${1:-}" == "--full" ]]; then
  run_nix python "${re_root}/scripts/merge_parts.py" \
    "${repo_root}/CBLoader/Cache/combined.dnd40.original.xml" \
    "${repo_root}"/CBLoader/Custom/*.part -o "${tmp_dir}/full-merged.xml"
  run_nix python "${re_root}/scripts/compare_rulesets.py" \
    "${repo_root}/CBLoader/Cache/combined.dnd40.merged.xml" "${tmp_dir}/full-merged.xml"
  run_nix python "${re_root}/scripts/profile_xml.py" "${repo_root}" "${re_root}/generated/profiles"
fi

echo "All reverse-engineering artifact checks passed."
