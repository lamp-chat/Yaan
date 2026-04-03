let audioCtx = null;
let introLoop = null;
let lastKeyAtMs = 0;
let lastClickAtMs = 0;

const VOLUME_MULT = 1.25; // Keep subtle; just a bit louder than default.

function nowMs() {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  } catch {}
  return Date.now();
}

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function isEnabled() {
  try { return window.localStorage.getItem("yaan_sound_enabled") === "1"; } catch { return false; }
}

export async function startIntroMusic() {
  if (!isEnabled()) return false;
  if (introLoop) return true;
  const ctx = ensureAudio();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { return false; }
  }

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.09, now + 0.7);
  master.connect(ctx.destination);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(980, now);
  lp.Q.setValueAtTime(0.8, now);
  lp.connect(master);

  // Pad: two detuned saws into a lowpass for warmth.
  const padGain = ctx.createGain();
  padGain.gain.setValueAtTime(0.20, now);
  padGain.connect(lp);

  const pad1 = ctx.createOscillator();
  pad1.type = "sawtooth";
  pad1.frequency.setValueAtTime(220, now);
  pad1.detune.setValueAtTime(-7, now);
  pad1.connect(padGain);

  const pad2 = ctx.createOscillator();
  pad2.type = "sawtooth";
  pad2.frequency.setValueAtTime(220, now);
  pad2.detune.setValueAtTime(8, now);
  pad2.connect(padGain);

  // LFO for gentle movement.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(0.08, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(220, now); // mod depth for filter cutoff
  lfo.connect(lfoGain);
  lfoGain.connect(lp.frequency);

  pad1.start(now);
  pad2.start(now);
  lfo.start(now);

  // Very soft arpeggio "sparkles".
  const chords = [
    [220.0, 261.63, 329.63, 392.0],  // Am
    [174.61, 220.0, 261.63, 349.23], // F
    [196.0, 246.94, 329.63, 392.0],  // G-ish / C flavor
    [164.81, 196.0, 246.94, 329.63], // E-ish
  ];
  let chordIdx = 0;
  let step = 0;

  const triggerPluck = (freq) => {
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.010);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    g.connect(lp);

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.92, t0 + 0.16);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + 0.22);
  };

  const timer = window.setInterval(() => {
    const chord = chords[chordIdx % chords.length];
    const f = chord[step % chord.length];
    triggerPluck(f * 2); // higher octave sparkle
    step += 1;
    if (step % 8 === 0) chordIdx += 1;
  }, 320);

  introLoop = { ctx, master, lp, pad1, pad2, lfo, timer };
  return true;
}

export function stopIntroMusic(fadeMs = 420) {
  const loop = introLoop;
  if (!loop) return;
  introLoop = null;

  try { window.clearInterval(loop.timer); } catch {}

  const t0 = loop.ctx.currentTime;
  const dur = Math.max(0.06, Math.min(2.0, fadeMs / 1000));
  try {
    loop.master.gain.cancelScheduledValues(t0);
    loop.master.gain.setValueAtTime(Math.max(0.0001, loop.master.gain.value || 0.0001), t0);
    loop.master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  } catch {}

  const stopAt = t0 + dur + 0.05;
  try { loop.pad1.stop(stopAt); } catch {}
  try { loop.pad2.stop(stopAt); } catch {}
  try { loop.lfo.stop(stopAt); } catch {}

  window.setTimeout(() => {
    try { loop.pad1.disconnect(); } catch {}
    try { loop.pad2.disconnect(); } catch {}
    try { loop.lfo.disconnect(); } catch {}
    try { loop.lp.disconnect(); } catch {}
    try { loop.master.disconnect(); } catch {}
  }, Math.round((dur + 0.1) * 1000));
}

export async function play(kind = "toggle") {
  if (!isEnabled()) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch {}
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  const base =
    kind === "key" ? 0.030 :
    kind === "click" ? 0.060 :
    kind === "toggle" ? 0.070 :
    0.12;
  const vol = Math.min(0.22, base * VOLUME_MULT);
  master.gain.setValueAtTime(vol, now);
  master.connect(ctx.destination);

  const env = (attack, decay, peak) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    g.connect(master);
    return g;
  };

  const osc = (type, freq, g) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    o.connect(g);
    return o;
  };

  if (kind === "key") {
    const t = nowMs();
    if (t - lastKeyAtMs < 34) return;
    lastKeyAtMs = t;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(1200, now);
    hp.Q.setValueAtTime(0.6, now);
    hp.connect(master);

    const g = env(0.002, 0.030, 0.030);
    g.disconnect();
    g.connect(hp);

    const base = 2200 + Math.random() * 520;
    const o = osc("triangle", base, g);
    o.frequency.exponentialRampToValueAtTime(base * 0.86, now + 0.026);
    o.start(now);
    o.stop(now + 0.040);

    window.setTimeout(() => {
      try { o.disconnect(); } catch {}
      try { g.disconnect(); } catch {}
      try { hp.disconnect(); } catch {}
    }, 120);
    return;
  }

  if (kind === "click" || kind === "toggle") {
    const t = nowMs();
    if (t - lastClickAtMs < 55) return;
    lastClickAtMs = t;

    const g = env(0.004, 0.090, kind === "toggle" ? 0.070 : 0.060);
    const base = kind === "toggle" ? 640 : 520;
    const o1 = osc("sine", base, g);
    o1.frequency.exponentialRampToValueAtTime(base * 0.84, now + 0.06);
    o1.start(now);
    o1.stop(now + 0.11);
    return;
  }

  if (kind === "send") {
    const g = env(0.008, 0.12, Math.min(0.16, 0.10 * VOLUME_MULT));
    const o1 = osc("sine", 920, g);
    const o2 = osc("sine", 640, g);
    o1.frequency.exponentialRampToValueAtTime(680, now + 0.10);
    o2.frequency.exponentialRampToValueAtTime(420, now + 0.10);
    o1.start(now); o2.start(now);
    o1.stop(now + 0.14); o2.stop(now + 0.14);
    return;
  }

  if (kind === "receive") {
    const g = env(0.010, 0.20, Math.min(0.16, 0.10 * VOLUME_MULT));
    const o1 = osc("sine", 640, g);
    const o2 = osc("sine", 980, g);
    o1.frequency.exponentialRampToValueAtTime(860, now + 0.14);
    o2.frequency.exponentialRampToValueAtTime(1280, now + 0.14);
    o1.start(now);
    o2.start(now + 0.012);
    o1.stop(now + 0.24);
    o2.stop(now + 0.22);
    return;
  }

  if (kind === "intro") {
    // Softer startup chime (best used on user interaction).
    const g = env(0.010, 0.34, 0.085);
    const o1 = osc("sine", 520, g);
    const o2 = osc("sine", 780, g);
    const o3 = osc("triangle", 1040, g);

    o1.frequency.exponentialRampToValueAtTime(680, now + 0.22);
    o2.frequency.exponentialRampToValueAtTime(980, now + 0.24);
    o3.frequency.exponentialRampToValueAtTime(1320, now + 0.26);

    o1.start(now);
    o2.start(now + 0.010);
    o3.start(now + 0.020);
    o1.stop(now + 0.42);
    o2.stop(now + 0.40);
    o3.stop(now + 0.38);
    return;
  }

  const g = env(0.006, 0.06, 0.10);
  const o = osc("triangle", 1150, g);
  o.start(now);
  o.stop(now + 0.08);
}
