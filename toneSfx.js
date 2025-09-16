// toneSfx.js
// Tone.js-powered SFX layer for Asteraid
// Provides a small, cached toolkit of synths/noise and a unified play(name, opts) API.
// This module is optional; it fails gracefully if Tone.js isn’t available.

export class ToneSFX {
  constructor() {
    this.enabled = !!(window.Tone);
    this.started = false;
    this._bindedUnlock = false;
    this._initTime = 0;

    // Nodes
    this.limiter = null;
    this.comp = null;
    this.sfxVol = null;

    // Instruments (reused)
    this.noise = null;      // NoiseSynth for explosions/hits
    this.synth = null;      // PolySynth for general beeps
    this.metal = null;      // MetalSynth for laser-ish zaps
    this.membrane = null;   // MembraneSynth for booms
    this.pluck = null;      // PluckSynth for UI/teleport sparkles

    // Rate-limit bookkeeping
    this._lastAt = new Map(); // key -> seconds

    if (this.enabled) {
      this._initGraph();
      this._bindUnlockGestures();
    }
  }

  _initGraph() {
    const Tone = window.Tone;
    // Routing: instruments -> comp -> limiter -> destination
    this.sfxVol = new Tone.Volume(-6);
    this.comp = new Tone.Compressor({ threshold: -18, ratio: 6, attack: 0.003, release: 0.12 });
    this.limiter = new Tone.Limiter(-1);
    this.sfxVol.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.toDestination();

    // Instruments
    this.noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.12 }
    }).connect(this.sfxVol);

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' },
      envelope: { attack: 0.003, decay: 0.12, sustain: 0.1, release: 0.12 }
    }).connect(this.sfxVol);

    this.metal = new Tone.MetalSynth({
      frequency: 200,
      envelope: { attack: 0.001, decay: 0.18, release: 0.12 },
      harmonicity: 3.1,
      modulationIndex: 16,
      resonance: 4000,
      octaves: 1.5
    }).connect(this.sfxVol);

    this.membrane = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2 }
    }).connect(this.sfxVol);

    this.pluck = new Tone.PluckSynth({
      attackNoise: 1,
      dampening: 6000,
      resonance: 0.4
    }).connect(this.sfxVol);
  }

  _bindUnlockGestures(target = document) {
    if (this._bindedUnlock || !this.enabled) return;
    const Tone = window.Tone;
    const unlock = async () => {
      try {
        await Tone.start();
        this.started = true;
        this._initTime = Tone.now();
      } catch (e) { /* ignore */ }
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
      try { target.addEventListener(ev, unlock, { passive: true, once: true }); } catch (e) {}
    });
    this._bindedUnlock = true;
  }

  setVolume(db) {
    if (!this.enabled || !this.sfxVol) return;
    try { this.sfxVol.volume.value = db; } catch (e) {}
  }
  // Convenience: 0..1 linear slider -> decibels (log mapping), clamped
  setNormalizedVolume(v) {
    if (!this.enabled || !this.sfxVol) return;
    const x = Math.max(0, Math.min(1, Number(v) || 0));
    // Map 0..1 to -60..0 dB logarithmically; avoid -Infinity
    const db = (x <= 0.001) ? -80 : Math.max(-60, 20 * Math.log10(x));
    try { this.sfxVol.volume.value = db; } catch (e) {}
  }

  // Rate-limit utility per name key (ms)
  _rateOk(key, rateMs = 0) {
    if (!rateMs) return true;
    const Tone = window.Tone;
    const now = Tone.now();
    const last = this._lastAt.get(key) || -1e9;
    if ((now - last) * 1000 < rateMs) return false;
    this._lastAt.set(key, now);
    return true;
  }

  play(name, opts = {}) {
    if (!this.enabled || !this.started) return;
    const Tone = window.Tone;
    const t = Tone.now();
    const pan = typeof opts.pan === 'number' ? opts.pan : (Math.random() * 0.3 - 0.15);

    switch (name) {
      case 'bullet': {
        if (!this._rateOk('bullet', 30)) return;
        const charge = opts.charge|0;
        const base = charge >= 2 ? 880 : charge >= 1 ? 740 : 620;
        // Two quick layered notes with slight detune
        this.synth.set({ oscillator: { type: 'square' } });
        this.synth.triggerAttackRelease(base, 0.07, t, 0.7);
        this.synth.triggerAttackRelease(base * 0.98, 0.06, t, 0.4);
        // Transient noise tick
        this.noise.envelope.set({ attack: 0.001, decay: 0.02, sustain: 0, release: 0.02 });
        this.noise.triggerAttackRelease(0.06, t + 0.001);
        break;
      }
      case 'shieldAbsorb': {
        if (!this._rateOk('shieldAbsorb', 30)) return;
        // brief shimmer + faint noise
        this.synth.set({ oscillator: { type: 'triangle' } });
        this.synth.triggerAttackRelease('G5', 0.08, t, 0.35);
        this.noise.envelope.set({ attack: 0.001, decay: 0.03, sustain: 0, release: 0.03 });
        this.noise.triggerAttackRelease(0.06, t + 0.005, 0.2);
        break;
      }
      case 'shieldBreak': {
        if (!this._rateOk('shieldBreak', 120)) return;
        // descending triad + small noise puff
        this.synth.set({ oscillator: { type: 'square' } });
        this.synth.triggerAttackRelease(['B4','A4','E4'], 0.18, t, 0.6);
        this.noise.envelope.set({ attack: 0.001, decay: 0.05, sustain: 0, release: 0.06 });
        this.noise.triggerAttackRelease(0.12, t + 0.02, 0.25);
        break;
      }
      case 'respawn': {
        if (!this._rateOk('respawn', 200)) return;
        // soft spawn chime
        this.synth.set({ oscillator: { type: 'sine' } });
        this.synth.triggerAttackRelease(['E5','G5'], 0.22, t, 0.5);
        break;
      }
      case 'bossBullet': {
        if (!this._rateOk('bossBullet', 25)) return;
        // punchy low tick
        this.membrane.triggerAttackRelease('D2', 0.06, t, 0.5);
        break;
      }
      case 'bossLaser': {
        if (!this._rateOk('bossLaser', 120)) return;
        // brighter zap
        this.metal.triggerAttackRelease('E5', 0.22, t, 0.7);
        break;
      }
      case 'slamWarn': {
        if (!this._rateOk('slamWarn', 200)) return;
        this.synth.set({ oscillator: { type: 'sine' } });
        this.synth.triggerAttackRelease('A4', 0.2, t, 0.6);
        break;
      }
      case 'slamHit': {
        if (!this._rateOk('slamHit', 200)) return;
        this.membrane.triggerAttackRelease('A1', 0.18, t, 0.9);
        break;
      }
      case 'flak': {
        if (!this._rateOk('flak', 60)) return;
        // Noise chuff + low thunk
        this.noise.envelope.set({ attack: 0.01, decay: 0.12, sustain: 0, release: 0.12 });
        this.noise.triggerAttackRelease(0.18, t);
        this.membrane.triggerAttackRelease('F2', 0.12, t + 0.005, 0.7);
        break;
      }
      case 'laser': {
        if (!this._rateOk('laser', 60)) return;
        this.metal.triggerAttackRelease('C5', 0.18, t, 0.6);
        break;
      }
      case 'chargeStart': {
        if (!this._rateOk('chargeStart', 80)) return;
        this.synth.set({ oscillator: { type: 'sine' } });
        this.synth.triggerAttackRelease('E5', 0.12, t, 0.5);
        break;
      }
      case 'chargeRelease': {
        if (!this._rateOk('chargeRelease', 60)) return;
        const level = (opts.level|0) || 1;
        const n = level >= 2 ? 'A5' : 'G5';
        this.synth.set({ oscillator: { type: 'sawtooth' } });
        this.synth.triggerAttackRelease(n, 0.16 + 0.04 * level, t, 0.7);
        break;
      }
      case 'shield': {
        this.synth.set({ oscillator: { type: 'triangle' } });
        this.synth.triggerAttackRelease(['E4', 'G4', 'B4'], 0.4, t, 0.6);
        break;
      }
      case 'teleport': {
        const phase = opts.phase === 'arrive' ? 'arrive' : 'depart';
        if (phase === 'depart') {
          this.pluck.triggerAttackRelease('A5', 0.18, t, 0.5);
        } else {
          this.pluck.triggerAttackRelease('E5', 0.18, t, 0.5);
        }
        break;
      }
      case 'bomb': {
        if (!this._rateOk('bomb', 120)) return;
        this.synth.set({ oscillator: { type: 'sine' } });
        this.synth.triggerAttackRelease('C4', 0.1, t, 0.5);
        break;
      }
      case 'hit': {
        if (!this._rateOk('hit', 40)) return;
        this.noise.envelope.set({ attack: 0.001, decay: 0.03, sustain: 0, release: 0.04 });
        this.noise.triggerAttackRelease(0.08, t);
        this.membrane.triggerAttackRelease('E2', 0.08, t + 0.005, 0.4);
        break;
      }
      case 'explosion': {
        if (!this._rateOk('explosion', 50)) return;
        const radius = Math.max(10, Math.min(400, opts.radius || 80));
        const vol = Math.min(0.9, 0.3 + radius / 400);
        // Noise burst + low boom
        this.noise.envelope.set({ attack: 0.003, decay: 0.22 + radius / 600, sustain: 0, release: 0.22 });
        this.noise.triggerAttackRelease(0.5, t, vol);
        this.membrane.triggerAttackRelease('A1', 0.28, t + 0.01, Math.min(1.0, 0.6 + radius / 400));
        break;
      }
      // UI and misc additions
      case 'ui_click': {
        if (!this._rateOk('ui_click', 60)) return;
        this.pluck.triggerAttackRelease('C6', 0.06, t, 0.5);
        break;
      }
      case 'ui_move': {
        if (!this._rateOk('ui_move', 30)) return;
        // short tick
        this.synth.set({ oscillator: { type: 'triangle' } });
        this.synth.triggerAttackRelease('E6', 0.04, t, 0.35);
        break;
      }
      case 'ui_back': {
        if (!this._rateOk('ui_back', 60)) return;
        this.pluck.triggerAttackRelease('A5', 0.07, t, 0.5);
        break;
      }
      case 'levelup': {
        this.synth.set({ oscillator: { type: 'triangle' } });
        this.synth.triggerAttackRelease(['E5', 'G5', 'B5'], 0.32, t, 0.7);
        break;
      }
      // Hazard/boss hooks (placeholders to wire progressively)
      case 'wormhole': {
        if (!this._rateOk('wormhole', 200)) return;
        this.metal.triggerAttackRelease('C4', 0.12, t, 0.5);
        break;
      }
      case 'gravityPulse': {
        if (!this._rateOk('gravityPulse', 200)) return;
        this.membrane.triggerAttackRelease('D2', 0.2, t, 0.6);
        break;
      }
      default:
        // Unknown: no-op
        break;
    }
  }
}
