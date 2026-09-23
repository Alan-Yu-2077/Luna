import type { LayoutRefs } from './layout';
import { mountModulesSection, type ModulesBridges } from './modulesConfig';
import { mountPersonaSection } from './personaEditor';
import { pick, t, type Bilingual } from './uiCopy';

// v0.44.5 — settings, reorganised by WHICH PART OF HER a control touches. The old VTS side panel
// grew three tabs and a dozen switches; finding one meant guessing. Five categories now, entered
// from the menu as a full page.
//
// The migration is an ADOPTION, not a rebuild: the page moves the old panel's live DOM rows into
// the new categories. Same elements, same listeners, same localStorage keys — the live-read
// contracts physically cannot drift, because they are the same nodes. In `luna:menu='0'` boots the
// page never mounts and the old panel keeps its rows, untouched.

export type SettingsCategoryId =
  | 'voice'
  | 'expression'
  | 'appearance'
  | 'behaviour'
  | 'persona'
  | 'modules'
  | 'system';

// v0.48.0: label and blurb in both interface languages (the page used to mix an English label with a
// Chinese blurb); read with pick() when the page is built.
export type SettingsCategory = { id: SettingsCategoryId; label: Bilingual; blurb: Bilingual };

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  { id: 'voice', label: { en: 'Voice', zh: '声音' }, blurb: { en: 'Her voice', zh: '她的声音' } },
  { id: 'expression', label: { en: 'Expression & Motion', zh: '表情与动作' }, blurb: { en: 'How her face and body move', zh: '她的表情与动作' } },
  { id: 'appearance', label: { en: 'Appearance', zh: '外观' }, blurb: { en: 'How she looks, and the room she is in', zh: '她的样子与这间屋子' } },
  { id: 'behaviour', label: { en: 'Behaviour', zh: '行为' }, blurb: { en: 'What she does on her own', zh: '她自己的行为' } },
  // v0.44.6: persona is its own category (it is ABOUT her, not about widgets), and the four module
  // cards get their own too — four cards under System would have buried both.
  { id: 'persona', label: { en: 'Persona', zh: '人格' }, blurb: { en: 'Who she is', zh: '她是谁' } },
  { id: 'modules', label: { en: 'Modules', zh: '模块' }, blurb: { en: 'The abilities plugged into her', zh: '接进来的能力' } },
  { id: 'system', label: { en: 'System', zh: '系统' }, blurb: { en: 'Under the hood, and tools', zh: '底层与工具' } },
];

// The reconciliation artifact (the version's core risk is losing a switch in the move): every
// localStorage-backed control in the old panel, mapped to exactly one category. The test cross-
// checks this list against `PERF_FLAGS` and against itself — no key missing, none twice.
export const SETTINGS_IA: Record<SettingsCategoryId, readonly string[]> = {
  voice: ['luna:tts'],
  expression: [
    'luna:affect',
    'luna:live-peak',
    'luna:short-clips',
    'luna:idle-actions',
    'luna:listening',
    'luna:speech-performance',
    'luna:idle-profile',
  ],
  appearance: ['luna:live2d', 'luna:gaze-follow', 'luna:costume'],
  behaviour: [],
  persona: [], // HTTP-backed (the soul endpoints), not localStorage
  modules: [], // luna.env-backed through the desktop bridge, not localStorage
  // The server registry card is WS-driven, not localStorage-backed; v0.48.0's interface language is.
  system: ['luna:ui-lang'],
};

export function iaKeys(): string[] {
  return Object.values(SETTINGS_IA).flat();
}

// Which old-panel rows land where. The refs are the SAME elements the old panel built — adoption
// moves them, listeners and all.
// v0.48.1: the replay passes its own fetch (the voice-health line gets the tape's answer, not a
// 404 that reads "not running" while her voice plays) and `replay` — which keeps two things out of
// a public page that cannot honour them: the persona editor (her soul file lives on the owner's
// machine) and the door to the workbench (a dev tool, and a navigation away from the tape).
export type SettingsPageOpts = { fetchFn?: (url: string) => Promise<Response>; replay?: boolean };

export function mountSettingsPage(doc: Document, refs: LayoutRefs, opts: SettingsPageOpts = {}): HTMLElement {
  const fetchFn = opts.fetchFn ?? ((u: string) => fetch(u));
  const page = doc.createElement('div');
  page.className = 'settings-page';

  const rail = doc.createElement('nav');
  rail.className = 'settings-page-rail';
  const bodyHost = doc.createElement('div');
  bodyHost.className = 'settings-page-body';
  page.append(rail, bodyHost);

  const sections = new Map<SettingsCategoryId, HTMLElement>();
  const railBtns: HTMLButtonElement[] = [];
  for (const cat of SETTINGS_CATEGORIES) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'settings-page-cat';
    b.dataset['cat'] = cat.id;
    b.textContent = pick(cat.label);
    rail.appendChild(b);
    railBtns.push(b);

    const sec = doc.createElement('section');
    sec.className = 'settings-page-section';
    sec.dataset['cat'] = cat.id;
    const h = doc.createElement('h3');
    h.textContent = pick(cat.label);
    const blurb = doc.createElement('p');
    blurb.className = 'settings-page-blurb';
    blurb.textContent = pick(cat.blurb);
    sec.append(h, blurb);
    bodyHost.appendChild(sec);
    sections.set(cat.id, sec);

    b.addEventListener('click', () => select(cat.id));
  }

  const select = (id: SettingsCategoryId): void => {
    for (const b of railBtns) b.classList.toggle('on', b.dataset['cat'] === id);
    for (const [cid, sec] of sections) sec.classList.toggle('on', cid === id);
  };

  const rowOf = (input: HTMLElement | null): HTMLElement | null => input?.closest('label') ?? null;
  const adopt = (cat: SettingsCategoryId, el: HTMLElement | null): void => {
    if (el) sections.get(cat)?.appendChild(el);
  };

  // ── Voice ──
  adopt('voice', rowOf(refs.ttsToggle));
  const health = doc.createElement('p');
  health.className = 'settings-voice-health';
  health.textContent = t('settings.health.checking');
  sections.get('voice')?.appendChild(health);
  void fetchFn('/api/tts/health')
    .then(async (r) => {
      const body = (await r.json().catch(() => null)) as { backend?: { state?: string } } | null;
      const state = body?.backend?.state ?? (r.ok ? 'ready' : 'down');
      health.textContent = t(
        state === 'ready'
          ? 'settings.health.ready'
          : state === 'starting' || state === 'restarting'
            ? 'settings.health.starting'
            : 'settings.health.down',
      );
    })
    .catch(() => {
      health.textContent = t('settings.health.down');
    });

  // ── Expression & Motion — the seven performance controls, in the PERF_FLAGS order ──
  adopt('expression', rowOf(refs.affectToggle));
  adopt('expression', rowOf(refs.livePeakToggle));
  adopt('expression', rowOf(refs.shortClipsToggle));
  adopt('expression', rowOf(refs.idleActionsToggle));
  adopt('expression', rowOf(refs.listeningToggle));
  adopt('expression', rowOf(refs.speechPerfToggle));
  adopt('expression', rowOf(refs.idleSelect));

  // ── Appearance ──
  adopt('appearance', rowOf(refs.live2dToggle));
  adopt('appearance', rowOf(refs.gazeToggle));
  // The whole costume card (v0.43.10) — its toggles carry their own wiring.
  const costumeCard = Object.values(refs.costumeToggles)[0]?.closest('.settings-card');
  if (costumeCard instanceof HTMLElement) adopt('appearance', costumeCard);
  adopt('appearance', rowOf(refs.petToggle));
  const rerun = refs.petToggle.closest('.settings-card')?.querySelector('.rerun-setup-row');
  if (rerun instanceof HTMLElement) adopt('appearance', rerun);

  // ── Behaviour — a placeholder on purpose: proactive knobs live in env/DB pins today, and
  // surfacing them is its own decision, not a side effect of moving furniture. ──
  const note = doc.createElement('p');
  note.className = 'settings-page-note';
  note.textContent = t('settings.behaviourNote');
  sections.get('behaviour')?.appendChild(note);

  // ── Persona (v0.44.6) — the soul endpoints; the self-edit firewall lives in the tool layer. ──
  if (opts.replay) {
    const personaNote = doc.createElement('p');
    personaNote.className = 'settings-page-note';
    personaNote.textContent = t('demo.personaNote');
    sections.get('persona')?.appendChild(personaNote);
  } else {
    sections.get('persona')?.appendChild(mountPersonaSection(doc));
  }

  // ── Modules (v0.44.6) — four uniform cards over the wizard's own bridges. ──
  const setup = (globalThis as { lunaSetup?: Record<string, unknown> }).lunaSetup as
    | {
        wizardPrefill?: ModulesBridges['prefill'];
        probe?: ModulesBridges['probeChat'];
        probeProvider?: ModulesBridges['probeProvider'];
        saveConfig?: ModulesBridges['saveConfig'];
      }
    | undefined;
  const pet = (globalThis as { lunaPet?: { relaunch?: () => void } }).lunaPet;
  sections.get('modules')?.appendChild(
    mountModulesSection(doc, {
      ...(setup?.wizardPrefill ? { prefill: setup.wizardPrefill.bind(setup) } : {}),
      ...(setup?.probe ? { probeChat: setup.probe.bind(setup) } : {}),
      ...(setup?.probeProvider ? { probeProvider: setup.probeProvider.bind(setup) } : {}),
      ...(setup?.saveConfig ? { saveConfig: setup.saveConfig.bind(setup) } : {}),
      ...(pet?.relaunch ? { relaunch: pet.relaunch.bind(pet) } : {}),
    }),
  );

  // ── System — the server registry card is adopted whole; its render pipeline is untouched. ──
  adopt('system', rowOf(refs.languageSelect));
  adopt('system', refs.serverSettings);
  if (!opts.replay) {
    const wbRow = doc.createElement('div');
    wbRow.className = 'settings-page-tools';
    adopt('system', wbRow);
    wbRow.appendChild(refs.workbenchBtn);
  }

  select('voice');
  return page;
}
