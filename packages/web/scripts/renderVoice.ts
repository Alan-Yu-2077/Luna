// v0.46.1: pre-render her voice for the showcase script. Every spoken line in demo/script.json is
// synthesized ONCE through a GPT-SoVITS api_v2 — the same request `planTtsForward` builds for the
// live app, so the demo voice is the app's voice — then encoded to mp3 and recorded in
// demo/voice/manifest.json with its duration (the compiler paces each run by it). Idempotent: a
// line whose file already exists is skipped; a line the script no longer says is removed.
//
//   bun scripts/renderVoice.ts [--url http://127.0.0.1:9881] [--env <path to luna.env>]
//
// The voice reference (LUNA_TTS_REF_AUDIO / PROMPT_TEXT / PROMPT_LANG / TEXT_LANG) is read from the
// owner's luna.env — read, never copied into the repo. Run against a throwaway api_v2 port, not the
// one the running app owns.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lineKey } from '../src/demo/demoAudio';
import { DemoScript, spokenLines, VoiceManifest, type VoiceLine } from '../src/demo/script';
import { planTtsForward, readTtsEnv } from '../src/tts/apiV2';

const root = join(import.meta.dir, '..');
const demoDir = join(root, 'demo');
const voiceDir = join(demoDir, 'voice');
const manifestPath = join(voiceDir, 'manifest.json');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const url = arg('--url', 'http://127.0.0.1:9881');
const envPath = arg('--env', join(homedir(), 'Library', 'Application Support', '@luna', 'desktop', 'luna.env'));

// KEY=VALUE lines, quotes stripped, `~` expanded — luna.env's own conventions.
function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/^~(?=\/|$)/, homedir());
  }
  return out;
}

const env = readTtsEnv({ ...readEnvFile(envPath), LUNA_TTS_URL: url });

function lineId(text: string): string {
  return new Bun.CryptoHasher('sha1').update(lineKey(text)).digest('hex').slice(0, 12);
}

function durationMs(file: string): number {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
  });
  if (probe.status !== 0) throw new Error(`ffprobe failed for ${file}: ${probe.stderr}`);
  return Math.round(Number.parseFloat(probe.stdout.trim()) * 1000);
}

async function synthesize(text: string, wavPath: string): Promise<void> {
  const plan = planTtsForward('speak', JSON.stringify({ text }), env);
  if (plan.kind !== 'speak') throw new Error(`tts plan: ${plan.kind === 'error' ? plan.message : plan.kind}`);
  const res = await fetch(plan.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: plan.body });
  if (!res.ok) throw new Error(`api_v2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  writeFileSync(wavPath, new Uint8Array(await res.arrayBuffer()));
}

function encode(wavPath: string, mp3Path: string): void {
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', wavPath, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', mp3Path], {
    encoding: 'utf8',
  });
  if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.stderr}`);
}

async function main(): Promise<void> {
  mkdirSync(voiceDir, { recursive: true });
  const script = DemoScript.parse(JSON.parse(readFileSync(join(demoDir, 'script.json'), 'utf8')));
  const previous = existsSync(manifestPath)
    ? VoiceManifest.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
    : { lines: [] };
  const known = new Map(previous.lines.map((l) => [l.id, l]));

  const lines: VoiceLine[] = [];
  let rendered = 0;
  for (const text of spokenLines(script)) {
    const id = lineId(text);
    const file = `${id}.mp3`;
    const mp3Path = join(voiceDir, file);
    const prior = known.get(id);
    if (prior && existsSync(mp3Path)) {
      lines.push({ ...prior, text });
      continue;
    }
    process.stdout.write(`render ${id}  ${text.slice(0, 60)}\n`);
    const wavPath = join(voiceDir, `${id}.wav`);
    await synthesize(text, wavPath);
    encode(wavPath, mp3Path);
    unlinkSync(wavPath);
    lines.push({ id, text, file, durationMs: durationMs(mp3Path) });
    rendered += 1;
  }

  // Orphans: a voice for text the script no longer says.
  const keep = new Set(lines.map((l) => l.file));
  let removed = 0;
  for (const f of readdirSync(voiceDir)) {
    if (f.endsWith('.mp3') && !keep.has(f)) {
      unlinkSync(join(voiceDir, f));
      removed += 1;
    }
  }

  writeFileSync(manifestPath, `${JSON.stringify(VoiceManifest.parse({ lines }), null, 2)}\n`);
  const total = lines.reduce((s, l) => s + l.durationMs, 0);
  process.stdout.write(
    `manifest: ${lines.length} lines, ${rendered} rendered, ${removed} orphan(s) removed, ${(total / 1000).toFixed(1)}s of voice\n`,
  );
}

await main();
