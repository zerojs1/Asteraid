// Enemy bullet (boss/plates) module extracted from ast.html
export class EnemyBullet {
  constructor(x, y, angle, speed = 5) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 4;
    this.color = '#f33';
    this.lifetime = 150;
  }
  update(canvas) {
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime--;
    if (this.x < -20 || this.x > canvas.width + 20 || this.y < -20 || this.y > canvas.height + 20) this.lifetime = 0;
  }
  draw(ctx) {
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const len = 16;
    const tx = this.x - (this.vx / sp) * len;
    const ty = this.y - (this.vy / sp) * len;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
