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
  } else if (v === 'needle') {
    // Elongated sharp needle with bright glow
    const base = xEnd - Math.max(10, len * 0.75);
    const half = Math.max(1.2, radius * 0.9);
    // Faint elongated tail
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = Math.max(10, trailBlur);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, lineWidth - 1.0);
    ctx.beginPath(); ctx.moveTo(xStart + 2, yMid); ctx.lineTo(base, yMid); ctx.stroke();
    ctx.restore();
    // Tapered needle tip with slight center notch
    ctx.save();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = coreBlur + 6;
    ctx.beginPath();
    ctx.moveTo(xEnd, yMid);        // tip
    ctx.lineTo(base, yMid - half); // upper base
    ctx.lineTo(base - 2, yMid);    // notch
    ctx.lineTo(base, yMid + half); // lower base
    ctx.closePath();
    ctx.fill();
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
    // Apex Rounds: globally boost bullet size by +30% for player bullets
    try {
      if (typeof window !== 'undefined' && window.__apexRoundsEnabled) {
        this.radius *= 1.3;
      }
    } catch (e) {}
    this.speed = 10;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    const baseLifetime = this.charged ? 60 : 40;
    this.lifetime = Math.round(baseLifetime * BULLET_RANGE_MUL);
    this.color = this.charged ? '#ff0' : '#0ff';
    this.variant = 'classic'; // can be overridden per-skin by caller
    // Optional property used by warp tunnels logic externally
    this.warpCooldown = 0;
    // Optional piercing support (set externally by reward systems):
    // If > 0, the bullet will not be removed on hit; instead this counter is
    // decremented and a small lifetime penalty is applied to prevent infinite travel.
    this.piercesLeft = 0; // number of additional targets this bullet can pass through
    this.pierceLifetimePenalty = 6; // frames deducted per pierce

    // Lightweight trail storage (used for specific variants like 'flak').
    // We lazily initialize and update this only when needed for performance.
    this._trail = null; // array of {x,y}
    this._trailStep = 0;
  }

  update(canvas, level, applyGravityTo) {
    // Gravity curvature (Level 5+). applyGravityTo encapsulates wells.
    if (level >= 5) {
      applyGravityTo(this, 0.4);
    }
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime--;

    // Sample trail history only for flak variant to minimize overhead
    if (this.variant === 'flak') {
      if (!this._trail) this._trail = [];
      this._trailStep = (this._trailStep + 1) | 0;
      // record every 2 frames for smoother, cheaper trails
      if ((this._trailStep & 1) === 0) {
        this._trail.unshift({ x: this.x, y: this.y });
        // Cap to a small buffer for perf (about ~16 samples ~ last 32 frames)
        if (this._trail.length > 16) this._trail.length = 16;
      }
    }

    // Despawn off-screen (no wrapping)
    if (
      this.x < 0 || this.x > canvas.width ||
      this.y < 0 || this.y > canvas.height
    ) {
      this.lifetime = 0;
    }
  }

  draw(ctx) {
    // Draw long fading trail for flak variant in world coords (no transforms)
    if (this.variant === 'flak' && this._trail && this._trail.length > 1) {
      const n = this._trail.length;
      ctx.save();
      ctx.lineCap = 'round';
      // If this is an Arc Blade bullet, shorten visible trail to ~60%.
      // Clamp counts and indices to avoid negative indices on small trails.
      const maxSegments = n - 1;
      let lastCount = this.arcBlade ? Math.round(maxSegments * 0.4) : maxSegments;
      lastCount = Math.max(1, Math.min(maxSegments, lastCount));
      const startIndex = Math.max(0, n - 1 - lastCount);
      for (let i = startIndex; i < n - 1; i++) {
        const p0 = this._trail[i + 1];
        const p1 = this._trail[i];
        if (!p0 || !p1) continue;
        const localIdx = i - startIndex;
        const t = lastCount > 0 ? (localIdx / lastCount) : 0; // 0..1 along shortened segment
        // Quadratic fade for smoother tail
        const alpha = (1 - t) * (1 - t) * 0.7;
        const blur = 2 + (1 - t) * 10;
        const lw = Math.max(0.8, this.radius * (0.35 + (1 - t) * 0.45));
        ctx.globalAlpha = alpha;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = blur;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // For Arc Blade bullets, bypass sprite cache to honor per-bullet length scaling
    if (ENABLE_SPRITE_CACHE && !this.arcBlade) {
      const sprite = getBulletSprite(this.chargeLevel, this.radius, this.color, this.variant || 'classic');
      const angle = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(angle);
      ctx.drawImage(sprite.img, -sprite.ax, -sprite.ay);
      // Durable Cannons overlay (style-only). Applied to bullets tagged by caller.
      if (this.durableFx) {
        ctx.save();
        // Slight colored tail first (using bullet color)
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 0.45;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = Math.max(1.2, this.radius * 0.8);
        ctx.beginPath();
        ctx.moveTo(-Math.max(16, this.radius * 3.0), 0);
        ctx.lineTo(-Math.max(4, this.radius * 1.0), 0);
        ctx.stroke();
        // White punchy inner streak for readability
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 20;
        ctx.lineWidth = Math.max(1.8, this.radius * 1.1);
        ctx.beginPath();
        ctx.moveTo(-Math.max(22, this.radius * 3.6), 0);
        ctx.lineTo(-Math.max(5, this.radius * 1.3), 0);
        ctx.stroke();
        // Soft outer halo
        ctx.globalAlpha = 0.5;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.0, this.radius * 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(3.0, this.radius * 1.15), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // Apex Rounds boosted overlay (only while bullet can pierce)
      if (typeof window !== 'undefined' && window.__apexRoundsEnabled && this.piercesLeft > 0) {
        ctx.save();
        // Colored additive trail extension (behind core)
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 0.6;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 16;
        ctx.lineWidth = Math.max(1.4, this.radius * 0.9);
        ctx.beginPath();
        ctx.moveTo(-Math.max(18, this.radius * 3.2), 0);
        ctx.lineTo(-Math.max(3, this.radius * 0.8), 0);
        ctx.stroke();

        // brighter, longer white streak behind the core
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 18;
        ctx.lineWidth = Math.max(1.6, this.radius * 1.0);
        ctx.beginPath();
        ctx.moveTo(-Math.max(24, this.radius * 3.8), 0);
        ctx.lineTo(-Math.max(6, this.radius * 1.2), 0);
        ctx.stroke();
        // bright inner core accent with stronger glow
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.8, this.radius * 0.7), 0, Math.PI * 2);
        ctx.fill();
        // faint outer glow ring
        ctx.globalAlpha = 0.55;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.9, this.radius * 0.45);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2.6, this.radius * 1.05), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      return;
    }
    // Fallback: draw procedurally with variants
    const v = this.variant || 'classic';
    const lenBase = this.chargeLevel === 0 ? 14 : (this.chargeLevel === 1 ? 26 : 32);
    // Length adjustments:
    // - Arc Blade bullets: shorten to ~60% (handled here)
    // - Normal flak bullets: extend to ~140% for a punchier look
    let len = lenBase;
    if (this.arcBlade) {
      len = Math.max(4, Math.round(lenBase * 0.3));
    } else if (v === 'flak') {
      // Reduce normal flak length by ~25% from previous boost (1.4x -> 1.05x)
      len = Math.round(lenBase * 1.05);
    }
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
    } else if (v === 'flak') {
      // Brighter core and short local tail; long global tail is drawn above
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color; ctx.shadowBlur = Math.max(coreBlur, 22);
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
      // Extra head glow to match Arc Blade punch (color-consistent), only for normal flak
      if (!this.arcBlade) {
        ctx.save();
        // Stronger additive-like glow pass
        ctx.globalAlpha = 0.95;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = Math.max(coreBlur + 8, 26);
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(this.radius * 1.05, this.radius + 0.5), 0, Math.PI * 2); ctx.fill();
        // Soft halo ring around the head
        ctx.globalAlpha = 0.7;
        ctx.shadowBlur = Math.max(coreBlur + 10, 28);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(0.9, this.radius * 0.55);
        ctx.beginPath(); ctx.arc(0, 0, Math.max(this.radius * 1.2, this.radius + 1.5), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // subtle local tail
      ctx.strokeStyle = this.color; ctx.shadowBlur = Math.max(8, trailBlur);
      ctx.lineWidth = Math.max(2, lineWidth);
      // For normal flak bullets, extend the local tail; keep Arc Blade shorter
      const flakTailMul = this.arcBlade ? 0.5 : 1.0;
      ctx.beginPath(); ctx.moveTo(-Math.max(10, len * flakTailMul), 0); ctx.lineTo(-2, 0); ctx.stroke();
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
    } else if (v === 'needle') {
      // Elongated sharp needle
      const base = -Math.max(10, len * 0.75);
      const half = Math.max(1.2, this.radius * 0.9);
      // Tail
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color; ctx.shadowBlur = Math.max(10, trailBlur);
      ctx.strokeStyle = this.color; ctx.lineWidth = Math.max(1.2, lineWidth - 1.0);
      ctx.beginPath(); ctx.moveTo(base, 0); ctx.lineTo(-2, 0); ctx.stroke();
      // Tip
      ctx.fillStyle = this.color; ctx.shadowBlur = coreBlur + 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(base, -half);
      ctx.lineTo(base - 2, 0);
      ctx.lineTo(base,  half);
      ctx.closePath();
      ctx.fill();
    } else {
      // fallback classic
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color; ctx.shadowBlur = trailBlur;
      ctx.strokeStyle = this.color; ctx.lineWidth = lineWidth;
      ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = this.color; ctx.shadowBlur = coreBlur;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    }
    // Durable Cannons overlay (style-only). Applied to bullets tagged by caller.
    if (this.durableFx) {
      // colored tail
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.45;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = Math.max(1.2, this.radius * 0.8);
      ctx.beginPath();
      ctx.moveTo(-Math.max(16, len * 1.1), 0);
      ctx.lineTo(-Math.max(4, len * 0.2), 0);
      ctx.stroke();
      // white inner streak
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 20;
      ctx.lineWidth = Math.max(1.8, this.radius * 1.1);
      ctx.beginPath();
      ctx.moveTo(-Math.max(22, len * 1.5), 0);
      ctx.lineTo(-Math.max(6, len * 0.35), 0);
      ctx.stroke();
      // soft halo
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.0, this.radius * 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3.0, this.radius * 1.15), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Apex Rounds boosted overlay (only while bullet can pierce)
    if (typeof window !== 'undefined' && window.__apexRoundsEnabled && this.piercesLeft > 0) {
      // Colored additive trail extension
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.6;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 16;
      ctx.lineWidth = Math.max(1.4, this.radius * 0.9);
      ctx.beginPath();
      ctx.moveTo(-Math.max(18, len * 1.2), 0);
      ctx.lineTo(-Math.max(3, len * 0.2), 0);
      ctx.stroke();
      // brighter, longer white streak behind the core
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = Math.max(1.6, this.radius * 1.0);
      ctx.beginPath();
      ctx.moveTo(-Math.max(24, len * 1.9), 0);
      ctx.lineTo(-Math.max(6, len * 0.3), 0);
      ctx.stroke();
      // bright inner core accent
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.95;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.8, this.radius * 0.7), 0, Math.PI * 2);
      ctx.fill();
      // faint outer glow ring
      ctx.globalAlpha = 0.55;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.9, this.radius * 0.45);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2.6, this.radius * 1.05), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
