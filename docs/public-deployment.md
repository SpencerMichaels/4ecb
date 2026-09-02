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
nix develop path:. --command docker build --target development -t 4ecb-dev .
nix develop path:. --command docker build -t 4ecb .
```

Run the production image as its unprivileged user with a read-only root
filesystem and a writable temporary filesystem:

```sh
nix develop path:. --command docker run --rm \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 8080:8080 4ecb
```

The health endpoint is `GET /healthz`. Application assets use immutable cache
headers when content-hashed; navigation uses `no-cache`; and
`/runtime-config.json` uses `no-store` and a network-only service-worker route.

To supply operator configuration, bind-mount a non-secret JSON file read-only:

```sh
nix develop path:. --command docker run --rm \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 8080:8080 \
  --mount type=bind,src="$PWD/runtime-config.json",dst=/app/runtime-config.json,readonly \
  4ecb
```

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

When a new service worker is ready, the application prompts rather than
refreshing silently. The user may defer the update; choosing **Reload and
update** keeps IndexedDB data and replaces only the versioned application shell.
The application also announces when its shell is ready for offline use and when
the browser is currently offline.

## Release checks still required

Before an M5 tag, run the public suite, inspect the built image contents, verify
offline reload with the server stopped, and retain or repeat focused functional
workflows in the primary development browser when UI behavior changes. Docker build/runtime verification requires
a reachable local daemon and is recorded separately from the Nix build.
The public suite's `check:print` stage uses the Nix-pinned Chromium/Poppler pair
and Firefox/geckodriver to produce and inspect ephemeral Letter/A4
color/monochrome PDFs. Safari/device execution and cross-engine raster
inspection are M5.5 checks against the designed interface.

User-facing installation, content import, backup, recovery, update, and known
compatibility guidance is maintained in the
[user guide and recovery handbook](user-guide.md).

The final M5 threat review confirms that native creation, worker evaluation,
profile adoption, backup/recovery, and regenerated export add no server upload
or new network trust boundary. Operators remain responsible for preserving the
reference response headers and protecting the browser profile that stores local
private data.
