// v0.37.3 (Initiative 27): drop a voice pack onto the RUNNING app — scan → one-tap confirm chip →
// install → the managed voice hot-swaps. Changing her voice must not require re-entering setup.
// Desktop-only (needs the lunaSetup scan/install bridges); ambiguous packs (multiple candidate
// weights) are routed to the wizard where the full picker lives.

import { t, uiLang, type UiLang } from './uiCopy';

export type PackScan = { gpt: string[]; sovits: string[]; refWavs: string[]; transcripts: string[] };
export type PackPicks = { gptCkpt: string; sovitsPth: string; referenceWav: string; transcriptTxt?: string };

// Single-candidate packs auto-pick (the bilibili pack shape); anything ambiguous → null (use the wizard).
export function autoPicksFrom(scan: PackScan): PackPicks | null {
  if (scan.gpt.length !== 1 || scan.sovits.length !== 1 || scan.refWavs.length !== 1) return null;
  return {
    gptCkpt: scan.gpt[0]!,
    sovitsPth: scan.sovits[0]!,
    referenceWav: scan.refWavs[0]!,
    ...(scan.transcripts.length > 0 ? { transcriptTxt: scan.transcripts[0]! } : {}),
  };
}

// v0.48.0: one language at a time (it used to print both side by side).
export function swapResultText(r: Record<string, unknown>, lang: UiLang = uiLang()): string {
  if (r['ok'] !== true) return typeof r['error'] === 'string' ? r['error'] : t('pack.failed', undefined, lang);
  if (r['managed'] === true && r['ready'] === true) return t('pack.swapped', undefined, lang);
  if (r['managed'] === true) return t('pack.pending', undefined, lang);
  return t('pack.manual', undefined, lang);
}

export type PackDropBridge = {
  scanVoicePack(file: File): Promise<Record<string, unknown>>;
  installVoicePack(args: Record<string, string>): Promise<Record<string, unknown>>;
};

export function mountPackDrop(doc: Document, bridge: PackDropBridge): () => void {
  let chip: HTMLElement | null = null;
  const dismiss = (): void => {
    chip?.remove();
    chip = null;
  };
  const show = (build: (el: HTMLElement) => void): void => {
    dismiss();
    chip = doc.createElement('div');
    chip.className = 'pack-drop-chip';
    build(chip);
    doc.body.appendChild(chip);
  };
  const flash = (text: string): void => {
    show((el) => {
      el.textContent = text;
    });
    setTimeout(dismiss, 3200);
  };

  const onDragOver = (ev: DragEvent): void => {
    if (ev.dataTransfer?.types.includes('Files')) ev.preventDefault();
  };
  const onDrop = (ev: DragEvent): void => {
    const file = ev.dataTransfer?.files.item(0);
    if (!file) return;
    ev.preventDefault();
    void bridge.scanVoicePack(file).then((r) => {
      if (r['ok'] !== true || typeof r['root'] !== 'string') {
        flash(typeof r['error'] === 'string' ? r['error'] : t('pack.notPack'));
        return;
      }
      const root = r['root'];
      const scan = r['scan'] as PackScan | undefined;
      const picks = scan ? autoPicksFrom(scan) : null;
      if (!picks) {
        flash(t('pack.ambiguous'));
        return;
      }
      const preview = typeof r['transcriptPreview'] === 'string' ? r['transcriptPreview'] : '';
      show((el) => {
        const label = doc.createElement('span');
        label.textContent = t('pack.confirm', { name: root.split('/').pop() ?? root });
        const apply = doc.createElement('button');
        apply.type = 'button';
        apply.textContent = t('pack.apply');
        apply.addEventListener('click', () => {
          apply.disabled = true;
          label.textContent = t('pack.installing');
          void bridge
            .installVoicePack({
              root,
              gptCkpt: picks.gptCkpt,
              sovitsPth: picks.sovitsPth,
              referenceWav: picks.referenceWav,
              ...(picks.transcriptTxt ? { transcriptTxt: picks.transcriptTxt } : {}),
              promptText: preview,
              promptLang: 'en',
              textLang: 'auto',
            })
            .then((res) => flash(swapResultText(res)));
        });
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.textContent = t('pack.cancel');
        cancel.addEventListener('click', dismiss);
        el.append(label, apply, cancel);
      });
    });
  };

  doc.addEventListener('dragover', onDragOver);
  doc.addEventListener('drop', onDrop);
  return () => {
    doc.removeEventListener('dragover', onDragOver);
    doc.removeEventListener('drop', onDrop);
    dismiss();
  };
}
