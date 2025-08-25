// Particle module extracted from ast.html
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
      // Wrap around screen for moving particles
      if (this.x < 0) this.x = canvas.width;
      if (this.x > canvas.width) this.x = 0;
      if (this.y < 0) this.y = canvas.height;
      if (this.y > canvas.height) this.y = 0;
    }
    this.rotation += this.angularVel;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.lifetime / this.maxLifetime);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = this.color;
    if (this.shape === 'ring') {
      const shimmer = 0.85 + 0.15 * Math.sin(this.shimmerPhase + (this.maxLifetime - this.lifetime) * this.shimmerSpeed);
      ctx.globalAlpha = Math.max(0, alpha * shimmer);
      ctx.strokeStyle = this.color;
      ctx.shadowBlur = this.glow;
      ctx.lineWidth = this.thickness;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.shape === 'shard') {
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
    } else {
      // dot
      ctx.shadowBlur = this.glow * 0.8;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
