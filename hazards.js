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
} from './constants.js';

export class GravityWell {
  constructor(x, y, strength = GRAVITY_STRENGTH, radius = GRAVITY_RADIUS) {
    this.x = x;
    this.y = y;
    this.strength = strength;
    this.radius = radius;
    this.pulse = 0;
  }
  update() {
    this.pulse += 0.03;
  }
  draw(ctx) {
    // Concentric neon rings
    for (let i = 3; i >= 0; i--) {
      const color = i === 0 ? '#48f' : '#90f';
      ctx.globalAlpha = i === 0 ? 0.9 : 0.25;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 20 - i * 4;
      ctx.shadowColor = color;
      ctx.lineWidth = i === 0 ? 2 : 1;
      const r = this.radius * (0.45 + i * 0.15) + Math.sin(this.pulse + i) * 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Core glow
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#0ff';
    ctx.fillStyle = '#0ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6 + Math.sin(this.pulse * 2) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
    // Neon halo
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 + 0.36 * p;
    ctx.shadowBlur = 22 + 10 * p;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = lwCore + 1.6;
    if (path) {
      ctx.translate(x, y);
      ctx.stroke(path);
      ctx.translate(-x, -y);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Core jagged outline
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
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
    // Core dot
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#9ef';
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(x, y, 4.5 + 1.5 * p, 0, Math.PI * 2);
    ctx.fill();
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
  }
  update() {
    this.pulse += 0.06;
  }
  draw(ctx) {
    // Faint energy field for visibility
    const outerR = this.radius + 14;
    const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, outerR);
    grad.addColorStop(0, 'rgba(200, 255, 255, 0.28)');
    grad.addColorStop(0.6, 'rgba(120, 220, 255, 0.16)');
    grad.addColorStop(1, 'rgba(0, 160, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, outerR, 0, Math.PI * 2);
    ctx.fill();

    // Neon swirling rings (brighter)
    for (let i = 3; i >= 0; i--) {
      const c = i === 0 ? '#4af' : (i === 1 ? '#8ff' : '#a0f');
      ctx.globalAlpha = i === 0 ? 1 : 0.5;
      ctx.strokeStyle = c;
      ctx.shadowBlur = 22 - i * 4;
      ctx.shadowColor = c;
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      let r = this.radius + Math.sin(this.pulse + i) * 3 + i * 3;
      // Enlarge the outermost outline circle by 50% for better visibility
      if (i === 3) r *= 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Core
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#8ff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6 + Math.sin(this.pulse * 2) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
