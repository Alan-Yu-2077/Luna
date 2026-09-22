import { describe, expect, test } from 'bun:test';
import type { ServerEvent, Setting } from '@luna/protocol';
import { compileScript, type Compiled, type SinkCall, type StageCue } from './compile';
import { DemoScript } from './script';
import { createTapeClient, type Scheduler, type TapeClient } from './tapeClient';

// v0.46.0 — the tape player behind the socket's surface. Pinned on a fake clock: what connect
// sends (the server's open sequence), that Send only counts when a beat is armed, that frames fire
// at their offsets and the scene hands over at the run's end, that settings round-trip like ws.ts
// does, and that a ← Menu / Talk pause resumes without replaying or dropping a frame.
// v0.47.0 — the dream door, stage cues, and the scene picker's jump.

function fakeScheduler(): Scheduler & { advance: (ms: number) => void } {
  let now = 0;
  let seq = 0;
  const q: Array<{ id: number; due: number; fn: () => void }> = [];
  return {
    set: (fn, ms) => {
      const id = ++seq;
      q.push({ id, due: now + ms, fn });
      return id;
    },
    clear: (h) => {
      const i = q.findIndex((x) => x.id === h);
      if (i >= 0) q.splice(i, 1);
    },
    now: () => now,
    advance: (ms) => {
      const target = now + ms;
      for (;;) {
        q.sort((a, b) => a.due - b.due || a.id - b.id);
        const next = q[0];
        if (!next || next.due > target) break;
        q.shift();
        now = next.due;
        next.fn();
      }
      now = target;
    },
  };
}

const SETTINGS: Setting[] = [
  { key: 'proactive.enabled', label: 'P', hint: '', category: 'C', kind: 'boolean', value: '1', source: 'default', restart_required: false },
];

const compiled: Compiled = compileScript(
  DemoScript.parse({
    version: 1,
    scenes: [
      {
        id: 'one',
        title: 'One',
        beats: [
          { kind: 'user', text: 'hi' },
          { kind: 'luna', text: 'yo' },
          { kind: 'action', name: 'browKnit' },
          { kind: 'user', text: 'again' },
          { kind: 'luna', text: 'sure' },
        ],
      },
      { id: 'two', title: 'Two', beats: [{ kind: 'proactive', delayMs: 100, lines: [{ text: 'psst' }] }] },
    ],
  }),
  () => 1000,
);

// v0.47.0 fixture: a dream block, a curtain, a record on the turntable.
const staged: Compiled = compileScript(
  DemoScript.parse({
    version: 1,
    music: { tracks: [{ id: 'hw', title: 'Heat Waves', artist: 'Glass Animals', album: 'Dreamland', duration: 238, cover: 'hw' }] },
    dream: { steps: [{ step: 'rate_salience', status: 'ok', detail: 'rated 3 turns', ms: 100 }, { step: 'run_diaries', status: 'ok', detail: '1 diary', ms: 100 }] },
    scenes: [
      {
        id: 's',
        title: 'S',
        beats: [
          { kind: 'user', text: 'play it' },
          { kind: 'music', track: 'hw' },
          { kind: 'luna', text: 'on' },
          { kind: 'skip', label: 'later', ms: 1000 },
          { kind: 'proactive', delayMs: 0, lines: [{ text: 'still on' }] },
        ],
      },
      { id: 't', title: 'T', beats: [{ kind: 'user', text: 'x' }, { kind: 'luna', text: 'y' }] },
    ],
  }),
  () => 500,
);

type Log = {
  events: ServerEvent[];
  status: string[];
  arms: string[];
  sent: number;
  sinks: SinkCall[];
  stages: StageCue[];
  starts: number[];
  ends: Array<[number, boolean]>;
};

function harness(c: Compiled = compiled): { tape: TapeClient; log: Log; clock: ReturnType<typeof fakeScheduler> } {
  const clock = fakeScheduler();
  const log: Log = { events: [], status: [], arms: [], sent: 0, sinks: [], stages: [], starts: [], ends: [] };
  const tape = createTapeClient({
    compiled: c,
    settings: SETTINGS,
    onEvent: (e) => log.events.push(e),
    onStatus: (s) => log.status.push(s),
    onArm: (t) => log.arms.push(t),
    onSent: () => log.sent++,
    onSink: (s) => log.sinks.push(s),
    onStage: (s) => log.stages.push(s),
    onSceneStart: (i) => log.starts.push(i),
    onSceneEnd: (i, n) => log.ends.push([i, n]),
    scheduler: clock,
    clock: () => 1234,
  });
  return { tape, log, clock };
}

const types = (log: Log): string[] => log.events.map((e) => e.type);

describe('connect', () => {
  test("opens with the server's open sequence: status, settings (no history yet), then scene 0 arms its first beat", () => {
    const { tape, log, clock } = harness();
    tape.connect();
    expect(log.status).toEqual(['open']);
    expect(types(log)).toEqual(['settings.state']);
    expect(log.starts).toEqual([0]);
    clock.advance(0); // the empty prelude ends at 0
    expect(log.arms).toEqual(['hi']);
    expect(tape.phase()).toBe('armed');
  });
});

describe('send', () => {
  test('chat.send is ignored until a beat is armed, then spends it and plays the run at its offsets', () => {
    const { tape, log, clock } = harness();
    tape.send({ type: 'chat.send', text: 'early' });
    expect(log.sent).toBe(0);
    tape.connect();
    clock.advance(0);
    tape.send({ type: 'chat.send', text: 'hi' });
    expect(log.sent).toBe(1);
    expect(tape.phase()).toBe('running');
    clock.advance(0);
    expect(types(log).slice(1)).toEqual(['turn.started']);
    clock.advance(700);
    expect(types(log)).toContain('tool.started');
    clock.advance(25); // "yo" is one chunk
    expect(types(log).slice(-2)).toEqual(['tool.progress', 'tool.finished']);
    clock.advance(300); // the gap, then the turn closes and the action cue lands on the same tick
    expect(types(log).slice(-1)).toEqual(['turn.result']);
    expect(log.sinks).toEqual([{ kind: 'action', name: 'browKnit' }]);
    // A second Send mid-run does nothing — the beat is spent.
    tape.send({ type: 'chat.send', text: 'hi' });
    expect(log.sent).toBe(1);
  });

  test('when the run ends (voice included) the next beat arms; after the last, the scene ends with hasNext', () => {
    const { tape, log, clock } = harness();
    tape.connect();
    clock.advance(0);
    tape.send({ type: 'chat.send', text: 'hi' });
    clock.advance(700 + 25 + 1000 - 1); // one chunk of "yo" + a 1000ms voice
    expect(log.arms).toEqual(['hi']);
    clock.advance(1);
    expect(log.arms).toEqual(['hi', 'again']);
    tape.send({ type: 'chat.send', text: 'again' });
    clock.advance(10_000);
    expect(log.ends).toEqual([[0, true]]);
    expect(tape.phase()).toBe('ended');
  });

  test('settings.set mutates the snapshot and echoes the whole state; null resets to boot', () => {
    const { tape, log } = harness();
    tape.connect();
    tape.send({ type: 'settings.set', key: 'proactive.enabled', value: '0' });
    const last = log.events[log.events.length - 1];
    expect(last?.type === 'settings.state' ? last.settings[0] : null).toMatchObject({ value: '0', source: 'user' });
    tape.send({ type: 'settings.set', key: 'proactive.enabled', value: null });
    const reset = log.events[log.events.length - 1];
    expect(reset?.type === 'settings.state' ? reset.settings[0] : null).toMatchObject({ value: '1', source: 'default' });
  });
});

describe('scenes', () => {
  test('nextScene only advances from ended; a prelude-only scene plays on its own and ends without arming', () => {
    const { tape, log, clock } = harness();
    tape.connect();
    tape.nextScene(); // not ended — nothing
    expect(log.starts).toEqual([0]);
    clock.advance(0);
    tape.send({ type: 'chat.send', text: 'hi' });
    clock.advance(10_000);
    tape.send({ type: 'chat.send', text: 'again' });
    clock.advance(10_000);
    tape.nextScene();
    expect(log.starts).toEqual([0, 1]);
    clock.advance(100 + 700 + 25 * 2 + 1000);
    expect(types(log).slice(-2)).toEqual(['tool.finished', 'proactive.finished']);
    expect(log.arms).toEqual(['hi', 'again']);
    expect(log.ends).toEqual([
      [0, true],
      [1, false],
    ]);
    tape.nextScene();
    expect(tape.phase()).toBe('done');
  });

  test('jumpTo leaves the current run cold — its remaining frames never fire — and starts the target scene', () => {
    const { tape, log, clock } = harness();
    tape.connect();
    clock.advance(0);
    tape.send({ type: 'chat.send', text: 'hi' });
    clock.advance(700); // turn.started fired, the message frames are pending
    const before = types(log).length;
    tape.jumpTo(1);
    expect(log.starts).toEqual([0, 1]);
    clock.advance(0);
    expect(types(log).slice(before)).toEqual([]); // nothing from scene 0 leaked
    clock.advance(100);
    expect(types(log).slice(-1)).toEqual(['proactive.started']); // scene 1 is playing
    expect(types(log).filter((t) => t === 'turn.result')).toHaveLength(0);
    tape.jumpTo(7); // out of range — ignored
    expect(log.starts).toEqual([0, 1]);
  });
});

describe('stage cues (v0.47.0)', () => {
  test('music and skip cues reach the director, never the app; the curtain holds the clock', () => {
    const { tape, log, clock } = harness(staged);
    tape.connect();
    clock.advance(0);
    tape.send({ type: 'chat.send', text: 'play it' });
    clock.advance(0);
    expect(log.stages).toEqual([{ kind: 'music', track: 'hw' }]);
    expect(types(log).filter((t) => t.startsWith('stage'))).toEqual([]);
    // "on" streams (700 + 25), its voice runs 500 → the curtain falls at 1225 and lasts 1000.
    clock.advance(700 + 25 + 500);
    expect(log.stages[1]).toEqual({ kind: 'skip', label: 'later', ms: 1000 });
    const atCurtain = types(log).length;
    clock.advance(999);
    expect(types(log).length).toBe(atCurtain); // nothing fires under the curtain
    clock.advance(1);
    expect(types(log).slice(-1)).toEqual(['proactive.started']);
  });
});

describe('the dream door (v0.47.0)', () => {
  test('dream.enter while a beat is armed plays the block and re-arms the beat when she wakes', () => {
    const { tape, log, clock } = harness(staged);
    tape.connect();
    clock.advance(0);
    expect(tape.phase()).toBe('armed');
    tape.send({ type: 'dream.enter' });
    expect(tape.phase()).toBe('dream');
    clock.advance(0);
    expect(types(log).slice(-1)).toEqual(['dream.status']);
    clock.advance(600 + 100 + 250 + 100 + 250);
    const tail = types(log).slice(-4);
    expect(tail).toEqual(['dream.status', 'dream.step', 'dream.step', 'dream.status']);
    const last = log.events[log.events.length - 1];
    expect(last?.type === 'dream.status' ? [last.is_dreaming, last.current_step] : null).toEqual([false, 'finished_idle']);
    expect(tape.phase()).toBe('armed');
    expect(log.arms).toEqual(['play it', 'play it']); // re-armed on waking
  });

  test('dream.wake ends it early with a waking status; dream.enter mid-run is refused; no block → nothing', () => {
    const { tape, log, clock } = harness(staged);
    tape.connect();
    clock.advance(0);
    tape.send({ type: 'dream.enter' });
    clock.advance(650); // inside step 1
    tape.send({ type: 'dream.wake' });
    const last = log.events[log.events.length - 1];
    expect(last?.type === 'dream.status' ? last.is_dreaming : null).toBe(false);
    expect(tape.phase()).toBe('armed');
    clock.advance(5000);
    expect(types(log).filter((t) => t === 'dream.step')).toHaveLength(1); // the second step never came
    tape.send({ type: 'chat.send', text: 'play it' });
    tape.send({ type: 'dream.enter' });
    expect(tape.phase()).toBe('running');

    const plain = harness();
    plain.tape.connect();
    plain.clock.advance(0);
    plain.tape.send({ type: 'dream.enter' });
    expect(plain.tape.phase()).toBe('armed');
  });
});

describe('pause and resume (← Menu, then Talk)', () => {
  test('close mid-run stops the clock; connect replays history and resumes the remaining cues once', () => {
    const { tape, log, clock } = harness();
    tape.connect();
    clock.advance(0);
    tape.send({ type: 'chat.send', text: 'hi' });
    clock.advance(700); // turn.started fired; message frames not yet
    tape.close();
    expect(log.status).toEqual(['open', 'closed']);
    const before = log.events.length;
    clock.advance(5000); // nothing fires while closed
    expect(log.events.length).toBe(before);
    tape.connect();
    // No history yet (the running turn has not closed); settings again, then the rest of the run.
    expect(types(log).slice(before)).toEqual(['settings.state']);
    clock.advance(0);
    expect(types(log).slice(before + 1)).toEqual(['tool.started']);
    clock.advance(25 + 1000);
    expect(types(log).filter((t) => t === 'turn.started')).toHaveLength(1);
    expect(types(log).filter((t) => t === 'turn.result')).toHaveLength(1);
    expect(log.arms).toEqual(['hi', 'again']);
    // A later reconnect replays the closed turn as history, stamped with the clock.
    tape.close();
    tape.connect();
    const hist = log.events.find((e) => e.type === 'history');
    expect(hist?.type === 'history' ? hist.turns : null).toEqual([{ user_text: 'hi', assistant_text: 'yo', t_ms: 1234 }]);
    expect(log.arms).toEqual(['hi', 'again', 'again']); // the armed beat is re-armed on resume
  });

  test('chat.send while closed is ignored; closing during a dream wakes her', () => {
    const { tape, log, clock } = harness(staged);
    tape.connect();
    clock.advance(0);
    tape.send({ type: 'dream.enter' });
    tape.close();
    expect(tape.phase()).toBe('armed');
    const last = log.events[log.events.length - 1];
    expect(last?.type === 'dream.status' ? last.is_dreaming : null).toBe(false);
    tape.send({ type: 'chat.send', text: 'play it' });
    expect(log.sent).toBe(0);
  });
});
