// bullets.js — extracted Bullet class with explicit dependency injection
// API: constructor(x, y, angle, charge=0) where charge can be:
//   0 = normal, 1 = charged L1, 2 = charged L2
// Back-compat: a boolean 'true' maps to level 1.
// Methods: update(canvas, level, applyGravityTo), draw(ctx)

import { ENABLE_SPRITE_CACHE } from './constants.js';

// Lightweight sprite cache for bullet visuals
// Keyed by: `${chargeLevel}|${radius.toFixed(2)}|${color}|${variant}`
const bulletSpriteCache = new Map();
function getBulletSprite(chargeLevel, radius, color, variant = 'classic') {
  const key = `${chargeLevel}|${radius.toFixed(2)}|${color}|${variant}`;
  const cached = bulletSpriteCache.get(key);
  if (cached) return cached;

  // Base visual parameters (tuned for readability)
  const len = (chargeLevel === 0 ? 14 : (chargeLevel === 1 ? 26 : 32));
  const trailBlur = (chargeLevel === 0 ? 10 : (chargeLevel === 1 ? 18 : 22));
  const lineWidth = (chargeLevel === 0 ? 2.5 : (chargeLevel === 1 ? 4 : 5));
  const coreBlur = (chargeLevel === 0 ? 12 : (chargeLevel === 1 ? 22 : 26));

  const margin = Math.max(trailBlur, coreBlur, Math.ceil(radius)) + 4;
  const width = Math.ceil(len + radius * 2 + margin * 2);
  const height = Math.ceil(Math.max(lineWidth, radius * 2) + margin * 2);
  const cvs = document.createElement('canvas');
  cvs.width = width;
  cvs.height = height;
  const ctx = cvs.getContext('2d');

  const xStart = margin;
  const yMid = height / 2;
  const xEnd = xStart + len;
  const v = variant || 'classic';
  // Draw variant
  if (v === 'classic') {
    // Trail
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = trailBlur;
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.beginPath(); ctx.moveTo(xStart, yMid); ctx.lineTo(xEnd, yMid); ctx.stroke();
    ctx.restore();
    // Core dot
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = coreBlur;
    ctx.beginPath(); ctx.arc(xEnd, yMid, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (v === 'dash') {
    // Shorter dash trail + dot
    const xDashEnd = xStart + Math.max(6, len * 0.5);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = trailBlur;
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.beginPath(); ctx.moveTo(xDashEnd - 8, yMid); ctx.lineTo(xDashEnd, yMid); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = coreBlur;
    ctx.beginPath(); ctx.arc(xEnd, yMid, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (v === 'dot') {
    // Only a bright dot
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = coreBlur + 4;
    ctx.beginPath(); ctx.arc(xEnd, yMid, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (v === 'split') {
    // Two small dots along the path
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = coreBlur;
    ctx.beginPath(); ctx.arc(xEnd, yMid, radius * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(xEnd - Math.max(6, len * 0.45), yMid, radius * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (v === 'chevron') {
    // Filled chevron/arrow head + faint short tail
    const half = Math.max(3, radius * 1.2);
    const tip = xEnd;
    const base = xEnd - Math.max(8, radius * 2.5);
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = coreBlur;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tip, yMid);
    ctx.lineTo(base, yMid - half);
    ctx.lineTo(base, yMid + half);
    ctx.closePath();
    ctx.fill();
    // faint tail
    ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, lineWidth - 1.2);
    ctx.shadowBlur = Math.max(4, trailBlur - 6);
    ctx.beginPath(); ctx.moveTo(base - 6, yMid); ctx.lineTo(base, yMid); ctx.stroke();
    ctx.restore();
  } else if (v === 'diamond') {
    // Rhombus/gem head + subtle short tail
    const rx = Math.max(3, radius * 1.2);
    const ry = Math.max(2, radius * 0.9);
    const cx = xEnd, cy = yMid;
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = coreBlur + 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx - rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx + rx, cy);
    ctx.closePath();
    ctx.fill();
    // subtle tail
    ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, lineWidth - 1.2);
    ctx.shadowBlur = Math.max(4, trailBlur - 6);
    ctx.beginPath(); ctx.moveTo(xStart + Math.max(4, len * 0.6), yMid); ctx.lineTo(cx - rx, yMid); ctx.stroke();
    ctx.restore();
  } else {
    // Fallback to classic
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = trailBlur;
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.beginPath(); ctx.moveTo(xStart, yMid); ctx.lineTo(xEnd, yMid); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = coreBlur;
    ctx.beginPath(); ctx.arc(xEnd, yMid, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const sprite = { img: cvs, ax: xEnd, ay: yMid };
  bulletSpriteCache.set(key, sprite);
  return sprite;
}

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
    this.variant = 'classic'; // can be overridden per-skin by caller
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
    if (ENABLE_SPRITE_CACHE) {
      const sprite = getBulletSprite(this.chargeLevel, this.radius, this.color, this.variant || 'classic');
      const angle = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(angle);
      ctx.drawImage(sprite.img, -sprite.ax, -sprite.ay);
      ctx.restore();
      return;
    }
    // Fallback: draw procedurally with variants
    const v = this.variant || 'classic';
    const len = this.chargeLevel === 0 ? 14 : (this.chargeLevel === 1 ? 26 : 32);
    const trailBlur = this.chargeLevel === 0 ? 10 : (this.chargeLevel === 1 ? 18 : 22);
    const lineWidth = this.chargeLevel === 0 ? 2.5 : (this.chargeLevel === 1 ? 4 : 5);
    const coreBlur = this.chargeLevel === 0 ? 12 : (this.chargeLevel === 1 ? 22 : 26);
    const angle = Math.atan2(this.vy, this.vx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    if (v === 'classic') {
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color; ctx.shadowBlur = trailBlur;
      ctx.strokeStyle = this.color; ctx.lineWidth = lineWidth;
      ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = this.color; ctx.shadowBlur = coreBlur;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    } else if (v === 'dash') {
      const d = Math.max(6, len * 0.5);
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color; ctx.shadowBlur = trailBlur;
      ctx.strokeStyle = this.color; ctx.lineWidth = lineWidth;
      ctx.beginPath(); ctx.moveTo(-d + 2, 0); ctx.lineTo(-2, 0); ctx.stroke();
      ctx.fillStyle = this.color; ctx.shadowBlur = coreBlur;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    } else if (v === 'dot') {
      ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = coreBlur + 4;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    } else if (v === 'split') {
      ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = coreBlur;
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-Math.max(6, len * 0.45), 0, this.radius * 0.6, 0, Math.PI * 2); ctx.fill();
    } else if (v === 'chevron') {
      const half = Math.max(3, this.radius * 1.2);
      const base = -Math.max(8, this.radius * 2.5);
      ctx.shadowColor = this.color; ctx.shadowBlur = coreBlur;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(base, -half);
      ctx.lineTo(base,  half);
      ctx.closePath();
      ctx.fill();
      // faint tail
      ctx.lineCap = 'round'; ctx.strokeStyle = this.color; ctx.lineWidth = Math.max(1.5, lineWidth - 1.2);
      ctx.shadowBlur = Math.max(4, trailBlur - 6);
      ctx.beginPath(); ctx.moveTo(base - 6, 0); ctx.lineTo(base, 0); ctx.stroke();
    } else if (v === 'diamond') {
      const rx = Math.max(3, this.radius * 1.2);
      const ry = Math.max(2, this.radius * 0.9);
      ctx.shadowColor = this.color; ctx.shadowBlur = coreBlur + 2;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(0, -ry);
      ctx.lineTo(-rx, 0);
      ctx.lineTo(0,  ry);
      ctx.lineTo( rx, 0);
      ctx.closePath();
      ctx.fill();
      // subtle tail
      ctx.lineCap = 'round'; ctx.strokeStyle = this.color; ctx.lineWidth = Math.max(1.5, lineWidth - 1.2);
      ctx.shadowBlur = Math.max(4, trailBlur - 6);
      ctx.beginPath(); ctx.moveTo(-Math.max(6, len * 0.4), 0); ctx.lineTo(-rx, 0); ctx.stroke();
    } else {
      // fallback classic
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color; ctx.shadowBlur = trailBlur;
      ctx.strokeStyle = this.color; ctx.lineWidth = lineWidth;
      ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = this.color; ctx.shadowBlur = coreBlur;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
