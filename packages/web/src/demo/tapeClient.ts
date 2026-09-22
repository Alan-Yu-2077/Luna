import type { ClientEvent, HistoryTurn, ServerEvent, Setting } from '@luna/protocol';
import type { WsStatus } from '../wsClient';
import type { Compiled, CompiledScene, Run, SinkCall } from './compile';

// v0.46.0 — the tape player, wearing the socket client's clothes. It has the same three-method
// surface `app.ts` drives (`connect` / `send` / `close`) and feeds its frames into the SAME
// `onEvent` closure the real `LunaWsClient` would, so everything below that seam — the controller,
// the bubble views, the Live2D sink, the voice — runs the shipped code on a recording. The only
// things it knows that a socket would not: which user beat is armed, and when a scene has ended.

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
  onSceneStart: (index: number, scene: CompiledScene) => void;
  onSceneEnd: (index: number, hasNext: boolean) => void;
  scheduler?: Scheduler;
  clock?: () => number; // wall clock for history stamps
};

export type TapePhase = 'idle' | 'running' | 'armed' | 'ended' | 'done';

export type TapeClient = {
  connect(): void;
  send(e: ClientEvent): void;
  close(): void;
  nextScene(): void;
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
    else deps.onSink(cue.call);
  };

  const endRun = (): void => {
    clearTimers();
    if (run) for (const t of run.turns) history.push({ ...t, t_ms: clock() });
    run = null;
    const s = scene();
    const next = turnIdx + 1;
    if (next < s.turns.length) {
      turnIdx = next;
      phase = 'armed';
      deps.onArm(s.turns[next]?.userText ?? '');
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
        deps.onArm(scene().turns[turnIdx]?.userText ?? '');
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
      if (e.type === 'settings.set') {
        settings = settings.map((s) => {
          if (s.key !== e.key) return s;
          if (e.value === null) return { ...(original.get(s.key) ?? s) };
          return { ...s, value: e.value, source: 'user' };
        });
        deps.onEvent({ type: 'settings.state', settings: settings.map((s) => ({ ...s })) });
      }
      // ping / dream.* / proactive.fire / client.geo / dev.dispatch_tool: nothing on the tape answers.
    },

    close() {
      live = false;
      if (phase === 'running' && run) elapsed += sched.now() - runStartedAt;
      clearTimers();
      deps.onStatus?.('closed');
    },

    nextScene() {
      if (phase !== 'ended') return;
      if (sceneIdx + 1 < scenes.length) startScene(sceneIdx + 1);
      else phase = 'done';
    },

    phase: () => phase,
    sceneIndex: () => sceneIdx,
  };
}
