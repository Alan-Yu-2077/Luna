// The two bridges demo.html sets before app.ts runs (a plain script, so the bundler leaves the
// globals exactly where app.ts expects them). Relative URLs: the page is served from a sub-path.
window.lunaConfig = { modelUrl: './models/yumi/yumi.model3.json', ttsBackend: 'http' };
window.lunaDemo = {
  base: './demo/',
  // How she is framed when the page opens: a half-body portrait. `zoom` multiplies the full-body
  // height-fit (1 = the whole figure), `top` is the headroom above her head as a fraction of the
  // stage height. Wheel-zoom and drag still work on top; double-click returns to this.
  portrait: { zoom: 1.7, top: 0.12 },
};

// v0.49.2 (owner): a phone held sideways is shown the desk layout itself — laid out at a desk's size and
// scaled down to fit, smaller but the same composition. Set HERE, before the first layout, because a
// browser applies a viewport's scale at load but not always when the tag changes later (turning the
// phone after load is src/demo/phone.ts's job). Mirrors looksLikePhone + landscapeViewportContent in
// src/demo/phone.ts; phone.test.ts runs this file and holds the two to the same answer.
(function fitPhoneViewport() {
  var ua = navigator.userAgent;
  var hint = !!(navigator.userAgentData && navigator.userAgentData.mobile === true);
  var touchOnly = matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches;
  var phone = hint || /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(ua) || (touchOnly && Math.min(screen.width, screen.height) < 600);
  var w = innerWidth;
  var h = innerHeight;
  if (!phone || !(w > 0 && h > 0 && w > h)) return;
  var width = Math.max(960, Math.ceil((640 * w) / h));
  var scale = (w / width).toFixed(4);
  var meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute('content', 'width=' + width + ', initial-scale=' + scale + ', minimum-scale=' + scale);
})();
