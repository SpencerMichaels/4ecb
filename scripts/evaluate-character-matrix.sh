#!/usr/bin/env bash
set -euo pipefail

# Evaluates every legacy comparison character against an exact pack: the
# ignored player characters in sample-chars/ plus the supplied SampleHeroes.
pack_path="${1:-tmp/content/full-local.4ecp}"
shift || true

if (( $# == 0 )); then
  # --no-ignore: sample-chars/ is git-ignored private data.
  mapfile -t character_paths < <(
    {
      if [[ -d sample-chars ]]; then
        rg --files --no-ignore sample-chars -g '*.dnd4e'
      fi
      rg --files CharacterBuilder/SampleChars/SampleHeroes -g '*.dnd4e'
    } | sort
  )
else
  character_paths=("$@")
fi

for character_path in "${character_paths[@]}"; do
  pnpm --silent evaluate:character "$character_path" "$pack_path" |
    jq -c --arg file "$character_path" '{
      file: $file,
      character,
      evaluation: {
        complete: .evaluation.complete,
        legal: .evaluation.legal,
        errors: .evaluation.diagnosticCounts.error,
        warnings: .evaluation.diagnosticCounts.warning
      },
      stats: {
        matching: .cachedNumericParity.matching,
        comparable: .cachedNumericParity.comparable,
        mismatches: .cachedNumericParity.mismatches
      },
      powers: {
        matching: .cachedPowerParity.matchingFields,
        comparable: .cachedPowerParity.comparableFields,
        mismatches: .cachedPowerParity.mismatches,
        unsupported: .cachedPowerParity.unsupported,
        conditionalDamageVariants: .cachedPowerParity.conditionalDamageVariants
      }
    }'
done
