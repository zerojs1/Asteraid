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
// }

export class ColossusBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.coreRadius = 50;
    this.coreHealth = 12;
    this.orbitRadius = 160;
    this.rotateSpeed = 0.012;
    this.plates = [];
    this.spawnTime = getFrameCount();
    // Precompute asteroid-like core polygon (irregular) ~30% of core radius baseline
    this.coreVertices = [];
    const vcount = 10 + Math.floor(Math.random() * 3); // 10-12 vertices
    const baseInner = this.coreRadius * 0.3;
    for (let i = 0; i < vcount; i++) {
      const ang = (i / vcount) * Math.PI * 2;
      const variance = 0.85 + Math.random() * 0.3;
      this.coreVertices.push({ angle: ang, radius: baseInner * variance });
    }
    const count = 6; // number of plates
    for (let i = 0; i < count; i++) {
      this.plates.push({
        angle: (Math.PI * 2 * i) / count,
        hits: 3,
        radius: 40,
        pulse: Math.random() * Math.PI * 2,
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
    this.pulseMaxRadius = 260;
    this.pulseProgress = 0; // 0..1
    this.sprayCooldown = 90;
  }

  update() {
    const { player, bullets, enemyBullets, EnemyBullet, setShake, onPlayerHit, SHARD_MINION_CAP } = this.deps;
    // Spin plates
    for (let p of this.plates) {
      p.angle += this.rotateSpeed;
      p.pulse += 0.12;
    }
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
        const band = Math.abs(dist - this.orbitRadius) < 45; // width of the slam band
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

    // Plate bullet spray when < 50% plates remain
    if (this.plates.length <= 3) {
      if (this.sprayCooldown > 0) this.sprayCooldown--;
      if (this.sprayCooldown === 0) {
        const positions = this.platePositions();
        positions.forEach(p => {
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6;
            enemyBullets.push(new EnemyBullet(p.x, p.y, a, 6));
          }
        });
        this.sprayCooldown = 120;
      }
    } else {
      this.sprayCooldown = Math.max(this.sprayCooldown, 45);
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    // Draw core (shielded glow while plates remain)
    ctx.save();
    ctx.translate(this.x, this.y);
    const coreColor = this.plates.length > 0 ? '#0ff' : '#f0f';
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i === 0 ? 1 : 0.3;
      ctx.shadowBlur = 22 - i * 5;
      ctx.shadowColor = coreColor;
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.coreRadius + i * 6, 0, Math.PI * 2);
      ctx.stroke();
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
    // Core health pips
    if (this.plates.length === 0) {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      for (let i = 0; i < 10; i++) {
        const filled = i < this.coreHealth;
        ctx.strokeStyle = filled ? '#f0f' : '#400';
        ctx.fillStyle = filled ? '#f0f' : 'transparent';
        const px = -this.coreRadius + 8 + i * 10;
        const py = -this.coreRadius - 16;
        ctx.beginPath();
        ctx.rect(px, py, 8, 8);
        if (filled) ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();

    // Draw plates
    for (let p of this.plates) {
      const px = this.x + Math.cos(p.angle) * this.orbitRadius;
      const py = this.y + Math.sin(p.angle) * this.orbitRadius;
      const glow = 16 + Math.sin(p.pulse) * 4;
      for (let i = 2; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 1 : 0.4;
        ctx.shadowBlur = glow - i * 4;
        ctx.shadowColor = '#f00';
        ctx.strokeStyle = '#f00';
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

    // Telegraphs and attack visuals
    // Slam warning/active arc
    if (this.slamWarningTimer > 0 || this.slamActiveTimer > 0) {
      const warn = this.slamWarningTimer > 0;
      const color = warn ? '#ff0' : '#f66';
      const width = warn ? 8 : 14;
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
        pos.ref.hits--;
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
    return false;
  }

  handleParticleDamage(particle) {
    const { createExplosion, awardPoints } = this.deps;
    // Rainbow trail damaging
    let hit = false;
    for (let pos of this.platePositions()) {
      const dx = particle.x - pos.x, dy = particle.y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < pos.radius + 12) {
        pos.ref.hits--;
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 80, '#f00');
          this.maybeDropPowerup(pos.x, pos.y, 0.2);
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
        pos.ref.hits--;
        any = true;
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 80, '#f00');
          this.maybeDropPowerup(pos.x, pos.y, 0.25);
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
    const { createExplosion, powerups, Powerup, asteroids, enemyBullets, setShake, awardPoints } = this.deps;
    this.defeated = true;
    // Big explosion and drops
    createExplosion(this.x, this.y, this.coreRadius * 3, '#f0f');
    setShake(24, 8);
    // Award fixed points for defeating the core
    awardPoints(500, this.x, this.y);
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
}
