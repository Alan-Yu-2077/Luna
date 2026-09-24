// Builds the cute UI shell (vtuber-overlay style: chat panel left, model stage
// right, striped bg + lace borders + scattered motifs) plus the v0.13.4 polish
// chrome (dream overlay, mood pip, scroll pill, settings popover), and returns
// the live mount points the app wires events to. Pure DOM construction.

import { COSTUME, DEFAULT_IDLE_PROFILE, IDLE_PROFILES } from '../live2d/faceData';
import { t, uiLang, type Bilingual, type UiLang } from './uiCopy';

// v0.48.0: the avatar's own control labels in both interface languages, keyed by the engine ids —
// faceData stays engine data (the workbench, a dev tool, keeps its English labels).
const COSTUME_LABEL: Record<string, Bilingual> = {
  eyepatch: { en: 'Eyepatch', zh: '眼罩' },
  mic: { en: 'Microphone', zh: '麦克风' },
  puppy: { en: 'Floating puppy', zh: '漂浮小狗' },
  longHair: { en: 'Short hair 1', zh: '短发 1' },
  shortHair2: { en: 'Short hair 2', zh: '短发 2' },
};
const IDLE_LABEL: Record<string, Bilingual> = {
  defaultIdleV1: { en: 'Default', zh: '默认' },
  cuteSwayV1: { en: 'Cute sway', zh: '轻轻摇晃' },
  peekyIdleV1: { en: 'Peek', zh: '偷看' },
  shyDriftV1: { en: 'Shy drift', zh: '害羞地飘' },
  sweetBounceV1: { en: 'Sweet bounce', zh: '甜甜地蹦' },
};

// v0.48.0: the interface-language options, each named in its own language.
export const UI_LANG_OPTIONS: ReadonlyArray<{ id: UiLang; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
];

export type LayoutRefs = {
  statusBadge: HTMLElement;
  chatLog: HTMLElement;
  chatHeader: HTMLElement;
  input: HTMLInputElement;
  inputRow: HTMLElement;
  sendBtn: HTMLButtonElement;
  collapseBtn: HTMLButtonElement;
  dreamBtn: HTMLButtonElement;
  modelStage: HTMLElement;
  moodPip: HTMLElement;
  scrollPill: HTMLButtonElement;
  dreamOverlay: HTMLElement;
  dreamWakeBtn: HTMLButtonElement;
  dreamCaption: HTMLElement;
  settingsBtn: HTMLButtonElement;
  settingsPanel: HTMLElement;
  settingsBackdrop: HTMLElement;
  ttsToggle: HTMLInputElement;
  live2dToggle: HTMLInputElement;
  gazeToggle: HTMLInputElement;
  affectToggle: HTMLInputElement;
  livePeakToggle: HTMLInputElement;
  shortClipsToggle: HTMLInputElement;
  idleActionsToggle: HTMLInputElement;
  listeningToggle: HTMLInputElement;
  speechPerfToggle: HTMLInputElement;
  idleSelect: HTMLSelectElement;
  workbenchBtn: HTMLButtonElement;
  costumeToggles: Record<string, HTMLInputElement>;
  // v0.48.0: the interface language. Built here, in the old panel, so every boot mode can reach it;
  // the settings page adopts it into System. app.ts owns what a change does.
  languageSelect: HTMLSelectElement;
  petToggle: HTMLInputElement;
  serverSettings: HTMLElement;
  // v0.39.2: agent-only mode hides the avatar pane outright — a tab of dead controls is worse than
  // no tab. Exposed as refs so app.ts decides, and layout stays a pure builder.
  avatarTab: HTMLElement;
  avatarRailBtn: HTMLButtonElement;
};

type Motif = { ch: string; top: string; left: string; size: string; op?: string };

const MOTIFS: Motif[] = [
  { ch: '☁︎', top: '14%', left: '56%', size: '26px' },
  { ch: '☁︎', top: '52%', left: '85%', size: '20px', op: '0.6' },
  { ch: '☁︎', top: '76%', left: '60%', size: '22px', op: '0.55' },
  { ch: '◇', top: '30%', left: '73%', size: '14px' },
  { ch: '◇', top: '64%', left: '80%', size: '12px', op: '0.6' },
  { ch: '✿', top: '20%', left: '90%', size: '15px', op: '0.7' },
  { ch: '❀', top: '46%', left: '53%', size: '14px', op: '0.6' },
  { ch: '✿', top: '86%', left: '88%', size: '13px', op: '0.6' },
];

// Drifting dream stars: fixed positions + staggered timing (no RNG needed).
const STARS: Array<{ left: string; dur: string; delay: string; size: string }> = [
  { left: '12%', dur: '6s', delay: '0s', size: '14px' },
  { left: '28%', dur: '7.5s', delay: '1.2s', size: '10px' },
  { left: '44%', dur: '5.5s', delay: '0.6s', size: '16px' },
  { left: '60%', dur: '8s', delay: '2s', size: '11px' },
  { left: '76%', dur: '6.5s', delay: '0.3s', size: '13px' },
  { left: '88%', dur: '7s', delay: '1.6s', size: '10px' },
];

function add(parent: Element, tag: string, cls?: string, text?: string): HTMLElement {
  const e = parent.ownerDocument.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function toggleRow(parent: Element, labelText: string, checked: boolean): HTMLInputElement {
  const doc = parent.ownerDocument;
  const label = add(parent, 'label');
  add(label, 'span', undefined, labelText);
  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  label.appendChild(input);
  return input;
}

// v0.36.4: one settings tab pane. The active one is shown; the rest are display:none (CSS).
function tabPane(parent: Element, name: string, active: boolean): HTMLElement {
  const pane = add(parent, 'div', `settings-tab${active ? ' active' : ''}`);
  pane.dataset['tab'] = name;
  return pane;
}

// v0.36.4: one icon button in the left rail. `data-tab` links it to its pane.
function railBtn(rail: Element, icon: string, label: string, name: string, active: boolean): HTMLButtonElement {
  const doc = rail.ownerDocument;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = `rail-btn${active ? ' active' : ''}`;
  btn.dataset['tab'] = name;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.textContent = icon;
  rail.appendChild(btn);
  return btn;
}

// v0.36.4: click a rail icon → activate its pane + button (pure show/hide, no app state).
function wireTabs(rail: HTMLElement, panes: HTMLElement[]): void {
  rail.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest('.rail-btn');
    if (!(btn instanceof HTMLElement)) return;
    const name = btn.dataset['tab'];
    for (const b of rail.querySelectorAll('.rail-btn')) b.classList.toggle('active', b === btn);
    for (const p of panes) p.classList.toggle('active', p.dataset['tab'] === name);
  });
}

function selectRow(
  parent: Element,
  labelText: string,
  options: ReadonlyArray<{ id: string; label: string }>,
  selected: string,
): HTMLSelectElement {
  const doc = parent.ownerDocument;
  const label = add(parent, 'label');
  add(label, 'span', undefined, labelText);
  const sel = doc.createElement('select');
  for (const o of options) {
    const opt = doc.createElement('option');
    opt.value = o.id;
    opt.textContent = o.label;
    if (o.id === selected) opt.selected = true;
    sel.appendChild(opt);
  }
  label.appendChild(sel);
  return sel;
}

export function buildLayout(root: HTMLElement): LayoutRefs {
  const doc = root.ownerDocument;
  // classList.add, NOT `className =`: other boot code may add classes to the root before buildLayout.
  root.classList.add('luna-app');
  while (root.firstChild) root.removeChild(root.firstChild);

  // v0.36.6: lace trim back as top/bottom decoration (absolute, z-0 behind the model — never crops it).
  add(root, 'div', 'lace-top');
  add(root, 'div', 'lace-bottom');

  const stage = add(root, 'div', 'stage');

  const statusBadge = add(stage, 'div', 'status-badge', t('status.connecting'));

  const settingsBtn = doc.createElement('button');
  settingsBtn.className = 'settings-btn';
  settingsBtn.type = 'button';
  settingsBtn.setAttribute('aria-label', t('settings.aria'));
  settingsBtn.textContent = '⚙';
  stage.appendChild(settingsBtn);

  // v0.36.4 (Initiative 26): VTube-Studio-style settings — a click-to-close backdrop + a panel that
  // glides in from the right, with a left icon rail switching between grouped tabs. Every control
  // keeps its exact semantics/refs; only the container structure + skin changed. The `.settings-panel`
  // + `.on` open contract and the `label`/`.server-settings .setting-row` selectors are preserved
  // (the packaged smoke asserts them).
  const settingsBackdrop = add(stage, 'div', 'settings-backdrop');
  const settingsPanel = add(stage, 'div', 'settings-panel');
  const settingsRail = add(settingsPanel, 'div', 'settings-rail');
  const settingsBody = add(settingsPanel, 'div', 'settings-body');
  const generalTab = tabPane(settingsBody, 'general', true);
  const avatarTab = tabPane(settingsBody, 'avatar', false);
  const serverTab = tabPane(settingsBody, 'server', false);
  railBtn(settingsRail, '🎚', t('settings.tab.general'), 'general', true);
  const avatarRailBtn = railBtn(settingsRail, '✨', t('settings.tab.avatar'), 'avatar', false);
  railBtn(settingsRail, '☁️', t('settings.tab.server'), 'server', false);
  wireTabs(settingsRail, [generalTab, avatarTab, serverTab]);

  const generalCard = add(generalTab, 'div', 'settings-card');
  const ttsToggle = toggleRow(generalCard, t('settings.voice'), localStorage.getItem('luna:tts') !== '0');
  // Desktop-shell only: app.ts hides the row when no lunaPet bridge exists (plain browser) and
  // sets checked from the actual mode (?pet=1). The Setup wizard re-run row is inserted right after
  // it by app.ts (petRow.after), so it lands in this same card.
  const petToggle = toggleRow(generalCard, t('settings.pet'), false);
  petToggle.closest('label')?.classList.add('pet-mode-row');
  const languageSelect = selectRow(generalCard, t('settings.language'), UI_LANG_OPTIONS, uiLang());
  languageSelect.closest('label')?.classList.add('language-row');
  add(generalTab, 'div', 'hint', t('settings.hint.general'));

  const avatarCard = add(avatarTab, 'div', 'settings-card');
  const live2dToggle = toggleRow(avatarCard, t('settings.live2d'), localStorage.getItem('luna:live2d') !== '0');
  const gazeToggle = toggleRow(avatarCard, t('settings.gaze'), localStorage.getItem('luna:gaze-follow') !== '0');
  const affectToggle = toggleRow(avatarCard, t('settings.affect'), localStorage.getItem('luna:affect') !== '0');
  const livePeakToggle = toggleRow(avatarCard, t('settings.livePeak'), localStorage.getItem('luna:live-peak') !== '0');
  const shortClipsToggle = toggleRow(avatarCard, t('settings.shortClips'), localStorage.getItem('luna:short-clips') !== '0');
  const idleActionsToggle = toggleRow(avatarCard, t('settings.idleActions'), localStorage.getItem('luna:idle-actions') !== '0');
  const listeningToggle = toggleRow(avatarCard, t('settings.listening'), localStorage.getItem('luna:listening') !== '0');
  const speechPerfToggle = toggleRow(avatarCard, t('settings.speechPerf'), localStorage.getItem('luna:speech-performance') !== '0');
  const idleSelect = selectRow(
    avatarCard,
    t('settings.idle'),
    IDLE_PROFILES.map((p) => ({ id: p.id, label: IDLE_LABEL[p.id]?.[uiLang()] ?? p.label })),
    localStorage.getItem('luna:idle-profile') ?? DEFAULT_IDLE_PROFILE,
  );
  // v0.43.10: costume. Its own card because it is a different KIND of switch from everything above —
  // those tune how the expression system behaves, these are things the owner puts on her and that
  // stay on until he takes them off. Checked state is filled in by app.ts from `luna:costume`.
  const costumeCard = add(avatarTab, 'div', 'settings-card costume-card');
  add(costumeCard, 'div', 'card-title', t('settings.costume'));
  const costumeToggles: Record<string, HTMLInputElement> = {};
  for (const [id, item] of Object.entries(COSTUME)) {
    const box = toggleRow(costumeCard, COSTUME_LABEL[id]?.[uiLang()] ?? item.label, false);
    box.dataset['costume'] = id;
    costumeToggles[id] = box;
  }
  add(costumeCard, 'div', 'hint', t('settings.costumeHint'));

  // v0.43.7: the way into the Live2D workbench. A row rather than a rail tab — the bench replaces
  // the whole page (no WS, no chat), so it is a departure, not another settings pane.
  const workbenchBtn = doc.createElement('button');
  workbenchBtn.className = 'workbench-btn';
  workbenchBtn.type = 'button';
  workbenchBtn.textContent = t('settings.workbench');
  avatarCard.appendChild(workbenchBtn);

  // v0.27.1: the server-driven half — settingsView.ts fills this from settings.state.
  const serverSettings = add(serverTab, 'div', 'server-settings');
  add(serverTab, 'div', 'hint server-empty', t('settings.serverEmpty'));

  const motifLayer = add(stage, 'div', 'motif-layer');
  for (const m of MOTIFS) {
    const s = add(motifLayer, 'span', 'motif', m.ch);
    s.style.top = m.top;
    s.style.left = m.left;
    s.style.fontSize = m.size;
    if (m.op) s.style.opacity = m.op;
  }

  const panel = add(stage, 'div', 'chat-panel');
  for (const c of ['l1', 'l2', 'r1', 'r2']) add(panel, 'span', `puff ${c}`);
  // v0.36.0: header + log + pill live in a .chat-body wrapper so the collapse can close it
  // top-to-bottom (grid-row 1fr→0fr) into the input bar, like a window sash. The input row stays a
  // direct panel child (always visible).
  const chatBody = add(panel, 'div', 'chat-body');
  const header = add(chatBody, 'div', 'chat-header');
  add(header, 'span', 'dot');
  add(header, 'span', undefined, t('chat.header'));
  const chatLog = add(chatBody, 'div', 'chat-log');
  const scrollPill = doc.createElement('button');
  scrollPill.className = 'scroll-pill';
  scrollPill.type = 'button';
  scrollPill.textContent = t('chat.newMessages');
  chatBody.appendChild(scrollPill);

  const inputRow = add(panel, 'div', 'chat-input-row');
  // v0.25.1 (Initiative 18): collapse ↔ expand toggle. Lives in the input-row (NOT the header) so it
  // stays reachable in collapsed mode, where the header/log are hidden and only this row remains.
  const collapseBtn = doc.createElement('button');
  collapseBtn.className = 'collapse-btn';
  collapseBtn.type = 'button';
  collapseBtn.setAttribute('aria-label', t('chat.collapse'));
  collapseBtn.textContent = '⌄';
  inputRow.appendChild(collapseBtn);
  const input = doc.createElement('input');
  input.className = 'chat-input';
  input.type = 'text';
  input.placeholder = t('chat.placeholder');
  input.autocomplete = 'off';
  inputRow.appendChild(input);
  const sendBtn = doc.createElement('button');
  sendBtn.className = 'send-btn';
  sendBtn.type = 'button';
  sendBtn.setAttribute('aria-label', t('chat.send'));
  sendBtn.textContent = '➤';
  inputRow.appendChild(sendBtn);

  const modelStage = add(stage, 'div', 'model-stage');
  const moodPip = add(modelStage, 'div', 'mood-pip');
  add(moodPip, 'span', 'emoji', '');
  add(moodPip, 'span', 'mood-label', '');
  const ph = add(modelStage, 'div', 'model-placeholder');
  add(ph, 'div', 'ph-circle', '🌙');
  // v0.48.0: while the model downloads this says so — the 'no avatar' copy used to show through the
  // replay's entrance card for the whole download. app.ts swaps in the real empty state on failure.
  add(ph, 'div', 'label', t('stage.loading'));
  add(ph, 'div', 'sub', t('stage.loadingSub'));
  const dreamBtn = doc.createElement('button');
  dreamBtn.className = 'dream-btn';
  dreamBtn.type = 'button';
  dreamBtn.textContent = t('dream.button');
  modelStage.appendChild(dreamBtn);

  const dreamOverlay = add(root, 'div', 'dream-overlay');
  const stars = add(dreamOverlay, 'div', 'dream-stars');
  for (const st of STARS) {
    const s = add(stars, 'span', undefined, '✦');
    s.style.left = st.left;
    s.style.fontSize = st.size;
    s.style.animationDuration = st.dur;
    s.style.animationDelay = st.delay;
  }
  add(dreamOverlay, 'div', 'moon', '🌙');
  add(dreamOverlay, 'div', 'dream-title', t('dream.title'));
  const dreamCaption = add(dreamOverlay, 'div', 'dream-caption', '');
  const dreamWakeBtn = doc.createElement('button');
  dreamWakeBtn.className = 'wake-btn';
  dreamWakeBtn.type = 'button';
  dreamWakeBtn.textContent = t('dream.wake');
  dreamOverlay.appendChild(dreamWakeBtn);

  return {
    statusBadge, chatLog, chatHeader: header, input, inputRow, sendBtn, collapseBtn, dreamBtn, modelStage,
    moodPip, scrollPill, dreamOverlay, dreamWakeBtn, dreamCaption,
    settingsBtn, settingsPanel, settingsBackdrop, ttsToggle, live2dToggle, gazeToggle, idleSelect,
    petToggle, serverSettings, avatarTab, avatarRailBtn, affectToggle, livePeakToggle, shortClipsToggle, idleActionsToggle, listeningToggle, speechPerfToggle,
    workbenchBtn, costumeToggles, languageSelect,
  };
}
