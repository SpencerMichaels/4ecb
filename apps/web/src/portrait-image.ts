import type {
  CharacterPortrait,
  CharacterPortraitCrop,
} from "@4ecb/character-domain";

export const PORTRAIT_MAX_SOURCE_EDGE = 1600;
export const PORTRAIT_RENDER_SIZE = 512;
export const PORTRAIT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const SUPPORTED_UPLOAD_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function maximumCropSize(width: number, height: number): number {
  return Math.min(1, height / width);
}

export function initialPortraitCrop(
  width: number,
  height: number,
): CharacterPortraitCrop {
  return { x: 0.5, y: 0.5, size: maximumCropSize(width, height) };
}

export function clampPortraitCrop(
  crop: CharacterPortraitCrop,
  width: number,
  height: number,
): CharacterPortraitCrop {
  const maximum = maximumCropSize(width, height);
  const size = Math.min(maximum, Math.max(maximum / 12, crop.size));
  const halfWidth = size / 2;
  const halfHeight = (size * width) / height / 2;
  return {
    x: Math.min(1 - halfWidth, Math.max(halfWidth, crop.x)),
    y: Math.min(1 - halfHeight, Math.max(halfHeight, crop.y)),
    size,
  };
}

function canvasDataUrl(canvas: HTMLCanvasElement, quality = 0.9): string {
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp;")
    ? webp
    : canvas.toDataURL("image/png");
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The selected image could not be read."));
    image.src = source;
  });
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The selected image could not be read."));
    reader.onerror = () =>
      reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

export async function normalizePortraitUpload(file: File): Promise<{
  readonly sourceDataUrl: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}> {
  if (file.size > PORTRAIT_MAX_UPLOAD_BYTES)
    throw new Error("Portrait images must be no larger than 20 MiB.");
  if (!SUPPORTED_UPLOAD_TYPES.has(file.type))
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  const image = await loadImage(await readFileDataUrl(file));
  const scale = Math.min(
    1,
    PORTRAIT_MAX_SOURCE_EDGE /
      Math.max(image.naturalWidth, image.naturalHeight),
  );
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Image processing is unavailable.");
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  return {
    sourceDataUrl: canvasDataUrl(canvas),
    sourceWidth,
    sourceHeight,
  };
}

export async function renderCharacterPortrait(
  sourceDataUrl: string,
  sourceWidth: number,
  sourceHeight: number,
  requestedCrop: CharacterPortraitCrop,
): Promise<CharacterPortrait> {
  const crop = clampPortraitCrop(requestedCrop, sourceWidth, sourceHeight);
  const image = await loadImage(sourceDataUrl);
  const sourceSize = crop.size * sourceWidth;
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_RENDER_SIZE;
  canvas.height = PORTRAIT_RENDER_SIZE;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Image processing is unavailable.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x * sourceWidth - sourceSize / 2,
    crop.y * sourceHeight - sourceSize / 2,
    sourceSize,
    sourceSize,
    0,
    0,
    PORTRAIT_RENDER_SIZE,
    PORTRAIT_RENDER_SIZE,
  );
  return {
    sourceDataUrl,
    sourceWidth,
    sourceHeight,
    crop,
    renderedDataUrl: canvasDataUrl(canvas, 0.92),
  };
}
