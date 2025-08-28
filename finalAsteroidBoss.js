// FinalAsteroidBoss (Level 15)
// Giant armored asteroid with 5-layer shell, core, and 4 shield batteries at screen corners.
// Batteries fire lasers every ~4s (charge then fire) at captured player position. Shell is invulnerable
// until all batteries are destroyed. Core is invulnerable until shell is destroyed. Core pulses a
// shockwave every 5s. On spawn, a shockwave pushes the player back and boss is invulnerable for 2s.
// Core takes 10 hits; shell takes 5 hits after shields are down.
//
// Deps expected (injected from ast.html):
// {
//   canvas, ctx,
//   player,
//   bullets, enemyBullets, asteroids, powerups, drones,
//   EnemyBullet, Asteroid, Powerup, Drone,
//   createExplosion, awardPoints, lineCircleCollision,
//   setShake: (frames, intensity) => void,
//   onPlayerHit: () => void,
//   getFrameCount: () => number,
//   applyShockwave: (x, y, radius, strength) => void,
//   showHUDMessage?: (text, frames) => void,
// }

export class FinalAsteroidBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;

    // Position centered
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;

    // Geometry
    this.shellRadius = 180; // ~3x largest normal asteroid radius (60)
    this.coreRadius = 60;   // core roughly size of largest asteroid

    // Health / state
    this.shellHits = 12;     // increased by ~35% (from 5)
    this.coreHealth = 15;   // 10 hits
    this.defeated = false;

    // Invulnerability
    this.spawnInvuln = 120; // 2s after spawn

    // Rotations (opposing directions)
    this.shellAngle = 0;
    this.coreAngle = 0;
    this.shellRotateSpeed = 0.0022;
    this.coreRotateSpeed = -0.003;

    // Core pushback pulses
    this.pulseCooldown = 300; // every 5s
    this.pulses = []; // visual expanding rings {age, life, maxRadius, color}

    // Shell invulnerability hit pulse visual timer
    this.shellInvulnPulse = 0; // frames remaining for quick red pulse when deflecting bullets

    // Batteries in corners
    const margin = 80;
    this.batteries = [
      { x: margin, y: margin },
      { x: canvas.width - margin, y: margin },
      { x: margin, y: canvas.height - margin },
      { x: canvas.width - margin, y: canvas.height - margin }
    ].map(p => ({
      x: p.x, y: p.y,
      hits: 4,            // 3 armor + final
      radius: 28,
      pulse: Math.random() * Math.PI * 2,
      hitFlash: 0,
      chargeTimer: 0,
      fireTimer: 0,
      aimX: 0, aimY: 0,
    }));

    // Laser cadence
    this.batteryLaserCooldown = 156; // 35% faster than 240 (~every 2.6s)

    // Spawn time
    this.spawnTime = getFrameCount ? getFrameCount() : 0;

    // AttackDrone spawn cadence (every ~3s)
    this.attackDroneCooldown = 180;
    // Core-phase normal Drone spawner (every ~2s when core is vulnerable)
    this.coreDroneCooldown = 120;

    // Pre-render heavy visuals to offscreen sprites for performance
    this.initSprites();

    // Track display metrics for auto-rebuild/reposition on changes
    this._lastCanvasW = canvas.width;
    this._lastCanvasH = canvas.height;
    this._lastDpr = this.dpr;
  }

  isDefeated() { return this.defeated; }

  anyBatteriesAlive() { return this.batteries.some(b => b.hits > 0); }

  update() {
    const { player, lineCircleCollision, onPlayerHit, applyShockwave, createExplosion, drones, Drone, AttackDrone, getFrameCount } = this.deps;

    // Timers
    if (this.spawnInvuln > 0) this.spawnInvuln--;

    // Rotation: shell rotates slowly clockwise while shields up; stop when shell becomes vulnerable
    if (this.anyBatteriesAlive()) {
      this.shellAngle += this.shellRotateSpeed;
    }
    this.coreAngle += this.coreRotateSpeed;

    // Animate batteries
    for (let b of this.batteries) {
      b.pulse += 0.1;
      if (b.hitFlash > 0) b.hitFlash--;
    }

    // Core pushback pulse
    if (this.pulseCooldown > 0) this.pulseCooldown--;
    if (this.pulseCooldown === 0) {
      const radius = 440; // large shockwave
      const strength = 10.5;
      if (applyShockwave) applyShockwave(this.x, this.y, radius, strength);
      if (createExplosion) createExplosion(this.x, this.y, 140, '#ff8888');
      if (this.deps.setShake) this.deps.setShake(14, 6);
      this.pulses.push({ age: 0, life: 36, maxRadius: radius, color: '#ff7777' });
      this.pulseCooldown = 300;
    }

    // Battery laser selection and lifecycle
    const anyActive = this.batteries.some(b => (b.hits > 0) && (b.chargeTimer > 0 || b.fireTimer > 0));
    if (!anyActive && this.batteryLaserCooldown > 0) this.batteryLaserCooldown--;
    if (!anyActive && this.batteryLaserCooldown === 0) {
      const candidates = this.batteries.filter(b => b.hits > 0);
      if (candidates.length > 0) {
        const b = candidates[(Math.random() * candidates.length) | 0];
        b.chargeTimer = 90; // 1.5s charge
        b.fireTimer = 0;
        b.aimX = player.x; b.aimY = player.y; // capture
      }
      this.batteryLaserCooldown = 156; // schedule next (35% faster than 240)
    }

    // Progress battery charge/fire and apply damage when firing
    for (let b of this.batteries) {
      if (b.hits <= 0) continue;
      if (b.chargeTimer > 0) {
        b.chargeTimer--;
        if (b.chargeTimer === 0) {
          b.fireTimer = 45; // ~0.75s
        }
      } else if (b.fireTimer > 0) {
        b.fireTimer--;
        const ang = Math.atan2(b.aimY - b.y, b.aimX - b.x);
        const x2 = b.x + Math.cos(ang) * 2400;
        const y2 = b.y + Math.sin(ang) * 2400;
        if (lineCircleCollision(b.x, b.y, x2, y2, player.x, player.y, player.radius)) {
          onPlayerHit && onPlayerHit();
        }
      }
    }

    // Update pulse visuals
    if (this.pulses.length) {
      for (let i = this.pulses.length - 1; i >= 0; i--) {
        const p = this.pulses[i];
        p.age++;
        if (p.age >= p.life) this.pulses.splice(i, 1);
      }
    }

    // Periodic AttackDrone spawner (every 3s), cap 5 alive, spawn from core location
    if (AttackDrone && drones) {
      if (this.attackDroneCooldown > 0) this.attackDroneCooldown--;
      if (this.attackDroneCooldown === 0) {
        const aliveAttack = drones.filter(d => (d instanceof AttackDrone) && !d.dead).length;
        if (aliveAttack < 5) {
          const baseAng = Math.atan2(player.y - this.y, player.x - this.x);
          const a = baseAng + (Math.random() - 0.5) * 0.25;
          const sx = this.x;
          const sy = this.y;
          const ad = new AttackDrone(sx, sy);
          const sp = ad.maxSpeed * 1.25;
          ad.vx = Math.cos(a) * sp;
          ad.vy = Math.sin(a) * sp;
          drones.push(ad);
          this.attackDroneCooldown = 180;
        } else {
          // try again sooner when capped
          this.attackDroneCooldown = 60;
        }
      }
    }

    // Core-phase Drone spawner: when core is vulnerable (shell destroyed), spawn a normal Drone every 2s, cap 5 alive
    if (Drone && drones && this.shellHits <= 0) {
      if (this.coreDroneCooldown > 0) this.coreDroneCooldown--;
      if (this.coreDroneCooldown === 0) {
        const aliveNormal = drones.filter(d => !(d instanceof AttackDrone) && !d.dead).length;
        if (aliveNormal < 5) {
          const baseAng = Math.atan2(player.y - this.y, player.x - this.x);
          const a = baseAng + (Math.random() - 0.5) * 0.25;
          const dx = Math.cos(a) * (this.coreRadius * 0.5);
          const dy = Math.sin(a) * (this.coreRadius * 0.5);
          const d = new Drone(this.x + dx, this.y + dy);
          d.vx = Math.cos(a) * d.maxSpeed;
          d.vy = Math.sin(a) * d.maxSpeed;
          drones.push(d);
        }
        this.coreDroneCooldown = 120;
      }
    }

    // Decay shell invulnerability red pulse
    if (this.shellInvulnPulse > 0) this.shellInvulnPulse--;

    // Player collision with alive batteries damages player
    if (player && typeof onPlayerHit === 'function') {
      for (let b of this.batteries) {
        if (b.hits <= 0) continue;
        const dx = player.x - b.x, dy = player.y - b.y;
        if (Math.hypot(dx, dy) < (player.radius + b.radius)) {
          onPlayerHit();
          break;
        }
      }
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    const t = getFrameCount ? getFrameCount() : 0;

    // Rebuild sprites or reposition if DPR or canvas size changed
    this.refreshIfDisplayChanged();

    // Batteries first (behind boss body for depth) - use pre-rendered sprites
    for (let b of this.batteries) {
      if (b.hits <= 0) continue;
      const sprite = this.batterySprites[b.hits];
      if (sprite) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.drawImage(sprite, -sprite.width / (2 * this.dpr), -sprite.height / (2 * this.dpr), sprite.width / this.dpr, sprite.height / this.dpr);
        ctx.restore();
      }
      // Lightweight hit flash overlay
      if (b.hitFlash > 0) {
        const flash = b.hitFlash / 8;
        ctx.globalAlpha = Math.min(1, flash);
        ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius - 2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Charging indicator (kept dynamic)
      if (b.chargeTimer > 0) {
        const prog = 1 - (b.chargeTimer / 90);
        ctx.globalAlpha = 0.9; ctx.shadowBlur = 12; ctx.shadowColor = '#ff0';
        ctx.strokeStyle = '#ff0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius + 10 + Math.sin(prog * Math.PI) * 4, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      // Firing beam (kept dynamic)
      if (b.fireTimer > 0) {
        const ang = Math.atan2(b.aimY - b.y, b.aimX - b.x);
        const x2 = b.x + Math.cos(ang) * 2400;
        const y2 = b.y + Math.sin(ang) * 2400;
        const flicker = 0.75 + Math.random() * 0.25;
        ctx.globalAlpha = flicker; ctx.shadowBlur = 12 * flicker; ctx.shadowColor = '#f09';
        ctx.strokeStyle = 'rgba(255,0,128,1)'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
        // inner core
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
    }

    // Boss body shell (use pre-rendered sprite for current state and hits)
    const shieldsUp = this.anyBatteriesAlive();
    if (this.shellHits > 0) {
      const key = shieldsUp ? 'up' : 'down';
      // Rebuild sprites if current hits variant is missing (e.g., after tuning max hits)
      if (!this.shellSprites || !this.shellSprites[key] || !this.shellSprites[key][this.shellHits]) {
        this.initSprites();
      }
      const sprite = this.shellSprites[key][this.shellHits];
      if (sprite) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.shellAngle);
        ctx.drawImage(sprite, -sprite.width / (2 * this.dpr), -sprite.height / (2 * this.dpr), sprite.width / this.dpr, sprite.height / this.dpr);
        // Red pulse overlay when invulnerable shell was just hit (deflection feedback)
        if (this.shellInvulnPulse > 0) {
          const a = Math.min(1, this.shellInvulnPulse / 6);
          ctx.globalAlpha = 0.25 + a * 0.5;
          ctx.shadowBlur = 18; ctx.shadowColor = '#f55';
          ctx.strokeStyle = '#f55'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, this.shellRadius + 2, 0, Math.PI * 2); ctx.stroke();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
    }

    // Core: draw pre-rendered base sprite, keep inner pulse dynamic
    const glowPhase = (Math.sin(t * 0.2) * 0.5 + 0.5);
    if (this.coreSprite) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.coreAngle);
      ctx.drawImage(this.coreSprite, -this.coreSprite.width / (2 * this.dpr), -this.coreSprite.height / (2 * this.dpr), this.coreSprite.width / this.dpr, this.coreSprite.height / this.dpr);
      // Inner hot pulse overlay (dynamic)
      ctx.globalAlpha = 0.2 + glowPhase * 0.22; ctx.shadowBlur = 24 + glowPhase * 20; ctx.fillStyle = 'rgba(255,80,80,0.65)';
      ctx.beginPath(); ctx.arc(0, 0, 12 + glowPhase * 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Draw active pulse rings
    if (this.pulses && this.pulses.length) {
      for (const p of this.pulses) {
        const prog = p.age / p.life;
        const r = Math.max(this.coreRadius + 24, prog * p.maxRadius);
        const alpha = Math.max(0, 0.55 * (1 - prog));
        ctx.globalAlpha = alpha; ctx.shadowBlur = 20 * (1 - prog);
        ctx.shadowColor = p.color || '#ffdd55'; ctx.strokeStyle = p.color || '#ffdd55';
        ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Nothing else to restore here
  }

  // --- Sprite pre-render helpers ---
  initSprites() {
    // Device pixel ratio for crisp sprites
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    this.shellSprites = { up: {}, down: {} };
    this.batterySprites = {};
    this.coreSprite = null;

    this.buildShellSprites();
    this.buildBatterySprites();
    this.buildCoreSprite();
  }

  // Detect display changes and rebuild sprites / reposition accordingly
  refreshIfDisplayChanged() {
    const { canvas } = this.deps || {};
    const currDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (currDpr !== this.dpr) {
      this.dpr = currDpr;
      this.initSprites();
      this._lastDpr = currDpr;
    }
    if (canvas && (canvas.width !== this._lastCanvasW || canvas.height !== this._lastCanvasH)) {
      this._lastCanvasW = canvas.width;
      this._lastCanvasH = canvas.height;
      this.onCanvasResize();
    }
  }

  // Handle canvas size changes: recenter boss and re-anchor batteries to corners
  onCanvasResize() {
    const { canvas } = this.deps;
    if (!canvas) return;
    // Re-center boss
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    // Re-anchor batteries to corners using same margin
    const margin = 80;
    if (this.batteries && this.batteries.length === 4) {
      this.batteries[0].x = margin;               this.batteries[0].y = margin;
      this.batteries[1].x = canvas.width - margin; this.batteries[1].y = margin;
      this.batteries[2].x = margin;               this.batteries[2].y = canvas.height - margin;
      this.batteries[3].x = canvas.width - margin; this.batteries[3].y = canvas.height - margin;
    }
  }

  createOffscreen(width, height) {
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = Math.ceil(width * this.dpr);
    c.height = Math.ceil(height * this.dpr);
    return c;
  }

  buildShellSprites() {
    // Build sprites for shell hits 1..5 for both shieldsUp and shieldsDown appearances
    const maxHits = Math.max(5, this.shellHits || 5);
    for (const state of ['up', 'down']) {
      const shellColor = state === 'up' ? '#f55' : '#f0f';
      for (let hits = 1; hits <= maxHits; hits++) {
        const margin = 28;
        const size = (this.shellRadius * 2) + margin * 2;
        const canvas = this.createOffscreen(size, size);
        if (!canvas) continue;
        const sctx = canvas.getContext('2d');
        sctx.save();
        sctx.scale(this.dpr, this.dpr);
        sctx.translate(size / 2, size / 2);
        // Draw rings with segmented arcs at base angle 0; will rotate when drawing
        for (let i = 0; i < hits; i++) {
          const r = this.shellRadius - i * 10;
          const alpha = state === 'up' ? (0.75 - i * 0.08) : (0.6 - i * 0.06);
          sctx.globalAlpha = Math.max(0.15, alpha);
          sctx.shadowBlur = state === 'up' ? 18 - i * 3 : 12 - i * 2;
          sctx.shadowColor = shellColor; sctx.strokeStyle = shellColor; sctx.lineWidth = (i === 0 ? 3 : 1.6);
          const segs = 14; const span = Math.PI * 2 / segs;
          for (let k = 0; k < segs; k += 2) {
            const a0 = k * span;
            sctx.beginPath(); sctx.arc(0, 0, r, a0, a0 + span * 0.8); sctx.stroke();
          }
        }
        sctx.restore();
        sctx.globalAlpha = 1; sctx.shadowBlur = 0;
        this.shellSprites[state][hits] = canvas;
      }
    }
  }

  buildBatterySprites() {
    // Build sprites for battery base and armor rings for hits=1..4
    for (let hits = 1; hits <= 4; hits++) {
      const margin = 24;
      const radius = 28;
      const size = (radius * 2) + margin * 2;
      const canvas = this.createOffscreen(size, size);
      if (!canvas) continue;
      const sctx = canvas.getContext('2d');
      sctx.save(); sctx.scale(this.dpr, this.dpr); sctx.translate(size / 2, size / 2);
      const baseColor = '#f66';
      // Glow rings (static base)
      for (let k = 2; k >= 0; k--) {
        sctx.globalAlpha = k === 0 ? 1 : 0.65;
        sctx.shadowBlur = 14 - k * 4;
        sctx.shadowColor = baseColor;
        sctx.strokeStyle = baseColor;
        sctx.lineWidth = k === 0 ? 2.5 : 1.2;
        sctx.beginPath(); sctx.arc(0, 0, radius - k * 3, 0, Math.PI * 2); sctx.stroke();
      }
      // Armor rings for remaining hits (up to 3 armor + final state)
      sctx.globalAlpha = 0.95; sctx.shadowBlur = 0; sctx.lineWidth = 1; sctx.strokeStyle = '#fff';
      const armorRings = Math.min(3, Math.max(0, hits - 1));
      for (let h = 0; h < armorRings; h++) {
        sctx.beginPath(); sctx.arc(0, 0, radius - 8 - h * 4, 0, Math.PI * 2); sctx.stroke();
      }
      sctx.restore(); sctx.globalAlpha = 1; sctx.shadowBlur = 0;
      this.batterySprites[hits] = canvas;
    }
  }

  buildCoreSprite() {
    const margin = 24;
    const size = (this.coreRadius * 2) + margin * 2;
    const canvas = this.createOffscreen(size, size);
    if (!canvas) return;
    const sctx = canvas.getContext('2d');
    sctx.save(); sctx.scale(this.dpr, this.dpr); sctx.translate(size / 2, size / 2);
    sctx.shadowColor = '#f55'; sctx.shadowBlur = 20;
    // Hot red core disc
    sctx.fillStyle = '#b00';
    sctx.beginPath(); sctx.arc(0, 0, this.coreRadius * 0.7, 0, Math.PI * 2); sctx.fill();
    // Pale outline
    sctx.lineWidth = 4; sctx.strokeStyle = '#ffb3b3'; sctx.beginPath(); sctx.arc(0, 0, this.coreRadius * 0.72, 0, Math.PI * 2); sctx.stroke();
    sctx.restore(); sctx.shadowBlur = 0; sctx.globalAlpha = 1;
    this.coreSprite = canvas;
  }

  // Collisions: bullets
  handleBulletCollision(bullet) {
    const { createExplosion, drones, Drone, showHUDMessage, getFrameCount } = this.deps;

    // Batteries first (allow sniping batteries)
    for (let b of this.batteries) {
      if (b.hits <= 0) continue;
      const dx = bullet.x - b.x, dy = bullet.y - b.y;
      if (Math.hypot(dx, dy) < b.radius + bullet.radius) {
        // Ignore damage in initial 2s spawn invuln
        if (this.spawnInvuln > 0) return true;
        b.hits--; b.hitFlash = 8;
        if (b.hits > 0 && createExplosion) {
          createExplosion(b.x, b.y, 3, '#f66', 'micro');
        }
        if (b.hits <= 0) {
          createExplosion && createExplosion(b.x, b.y, 70, '#f88');
          // cancel any active charge/fire
          b.chargeTimer = 0; b.fireTimer = 0;
          // spawn a hostile drone
          if (drones && Drone) {
            const d = new Drone(b.x, b.y);
            drones.push(d);
          }
          // If that was the last battery, announce
          if (!this.anyBatteriesAlive()) {
            showHUDMessage && showHUDMessage('SHIELDS DOWN!', 180);
          }
        }
        return true;
      }
    }

    // Shell next (only if all batteries are down)
    if (!this.anyBatteriesAlive() && this.shellHits > 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.shellRadius + bullet.radius) {
        if (this.spawnInvuln > 0) {
          // Deflect during spawn invulnerability instead of consuming the bullet
          const dist = Math.hypot(dx, dy) || 1;
          const nx = dx / dist, ny = dy / dist;
          const vdotn = bullet.vx * nx + bullet.vy * ny;
          bullet.vx = bullet.vx - 2 * vdotn * nx;
          bullet.vy = bullet.vy - 2 * vdotn * ny;
          const R = this.shellRadius + bullet.radius;
          bullet.x = this.x + nx * (R + 0.5);
          bullet.y = this.y + ny * (R + 0.5);
          this.shellInvulnPulse = 8;
          this.deps.setShake && this.deps.setShake(4, 2);
          return false;
        }
        this.shellHits--;
        createExplosion && createExplosion(this.x, this.y, 90, '#faa');
        if (this.shellHits <= 0) {
          // Small flash cue
          createExplosion && createExplosion(this.x, this.y, 110, '#ffea00');
          if (this.deps.setShake) this.deps.setShake(14, 6);
          this.deps.showHUDMessage && this.deps.showHUDMessage('CORE EXPOSED!', 180);
        }
        return true;
      }
    }

    // Core last
    if (this.shellHits <= 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + bullet.radius) {
        if (this.spawnInvuln > 0) return true;
        this.coreHealth--;
        createExplosion && createExplosion(this.x, this.y, 100, '#faa');
        if (this.coreHealth <= 0) this.onDefeated();
        return true;
      }
    }

    // While shell is invulnerable (shields up) OR during initial spawn invuln, deflect bullets on shell contact and show red pulse
    if ((this.anyBatteriesAlive() || this.spawnInvuln > 0) && this.shellHits > 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      const dist = Math.hypot(dx, dy);
      const R = this.shellRadius + bullet.radius;
      if (dist < R) {
        // Normal vector from center to bullet
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        // Reflect velocity: v' = v - 2*(v·n)*n
        const vdotn = bullet.vx * nx + bullet.vy * ny;
        bullet.vx = bullet.vx - 2 * vdotn * nx;
        bullet.vy = bullet.vy - 2 * vdotn * ny;
        // Nudge bullet to surface to avoid re-collision in same frame
        const eps = 0.5;
        bullet.x = this.x + nx * (R + eps);
        bullet.y = this.y + ny * (R + eps);
        // Quick red pulse
        this.shellInvulnPulse = 8;
        // Optional small shake for feedback
        this.deps.setShake && this.deps.setShake(4, 2);
        // Do NOT consume the bullet (return false) so it continues after deflection
        return false;
      }
    }

    return false;
  }

  // Particle (bomb/flak) damage area interaction
  handleParticleDamage(particle) {
    const { createExplosion } = this.deps;
    let hit = false;
    for (let b of this.batteries) {
      if (b.hits <= 0) continue;
      const dx = particle.x - b.x, dy = particle.y - b.y;
      if (Math.hypot(dx, dy) < b.radius + 12) {
        if (this.spawnInvuln <= 0) {
          b.hits--; b.hitFlash = 8; hit = true;
          if (b.hits > 0 && createExplosion) {
            createExplosion(b.x, b.y, 3, '#f66', 'micro');
          }
          if (b.hits <= 0) { createExplosion && createExplosion(b.x, b.y, 70, '#f88'); b.chargeTimer = 0; b.fireTimer = 0; }
        } else { hit = true; }
        break;
      }
    }
    if (!hit && !this.anyBatteriesAlive() && this.shellHits > 0) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.hypot(dx, dy) < this.shellRadius + 12) {
        if (this.spawnInvuln <= 0) {
          this.shellHits = Math.max(0, this.shellHits - 1);
          if (this.shellHits === 0) { this.deps.showHUDMessage && this.deps.showHUDMessage('CORE EXPOSED!', 180); }
        }
      }
    }
    if (!hit && this.shellHits <= 0) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + 12) {
        if (this.spawnInvuln <= 0) {
          this.coreHealth = Math.max(0, this.coreHealth - 1);
          if (this.coreHealth === 0) this.onDefeated();
        }
      }
    }
  }

  // Player laser line damage
  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion } = this.deps;
    let any = false;
    for (let b of this.batteries) {
      if (b.hits > 0 && lineCircleCollision(x1, y1, x2, y2, b.x, b.y, b.radius)) {
        any = true;
        if (this.spawnInvuln <= 0) {
          b.hits--; b.hitFlash = 8;
          if (b.hits > 0 && createExplosion) {
            createExplosion(b.x, b.y, 3, '#f66', 'micro');
          }
          if (b.hits <= 0) { createExplosion && createExplosion(b.x, b.y, 70, '#f88'); b.chargeTimer = 0; b.fireTimer = 0; }
        }
      }
    }
    if (!this.anyBatteriesAlive() && this.shellHits > 0 && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.shellRadius)) {
      any = true;
      if (this.spawnInvuln <= 0) {
        this.shellHits = Math.max(0, this.shellHits - 2);
        if (this.shellHits === 0) { this.deps.showHUDMessage && this.deps.showHUDMessage('CORE EXPOSED!', 180); }
      }
    }
    if (this.shellHits <= 0 && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      any = true;
      if (this.spawnInvuln <= 0) {
        this.coreHealth = Math.max(0, this.coreHealth - 2);
        createExplosion && createExplosion(this.x, this.y, 100, '#faa');
        if (this.coreHealth === 0) this.onDefeated();
      }
    }
    return any;
  }

  // Collision with circle (player or asteroids)
  collidesWithCircle(cx, cy, cr) {
    const R = (this.shellHits > 0) ? this.shellRadius : this.coreRadius;
    const dx = cx - this.x, dy = cy - this.y;
    return Math.hypot(dx, dy) < cr + R;
  }

  onDefeated() {
    if (this.defeated) return;
    const { createExplosion, powerups, Powerup, enemyBullets, drones, setShake, awardPoints } = this.deps;
    this.defeated = true;
    createExplosion && createExplosion(this.x, this.y, this.shellRadius * 3, '#ffaaaa');
    setShake && setShake(28, 10);
    awardPoints && awardPoints(1200, this.x, this.y, true);
    if (enemyBullets) enemyBullets.length = 0;
    if (drones) drones.length = 0;
    // celebratory drops
    if (powerups && Powerup) {
      const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone'];
      const drops = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < drops; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 80;
        const dx = this.x + Math.cos(ang) * dist;
        const dy = this.y + Math.sin(ang) * dist;
        const type = types[(Math.random() * types.length) | 0];
        if (powerups.length < 4) powerups.push(new Powerup(dx, dy, type));
      }
    }
  }
}
