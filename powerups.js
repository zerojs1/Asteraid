// powerups.js: Powerup class extracted from ast.html
import { ENABLE_SPRITE_CACHE } from './constants.js';

// Helper: draw a path for a given shape centered at (cx, cy) with a given radius
function drawShapePath(ctx, cx, cy, radius, shape) {
  if (shape === 'circle') {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    return;
  }
  if (shape === 'diamond') {
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
    return;
  }
  // default to hexagon for 'hexagon' and any other unrecognized shape
  const sides = 6;
  const startAng = -Math.PI / 2; // start at top
  for (let i = 0; i < sides; i++) {
    const ang = startAng + i * (Math.PI * 2 / sides);
    const px = cx + Math.cos(ang) * radius;
    const py = cy + Math.sin(ang) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Cache glowing outline (without icon) per color+shape at base radius (15)
const orbCache = new Map(); // key: `${shape}|${color}` -> {img, cx, cy, baseRadius}
function getOrbSprite(color, baseRadius = 15, shape = 'circle') {
  const key = `${shape}|${color}`;
  let spr = orbCache.get(key);
  if (spr) return spr;
  // Build offscreen canvas matching the procedural glow:
  // four concentric outline strokes with shadow blur.
  const maxShadow = 20; // matches 20 - i*5
  const maxExtra = 3 * 2; // i * 2 with i=3 => 6
  const margin = maxShadow + maxExtra + 6;
  const size = baseRadius * 2 + margin * 2;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.lineJoin = 'round';
  for (let i = 3; i >= 0; i--) {
    ctx.globalAlpha = i === 0 ? 1 : 0.3;
    ctx.shadowBlur = 20 - i * 5;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = i === 0 ? 2 : 1;
    ctx.beginPath();
    drawShapePath(ctx, cx, cy, baseRadius + i * 2, shape);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  spr = { img: cvs, cx, cy, baseRadius };
  orbCache.set(key, spr);
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
      // Attack (diamond)
      bomb:     { color: '#ff0', icon: 'B', shape: 'diamond' },
      flak:     { color: '#f00', icon: 'F', shape: 'diamond' },
      laser:    { color: '#f09', icon: 'L', shape: 'diamond' },

      // Utility (hexagon)
      clone:    { color: '#6ff', icon: 'C', shape: 'hexagon' },
      orbital:  { color: '#f5f5dc', icon: 'O', shape: 'hexagon' },
      durable:  { color: '#ed9079', icon: 'D', shape: 'hexagon' },
      teleport: { color: '#00f', icon: 'T', shape: 'hexagon' },
      mine:     { color: '#fc0356', icon: 'M', shape: 'hexagon' },

      // Defense (circle)
      shield:   { color: '#0f0', icon: 'S', shape: 'circle' },
      invisible:{ color: '#f0f', icon: 'I', shape: 'circle' },
      rainbow:  { color: '#fa0', icon: 'R', shape: 'circle' },
      life:     { color: '#ffa099', icon: '1', shape: 'circle' },
      armor:    { color: '#0ff', icon: 'A', shape: 'circle' },
    };

    this.color = config[type].color;
    this.icon = config[type].icon;
    this.shape = config[type].shape || 'circle';
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
      const spr = getOrbSprite(this.color, this.radius, this.shape);
      const scale = (this.radius + pulseSize) / spr.baseRadius;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(scale, scale);
      ctx.drawImage(spr.img, -spr.cx, -spr.cy);
      ctx.restore();
    } else {
      // Procedural outline
      ctx.save();
      ctx.lineJoin = 'round';
      for (let i = 3; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 1 : 0.3;
        ctx.shadowBlur = 20 - i * 5;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = i === 0 ? 2 : 1;
        ctx.beginPath();
        drawShapePath(ctx, this.x, this.y, this.radius + pulseSize + i * 2, this.shape);
        ctx.stroke();
      }
      ctx.restore();
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
