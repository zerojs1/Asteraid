// Colossus Boss (Level 4): orbiting armored plates + core
// Extracted from ast.html and adapted to use dependency injection
// Deps expected:
// {
//   canvas, ctx,
//   player,
//   bullets, enemyBullets, asteroids, powerups,
//   EnemyBullet, Asteroid, Powerup,
//   createExplosion, awardPoints, lineCircleCollision,
//   setShake: (frames, intensity) => void,
//   onPlayerHit: () => void,
//   SHARD_MINION_CAP,
//   getFrameCount: () => number,
//   addEXP?: (amount: number, source?: string) => void,
// }

export class ColossusBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.coreRadius = 70;
    this.coreHealth = 12;
    this.orbitRadius = 160;
    this.rotateSpeed = 0.012;
    this.plates = [];
    this.spawnTime = getFrameCount();
    // Precompute asteroid-like core polygon (irregular) ~45% of core radius baseline
    this.coreVertices = [];
    const vcount = 10 + Math.floor(Math.random() * 3); // 10-12 vertices
    const baseInner = this.coreRadius * 0.45;
    for (let i = 0; i < vcount; i++) {
      const ang = (i / vcount) * Math.PI * 2;
      const variance = 0.85 + Math.random() * 0.3;
      this.coreVertices.push({ angle: ang, radius: baseInner * variance });
    }

  

    // continue constructor initialization
    const count = 6; // number of plates
    for (let i = 0; i < count; i++) {
      // Precompute a slim, jagged shard shape for this plate
      const radius = 40;
      const shardBaseR = radius * 0.60; // ~60% of plate circle
      const shardVerts = 8 + Math.floor(Math.random() * 3); // 8-10 vertices
      const shardAngles = [];
      const shardRadMul = [];
      for (let v = 0; v < shardVerts; v++) {
        // Evenly spaced with slight jitter
        const baseA = (v / shardVerts) * Math.PI * 2;
        shardAngles.push(baseA + (Math.random() - 0.5) * 0.15);
        // Jagged profile
        shardRadMul.push(0.75 + Math.random() * 0.45);
      }
      const shardOrient = Math.random() * Math.PI * 2;
      const shardSlim = 0.48 + Math.random() * 0.18; // 0.48..0.66 for a slim profile

      this.plates.push({
        angle: (Math.PI * 2 * i) / count,
        hits: 5,
        radius,
        pulse: Math.random() * Math.PI * 2,
        trail: [], // recent world positions for fading trail
        // Shard visuals
        shardBaseR,
        shardAngles,
        shardRadMul,
        shardOrient,
        shardSlim,
        shardHitTimer: 0, // frames of pulse/glow after getting hit
      });
    }
    this.defeated = false;
    // Attacks
    this.slamWarningTimer = 0;
    this.slamActiveTimer = 0;
    this.slamAngle = 0; // radians
    this.slamArc = Math.PI / 4; // 45° arc
    this.slamCooldown = 180; // frames between slams
    this.pulseCooldown = 240; // frames
    this.pulseActiveTimer = 0;
    this.pulseMaxRadius = 360;
    this.pulseProgress = 0; // 0..1
    this.sprayCooldown = 90;
    this.plateSprayChance = 0.29; // probability each plate fires on a spray window
    this.slamBandHalfWidth = 45; // thickness of slam arc hit band
    // Visual feedback when bullets hit invulnerable core (plates present)
    this.coreInvulnHitTimer = 0;

    // Display + sprite caching
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this._lastCanvasW = canvas.width;
    this._lastCanvasH = canvas.height;
    this._lastDpr = this.dpr;
    this.coreGlowSprites = { shielded: null, exposed: null };
    this.plateBaseSprites = {}; // key: hits -> canvas
    this._plateBaseRadius = (this.plates[0] && this.plates[0].radius) || 40;
    this.initSprites();
    // Shockwave trail and core ember system
    this.pulseTrail = []; // array of {r, alpha}
    this.coreEmbers = [];
    this.sparkSprite = null; // cached white spark sprite
    // Core vulnerable shard-burst attack state
    this.coreVulnerable = false; // becomes true when plates cleared
    this.coreShardCooldown = 0; // frames until next burst
  }

  // --- Sprite pre-render helpers ---
  initSprites() {
    this.buildCoreGlowSprites();
    this.buildPlateBaseSprites();
  }

  refreshIfDisplayChanged() {
    const { canvas } = this.deps || {};
    const currDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (currDpr !== this.dpr) {
      this.dpr = currDpr;
      this._lastDpr = currDpr;
      // Rebuild all sprites at new DPR
      this.initSprites();
    }
    if (canvas && (canvas.width !== this._lastCanvasW || canvas.height !== this._lastCanvasH)) {
      this._lastCanvasW = canvas.width;
      this._lastCanvasH = canvas.height;
      // Sprites are independent of canvas size, but store anyway for future scale-based variants
    }
  }

  createOffscreen(width, height) {
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = Math.ceil(width * this.dpr);
    c.height = Math.ceil(height * this.dpr);
    return c;
  }

  buildCoreGlowSprites() {
    // Build two variants: shielded (#0ff) and exposed (#f0f)
    const margin = 28; // allow glow to not clip
    const size = (this.coreRadius + 18 + 3 * 6) * 2 + margin * 2; // outer ring radius per original code
    const make = (colorKey) => {
      const color = colorKey === 'shielded' ? '#0ff' : '#f0f';
      const c = this.createOffscreen(size, size);
      if (!c) return null;
      const g = c.getContext('2d');
      g.save();
      g.scale(this.dpr, this.dpr);
      g.translate(size / 2, size / 2);
      for (let i = 3; i >= 0; i--) {
        g.globalAlpha = i === 0 ? 1 : 0.3;
        g.shadowBlur = 22 - i * 5;
        g.shadowColor = color;
        g.strokeStyle = color;
        g.lineWidth = i === 0 ? 3 : 1.5;
        g.beginPath();
        g.arc(0, 0, this.coreRadius + i * 6, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
      g.globalAlpha = 1; g.shadowBlur = 0;
      return c;
    };
    this.coreGlowSprites.shielded = make('shielded');
    this.coreGlowSprites.exposed = make('exposed');
  }

  buildPlateBaseSprites() {
    // Build for hits 1..5 using the base radius
    this.plateBaseSprites = {};
    const radius = this._plateBaseRadius;
    const margin = 20;
    const size = (radius * 2) + margin * 2;
    for (let hits = 1; hits <= 5; hits++) {
      const c = this.createOffscreen(size, size);
      if (!c) continue;
      const g = c.getContext('2d');
      g.save();
      g.scale(this.dpr, this.dpr);
      g.translate(size / 2, size / 2);
      // Base red ring (no shadow; glow drawn dynamically)
      g.globalAlpha = 1;
      g.shadowBlur = 0;
      g.strokeStyle = '#f00';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(0, 0, radius - 0.5, 0, Math.PI * 2);
      g.stroke();
      // Dreadship-style segmented HP arcs (5 segments)
      const segs = 5;
      const outerR = radius + 6;
      for (let i = 0; i < segs; i++) {
        const start = -Math.PI / 2 + (i / segs) * (Math.PI * 2) + 0.06;
        const end = start + (Math.PI * 2) / segs - 0.12;
        g.beginPath();
        g.lineWidth = 2;
        g.strokeStyle = (i < hits) ? '#fa3' : 'rgba(255,170,60,0.18)';
        g.arc(0, 0, outerR, start, end);
        g.stroke();
      }
      g.restore();
      g.globalAlpha = 1; g.shadowBlur = 0;
      this.plateBaseSprites[hits] = c;
    }
  }

  update() {
    const { player, bullets, enemyBullets, EnemyBullet, setShake, onPlayerHit, SHARD_MINION_CAP } = this.deps;
    const { canvas } = this.deps;
    // Spin plates and update trails
    for (let p of this.plates) {
      p.angle += this.rotateSpeed;
      p.pulse += 0.12;
      // Record world position for trail
      const px = this.x + Math.cos(p.angle) * this.orbitRadius;
      const py = this.y + Math.sin(p.angle) * this.orbitRadius;
      p.trail.push({ x: px, y: py });
      if (p.trail.length > 24) p.trail.shift(); // keep longer trail (tripled)
      if (p.shardHitTimer > 0) p.shardHitTimer--;
    }
    // Tick invulnerable-core hit timer
    if (this.coreInvulnHitTimer > 0) this.coreInvulnHitTimer--;

    // Rotating slam: telegraph then strike
    if (this.slamActiveTimer > 0) {
      this.slamActiveTimer--;
      // Damage if player in arc band
      if (player.invulnerable === 0 && player.shielded === 0 && player.invisible === 0) {
        const dx = player.x - this.x, dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx);
        const delta = Math.atan2(Math.sin(ang - this.slamAngle), Math.cos(ang - this.slamAngle));
        const inArc = Math.abs(delta) < this.slamArc * 0.5;
        const band = Math.abs(dist - this.orbitRadius) < this.slamBandHalfWidth; // width of the slam band
        if (inArc && band) {
          onPlayerHit();
        }
      }
    } else if (this.slamWarningTimer > 0) {
      this.slamWarningTimer--;
      if (this.slamWarningTimer === 0) {
        // Activate slam for a short burst
        this.slamActiveTimer = 24;
        setShake(10, 4);
      }
    } else {
      // Cooldown
      if (this.slamCooldown > 0) this.slamCooldown--;
      if (this.slamCooldown === 0) {
        // Choose new arc angle and telegraph
        this.slamAngle = Math.random() * Math.PI * 2;
        this.slamWarningTimer = 36; // wind-up
        this.slamCooldown = 240; // reset
      }
    }

    // Core pulse: push player and deflect bullets
    if (this.pulseActiveTimer > 0) {
      this.pulseActiveTimer--;
      this.pulseProgress = 1 - this.pulseActiveTimer / 18;
      const radius = this.pulseMaxRadius * this.pulseProgress;
      // Record ring into trail (fade over time)
      this.pulseTrail.push({ r: radius, alpha: 0.8 });
      // Push player
      const dx = player.x - this.x, dy = player.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      if (dist < radius + player.radius) {
        const nx = dx / dist, ny = dy / dist;
        player.vx += nx * 1.2;
        player.vy += ny * 1.2;
      }
      // Deflect player bullets
      bullets.forEach(b => {
        const bx = b.x - this.x, by = b.y - this.y;
        const bd = Math.sqrt(bx * bx + by * by);
        if (bd < radius + 12) {
          const nx = bx / (bd || 0.0001), ny = by / (bd || 0.0001);
          // Reflect roughly outward
          const dot = b.vx * nx + b.vy * ny;
          b.vx = b.vx - 2 * dot * nx;
          b.vy = b.vy - 2 * dot * ny;
        }
      });
    } else {
      if (this.pulseCooldown > 0) this.pulseCooldown--;
      if (this.pulseCooldown === 0) {
        this.pulseActiveTimer = 18; // fast expanding ring
        this.pulseProgress = 0;
        this.pulseCooldown = 260;
        setShake(8, 3);
      }
    }

    // Age and fade pulse trail
    if (this.pulseTrail.length) {
      for (let i = 0; i < this.pulseTrail.length; i++) {
        this.pulseTrail[i].alpha *= 0.90; // fade
      }
      // drop faint/huge rings
      this.pulseTrail = this.pulseTrail.filter(t => t.alpha > 0.05);
      if (this.pulseTrail.length > 8) this.pulseTrail.splice(0, this.pulseTrail.length - 8);
    }

    // Core embers: always emit; when vulnerable (no plates), make 50% larger
    {
      const vulnerable = this.plates.length === 0;
      this.#emitCoreEmbers(vulnerable ? 1.5 : 1.0);
    }
    // Update core embers
    for (let i = this.coreEmbers.length - 1; i >= 0; i--) {
      const em = this.coreEmbers[i];
      em.x += em.vx; em.y += em.vy;
      em.life--; em.alpha *= 0.96;
      if (em.life <= 0 || em.alpha <= 0.02) this.coreEmbers.splice(i, 1);
    }

    // Plate bullet spray when < 50% plates remain
    if (this.plates.length <= 7) {
      if (this.sprayCooldown > 0) this.sprayCooldown--;
      if (this.sprayCooldown === 0) {
        const positions = this.platePositions();
        positions.forEach(p => {
          if (Math.random() < this.plateSprayChance) {
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI * 2 * i) / 6;
              enemyBullets.push(new EnemyBullet(p.x, p.y, a, 6));
            }
          }
        });
        this.sprayCooldown = 60;
      }
    } else {
      this.sprayCooldown = Math.max(this.sprayCooldown, 45);
    }

    // Core shard-burst attack when vulnerable (no plates): 12 slow glowing shards every 3s
    if (this.plates.length === 0) {
      if (!this.coreVulnerable) {
        // Just became vulnerable: immediate burst
        this.coreVulnerable = true;
        this.coreShardCooldown = 0;
      }
      if (this.coreShardCooldown > 0) this.coreShardCooldown--;
      if (this.coreHealth > 0 && this.coreShardCooldown === 0) {
        this.spawnShardBurst();
        this.coreShardCooldown = 180; // 3 seconds at 60 FPS
      }
    } else {
      // Reset when plates exist again (shouldn't happen, but safe)
      this.coreVulnerable = false;
      this.coreShardCooldown = 0;
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    this.refreshIfDisplayChanged();
    // Draw core (shielded glow while plates remain) using cached sprite
    ctx.save();
    ctx.translate(this.x, this.y);
    const coreKey = this.plates.length > 0 ? 'shielded' : 'exposed';
    const coreSprite = this.coreGlowSprites && this.coreGlowSprites[coreKey];
    if (coreSprite) {
      ctx.drawImage(coreSprite, -coreSprite.width / (2 * this.dpr), -coreSprite.height / (2 * this.dpr), coreSprite.width / this.dpr, coreSprite.height / this.dpr);
    }
    // Inner pulsing white filled asteroid-like shape (same pulse as before)
    const innerScale = 0.3 + 0.03 * Math.sin(getFrameCount() * 0.2);
    const scaleFactor = innerScale / 0.3; // pulse around baseline
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#fff';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    for (let i = 0; i < this.coreVertices.length; i++) {
      const v = this.coreVertices[i];
      const r = v.radius * scaleFactor;
      const x = Math.cos(v.angle) * r;
      const y = Math.sin(v.angle) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    // Invulnerable-core hit indicator: brief cyan shield ring + X
    if (this.plates.length > 0 && this.coreInvulnHitTimer > 0) {
      const t = this.coreInvulnHitTimer / 12; // 0..1
      const ringR = this.coreRadius + 6 + (1 - t) * 4;
      ctx.save();
      ctx.globalAlpha = 0.6 * t;
      ctx.strokeStyle = '#0ff';
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.stroke();
      // X mark
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-this.coreRadius * 0.7, -this.coreRadius * 0.7);
      ctx.lineTo(this.coreRadius * 0.7, this.coreRadius * 0.7);
      ctx.moveTo(this.coreRadius * 0.7, -this.coreRadius * 0.7);
      ctx.lineTo(-this.coreRadius * 0.7, this.coreRadius * 0.7);
      ctx.stroke();
      ctx.restore();
    }
    // Removed core health pips (request)
    ctx.restore();

    // Draw core embers (always on; larger when vulnerable, handled in emitter) (additive)
    if (this.coreEmbers.length && this.sparkSprite) {
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.coreEmbers.length; i++) {
        const em = this.coreEmbers[i];
        const s = this.sparkSprite.width / this.dpr * em.scale;
        ctx.globalAlpha = em.alpha;
        ctx.drawImage(this.sparkSprite, em.x - s * 0.5, em.y - s * 0.5, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevOp;
    }

    // Draw plates
    for (let p of this.plates) {
      const px = this.x + Math.cos(p.angle) * this.orbitRadius;
      const py = this.y + Math.sin(p.angle) * this.orbitRadius;
      // Trail: fading outer red ring copies along the recent path
      if (p.trail && p.trail.length >= 1) {
        ctx.save();
        for (let i = 0; i < p.trail.length; i++) {
          const tp = p.trail[i];
          const t = (i + 1) / p.trail.length; // 0..1 from oldest to newest
          const alpha = 0.28 * t; // fade stronger near current
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = '#f33';
          ctx.lineWidth = 2.5 * t;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, p.radius + 1, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Base (pre-rendered): ring + armor pips for current hits
      const base = this.plateBaseSprites[p.hits];
      if (base) {
        ctx.save();
        ctx.translate(px, py);
        ctx.drawImage(base, -base.width / (2 * this.dpr), -base.height / (2 * this.dpr), base.width / this.dpr, base.height / this.dpr);
        ctx.restore();
      }
      // Orange asteroid shard inside the plate
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.shardOrient);
      // Slim profile via non-uniform scale on X
      ctx.scale(p.shardSlim, 1);
      const hitT = Math.max(0, Math.min(1, p.shardHitTimer / 14));
      const swell = 1 + 0.10 * hitT; // slight pulse on hit
      const baseR = (p.shardBaseR || (p.radius * 0.6)) * swell;
      const angles = p.shardAngles || [];
      const muls = p.shardRadMul || [];
      // Filled jagged polygon
      ctx.beginPath();
      for (let i = 0; i < angles.length; i++) {
        const r = baseR * (muls[i] || 1);
        const x = Math.cos(angles[i]) * r;
        const y = Math.sin(angles[i]) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      // Base fill
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#f90'; // orange rock
      ctx.shadowBlur = 0;
      ctx.fill();
      // Edge stroke
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#b55000';
      ctx.stroke();
      // Hit glow overlay
      if (hitT > 0) {
        ctx.globalAlpha = 0.55 * hitT;
        ctx.shadowColor = '#ffa533';
        ctx.shadowBlur = 18 * hitT;
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffa533';
        ctx.stroke();
      }
      ctx.restore();
      // Dynamic glow overlay (much cheaper than full multi-pass redraw)
      const glow = 16 + Math.sin(p.pulse) * 4;
      ctx.save();
      // Outer soft halo
      ctx.globalAlpha = 0.35;
      ctx.shadowBlur = glow;
      ctx.shadowColor = '#f00';
      ctx.strokeStyle = '#f00';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(px, py, p.radius + 1, 0, Math.PI * 2);
      ctx.stroke();
      // Inner bright rim
      ctx.globalAlpha = 0.85;
      ctx.shadowBlur = Math.max(0, glow * 0.5);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, p.radius - 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Telegraphs and attack visuals
    // Slam warning/active arc
    if (this.slamWarningTimer > 0 || this.slamActiveTimer > 0) {
      const warn = this.slamWarningTimer > 0;
      const color = warn ? '#ff0' : '#f66';
      // Scale telegraph thickness proportionally to hit band growth
      const width = (warn ? 8 : 14) * (this.slamBandHalfWidth / 45);
      const r = this.orbitRadius;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = warn ? 12 : 16;
      ctx.lineWidth = width;
      ctx.beginPath();
      const a0 = this.slamAngle - this.slamArc / 2;
      const a1 = this.slamAngle + this.slamArc / 2;
      ctx.arc(this.x, this.y, r, a0, a1);
      ctx.stroke();
      ctx.restore();
    }
    // Pulse ring
    if (this.pulseActiveTimer > 0) {
      const radius = this.pulseMaxRadius * this.pulseProgress;
      ctx.save();
      ctx.strokeStyle = '#0ff';
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // Pulse trail (fading, with offscreen culling)
    if (this.pulseTrail.length) {
      const { canvas } = this.deps;
      ctx.save();
      for (let i = 0; i < this.pulseTrail.length; i++) {
        const t = this.pulseTrail[i];
        // Offscreen culling for ring circle
        if (this.x + t.r < 0 || this.x - t.r > canvas.width || this.y + t.r < 0 || this.y - t.r > canvas.height) continue;
        ctx.globalAlpha = Math.min(0.6, t.alpha);
        ctx.strokeStyle = 'rgba(0,255,255,1)';
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 10 * t.alpha;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, t.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  platePositions() {
    return this.plates.map(p => ({
      x: this.x + Math.cos(p.angle) * this.orbitRadius,
      y: this.y + Math.sin(p.angle) * this.orbitRadius,
      radius: p.radius,
      ref: p,
    }));
  }

  handleBulletCollision(bullet) {
    const { createExplosion, awardPoints, asteroids, Asteroid, powerups, Powerup, SHARD_MINION_CAP } = this.deps;
    // Hit plates first
    for (let pos of this.platePositions()) {
      const dx = bullet.x - pos.x, dy = bullet.y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < pos.radius + bullet.radius) {
        // Spawn invulnerability for plates: ignore damage for first 1.5s
        const { getFrameCount } = this.deps;
        if (getFrameCount && (getFrameCount() - this.spawnTime) < 90) {
          // Visual feedback even when invulnerable
          if (pos.ref && typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
          return true; // consume bullet, no damage
        }
        pos.ref.hits--;
        // Micro hit effect for surviving plate
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#f00', 'micro');
          if (typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
        }
        if (pos.ref.hits <= 0) {
          // Destroy plate
          // Explosion and points
          createExplosion(pos.x, pos.y, 80, '#f00');
          // Spawn shard minions
          const shardCount = asteroids.filter(a => a.size === 1 && a.armored).length;
          if (shardCount < SHARD_MINION_CAP) {
            const toSpawn = Math.min(2, SHARD_MINION_CAP - shardCount);
            for (let i = 0; i < toSpawn; i++) {
              const a = Math.random() * Math.PI * 2;
              const smallArmored = new Asteroid(pos.x, pos.y, 1, true);
              smallArmored.hits = 3;
              // Mark as boss minion so no score is awarded when destroyed
              smallArmored.bossMinion = true;
              smallArmored.vx = Math.cos(a) * (1 + Math.random() * 1.5);
              smallArmored.vy = Math.sin(a) * (1 + Math.random() * 1.5);
              asteroids.push(smallArmored);
            }
          }
          // Chance to drop powerup
          this.maybeDropPowerup(pos.x, pos.y, 0.25);
          // Grow boss attributes when a plate is destroyed
          this.growOnPlateDestroyed();
          // Remove plate
          this.plates = this.plates.filter(pp => pp !== pos.ref);
          // Screen shake
          this.deps.setShake(12, 4);
        }
        return true; // bullet consumed
      }
    }
    // If plates cleared, hit core
    if (this.plates.length === 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.coreRadius + bullet.radius) {
        this.coreHealth--;
        createExplosion(this.x, this.y, 90, '#f0f');
        if (this.coreHealth <= 0) this.onDefeated();
        return true;
      }
    }
    // While plates remain, bullets hitting the core should show invulnerability feedback (no damage)
    if (this.plates.length > 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.coreRadius + bullet.radius) {
        this.coreInvulnHitTimer = 12; // brief indicator
        return true; // consume bullet with no effect
      }
    }
    return false;
  }

  handleParticleDamage(particle) {
    const { createExplosion, awardPoints } = this.deps;
    // Rainbow trail damaging
    let hit = false;
    for (let pos of this.platePositions()) {
      const dx = particle.x - pos.x, dy = particle.y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < pos.radius + 12) {
        // Spawn invulnerability for plates: ignore damage for first 1.5s
        const { getFrameCount } = this.deps;
        if (getFrameCount && (getFrameCount() - this.spawnTime) < 90) {
          // Pulse shard even when invulnerable
          if (pos.ref && typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
          hit = true; break;
        }
        pos.ref.hits--;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#f00', 'micro');
          if (typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
        }
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 80, '#f00');
          this.maybeDropPowerup(pos.x, pos.y, 0.2);
          this.growOnPlateDestroyed();
          this.plates = this.plates.filter(pp => pp !== pos.ref);
        }
        hit = true;
        break;
      }
    }
    if (!hit && this.plates.length === 0) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < this.coreRadius + 12) {
        this.coreHealth = Math.max(0, this.coreHealth - 1);
        if (this.coreHealth === 0) this.onDefeated();
      }
    }
  }

  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion, awardPoints } = this.deps;
    let any = false;
    // Plates
    for (let pos of this.platePositions()) {
      if (lineCircleCollision(x1, y1, x2, y2, pos.x, pos.y, pos.radius)) {
        // Spawn invulnerability for plates: ignore damage for first 1.5s
        const { getFrameCount } = this.deps;
        if (getFrameCount && (getFrameCount() - this.spawnTime) < 90) {
          // Pulse shard even when invulnerable
          if (pos.ref && typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
          any = true; continue;
        }
        pos.ref.hits--;
        any = true;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#f00', 'micro');
          if (typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
        }
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 80, '#f00');
          this.maybeDropPowerup(pos.x, pos.y, 0.25);
          this.growOnPlateDestroyed();
          this.plates = this.plates.filter(pp => pp !== pos.ref);
        }
      }
    }
    // Core
    if (this.plates.length === 0 && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      this.coreHealth = Math.max(0, this.coreHealth - 2); // laser is strong
      createExplosion(this.x, this.y, 90, '#f0f');
      any = true;
      if (this.coreHealth === 0) this.onDefeated();
    }
    return any;
  }

  // Radial explosion damage (e.g., player bomb)
  hitByExplosion(cx, cy, radius) {
    const { createExplosion, getFrameCount } = this.deps;
    let any = false;
    // Plates first
    for (let pos of this.platePositions()) {
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.hypot(dx, dy) <= radius + pos.radius) {
        // Respect initial spawn invulnerability window like other damage sources
        if (getFrameCount && (getFrameCount() - this.spawnTime) < 90) {
          if (pos.ref && typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
          any = true; continue;
        }
        pos.ref.hits--;
        any = true;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#f00', 'micro');
          if (typeof pos.ref.shardHitTimer === 'number') pos.ref.shardHitTimer = 14;
        }
        if (pos.ref.hits <= 0) {
          createExplosion && createExplosion(pos.x, pos.y, 80, '#f00');
          this.maybeDropPowerup(pos.x, pos.y, 0.25);
          this.growOnPlateDestroyed();
          this.plates = this.plates.filter(pp => pp !== pos.ref);
          this.deps.setShake && this.deps.setShake(12, 4);
        }
      }
    }
    // Core if plates cleared
    if (this.plates.length === 0) {
      const dx = cx - this.x, dy = cy - this.y;
      if (Math.hypot(dx, dy) <= radius + this.coreRadius) {
        this.coreHealth = Math.max(0, this.coreHealth - 1);
        any = true;
        createExplosion && createExplosion(this.x, this.y, 90, '#f0f');
        if (this.coreHealth === 0) this.onDefeated();
      }
    }
    return any;
  }

  collidesWithCircle(cx, cy, cr) {
    // Check against plates
    for (let pos of this.platePositions()) {
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < cr + pos.radius) return true;
    }
    // Check core only when plates gone
    if (this.plates.length === 0) {
      const dx = cx - this.x, dy = cy - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < cr + this.coreRadius) return true;
    }
    return false;
  }

  isDefeated() {
    return this.defeated;
  }

  onDefeated() {
    if (this.defeated) return;
    const { createExplosion, powerups, Powerup, asteroids, enemyBullets, setShake, awardPoints, addEXP } = this.deps;
    this.defeated = true;
    // Big explosion and drops
    createExplosion(this.x, this.y, this.coreRadius * 3, '#f0f');
    setShake(24, 8);
    // Award fixed points for defeating the core
    awardPoints(1000, this.x, this.y, true);
    // EXP for boss defeat
    if (typeof addEXP === 'function') addEXP(50, 'boss');
    const drops = 2 + Math.floor(Math.random() * 2); // 2-3
    for (let i = 0; i < drops; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 60;
      const dx = this.x + Math.cos(ang) * dist;
      const dy = this.y + Math.sin(ang) * dist;
      const type = this.pickPowerupType();
      if (powerups.length < 4) powerups.push(new Powerup(dx, dy, type));
    }
    // 50% chance to drop +1 life power-up
    if (Math.random() < 0.5 && powerups.length < 4) {
      powerups.push(new Powerup(this.x, this.y, 'life'));
    }
    // Cleanup: remove shard minions and armored asteroids spawned during the fight
    const filtered = asteroids.filter(a => !a.armored);
    asteroids.length = 0;
    asteroids.push(...filtered);
    // Clear enemy bullets from boss/plates
    enemyBullets.length = 0;
  }

  maybeDropPowerup(x, y, chance) {
    const { powerups, Powerup } = this.deps;
    if (powerups.length >= 4) return;
    if (Math.random() < chance) {
      const type = this.pickPowerupType();
      powerups.push(new Powerup(x, y, type));
    }
  }

  pickPowerupType() {
    // Same weights as normal asteroid drop
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

  // Increase core, pulse, and slam sizes by 10% each time a plate is destroyed
  growOnPlateDestroyed() {
    // Scale core visual and collision size
    this.coreRadius *= 1.10;
    // Scale precomputed inner core polygon radii to match
    if (Array.isArray(this.coreVertices)) {
      for (let v of this.coreVertices) {
        v.radius *= 1.10;
      }
    }
    // Increase pulse ring max radius
    this.pulseMaxRadius *= 1.10;
    // Increase slam arc size
    this.slamArc *= 1.10;
    // Increase slam orbit radius and band width
    this.orbitRadius *= 1.10;
    this.slamBandHalfWidth *= 1.10;
    // Rebuild core sprites to reflect new coreRadius
    this.buildCoreGlowSprites();
  }

  // --- Core shard-burst helpers ---
  makeShardBullet(x, y, angle, speed = 2.5) {
    // Create a slow white glowing rock-shard bullet compatible with enemyBullets loop
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const verts = 6 + Math.floor(Math.random() * 4); // 6-9 vertices
    const angles = [];
    const radii = [];
    for (let i = 0; i < verts; i++) {
      const baseA = (i / verts) * Math.PI * 2;
      angles.push(baseA + (Math.random() - 0.5) * 0.35);
      radii.push(6 + Math.random() * 5); // 6..11 px
    }
    const slim = 0.55 + Math.random() * 0.15; // slim profile
    const spin = (Math.random() < 0.5 ? -1 : 1) * (0.01 + Math.random() * 0.02);
    return {
      x, y, vx, vy,
      radius: 7,
      lifetime: 240,
      _angle: angle,
      _spin: spin,
      update(canvas) {
        this.x += this.vx;
        this.y += this.vy;
        this._angle += this._spin;
        this.lifetime--;
        if (this.x < -30 || this.x > canvas.width + 30 || this.y < -30 || this.y > canvas.height + 30) this.lifetime = 0;
      },
      draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this._angle);
        ctx.scale(slim, 1);
        // Glow
        ctx.globalAlpha = 1;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 16;
        // Filled jagged shard
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        for (let i = 0; i < angles.length; i++) {
          const ax = Math.cos(angles[i]) * radii[i];
          const ay = Math.sin(angles[i]) * radii[i];
          if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }
        ctx.closePath();
        ctx.fill();
        // Edge definition
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(200,200,200,0.9)';
        ctx.stroke();
        ctx.restore();
      },
    };
  }

  spawnShardBurst() {
    const { enemyBullets } = this.deps;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count; // 360 degrees
      enemyBullets.push(this.makeShardBullet(this.x, this.y, a, 2.5));
    }
  }

  // --- Core ember helpers (borrowed styling from TetherPair) ---
  #ensureSparkSprite() {
    if (this.sparkSprite) return;
    const size = Math.ceil(5 * this.dpr);
    const c = this.createOffscreen(size, size);
    if (!c) return;
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    const ss = size / this.dpr;
    // radial soft white dot
    const grad = g.createRadialGradient(ss/2, ss/2, 0.5, ss/2, ss/2, ss/2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(ss/2, ss/2, ss/2, 0, Math.PI * 2);
    g.fill();
    // tiny cross
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ss*0.2, ss*0.5); g.lineTo(ss*0.8, ss*0.5);
    g.moveTo(ss*0.5, ss*0.2); g.lineTo(ss*0.5, ss*0.8);
    g.stroke();
    g.restore();
    this.sparkSprite = c;
  }

  #emitCoreEmbers(sizeScale = 1) {
    const { canvas } = this.deps;
    this.#ensureSparkSprite();
    // emit 0-2 embers per frame
    const count = (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      // position near core edge
      const ang = Math.random() * Math.PI * 2;
      const r = this.coreRadius * (0.5 + Math.random() * 0.5);
      const x = this.x + Math.cos(ang) * r + (Math.random() - 0.5) * 2;
      const y = this.y + Math.sin(ang) * r + (Math.random() - 0.5) * 2;
      // velocity roughly outward
      const spd = 0.6 + Math.random() * 1.0;
      const vx = Math.cos(ang) * spd + (Math.random() - 0.5) * 0.3;
      const vy = Math.sin(ang) * spd + (Math.random() - 0.5) * 0.3;
      this.coreEmbers.push({
        x, y, vx, vy,
        life: 26 + Math.floor(Math.random() * 14),
        alpha: 0.85,
        scale: (0.35 + Math.random() * 0.3) * sizeScale,
      });
    }
    if (this.coreEmbers.length > 80) this.coreEmbers.splice(0, this.coreEmbers.length - 80);
  }
}
