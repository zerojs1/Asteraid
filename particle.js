// Particle module extracted from ast.html
import { ENABLE_SPRITE_CACHE } from './constants.js';

// Offscreen sprite caches
const dotCache = new Map(); // key: `${color}|r${rInt}|g${gInt}`
const ringCache = new Map(); // key: `${color}|r${rInt}|t${tInt}|g${gInt}`

function getDotSprite(color, radius, glow) {
  const rInt = Math.max(1, Math.round(radius));
  const gInt = Math.max(0, Math.round(glow));
  const key = `${color}|r${rInt}|g${gInt}`;
  let spr = dotCache.get(key);
  if (spr) return spr;
  const margin = gInt + 4;
  const size = rInt * 2 + margin * 2;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = gInt;
  ctx.beginPath();
  ctx.arc(cx, cy, rInt, 0, Math.PI * 2);
  ctx.fill();
  spr = { img: cvs, cx, cy };
  dotCache.set(key, spr);
  return spr;
}

function getRingSprite(color, radius, thickness, glow) {
  const rInt = Math.max(1, Math.round(radius));
  const tInt = Math.max(1, Math.round(thickness));
  const gInt = Math.max(0, Math.round(glow));
  const key = `${color}|r${rInt}|t${tInt}|g${gInt}`;
  let spr = ringCache.get(key);
  if (spr) return spr;
  const margin = gInt + tInt + 4;
  const size = rInt * 2 + margin * 2;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = tInt;
  ctx.shadowBlur = gInt;
  ctx.beginPath();
  ctx.arc(cx, cy, rInt, 0, Math.PI * 2);
  ctx.stroke();
  spr = { img: cvs, cx, cy };
  ringCache.set(key, spr);
  return spr;
}
export class Particle {
  constructor(x, y, vx, vy, color, lifetime) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.lifetime = lifetime;
    this.maxLifetime = lifetime;
    this.radius = Math.random() * 3 + 1;
    this.damaging = false; // for rainbow trail damage
    // Extended visuals
    this.shape = 'dot'; // 'dot' | 'ring' | 'shard'
    this.rotation = Math.random() * Math.PI * 2;
    this.angularVel = (Math.random() - 0.5) * 0.2;
    this.length = 8;
    this.growth = 0; // for ring expansion per frame
    this.thickness = 2;
    this.glow = 16;
    this.shimmerPhase = Math.random() * Math.PI * 2;
    this.shimmerSpeed = 0.25 + Math.random() * 0.35;
  }

  update(canvas) {
    this.lifetime--;
    if (this.shape === 'ring') {
      this.radius += this.growth;
    } else {
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.98;
      this.vy *= 0.98;
      // Wrap around screen for moving particles (can be disabled for performance)
      if (!this.noWrap) {
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
      } else {
        // Cheap offscreen cull when wrapping is disabled
        const m = 20; // small margin so fade-out rings still render near edges
        if (
          this.x < -m || this.x > (canvas ? canvas.width + m : 0) ||
          this.y < -m || this.y > (canvas ? canvas.height + m : 0)
        ) {
          this.lifetime = 0;
        }
      }
    }
    this.rotation += this.angularVel;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.lifetime / this.maxLifetime);
    if (ENABLE_SPRITE_CACHE && this.shape === 'dot') {
      const spr = getDotSprite(this.color, this.radius, this.glow * 0.8);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(spr.img, this.x - spr.cx, this.y - spr.cy);
      ctx.restore();
      return;
    }
    if (ENABLE_SPRITE_CACHE && this.shape === 'ring') {
      const shimmer = 0.85 + 0.15 * Math.sin(this.shimmerPhase + (this.maxLifetime - this.lifetime) * this.shimmerSpeed);
      const spr = getRingSprite(this.color, this.radius, this.thickness, this.glow);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha * shimmer);
      ctx.drawImage(spr.img, this.x - spr.cx, this.y - spr.cy);
      ctx.restore();
      return;
    }
    // Fallback/procedural paths
    ctx.globalAlpha = alpha;
    ctx.shadowColor = this.color;
    if (this.shape === 'shard') {
      ctx.shadowBlur = this.glow;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.thickness;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.beginPath();
      ctx.moveTo(-this.length * 0.5, 0);
      ctx.lineTo(this.length * 0.5, 0);
      ctx.stroke();
      ctx.restore();
    } else if (this.shape === 'dot') {
      // dot
      ctx.shadowBlur = this.glow * 0.8;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.shape === 'ring') {
      const shimmer = 0.85 + 0.15 * Math.sin(this.shimmerPhase + (this.maxLifetime - this.lifetime) * this.shimmerSpeed);
      ctx.globalAlpha = Math.max(0, alpha * shimmer);
      ctx.strokeStyle = this.color;
      ctx.shadowBlur = this.glow;
      ctx.lineWidth = this.thickness;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
