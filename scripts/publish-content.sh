#!/usr/bin/env bash
# Publishes the private content pack to the homelab: rebuilds it from the supplied legacy
# data, the CBLoader parts and content/corrections/, advertises it in the ignored deploy/
# directory, and copies deploy/ to the server with the homenet repo's playbook. Code releases
# are separate (scripts/deploy.sh): content is private, ships on its own cadence, and needs
# homenet's deploy key, which only works from the Admin VLAN.
#
#   scripts/publish-content.sh             # rebuild if the inputs changed, advertise, push
#   scripts/publish-content.sh --no-push   # stop after writing deploy/
#   scripts/publish-content.sh --rebuild   # rebuild even if the inputs are unchanged
#
# The pack ID is derived from the inputs (local-wotc-corrected-<hash>), so it changes exactly
# when the content does: characters pin a pack by ID and digest, and users adopt a new pack
# in the app's Content settings. The push copies only the advertised pack and removes older
# ones from the server (homenet apps/4ecb/pack.yml). HOMENET_DIR overrides the homenet
# checkout (default: ../homenet next to this checkout).
set -euo pipefail

push=true
rebuild=false
for arg in "$@"; do
  case "$arg" in
    --no-push) push=false ;;
    --rebuild) rebuild=true ;;
    -h | --help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "publish-content: unknown option $arg (see --help)" >&2; exit 2 ;;
  esac
done

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
if [[ -z "${IN_NIX_SHELL:-}" ]]; then
  exec nix develop path:"$project_root" --command bash "$0" "$@"
fi
homenet="${HOMENET_DIR:-$(dirname "$project_root")/homenet}"
say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf 'publish-content: %s\n' "$*" >&2; exit 1; }

# --- Which pack the inputs describe ---------------------------------------------------
base_xml=CBLoader/Cache/combined.dnd40.original.xml
[[ -f "$base_xml" ]] || die "missing $base_xml (the supplied legacy data)"
shopt -s nullglob
inputs=("$base_xml" CBLoader/Custom/*.part content/corrections/*.part)
hash=$(sha256sum "${inputs[@]}" | sha256sum | cut -c1-12)
pack_id="local-wotc-corrected-$hash"
pack="tmp/content/$pack_id.4ecp"
advertised=$(jq -r '.contentPacks[0].packId // empty' deploy/runtime-config.json 2>/dev/null || true)

# --- Build and advertise --------------------------------------------------------------
if [[ "$advertised" == "$pack_id" && -f "$pack" ]] && ! $rebuild; then
  say "Content unchanged: $pack_id is already advertised in deploy/"
else
  if [[ -f "$pack" ]] && ! $rebuild; then
    say "Using the existing build of $pack_id"
  else
    say "Building $pack_id (a few minutes)"
    PACK_ID="$pack_id" PACK_NAME="Local legacy rules corpus (corrected $(date +%F))" \
      bash scripts/build-private-content.sh "$pack" >/dev/null
  fi
  say "Advertising it in deploy/"
  pnpm --silent content-tool advertise "$pack" --out-dir deploy | jq -r '.advertised.url' |
    sed 's/^/  /'
fi

if ! $push; then
  echo "deploy/ is ready; copy it to the server with homenet's apps/4ecb/pack.yml."
  exit 0
fi

# --- Push to the server ---------------------------------------------------------------
[[ -f "$homenet/apps/4ecb/pack.yml" ]] ||
  die "no homenet checkout at $homenet (set HOMENET_DIR, or use --no-push)"
say "Copying deploy/ to the server (homenet apps/4ecb/pack.yml; needs the Admin VLAN)"
(cd "$homenet" && nix develop --command ssh/keys.sh dmz -- \
  ansible-playbook -i apps/4ecb/inventory.yml apps/4ecb/pack.yml \
  -e pack_src="$project_root/deploy") ||
  die "the push failed (are you on the Admin VLAN, with your age key?); deploy/ is ready to retry"
echo
echo "Done. Users switch to $pack_id in the app's Content settings."
