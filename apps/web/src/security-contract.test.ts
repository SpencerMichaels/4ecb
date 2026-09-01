import { readdirSync, readFileSync } from "node:fs";
import { extname } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = new URL("..", import.meta.url);
const sourceRoot = new URL(".", import.meta.url);
const repositoryRoot = new URL("../../..", import.meta.url);

function applicationSources(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directory,
    );
    if (entry.isDirectory()) return applicationSources(path);
    if (
      ![".ts", ".tsx"].includes(extname(entry.name)) ||
      entry.name.endsWith(".test.ts") ||
      entry.name.endsWith(".test.tsx")
    )
      return [];
    return [readFileSync(path, "utf8")];
  });
}

describe("public deployment security contract", () => {
  it("ships a restrictive hosted-build and container content policy", () => {
    const index = readFileSync(new URL("index.html", webRoot), "utf8");
    expect(index).toContain('http-equiv="Content-Security-Policy"');
    expect(index).toContain("base-uri 'none'");
    expect(index).toContain("object-src 'none'");
    expect(index).toContain("script-src 'self'");
    expect(index).toContain("worker-src 'self' blob:");

    const nginx = readFileSync(
      new URL("docker/nginx.conf", repositoryRoot),
      "utf8",
    );
    expect(
      nginx.match(/include \/etc\/nginx\/security-headers\.conf;/g),
    ).toHaveLength(4);
    const headers = readFileSync(
      new URL("docker/security-headers.conf", repositoryRoot),
      "utf8",
    );
    for (const requirement of [
      "Content-Security-Policy",
      "frame-ancestors 'none'",
      "Permissions-Policy",
      'Referrer-Policy "no-referrer"',
      'X-Content-Type-Options "nosniff"',
      'X-Frame-Options "DENY"',
    ])
      expect(headers).toContain(requirement);
  });

  it("does not introduce executable untrusted markup sinks", () => {
    const sources = applicationSources(sourceRoot).join("\n");
    for (const sink of [
      "dangerouslySetInnerHTML",
      ".innerHTML",
      ".outerHTML",
      "document.write(",
      "eval(",
      "new Function(",
    ])
      expect(sources).not.toContain(sink);
  });
});
