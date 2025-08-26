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
    this.phase = 0; // for pulsing brightness
  }

  update() {
    this.duration--;
    this.phase += 0.25;
  }

  draw(ctx) {
    const t = Math.max(0, this.duration / this.maxDuration);
    const alpha = t;
    ctx.save();
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; // additive for stronger glow

    // Pulse factor similar to the wormhole connection line
    const p = 0.5 + 0.5 * Math.sin(this.phase);

    // Gradient along the connection line
    const grad = ctx.createLinearGradient(this.startX, this.startY, this.endX, this.endY);
    grad.addColorStop(0, 'rgba(100, 220, 255, 0.9)');
    grad.addColorStop(0.5, 'rgba(240, 120, 255, 0.9)');
    grad.addColorStop(1, 'rgba(100, 220, 255, 0.9)');

    // Outer glow stroke
    ctx.globalAlpha = (0.28 + 0.35 * p) * alpha;
    ctx.strokeStyle = grad;
    ctx.shadowColor = 'rgba(180, 240, 255, 1)';
    ctx.shadowBlur = 24 + 14 * p;
    ctx.lineWidth = 3.0 + 1.6 * p;
    ctx.beginPath();
    ctx.moveTo(this.startX, this.startY);
    ctx.lineTo(this.endX, this.endY);
    ctx.stroke();

    // Core bright stroke
    ctx.globalAlpha = (0.65 + 0.25 * p) * alpha;
    ctx.strokeStyle = '#eaffff';
    ctx.shadowColor = '#eaffff';
    ctx.shadowBlur = 12 + 8 * p;
    ctx.lineWidth = 1.8 + 0.8 * p;
    ctx.beginPath();
    ctx.moveTo(this.startX, this.startY);
    ctx.lineTo(this.endX, this.endY);
    ctx.stroke();

    ctx.globalCompositeOperation = prevOp;
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
