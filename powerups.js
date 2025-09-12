// powerups.js: Powerup class extracted from ast.html
import { ENABLE_SPRITE_CACHE } from './constants.js';

// Cache glowing orb (without icon) per color at base radius (15)
const orbCache = new Map(); // key: color -> {img, cx, cy, baseRadius}
function getOrbSprite(color, baseRadius = 15) {
  let spr = orbCache.get(color);
  if (spr) return spr;
  // Build offscreen canvas matching the procedural glow:
  // four concentric ring strokes with shadow blur.
  const maxShadow = 20; // matches 20 - i*5
  const maxExtra = 3 * 2; // i * 2 with i=3 => 6
  const margin = maxShadow + maxExtra + 6;
  const size = baseRadius * 2 + margin * 2;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  const cx = size / 2, cy = size / 2;
  for (let i = 3; i >= 0; i--) {
    ctx.globalAlpha = i === 0 ? 1 : 0.3;
    ctx.shadowBlur = 20 - i * 5;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = i === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius + i * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  spr = { img: cvs, cx, cy, baseRadius };
  orbCache.set(color, spr);
  return spr;
}
export class Powerup {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = 15;
    this.pulse = 0;
    // Slow drift in a random direction
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.20 + Math.random() * 0.25; // very slow
    this.vx = Math.cos(ang) * spd;
    this.vy = Math.sin(ang) * spd;
    this.dead = false; // mark for despawn when offscreen

    const config = {
      bomb: { color: '#ff0', icon: 'B' },
      shield: { color: '#0f0', icon: 'S' },
      teleport: { color: '#00f', icon: 'T' },
      flak: { color: '#f00', icon: 'F' },
      rainbow: { color: '#fa0', icon: 'R' },
      invisible: { color: '#f0f', icon: 'I' },
      laser: { color: '#f09', icon: 'L' },
      clone: { color: '#6ff', icon: 'C' },
      orbital: { color: '#f5f5dc', icon: 'O' },
      life: { color: '#fff', icon: '1' },
      armor: { color: '#0ff', icon: 'A' },
      // New: Durable Cannons (teal)
      durable: { color: '#ed9079', icon: 'D' }
    };

    this.color = config[type].color;
    this.icon = config[type].icon;
  }

  update(canvas) {
    this.pulse += 0.1;
    // Apply slow drift
    this.x += this.vx;
    this.y += this.vy;
    // Offscreen culling
    if (canvas) {
      const margin = 20;
      if (this.x < -margin || this.x > canvas.width + margin || this.y < -margin || this.y > canvas.height + margin) {
        this.dead = true;
      }
    }
  }

  draw(ctx) {
    const pulseSize = Math.sin(this.pulse) * 5;
    if (ENABLE_SPRITE_CACHE) {
      const spr = getOrbSprite(this.color, this.radius);
      const scale = (this.radius + pulseSize) / spr.baseRadius;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(scale, scale);
      ctx.drawImage(spr.img, -spr.cx, -spr.cy);
      ctx.restore();
    } else {
      // Procedural orb
      for (let i = 3; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 1 : 0.3;
        ctx.shadowBlur = 20 - i * 5;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = i === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + pulseSize + i * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw icon (procedural, to avoid scaling text)
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 16px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.icon, this.x, this.y);
    ctx.shadowBlur = 0;
  }
}
