// Asteraid Attract/Demo Mode
// Level 1 autoplay: ship vs asteroids on starfield. Powerups drop and are auto-used.
// Self-contained: uses its own local arrays and dummy player so it won't disturb gameplay state.

import { Bullet } from './bullets.js';
import { Asteroid } from './asteroid.js';
import { Powerup } from './powerups.js';
import { Particle } from './particle.js';

export class AttractMode {
  constructor({ canvas, ctx }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.isActive = false;
    this.frame = 0;
    // Level 1 pacing
    this.targetAsteroids = 10; // keep ~10 asteroids alive
    this.spawnCooldown = 0;
    this.fireCooldown = 0;
    this.aiTurnTimer = 0;
    this.rng = Math.random;

    // Local simulation state (never touches main game arrays)
    this.resetLocalState();
  }

  resetLocalState() {
    this.player = {
      x: this.canvas.width * 0.35,
      y: this.canvas.height * 0.5,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 12,
      invulnerable: 9999,
      shielded: 0,
      invisible: 0,
      rainbow: 0, // cosmetic trail
      laserBoost: 0, // faster fire + charged bullets
    };
    this.asteroids = [];
    this.bullets = [];
    this.powerups = [];
    this.particles = [];
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.frame = 0;
    this.resetLocalState();
    // Seed initial large/medium asteroids near edges
    for (let i = 0; i < this.targetAsteroids; i++) this.spawnAsteroidEdge();
  }

  stop() {
    this.isActive = false;
    this.resetLocalState();
  }

  // Simple ship drawing (matches game style roughly)
  drawShip(x, y, angle, scale = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = this.player.invisible > 0 ? 0.4 : 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    // Shield ring
    if (this.player.shielded > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#0f0';
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Dummy gravity function for Level 1 (no gravity wells)
  applyGravityTo(o) { return o; }

  spawnAsteroidEdge() {
    const side = Math.floor(this.rng() * 4); // 0:L 1:R 2:T 3:B
    const pad = 30;
    let x = 0, y = 0;
    if (side === 0) { x = -pad; y = this.rng() * this.canvas.height; }
    else if (side === 1) { x = this.canvas.width + pad; y = this.rng() * this.canvas.height; }
    else if (side === 2) { x = this.rng() * this.canvas.width; y = -pad; }
    else { x = this.rng() * this.canvas.width; y = this.canvas.height + pad; }
    const size = this.rng() < 0.55 ? 3 : 2; // mostly large + some medium
    const a = new Asteroid(x, y, size, false, false);
    // nudge velocity slightly toward center for more on-screen action
    const cx = this.canvas.width * 0.5, cy = this.canvas.height * 0.5;
    const ang = Math.atan2(cy - y, cx - x);
    a.vx = a.vx * 0.6 + Math.cos(ang) * 0.6;
    a.vy = a.vy * 0.6 + Math.sin(ang) * 0.6;
    this.asteroids.push(a);
  }

  fireBullet(angle, charged = false) {
    // Bullets disabled in attract mode
    return;
  }

  activatePowerup(pu) {
    switch (pu.type) {
      case 'bomb': {
        // Big explosion destroys nearby asteroids
        this.createExplosion(pu.x, pu.y, 140, '#ff0');
        for (let i = this.asteroids.length - 1; i >= 0; i--) {
          const a = this.asteroids[i];
          const d = Math.hypot(a.x - pu.x, a.y - pu.y);
          if (d < 140) {
            this.destroyAsteroidAtIndex(i);
          }
        }
        break;
      }
      case 'shield': this.player.shielded = 360; break; // ~6s
      case 'teleport': {
        this.player.x = 40 + this.rng() * (this.canvas.width - 80);
        this.player.y = 40 + this.rng() * (this.canvas.height - 80);
        break;
      }
      case 'flak': {
        // radial burst
        for (let i = 0; i < 16; i++) this.fireBullet((Math.PI * 2 * i) / 16, false);
        break;
      }
      case 'rainbow': this.player.rainbow = 420; break; // cosmetic trail ~7s
      case 'invisible': this.player.invisible = 300; break; // ~5s
      case 'laser': this.player.laserBoost = 360; break; // faster fire + charged bullets
      case 'clone': {
        // simple: spawn another radial burst to imply clone support
        for (let i = 0; i < 8; i++) this.fireBullet((Math.PI * 2 * i) / 8, false);
        break;
      }
      default: break;
    }
  }

  pushPowerup(x, y, type) {
    this.powerups.push(new Powerup(x, y, type));
  }
  canPushPowerup() { return this.powerups.length < 6; }

  destroyAsteroidAtIndex(idx) {
    const a = this.asteroids[idx];
    const newOnes = a.destroy({
      spawnParticle: (x, y, vx, vy, color, life) => this.particles.push(new Particle(x, y, vx, vy, color, life)),
      awardPoints: () => {},
      createExplosion: (x, y, r, color) => this.createExplosion(x, y, r, color),
      onEliteExplosionDamage: () => {},
      pushPowerup: (x, y, type) => this.pushPowerup(x, y, type),
      canPushPowerup: () => this.canPushPowerup(),
    });
    this.asteroids.splice(idx, 1);
    if (Array.isArray(newOnes) && newOnes.length) this.asteroids.push(...newOnes);
  }

  createExplosion(x, y, radius, color) {
    // ring + shards + dots
    const ring = new Particle(x, y, 0, 0, color, 24);
    ring.shape = 'ring';
    ring.radius = 6;
    ring.growth = radius / 24;
    ring.thickness = 2;
    ring.glow = 24;
    this.particles.push(ring);
    for (let i = 0; i < 28; i++) {
      const ang = (Math.PI * 2 * i) / 28;
      const sp = 2 + this.rng() * 3;
      const p = new Particle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, color, 36 + (this.rng() * 12)|0);
      p.shape = i % 3 === 0 ? 'shard' : 'dot';
      p.length = 10 + this.rng() * 10;
      p.glow = 18;
      this.particles.push(p);
    }
  }

  update() {
    if (!this.isActive) return;
    this.frame++;
    // AI: choose random steering and occasional target aiming
    this.aiTurnTimer--;
    if (this.aiTurnTimer <= 0) {
      this.aiTurnTimer = 30 + (this.rng() * 60)|0; // change every 0.5-1.5s
      // steer toward nearest asteroid with some noise
      let target = null, bestD = 1e9;
      for (const a of this.asteroids) {
        const d = Math.hypot(a.x - this.player.x, a.y - this.player.y);
        if (d < bestD) { bestD = d; target = a; }
      }
      if (target) {
        const ang = Math.atan2(target.y - this.player.y, target.x - this.player.x);
        this.player.angle = ang + (this.rng() * 0.6 - 0.3);
      } else {
        this.player.angle += this.rng() * 0.6 - 0.3;
      }
      // thrust impulse
      const thrust = 0.6 + this.rng() * 0.6;
      this.player.vx += Math.cos(this.player.angle) * thrust * 0.5;
      this.player.vy += Math.sin(this.player.angle) * thrust * 0.5;
    }
    // friction and clamp
    this.player.vx *= 0.99; this.player.vy *= 0.99;
    const sp = Math.hypot(this.player.vx, this.player.vy);
    const maxSp = 4.0;
    if (sp > maxSp) { this.player.vx *= maxSp / sp; this.player.vy *= maxSp / sp; }
    this.player.x += this.player.vx; this.player.y += this.player.vy;
    // wrap
    if (this.player.x < 0) this.player.x = this.canvas.width; if (this.player.x > this.canvas.width) this.player.x = 0;
    if (this.player.y < 0) this.player.y = this.canvas.height; if (this.player.y > this.canvas.height) this.player.y = 0;
    // timers
    if (this.player.shielded > 0) this.player.shielded--;
    if (this.player.invisible > 0) this.player.invisible--;
    if (this.player.rainbow > 0) this.player.rainbow--;
    if (this.player.laserBoost > 0) this.player.laserBoost--;

    // Shooting disabled in attract mode (no bullets)

    // Rainbow trail disabled in attract mode

    // Bullets disabled
    this.bullets.length = 0;
    // Update asteroids only
    for (const a of this.asteroids) {
      try { a.update(1, [], this.canvas, (o)=>this.applyGravityTo(o), ()=>{}); a.draw(this.ctx); } catch (e) {}
    }
    // Powerups/particles disabled
    this.powerups.length = 0;
    this.particles.length = 0;

    // Bullet collisions disabled in attract mode

    // Ship collision and spark effects disabled in attract mode

    // Powerup collection disabled in attract mode

    // Maintain asteroid population
    if (this.asteroids.length < this.targetAsteroids) {
      this.spawnCooldown--;
      if (this.spawnCooldown <= 0) { this.spawnAsteroidEdge(); this.spawnCooldown = 15 + (this.rng()*30)|0; }
    }
  }

  draw(ctx) {
    if (!this.isActive) return;
    // Entities are drawn during update; ship is intentionally not drawn in attract mode

    // Subtle hint
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#9df';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('', this.canvas.width * 0.5, this.canvas.height - 28);
    ctx.restore();
  }
}
