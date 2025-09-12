// Hazards module: GravityWell and Wormhole extracted from ast.html
import {
  GRAVITY_STRENGTH,
  GRAVITY_RADIUS,
  WORMHOLE_RADIUS,
  TETHER_NODE_RADIUS,
  TETHER_PULSE_SPEED,
  TETHER_LINE_BASE_WIDTH,
  TETHER_SPEED_AFTER_BREAK,
  TETHER_RESPAWN_FRAMES,
  BLACK_HOLE_RADIUS,
  BLACK_HOLE_RELOCATE_FRAMES,
} from './constants.js';

// Cached glow/ring sprite factory to avoid per-frame shadowBlur cost
class GlowSpriteFactory {
  static cache = new Map(); // key -> canvas
  static #makeKey(type, color, variant) {
    return `${type}|${color}|${variant || 'default'}`;
  }
  // Pre-render a neon ring sprite; variant can be 'thin' or 'thick'
  static getRing(color = '#6cf', variant = 'thin') {
    const key = this.#makeKey('ring', color, variant);
    if (this.cache.has(key)) return this.cache.get(key);
    // Choose sprite parameters based on variant
    const size = (variant === 'thin_hq') ? 256 : 168; // HQ sprite for large-scale use
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const sctx = c.getContext('2d');
    const cx = size * 0.5, cy = size * 0.5;
    const r = (variant === 'thin_hq') ? size * 0.28 : size * 0.32; // extra padding for HQ
    sctx.strokeStyle = color;
    // Reduce thin variant thickness by 60%; keep thick similar for primary outline
    sctx.lineWidth = (variant === 'thick') ? 12 : 2.8;
    sctx.shadowColor = color;
    sctx.shadowBlur = (variant === 'thick') ? 30 : (variant === 'thin_hq' ? 32 : 24);
    sctx.beginPath();
    sctx.arc(cx, cy, r, 0, Math.PI * 2);
    sctx.stroke();
    sctx.shadowBlur = 0;
    this.cache.set(key, c);
    return c;
  }
  // Pre-render a soft dot glow sprite
  static getDot(color = '#0ff') {
    const key = this.#makeKey('dot', color, 'default');
    if (this.cache.has(key)) return this.cache.get(key);
    const size = 125; // ~+30% larger than 96
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const sctx = c.getContext('2d');
    const cx = size * 0.5, cy = size * 0.5;
    // Use shadowBlur once at build time to create a soft dot
    sctx.fillStyle = color;
    sctx.shadowColor = color;
    sctx.shadowBlur = 34;
    sctx.beginPath();
    sctx.arc(cx, cy, size * 0.16, 0, Math.PI * 2);
    sctx.fill();
    sctx.shadowBlur = 0;
    this.cache.set(key, c);
    return c;
  }
}
// Black Hole hazard (Level 13)
// Absorbs player bullets, damages player on contact, and slowly pulls nearby powerups (only) to destroy them.
export class BlackHole {
  constructor(canvas, player) {
    this.radius = BLACK_HOLE_RADIUS;
    this.pulse = 0;
    this.spawnAlpha = 0; // grows 0->1 over fade-in
    this.fadeInFrames = 120; // doubled fade-in duration
    this.relocateTimer = BLACK_HOLE_RELOCATE_FRAMES; // ~5s
    this.flowParticles = [];
    this.flowSpawnAccum = 0;
    this.#buildJaggedPath();
    // Initial placement away from edges and player
    this._playerRef = player || null;
    this.respawn(canvas, player);
    // Phases: fadeIn -> active -> fadeOut -> respawn -> fadeIn
    this.phase = 'fadeIn';
  }
  // Visual growth from 0.3x -> 1.0x over fade-in
  #getScale() { return 0.3 + 0.7 * (this.spawnAlpha ?? 1); }
  #effectiveRadius() { return this.radius * this.#getScale(); }
  respawn(canvas, player) {
    if (player) this._playerRef = player;
    const margin = Math.min(canvas.width, canvas.height) * 0.1;
    const safeDistFromPlayer = (player && player.radius ? player.radius : 20) + this.radius * 1.2;
    let tries = 0;
    do {
      this.x = margin + Math.random() * (canvas.width - margin * 2);
      this.y = margin + Math.random() * (canvas.height - margin * 2);
      tries++;
    } while (player && Math.hypot(this.x - player.x, this.y - player.y) < safeDistFromPlayer && tries < 200);
    this.spawnAlpha = 0;
    this.relocateTimer = BLACK_HOLE_RELOCATE_FRAMES;
  }
  update(canvas, powerups) {
    this.pulse += 0.045;
    // Phase handling: fade-in, active, fade-out
    if (this.phase === 'fadeIn') {
      if (this.spawnAlpha < 1) {
        this.spawnAlpha += 1 / this.fadeInFrames;
        if (this.spawnAlpha >= 1) { this.spawnAlpha = 1; this.phase = 'active'; }
      }
    } else if (this.phase === 'active') {
      if (this.relocateTimer > 0) this.relocateTimer--;
    } else if (this.phase === 'fadeOut') {
      if (this.spawnAlpha > 0) {
        this.spawnAlpha -= 1 / this.fadeInFrames;
        if (this.spawnAlpha <= 0) { this.spawnAlpha = 0; this.respawn(canvas, this._playerRef); this.phase = 'fadeIn'; }
      }
    }
    // Inward particle stream (purple/blue stars/debris)
    const startR = this.#effectiveRadius() * 1.6;
    const spawnRate = 2.5 * (this.spawnAlpha ?? 1);
    this.flowSpawnAccum += spawnRate;
    let toSpawn = Math.floor(this.flowSpawnAccum);
    if (toSpawn > 0) this.flowSpawnAccum -= toSpawn;
    for (let i = 0; i < toSpawn; i++) {
      if (this.flowParticles.length > 90) break;
      const ang = Math.random() * Math.PI * 2;
      const life = 200 + Math.random() * 180;
      this.flowParticles.push({ ang, age: 0, life, r0: startR * (0.9 + Math.random() * 0.2), size: 1.0 + Math.random() * 1.8, tint: Math.random() < 0.5 ? '#a8f' : (Math.random() < 0.5 ? '#68f' : '#fff'), spin: (Math.random() - 0.5) * 0.12 });
    }
    for (let i = this.flowParticles.length - 1; i >= 0; i--) {
      const p = this.flowParticles[i];
      p.age++; p.ang += p.spin;
      if (p.age >= p.life) this.flowParticles.splice(i, 1);
    }
    // Suction for nearby powerups only
    if (powerups && powerups.length) {
      const influence = this.#effectiveRadius() * 2.2;
      for (let i = 0; i < powerups.length; i++) {
        const pu = powerups[i];
        const dx = this.x - pu.x, dy = this.y - pu.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < influence) {
          const nx = dx / d, ny = dy / d;
          // Reduce suction speed by 60% (keep same range)
          pu.vx = (pu.vx || 0) * 0.98 + nx * 0.02;
          pu.vy = (pu.vy || 0) * 0.98 + ny * 0.02;
          if (d < this.#effectiveRadius()) pu.dead = true;
        }
      }
    }
  }
  draw(ctx) {
    const prevOp = ctx.globalCompositeOperation;
    // Outer neon halo rings (blue/purple) — use cached ring sprites
    ctx.globalCompositeOperation = 'lighter';
    const scale = this.#getScale();
    for (let i = 2; i >= 0; i--) {
      // Make outermost line black instead of purple
      const c = (i === 2) ? '#000' : (i === 0 ? '#6af' : (i === 1 ? '#98f' : '#80f'));
      const r = this.radius * scale * (0.55 + i * 0.16) + Math.sin(this.pulse + i) * 3.5;
      const ring = GlowSpriteFactory.getRing(c, i === 0 ? 'thick' : 'thin');
      const alpha = (i === 0 ? 0.9 : 0.35) * (this.spawnAlpha ?? 1);
      ctx.globalAlpha = alpha;
      ctx.drawImage(ring, this.x - r, this.y - r, r * 2, r * 2);
    }
    // Inward-moving thin rings (subtle)
    const startR = this.radius * scale * 1.6;
    const basePhase = ((this.pulse * 0.055) % 1 + 1) % 1;
    const ringSprite = GlowSpriteFactory.getRing('#a8f', 'thin_hq');
    for (let k = 0; k < 3; k++) {
      let t = (basePhase + k / 3) % 1;
      const te = (1 - Math.cos(t * Math.PI)) * 0.5;
      const rMove = Math.max(3, startR * (1 - te));
      const alpha = 0.35 * (rMove / startR) * (this.spawnAlpha ?? 1);
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(ringSprite, this.x - rMove, this.y - rMove, rMove * 2, rMove * 2);
    }
    // Core jagged dark disc with subtle blue/purple gradient (pulsating)
    ctx.globalCompositeOperation = prevOp;
    ctx.save();
    ctx.translate(this.x, this.y);
    const s = (0.9 + 0.05 * Math.sin(this.pulse * 1.4)) * this.#getScale();
    ctx.scale(s, s);
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius * 0.92);
    grad.addColorStop(0.0, 'rgba(0,0,0,0.95)');
    grad.addColorStop(0.6, 'rgba(30, 0, 50, 0.9)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.85)');
    ctx.globalAlpha = 0.85 * (this.spawnAlpha ?? 1);
    // Blur the edges of the jagged shape with an outward black shadow glow (~50px)
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 50;
    if (this.corePath) ctx.fill(this.corePath); else { ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.92, 0, Math.PI * 2); ctx.fill(); }
    ctx.shadowBlur = 0;
    ctx.restore();
    // Inward particles (additive)
    const dotWhite = GlowSpriteFactory.getDot('#fff');
    const dotBlue = GlowSpriteFactory.getDot('#9ef');
    const dotPurple = GlowSpriteFactory.getDot('#a8f');
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.flowParticles.length; i++) {
      const p = this.flowParticles[i];
      const t = Math.min(1, p.age / p.life);
      const te = (1 - Math.cos(t * Math.PI)) * 0.5;
      const rNow = p.r0 * (1 - te);
      const x = this.x + Math.cos(p.ang) * rNow;
      const y = this.y + Math.sin(p.ang) * rNow;
      // Increase particle alpha by 50%
      const a = Math.min(1, 0.825 * (1 - te) * (this.spawnAlpha ?? 1));
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const spr = (p.tint === '#fff') ? dotWhite : (p.tint === '#9ef' ? dotBlue : dotPurple);
      const size = p.size * (0.5 + 0.5 * te);
      ctx.drawImage(spr, x - size, y - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }
  // Returns true if bullet at (bx,by,br) should be absorbed (removed)
  absorbsBullet(bx, by, br) {
    const dx = bx - this.x, dy = by - this.y;
    const r = this.#effectiveRadius() * 0.95;
    return (dx * dx + dy * dy) <= (r + br) * (r + br);
  }
  // True if player is inside damaging radius
  touchesPlayer(px, py, pr) {
    const dx = px - this.x, dy = py - this.y;
    return Math.hypot(dx, dy) <= (this.#effectiveRadius() + pr * 0.6);
  }
  // Called by game to advance relocation; returns true if a relocation occurred
  maybeRelocate(canvas, player) {
    // Start fade-out when timer elapses; actual respawn happens after fade-out completes
    if (this.phase === 'active' && this.relocateTimer <= 0) {
      if (player) this._playerRef = player;
      this.phase = 'fadeOut';
      // Return true so caller can play a cue indicating relocation start
      return true;
    }
    return false;
  }
  #buildJaggedPath() {
    // Build a jagged circular path for the core perimeter
    const verts = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const variance = 0.84 + Math.random() * 0.28;
      verts.push({ angle: ang, radius: this.radius * 0.92 * variance });
    }
    const path = new Path2D();
    for (let j = 0; j < verts.length; j++) {
      const vx = Math.cos(verts[j].angle) * verts[j].radius;
      const vy = Math.sin(verts[j].angle) * verts[j].radius;
      if (j === 0) path.moveTo(vx, vy); else path.lineTo(vx, vy);
    }
    path.closePath();
    this.corePath = path;
  }
}

export class GravityWell {
  constructor(x, y, strength = GRAVITY_STRENGTH, radius = GRAVITY_RADIUS) {
    this.x = x;
    this.y = y;
    this.strength = strength;
    this.radius = radius;
    this.pulse = 0;
    // Fade-in state (2 seconds @60fps)
    this.fadeInFrames = 120;
    this.spawnAlpha = 0; // ramps 0->1 over fadeInFrames
    // Inward particle flow (sparkles/stars)
    this.flowParticles = [];
    this.flowSpawnAccum = 0;
  }
  update() {
    this.pulse += 0.06;
    // Advance fade-in
    if (this.spawnAlpha < 1) {
      this.spawnAlpha += 1 / this.fadeInFrames;
      if (this.spawnAlpha > 1) this.spawnAlpha = 1;
    }
    // Update inward particle stream
    const outerStatic = this.radius * (0.45 + 3 * 0.15) + Math.sin(this.pulse + 3) * 4;
    const startR = outerStatic * 1.2;
    // Spawn ~3 particles/frame for a visible stream, scaled by spawnAlpha
    const spawnRate = 3 * (this.spawnAlpha ?? 1);
    this.flowSpawnAccum += spawnRate;
    const toSpawn = Math.floor(this.flowSpawnAccum);
    if (toSpawn > 0) this.flowSpawnAccum -= toSpawn;
    for (let i = 0; i < toSpawn; i++) {
      if (this.flowParticles.length > 120) break; // cap
      const ang = Math.random() * Math.PI * 2;
      const life = 288 + (Math.random() * 240); // further slowed: ~4.8s - 8.8s
      this.flowParticles.push({
        ang,
        age: 0,
        life,
        r0: startR * (0.9 + Math.random() * 0.2),
        r1: 0,
        size: 1.2 + Math.random() * 2.2,
        tint: Math.random() < 0.5 ? '#cfe' : (Math.random() < 0.5 ? '#9ef' : '#fff'),
        spin: (Math.random() - 0.5) * 0.15,
      });
    }
    // Advance and prune
    for (let i = this.flowParticles.length - 1; i >= 0; i--) {
      const p = this.flowParticles[i];
      p.age++;
      p.ang += p.spin;
      if (p.age >= p.life) this.flowParticles.splice(i, 1);
    }
  }
  draw(ctx) {
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    // Concentric neon rings via cached sprites
    for (let i = 3; i >= 0; i--) {
      const color = i === 0 ? '#48f' : '#90f';
      const alpha = (i === 0 ? 0.9 : 0.25) * (this.spawnAlpha ?? 1);
      const r = this.radius * (0.45 + i * 0.15) + Math.sin(this.pulse + i) * 4;
      const ring = GlowSpriteFactory.getRing(color, i === 0 ? 'thick' : 'thin');
      ctx.globalAlpha = alpha;
      ctx.drawImage(ring, this.x - r, this.y - r, r * 2, r * 2);
    }
    // Animated inward-moving suction rings (3 thin rings)
    {
      // Approximate current outer ring radius from the static set (i=3)
      const outerStatic = this.radius * (0.45 + 3 * 0.15) + Math.sin(this.pulse + 3) * 4;
      const startR = outerStatic * 1.2; // 20% larger than outer
      // Even slower phase (another 2x duration)
      const basePhase = ((this.pulse * 0.05) % 1 + 1) % 1; // 0..1
      const ringSprite = GlowSpriteFactory.getRing('#9ef', 'thin_hq');
      for (let k = 0; k < 3; k++) {
        let t = (basePhase + k / 3) % 1; // 0..1
        // Smooth easing for calmer motion
        const te = (1 - Math.cos(t * Math.PI)) * 0.5; // 0..1
        // Shrink radius toward center; clamp very small radii to avoid flicker
        const rMove = Math.max(3, startR * (1 - te));
        const alpha = 0.4 * (rMove / startR) * (this.spawnAlpha ?? 1);
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.drawImage(ringSprite, this.x - rMove, this.y - rMove, rMove * 2, rMove * 2);
      }
    }
    // Inward particles (stars/sparkles)
    {
      const dotWhite = GlowSpriteFactory.getDot('#fff');
      const dotBlue = GlowSpriteFactory.getDot('#9ef');
      for (let i = 0; i < this.flowParticles.length; i++) {
        const p = this.flowParticles[i];
        const t = Math.min(1, p.age / p.life);
        const te = (1 - Math.cos(t * Math.PI)) * 0.5;
        const rNow = p.r0 * (1 - te);
        const x = this.x + Math.cos(p.ang) * rNow;
        const y = this.y + Math.sin(p.ang) * rNow;
        const a = 0.6 * (1 - te) * (this.spawnAlpha ?? 1);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        const spr = (p.tint === '#fff') ? dotWhite : dotBlue;
        // Size curve: outer small (0.5x), inner larger (1.0x)
        const s = p.size * (0.5 + 0.5 * te);
        ctx.drawImage(spr, x - s, y - s, s * 2, s * 2);
        // A tiny sharp star core
        ctx.globalAlpha = Math.min(1, a * 1.2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
    // Core glow dot (doubled size)
    const coreR = (6 + Math.sin(this.pulse * 2) * 2) * 2;
    const dot = GlowSpriteFactory.getDot('#0ff');
    ctx.globalAlpha = 1 * (this.spawnAlpha ?? 1);
    ctx.drawImage(dot, this.x - coreR, this.y - coreR, coreR * 2, coreR * 2);
    // Restore state
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }
}

// Level 14: Tethered asteroid pair (visual hazard + line endpoints)
// Drawn as neon blue nodes connected by a pulsing tether. External code handles
// collision with the player using lineCircleCollision().
export class TetherPair {
  constructor(canvas) {
    this.radius = TETHER_NODE_RADIUS;
    this.pulse = 0;
    this.tetherBroken = false;
    this.respawnTimer = 0;
    this.speedScaled = false;
    // Ember visual system for active tether (optimized sprite blits)
    this.embers = [];
    this.sparkSprite = null;
    // Node combat state (active only after tether broken)
    this.aHits = 4;
    this.bHits = 4;
    this.aDead = false;
    this.bDead = false;
    // Precomputed jagged outlines for nodes
    this.aVerts = [];
    this.bVerts = [];
    this.aPath = null;
    this.bPath = null;
    this.respawn(canvas, true);
  }
  // Randomize endpoints just offscreen, velocity pointing inward
  respawn(canvas, immediate = false) {
    const margin = 36;
    const side = Math.floor(Math.random() * 4);
    // Pick a primary spawn point offscreen
    let x = 0, y = 0;
    if (side === 0) { x = -margin; y = Math.random() * canvas.height; }
    else if (side === 1) { x = canvas.width + margin; y = Math.random() * canvas.height; }
    else if (side === 2) { x = Math.random() * canvas.width; y = -margin; }
    else { x = Math.random() * canvas.width; y = canvas.height + margin; }
    // Second endpoint offset roughly 220-300px away at a random angle
    const dist = 220 + Math.random() * 80;
    const ang = Math.random() * Math.PI * 2;
    const x2 = x + Math.cos(ang) * dist;
    const y2 = y + Math.sin(ang) * dist;
    // Velocities aimed somewhat toward screen center with slight variance
    const cx = canvas.width * 0.5, cy = canvas.height * 0.5;
    const dir1 = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 0.4;
    const dir2 = Math.atan2(cy - y2, cx - x2) + (Math.random() - 0.5) * 0.4;
    const sp = 0.8 + Math.random() * 0.6;
    const sp2 = 0.8 + Math.random() * 0.6;

    this.ax = x; this.ay = y;
    this.bx = x2; this.by = y2;
    this.avx = Math.cos(dir1) * sp;
    this.avy = Math.sin(dir1) * sp;
    this.bvx = Math.cos(dir2) * sp2;
    this.bvy = Math.sin(dir2) * sp2;
    this.tetherBroken = false;
    this.respawnTimer = 0;
    this.speedScaled = false;
    // Reset node states
    this.aHits = 4; this.bHits = 4;
    this.aDead = false; this.bDead = false;
    // Rebuild jagged outlines
    this.#buildNodeGeometry();
    this.#ensureSparkSprite();
  }
  getEndpoints() {
    return [this.ax, this.ay, this.bx, this.by];
  }
  breakTether() {
    if (this.tetherBroken) return;
    this.tetherBroken = true;
    // Slow nodes after break one time only
    if (!this.speedScaled) {
      this.avx *= TETHER_SPEED_AFTER_BREAK;
      this.avy *= TETHER_SPEED_AFTER_BREAK;
      this.bvx *= TETHER_SPEED_AFTER_BREAK;
      this.bvy *= TETHER_SPEED_AFTER_BREAK;
      this.speedScaled = true;
    }
    // Start timer for automatic respawn
    this.respawnTimer = TETHER_RESPAWN_FRAMES;
  }
  update(canvas) {
    this.pulse += TETHER_PULSE_SPEED;
    // Move endpoints with bounce (no wrap)
    this.ax += this.avx; this.ay += this.avy;
    this.bx += this.bvx; this.by += this.bvy;
    const r = this.radius;
    // A
    if (this.ax < r) { this.ax = r; this.avx *= -1; }
    if (this.ax > canvas.width - r) { this.ax = canvas.width - r; this.avx *= -1; }
    if (this.ay < r) { this.ay = r; this.avy *= -1; }
    if (this.ay > canvas.height - r) { this.ay = canvas.height - r; this.avy *= -1; }
    // B
    if (this.bx < r) { this.bx = r; this.bvx *= -1; }
    if (this.bx > canvas.width - r) { this.bx = canvas.width - r; this.bvx *= -1; }
    if (this.by < r) { this.by = r; this.bvy *= -1; }
    if (this.by > canvas.height - r) { this.by = canvas.height - r; this.bvy *= -1; }
    // Handle respawn cycle after break
    if (this.tetherBroken && this.respawnTimer > 0) {
      this.respawnTimer--;
      if (this.respawnTimer === 0) this.respawn(canvas, false);
    }
    // Update embers and emit while tether is active
    if (!this.tetherBroken) {
      // Emit 0-2 embers per frame depending on pulse
      const emitCount = (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
      for (let e = 0; e < emitCount; e++) this.#emitEmber();
    }
    // Update existing embers
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const em = this.embers[i];
      em.x += em.vx; em.y += em.vy;
      em.life--;
      em.alpha *= 0.95;
      if (em.life <= 0 || em.alpha <= 0.02) this.embers.splice(i, 1);
    }
  }
  draw(ctx) {
    // Draw tether first for under-glow, if active
    if (!this.tetherBroken) {
      const p = 0.5 + 0.5 * Math.sin(this.pulse);
      const lw = (TETHER_LINE_BASE_WIDTH + 1.7 * p) * 1.5; // thicker while tether active
      const grad = ctx.createLinearGradient(this.ax, this.ay, this.bx, this.by);
      grad.addColorStop(0, 'rgba(120, 220, 255, 0.95)');
      grad.addColorStop(0.5, 'rgba(240, 130, 255, 0.95)');
      grad.addColorStop(1, 'rgba(120, 220, 255, 0.95)');
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      // Outer glow
      ctx.globalAlpha = 0.32 + 0.25 * p;
      ctx.strokeStyle = grad;
      ctx.shadowColor = 'rgba(180, 240, 255, 1)';
      ctx.shadowBlur = 20 + 12 * p;
      ctx.lineWidth = lw + 2.0;
      ctx.beginPath();
      ctx.moveTo(this.ax, this.ay);
      ctx.lineTo(this.bx, this.by);
      ctx.stroke();
      // Core
      ctx.globalAlpha = 0.95;
      ctx.shadowBlur = 0;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(this.ax, this.ay);
      ctx.lineTo(this.bx, this.by);
      ctx.stroke();
      ctx.globalCompositeOperation = prevOp;
    }
    // Draw endpoints as jagged neon nodes (thicker while tether active)
    if (!this.aDead) this.#drawNode(ctx, this.ax, this.ay, !this.tetherBroken, this.aPath);
    if (!this.bDead) this.#drawNode(ctx, this.bx, this.by, !this.tetherBroken, this.bPath);
    // Draw white sparkling embers
    if (this.embers.length && this.sparkSprite) {
      const prevOp2 = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.embers.length; i++) {
        const em = this.embers[i];
        const s = this.sparkSprite.width * em.scale;
        ctx.globalAlpha = em.alpha;
        ctx.drawImage(this.sparkSprite, em.x - s * 0.5, em.y - s * 0.5, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevOp2;
    }
  }
  #drawNode(ctx, x, y, tetherActive, path) {
    if ((x === undefined) || (y === undefined)) return;
    if (tetherActive === undefined) tetherActive = true;
    const p = 0.5 + 0.5 * Math.sin(this.pulse * 1.8);
    const color = '#6cf';
    const coreColor = '#cfffff';
    const lwCore = tetherActive ? 3.2 : 2.2; // thicker while tether active
    // Neon halo via cached ring sprite
    ctx.save();
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 + 0.36 * p;
    const haloR = this.radius + 2; // small expansion to cover jagged edges
    const ring = GlowSpriteFactory.getRing(color, tetherActive ? 'thick' : 'thin');
    ctx.drawImage(ring, x - haloR, y - haloR, haloR * 2, haloR * 2);
    // Core jagged outline (normal composite)
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = color;
    ctx.lineWidth = lwCore;
    if (path) {
      ctx.translate(x, y);
      ctx.stroke(path);
      ctx.translate(-x, -y);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Core dot via cached glow sprite
    ctx.globalCompositeOperation = 'lighter';
    const dotR = 4.5 + 1.5 * p;
    const dot = GlowSpriteFactory.getDot('#9ef');
    ctx.drawImage(dot, x - dotR, y - dotR, dotR * 2, dotR * 2);
    ctx.restore();
  }
  #buildNodeGeometry() {
    // Build irregular polygon outlines similar to asteroids for A and B
    const build = () => {
      const verts = [];
      const n = 12;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const variance = 0.82 + Math.random() * 0.32;
        verts.push({ angle: ang, radius: this.radius * variance });
      }
      const path = new Path2D();
      for (let j = 0; j < verts.length; j++) {
        const vx = Math.cos(verts[j].angle) * verts[j].radius;
        const vy = Math.sin(verts[j].angle) * verts[j].radius;
        if (j === 0) path.moveTo(vx, vy); else path.lineTo(vx, vy);
      }
      path.closePath();
      return { verts, path };
    };
    const a = build(); this.aVerts = a.verts; this.aPath = a.path;
    const b = build(); this.bVerts = b.verts; this.bPath = b.path;
  }
  isFullyDestroyed() { return this.aDead && this.bDead; }

  // Damage handler: only works after tether is broken
  // deps: { createExplosion, awardPoints, addEXP, spawnParticle }
  hitNode(which, deps, ix, iy) {
    if (!this.tetherBroken) return false;
    const { createExplosion, awardPoints, addEXP, spawnParticle } = deps || {};
    // micro hit feedback at impact
    if (typeof createExplosion === 'function') {
      createExplosion(ix ?? 0, iy ?? 0, 3, '#6cf', 'micro');
    }
    if (which === 'A') {
      if (this.aDead) return false;
      this.aHits--;
      // SFX: impact if node A not yet destroyed
      if (deps && typeof deps.playSfx === 'function' && this.aHits > 0) {
        deps.playSfx('hit');
      }
      if (this.aHits <= 0) {
        this.aDead = true;
        // Full destruction feedback: particles + boom + rewards
        if (typeof spawnParticle === 'function') {
          for (let i = 0; i < 15; i++) {
            const ang = (Math.PI * 2 * i) / 15;
            const spd = Math.random() * 3 + 1;
            spawnParticle(this.ax, this.ay, Math.cos(ang) * spd, Math.sin(ang) * spd, '#6cf', 30);
          }
        }
        if (typeof createExplosion === 'function') {
          createExplosion(this.ax, this.ay, this.radius * 1.6, '#6cf');
        }
        if (typeof awardPoints === 'function') awardPoints(30, this.ax, this.ay, true);
        if (typeof addEXP === 'function') addEXP(30, 'tether-node');
        return true;
      }
    } else if (which === 'B') {
      if (this.bDead) return false;
      this.bHits--;
      // SFX: impact if node B not yet destroyed
      if (deps && typeof deps.playSfx === 'function' && this.bHits > 0) {
        deps.playSfx('hit');
      }
      if (this.bHits <= 0) {
        this.bDead = true;
        if (typeof spawnParticle === 'function') {
          for (let i = 0; i < 15; i++) {
            const ang = (Math.PI * 2 * i) / 15;
            const spd = Math.random() * 3 + 1;
            spawnParticle(this.bx, this.by, Math.cos(ang) * spd, Math.sin(ang) * spd, '#6cf', 30);
          }
        }
        if (typeof createExplosion === 'function') {
          createExplosion(this.bx, this.by, this.radius * 1.6, '#6cf');
        }
        if (typeof awardPoints === 'function') awardPoints(30, this.bx, this.by, true);
        if (typeof addEXP === 'function') addEXP(30, 'tether-node');
        return true;
      }
    }
    return false;
  }

  #ensureSparkSprite() {
    if (this.sparkSprite) return;
    const size = 5; // reduced sprite size by 50%
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const sctx = c.getContext('2d');
    // Soft white core
    const g = sctx.createRadialGradient(size/2, size/2, 0.5, size/2, size/2, size/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    sctx.fill();
    // Tiny cross sparkle
    sctx.strokeStyle = 'rgba(255,255,255,0.9)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(size*0.2, size*0.5); sctx.lineTo(size*0.8, size*0.5);
    sctx.moveTo(size*0.5, size*0.2); sctx.lineTo(size*0.5, size*0.8);
    sctx.stroke();
    this.sparkSprite = c;
  }

  #emitEmber() {
    if (!this.sparkSprite) this.#ensureSparkSprite();
    // Pick random point along the tether
    const t = Math.random();
    const x = this.ax + (this.bx - this.ax) * t;
    const y = this.ay + (this.by - this.ay) * t;
    // Perpendicular direction to the tether
    const dx = this.bx - this.ax;
    const dy = this.by - this.ay;
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len, py = dx / len; // unit perp
    if (Math.random() < 0.5) { px = -px; py = -py; }
    const spd = 0.6 + Math.random() * 0.9; // 50% of previous speed/spread
    const em = {
      x: x + (Math.random() - 0.5) * 2, // half position jitter
      y: y + (Math.random() - 0.5) * 2,
      vx: px * spd + (Math.random() - 0.5) * 0.3, // half noise
      vy: py * spd + (Math.random() - 0.5) * 0.3,
      life: 24 + Math.floor(Math.random() * 12),
      alpha: 0.8 + Math.random() * 0.2,
      scale: 0.35 + Math.random() * 0.3, // half scale range
    };
    this.embers.push(em);
    if (this.embers.length > 80) this.embers.splice(0, this.embers.length - 80);
  }
}

export class Wormhole {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = WORMHOLE_RADIUS;
    this.pulse = 0;
    // Fade-in state (2 seconds @60fps)
    this.fadeInFrames = 120;
    this.spawnAlpha = 0; // ramps 0->1 over fadeInFrames
    // Outward particle flow (sparkles/stars)
    this.flowParticles = [];
    this.flowSpawnAccum = 0;
  }
  update() {
    this.pulse += 0.06;
    // Advance fade-in
    if (this.spawnAlpha < 1) {
      this.spawnAlpha += 1 / this.fadeInFrames;
      if (this.spawnAlpha > 1) this.spawnAlpha = 1;
    }
    // Update outward particle stream
    const scale = 1.6; // match visual scale
    const outerStatic = (this.radius + Math.sin(this.pulse + 3) * 3 + 3 * 3) * 1.5 * scale;
    const endR = outerStatic * 1.2;
    // Spawn ~3 particles/frame
    const spawnRate = 3 * (this.spawnAlpha ?? 1);
    this.flowSpawnAccum += spawnRate;
    const toSpawn = Math.floor(this.flowSpawnAccum);
    if (toSpawn > 0) this.flowSpawnAccum -= toSpawn;
    for (let i = 0; i < toSpawn; i++) {
      if (this.flowParticles.length > 120) break; // cap
      const ang = Math.random() * Math.PI * 2;
      const life = 144 + (Math.random() * 120);
      this.flowParticles.push({
        ang,
        age: 0,
        life,
        r0: 2 + Math.random() * 6,
        r1: endR * (0.85 + Math.random() * 0.2),
        size: 1.2 + Math.random() * 2.2,
        tint: Math.random() < 0.5 ? '#cfe' : (Math.random() < 0.5 ? '#8ff' : '#fff'),
        spin: (Math.random() - 0.5) * 0.15,
      });
    }
    // Advance and prune
    for (let i = this.flowParticles.length - 1; i >= 0; i--) {
      const p = this.flowParticles[i];
      p.age++;
      p.ang += p.spin;
      if (p.age >= p.life) this.flowParticles.splice(i, 1);
    }
  }
  draw(ctx) {
    // Faint energy field for visibility (keep gradient fill)
    const scale = 1.6; // visual-only scale (does not change gameplay radius)
    const outerR = (this.radius + 14) * scale;
    const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, outerR);
    grad.addColorStop(0, 'rgba(200, 255, 255, 0.28)');
    grad.addColorStop(0.6, 'rgba(120, 220, 255, 0.16)');
    grad.addColorStop(1, 'rgba(0, 160, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = (this.spawnAlpha ?? 1);
    ctx.beginPath();
    ctx.arc(this.x, this.y, outerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Neon swirling rings via cached sprites
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 3; i >= 0; i--) {
      const c = i === 0 ? '#4af' : (i === 1 ? '#8ff' : '#a0f');
      let r = this.radius + Math.sin(this.pulse + i) * 3 + i * 3;
      if (i === 3) r *= 1.5; // enlarge outermost
      r *= scale;
      let alpha = (i === 0 ? 1 : 0.5) * (this.spawnAlpha ?? 1);
      if (i === 3) alpha *= 0.5; // reduce outermost ring alpha by 50%
      const ring = GlowSpriteFactory.getRing(c, i === 0 ? 'thick' : 'thin');
      ctx.globalAlpha = alpha;
      ctx.drawImage(ring, this.x - r, this.y - r, r * 2, r * 2);
    }
    // Animated outward-moving rings (3 thin rings)
    {
      // Compute target outer radius ~20% larger than current outer ring (i=3)
      const outerStatic = (this.radius + Math.sin(this.pulse + 3) * 3 + 3 * 3) * 1.5 * scale;
      const endR = outerStatic * 1.2;
      // Even slower phase for longer animation (another 2x duration)
      const basePhase = ((this.pulse * 0.0625) % 1 + 1) % 1; // 0..1
      const ringSprite = GlowSpriteFactory.getRing('#8ff', 'thin_hq');
      for (let k = 0; k < 3; k++) {
        let t = (basePhase + k / 3) % 1; // 0..1
        // Smooth easing
        const te = (1 - Math.cos(t * Math.PI)) * 0.5;
        const rMove = Math.max(2, te * endR);
        const alpha = 0.4 * (1 - te) * (this.spawnAlpha ?? 1);
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.drawImage(ringSprite, this.x - rMove, this.y - rMove, rMove * 2, rMove * 2);
      }
    }
    // Outward particles (stars/sparkles)
    {
      const dotWhite = GlowSpriteFactory.getDot('#fff');
      const dotBlue = GlowSpriteFactory.getDot('#8ff');
      const endR = (this.radius + Math.sin(this.pulse + 3) * 3 + 3 * 3) * 1.5 * scale * 1.2;
      for (let i = 0; i < this.flowParticles.length; i++) {
        const p = this.flowParticles[i];
        const t = Math.min(1, p.age / p.life);
        const te = (1 - Math.cos(t * Math.PI)) * 0.5;
        const rNow = p.r0 + (p.r1 - p.r0) * te;
        const x = this.x + Math.cos(p.ang) * rNow;
        const y = this.y + Math.sin(p.ang) * rNow;
        const a = 0.55 * (1 - te) * (this.spawnAlpha ?? 1);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        const spr = (p.tint === '#fff') ? dotWhite : dotBlue;
        // Size curve for outward flow: start larger, outer small
        const s = p.size * (0.5 + 0.5 * (1 - te));
        ctx.drawImage(spr, x - s, y - s, s * 2, s * 2);
        // Sharp core
        ctx.globalAlpha = Math.min(1, a * 1.2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
    // Core glow dot
    const coreR = (6 + Math.sin(this.pulse * 2) * 2) * scale;
    const dot = GlowSpriteFactory.getDot('#8ff');
    ctx.globalAlpha = 1 * (this.spawnAlpha ?? 1);
    ctx.drawImage(dot, this.x - coreR, this.y - coreR, coreR * 2, coreR * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }
}
