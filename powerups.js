// powerups.js: Powerup class extracted from ast.html
export class Powerup {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = 15;
    this.pulse = 0;

    const config = {
      bomb: { color: '#ff0', icon: 'B' },
      shield: { color: '#0f0', icon: 'O' },
      teleport: { color: '#00f', icon: 'T' },
      flak: { color: '#f00', icon: 'F' },
      rainbow: { color: '#fa0', icon: 'R' },
      invisible: { color: '#f0f', icon: 'I' },
      laser: { color: '#f09', icon: 'L' },
      clone: { color: '#6ff', icon: 'C' },
      life: { color: '#fff', icon: '1' }
    };

    this.color = config[type].color;
    this.icon = config[type].icon;
  }

  update() {
    this.pulse += 0.1;
  }

  draw(ctx) {
    const pulseSize = Math.sin(this.pulse) * 5;

    // Draw glowing orb
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

    // Draw icon
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color;
    ctx.font = 'bold 16px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.icon, this.x, this.y);

    ctx.shadowBlur = 0;
  }
}
