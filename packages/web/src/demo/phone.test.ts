import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANDSCAPE_LAYOUT_HEIGHT, landscapeLayoutWidth, landscapeViewportContent, looksLikeIos, looksLikePhone, looksLikeWeChat, type DeviceProbe } from './phone';

const desktop: DeviceProbe = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  mobileHint: false,
  coarsePointer: false,
  noHover: false,
  shortSide: 900,
};

describe('looksLikePhone', () => {
  test('a desktop browser is not a phone', () => {
    expect(looksLikePhone(desktop)).toBe(false);
  });

  test('an iPhone is a phone by its user agent', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    expect(looksLikePhone({ ...desktop, userAgent: ua, mobileHint: null, coarsePointer: true, noHover: true, shortSide: 390 })).toBe(true);
  });

  test('an Android phone is a phone; an Android tablet (no "Mobile") is not', () => {
    const phone = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
    const tablet = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
    expect(looksLikePhone({ ...desktop, userAgent: phone, mobileHint: null })).toBe(true);
    expect(looksLikePhone({ ...desktop, userAgent: tablet, mobileHint: false, coarsePointer: true, noHover: true, shortSide: 800 })).toBe(false);
  });

  test('Client Hints saying mobile wins over a desktop-looking user agent', () => {
    expect(looksLikePhone({ ...desktop, mobileHint: true })).toBe(true);
  });

  test('an iPad posing as desktop Safari is not a phone (touch, but a wide short side)', () => {
    expect(looksLikePhone({ ...desktop, mobileHint: null, coarsePointer: true, noHover: true, shortSide: 820 })).toBe(false);
  });

  test('an unknown touch-only device with a narrow screen is treated as a phone', () => {
    expect(looksLikePhone({ ...desktop, userAgent: 'SomeBrowser/1.0', mobileHint: null, coarsePointer: true, noHover: true, shortSide: 412 })).toBe(true);
  });

  test('a touch laptop (fine pointer available, hover) is not a phone', () => {
    expect(looksLikePhone({ ...desktop, coarsePointer: true, noHover: false, shortSide: 400 })).toBe(false);
  });
});

test('looksLikeIos names iPhone and iPad user agents only', () => {
  expect(looksLikeIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
  expect(looksLikeIos('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
  expect(looksLikeIos(desktop.userAgent)).toBe(false);
});

test('looksLikeWeChat names the WeChat in-app browser only', () => {
  expect(looksLikeWeChat('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 MicroMessenger/8.0.50(0x18003237) NetType/WIFI Language/zh_CN')).toBe(true);
  expect(looksLikeWeChat(desktop.userAgent)).toBe(false);
});

describe('landscapeLayoutWidth — the desk layout, scaled down to a phone held sideways', () => {
  test('upright (or square) keeps the device width', () => {
    expect(landscapeLayoutWidth(390, 844)).toBeNull();
    expect(landscapeLayoutWidth(500, 500)).toBeNull();
    expect(landscapeLayoutWidth(0, 0)).toBeNull();
  });

  test('sideways lays out at the fixed height, the width following the screen shape', () => {
    const w = landscapeLayoutWidth(667, 330);
    expect(w).toBe(Math.ceil((LANDSCAPE_LAYOUT_HEIGHT * 667) / 330));
    expect(w).toBeGreaterThan(1200);
  });

  test('re-reading after the rescale lands on the same width (no feedback loop)', () => {
    const w = landscapeLayoutWidth(740, 360)!;
    const scaledHeight = (360 * w) / 740;
    expect(landscapeLayoutWidth(w, scaledHeight)).toBe(w);
  });

  test('a squat landscape never goes below a desk-sized width', () => {
    expect(landscapeLayoutWidth(900, 800)).toBe(960);
  });
});

test('landscapeViewportContent states the width AND the scale that fits it; upright is device width', () => {
  expect(landscapeViewportContent(390, 844)).toBe('width=device-width, initial-scale=1');
  const content = landscapeViewportContent(667, 330);
  const width = landscapeLayoutWidth(667, 330)!;
  expect(content).toBe(`width=${width}, initial-scale=${(667 / width).toFixed(4)}, minimum-scale=${(667 / width).toFixed(4)}`);
});

// demo/bridge.js fits the viewport before the first layout (plain JS, outside the bundle). Run it against
// a stubbed page and hold its answer to phone.ts's, so the two cannot drift.
describe('demo/bridge.js fits a sideways phone exactly as phone.ts would', () => {
  const src = readFileSync(join(import.meta.dir, '..', '..', 'demo', 'bridge.js'), 'utf8');
  type Page = { ua: string; mobile: boolean | null; coarse: boolean; w: number; h: number; short: number };
  const run = (p: Page): string => {
    let content = 'width=device-width, initial-scale=1';
    const meta = { setAttribute: (_k: string, v: string) => { content = v; } };
    const run = new Function('window', 'navigator', 'screen', 'matchMedia', 'innerWidth', 'innerHeight', 'document', src);
    run(
      {},
      { userAgent: p.ua, userAgentData: p.mobile === null ? undefined : { mobile: p.mobile } },
      { width: p.short, height: Math.max(p.w, p.h) },
      (q: string) => ({ matches: p.coarse && (q.includes('coarse') || q.includes('hover: none')) }),
      p.w,
      p.h,
      { querySelector: () => meta },
    );
    return content;
  };
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148';
  const cases: Page[] = [
    { ua: iphone, mobile: null, coarse: true, w: 667, h: 330, short: 375 },
    { ua: iphone, mobile: null, coarse: true, w: 844, h: 340, short: 390 },
    { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile', mobile: true, coarse: true, w: 740, h: 360, short: 360 },
  ];
  for (const c of cases) {
    test(`${c.w}×${c.h} sideways → ${landscapeViewportContent(c.w, c.h)}`, () => {
      expect(run(c)).toBe(landscapeViewportContent(c.w, c.h));
    });
  }
  test('upright, or not a phone, leaves the tag alone', () => {
    expect(run({ ...cases[0]!, w: 375, h: 667 })).toBe('width=device-width, initial-scale=1');
    expect(run({ ua: desktop.userAgent, mobile: false, coarse: false, w: 1280, h: 800, short: 800 })).toBe('width=device-width, initial-scale=1');
  });
});
