// Crystal Titan Boss (Level 9): reflective crystal facets + vulnerable core
// Uses dependency injection similar to ColossusBoss
// Deps expected:
// {
//   canvas, ctx,
//   player,
//   bullets, enemyBullets, asteroids, powerups,
//   EnemyBullet, Asteroid, Powerup,
//   createExplosion, awardPoints, lineCircleCollision,
//   setShake: (frames, intensity) => void,
//   onPlayerHit: () => void,
//   getFrameCount: () => number,
// }

export class CrystalTitanBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.coreRadius = 46;
    this.coreHealth = 12;
    this.orbitRadius = 150;
    this.rotateSpeed = 0.01;
    this.facets = [];
    this.spawnTime = getFrameCount();
    this.defeated = false;

    // Build ring of crystal facets that reflect bullets when hit
    const count = 7; // number of facets
    for (let i = 0; i < count; i++) {
      this.facets.push({
        angle: (Math.PI * 2 * i) / count,
        hits: 5,
        radius: 38,
        pulse: Math.random() * Math.PI * 2,
        hitFlash: 0,
      });
    }

    // Attacks
    this.ringCooldown = 140; // radial shard bursts
    this.snipeCooldown = 90; // aimed prism shots

    // Shard charge/laser cycle
    // Every 6s: 2s charge (glowing lines between shards + particles), then 1s beam from a random shard
    this.chargeActive = false;
    this.chargeStart = 0;
    this.chargeTarget = { x: 0, y: 0 };
    this.chosenFacetRef = null;
    this.chargeParticles = [];
    this.beam = null; // { sx, sy, ex, ey, startFrame, duration }
    this.beamParticles = [];
    this.nextChargeFrame = this.spawnTime + 360; // start first cycle 6s after spawn
  }

  isDefeated() { return this.defeated; }

  update() {
    const { player, enemyBullets, EnemyBullet, setShake, getFrameCount, lineCircleCollision, onPlayerHit } = this.deps;
    const frame = getFrameCount();
    // Spin facets
    for (let f of this.facets) {
      f.angle += this.rotateSpeed;
      f.pulse += 0.12;
      if (f.hitFlash > 0) f.hitFlash--;
    }

    // Radial shard bursts
    if (this.ringCooldown > 0) this.ringCooldown--;
    if (this.ringCooldown === 0) {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.1;
        enemyBullets.push(new EnemyBullet(this.x, this.y, a, 6));
      }
      this.ringCooldown = 180;
      setShake(8, 3);
    }

    // Aimed prism shots (slight spread)
    if (this.snipeCooldown > 0) this.snipeCooldown--;
    if (this.snipeCooldown === 0) {
      const base = Math.atan2(player.y - this.y, player.x - this.x);
      const spread = 0.12;
      const speeds = [7, 6.5, 6.8];
      [-spread, 0, spread].forEach((off, idx) => {
        enemyBullets.push(new EnemyBullet(this.x, this.y, base + off, speeds[idx]));
      });
      this.snipeCooldown = 70;
    }

    // Shard charge/laser ability cycle
    if (!this.defeated && this.facets.length > 0) {
      // Start charge every 6s
      if (!this.chargeActive && !this.beam && frame >= this.nextChargeFrame) {
        this.chargeActive = true;
        this.chargeStart = frame;
        this.chargeTarget = { x: player.x, y: player.y };
        // Pick a random existing facet by reference (in case the array changes)
        this.chosenFacetRef = this.facets[Math.floor(Math.random() * this.facets.length)] || null;
      }

      // During charge: (sparks removed for performance) keep only line connections
      if (this.chargeActive) {
        const positions = this.facetPositions();
        // Connect in ring (i to i+1, and last to first)
        for (let i = 0; i < positions.length; i++) {
          const A = positions[i];
          const B = positions[(i + 1) % positions.length];
          // (particle sparks removed for performance)
        }

        // After 2s of charge, fire the beam
        if (frame - this.chargeStart >= 120) {
          // Resolve firing facet position (fallback to an existing facet if original was shattered)
          let firePos = null;
          if (this.chosenFacetRef) {
            const idx = this.facets.findIndex(ff => ff === this.chosenFacetRef);
            if (idx !== -1) {
              const f = this.facets[idx];
              firePos = {
                x: this.x + Math.cos(f.angle) * this.orbitRadius,
                y: this.y + Math.sin(f.angle) * this.orbitRadius,
              };
            }
          }
          if (!firePos && this.facets.length > 0) {
            const f = this.facets[0];
            firePos = {
              x: this.x + Math.cos(f.angle) * this.orbitRadius,
              y: this.y + Math.sin(f.angle) * this.orbitRadius,
            };
          }
          if (firePos) {
            // Make beam 40% longer by extending end point along the ray
            const dx = this.chargeTarget.x - firePos.x;
            const dy = this.chargeTarget.y - firePos.y;
            const ex = firePos.x + dx * 1.4;
            const ey = firePos.y + dy * 1.4;
            this.beam = { sx: firePos.x, sy: firePos.y, ex, ey, startFrame: frame, duration: 60, fadeDuration: 60 };
            setShake(10, 4);
          }
          this.chargeActive = false;
          // Next cycle begins 6s after the previous charge start
          this.nextChargeFrame = this.chargeStart + 360;
        }
      }

      // Update charge particles
      if (this.chargeParticles.length) {
        for (let i = this.chargeParticles.length - 1; i >= 0; i--) {
          const p = this.chargeParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.life--;
          if (p.life <= 0) this.chargeParticles.splice(i, 1);
        }
      }

      // Active beam + fade-out: collision and particles only while active; then 1s visual fade with no collision
      if (this.beam) {
        const age = frame - this.beam.startFrame;
        if (age <= this.beam.duration) {
          // Collision with player (continuous while beam is active)
          if (lineCircleCollision && lineCircleCollision(this.beam.sx, this.beam.sy, this.beam.ex, this.beam.ey, player.x, player.y, player.radius)) {
            onPlayerHit && onPlayerHit();
          }
          // Spawn beam particles (reduce by ~60%: avg 1.6 per frame)
          {
            // Always spawn 1, plus 0.6 chance to spawn 1 more
            const spawnOne = () => {
              const tpos = Math.random();
              const x = this.beam.sx + (this.beam.ex - this.beam.sx) * tpos;
              const y = this.beam.sy + (this.beam.ey - this.beam.sy) * tpos;
              const ang = Math.random() * Math.PI * 2;
              const sp = Math.random() * 1.6;
              this.beamParticles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 60, size: 2 + Math.random() * 2 });
            };
            spawnOne();
            if (Math.random() < 0.6) spawnOne();
          }
        } else if (age <= this.beam.duration + (this.beam.fadeDuration || 60)) {
          // Fade period: keep beam for visuals only
        } else {
          this.beam = null;
        }
      }

      // Update beam particles
      if (this.beamParticles.length) {
        for (let i = this.beamParticles.length - 1; i >= 0; i--) {
          const p = this.beamParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.life--;
          if (p.life <= 0) this.beamParticles.splice(i, 1);
        }
      }
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    ctx.save();
    // Core with prismatic glow (vulnerable when facets are gone)
    const coreColor = this.facets.length > 0 ? '#8ff' : '#f9f';
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i === 0 ? 1 : 0.35;
      ctx.shadowBlur = 20 - i * 5;
      ctx.shadowColor = coreColor;
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = i === 0 ? 3 : 1.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.coreRadius + i * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Inner pulsing crystal nucleus: kite-shaped diamond, 100% bigger (double size)
    const innerPulse = 0.28 + 0.04 * Math.sin(getFrameCount() * 0.22);
    const base = this.coreRadius * innerPulse * 2; // double previous inner size
    const h = base * 0.6; // horizontal half-width (narrower)
    const v = base;       // vertical half-height (longer) -> kite shape
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#fff';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - v); // top
    ctx.lineTo(this.x + h, this.y); // right
    ctx.lineTo(this.x, this.y + v); // bottom
    ctx.lineTo(this.x - h, this.y); // left
    ctx.closePath();
    ctx.fill();
    // subtle outline using coreColor for definition
    ctx.lineWidth = 2;
    ctx.strokeStyle = coreColor;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw facets
    for (let f of this.facets) {
      const fx = this.x + Math.cos(f.angle) * this.orbitRadius;
      const fy = this.y + Math.sin(f.angle) * this.orbitRadius;
      const baseColor = '#8ff';
      const flash = f.hitFlash > 0 ? (f.hitFlash / 8) : 0;
      const glow = 14 + Math.sin(f.pulse) * 4 + flash * 8;
      const color = f.hitFlash > 0 ? '#fff' : baseColor;
      for (let i = 2; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 1 : Math.min(0.85, 0.45 + flash * 0.3);
        ctx.shadowBlur = Math.max(0, glow - i * 4);
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = i === 0 ? 2.5 : 1.2;
        ctx.beginPath();
        ctx.arc(fx, fy, f.radius - i * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Armor pips for remaining hits
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      for (let h = 0; h < f.hits; h++) {
        ctx.beginPath();
        ctx.arc(fx, fy, f.radius - 8 - h * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Charging visuals: glowing hot white lines between shards (no sparks)
    if (this.chargeActive && this.facets.length > 1) {
      const positions = this.facetPositions();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = pass === 0 ? 6 : 2;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = pass === 0 ? 24 : 12;
        ctx.globalAlpha = pass === 0 ? 0.35 : 0.85;
        ctx.beginPath();
        for (let i = 0; i < positions.length; i++) {
          const A = positions[i];
          const B = positions[(i + 1) % positions.length];
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
        }
        ctx.stroke();
      }
      // (charge-up particle sparks removed for performance)
      ctx.restore();
    }

    // Beam visuals: thick white-hot core with glow (no chromatic aberration), plus trailing sparks
    if (this.beam) {
      const { sx, sy, ex, ey } = this.beam;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Beam stroke helper
      const drawStroke = (dx, dy, color, width, alpha, blur) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(sx + dx, sy + dy);
        ctx.lineTo(ex + dx, ey + dy);
        ctx.stroke();
      };
      // White-hot core (30% thinner) with 1s fade-out after active duration
      const ageDraw = getFrameCount() - this.beam.startFrame;
      let vis = 1;
      if (ageDraw > this.beam.duration) {
        const fd = this.beam.fadeDuration || 60;
        vis = Math.max(0, 1 - (ageDraw - this.beam.duration) / fd);
      }
      const wOuter = 14 * 0.7; // 30% thinner
      const wInner = 6 * 0.7;  // 30% thinner
      drawStroke(0, 0, '#ffffff', wOuter, 0.95 * vis, 28 * vis);
      drawStroke(0, 0, '#ffffff', wInner, 1.0 * vis, 12 * vis);

      // Beam sparks
      for (const p of this.beamParticles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 60));
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  facetPositions() {
    return this.facets.map(f => ({
      x: this.x + Math.cos(f.angle) * this.orbitRadius,
      y: this.y + Math.sin(f.angle) * this.orbitRadius,
      radius: f.radius,
      ref: f,
    }));
  }

  // Reflects bullet on facet hit; consumes bullet only when hitting core (facets destroyed)
  handleBulletCollision(bullet) {
    const { createExplosion, awardPoints, setShake } = this.deps;
    // Check facets (always reflective)
    for (let pos of this.facetPositions()) {
      const dx = bullet.x - pos.x, dy = bullet.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < pos.radius + bullet.radius) {
        // Decrement facet armor but REFLECT the bullet instead of consuming
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        if (pos.ref.hits <= 0) {
          // Shatter facet
          createExplosion(pos.x, pos.y, 70, '#8ff');
          // No points for facet (minion) destruction
          this.facets = this.facets.filter(ff => ff !== pos.ref);
          setShake(10, 4);
        }
        // Reflect bullet across surface normal; preserve speed and charge
        const nx = (dx / (dist || 0.0001));
        const ny = (dy / (dist || 0.0001));
        const dot = bullet.vx * nx + bullet.vy * ny;
        bullet.vx = bullet.vx - 2 * dot * nx;
        bullet.vy = bullet.vy - 2 * dot * ny;
        // Reposition just outside to avoid immediate re-collision next frame
        bullet.x = pos.x + nx * (pos.radius + bullet.radius + 2);
        bullet.y = pos.y + ny * (pos.radius + bullet.radius + 2);
        // Keep bullet alive (do not consume)
        return false;
      }
    }
    // If facets cleared, allow core damage (bullet consumed)
    if (this.facets.length === 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + bullet.radius) {
        this.coreHealth--;
        createExplosion(this.x, this.y, 90, '#f9f');
        if (this.coreHealth <= 0) this.onDefeated();
        return true; // bullet consumed on core hit
      }
    }
    return false;
  }

  handleParticleDamage(particle) {
    const { createExplosion, awardPoints } = this.deps;
    // Rainbow trail damaging (does not reflect)
    let hit = false;
    for (let pos of this.facetPositions()) {
      const dx = particle.x - pos.x, dy = particle.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + 12) {
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#8ff');
          // No points for facet (minion) destruction
          this.facets = this.facets.filter(ff => ff !== pos.ref);
        }
        hit = true;
        break;
      }
    }
    if (!hit && this.facets.length === 0) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + 12) {
        this.coreHealth = Math.max(0, this.coreHealth - 1);
        if (this.coreHealth === 0) this.onDefeated();
      }
    }
  }

  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion } = this.deps;
    let any = false;
    for (let pos of this.facetPositions()) {
      if (lineCircleCollision(x1, y1, x2, y2, pos.x, pos.y, pos.radius)) {
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        any = true;
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#8ff');
          // No points for facet (minion) destruction
          this.facets = this.facets.filter(ff => ff !== pos.ref);
        }
      }
    }
    if (this.facets.length === 0 && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      this.coreHealth = Math.max(0, this.coreHealth - 2);
      createExplosion(this.x, this.y, 90, '#f9f');
      any = true;
      if (this.coreHealth === 0) this.onDefeated();
    }
    return any;
  }

  collidesWithCircle(cx, cy, cr) {
    // Player collision with facets or core (when exposed)
    for (let pos of this.facetPositions()) {
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.hypot(dx, dy) < cr + pos.radius) return true;
    }
    if (this.facets.length === 0) {
      const dx = cx - this.x, dy = cy - this.y;
      if (Math.hypot(dx, dy) < cr + this.coreRadius) return true;
    }
    return false;
  }

  onDefeated() {
    if (this.defeated) return;
    const { createExplosion, powerups, Powerup, enemyBullets, setShake, awardPoints } = this.deps;
    this.defeated = true;
    createExplosion(this.x, this.y, this.coreRadius * 3, '#f9f');
    setShake(24, 8);
    // Award fixed points for defeating the boss core
    awardPoints(500, this.x, this.y, true);
    // Drop 2-3 powerups capped at 4 active max
    const drops = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < drops; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 60;
      const dx = this.x + Math.cos(ang) * dist;
      const dy = this.y + Math.sin(ang) * dist;
      const type = this.pickPowerupType();
      if (powerups.length < 4) powerups.push(new Powerup(dx, dy, type));
    }
    // 50% chance for extra life
    if (Math.random() < 0.5 && powerups.length < 4) {
      powerups.push(new Powerup(this.x, this.y, 'life'));
    }
    // Clear boss bullets on defeat
    enemyBullets.length = 0;
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
