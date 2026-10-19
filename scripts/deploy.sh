#!/usr/bin/env bash
# Releases the current commit: checks it, pushes it to GitHub main, and waits for CI to
# publish the production image. The homelab deployment follows the published image on its
# own (it checks every ~10 minutes and deploys), so a successful run here means the release
# is on its way; there is nothing else to do.
#
#   scripts/deploy.sh                 # check, push, wait for the image
#   scripts/deploy.sh --skip-checks   # push without the local check run (CI still checks)
#   scripts/deploy.sh --no-wait       # push and return; don't wait for CI
#   scripts/deploy.sh --yes           # release even if there is uncommitted work
#
# Run it on main. Only committed work is released: if there are uncommitted changes (or new
# untracked files under apps/, packages/, scripts/, docs/ or fixtures/), it lists them and asks
# before releasing without them (--yes skips the question). It refuses a main that is behind
# GitHub's (rebase onto origin/main first). The local checks are the ones that gate
# publishing (public-checks: scripts/check.sh except the print check), run in a temporary
# worktree of the commit being pushed, so the checkout itself isn't touched. Pushing needs
# your SSH key loaded.
set -euo pipefail

skip_checks=false
wait_for_ci=true
assume_yes=false
for arg in "$@"; do
  case "$arg" in
    --skip-checks) skip_checks=true ;;
    --no-wait) wait_for_ci=false ;;
    --yes) assume_yes=true ;;
    -h | --help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "deploy: unknown option $arg (see --help)" >&2; exit 2 ;;
  esac
done

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
# Project tools (jq, curl, git) come from the project-local Nix environment, as for every
# other project command; re-run inside it unless already there.
if [[ -z "${IN_NIX_SHELL:-}" ]]; then
  exec nix develop path:"$project_root" --command bash "$0" "$@"
fi
repo=SpencerMichaels/4ecb
image=spencermichaels/4ecb
say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

# --- What would be released ------------------------------------------------------------
[[ "$(git branch --show-current)" == main ]] || die "not on main (on '$(git branch --show-current)')"
# Uncommitted work is never released (the checks and the push use the commit), so make sure
# that's intended. Untracked files count only in source directories: the checkout's root
# holds personal, ignored-by-convention files.
uncommitted=$(git status --porcelain --untracked-files=all -- . |
  grep -E '^[^?]|^\?\? (apps|packages|scripts|docs|fixtures)/' || true)
if [[ -n "$uncommitted" ]]; then
  printf '\033[1;33mUncommitted work will NOT be released:\033[0m\n'
  while IFS= read -r line; do printf '  %s\n' "$line"; done <<<"$uncommitted"
  if ! $assume_yes; then
    [[ -t 0 ]] || die "uncommitted work; commit it first, or pass --yes to release without it"
    read -r -p "Release the last commit without it? [y/N] " answer
    [[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]] || die "aborted; commit the changes and run it again"
  fi
fi

say "Fetching GitHub main"
git fetch -q origin main || die "couldn't fetch from GitHub (is your SSH key loaded? ssh-add -l)"
behind=$(git rev-list --count HEAD..origin/main)
ahead=$(git rev-list --count origin/main..HEAD)
((behind == 0)) || die "main is $behind commit(s) behind GitHub; rebase onto origin/main first"
if ((ahead == 0)); then
  echo "Nothing to release: main is already at GitHub's $(git rev-parse --short HEAD)."
  exit 0
fi
commit=$(git rev-parse HEAD)
short=${commit:0:7}
echo "Releasing $ahead commit(s), ending at $short:"
git log --oneline origin/main..HEAD | sed 's/^/  /'

# --- Local checks (the ones that gate publishing) ---------------------------------------
if ! $skip_checks; then
  say "Running the publishing checks on $short (a few minutes)"
  worktree=$(mktemp -d -t 4ecb-deploy.XXXXXXXX)
  log="$worktree.log"
  trap 'git worktree remove --force "$worktree" >/dev/null 2>&1 || true' EXIT
  git worktree add -q --detach "$worktree" "$commit"
  if ! (cd "$worktree" && FOURECB_SKIP_PRINT_CHECK=1 nix develop path:. --command bash -c \
      'pnpm install --frozen-lockfile && bash scripts/check.sh') >"$log" 2>&1; then
    tail -n 40 "$log" >&2
    die "checks failed; nothing pushed (full log: $log)"
  fi
  grep -E 'Tests +[0-9]+ passed' "$log" | tail -1 | sed 's/^ */  /' || true
  echo "  Checks passed."
fi

# --- Push ------------------------------------------------------------------------------
say "Pushing $short to GitHub main"
git push -q origin "$commit:refs/heads/main" || die "push failed (approve the SSH confirmation; is your key loaded?)"
git fetch -q origin main
echo "  Pushed."

if ! $wait_for_ci; then
  echo "GitHub CI builds and publishes it; the homelab deploys it ~10 minutes after that."
  exit 0
fi

# --- Wait for the image ----------------------------------------------------------------
# Published = the sha-<commit> tag exists on ghcr (registry API, no rate limit). The GitHub
# API (anonymous: 60 requests/hour) is asked only once a minute, to notice a failed run.
say "Waiting for GitHub CI to publish the image (usually 5-10 minutes)"
token=$(curl -fsS "https://ghcr.io/token?scope=repository:$image:pull" | jq -r .token)
published() {
  curl -fsS -o /dev/null -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.oci.image.index.v1+json" \
    "https://ghcr.io/v2/$image/manifests/sha-$commit"
}
run_failed() {
  local jobs_url
  jobs_url=$(curl -fsS "https://api.github.com/repos/$repo/actions/runs?head_sha=$commit" |
    jq -r '.workflow_runs[0].jobs_url // empty') || return 1
  [[ -n "$jobs_url" ]] || return 1
  curl -fsS "$jobs_url" | jq -e \
    '.jobs[] | select((.name == "public-checks" or .name == "publish-image") and .conclusion == "failure")' \
    >/dev/null
}
start=$SECONDS
for ((i = 0; ; i++)); do
  if published; then
    echo "  Published after $(((SECONDS - start) / 60)) min: ghcr.io/$image:sha-$commit"
    break
  fi
  if ((i % 6 == 5)) && run_failed; then
    die "GitHub CI failed for $short, so nothing was published: https://github.com/$repo/actions"
  fi
  ((SECONDS - start < 1800)) || die "no image after 30 minutes; check https://github.com/$repo/actions"
  sleep 10
done

echo
echo "Done. The homelab deploys it within ~10 minutes; users then see the update icon."
