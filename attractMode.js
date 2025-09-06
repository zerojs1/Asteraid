// Asteraid Attract Mode (Start Screen)
// Cosmetic flyby rendering; no gameplay (collisions/AI/bullets/powerups/explosions).
// Optional lightweight ambient asteroids (visual-only) can be shown behind the flyby.

import { Asteroid } from './asteroid.js';
import { Particle } from './particle.js';

export class AttractMode {
  constructor({ canvas, ctx, tracer, accents, cosmeticsResolver } = {}) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.isActive = false;
    this.frame = 0;
    this.rng = Math.random;

    // Optional injected helpers from host module
    this.deps = {
      tracer: tracer || null,
      accents: accents || null,
      resolveCosmetics: cosmeticsResolver || null,
    };

    // Local simulation state (never touches main game arrays)
    this.resetLocalState();
  }

  resetLocalState() {
    // Start screen flyby state only
    this.flyby = {
      active: false,
      x: -100,
      y: this.canvas.height * 0.4,
      speed: 4.5,
      radius: 14,
      trail: [], // {x,y,angle,alpha}
      trailTick: 0,
    };
    // Optional ambient asteroids state (visual-only)
    this.asteroids = [];
    this.targetAsteroids = 12;
    this.spawnCooldown = 0;
    // Lightweight cosmetic particles for trail effects (visual-only)
    this.particles = [];
    // Schedule next flyby (in frames)
    this.nextFlybyFrame = this.frame + this.randomFlybyDelay();
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.frame = 0;
    this.resetLocalState();
    // Launch an immediate flyby so start screen isn't empty
    try { this.startFlyby(); } catch (_) {}
    // Seed ambient asteroids if enabled
    if (this.isAmbientEnabled()) {
      for (let i = 0; i < this.targetAsteroids; i++) {
        try { this.spawnAsteroidEdge(); } catch (_) {}
      }
    }
  }

  stop() {
    this.isActive = false;
    this.resetLocalState();
  }

  // Note: main-game ship drawing is reproduced inside drawFlyby using traceShipSilhouettePath + drawShipAccents
  // Compute y-lane between title and first start button on #startScreen; fallback to mid-screen
  computeFlybyY() {
    try {
      const doc = (typeof document !== 'undefined') ? document : null;
      const start = doc ? doc.getElementById('startScreen') : null;
      if (!start || start.classList.contains('hidden')) return this.canvas.height * 0.45;
      const container = doc.getElementById('gameContainer');
      const h1 = start.querySelector('h1');
      const btn = start.querySelector('.menu-button');
      if (container && h1 && btn) {
        const c = container.getBoundingClientRect();
        const r1 = h1.getBoundingClientRect();
        const r2 = btn.getBoundingClientRect();
        const scale = c.height / (this.canvas.height || 1);
        const titleBottomCss = r1.bottom;
        const buttonTopCss = r2.top;
        // Prefer just under the title (smaller offset)
        const desiredCss = titleBottomCss + 12; // 12px below title
        const desiredCanvas = (desiredCss - c.top) / (scale || 1);
        const btnTopCanvas = (buttonTopCss - c.top) / (scale || 1);
        // Keep a minimum gap to the button
        const minGap = 40;
        let y = desiredCanvas;
        if (btnTopCanvas - y < minGap) y = btnTopCanvas - minGap;
        y = Math.max(60, Math.min(this.canvas.height - 60, y));
        return y;
      }
      if (container && h1 && !btn) {
        // No button yet; place just under title
        const c = container.getBoundingClientRect();
        const r1 = h1.getBoundingClientRect();
        const scale = c.height / (this.canvas.height || 1);
        const desiredCss = r1.bottom + 12;
        const y = (desiredCss - c.top) / (scale || 1);
        return Math.max(60, Math.min(this.canvas.height - 60, y));
      }
    } catch (_) {}
    return this.canvas.height * 0.45;
  }

  // Start a new flyby pass from left to right
  startFlyby() {
    this.flyby.active = true;
    this.flyby.x = -40;
    this.flyby.y = this.computeFlybyY();
    this.flyby.speed = 4.4 + this.rng() * 0.8; // slight variation
    this.flyby.radius = 14;
    this.flyby.trail = [];
    this.flyby.trailTick = 0;
  }

  // Random delay in frames between 4–8 seconds
  randomFlybyDelay() {
    const min = 4 * 60;
    const max = 8 * 60;
    return (min + (this.rng() * (max - min))) | 0;
  }

  // Collision handling removed in attract mode for performance

  // Ambient toggle (default ON; opt-out via window.enableAttractAsteroids = false)
  isAmbientEnabled() {
    // On by default for visuals; opt-out via window.enableAttractAsteroids = false
    try {
      if (typeof window === 'undefined') return true;
      return window.enableAttractAsteroids !== false;
    } catch (_) { return true; }
  }

  // Spawn a background asteroid from screen edge with gentle drift toward center
  spawnAsteroidEdge() {
    const side = (this.rng() * 4) | 0; // 0:L 1:R 2:T 3:B
    const pad = 30;
    let x = 0, y = 0;
    if (side === 0) { x = -pad; y = this.rng() * this.canvas.height; }
    else if (side === 1) { x = this.canvas.width + pad; y = this.rng() * this.canvas.height; }
    else if (side === 2) { x = this.rng() * this.canvas.width; y = -pad; }
    else { x = this.rng() * this.canvas.width; y = this.canvas.height + pad; }
    const size = this.rng() < 0.55 ? 3 : 2; // mostly large + some medium
    const a = new Asteroid(x, y, size, false, false);
    // Nudge velocity slightly toward center for on-screen motion
    const cx = this.canvas.width * 0.5, cy = this.canvas.height * 0.5;
    const ang = Math.atan2(cy - y, cx - x);
    a.vx = a.vx * 0.6 + Math.cos(ang) * 0.6;
    a.vy = a.vy * 0.6 + Math.sin(ang) * 0.6;
    this.asteroids.push(a);
  }

  // Resolve selected cosmetics: prefer injected resolver; then live actives; then preferred + unlocked; else null/default
  resolveCosmetics() {
    if (this.deps && typeof this.deps.resolveCosmetics === 'function') {
      try {
        const r = this.deps.resolveCosmetics();
        if (r && (r.skinId || r.trailId || r.skinId === null || r.trailId === null)) return r;
      } catch (_) {}
    }
    // Live active selections (if game already chose them)
    const activeSkin = (typeof window !== 'undefined') ? window.activeSkinId : null;
    const activeTrail = (typeof window !== 'undefined') ? window.activeTrailId : null;
    if (activeSkin || activeTrail) {
      return { skinId: activeSkin || null, trailId: activeTrail || null };
    }

    // Preferences (could be 'auto' or 'none')
    const prefSkin = (typeof window !== 'undefined') ? window.preferredSkinId : null;
    const prefTrail = (typeof window !== 'undefined') ? window.preferredTrailId : null;
    // Read unlocked rewards from localStorage
    let unlocked = new Set();
    try {
      const r = (typeof localStorage !== 'undefined') ? localStorage.getItem('asteraidUnlockedRewards') : null;
      const arr = Array.isArray(JSON.parse(r || '[]')) ? JSON.parse(r || '[]') : [];
      unlocked = new Set(arr);
    } catch (_) {}
    // Priority orders (mirror ast.html)
    const SKIN_PRIORITY = ['skin_aurora','skin_arctic','skin_midnight','skin_gold','skin_crimson','skin_vaporwave','skin_emerald','skin_cobalt'];
    const TRAIL_PRIORITY = ['trail_colossus','trail_crystaltitan','trail_ember','trail_plasma','trail_mint','trail_stardust','trail_iceBlue','trail_sunset','trail_neonPurple'];

    const highestUnlocked = (order) => {
      for (const id of order) if (unlocked.has(id)) return id;
      return null;
    };

    // Skin selection
    let skinId = null;
    if (prefSkin === 'none') skinId = null;
    else if (prefSkin && prefSkin !== 'auto' && unlocked.has(prefSkin)) skinId = prefSkin;
    else skinId = highestUnlocked(SKIN_PRIORITY);

    // Trail selection
    let trailId = null;
    if (prefTrail === 'none') trailId = null;
    else if (prefTrail && prefTrail !== 'auto' && unlocked.has(prefTrail)) trailId = prefTrail;
    else trailId = highestUnlocked(TRAIL_PRIORITY);

    return { skinId, trailId };
  }

  // Draw the cosmetic ship and its afterimage trail exactly like main-game visuals
  drawFlyby(ctx) {
    if (!this.flyby.active) return;
    const x = this.flyby.x, y = this.flyby.y;
    const angle = 0; // horizontal right
    // Resolve cosmetics each frame using preferences + unlocked rewards
    const { skinId, trailId } = this.resolveCosmetics();

    // 1) Afterimage trail (match main-game): silhouette stroke with glow/color per trail
    if (this.flyby.trail && this.flyby.trail.length) {
      for (let i = 0; i < this.flyby.trail.length; i++) {
        const t = this.flyby.trail[i];
        if (t.alpha <= 0.02) continue;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle || 0);
        ctx.globalAlpha = t.alpha;
        ctx.shadowBlur = 4;
        let trailColor = '#0ff';
        if (trailId === 'trail_neonPurple') trailColor = '#b66bff';
        else if (trailId === 'trail_sunset') trailColor = '#ff9a9e';
        else if (trailId === 'trail_iceBlue') trailColor = '#9fe3ff';
        else if (trailId === 'trail_stardust') {
          const f = (Math.sin((this.frame + i * 7) * 0.08) + 1) * 0.5; // 0..1
          const c = Math.floor(207 + f * (255 - 207));
          trailColor = `rgb(${c},${c},255)`;
        } else if (trailId === 'trail_mint') trailColor = '#6fffc1';
        else if (trailId === 'trail_plasma') trailColor = '#ff4fd6';
        else if (trailId === 'trail_ember') trailColor = '#ff8a2b';
        else if (trailId === 'trail_colossus') trailColor = '#ff6666';
        else if (trailId === 'trail_crystaltitan') trailColor = '#9fe3ff';
        ctx.shadowColor = trailColor;
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = (trailId === 'trail_plasma') ? 3 : 2;
        ctx.beginPath();
        const tracer = (this.deps && this.deps.tracer) ? this.deps.tracer : ((typeof window !== 'undefined') ? window.traceShipSilhouettePath : null);
        if (typeof tracer === 'function') tracer(ctx, skinId);
        else { ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath(); }
        ctx.stroke();
        ctx.restore();
        // fade (handled in update as multiply), draw mirrors main-game values
      }
    }
    // If trail samples are not yet populated (e.g., first couple of frames), draw a minimal synthetic trail so cosmetics are visible immediately
    else if (trailId && trailId !== 'none') {
      const offsets = [ -8, -16, -24 ];
      for (let j = 0; j < offsets.length; j++) {
        ctx.save();
        ctx.translate(x + offsets[j], y);
        ctx.rotate(angle);
        const baseAlpha = 0.28 * Math.pow(0.7, j);
        ctx.globalAlpha = baseAlpha;
        ctx.shadowBlur = 4;
        let trailColor = '#0ff';
        if (trailId === 'trail_neonPurple') trailColor = '#b66bff';
        else if (trailId === 'trail_sunset') trailColor = '#ff9a9e';
        else if (trailId === 'trail_iceBlue') trailColor = '#9fe3ff';
        else if (trailId === 'trail_stardust') {
          const f = (Math.sin((this.frame + j * 7) * 0.08) + 1) * 0.5; // 0..1
          const c = Math.floor(207 + f * (255 - 207));
          trailColor = `rgb(${c},${c},255)`;
        } else if (trailId === 'trail_mint') trailColor = '#6fffc1';
        else if (trailId === 'trail_plasma') trailColor = '#ff4fd6';
        else if (trailId === 'trail_ember') trailColor = '#ff8a2b';
        ctx.shadowColor = trailColor;
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = (trailId === 'trail_plasma') ? 3 : 2;
        ctx.beginPath();
        const tracer = (this.deps && this.deps.tracer) ? this.deps.tracer : ((typeof window !== 'undefined') ? window.traceShipSilhouettePath : null);
        if (typeof tracer === 'function') tracer(ctx, skinId);
        else { ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath(); }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2) Ship silhouette stroke with glow and per-skin accents (like drawPlayer)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // Skin color mapping (same as main-game drawPlayer)
    let color = '#0ff';
    let skinGlowBoost = 0;
    if (skinId === 'skin_emerald') {
      color = '#3ef08a';
    } else if (skinId === 'skin_vaporwave') {
      color = '#ff71ce';
    } else if (skinId === 'skin_cobalt') {
      color = '#3ea0ff';
    } else if (skinId === 'skin_crimson') {
      color = '#ff3b3b';
    } else if (skinId === 'skin_gold') {
      color = '#ffcf3e'; skinGlowBoost = 2;
    } else if (skinId === 'skin_midnight') {
      color = '#1e2a78'; skinGlowBoost = 3;
    } else if (skinId === 'skin_arctic') {
      color = '#dff6ff';
    } else if (skinId === 'skin_aurora') {
      const hue = (this.frame * 1.5) % 360;
      color = `hsl(${hue}, 85%, 65%)`; skinGlowBoost = 2;
    }
    // Base glow/line width like main game
    let shipGlow = 10;
    const baseLineWidth = 3; // no armor in attract mode
    ctx.shadowBlur = shipGlow + skinGlowBoost;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = baseLineWidth;
    ctx.beginPath();
    const tracer2 = (this.deps && this.deps.tracer) ? this.deps.tracer : ((typeof window !== 'undefined') ? window.traceShipSilhouettePath : null);
    if (typeof tracer2 === 'function') tracer2(ctx, skinId);
    else { ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath(); }
    ctx.stroke();

    // Per-skin accents
    const accents = (this.deps && this.deps.accents) ? this.deps.accents : ((typeof window !== 'undefined') ? window.drawShipAccents : null);
    if (typeof accents === 'function') accents(ctx, skinId, color, shipGlow + skinGlowBoost, baseLineWidth);
    ctx.restore();
  }
  // All entity/FX helper functions removed in attract mode

  update() {
    if (!this.isActive) return;
    this.frame++;
    // Flyby scheduling
    const startEl = (typeof document !== 'undefined') ? document.getElementById('startScreen') : null;
    const startVisible = !!(startEl && !startEl.classList.contains('hidden'));
    if (!this.flyby.active && startVisible && this.frame >= this.nextFlybyFrame) {
      this.startFlyby();
    }

    // Advance flyby only (no collisions/AI/entities)
    if (this.flyby.active) {
      this.flyby.x += this.flyby.speed;
      // Trail sampling (lighter than main-game for start screen): every 3 frames, cap 8
      this.flyby.trailTick = (this.flyby.trailTick || 0) + 1;
      if (this.flyby.trailTick % 3 === 0) {
        this.flyby.trail.push({ x: this.flyby.x, y: this.flyby.y, angle: 0, alpha: 0.42 });
        if (this.flyby.trail.length > 8) this.flyby.trail.shift();
      }
      // Fade multiply
      for (let i = this.flyby.trail.length - 1; i >= 0; i--) {
        this.flyby.trail[i].alpha *= 0.88;
        if (this.flyby.trail[i].alpha < 0.03) this.flyby.trail.splice(i, 1);
      }

      // Spawn lightweight cosmetic particles behind the engine based on selected trail
      try {
        const { trailId } = this.resolveCosmetics();
        if (trailId && trailId !== 'none') {
          // Match ast.html logic using a fixed angle of 0 (flyby faces right)
          const ang = 0;
          const cosA = Math.cos(ang), sinA = Math.sin(ang);
          const engineX = this.flyby.x - cosA * 12;
          const engineY = this.flyby.y - sinA * 12;
          switch (trailId) {
            case 'trail_colossus': {
              // Red and pale pink embers; occasional outward embers; no rings
              if (this.rng() < 0.5) {
                for (let i = 0; i < 2; i++) {
                  const col = (Math.random() < 0.5) ? '#ff3b3b' : '#ffd0e0';
                  const p = new Particle(
                    engineX,
                    engineY,
                    -cosA * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.45,
                    -sinA * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.45,
                    col,
                    48 + Math.random() * 21
                  );
                  p.glow = 16;
                  p.radius = 1.9 + Math.random() * 1.7;
                  p.noWrap = true;
                  this.particles.push(p);
                }
              }
              if (this.rng() < 0.5) {
                const a = Math.random() * Math.PI * 2;
                const sp = 1.2 + Math.random() * 1.2;
                const q = new Particle(engineX, engineY, Math.cos(a) * sp, Math.sin(a) * sp, '#ff5555', 36 + Math.random() * 20);
                q.glow = 10; q.radius = 1.4 + Math.random() * 1.0; q.noWrap = true;
                this.particles.push(q);
              }
              break;
            }
            case 'trail_ember': {
              // Average ~1 ember per frame (2 every ~2 frames), occasional ring (~1/6 per frame)
              if (this.rng() < 0.5) {
                for (let i = 0; i < 2; i++) {
                  const col = (Math.random() < 0.5) ? '#ff8a2b' : (Math.random() < 0.5 ? '#ff4d00' : '#ffd180');
                  const p = new Particle(
                    engineX,
                    engineY,
                    -cosA * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.4,
                    -sinA * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.4,
                    col,
                    32 + Math.random() * 14
                  );
                  p.glow = 14;
                  p.radius = 1.8 + Math.random() * 1.6;
                  p.noWrap = true;
                  this.particles.push(p);
                }
              }
              if (this.rng() < (1/6)) {
                const r = new Particle(engineX, engineY, 0, 0, '#ffa13a', 22);
                r.shape = 'ring';
                r.radius = 2;
                r.growth = 1.1;
                r.thickness = 2;
                r.glow = 18;
                this.particles.push(r);
              }
              break;
            }
            case 'trail_crystaltitan': {
              // White/cyan shard + cyan embers; no rings
              const s = new Particle(
                engineX,
                engineY,
                -cosA * 0.5 + (Math.random() - 0.5) * 0.25,
                -sinA * 0.5 + (Math.random() - 0.5) * 0.25,
                (Math.random() < 0.5 ? '#ffffff' : '#9fe3ff'),
                30
              );
              s.shape = 'shard';
              s.length = 14 + Math.random() * 10;
              s.thickness = 2;
              s.glow = 18;
              s.rotation = ang + Math.PI;
              s.angularVel = 0.01 * (Math.random() - 0.5);
              s.noWrap = true;
              this.particles.push(s);
              if (this.rng() < 0.6) {
                const a = Math.random() * Math.PI * 2;
                const sp = 0.9 + Math.random() * 1.0;
                const p = new Particle(engineX, engineY, Math.cos(a) * sp, Math.sin(a) * sp, '#9fe3ff', 24 + Math.random() * 12);
                p.glow = 10; p.radius = 1.2 + Math.random() * 1.1; p.noWrap = true;
                this.particles.push(p);
              }
              break;
            }
            case 'trail_iceBlue': {
              // Average one spawn burst every ~3 frames
              if (this.rng() < (1/3)) {
                const ring = new Particle(engineX, engineY, 0, 0, '#c7f2ff', 30);
                ring.shape = 'ring';
                ring.radius = 3;
                ring.growth = 0.9;
                ring.thickness = 1.5;
                ring.glow = 18;
                this.particles.push(ring);
                const p = new Particle(
                  engineX,
                  engineY,
                  -cosA * 0.6 + (Math.random() - 0.5) * 0.3,
                  -sinA * 0.6 + (Math.random() - 0.5) * 0.3,
                  '#9fe3ff',
                  35
                );
                p.glow = 12;
                p.radius = 1.2 + Math.random() * 1.2;
                p.noWrap = true;
                this.particles.push(p);
              }
              break;
            }
            case 'trail_plasma': {
              // Long glowing streak (shard) with high blur
              const s = new Particle(
                engineX,
                engineY,
                -cosA * 0.4 + (Math.random() - 0.5) * 0.2,
                -sinA * 0.4 + (Math.random() - 0.5) * 0.2,
                '#ff4fd6',
                30
              );
              s.shape = 'shard';
              s.length = 34 + Math.random() * 18;
              s.thickness = 3;
              s.glow = 24;
              s.rotation = ang + Math.PI;
              s.angularVel = 0;
              s.noWrap = true;
              this.particles.push(s);
              if (this.rng() < (1/6)) {
                const r = new Particle(engineX, engineY, 0, 0, '#ff9bf0', 19);
                r.shape = 'ring';
                r.radius = 2;
                r.growth = 1.0;
                r.thickness = 2;
                r.glow = 18;
                this.particles.push(r);
              }
              break;
            }
            case 'trail_mint': {
              if (this.rng() < (1/3)) {
                const p = new Particle(
                  engineX,
                  engineY,
                  -cosA * 0.8 + (Math.random() - 0.5) * 0.4,
                  -sinA * 0.8 + (Math.random() - 0.5) * 0.4,
                  '#6fffc1',
                  32
                );
                p.glow = 12;
                p.radius = 1.4 + Math.random() * 1.2;
                p.noWrap = true;
                this.particles.push(p);
                if (Math.random() < 0.25) {
                  const r = new Particle(engineX, engineY, 0, 0, '#98ffd9', 22);
                  r.shape = 'ring';
                  r.radius = 2;
                  r.growth = 0.8;
                  r.thickness = 1.5;
                  r.glow = 12;
                  this.particles.push(r);
                }
              }
              break;
            }
            case 'trail_stardust': {
              if (this.rng() < 0.5) {
                const hue = 220 + Math.sin(this.frame * 0.1) * 10; // bluish white twinkle
                const col = `hsl(${hue}, 100%, ${78 + Math.sin(this.frame * 0.2) * 10}%)`;
                const p = new Particle(
                  engineX,
                  engineY,
                  (Math.random() - 0.5) * 1.4,
                  (Math.random() - 0.5) * 1.4,
                  col,
                  35
                );
                p.glow = 10;
                p.radius = 1 + Math.random() * 1.0;
                p.noWrap = true;
                this.particles.push(p);
              }
              break;
            }
            case 'trail_sunset': {
              if (this.rng() < 0.5) {
                const f = (Math.sin(this.frame * 0.08) + 1) * 0.5;
                const r = 255, g = Math.floor(90 + f * 110), b = Math.floor(158 - f * 80);
                const col = `rgb(${r},${g},${b})`;
                const p = new Particle(
                  engineX,
                  engineY,
                  -cosA * 0.7 + (Math.random() - 0.5) * 0.4,
                  -sinA * 0.7 + (Math.random() - 0.5) * 0.4,
                  col,
                  32
                );
                p.glow = 14;
                p.radius = 1.4 + Math.random() * 1.2;
                p.noWrap = true;
                this.particles.push(p);
                if (this.rng() < (1/8)) {
                  const r2 = new Particle(engineX, engineY, 0, 0, col, 19);
                  r2.shape = 'ring';
                  r2.radius = 2;
                  r2.growth = 1.1;
                  r2.thickness = 2;
                  r2.glow = 16;
                  this.particles.push(r2);
                }
              }
              break;
            }
            case 'trail_neonPurple': {
              if (this.rng() < 0.5) {
                const s = new Particle(
                  engineX,
                  engineY,
                  -cosA * 0.6 + (Math.random() - 0.5) * 0.3,
                  -sinA * 0.6 + (Math.random() - 0.5) * 0.3,
                  '#b66bff',
                  30
                );
                s.shape = 'shard';
                s.length = 14 + Math.random() * 10;
                s.thickness = 2;
                s.glow = 18;
                s.rotation = ang + Math.PI;
                s.angularVel = 0.02 * (Math.random() - 0.5);
                s.noWrap = true;
                this.particles.push(s);
              }
              break;
            }
          }
        }
      } catch (_) {}

      // End of pass
      if (this.flyby.x > this.canvas.width + 40) {
        this.flyby.active = false;
        this.nextFlybyFrame = this.frame + this.randomFlybyDelay();
      }
    }

    // Always update particles so they decay even when flyby is inactive
    if (this.particles && this.particles.length) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        try { this.particles[i].update(this.canvas); } catch (_) {}
        if (this.particles[i].lifetime <= 0) this.particles.splice(i, 1);
      }
      // Soft cap to avoid buildup
      if (this.particles.length > 90) this.particles.splice(0, this.particles.length - 90);
    }

    // Update lightweight ambient asteroids (visual-only)
    if (this.isAmbientEnabled()) {
      if (this.asteroids && this.asteroids.length) {
        for (let i = 0; i < this.asteroids.length; i++) {
          const a = this.asteroids[i];
          try { a.update(1, [], this.canvas, ()=>{}, ()=>{}); } catch (_) {}
        }
      }
      // Maintain population with a small cooldown
      if (this.asteroids.length < this.targetAsteroids) {
        this.spawnCooldown--;
        if (this.spawnCooldown <= 0) { try { this.spawnAsteroidEdge(); } catch (_) {} this.spawnCooldown = 24 + ((this.rng()*24)|0); }
      }
    }
  }

  draw(ctx) {
    if (!this.isActive) return;
    // Draw background asteroids (behind flyby)
    if (this.isAmbientEnabled() && this.asteroids && this.asteroids.length) {
      for (let i = 0; i < this.asteroids.length; i++) {
        try { this.asteroids[i].draw(ctx); } catch (_) {}
      }
    }

    // Draw cosmetic particles under the ship
    if (this.particles && this.particles.length) {
      ctx.save();
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.particles.length; i++) {
        try { this.particles[i].draw(ctx); } catch (_) {}
      }
      ctx.globalCompositeOperation = prevOp;
      ctx.restore();
    }

    // Draw flyby ship last so it sits above asteroid sprites
    this.drawFlyby(ctx);
  }
}
