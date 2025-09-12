// mines.js: Extracted Mine class with explicit rendering and dependency injection
import { MINE_DRIFT_SPEED, MINE_RADIUS, MINE_TRIGGER_RADIUS } from './constants.js';

export class Mine {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const ang = Math.random() * Math.PI * 2;
    const spd = MINE_DRIFT_SPEED * (0.7 + Math.random() * 0.6);
    this.vx = Math.cos(ang) * spd;
    this.vy = Math.sin(ang) * spd;
    this.radius = MINE_RADIUS;
    this.triggerRadius = MINE_TRIGGER_RADIUS;
    this.pulse = 0;
    this.exploded = false;
  }

  update(level, gravityWells, canvas, applyGravityTo) {
    // Level 6: mines are stationary (no drift, no gravity, no wrap), only pulse
    if (level === 6) {
      this.pulse += 0.08;
      return;
    }
    // Gravity influence (subtle if wells are active)
    if (level >= 5 && gravityWells && gravityWells.length > 0) {
      applyGravityTo(this, 0.6);
    }
    this.x += this.vx;
    this.y += this.vy;
    this.pulse += 0.08;
    // Wrap around screen
    if (this.x < -this.radius) this.x = canvas.width + this.radius;
    if (this.x > canvas.width + this.radius) this.x = -this.radius;
    if (this.y < -this.radius) this.y = canvas.height + this.radius;
    if (this.y > canvas.height + this.radius) this.y = -this.radius;
  }

  detonate(createExplosion, applyShockwave, shockwaveRadius, pushStrength) {
    if (this.exploded) return;
    this.exploded = true;
    createExplosion(this.x, this.y, 80, '#FFA500');
    // Reduce only the visual ring/pulse size by 40% (physics unchanged)
    applyShockwave(this.x, this.y, shockwaveRadius, pushStrength, { visualScale: 0.6 });
  }

  draw(ctx) {
    if (this.exploded) return;
    const pr = this.radius + Math.sin(this.pulse) * 2;
    for (let i = 3; i >= 0; i--) {
      const c = i === 0 ? '#FFA500' : (i === 1 ? '#FF7A00' : (i === 2 ? '#FFB300' : '#FF5200'));
      ctx.globalAlpha = i === 0 ? 1 : 0.3;
      ctx.strokeStyle = c;
      ctx.shadowBlur = 16 - i * 4;
      ctx.shadowColor = c;
      ctx.lineWidth = i === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, pr + i * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#FFA500';
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4 + Math.sin(this.pulse * 2) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
