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
