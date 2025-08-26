// Alien Carrier Boss (Level 11): drone bays + vulnerable core
// Uses dependency injection similar to ColossusBoss and CrystalTitanBoss
// Deps expected:
// {
//   canvas, ctx,
//   player,
//   bullets, enemyBullets, asteroids, powerups, drones,
//   EnemyBullet, Asteroid, Powerup, Drone,
//   createExplosion, awardPoints, lineCircleCollision,
//   setShake: (frames, intensity) => void,
//   getFrameCount: () => number,
// }

export class AlienCarrierBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.coreRadius = 48;
    this.coreHealth = 12;
    this.orbitRadius = 150;
    this.rotateSpeed = 0.01;
    this.spawnTime = getFrameCount ? getFrameCount() : 0;
    this.defeated = false;

    // Four drone bay pods that must be destroyed before the core is vulnerable
    this.pods = [];
    const count = 4;
    for (let i = 0; i < count; i++) {
      this.pods.push({
        angle: (Math.PI * 2 * i) / count,
        hits: 3,
        radius: 36,
        pulse: Math.random() * Math.PI * 2,
        hitFlash: 0,
      });
    }

    // Behaviors
    this.droneCooldown = 200; // spawn drones periodically up to cap
    this.snipeCooldown = 90;  // aimed shots from core
  }

  isDefeated() { return this.defeated; }

  podPositions() {
    return this.pods.map(p => ({
      x: this.x + Math.cos(p.angle) * this.orbitRadius,
      y: this.y + Math.sin(p.angle) * this.orbitRadius,
      radius: p.radius,
      ref: p,
    }));
  }

  update() {
    const { player, enemyBullets, EnemyBullet, drones, Drone } = this.deps;
    // Spin pods
    for (let p of this.pods) {
      p.angle += this.rotateSpeed;
      p.pulse += 0.12;
      if (p.hitFlash > 0) p.hitFlash--;
    }

    // Spawn drones capped at 6 active
    if (this.droneCooldown > 0) this.droneCooldown--;
    if (this.droneCooldown === 0 && drones) {
      const active = drones.filter(d => !d.dead).length;
      if (active < 6) {
        let sx = this.x, sy = this.y;
        if (this.pods.length > 0) {
          const pods = this.podPositions();
          const pick = pods[(Math.random() * pods.length) | 0];
          const a = Math.atan2(pick.y - this.y, pick.x - this.x);
          const r = this.orbitRadius + 12;
          sx = this.x + Math.cos(a) * r;
          sy = this.y + Math.sin(a) * r;
        } else {
          const a = Math.random() * Math.PI * 2;
          const r = this.coreRadius + 20;
          sx = this.x + Math.cos(a) * r;
          sy = this.y + Math.sin(a) * r;
        }
        const d = new Drone(sx, sy);
        d.maxSpeed *= 1.3; // match Dreadship's ~30% faster drones
        drones.push(d);
      }
      this.droneCooldown = this.pods.length > 0 ? 200 : 160; // faster spawn once bays are down
    }

    // Aimed prism-like shots from the core to pressure player
    if (this.snipeCooldown > 0) this.snipeCooldown--;
    if (this.snipeCooldown === 0 && enemyBullets && EnemyBullet) {
      const base = Math.atan2(player.y - this.y, player.x - this.x);
      const spread = 0.10;
      const speeds = [6.5, 7.0, 6.5];
      [-spread, 0, spread].forEach((off, idx) => {
        enemyBullets.push(new EnemyBullet(this.x, this.y, base + off, speeds[idx]));
      });
      this.snipeCooldown = 110;
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    const t = getFrameCount ? getFrameCount() : 0;

    // Core and hull rings
    const hullColor = '#8f8';
    ctx.save();
    ctx.strokeStyle = hullColor;
    ctx.shadowColor = hullColor;
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i === 0 ? 1 : 0.35;
      ctx.shadowBlur = 18 - i * 4;
      ctx.lineWidth = i === 0 ? 3 : 1.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.coreRadius + 16 + i * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Inner pulsing nucleus
    const pulse = 0.3 + 0.03 * Math.sin(t * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    const verts = 8;
    for (let i = 0; i < verts; i++) {
      const a = (i / verts) * Math.PI * 2 + t * 0.015;
      const r = this.coreRadius * pulse * (0.9 + Math.random() * 0.05);
      const x = this.x + Math.cos(a) * r * 0.5;
      const y = this.y + Math.sin(a) * r * 0.5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Health pips when core exposed
    if (this.pods.length === 0) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const filled = i < this.coreHealth;
        ctx.strokeStyle = filled ? '#6f8' : '#263';
        ctx.fillStyle = filled ? '#6f8' : 'transparent';
        const px = this.x - this.coreRadius + 8 + i * 10;
        const py = this.y - this.coreRadius - 20;
        ctx.beginPath();
        ctx.rect(px, py, 8, 8);
        if (filled) ctx.fill();
        ctx.stroke();
      }
    }

    // Pods
    for (let p of this.pods) {
      const px = this.x + Math.cos(p.angle) * this.orbitRadius;
      const py = this.y + Math.sin(p.angle) * this.orbitRadius;
      const baseColor = '#6f8';
      const flash = p.hitFlash > 0 ? (p.hitFlash / 8) : 0;
      const glow = 14 + Math.sin(p.pulse) * 4 + flash * 8;
      const color = p.hitFlash > 0 ? '#fff' : baseColor;
      for (let i = 2; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 1 : Math.min(0.85, 0.45 + flash * 0.3);
        ctx.shadowBlur = Math.max(0, glow - i * 4);
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = i === 0 ? 2.5 : 1.2;
        ctx.beginPath();
        ctx.arc(px, py, p.radius - i * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Armor rings for remaining hits
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      for (let h = 0; h < p.hits; h++) {
        ctx.beginPath();
        ctx.arc(px, py, p.radius - 8 - h * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  handleBulletCollision(bullet) {
    const { createExplosion, awardPoints } = this.deps;
    // Hit pods first
    for (let pos of this.podPositions()) {
      const dx = bullet.x - pos.x, dy = bullet.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + bullet.radius) {
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#8f8');
          // No points for pod (minion) destruction during boss fight
          this.maybeDropPowerup(pos.x, pos.y, 0.25);
          this.pods = this.pods.filter(pp => pp !== pos.ref);
          this.deps.setShake && this.deps.setShake(10, 4);
        }
        return true; // bullet consumed on pod hit
      }
    }
    // If pods cleared, hit core
    if (this.pods.length === 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + bullet.radius) {
        this.coreHealth--;
        createExplosion(this.x, this.y, 90, '#9f9');
        if (this.coreHealth <= 0) this.onDefeated();
        return true;
      }
    }
    return false;
  }

  handleParticleDamage(particle) {
    const { createExplosion, awardPoints } = this.deps;
    let hit = false;
    for (let pos of this.podPositions()) {
      const dx = particle.x - pos.x, dy = particle.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + 12) {
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#8f8');
          // No points for pod (minion) destruction during boss fight
          this.pods = this.pods.filter(pp => pp !== pos.ref);
        }
        hit = true;
        break;
      }
    }
    if (!hit && this.pods.length === 0) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + 12) {
        this.coreHealth = Math.max(0, this.coreHealth - 1);
        if (this.coreHealth === 0) this.onDefeated();
      }
    }
  }

  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion, awardPoints } = this.deps;
    let any = false;
    for (let pos of this.podPositions()) {
      if (lineCircleCollision(x1, y1, x2, y2, pos.x, pos.y, pos.radius)) {
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        any = true;
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#8f8');
          this.pods = this.pods.filter(pp => pp !== pos.ref);
        }
      }
    }
    if (this.pods.length === 0 && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      this.coreHealth = Math.max(0, this.coreHealth - 2);
      createExplosion(this.x, this.y, 90, '#9f9');
      any = true;
      if (this.coreHealth === 0) this.onDefeated();
    }
    return any;
  }

  collidesWithCircle(cx, cy, cr) {
    // Check pods
    for (let pos of this.podPositions()) {
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.hypot(dx, dy) < cr + pos.radius) return true;
    }
    // Check core when exposed
    if (this.pods.length === 0) {
      const dx = cx - this.x, dy = cy - this.y;
      if (Math.hypot(dx, dy) < cr + this.coreRadius) return true;
    }
    return false;
  }

  onDefeated() {
    if (this.defeated) return;
    const { createExplosion, powerups, Powerup, enemyBullets, setShake, drones, awardPoints } = this.deps;
    this.defeated = true;
    createExplosion(this.x, this.y, this.coreRadius * 3, '#9f9');
    setShake && setShake(24, 8);
    // Award fixed points for defeating the boss core
    awardPoints(500, this.x, this.y, true);
    const drops = 2 + Math.floor(Math.random() * 2); // 2-3
    for (let i = 0; i < drops; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 60;
      const dx = this.x + Math.cos(ang) * dist;
      const dy = this.y + Math.sin(ang) * dist;
      const type = this.pickPowerupType();
      if (powerups.length < 4) powerups.push(new Powerup(dx, dy, type));
    }
    if (Math.random() < 0.5 && powerups.length < 4) {
      powerups.push(new Powerup(this.x, this.y, 'life'));
    }
    // Clear boss bullets and remaining drones on defeat
    if (enemyBullets) enemyBullets.length = 0;
    if (drones) drones.length = 0;
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
