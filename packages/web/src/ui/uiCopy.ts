// v0.48.0 (Initiative 40): the interface language. One table, every visitor-visible string the app
// itself writes, in both languages — modelled on the wizard's setupCopy.ts, which stays its own.
//
// The language is resolved ONCE, at the top of boot(), and never changes while the page lives:
// switching is persist + reload (the lobby is cold, so nothing is interrupted). That is why a
// module-level value is safe here — but pure helpers still take `lang` explicitly, so tests never
// depend on what another test file left behind.
//
// What this layer does NOT translate: anything the server writes (tool summaries, dream details,
// settings labels on the wire) — those stay byte-for-byte what the product sends, and the views
// re-present them (settingsView, dreamWords, the quiet-note table in @luna/protocol).

export type UiLang = 'en' | 'zh';

export const UI_LANG_KEY = 'luna:ui-lang';

export function parseUiLang(v: unknown): UiLang | null {
  return v === 'en' || v === 'zh' ? v : null;
}

// ?lang= (a shared link, the replay's picker) → the replay's bridge → the owner's stored choice →
// English. Deliberately NOT the system language: an upgrade must not flip the owner's app.
export function resolveUiLang(opts: { search: string; bridgeLang?: unknown; stored?: string | null }): UiLang {
  return (
    parseUiLang(new URLSearchParams(opts.search).get('lang')) ??
    parseUiLang(opts.bridgeLang) ??
    parseUiLang(opts.stored) ??
    'en'
  );
}

export function readStoredUiLang(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(UI_LANG_KEY) : null;
  } catch {
    return null;
  }
}

export function storeUiLang(lang: UiLang): void {
  try {
    localStorage.setItem(UI_LANG_KEY, lang);
  } catch {
    /* storage unavailable — the choice still applies to this page */
  }
}

let current: UiLang = 'en';

export function setUiLang(lang: UiLang): void {
  current = lang;
}

export function uiLang(): UiLang {
  return current;
}

// Tests only: put the module back the way a fresh import finds it.
export function resetUiLang(): void {
  current = 'en';
}

export type Bilingual<T = string> = { en: T; zh: T };

export function pick<T>(v: Bilingual<T>, lang: UiLang = current): T {
  return v[lang];
}

const UI_COPY = {
  // ── shell ──
  'status.connecting': { en: 'Connecting…', zh: '连接中…' },
  'status.open': { en: 'Online', zh: '在线' },
  'status.closed': { en: 'Reconnecting…', zh: '重新连接中…' },
  'chat.header': { en: 'Luna · online', zh: 'Luna · 在线' },
  'chat.newMessages': { en: '↓ New messages', zh: '↓ 有新消息' },
  'chat.placeholder': { en: 'Say something to Luna…', zh: '跟 Luna 说点什么…' },
  'chat.placeholderDreaming': { en: 'Luna is dreaming…', zh: 'Luna 在做梦…' },
  'chat.collapse': { en: 'Collapse chat', zh: '收起聊天' },
  'chat.expand': { en: 'Expand chat', zh: '展开聊天' },
  'chat.send': { en: 'Send', zh: '发送' },
  'chat.divider': { en: '— earlier conversation —', zh: '—— 之前的对话 ——' },
  'chat.leaf': { en: 'something she quietly did', zh: '她悄悄做了点什么' },
  'nav.menu': { en: '← Menu', zh: '← 菜单' },
  'dream.button': { en: '🌙 Dream', zh: '🌙 做梦' },
  'dream.title': { en: 'Luna is dreaming…', zh: 'Luna 在做梦…' },
  'dream.wake': { en: '☀️ Wake', zh: '☀️ 叫醒她' },

  // ── the lobby menu + its pages ──
  'menu.aria': { en: 'Main menu', zh: '主菜单' },
  'menu.talk': { en: 'Talk', zh: '聊天' },
  'menu.diary': { en: 'Diary', zh: '日记' },
  'menu.skills': { en: 'Skills', zh: '技能' },
  'menu.dream': { en: 'Dream', zh: '做梦' },
  'menu.settings': { en: 'Settings', zh: '设置' },
  'menu.quit': { en: 'Quit', zh: '退出' },
  'menu.soon.diary': { en: 'Her diary opens here soon.', zh: '她的日记很快就会出现在这里。' },
  'menu.soon.skills': { en: 'Her skills gather here soon.', zh: '她的技能很快就会出现在这里。' },
  'menu.soon.settings': { en: 'Settings assemble here soon.', zh: '设置很快就会出现在这里。' },

  // ── the model stage ──
  'stage.loading': { en: 'Loading her…', zh: '正在加载她…' },
  'stage.loadingSub': { en: 'The model is on its way', zh: '模型在路上' },
  'stage.none': { en: 'No avatar installed', zh: '还没有安装形象' },
  'stage.noneSub': { en: 'Drop a Live2D model in public/models/ — see docs/SETUP.md', zh: '把 Live2D 模型放进 public/models/ ——见 docs/SETUP.md' },
  'stage.webglOff': { en: 'WebGL unavailable', zh: 'WebGL 不可用' },
  'stage.webglOffSub': { en: "This browser can't render the avatar", zh: '这个浏览器画不出她' },
  'stage.loadFailed': { en: 'Model failed to load', zh: '模型没加载出来' },
  'stage.loadFailedSub': { en: 'Check the model files in public/models/', zh: '检查一下 public/models/ 里的模型文件' },
  'stage.chooseFolder': { en: 'Choose model folder…', zh: '选择模型文件夹…' },

  // ── the settings panel (old ⚙ panel; the settings page adopts these rows) ──
  'settings.aria': { en: 'Settings', zh: '设置' },
  'settings.tab.general': { en: 'General', zh: '通用' },
  'settings.tab.avatar': { en: 'Avatar', zh: '形象' },
  'settings.tab.server': { en: 'Server', zh: '服务器' },
  'settings.voice': { en: 'Voice', zh: '语音' },
  'settings.pet': { en: 'Desktop pet', zh: '桌宠模式' },
  'settings.hint.general': {
    en: 'Voice / model changes need a refresh · scroll to zoom · double-click to reset',
    zh: '语音和模型的改动刷新后生效 · 滚轮缩放 · 双击复位',
  },
  'settings.live2d': { en: 'Live2D model', zh: 'Live2D 模型' },
  'settings.gaze': { en: 'Gaze follow', zh: '视线跟随' },
  'settings.affect': { en: 'Mood memory', zh: '情绪记忆' },
  'settings.livePeak': { en: 'Living expressions', zh: '鲜活表情' },
  'settings.shortClips': { en: 'Brief performances', zh: '小段表演' },
  'settings.idleActions': { en: 'Idle gestures', zh: '闲时小动作' },
  'settings.listening': { en: 'Attentive listening', zh: '专注倾听' },
  'settings.speechPerf': { en: 'Speaking performance', zh: '说话时的表演' },
  'settings.idle': { en: 'Idle animation', zh: '待机动画' },
  'settings.costume': { en: 'Costume', zh: '装扮' },
  'settings.costumeHint': {
    en: 'Yours to set — her expressions never put these on or take them off',
    zh: '由你来定——她换表情时不会自己加上或去掉这些',
  },
  'settings.workbench': { en: '🎛 Live2D workbench', zh: '🎛 Live2D 工作台' },
  'settings.serverEmpty': { en: 'No server settings yet — Luna is still connecting.', zh: '还没有服务器设置——Luna 还在连接。' },
  'settings.language': { en: 'Language · 语言', zh: 'Language · 语言' },
  'settings.languageLater': { en: 'Takes effect when Luna reopens', zh: '重新打开后生效' },
  'settings.setupWizard': { en: 'Setup wizard', zh: '配置向导' },
  'settings.rerun': { en: 'Re-run…', zh: '重新运行…' },
  'settings.restart': { en: 'restart', zh: '需重启' },
  'settings.restartHint': { en: 'Takes effect after Luna restarts', zh: '重启 Luna 后生效' },
  'settings.reset': { en: 'Reset to default', zh: '恢复默认' },

  // ── the settings page ──
  'settings.health.checking': { en: 'Voice service: checking…', zh: '声音服务：检查中…' },
  'settings.health.ready': { en: 'Voice service: running ✓', zh: '声音服务：在跑 ✓' },
  'settings.health.starting': { en: 'Voice service: starting…', zh: '声音服务：正在启动…' },
  'settings.health.down': { en: 'Voice service: not running', zh: '声音服务：没有在跑' },
  'settings.behaviourNote': {
    en: 'Her proactive behaviour (when she reaches out, how often) still lives in the config file — moving it here is a later version.',
    zh: '她的主动行为（什么时候来找你、多久说一次）暂时还住在配置文件里——之后的版本会把它搬到这里。',
  },

  // ── persona ──
  'persona.intro': {
    en: 'Fixed is the ground you set — she cannot change it. Evolving is what she grew herself — yours to read, not to edit here.',
    zh: 'Fixed 是你定的底色，她改不了；Evolving 是她自己长出来的，你能看，但不能在这里改。',
  },
  'persona.preview': { en: 'Preview diff', zh: '预览改动' },
  'persona.save': { en: 'Save fixed core', zh: '保存 Fixed 部分' },
  'persona.evolving': { en: 'Evolving — her own', zh: 'Evolving —— 她自己长的' },
  'persona.noChange': { en: 'Nothing changed.', zh: '没有改动。' },
  'persona.empty': { en: "Can't save it empty.", zh: '不能存成空的。' },
  'persona.saving': { en: 'Saving…', zh: '保存中…' },
  'persona.saved': { en: 'Saved. She carries it the next time she speaks.', zh: '已保存。她下次开口就会用上。' },
  'persona.saveFailed': { en: 'Save failed — is her backend running?', zh: '保存失败——她的后端没有在跑？' },
  'persona.nothingYet': { en: '(Nothing written yet.)', zh: '（她还没写下什么。）' },
  'persona.unreachable': { en: "Can't reach it right now — her backend isn't running.", zh: '现在取不到——她的后端没有在跑。' },

  // ── modules ──
  'modules.browserOnly': { en: 'Modules are edited in the desktop app — in a browser this is read-only.', zh: '模块配置在桌面端编辑——浏览器里只能看。' },
  'modules.probe': { en: 'Probe', zh: '探测' },
  'modules.save': { en: 'Save', zh: '保存' },
  'modules.restartLuna': { en: 'Restart Luna', zh: '重启 Luna' },
  'modules.probing': { en: 'Probing…', zh: '探测中…' },
  'modules.ok': { en: 'Works ✓', zh: '可用 ✓' },
  'modules.failed': { en: 'Failed', zh: '失败' },
  'modules.noChange': { en: 'Nothing changed.', zh: '没有改动。' },
  'modules.saveFailed': { en: 'Save failed', zh: '保存失败' },
  'modules.saved': { en: 'Saved — takes effect after a restart.', zh: '已保存——重启后生效。' },
  'modules.afterRestart': { en: 'Takes effect after Luna restarts.', zh: '重启 Luna 后生效。' },
  'modules.notSet': { en: 'not set', zh: '未配置' },

  // ── the diary book ──
  'diary.face.diary': { en: 'Diary', zh: '日记' },
  'diary.face.dream': { en: 'Dream', zh: '梦' },
  'diary.page': { en: 'Page {n} of {total}', zh: '第 {n} / {total} 页' },
  'diary.monthCount': { en: '{month} this month · {total} diaries in all', zh: '本月 {month} 篇 · 共 {total} 篇日记' },
  'diary.unreachable': { en: "Can't reach her diary right now — her backend isn't running.", zh: '现在取不到她的日记——她的后端没有在跑。' },
  'diary.empty': { en: "This book is still empty — she hasn't written her first page.", zh: '这本还是空的——她还没写下第一篇。' },

  // ── the skills page ──
  'skills.neverUsed': { en: 'never used', zh: '还没用过' },
  'skills.used': { en: 'used {n}× · {when}', zh: '用过 {n} 次 · {when}' },
  'skills.retiredAt': { en: 'retired · {when}', zh: '已退役 · {when}' },
  'skills.retiredHead': { en: 'Retired', zh: '退役' },
  'skills.unreachable': { en: "Can't reach her skills right now — her backend isn't running.", zh: '现在取不到她的技能——她的后端没有在跑。' },
  'skills.empty': { en: "She hasn't built up any skills of her own yet.", zh: '她还没攒下自己的技能。' },

  // ── relative time ──
  'time.justNow': { en: 'just now', zh: '刚刚' },
  'time.min': { en: '{n} min ago', zh: '{n} 分钟前' },
  'time.hr': { en: '{n} hr ago', zh: '{n} 小时前' },
  'time.days': { en: '{n} days ago', zh: '{n} 天前' },

  // ── the player card ──
  'player.prev': { en: 'Previous', zh: '上一首' },
  'player.toggle': { en: 'Play / pause', zh: '播放 / 暂停' },
  'player.next': { en: 'Next', zh: '下一首' },

  // ── the chips the controller writes ──
  'chip.done': { en: 'done', zh: '完成' },
  'chip.failed': { en: 'Failed: {msg}', zh: '失败：{msg}' },
  'chip.dreaming': { en: '🌙 dreaming', zh: '🌙 在做梦' },
  'chip.dreamingAt': { en: '🌙 dreaming · {step}', zh: '🌙 在做梦 · {step}' },
  'chip.dreamIdle': { en: '🌙 done dreaming — still asleep', zh: '🌙 梦做完了，还睡着' },
  'chip.awake': { en: '☀️ awake', zh: '☀️ 醒了' },
  'chip.quietMoment': { en: '(a quiet moment)', zh: '（安静了一会儿）' },

  // ── the boot gate (non-lobby boots only) ──
  'boot.title': { en: 'Luna is waking up…', zh: 'Luna 正在醒来…' },
  'boot.sub': { en: 'First launch loads the voice model, one moment…', zh: '第一次启动要加载语音模型，稍等一下…' },
  'boot.skip': { en: 'Skip · enter muted', zh: '跳过 · 静音进入' },
  'boot.elapsed': { en: 'elapsed {n}s', zh: '已等 {n} 秒' },
  'boot.idle': { en: 'Preparing voice…', zh: '准备语音…' },
  'boot.starting': { en: 'Starting the voice engine…', zh: '正在启动语音引擎…' },
  'boot.restarting': { en: 'Voice engine restarting…', zh: '语音引擎重启中…' },
  'boot.loading': { en: 'Loading the voice model…', zh: '正在加载语音模型…' },
  'boot.ready': { en: 'Voice ready ✓', zh: '语音就绪 ✓' },
  'boot.unavailable': { en: 'No voice service detected, entering…', zh: '没检测到语音服务，直接进入…' },
  'boot.failed': { en: 'Voice failed to load, entering muted', zh: '语音加载失败，静音进入' },

  // ── the showcase replay's director (demo-only DOM; the app never shows these) ──
  'demo.scene': { en: 'Scene {n}/{total} · {title}', zh: '第 {n}/{total} 幕 · {title}' },
  'demo.next': { en: 'Next scene →', zh: '下一幕 →' },
  'demo.replay': { en: 'Replay ↻', zh: '重看 ↻' },
  'demo.map': { en: 'Engineering map →', zh: '工程图谱 →' },
  'demo.switchLang': { en: '中文', zh: 'English' },
  'demo.playApp': { en: 'NetEase Cloud Music', zh: '网易云音乐' },
  'demo.playHint': { en: 'Click the icon', zh: '点一下图标' },
  'demo.noAudio': {
    en: 'Copyright: the replay cannot play the real track — imagine it playing.',
    zh: '涉及版权问题，这里无法播放真实音频，请自行脑补。',
  },
  'demo.recommended': { en: 'Recommended', zh: '推荐' },
  'demo.openFileHint': { en: 'Open the file', zh: '打开这个文件' },
  'demo.readOriginal': { en: 'Read the full paper on arXiv ↗', zh: '在 arXiv 上读全文 ↗' },
  'demo.backToLuna': { en: 'Back to Luna →', zh: '回到 Luna →' },
  // v0.50.0: the engineering notes after each scene.
  'demo.codeNotes': { en: "Click this to view what's going on in code", zh: '点这里，看看代码里发生了什么' },
  'demo.notesEyebrow': { en: 'Scene {n} · {title} · in the code', zh: '第 {n} 幕 · {title} · 幕后代码' },
  'demo.notesHint': { en: 'click the sheet to turn it', zh: '点一下纸，翻到下一张' },
  'demo.notesNext': { en: 'Next sheet', zh: '下一张' },
  'demo.notesPrev': { en: 'Previous sheet', zh: '上一张' },
  'demo.notesClose': { en: 'Close the notes', zh: '合上笔记' },
  'demo.notesCont': { en: '(cont.)', zh: '（续）' },
  'demo.innerVoice': { en: '💭 inner voice', zh: '💭 内心 OS' },
  'demo.personaNote': {
    en: "Her persona file lives on the owner's machine — the replay doesn't carry it. In the app, this is where he edits the fixed core and reads what she has grown.",
    zh: '她的人格文件在主人的机器上，回放里不带。在 app 里，主人就在这一栏改 Fixed 底色、看她自己长出来的 Evolving。',
  },

  // ── desktop-only chrome ──
  'reconfigure.label': { en: '⚙ Setup', zh: '⚙ 重新配置' },
  'reconfigure.title': { en: 'Open the setup wizard (fix keys, model, voice)', zh: '打开配置向导（改 key、模型、语音）' },
  'pack.failed': { en: 'Voice install failed', zh: '音色安装失败' },
  'pack.swapped': { en: '✓ Voice swapped', zh: '✓ 音色已切换' },
  'pack.pending': { en: 'Installed — applies when the voice runtime is ready', zh: '已安装——语音服务就绪后自动应用' },
  'pack.manual': { en: 'Installed — restart your voice server', zh: '已安装——请手动重启你的语音服务' },
  'pack.notPack': { en: 'Not a voice pack', zh: '不是音色包' },
  'pack.ambiguous': { en: 'Ambiguous pack — install it from the setup wizard', zh: '候选不止一个——请到配置向导里安装' },
  'pack.confirm': { en: 'Swap voice to “{name}”?', zh: '换成音色包「{name}」？' },
  'pack.apply': { en: 'Apply', zh: '应用' },
  'pack.installing': { en: 'Installing…', zh: '安装中…' },
  'pack.cancel': { en: 'Cancel', zh: '取消' },
} as const satisfies Record<string, Bilingual>;

export type CopyKey = keyof typeof UI_COPY;

export function copyTable(): Readonly<Record<CopyKey, Bilingual>> {
  return UI_COPY;
}

export function t(key: CopyKey, vars?: Record<string, string | number>, lang: UiLang = current): string {
  let s: string = UI_COPY[key][lang];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
