/**
 * The share relay's HTTP surface over `node:http` requests, shared by the
 * production server (`server.ts`, behind the image's nginx) and the web
 * app's Vite dev server. The relay never parses a payload, and never logs
 * one or a code.
 *
 *   POST /api/share              body: opaque bytes → 201 {code, expiresAt}
 *   GET  /api/share/<6 digits>   → 200 the bytes, then forgotten
 *   GET  /api/share/health       → 200 "ok"
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { ShareStore } from "./share-store";

export const SHARE_API_PATH = "/api/share";

export interface ShareHandlerOptions {
  /** Take the client address from X-Real-IP (set by the image's nginx from
   *  its realip result). Only for a relay nginx alone can reach. */
  readonly trustRealIpHeader?: boolean;
}

/**
 * Answers a request under /api/share and returns true, or returns false
 * without touching the response for any other path.
 */
export function handleShareRequest(
  store: ShareStore,
  request: IncomingMessage,
  response: ServerResponse,
  options: ShareHandlerOptions = {},
): boolean {
  const path = (request.url ?? "").split("?", 1)[0] ?? "";
  if (path !== SHARE_API_PATH && !path.startsWith(`${SHARE_API_PATH}/`))
    return false;
  const rest = path.slice(SHARE_API_PATH.length + 1);
  const ip = clientAddress(request, options);

  if (rest === "") {
    if (request.method !== "POST") return methodNotAllowed(response, "POST");
    void receivePayload(store, request, response, ip);
    return true;
  }
  if (request.method !== "GET") return methodNotAllowed(response, "GET");
  if (rest === "health") {
    send(response, 200, "text/plain; charset=utf-8", "ok");
    return true;
  }
  const result = store.take(ip, rest);
  if (result.ok) {
    send(response, 200, "application/octet-stream", result.payload);
  } else if (result.error === "malformed-code") {
    sendJson(response, 400, { error: "malformed-code" });
  } else {
    sendJson(response, result.error === "not-found" ? 404 : 429, {
      error: result.error,
    });
  }
  return true;
}

async function receivePayload(
  store: ShareStore,
  request: IncomingMessage,
  response: ServerResponse,
  ip: string,
): Promise<void> {
  const limit = store.limits.maxPayloadBytes;
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    tooLarge(request, response);
    return;
  }
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for await (const chunk of request as AsyncIterable<Buffer>) {
      received += chunk.byteLength;
      if (received > limit) {
        tooLarge(request, response);
        return;
      }
      chunks.push(chunk);
    }
  } catch {
    // The client went away mid-upload; there is no one to answer.
    return;
  }
  const result = store.create(ip, Buffer.concat(chunks, received));
  if (result.ok) {
    sendJson(response, 201, {
      code: result.code,
      expiresAt: new Date(result.expiresAt).toISOString(),
    });
  } else {
    sendJson(response, result.error === "too-large" ? 413 : 429, {
      error: result.error,
    });
  }
}

function clientAddress(
  request: IncomingMessage,
  options: ShareHandlerOptions,
): string {
  if (options.trustRealIpHeader) {
    const header = request.headers["x-real-ip"];
    const value = (Array.isArray(header) ? header[0] : header)?.trim();
    if (value) return value;
  }
  return request.socket.remoteAddress ?? "unknown";
}

/** Answers 413 and drops the connection rather than reading the rest of an
 *  oversized body. */
function tooLarge(request: IncomingMessage, response: ServerResponse): void {
  response.setHeader("Connection", "close");
  sendJson(response, 413, { error: "too-large" });
  response.on("finish", () => request.destroy());
}

function methodNotAllowed(response: ServerResponse, allow: string): true {
  response.setHeader("Allow", allow);
  sendJson(response, 405, { error: "method-not-allowed" });
  return true;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: Record<string, string>,
): void {
  send(response, status, "application/json", JSON.stringify(body));
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Uint8Array,
): void {
  response.statusCode = status;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Length",
    typeof body === "string" ? Buffer.byteLength(body) : body.byteLength,
  );
  response.end(body);
}
