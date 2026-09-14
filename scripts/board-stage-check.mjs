#!/usr/bin/env node
// Stage gate: nothing under apps/board may key layout off the browser
// viewport. The board renders inside a fixed 1280×720 BoardStage (spec
// 2026-09-15), so viewport media queries / units / breakpoints always
// misfire there. Container queries (@container, cqw/cqh) ARE allowed —
// they evaluate against the fixed stage and are deterministic.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN = join(ROOT, 'apps', 'board');
// Shared with the responsive student app — takes fixedStage instead.
const ALLOW_FILES = [/SpellingBeeStage/i];

const RULES = [
  { name: 'responsive Tailwind prefix (sm:/md:/lg:/xl:/2xl:)', re: /["'`\s]((?:sm|md|lg|xl|2xl):[a-z[-]+)/g },
  { name: 'viewport media query (@media)', re: /@media/g },
  { name: 'viewport unit (vh/vw/vmin/vmax)', re: /[\d.]v(h|w|min|max)\b|\bv(h|min|max)\b/g },
  { name: 'window.inner* sizing', re: /innerWidth|innerHeight/g },
];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });

const violations = [];
for (const file of walk(SCAN)) {
  if (ALLOW_FILES.some((re) => re.test(file))) continue;
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/BoardStage\.tsx$/.test(file)) return; // the stage itself is clean by construction
    for (const { name, re } of RULES) {
      re.lastIndex = 0;
      if (re.test(line)) violations.push(`${rel}:${i + 1}  ${name}  →  ${line.trim().slice(0, 120)}`);
    }
  });
}

if (violations.length) {
  console.error(`✗ board stage gate: ${violations.length} viewport-keyed line(s) under apps/board/:\n`);
  console.error(violations.join('\n'));
  console.error('\nThe board renders in a fixed 1280×720 BoardStage — size in stage px or cqw/cqh. See docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md');
  process.exit(1);
}
console.log('✓ board stage gate: no viewport-keyed layout under apps/board/');
