// Hazards module: GravityWell and Wormhole extracted from ast.html
import { GRAVITY_STRENGTH, GRAVITY_RADIUS, WORMHOLE_RADIUS } from './constants.js';

export class GravityWell {
  constructor(x, y, strength = GRAVITY_STRENGTH, radius = GRAVITY_RADIUS) {
    this.x = x;
    this.y = y;
    this.strength = strength;
    this.radius = radius;
    this.pulse = 0;
  }
  update() {
    this.pulse += 0.03;
  }
  draw(ctx) {
    // Concentric neon rings
    for (let i = 3; i >= 0; i--) {
      const color = i === 0 ? '#48f' : '#90f';
      ctx.globalAlpha = i === 0 ? 0.9 : 0.25;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 20 - i * 4;
      ctx.shadowColor = color;
      ctx.lineWidth = i === 0 ? 2 : 1;
      const r = this.radius * (0.45 + i * 0.15) + Math.sin(this.pulse + i) * 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Core glow
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#0ff';
    ctx.fillStyle = '#0ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6 + Math.sin(this.pulse * 2) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export class Wormhole {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = WORMHOLE_RADIUS;
    this.pulse = 0;
  }
  update() {
    this.pulse += 0.06;
  }
  draw(ctx) {
    // Faint energy field for visibility
    const outerR = this.radius + 14;
    const grad = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, outerR);
    grad.addColorStop(0, 'rgba(200, 255, 255, 0.28)');
    grad.addColorStop(0.6, 'rgba(120, 220, 255, 0.16)');
    grad.addColorStop(1, 'rgba(0, 160, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, outerR, 0, Math.PI * 2);
    ctx.fill();

    // Neon swirling rings (brighter)
    for (let i = 3; i >= 0; i--) {
      const c = i === 0 ? '#4af' : (i === 1 ? '#8ff' : '#a0f');
      ctx.globalAlpha = i === 0 ? 1 : 0.5;
      ctx.strokeStyle = c;
      ctx.shadowBlur = 22 - i * 4;
      ctx.shadowColor = c;
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      let r = this.radius + Math.sin(this.pulse + i) * 3 + i * 3;
      // Enlarge the outermost outline circle by 50% for better visibility
      if (i === 3) r *= 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Core
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#8ff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6 + Math.sin(this.pulse * 2) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
