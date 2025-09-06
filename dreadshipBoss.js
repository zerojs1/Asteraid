// Alien Dreadship Boss (Level 8)
// Uses dependency injection consistent with other boss modules
// Deps expected:
// {
//   canvas, ctx,
//   player,
//   enemyBullets, drones, powerups,
//   EnemyBullet, Drone, Powerup,
//   // Mines support for Level 8 behavior
//   mines, Mine,
//   createExplosion, awardPoints, lineCircleCollision,
//   setShake: (frames, intensity) => void,
//   onPlayerHit: () => void,
//   getFrameCount: () => number,
// }

export class DreadshipBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.hullRadius = 110;
    this.coreRadius = 42;
    this.coreHealth = 12;
    this.rotate = 0;
    this.rotateSpeed = 0.007;
    this.defeated = false;
    this.spawnTime = getFrameCount ? getFrameCount() : 0;
    // Slow roaming movement within central 60% of the canvas
    this.moveSpeed = 0.6;
    this.pickNewTarget();

    this.turrets = [];
    const count = 3;
    for (let i = 0; i < count; i++) {
      this.turrets.push({
        angle: (Math.PI * 2 * i) / count,
        hits: 3,
        radius: 24,
        fireCooldown: Math.floor((60 + Math.floor(Math.random() * 20)) * 1.5),
        trail: [], // recent positions for glow trail
      });
    }

    this.laserWarningTimer = 0;
    this.laserActiveTimer = 0;
    this.laserAngle = 0;
    this.laserSweepSpeed = 0.04;
    this.laserCooldown = 300;
    this.coreExposedTimer = 0;

    this.droneCooldown = 200;
    // Timed mine spawning (Level 8): one every ~2s up to a small cap
    this.mineCooldown = 120; // frames between spawns (legacy counter; see frame-based logic)
    this.mineCap = 5;        // max active (non-exploded) mines while boss is alive
    this.lastMineSpawnFrame = this.spawnTime || 0; // track last frame a mine was spawned (for legacy)
    this._mineTimer = 0;     // internal per-boss timer to drive spawns reliably
    
    // DPR-aware sprite cache
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this._lastCanvasW = canvas.width;
    this._lastCanvasH = canvas.height;
    this._lastDpr = this.dpr;
    this.hullSprite = null;     // offscreen canvas for hull ellipse glow bundle
    this.turretSprite = null;   // offscreen canvas for turret base ring (no glow)
    this.shieldSprite = null;   // offscreen canvas for hex shield overlay
    this.runeCount = 24;        // orbiting rune lights count (purely visual)
    this.turretGlowSprite = null; // cached red glow sprite for trails
    this.initSprites();
    // Laser embers
    this.laserEmbers = [];
    this.laserEmberSprite = null;
    // Brief visual ping when core is hit while invulnerable
    this.invulnHitTimer = 0; // frames remaining
    this.invulnHitAngle = 0; // impact angle for arc visualization
  }

  // --- Sprite pre-render helpers ---
  initSprites() {
    this.buildHullSprite();
    this.buildTurretSprite();
    this.buildShieldSprite();
    this.buildTurretGlowSprite();
    this.buildLaserEmberSprite();
  }

  refreshIfDisplayChanged() {
    const { canvas } = this.deps || {};
    const currDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (currDpr !== this.dpr) {
      this.dpr = currDpr;
      this._lastDpr = currDpr;
      this.initSprites();
    }
    if (canvas && (canvas.width !== this._lastCanvasW || canvas.height !== this._lastCanvasH)) {
      this._lastCanvasW = canvas.width;
      this._lastCanvasH = canvas.height;
    }
  }

  createOffscreen(width, height) {
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = Math.ceil(width * this.dpr);
    c.height = Math.ceil(height * this.dpr);
    return c;
  }

  buildHullSprite() {
    const hullR = this.hullRadius;
    const maxRx = hullR + 3 * 6;         // i=3
    const maxRy = hullR * 0.6 + 3 * 4;   // i=3
    const margin = 24;
    const w = maxRx * 2 + margin * 2;
    const h = maxRy * 2 + margin * 2;
    const c = this.createOffscreen(w, h);
    if (!c) { this.hullSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(w / 2, h / 2);
    for (let i = 3; i >= 0; i--) {
      const color = ['#0ff', '#0df', '#09f', '#06f'][i];
      g.globalAlpha = i === 0 ? 1 : 0.35;
      g.shadowBlur = 20 - i * 4;
      g.shadowColor = color;
      g.strokeStyle = color;
      g.lineWidth = i === 0 ? 3 : 1.6;
      g.beginPath();
      g.ellipse(0, 0, hullR + i * 6, hullR * 0.6 + i * 4, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // Inner hull body fill with subtle panel seams to look more like a ship
    const bodyGrad = g.createLinearGradient(-hullR, 0, hullR, 0);
    bodyGrad.addColorStop(0.0, '#0a1320');
    bodyGrad.addColorStop(0.5, '#0c2644');
    bodyGrad.addColorStop(1.0, '#081226');
    g.globalAlpha = 0.95;
    g.shadowBlur = 0;
    g.fillStyle = bodyGrad;
    g.beginPath();
    g.ellipse(0, 0, hullR * 0.98, hullR * 0.58, 0, 0, Math.PI * 2);
    g.fill();

    // Panel seams and alien veins (subtle cyan glow strokes)
    g.globalAlpha = 0.22;
    g.shadowBlur = 6;
    g.shadowColor = '#0df';
    g.strokeStyle = '#0df';
    g.lineWidth = 1;
    // longitudinal seam
    g.beginPath();
    g.ellipse(0, 0, hullR * 0.6, hullR * 0.36, 0, 0, Math.PI * 2);
    g.stroke();
    // transverse seams
    g.beginPath();
    g.ellipse(0, 0, hullR * 0.82, hullR * 0.51, Math.PI / 8, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, hullR * 0.74, hullR * 0.46, -Math.PI / 8, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
    g.restore();
    g.globalAlpha = 1; g.shadowBlur = 0;
    this.hullSprite = c;
  }

  buildTurretSprite() {
    // Base crisp ring (no glow); dynamic glow is drawn live per frame
    const radius = (this.turrets && this.turrets[0]) ? this.turrets[0].radius : 24;
    const margin = 12;
    const size = radius * 2 + margin * 2;
    const c = this.createOffscreen(size, size);
    if (!c) { this.turretSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(size / 2, size / 2);
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.strokeStyle = '#fa3';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, radius - 0.5, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    this.turretSprite = c;
  }

  buildTurretGlowSprite() {
    // Small red radial glow used for turret trails
    const size = 18; // logical pixels; scaled by DPR in createOffscreen
    const c = this.createOffscreen(size, size);
    if (!c) { this.turretGlowSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    const s = size;
    const cx = s / 2, cy = s / 2, r = s * 0.45;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.0, 'rgba(255,60,60,0.95)');
    grad.addColorStop(0.5, 'rgba(255,60,60,0.35)');
    grad.addColorStop(1.0, 'rgba(255,60,60,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.restore();
    this.turretGlowSprite = c;
  }

  buildLaserEmberSprite() {
    // Small, bright red ember used for laser shedding
    const size = 14;
    const c = this.createOffscreen(size, size);
    if (!c) { this.laserEmberSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    const s = size;
    const cx = s / 2, cy = s / 2, r = s * 0.48;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.0, 'rgba(255,80,60,1)');
    grad.addColorStop(0.4, 'rgba(255,60,40,0.55)');
    grad.addColorStop(1.0, 'rgba(255,60,40,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.restore();
    this.laserEmberSprite = c;
  }

  buildShieldSprite() {
    // Hex grid clipped to hull bounds; drawn additively when shield is up
    const hullR = this.hullRadius;
    const maxRx = hullR + 3 * 6;       // match hull sprite extents
    const maxRy = hullR * 0.6 + 3 * 4;
    const margin = 24;
    const w = maxRx * 2 + margin * 2;
    const h = maxRy * 2 + margin * 2;
    const c = this.createOffscreen(w, h);
    if (!c) { this.shieldSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(w / 2, h / 2);
    // Clip to hull ellipse slightly larger than body
    g.save();
    g.beginPath();
    g.ellipse(0, 0, hullR * 1.02, hullR * 0.62, 0, 0, Math.PI * 2);
    g.clip();
    // Draw hex grid
    const r = 9; // hex radius
    const hexH = Math.sqrt(3) * r;
    const hexW = 2 * r;
    const xStep = 0.75 * hexW;
    const yStep = hexH;
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,255,255,0.14)';
    g.shadowColor = '#0ff';
    g.shadowBlur = 2;
    for (let y = -h; y <= h; y += yStep) {
      const row = Math.round((y + h) / yStep);
      const xOff = (row % 2) ? xStep * 0.5 : 0;
      for (let x = -w; x <= w; x += xStep) {
        const cx = x + xOff;
        const cy = y;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = Math.PI / 6 + i * (Math.PI / 3);
          const px = cx + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.stroke();
      }
    }
    g.restore(); // clip
    g.restore();
    this.shieldSprite = c;
  }

  isDefeated() { return this.defeated; }

  turretPositions() {
    return this.turrets.map(t => ({
      x: this.x + Math.cos(this.rotate + t.angle) * (this.hullRadius - 10),
      y: this.y + Math.sin(this.rotate + t.angle) * (this.hullRadius - 10),
      radius: t.radius,
      ref: t,
    }));
  }

  pickNewTarget() {
    const { canvas } = this.deps;
    const mx = canvas.width * 0.2;
    const my = canvas.height * 0.2;
    this.targetX = mx + Math.random() * (canvas.width * 0.6);
    this.targetY = my + Math.random() * (canvas.height * 0.6);
  }

  // Core is only vulnerable when exposed by laser AND all turrets are destroyed
  isCoreVulnerable() {
    return (this.coreExposedTimer > 0) && (this.turrets.length === 0);
  }

  update() {
    const { player, enemyBullets, EnemyBullet, drones, Drone, lineCircleCollision, onPlayerHit } = this.deps;
    // Advance internal timers
    this._mineTimer = (this._mineTimer || 0) + 1;
    this.rotate += this.rotateSpeed;
    // Move slowly toward target; retarget when close
    if (typeof this.targetX === 'number' && typeof this.targetY === 'number') {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) {
        this.pickNewTarget();
      } else if (dist > 0) {
        const step = Math.min(this.moveSpeed, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }

    // Turret firing cadence accelerates as turrets are destroyed
    const accel = this.turrets.length <= 1 ? 0.6 : (this.turrets.length === 2 ? 0.3 : 0);
    for (let t of this.turrets) {
      if (t.fireCooldown > 0) t.fireCooldown--;
      if (t.fireCooldown === 0 && enemyBullets && EnemyBullet) {
        const posX = this.x + Math.cos(this.rotate + t.angle) * (this.hullRadius - 10);
        const posY = this.y + Math.sin(this.rotate + t.angle) * (this.hullRadius - 10);
        const base = Math.atan2(player.y - posY, player.x - posX);
        for (let i = -2; i <= 2; i++) enemyBullets.push(new EnemyBullet(posX, posY, base + i * 0.09, 5.5));
        t.fireCooldown = Math.floor((90 - Math.floor(20 * accel)) * 1.5);
      }
      // Record trail position each frame
      const tx = this.x + Math.cos(this.rotate + t.angle) * (this.hullRadius - 10);
      const ty = this.y + Math.sin(this.rotate + t.angle) * (this.hullRadius - 10);
      t.trail.push({ x: tx, y: ty, a: 1 });
      if (t.trail.length > 36) t.trail.shift(); // cap length for perf
    }

    // Laser handling
    if (this.laserActiveTimer > 0) {
      this.laserActiveTimer--;
      this.laserAngle += this.laserSweepSpeed;
      const x2 = this.x + Math.cos(this.laserAngle) * 2000;
      const y2 = this.y + Math.sin(this.laserAngle) * 2000;
      if (player.invulnerable === 0 && player.shielded === 0 && player.invisible === 0) {
        if (lineCircleCollision && lineCircleCollision(this.x, this.y, x2, y2, player.x, player.y, player.radius)) {
          onPlayerHit && onPlayerHit();
        }
      }
      // Spawn red glowing embers that fly off the laser beam
      {
        const { canvas } = this.deps || {};
        // Per-frame small batch for perf
        const spawnCount = 3;
        const dx = x2 - this.x, dy = y2 - this.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        // Perpendicular unit vector
        const px = -uy, py = ux;
        for (let i = 0; i < spawnCount; i++) {
          // Spawn near the visible part of the beam: 10%..40% along the beam
          const t = 0.1 + Math.random() * 0.3;
          const sx = this.x + ux * len * t;
          const sy = this.y + uy * len * t;
          // Skip spawning far off-screen (simple bounds check with margin)
          if (canvas) {
            const margin = 50;
            if (sx < -margin || sy < -margin || sx > canvas.width + margin || sy > canvas.height + margin) continue;
          }
          // Velocity primarily perpendicular, slight forward drift
          const sign = Math.random() < 0.5 ? -1 : 1;
          const vPerp = (1.3 + Math.random() * 2.2) * sign;
          const vAlong = 0.2 + Math.random() * 0.6;
          const vx = px * vPerp + ux * vAlong;
          const vy = py * vPerp + uy * vAlong;
          const life = 28 + Math.floor(Math.random() * 22);
          this.laserEmbers.push({ x: sx, y: sy, vx, vy, life, maxLife: life });
        }
      }
      if (this.laserActiveTimer === 0) {
        this.coreExposedTimer = 240;
        // screen shake via injected callback
        if (this.deps.setShake) this.deps.setShake(12, 4);
      }
    } else if (this.laserWarningTimer > 0) {
      this.laserWarningTimer--;
      if (this.laserWarningTimer === 0) {
        this.laserActiveTimer = 96;
        const aim = Math.atan2(player.y - this.y, player.x - this.x);
        this.laserAngle = aim - Math.PI * 0.7;
      }
    } else {
      if (this.laserCooldown > 0) this.laserCooldown--;
      if (this.laserCooldown === 0) { this.laserWarningTimer = 45; this.laserCooldown = 360; }
    }

    if (this.coreExposedTimer > 0) this.coreExposedTimer--;
    if (this.invulnHitTimer > 0) this.invulnHitTimer--;

    // Update embers
    if (this.laserEmbers && this.laserEmbers.length) {
      const { canvas } = this.deps || {};
      const margin = 60;
      for (let i = this.laserEmbers.length - 1; i >= 0; i--) {
        const e = this.laserEmbers[i];
        e.x += e.vx;
        e.y += e.vy;
        // gentle drag
        e.vx *= 0.985;
        e.vy *= 0.985;
        e.life--;
        // Cull when off-screen or dead
        if (e.life <= 0 || (canvas && (e.x < -margin || e.y < -margin || e.x > canvas.width + margin || e.y > canvas.height + margin))) {
          this.laserEmbers.splice(i, 1);
        }
      }
    }

    // Drone spawning
    if (this.droneCooldown > 0) this.droneCooldown--;
    if (this.droneCooldown === 0 && drones) {
      const active = drones.filter(d => !d.dead).length;
      if (active < 6) {
        const a = Math.random() * Math.PI * 2;
        const sx = this.x + Math.cos(a) * (this.hullRadius + 10);
        const sy = this.y + Math.sin(a) * (this.hullRadius + 10);
        if (Drone) {
          const d = new Drone(sx, sy);
          d.maxSpeed *= 1.3; // 30% faster drones for Dreadship
          drones.push(d);
        }
      }
      this.droneCooldown = 200;
    }

    // Mine spawning: every 2s, up to 5 active (non-exploded) mines, while boss is alive
    if (!this.defeated && this.deps && this.deps.mines && this.deps.Mine) {
      if (this._mineTimer >= 120) {
        const { Mine } = this.deps;
        const mines = (this.deps.getMines && typeof this.deps.getMines === 'function') ? this.deps.getMines() : this.deps.mines;
        // Count only mines spawned by the Dreadship to avoid interference from prior level mines
        const dreadMinesArr = Array.isArray(mines) ? mines.filter(m => !m.exploded && m._owner === 'dreadship') : [];
        const activeMines = dreadMinesArr.length;
        //try { if (typeof console !== 'undefined') console.debug('[Dreadship] Mine window hit: active=', activeMines, 'cap=', this.mineCap); } catch (e) {}
        if (activeMines < this.mineCap) {
          // Spawn outside the hull so it's not hidden under the boss sprite
          const aim = (player && typeof player.x === 'number') ? Math.atan2(player.y - this.y, player.x - this.x) : Math.random() * Math.PI * 2;
          const spawnR = this.hullRadius + 22;
          const sx = this.x + Math.cos(aim) * spawnR;
          const sy = this.y + Math.sin(aim) * spawnR;
          const m = new Mine(sx, sy);
          // Tag ownership so we cap only these
          m._owner = 'dreadship';
          // Nudge velocity slightly toward the player so it drifts toward them
          const dx = (player && typeof player.x === 'number') ? (player.x - sx) : 0;
          const dy = (player && typeof player.y === 'number') ? (player.y - sy) : 0;
          const dist = Math.hypot(dx, dy) || 1;
          const ux = dx / dist, uy = dy / dist;
          const push = 0.35; // subtle forward push
          m.vx += ux * push;
          m.vy += uy * push;
          if (this.deps.addMine && typeof this.deps.addMine === 'function') {
            try { this.deps.addMine(m); } catch (e) { mines && mines.push(m); }
          } else {
            mines && mines.push(m);
          }
          // Enforce hard cap in case of edge cases (e.g., multiple spawns same frame)
          const liveMines = (this.deps.getMines && typeof this.deps.getMines === 'function') ? this.deps.getMines() : this.deps.mines;
          if (Array.isArray(liveMines)) {
            const dread = liveMines.filter(x => !x.exploded && x._owner === 'dreadship');
            if (dread.length > this.mineCap) {
              // Remove oldest extras beyond cap
              const extras = dread.length - this.mineCap;
              for (let i = 0; i < extras; i++) {
                const victim = dread[i];
                const idx = liveMines.indexOf(victim);
                if (idx >= 0) liveMines.splice(idx, 1);
              }
            }
          }
        }
        // Reset cadence whether or not we spawned one (keeps 2s rhythm)
        this._mineTimer = 0;
      }
    }
  }

  draw() {
    const { ctx, player, getFrameCount } = this.deps;
    const t = getFrameCount ? getFrameCount() : 0;
    this.refreshIfDisplayChanged();
    // Hull + core (draw under turrets/lasers)
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotate);
    if (this.hullSprite) {
      const dw = this.hullSprite.width / this.dpr;
      const dh = this.hullSprite.height / this.dpr;
      ctx.drawImage(this.hullSprite, -dw / 2, -dh / 2, dw, dh);
    }
    const coreFiring = this.laserActiveTimer > 0;
    const coreGlow = coreFiring ? '#f66' : (this.isCoreVulnerable() ? '#0f0' : 'rgba(0,255,0,0.65)');
    // Time-based pulsing while firing
    const pulse = coreFiring ? (1 + 0.18 * Math.sin(t * 0.35)) : 1;
    const baseBlur = coreFiring ? 26 : (this.coreExposedTimer > 0 ? 18 : 8);
    const blurPulse = coreFiring ? (10 + 8 * Math.sin(t * 0.5 + Math.PI / 4)) : 0;
    ctx.shadowBlur = baseBlur + blurPulse;
    ctx.shadowColor = coreGlow; ctx.fillStyle = coreGlow;
    const coreRadiusDraw = this.coreRadius * 0.6 * (coreFiring ? 1.18 * pulse : 1);
    ctx.beginPath(); ctx.arc(0, 0, coreRadiusDraw, 0, Math.PI * 2); ctx.fill();
    // Soft outer aura during firing
    if (coreFiring) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.shadowBlur = 38 + 10 * Math.sin(t * 0.45);
      ctx.shadowColor = '#f66';
      ctx.fillStyle = '#f66';
      ctx.beginPath(); ctx.arc(0, 0, coreRadiusDraw * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Hex shield overlay when core is NOT exposed
    if (this.shieldSprite && !this.isCoreVulnerable()) {
      const dwS = this.shieldSprite.width / this.dpr;
      const dhS = this.shieldSprite.height / this.dpr;
      ctx.globalAlpha = this.laserWarningTimer > 0 ? 0.38 : 0.22;
      ctx.drawImage(this.shieldSprite, -dwS / 2, -dhS / 2, dwS, dhS);
      ctx.globalAlpha = 1;
    }
    // Impact arc ping to indicate invulnerability when hit
    if (!this.isCoreVulnerable() && this.invulnHitTimer > 0) {
      const a = this.invulnHitAngle;
      const fade = this.invulnHitTimer / 12; // 0..1 fade over ~12 frames
      const r = this.coreRadius + 8;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 + 0.6 * fade;
      ctx.shadowBlur = 16 + 12 * fade;
      ctx.shadowColor = '#8ff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r, a - 0.6, a + 0.6);
      ctx.stroke();
      ctx.restore();
    }
    // Orbiting rune lights along the hull perimeter (subtle, animated)
    {
      const rn = Math.max(12, this.runeCount | 0);
      const rx = this.hullRadius - 8;
      const ry = this.hullRadius * 0.6 - 6;
      for (let i = 0; i < rn; i++) {
        const ang = t * 0.03 + (i / rn) * Math.PI * 2;
        const px = Math.cos(ang) * rx;
        const py = Math.sin(ang) * ry;
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#0ef';
        ctx.fillStyle = '#0ef';
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 0.1 + i);
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();

    // Turrets
    for (let pos of this.turretPositions()) {
      // Trail underlay: draw faded glow sprites along recent positions
      if (this.turretGlowSprite && pos.ref.trail && pos.ref.trail.length) {
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        const glowW = this.turretGlowSprite.width / this.dpr;
        const glowH = this.turretGlowSprite.height / this.dpr;
        const n = pos.ref.trail.length;
        // Draw sparsely for perf: step by 1 or 2 depending on length
        const step = n > 28 ? 2 : 1;
        for (let i = 0; i < n; i += step) {
          const tp = pos.ref.trail[i];
          const tnorm = i / n; // 0..1 from oldest to newest
          const alpha = 0.05 + 0.25 * tnorm; // stronger near head
          ctx.globalAlpha = alpha;
          // slight scale taper from tail to head
          const scale = 0.7 + 0.6 * tnorm;
          const dw = glowW * scale, dh = glowH * scale;
          ctx.drawImage(this.turretGlowSprite, tp.x - dw / 2, tp.y - dh / 2, dw, dh);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = prevOp;
      }
      // Base crisp ring from cache
      if (this.turretSprite) {
        const dw = this.turretSprite.width / this.dpr;
        const dh = this.turretSprite.height / this.dpr;
        ctx.drawImage(this.turretSprite, pos.x - dw / 2, pos.y - dh / 2, dw, dh);
      }
      // Dynamic glow overlay (single pass)
      const glow = 14 + Math.sin(t * 0.2) * 3;
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur = glow;
      ctx.shadowColor = '#fa3';
      ctx.strokeStyle = '#fa3';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;

      // Center glowing red dot for each turret
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#f44';
      ctx.fillStyle = '#f44';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, Math.max(2, pos.radius * 0.28), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Health segments (3) ring to telegraph turret integrity
      const segs = 3;
      const outerR = pos.radius + 6;
      for (let i = 0; i < segs; i++) {
        const start = -Math.PI / 2 + (i / segs) * (Math.PI * 2) + 0.06;
        const end = start + (Math.PI * 2) / segs - 0.12;
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = (i < pos.ref.hits) ? '#fa3' : 'rgba(255,170,60,0.18)';
        ctx.arc(pos.x, pos.y, outerR, start, end);
        ctx.stroke();
      }
    }

    // Laser beam / warning
    if (this.laserWarningTimer > 0 || this.laserActiveTimer > 0) {
      const warn = this.laserWarningTimer > 0;
      const color = warn ? '#ff0' : '#f66';
      const width = warn ? 3 : 8;
      const a = warn ? (Math.atan2(player.y - this.y, player.x - this.x)) : this.laserAngle;
      const x2 = this.x + Math.cos(a) * 2000;
      const y2 = this.y + Math.sin(a) * 2000;
      ctx.save();
      // Outer beam bloom
      ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = warn ? 10 : 16; ctx.lineWidth = width; ctx.globalAlpha = warn ? 0.8 : 1;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(x2, y2); ctx.stroke();
      // Inner core beam for crispness
      ctx.strokeStyle = warn ? 'rgba(255,255,210,0.9)' : '#ffffff';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = warn ? 6 : 10;
      ctx.lineWidth = warn ? 1.2 : 3;
      ctx.globalAlpha = warn ? 0.9 : 0.95;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }

    // Laser embers rendering (additive), drawn after beam
    if (this.laserEmbers && this.laserEmbers.length) {
      const { canvas } = this.deps || {};
      const sprite = this.laserEmberSprite;
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.laserEmbers.length; i++) {
        const e = this.laserEmbers[i];
        // Skip if outside view to save fill/draw calls
        if (canvas) {
          const margin = 40;
          if (e.x < -margin || e.y < -margin || e.x > canvas.width + margin || e.y > canvas.height + margin) continue;
        }
        const alpha = Math.max(0, Math.min(1, e.life / (e.maxLife || 1)));
        ctx.globalAlpha = 0.2 + 0.8 * alpha;
        // Slight size variation
        const scale = 0.8 + 0.4 * alpha;
        if (sprite) {
          const dw = (sprite.width / this.dpr) * scale;
          const dh = (sprite.height / this.dpr) * scale;
          ctx.drawImage(sprite, e.x - dw / 2, e.y - dh / 2, dw, dh);
        } else {
          // Fallback simple circle
          ctx.save();
          ctx.shadowBlur = 8; ctx.shadowColor = '#f44'; ctx.fillStyle = 'rgba(255,60,60,0.9)';
          ctx.beginPath(); ctx.arc(e.x, e.y, 3 * scale, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevOp;
    }
  }

  handleBulletCollision(bullet) {
    const { createExplosion } = this.deps;
    for (let pos of this.turretPositions()) {
      const dx = bullet.x - pos.x, dy = bullet.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + bullet.radius) {
        pos.ref.hits--;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#fa3', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion && createExplosion(pos.x, pos.y, 70, '#fa3');
          // no points for turret hits (fixed award on defeat)
          this.maybeDropPowerup(pos.x, pos.y, 0.2);
          this.turrets = this.turrets.filter(t => t !== pos.ref);
          if (this.deps.setShake) this.deps.setShake(10, 3);
        }
        return true;
      }
    }
    if (this.isCoreVulnerable()) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + bullet.radius) {
        this.coreHealth--;
        // no points for core hits (fixed award on defeat)
        this.deps.createExplosion && this.deps.createExplosion(this.x, this.y, 90, '#f0f');
        if (this.coreHealth <= 0) this.onDefeated();
        return true;
      }
    } else {
      // Core not vulnerable: bounce bullets off and show a visual ping
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.coreRadius + bullet.radius) {
        // Normalized normal vector
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        // Reflect velocity: v' = v - 2 (v·n) n
        const dot = (bullet.vx || 0) * nx + (bullet.vy || 0) * ny;
        bullet.vx = (bullet.vx || 0) - 2 * dot * nx;
        bullet.vy = (bullet.vy || 0) - 2 * dot * ny;
        // Push bullet just outside the core to avoid repeated collisions
        const pad = 1.5;
        bullet.x = this.x + nx * (this.coreRadius + bullet.radius + pad);
        bullet.y = this.y + ny * (this.coreRadius + bullet.radius + pad);
        // Mark to skip collision checks for the rest of this frame
        if (this.deps.getFrameCount) bullet._skipCollisionsFrame = this.deps.getFrameCount();
        // Visual ping
        this.invulnHitTimer = 12;
        this.invulnHitAngle = Math.atan2(ny, nx);
        // Tiny spark
        createExplosion && createExplosion(bullet.x, bullet.y, 6, '#8ff', 'micro');
        // Bounce SFX
        try { if (this.deps.audio && this.deps.audio.playSfx) this.deps.audio.playSfx('hit'); } catch (e) {}
        // Do NOT consume the bullet
        return false;
      }
    }
    return false;
  }

  handleParticleDamage(particle) {
    const { createExplosion } = this.deps;
    let hit = false;
    for (let pos of this.turretPositions()) {
      const dx = particle.x - pos.x, dy = particle.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + 12) {
        pos.ref.hits--;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#fa3', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion && createExplosion(pos.x, pos.y, 70, '#fa3');
          // no points for turret hits (fixed award on defeat)
          this.turrets = this.turrets.filter(t => t !== pos.ref);
        }
        hit = true; break;
      }
    }
    if (!hit && this.isCoreVulnerable()) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + 12) {
        this.coreHealth = Math.max(0, this.coreHealth - 1);
        if (this.coreHealth === 0) this.onDefeated();
      }
    } else if (!hit && !this.isCoreVulnerable()) {
      // Reflect damaging particles (e.g., shards) off invulnerable core
      const dx = particle.x - this.x, dy = particle.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.coreRadius + 12) {
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        const dot = (particle.vx || 0) * nx + (particle.vy || 0) * ny;
        particle.vx = (particle.vx || 0) - 2 * dot * nx;
        particle.vy = (particle.vy || 0) - 2 * dot * ny;
        particle.x = this.x + nx * (this.coreRadius + 12 + 2);
        particle.y = this.y + ny * (this.coreRadius + 12 + 2);
        // Visual ping
        this.invulnHitTimer = 12;
        this.invulnHitAngle = Math.atan2(ny, nx);
        createExplosion && createExplosion(particle.x, particle.y, 6, '#8ff', 'micro');
        // Bounce SFX
        try { if (this.deps.audio && this.deps.audio.playSfx) this.deps.audio.playSfx('hit'); } catch (e) {}
      }
    }
  }

  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion } = this.deps;
    let any = false;
    for (let pos of this.turretPositions()) {
      if (lineCircleCollision && lineCircleCollision(x1, y1, x2, y2, pos.x, pos.y, pos.radius)) {
        pos.ref.hits--;
        any = true;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#fa3', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion && createExplosion(pos.x, pos.y, 70, '#fa3');
          // no points for turret hits (fixed award on defeat)
          this.maybeDropPowerup(pos.x, pos.y, 0.2);
          this.turrets = this.turrets.filter(t => t !== pos.ref);
        }
      }
    }
    if (this.isCoreVulnerable() && lineCircleCollision && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      this.coreHealth = Math.max(0, this.coreHealth - 2);
      // no points for core hits (fixed award on defeat)
      createExplosion && createExplosion(this.x, this.y, 90, '#f0f');
      any = true;
      if (this.coreHealth === 0) this.onDefeated();
    }
    return any;
  }

  // Radial explosion damage (e.g., player bomb). Damages turrets in radius
  // and the core only when exposed (after laser finishes) similar to other damage sources.
  hitByExplosion(cx, cy, radius) {
    const { createExplosion } = this.deps || {};
    let any = false;
    // Turrets first
    for (let pos of this.turretPositions()) {
      if (pos.ref.hits <= 0) continue;
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.hypot(dx, dy) <= radius + pos.radius) {
        pos.ref.hits = Math.max(0, pos.ref.hits - 1);
        any = true;
        if (pos.ref.hits === 0) {
          createExplosion && createExplosion(pos.x, pos.y, 70, '#fa3');
          this.maybeDropPowerup(pos.x, pos.y, 0.2);
          this.turrets = this.turrets.filter(t => t !== pos.ref);
          this.deps.setShake && this.deps.setShake(10, 3);
        } else if (createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#fa3', 'micro');
        }
      }
    }
    // Core only when exposed
    if (this.isCoreVulnerable()) {
      const dx = cx - this.x, dy = cy - this.y;
      if (Math.hypot(dx, dy) <= radius + this.coreRadius) {
        any = true;
        this.coreHealth = Math.max(0, this.coreHealth - 1);
        createExplosion && createExplosion(this.x, this.y, 90, '#f0f');
        if (this.coreHealth === 0) this.onDefeated();
      }
    }
    return any;
  }

  collidesWithCircle(cx, cy, cr) {
    // Check turrets first
    for (let pos of this.turretPositions()) {
      if (Math.hypot(cx - pos.x, cy - pos.y) < cr + pos.radius) return true;
    }
    // Hull
    return Math.hypot(cx - this.x, cy - this.y) < cr + this.hullRadius;
  }

  onDefeated() {
    if (this.defeated) return;
    const { createExplosion, powerups, Powerup, enemyBullets, drones, setShake, awardPoints, unlockReward } = this.deps;
    this.defeated = true;
    awardPoints && awardPoints(500, this.x, this.y, true); // fixed award only on defeat
    createExplosion && createExplosion(this.x, this.y, this.hullRadius * 2.6, '#f0f');
    setShake && setShake(28, 9);
    const drops = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < drops; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      const dx = this.x + Math.cos(ang) * dist;
      const dy = this.y + Math.sin(ang) * dist;
      const type = this.pickPowerupType();
      if (powerups && powerups.length < 4 && Powerup) powerups.push(new Powerup(dx, dy, type));
    }
    if (Math.random() < 0.5 && powerups && powerups.length < 4 && Powerup) {
      powerups.push(new Powerup(this.x, this.y, 'life'));
    }
    // Clear boss bullets and remaining drones on defeat
    if (enemyBullets) enemyBullets.length = 0;
    if (drones) drones.length = 0;
    // EXP: Award 150 EXP for defeating Dreadship boss
    if (this.deps.addEXP) this.deps.addEXP(150, 'boss-dreadship');
    // Unlock cosmetic ship skin on first defeat
    try { if (typeof unlockReward === 'function') unlockReward('skin_dreadship'); } catch (e) {}
  }

  maybeDropPowerup(x, y, chance) {
    const { powerups, Powerup } = this.deps || {};
    if (!powerups || !Powerup) return;
    if (powerups.length >= 4) return;
    if (Math.random() < chance) {
      const type = this.pickPowerupType();
      powerups.push(new Powerup(x, y, type));
    }
  }

  pickPowerupType() {
    const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone'];
    const weights = [20, 30, 20, 20, 15, 10, 10, 10];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) return types[i];
    }
    return 'shield';
  }
}
