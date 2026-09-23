// v0.47.0: the turntable's covers, drawn — a gradient from a hash of the track id and the title's
// monogram — so the public showcase never ships real album art. Idempotent; run after editing the
// script's `music.tracks`:
//
//   bun scripts/drawCovers.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DemoScript } from '../src/demo/script';

const root = join(import.meta.dir, '..');
// v0.48.1: every language's shelf (the tracks are the same records; the covers are shared).
const tracks = ['en', 'zh']
  .map((lang) => join(root, 'demo', lang, 'script.json'))
  .filter((f) => existsSync(f))
  .flatMap((f) => DemoScript.parse(JSON.parse(readFileSync(f, 'utf8'))).music?.tracks ?? []);
const outDir = join(root, 'demo', 'music');
mkdirSync(outDir, { recursive: true });

function hue(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 360;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

let n = 0;
for (const t of tracks) {
  if (!t.cover) continue;
  const h1 = hue(t.id, 1);
  const h2 = (h1 + 40 + hue(t.id, 2) % 60) % 360;
  const mono = t.title
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h1} 55% 62%)"/>
      <stop offset="1" stop-color="hsl(${h2} 60% 38%)"/>
    </linearGradient>
    <radialGradient id="r" cx="0.3" cy="0.25" r="0.8">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <rect width="600" height="600" fill="url(#r)"/>
  <circle cx="300" cy="300" r="190" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="14"/>
  <text x="300" y="332" text-anchor="middle" font-family="Fredoka, 'Segoe UI', sans-serif" font-size="150" font-weight="600" fill="#fff" fill-opacity="0.92">${esc(mono)}</text>
  <text x="300" y="530" text-anchor="middle" font-family="Fredoka, 'Segoe UI', sans-serif" font-size="30" fill="#fff" fill-opacity="0.85">${esc(t.artist)}</text>
</svg>
`;
  writeFileSync(join(outDir, `${t.cover}.svg`), svg);
  n += 1;
}
process.stdout.write(`covers: ${n} drawn\n`);
