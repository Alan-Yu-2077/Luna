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

export type DirectorRefs = {
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  modelStage: HTMLElement;
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
  dispose(): void;
};

export const TYPE_MS = 45;
export const TYPE_LEAD_MS = 500;
// The curtain's fades, inside the skip's own duration.
export const CURTAIN_FADE_MS = 450;

const STYLE = `
.demo-pill {
  position: absolute; left: 50%; top: 10px; transform: translateX(-50%); z-index: 5;
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

.demo-play { gap: 16px; }
body:has(.menu-mode) .demo-play { display: none; }
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
  opts: { sceneTitles: string[]; onNext: () => void; onJump: (index: number) => void },
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
  refs.modelStage.appendChild(pill);

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
    '<svg viewBox="0 0 60 60" aria-hidden="true"><path fill="#fff" d="M37 10v26.5a7.5 7.5 0 1 1-4-6.6V17.8l-12 3.4v19.3a7.5 7.5 0 1 1-4-6.6V16.9L37 10z"/></svg>';
  const appName = doc.createElement('div');
  appName.className = 'demo-play-name';
  const playLabel = doc.createElement('div');
  playLabel.className = 'demo-curtain-label';
  const playHint = doc.createElement('div');
  playHint.className = 'demo-play-hint';
  play.append(appBtn, appName, playLabel, playHint);
  doc.body.appendChild(play);
  let playGate: (() => void) | null = null;
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

  const closePlay = (): void => {
    playGate = null;
    pendingArm = null;
    play.classList.remove('on');
  };
  appBtn.addEventListener('click', () => {
    const start = playGate;
    if (!start) return;
    const text = pendingArm;
    closePlay();
    start();
    // The next line is typed once the room is lit again: he pressed play, then he says so.
    if (text !== null) setTimeout(() => typeIn(text), CURTAIN_FADE_MS);
  });

  return {
    arm(text) {
      // Behind the player prompt the line waits — it is typed after the click, not under the curtain.
      if (playGate) {
        disarm();
        pendingArm = text;
        return;
      }
      typeIn(text);
    },

    disarm,

    sceneStart(index, title) {
      disarm(); // a jump mid-typing must not leave a half line armed later
      closePlay();
      refs.input.value = '';
      label.textContent = t('demo.scene', { n: index + 1, total: opts.sceneTitles.length, title });
      items.forEach((b, i) => b.classList.toggle('current', i === index));
      list.hidden = true;
      next.hidden = true;
      nextHandler = null;
      pill.classList.add('on');
    },

    sceneEnd(_index, hasNext) {
      next.textContent = t(hasNext ? 'demo.next' : 'demo.replay');
      nextHandler = hasNext ? opts.onNext : () => doc.location.reload();
      next.hidden = false;
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

    pressPlay(text, onPlay) {
      appName.textContent = t('demo.playApp');
      playLabel.textContent = text;
      playHint.textContent = t('demo.playHint');
      playGate = onPlay;
      play.classList.add('on');
    },

    dispose() {
      disarm();
      closePlay();
      play.remove();
      clearTimeout(curtainTimer);
      refs.input.removeEventListener('keydown', guard, true);
      next.removeEventListener('click', onNextClick);
      pill.remove();
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

export const GUIDE_COPY: Record<UiLang, { title: string; sub: string; p1: string; p2: string; how: string; enter: string }> = {
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
      'Diary, Skills and Dream.',
    enter: 'Enter',
  },
  zh: {
    title: 'Luna · 回放',
    sub: '真实场景 · 真实前端 · 她自己的声音',
    p1: '接下来你看到的是一段回放：照着真实使用场景复现的日常片段，用 Luna 真正的前端和渲染引擎播出来。这个页面背后没有在运行的 AI。',
    p2: '这里没有一样是编的。每个气泡、每张工具卡、她主动开口、悄悄做的小事，还有梦，都是产品真实具备的能力，由 app 里同一份代码驱动；声音是她自己的，提前渲染好的。',
    how: '台词会替你打好，按 ➤（或回车）发送。一幕演完点「下一幕」，也可以点顶上的幕名直接选。滚轮缩放，拖动挪位置，双击复位。「← 菜单」里有她的日记、技能和梦。',
    enter: '进入',
  },
};

export type GuideHandle = { language: Promise<UiLang>; dispose(): void };

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
    enter.addEventListener('click', () => {
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
  return { language, dispose: () => guide.remove() };
}
