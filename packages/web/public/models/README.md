# Live2D models

This directory is where Luna looks for the avatar model. **The app wears no model of its own** — you
bring your own. The one tracked subfolder, `yumi/`, is the showcase avatar: the GitHub Pages replay
(`demo.html`, `bun run build:demo`) is built from this tree in CI and needs it there. The app does
not pick it up unless you point it there (`LUNA_MODEL_URL`, the model picker, or
`localStorage['luna:model-url']`). **`yumi/` is not the author's asset and is not covered by the MIT
license** — see [`LICENSE`](../../../../LICENSE) and
[`THIRD_PARTY_LICENSES`](../../../../THIRD_PARTY_LICENSES); do not reuse or redistribute it.

## Drop-in contract

Place a Live2D model in its own subfolder here:

```
public/models/<name>/<name>.model3.json   ← the manifest the loader points at
                     <name>.moc3           ← the model
                     textures/…            ← texture atlas
                     <name>.physics3.json  ← (optional) physics
                     …
```

The web front end serves everything under `public/models/` at `/models/…`, so a model at
`public/models/hana/hana.model3.json` is reachable as `/models/hana/hana.model3.json`.

## Notes

- This `README.md` is a tracked keeper so the `models/` directory survives even in a checkout without
  `yumi/` — the build copies `public/models/` into `dist/models/`, and git does not preserve empty dirs.
- Where to find free/redistributable models, how to wire one up, and the per-model expression-preset
  caveat are covered in the setup guide.
