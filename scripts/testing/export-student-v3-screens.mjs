// Export student-app-v3 Stitch screens to stitch/<nn>-game>/ by parsing each
// game file's §4.f design log for screen IDs. Idempotent; skips already-exported IDs.
// Usage: STITCH_API_KEY=… node scripts/testing/export-student-v3-screens.mjs [nn ...]
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), '../../docs/audit/student-app-v3');
const KEY = process.env.STITCH_API_KEY;
const PROJECT = '6865954475041880496';
if (!KEY) { console.error('STITCH_API_KEY required'); process.exit(1); }

const only = process.argv.slice(2); // optional NN filters
const files = fs.readdirSync(DIR).filter(f => /^\d\d-.*\.md$/.test(f)).sort();

async function sh(cmd) {
  const { execSync } = await import('node:child_process');
  return execSync(cmd, { env: { ...process.env, STITCH_API_KEY: KEY }, maxBuffer: 32 * 1024 * 1024 }).toString();
}

const manifest = [];
for (const f of files) {
  const nn = f.slice(0, 2);
  if (only.length && !only.includes(nn)) continue;
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  const f4 = s.slice(s.indexOf('### 4.f'));
  const ids = [...f4.matchAll(/\b([0-9a-f]{32})\b/g)].map(m => m[1]);
  const uniq = [...new Set(ids)];
  if (!uniq.length) continue;
  const outDir = path.join(DIR, 'stitch', f.replace('.md', ''));
  fs.mkdirSync(outDir, { recursive: true });
  let i = 0;
  for (const id of uniq) {
    i++;
    const htmlPath = path.join(outDir, `${i}.html`);
    const pngPath = path.join(outDir, `${i}.png`);
    if (fs.existsSync(htmlPath) && fs.existsSync(pngPath)) { manifest.push(`${f} ${i} cached ${id}`); continue; }
    let raw;
    try {
      raw = await sh(`npx -y @_davideast/stitch-mcp tool get_screen -d '{"name":"projects/${PROJECT}/screens/${id}"}'`);
    } catch (e) { manifest.push(`${f} ${i} FETCH-FAIL ${id} ${String(e).slice(0, 60)}`); continue; }
    let j;
    try { j = JSON.parse(raw.slice(raw.indexOf('{'))); } catch { manifest.push(`${f} ${i} PARSE-FAIL ${id}`); continue; }
    const title = (j.title || 'screen').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    try {
      const htmlRes = await fetch(j.htmlCode.downloadUrl);
      const html = Buffer.from(await htmlRes.arrayBuffer());
      if (htmlRes.ok && html.length > 500) fs.writeFileSync(htmlPath, html);
      const pngRes = await fetch(j.screenshot?.downloadUrl ?? 'http://invalid.local');
      const png = Buffer.from(await pngRes.arrayBuffer());
      if (pngRes.ok && png.subarray(0, 4).toString('hex') === '89504e47') fs.writeFileSync(pngPath, png);
      manifest.push(`${f} ${i}-${title}.${htmlRes.ok && html.length > 500 ? 'html' : ''}${pngRes.ok && png.subarray(0,4).toString('hex')==='89504e47' ? '+png' : ''} ${id}`);
    } catch (e) { manifest.push(`${f} ${i} DL-FAIL ${id} ${String(e).slice(0, 60)}`); }
  }
}
console.log(manifest.join('\n'));
console.log(`DONE ${manifest.length} entries`);
