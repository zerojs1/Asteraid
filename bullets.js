// bullets.js — extracted Bullet class with explicit dependency injection
// API: constructor(x, y, angle, charge=0) where charge can be:
//   0 = normal, 1 = charged L1, 2 = charged L2
// Back-compat: a boolean 'true' maps to level 1.
// Methods: update(canvas, level, applyGravityTo), draw(ctx)

let BULLET_RANGE_MUL = 1;
let CHARGED_SIZE_MUL = 1;
export function setBulletRangeMultiplier(m) {
  BULLET_RANGE_MUL = Math.max(0.5, Math.min(3, Number(m) || 1));
}
export function setChargedSizeMultiplier(m) {
  CHARGED_SIZE_MUL = Math.max(0.5, Math.min(3, Number(m) || 1));
}

export class Bullet {
  constructor(x, y, angle, charge = 0) {
    this.x = x;
    this.y = y;
    // Normalize charge to numeric level
    this.chargeLevel = (typeof charge === 'number') ? charge : (charge ? 1 : 0);
    this.charged = this.chargeLevel > 0; // legacy flag
    const baseRadius = this.chargeLevel === 0 ? 4 : (this.chargeLevel === 1 ? 8 : 12);
    this.radius = this.charged ? baseRadius * CHARGED_SIZE_MUL : baseRadius;
    this.speed = 10;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    const baseLifetime = this.charged ? 60 : 40;
    this.lifetime = Math.round(baseLifetime * BULLET_RANGE_MUL);
    this.color = this.charged ? '#ff0' : '#0ff';
    // Optional property used by warp tunnels logic externally
    this.warpCooldown = 0;
  }

  update(canvas, level, applyGravityTo) {
    // Gravity curvature (Level 5+). applyGravityTo encapsulates wells.
    if (level >= 5) {
      applyGravityTo(this, 0.4);
    }
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime--;

    // Despawn off-screen (no wrapping)
    if (
      this.x < 0 || this.x > canvas.width ||
      this.y < 0 || this.y > canvas.height
    ) {
      this.lifetime = 0;
    }
  }

  draw(ctx) {
    // Neon streak trail
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const len = this.chargeLevel === 0 ? 14 : (this.chargeLevel === 1 ? 26 : 32);
    const tx = this.x - (this.vx / sp) * len;
    const ty = this.y - (this.vy / sp) * len;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.chargeLevel === 0 ? 10 : (this.chargeLevel === 1 ? 18 : 22);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.chargeLevel === 0 ? 2.5 : (this.chargeLevel === 1 ? 4 : 5);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    // Core glow dot
    ctx.fillStyle = this.color;
    ctx.shadowBlur = this.chargeLevel === 0 ? 12 : (this.chargeLevel === 1 ? 22 : 26);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
