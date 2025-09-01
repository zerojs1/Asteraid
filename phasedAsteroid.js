// phasedAsteroid.js: New Phased Asteroid enemy for Level 13
export class PhasedAsteroid {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    // Base similar to large (size 3) but +25%
    this.baseRadius = 60;
    this.radius = Math.floor(this.baseRadius * 1.25); // 75
    // Slightly faster than large normal
    this.speed = 0.7;
    // Random velocity
    const ang = Math.random() * Math.PI * 2;
    this.vx = Math.cos(ang) * this.speed;
    this.vy = Math.sin(ang) * this.speed;

    // Rotation for visual flair
    this.rotation = 0;
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;

    // Hits to kill
    this.hits = 5;

    // Phase state: visible/tangible vs ghost/invulnerable
    this.visible = true;
    this._resetPhaseTimer();

    // Simple trail while visible
    this.trail = [];
    this.trailTick = 0;

    // Teleport cooldown for wormholes
    this.warpCooldown = 0;

    this.dead = false;

    // Precompute vertices once and cache a sprite (baked glow/outline) for fast drawing
    this.vertices = [];
    const nVerts = 10;
    for (let i = 0; i < nVerts; i++) {
      const ang = (i / nVerts) * Math.PI * 2;
      // Fixed random variance per instance to keep a unique shape without per-frame randomness
      const variance = 0.85 + Math.random() * 0.3;
      this.vertices.push({ angle: ang, radius: this.radius * variance });
    }
    this.path = this.buildPath(this.vertices, 1);
    this.pathTrail = this.buildPath(this.vertices, 0.95);
    this.createSprite();
  }

  _resetPhaseTimer() {
    // 90-150 frames
    this.phaseTimer = 90 + Math.floor(Math.random() * 61);
  }

  update(canvas) {
    if (this.dead) return;
    // Movement
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;

    // Wrap
    if (this.x < -this.radius) this.x = canvas.width + this.radius;
    if (this.x > canvas.width + this.radius) this.x = -this.radius;
    if (this.y < -this.radius) this.y = canvas.height + this.radius;
    if (this.y > canvas.height + this.radius) this.y = -this.radius;

    // Phase
    this.phaseTimer--;
    if (this.phaseTimer <= 0) {
      this.visible = !this.visible;
      this._resetPhaseTimer();
    }

    // Trail while visible and moving
    if (this.visible) {
      this.trailTick = (this.trailTick || 0) + 1;
      const sp = Math.hypot(this.vx, this.vy);
      if (this.trailTick % 2 === 0 && sp > 0.5) {
        this.trail.push({ x: this.x, y: this.y, rot: this.rotation, alpha: 0.42 });
        if (this.trail.length > 20) this.trail.shift();
      }
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].alpha -= 0.03;
        if (this.trail[i].alpha <= 0.02) this.trail.splice(i, 1);
      }
    } else if (this.trail && this.trail.length) {
      // Fade remaining trail while invisible
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].alpha -= 0.05;
        if (this.trail[i].alpha <= 0.02) this.trail.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    if (this.dead) return;

    // Draw trail using cached sprite
    if (this.trail && this.trail.length && this.spriteCanvas) {
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const a = t.alpha;
        if (a <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rot);
        ctx.scale(0.95, 0.95);
        ctx.drawImage(this.spriteCanvas, -this.spriteHalfW, -this.spriteHalfH, this.spriteW, this.spriteH);
        ctx.restore();
      }
    }

    if (!this.visible) {
      // Ghost state: draw faint sprite as a hint (no re-stroking)
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      if (this.spriteCanvas) {
        ctx.drawImage(this.spriteCanvas, -this.spriteHalfW, -this.spriteHalfH, this.spriteW, this.spriteH);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    // Visible state: draw cached sprite (bright purple baked-in)
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    if (this.spriteCanvas) {
      ctx.drawImage(this.spriteCanvas, -this.spriteHalfW, -this.spriteHalfH, this.spriteW, this.spriteH);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  buildPath(vertices, scale) {
    const p = new Path2D();
    for (let j = 0; j < vertices.length; j++) {
      const vertex = vertices[j];
      const x = Math.cos(vertex.angle) * vertex.radius * scale;
      const y = Math.sin(vertex.angle) * vertex.radius * scale;
      if (j === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  }

  createSprite() {
    // Pre-render sprite with baked glow and outline for performance
    const color = '#d0f';
    const margin = 24;
    const viewW = this.radius * 2 + margin * 2;
    const viewH = this.radius * 2 + margin * 2;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    this.spriteCanvas = (typeof document !== 'undefined' && document.createElement)
      ? document.createElement('canvas')
      : undefined;
    if (!this.spriteCanvas) {
      this.spriteW = viewW; this.spriteH = viewH; this.spriteHalfW = viewW / 2; this.spriteHalfH = viewH / 2;
      return;
    }

    this.spriteCanvas.width = Math.ceil(viewW * dpr);
    this.spriteCanvas.height = Math.ceil(viewH * dpr);
    this.spriteW = viewW;
    this.spriteH = viewH;
    this.spriteHalfW = viewW / 2;
    this.spriteHalfH = viewH / 2;

    const sctx = this.spriteCanvas.getContext('2d');
    if (!sctx) return;
    sctx.save();
    sctx.scale(dpr, dpr);
    sctx.translate(this.spriteHalfW, this.spriteHalfH);

    // Bake four-pass glow/outline (outer to inner). Use prebuilt paths.
    for (let i = 3; i >= 0; i--) {
      sctx.strokeStyle = color;
      sctx.lineWidth = i === 0 ? 2 : 1;
      sctx.globalAlpha = i === 0 ? 1 : 0.3;
      sctx.shadowBlur = 20 - i * 5;
      sctx.shadowColor = color;
      sctx.stroke(this.path);
    }

    sctx.restore();
    sctx.shadowBlur = 0;
    sctx.globalAlpha = 1;
  }

  _strokeShape(ctx, color) {
    // Fallback stroking using precomputed vertices (not used in normal flow after sprite caching)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i === 0 ? 1 : 0.35;
      ctx.shadowBlur = 20 - i * 5;
      ctx.shadowColor = color;
      ctx.beginPath();
      const verts = this.vertices;
      for (let j = 0; j < verts.length; j++) {
        const vx = Math.cos(verts[j].angle) * verts[j].radius;
        const vy = Math.sin(verts[j].angle) * verts[j].radius;
        if (j === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  hit(deps, impactX, impactY) {
    if (this.dead) return false;
    if (!this.visible) return false;
    const { createExplosion } = deps || {};
    const ix = (typeof impactX === 'number') ? impactX : this.x;
    const iy = (typeof impactY === 'number') ? impactY : this.y;
    // Micro hit pop every time for feedback
    if (createExplosion) {
      createExplosion(ix, iy, 3, '#c0f', 'micro');
    }
    this.hits--;
    if (this.hits <= 0) {
      this.destroy(deps);
      return true;
    }
    return false;
  }

  destroy(deps) {
    if (this.dead) return;
    const { createExplosion, awardPoints, applyShockwave, onDestroyed } = deps || {};
    // Purple shockwave + small shards
    if (createExplosion) createExplosion(this.x, this.y, this.radius * 1.1, '#c0f');
    // Knockback using mine shockwave tuning passed by caller
    if (applyShockwave) applyShockwave(this.x, this.y);
    if (awardPoints) awardPoints(60, this.x, this.y, true);
    // Award EXP for defeating a phased asteroid (classic mode gating handled inside addEXP)
    if (deps && typeof deps.addEXP === 'function') deps.addEXP(12, 'phased');
    // Allow caller to react (e.g., level 13 replacement spawn)
    if (typeof onDestroyed === 'function') onDestroyed(this);
    this.dead = true;
  }
}
