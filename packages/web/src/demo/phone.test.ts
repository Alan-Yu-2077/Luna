import { describe, expect, test } from 'bun:test';
import { looksLikePhone, type DeviceProbe } from './phone';

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
