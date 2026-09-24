// v0.46.0 — the demo's stagehand: the only DOM the showcase adds to the app. It pre-types a user
// beat into the REAL input (dispatching `input` events, so she leans in exactly as she does for a
// typing owner), guards Send until the beat is fully typed, and mounts one foreign element — a pill
// in the model stage naming the scene, with the Next button once the scene has played out.
//
// The input stays read-only for the whole demo. That is the one visible deviation from the app,
// chosen over the alternative: letting a visitor type into a conversation that answers from a script.
//
// v0.47.0 — three more devices, all demo-only and all outside her: the entrance guide (what this
// page is, and the promise), the curtain (time passes — a dark room and a clock), and the scene
// picker on the pill. None of them touches the app's DOM tree beyond appending to it.

import { t, type UiLang } from '../ui/uiCopy';
import type { StageCue } from './compile';

export type DirectorRefs = {
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  modelStage: HTMLElement;
  chatLog: HTMLElement;
};

export type Director = {
  arm(text: string): void;
  disarm(): void;
  sceneStart(index: number, title: string): void;
  sceneEnd(index: number, hasNext: boolean): void;
  skip(label: string, ms: number): void;
  // v0.48.3: his hand on the player — the room dims like the time curtain, an app icon waits for
  // the visitor's click; the click starts the track (`onPlay`) and only then is the next line typed.
  pressPlay(label: string, onPlay: () => void): void;
  // v0.49.0: back at his desk — a drawn desktop, the folder she left, the file in it, its first page.
  openFile(file: OpenFileCue): void;
  // v0.51.0: her inner voice in the curtain call — a card in the chat, not a bubble.
  inner(text: string): void;
  dispose(): void;
};

export type OpenFileCue = Extract<StageCue, { kind: 'open_file' }>;

export const TYPE_MS = 45;
export const TYPE_LEAD_MS = 500;
// The curtain's fades, inside the skip's own duration.
export const CURTAIN_FADE_MS = 450;
// How long the "no real audio" note stays after the play click — long enough to read twice.
export const NO_AUDIO_NOTICE_MS = 3800;

const STYLE = `
/* v0.51.2: the scene pill and the notes button share one bar, the button right beside the pill. */
.demo-bar {
  position: absolute; left: 50%; top: 10px; transform: translateX(-50%); z-index: 5;
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px 10px;
  width: max-content; max-width: calc(100% - 24px); pointer-events: none;
}
.demo-pill {
  position: relative;
  display: inline-flex; align-items: center; gap: 10px; white-space: nowrap;
  background: #fff; color: var(--ink); font-size: 12px; padding: 6px 8px 6px 12px; border-radius: 999px;
  box-shadow: 0 1px 4px rgba(90, 120, 160, 0.18); opacity: 0; transition: opacity 0.3s; pointer-events: none;
}
.demo-pill.on { opacity: 1; pointer-events: auto; }
.menu-mode .demo-pill { opacity: 0; pointer-events: none; }
.demo-scene {
  border: none; background: none; font: inherit; color: inherit; cursor: pointer; padding: 0;
}
.demo-scene::after { content: ' ▾'; color: var(--muted); }
.demo-scene:hover { color: var(--sky-text); }
.demo-scenes {
  position: absolute; top: calc(100% + 8px); left: 0; min-width: 240px; margin: 0; padding: 6px;
  list-style: none; background: #fff; color: var(--ink); border-radius: 14px;
  box-shadow: 0 6px 24px rgba(90, 120, 160, 0.22); text-align: left;
  max-height: calc(100vh - 64px); overflow-y: auto; overscroll-behavior: contain;
}
.demo-scenes[hidden] { display: none; }
.demo-scenes button {
  display: block; width: 100%; border: none; background: none; font: inherit; color: inherit;
  text-align: left; padding: 6px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap;
}
.demo-scenes button:hover { background: var(--user-bubble); }
.demo-scenes button.current { color: var(--sky-text); font-weight: 600; }
.demo-next {
  border: none; cursor: pointer; background: var(--sky); color: var(--sky-text);
  font: inherit; font-size: 12px; font-weight: 500; padding: 5px 12px; border-radius: 999px;
}
.demo-next:hover { background: var(--sky-deep); }
.demo-next[hidden] { display: none; }
.send-btn.demo-armed { animation: demo-nudge 1.4s ease-in-out infinite; }
@keyframes demo-nudge { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }

.demo-curtain {
  position: fixed; inset: 0; z-index: 800; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 22px; background: #141a26; color: #e8edf5; opacity: 0;
  pointer-events: none; transition: opacity ${CURTAIN_FADE_MS}ms ease;
}
.demo-curtain.on { opacity: 1; pointer-events: auto; }
.demo-curtain svg { width: 132px; height: 132px; }
.demo-curtain .demo-clock-face { fill: none; stroke: #8fa6bf; stroke-width: 2; }
.demo-curtain .demo-clock-tick { stroke: #8fa6bf; stroke-width: 2; }
.demo-curtain .demo-clock-hand { stroke: #e8edf5; stroke-width: 3; stroke-linecap: round; transform-origin: 60px 60px; }
.demo-curtain .demo-clock-hand.hour { stroke-width: 4; }
.demo-curtain.on .demo-clock-hand.minute { animation: demo-sweep-min var(--sweep) cubic-bezier(0.45, 0, 0.3, 1) forwards; }
.demo-curtain.on .demo-clock-hand.hour { animation: demo-sweep-hour var(--sweep) cubic-bezier(0.45, 0, 0.3, 1) forwards; }
@keyframes demo-sweep-min { from { transform: rotate(0deg); } to { transform: rotate(720deg); } }
@keyframes demo-sweep-hour { from { transform: rotate(0deg); } to { transform: rotate(60deg); } }
.demo-curtain .demo-curtain-label { font-size: 16px; letter-spacing: 0.08em; color: #c9d4e3; }

.demo-inner {
  align-self: flex-end; max-width: 88%; margin: 2px 0; padding: 9px 13px 10px; border-radius: 14px;
  background: #fff; border: 1.5px dashed var(--lavender-deep); color: var(--ink-soft);
  animation: chat-in var(--m-soft) var(--ease-pop);
}
.demo-inner-tag { display: block; margin-bottom: 3px; font-size: 10.5px; letter-spacing: 0.06em; color: var(--muted); }
.demo-inner p { margin: 0; font-size: 12.5px; line-height: 1.6; font-style: italic; }

.demo-play { gap: 16px; }
body:has(.menu-mode) .demo-play, body:has(.menu-mode) .demo-desk { display: none; }

.demo-desk { background: radial-gradient(120% 90% at 20% 10%, #50709a 0%, #2d4262 55%, #1b2638 100%); gap: 18px; }
.demo-desk .demo-desk-hint {
  position: absolute; top: 34px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 48px);
  background: rgba(20, 26, 38, 0.55); color: #e8edf5; font-size: 14px; letter-spacing: 0.04em;
  padding: 8px 16px; border-radius: 999px; text-align: center;
}
.demo-desk .demo-desk-icon, .demo-desk .demo-desk-file {
  display: flex; flex-direction: column; align-items: center; gap: 6px; border: none; background: none;
  cursor: pointer; padding: 10px 12px; border-radius: 12px; font: inherit;
}
.demo-desk .demo-desk-icon svg { width: 76px; height: 62px; }
.demo-desk .demo-desk-icon span { color: #fff; font-size: 13px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
.demo-desk .demo-desk-icon:hover, .demo-desk .demo-desk-file:hover { background: rgba(255, 255, 255, 0.14); }
.demo-desk .demo-desk-pulse { animation: demo-desk-pulse 1.6s ease-in-out infinite; }
@keyframes demo-desk-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
.demo-desk .demo-desk-window {
  width: min(460px, calc(100vw - 32px)); background: #f7f9fc; border-radius: 12px; overflow: hidden;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45); color: #2c3a4d;
}
.demo-desk .demo-desk-window.reader { width: min(640px, calc(100vw - 32px)); }
.demo-desk .demo-desk-bar {
  display: flex; align-items: center; gap: 7px; padding: 9px 12px; background: #e6ebf2; font-size: 12px; color: #5b6a80;
}
.demo-desk .demo-desk-bar i { width: 11px; height: 11px; border-radius: 50%; background: #c9d3df; display: inline-block; }
.demo-desk .demo-desk-bar span { margin-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-desk .demo-desk-body { padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.demo-desk .demo-desk-file svg { width: 48px; height: 60px; }
.demo-desk .demo-desk-file span { font-size: 13px; color: #2c3a4d; }
.demo-desk .demo-desk-file:hover { background: #e8eef6; }
.demo-desk .demo-desk-sub { margin: 0; font-size: 12px; color: #8a97a8; }
.demo-desk .demo-desk-page {
  width: 100%; max-height: min(52vh, 460px); overflow: auto; background: #fff; border: 1px solid #dfe5ee;
  padding: 26px 30px; font-family: 'Times New Roman', Times, serif; color: #1d2430; text-align: center;
}
.demo-desk .doc-title { font-size: 26px; margin: 0 0 14px; font-weight: 700; }
.demo-desk .doc-authors { font-size: 13px; margin: 0 0 6px; line-height: 1.5; }
.demo-desk .doc-aff { font-size: 12px; margin: 0 0 18px; color: #4a5566; font-style: italic; }
.demo-desk .doc-abs { font-size: 15px; margin: 0 0 6px; }
.demo-desk .doc-lead { font-size: 13px; margin: 0 auto 18px; max-width: 460px; text-align: left; line-height: 1.55; }
.demo-desk .doc-venue, .demo-desk .doc-id { font-size: 11px; margin: 0 0 4px; color: #6b7686; }
.demo-desk .demo-desk-actions { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.demo-desk .demo-desk-actions a { font-size: 13px; color: #27496b; }
.demo-desk .demo-desk-back {
  border: none; cursor: pointer; background: var(--sky); color: var(--sky-text); font: inherit; font-size: 14px;
  font-weight: 600; padding: 8px 18px; border-radius: 999px; box-shadow: 0 2px 0 var(--sky-deep);
}
.demo-play .demo-play-app {
  position: relative; width: 104px; height: 104px; border: none; border-radius: 28px; padding: 0; cursor: pointer;
  background: #d43c33; box-shadow: 0 10px 30px rgba(212, 60, 51, 0.35); transition: transform 0.15s ease;
}
.demo-play .demo-play-app:hover { transform: scale(1.05); }
.demo-play .demo-play-app:active { transform: scale(0.97); }
.demo-play .demo-play-app svg { width: 60px; height: 60px; }
.demo-play .demo-play-app::after {
  content: ''; position: absolute; inset: -8px; border-radius: 34px; border: 2px solid rgba(212, 60, 51, 0.6);
  animation: demo-play-ring 1.6s ease-out infinite;
}
@keyframes demo-play-ring { from { transform: scale(0.94); opacity: 1; } to { transform: scale(1.18); opacity: 0; } }
.demo-play .demo-play-name { font-size: 13px; letter-spacing: 0.06em; color: #e8edf5; }
.demo-play .demo-curtain-label { max-width: min(460px, calc(100vw - 48px)); text-align: center; line-height: 1.5; }
.demo-play .demo-play-hint { font-size: 12px; letter-spacing: 0.08em; color: #8fa6bf; }
.demo-play.noticing .demo-play-app { cursor: default; }
.demo-play.noticing .demo-play-app::after { animation: none; opacity: 0; }
.demo-play.noticing .demo-curtain-label { color: #f3d9a6; }

.demo-guide {
  position: fixed; inset: 0; z-index: 900; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(20, 26, 38, 0.58); backdrop-filter: blur(3px);
  opacity: 1; transition: opacity 0.5s ease;
}
.demo-guide.leaving { opacity: 0; pointer-events: none; }
.demo-guide .demo-guide-card {
  width: min(600px, 100%); max-height: calc(100vh - 48px); overflow: auto; background: #fff; color: var(--ink);
  border-radius: 22px; padding: 26px 28px 22px; box-shadow: 0 18px 60px rgba(20, 30, 50, 0.35);
}
.demo-guide h2 { margin: 0 0 4px; font-size: 22px; }
.demo-guide .demo-guide-sub { margin: 0 0 16px; font-size: 12px; letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; }
.demo-guide p { display: block; margin: 0 0 10px; font-size: 14px; line-height: 1.6; }
.demo-guide .demo-guide-how { margin: 14px 0 0; padding: 12px 14px; background: var(--user-bubble); border-radius: 12px; font-size: 13px; line-height: 1.6; }
.demo-guide .demo-guide-enter {
  display: block; margin: 18px auto 0; border: none; cursor: pointer; background: var(--sky); color: var(--sky-text);
  font: inherit; font-size: 15px; font-weight: 600; padding: 11px 28px; border-radius: 999px;
  box-shadow: 0 3px 0 var(--sky-deep);
}
.demo-guide .demo-guide-enter:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--sky-deep); }
.demo-guide .demo-guide-enter.loading {
  cursor: progress; color: var(--sky-text); box-shadow: 0 3px 0 var(--sky-deep);
  background: linear-gradient(90deg, var(--sky-deep) var(--p, 0%), var(--sky) var(--p, 0%));
}
.demo-guide .demo-guide-langs { display: flex; gap: 14px; justify-content: center; margin: 18px 0 4px; flex-wrap: wrap; }
.demo-guide .demo-guide-lang {
  flex: 1 1 180px; max-width: 240px; border: none; cursor: pointer; font: inherit; color: var(--ink);
  background: var(--user-bubble); border-radius: 18px; padding: 20px 14px; box-shadow: 0 3px 0 rgba(90, 120, 160, 0.2);
  transition: transform 0.15s ease;
}
.demo-guide .demo-guide-lang:hover { transform: translateY(-2px); }
.demo-guide .demo-guide-lang strong { display: block; font-size: 22px; margin-bottom: 4px; }
.demo-guide .demo-guide-lang span { font-size: 12px; color: var(--muted); letter-spacing: 0.04em; }
.demo-guide .demo-guide-lang { position: relative; }
.demo-guide .demo-guide-lang.recommended { box-shadow: 0 0 0 2px var(--sky-deep), 0 3px 0 rgba(90, 120, 160, 0.2); }
.demo-guide .demo-guide-badge {
  position: absolute; top: -10px; right: 14px; font-style: normal; font-size: 11px; font-weight: 600;
  letter-spacing: 0.04em; padding: 3px 10px; border-radius: 999px; background: var(--sky-text); color: #fff;
}
.demo-desktop-only {
  position: fixed; inset: 0; z-index: 1000; display: flex; padding: 32px 24px; overflow-y: auto;
  text-align: center; color: #e8edf5; background: radial-gradient(120% 90% at 50% 18%, #33445e 0%, #1a2230 72%);
}
/* Centred while it fits; taller than the screen (a phone on its side), it scrolls from the top. */
.demo-desktop-only .inner { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.demo-desktop-only h2 { margin: 4px 0 0; font-size: 20px; line-height: 1.45; }
.demo-desktop-only .en { display: block; margin-top: 2px; font-size: 0.72em; font-weight: 500; color: #8fa6bf; }
.demo-desktop-only button {
  margin-top: 6px; border: none; cursor: pointer; background: var(--sky); color: var(--sky-text); font: inherit;
  font-size: 14px; font-weight: 600; padding: 8px 20px; border-radius: 999px; box-shadow: 0 3px 0 var(--sky-deep);
}
.demo-desktop-only .url { margin: 0; max-width: 320px; font-size: 12px; color: #8fa6bf; word-break: break-all; }
/* v0.51.5: phone ✗, PC ✓ — drawn, then looped. */
.demo-devices { width: min(300px, 80vw); height: auto; overflow: visible; }
.demo-devices .dev { fill: none; stroke: #e8edf5; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; }
.demo-devices .screen { fill: rgba(232, 237, 245, 0.07); }
.demo-devices .no { fill: none; stroke: #ff6b7a; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 34 40; }
.demo-devices .yes { fill: none; stroke: #5fd39a; stroke-width: 6.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 60 70; }
.demo-devices .flow { fill: none; stroke: #8fa6bf; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 4 7; }
.demo-devices .head { fill: none; stroke: #8fa6bf; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.demo-devices .glow { fill: #5fd39a; opacity: 0; }
.demo-devices .phone, .demo-devices .pc { transform-box: fill-box; transform-origin: center; }
.demo-devices .phone { animation: demo-dev-shake 4.8s ease-in-out infinite; }
.demo-devices .pc { animation: demo-dev-pop 4.8s ease-in-out infinite; }
.demo-devices .no { animation: demo-dev-no 4.8s ease-in-out infinite; }
.demo-devices .no.b { animation-delay: 0.12s; }
.demo-devices .yes { animation: demo-dev-yes 4.8s ease-in-out infinite; }
.demo-devices .flow { animation: demo-dev-flow 0.9s linear infinite; }
.demo-devices .glow { animation: demo-dev-glow 4.8s ease-in-out infinite; }
@keyframes demo-dev-no { 0%, 6% { stroke-dashoffset: 38; opacity: 1; } 18%, 86% { stroke-dashoffset: 0; opacity: 1; } 96%, 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes demo-dev-shake { 0%, 20%, 34%, 100% { transform: translateX(0); } 23% { transform: translateX(-4px) rotate(-3deg); } 27% { transform: translateX(4px) rotate(3deg); } 31% { transform: translateX(-2px); } }
@keyframes demo-dev-yes { 0%, 42% { stroke-dashoffset: 64; opacity: 1; } 58%, 86% { stroke-dashoffset: 0; opacity: 1; } 96%, 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes demo-dev-pop { 0%, 40%, 56%, 100% { transform: scale(1); } 47% { transform: scale(1.07); } }
@keyframes demo-dev-glow { 0%, 50% { opacity: 0; } 62%, 84% { opacity: 0.16; } 96%, 100% { opacity: 0; } }
@keyframes demo-dev-flow { to { stroke-dashoffset: -11; } }
@media (prefers-reduced-motion: reduce) {
  .demo-devices .phone, .demo-devices .pc, .demo-devices .no, .demo-devices .yes, .demo-devices .flow, .demo-devices .glow { animation: none; }
  .demo-devices .no, .demo-devices .yes { stroke-dashoffset: 0; }
  .demo-devices .glow { opacity: 0.16; }
}
`;

let styleMounted = false;
function ensureStyle(doc: Document): void {
  if (styleMounted) return;
  const style = doc.createElement('style');
  style.dataset['demo'] = 'director';
  style.textContent = STYLE;
  doc.head.appendChild(style);
  styleMounted = true;
}

export function mountDirector(
  doc: Document,
  refs: DirectorRefs,
  opts: {
    sceneTitles: string[];
    onNext: () => void;
    onJump: (index: number) => void;
    // v0.50.0: the engineering notes — the button appears when a scene has played out and has notes.
    hasNotes?: (index: number) => boolean;
    onNotes?: (index: number) => void;
  },
): Director {
  ensureStyle(doc);

  const pill = doc.createElement('div');
  pill.className = 'demo-pill';
  const label = doc.createElement('button');
  label.type = 'button';
  label.className = 'demo-scene';
  const list = doc.createElement('ul');
  list.className = 'demo-scenes';
  list.hidden = true;
  const items = opts.sceneTitles.map((title, i) => {
    const li = doc.createElement('li');
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = `${i + 1}. ${title}`;
    b.addEventListener('click', () => {
      list.hidden = true;
      opts.onJump(i);
    });
    li.appendChild(b);
    list.appendChild(li);
    return b;
  });
  label.addEventListener('click', () => {
    list.hidden = !list.hidden;
  });
  const next = doc.createElement('button');
  next.type = 'button';
  next.className = 'demo-next';
  next.hidden = true;
  pill.append(label, next, list);
  const bar = doc.createElement('div');
  bar.className = 'demo-bar';
  bar.appendChild(pill);
  refs.modelStage.appendChild(bar);

  // v0.50.0: the door to the engineering notes, shown once a scene is over. v0.51.2: it pops in beside
  // the scene pill, where the eye already is when a scene ends.
  const codeBtn = doc.createElement('button');
  codeBtn.type = 'button';
  codeBtn.className = 'demo-code-btn';
  codeBtn.hidden = true;
  const codeGlyph = doc.createElement('span');
  codeGlyph.className = 'glyph';
  codeGlyph.textContent = '</>';
  const codeLabel = doc.createElement('span');
  codeLabel.textContent = t('demo.codeNotes');
  codeBtn.append(codeGlyph, codeLabel);
  let codeIndex = -1;
  codeBtn.addEventListener('click', () => {
    if (codeIndex >= 0) opts.onNotes?.(codeIndex);
  });
  bar.appendChild(codeBtn);

  const curtain = doc.createElement('div');
  curtain.className = 'demo-curtain';
  curtain.innerHTML =
    '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="demo-clock-face" cx="60" cy="60" r="54"/>' +
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const r1 = i % 3 === 0 ? 44 : 48;
      return `<line class="demo-clock-tick" x1="${(60 + Math.sin(a) * r1).toFixed(1)}" y1="${(60 - Math.cos(a) * r1).toFixed(1)}" x2="${(60 + Math.sin(a) * 52).toFixed(1)}" y2="${(60 - Math.cos(a) * 52).toFixed(1)}"/>`;
    }).join('') +
    '<line class="demo-clock-hand hour" x1="60" y1="60" x2="60" y2="32"/><line class="demo-clock-hand minute" x1="60" y1="60" x2="60" y2="20"/>' +
    '<circle cx="60" cy="60" r="3" fill="#e8edf5"/></svg><div class="demo-curtain-label"></div>';
  const curtainLabel = curtain.querySelector<HTMLElement>('.demo-curtain-label');
  doc.body.appendChild(curtain);
  let curtainTimer: ReturnType<typeof setTimeout> | undefined;

  // The player prompt: the same dark room, an app icon instead of a clock. The icon is drawn here — a
  // red tile and a note, named in words — not the vendor's logo artwork.
  const play = doc.createElement('div');
  play.className = 'demo-curtain demo-play';
  play.setAttribute('role', 'dialog');
  const appBtn = doc.createElement('button');
  appBtn.type = 'button';
  appBtn.className = 'demo-play-app';
  appBtn.innerHTML =
    '<svg viewBox="0 0 60 60" aria-hidden="true"><g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="26" cy="37" r="9" stroke-width="4.6"/><path d="M35 37V14" stroke-width="4.6"/>' +
    '<path d="M35 14c3.2 1.4 7.6 3.4 9.2 8.2" stroke-width="4"/></g></svg>';
  const appName = doc.createElement('div');
  appName.className = 'demo-play-name';
  const playLabel = doc.createElement('div');
  playLabel.className = 'demo-curtain-label';
  const playHint = doc.createElement('div');
  playHint.className = 'demo-play-hint';
  play.append(appBtn, appName, playLabel, playHint);
  doc.body.appendChild(play);
  // v0.49.0: the desk — his screen, drawn: a folder on a wallpaper, a Finder-like window, a page.
  const desk = doc.createElement('div');
  desk.className = 'demo-curtain demo-desk';
  desk.setAttribute('role', 'dialog');
  doc.body.appendChild(desk);

  // A visitor action the next line waits for (his hand on the player, on the folder). While one is
  // open, `arm` parks the line; finishing the action types it — he did the thing, then he says so.
  let gate: 'play' | 'file' | null = null;
  let onPlay: (() => void) | null = null;
  let pendingArm: string | null = null;

  refs.input.readOnly = true;
  refs.sendBtn.disabled = true;

  let armed = false;
  let typing: Array<ReturnType<typeof setTimeout>> = [];
  const stopTyping = (): void => {
    for (const t of typing) clearTimeout(t);
    typing = [];
  };
  const disarm = (): void => {
    stopTyping();
    armed = false;
    refs.sendBtn.disabled = true;
    refs.sendBtn.classList.remove('demo-armed');
  };

  // Enter sends in app.ts (a bubbling listener on the same input). This capture-phase guard runs
  // first and swallows it while the beat is still being typed, so a half-typed line cannot be sent.
  const guard = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !armed) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  };
  refs.input.addEventListener('keydown', guard, true);

  let nextHandler: (() => void) | null = null;
  const onNextClick = (): void => nextHandler?.();
  next.addEventListener('click', onNextClick);

  const typeIn = (text: string): void => {
    disarm();
    refs.input.value = '';
    const chars = Array.from(text);
    chars.forEach((_, i) => {
      typing.push(
        setTimeout(() => {
          refs.input.value = chars.slice(0, i + 1).join('');
          refs.input.dispatchEvent(new Event('input', { bubbles: true }));
        }, TYPE_LEAD_MS + i * TYPE_MS),
      );
    });
    typing.push(
      setTimeout(() => {
        armed = true;
        refs.sendBtn.disabled = false;
        refs.sendBtn.classList.add('demo-armed');
      }, TYPE_LEAD_MS + chars.length * TYPE_MS),
    );
  };

  const release = (): void => {
    const text = pendingArm;
    gate = null;
    onPlay = null;
    pendingArm = null;
    // The next line is typed once the room is lit again.
    if (text !== null) setTimeout(() => typeIn(text), CURTAIN_FADE_MS);
  };
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const closeGates = (): void => {
    gate = null;
    onPlay = null;
    pendingArm = null;
    clearTimeout(noticeTimer);
    appBtn.disabled = false;
    play.classList.remove('on', 'noticing');
    desk.classList.remove('on');
  };
  // v0.51.0 (owner): the click starts the record — and the room says plainly why nothing is heard: the
  // replay cannot carry the real track. The note stays up long enough to read, then the room lights.
  appBtn.addEventListener('click', () => {
    if (gate !== 'play') return;
    const start = onPlay;
    onPlay = null;
    start?.();
    playLabel.textContent = t('demo.noAudio');
    playHint.textContent = '';
    appBtn.disabled = true;
    play.classList.add('noticing');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      play.classList.remove('on', 'noticing');
      appBtn.disabled = false;
      release();
    }, NO_AUDIO_NOTICE_MS);
  });

  const FOLDER =
    '<svg viewBox="0 0 64 52" aria-hidden="true"><path fill="#7fb3e6" d="M4 8a4 4 0 0 1 4-4h16l6 6h26a4 4 0 0 1 4 4v4H4z"/>' +
    '<rect x="4" y="14" width="56" height="34" rx="4" fill="#9cc7f0"/><rect x="4" y="14" width="56" height="6" fill="#b5d6f5"/></svg>';
  const PDF =
    '<svg viewBox="0 0 40 50" aria-hidden="true"><path fill="#fff" stroke="#c9d3df" d="M2 2h26l10 10v36H2z"/><path fill="#e8edf3" d="M28 2v10h10"/>' +
    '<rect x="6" y="30" width="28" height="12" rx="2" fill="#d9534f"/><text x="20" y="39.5" font-size="9" font-weight="700" fill="#fff" ' +
    'text-anchor="middle" font-family="system-ui, sans-serif">PDF</text></svg>';

  // Three states on one surface: the desktop (a folder waiting), the folder open (a file waiting),
  // the file open (its first page). Only drawn things — no vendor icon, no copied body text: the page
  // shows what a title page carries and a line of the abstract, and links out to the real paper.
  const showDesktop = (cue: OpenFileCue): void => {
    desk.replaceChildren();
    const hint = doc.createElement('div');
    hint.className = 'demo-desk-hint';
    hint.textContent = cue.label;
    const icon = doc.createElement('button');
    icon.type = 'button';
    icon.className = 'demo-desk-icon demo-desk-pulse';
    icon.innerHTML = FOLDER;
    const name = doc.createElement('span');
    name.textContent = cue.folder;
    icon.appendChild(name);
    icon.addEventListener('click', () => showFolder(cue));
    desk.append(hint, icon);
  };

  const windowFrame = (title: string): { win: HTMLElement; body: HTMLElement } => {
    const win = doc.createElement('div');
    win.className = 'demo-desk-window';
    const bar = doc.createElement('div');
    bar.className = 'demo-desk-bar';
    bar.innerHTML = '<i></i><i></i><i></i>';
    const name = doc.createElement('span');
    name.textContent = title;
    bar.appendChild(name);
    const body = doc.createElement('div');
    body.className = 'demo-desk-body';
    win.append(bar, body);
    return { win, body };
  };

  const showFolder = (cue: OpenFileCue): void => {
    desk.replaceChildren();
    const { win, body } = windowFrame(cue.folder);
    const item = doc.createElement('button');
    item.type = 'button';
    item.className = 'demo-desk-file demo-desk-pulse';
    item.innerHTML = PDF;
    const name = doc.createElement('span');
    name.textContent = cue.file;
    item.appendChild(name);
    item.addEventListener('click', () => showPage(cue));
    const hint = doc.createElement('p');
    hint.className = 'demo-desk-sub';
    hint.textContent = t('demo.openFileHint');
    body.append(item, hint);
    desk.appendChild(win);
  };

  const showPage = (cue: OpenFileCue): void => {
    desk.replaceChildren();
    const { win, body } = windowFrame(cue.file);
    win.classList.add('reader');
    const page = doc.createElement('article');
    page.className = 'demo-desk-page';
    const el = (tag: string, cls: string, text: string): HTMLElement => {
      const n = doc.createElement(tag);
      n.className = cls;
      n.textContent = text;
      return n;
    };
    page.append(
      el('h1', 'doc-title', cue.doc.title),
      el('p', 'doc-authors', cue.doc.authors.join(' · ')),
      el('p', 'doc-aff', cue.doc.affiliations),
      el('h2', 'doc-abs', 'Abstract'),
      el('p', 'doc-lead', cue.doc.lead),
      el('p', 'doc-venue', cue.doc.venue),
      el('p', 'doc-id', cue.doc.id),
    );
    const actions = doc.createElement('div');
    actions.className = 'demo-desk-actions';
    const out = doc.createElement('a');
    out.href = cue.doc.url;
    out.target = '_blank';
    out.rel = 'noopener noreferrer';
    out.textContent = t('demo.readOriginal');
    const back = doc.createElement('button');
    back.type = 'button';
    back.className = 'demo-desk-back';
    back.textContent = t('demo.backToLuna');
    back.addEventListener('click', () => {
      if (gate !== 'file') return;
      desk.classList.remove('on');
      release();
    });
    actions.append(out, back);
    body.append(page, actions);
    desk.appendChild(win);
  };

  return {
    arm(text) {
      // Behind a visitor action the line waits — it is typed after it, not under the curtain.
      if (gate) {
        disarm();
        pendingArm = text;
        return;
      }
      typeIn(text);
    },

    disarm,

    sceneStart(index, title) {
      disarm(); // a jump mid-typing must not leave a half line armed later
      closeGates();
      refs.input.value = '';
      label.textContent = t('demo.scene', { n: index + 1, total: opts.sceneTitles.length, title });
      items.forEach((b, i) => b.classList.toggle('current', i === index));
      list.hidden = true;
      next.hidden = true;
      nextHandler = null;
      codeBtn.hidden = true;
      codeIndex = -1;
      pill.classList.add('on');
    },

    sceneEnd(index, hasNext) {
      next.textContent = t(hasNext ? 'demo.next' : 'demo.replay');
      nextHandler = hasNext ? opts.onNext : () => doc.location.reload();
      next.hidden = false;
      codeIndex = index;
      codeBtn.hidden = !(opts.hasNotes?.(index) ?? false);
    },

    // The curtain: dark room, a clock sweeping, a line saying how long. The tape's clock has
    // already moved past it — nothing fires underneath.
    skip(text, ms) {
      clearTimeout(curtainTimer);
      if (curtainLabel) curtainLabel.textContent = text;
      curtain.style.setProperty('--sweep', `${Math.max(600, ms - CURTAIN_FADE_MS * 2)}ms`);
      curtain.classList.remove('on');
      void curtain.offsetWidth; // restart the hand sweep from zero
      curtain.classList.add('on');
      curtainTimer = setTimeout(() => curtain.classList.remove('on'), Math.max(0, ms - CURTAIN_FADE_MS));
    },

    pressPlay(text, start) {
      appName.textContent = t('demo.playApp');
      playLabel.textContent = text;
      playHint.textContent = t('demo.playHint');
      gate = 'play';
      onPlay = start;
      play.classList.add('on');
    },

    openFile(cue) {
      gate = 'file';
      showDesktop(cue);
      desk.classList.add('on');
    },

    inner(text) {
      const card = doc.createElement('div');
      card.className = 'demo-inner';
      const tag = doc.createElement('span');
      tag.className = 'demo-inner-tag';
      tag.textContent = t('demo.innerVoice');
      const body = doc.createElement('p');
      body.textContent = text;
      card.append(tag, body);
      refs.chatLog.appendChild(card);
      refs.chatLog.scrollTop = refs.chatLog.scrollHeight;
    },

    dispose() {
      disarm();
      closeGates();
      play.remove();
      desk.remove();
      clearTimeout(curtainTimer);
      refs.input.removeEventListener('keydown', guard, true);
      next.removeEventListener('click', onNextClick);
      pill.remove();
      codeBtn.remove();
      curtain.remove();
      refs.input.readOnly = false;
      refs.sendBtn.disabled = false;
    },
  };
}

// v0.46.2: the way out of the replay — a muted corner link to the engineering map, shown only while
// the lobby is up (the session is hers; the links belong to the front door). Mounted at boot, before
// any Talk, which is why they are not part of the director the session creates.
// v0.48.1: a second link beside it switches the replay to the other language.
export function mountLobbyLinks(
  doc: Document,
  root: HTMLElement,
  links: ReadonlyArray<{ href: string; label: string }>,
): () => void {
  const style = doc.createElement('style');
  style.textContent = `
.demo-lobby-links { display: none; position: fixed; right: 26px; bottom: 26px; z-index: 6; gap: 16px; }
.demo-lobby-links a { font-size: 12px; letter-spacing: 0.04em; color: var(--muted); text-decoration: none; }
.demo-lobby-links a:hover { color: var(--sky-text); text-decoration: underline; }
.menu-mode .demo-lobby-links { display: inline-flex; }
`;
  doc.head.appendChild(style);
  const box = doc.createElement('nav');
  box.className = 'demo-lobby-links';
  for (const l of links) {
    const a = doc.createElement('a');
    a.href = l.href;
    a.textContent = l.label;
    box.appendChild(a);
  }
  root.appendChild(box);
  return () => {
    box.remove();
    style.remove();
  };
}

// v0.47.0: the entrance guide — what this page is, the promise, and how to drive it. Its Enter is
// the visitor's first gesture (which is also what lets the page make a sound later).
// v0.48.1: it opens on a language choice — a Chinese speaker and an English speaker are sent to two
// versions of the replay (her words, her voice, the interface), so the guide itself speaks one
// language, not both side by side. The "how" line names the buttons the visitor will actually see.
export const PICKER_COPY = {
  title: 'Luna',
  prompt: '选择语言 · Choose your language',
  zh: { label: '中文', sub: '我说中文', badge: null },
  // The owner's pick: English is the original — her own language, her voice as recorded.
  en: { label: 'English', sub: 'I speak English', badge: 'Recommended' },
} as const;

export const GUIDE_COPY: Record<
  UiLang,
  { title: string; sub: string; p1: string; p2: string; how: string; enter: string; loading: string }
> = {
  en: {
    title: 'Luna · a replay',
    sub: 'real scenes · real front end · her real voice',
    p1:
      'What you are about to watch is a replay: daily-use scenes reproduced from real ones, played back ' +
      'through Luna’s real front end and rendering engine. There is no AI running behind this page.',
    p2:
      'Nothing here is invented. Every bubble, tool card, unprompted message, quiet note and dream is a ' +
      'shipped product capability, driven by the same code the app runs — with her own voice, pre-rendered.',
    how:
      'Lines are typed for you — press ➤ (or Enter). When a scene ends, press Next scene (or pick a scene ' +
      'from the pill at the top). Scroll to zoom, drag to move her, double-click to reset. ← Menu opens her ' +
      'Diary, Skills and Dream. After each scene, a button pops up beside the scene name and opens the engineering notes: ' +
      'why she did that, and the code behind it.',
    enter: 'Enter',
    loading: 'Getting her ready… {pct}%',
  },
  zh: {
    title: 'Luna · 回放',
    sub: '真实场景 · 真实前端 · 她自己的声音',
    p1: '接下来你看到的是一段回放：照着真实使用场景复现的日常片段，用 Luna 真正的前端和渲染引擎播出来。这个页面背后没有在运行的 AI。',
    p2: '这里没有一样是编的。每个气泡、每张工具卡、她主动开口、悄悄做的小事，还有梦，都是产品真实具备的能力，由 app 里同一份代码驱动；声音是她自己的，提前渲染好的。',
    how: '台词会替你打好，按 ➤（或回车）发送。一幕演完点「下一幕」，也可以点顶上的幕名直接选。滚轮缩放，拖动挪位置，双击复位。「← 菜单」里有她的日记、技能和梦。每一幕演完，顶上幕名旁边会冒出一个按钮，点它就能翻开工程笔记：她为什么这么做，背后是哪段代码。',
    enter: '进入',
    loading: '正在把她接过来… {pct}%',
  },
};

// v0.51.0: `progress(pct)` holds Enter until her files are here (null = ready) — the first visit
// downloads ~10 MB, and entering an empty stage is worse than a counter.
export type GuideHandle = { language: Promise<UiLang>; progress(pct: number | null): void; dispose(): void };

// `lang` null → the card opens on the language choice; a language (a shared `?lang=` link, Replay ↻)
// → straight to the guide in it. `language` resolves the moment one is known.
export function mountGuide(doc: Document, opts: { lang: UiLang | null; onEnter?: () => void }): GuideHandle {
  ensureStyle(doc);
  const guide = doc.createElement('div');
  guide.className = 'demo-guide';
  guide.setAttribute('role', 'dialog');
  const card = doc.createElement('div');
  card.className = 'demo-guide-card';
  guide.appendChild(card);
  doc.body.appendChild(guide);

  const p = (text: string, cls?: string): HTMLParagraphElement => {
    const el = doc.createElement('p');
    if (cls) el.className = cls;
    el.textContent = text;
    return el;
  };

  let pct: number | null = 0;
  let enterBtn: HTMLButtonElement | null = null;
  let enterLang: UiLang = 'en';
  const paintEnter = (): void => {
    if (!enterBtn) return;
    const c = GUIDE_COPY[enterLang];
    enterBtn.disabled = pct !== null;
    enterBtn.classList.toggle('loading', pct !== null);
    enterBtn.style.setProperty('--p', `${pct ?? 100}%`);
    enterBtn.textContent = pct === null ? c.enter : c.loading.replace('{pct}', String(Math.floor(pct)));
  };

  const showGuide = (lang: UiLang): void => {
    const c = GUIDE_COPY[lang];
    guide.setAttribute('aria-label', c.title);
    card.replaceChildren();
    const h = doc.createElement('h2');
    h.textContent = c.title;
    const how = doc.createElement('div');
    how.className = 'demo-guide-how';
    how.textContent = c.how;
    const enter = doc.createElement('button');
    enter.type = 'button';
    enter.className = 'demo-guide-enter';
    enter.textContent = c.enter;
    enterBtn = enter;
    enterLang = lang;
    paintEnter();
    enter.addEventListener('click', () => {
      if (pct !== null) return;
      guide.classList.add('leaving');
      setTimeout(() => guide.remove(), 600);
      opts.onEnter?.();
    });
    card.append(h, p(c.sub, 'demo-guide-sub'), p(c.p1), p(c.p2), how, enter);
  };

  let resolve: (lang: UiLang) => void = () => {};
  const language = new Promise<UiLang>((r) => {
    resolve = r;
  });

  if (opts.lang) {
    showGuide(opts.lang);
    resolve(opts.lang);
  } else {
    guide.setAttribute('aria-label', PICKER_COPY.prompt);
    const h = doc.createElement('h2');
    h.textContent = PICKER_COPY.title;
    const row = doc.createElement('div');
    row.className = 'demo-guide-langs';
    for (const lang of ['zh', 'en'] as const) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'demo-guide-lang';
      b.dataset['lang'] = lang;
      const strong = doc.createElement('strong');
      strong.textContent = PICKER_COPY[lang].label;
      const sub = doc.createElement('span');
      sub.textContent = PICKER_COPY[lang].sub;
      b.append(strong, sub);
      const badge = PICKER_COPY[lang].badge;
      if (badge) {
        const tag = doc.createElement('em');
        tag.className = 'demo-guide-badge';
        tag.textContent = badge;
        b.classList.add('recommended');
        b.appendChild(tag);
      }
      b.addEventListener('click', () => {
        showGuide(lang);
        resolve(lang);
      });
      row.appendChild(b);
    }
    card.append(h, p(PICKER_COPY.prompt, 'demo-guide-sub'), row);
  }
  return {
    language,
    progress(p) {
      pct = p === null ? null : Math.max(0, Math.min(99, p));
      paintEnter();
    },
    dispose: () => guide.remove(),
  };
}

// v0.50.1 (owner) — phones are not adapted: the replay is a desk-sized show (the chat beside her, the
// notes after each scene), so a phone gets one card asking to open it on a computer — both languages,
// since it comes before the language question — and nothing else loads behind it. v0.51.5 (owner): one
// line of copy and a drawn phone ✗ / PC ✓; the link is printed only if copying it fails (in-app browsers).
export const DESKTOP_ONLY_COPY = {
  title: { zh: '这是一个 PC 端项目，请在电脑上打开', en: 'A desktop project — please open it on a computer' },
  copy: { zh: '复制链接', en: 'Copy the link' },
  copied: { zh: '已复制 ✓', en: 'Copied ✓' },
} as const;

const DEVICES_SVG =
  '<svg class="demo-devices" viewBox="0 0 260 120" aria-hidden="true">' +
  '<g class="phone"><rect class="dev screen" x="18" y="16" width="52" height="90" rx="9"/>' +
  '<path class="dev" d="M38 26 H50"/><circle cx="44" cy="96" r="3" fill="#e8edf5"/>' +
  '<path class="no" d="M32 49 L56 73"/><path class="no b" d="M56 49 L32 73"/></g>' +
  '<path class="flow" d="M88 61 H138"/><path class="head" d="M132 54 L140 61 L132 68"/>' +
  '<circle class="glow" cx="199" cy="50" r="46"/>' +
  '<g class="pc"><rect class="dev screen" x="156" y="18" width="86" height="60" rx="6"/>' +
  '<path class="dev" d="M199 78 V94 M182 96 H216"/>' +
  '<path class="yes" d="M181 48 L194 61 L218 35"/></g></svg>';

export function mountDesktopOnly(doc: Document, win: Window): void {
  ensureStyle(doc);
  const card = doc.createElement('div');
  card.className = 'demo-desktop-only';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', `${DESKTOP_ONLY_COPY.title.zh} · ${DESKTOP_ONLY_COPY.title.en}`);
  const both = (key: 'title' | 'copy' | 'copied', tag: 'h2' | 'p' | 'button'): HTMLElement => {
    const el = doc.createElement(tag);
    const en = doc.createElement('span');
    en.className = 'en';
    en.textContent = DESKTOP_ONLY_COPY[key].en;
    el.append(DESKTOP_ONLY_COPY[key].zh, en);
    return el;
  };
  const art = doc.createElement('div');
  art.innerHTML = DEVICES_SVG;
  const link = `${win.location.origin}${win.location.pathname}`;
  const url = doc.createElement('p');
  url.className = 'url';
  url.textContent = link;
  url.hidden = true;
  const copy = both('copy', 'button');
  if (copy instanceof HTMLButtonElement) copy.type = 'button';
  const showLink = (): void => {
    url.hidden = false;
  };
  copy.addEventListener('click', () => {
    const clip = win.navigator.clipboard;
    if (!clip) return showLink();
    void clip
      .writeText(link)
      .then(() => copy.replaceChildren(...both('copied', 'p').childNodes))
      .catch(showLink); // no clipboard here (an in-app browser): print the address to copy by hand
  });
  const inner = doc.createElement('div');
  inner.className = 'inner';
  inner.append(art, both('title', 'h2'), copy, url);
  card.append(inner);
  doc.body.appendChild(card);
}
