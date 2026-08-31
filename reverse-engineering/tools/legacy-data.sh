#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec nix develop "path:${repo_root}/reverse-engineering" --command \
  dotnet run --project "${repo_root}/reverse-engineering/tools/LegacyDataTool" -- "$@"
