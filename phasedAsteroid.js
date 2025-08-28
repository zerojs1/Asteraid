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

    // Draw trail
    if (this.trail && this.trail.length) {
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const a = t.alpha;
        if (a <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rot);
        ctx.scale(0.95, 0.95);
        this._strokeShape(ctx, '#c0f');
        ctx.restore();
      }
    }

    if (!this.visible) {
      // Optional subtle shimmer to hint presence
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      this._strokeShape(ctx, '#c0f');
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    // Visible state: bright purple
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    this._strokeShape(ctx, '#d0f');
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  _strokeShape(ctx, color) {
    // Irregular 10-gon outline
    const r = this.radius;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i === 0 ? 1 : 0.35;
      ctx.shadowBlur = 20 - i * 5;
      ctx.shadowColor = color;
      ctx.beginPath();
      const n = 10;
      for (let j = 0; j < n; j++) {
        const ang = (j / n) * Math.PI * 2;
        const variance = 0.85 + Math.random() * 0.3; // subtle wobble
        const x = Math.cos(ang) * r * variance;
        const y = Math.sin(ang) * r * variance;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
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
    // One-time pop on first successful visible hit (fixed 16px)
    if (!this._firstHitShown && createExplosion) {
              // Fixed 16px radius using lightweight 'micro' profile
              createExplosion(ix, iy, 3, '#c0f', 'micro');
      this._firstHitShown = true;
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
    const { createExplosion, awardPoints, applyShockwave } = deps || {};
    // Purple shockwave + small shards
    if (createExplosion) createExplosion(this.x, this.y, this.radius * 1.1, '#c0f');
    // Knockback using mine shockwave tuning passed by caller
    if (applyShockwave) applyShockwave(this.x, this.y);
    if (awardPoints) awardPoints(60, this.x, this.y, true);
    this.dead = true;
  }
}
