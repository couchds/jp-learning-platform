import type { DesktopCapture } from "./desktop";

export type CaptureSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CapturePoint = { x: number; y: number };

export function selectionFromPoints(start: CapturePoint, end: CapturePoint): CaptureSelection | null {
  const left = clamp(Math.min(start.x, end.x));
  const top = clamp(Math.min(start.y, end.y));
  const right = clamp(Math.max(start.x, end.x));
  const bottom = clamp(Math.max(start.y, end.y));
  const width = right - left;
  const height = bottom - top;
  return width >= 0.01 && height >= 0.01 ? { x: left, y: top, width, height } : null;
}

export function selectionPixels(selection: CaptureSelection | null, width: number, height: number) {
  if (!selection) return { x: 0, y: 0, width, height };
  const x = Math.max(Math.floor(selection.x * width), 0);
  const y = Math.max(Math.floor(selection.y * height), 0);
  return {
    x,
    y,
    width: Math.max(Math.min(Math.ceil(selection.width * width), width - x), 1),
    height: Math.max(Math.min(Math.ceil(selection.height * height), height - y), 1)
  };
}

export async function fileToCapture(file: File): Promise<DesktopCapture> {
  const dataUrl = await readFile(file);
  const size = await loadImage(dataUrl).then((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
  return {
    dataUrl,
    width: size.width,
    height: size.height,
    displayId: "uploaded-image",
    sourceName: file.name || "Uploaded image"
  };
}

export async function captureToFile(capture: DesktopCapture, selection: CaptureSelection | null) {
  if (!selection) {
    const blob = await fetch(capture.dataUrl).then((response) => response.blob());
    return new File([blob], "screen-capture.png", { type: blob.type || "image/png" });
  }

  const image = await loadImage(capture.dataUrl);
  const crop = selectionPixels(selection, image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image cropping is unavailable in this window.");
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare the selected image.")), "image/png");
  });
  return new File([blob], "screen-selection.png", { type: "image/png" });
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this image."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load this image."));
    image.src = source;
  });
}

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
