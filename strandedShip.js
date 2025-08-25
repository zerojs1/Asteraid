// StrandedShip module extracted from ast.html
// Explicit dependencies: update(canvas, frameCount, spawnParticle), draw(ctx, frameCount)

export class StrandedShip {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 30;
    this.maxHealth = 5;
    this.health = this.maxHealth;
    this.active = true;
    this.damageFlash = 0;
    this.scale = 2.2; // larger than player ship
    this.angle = Math.random() * Math.PI * 2; // random facing
    this.evacuating = false;
    this.invulnerable = false; // used while evacuating
    this.speed = 5;
    // Highlight timer for initial spawn (frames ~3s at 60fps)
    this.highlightTimer = 180;
    // Precompute some crack lines to emphasize damage
    this.cracks = Array.from({ length: 4 }, () => ({
      x1: -12 + Math.random() * 20,
      y1: -10 + Math.random() * 20,
      x2: -12 + Math.random() * 20,
      y2: -10 + Math.random() * 20,
    }));
  }

  hit() {
    if (this.invulnerable) return;
    this.health = Math.max(0, this.health - 1);
    this.damageFlash = 15;
  }

  // Dependencies passed explicitly to avoid globals
  update(canvas, frameCount, spawnParticle) {
    if (this.damageFlash > 0) this.damageFlash--;
    if (this.highlightTimer > 0) this.highlightTimer--;
    // If evacuating (end of level 2), fly straight out and despawn safely
    if (this.evacuating) {
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
      if (
        this.x < -60 || this.x > canvas.width + 60 ||
        this.y < -60 || this.y > canvas.height + 60
      ) {
        this.active = false;
      }
    }
    // Engine sputter particles (damaged look)
    if (frameCount % 12 === 0 && this.active) {
      const ex = this.x - Math.cos(this.angle) * 18;
      const ey = this.y - Math.sin(this.angle) * 18;
      const ang = Math.random() * Math.PI * 2;
      spawnParticle(
        ex,
        ey,
        Math.cos(ang) * 0.8,
        Math.sin(ang) * 0.8,
        '#fa0',
        18
      );
    }
  }

  // Draw requires ctx and frameCount for wobble/pulses
  draw(ctx, frameCount) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.sin(frameCount * 0.03) * 0.02); // slight wobble
    const hullColor = '#0ff';
    const dmgColor = this.damageFlash > 0 ? '#f66' : hullColor;
    const s = this.scale;

    // Initial spawn highlight: blinking white glowing circle around the ship
    if (this.highlightTimer > 0) {
      const blinkOn = Math.floor(frameCount / 20) % 2 === 0; // ~1.5 Hz blink
      if (blinkOn) {
        const t = this.highlightTimer / 180; // fade factor 1 -> 0
        const pulse = 1 + Math.sin(frameCount * 0.25) * 0.05; // subtle pulsation
        ctx.globalAlpha = 0.5 + 0.4 * t;
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 22;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.8 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // Ship hull glow (larger, like player but damaged)
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i === 0 ? 1 : 0.35;
      ctx.shadowBlur = 18 - i * 4;
      ctx.shadowColor = dmgColor;
      ctx.strokeStyle = dmgColor;
      ctx.lineWidth = i === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(15 * s, 0);
      ctx.lineTo(-10 * s, -10 * s * 0.95); // warped fin
      ctx.lineTo(-5 * s, 0);
      ctx.lineTo(-10 * s, 10 * s);
      ctx.closePath();
      ctx.stroke();
    }

    // Broken plating / cracks
    ctx.globalAlpha = 0.8;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#f66';
    ctx.lineWidth = 1;
    this.cracks.forEach(c => {
      ctx.beginPath();
      ctx.moveTo(c.x1 * s, c.y1 * s);
      ctx.lineTo(c.x2 * s, c.y2 * s);
      ctx.stroke();
    });

    // Protective shield while evacuating
    if (this.invulnerable) {
      const pulse = 1 + Math.sin(frameCount * 0.2) * 0.05;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#0ff';
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 15;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.4 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Dead engine sputter drawing
    if (Math.floor(frameCount / 8) % 2 === 0) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#fa0';
      ctx.shadowColor = '#fa0';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-5 * s, -5 * s);
      ctx.lineTo(-15 * s - (3 + Math.random() * 10), 0);
      ctx.lineTo(-5 * s, 5 * s);
      ctx.stroke();
    }

    // Health pips above hull
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    for (let i = 0; i < this.maxHealth; i++) {
      const filled = i < this.health;
      ctx.strokeStyle = filled ? '#0f0' : '#400';
      ctx.fillStyle = filled ? '#0f0' : 'transparent';
      ctx.lineWidth = 1;
      const px = -this.radius * 1.2 + 8 + i * 9;
      const py = -this.radius * 1.6;
      ctx.beginPath();
      ctx.rect(px, py, 7, 7);
      if (filled) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
