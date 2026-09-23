import { SoulData } from '@luna/protocol';
import { t } from './uiCopy';

// v0.44.6 — the persona editor. Two halves with a hard wall between them: the FIXED core is the
// owner's to write (loaded from /api/data/soul, saved through the audited updateFixedCore — and
// her own self-edit tool can never touch it, a firewall that lives in the tool layer, not here);
// the EVOLVING half is hers, shown read-only — the owner reads what she has grown, he does not
// prune it here (the workspace's reseed remains the advanced exit).

// A minimal line diff for the save preview: enough to see what a save would change, cheap enough
// to run on every keystroke pause. Not an LCS — unchanged/removed/added per line-set membership,
// in document order, which is the honest view for prose-sized texts.
export type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string };

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const newSet = new Set(newLines);
  const oldSet = new Set(oldLines);
  const out: DiffLine[] = [];
  for (const l of oldLines) out.push({ kind: newSet.has(l) ? 'same' : 'removed', text: l });
  for (const l of newLines) if (!oldSet.has(l)) out.push({ kind: 'added', text: l });
  return out;
}

export function hasChanges(diff: DiffLine[]): boolean {
  return diff.some((d) => d.kind !== 'same');
}

export function mountPersonaSection(doc: Document, fetchFn: typeof fetch = fetch): HTMLElement {
  const host = doc.createElement('div');
  host.className = 'persona-section';

  const intro = doc.createElement('p');
  intro.className = 'settings-page-note';
  intro.textContent = t('persona.intro');
  host.appendChild(intro);

  let savedFixed = '';

  const editor = doc.createElement('textarea');
  editor.className = 'persona-editor';
  editor.rows = 14;
  editor.disabled = true;

  const diffView = doc.createElement('div');
  diffView.className = 'persona-diff';
  diffView.hidden = true;

  const foot = doc.createElement('div');
  foot.className = 'module-foot';
  const verdict = doc.createElement('span');
  verdict.className = 'module-verdict';
  const previewBtn = doc.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'module-btn';
  previewBtn.textContent = t('persona.preview');
  const saveBtn = doc.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'module-btn primary';
  saveBtn.textContent = t('persona.save');
  foot.append(previewBtn, saveBtn, verdict);

  const evolvingHead = doc.createElement('h4');
  evolvingHead.textContent = t('persona.evolving');
  const evolving = doc.createElement('pre');
  evolving.className = 'persona-evolving';
  evolving.textContent = '…';

  const renderDiff = (): void => {
    const diff = diffLines(savedFixed, editor.value);
    diffView.replaceChildren();
    for (const line of diff) {
      const p = doc.createElement('p');
      p.className = `diff-${line.kind}`;
      p.textContent = (line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  ') + line.text;
      diffView.appendChild(p);
    }
    diffView.hidden = false;
    verdict.textContent = hasChanges(diff) ? '' : t('persona.noChange');
  };
  previewBtn.addEventListener('click', renderDiff);

  saveBtn.addEventListener('click', () => {
    const text = editor.value;
    // The empty-write refusal is doubled: here, and again server-side — blanking her core must
    // never be one fat-finger away.
    if (text.trim() === '') {
      verdict.textContent = t('persona.empty');
      verdict.dataset['state'] = 'bad';
      return;
    }
    if (!hasChanges(diffLines(savedFixed, text))) {
      verdict.textContent = t('persona.noChange');
      verdict.dataset['state'] = 'bad';
      return;
    }
    renderDiff(); // the preview is part of the save, not an optional courtesy
    verdict.textContent = t('persona.saving');
    verdict.dataset['state'] = 'busy';
    void fetchFn('/api/data/soul/fixed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fixed: text }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('save failed');
        const soul = SoulData.parse(await r.json());
        savedFixed = soul.fixed_text;
        verdict.textContent = t('persona.saved');
        verdict.dataset['state'] = 'ok';
        diffView.hidden = true;
      })
      .catch(() => {
        verdict.textContent = t('persona.saveFailed');
        verdict.dataset['state'] = 'bad';
      });
  });

  host.append(editor, diffView, foot, evolvingHead, evolving);

  void fetchFn('/api/data/soul')
    .then(async (r) => {
      if (!r.ok) throw new Error('unreachable');
      const soul = SoulData.parse(await r.json());
      savedFixed = soul.fixed_text;
      editor.value = soul.fixed_text;
      editor.disabled = false;
      const parts: string[] = [];
      if (soul.evolving_self.trim() !== '') parts.push(`— self —\n${soul.evolving_self}`);
      if (soul.evolving_bond.trim() !== '') parts.push(`— bond —\n${soul.evolving_bond}`);
      evolving.textContent = parts.length > 0 ? parts.join('\n\n') : t('persona.nothingYet');
    })
    .catch(() => {
      editor.value = '';
      evolving.textContent = t('persona.unreachable');
    });

  return host;
}
