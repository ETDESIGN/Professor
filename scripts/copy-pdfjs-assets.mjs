// Copy pdfjs runtime assets (worker + wasm codecs) into public/pdfjs/ so
// they are served from STABLE paths. Vite's ?url assets get content-hashed
// filenames (openjpeg-abc123.wasm), but pdfjs builds codec URLs by appending
// the literal filename to wasmUrl — a hashed name means a guaranteed 404 and
// "Unable to decode image" on JPEG2000-scanned PDFs (the Power Up sample).
// Run automatically before dev/build (package.json predev/prebuild).
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjsDir = require.resolve('pdfjs-dist/package.json').replace('/package.json', '');

mkdirSync('public/pdfjs', { recursive: true });
cpSync(`${pdfjsDir}/build/pdf.worker.min.mjs`, 'public/pdfjs/pdf.worker.min.mjs');
mkdirSync('public/pdfjs/wasm', { recursive: true });
cpSync(`${pdfjsDir}/wasm/openjpeg.wasm`, 'public/pdfjs/wasm/openjpeg.wasm');
cpSync(`${pdfjsDir}/wasm/openjpeg_nowasm_fallback.js`, 'public/pdfjs/wasm/openjpeg_nowasm_fallback.js');
cpSync(`${pdfjsDir}/wasm/jbig2.wasm`, 'public/pdfjs/wasm/jbig2.wasm');
cpSync(`${pdfjsDir}/wasm/qcms_bg.wasm`, 'public/pdfjs/wasm/qcms_bg.wasm');
console.log('public/pdfjs assets refreshed (worker + wasm codecs)');
