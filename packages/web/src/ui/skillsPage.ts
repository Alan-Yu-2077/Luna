import { DataSkills, type SkillRecord } from '@luna/protocol';
import { t, uiLang, type UiLang } from './uiCopy';

// v0.44.4 — the skills page. The star of this page is not the body (that is an operating manual she
// wrote for herself) but the GROWTH RECORD: what she learned, how often it gets used, when last —
// and above all WHICH ones she taught herself. Read-only: her skills are managed by the dream's
// distillation and the owner panel; this page only looks.

export type SkillGroups = { active: SkillRecord[]; retired: SkillRecord[] };

// Alive ones first, most-recently-used leading; the retired fold to the bottom by retirement date.
export function groupSkills(skills: SkillRecord[]): SkillGroups {
  const active = skills.filter((s) => s.deprecated_ms === 0).sort((a, b) => b.last_used_ms - a.last_used_ms);
  const retired = skills.filter((s) => s.deprecated_ms > 0).sort((a, b) => b.deprecated_ms - a.deprecated_ms);
  return { active, retired };
}

// The interesting distinction (M9): 'saved' and 'dream' are HERS — self-taught, whether saved
// mid-conversation or distilled by a night's consolidation. Everything else was installed.
export function selfTaught(source: string): boolean {
  return source === 'saved' || source === 'dream';
}

export function relativeTime(ms: number, now: number, lang: UiLang = uiLang()): string {
  if (ms <= 0) return t('skills.neverUsed', undefined, lang);
  const diff = Math.max(0, now - ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('time.justNow', undefined, lang);
  if (minutes < 60) return t('time.min', { n: minutes }, lang);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hr', { n: hours }, lang);
  return t('time.days', { n: Math.floor(hours / 24) }, lang);
}

// v0.46.0: one-argument fetch shape (see diaryBook.ts) — the showcase injects a static one.
type FetchLike = (url: string) => Promise<Response>;

export function mountSkillsPage(doc: Document, fetchFn: FetchLike = (u) => fetch(u)): HTMLElement {
  const page = doc.createElement('div');
  page.className = 'skills-page';

  void fetchFn('/api/data/skills')
    .then(async (res) => {
      if (!res.ok) throw new Error('unreachable');
      const { skills } = DataSkills.parse(await res.json());
      assemble(doc, page, groupSkills(skills));
    })
    .catch(() => {
      const err = doc.createElement('p');
      err.className = 'skills-empty';
      err.textContent = t('skills.unreachable');
      page.appendChild(err);
    });
  return page;
}

function assemble(doc: Document, page: HTMLElement, groups: SkillGroups): void {
  if (groups.active.length === 0 && groups.retired.length === 0) {
    const empty = doc.createElement('p');
    empty.className = 'skills-empty';
    empty.textContent = t('skills.empty');
    page.appendChild(empty);
    return;
  }

  let openCard: HTMLElement | null = null;
  const card = (s: SkillRecord, retired: boolean): HTMLElement => {
    const el = doc.createElement('article');
    el.className = `skill-card${selfTaught(s.source) ? ' self-taught' : ''}${retired ? ' retired' : ''}`;
    const head = doc.createElement('button');
    head.type = 'button';
    head.className = 'skill-head';
    const name = doc.createElement('span');
    name.className = 'skill-name';
    name.textContent = selfTaught(s.source) ? `✦ ${s.name}` : s.name;
    const desc = doc.createElement('span');
    desc.className = 'skill-desc';
    desc.textContent = s.description;
    const meta = doc.createElement('span');
    meta.className = 'skill-meta';
    meta.textContent = retired
      ? t('skills.retiredAt', { when: relativeTime(s.deprecated_ms, Date.now()) })
      : t('skills.used', { n: s.used_count, when: relativeTime(s.last_used_ms, Date.now()) });
    head.append(name, desc, meta);
    const body = doc.createElement('pre');
    body.className = 'skill-body';
    body.textContent = s.body;
    body.hidden = true;
    // One card open at a time — the page is a shelf, not an accordion orchestra.
    head.addEventListener('click', () => {
      const opening = body.hidden;
      if (openCard && openCard !== el) {
        openCard.querySelector('.skill-body')?.setAttribute('hidden', '');
        openCard.classList.remove('open');
      }
      body.hidden = !opening;
      el.classList.toggle('open', opening);
      openCard = opening ? el : null;
    });
    el.append(head, body);
    return el;
  };

  for (const s of groups.active) page.appendChild(card(s, false));
  if (groups.retired.length > 0) {
    const h = doc.createElement('h3');
    h.className = 'skills-retired-head';
    h.textContent = t('skills.retiredHead');
    page.appendChild(h);
    for (const s of groups.retired) page.appendChild(card(s, true));
  }
}
