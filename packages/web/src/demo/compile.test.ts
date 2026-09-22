import { describe, expect, test } from 'bun:test';
import { ServerEvent } from '@luna/protocol';
import { compileScene, compileScript, estimateSpeechMs, moreInTurn, PACING, type Cue } from './compile';
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
  test('action/pulse become sink cues at the current time; a pause only moves the clock', () => {
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
      { at: 400, kind: 'sink', call: { kind: 'pulse', pose: { browLY: 0.06 }, ms: 500 } },
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
