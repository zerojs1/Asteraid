// audioManager.js
// Minimal procedural audio manager for Asteraid
// WebAudio-based SFX with NES-style timbres (square/saw/noise), master/sfx/music gain, and unlock-on-gesture.

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this._unlockHandlersBound = false;

    // Nodes
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.compressor = null;

    // Cached buffers
    this._noiseBuffer = null;

    // Settings (defaults). Master at 20% by default
    this.masterVolume = 0.2;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.6;

    // Runtime state
    this._thrust = null; // { src, osc, lp, g }
    this._music = { timer: null, mode: null, nextBeat: 0, bpm: 110 };

    // Lazily create context to comply with autoplay policies
    this._initContext();
    this.bindUnlockToGestures(document);
  }

  _sfxChargeStart(t, p = {}) {
    // Quick up-chirp shimmer
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const g = this._envGain(t, 0.001, 0.08, 0.06, 0.4);
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(1000, t + 0.14);
    o.detune.value = (Math.random() - 0.5) * 10;
    o.connect(g);
    this._connectSfx(g, p.pan);
    o.start(t);
    o.stop(t + 0.16);
  }

  _sfxChargeTick(t, args = {}) {
    // Small periodic ping that rises with progress
    const { progress = 0 } = args;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    const g = this._envGain(t, 0.001, 0.03, 0.03, 0.25 + 0.25 * progress);
    const f = 900 + 500 * progress;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = (Math.random() - 0.5) * 8;
    o.connect(g);
    this._connectSfx(g, args.pan);
    o.start(t);
    o.stop(t + 0.08);
  }

  _sfxChargeRelease(t, args = {}) {
    // Punchy release accent layered on top of bullet SFX
    const { level = 1 } = args;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const g = this._envGain(t, 0.001, 0.06 + 0.04 * level, 0.05, 0.55 + 0.15 * level);
    const start = level >= 2 ? 1800 : 1300;
    const end = level >= 2 ? 420 : 520;
    o.frequency.setValueAtTime(start, t);
    o.frequency.exponentialRampToValueAtTime(end, t + 0.14 + 0.04 * level);
    o.detune.value = (Math.random() - 0.5) * 12;
    o.connect(g);
    this._connectSfx(g, args.pan);
    o.start(t);
    o.stop(t + 0.22);
  }

  _sfxInvisible(t, p = {}) {
    // Short shimmer + faint noise
    const tri = this.ctx.createOscillator();
    tri.type = 'triangle';
    const g = this._envGain(t, 0.002, 0.1, 0.12, 0.45);
    tri.frequency.setValueAtTime(700, t);
    tri.frequency.exponentialRampToValueAtTime(1200, t + 0.18);
    tri.detune.value = (Math.random() - 0.5) * 8;
    tri.connect(g);
    this._connectSfx(g, p.pan);
    tri.start(t);
    tri.stop(t + 0.22);
    this._playNoise(t + 0.02, 0.001, 0.05, 0.06, { lpStart: 7000, lpEnd: 2600, gainMul: 0.18 });
  }

  _sfxRainbow(t, p = {}) {
    // Bright two-note major-ish interval
    const freqs = [660, 880, 990];
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'square';
      const g = this._envGain(t, 0.001, 0.1, 0.12, 0.35);
      o.frequency.setValueAtTime(f, t);
      o.detune.value = (Math.random() - 0.5) * 10;
      o.connect(g);
      this._connectSfx(g, p.pan);
      o.start(t);
      o.stop(t + 0.24);
    });
  }

  _sfxClone(t, p = {}) {
    // Techy deploy chirp
    const o = this.ctx.createOscillator();
    o.type = 'square';
    const g = this._envGain(t, 0.001, 0.07, 0.06, 0.4);
    o.frequency.setValueAtTime(740, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.12);
    o.detune.value = (Math.random() - 0.5) * 10;
    o.connect(g);
    this._connectSfx(g, p.pan);
    o.start(t);
    o.stop(t + 0.16);
  }

  _sfxBomb(t, p = {}) {
    // Brief warning blip prior to explosion use
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const g = this._envGain(t, 0.001, 0.05, 0.05, 0.35);
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(340, t + 0.1);
    o.detune.value = (Math.random() - 0.5) * 10;
    o.connect(g);
    this._connectSfx(g, p.pan);
    o.start(t);
    o.stop(t + 0.12);
  }

  // --- Music ---
  startMusic(mode = 'game', bpm = 110) {
    if (!this.ctx || !this.musicGain) return;
    this.stopMusic();
    this._music.mode = mode;
    this._music.bpm = bpm;
    this._music.nextBeat = this.ctx.currentTime + 0.05;
    const scheduleAhead = 0.3;
    const intervalMs = 80;
    this._music.timer = setInterval(() => this._musicTick(scheduleAhead), intervalMs);
  }

  stopMusic() {
    if (this._music.timer) {
      clearInterval(this._music.timer);
      this._music.timer = null;
    }
    // Music notes are one-shots; nothing persistent to stop.
  }

  _musicTick(scheduleAhead) {
    const ctx = this.ctx;
    if (!ctx) return;
    const secPerBeat = 60 / this._music.bpm;
    const now = ctx.currentTime;
    while (this._music.nextBeat < now + scheduleAhead) {
      const t = this._music.nextBeat;
      // Simple two-voice loop
      const beatIndex = Math.floor((t / secPerBeat) % 16);
      const mode = this._music.mode || 'game';
      const { bassFreq, leadFreq, hit } = this._musicPattern(mode, beatIndex);
      if (bassFreq) this._musicNote(t, 'triangle', bassFreq, 0.14, 0.22, 0.22, 0.25);
      if (leadFreq) this._musicNote(t, 'square', leadFreq, 0.008, 0.12, 0.12, 0.18);
      if (hit) this._musicNoise(t, 0.001, 0.03, 0.04, 0.08);
      this._music.nextBeat += secPerBeat;
    }
  }

  _musicPattern(mode, i) {
    // Return bass/lead for 16-step pattern
    if (mode === 'menu') {
      const bassSeq = [220, null, 220, null, 196, null, 220, null, 220, null, 220, null, 196, null, 247, null];
      const leadSeq = [null, 440, null, 494, null, 440, null, 392, null, 440, null, 494, null, 440, null, 523];
      return { bassFreq: bassSeq[i % 16], leadFreq: leadSeq[i % 16], hit: i % 4 === 0 };
    }
    // game
    const bassSeq = [110, null, 110, 110, 98, null, 110, null, 110, null, 123, null, 110, null, 98, null];
    const leadSeq = [330, null, 349, null, 392, null, 349, null, 330, null, 392, null, 440, null, 392, null];
    return { bassFreq: bassSeq[i % 16], leadFreq: leadSeq[i % 16], hit: i % 8 === 0 };
  }

  _musicNote(t, type, freq, a, d, r, gainMul) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = this._envGain(t, a, d, r, gainMul);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + a + d + r + 0.02);
  }

  _musicNoise(t, a, d, r, gainMul) {
    this._playNoise(t, a, d, r, { lpStart: 4000, lpEnd: 1400, gainMul });
  }

  _initContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      console.warn('WebAudio not supported. Audio disabled.');
      return;
    }
    this.ctx = new AC({ latencyHint: 'interactive' });

    // Graph: sfx/music -> compressor -> master -> destination
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();

    this.masterGain.gain.value = this.masterVolume;
    this.sfxGain.gain.value = this.sfxVolume;
    this.musicGain.gain.value = this.musicVolume;

    // Mild compression to avoid clipping
    try {
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.15;
    } catch (e) {}

    this.sfxGain.connect(this.compressor);
    this.musicGain.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Prepare shared noise buffer
    this._noiseBuffer = this._createNoiseBuffer();
  }

  bindUnlockToGestures(target = document) {
    if (this._unlockHandlersBound) return;
    const tryUnlock = () => this.unlock();
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => target.addEventListener(ev, tryUnlock, { passive: true, once: true }));
    this._unlockHandlersBound = true;
  }

  async unlock() {
    if (!this.ctx) this._initContext();
    if (!this.ctx) return false;
    if (this.unlocked) return true;
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      // Play a silent tick to fully prime on some browsers
      const t = this.ctx.currentTime + 0.01;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 440;
      o.connect(g).connect(this.sfxGain);
      o.start(t);
      o.stop(t + 0.01);
      this.unlocked = true;
      return true;
    } catch (e) {
      console.warn('Audio unlock failed:', e);
      return false;
    }
  }

  setMasterVolume(v) { this.masterVolume = clamp01(v); if (this.masterGain) this.masterGain.gain.value = this.masterVolume; }
  setSfxVolume(v) { this.sfxVolume = clamp01(v); if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume; }
  setMusicVolume(v) { this.musicVolume = clamp01(v); if (this.musicGain) this.musicGain.gain.value = this.musicVolume; }

  muteAll(muted) {
    if (!this.masterGain) return;
    this.masterGain.gain.value = muted ? 0 : this.masterVolume;
  }

  // Core SFX API
  playSfx(name, opts = {}) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;
    switch (name) {
      case 'bullet': return this._sfxBullet(t0, opts);
      case 'flak': return this._sfxFlak(t0, opts);
      case 'laser': return this._sfxLaser(t0, opts);
      case 'explosion': return this._sfxExplosion(t0, opts);
      case 'shield': return this._sfxShield(t0, opts);
      case 'teleport': return this._sfxTeleport(t0, opts);
      case 'hit': return this._sfxHit(t0, opts);
      case 'chargeStart': return this._sfxChargeStart(t0, opts);
      case 'chargeTick': return this._sfxChargeTick(t0, opts);
      case 'chargeRelease': return this._sfxChargeRelease(t0, opts);
      case 'invisible': return this._sfxInvisible(t0, opts);
      case 'rainbow': return this._sfxRainbow(t0, opts);
      case 'clone': return this._sfxClone(t0, opts);
      case 'bomb': return this._sfxBomb(t0, opts);
      default:
        // no-op unknown
        return;
    }
  }

  // Thrust loop control
  startThrust() {
    if (!this.ctx || this._thrust) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    if (!this._noiseBuffer) this._noiseBuffer = this._createNoiseBuffer();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    const hum = this.ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.setValueAtTime(90, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // small fade-in
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    // subtle LPF wobble via LFO for life
    let lfo = null, lfoG = null;
    try {
      lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.7, t);
      lfoG = this.ctx.createGain();
      lfoG.gain.setValueAtTime(120, t); // +/-120 Hz wobble
      lfo.connect(lfoG).connect(lp.frequency);
      lfo.start();
    } catch (e) { lfo = null; lfoG = null; }
    src.connect(lp).connect(g);
    this._connectSfx(g, 0);
    hum.connect(g);
    src.start();
    hum.start();
    this._thrust = { src, lp, hum, g, lfo, lfoG };
  }

  stopThrust() {
    if (!this._thrust) return;
    const { src, hum, g, lfo, lfoG } = this._thrust;
    const t = this.ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      setTimeout(() => {
        try { src.stop(); hum.stop(); if (lfo) lfo.stop(); } catch (e) {}
      }, 90);
    } catch (e) {
      try { src.stop(); hum.stop(); if (lfo) lfo.stop(); } catch (e2) {}
    }
    this._thrust = null;
  }

  // --- SFX implementations ---
  _sfxBullet(t, p = {}) {
    const { charge = 0 } = p;
    const baseHz = charge >= 2 ? 520 : charge === 1 ? 460 : 420;
    const dur = charge >= 1 ? 0.11 : 0.08;
    const slide = charge >= 2 ? -220 : -160;
    const g = this._envGain(t, 0.002, 0.06 + dur * 0.4, 0.04);
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(baseHz + (Math.random() - 0.5) * 25, t);
    o.frequency.linearRampToValueAtTime(baseHz + slide, t + dur);
    o.detune.value = (Math.random() - 0.5) * 15;
    // Light layering: a quieter detuned copy
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.setValueAtTime(baseHz * 0.995, t);
    o2.frequency.linearRampToValueAtTime((baseHz + slide) * 0.995, t + dur);
    const g2 = this._envGain(t, 0.002, 0.05 + dur * 0.35, 0.04, 0.4);
    o.connect(g);
    o2.connect(g2);
    this._connectSfx(g, p.pan);
    this._connectSfx(g2, p.pan);
    o.start(t);
    o.stop(t + dur + 0.08);
    o2.start(t);
    o2.stop(t + dur + 0.08);
    // Tiny transient noise for attack
    this._playNoise(t, 0.0015, 0.02, 0.02, { lpStart: 7000, lpEnd: 2500, gainMul: 0.18 });
  }

  _sfxFlak(t, p = {}) {
    // Shotgun-like chuff: brief noise burst + low square thunk
    // Noise
    const n = this._playNoise(t, 0.02, 0.15, 0.18, { lpStart: 6000, lpEnd: 1400 });
    // Low square
    const g = this._envGain(t, 0.001, 0.06, 0.08, 0.8);
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    o.detune.value = (Math.random() - 0.5) * 12;
    o.connect(g);
    this._connectSfx(g, p.pan);
    o.start(t);
    o.stop(t + 0.15);
    return { n, o };
  }

  _sfxLaser(t, p = {}) {
    // Bright saw zap with quick pitch fall and bandpass color
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const g = this._envGain(t, 0.001, 0.14, 0.06, 0.7);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, t);
    bp.Q.value = 3.5;
    o.frequency.setValueAtTime(1600, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.18);
    // Subtle drive for richness
    const dist = this._createDistortion(8);
    o.detune.value = (Math.random() - 0.5) * 10;
    o.connect(bp).connect(dist).connect(g);
    this._connectSfx(g, p.pan);
    o.start(t);
    o.stop(t + 0.22);
  }

  _sfxExplosion(t, p = {}) {
    const { radius = 80, profile = 'default' } = p;
    // White noise burst with decaying LPF; scale with radius
    const scale = Math.max(0.35, Math.min(1.0, radius / 150));
    const attack = 0.004;
    const decay = 0.28 + 0.25 * scale;
    const rel = 0.22 + 0.2 * scale;
    const lpStart = 8000 * scale + 2000;
    const lpEnd = 600 + 400 * scale;
    this._playNoise(t, attack, decay, rel, { lpStart, lpEnd, gainMul: 0.9 * scale });
    // Add a low sine boom
    const g = this._envGain(t + 0.01, 0.005, 0.18 + 0.12 * scale, 0.22, 0.7 * scale);
    const s = this.ctx.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(140, t);
    s.frequency.exponentialRampToValueAtTime(60, t + 0.34);
    s.detune.value = (Math.random() - 0.5) * 6;
    s.connect(g);
    this._connectSfx(g, (typeof p.pan === 'number') ? p.pan : (Math.random() * 0.6 - 0.3));
    s.start(t);
    s.stop(t + 0.5);
  }

  _sfxShield(t, p = {}) {
    // Warm square+triangle chord-ish whoom
    const root = 330;
    const osc = [root, root * 1.25, root * 1.5].map((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'square';
      o.frequency.setValueAtTime(f, t);
      o.detune.value = (Math.random() - 0.5) * 6;
      return o;
    });
    const g = this._envGain(t, 0.005, 0.25, 0.35, 0.6);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    osc.forEach(o => o.connect(lp));
    lp.connect(g);
    this._connectSfx(g, p.pan);
    osc.forEach(o => { o.start(t); o.stop(t + 0.6); });
  }

  _sfxTeleport(t, p = {}) {
    const { phase = 'depart' } = p;
    if (phase === 'depart') {
      // Up-chirp shimmer + small noise
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      const g = this._envGain(t, 0.002, 0.12, 0.12, 0.5);
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(1200, t + 0.22);
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(g);
      this._connectSfx(g, p.pan);
      o.start(t);
      o.stop(t + 0.26);
      this._playNoise(t, 0.001, 0.06, 0.06, { lpStart: 6000, lpEnd: 2000, gainMul: 0.25 });
    } else {
      // Down-chirp arrival with brief sparkle
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const g = this._envGain(t, 0.002, 0.12, 0.12, 0.5);
      o.frequency.setValueAtTime(1200, t);
      o.frequency.exponentialRampToValueAtTime(360, t + 0.22);
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(g);
      this._connectSfx(g, p.pan);
      o.start(t);
      o.stop(t + 0.26);
      this._playNoise(t + 0.04, 0.001, 0.05, 0.08, { lpStart: 7000, lpEnd: 2400, gainMul: 0.22 });
    }
  }

  _sfxHit(t, p = {}) {
    // Brief noise tick + mid sine thud
    this._playNoise(t, 0.001, 0.03, 0.04, { lpStart: 5000, lpEnd: 1800, gainMul: 0.3 });
    const g = this._envGain(t + 0.005, 0.001, 0.05, 0.06, 0.5);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.09);
    o.detune.value = (Math.random() - 0.5) * 6;
    o.connect(g);
    this._connectSfx(g, p.pan);
    o.start(t);
    o.stop(t + 0.12);
  }

  // --- helpers ---
  _envGain(t, attack, decay, release, gainMul = 1.0) {
    const g = this.ctx.createGain();
    const now = t;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainMul), now + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainMul * 0.35), now + attack + decay);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay + release);
    return g;
  }

  _connectSfx(g, pan) {
    // Route effect gain through an optional stereo panner to sfx bus
    try {
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        const pn = (typeof pan === 'number') ? pan : (Math.random() * 0.3 - 0.15);
        p.pan.value = Math.max(-1, Math.min(1, pn));
        g.connect(p).connect(this.sfxGain);
        return p;
      }
    } catch (e) {}
    g.connect(this.sfxGain);
    return this.sfxGain;
  }

  _createDistortion(k = 4) {
    // Simple tanh-like waveshaper for subtle edge
    const ws = this.ctx.createWaveShaper();
    const n = 256;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }

  _createNoiseBuffer() {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _playNoise(t, attack, decay, release, { lpStart = 8000, lpEnd = 1200, gainMul = 1.0 } = {}) {
    if (!this._noiseBuffer) this._noiseBuffer = this._createNoiseBuffer();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lpStart, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(100, lpEnd), t + attack + decay + release);
    const g = this._envGain(t, attack, decay, release, gainMul);
    src.connect(lp).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + attack + decay + release + 0.02);
    return src;
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
