import type { ExpressionKey } from '@luna/protocol';
import { uiLang, type Bilingual, type UiLang } from './uiCopy';

// The mood pip's affect → emoji + short label (the 15 ExpressionKeys). v0.48.0: the label in both
// interface languages; the emoji is the same face in either.
export const MOOD: Record<ExpressionKey, { emoji: string; label: Bilingual }> = {
  curious_attention: { emoji: '👀', label: { en: 'Curious', zh: '好奇' } },
  gentle_concern: { emoji: '🥺', label: { en: 'Concerned', zh: '担心' } },
  open_reengagement: { emoji: '🙂', label: { en: 'Receptive', zh: '热络' } },
  playful_brightness: { emoji: '😜', label: { en: 'Playful', zh: '调皮' } },
  focused_engagement: { emoji: '🧐', label: { en: 'Focused', zh: '专注' } },
  steady_presence: { emoji: '😌', label: { en: 'Calm', zh: '平静' } },
  soft_warmth: { emoji: '🥰', label: { en: 'Tender', zh: '温柔' } },
  listening_attention: { emoji: '👂', label: { en: 'Listening', zh: '在听' } },
  alert_surprise: { emoji: '😮', label: { en: 'Surprised', zh: '惊讶' } },
  bright_delight: { emoji: '✨', label: { en: 'Delighted', zh: '高兴' } },
  amused_smirk: { emoji: '😏', label: { en: 'Amused', zh: '被逗乐' } },
  shy_softness: { emoji: '😳', label: { en: 'Shy', zh: '害羞' } },
  awkward_lightness: { emoji: '😅', label: { en: 'Awkward', zh: '尴尬' } },
  guarded_distance: { emoji: '😐', label: { en: 'Guarded', zh: '有点防备' } },
  annoyed_resistance: { emoji: '😤', label: { en: 'Annoyed', zh: '有点烦' } },
};

export function moodOf(key: ExpressionKey, lang: UiLang = uiLang()): { emoji: string; label: string } {
  const m = MOOD[key];
  return { emoji: m.emoji, label: m.label[lang] };
}
