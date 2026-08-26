// Intake quality gate (FIXPLAN_F P3.3, doc 10 §8 caveats): photo quality is
// load-bearing for crops. Detection only + honest warnings — never blocks a
// teacher's upload (teacher sovereignty).

export interface ImageQuality {
  width: number;
  height: number;
  /** Sharpness score — variance of the Laplacian on a downscaled grayscale. */
  sharpness: number;
  warnings: string[];
}

const MIN_LONG_EDGE = 900;
const BLUR_THRESHOLD = 60; // tuned against the Power Up 2 fixture renders

export async function assessImageQuality(blob: Blob): Promise<ImageQuality> {
  const warnings: string[] = [];
  // createImageBitmap applies EXIF orientation — the free deskew floor.
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  const longEdge = Math.max(width, height);
  if (longEdge < MIN_LONG_EDGE) {
    warnings.push(`low resolution (${width}×${height}) — crops may look blurry when zoomed; a retake at higher resolution is recommended`);
  }

  // Variance of Laplacian on a 256px grayscale thumbnail.
  const scale = 256 / longEdge;
  const w = Math.max(16, Math.round(width * scale));
  const h = Math.max(16, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const gray = new Float64Array(w * h);
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const variance = n > 0 ? sumSq / n - (sum / n) ** 2 : 0;
  if (variance < BLUR_THRESHOLD) {
    warnings.push('photo looks blurry — text crops may be hard to read; hold the camera steadier or retake');
  }

  return { width, height, sharpness: variance, warnings };
}
