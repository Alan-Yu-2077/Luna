import type { ClientEvent, HistoryTurn, ServerEvent, Setting } from '@luna/protocol';
import type { WsStatus } from '../wsClient';
import { DEMO_LAST_DREAM_MS, type Compiled, type CompiledScene, type Cue, type Run, type SinkCall, type StageCue } from './compile';

// v0.46.0 — the tape player, wearing the socket client's clothes. It has the same three-method
// surface `app.ts` drives (`connect` / `send` / `close`) and feeds its frames into the SAME
// `onEvent` closure the real `LunaWsClient` would, so everything below that seam — the controller,
// the bubble views, the Live2D sink, the voice — runs the shipped code on a recording. The only
// things it knows that a socket would not: which user beat is armed, and when a scene has ended.
//
// v0.47.0 — the dream door (`dream.enter` / `dream.wake`, the frames the real server sends), stage
// cues for the director, and `jumpTo` for the scene picker.
// v0.47.1 — a finished dream HOLDS: the real cycle leaves her in `finished_idle` until dream.wake,
// so the tape stops at the `await` cue and the visitor's ☀️ Wake is what wakes her. And the door
// refuses only what the server refuses — an OPEN turn — not a run whose tail (a curtain, a waking
// still to come) is playing between turns: that tail pauses under the dream and resumes on Wake.

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

const WAKE_FRAME: ServerEvent = { type: 'dream.status', is_dreaming: false, current_step: null, last_dream_ms: DEMO_LAST_DREAM_MS };
const WAKE_REFUSED: ServerEvent = { type: 'error', code: 'task_in_progress', message: 'wake rejected: task_in_progress' };

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
  // A dream in progress: the phase it interrupted (the menu door) or null when it is a beat inside
  // the scene's own run; `holdAt` = the tape time of the `await` cue once the cycle has finished.
  let dream: { returnTo: TapePhase | null; holdAt: number | null } | null = null;
  // A turn is on the wire — the server's `activeTurn`, which is what makes it answer dream.enter
  // with turn_in_progress. Set on Send itself (the server's check-and-set is synchronous with it)
  // and by the proactive frames; cleared by the turn's closing frame.
  let turnOpen = false;
  // How many of the run's turns are already in history: each is recorded as its closing frame
  // fires, so a run paused in its tail (← Menu under the curtain) still replays what was seen.
  let recorded = 0;

  const clearTimers = (): void => {
    for (const h of timers) sched.clear(h);
    timers = [];
  };
  const scene = (): CompiledScene => {
    const s = scenes[sceneIdx];
    if (!s) throw new Error(`tape: no scene at ${sceneIdx}`);
    return s;
  };

  const armCurrent = (): void => {
    phase = 'armed';
    deps.onArm(scene().turns[turnIdx]?.userText ?? '');
  };

  const recordTurn = (): void => {
    const t = run?.turns[recorded];
    if (!t) return;
    recorded += 1;
    history.push({ ...t, t_ms: clock() });
  };

  const endRun = (): void => {
    clearTimers();
    turnOpen = false;
    while (run && recorded < run.turns.length) recordTurn();
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

  // The cycle is over; she sleeps on until the visitor wakes her. Timers stop here.
  const hold = (at: number): void => {
    clearTimers();
    if (!dream) dream = { returnTo: null, holdAt: at };
    else dream.holdAt = at;
    phase = 'dream';
  };

  const fire = (cue: Cue): void => {
    if (cue.kind === 'frame') {
      const t = cue.frame.type;
      if (t === 'turn.started' || t === 'proactive.started') turnOpen = true;
      else if (t === 'turn.result' || t === 'proactive.finished' || t === 'error') turnOpen = false;
      // The compiler records a turn for every reply and every SPOKEN waking (a quiet note is no turn).
      if (t === 'turn.result' || (cue.frame.type === 'proactive.finished' && cue.frame.spoke)) recordTurn();
      deps.onEvent(cue.frame);
    } else if (cue.kind === 'sink') deps.onSink(cue.call);
    else if (cue.stage.kind === 'await') hold(cue.at);
    else deps.onStage(cue.stage);
  };

  // Schedule the run's cues from `offset` (tape ms). Resuming from a hold (`heldAt`), everything
  // at the hold's own instant has already fired — the finished_idle status, the await itself — and
  // must not fire again, or she would be put straight back to sleep after waking.
  const scheduleFrom = (offset: number, heldAt: number | null = null): void => {
    if (!run) return;
    for (const cue of run.cues) {
      if (heldAt !== null ? cue.at <= heldAt : cue.at < offset) continue;
      timers.push(sched.set(() => fire(cue), cue.at - offset));
    }
    timers.push(sched.set(endRun, Math.max(0, run.endMs - offset)));
  };

  const playRun = (r: Run): void => {
    phase = 'running';
    run = r;
    recorded = 0;
    elapsed = 0;
    runStartedAt = sched.now();
    // An empty run (a scene that opens on a user beat has an empty prelude) ends NOW, not on a
    // zero-delay timer: the menu's Dream door sends dream.enter in the same tick as connect(), and
    // a prelude still "running" on a pending timer would refuse it — she would never dream.
    if (r.cues.length === 0 && r.endMs === 0) {
      endRun();
      return;
    }
    scheduleFrom(0);
  };

  const startScene = (i: number): void => {
    sceneIdx = i;
    turnIdx = -1;
    deps.onSceneStart(i, scene());
    playRun(scene().prelude);
  };

  // The dream door. Only between turns — mid-turn the real server answers turn_in_progress, and so
  // does the tape by ignoring it. What she was doing (an armed beat, an ended scene, a run's tail
  // between turns) resumes after the visitor wakes her.
  const enterDream = (): void => {
    const block = deps.compiled.dream;
    if (!block || phase === 'dream' || turnOpen) return;
    if (phase === 'running') elapsed += sched.now() - runStartedAt; // the tail pauses here
    dream = { returnTo: phase, holdAt: null };
    clearTimers();
    phase = 'dream';
    for (const cue of block.cues) timers.push(sched.set(() => fire(cue), cue.at));
  };

  // dream.wake — from the overlay's ☀️ Wake, or a close() under a dream. The waking status frame
  // is ours to send here, as ws.ts sends it on dream.wake. A scene-run dream resumes its remaining
  // cues from the hold; a menu-door dream returns to what she was doing.
  const wake = (): void => {
    if (phase !== 'dream' || !dream) return;
    clearTimers();
    deps.onEvent(WAKE_FRAME);
    const d = dream;
    dream = null;
    if (d.returnTo === null) {
      // A beat inside the scene's run: continue from the hold (or, woken early, from now).
      const from = d.holdAt ?? elapsed + (sched.now() - runStartedAt);
      phase = 'running';
      elapsed = from;
      runStartedAt = sched.now();
      scheduleFrom(from, d.holdAt);
      return;
    }
    phase = d.returnTo;
    if (phase === 'armed') armCurrent();
    else if (phase === 'running' && run) {
      runStartedAt = sched.now();
      scheduleFrom(elapsed);
    }
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
        turnOpen = true;
        if (turn) playRun(turn.run);
        return;
      }
      if (e.type === 'dream.enter') {
        if (live) enterDream();
        return;
      }
      if (e.type === 'dream.wake') {
        // v0.51.7: what ws.ts answers — a dream still running its jobs refuses the wake (dreamState's
        // task_in_progress); only a finished cycle, holding in finished_idle, can be woken.
        if (phase === 'dream' && dream && dream.holdAt === null) {
          deps.onEvent(WAKE_REFUSED);
          return;
        }
        wake();
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
      // A scene-run dream then pauses like any run: past its hold, so it is not re-entered.
      if (phase === 'dream' && dream) {
        const wasBeat = dream.returnTo === null;
        const holdAt = dream.holdAt;
        wake();
        if (wasBeat && holdAt !== null) elapsed = holdAt + 1;
      }
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
      if (phase === 'dream') {
        clearTimers();
        deps.onEvent(WAKE_FRAME);
        dream = null;
      }
      clearTimers();
      run = null;
      turnOpen = false;
      startScene(index);
    },

    phase: () => phase,
    sceneIndex: () => sceneIdx,
  };
}
