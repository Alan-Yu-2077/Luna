import { ServerEvent, type Citation, type MessageDelivery } from '@luna/protocol';
import type { Beat, DemoScript, DreamBlock, LunaLine, Scene, ToolCall } from './script';

// v0.46.0 — script → tape. Pure: a scene's beats become runs of timed cues, one run per stretch
// between visitor actions. The timings are the SHAPE of a real turn (a thinking gap, a streamed
// message, a beat between messages), not a recording of one — nothing here is captured from a
// live session, so nothing private rides along.
//
// v0.47.0 — three cue kinds now: `frame` (a ServerEvent the app consumes as if from the socket),
// `sink` (direct choreography), and `stage` (the director's devices — a curtain, the turntable —
// which the app never sees). The dream block compiles to the same frames the real cycle emits.

export const PACING = {
  thinkMs: 700, // turn.started → the first tool frame: her thinking pose gets its moment
  chunkChars: 3,
  chunkMs: 25, // ≈120 chars/s — what a streamed message looks like arriving
  gapMs: 300, // between consecutive frames of one turn
  toolMs: 900, // a tool call that names no `ms`
  toolSettleMs: 150,
  toolNoteMs: 160, // started → the progress note
  speechCharMs: 55, // the voice estimate for a line the manifest does not carry
  speechLeadMs: 400,
  proactiveDelayMs: 2500,
  skipMs: 2600, // the curtain's default stay
  dreamLeadMs: 600, // dream.status → the first step
  dreamStepGapMs: 250,
} as const;

export type SinkCall =
  | { kind: 'action'; name: string; intensity?: number }
  | { kind: 'pulse'; pose: Record<string, number>; ms: number };

export type StageCue = { kind: 'skip'; label: string; ms: number } | { kind: 'music'; track: string | null };

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

// The frames a dream emits, as ws.ts + dream/cycle.ts emit them: one `dream.status` on entry (no
// current step yet), one `dream.step` per node, one `dream.status` on exit naming `finished_idle`.
export function dreamFrames(block: DreamBlock, start: number): { frames: Array<{ at: number; frame: ServerEvent }>; endMs: number } {
  const frames: Array<{ at: number; frame: ServerEvent }> = [];
  let t = start;
  frames.push({ at: t, frame: { type: 'dream.status', is_dreaming: true, current_step: null, last_dream_ms: null } });
  t += PACING.dreamLeadMs;
  for (const step of block.steps) {
    frames.push({ at: t, frame: { type: 'dream.step', step: step.step, status: step.status, detail: step.detail } });
    t += step.ms + PACING.dreamStepGapMs;
  }
  frames.push({ at: t, frame: { type: 'dream.status', is_dreaming: false, current_step: 'finished_idle', last_dream_ms: null } });
  for (const f of frames) ServerEvent.parse(f.frame);
  return { frames, endMs: t };
}

export function compileDreamRun(block: DreamBlock): Run {
  const { frames, endMs } = dreamFrames(block, 0);
  return { cues: frames.map((f) => ({ at: f.at, kind: 'frame', frame: f.frame })), endMs, turns: [] };
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
    // The same gate the real wsClient applies to every inbound frame — a script that would produce
    // an invalid frame fails here, at compile time, never in a visitor's browser.
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
        this.cues.push({
          at: this.t,
          kind: 'sink',
          call: { kind: 'action', name: beat.name, ...(beat.intensity !== undefined ? { intensity: beat.intensity } : {}) },
        });
        return;
      case 'pulse':
        this.cues.push({ at: this.t, kind: 'sink', call: { kind: 'pulse', pose: beat.pose, ms: beat.ms } });
        return;
      case 'skip': {
        this.settle();
        const ms = beat.ms ?? PACING.skipMs;
        this.cues.push({ at: this.t, kind: 'stage', stage: { kind: 'skip', label: beat.label, ms } });
        this.t += ms;
        return;
      }
      case 'music':
        this.cues.push({ at: this.t, kind: 'stage', stage: { kind: 'music', track: beat.track } });
        return;
      case 'dream': {
        if (!this.dream) throw new Error('a dream beat needs the script-level dream block');
        this.settle();
        const { frames, endMs } = dreamFrames(this.dream, this.t);
        for (const f of frames) this.cues.push({ at: f.at, kind: 'frame', frame: f.frame });
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
        lines.forEach((line, i) => this.message(line, i === lines.length - 1));
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
// transparent; a user beat, a waking, a curtain or a dream closes the turn.
export function moreInTurn(beats: readonly Beat[], i: number): boolean {
  for (let j = i + 1; j < beats.length; j++) {
    const k = beats[j]?.kind;
    if (k === 'luna' || k === 'tool') return true;
    if (k === 'user' || k === 'proactive' || k === 'skip' || k === 'dream') return false;
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
