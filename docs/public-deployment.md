# Public PWA and Docker deployment

## Distribution boundary

The public application is useful only after the user supplies a compatible
private content pack. Neither a hosted build nor the default image may contain
the official D&D 4E corpus, the supplied legacy application, imported character
files, or locally generated `.4ecp` artifacts. See the repository
[public distribution notice](../NOTICE.md).

The runtime configuration path is
`apps/web/public/runtime-config.json`. Operators may replace it at container
start without rebuilding the application. It is kept outside the service-worker
precache and served network-only. Do not put secrets in it. Advertised pack URLs
are downloads, not access controls: anyone who can access the deployment can
download them. The operator/reverse proxy owns authentication and authorization
for both the app and pack paths.

```json
{
  "contentPacks": [
    {
      "packId": "campaign-core-2026-09-01",
      "name": "Campaign core",
      "contentDigest": "<64 lowercase hex characters>",
      "url": "/private-packs/campaign-core-2026-09-01.4ecp"
    }
  ]
}
```

Use immutable URLs and a new revision-qualified `packId` for every changed
digest. The browser requires same-origin URLs, bounds encoded and decoded bytes,
and verifies internal
identity/digest before caching. Downloading never activates a profile.

## Build and run

All project commands, including the Docker client, run from the project-local
Nix environment. The Docker daemon remains an operator-managed host service.

```sh
nix develop --command docker build --target development -t 4ecb-dev .
nix develop --command docker build -t 4ecb .
```

Run the production image as its unprivileged user with a read-only root
filesystem and a writable temporary filesystem:

```sh
nix develop --command docker run --rm \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 8080:8080 4ecb
```

The health endpoint is `GET /healthz`. Application assets use immutable cache
headers when content-hashed; navigation uses `no-cache`; and
`/runtime-config.json` uses `no-store` and a network-only service-worker route.

To supply operator configuration, bind-mount a non-secret JSON file read-only:

```sh
nix develop --command docker run --rm \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 8080:8080 \
  --mount type=bind,src="$PWD/runtime-config.json",dst=/app/runtime-config.json,readonly \
  4ecb
```

### Published image

CI publishes the production image to `ghcr.io/spencermichaels/4ecb` after the
public checks (everything but the separate print check) pass on every push to
`main`, tagged with the full commit SHA
(`sha-<sha>`) and `main`. It is built from the same Dockerfile and build context
as above, so it holds no private content. Deployments should pin the image by
digest; the product owner's homelab re-pins and deploys automatically whenever
`main` gets a new image.

To release, run `scripts/deploy.sh` from a clean `main`: it runs the checks that
gate publishing (in a temporary worktree), pushes to GitHub `main`, and waits
until the image for that commit is published. The product owner's homelab then
deploys it automatically within about ten minutes. Only committed work is
released: uncommitted changes (and new untracked files in source directories)
are listed with a prompt to abort. `--skip-checks` and `--no-wait` shorten it,
and `--yes` skips the prompt; it refuses a `main` behind GitHub's.

## HTTPS and reverse proxies

Serve public installations over HTTPS so service workers, installation prompts,
and persistent-storage APIs are available. Terminate TLS at a maintained reverse
proxy and forward ordinary HTTP to port 8080. Preserve the `/healthz` path and do
not add blanket long-lived caching to HTML, the service worker, manifest, or
runtime configuration.

The static container has no account database, analytics endpoint, content upload
endpoint, or relay. Browser character and pack data remain in each user's
IndexedDB. Backups are the user's recovery path; container volumes do not back up
browser data.

If `/private-packs/` is served by a reverse proxy, configure TLS,
authorization, response-size, and cache policy deliberately. A public
deployment makes that file public. Personal packs are never uploaded there or
to any other server.

## User onboarding and updates

Users install or open the PWA, visit **Content settings**, inspect browser
persistence/quota status, and import a `.4ecp` file or decrypted/merged
`.dnd40.xml` through the ordinary file picker. Chromium-family browsers also
offer read-only, bounded directory discovery for those same source types; the
ordinary picker is the Firefox/Safari fallback. Rules XML is normalized and
validated in a worker before its generated pack is stored. A private pack can be
built locally with the documented content tool. The public browser never reads
legacy decryption keys, opens encrypted containers, follows legacy update URLs,
or merges loose `.part` files. Pack input and streaming decompression are each
limited to 128 MiB before JSON parsing; local profile IDs and names use bounded,
validated forms.

The hosted HTML includes a same-origin Content Security Policy that disables
plugins and base-URL rewriting and permits only the local application workers
(plus their browser-created blob bootstrap). The reference nginx container
also denies framing and sends `nosniff`, no-referrer, same-origin opener/resource,
and camera/geolocation/microphone/payment/USB-denial headers on every route.
Deployments that replace nginx should preserve or strengthen those response
headers; the HTML policy remains a defense-in-depth baseline.

When a new service worker is ready, the application shows an update icon in the
library and builder top bars (left of Settings) rather than refreshing
silently. The user may ignore it; clicking it keeps IndexedDB data and replaces
only the versioned application shell. Offline readiness and connectivity are
not announced: there is nothing for the user to do about either.

The production shell loads the character library initially and requests
Settings, editor, and sheet workspaces as separate content-hashed chunks. All
three route chunks remain in the Workbox precache; only
`runtime-config.json` stays network-only. Consequently an installed version can
reload a direct editor or sheet hash offline, and an accepted update replaces
the entry and its mutually compatible route chunks as one versioned precache.

## Release checks still required

Before an M5 tag, run the public suite, inspect the built image contents, verify
offline reload with the server stopped, and retain or repeat focused functional
workflows in the primary development browser when UI behavior changes. Docker build/runtime verification requires
a reachable local daemon and is recorded separately from the Nix build.
The public suite's `check:print` stage uses the Nix-pinned Chromium/Poppler pair
and Firefox/geckodriver to produce and inspect ephemeral Letter/A4
color/monochrome PDFs. Safari/device execution and cross-engine raster
inspection are 1.0-hardening checks against the designed interface.

User-facing installation, content import, backup, recovery, update, and known
compatibility guidance is maintained in the
[user guide and recovery handbook](user-guide.md).

The final M5 threat review confirms that native creation, worker evaluation,
profile adoption, backup/recovery, and regenerated export add no server upload
or new network trust boundary. Operators remain responsible for preserving the
reference response headers and protecting the browser profile that stores local
private data.

## Small-group deployment with Compose

The repository-root `compose.yaml` runs the production image on the loopback
interface with the read-only root filesystem, bounded `/tmp`, and two read-only
operator mounts from the ignored `deploy/` directory. The image serves
`/private-packs/` from the mounted directory (immutable `private` caching; a
missing file is 404), so no proxy configuration is needed to advertise a pack.

1. Generate the runtime configuration and a revision-qualified pack copy:

   ```sh
   nix develop --command pnpm content-tool advertise /path/to/pack.4ecp
   ```

   This validates the pack, writes
   `deploy/private-packs/<packId>-<digest prefix>.4ecp`, and sets
   `contentPacks` in `deploy/runtime-config.json` to exactly that pack,
   keeping the file's other keys (advertised campaigns, relay, features).
   Rerun it after building a new pack. `deploy/` is ignored by git and by the
   Docker build context, so private content never enters a commit or the image.

2. Build, tag and start:

   ```sh
   FOURECB_TAG=$(git rev-parse --short HEAD) docker compose up -d --build
   ```

   `FOURECB_PORT` (default `8080`) changes the loopback host port. Confirm with
   `curl -f http://127.0.0.1:8080/healthz`.

3. Point the reverse proxy at it. For Caddy on the same host, which obtains and
   renews TLS automatically and passes the container's headers through:

   ```caddyfile
   builder.example.net {
       reverse_proxy 127.0.0.1:8080
   }
   ```

   If Caddy runs in a container, attach it to the compose project's network and
   use `reverse_proxy web:8080` instead of publishing the port. Add access
   control (for example Caddy `basic_auth`) before advertising a private pack:
   the pack URL is downloadable by anyone who can reach the site. Same-origin
   credentials are sent with the pack download, so proxy authentication covers
   it. The gate must let `/manifest.webmanifest`, `/icon.svg` and `/icons/*`
   through without credentials: browsers fetch the manifest and the app icons
   without cookies or other credentials, and an install from a gated manifest or
   icon ends up with no icon or no install at all.

**Campaigns (D116).** A DM's campaign is hosted beside the private packs.
Build it from its tracked source (a `campaign.json` naming a house-rule XML
file; `fixtures/campaigns/synthetic/` is a public example) and advertise it:

```sh
nix develop --command pnpm content-tool campaign build \
  --manifest content/campaigns/<id>/campaign.json \
  --output tmp/content/<id>.4ecc --against /path/to/pack.4ecp
nix develop --command pnpm content-tool advertise-campaign tmp/content/<id>.4ecc
```

`campaign.json` is `{campaignId, name, revision, houseRules: "<xml path,
relative to it>", restrict: {ids: [...], types: {"Deity": "campaign-only"}}}`.
The build parses the XML with the same parser as `content-tool build` (it
holds only `RulesElement` records) and keeps its records verbatim for legacy
export; `--against` prints warnings only (restricted IDs the pack lacks, house
rules replacing pack records, type rules matching nothing) and how many
records each type rule restricts. `campaign inspect FILE.4ecc` decodes and
verifies a built file. `advertise-campaign` verifies the file, copies it to
`deploy/private-packs/campaigns/<campaignId>-<digest prefix>.4ecc` and adds
`{campaignId, name, revision, contentDigest, url}` to `campaigns` in
`deploy/runtime-config.json`, replacing that campaign's older revision and
keeping everything else. It refuses an older revision, or the same revision
with different content: bump `revision` on every change. Hosting a campaign
adds it to every player's browser in the background on the next load (it
appears in Settings → Campaigns and the Details Campaign select, and can't be
removed there while hosted) but moves no character into it; players choose
it per character. Older campaign files stay in
`deploy/private-packs/campaigns/` until the operator removes them. Whatever
copies `deploy/` to the server must copy and keep
`private-packs/campaigns/`: for the homelab, homenet's `apps/4ecb/pack.yml`
(run by `scripts/publish-content.sh`) copies the advertised campaign files and
removes the others from the server, as it does for packs.

**Updates.** Ask testers to back up their libraries before significant changes,
then rebuild with a new tag as in step 2. Testers see **Reload and update**;
IndexedDB data on the same origin is retained. **Rollback** reuses an earlier
local image without rebuilding: `FOURECB_TAG=<previous tag> docker compose up -d`.
Keep the HTTPS origin unchanged across updates, since browser data is per
origin.

**New content revisions.** A rebuilt pack with a different digest should get a
new `packId` (characters bind pack identity and digest), then rerun
`content-tool advertise`. Browsers on the server's content switch to the new
revision on their next load; each character keeps its content until the user
reviews the update (D004).

For the product owner's homelab, `scripts/publish-content.sh` does the whole
content update in one step, separately from code releases: it rebuilds the pack
from the supplied legacy data, the CBLoader parts and `content/corrections/`
under an ID derived from those inputs (`local-wotc-corrected-<hash>`, so the ID
changes exactly when the content does), advertises it in `deploy/`, and copies
`deploy/` to the server with the homenet repo's `apps/4ecb/pack.yml` (from the
Admin VLAN; `HOMENET_DIR` overrides `../homenet`). `--no-push` stops after
`deploy/`; unchanged inputs skip the rebuild.

## M5.7 invited-beta boundary

The unprivileged static image, health endpoint, runtime-configuration path,
offline PWA behavior, and proprietary-content separation above are already
implemented foundations. M5.7 prepares them for straightforward use by the
product owner's invited beta group; it is not the milestone that first creates
Docker support.

That preparation must provide and rehearse one small-group path for building and
running the image, terminating HTTPS, advertising an immutable private pack,
onboarding a clean browser, installing/reloading offline, backing up and
restoring browser-owned data, updating or rolling back the image, and reporting
known limitations. Hosting does not give the operator a copy of character data,
and M5.7 adds neither accounts, server-side character storage, nor the optional
relay.

M5.7 acceptance is operational beta readiness for known friends in the product
owner's D&D group. M9 remains responsible for the distinct lightweight
best-effort browser and visual-print check, security review, migration
reliability, representative-device testing, and release-performance hardening;
the beta milestone must not claim those broader checks.
