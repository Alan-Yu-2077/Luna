// v0.49.2 — is this a phone? The replay is laid out for a desk (the chat panel beside a half-length
// portrait), so a phone is asked to turn sideways and told a computer is the best seat. A tablet is not
// a phone: an iPad reports desktop Safari and a short side of 768+, and the layout holds there.

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

// iOS gives a page neither fullscreen nor an orientation lock; what it can be told is where the
// rotation lock lives.
export function looksLikeIos(userAgent: string): boolean {
  return /iPhone|iPod|iPad/i.test(userAgent);
}

// WeChat's in-app browser (where a link shared in a chat opens) rotates only if its own setting allows.
export function looksLikeWeChat(userAgent: string): boolean {
  return /MicroMessenger/i.test(userAgent);
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

// v0.49.2 (owner): a phone held sideways gets the desk layout itself, laid out at a desk's size and scaled
// down to fit — smaller and harder on the eyes, but the same composition — rather than a reflowed
// small-screen layout. The layout height is fixed; the width follows the screen's shape. Upright, the
// page keeps the device width (the rotate gate is up anyway).
export const LANDSCAPE_LAYOUT_HEIGHT = 640;
const MIN_LAYOUT_WIDTH = 960;
const DEVICE_WIDTH = 'width=device-width, initial-scale=1';

export function landscapeLayoutWidth(innerWidth: number, innerHeight: number): number | null {
  if (innerWidth <= 0 || innerHeight <= 0 || innerHeight >= innerWidth) return null;
  return Math.max(MIN_LAYOUT_WIDTH, Math.ceil((LANDSCAPE_LAYOUT_HEIGHT * innerWidth) / innerHeight));
}

// The meta tag says the scale outright: a browser does not re-fit the page when the tag changes after
// load, so `width=` alone leaves a phone looking at the layout's top-left corner at 1:1.
export function landscapeViewportContent(visibleWidth: number, visibleHeight: number): string {
  const width = landscapeLayoutWidth(visibleWidth, visibleHeight);
  if (width === null) return DEVICE_WIDTH;
  const scale = (visibleWidth / width).toFixed(4);
  return `width=${width}, initial-scale=${scale}, minimum-scale=${scale}`;
}

// The load-time fit is demo/bridge.js's (it must run before the first layout). This handles the phone
// being TURNED after load: it re-states the viewport for the new orientation and, if the browser does
// not re-fit the page to it, reloads — the tab's language choice survives, and a phone is usually turned
// at the rotate gate, before anything has played. Only a flip counts; a toolbar sliding in is a resize,
// not a turn. "What the screen shows" is the visual viewport times its zoom, the same before and after
// our own change.
export function mountPhoneViewport(doc: Document, win: Window): () => void {
  const tag = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!tag) return () => {};
  const shown = (): { w: number; h: number } => {
    const vv = win.visualViewport;
    return vv ? { w: vv.width * vv.scale, h: vv.height * vv.scale } : { w: win.innerWidth, h: win.innerHeight };
  };
  const fitted = (layoutWidth: number | null): boolean => {
    const vv = win.visualViewport;
    if (!vv) return true;
    if (layoutWidth === null) return Math.abs(vv.scale - 1) < 0.02;
    return win.innerWidth === layoutWidth && Math.abs(vv.width - layoutWidth) < 2;
  };
  let sideways = shown().w > shown().h;
  const onTurn = (): void => {
    const now = shown();
    if (now.w > now.h === sideways) return;
    sideways = now.w > now.h;
    const w = Math.round(now.w);
    const h = Math.round(now.h);
    tag.setAttribute('content', landscapeViewportContent(w, h));
    const layoutWidth = landscapeLayoutWidth(w, h);
    win.setTimeout(() => {
      if (!fitted(layoutWidth)) win.location.reload();
    }, 400);
  };
  win.addEventListener('resize', onTurn);
  win.addEventListener('orientationchange', onTurn);
  return () => {
    win.removeEventListener('resize', onTurn);
    win.removeEventListener('orientationchange', onTurn);
  };
}

