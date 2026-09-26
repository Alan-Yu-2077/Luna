import { describe, expect, test } from 'bun:test';
import { ServerEvent } from '@luna/protocol';
import { compileScene, compileScript, dreamCues, estimateSpeechMs, moreInTurn, PACING, readingMs, speakerIn, type Cue } from './compile';
import { DemoScript, type Scene } from './script';

// v0.46.0 — the script compiler. What it pins: every frame is a valid ServerEvent (the wsClient
// gate, applied at compile time), the frames of a turn come in the server's order and shape, a
// waking never opens a turn, the run ends when the VOICE ends (not when the last frame fires), and
// the record a run leaves behind is what `history` would replay.

const scene = (beats: Scene['beats'], id = 's'): Scene => ({ id, title: 'T', beats });

function frames(cues: Cue[]): ServerEvent[] {
  return cues.flatMap((c) => (c.kind === 'frame' ? [c.frame] : []));
}

describe('compileScene — one user beat, one reply', () => {
  const compiled = compileScene(
    scene([
      { kind: 'user', text: 'hi' },
      { kind: 'luna', text: 'hello there', expression: 'soft_warmth', emotion: 0.5 },
    ]),
    () => undefined,
  );

  test('the prelude is empty and there is exactly one turn', () => {
    expect(compiled.prelude.cues).toEqual([]);
    expect(compiled.prelude.endMs).toBe(0);
    expect(compiled.turns.map((t) => t.userText)).toEqual(['hi']);
  });

  test("frames come in the server's order: turn.started, message started/progress/finished, turn.result", () => {
    const fs = frames(compiled.turns[0]!.run.cues);
    expect(fs.map((f) => f.type)).toEqual([
      'turn.started',
      'tool.started',
      'tool.progress',
      'tool.progress',
      'tool.progress',
      'tool.progress',
      'tool.finished',
      'turn.result',
    ]);
    for (const f of fs) expect(ServerEvent.safeParse(f).success).toBe(true);
  });

  test('the deltas concatenate to the text; the delivery carries expression, emotion and is_final', () => {
    const fs = frames(compiled.turns[0]!.run.cues);
    const deltas = fs
      .filter((f): f is Extract<ServerEvent, { type: 'tool.progress' }> => f.type === 'tool.progress')
      .map((f) => (f.payload as { text_delta: string }).text_delta);
    expect(deltas.join('')).toBe('hello there');
    const fin = fs.find((f) => f.type === 'tool.finished');
    expect(fin?.type === 'tool.finished' && fin.result.kind === 'ok' ? fin.result.data : null).toEqual({
      text: 'hello there',
      segments: [],
      is_final: true,
      expression: 'soft_warmth',
      emotion: 0.5,
    });
  });

  test('timing: thinking gap first, streaming at the chunk cadence, then the gap', () => {
    const cues = compiled.turns[0]!.run.cues;
    expect(cues[0]?.at).toBe(0);
    expect(cues[1]?.at).toBe(PACING.thinkMs);
    expect(cues[2]?.at).toBe(PACING.thinkMs + PACING.chunkMs);
    const fin = cues.find((c) => c.kind === 'frame' && c.frame.type === 'tool.finished');
    expect(fin?.at).toBe(PACING.thinkMs + 4 * PACING.chunkMs);
  });

  test('the run ends when the estimated voice ends, which is later than the last frame', () => {
    const run = compiled.turns[0]!.run;
    const finishedAt = PACING.thinkMs + 4 * PACING.chunkMs;
    expect(run.endMs).toBe(finishedAt + estimateSpeechMs('hello there'));
    expect(run.endMs).toBeGreaterThan(run.cues[run.cues.length - 1]!.at);
  });

  test('the record: one turn, user text and her text', () => {
    expect(compiled.turns[0]!.run.turns).toEqual([{ user_text: 'hi', assistant_text: 'hello there' }]);
  });
});

describe('is_final — decided by position unless the script says', () => {
  test('a line followed by a tool or another line is not final; the last one is', () => {
    const beats: Scene['beats'] = [
      { kind: 'user', text: 'u' },
      { kind: 'luna', text: 'one' },
      { kind: 'pause', ms: 100 },
      { kind: 'tool', name: 'recall', summary: 'looked' },
      { kind: 'luna', text: 'two' },
      { kind: 'action', name: 'headLiftAlert' },
    ];
    expect(moreInTurn(beats, 1)).toBe(true);
    expect(moreInTurn(beats, 4)).toBe(false);
    const fs = frames(compileScene(scene(beats), () => undefined).turns[0]!.run.cues);
    const finals = fs.flatMap((f) => {
      if (f.type !== 'tool.finished' || f.result.kind !== 'ok') return [];
      const data = f.result.data;
      if (!data || typeof data !== 'object' || !('is_final' in data)) return []; // the recall chip carries null
      return [(data as { is_final: boolean }).is_final];
    });
    expect(finals).toEqual([false, true]);
  });

  test('a user beat or a waking closes the turn, so the line before it is final', () => {
    const beats: Scene['beats'] = [
      { kind: 'user', text: 'u' },
      { kind: 'luna', text: 'one' },
      { kind: 'proactive', lines: [{ text: 'p' }] },
    ];
    expect(moreInTurn(beats, 1)).toBe(false);
  });

  test('an explicit is_final wins over position', () => {
    const fs = frames(
      compileScene(scene([{ kind: 'user', text: 'u' }, { kind: 'luna', text: 'wait', is_final: false }]), () => undefined)
        .turns[0]!.run.cues,
    );
    const fin = fs.find((f) => f.type === 'tool.finished');
    expect(fin?.type === 'tool.finished' && fin.result.kind === 'ok' ? (fin.result.data as { is_final: boolean }).is_final : null).toBe(false);
  });
});

describe('tools and sources', () => {
  test('a tool beat is a started/finished pair with the summary; its sources ride turn.result', () => {
    const fs = frames(
      compileScene(
        scene([
          { kind: 'user', text: 'u' },
          { kind: 'tool', name: 'web_search', summary: 'searched', ms: 500, sources: [{ url: 'https://x.test/a', title: 'A' }] },
          { kind: 'luna', text: 'found it' },
        ]),
        () => undefined,
      ).turns[0]!.run.cues,
    );
    const started = fs.find((f) => f.type === 'tool.started');
    expect(started?.type === 'tool.started' ? started.tool_name : null).toBe('web_search');
    const finished = fs.find((f) => f.type === 'tool.finished');
    expect(finished?.type === 'tool.finished' && finished.result.kind === 'ok' ? finished.result.summary : null).toBe('searched');
    const result = fs[fs.length - 1];
    expect(result?.type === 'turn.result' ? result.citations : null).toEqual([{ url: 'https://x.test/a', title: 'A' }]);
  });
});

describe('proactive — her own waking', () => {
  const compiled = compileScene(
    scene([
      { kind: 'user', text: 'u' },
      { kind: 'luna', text: 'bye' },
      { kind: 'proactive', delayMs: 1000, lines: [{ text: 'still here', expression: 'steady_presence' }] },
      { kind: 'proactive', delayMs: 500, tools: [{ name: 'remember', summary: 'kept it', ms: 200 }], quiet_note: 'noted' },
    ]),
    () => undefined,
  );
  const fs = frames(compiled.turns[0]!.run.cues);
  const types = fs.map((f) => f.type);

  test('the reactive turn closes (turn.result) BEFORE the waking starts, and a waking never emits turn.started', () => {
    expect(types.indexOf('turn.result')).toBeLessThan(types.indexOf('proactive.started'));
    expect(types.filter((t) => t === 'turn.started')).toHaveLength(1);
    expect(types.filter((t) => t === 'turn.result')).toHaveLength(1);
  });

  test('spoke = lines were given; a quiet one carries its note; ids are 🌱, never 💭', () => {
    const finished = fs.filter((f): f is Extract<ServerEvent, { type: 'proactive.finished' }> => f.type === 'proactive.finished');
    expect(finished.map((f) => f.spoke)).toEqual([true, false]);
    expect(finished[0]?.quiet_note).toBeUndefined();
    expect(finished[1]?.quiet_note).toBe('noted');
    for (const f of finished) expect(f.cycle_id.includes(':cont:')).toBe(false);
  });

  test('the quiet waking runs its tool as a chip pair between started and finished', () => {
    const i = types.lastIndexOf('proactive.started');
    expect(types.slice(i)).toEqual(['proactive.started', 'tool.started', 'tool.finished', 'proactive.finished']);
  });

  test('the record keeps the spoken waking with an empty user text, and not the quiet one', () => {
    expect(compiled.turns[0]!.run.turns).toEqual([
      { user_text: 'u', assistant_text: 'bye' },
      { user_text: '', assistant_text: 'still here' },
    ]);
  });
});

describe('voice durations', () => {
  test('a manifest duration replaces the estimate; two lines play serially', () => {
    const compiled = compileScene(
      scene([
        { kind: 'user', text: 'u' },
        { kind: 'luna', text: 'aaa' },
        { kind: 'luna', text: 'bbb' },
      ]),
      (t) => (t === 'aaa' ? 5000 : t === 'bbb' ? 3000 : undefined),
    );
    const run = compiled.turns[0]!.run;
    const firstFinished = run.cues.find((c) => c.kind === 'frame' && c.frame.type === 'tool.finished')!.at;
    // aaa: starts at its tool.finished, runs 5000; bbb queues behind it for 3000 more.
    expect(run.endMs).toBe(firstFinished + 5000 + 3000);
  });
});

describe('choreography and pauses', () => {
  // v0.51.7: an action waits for her voice to end, then gives her next frame a moment.
  test('action/pulse become sink cues — the action after any speech, the pulse at the current time; a pause only moves the clock', () => {
    const compiled = compileScene(
      scene([
        { kind: 'user', text: 'u' },
        { kind: 'pause', ms: 400 },
        { kind: 'action', name: 'browKnit', intensity: 0.7 },
        { kind: 'pulse', pose: { browLY: 0.06 }, ms: 500 },
      ]),
      () => undefined,
    );
    const cues = compiled.turns[0]!.run.cues;
    expect(cues).toEqual([
      { at: 400, kind: 'sink', call: { kind: 'action', name: 'browKnit', intensity: 0.7 } },
      { at: 400 + PACING.gestureMs, kind: 'sink', call: { kind: 'pulse', pose: { browLY: 0.06 }, ms: 500 } },
    ]);
    expect(compiled.turns[0]!.run.turns).toEqual([]);
  });
});

describe('compileScript', () => {
  test('beats before the first user beat form the prelude; scenes keep their id and title', () => {
    const script = DemoScript.parse({
      version: 1,
      scenes: [
        { id: 'a', title: 'A', beats: [{ kind: 'proactive', lines: [{ text: 'first' }] }, { kind: 'user', text: 'u' }, { kind: 'luna', text: 'l' }] },
        { id: 'b', title: 'B', beats: [{ kind: 'user', text: 'v' }] },
      ],
    });
    const c = compileScript(script);
    expect(c.scenes.map((s) => [s.id, s.title])).toEqual([
      ['a', 'A'],
      ['b', 'B'],
    ]);
    expect(frames(c.scenes[0]!.prelude.cues).map((f) => f.type)).toContain('proactive.started');
    expect(c.scenes[0]!.turns).toHaveLength(1);
    expect(c.scenes[1]!.turns[0]!.run.cues).toEqual([]);
  });

  test('the schema rejects a line without text and a scene id with spaces', () => {
    expect(DemoScript.safeParse({ version: 1, scenes: [{ id: 'has space', title: 'x', beats: [{ kind: 'user', text: 'u' }] }] }).success).toBe(false);
    expect(DemoScript.safeParse({ version: 1, scenes: [{ id: 'ok', title: 'x', beats: [{ kind: 'luna', text: '' }] }] }).success).toBe(false);
  });
});

// ── v0.47.0 — the full show's beats ──────────────────────────────────────────────────────────────

describe('skip — the curtain', () => {
  test('closes the turn, waits for the voice, holds the clock for its stay', () => {
    const compiled = compileScene(
      scene([
        { kind: 'user', text: 'u' },
        { kind: 'luna', text: 'aa' },
        { kind: 'skip', label: 'later', ms: 1000 },
        { kind: 'luna', text: 'bb' },
      ]),
      () => 5000,
    );
    const cues = compiled.turns[0]!.run.cues;
    const stage = cues.find((c) => c.kind === 'stage')!;
    const finishedAt = PACING.thinkMs + PACING.chunkMs; // "aa" = one chunk
    expect(stage.at).toBe(finishedAt + 5000); // not the gap — the voice
    const resultIdx = cues.findIndex((c) => c.kind === 'frame' && c.frame.type === 'turn.result');
    expect(resultIdx).toBeLessThan(cues.indexOf(stage));
    const second = cues.find((c) => c.kind === 'frame' && c.frame.type === 'turn.started' && c.at > 0)!;
    expect(second.at).toBe(stage.at + 1000);
    expect(compiled.turns[0]!.run.turns).toHaveLength(2); // two turns, either side of the curtain
  });

  test('a luna line before a skip is final', () => {
    expect(moreInTurn([{ kind: 'user', text: 'u' }, { kind: 'luna', text: 'a' }, { kind: 'skip', label: 'x' }], 1)).toBe(false);
  });
});

describe('music — the turntable', () => {
  test('a music beat is a stage cue at the current time and moves nothing', () => {
    const compiled = compileScene(
      scene([{ kind: 'user', text: 'u' }, { kind: 'pause', ms: 200 }, { kind: 'music', track: 'hw' }, { kind: 'music', track: null }]),
      () => undefined,
    );
    expect(compiled.turns[0]!.run.cues).toEqual([
      { at: 200, kind: 'stage', stage: { kind: 'music', track: 'hw' } },
      { at: 200, kind: 'stage', stage: { kind: 'music', track: null } },
    ]);
  });
});

// v0.48.3 — his hand on the player: the prompt comes after her last word, and the turn is over.
describe('press_play — the player prompt', () => {
  test('closes the turn, waits for her voice, and leaves the next line to the director', () => {
    const compiled = compileScene(
      scene([
        { kind: 'user', text: 'u' },
        { kind: 'luna', text: 'aa' },
        { kind: 'press_play', track: 'hw', label: 'Open the player' },
        { kind: 'user', text: 'it is on' },
        { kind: 'luna', text: 'bb' },
      ]),
      () => 4000,
    );
    const cues = compiled.turns[0]!.run.cues;
    const stage = cues.find((c) => c.kind === 'stage')!;
    expect(stage.stage).toEqual({ kind: 'press_play', track: 'hw', label: 'Open the player' });
    expect(stage.at).toBe(PACING.thinkMs + PACING.chunkMs + 4000); // after the voice, not under it
    const resultIdx = cues.findIndex((c) => c.kind === 'frame' && c.frame.type === 'turn.result');
    expect(resultIdx).toBeLessThan(cues.indexOf(stage));
    expect(compiled.turns[0]!.run.endMs).toBe(stage.at);
    expect(compiled.turns.map((t) => t.userText)).toEqual(['u', 'it is on']);
    expect(moreInTurn([{ kind: 'luna', text: 'a' }, { kind: 'press_play', track: 'hw', label: 'x' }], 0)).toBe(false);
  });

  test('the schema refuses a prompt for a track the shelf does not have', () => {
    const bad = {
      version: 1,
      music: { tracks: [{ id: 'a', title: 'A', artist: 'B', album: '', duration: 10 }] },
      scenes: [{ id: 'a', title: 'A', beats: [{ kind: 'press_play', track: 'zzz', label: 'x' }] }],
    };
    expect(DemoScript.safeParse(bad).success).toBe(false);
  });
});

// v0.49.0 — speaking before a surface tool, and his hands on the desk.
describe('proactive then_tools and open_file', () => {
  test('a waking that speaks first runs its surface tools after the words — and no line is her last word', () => {
    const compiled = compileScene(
      scene([
        {
          kind: 'proactive',
          delayMs: 0,
          tools: [{ name: 'web_search', summary: '1 result for "q": [1] https://x.test/' }],
          lines: [{ text: 'found it' }],
          then_tools: [{ name: 'shell', summary: 'shell exit 0' }],
        },
      ]),
      () => undefined,
    );
    const frames = compiled.prelude.cues.flatMap((c) => (c.kind === 'frame' ? [c.frame] : []));
    const order = frames.flatMap((f) => (f.type === 'tool.started' ? [f.tool_name] : []));
    expect(order).toEqual(['web_search', 'message', 'shell']);
    const said = frames.find((f) => f.type === 'tool.started' && f.tool_name === 'message');
    expect(said?.type === 'tool.started' ? (said.input as { is_final?: boolean }).is_final : null).toBe(false);
    const done = frames[frames.length - 1];
    expect(done?.type === 'proactive.finished' ? done.spoke : null).toBe(true);
  });

  test('open_file closes the turn after her voice and hands the desk to the director', () => {
    const doc = { title: 'T', authors: ['A'], affiliations: 'X', lead: 'L…', venue: 'V', id: 'arXiv:1', url: 'https://arxiv.org/abs/1' };
    const compiled = compileScene(
      scene([
        { kind: 'user', text: 'u' },
        { kind: 'luna', text: 'aa' },
        { kind: 'open_file', folder: 'From Luna', file: 'p.pdf', label: 'Open it', doc },
        { kind: 'user', text: 'back' },
      ]),
      () => 3000,
    );
    const cues = compiled.turns[0]!.run.cues;
    const stage = cues.find((c) => c.kind === 'stage')!;
    expect(stage.stage).toEqual({ kind: 'open_file', folder: 'From Luna', file: 'p.pdf', label: 'Open it', doc });
    expect(stage.at).toBe(PACING.thinkMs + PACING.chunkMs + 3000);
    expect(compiled.turns.map((t) => t.userText)).toEqual(['u', 'back']);
  });
});

describe('dream — the block and the beat', () => {
  const block = {
    steps: [
      { step: 'rate_salience' as const, status: 'ok' as const, detail: 'rated 31 turns', ms: 400 },
      { step: 'refine_layer1' as const, status: 'skipped' as const, detail: '', ms: 0 },
      { step: 'distill_skills' as const, status: 'ok' as const, detail: 'new:late-night-brevity', ms: 300 },
    ],
  };

  test('dreamCues: status on entry naming the first node, a step per node, finished_idle STILL dreaming, then a hold for Wake', () => {
    const { cues, endMs } = dreamCues(block, 100);
    const fs = frames(cues);
    expect(fs.map((f) => f.type)).toEqual(['dream.status', 'dream.step', 'dream.step', 'dream.step', 'dream.status']);
    const first = fs[0]!;
    const last = fs[fs.length - 1]!;
    expect(first.type === 'dream.status' ? [first.is_dreaming, first.current_step] : null).toEqual([true, 'rate_salience']);
    // ws.ts/cycle.ts end a cycle with is_dreaming: true + finished_idle; only dream.wake clears it.
    expect(last.type === 'dream.status' ? [last.is_dreaming, last.current_step] : null).toEqual([true, 'finished_idle']);
    expect(cues[cues.length - 1]).toEqual({ at: endMs, kind: 'stage', stage: { kind: 'await', what: 'wake' } });
    expect(cues[1]!.at).toBe(100 + PACING.dreamLeadMs);
    expect(endMs).toBe(100 + PACING.dreamLeadMs + (400 + 250) + (0 + 250) + (300 + 250));
  });

  test('a dream beat closes the turn first and the run ends after the wake', () => {
    const compiled = compileScene(
      scene([{ kind: 'user', text: 'night' }, { kind: 'luna', text: 'sleep well' }, { kind: 'dream' }]),
      () => 800,
      block,
    );
    const cues = compiled.turns[0]!.run.cues;
    const fs = frames(cues).map((f) => f.type);
    expect(fs.indexOf('turn.result')).toBeLessThan(fs.indexOf('dream.status'));
    expect(fs.slice(-5)).toEqual(['dream.status', 'dream.step', 'dream.step', 'dream.step', 'dream.status']);
    expect(cues[cues.length - 1]!.kind).toBe('stage'); // the hold for Wake is the run's last cue
    expect(compiled.turns[0]!.run.endMs).toBeGreaterThanOrEqual(cues[cues.length - 1]!.at);
  });

  test('a dream beat without a block is refused by the schema, and by the compiler', () => {
    const bad = { version: 1, scenes: [{ id: 'a', title: 'A', beats: [{ kind: 'user', text: 'u' }, { kind: 'dream' }] }] };
    expect(DemoScript.safeParse(bad).success).toBe(false);
    expect(() => compileScene(scene([{ kind: 'user', text: 'u' }, { kind: 'dream' }]), () => undefined)).toThrow(/dream block/);
  });

  test('compileScript carries the menu-door run only when the block exists', () => {
    const withDream = DemoScript.parse({ version: 1, dream: block, scenes: [{ id: 'a', title: 'A', beats: [{ kind: 'user', text: 'u' }] }] });
    expect(compileScript(withDream).dream?.cues.map((c) => (c.kind === 'frame' ? c.frame.type : c.kind))).toEqual([
      'dream.status',
      'dream.step',
      'dream.step',
      'dream.step',
      'dream.status',
      'stage',
    ]);
    const without = DemoScript.parse({ version: 1, scenes: [{ id: 'a', title: 'A', beats: [{ kind: 'user', text: 'u' }] }] });
    expect(compileScript(without).dream).toBeNull();
  });
});

describe('the 💭 second thought and tool notes', () => {
  test('continuation marks the cycle the way continuation.ts does', () => {
    const fs = frames(
      compileScene(scene([{ kind: 'user', text: 'u' }, { kind: 'proactive', delayMs: 0, continuation: true, lines: [{ text: 'oh, also' }] }]), () => undefined)
        .turns[0]!.run.cues,
    );
    const started = fs.find((f) => f.type === 'proactive.started');
    expect(started?.type === 'proactive.started' ? started.cycle_id.includes(':cont:') : null).toBe(true);
  });

  test('a tool note is a progress frame between started and finished', () => {
    const fs = frames(
      compileScene(scene([{ kind: 'user', text: 'u' }, { kind: 'tool', name: 'web_fetch', summary: 'read it', ms: 900, note: '正在读这一页…' }]), () => undefined)
        .turns[0]!.run.cues,
    );
    expect(fs.map((f) => f.type)).toEqual(['turn.started', 'tool.started', 'tool.progress', 'tool.finished', 'turn.result']);
    const note = fs[2];
    expect(note?.type === 'tool.progress' ? note.payload : null).toEqual({ note: '正在读这一页…' });
  });

  test('the schema refuses a music beat naming a track the block does not have', () => {
    const bad = {
      version: 1,
      music: { tracks: [{ id: 'a', title: 'A', artist: 'B', album: '', duration: 10 }] },
      scenes: [{ id: 'a', title: 'A', beats: [{ kind: 'music', track: 'zzz' }] }],
    };
    expect(DemoScript.safeParse(bad).success).toBe(false);
  });
});

test('speakerIn tells his lines from hers (whole lines or excerpts) — the notes draw quotes as bubbles', () => {
  const compiled = compileScript(
    DemoScript.parse({
      version: 1,
      scenes: [
        {
          id: 's',
          title: 'S',
          beats: [
            { kind: 'user', text: 'Did you sleep well?' },
            { kind: 'luna', text: 'I dream, which is a different thing.' },
          ],
        },
      ],
    }),
  );
  const scene = compiled.scenes[0];
  expect(speakerIn(scene, 'Did you sleep well?')).toBe('user');
  expect(speakerIn(scene, 'a different thing')).toBe('luna');
  expect(speakerIn(scene, 'not in the scene')).toBeNull();
});

test('the curtain call: clear first, then an inner-voice card after her last word, left up to be read', () => {
  const inner = 'A thought she keeps to the card.';
  const compiled = compileScript(
    DemoScript.parse({
      version: 1,
      scenes: [
        {
          id: 'c',
          title: 'C',
          beats: [
            { kind: 'clear' },
            { kind: 'proactive', delayMs: 100, lines: [{ text: 'One.' }] },
            { kind: 'inner', text: inner },
            { kind: 'proactive', delayMs: 100, lines: [{ text: 'Two.' }] },
          ],
        },
      ],
    }),
    () => 1000,
  );
  const cues = compiled.scenes[0]?.prelude.cues ?? [];
  const stages = cues.filter((c) => c.kind === 'stage');
  expect(stages.map((c) => (c.kind === 'stage' ? c.stage.kind : ''))).toEqual(['clear', 'inner']);
  const lastOneFrame = Math.max(...cues.filter((c) => c.kind === 'frame' && c.frame.type === 'tool.finished').map((c) => c.at).slice(0, 1));
  const innerAt = stages[1]?.at ?? 0;
  expect(innerAt).toBeGreaterThanOrEqual(lastOneFrame + 1000); // after "One." has been spoken
  const secondWake = cues.filter((c) => c.kind === 'frame' && c.frame.type === 'proactive.started')[1];
  expect((secondWake?.at ?? 0) - innerAt).toBeGreaterThanOrEqual(readingMs(inner));
  expect(readingMs('短')).toBe(3500);
});
