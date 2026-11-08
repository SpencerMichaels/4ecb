/**
 * The share relay's process entry, bundled to one file for the web image
 * (docker/entrypoint.sh). With no arguments it serves /api/share on
 * 127.0.0.1, reachable only through the image's nginx. Two helper commands
 * let the entrypoint share this configuration instead of repeating it:
 *
 *   server.mjs enabled <runtime-config.json>   exit 0 when features.characterShare is true
 *   server.mjs nginx-config <template>         print the nginx share locations
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";

import {
  characterShareEnabled,
  renderNginxShareConfig,
  shareRelayConfigFromEnv,
} from "./config";
import { handleShareRequest } from "./http-handler";
import { ShareStore } from "./share-store";

const SWEEP_INTERVAL_MS = 30 * 1000;

function enabledCommand(path: string): number {
  try {
    return characterShareEnabled(JSON.parse(readFileSync(path, "utf8")))
      ? 0
      : 1;
  } catch (error) {
    console.error(
      `share-relay: cannot read ${path}; character sharing stays off (${String(error)})`,
    );
    return 1;
  }
}

function serve(): void {
  const config = shareRelayConfigFromEnv(process.env);
  const store = new ShareStore({ limits: config.limits });
  const server = createServer((request, response) => {
    if (
      !handleShareRequest(store, request, response, { trustRealIpHeader: true })
    ) {
      response.statusCode = 404;
      response.setHeader("Cache-Control", "no-store");
      response.end();
    }
  });
  // Releases expired payloads' memory even when no request arrives.
  setInterval(() => store.sweep(), SWEEP_INTERVAL_MS).unref();
  server.requestTimeout = 60 * 1000;
  server.listen(config.port, config.host, () => {
    console.log(`share-relay: listening on ${config.host}:${config.port}`);
  });
  const stop = () => {
    server.close();
    server.closeAllConnections();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

const [command, argument] = process.argv.slice(2);
if (command === "enabled" && argument !== undefined) {
  process.exit(enabledCommand(argument));
} else if (command === "nginx-config" && argument !== undefined) {
  process.stdout.write(
    renderNginxShareConfig(
      readFileSync(argument, "utf8"),
      shareRelayConfigFromEnv(process.env),
    ),
  );
} else if (command === undefined) {
  serve();
} else {
  console.error(
    "usage: server.mjs [enabled <runtime-config.json> | nginx-config <template>]",
  );
  process.exit(2);
}
