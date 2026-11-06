import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { deployFileForRequest } from "./dev-deploy-path";

const deploy = "/srv/4ecb/deploy";

describe("development deploy/ path mapping", () => {
  it("maps the runtime config, packs and hosted campaigns", () => {
    expect(deployFileForRequest(deploy, "/runtime-config.json?x=1")).toBe(
      join(deploy, "runtime-config.json"),
    );
    expect(deployFileForRequest(deploy, "/private-packs/core-ab12.4ecp")).toBe(
      join(deploy, "private-packs", "core-ab12.4ecp"),
    );
    expect(
      deployFileForRequest(
        deploy,
        "/private-packs/campaigns/pathfinder-0ca4afd36ef9.4ecc?v=5",
      ),
    ).toBe(
      join(
        deploy,
        "private-packs",
        "campaigns",
        "pathfinder-0ca4afd36ef9.4ecc",
      ),
    );
    expect(
      deployFileForRequest(deploy, "/private-packs/campaigns/a%20b.4ecc"),
    ).toBe(join(deploy, "private-packs", "campaigns", "a b.4ecc"));
  });

  it("leaves other paths to the app", () => {
    expect(deployFileForRequest(deploy, "/")).toBeUndefined();
    expect(deployFileForRequest(deploy, "/private-packs")).toBeUndefined();
    expect(deployFileForRequest(deploy, "/assets/x.js")).toBeUndefined();
  });

  it.each([
    "/private-packs/",
    "/private-packs/campaigns/",
    "/private-packs/../runtime-config.json",
    "/private-packs/campaigns/../../runtime-config.json",
    "/private-packs/./core.4ecp",
    "/private-packs//etc/passwd",
    "/private-packs/%2e%2e/runtime-config.json",
    "/private-packs/%2E%2E%2Fruntime-config.json",
    "/private-packs/campaigns%2f..%2f..%2fsecret",
    "/private-packs/..%5c..%5csecret",
    "/private-packs/%2fetc%2fpasswd",
    "/private-packs/C:%5cwindows",
    "/private-packs/core%00.4ecp",
    "/private-packs/%E0%A4%A.4ecp",
  ])("rejects %s", (url) => {
    expect(deployFileForRequest(deploy, url)).toBe("reject");
  });
});
