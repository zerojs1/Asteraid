// asteroid.js: Asteroid class extracted from ast.html with explicit params and callbacks
let POWERUP_DROP_MUL = 1;
export function setPowerupDropMultiplier(mult) {
  // Clamp to [0, 3] to stay sane
  POWERUP_DROP_MUL = Math.max(0, Math.min(3, Number(mult) || 0));
}

export class Asteroid {
  constructor(x, y, size, armored = false, elite = false) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.armored = armored;
    this.elite = elite;
    this.hits = armored ? 3 : (elite ? 2 : 1);
    // Flag for boss-spawned minions (e.g., Colossus shard asteroids)
    this.bossMinion = false;

    // Set radius based on size
    const radiuses = [20, 40, 60, 80];
    this.radius = radiuses[size - 1];
    // Elites were previously 1.2x base. Reduce by 40% of that current size => 1.2 * 0.6 = 0.72x base
    if (this.elite) this.radius = Math.floor(this.radius * 0.72);

    // Set speed based on size
    const speeds = [1.5, 1.0, 0.5, 0.9];
    this.speed = speeds[size - 1];

    // Random velocity
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;

    // Random rotation
    this.rotation = 0;
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;

    // Generate random vertices for irregular shape
    this.vertices = [];
    const numVertices = 8 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numVertices; i++) {
      const ang = (i / numVertices) * Math.PI * 2;
      const variance = 0.8 + Math.random() * 0.4;
      this.vertices.push({ angle: ang, radius: this.radius * variance });
    }
    // Elite asteroids can render an afterimage trail on Level 7
    if (this.elite) {
      this.trail = [];
      this.trailTick = 0;
      // Track time alive to periodically spawn drones (every 8s)
      this.droneSpawnFrames = 0;
    }
    // Small (size 1) normal/armored asteroids: subtle short motion trail
    if (this.size === 1 && !this.elite) {
      this.trailSmall = [];
      this.trailSmallTick = 0;
    }
  }

  update(level, gravityWells, canvas, applyGravityTo, spawnDrone) {
    // Gravity influence (Level 5)
    if (level >= 5 && gravityWells.length > 0) {
      applyGravityTo(this, 1);
    }
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;

    // Wrap around screen
    if (this.x < -this.radius) this.x = canvas.width + this.radius;
    if (this.x > canvas.width + this.radius) this.x = -this.radius;
    if (this.y < -this.radius) this.y = canvas.height + this.radius;
    if (this.y > canvas.height + this.radius) this.y = -this.radius;
    // Elite asteroid trail for Level 7
    if (this.elite) {
      if (level === 7) {
        this.trailTick = (this.trailTick || 0) + 1;
        if (this.trailTick % 2 === 0) {
          if (!this.trail) this.trail = [];
          this.trail.push({ x: this.x, y: this.y, rot: this.rotation, alpha: 0.35 });
          if (this.trail.length > 12) this.trail.shift();
        }
      }
      if (this.trail && this.trail.length) {
        for (let i = this.trail.length - 1; i >= 0; i--) {
          this.trail[i].alpha -= (level === 7 ? 0.03 : 0.08);
          if (this.trail[i].alpha <= 0.02) this.trail.splice(i, 1);
        }
      }
      // Periodic drone spawns for elites: one every 8 seconds they are alive
      if (typeof spawnDrone === 'function') {
        this.droneSpawnFrames = (this.droneSpawnFrames || 0) + 1;
        if (this.droneSpawnFrames >= 480) { // ~8s at 60fps
          spawnDrone(this.x, this.y);
          this.droneSpawnFrames = 0;
        }
      }
    }
    // Small asteroid subtle trail (always-on when moving fast enough)
    if (this.size === 1 && !this.elite) {
      this.trailSmallTick = (this.trailSmallTick || 0) + 1;
      const speedNow = Math.hypot(this.vx, this.vy);
      if (this.trailSmallTick % 2 === 0 && speedNow > 0.7) {
        if (!this.trailSmall) this.trailSmall = [];
        this.trailSmall.push({ x: this.x, y: this.y, rot: this.rotation, alpha: 0.44 });
        if (this.trailSmall.length > 24) this.trailSmall.shift();
      }
      if (this.trailSmall && this.trailSmall.length) {
        for (let i = this.trailSmall.length - 1; i >= 0; i--) {
          this.trailSmall[i].alpha -= 0.03;
          if (this.trailSmall[i].alpha <= 0.02) this.trailSmall.splice(i, 1);
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    // Elite afterimage trail (draw behind)
    if (this.elite && this.trail && this.trail.length) {
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const alpha = t.alpha;
        if (alpha <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0f0';
        ctx.strokeStyle = '#0f0';
        // Thicker trail outline for elites
        ctx.lineWidth = 2;
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rot);
        ctx.beginPath();
        for (let j = 0; j < this.vertices.length; j++) {
          const vertex = this.vertices[j];
          const x = Math.cos(vertex.angle) * vertex.radius * 0.95;
          const y = Math.sin(vertex.angle) * vertex.radius * 0.95;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
    // Small asteroid subtle trail (draw behind)
    if (this.size === 1 && !this.elite && this.trailSmall && this.trailSmall.length) {
      const tColor = this.armored ? '#f00' : '#f0f';
      for (let i = 0; i < this.trailSmall.length; i++) {
        const t = this.trailSmall[i];
        const alpha = t.alpha;
        if (alpha <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = tColor;
        ctx.strokeStyle = tColor;
        ctx.lineWidth = 2;
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rot);
        ctx.beginPath();
        for (let j = 0; j < this.vertices.length; j++) {
          const vertex = this.vertices[j];
          const x = Math.cos(vertex.angle) * vertex.radius * 0.95;
          const y = Math.sin(vertex.angle) * vertex.radius * 0.95;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Set color based on type
    const color = this.elite ? '#0f0' : (this.armored ? '#f00' : '#f0f');

    // Draw with multiple glow layers
    for (let i = 3; i >= 0; i--) {
      ctx.strokeStyle = color;
      // Elite asteroids have thicker outlines than normal/armored
      ctx.lineWidth = i === 0 ? (this.elite ? 3 : 2) : (this.elite ? 2 : 1);
      ctx.globalAlpha = i === 0 ? 1 : 0.3;
      ctx.shadowBlur = 20 - i * 5;
      ctx.shadowColor = color;

      ctx.beginPath();
      for (let j = 0; j < this.vertices.length; j++) {
        const vertex = this.vertices[j];
        const x = Math.cos(vertex.angle) * vertex.radius;
        const y = Math.sin(vertex.angle) * vertex.radius;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Draw armor plating for armored asteroids
    if (this.armored) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      for (let i = 0; i < this.hits; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, this.radius - 10 - i * 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  hit(deps) {
    this.hits--;
    if (this.hits <= 0) {
      return this.destroy(deps);
    }
    return null;
  }

  destroy(deps) {
    const { spawnParticle, awardPoints, createExplosion, onEliteExplosionDamage, pushPowerup, canPushPowerup } = deps;

    // Create explosion particles
    for (let i = 0; i < 15; i++) {
      const angle = (Math.PI * 2 * i) / 15;
      const speed = Math.random() * 3 + 1;
      spawnParticle(this.x, this.y, Math.cos(angle) * speed, Math.sin(angle) * speed, this.elite ? '#0f0' : (this.armored ? '#f00' : '#f0f'), 30);
    }

    // Calculate score (skip if this asteroid is a boss-spawned minion)
    if (!this.bossMinion) {
      const points = [30, 20, 10, 50];
      awardPoints(points[this.size - 1], this.x, this.y);
    }

    // Elite: no split; explode with player-only damage via callback
    if (this.elite) {
      const radius = this.radius * 1.5;
      createExplosion(this.x, this.y, radius, '#0f0');
      if (onEliteExplosionDamage) onEliteExplosionDamage(this, radius);
      return [];
    }

    // Spawn smaller asteroids
    const newAsteroids = [];
    if (this.size === 3) {
      // Large splits into 2 medium
      for (let i = 0; i < 2; i++) newAsteroids.push(new Asteroid(this.x, this.y, 2));
    } else if (this.size === 2) {
      // Medium splits into 2 small
      for (let i = 0; i < 2; i++) newAsteroids.push(new Asteroid(this.x, this.y, 1));
    } else if (this.size === 4 && this.armored) {
      // Armored splits into 3 small armored
      for (let i = 0; i < 3; i++) {
        const smallArmored = new Asteroid(this.x, this.y, 1, true);
        smallArmored.hits = 3;
        newAsteroids.push(smallArmored);
      }
    }

    // Drop power-up
    if (this.shouldDropPowerup() && canPushPowerup && canPushPowerup()) {
      this.dropPowerup(pushPowerup);
    }

    return newAsteroids;
  }

  shouldDropPowerup() {
    if (this.armored && this.size === 1) return true;
    if (this.armored && this.size === 4) return true;
    const base = 0.2;
    const chance = Math.min(0.95, base * POWERUP_DROP_MUL);
    return Math.random() < chance;
  }

  dropPowerup(pushPowerup) {
    if (!pushPowerup) return;

    const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone'];
    const weights = this.armored ? [1, 1, 1, 1, 1, 1, 1, 1] : [20, 30, 20, 20, 15, 10, 10, 10];

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    let type = types[0];

    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random <= 0) { type = types[i]; break; }
    }

    pushPowerup(this.x, this.y, type);
  }
}
