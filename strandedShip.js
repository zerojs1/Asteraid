// StrandedShip module extracted from ast.html
// Explicit dependencies: update(canvas, frameCount, spawnParticle), draw(ctx, frameCount)

export class StrandedShip {
  constructor(x, y, deps = {}) {
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
    this.outlineFlash = 0; // frames of red glow outline after a hit
    // Spawn invulnerability (~2s at 60fps)
    this.spawnInvulnTimer = 120;
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

    // DPR-aware offscreen sprite cache
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this.hullSprite = null;
    this.damageOverlaySprite = null;
    this.sparkSprite = null;
    this.emberSprite = null;

    // Local spark particle pool (electric/broken effects)
    this.sparks = [];
    this.maxSparks = 64;

    // Cyan embers and lightning arcs pools
    this.embers = [];
    this.maxEmbers = 96;
    this.lightning = [];
    this.maxLightning = 16;

    // Dependencies
    // setShake(frames, intensity): global screen-shake trigger injected by host
    this.setShake = (typeof deps.setShake === 'function') ? deps.setShake : () => {};

    // Build sprites once
    this.initSprites();
  }

  hit() {
    if (this.invulnerable || (this.spawnInvulnTimer && this.spawnInvulnTimer > 0)) return;
    this.health = Math.max(0, this.health - 1);
    this.damageFlash = 15;
    this.outlineFlash = 10;
    // Trigger brief screen shake for player feedback
    // Tunable locally if needed; use injected setShake to integrate with global camera
    this.setShake(16, 5);
    // Immediate spark burst on hit
    const burst = 5 + ((Math.random() * 3) | 0); // ~50% fewer
    for (let i = 0; i < burst && this.sparks.length < this.maxSparks; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 * this.radius * this.scale * (0.5 + Math.random() * 0.8); // 50% spawn radius
      const px = this.x + Math.cos(a) * r;
      const py = this.y + Math.sin(a) * r;
      const spd = 1.1 + Math.random() * 1.6;
      const vx = Math.cos(a) * spd;
      const vy = Math.sin(a) * spd;
      const life = 22 + (Math.random() * 16) | 0;
      const scale = (1.6 + Math.random() * 1.1) * 0.5; // 50% smaller
      this.sparks.push({ x: px, y: py, vx, vy, life, alpha: 1, scale });
    }
    // Immediate cyan ember burst on hit (subtler drift, longer life)
    const eBurst = 3 + ((Math.random() * 2) | 0); // ~50% fewer
    for (let i = 0; i < eBurst && this.embers.length < this.maxEmbers; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 * this.radius * this.scale * (0.6 + Math.random() * 0.6); // 50% spawn radius
      const px = this.x + Math.cos(a) * r;
      const py = this.y + Math.sin(a) * r;
      const spd = 0.4 + Math.random() * 0.9;
      const vx = Math.cos(a) * spd;
      const vy = Math.sin(a) * spd;
      const ttl = 50 + (Math.random() * 35) | 0;
      const scale = (1.0 + Math.random() * 1.2) * 0.5; // 50% smaller
      this.embers.push({ x: px, y: py, vx, vy, life: ttl, ttl, alpha: 1, scale });
    }
  }

  // Dependencies passed explicitly to avoid globals
  update(canvas, frameCount, spawnParticle) {
    // Rebuild sprites if display density changes
    this.refreshIfDisplayChanged();

    if (this.damageFlash > 0) this.damageFlash--;
    if (this.outlineFlash > 0) this.outlineFlash--;
    if (this.highlightTimer > 0) this.highlightTimer--;
    if (this.spawnInvulnTimer > 0) this.spawnInvulnTimer--;
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

    // Emit electric sparks when damaged (rate scales with missing health)
    if (this.active && this.health < this.maxHealth && (frameCount % 6 === 0)) {
      const missing = this.maxHealth - this.health;
      const bursts = Math.max(1, (1 + ((Math.random() * (missing + 1)) | 0)) >> 1); // ~50% fewer
      for (let i = 0; i < bursts; i++) {
        if (this.sparks.length >= this.maxSparks) break;
        const a = this.angle + (Math.random() * 0.8 - 0.4) + (Math.random() < 0.5 ? Math.PI : 0);
        const r = 0.5 * this.radius * this.scale * (0.8 + Math.random() * 0.5); // 50% spawn radius
        const px = this.x + Math.cos(a) * r + (Math.random() - 0.5) * 6;
        const py = this.y + Math.sin(a) * r + (Math.random() - 0.5) * 6;
        const spd = 0.9 + Math.random() * 1.2;
        const vx = Math.cos(a + Math.PI / 2) * spd * (Math.random() < 0.5 ? -1 : 1);
        const vy = Math.sin(a + Math.PI / 2) * spd * (Math.random() < 0.5 ? -1 : 1);
        const life = 22 + (Math.random() * 12) | 0;
        const scale = (1.2 + Math.random() * 1.0) * 0.5; // 50% smaller
        this.sparks.push({ x: px, y: py, vx, vy, life, alpha: 1, scale });
      }
    }

    // Emit cyan embers when damaged (gentle outward drift, longer life)
    if (this.active && this.health < this.maxHealth && (frameCount % 5 === 0)) {
      const missing = this.maxHealth - this.health;
      const bursts = Math.max(1, (1 + ((Math.random() * (1 + missing)) | 0)) >> 1); // ~50% fewer
      for (let i = 0; i < bursts; i++) {
        if (this.embers.length >= this.maxEmbers) break;
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 * this.radius * this.scale * (0.7 + Math.random() * 0.6); // 50% spawn radius
        const px = this.x + Math.cos(a) * r;
        const py = this.y + Math.sin(a) * r;
        const spd = 0.25 + Math.random() * 0.7;
        const vx = Math.cos(a) * spd * (0.6 + Math.random() * 0.8);
        const vy = Math.sin(a) * spd * (0.6 + Math.random() * 0.8);
        const ttl = 55 + (Math.random() * 40) | 0;
        const scale = (1.0 + Math.random() * 1.4) * 0.5; // 50% smaller
        this.embers.push({ x: px, y: py, vx, vy, life: ttl, ttl, alpha: 1, scale });
      }
    }

    // Random white lightning arcs around the ship radius (very short-lived)
    if (this.active && this.health < this.maxHealth && (frameCount % 7 === 0)) {
      const missing = this.maxHealth - this.health;
      const chance = 0.12 + 0.05 * missing; // ~50% fewer occurrences
      if (Math.random() < Math.min(0.4, chance) && this.lightning.length < this.maxLightning) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 * this.radius * this.scale * (1.0 + Math.random() * 0.2); // 50% ring radius
        const cx = this.x + Math.cos(a) * r;
        const cy = this.y + Math.sin(a) * r;
        const points = [];
        const segs = 2 + ((Math.random() * 2) | 0); // fewer segments
        for (let i = 0; i < segs; i++) {
          const jitterR = 4 + Math.random() * 8; // shorter branches
          const jitterA = a + (Math.random() - 0.5) * 0.9;
          points.push([
            cx + Math.cos(jitterA) * jitterR,
            cy + Math.sin(jitterA) * jitterR,
          ]);
        }
        const ttl = 3 + ((Math.random() * 2) | 0); // shorter life
        this.lightning.push({ points, life: ttl, ttl });
      }
    }

    // Update sparks
    if (this.sparks.length) {
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.98;
        s.vy *= 0.98;
        s.life--;
        s.alpha = Math.max(0, s.life / 26);
        if (s.life <= 0 || !this.active) {
          this.sparks.splice(i, 1);
        }
      }
    }

    // Update embers
    if (this.embers.length) {
      for (let i = this.embers.length - 1; i >= 0; i--) {
        const e = this.embers[i];
        e.x += e.vx;
        e.y += e.vy;
        e.vx *= 0.995;
        e.vy *= 0.995;
        e.life--;
        e.alpha = Math.max(0, e.life / e.ttl);
        if (e.life <= 0 || !this.active) this.embers.splice(i, 1);
      }
    }

    // Update lightning
    if (this.lightning.length) {
      for (let i = this.lightning.length - 1; i >= 0; i--) {
        const l = this.lightning[i];
        l.life--;
        if (l.life <= 0 || !this.active) this.lightning.splice(i, 1);
      }
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

    // Neon hull and damage overlay via offscreen sprites
    if (this.hullSprite) {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.drawImage(
        this.hullSprite,
        -this.hullSprite.width / (2 * this.dpr),
        -this.hullSprite.height / (2 * this.dpr),
        this.hullSprite.width / this.dpr,
        this.hullSprite.height / this.dpr
      );
    }
    if (this.damageOverlaySprite) {
      // Fade overlay stronger when damaged
      const dmgRatio = 1 - (this.health / this.maxHealth);
      ctx.globalAlpha = 0.35 + 0.45 * dmgRatio + (this.damageFlash > 0 ? 0.2 : 0);
      ctx.drawImage(
        this.damageOverlaySprite,
        -this.damageOverlaySprite.width / (2 * this.dpr),
        -this.damageOverlaySprite.height / (2 * this.dpr),
        this.damageOverlaySprite.width / this.dpr,
        this.damageOverlaySprite.height / this.dpr
      );
      ctx.globalAlpha = 1;
    }

    // Distress beacon: blinking red light on the nose
    const blink = Math.floor(frameCount / 20) % 2 === 0;
    if (blink) {
      ctx.save();
      ctx.translate(15 * s, 0);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.shadowColor = '#f55';
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, 2.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

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

    // Temporary protective shield right after spawn
    if (this.spawnInvulnTimer > 0) {
      const t = this.spawnInvulnTimer / 120;
      const pulse = 1 + Math.sin(frameCount * 0.25) * 0.05;
      ctx.globalAlpha = 0.5 + 0.3 * t; // fades out over the 2s window
      ctx.strokeStyle = '#0ff';
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 1.5 * pulse, 0, Math.PI * 2);
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

    // Red outline glow flash on hit (inside local transform)
    if (this.outlineFlash > 0) {
      const a = Math.max(0, Math.min(1, this.outlineFlash / 10));
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      const r = this.radius * this.scale * 0.98;
      // Draw a couple of glowing rings for stronger effect
      for (let i = 0; i < 2; i++) {
        const t = 1 - i * 0.4;
        ctx.globalAlpha = 0.6 * a * t;
        ctx.strokeStyle = '#f44';
        ctx.shadowColor = '#f44';
        ctx.shadowBlur = 18 * t;
        ctx.lineWidth = 2 + 2 * t;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1 - i * 0.04), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = prevOp;
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Additive world-space particles: cyan embers, orange sparks, white lightning
    if (this.embers.length || this.sparks.length || this.lightning.length) {
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';

      // Cyan embers
      for (let i = 0; i < this.embers.length; i++) {
        const e = this.embers[i];
        const size = (this.emberSprite ? (this.emberSprite.width / this.dpr) : 10) * (0.9 + 0.1 * Math.sin((i + 0.3) * 1.7)) * e.scale;
        ctx.globalAlpha = 0.75 * e.alpha;
        if (this.emberSprite) {
          ctx.drawImage(this.emberSprite, e.x - size * 0.5, e.y - size * 0.5, size, size);
        } else {
          ctx.fillStyle = 'rgba(120,255,255,0.9)';
          ctx.shadowColor = '#7ff';
          ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.arc(e.x, e.y, size * 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Orange sparks (bigger/brighter)
      for (let i = 0; i < this.sparks.length; i++) {
        const sp = this.sparks[i];
        const size = (this.sparkSprite ? (this.sparkSprite.width / this.dpr) : 10) * sp.scale;
        ctx.globalAlpha = 0.9 * sp.alpha;
        if (this.sparkSprite) {
          ctx.drawImage(this.sparkSprite, sp.x - size * 0.5, sp.y - size * 0.5, size, size);
        } else {
          ctx.fillStyle = 'rgba(255,220,120,1.0)';
          ctx.shadowColor = '#ffd060';
          ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, size * 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // White lightning arcs
      if (this.lightning.length) {
        ctx.lineCap = 'round';
        for (let i = 0; i < this.lightning.length; i++) {
          const l = this.lightning[i];
          const a = Math.max(0, l.life / l.ttl);
          ctx.globalAlpha = 0.85 * a;
          ctx.strokeStyle = '#fff';
          ctx.shadowColor = '#ccf';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 1 + Math.max(0, 1.25 * a); // thinner
          ctx.beginPath();
          for (let p = 0; p < l.points.length; p++) {
            const [px, py] = l.points[p];
            if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      ctx.globalCompositeOperation = prevOp;
      ctx.globalAlpha = 1;
    }
  }

  // --- Sprite caching helpers ---
  createOffscreen(width, height) {
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = Math.ceil(width * this.dpr);
    c.height = Math.ceil(height * this.dpr);
    return c;
  }

  initSprites() {
    this.buildHullSprite();
    this.buildDamageOverlaySprite();
    this.buildSparkSprite();
    this.buildEmberSprite();
  }

  refreshIfDisplayChanged() {
    const curr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (curr !== this.dpr) {
      this.dpr = curr;
      this.initSprites();
    }
  }

  buildHullSprite() {
    const margin = 20;
    const w = (this.radius * this.scale * 2) + margin * 2;
    const c = this.createOffscreen(w, w);
    if (!c) { this.hullSprite = null; return; }
    const g = c.getContext('2d');
    g.save(); g.scale(this.dpr, this.dpr); g.translate(w / 2, w / 2);

    // Neon outline ship body (triangle + fins) in cyan
    const s = this.scale;
    const strokes = [
      { a: 1.0, blur: 16, width: 3, color: '#0ff' },
      { a: 0.55, blur: 10, width: 2, color: '#8ff' },
      { a: 1.0, blur: 0, width: 1.5, color: '#aff' },
    ];
    for (let i = 0; i < strokes.length; i++) {
      const st = strokes[i];
      g.globalAlpha = st.a;
      g.shadowBlur = st.blur; g.shadowColor = st.color;
      g.strokeStyle = st.color; g.lineWidth = st.width;
      g.beginPath();
      g.moveTo(15 * s, 0);
      g.lineTo(-10 * s, -10 * s * 0.95);
      g.lineTo(-5 * s, 0);
      g.lineTo(-10 * s, 10 * s);
      g.closePath();
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1; g.shadowBlur = 0;
    this.hullSprite = c;
  }

  buildDamageOverlaySprite() {
    const margin = 20;
    const w = (this.radius * this.scale * 2) + margin * 2;
    const c = this.createOffscreen(w, w);
    if (!c) { this.damageOverlaySprite = null; return; }
    const g = c.getContext('2d');
    g.save(); g.scale(this.dpr, this.dpr); g.translate(w / 2, w / 2);
    const s = this.scale;

    // Cracks and scorch marks
    g.globalAlpha = 0.9;
    g.strokeStyle = '#f66';
    g.lineWidth = 1;
    for (const cLine of this.cracks) {
      g.beginPath(); g.moveTo(cLine.x1 * s, cLine.y1 * s); g.lineTo(cLine.x2 * s, cLine.y2 * s); g.stroke();
    }
    // Scorch blobs
    g.globalAlpha = 0.25; g.fillStyle = 'rgba(255,100,100,0.5)';
    for (let i = 0; i < 3; i++) {
      const ax = (-6 + Math.random() * 12) * s;
      const ay = (-6 + Math.random() * 12) * s;
      g.beginPath(); g.arc(ax, ay, (2.5 + Math.random() * 3) * s, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    this.damageOverlaySprite = c;
  }

  buildSparkSprite() {
    const size = 22;
    const c = this.createOffscreen(size, size);
    if (!c) { this.sparkSprite = null; return; }
    const g = c.getContext('2d');
    g.save(); g.scale(this.dpr, this.dpr); g.translate(size / 2, size / 2);
    // Outer warm glow
    g.shadowBlur = 14; g.shadowColor = '#ffd060';
    g.fillStyle = 'rgba(255,220,120,0.95)';
    g.beginPath(); g.arc(0, 0, 5.2, 0, Math.PI * 2); g.fill();
    // Inner hot core
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(0, 0, 2.1, 0, Math.PI * 2); g.fill();
    g.restore();
    this.sparkSprite = c;
  }

  buildEmberSprite() {
    const size = 20;
    const c = this.createOffscreen(size, size);
    if (!c) { this.emberSprite = null; return; }
    const g = c.getContext('2d');
    g.save(); g.scale(this.dpr, this.dpr); g.translate(size / 2, size / 2);
    // Outer cyan glow
    g.shadowBlur = 14; g.shadowColor = '#7ff';
    g.fillStyle = 'rgba(120,255,255,0.9)';
    g.beginPath(); g.arc(0, 0, 4.6, 0, Math.PI * 2); g.fill();
    // Inner core
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(200,255,255,0.95)';
    g.beginPath(); g.arc(0, 0, 1.9, 0, Math.PI * 2); g.fill();
    g.restore();
    this.emberSprite = c;
  }
}
