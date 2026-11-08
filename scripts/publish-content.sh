#!/usr/bin/env bash
# Publishes the private content pack and every campaign to the homelab: rebuilds the pack
# from the supplied legacy data, the CBLoader parts and content/corrections/, builds each
# content/campaigns/<id>/campaign.json against it, advertises them all in the ignored deploy/
# directory, and copies deploy/ to the server with the homenet repo's playbook. Code releases
# are separate (scripts/deploy.sh): content is private, ships on its own cadence, and needs
# homenet's deploy key, which only works from the Admin VLAN.
#
#   scripts/publish-content.sh             # rebuild if the inputs changed, advertise, push
#   scripts/publish-content.sh --no-push   # stop after writing deploy/
#   scripts/publish-content.sh --rebuild   # rebuild even if the inputs are unchanged
#
# The pack ID is derived from the inputs (local-wotc-corrected-<hash>), so it changes exactly
# when the content does: characters pin a pack by ID and digest. Browsers on the server's
# content switch to a new pack on their next load, and characters move to it once their
# users review the update. The push copies only the advertised pack and campaigns and removes older
# ones from the server (homenet apps/4ecb/pack.yml). HOMENET_DIR overrides the homenet
# checkout (default: ../homenet next to this checkout).
set -euo pipefail

push=true
rebuild=false
for arg in "$@"; do
  case "$arg" in
    --no-push) push=false ;;
    --rebuild) rebuild=true ;;
    -h | --help) sed -n '2,17p' "$0"; exit 0 ;;
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

# Every campaign, every time: a revision already advertised with the same content is a
# no-op, and a changed campaign whose revision wasn't bumped stops here (advertise-campaign
# refuses it) rather than staying at its old revision on the server unnoticed.
mkdir -p tmp/campaigns
for manifest in content/campaigns/*/campaign.json; do
  id=$(jq -r .campaignId "$manifest")
  say "Building campaign $id revision $(jq -r .revision "$manifest") and advertising it"
  pnpm --silent content-tool campaign build --manifest "$manifest" \
    --output "tmp/campaigns/$id.4ecc" --against "$pack" >/dev/null ||
    die "campaign $id failed to build"
  pnpm --silent content-tool advertise-campaign "tmp/campaigns/$id.4ecc" --out-dir deploy \
    >/dev/null || die "campaign $id could not be advertised (changed without a revision bump?)"
done

if ! $push; then
  echo "deploy/ is ready; copy it to the server with homenet's apps/4ecb/pack.yml."
  exit 0
fi

# --- Push to the server ---------------------------------------------------------------
[[ -f "$homenet/apps/4ecb/pack.yml" ]] ||
  die "no homenet checkout at $homenet (set HOMENET_DIR, or use --no-push)"
say "Copying deploy/ to the server (homenet apps/4ecb/pack.yml; needs the Admin VLAN)"
echo "  homenet asks for your KeePassXC master password to unlock its deploy key."
# homenet's .envrc points SOPS at its KeePassXC pop-up (SOPS_AGE_KEY_CMD) and names the
# database; take those exports from it rather than duplicating them (direnv may not be
# allowed there).
# shellcheck disable=SC2016
(cd "$homenet" && nix develop --command bash -c \
  'eval "$(grep "^export " .envrc)" && exec "$@"' homenet-env \
  ssh/keys.sh dmz -- \
  ansible-playbook -i apps/4ecb/inventory.yml apps/4ecb/pack.yml \
  -e pack_src="$project_root/deploy") ||
  die "the push failed (are you on the Admin VLAN, with your age key?); deploy/ is ready to retry"
echo
echo "Done. Browsers switch to $pack_id on their next load; characters move once their"
echo "users review the content update."
