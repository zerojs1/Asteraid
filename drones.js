// Drone module extracted from ast.html
export class Drone {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 12;
    this.dead = false;
    this.maxSpeed = 2.2;
    this.turnRate = 0.06;
  }
  update(player, canvas) {
    if (this.dead) return;
    const angTo = Math.atan2(player.y - this.y, player.x - this.x);
    const cur = Math.atan2(this.vy, this.vx);
    let diff = Math.atan2(Math.sin(angTo - cur), Math.cos(angTo - cur));
    diff = Math.max(-this.turnRate, Math.min(this.turnRate, diff));
    const speed = Math.min(this.maxSpeed, Math.hypot(this.vx, this.vy) + 0.15);
    const newAng = cur + diff;
    this.vx = Math.cos(newAng) * speed;
    this.vy = Math.sin(newAng) * speed;
    this.x += this.vx; this.y += this.vy;
    if (this.x < -40 || this.x > canvas.width + 40 || this.y < -40 || this.y > canvas.height + 40) this.dead = true;
  }
  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const ang = Math.atan2(this.vy, this.vx);
    ctx.rotate(ang);
    ctx.shadowBlur = 12; ctx.shadowColor = '#0f0';
    ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// Hostile AttackDrone: like Drone but red, filled, and fires at the player every ~2s
export class AttackDrone {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 12;
    this.dead = false;
    this.maxSpeed = 1.2; // 35% slower than normal drones (~1.43)
    this.turnRate = 0.06;
    this.fireCooldown = 120; // frames between shots (~2s at 60fps)
    this.explosionColor = '#f55';
  }
  update(player, canvas, enemyBullets, EnemyBullet) {
    if (this.dead) return;
    // Movement: identical to Drone
    const angTo = Math.atan2(player.y - this.y, player.x - this.x);
    const cur = Math.atan2(this.vy, this.vx);
    let diff = Math.atan2(Math.sin(angTo - cur), Math.cos(angTo - cur));
    diff = Math.max(-this.turnRate, Math.min(this.turnRate, diff));
    const speed = Math.min(this.maxSpeed, Math.hypot(this.vx, this.vy) + 0.15);
    const newAng = cur + diff;
    this.vx = Math.cos(newAng) * speed;
    this.vy = Math.sin(newAng) * speed;
    this.x += this.vx; this.y += this.vy;
    // Fire toward player periodically
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.fireCooldown === 0 && enemyBullets && EnemyBullet) {
      const ang = Math.atan2(player.y - this.y, player.x - this.x);
      const eb = new EnemyBullet(this.x, this.y, ang, 5.2);
      eb.color = '#f33';
      enemyBullets.push(eb);
      this.fireCooldown = 120;
    }
    // Offscreen cull
    if (this.x < -40 || this.x > canvas.width + 40 || this.y < -40 || this.y > canvas.height + 40) this.dead = true;
  }
  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const ang = Math.atan2(this.vy, this.vx);
    ctx.rotate(ang);
    ctx.shadowBlur = 12; ctx.shadowColor = '#f33';
    ctx.fillStyle = '#f33';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-10, -8); ctx.lineTo(-10, 8); ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// Friendly clone drone that orbits the player and mirrors firing
export class CloneDrone {
  constructor(x, y, offsetAngle = 0) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 10;
    this.dead = false;
    this.orbitRadius = 42;
    this.offsetAngle = offsetAngle; // relative to player's facing
    this.accel = 0.35;
    this.maxSpeed = 3.0;
  }
  update(player, canvas) {
    if (this.dead) return;
    const targetAng = player.angle + this.offsetAngle;
    const tx = player.x + Math.cos(targetAng) * this.orbitRadius;
    const ty = player.y + Math.sin(targetAng) * this.orbitRadius;
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    // simple seek towards target with clamp
    const ax = (dx / dist) * this.accel;
    const ay = (dy / dist) * this.accel;
    this.vx = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.vx + ax));
    this.vy = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.vy + ay));
    this.x += this.vx; this.y += this.vy;
    // keep on-screen
    if (this.x < -60 || this.x > canvas.width + 60 || this.y < -60 || this.y > canvas.height + 60) this.dead = true;
  }
  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const ang = Math.atan2(this.vy, this.vx);
    ctx.rotate(ang);
    ctx.shadowBlur = 10; ctx.shadowColor = '#6ff';
    ctx.strokeStyle = '#6ff'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-8, -6); ctx.lineTo(-8, 6); ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
