import { composeCall, estimateSpeechMs, gapText, type PhraseOptions } from './phrase';
import { cornerSpeedMps, PROFILE_G } from './severity';
import type { DriverProfile, Note } from './types';

export interface SchedulerOptions extends PhraseOptions {
  /** seconds between the END of a call and the first note it describes. */
  leadSec: number;
  maxGroup: number;
  profile: DriverProfile;
  speechRate: number;
  /** comfortable braking, m/s^2 */
  brakeMps2: number;
}

export const DEFAULT_SCHEDULER: SchedulerOptions = {
  dialect: 'rally',
  units: 'metric',
  leadSec: 7,
  maxGroup: 3,
  profile: 'road',
  speechRate: 1.1,
  brakeMps2: 4,
};

export type Urgency = 'normal' | 'caution' | 'slow';

export interface Call {
  /** 'notes' = a normal pacenote call; 'alert' = late-braking warning (may interrupt speech). */
  kind: 'notes' | 'alert';
  noteIds: string[];
  firstNoteId: string;
  text: string;
  urgency: Urgency;
  estMs: number;
  /** metres from the driver to the first note when the call starts */
  distanceToFirst: number;
}

/**
 * Decides WHEN to speak. Pure and deterministic: feed it (position along
 * route, speed, clock) and it returns at most one call per update.
 *
 * Timing rule: a call is started when
 *     distanceToFirstNote <= v * (leadSec + estimatedSpeechSeconds)
 * so that speech finishes about leadSec before the corner, at any speed.
 *
 * Safety rule: after a corner has been called, if the braking needed to reach
 * its comfortable speed exceeds 85% of comfortable braking, one short "Slow"
 * alert is issued (it may interrupt speech).
 */
export class CallScheduler {
  private i = 0;
  private busyUntil = 0;
  private pending: Note[] = [];
  private alerted = new Set<string>();
  readonly missed: string[] = [];
  readonly called: string[] = [];
  readonly alerts: string[] = [];

  constructor(
    private notes: Note[],
    private o: SchedulerOptions = DEFAULT_SCHEDULER,
  ) {}

  /** Swap in edited notes mid-ride. Calls already made stay made; the next call comes from the new list. */
  setNotes(notes: Note[], s: number) {
    const next = notes.findIndex((n) => n.s >= s - 5);
    this.notes = notes;
    this.i = next < 0 ? notes.length : next;
    this.pending = [];
  }

  setOptions(o: Partial<SchedulerOptions>) {
    this.o = { ...this.o, ...o };
  }

  reset(s = 0) {
    this.i = this.notes.findIndex((n) => n.s >= s - 5);
    if (this.i < 0) this.i = this.notes.length;
    this.busyUntil = 0;
    this.pending = [];
    this.alerted.clear();
    this.missed.length = 0;
    this.called.length = 0;
    this.alerts.length = 0;
  }

  get nextIndex() {
    return this.i;
  }

  private alert(s: number, v: number): Call | null {
    const o = this.o;
    this.pending = this.pending.filter((n) => (n.apexS ?? n.s) > s - 5);
    for (const n of this.pending) {
      if (this.alerted.has(n.id) || n.radius === undefined || n.severity === undefined || n.severity > 4) continue;
      const d = (n.apexS ?? n.s) - s; // be at corner speed by the apex, not the entry
      const vc = cornerSpeedMps(n.radius, PROFILE_G[o.profile]);
      if (d < Math.max(15, v * 0.8) || v <= vc * 1.15) continue;
      const required = (v * v - vc * vc) / (2 * d);
      if (required > 0.85 * o.brakeMps2) {
        this.alerted.add(n.id);
        this.alerts.push(n.id);
        const text = o.dialect === 'plain' ? 'Slow down' : 'Slow';
        return {
          kind: 'alert',
          noteIds: [n.id],
          firstNoteId: n.id,
          text,
          urgency: 'slow',
          estMs: estimateSpeechMs(text, o.speechRate),
          distanceToFirst: d,
        };
      }
    }
    return null;
  }

  update(s: number, v: number, nowMs: number): Call | null {
    const o = this.o;
    const al = this.alert(s, v);
    if (al) {
      this.busyUntil = nowMs + al.estMs + 150;
      return al;
    }
    const vEff = Math.max(v, 4);
    while (this.i < this.notes.length) {
      if (nowMs < this.busyUntil) return null;
      const first = this.notes[this.i];
      const dist0 = first.s - s;

      // already past it (GPS jump, or speech was busy): count as missed
      if (dist0 < -10) {
        this.missed.push(first.id);
        this.i++;
        continue;
      }

      const group: Note[] = [first];
      while (group.length < o.maxGroup && this.i + group.length < this.notes.length) {
        const prev = group[group.length - 1];
        const nxt = this.notes[this.i + group.length];
        if (nxt.kind === 'finish') break;
        if (nxt.s - prev.sEnd <= Math.max(60, vEff * 2.5)) group.push(nxt);
        else break;
      }

      // coming in far too hot: lead the call with a caution
      let urgency: Urgency = 'normal';
      for (const n of group) {
        if (n.radius === undefined || n.severity === undefined || n.severity > 4) continue;
        if (v > cornerSpeedMps(n.radius, PROFILE_G[o.profile]) * 1.5) urgency = 'caution';
      }

      let text = composeCall(group, o);
      // plain English names the distance first: "In 110 metres, medium right". Done here, not at speaking time,
      // so the timing below counts the whole sentence.
      if (o.dialect === 'plain' && dist0 >= 60) {
        const g = gapText(dist0, { dialect: 'plain', units: o.units });
        const lead = g.replace(/^then /, '');
        if (lead !== g) text = `${lead.charAt(0).toUpperCase()}${lead.slice(1)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
      }
      if (urgency === 'caution' && !first.mods.caution)
        text = `${o.dialect === 'plain' ? 'Careful' : 'Caution'}. ${text}`;
      const estMs = estimateSpeechMs(text, o.speechRate);

      if (dist0 > vEff * (o.leadSec + estMs / 1000)) return null; // not yet

      this.i += group.length;
      this.busyUntil = nowMs + estMs + 450; // 450 covers the corner tone that sounds before the voice
      for (const n of group) {
        this.called.push(n.id);
        this.pending.push(n);
      }
      return {
        kind: 'notes',
        noteIds: group.map((n) => n.id),
        firstNoteId: first.id,
        text,
        urgency,
        estMs,
        distanceToFirst: dist0,
      };
    }
    return null;
  }
}
