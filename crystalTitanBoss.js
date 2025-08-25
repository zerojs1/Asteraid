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
        hits: 3,
        radius: 38,
        pulse: Math.random() * Math.PI * 2,
        hitFlash: 0,
      });
    }

    // Attacks
    this.ringCooldown = 140; // radial shard bursts
    this.snipeCooldown = 90; // aimed prism shots
  }

  isDefeated() { return this.defeated; }

  update() {
    const { player, enemyBullets, EnemyBullet, setShake } = this.deps;
    // Spin facets
    for (let f of this.facets) {
      f.angle += this.rotateSpeed;
      f.pulse += 0.12;
      if (f.hitFlash > 0) f.hitFlash--;
    }

    // Radial shard bursts
    if (this.ringCooldown > 0) this.ringCooldown--;
    if (this.ringCooldown === 0) {
      const n = 10;
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
    // Inner pulsing crystal nucleus
    const innerPulse = 0.28 + 0.04 * Math.sin(getFrameCount() * 0.22);
    const verts = 6;
    const ir = this.coreRadius * innerPulse;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#fff';
    ctx.beginPath();
    for (let i = 0; i < verts; i++) {
      const a = (i / verts) * Math.PI * 2 + getFrameCount() * 0.01;
      const r = ir * (0.9 + Math.random() * 0.05);
      const x = this.x + Math.cos(a) * r;
      const y = this.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
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
    awardPoints(500, this.x, this.y);
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
