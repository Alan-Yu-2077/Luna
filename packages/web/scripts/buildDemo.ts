// v0.46.0: the showcase build — `demo.html` bundled as the page, the runtime assets staged the same
// way the production build stages them, the tape copied alongside, and the engineering map placed
// under /engineering/ so one Pages artifact carries both sites. Deliberately a SEPARATE output
// (`dist-demo/`) from `build.ts`'s `dist/`: the packaged desktop app must never carry a tape.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageWebAssets } from './stageAssets';

const root = join(import.meta.dir, '..');
const dist = join(root, 'dist-demo');
const publicDir = join(root, 'public');
const engineering = join(root, '..', '..', 'showcase', 'engineering');

rmSync(dist, { recursive: true, force: true });

const bundle = spawnSync('bun', ['build', './demo.html', '--production', '--outdir=dist-demo'], {
  cwd: root,
  stdio: 'inherit',
});
if (bundle.status !== 0) process.exit(bundle.status ?? 1);

renameSync(join(dist, 'demo.html'), join(dist, 'index.html'));
stageWebAssets(publicDir, dist);
cpSync(join(root, 'demo'), join(dist, 'demo'), { recursive: true });
if (existsSync(engineering)) cpSync(engineering, join(dist, 'engineering'), { recursive: true });
// Pages serves the artifact as-is, but a marker costs nothing and keeps underscore paths safe.
writeFileSync(join(dist, '.nojekyll'), '');
