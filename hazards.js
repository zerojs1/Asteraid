// Hazards module: GravityWell and Wormhole extracted from ast.html
import {
  GRAVITY_STRENGTH,
  GRAVITY_RADIUS,
  WORMHOLE_RADIUS,
  TETHER_NODE_RADIUS,
  TETHER_PULSE_SPEED,
  TETHER_LINE_BASE_WIDTH,
  TETHER_SPEED_AFTER_BREAK,
  TETHER_RESPAWN_FRAMES,
} from './constants.js';

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

// Level 14: Tethered asteroid pair (visual hazard + line endpoints)
// Drawn as neon blue nodes connected by a pulsing tether. External code handles
// collision with the player using lineCircleCollision().
export class TetherPair {
  constructor(canvas) {
    this.radius = TETHER_NODE_RADIUS;
    this.pulse = 0;
    this.tetherBroken = false;
    this.respawnTimer = 0;
    this.speedScaled = false;
    this.respawn(canvas, true);
  }
  // Randomize endpoints just offscreen, velocity pointing inward
  respawn(canvas, immediate = false) {
    const margin = 36;
    const side = Math.floor(Math.random() * 4);
    // Pick a primary spawn point offscreen
    let x = 0, y = 0;
    if (side === 0) { x = -margin; y = Math.random() * canvas.height; }
    else if (side === 1) { x = canvas.width + margin; y = Math.random() * canvas.height; }
    else if (side === 2) { x = Math.random() * canvas.width; y = -margin; }
    else { x = Math.random() * canvas.width; y = canvas.height + margin; }
    // Second endpoint offset roughly 220-300px away at a random angle
    const dist = 220 + Math.random() * 80;
    const ang = Math.random() * Math.PI * 2;
    const x2 = x + Math.cos(ang) * dist;
    const y2 = y + Math.sin(ang) * dist;
    // Velocities aimed somewhat toward screen center with slight variance
    const cx = canvas.width * 0.5, cy = canvas.height * 0.5;
    const dir1 = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 0.4;
    const dir2 = Math.atan2(cy - y2, cx - x2) + (Math.random() - 0.5) * 0.4;
    const sp = 0.8 + Math.random() * 0.6;
    const sp2 = 0.8 + Math.random() * 0.6;

    this.ax = x; this.ay = y;
    this.bx = x2; this.by = y2;
    this.avx = Math.cos(dir1) * sp;
    this.avy = Math.sin(dir1) * sp;
    this.bvx = Math.cos(dir2) * sp2;
    this.bvy = Math.sin(dir2) * sp2;
    this.tetherBroken = false;
    this.respawnTimer = 0;
    this.speedScaled = false;
  }
  getEndpoints() {
    return [this.ax, this.ay, this.bx, this.by];
  }
  breakTether() {
    if (this.tetherBroken) return;
    this.tetherBroken = true;
    // Slow nodes after break one time only
    if (!this.speedScaled) {
      this.avx *= TETHER_SPEED_AFTER_BREAK;
      this.avy *= TETHER_SPEED_AFTER_BREAK;
      this.bvx *= TETHER_SPEED_AFTER_BREAK;
      this.bvy *= TETHER_SPEED_AFTER_BREAK;
      this.speedScaled = true;
    }
    // Start timer for automatic respawn
    this.respawnTimer = TETHER_RESPAWN_FRAMES;
  }
  update(canvas) {
    this.pulse += TETHER_PULSE_SPEED;
    // Move endpoints with wrap
    this.ax += this.avx; this.ay += this.avy;
    this.bx += this.bvx; this.by += this.bvy;
    const r = this.radius;
    if (this.ax < -r) this.ax = canvas.width + r;
    if (this.ax > canvas.width + r) this.ax = -r;
    if (this.ay < -r) this.ay = canvas.height + r;
    if (this.ay > canvas.height + r) this.ay = -r;
    if (this.bx < -r) this.bx = canvas.width + r;
    if (this.bx > canvas.width + r) this.bx = -r;
    if (this.by < -r) this.by = canvas.height + r;
    if (this.by > canvas.height + r) this.by = -r;
    // Handle respawn cycle after break
    if (this.tetherBroken && this.respawnTimer > 0) {
      this.respawnTimer--;
      if (this.respawnTimer === 0) this.respawn(canvas, false);
    }
  }
  draw(ctx) {
    // Draw tether first for under-glow, if active
    if (!this.tetherBroken) {
      const p = 0.5 + 0.5 * Math.sin(this.pulse);
      const lw = TETHER_LINE_BASE_WIDTH + 1.7 * p;
      const grad = ctx.createLinearGradient(this.ax, this.ay, this.bx, this.by);
      grad.addColorStop(0, 'rgba(120, 220, 255, 0.95)');
      grad.addColorStop(0.5, 'rgba(240, 130, 255, 0.95)');
      grad.addColorStop(1, 'rgba(120, 220, 255, 0.95)');
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      // Outer glow
      ctx.globalAlpha = 0.32 + 0.25 * p;
      ctx.strokeStyle = grad;
      ctx.shadowColor = 'rgba(180, 240, 255, 1)';
      ctx.shadowBlur = 20 + 12 * p;
      ctx.lineWidth = lw + 2.0;
      ctx.beginPath();
      ctx.moveTo(this.ax, this.ay);
      ctx.lineTo(this.bx, this.by);
      ctx.stroke();
      // Core
      ctx.globalAlpha = 0.95;
      ctx.shadowBlur = 0;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(this.ax, this.ay);
      ctx.lineTo(this.bx, this.by);
      ctx.stroke();
      ctx.globalCompositeOperation = prevOp;
    }
    // Draw glowing endpoints as neon blue nodes
    this.#drawNode(ctx, this.ax, this.ay);
    this.#drawNode(ctx, this.bx, this.by);
  }
  #drawNode(ctx, x, y) {
    const p = 0.5 + 0.5 * Math.sin(this.pulse * 1.8);
    const r = this.radius;
    // Halo
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 + 0.36 * p;
    ctx.shadowBlur = 22 + 10 * p;
    ctx.shadowColor = '#6cf';
    ctx.strokeStyle = '#6cf';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Core dot
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#9ef';
    ctx.fillStyle = '#cfffff';
    ctx.beginPath();
    ctx.arc(x, y, 4.5 + 1.5 * p, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
