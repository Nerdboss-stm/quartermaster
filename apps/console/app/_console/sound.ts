"use client";

export type Cue =
  | "click"
  | "thud"
  | "chime"
  | "tick"
  | "tone"
  | "toneAutonomous";

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers start suspended until a user gesture; the controller keys count.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(next: boolean): void {
  muted = next;
}

export function isMuted(): boolean {
  return muted;
}

/** Everything is synthesized: no asset loading, no network, no licences. */
function blip(
  freq: number,
  durationMs: number,
  opts: {
    type?: OscillatorType;
    gain?: number;
    delayMs?: number;
    sweepTo?: number;
  } = {}
): void {
  const ac = audio();
  if (!ac || muted) return;
  const start = ac.currentTime + (opts.delayMs ?? 0) / 1000;
  const end = start + durationMs / 1000;

  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, start);
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, end);

  const peak = opts.gain ?? 0.08;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(amp);
  amp.connect(ac.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

export function play(cue: Cue): void {
  switch (cue) {
    // A clause passed: dry, short, unobtrusive. Fires many times.
    case "click":
      blip(2100, 26, { type: "square", gain: 0.022 });
      break;
    // A clause failed: the cascade halts. Low, blunt, final.
    case "thud":
      blip(150, 300, { type: "sine", gain: 0.16, sweepTo: 52 });
      blip(84, 420, { type: "triangle", gain: 0.12, sweepTo: 40, delayMs: 12 });
      break;
    // An envelope was approved by passkey: LOCK 2 satisfied.
    case "chime":
      blip(880, 170, { type: "sine", gain: 0.07 });
      blip(1320, 260, { type: "sine", gain: 0.055, delayMs: 90 });
      break;
    // The router picked an envelope.
    case "tick":
      blip(1500, 34, { type: "triangle", gain: 0.045 });
      break;
    // Money moved, with a human in the loop.
    case "tone":
      blip(660, 210, { type: "sine", gain: 0.085 });
      break;
    // Money moved with NO human in the loop: deliberately distinct.
    case "toneAutonomous":
      blip(660, 170, { type: "sine", gain: 0.085 });
      blip(990, 300, { type: "sine", gain: 0.085, delayMs: 190 });
      break;
  }
}
