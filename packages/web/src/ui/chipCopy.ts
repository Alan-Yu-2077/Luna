import { quietNoteZh } from '@luna/protocol';
import type { ControllerCopy } from '../controller';
import { stepNoun, translateStep } from './dreamWords';
import { t, uiLang, type UiLang } from './uiCopy';

// v0.48.0 — the words around the server's text on the controller's chips, in the interface
// language. The dream chips now read as the diary book does ("Looked back over 31 moments.")
// instead of the raw `rate_salience → ok · rated 31 turns`; the quiet note is re-read part by part
// from the shared table in @luna/protocol. What stays verbatim: a tool's own finish summary.
export function controllerCopy(lang: UiLang = uiLang()): ControllerCopy {
  return {
    done: t('chip.done', undefined, lang),
    failed: (message) => t('chip.failed', { msg: message }, lang),
    dreaming: (step) => {
      if (step === 'finished_idle') return t('chip.dreamIdle', undefined, lang);
      if (!step) return t('chip.dreaming', undefined, lang);
      return t('chip.dreamingAt', { step: stepNoun(step, lang) }, lang);
    },
    awake: t('chip.awake', undefined, lang),
    dreamStep: (s) => `🌙 ${translateStep(s, lang)}`,
    quietNote: (note) => `🍃 ${lang === 'zh' ? quietNoteZh(note) : note}`,
    quietMoment: t('chip.quietMoment', undefined, lang),
  };
}
