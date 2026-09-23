// v0.50.0 — the notes stack: a pile of notebook sheets paper-clipped to the side of the app. Opening it
// freezes the page behind (inert, desaturated, its animations paused); clicking the top sheet slides it
// out and tucks it under the pile, so the next one is on top — and the one after that is always visible
// peeking out beneath. Demo-only DOM, like the rest of the director's devices: nothing inside her.
import { t, type UiLang } from '../ui/uiCopy';
import { escapeHtml, inlineHtml, say, snippetLines, sourceUrl, type DemoNotes, type NoteBlock, type SceneNotes } from './notes';

const STYLE = `
.demo-notes-scrim {
  position: fixed; inset: 0; z-index: 950; background: rgba(20, 26, 38, 0.22);
  opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
}
.demo-notes-scrim.on { opacity: 1; pointer-events: auto; }
html.demo-frozen .luna-app { filter: grayscale(0.55) brightness(0.97) blur(1.2px); transition: filter 0.4s ease; }
html.demo-frozen .luna-app * { animation-play-state: paused !important; }

.demo-notes {
  --n-paper: #fbfaf6; --n-grid: rgba(120, 152, 186, 0.2); --n-grid-strong: rgba(120, 152, 186, 0.34);
  --n-rule: #d98a82; --n-ink: #22314a; --n-ink-2: #3c4e6b; --n-pencil: #6b7c94; --n-pencil-2: #93a2b6;
  --n-red: #b2352c; --n-shadow: rgba(34, 49, 74, 0.2);
  --n-hand: 'Caveat', 'Ma Shan Zheng', 'Kaiti SC', 'STKaiti', cursive;
  --n-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  position: fixed; top: 26px; right: 30px; bottom: 26px; z-index: 960; width: min(700px, 56vw);
  color: var(--n-ink); font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  opacity: 0; transform: translateX(28px) rotate(1.2deg); pointer-events: none;
  transition: opacity 0.32s ease, transform 0.42s cubic-bezier(0.22, 0.9, 0.3, 1);
}
.demo-notes.on { opacity: 1; transform: none; pointer-events: auto; }
/* The page behind is frozen: on a narrow window the notes may take nearly all of it. */
@media (max-width: 1100px) { .demo-notes { width: min(640px, calc(100vw - 60px)); right: 20px; } }
.demo-notes-pile { position: absolute; inset: 0; }
.demo-sheet {
  position: absolute; inset: 0; overflow: hidden auto; padding: 30px 32px 58px 76px;
  background-color: var(--n-paper);
  background-image: linear-gradient(var(--n-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--n-grid) 1px, transparent 1px),
    linear-gradient(90deg, transparent 57px, var(--n-rule) 57px, var(--n-rule) 58px, transparent 58px);
  background-size: 26px 26px, 26px 26px, 100% 100%;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 14px 40px var(--n-shadow);
  border-radius: 2px; cursor: pointer; user-select: text;
  transition: transform 0.34s cubic-bezier(0.3, 0.8, 0.3, 1), opacity 0.34s ease, box-shadow 0.34s ease;
}
.demo-sheet.lift { transition-duration: 0.26s; }
.demo-sheet[data-depth='hidden'] { opacity: 0; pointer-events: none; }
.demo-sheet:not([data-depth='0']) { cursor: default; }
.demo-sheet:not([data-depth='0']):not(.lift) > * { visibility: hidden; }
.demo-notes-clip {
  position: absolute; top: -22px; left: 26px; z-index: 50; width: 34px; height: 92px; pointer-events: none;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.18));
}
.demo-notes-close {
  position: absolute; top: 12px; right: 14px; z-index: 60; border: 0; background: none; cursor: pointer;
  font-family: var(--n-hand); font-size: 26px; line-height: 1; color: var(--n-pencil);
}
.demo-notes-close:hover { color: var(--n-red); }
.demo-notes-foot {
  position: absolute; left: 76px; right: 26px; bottom: 16px; z-index: 60; display: flex; align-items: center; gap: 12px;
  font-family: var(--n-hand); color: var(--n-pencil); pointer-events: none;
}
.demo-notes-foot button {
  pointer-events: auto; border: 0; background: none; cursor: pointer; font-family: var(--n-hand); font-size: 24px;
  color: var(--n-ink-2); padding: 0 4px; line-height: 1;
}
.demo-notes-foot button:hover { color: var(--n-red); }
.demo-notes-foot .count { font-size: 20px; white-space: nowrap; }
.demo-notes-foot .hint { margin-left: auto; font-size: 17px; color: var(--n-pencil-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

.demo-sheet .eyebrow { margin: 0 0 4px; font-family: var(--n-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--n-red); }
.demo-sheet .hook { margin: 0 0 12px; font-family: var(--n-hand); font-size: 32px; line-height: 1.1; color: var(--n-ink); }
.demo-sheet h3 { margin: 0 0 10px; font-family: var(--n-hand); font-size: 28px; line-height: 1.1; font-weight: 600; color: var(--n-ink); }
.demo-sheet h3 small { font-size: 0.62em; font-weight: 500; color: var(--n-pencil); }
.demo-sheet h3 i { font-style: normal; font-family: var(--n-mono); font-size: 10px; color: var(--n-red); letter-spacing: 0.14em; margin-right: 10px; vertical-align: middle; }
.demo-sheet p { margin: 0 0 11px; font-size: 14.5px; line-height: 1.72; color: var(--n-ink-2); }
.demo-sheet code { font-family: var(--n-mono); font-size: 0.86em; background: rgba(120, 152, 186, 0.14); padding: 1px 4px; border-radius: 3px; }
.demo-sheet b { color: var(--n-ink); }
.demo-sheet .quote {
  margin: 0 0 14px; padding: 2px 0 2px 12px; border-left: 3px solid var(--n-pencil-2);
  font-family: var(--n-hand); font-size: 22px; line-height: 1.3; color: var(--n-ink-2);
}
.demo-sheet .aside {
  margin: 6px 0 14px; font-family: var(--n-hand); font-size: 21px; line-height: 1.3; color: var(--n-red);
  transform: rotate(-0.6deg); transform-origin: left;
}
.demo-sheet .aside::before { content: '✎ '; }
.demo-sheet ol.steps { margin: 0 0 14px; padding: 0; list-style: none; counter-reset: s; }
.demo-sheet ol.steps li {
  position: relative; padding-left: 30px; margin: 0 0 6px; font-size: 14px; line-height: 1.6; color: var(--n-ink-2); counter-increment: s;
}
.demo-sheet ol.steps li::before {
  content: counter(s); position: absolute; left: 0; top: -3px; font-family: var(--n-hand); font-size: 24px; color: var(--n-red);
}
.demo-sheet .flow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 4px; margin: 4px 0 16px; }
.demo-sheet .flow span {
  font-family: var(--n-hand); font-size: 19px; line-height: 1.1; padding: 5px 10px; color: var(--n-ink);
  border: 1.6px solid var(--n-ink-2); border-radius: 4px 7px 5px 6px; background: rgba(255, 255, 255, 0.55);
}
.demo-sheet .flow span:nth-child(4n + 1) { transform: rotate(-0.8deg); }
.demo-sheet .flow span:nth-child(4n + 3) { transform: rotate(0.7deg); }
.demo-sheet .flow em { font-style: normal; font-family: var(--n-hand); font-size: 22px; color: var(--n-pencil); }
.demo-sheet .code-loc { display: flex; gap: 10px; align-items: baseline; margin: 0 0 5px; font-family: var(--n-mono); font-size: 10px; color: var(--n-red); }
.demo-sheet .code-loc span { min-width: 0; overflow-wrap: anywhere; }
.demo-sheet .code-loc a { flex: none; }
.demo-sheet .code-loc a { margin-left: auto; color: var(--n-pencil); text-decoration: none; border-bottom: 1px dashed var(--n-pencil-2); }
.demo-sheet .code-loc a:hover { color: var(--n-red); }
.demo-sheet pre {
  margin: 0 0 6px; padding: 9px 12px; overflow-x: auto; font-family: var(--n-mono); font-size: 11px; line-height: 1.58;
  color: var(--n-ink-2); background: var(--n-paper); border: 1px solid var(--n-grid-strong); border-left: 3px solid var(--n-rule);
  cursor: text; white-space: pre-wrap; overflow-wrap: anywhere;
}
.demo-sheet .code-note { margin: 0 0 12px; font-size: 13px; line-height: 1.55; color: var(--n-pencil); }

.demo-code-btn {
  position: absolute; left: 50%; bottom: 34px; z-index: 6; transform: translateX(-50%) rotate(-1.5deg);
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 20px 12px 16px; border: 0; cursor: pointer; text-align: left;
  font-family: 'Caveat', 'Ma Shan Zheng', 'Kaiti SC', cursive; font-size: 24px; line-height: 1.15; color: #22314a;
  background-color: #fbfaf6;
  background-image: linear-gradient(rgba(120, 152, 186, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(120, 152, 186, 0.2) 1px, transparent 1px);
  background-size: 18px 18px;
  box-shadow: 0 10px 26px rgba(34, 49, 74, 0.28), 0 0 0 2px #b2352c;
  animation: demo-code-wiggle 2.8s ease-in-out infinite;
}
.demo-code-btn[hidden] { display: none; }
.demo-code-btn svg { flex: none; width: 22px; height: 44px; margin-top: -18px; }
.demo-code-btn span { white-space: nowrap; }
@media (max-width: 1100px) { .demo-code-btn { max-width: min(420px, 90%); } .demo-code-btn span { white-space: normal; } }
.demo-code-btn:hover { box-shadow: 0 14px 30px rgba(34, 49, 74, 0.34), 0 0 0 3px #b2352c; }
.menu-mode .demo-code-btn { display: none; }
@keyframes demo-code-wiggle {
  0%, 70%, 100% { transform: translateX(-50%) rotate(-1.5deg); }
  76% { transform: translateX(-50%) rotate(1.8deg) scale(1.04); }
  82% { transform: translateX(-50%) rotate(-2.4deg) scale(1.04); }
  88% { transform: translateX(-50%) rotate(-1.5deg); }
}
@media (prefers-reduced-motion: reduce) { .demo-code-btn { animation: none; } .demo-sheet, .demo-sheet.lift, .demo-notes { transition-duration: 0.01s; } }
`;

export const CLIP_SVG =
  '<svg viewBox="0 0 34 92" aria-hidden="true"><path d="M11 60 V14 a6 6 0 0 1 12 0 V70 a10 10 0 0 1 -20 0 V22" ' +
  'fill="none" stroke="#8d96a3" stroke-width="3.2" stroke-linecap="round"/><path d="M11 60 V14 a6 6 0 0 1 12 0 V70 ' +
  'a10 10 0 0 1 -20 0 V22" fill="none" stroke="#dfe4ea" stroke-width="1.1" stroke-linecap="round" transform="translate(-0.8 -0.6)"/></svg>';

let styleMounted = false;
function ensureStyle(doc: Document): void {
  if (styleMounted) return;
  const style = doc.createElement('style');
  style.dataset['demo'] = 'notes';
  style.textContent = STYLE;
  doc.head.appendChild(style);
  styleMounted = true;
}

// Where each sheet sits by its place in the pile: the top one square, the next two peeking out a
// little rotated, the rest hidden behind them.
const DEPTH_POSE = [
  'translate(0, 0) rotate(0deg)',
  'translate(7px, 6px) rotate(1.1deg)',
  'translate(-5px, 11px) rotate(-1.4deg)',
];
const LIFTED = 'translate(-58%, -14px) rotate(-7deg)';

// The model's motion runs on PIXI's shared ticker (cubismRuntime registers it for pixi-live2d-display);
// stopping it holds her in the pose she had, so "frozen" means frozen, not just blurred. Read through
// `window.PIXI` so the notes do not pull the renderer into their own import graph.
type Pausable = { started: boolean; start(): void; stop(): void };
function isPausable(v: unknown): v is Pausable {
  return typeof v === 'object' && v !== null && typeof Reflect.get(v, 'start') === 'function' && typeof Reflect.get(v, 'stop') === 'function';
}
function sharedTicker(): Pausable | null {
  const pixi: unknown = Reflect.get(globalThis, 'PIXI');
  if ((typeof pixi !== 'object' && typeof pixi !== 'function') || pixi === null) return null;
  const ticker: unknown = Reflect.get(pixi, 'Ticker');
  if ((typeof ticker !== 'object' && typeof ticker !== 'function') || ticker === null) return null;
  const shared: unknown = Reflect.get(ticker, 'shared');
  return isPausable(shared) ? shared : null;
}

export type NotesStack = { open(sceneId: string, eyebrow: string): boolean; close(): void; isOpen(): boolean; dispose(): void };

export function mountNotesStack(
  doc: Document,
  opts: { notes: DemoNotes; lang: UiLang; onFreeze?: (frozen: boolean) => void },
): NotesStack {
  ensureStyle(doc);
  const { notes, lang } = opts;
  const scrim = doc.createElement('div');
  scrim.className = 'demo-notes-scrim';
  const root = doc.createElement('aside');
  root.className = 'demo-notes';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const pile = doc.createElement('div');
  pile.className = 'demo-notes-pile';
  const clip = doc.createElement('div');
  clip.className = 'demo-notes-clip';
  clip.innerHTML = CLIP_SVG;
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'demo-notes-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', t('demo.notesClose'));
  const foot = doc.createElement('div');
  foot.className = 'demo-notes-foot';
  const prev = doc.createElement('button');
  prev.type = 'button';
  prev.textContent = '←';
  prev.setAttribute('aria-label', t('demo.notesPrev'));
  const count = doc.createElement('span');
  count.className = 'count';
  const next = doc.createElement('button');
  next.type = 'button';
  next.textContent = '→';
  next.setAttribute('aria-label', t('demo.notesNext'));
  const hint = doc.createElement('span');
  hint.className = 'hint';
  hint.textContent = t('demo.notesHint');
  foot.append(prev, count, next, hint);
  root.append(pile, clip, close, foot);
  doc.body.append(scrim, root);

  let sheets: HTMLElement[] = [];
  let order: number[] = []; // order[0] is the sheet on top
  let busy = false;
  let open = false;
  let shown: { scene: SceneNotes; eyebrow: string } | null = null;
  let resizeTimer = 0;
  let flipTimer = 0;
  const animTimers: number[] = [];
  const later = (fn: () => void, ms: number): void => {
    animTimers.push(window.setTimeout(fn, ms));
  };
  const cancelAnimations = (): void => {
    for (const id of animTimers.splice(0)) clearTimeout(id);
    busy = false;
  };
  let lastFocus: HTMLElement | null = null;

  // A lifted sheet keeps its own pose and stays above the pile until it is tucked back in.
  const layout = (): void => {
    order.forEach((idx, depth) => {
      const el = sheets[idx];
      if (!el || el.classList.contains('lift')) return;
      el.style.zIndex = String(40 - depth);
      el.dataset['depth'] = depth < DEPTH_POSE.length ? String(depth) : 'hidden';
      el.style.transform = DEPTH_POSE[Math.min(depth, DEPTH_POSE.length - 1)] ?? '';
    });
    count.textContent = `${(order[0] ?? 0) + 1} / ${sheets.length}`;
  };

  // Top sheet out and under: it lifts clear of the pile (the next one is already readable beneath it),
  // then takes the bottom place and glides back in behind the others.
  const forward = (): void => {
    if (busy || sheets.length < 2) return;
    const top = order[0];
    if (top === undefined) return;
    const el = sheets[top];
    if (!el) return;
    busy = true;
    el.classList.add('lift');
    el.style.zIndex = '45';
    el.style.transform = LIFTED;
    order = [...order.slice(1), top];
    layout();
    later(() => {
      el.classList.remove('lift');
      layout();
      later(() => {
        busy = false;
      }, 200);
    }, 260);
  };
  // The bottom sheet back on top: it appears lifted above the pile and settles into place.
  const backward = (): void => {
    if (busy || sheets.length < 2) return;
    const last = order[order.length - 1];
    if (last === undefined) return;
    const el = sheets[last];
    if (!el) return;
    busy = true;
    order = [last, ...order.slice(0, -1)];
    el.classList.add('lift');
    el.style.zIndex = '45';
    el.style.transition = 'none';
    el.style.transform = LIFTED;
    layout();
    void el.offsetWidth;
    el.style.transition = '';
    el.classList.remove('lift');
    layout(); // it is order[0] now: top pose, depth 0, readable and clickable
    later(() => {
      busy = false;
    }, 360);
  };

  const block = (b: NoteBlock): string => {
    switch (b.type) {
      case 'p':
        return `<p>${inlineHtml(say(b.text, lang))}</p>`;
      case 'quote':
        return `<p class="quote">${inlineHtml(say(b.text, lang))}</p>`;
      case 'aside':
        return `<p class="aside">${inlineHtml(say(b.text, lang))}</p>`;
      case 'steps':
        return `<ol class="steps">${b.items.map((i) => `<li>${inlineHtml(say(i, lang))}</li>`).join('')}</ol>`;
      case 'flow':
        return `<div class="flow">${b.items.map((i) => `<span>${inlineHtml(say(i, lang))}</span>`).join('<em>→</em>')}</div>`;
      case 'code': {
        const to = b.from + snippetLines(b.snippet) - 1;
        const url = sourceUrl(notes, b.file, b.from, b.snippet);
        const loc = escapeHtml(`${b.file}:${b.from}–${to}`);
        const note = b.note ? `<p class="code-note">${inlineHtml(say(b.note, lang))}</p>` : '';
        return (
          `<p class="code-loc"><span>${loc}</span><a href="${url}" target="_blank" rel="noopener">GitHub ↗</a></p>` +
          `<pre>${escapeHtml(b.snippet.replace(/\n+$/, ''))}</pre>` +
          note
        );
      }
    }
  };

  const newPage = (): HTMLElement => {
    const el = doc.createElement('section');
    el.className = 'demo-sheet';
    el.dataset['depth'] = '0';
    // A single click turns the page; a double click selects a word instead, so the turn waits a beat
    // and a second click cancels it.
    el.addEventListener('click', (e) => {
      if (el.dataset['depth'] !== '0') return;
      const target = e.target;
      if (target instanceof Element && target.closest('a, pre, code, button')) return;
      clearTimeout(flipTimer);
      if (e.detail > 1) return;
      flipTimer = window.setTimeout(() => {
        if ((doc.getSelection()?.toString() ?? '') === '') forward();
      }, 220);
    });
    pile.appendChild(el);
    return el;
  };
  const overflows = (el: HTMLElement): boolean => el.scrollHeight > el.clientHeight + 1;

  // One sheet of notes is one sheet of paper when it fits. When it doesn't — a small window, a phone —
  // it is paginated at block boundaries into continuation sheets, measured on the real page, so a
  // sheet never needs scrolling unless a single block is taller than the paper.
  // `keep` is the reading position to restore (sheet index, first block on the page) after a rebuild.
  const build = (scene: SceneNotes, eyebrow: string, keep?: [number, number]): void => {
    cancelAnimations();
    clearTimeout(flipTimer);
    pile.replaceChildren();
    sheets = [];
    scene.sheets.forEach((sheet, i) => {
      const n = String(i + 1).padStart(2, '0');
      const title = inlineHtml(say(sheet.title, lang));
      const head = (cont: boolean): string =>
        `<header>${
          i === 0 && !cont
            ? `<p class="eyebrow">${inlineHtml(eyebrow)}</p><p class="hook">${inlineHtml(say(scene.hook, lang))}</p>`
            : ''
        }<h3><i>${n}</i>${title}${cont ? ` <small>${escapeHtml(t('demo.notesCont'))}</small>` : ''}</h3></header>`;
      let page = newPage();
      page.innerHTML = head(false);
      page.dataset['src'] = `${i}:0`;
      sheets.push(page);
      sheet.blocks.forEach((b, k) => {
        page.insertAdjacentHTML('beforeend', `<div class="nb">${block(b)}</div>`);
        if (overflows(page) && page.children.length > 2) {
          page.lastElementChild?.remove();
          page = newPage();
          page.innerHTML = head(true);
          page.dataset['src'] = `${i}:${k}`;
          page.insertAdjacentHTML('beforeend', `<div class="nb">${block(b)}</div>`);
          sheets.push(page);
        }
      });
    });
    // Back to where the reader was: the last page that starts at or before their place.
    let start = 0;
    if (keep) {
      sheets.forEach((pg, idx) => {
        const [si, bi] = (pg.dataset['src'] ?? '0:0').split(':').map(Number);
        if (si !== undefined && bi !== undefined && (si < keep[0] || (si === keep[0] && bi <= keep[1]))) start = idx;
      });
    }
    order = sheets.map((_, i) => (i + start) % sheets.length);
    layout();
  };
  const place = (): [number, number] | undefined => {
    const src = sheets[order[0] ?? 0]?.dataset['src'];
    if (!src) return undefined;
    const [si, bi] = src.split(':').map(Number);
    return si !== undefined && bi !== undefined ? [si, bi] : undefined;
  };

  // Captured on the document and stopped there while the notes are open: the app has its own keys
  // underneath — Esc in chat means "back to the menu", which would end the show out from under the
  // notes.
  const onKey = (e: KeyboardEvent): void => {
    if (!open) return;
    if (e.key === 'Escape') handle.close();
    else if (e.key === 'ArrowRight' || e.key === ' ') forward();
    else if (e.key === 'ArrowLeft') backward();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  let tickerWasRunning = false;
  let madeInert: Element[] = [];
  const freeze = (on: boolean): void => {
    doc.documentElement.classList.toggle('demo-frozen', on);
    const ticker = sharedTicker();
    if (on) {
      tickerWasRunning = ticker?.started ?? false;
      ticker?.stop();
    } else if (tickerWasRunning) {
      ticker?.start();
    }
    // Inert is the whole page but the notes — the app and the director's hidden overlays alike, so Tab
    // cannot walk out of the dialog into a curtain or a drawn desk nobody can see.
    if (on) {
      madeInert = [...doc.body.children].filter((el) => el !== scrim && el !== root && !el.hasAttribute('inert'));
      for (const el of madeInert) el.setAttribute('inert', '');
    } else {
      for (const el of madeInert) el.removeAttribute('inert');
      madeInert = [];
    }
    opts.onFreeze?.(on);
  };

  // Pagination is measured, so a new window size (or the handwriting font arriving late) re-paginates.
  const repaginate = (): void => {
    if (open && shown) build(shown.scene, shown.eyebrow, place());
  };
  const onResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(repaginate, 180);
  };
  window.addEventListener('resize', onResize);

  next.addEventListener('click', forward);
  prev.addEventListener('click', backward);
  close.addEventListener('click', () => handle.close());
  scrim.addEventListener('click', () => handle.close());
  doc.addEventListener('keydown', onKey, true);

  const handle: NotesStack = {
    open(sceneId, eyebrow) {
      const scene = notes.scenes[sceneId];
      if (!scene) return false;
      lastFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
      shown = { scene, eyebrow };
      build(scene, eyebrow);
      if (doc.fonts.status !== 'loaded') void doc.fonts.ready.then(repaginate);
      root.setAttribute('aria-label', say(scene.hook, lang));
      freeze(true);
      scrim.classList.add('on');
      root.classList.add('on');
      open = true;
      close.focus();
      return true;
    },
    close() {
      if (!open) return;
      open = false;
      root.classList.remove('on');
      scrim.classList.remove('on');
      freeze(false);
      lastFocus?.focus();
    },
    isOpen: () => open,
    dispose() {
      handle.close();
      doc.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      scrim.remove();
      root.remove();
    },
  };
  return handle;
}
