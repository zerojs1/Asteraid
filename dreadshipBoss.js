// Alien Dreadship Boss (Level 8)
// Uses dependency injection consistent with other boss modules
// Deps expected:
// {
//   canvas, ctx,
//   player,
//   enemyBullets, drones, powerups,
//   EnemyBullet, Drone, Powerup,
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
      });
    }

    this.laserWarningTimer = 0;
    this.laserActiveTimer = 0;
    this.laserAngle = 0;
    this.laserSweepSpeed = 0.04;
    this.laserCooldown = 300;
    this.coreExposedTimer = 0;

    this.droneCooldown = 200;
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

  update() {
    const { player, enemyBullets, EnemyBullet, drones, Drone, lineCircleCollision, onPlayerHit } = this.deps;
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
    }

    // Laser handling
    if (this.laserActiveTimer > 0) {
      this.laserActiveTimer--;
      this.laserAngle += this.laserSweepSpeed;
      if (player.invulnerable === 0 && player.shielded === 0 && player.invisible === 0) {
        const x2 = this.x + Math.cos(this.laserAngle) * 2000;
        const y2 = this.y + Math.sin(this.laserAngle) * 2000;
        if (lineCircleCollision && lineCircleCollision(this.x, this.y, x2, y2, player.x, player.y, player.radius)) {
          onPlayerHit && onPlayerHit();
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
  }

  draw() {
    const { ctx, player, getFrameCount } = this.deps;
    const t = getFrameCount ? getFrameCount() : 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotate);
    const hullR = this.hullRadius;
    for (let i = 3; i >= 0; i--) {
      const c = ['#0ff', '#0df', '#09f', '#06f'][i];
      ctx.globalAlpha = i === 0 ? 1 : 0.35;
      ctx.shadowBlur = 20 - i * 4;
      ctx.shadowColor = c; ctx.strokeStyle = c; ctx.lineWidth = i === 0 ? 3 : 1.6;
      ctx.beginPath(); ctx.ellipse(0, 0, hullR + i * 6, hullR * 0.6 + i * 4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    const coreGlow = this.coreExposedTimer > 0 ? '#0f0' : 'rgba(0,255,0,0.65)';
    ctx.shadowBlur = this.coreExposedTimer > 0 ? 18 : 8;
    ctx.shadowColor = coreGlow; ctx.fillStyle = coreGlow;
    ctx.beginPath(); ctx.arc(0, 0, this.coreRadius * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Turrets
    for (let pos of this.turretPositions()) {
      const glow = 14 + Math.sin(t * 0.2) * 3;
      for (let i = 2; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 1 : 0.4;
        ctx.shadowBlur = glow - i * 4;
        ctx.shadowColor = '#fa3';
        ctx.strokeStyle = '#fa3'; ctx.lineWidth = i === 0 ? 2.5 : 1.2;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, pos.radius - i * 3, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
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
      ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = warn ? 10 : 16; ctx.lineWidth = width; ctx.globalAlpha = warn ? 0.8 : 1;
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }
  }

  handleBulletCollision(bullet) {
    const { createExplosion } = this.deps;
    for (let pos of this.turretPositions()) {
      const dx = bullet.x - pos.x, dy = bullet.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + bullet.radius) {
        pos.ref.hits--;
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
    if (this.coreExposedTimer > 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + bullet.radius) {
        this.coreHealth--;
        // no points for core hits (fixed award on defeat)
        this.deps.createExplosion && this.deps.createExplosion(this.x, this.y, 90, '#f0f');
        if (this.coreHealth <= 0) this.onDefeated();
        return true;
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
        if (pos.ref.hits <= 0) {
          createExplosion && createExplosion(pos.x, pos.y, 70, '#fa3');
          // no points for turret hits (fixed award on defeat)
          this.turrets = this.turrets.filter(t => t !== pos.ref);
        }
        hit = true; break;
      }
    }
    if (!hit && this.coreExposedTimer > 0) {
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
    for (let pos of this.turretPositions()) {
      if (lineCircleCollision && lineCircleCollision(x1, y1, x2, y2, pos.x, pos.y, pos.radius)) {
        pos.ref.hits--;
        any = true;
        if (pos.ref.hits <= 0) {
          createExplosion && createExplosion(pos.x, pos.y, 70, '#fa3');
          // no points for turret hits (fixed award on defeat)
          this.maybeDropPowerup(pos.x, pos.y, 0.2);
          this.turrets = this.turrets.filter(t => t !== pos.ref);
        }
      }
    }
    if (this.coreExposedTimer > 0 && lineCircleCollision && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      this.coreHealth = Math.max(0, this.coreHealth - 2);
      // no points for core hits (fixed award on defeat)
      createExplosion && createExplosion(this.x, this.y, 90, '#f0f');
      any = true;
      if (this.coreHealth === 0) this.onDefeated();
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
    const { createExplosion, powerups, Powerup, enemyBullets, drones, awardPoints, setShake } = this.deps;
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
    // Clear boss bullets and spawned drones on defeat (parity with other bosses)
    if (enemyBullets) enemyBullets.length = 0;
    if (drones) drones.length = 0;
  }

  maybeDropPowerup(x, y, chance) {
    const { powerups, Powerup } = this.deps;
    if (!powerups || powerups.length >= 4) return;
    if (Math.random() < chance && Powerup) {
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
