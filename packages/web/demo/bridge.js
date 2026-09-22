// The two bridges demo.html sets before app.ts runs (a plain script, so the bundler leaves the
// globals exactly where app.ts expects them). Relative URLs: the page is served from a sub-path.
window.lunaConfig = { modelUrl: './models/yumi/yumi.model3.json', ttsBackend: 'http' };
window.lunaDemo = { base: './demo/' };
