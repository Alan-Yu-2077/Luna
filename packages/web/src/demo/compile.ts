import { ServerEvent, type Citation, type MessageDelivery } from '@luna/protocol';
import type { Beat, DemoScript, DreamBlock, LunaLine, OpenFileBeat, Scene, ToolCall } from './script';

// v0.46.0 — script → tape. Pure: a scene's beats become runs of timed cues, one run per stretch
// between visitor actions. The timings are the SHAPE of a real turn (a thinking gap, a streamed
// message, a beat between messages), not a recording of one — nothing here is captured from a
// live session, so nothing private rides along.
//
// v0.47.0 — three cue kinds now: `frame` (a ServerEvent the app consumes as if from the socket),
// `sink` (direct choreography), and `stage` (the director's devices — a curtain, the turntable —
// which the app never sees). The dream block compiles to the same frames the real cycle emits.

// v0.51.0 (owner: "a real reply takes time, and even the replay has to speak — bubbles must not pop"):
// the model's own latency before it answers and before each call, a readable stream, and her messages
// paced by her voice — the next one starts arriving as the current line is ending, the way a model
// writing its next message while she talks would land, never three faces ahead of the voice.
export const PACING = {
  thinkMs: 1500, // turn.started → the first tool frame: the model's time-to-first-token, her thinking pose
  chunkChars: 3,
  chunkMs: 40, // ≈75 chars/s — what a streamed message looks like arriving
  gapMs: 300, // between consecutive frames of one turn
  toolLeadMs: 800, // the model writing a tool call before it starts
  voiceOverlapMs: 800, // the next message begins streaming this long before the current line's voice ends
  toolMs: 900, // a tool call that names no `ms`
  toolSettleMs: 150,
  toolNoteMs: 160, // started → the progress note
  speechCharMs: 55, // the voice estimate for a line the manifest does not carry
  speechLeadMs: 400,
  gestureMs: 900, // a gesture's start → her next frame (v0.51.7)
  proactiveDelayMs: 2500,
  skipMs: 2600, // the curtain's default stay
  dreamLeadMs: 600, // dream.status → the first step
  dreamStepGapMs: 250,
} as const;

export type SinkCall =
  | { kind: 'action'; name: string; intensity?: number }
  | { kind: 'pulse'; pose: Record<string, number>; ms: number };

// `await` = the tape holds here until the visitor acts — a finished dream waits for ☀️ Wake, exactly
// as the real server leaves her in `finished_idle` until dream.wake arrives.
export type StageCue =
  | { kind: 'skip'; label: string; ms: number; elapsedMs?: number }
  | { kind: 'music'; track: string | null }
  // v0.48.3: the visitor presses play in "his" player — the director gates the next line on it.
  | { kind: 'press_play'; track: string; label: string }
  // v0.49.0: back at his desk — the folder she left, the file in it.
  | { kind: 'open_file'; folder: string; file: string; label: string; doc: OpenFileBeat['doc'] }
  | { kind: 'await'; what: 'wake' }
  // v0.51.0: the curtain call — the chat cleared; her inner voice as a card.
  | { kind: 'clear' }
  | { kind: 'inner'; text: string };

export type Cue =
  | { at: number; kind: 'frame'; frame: ServerEvent }
  | { at: number; kind: 'sink'; call: SinkCall }
  | { at: number; kind: 'stage'; stage: StageCue };

// What a run adds to the conversation record — replayed as `history` if the socket reconnects, the
// way the real server replays persisted turns. user_text is '' for a proactive waking.
export type RunTurn = { user_text: string; assistant_text: string };

export type Run = { cues: Cue[]; endMs: number; turns: RunTurn[] };
export type Turn = { userText: string; run: Run };
export type CompiledScene = { id: string; title: string; prelude: Run; turns: Turn[] };
// `dream` = the menu's Dream door (null when the script has no dream block).
export type Compiled = { scenes: CompiledScene[]; dream: Run | null };

export type DurationLookup = (text: string) => number | undefined;

// v0.51.0: who said a (quoted, possibly excerpted) line in a scene — the engineering notes draw a quote
// as that side's own bubble. Her lines are the runs' assistant text; his are the turns he sends.
export function speakerIn(scene: CompiledScene | undefined, text: string): 'luna' | 'user' | null {
  if (!scene || text === '') return null;
  const runs = [scene.prelude, ...scene.turns.map((t) => t.run)];
  if (scene.turns.some((t) => t.userText.includes(text))) return 'user';
  if (runs.some((r) => r.turns.some((rt) => rt.assistant_text.includes(text)))) return 'luna';
  return null;
}

// How long an inner-voice card stays before the next line — a reading pace, slower for Chinese.
export function readingMs(text: string): number {
  const perChar = /[\u4e00-\u9fff]/.test(text) ? 150 : 50;
  return Math.max(3500, 1200 + text.length * perChar);
}

export function estimateSpeechMs(text: string): number {
  return PACING.speechLeadMs + text.length * PACING.speechCharMs;
}

class Ids {
  private n = 0;
  constructor(private readonly scene: string) {}
  turn(): string {
    return `demo:${this.scene}:t${++this.n}`;
  }
  call(): string {
    return `demo:${this.scene}:c${++this.n}`;
  }
  // No `:cont:` marker — the controller reads that as a 💭 second thought; a scripted waking is a 🌱.
  cycle(): string {
    return `demo:${this.scene}:p${++this.n}`;
  }
  // …and this one carries it on purpose — continuation.ts marks its cycles `<session>:cont:<ms>`.
  continuation(): string {
    return `demo:${this.scene}:cont:${++this.n}`;
  }
}

// v0.47.1: the real server never sends `last_dream_ms: null` on a dream frame — it carries the stamp
// of the cycle before. On the tape that is the night before the scripted dream; a constant keeps
// the compiler pure.
export const DEMO_LAST_DREAM_MS = 1789939871610;

// The frames a dream emits, as ws.ts + dream/cycle.ts emit them: `dream.status` on entry with the
// first node as the current step, one `dream.step` per node, then `dream.status` STILL dreaming
// with `finished_idle` — the cycle is over but she sleeps on until dream.wake. The tape holds
// there (an `await` cue); the wake itself (`is_dreaming: false`) is emitted when the visitor
// presses ☀️ Wake, as the server does when it receives dream.wake.
export function dreamCues(block: DreamBlock, start: number): { cues: Cue[]; endMs: number } {
  const cues: Cue[] = [];
  let t = start;
  const frame = (at: number, f: ServerEvent): void => {
    ServerEvent.parse(f);
    cues.push({ at, kind: 'frame', frame: f });
  };
  const first = block.steps[0]?.step ?? null;
  frame(t, { type: 'dream.status', is_dreaming: true, current_step: first, last_dream_ms: DEMO_LAST_DREAM_MS });
  t += PACING.dreamLeadMs;
  for (const step of block.steps) {
    frame(t, { type: 'dream.step', step: step.step, status: step.status, detail: step.detail });
    t += step.ms + PACING.dreamStepGapMs;
  }
  frame(t, { type: 'dream.status', is_dreaming: true, current_step: 'finished_idle', last_dream_ms: DEMO_LAST_DREAM_MS });
  cues.push({ at: t, kind: 'stage', stage: { kind: 'await', what: 'wake' } });
  return { cues, endMs: t };
}

export function compileDreamRun(block: DreamBlock): Run {
  const { cues, endMs } = dreamCues(block, 0);
  return { cues, endMs, turns: [] };
}

class RunBuilder {
  private readonly cues: Cue[] = [];
  private readonly turns: RunTurn[] = [];
  private t = 0;
  private speechEnd = 0;
  private turnId: string | null = null;
  private turnTexts: string[] = [];
  private citations: Citation[] = [];

  constructor(
    private readonly ids: Ids,
    private readonly duration: DurationLookup,
    private readonly dream: DreamBlock | undefined,
    private userText: string,
  ) {}

  private frame(at: number, frame: ServerEvent): void {
    // The same schema the real wsClient checks every inbound frame against. A script that would
    // produce an invalid frame throws here — in the tests, which the Pages deploy runs before it
    // builds, so a bad tape fails the deploy instead of reaching a visitor.
    ServerEvent.parse(frame);
    this.cues.push({ at, kind: 'frame', frame });
  }

  private ensureTurn(): void {
    if (this.turnId !== null) return;
    this.turnId = this.ids.turn();
    this.frame(this.t, { type: 'turn.started', turn_id: this.turnId });
    this.t += PACING.thinkMs;
  }

  private closeTurn(): void {
    if (this.turnId === null) return;
    this.frame(this.t, {
      type: 'turn.result',
      turn_id: this.turnId,
      text: this.turnTexts.join('\n'),
      finish_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
      ...(this.citations.length > 0 ? { citations: this.citations } : {}),
    });
    this.turns.push({ user_text: this.userText, assistant_text: this.turnTexts.join('\n') });
    this.userText = '';
    this.turnId = null;
    this.turnTexts = [];
    this.citations = [];
  }

  // A `message` tool call as the server streams it: started → text deltas → the delivery envelope.
  private message(line: LunaLine, isFinal: boolean): void {
    const callId = this.ids.call();
    // Paced by her voice: not before the frame clock, and not while more than the overlap of the
    // current line is still to be spoken.
    this.t = Math.max(this.t, this.speechEnd - PACING.voiceOverlapMs);
    const delivery: MessageDelivery = {
      text: line.text,
      segments: [],
      is_final: line.is_final ?? isFinal,
      ...(line.expression ? { expression: line.expression } : {}),
      ...(line.emotion !== undefined ? { emotion: line.emotion } : {}),
    };
    this.frame(this.t, { type: 'tool.started', call_id: callId, tool_name: 'message', input: delivery });
    let at = this.t;
    for (let pos = 0; pos < line.text.length; pos += PACING.chunkChars) {
      at += PACING.chunkMs;
      this.frame(at, {
        type: 'tool.progress',
        call_id: callId,
        tool_name: 'message',
        payload: { text_delta: line.text.slice(pos, pos + PACING.chunkChars) },
      });
    }
    this.frame(at, {
      type: 'tool.finished',
      call_id: callId,
      result: { kind: 'ok', summary: 'message', data: delivery },
    });
    // Playback is serial (the sink's queue): this utterance starts when the previous one ends.
    const start = Math.max(at, this.speechEnd);
    this.speechEnd = start + (this.duration(line.text) ?? estimateSpeechMs(line.text));
    this.turnTexts.push(line.text);
    this.t = at + PACING.gapMs;
  }

  private tool(call: ToolCall): void {
    const callId = this.ids.call();
    const ms = call.ms ?? PACING.toolMs;
    this.t += PACING.toolLeadMs;
    this.frame(this.t, { type: 'tool.started', call_id: callId, tool_name: call.name, input: {} });
    if (call.note !== undefined) {
      this.frame(this.t + Math.min(PACING.toolNoteMs, ms), {
        type: 'tool.progress',
        call_id: callId,
        tool_name: call.name,
        payload: { note: call.note },
      });
    }
    this.frame(this.t + ms, {
      type: 'tool.finished',
      call_id: callId,
      result: { kind: 'ok', summary: call.summary, data: null },
    });
    this.t += ms + PACING.toolSettleMs;
    if (call.sources) this.citations.push(...call.sources);
  }

  // Nothing of hers may still be sounding when the room changes — the clock waits for the voice.
  private settle(): void {
    this.closeTurn();
    this.t = Math.max(this.t, this.speechEnd);
  }

  apply(beat: Exclude<Beat, { kind: 'user' }>, moreInTurn: boolean): void {
    switch (beat.kind) {
      case 'luna':
        this.ensureTurn();
        this.message(beat, !moreInTurn);
        return;
      case 'tool':
        this.ensureTurn();
        this.tool(beat);
        return;
      case 'pause':
        this.t += beat.ms;
        return;
      case 'action':
        // v0.51.7: the live idle scheduler never starts a gesture while she speaks — neither does the
        // tape. It waits for the current line to end, and her next frame gives it a moment. When her
        // turn is over, it closes first: an idle gesture is not part of the model's turn.
        if (!moreInTurn) this.closeTurn();
        this.t = Math.max(this.t, this.speechEnd);
        this.cues.push({
          at: this.t,
          kind: 'sink',
          call: { kind: 'action', name: beat.name, ...(beat.intensity !== undefined ? { intensity: beat.intensity } : {}) },
        });
        this.t += PACING.gestureMs;
        return;
      case 'pulse':
        this.cues.push({ at: this.t, kind: 'sink', call: { kind: 'pulse', pose: beat.pose, ms: beat.ms } });
        return;
      case 'skip': {
        this.settle();
        const ms = beat.ms ?? PACING.skipMs;
        this.cues.push({
          at: this.t,
          kind: 'stage',
          stage: { kind: 'skip', label: beat.label, ms, ...(beat.elapsedMs !== undefined ? { elapsedMs: beat.elapsedMs } : {}) },
        });
        this.t += ms;
        return;
      }
      case 'music':
        this.cues.push({ at: this.t, kind: 'stage', stage: { kind: 'music', track: beat.track } });
        return;
      case 'press_play':
        // After her last word lands; the run then ends and the next line arms behind the prompt.
        this.settle();
        this.cues.push({ at: this.t, kind: 'stage', stage: { kind: 'press_play', track: beat.track, label: beat.label } });
        return;
      case 'clear':
        this.settle();
        this.cues.push({ at: this.t, kind: 'stage', stage: { kind: 'clear' } });
        this.t += PACING.gapMs;
        return;
      case 'inner':
        // After her last word has been spoken, and left up long enough to read.
        this.settle();
        this.cues.push({ at: this.t, kind: 'stage', stage: { kind: 'inner', text: beat.text } });
        this.t += beat.ms ?? readingMs(beat.text);
        return;
      case 'open_file':
        this.settle();
        this.cues.push({
          at: this.t,
          kind: 'stage',
          stage: { kind: 'open_file', folder: beat.folder, file: beat.file, label: beat.label, doc: beat.doc },
        });
        return;
      case 'dream': {
        if (!this.dream) throw new Error('a dream beat needs the script-level dream block');
        this.settle();
        const { cues, endMs } = dreamCues(this.dream, this.t);
        this.cues.push(...cues);
        // Time on the tape stops at the hold; what follows is measured from the wake.
        this.t = endMs + PACING.gapMs;
        return;
      }
      case 'proactive': {
        // A waking never overlaps a turn (session.activeTurn), and never emits turn.started (v0.33.2).
        this.closeTurn();
        this.t += beat.delayMs ?? PACING.proactiveDelayMs;
        const cycleId = beat.continuation ? this.ids.continuation() : this.ids.cycle();
        this.frame(this.t, { type: 'proactive.started', cycle_id: cycleId });
        this.t += PACING.thinkMs;
        for (const call of beat.tools ?? []) this.tool(call);
        const lines = beat.lines ?? [];
        // With tools still to run after her words, no line of hers is the last word of the turn.
        const after = beat.then_tools ?? [];
        lines.forEach((line, i) => this.message(line, i === lines.length - 1 && after.length === 0));
        for (const call of after) this.tool(call);
        const spoke = lines.length > 0;
        this.frame(this.t, {
          type: 'proactive.finished',
          cycle_id: cycleId,
          spoke,
          ...(!spoke && beat.quiet_note ? { quiet_note: beat.quiet_note } : {}),
        });
        if (spoke) this.turns.push({ user_text: '', assistant_text: lines.map((l) => l.text).join('\n') });
        this.turnTexts = [];
        return;
      }
    }
  }

  finish(): Run {
    this.closeTurn();
    return { cues: this.cues, endMs: Math.max(this.t, this.speechEnd), turns: this.turns };
  }
}

// Is there another spoken/tool frame in this turn after beat `i`? Pauses and choreography are
// transparent; a user beat, a waking, a curtain, a dream or his hand on the player closes the turn.
export function moreInTurn(beats: readonly Beat[], i: number): boolean {
  for (let j = i + 1; j < beats.length; j++) {
    const k = beats[j]?.kind;
    if (k === 'luna' || k === 'tool') return true;
    if (
      k === 'user' ||
      k === 'proactive' ||
      k === 'skip' ||
      k === 'dream' ||
      k === 'press_play' ||
      k === 'open_file' ||
      k === 'clear' ||
      k === 'inner'
    ) {
      return false;
    }
  }
  return false;
}

export function compileScene(scene: Scene, duration: DurationLookup, dream?: DreamBlock): CompiledScene {
  const ids = new Ids(scene.id);
  const prelude = new RunBuilder(ids, duration, dream, '');
  const turns: Array<{ userText: string; builder: RunBuilder }> = [];
  let current = prelude;
  scene.beats.forEach((beat, i) => {
    if (beat.kind === 'user') {
      current = new RunBuilder(ids, duration, dream, beat.text);
      turns.push({ userText: beat.text, builder: current });
      return;
    }
    current.apply(beat, moreInTurn(scene.beats, i));
  });
  return {
    id: scene.id,
    title: scene.title,
    prelude: prelude.finish(),
    turns: turns.map((t) => ({ userText: t.userText, run: t.builder.finish() })),
  };
}

export function compileScript(script: DemoScript, duration: DurationLookup = () => undefined): Compiled {
  return {
    scenes: script.scenes.map((s) => compileScene(s, duration, script.dream)),
    dream: script.dream ? compileDreamRun(script.dream) : null,
  };
}
