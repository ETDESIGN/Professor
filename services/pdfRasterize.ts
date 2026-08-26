// Browser-side PDF → per-page JPEG rasterizer (FIXPLAN_F P2.3).
//
// pdfjs-dist is a declared dependency that was never wired up (whole-PDF
// "pages" used to be sent to the vision function). This module splits a
// PDF into page images so each page enters the scan-page pipeline.
// In the browser pdfjs needs its worker + the openjpeg wasm for
// JPEG2000 scans; both are imported as Vite URL assets so they are
// fingerprinted and served from our origin.

import * as pdfjsLib from 'pdfjs-dist';

// VERSIONED public paths (public/pdfjs/v2/, kept in sync by
// scripts/copy-pdfjs-assets.mjs via the predev/prebuild hooks). The version
// segment busts every cache layer — browser HTTP caches can pin a
// response's OLD security headers, which kept the CSP wasm block alive on
// the owner's machine long after the server-side fix (2026-08-26). Bump
// this together with the copy script's target directory whenever the pdfjs
// assets change.
const PDFJS_ASSETS_VERSION = 'v2';
const PDFJS_WORKER_URL = `/pdfjs/${PDFJS_ASSETS_VERSION}/pdf.worker.min.mjs`;
const PDFJS_WASM_URL = `/pdfjs/${PDFJS_ASSETS_VERSION}/wasm/`;

let workerReady = false;
async function ensureWorker() {
  if (workerReady) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  workerReady = true;
}

export interface RasterizedPage {
  blob: Blob;
  width: number;
  height: number;
  pageNumber: number; // 1-based within the PDF
}

/**
 * Rasterize a PDF file into JPEG pages at ~targetWidth on the long edge.
 * Returns pages in physical PDF order (printed page numbers are read by
 * the scan itself — physical order is jumbled in publisher samples).
 */
export async function rasterizePdf(
  file: File | Blob,
  targetWidth = 1500,
  onProgress?: (done: number, total: number) => void,
): Promise<RasterizedPage[]> {
  await ensureWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({
    data,
    isEvalSupported: false,
    // Exact filenames (openjpeg.wasm etc.) resolve under the stable
    // /pdfjs/wasm/ directory — see the note at the top of this file.
    wasmUrl: PDFJS_WASM_URL,
  }).promise;
  const pages: RasterizedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(targetWidth / base.width, 4);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('JPEG encode failed')), 'image/jpeg', 0.85));
    pages.push({ blob, width: canvas.width, height: canvas.height, pageNumber: i });
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  return pages;
}

export const isPdfFile = (file: File): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
