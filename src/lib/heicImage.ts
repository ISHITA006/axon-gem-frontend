type HeicModule = typeof import("heic-to");

let heicModulePromise: Promise<HeicModule> | null = null;

function loadHeicModule(): Promise<HeicModule> {
  if (!heicModulePromise) {
    heicModulePromise = import("heic-to");
  }
  return heicModulePromise;
}

/**
 * iPhone photos are often HEIC/HEIF. Most browsers cannot render them in `<img>` or `Image()`.
 */
export async function isHeicLike(file: File): Promise<boolean> {
  try {
    const { isHeic } = await loadHeicModule();
    return await isHeic(file);
  } catch {
    return false;
  }
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  const { heicTo } = await loadHeicModule();
  const blob = await heicTo({
    blob: file,
    type: "image/jpeg",
    quality: 0.92,
  });
  if (!(blob instanceof Blob)) {
    throw new Error("HEIC conversion failed");
  }
  return blob;
}

async function canDisplayImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

/**
 * Object URL suitable for `<img src>`: converts HEIC/HEIF to JPEG; otherwise uses the file as-is.
 */
export async function createDisplayableImageObjectUrl(file: File): Promise<string> {
  if (await isHeicLike(file)) {
    const blob = await heicToJpegBlob(file);
    return URL.createObjectURL(blob);
  }

  const directUrl = URL.createObjectURL(file);
  if (await canDisplayImageUrl(directUrl)) {
    return directUrl;
  }

  URL.revokeObjectURL(directUrl);
  const blob = await heicToJpegBlob(file);
  return URL.createObjectURL(blob);
}

/**
 * File that `HTMLImageElement` / canvas can decode. Converts HEIC to JPEG when needed (e.g. before resize/compress).
 */
export async function toBrowserDecodedImageFile(file: File): Promise<File> {
  if (!(await isHeicLike(file))) return file;
  const blob = await heicToJpegBlob(file);
  const base = file.name.replace(/\.[^.]+$/i, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
