// v0.46.0 — the demo's stagehand: the only DOM the showcase adds to the app. It pre-types a user
// beat into the REAL input (dispatching `input` events, so she leans in exactly as she does for a
// typing owner), guards Send until the beat is fully typed, and mounts one foreign element — a pill
// in the model stage naming the scene, with the Next button once the scene has played out.
//
// The input stays read-only for the whole demo. That is the one visible deviation from the app,
// chosen over the alternative: letting a visitor type into a conversation that answers from a script.

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
  dispose(): void;
};

export const TYPE_MS = 45;
export const TYPE_LEAD_MS = 500;

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

const STYLE = `
.demo-pill {
  position: absolute; left: 50%; top: 10px; transform: translateX(-50%); z-index: 5;
  display: inline-flex; align-items: center; gap: 10px; white-space: nowrap;
  background: #fff; color: var(--ink); font-size: 12px; padding: 6px 12px; border-radius: 999px;
  box-shadow: 0 1px 4px rgba(90, 120, 160, 0.18); opacity: 0; transition: opacity 0.3s; pointer-events: none;
}
.demo-pill.on { opacity: 1; pointer-events: auto; }
.menu-mode .demo-pill { opacity: 0; pointer-events: none; }
.demo-next {
  border: none; cursor: pointer; background: var(--sky); color: var(--sky-text);
  font: inherit; font-size: 12px; font-weight: 500; padding: 5px 12px; border-radius: 999px;
}
.demo-next:hover { background: var(--sky-deep); }
.demo-next[hidden] { display: none; }
.send-btn.demo-armed { animation: demo-nudge 1.4s ease-in-out infinite; }
@keyframes demo-nudge { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }
`;

export function mountDirector(
  doc: Document,
  refs: DirectorRefs,
  opts: { sceneCount: number; onNext: () => void },
): Director {
  const style = doc.createElement('style');
  style.textContent = STYLE;
  doc.head.appendChild(style);

  const pill = doc.createElement('div');
  pill.className = 'demo-pill';
  const label = doc.createElement('span');
  label.className = 'demo-scene';
  const next = doc.createElement('button');
  next.type = 'button';
  next.className = 'demo-next';
  next.hidden = true;
  pill.append(label, next);
  refs.modelStage.appendChild(pill);

  refs.input.readOnly = true;
  refs.sendBtn.disabled = true;

  let armed = false;
  let typing: Array<ReturnType<typeof setTimeout>> = [];
  const stopTyping = (): void => {
    for (const t of typing) clearTimeout(t);
    typing = [];
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
      stopTyping();
      armed = false;
      refs.sendBtn.disabled = true;
      refs.sendBtn.classList.remove('demo-armed');
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

    disarm() {
      stopTyping();
      armed = false;
      refs.sendBtn.disabled = true;
      refs.sendBtn.classList.remove('demo-armed');
    },

    sceneStart(index, title) {
      label.textContent = `Scene ${index + 1}/${opts.sceneCount} · ${title}`;
      next.hidden = true;
      nextHandler = null;
      pill.classList.add('on');
    },

    sceneEnd(_index, hasNext) {
      next.textContent = hasNext ? 'Next scene →' : 'Replay ↻';
      nextHandler = hasNext ? opts.onNext : () => doc.location.reload();
      next.hidden = false;
    },

    dispose() {
      stopTyping();
      refs.input.removeEventListener('keydown', guard, true);
      next.removeEventListener('click', onNextClick);
      pill.remove();
      style.remove();
      refs.input.readOnly = false;
      refs.sendBtn.disabled = false;
      refs.sendBtn.classList.remove('demo-armed');
    },
  };
}
