import { toBrowserDecodedImageFile } from "./heicImage";

/** Global ceilings for images sent to generation APIs / S3: 10 MB and 1080p (longest side 1920px). */
export const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_DIMENSION = 1920;

type EncodeAttempt = ["image/jpeg" | "image/webp", number];

const DEFAULT_QUALITY_STEPS: EncodeAttempt[] = [
  ["image/jpeg", 0.9],
  ["image/jpeg", 0.8],
  ["image/jpeg", 0.7],
  ["image/webp", 0.8],
  ["image/webp", 0.65],
];

export type CompressImageOptions = {
  /** Maximum encoded size in bytes. Defaults to 10 MB. */
  maxBytes?: number;
  /** Maximum width/height in pixels (longest side). Defaults to 1920 (1080p). */
  maxDimension?: number;
  /** Re-encode attempts tried in order until one fits under maxBytes. */
  qualitySteps?: EncodeAttempt[];
  /** When no attempt fits under maxBytes, return the smallest result instead of throwing. */
  acceptSmallestOnFailure?: boolean;
  /** Always re-encode through canvas, even when the file is already within limits. */
  forceReencode?: boolean;
};

async function readImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to read image"));
    };
    image.src = objectUrl;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/webp",
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to compress image"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Ensures an image is within the size/resolution limits before it is sent to an
 * API or uploaded to S3. Converts HEIC to JPEG, downscales anything larger than
 * `maxDimension` on its longest side, and re-encodes until under `maxBytes`.
 * Files already within both limits are returned unchanged.
 */
export async function compressImageForUpload(
  file: File,
  options?: CompressImageOptions
): Promise<File> {
  const maxBytes = options?.maxBytes ?? MAX_UPLOAD_IMAGE_BYTES;
  const maxDimension = options?.maxDimension ?? MAX_UPLOAD_IMAGE_DIMENSION;
  const qualitySteps = options?.qualitySteps ?? DEFAULT_QUALITY_STEPS;

  const decoded = await toBrowserDecodedImageFile(file);

  let image: HTMLImageElement;
  try {
    image = await readImageFromFile(decoded);
  } catch {
    // Not decodable as an image in this browser; fall back to the size check only.
    if (decoded.size <= maxBytes) return decoded;
    throw new Error("Image is too large. Please upload a smaller image.");
  }

  const longestSide = Math.max(image.width, image.height);
  if (!options?.forceReencode && longestSide <= maxDimension && decoded.size <= maxBytes) {
    return decoded;
  }

  const scale = Math.min(1, maxDimension / longestSide);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Image processing is not supported in this browser");
  }
  ctx.drawImage(image, 0, 0, width, height);

  const baseName = decoded.name.replace(/\.[^.]+$/, "") || "upload";
  let smallest: { blob: Blob; mimeType: "image/jpeg" | "image/webp" } | null = null;

  for (const [mimeType, quality] of qualitySteps) {
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!smallest || blob.size < smallest.blob.size) {
      smallest = { blob, mimeType };
    }
    if (blob.size <= maxBytes) {
      const extension = mimeType === "image/webp" ? "webp" : "jpg";
      return new File([blob], `${baseName}.${extension}`, { type: mimeType });
    }
  }

  if (options?.acceptSmallestOnFailure && smallest) {
    const extension = smallest.mimeType === "image/webp" ? "webp" : "jpg";
    return new File([smallest.blob], `${baseName}.${extension}`, { type: smallest.mimeType });
  }

  throw new Error("Image is too large. Please upload a smaller image.");
}
