/**
 * Compress an image file client-side to avoid 413 payload errors.
 * Resizes to fit within maxSize and compresses to JPEG.
 * Ensures output is always under 3.5MB for Vercel compatibility.
 * Returns a File object that can be used in FormData.
 */
export async function compressImage(
  file: File,
  maxSize = 1200,
  quality = 0.8
): Promise<File> {
  // Skip non-images or already small files
  if (!file.type.startsWith("image/") || file.size < 200_000) {
    return file;
  }

  const compress = (img: HTMLImageElement, dim: number, q: number): Promise<Blob | null> =>
    new Promise((resolve) => {
      let { width, height } = img;
      if (width > dim || height > dim) {
        const ratio = Math.min(dim / width, dim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", q);
    });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        // First attempt with requested settings
        let blob = await compress(img, maxSize, quality);
        // If still over 3.5MB, try progressively more aggressive compression
        if (blob && blob.size > 3_500_000) {
          blob = await compress(img, Math.min(maxSize, 800), 0.6);
        }
        if (blob && blob.size > 3_500_000) {
          blob = await compress(img, 600, 0.5);
        }
        if (blob && blob.size > 3_500_000) {
          blob = await compress(img, 400, 0.4);
        }
        if (!blob) { reject(new Error("Compression failed")); return; }
        const compressed = new File(
          [blob],
          file.name.replace(/\.[^.]+$/, ".jpg"),
          { type: "image/jpeg" }
        );
        resolve(compressed);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}
