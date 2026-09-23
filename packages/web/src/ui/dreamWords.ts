import type { DreamStep } from '@luna/protocol';
import { uiLang, type Bilingual, type UiLang } from './uiCopy';

// v0.48.0 — the dream translation layer, lifted out of the diary book so the live chips and the
// dream overlay speak the same sentences the book does (they showed raw `rate_salience → ok · …`).
// The input is the server's fixed English grammar (dream/cycle.ts), parsed — never rewritten on the
// wire. The book renders "what she did that night": actions and counts only, never feelings —
// anything more would be writing her diary for her. A step or detail this table has never met
// renders RAW rather than vanishing, so a new dream stage shows up as itself.

export type StepLike = Pick<DreamStep, 'step' | 'status' | 'detail'> & { ms?: number };

const NOUN: Record<string, Bilingual> = {
  rate_salience: { en: 'looking back', zh: '回看' },
  refine_semantic: { en: 'sorting what she knows', zh: '整理记住的事' },
  refine_layer1: { en: 'folding the day away', zh: '折叠对话' },
  memory_audit: { en: 'checking her memory', zh: '检查记忆' },
  persona_update: { en: 'thinking about herself', zh: '想想自己' },
  run_diaries: { en: 'writing the diary', zh: '写日记' },
  distill_skills: { en: 'distilling skills', zh: '沉淀技能' },
  rag_refresh: { en: 'refreshing her recall', zh: '更新回忆索引' },
};

export function stepNoun(step: string, lang: UiLang = uiLang()): string {
  return NOUN[step]?.[lang] ?? step;
}

export function isKnownStep(step: string): boolean {
  return step in NOUN;
}

// The skipped outcomes cycle.ts can report, each with the reason said plainly.
const SKIPPED: Record<string, Bilingual> = {
  'nothing to fold': { en: 'Skipped — nothing to fold.', zh: '略过——没什么要折叠的。' },
  'memory consistent': { en: 'Her memory was consistent — nothing to change.', zh: '记忆没有矛盾，不用动。' },
  'persona unchanged': { en: 'Nothing about herself changed.', zh: '对自己的认识没变。' },
  'nothing to distill': { en: 'Nothing worth turning into a skill.', zh: '没有值得沉淀成技能的事。' },
  'nothing to change': { en: 'What she knows still held — nothing to change.', zh: '记住的事都还成立，不用改。' },
  'diaries up to date': { en: 'The diary was already up to date.', zh: '日记已经是最新的。' },
  'all turns rated': { en: 'Every moment was already looked back on.', zh: '每个瞬间都回看过了。' },
  'embedding disabled': { en: 'Recall indexing is off (no embedding).', zh: '回忆索引没开（没有 embedding）。' },
};

const num = (detail: string, pattern: RegExp): string | null => pattern.exec(detail)?.[1] ?? null;

function personaLine(detail: string, lang: UiLang): string {
  const self = detail.includes('self');
  const bond = detail.includes('bond');
  if (self && bond) return lang === 'zh' ? '对自己、对两个人之间，认识都动了动。' : 'Both shifted a little — herself, and the two of them.';
  if (bond) return lang === 'zh' ? '对两个人之间的认识动了动。' : 'Her sense of the two of them shifted a little.';
  return lang === 'zh' ? '对自己的认识动了动。' : 'Her sense of herself shifted a little.';
}

function skillLine(detail: string, lang: UiLang): string {
  const parts: string[] = [];
  for (const m of detail.matchAll(/(new|merge|deprecate):([\w.-]+)/g)) {
    const [, kind, name] = m;
    if (kind === 'new') parts.push(lang === 'zh' ? `学会了一件新事：${name}` : `learned something new: ${name}`);
    else if (kind === 'merge') parts.push(lang === 'zh' ? `把 ${name} 改得更好了` : `refined ${name}`);
    else parts.push(lang === 'zh' ? `让 ${name} 退役了` : `retired ${name}`);
  }
  if (parts.length === 0) return lang === 'zh' ? '沉淀了一项技能。' : 'Distilled a skill.';
  const joined = parts.join(lang === 'zh' ? '；' : '; ');
  return lang === 'zh' ? `${joined}。` : `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

export function translateStep(s: StepLike, lang: UiLang = uiLang()): string {
  const zh = lang === 'zh';
  if (s.status === 'failed') return zh ? `${stepNoun(s.step, lang)}没做成。` : `${cap(stepNoun(s.step, lang))} didn't go through.`;
  if (s.status === 'skipped') {
    const known = SKIPPED[s.detail];
    if (known) return known[lang];
    return zh ? `略过了${stepNoun(s.step, lang)}。` : `Skipped ${stepNoun(s.step, lang)}.`;
  }
  switch (s.step) {
    case 'rate_salience': {
      const n = num(s.detail, /rated (\d+)/);
      if (zh) return n ? `回看了 ${n} 个瞬间。` : '回看了这段日子。';
      return n ? `Looked back over ${n} moments.` : 'Looked back over the day.';
    }
    case 'refine_semantic': {
      const removed = num(s.detail, /removed (\d+)/);
      const added = num(s.detail, /added (\d+)/);
      if (removed !== null && added !== null) {
        return zh ? `放下了 ${removed} 件事，记住了 ${added} 件。` : `Let go of ${removed}, kept ${added}.`;
      }
      return zh ? '整理了心里的事。' : 'Sorted what she knows.';
    }
    case 'memory_audit': {
      const removed = num(s.detail, /removed (\d+)/);
      const added = num(s.detail, /added (\d+)/);
      if (removed !== null && added !== null) {
        return zh ? `整理了记忆的抽屉（−${removed} / +${added}）。` : `Tidied the memory drawer (−${removed} / +${added}).`;
      }
      return zh ? '整理了记忆的抽屉。' : 'Tidied the memory drawer.';
    }
    case 'refine_layer1':
      return zh ? '把散着的对话折叠归档了。' : 'Folded the loose conversation away.';
    case 'persona_update':
      return personaLine(s.detail, lang);
    case 'run_diaries': {
      const n = num(s.detail, /(\d+) diar/);
      if (zh) return n ? `写下了 ${n} 篇日记。` : '写了日记。';
      if (!n) return 'Wrote in the diary.';
      return n === '1' ? 'Wrote 1 diary entry.' : `Wrote ${n} diary entries.`;
    }
    case 'distill_skills':
      return skillLine(s.detail, lang);
    case 'rag_refresh':
      return zh ? '翻新了回忆的书签。' : 'Refreshed the bookmarks on her memories.';
    default:
      return `${s.step}: ${s.detail || s.status}`;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const DREAM_BROKE: Bilingual = { en: 'This dream broke off.', zh: '这个梦断掉了。' };
