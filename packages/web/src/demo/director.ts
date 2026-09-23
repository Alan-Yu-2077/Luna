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
.demo-guide p.demo-guide-zh { color: #4a566a; }
.demo-guide .demo-guide-how { margin: 14px 0 0; padding: 12px 14px; background: var(--user-bubble); border-radius: 12px; font-size: 13px; line-height: 1.6; }
.demo-guide .demo-guide-enter {
  display: block; margin: 18px auto 0; border: none; cursor: pointer; background: var(--sky); color: var(--sky-text);
  font: inherit; font-size: 15px; font-weight: 600; padding: 11px 28px; border-radius: 999px;
  box-shadow: 0 3px 0 var(--sky-deep);
}
.demo-guide .demo-guide-enter:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--sky-deep); }
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

  return {
    arm(text) {
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
    },

    disarm,

    sceneStart(index, title) {
      disarm(); // a jump mid-typing must not leave a half line armed later
      refs.input.value = '';
      label.textContent = `Scene ${index + 1}/${opts.sceneTitles.length} · ${title}`;
      items.forEach((b, i) => b.classList.toggle('current', i === index));
      list.hidden = true;
      next.hidden = true;
      nextHandler = null;
      pill.classList.add('on');
    },

    sceneEnd(_index, hasNext) {
      next.textContent = hasNext ? 'Next scene →' : 'Replay ↻';
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

    dispose() {
      disarm();
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
// the lobby is up (the session is hers; the link belongs to the front door). Mounted at boot, before
// any Talk, which is why it is not part of the director the session creates.
export function mountMapLink(doc: Document, root: HTMLElement, href: string, label: string): () => void {
  const style = doc.createElement('style');
  style.textContent = `
.demo-map-link { display: none; position: fixed; right: 26px; bottom: 26px; z-index: 6;
  font-size: 12px; letter-spacing: 0.04em; color: var(--muted); text-decoration: none; }
.demo-map-link:hover { color: var(--sky-text); text-decoration: underline; }
.menu-mode .demo-map-link { display: inline; }
`;
  doc.head.appendChild(style);
  const a = doc.createElement('a');
  a.className = 'demo-map-link';
  a.href = href;
  a.textContent = label;
  root.appendChild(a);
  return () => {
    a.remove();
    style.remove();
  };
}

// v0.47.0: the entrance guide — what this page is, the promise, and how to drive it. Shown over the
// lobby while the model loads behind it; its Enter is the visitor's first gesture (which is also
// what lets the page make a sound later). Bilingual: her words are English, the visitor may not be.
export const GUIDE_COPY = {
  title: 'Luna · a replay',
  sub: 'real scenes · real front end · her real voice',
  en1:
    'What you are about to watch is a replay: daily-use scenes reproduced from real ones, played back ' +
    'through Luna’s real front end and rendering engine. There is no AI running behind this page.',
  en2:
    'Nothing here is invented. Every bubble, tool card, unprompted message, quiet note and dream is a ' +
    'shipped product capability, driven by the same code the app runs — with her own voice, pre-rendered.',
  zh1: '你正在体验的，是基于真实场景与真实 Luna 能力复现的日常使用片段——由 Luna 真实的前端与渲染引擎回放，而不是一个正在运行的 AI。',
  zh2: '这里的一切绝非虚构：每一个气泡、工具卡、主动开口、安静的小记和梦，都是产品真实具备的能力，由同一份代码驱动；声音是她自己的音色，预先渲染。',
  how:
    'Lines are typed for you — press ➤ (or Enter). When a scene ends, Next scene (or pick one from the pill). ' +
    'Scroll to zoom, drag to move her, double-click to reset. ← Menu opens her Diary, Skills and Dream.',
  howZh: '台词会替你打好——按 ➤（或回车）。一幕结束后点 Next scene（也可在顶部药丸里选幕）。滚轮缩放、拖拽移动、双击复位；← Menu 里有她的日记、技能和梦。',
  enter: 'Enter · 进入',
} as const;

export function mountGuide(doc: Document, onEnter?: () => void): () => void {
  ensureStyle(doc);
  const guide = doc.createElement('div');
  guide.className = 'demo-guide';
  guide.setAttribute('role', 'dialog');
  guide.setAttribute('aria-label', GUIDE_COPY.title);
  const card = doc.createElement('div');
  card.className = 'demo-guide-card';
  const h = doc.createElement('h2');
  h.textContent = GUIDE_COPY.title;
  const sub = doc.createElement('p');
  sub.className = 'demo-guide-sub';
  sub.textContent = GUIDE_COPY.sub;
  const p = (text: string, cls?: string): HTMLParagraphElement => {
    const el = doc.createElement('p');
    if (cls) el.className = cls;
    el.textContent = text;
    return el;
  };
  const how = doc.createElement('div');
  how.className = 'demo-guide-how';
  how.append(p(GUIDE_COPY.how), p(GUIDE_COPY.howZh, 'demo-guide-zh'));
  how.lastElementChild?.setAttribute('style', 'margin:0');
  const enter = doc.createElement('button');
  enter.type = 'button';
  enter.className = 'demo-guide-enter';
  enter.textContent = GUIDE_COPY.enter;
  card.append(h, sub, p(GUIDE_COPY.en1), p(GUIDE_COPY.zh1, 'demo-guide-zh'), p(GUIDE_COPY.en2), p(GUIDE_COPY.zh2, 'demo-guide-zh'), how, enter);
  guide.appendChild(card);
  doc.body.appendChild(guide);

  const leave = (): void => {
    guide.classList.add('leaving');
    setTimeout(() => guide.remove(), 600);
    onEnter?.();
  };
  enter.addEventListener('click', leave);
  return () => guide.remove();
}
