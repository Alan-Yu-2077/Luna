import type { ClientEvent, HistoryTurn, ServerEvent, Setting } from '@luna/protocol';
import type { WsStatus } from '../wsClient';
import type { Compiled, CompiledScene, Run, SinkCall, StageCue } from './compile';

// v0.46.0 — the tape player, wearing the socket client's clothes. It has the same three-method
// surface `app.ts` drives (`connect` / `send` / `close`) and feeds its frames into the SAME
// `onEvent` closure the real `LunaWsClient` would, so everything below that seam — the controller,
// the bubble views, the Live2D sink, the voice — runs the shipped code on a recording. The only
// things it knows that a socket would not: which user beat is armed, and when a scene has ended.
//
// v0.47.0 — the dream door (`dream.enter` / `dream.wake`, the frames the real server sends), stage
// cues for the director, and `jumpTo` for the scene picker.

export type Scheduler = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
  now: () => number;
};

export const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => performance.now(),
};

export type TapeDeps = {
  compiled: Compiled;
  settings: Setting[];
  onEvent: (e: ServerEvent) => void;
  onStatus?: (s: WsStatus) => void;
  // A user beat is ready: pre-type it and hand the visitor the Send button.
  onArm: (text: string) => void;
  // The visitor pressed Send — the beat is spent.
  onSent: () => void;
  onSink: (call: SinkCall) => void;
  // The director's devices: a curtain, the turntable. The app never sees these.
  onStage: (cue: StageCue) => void;
  onSceneStart: (index: number, scene: CompiledScene) => void;
  onSceneEnd: (index: number, hasNext: boolean) => void;
  scheduler?: Scheduler;
  clock?: () => number; // wall clock for history stamps
};

export type TapePhase = 'idle' | 'running' | 'armed' | 'ended' | 'done' | 'dream';

export type TapeClient = {
  connect(): void;
  send(e: ClientEvent): void;
  close(): void;
  nextScene(): void;
  jumpTo(index: number): void;
  phase(): TapePhase;
  sceneIndex(): number;
};

export function createTapeClient(deps: TapeDeps): TapeClient {
  const sched = deps.scheduler ?? realScheduler;
  const clock = deps.clock ?? (() => Date.now());
  const scenes = deps.compiled.scenes;
  // The settings snapshot is the server's registry frozen; a `settings.set` mutates it and echoes
  // the whole state back, which is exactly what ws.ts does. null = reset to what boot had.
  const original = new Map(deps.settings.map((s) => [s.key, s]));
  let settings = deps.settings.map((s) => ({ ...s }));
  const history: HistoryTurn[] = [];

  let phase: TapePhase = 'idle';
  let sceneIdx = -1;
  let turnIdx = -1; // -1 = the prelude
  let run: Run | null = null;
  let runStartedAt = 0;
  let elapsed = 0; // of the current run, across a close()/connect() pause
  let live = false;
  let timers: unknown[] = [];
  // The phase a dream interrupted, to come back to when she wakes.
  let dreamReturn: TapePhase | null = null;

  const clearTimers = (): void => {
    for (const h of timers) sched.clear(h);
    timers = [];
  };
  const scene = (): CompiledScene => {
    const s = scenes[sceneIdx];
    if (!s) throw new Error(`tape: no scene at ${sceneIdx}`);
    return s;
  };

  const fire = (cue: Run['cues'][number]): void => {
    if (cue.kind === 'frame') deps.onEvent(cue.frame);
    else if (cue.kind === 'sink') deps.onSink(cue.call);
    else deps.onStage(cue.stage);
  };

  const armCurrent = (): void => {
    phase = 'armed';
    deps.onArm(scene().turns[turnIdx]?.userText ?? '');
  };

  const endRun = (): void => {
    clearTimers();
    if (run) for (const t of run.turns) history.push({ ...t, t_ms: clock() });
    run = null;
    const s = scene();
    const next = turnIdx + 1;
    if (next < s.turns.length) {
      turnIdx = next;
      armCurrent();
    } else {
      phase = 'ended';
      deps.onSceneEnd(sceneIdx, sceneIdx + 1 < scenes.length);
    }
  };

  const scheduleFrom = (offset: number): void => {
    if (!run) return;
    for (const cue of run.cues) {
      if (cue.at < offset) continue;
      timers.push(sched.set(() => fire(cue), cue.at - offset));
    }
    timers.push(sched.set(endRun, Math.max(0, run.endMs - offset)));
  };

  const playRun = (r: Run): void => {
    phase = 'running';
    run = r;
    elapsed = 0;
    runStartedAt = sched.now();
    scheduleFrom(0);
  };

  const startScene = (i: number): void => {
    sceneIdx = i;
    turnIdx = -1;
    deps.onSceneStart(i, scene());
    playRun(scene().prelude);
  };

  // The dream door. Only between turns — mid-turn the real server answers turn_in_progress, and so
  // does the tape by ignoring it. What she was doing (an armed beat, an ended scene) resumes after.
  const enterDream = (): void => {
    const dream = deps.compiled.dream;
    if (!dream || phase === 'dream' || phase === 'running') return;
    dreamReturn = phase;
    clearTimers();
    phase = 'dream';
    for (const cue of dream.cues) timers.push(sched.set(() => fire(cue), cue.at));
    timers.push(sched.set(() => wake(false), dream.endMs));
  };
  const wake = (early: boolean): void => {
    if (phase !== 'dream') return;
    clearTimers();
    if (early) deps.onEvent({ type: 'dream.status', is_dreaming: false, current_step: null, last_dream_ms: null });
    phase = dreamReturn ?? 'idle';
    dreamReturn = null;
    if (phase === 'armed') armCurrent();
  };

  return {
    connect() {
      live = true;
      deps.onStatus?.('open');
      // What ws.ts sends on open: the persisted turns (only if there are any), then the settings.
      if (history.length > 0) deps.onEvent({ type: 'history', turns: [...history] });
      deps.onEvent({ type: 'settings.state', settings: settings.map((s) => ({ ...s })) });
      if (sceneIdx === -1) {
        startScene(0);
        return;
      }
      // Reconnect (← Menu, then Talk): resume where the pause left off.
      if (phase === 'running' && run) {
        runStartedAt = sched.now();
        scheduleFrom(elapsed);
      } else if (phase === 'armed') {
        armCurrent();
      }
    },

    send(e) {
      if (e.type === 'chat.send') {
        if (phase !== 'armed' || !live) return;
        deps.onSent();
        const turn = scene().turns[turnIdx];
        if (turn) playRun(turn.run);
        return;
      }
      if (e.type === 'dream.enter') {
        if (live) enterDream();
        return;
      }
      if (e.type === 'dream.wake') {
        wake(true);
        return;
      }
      if (e.type === 'settings.set') {
        settings = settings.map((s) => {
          if (s.key !== e.key) return s;
          if (e.value === null) return { ...(original.get(s.key) ?? s) };
          return { ...s, value: e.value, source: 'user' };
        });
        deps.onEvent({ type: 'settings.state', settings: settings.map((s) => ({ ...s })) });
      }
      // ping / proactive.fire / client.geo / dev.dispatch_tool: nothing on the tape answers.
    },

    close() {
      live = false;
      // A dream cannot be paused — she wakes (the socket closing under a real dream is the same).
      if (phase === 'dream') wake(true);
      if (phase === 'running' && run) elapsed += sched.now() - runStartedAt;
      clearTimers();
      deps.onStatus?.('closed');
    },

    nextScene() {
      if (phase !== 'ended') return;
      if (sceneIdx + 1 < scenes.length) startScene(sceneIdx + 1);
      else phase = 'done';
    },

    // The scene picker: leave whatever is playing and start scene `index`. The interrupted run's
    // turns are not recorded — history is what was actually seen through to the end.
    jumpTo(index) {
      if (index < 0 || index >= scenes.length || !live) return;
      if (phase === 'dream') wake(true);
      clearTimers();
      run = null;
      dreamReturn = null;
      startScene(index);
    },

    phase: () => phase,
    sceneIndex: () => sceneIdx,
  };
}
