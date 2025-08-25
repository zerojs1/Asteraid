// Effects module: extracted from ast.html

// ScoreMilestone class for celebration effects
export class ScoreMilestone {
  constructor(score) {
    this.score = score;
    this.duration = 60; // 1 second at 60fps
    this.maxDuration = 60;
    this.bloomIntensity = 2.0;
  }

  update() {
    this.duration--;
  }

  draw() {
    // Rendering is handled in the main render loop by amplifying glow effects
  }
}

// VignetteEffect class for damage pulse
export class VignetteEffect {
  constructor(color, intensity, duration) {
    this.color = color;
    this.intensity = intensity;
    this.duration = duration;
    this.maxDuration = duration;
  }

  update() {
    this.duration--;
  }

  // Provide ctx and canvas, since modules don't share globals
  draw(ctx, canvas) {
    const alpha = (this.duration / this.maxDuration) * this.intensity;
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.7, 'transparent');
    gradient.addColorStop(1, `rgba(${this.color}, ${alpha})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// WarpTunnel class for teleport effect
export class WarpTunnel {
  constructor(startX, startY, endX, endY, duration) {
    this.startX = startX;
    this.startY = startY;
    this.endX = endX;
    this.endY = endY;
    this.duration = duration;
    this.maxDuration = duration;
    this.lines = [];

    // Create stretched star lines
    for (let i = 0; i < 20; i++) {
      this.lines.push({
        progress: Math.random(),
        offset: (Math.random() - 0.5) * 100,
        brightness: 0.5 + Math.random() * 0.5,
      });
    }
  }

  update() {
    this.duration--;
    // Update line positions
    this.lines.forEach(line => {
      line.progress += 0.08;
      if (line.progress > 1) line.progress = 0;
    });
  }

  draw(ctx) {
    const alpha = this.duration / this.maxDuration;
    ctx.globalAlpha = alpha;

    this.lines.forEach(line => {
      const x = this.startX + (this.endX - this.startX) * line.progress;
      const y = this.startY + (this.endY - this.startY) * line.progress;

      // Perpendicular offset
      const angle = Math.atan2(this.endY - this.startY, this.endX - this.startX);
      const perpX = Math.cos(angle + Math.PI / 2) * line.offset;
      const perpY = Math.sin(angle + Math.PI / 2) * line.offset;

      ctx.strokeStyle = `hsl(${180 + line.offset * 0.5}, 100%, ${50 * line.brightness}%)`;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + perpX - 10, y + perpY);
      ctx.lineTo(x + perpX + 10, y + perpY);
      ctx.stroke();
    });

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
