import type { Setting } from '@luna/protocol';
import { t, uiLang, type UiLang } from './uiCopy';

// v0.27.1: the server-driven half of the settings panel. The server's registry is the single
// authority (labels, kinds, validation, restart badges) — this renders whatever arrives and
// reports edits back; it never hardcodes a switch. Rebuilt wholesale per settings.state (the
// list is small); an in-flight rejection is healed by the state the server sends back with it.

export type SettingsSend = (key: string, value: string | null) => void;

// v0.48.0: the registry's label/hint/category arrive in English on the wire, always — the server
// has no language. In a Chinese interface this table re-presents them, keyed by the STABLE setting
// key (a label can be reworded; the key cannot). Enum-like values the owner types (aloof /
// balanced / clingy) stay literal inside the hints. A key the table has never met — a setting added
// later — shows the server's English rather than nothing.
const SETTING_ZH: Record<string, { label: string; hint: string }> = {
  'proactive.enabled': { label: '主动消息', hint: '你安静下来的时候，她可能会自己来找你' },
  'proactive.quiet_hours': { label: '安静时段', hint: '她保持安静的本地小时，用逗号隔开' },
  'proactive.activeness': { label: '主动程度', hint: '她主动开口有多积极：aloof、balanced 或 clingy（仍受安全护栏限制）' },
  'selfcont.enabled': { label: '追加想法', hint: '回复之后，她可能再补一句' },
  'selfcont.probability': { label: '追加的概率', hint: '0 = 从不，1 = 总是' },
  'time.aware': { label: '时间感知', hint: '她知道现在几点、几号，也知道你离开了多久' },
  'weather.ambient': { label: '天气感知', hint: '真实的天气会影响她的心情和闲聊' },
  'weather.lat_lon': { label: '位置（纬度,经度）', hint: '她查天气用的位置，例如 "40.71,-74.01"' },
  'time.zone': { label: '时区', hint: 'IANA 时区，比如 Asia/Shanghai；留空 = 跟随系统' },
  'web.search': { label: '联网搜索', hint: '她可以上网搜索（需要搜索 API key）' },
  'web.fetch': { label: '读网页', hint: '她可以打开并阅读网址' },
  'skills.enabled': { label: '技能库', hint: '她会保存并复用学到的做法（save_skill / recall_skill + 技能架）' },
  'skills.dream_distill': { label: '梦里提炼技能', hint: '她的梦会把一天里重要的事提炼成可复用的技能（有审计，可撤销）' },
  'weather.tool': { label: '查天气', hint: '她可以随时查天气预报' },
  'code.write': { label: '改代码', hint: '她可以编辑工作区里的文件' },
  'shell.enabled': { label: '运行命令', hint: '她可以在工作区里执行命令' },
  'memory.inject': { label: '记忆进上下文', hint: '核心记忆和想起的片段会影响她的回复' },
  'dream.shutdown': { label: '退出时做梦', hint: '关闭前她会先整理记忆（几小时最多一次，不是每次关都做）' },
  'model.id': { label: '模型', hint: '她思考用的大模型；留空 = 内置默认' },
};

// Categories by the server's English name — a new setting in an existing group lands under the
// translated heading even before its own row has a translation.
const CATEGORY_ZH: Record<string, string> = {
  Companion: '陪伴',
  Perception: '感知',
  Abilities: '能力',
  Memory: '记忆',
  Model: '模型',
};

export function settingText(s: Setting, lang: UiLang = uiLang()): { label: string; hint: string } {
  if (lang !== 'zh') return { label: s.label, hint: s.hint };
  return SETTING_ZH[s.key] ?? { label: s.label, hint: s.hint };
}

export function categoryText(category: string, lang: UiLang = uiLang()): string {
  return lang === 'zh' ? (CATEGORY_ZH[category] ?? category) : category;
}

export function translatedSettingKeys(): string[] {
  return Object.keys(SETTING_ZH);
}

export function groupByCategory(settings: Setting[]): Array<[string, Setting[]]> {
  const groups: Array<[string, Setting[]]> = [];
  for (const s of settings) {
    const g = groups.find(([name]) => name === s.category);
    if (g) g[1].push(s);
    else groups.push([s.category, [s]]);
  }
  return groups;
}

// v0.36.4: the value chip beside a slider. Snap the raw string to a tidy number (fall back to the
// raw string if it isn't numeric) so a dragged 3.5000001 reads "3.5".
export function formatSliderValue(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 100) / 100);
}

function controlFor(doc: Document, s: Setting, send: SettingsSend): HTMLElement {
  if (s.kind === 'boolean') {
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.className = 'setting-switch'; // v0.36.4: CSS-only iOS switch; the real checkbox stays for a11y
    input.checked = s.value === '1';
    input.addEventListener('change', () => send(s.key, input.checked ? '1' : '0'));
    return input;
  }
  // v0.36.4: a bounded number becomes a slider + live value chip; unbounded numbers + text stay
  // fields. Either way the commit contract (blur/Enter for fields, release for the slider) is intact.
  if (s.kind === 'number' && s.min !== undefined && s.max !== undefined) {
    const wrap = doc.createElement('span');
    wrap.className = 'setting-slider';
    const range = doc.createElement('input');
    range.type = 'range';
    range.min = String(s.min);
    range.max = String(s.max);
    range.step = 'any';
    range.value = s.value;
    const chip = doc.createElement('span');
    chip.className = 'slider-chip';
    chip.textContent = formatSliderValue(s.value);
    range.addEventListener('input', () => {
      chip.textContent = formatSliderValue(range.value); // live while dragging, no commit
    });
    range.addEventListener('change', () => {
      if (range.value !== s.value) send(s.key, range.value); // commit on release
    });
    wrap.append(range, chip);
    return wrap;
  }
  const input = doc.createElement('input');
  input.className = 'setting-input';
  if (s.kind === 'number') {
    input.type = 'number';
    if (s.min !== undefined) input.min = String(s.min);
    if (s.max !== undefined) input.max = String(s.max);
    input.step = 'any';
  } else {
    input.type = 'text';
  }
  input.value = s.value;
  // commit on blur/Enter, not per keystroke — a half-typed "31.2" must not fire validation
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('blur', () => {
    if (input.value !== s.value) send(s.key, input.value);
  });
  return input;
}

export function renderServerSettings(
  container: HTMLElement,
  settings: Setting[],
  send: SettingsSend,
): void {
  const doc = container.ownerDocument;
  while (container.firstChild) container.removeChild(container.firstChild);
  for (const [category, items] of groupByCategory(settings)) {
    const head = doc.createElement('div');
    head.className = 'settings-section';
    head.textContent = categoryText(category);
    container.appendChild(head);
    for (const s of items) {
      const row = doc.createElement('label');
      row.className = 'setting-row';
      const text = settingText(s);
      row.title = text.hint;
      const name = doc.createElement('span');
      name.textContent = text.label;
      row.appendChild(name);
      if (s.restart_required) {
        const badge = doc.createElement('span');
        badge.className = 'setting-badge';
        badge.textContent = t('settings.restart');
        badge.title = t('settings.restartHint');
        name.appendChild(badge);
      }
      const right = doc.createElement('span');
      right.className = 'setting-control';
      if (s.source === 'user') {
        const reset = doc.createElement('button');
        reset.type = 'button';
        reset.className = 'setting-reset';
        reset.textContent = '↺';
        reset.title = t('settings.reset');
        reset.addEventListener('click', (e) => {
          e.preventDefault(); // inside a <label>: don't also toggle the checkbox
          send(s.key, null);
        });
        right.appendChild(reset);
      }
      right.appendChild(controlFor(doc, s, send));
      row.appendChild(right);
      container.appendChild(row);
    }
  }
}
