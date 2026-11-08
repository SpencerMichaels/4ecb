import { request as httpRequest, createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { handleShareRequest, type ShareHandlerOptions } from "./http-handler";
import { ShareStore, type ShareLimits } from "./share-store";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

async function relay(
  limits: Partial<ShareLimits> = {},
  options: ShareHandlerOptions = { trustRealIpHeader: true },
) {
  const now = Date.UTC(2026, 10, 7, 12);
  const store = new ShareStore({ limits, now: () => now });
  const server = createServer((request, response) => {
    if (!handleShareRequest(store, request, response, options)) {
      response.statusCode = 418;
      response.end();
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const post = (body: Uint8Array, ip = "10.0.0.1") =>
    fetch(`${base}/api/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Real-IP": ip,
      },
      body,
    });
  const get = (path: string, ip = "10.0.0.2") =>
    fetch(`${base}${path}`, { headers: { "X-Real-IP": ip } });
  return { store, base, port, post, get, now };
}

describe("handleShareRequest", () => {
  it("stores a payload and serves it once", async () => {
    const { post, get, now } = await relay();
    const payload = new Uint8Array([0x1f, 0x8b, 0, 1, 2, 255]);
    const created = await post(payload);
    expect(created.status).toBe(201);
    expect(created.headers.get("content-type")).toBe("application/json");
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { code, expiresAt } = (await created.json()) as {
      code: string;
      expiresAt: string;
    };
    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt).toBe(new Date(now + 600_000).toISOString());

    const fetched = await get(`/api/share/${code}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(fetched.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(payload);

    const again = await get(`/api/share/${code}`);
    expect(again.status).toBe(404);
    expect(again.headers.get("cache-control")).toBe("no-store");
    expect(await again.json()).toEqual({ error: "not-found" });
  });

  it("accepts the trailing-slash form of the upload path", async () => {
    const { base } = await relay();
    const response = await fetch(`${base}/api/share/`, {
      method: "POST",
      body: new Uint8Array([1]),
    });
    expect(response.status).toBe(201);
  });

  it("answers 400 for a malformed code", async () => {
    const { get } = await relay();
    const response = await get("/api/share/12345");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "malformed-code" });
  });

  it("answers 429 after too many wrong codes from one address", async () => {
    const { get } = await relay({ maxFailedLookupsPerMinute: 2 });
    expect((await get("/api/share/000001")).status).toBe(404);
    expect((await get("/api/share/000002")).status).toBe(404);
    const blocked = await get("/api/share/000003");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "too-many-attempts" });
    expect((await get("/api/share/000003", "10.0.0.9")).status).toBe(404);
  });

  it("answers 413 for a declared oversized body without storing it", async () => {
    const { post, store } = await relay({ maxPayloadBytes: 16 });
    const response = await post(new Uint8Array(17));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too-large" });
    expect(store.activeShares).toBe(0);
    expect((await post(new Uint8Array(16))).status).toBe(201);
  });

  it("answers 413 for a streamed body that outgrows the limit", async () => {
    const { port, store } = await relay({ maxPayloadBytes: 16 });
    const { status, body } = await new Promise<{
      status: number | undefined;
      body: string;
    }>((resolve, reject) => {
      const request = httpRequest(
        { port, host: "127.0.0.1", method: "POST", path: "/api/share" },
        (response) => {
          let body = "";
          response.on("data", (chunk: Buffer) => (body += chunk.toString()));
          response.on("end", () =>
            resolve({ status: response.statusCode, body }),
          );
        },
      );
      request.on("error", reject);
      // No Content-Length: chunked transfer encoding.
      request.write(new Uint8Array(10));
      request.write(new Uint8Array(10));
      request.end();
    });
    expect(status).toBe(413);
    expect(JSON.parse(body)).toEqual({ error: "too-large" });
    expect(store.activeShares).toBe(0);
  });

  it("answers 429 with the reason for the address and server limits", async () => {
    const { post } = await relay({ maxSharesPerIp: 1, maxShares: 2 });
    expect((await post(new Uint8Array(1), "10.0.0.1")).status).toBe(201);
    const ipLimit = await post(new Uint8Array(1), "10.0.0.1");
    expect(ipLimit.status).toBe(429);
    expect(await ipLimit.json()).toEqual({ error: "ip-limit" });
    expect((await post(new Uint8Array(1), "10.0.0.2")).status).toBe(201);
    const full = await post(new Uint8Array(1), "10.0.0.3");
    expect(full.status).toBe(429);
    expect(await full.json()).toEqual({ error: "server-full" });
  });

  it("ignores X-Real-IP unless told to trust it", async () => {
    const { post, store } = await relay({ maxSharesPerIp: 1 }, {});
    expect((await post(new Uint8Array(1), "10.0.0.1")).status).toBe(201);
    // A different claimed address is still the same socket peer.
    expect((await post(new Uint8Array(1), "10.0.0.2")).status).toBe(429);
    expect(store.activeSharesFor("127.0.0.1")).toBe(1);
  });

  it("answers the health check", async () => {
    const { get } = await relay();
    const response = await get("/api/share/health");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("answers 405 for other methods", async () => {
    const { base } = await relay();
    const upload = await fetch(`${base}/api/share`);
    expect(upload.status).toBe(405);
    expect(upload.headers.get("allow")).toBe("POST");
    const download = await fetch(`${base}/api/share/123456`, {
      method: "DELETE",
    });
    expect(download.status).toBe(405);
    expect(download.headers.get("allow")).toBe("GET");
  });

  it("leaves other paths to the caller", async () => {
    const { get } = await relay();
    expect((await get("/api/sharex")).status).toBe(418);
    expect((await get("/index.html")).status).toBe(418);
  });
});
