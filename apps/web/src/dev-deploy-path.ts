// The development server's view of the operator deploy/ directory
// (vite.config.ts `developmentDeployDirectory`), kept pure so the path mapping
// is testable: the image serves the same URLs from its mounted deploy/
// (docker/nginx.conf).

import { join, resolve, sep } from "node:path";

const PRIVATE_PACKS = "/private-packs/";

/**
 * The deploy/ file a request path names: `/runtime-config.json`, or a file
 * under `/private-packs/` (packs, and hosted campaigns in `campaigns/`).
 * Returns `"reject"` for a private-packs path that can't name a file there
 * (traversal, encoded separators, malformed escapes), so it 404s instead of
 * falling through to the app's HTML; undefined for any other path.
 */
export function deployFileForRequest(
  deployDirectory: string,
  url: string,
): string | "reject" | undefined {
  const path = url.split(/[?#]/, 1)[0] ?? "";
  if (path === "/runtime-config.json")
    return join(deployDirectory, "runtime-config.json");
  if (!path.startsWith(PRIVATE_PACKS)) return undefined;
  const root = resolve(deployDirectory, "private-packs");
  const segments: string[] = [];
  for (const raw of path.slice(PRIVATE_PACKS.length).split("/")) {
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return "reject";
    }
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      /[/\\\0]/.test(segment) ||
      /^[a-z]:/i.test(segment)
    )
      return "reject";
    segments.push(segment);
  }
  const file = resolve(root, ...segments);
  return file.startsWith(root + sep) ? file : "reject";
}
