// Copy pdfjs runtime assets (worker + wasm codecs) into a VERSIONED public
// directory (public/pdfjs/v<N>/). Two reasons (owner reports 2026-08-26):
//  1. pdfjs builds codec URLs by appending the LITERAL filename to wasmUrl —
//     Vite's content-hashed ?url assets (openjpeg-<hash>.wasm) 404.
//  2. Browser/HTTP caches can pin a response's OLD security headers (the
//     CSP wasm block outlived the server-side fix). A fresh version path
//     busts every cache layer deterministically; bump PDFJS_ASSETS_VERSION
//     (services/pdfRasterize.ts) together with this directory whenever the
//     pdfjs assets are updated or headers change.
// Run automatically before dev/build (package.json predev/prebuild).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjsDir = require.resolve('pdfjs-dist/package.json').replace('/package.json', '');

const target = 'public/pdfjs/v2';
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(`${pdfjsDir}/build/pdf.worker.min.mjs`, `${target}/pdf.worker.min.mjs`);
mkdirSync(`${target}/wasm`, { recursive: true });
cpSync(`${pdfjsDir}/wasm/openjpeg.wasm`, `${target}/wasm/openjpeg.wasm`);
cpSync(`${pdfjsDir}/wasm/openjpeg_nowasm_fallback.js`, `${target}/wasm/openjpeg_nowasm_fallback.js`);
cpSync(`${pdfjsDir}/wasm/jbig2.wasm`, `${target}/wasm/jbig2.wasm`);
cpSync(`${pdfjsDir}/wasm/qcms_bg.wasm`, `${target}/wasm/qcms_bg.wasm`);
console.log(`${target} assets refreshed (worker + wasm codecs)`);
