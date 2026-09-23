import { describe, expect, test } from 'bun:test';
import type { Setting } from '@luna/protocol';
import { join } from 'node:path';
import { DemoSettings } from '../demo/script';
import { categoryText, formatSliderValue, groupByCategory, settingText, translatedSettingKeys } from './settingsView';

function s(key: string, category: string): Setting {
  return {
    key,
    label: key,
    hint: '',
    category,
    kind: 'boolean',
    value: '1',
    source: 'default',
    restart_required: false,
  };
}

describe('settingsView grouping', () => {
  test('groups preserve server order for categories AND items', () => {
    const grouped = groupByCategory([
      s('a', 'Companion'),
      s('b', 'Perception'),
      s('c', 'Companion'),
      s('d', 'Model'),
    ]);
    expect(grouped.map(([name]) => name)).toEqual(['Companion', 'Perception', 'Model']);
    expect(grouped[0]?.[1].map((x) => x.key)).toEqual(['a', 'c']);
  });

  test('empty input renders no groups', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe('formatSliderValue (v0.36.4 slider chip)', () => {
  test('passes a clean integer through', () => {
    expect(formatSliderValue('7')).toBe('7');
  });
  test('rounds a long fractional drag to 2 dp', () => {
    expect(formatSliderValue('3.500001')).toBe('3.5');
    expect(formatSliderValue('0.6666666')).toBe('0.67');
  });
  test('non-numeric text falls through unchanged', () => {
    expect(formatSliderValue('auto')).toBe('auto');
  });
});

// v0.48.0: the registry speaks English on the wire; a Chinese interface re-presents it by key.
describe('settings in the interface language', () => {
  test('a known key reads in Chinese, the English interface keeps the server text, an unknown key falls back', () => {
    const known: Setting = { ...s('proactive.activeness', 'Companion'), label: 'Outreach intensity', hint: 'How eagerly…' };
    expect(settingText(known, 'zh').label).toBe('主动程度');
    expect(settingText(known, 'zh').hint).toContain('balanced'); // the enum stays literal
    expect(settingText(known, 'en').label).toBe('Outreach intensity');
    const unknown: Setting = { ...s('brand.new', 'Companion'), label: 'Brand new' };
    expect(settingText(unknown, 'zh').label).toBe('Brand new');
    expect(categoryText('Companion', 'zh')).toBe('陪伴');
    expect(categoryText('Someday', 'zh')).toBe('Someday');
  });

  test('every setting the replay ships (a snapshot of the real registry) has its Chinese row', async () => {
    const file = join(import.meta.dir, '..', '..', 'demo', 'data', 'settings.json');
    const settings = DemoSettings.parse(await Bun.file(file).json());
    const have = new Set(translatedSettingKeys());
    expect(settings.map((x) => x.key).filter((k) => !have.has(k))).toEqual([]);
  });
});
