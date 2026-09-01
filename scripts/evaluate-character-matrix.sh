#!/usr/bin/env bash
set -euo pipefail

pack_path="${1:?usage: evaluate-character-matrix.sh PACK.4ecp [CHARACTER.dnd4e ...]}"
shift

if (( $# == 0 )); then
  mapfile -t character_paths < <(
    rg --files CharacterBuilder/SampleChars/SampleHeroes -g '*.dnd4e' | sort
  )
else
  character_paths=("$@")
fi

for character_path in "${character_paths[@]}"; do
  pnpm --silent evaluate:character "$character_path" "$pack_path" |
    jq -c '{
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
        unsupported: .cachedPowerParity.unsupported
      }
    }'
done
