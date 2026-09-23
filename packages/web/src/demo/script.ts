import { z } from 'zod';
import { Citation, DreamStepStatus, ExpressionKey, Setting, ToolName } from '@luna/protocol';

// v0.46.0 — the showcase SCRIPT: what the owner writes. It is authored as beats (what happens in
// the room), never as wire frames; `compile.ts` turns each beat into the exact ServerEvent frames
// the real socket would have carried. A script that could compile to a frame the real `wsClient`
// would reject cannot exist — the compiler validates every frame against the protocol.
//
// v0.47.0 — the full show: time skips (a curtain the compiler advances its clock under), the
// turntable (a `music` block the card reads through its own /api/music/* routes), the dream (a
// `dream` block with the cycle's REAL node names, playable from the menu or from a beat), the 💭
// second thought, and tool progress notes.

export const LunaLine = z.object({
  text: z.string().min(1),
  expression: ExpressionKey.optional(),
  emotion: z.number().min(0).max(1).optional(),
  // Omitted = decided by position: the last line before the turn closes is final.
  is_final: z.boolean().optional(),
});
export type LunaLine = z.infer<typeof LunaLine>;

export const ToolCall = z.object({
  name: ToolName,
  summary: z.string().min(1),
  ms: z.number().int().nonnegative().optional(),
  // A mid-call progress line (`tool.progress { note }`), the way web_fetch says 正在读这一页….
  note: z.string().optional(),
  // web_search / web_fetch sources — ride the turn's `turn.result` as citations, so the source
  // chips appear the way v0.18.2 draws them.
  sources: z.array(Citation).optional(),
});
export type ToolCall = z.infer<typeof ToolCall>;

const SLUG = /^[a-z0-9-]+$/;

// The dream cycle's nodes, in the order `dream/cycle.ts` runs them. Pinned here so a script can
// only name a step the real dream has — the diary book translates exactly these.
export const DREAM_ORDER = [
  'rate_salience',
  'refine_semantic',
  'refine_layer1',
  'memory_audit',
  'persona_update',
  'run_diaries',
  'distill_skills',
  'rag_refresh',
] as const;
export const DreamNodeName = z.enum(DREAM_ORDER);
export type DreamNodeName = z.infer<typeof DreamNodeName>;

export const DreamStepDef = z.object({
  step: DreamNodeName,
  status: DreamStepStatus,
  detail: z.string(),
  ms: z.number().int().nonnegative(),
});
export type DreamStepDef = z.infer<typeof DreamStepDef>;
export const DreamBlock = z.object({ steps: z.array(DreamStepDef).min(1) });
export type DreamBlock = z.infer<typeof DreamBlock>;

export const TrackDef = z.object({
  id: z.string().regex(SLUG),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string(),
  duration: z.number().positive(), // seconds
  // A generated cover under demo/music/<cover>.svg — never real album art.
  cover: z.string().regex(SLUG).optional(),
  affinity: z
    .object({
      sessions: z.number().int().nonnegative(),
      listenedSeconds: z.number().nonnegative(),
      rank: z.number().int().positive().nullable(),
    })
    .optional(),
});
export type TrackDef = z.infer<typeof TrackDef>;
export const MusicBlock = z.object({ tracks: z.array(TrackDef).min(1) });
export type MusicBlock = z.infer<typeof MusicBlock>;

export const Beat = z.discriminatedUnion('kind', [
  // Pre-typed into the real input; the visitor presses Send. Everything up to the next user beat
  // plays after that press.
  z.object({ kind: z.literal('user'), text: z.string().min(1) }),
  LunaLine.extend({ kind: z.literal('luna') }),
  ToolCall.extend({ kind: z.literal('tool') }),
  // Her own waking: lines = she spoke (🌱); no lines = a quiet one (a 🍃 leaf when quiet_note is set,
  // the soft chip otherwise). Tools run first either way, as chips. `continuation` = a 💭 second
  // thought (the cycle id carries `:cont:`, exactly how continuation.ts marks it).
  z.object({
    kind: z.literal('proactive'),
    delayMs: z.number().int().nonnegative().optional(),
    lines: z.array(LunaLine).optional(),
    tools: z.array(ToolCall).optional(),
    // v0.49.0: tools she runs AFTER speaking. A `surface` tool (shell, edit…) is refused in a waking
    // until she has spoken — the real gate (proactive/safetyGate.ts) — so it can only come here.
    then_tools: z.array(ToolCall).optional(),
    quiet_note: z.string().optional(),
    continuation: z.boolean().optional(),
  }),
  // Direct choreography on the Live2D sink, the same calls `wakeSequence.ts` makes.
  z.object({
    kind: z.literal('action'),
    name: z.string().min(1),
    intensity: z.number().min(0).max(1).optional(),
  }),
  z.object({ kind: z.literal('pulse'), pose: z.record(z.number()), ms: z.number().int().positive() }),
  z.object({ kind: z.literal('pause'), ms: z.number().int().nonnegative() }),
  // Time passes: the curtain (a director device — the app has no such thing), under which the
  // compiler's clock simply moves on. Never inside a turn.
  z.object({ kind: z.literal('skip'), label: z.string().min(1), ms: z.number().int().positive().optional() }),
  // The turntable: what is playing now (a track id from the music block), or nothing.
  z.object({ kind: z.literal('music'), track: z.string().regex(SLUG).nullable() }),
  // v0.48.3: HIS hand on the player. She never starts his music — he does, in his own player, and
  // she hears it. The director dims the room like the time curtain and asks the visitor to do it;
  // the track starts on the click, and the next line waits for it. Never inside a turn.
  z.object({ kind: z.literal('press_play'), track: z.string().regex(SLUG), label: z.string().min(1) }),
  // v0.49.0: HIS hands again — back at his desk, he opens the folder she left and the file in it.
  // The director draws the desktop, the folder window and the document's first page; the next line
  // waits until he closes it. `doc` is what the first page shows (the facts on a title page).
  z.object({
    kind: z.literal('open_file'),
    folder: z.string().min(1),
    file: z.string().min(1),
    label: z.string().min(1),
    doc: z.object({
      title: z.string().min(1),
      authors: z.array(z.string().min(1)).min(1),
      affiliations: z.string().min(1),
      lead: z.string().min(1),
      venue: z.string().min(1),
      id: z.string().min(1),
      url: z.string().url(),
    }),
  }),
  // She dreams, in the chat: the script's dream block plays here (after the turn closes).
  z.object({ kind: z.literal('dream') }),
]);
export type Beat = z.infer<typeof Beat>;
export type OpenFileBeat = Extract<Beat, { kind: 'open_file' }>;

export const Scene = z.object({
  id: z.string().regex(SLUG),
  title: z.string().min(1),
  beats: z.array(Beat).min(1),
});
export type Scene = z.infer<typeof Scene>;

export const DemoScript = z
  .object({
    version: z.literal(1),
    scenes: z.array(Scene).min(1),
    music: MusicBlock.optional(),
    dream: DreamBlock.optional(),
  })
  .superRefine((script, ctx) => {
    const tracks = new Set((script.music?.tracks ?? []).map((t) => t.id));
    script.scenes.forEach((scene, si) => {
      scene.beats.forEach((beat, bi) => {
        const named = beat.kind === 'music' || beat.kind === 'press_play' ? beat.track : null;
        if (named !== null && !tracks.has(named)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', si, 'beats', bi, 'track'],
            message: `unknown track "${named}" — not in music.tracks`,
          });
        }
        if (beat.kind === 'dream' && !script.dream) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scenes', si, 'beats', bi],
            message: 'a dream beat needs the script-level dream block',
          });
        }
      });
    });
  });
export type DemoScript = z.infer<typeof DemoScript>;

// One pre-rendered utterance. `text` is the key: the browser looks a line up by its exact text, so
// an edited line has no voice until it is rendered again — silence, never a mismatched voice.
export const VoiceLine = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  file: z.string().min(1),
  durationMs: z.number().nonnegative(),
});
export type VoiceLine = z.infer<typeof VoiceLine>;

export const VoiceManifest = z.object({ lines: z.array(VoiceLine) });
export type VoiceManifest = z.infer<typeof VoiceManifest>;

// The settings.state snapshot the tape sends on connect (the server's registry, frozen).
export const DemoSettings = z.array(Setting);

// Every line the voice must carry, in script order, deduplicated by text.
export function spokenLines(script: DemoScript): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (text: string): void => {
    if (seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  for (const scene of script.scenes) {
    for (const beat of scene.beats) {
      if (beat.kind === 'luna') add(beat.text);
      if (beat.kind === 'proactive') for (const line of beat.lines ?? []) add(line.text);
    }
  }
  return out;
}
