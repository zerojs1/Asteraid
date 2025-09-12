// UFO enemy inspired by classic Asteroids saucer, top-down CRT vector style
// Spawns from left/right, weaves vertically, fires at the player every ~2s.
// Designed for integration from ast.html via explicit imports and simple state.

export class UFO {
  constructor({ canvas, getFrameCount }) {
    this.canvas = canvas;
    this.getFrameCount = getFrameCount || (() => 0);
    // Spawn side and initial position are set by caller via setSpawn(side)
    this.x = 0;
    this.y = canvas ? canvas.height * 0.25 + Math.random() * (canvas.height * 0.5) : 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = 14; // collision radius (top-down saucer footprint) — ~25% larger than previous
    this.health = 15; // 15 standard hits
    this.dead = false; // destroyed flag
    this.despawned = false; // offscreen/despawn flag

    // Movement profile
    // Movement — make it 50% slower and smoother
    this.speed = (2.0 + Math.random() * 0.6) * 0.5; // horizontal speed (halved)
    this.t = Math.random() * Math.PI * 2; // vertical motion phase (wobble)
    this.tSpeed = (0.035 + Math.random() * 0.02) * 0.5; // vertical oscillation rate (halved)
    this.amp = 46 + Math.random() * 30; // vertical oscillation amplitude (kept)
    this.noise = 0; // vertical noise accumulator (reduced effect below)
    // Natural wandering target Y (retarget periodically within safe margins)
    this.targetY = this.y;
    this.retargetTimer = 90 + Math.floor(Math.random() * 70);

    // Firing
    this.fireCooldown = 120; // frames (~2s @60fps)

    // Laser damage throttling (avoid melting in a single frame)
    this.laserDamageCooldown = 0; // frames until we can take another laser tick

    // Visual sprite cache (rebuild on DPR changes)
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this._sprite = null;
    this._spriteSize = 0;
    this._lastDpr = this.dpr;
    // Cached glowing dot sprite for center trail
    this._dotSprite = null;
    this._dotSize = 0;
    // Center glow trail points (long fading trail)
    this.coreTrail = []; // each: {x,y,alpha}
    this._buildSprite();
  }

  setSpawn(side = 'left') {
    const w = this.canvas ? this.canvas.width : 800;
    const h = this.canvas ? this.canvas.height : 600;
    const margin = 40;
    this.y = h * 0.25 + Math.random() * (h * 0.5);
    if (side === 'left') {
      this.x = -margin;
      this.vx = this.speed;
    } else {
      this.x = w + margin;
      this.vx = -this.speed;
    }
    // Initialize first target within comfortable band
    const top = 40, bottom = h - 40;
    this.targetY = Math.max(top, Math.min(bottom, this.y));
  }

  // Caller decides exact projectile class; this method only computes firing
  update(player, enemyBullets, EnemyBullet, asteroids) {
    if (this.dead || this.despawned) return;
    const w = this.canvas.width, h = this.canvas.height;

    // Refresh sprite on DPR change
    const currDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (currDpr !== this.dpr) {
      this.dpr = currDpr; this._lastDpr = currDpr; this._buildSprite(); this._buildDotSprite();
    }

    // Horizontal drift is constant; vertical movement chases a wandering targetY
    // Retarget Y occasionally to create natural drifting paths (not following player)
    if (this.retargetTimer > 0) this.retargetTimer--;
    if (this.retargetTimer === 0) {
      const top = 40, bottom = h - 40;
      // Choose a new targetY within 15%..85% of the screen height, with slight bias toward center
      const r = 0.15 + Math.random() * 0.7;
      const mid = h * 0.5;
      const candidate = r * h;
      this.targetY = Math.max(top, Math.min(bottom, (candidate * 0.7 + mid * 0.3)));
      this.retargetTimer = 90 + Math.floor(Math.random() * 90);
    }

    // Small wobble and gentle noise overlay
    this.t += this.tSpeed;
    this.noise += (Math.random() - 0.5) * 0.35; // gentler noise than before
    this.noise = Math.max(-14, Math.min(14, this.noise));
    const wobble = Math.sin(this.t * 2.0) * this.amp * 0.07 + this.noise * 0.035;

    // Seek toward targetY with easing and clamp vertical speed
    const dy = (this.targetY - this.y);
    const seek = dy * 0.025; // easing toward target (slightly stronger)
    const targetVy = seek + wobble;
    // Smooth vy towards target (heavier smoothing)
    this.vy = this.vy * 0.93 + targetVy * 0.07;
    // Clamp vertical speed for smoothness
    this.vy = Math.max(-3.5, Math.min(3.5, this.vy));

    // Soft avoidance of nearby asteroids (do not follow player; just avoid collisions if possible)
    if (asteroids && asteroids.length) {
      let ax = 0, ay = 0;
      const avoidR = 120; // consider asteroids within this radius
      for (let i = 0; i < asteroids.length; i++) {
        const a = asteroids[i];
        const dx = this.x - a.x, dyA = this.y - a.y;
        const d = Math.hypot(dx, dyA);
        const minD = (this.radius + (a.radius || 0)) + 18;
        if (d > 0 && d < avoidR) {
          // Inverse-square falloff away from asteroid, stronger when very close
          const f = Math.max(0, (avoidR - d) / avoidR);
          const nx = dx / d, ny = dyA / d;
          ax += nx * f * (d < minD ? 2.0 : 0.6);
          ay += ny * f * (d < minD ? 2.0 : 0.6);
        }
      }
      // Apply mostly to vertical speed to preserve horizontal pass; slight horizontal nudge ok
      this.vy += ay * 0.35;
      // Nudge x but keep direction (do not reverse vx)
      const vxSign = this.vx >= 0 ? 1 : -1;
      const nudgedVx = this.vx + ax * 0.12;
      this.vx = Math.max(0.5, Math.min(3.0, Math.abs(nudgedVx))) * vxSign;
    }

    this.x += this.vx;
    this.y += this.vy;

    // Keep within vertical bounds softly
    if (this.y < 40) { this.y = 40; this.vy *= -0.5; this.noise *= 0.5; }
    if (this.y > h - 40) { this.y = h - 40; this.vy *= -0.5; this.noise *= 0.5; }

    // Fire toward player
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.fireCooldown === 0 && enemyBullets && EnemyBullet) {
      const ang = Math.atan2((player.y || 0) - this.y, (player.x || 0) - this.x);
      const eb = new EnemyBullet(this.x, this.y, ang, 5.0);
      eb.color = '#d33';
      enemyBullets.push(eb);
      this.fireCooldown = 120;
    }

    // Laser damage cooldown tick
    if (this.laserDamageCooldown > 0) this.laserDamageCooldown--;

    // Offscreen despawn once fully out of bounds horizontally
    const cullMargin = 48;
    if (this.x < -cullMargin || this.x > w + cullMargin) {
      this.despawned = true;
    }

    // Record center trail point (every frame, long fading history with cap)
    this.coreTrail.push({ x: this.x, y: this.y, alpha: 1 });
    if (this.coreTrail.length > 120) this.coreTrail.shift();
    // Fade existing trail
    for (let i = 0; i < this.coreTrail.length; i++) {
      this.coreTrail[i].alpha *= 0.96;
    }
  }

  draw(ctx) {
    if (this.dead || this.despawned) return;
    if (!this._sprite) { this._buildSprite(); }
    const s = this._sprite;
    if (!s) return;
    const size = this._spriteSize / this.dpr;
    // Draw long fading trail for the central glow (world space, no extra translation)
    if (!this._dotSprite) this._buildDotSprite();
    if (this.coreTrail && this.coreTrail.length) {
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const ds = this._dotSprite;
      const drawW = (this._dotSize / this.dpr);
      const drawH = drawW;
      for (let i = 0; i < this.coreTrail.length; i += 3) { // step by 2 for perf
        const p = this.coreTrail[i];
        if (p.alpha < 0.05) continue;
        ctx.globalAlpha = Math.min(1, p.alpha * 0.8);
        ctx.drawImage(ds, p.x - drawW / 2, p.y - drawH / 2, drawW, drawH);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevOp;
    }
    // Now draw UFO at its position
    ctx.save();
    ctx.translate(this.x, this.y);
    // Subtle bob glow intensity
    const glow = 12 + 4 * Math.sin(this.t * 1.5);
    ctx.globalAlpha = 1;
    ctx.shadowColor = '#b11';
    ctx.shadowBlur = glow;
    ctx.drawImage(s, -size / 2, -size / 2, size, size);
    ctx.shadowBlur = 0;
    // Blinking central bright red dot overlay (animated in draw, not in cached sprite)
    const fc = this.getFrameCount();
    const blink = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(fc * 0.06)); // 0.6..1.0 alpha, slow blink
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 10 * blink;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, this.radius * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  takeHit(amount = 1) {
    if (this.dead || this.despawned) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) { this.dead = true; }
    return this.dead;
  }

  canTakeLaserTick() {
    return this.laserDamageCooldown === 0;
  }

  applyLaserTick(dmg = 1) {
    if (!this.canTakeLaserTick()) return false;
    this.takeHit(dmg);
    this.laserDamageCooldown = 6; // at most ~10 hits/second while under the beam
    return this.dead;
  }

  collidesWithCircle(cx, cy, r) {
    const dx = cx - this.x, dy = cy - this.y;
    return Math.hypot(dx, dy) < (this.radius + (r || 0));
  }

  _buildSprite() {
    // Build a red neon top-down saucer: concentric rings, opaque dark-red core with outline, and radial fins (darker outline)
    const baseR = this.radius + 6; // leave little margin
    const margin = 24;
    const size = (baseR + margin) * 2;
    const dpr = this.dpr;
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) { this._sprite = null; this._spriteSize = 0; return; }
    c.width = Math.ceil(size * dpr);
    c.height = Math.ceil(size * dpr);
    const g = c.getContext('2d');
    g.save();
    g.scale(dpr, dpr);
    g.translate(size / 2, size / 2);

    // Primary rim ring
    const rimR = this.radius + 1.5;
    for (let i = 3; i >= 0; i--) {
      g.globalAlpha = i === 0 ? 1 : 0.70; // make outer rings much less transparent
      g.shadowBlur = 14 - i * 3; // darker/glow reduced
      g.shadowColor = '#8a1111';
      g.strokeStyle = '#8a1111'; // darker outline
      g.lineWidth = i === 0 ? 2.6 : 1.2;
      g.beginPath();
      g.arc(0, 0, rimR + i * 2, 0, Math.PI * 2);
      g.stroke();
    }

    // Inner segmented ring (Dreadship-inspired, smaller)
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    const innerR = this.radius - 6;
    const segs = 8;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + 0.08;
      const a1 = a0 + (Math.PI * 2) / segs - 0.16;
      g.strokeStyle = '#b44';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, innerR, a0, a1);
      g.stroke();
    }

    // Central core: solid dark red fill and thin white outline
    const coreR = Math.max(3, this.radius * 0.35);
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.fillStyle = '#8a0000';
    g.beginPath();
    g.arc(0, 0, coreR, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, coreR, 0, Math.PI * 2);
    g.stroke();

    // Radial fins (short red spokes) for top-down feel
    g.globalAlpha = 0.95;
    g.shadowBlur = 10;
    g.shadowColor = '#a22';
    g.strokeStyle = '#a22';
    g.lineWidth = 2.2;
    const finCount = 6;
    for (let k = 0; k < finCount; k++) {
      const a = (k / finCount) * Math.PI * 2;
      const x0 = Math.cos(a) * (innerR * 0.6);
      const y0 = Math.sin(a) * (innerR * 0.6);
      const x1 = Math.cos(a) * (rimR * 0.92);
      const y1 = Math.sin(a) * (rimR * 0.92);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }

    g.restore();
    this._sprite = c;
    this._spriteSize = size * dpr;
  }

  _buildDotSprite() {
    // Small red glow dot used for trail; cached for performance
    const dpr = this.dpr;
    const logicalR = Math.max(2.5, this.radius * 0.2) + 4; // include glow margin
    const size = Math.ceil((logicalR * 2 + 6) * dpr);
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) { this._dotSprite = null; this._dotSize = 0; return; }
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.save();
    g.scale(dpr, dpr);
    g.translate(size / (2 * dpr), size / (2 * dpr));
    g.globalAlpha = 1;
    g.fillStyle = '#ff4444';
    g.shadowColor = '#ff4444';
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(0, 0, logicalR - 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
    this._dotSprite = c;
    this._dotSize = size;
  }
}
