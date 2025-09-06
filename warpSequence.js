// warpSequence.js
// Start-of-game warp sequence: tunnel rings + spiral, star streaks, debris parallax,
// exit bloom + iris-like shrink, vignette and scanline overlay, UI countdown (no skip).
// Self-contained; renders into an offscreen layer then blits atop the main canvas.

export class WarpSequence {
  constructor(opts = {}) {
    this.canvas = opts.canvas; // main canvas for sizing
    this.audio = opts.audio || null; // AudioManager instance
    this.glRenderer = opts.glRenderer || null; // optional WebGL overlay (unused for now)

    // Offscreen layer for warp rendering so we can scale/fade it for the iris exit
    this.layer = document.createElement('canvas');
    this.layerCtx = this.layer.getContext('2d');

    // Internal state
    this.width = (this.canvas && this.canvas.width) || 800;
    this.height = (this.canvas && this.canvas.height) || 600;
    this.cx = this.width * 0.5;
    this.cy = this.height * 0.5;

    this._resizeLayer();

    // Timeline phases
    this.phase = 'idle'; // 'spinup' -> 'max' -> 'brake' -> 'exit' -> 'done'
    this.t = 0; // seconds in current phase

    // Phase durations (seconds) — extend overall by ~2s (hold at peak)
    this.durSpin = 0.70;
    this.durMax = 2.60; // was 0.60 (+2.0s)
    this.durBrake = 0.50;
    this.durExit = 0.25;

    // Visual params
    this.starSpeedMul = 1.0; // published to main loop
    this.flashAlpha = 0; // white additive flash at exit
    this.irisScale = 1; // global scale for iris-like shrink of the warp layer
    this.vignetteTight = 0; // 0..1 vignette strength towards peak

    // Tunnel ring cache setup
    this.ringTime = 0;

    // Star streaks and debris
    this.stars = [];
    this.debris = [];
    this._initParticles();

    // Background warp stars (drawn beneath tunnel/debris/UI)
    // Tweakable config: adjust density, sizes, and speed behavior from one place
    this.bgCfg = {
      count: 400,            // density: number of background stars
      speedBase: 200,        // px/s base radial speed
      speedVar: 420,         // px/s added random range
      sizeMin: 0.2,          // minimum line width base
      sizeVar: 0.6,          // added random to size
      alphaMin: 0.11,        // min alpha per star
      alphaVar: 0.45,        // additional alpha range
      speedMulScale: 0.22,   // how much phase speed (starSpeedMul) influences bg star speed
      overallSpeedFactor: 0.2 // global multiplier to slow/speed all bg stars (0.5 = 50% speed)
    };
    this.bgStars = [];
    this._initBgStars();

    // UI
    this.countdownVal = 3; // 3-2-1
    this.countdownTimer = 0;
  }

  _resizeLayer() {
    const w = this.width;
    const h = this.height;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.dpr = dpr;
    this.layer.width = Math.ceil(w * dpr);
    this.layer.height = Math.ceil(h * dpr);
    this.layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layerCtx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in this.layerCtx) this.layerCtx.imageSmoothingQuality = 'high';
  }

  _initParticles() {
    // Populate stars
    const starCount = 200; // lightweight
    this.stars.length = 0;
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        a: Math.random() * Math.PI * 2, // angle
        r: Math.random() * Math.hypot(this.width, this.height) * 0.6 + 30,
        s: 120 + Math.random() * 260, // radial speed px/s baseline
        hue: 180 + Math.random() * 40, // cyan-blue hues
      });
    }
    // Debris silhouettes (slow parallax)
    const debrisCount = 10;
    this.debris.length = 0;
    for (let i = 0; i < debrisCount; i++) {
      const size = 50 + Math.random() * 180;
      this.debris.push({
        x: (Math.random() - 0.5) * this.width * 1.8 + this.cx,
        y: (Math.random() - 0.5) * this.height * 1.8 + this.cy,
        z: 0.3 + Math.random() * 0.6, // parallax depth 0.3..0.9 (lower = larger/slower)
        rot: Math.random() * Math.PI * 2,
        rotS: (Math.random() * 2 - 1) * 0.6, // rad/s
        size,
        alpha: 0.10 + Math.random() * 0.12,
      });
    }
  }

  _initBgStars() {
    // Dense radial stars that zoom outward beneath the primary warp visuals
    const count = this.bgCfg.count; // performance-friendly; appears dense due to streaks
    this.bgStars.length = 0;
    const maxR = Math.hypot(this.width, this.height) * 0.75;
    for (let i = 0; i < count; i++) {
      this.bgStars.push({
        r: Math.random() * maxR,
        a: Math.random() * Math.PI * 2,
        s: this.bgCfg.speedBase + Math.random() * this.bgCfg.speedVar, // px/s base radial speed
        size: this.bgCfg.sizeMin + Math.random() * this.bgCfg.sizeVar,
        b: 0.4 + Math.random() * 0.6,  // brightness 0..1 (kept implicit, alpha uses cfg below)
      });
    }
  }

  start() {
    this.phase = 'spinup';
    this.t = 0;
    this.flashAlpha = 0;
    this.irisScale = 1;
    this.vignetteTight = 0;
    this.countdownVal = 6;
    this.countdownTimer = 0.001; // force immediate first update to show 3
    // Audio: start a subtle thrust/hum ramping
    try { if (this.audio) this.audio.startThrust(); } catch (e) {}
    // Start warp loop
    try { if (this.audio) this.audio.startWarpLoop(); } catch (e) {}
    // Optional initial telegraph ping
    //try { if (this.audio) this.audio.playSfx('chargeStart'); } catch (e) {}
  }

  isDone() { return this.phase === 'done'; }

  skip() {
    // Skipping disabled intentionally for immersion.
    return;
  }

  getStarSpeedMul() { return this.starSpeedMul; }

  update(dt) {
    if (this.phase === 'idle' || this.phase === 'done') return;
    const g = this.layerCtx;
    // Timeline advance
    this.t += dt;

    // Countdown ticks every ~0.5s during spinup and max
    if (this.phase === 'spinup' || this.phase === 'max') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.countdownTimer += 0.8;
        if (this.countdownVal > 1) {
          this.countdownVal--;
          try { if (this.audio) this.audio.playSfx('chargeTick', { progress: (3 - this.countdownVal) / 3 }); } catch (e) {}
        }
      }
    }

    // Phase logic
    switch (this.phase) {
      case 'spinup': {
        const p = Math.min(1, this.t / this.durSpin);
        const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
        this.starSpeedMul = 1.0 + ease * 18.0; // 1 -> 19
        this.vignetteTight = ease;
        if (this.t >= this.durSpin) {
          this.phase = 'max';
          this.t = 0;
          // Accent
          //try { if (this.audio) this.audio.playSfx('teleport', { phase: 'depart' }); } catch (e) {}
        }
        break;
      }
      case 'max': {
        const p = Math.min(1, this.t / this.durMax);
        this.starSpeedMul = 19.0 + (Math.sin(p * Math.PI * 2) * 0.5); // slight oscillation
        this.vignetteTight = 1;
        if (this.t >= this.durMax) { this.phase = 'brake'; this.t = 0; }
        break;
      }
      case 'brake': {
        const p = Math.min(1, this.t / this.durBrake);
        const ease = 1 - Math.pow(1 - p, 3);
        this.starSpeedMul = 19.0 - ease * 18.0; // 19 -> 1
        this.vignetteTight = 1 - ease * 0.8;
        if (this.t >= this.durBrake) {
          this.phase = 'exit';
          this.t = 0;
          // Peak flash + thump
          this.flashAlpha = 1;
          try { if (this.audio) this.audio.playSfx('explosion', { radius: 120 }); } catch (e) {}
          // Stop hum
          try { if (this.audio) this.audio.stopThrust(); } catch (e) {}
          // Stop warp loop
          try { if (this.audio) this.audio.stopWarpLoop(); } catch (e) {}
        }
        break;
      }
      case 'exit': {
        const p = Math.min(1, this.t / this.durExit);
        const ease = p * p; // easeInQuad
        this.irisScale = Math.max(0.18, 1 - ease * 0.9);
        this.starSpeedMul = 1.0;
        this.flashAlpha = Math.max(0, 1 - p);
        if (this.t >= this.durExit) { this.phase = 'done'; this.t = 0; }
        break;
      }
    }

    // Animate rings/stars/debris state
    this.ringTime += dt;
    const speed = 400 * (this.getStarSpeedMul() / 19); // normalized ring drift

    // Animate background zooming stars (beneath main warp visuals)
    if (this.bgStars && this.bgStars.length) {
      const maxR = Math.hypot(this.width, this.height) * 0.9;
      const mul = 0.6 + this.getStarSpeedMul() * this.bgCfg.speedMulScale; // scale with phase speed
      for (const s of this.bgStars) {
        // Apply global slowdown/speedup factor
        s.r += (s.s * mul) * dt * this.bgCfg.overallSpeedFactor;
        if (s.r > maxR) {
          s.r = 10 + Math.random() * 30;
          s.a = Math.random() * Math.PI * 2;
          s.s = this.bgCfg.speedBase + Math.random() * this.bgCfg.speedVar;
          s.size = this.bgCfg.sizeMin + Math.random() * this.bgCfg.sizeVar;
          s.b = 0.4 + Math.random() * 0.6;
        }
      }
    }
    for (const s of this.stars) {
      // spiral outward drift; curve by sinusoidal wobble
      const spiral = 0.8 + Math.sin((this.ringTime * 2) + s.a * 3) * 0.35;
      s.r += (s.s * (0.3 + this.getStarSpeedMul() * 0.04)) * dt;
      s.a += 0.3 * dt * spiral; // mild angular drift
      // recycle if offscreen far
      const maxR = Math.hypot(this.width, this.height) * 0.9;
      if (s.r > maxR) {
        s.r = 20 + Math.random() * 80;
        s.a = Math.random() * Math.PI * 2;
      }
    }
    for (const d of this.debris) {
      d.rot += d.rotS * dt;
      // drift gently towards center with parallax
      const toward = Math.atan2(this.cy - d.y, this.cx - d.x);
      const dist = 20 * (1 - d.z);
      d.x += Math.cos(toward) * dist * dt;
      d.y += Math.sin(toward) * dist * dt;
    }
  }

  draw(ctx) {
    if (this.phase === 'idle' || this.phase === 'done') return;
    const g = this.layerCtx;
    const w = this.width, h = this.height;
    const cx = this.cx, cy = this.cy;

    // Reset state and clear layer to OPAQUE BLACK using DPR-aware transform
    g.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);

    // Background radial star streaks (draw FIRST so other elements layer on top)
    if (this.bgStars && this.bgStars.length) {
      g.save();
      g.translate(cx, cy);
      g.globalCompositeOperation = 'lighter';
      for (const s of this.bgStars) {
        const len = Math.min(120, 8 + s.s * 0.04 * (0.8 + this.getStarSpeedMul() * 0.08));
        const x = Math.cos(s.a) * s.r;
        const y = Math.sin(s.a) * s.r;
        const px = Math.cos(s.a) * Math.max(0, s.r - len);
        const py = Math.sin(s.a) * Math.max(0, s.r - len);
        g.strokeStyle = 'rgba(255,255,255,1)';
        g.globalAlpha = Math.min(1, this.bgCfg.alphaMin + s.b * this.bgCfg.alphaVar);
        g.lineWidth = Math.max(1, s.size * (0.8 + this.getStarSpeedMul() * 0.06));
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(x, y);
        g.stroke();
      }
      g.restore();
    }

    // Draw warp tunnel rings (brighter + glow)
    g.save();
    g.translate(cx, cy);
    const ringCount = 18;
    const baseR = 18;
    for (let i = 0; i < ringCount; i++) {
      const t = this.ringTime + i * 0.13;
      const compress = 1.0 + Math.sin(t * 3.2) * 0.22; // spacing modulation
      const r = baseR + i * 26 * compress + (t * 150) % 26;
      const alpha = Math.max(0, 1 - i / ringCount) * 0.85; // brighter
      g.shadowColor = 'rgba(120,220,255,0.9)';
      g.shadowBlur = 12;
      g.beginPath();
      g.strokeStyle = `rgba(170,240,255,${alpha})`;
      g.lineWidth = 3.0;
      g.globalCompositeOperation = 'lighter';
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
      // spiral "curling" line with blur + trailing echoes
      g.filter = 'blur(0.6px)';
      g.beginPath();
      g.strokeStyle = `rgba(200,230,255,${alpha * 0.9})`;
      g.lineWidth = 1.6;
      const ang = (t * 1.6 + i * 0.25);
      const rx = Math.cos(ang) * r, ry = Math.sin(ang) * r;
      g.moveTo(rx, ry);
      g.lineTo(-rx * 0.2, -ry * 0.2);
      g.stroke();
      // trailing echoes
      for (let k = 1; k <= 3; k++) {
        const fade = (0.6 - k * 0.15) * alpha;
        if (fade <= 0) break;
        const angT = ang - k * 0.15;
        const rxT = Math.cos(angT) * r, ryT = Math.sin(angT) * r;
        g.beginPath();
        g.strokeStyle = `rgba(220,245,255,${fade})`;
        g.lineWidth = Math.max(0.8, 1.6 - k * 0.3);
        g.moveTo(rxT, ryT);
        g.lineTo(-rxT * 0.2, -ryT * 0.2);
        g.stroke();
      }
      g.filter = 'none';
    }
    g.restore();

    // Nonlinear star streaks (brighter)
    g.save();
    g.translate(cx, cy);
    for (const s of this.stars) {
      const lenBase = 6 + Math.min(48, s.r * 0.08 * (this.getStarSpeedMul() * 0.12 + 0.4));
      const len = lenBase * 2; // 100% longer trails
      const ang = s.a + Math.sin(s.a * 3 + this.ringTime * 2) * 0.08; // curvature
      const x = Math.cos(ang) * s.r;
      const y = Math.sin(ang) * s.r;
      const tail = 1.0;
      const x2 = Math.cos(ang - 0.05) * (s.r - len * tail);
      const y2 = Math.sin(ang - 0.05) * (s.r - len * tail);
      const hue = s.hue + Math.min(60, (this.getStarSpeedMul() - 1) * 3);
      // Gradient stroke: fully opaque from midpoint to head, fade to 0 at tail
      const grad = g.createLinearGradient(x2, y2, x, y);
      grad.addColorStop(0.0, `hsla(${hue|0}, 100%, 82%, 0.0)`); // tail end transparent
      grad.addColorStop(0.5, `hsla(${hue|0}, 100%, 82%, 1.0)`); // mid opaque
      grad.addColorStop(1.0, `hsla(${hue|0}, 100%, 82%, 1.0)`); // head opaque
      g.strokeStyle = grad;
      g.lineWidth = 1.6;
      g.shadowColor = 'rgba(200,240,255,0.9)';
      g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(x2, y2);
      g.lineTo(x, y);
      g.stroke();
    }
    g.restore();

    // Parallax debris silhouettes
    g.save();
    g.globalCompositeOperation = 'source-over';
    for (const d of this.debris) {
      g.save();
      g.translate(d.x, d.y);
      g.rotate(d.rot);
      const s = d.size * (1.2 - d.z * 0.6);
      g.fillStyle = `rgba(0,0,0,${d.alpha})`;
      g.strokeStyle = `rgba(80,120,160,${d.alpha * 0.2})`;
      g.lineWidth = 2;
      // blobby silhouette
      g.beginPath();
      g.ellipse(0, 0, s * 0.6, s * 0.4, 0.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    }
    g.restore();

    // Screen FX: vignette + scanline
    this._drawVignette(g, this.vignetteTight);
    this._drawScanlines(g);

    // UI: text (brighter), no skip
    this._drawUI(g);

    // Exit bloom flash
    if (this.flashAlpha > 0.001) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,255,255,${Math.min(1, this.flashAlpha)})`;
      g.fillRect(0, 0, w, h);
      g.restore();
    }

    // Blit to main canvas with iris-like global scale during exit
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.irisScale, this.irisScale);
    ctx.translate(-cx, -cy);
    ctx.drawImage(this.layer, 0, 0, w, h);
    ctx.restore();
  }

  _drawVignette(g, tight) {
    const w = this.width, h = this.height; const cx = this.cx, cy = this.cy;
    const inner = Math.min(w, h) * (0.42 + (1 - tight) * 0.10);
    const outer = Math.max(w, h) * 0.85;
    const grd = g.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grd.addColorStop(0.0, 'rgba(0,0,0,0.0)');
    grd.addColorStop(1.0, 'rgba(0,0,0,' + (0.28 + tight * 0.25).toFixed(3) + ')');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  _drawScanlines(g) {
    const w = this.width, h = this.height;
    g.save();
    g.globalAlpha = 0.08;
    g.fillStyle = '#000';
    const step = 3; // every 3px
    for (let y = 0; y < h; y += step) {
      g.fillRect(0, y, w, 1);
    }
    g.restore();
  }

  _drawUI(g) {
    const w = this.width; const h = this.height;
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Title
    g.font = 'bold 44px Orbitron, monospace';
    g.fillStyle = 'rgba(255,255,255,0.98)';
    g.shadowBlur = 18; g.shadowColor = 'rgba(0,255,255,0.85)';
    g.fillText('WARPING…', this.cx, this.cy - 44);
    // Countdown
    g.shadowBlur = 22; g.shadowColor = 'rgba(120,220,255,0.95)';
    g.font = 'bold 66px Orbitron, monospace';
    const txt = String(this.countdownVal);
    g.fillStyle = 'rgba(240,255,255,1.0)'; // brighter
    g.fillText(txt, this.cx, this.cy);
    g.restore();
  }
}
