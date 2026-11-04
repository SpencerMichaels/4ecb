// Renders the installed-app PNG icons from apps/web/public/icon.svg into
// apps/web/public/icons/. Chrome on desktop (macOS included) ignores an SVG-only
// manifest, so the PWA needs raster icons; they are committed, and this script
// regenerates them after icon.svg changes:
//
//   nix develop -c node apps/web/scripts/render-pwa-icons.mjs [output-dir]
//
// Dependency-free on purpose (no native rasterizer in CI): it understands the
// small SVG subset icon.svg uses — one rounded <rect> tile and filled <path>s
// made of M/L/H/V/Z commands, filled nonzero (strokes outlined by hand) — and
// throws on anything else.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

const publicDirectory = join(import.meta.dirname, "../public");
const outputDirectory = process.argv[2] ?? join(publicDirectory, "icons");
const svg = readFileSync(join(publicDirectory, "icon.svg"), "utf8");

const attribute = (element, name) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(element);
  if (!match) throw new Error(`icon.svg: ${name} missing on ${element}`);
  return match[1];
};

const svgElement = /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
const [, , viewWidth, viewHeight] = attribute(svgElement, "viewBox")
  .split(/\s+/)
  .map(Number);
if (viewWidth !== viewHeight) throw new Error("icon.svg must be square");
const viewSize = viewWidth;

const rects = svg.match(/<rect\b[^>]*>/g) ?? [];
if (rects.length !== 1) throw new Error("icon.svg must have one <rect> tile");
const tile = {
  width: Number(attribute(rects[0], "width")),
  height: Number(attribute(rects[0], "height")),
  radius: Number(attribute(rects[0], "rx")),
  fill: attribute(rects[0], "fill"),
};
if (tile.width !== viewSize || tile.height !== viewSize)
  throw new Error("icon.svg's tile must cover the whole viewBox");

const glyphs = (svg.match(/<path\b[^>]*>/g) ?? []).map((element) => ({
  fill: attribute(element, "fill"),
  polygons: parsePath(attribute(element, "d")),
}));
if (glyphs.length === 0) throw new Error("icon.svg has no <path>");

/** M/L/H/V/Z path data (absolute or relative) as closed polygons. */
function parsePath(data) {
  const tokens = data.match(/[MLHVZmlhvz]|-?\d*\.?\d+/g) ?? [];
  const polygons = [];
  let current = [];
  let x = 0;
  let y = 0;
  let command = "";
  let index = 0;
  const number = () => {
    const value = Number(tokens[index++]);
    if (Number.isNaN(value)) throw new Error(`icon.svg: bad path data ${data}`);
    return value;
  };
  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case "M":
        if (current.length) polygons.push(current);
        x = (relative ? x : 0) + number();
        y = (relative ? y : 0) + number();
        current = [[x, y]];
        command = relative ? "l" : "L";
        break;
      case "L":
        x = (relative ? x : 0) + number();
        y = (relative ? y : 0) + number();
        current.push([x, y]);
        break;
      case "H":
        x = (relative ? x : 0) + number();
        current.push([x, y]);
        break;
      case "V":
        y = (relative ? y : 0) + number();
        current.push([x, y]);
        break;
      case "Z":
        if (current.length) {
          polygons.push(current);
          [x, y] = current[0];
        }
        current = [];
        break;
      default:
        throw new Error(`icon.svg: unsupported path command ${command}`);
    }
  }
  if (current.length) polygons.push(current);
  return polygons;
}

/** A rounded rectangle as a polygon (arcs as short segments). */
function roundedRect(left, top, size, radius) {
  const points = [];
  const corners = [
    [left + size - radius, top + radius, -Math.PI / 2],
    [left + size - radius, top + size - radius, 0],
    [left + radius, top + size - radius, Math.PI / 2],
    [left + radius, top + radius, Math.PI],
  ];
  for (const [cx, cy, start] of corners)
    for (let step = 0; step <= 16; step++) {
      const angle = start + (step / 16) * (Math.PI / 2);
      points.push([
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
      ]);
    }
  return [points];
}

const SUBSAMPLES = 16;

/** Per-pixel coverage (0–1) of polygons filled with the nonzero rule. */
function coverage(polygons, size) {
  const cells = new Float64Array(size * size);
  const edges = polygons.flatMap((points) =>
    points.map((start, i) => [start, points[(i + 1) % points.length]]),
  );
  for (let row = 0; row < size * SUBSAMPLES; row++) {
    const sampleY = (row + 0.5) / SUBSAMPLES;
    const crossings = [];
    for (const [[x0, y0], [x1, y1]] of edges) {
      if (
        y0 === y1 ||
        sampleY < Math.min(y0, y1) ||
        sampleY >= Math.max(y0, y1)
      )
        continue;
      crossings.push({
        x: x0 + ((sampleY - y0) / (y1 - y0)) * (x1 - x0),
        winding: y1 > y0 ? 1 : -1,
      });
    }
    crossings.sort((a, b) => a.x - b.x);
    const pixelRow = Math.floor(row / SUBSAMPLES) * size;
    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i].winding;
      if (winding === 0) continue;
      const from = Math.max(0, crossings[i].x);
      const to = Math.min(size, crossings[i + 1].x);
      for (let column = Math.floor(from); column < to; column++) {
        const covered = Math.min(to, column + 1) - Math.max(from, column);
        if (covered > 0) cells[pixelRow + column] += covered / SUBSAMPLES;
      }
    }
  }
  return cells;
}

const transform = (polygons, scale, offsetX, offsetY) =>
  polygons.map((points) =>
    points.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY]),
  );

const rgb = (hex) => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`icon.svg: fill ${hex} must be #rrggbb`);
  const value = Number.parseInt(match[1], 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
};

/**
 * Renders the icon at `size` pixels. `fullBleed` paints the tile edge to edge
 * (maskable and Apple icons, which the platform crops to its own shape);
 * `glyphScale` shrinks the glyphs about the tile centre (the maskable safe
 * zone), keeping the design's placement.
 */
function render(size, { fullBleed, glyphScale }) {
  const scale = size / viewSize;
  const tileCoverage = fullBleed
    ? new Float64Array(size * size).fill(1)
    : coverage(roundedRect(0, 0, size, tile.radius * scale), size);
  const pixels = Buffer.alloc(size * size * 4);
  const color = new Float64Array(size * size * 3);
  const background = rgb(tile.fill);
  for (let i = 0; i < size * size; i++) color.set(background, i * 3);
  const glyphPixels = scale * glyphScale;
  const offset = (size / 2) * (1 - glyphScale);
  for (const glyph of glyphs) {
    const fill = rgb(glyph.fill);
    const cells = coverage(
      transform(glyph.polygons, glyphPixels, offset, offset),
      size,
    );
    for (let i = 0; i < size * size; i++) {
      const alpha = Math.min(1, cells[i]);
      for (let channel = 0; channel < 3; channel++)
        color[i * 3 + channel] =
          color[i * 3 + channel] * (1 - alpha) + fill[channel] * alpha;
    }
  }
  for (let i = 0; i < size * size; i++) {
    for (let channel = 0; channel < 3; channel++)
      pixels[i * 4 + channel] = Math.round(color[i * 3 + channel]);
    pixels[i * 4 + 3] = Math.round(Math.min(1, tileCoverage[i]) * 255);
  }
  return encodePng(size, pixels);
}

function encodePng(size, rgba) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// The maskable safe zone is the centred circle of 40% radius: every glyph
// point must land inside it, with a little room to spare.
const centre = viewSize / 2;
const farthest = Math.max(
  ...glyphs.flatMap((glyph) =>
    glyph.polygons.flat().map(([x, y]) => Math.hypot(x - centre, y - centre)),
  ),
);
const maskableGlyphScale = Math.min(1, (0.4 * viewSize * 0.97) / farthest);

const outputs = [
  ["icon-192.png", 192, { fullBleed: false, glyphScale: 1 }],
  ["icon-512.png", 512, { fullBleed: false, glyphScale: 1 }],
  [
    "icon-maskable-512.png",
    512,
    { fullBleed: true, glyphScale: maskableGlyphScale },
  ],
  ["apple-touch-icon-180.png", 180, { fullBleed: true, glyphScale: 1 }],
];

mkdirSync(outputDirectory, { recursive: true });
for (const [name, size, options] of outputs) {
  writeFileSync(join(outputDirectory, name), render(size, options));
  console.log(`${join(outputDirectory, name)} (${size}×${size})`);
}
