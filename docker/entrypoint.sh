#!/bin/sh
# The web image's entrypoint: nginx, plus the character-share relay
# (apps/share-relay) when runtime-config.json sets features.characterShare.
# Either process exiting stops the container, so Docker's restart policy
# restarts both. Everything written goes to /tmp (the root fs is read-only).
set -eu

relay=/app/share-relay/server.mjs
runtime_config=/app/runtime-config.json
mkdir -p /tmp/nginx

if ! node "$relay" enabled "$runtime_config"; then
  cp /etc/nginx/share-disabled.conf /tmp/nginx/share.conf
  exec nginx -g 'daemon off;'
fi

node "$relay" nginx-config /etc/nginx/share-enabled.conf.template \
  >/tmp/nginx/share.conf
node "$relay" &
relay_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

status=1
stop() {
  status=0
  kill -TERM "$relay_pid" 2>/dev/null || true
  # QUIT is nginx's graceful shutdown and the image's stop signal.
  kill -"$1" "$nginx_pid" 2>/dev/null || true
}
trap 'stop QUIT' QUIT
trap 'stop TERM' TERM INT

# BusyBox ash has no working `wait -n`; it reaps exited children between
# commands, so polling them notices either one stopping.
while kill -0 "$relay_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1 &
  wait $! || true
done

if [ "$status" -ne 0 ]; then
  echo "entrypoint: nginx or the share relay stopped; stopping the container" >&2
  kill -TERM "$relay_pid" 2>/dev/null || true
  kill -QUIT "$nginx_pid" 2>/dev/null || true
fi
wait 2>/dev/null || true
exit "$status"
