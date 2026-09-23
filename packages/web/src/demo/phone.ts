// v0.49.2 — is this a phone? The replay is laid out for a desk (the chat panel beside a half-length
// portrait, the notes after each scene); since v0.50.1 a phone is simply asked to open it on a computer.
// A tablet is not a phone: an iPad reports desktop Safari and a short side of 768+, and the layout holds.

export type DeviceProbe = {
  userAgent: string;
  mobileHint: boolean | null; // navigator.userAgentData.mobile, where the browser has it
  coarsePointer: boolean; // (pointer: coarse)
  noHover: boolean; // (hover: none)
  shortSide: number; // min(screen.width, screen.height), CSS px
};

export const PHONE_SHORT_SIDE = 600;

export function looksLikePhone(p: DeviceProbe): boolean {
  if (p.mobileHint === true) return true;
  if (/iPhone|iPod|Android.+Mobile|Windows Phone/i.test(p.userAgent)) return true;
  return p.coarsePointer && p.noHover && p.shortSide < PHONE_SHORT_SIDE;
}

export function probeDevice(win: Window): DeviceProbe {
  const uaData: unknown = Reflect.get(win.navigator, 'userAgentData');
  const mobile: unknown = typeof uaData === 'object' && uaData !== null ? Reflect.get(uaData, 'mobile') : null;
  return {
    userAgent: win.navigator.userAgent,
    mobileHint: typeof mobile === 'boolean' ? mobile : null,
    coarsePointer: win.matchMedia('(pointer: coarse)').matches,
    noHover: win.matchMedia('(hover: none)').matches,
    shortSide: Math.min(win.screen.width, win.screen.height),
  };
}
