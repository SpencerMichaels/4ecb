import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { APPLE_TOUCH_ICON, PWA_ICONS } from "./pwa-icons";

const publicDirectory = join(import.meta.dirname, "../public");

/** A committed PNG's width and height, from its IHDR chunk. */
function pngSize(src: string): string {
  const png = readFileSync(join(publicDirectory, src));
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe("installed-app icons", () => {
  it("gives Chrome PNG icons at 192 and 512 px plus a maskable 512", () => {
    const pngs = PWA_ICONS.filter((icon) => icon.type === "image/png");
    expect(pngs.map((icon) => [icon.sizes, icon.purpose]).sort()).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
    for (const icon of pngs) {
      expect(icon.src).toMatch(/^\/icons\/[\w-]+\.png$/);
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
  });

  it("keeps the favicon and links a 180 px Apple touch icon", () => {
    expect(PWA_ICONS[0]?.src).toBe("/icon.svg");
    const index = readFileSync(
      join(import.meta.dirname, "../index.html"),
      "utf8",
    );
    expect(index).toContain('<link rel="icon" href="/icon.svg"');
    expect(index).toContain(
      `<link rel="apple-touch-icon" href="${APPLE_TOUCH_ICON}"`,
    );
    expect(APPLE_TOUCH_ICON).toMatch(/^\/icons\//);
    expect(pngSize(APPLE_TOUCH_ICON)).toBe("180x180");
  });

  it("renders the maskable and Apple icons full-bleed", () => {
    // icon-512's rounded tile leaves its corner transparent; the platform
    // crops the maskable and Apple icons itself, so their corners are opaque.
    expect(cornerAlpha("/icons/icon-512.png")).toBe(0);
    expect(cornerAlpha("/icons/icon-maskable-512.png")).toBe(255);
    expect(cornerAlpha(APPLE_TOUCH_ICON)).toBe(255);
  });
});

/** The top-left pixel's alpha of an unfiltered 8-bit RGBA PNG (what
 *  render-pwa-icons.mjs writes). */
function cornerAlpha(src: string): number {
  const png = readFileSync(join(publicDirectory, src));
  expect([png[24], png[25]]).toEqual([8, 6]);
  const data: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.subarray(offset + 4, offset + 8).toString("ascii") === "IDAT")
      data.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(data));
  expect(rows[0]).toBe(0);
  return rows[4] ?? -1;
}
