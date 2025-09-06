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
    // Core scaling state (grows 10% per vulnerable hit)
    this.baseCoreRadius = this.coreRadius;
    this.maxCoreRadius = this.baseCoreRadius * 1.8; // clamp to prevent excessive growth
    this.coreScaleCooldown = 0; // frames until next allowed scale-up (throttle for continuous damage like lasers)

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
      // Top-left, Top-right moved down by 150px; Bottom-left, Bottom-right moved up by 150px
      { x: margin, y: margin + 65 },
      { x: canvas.width - margin, y: margin + 65 },
      { x: margin, y: canvas.height - margin - 65 },
      { x: canvas.width - margin, y: canvas.height - margin - 65 }
    ].map(p => ({
      x: p.x, y: p.y,
      hits: 5,            // 4 armor + final
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

    // Laser ember particles (pink glow) for battery beams
    this.laserEmbers = [];
    this.laserEmberSprite = null;
    this.buildLaserEmberSprite();

    // Core ember particles (red glow) similar to Colossus core effect
    this.coreEmbers = [];
    this.coreSparkSprite = null;
    this.buildCoreSparkSprite();

    // Core vulnerable shard-burst state
    this.coreVulnerable = false; // becomes true when shell is destroyed
    this.coreShardCooldown = 0;  // frames until next burst

    // Colossus-style rotating slam attack
    this.slamWarningTimer = 0;
    this.slamActiveTimer = 0;
    this.slamAngle = 0; // radians
    this.slamArc = Math.PI / 4; // 45° arc
    this.slamCooldown = 180; // frames between slams before telegraph
    this.slamBandHalfWidth = 75; // thickness of slam arc hit band
    this.slamBaseOffset = 60; // distance outside outer shell for slam ring (before scaling)
    this.slamDistanceScale = 0.6; // multiplied by 1.5 per destroyed battery
    this._prevAliveBatteries = this.batteries ? this.batteries.length : 0;

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
    if (this.coreScaleCooldown > 0) this.coreScaleCooldown--;

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

        // Spawn a few pink glowing embers flying off the beam (performance-capped)
        for (let i = 0; i < 2; i++) {
          const t = Math.random() * 0.9 + 0.1; // avoid battery origin
          const sx = b.x + (x2 - b.x) * t;
          const sy = b.y + (y2 - b.y) * t;
          // Mostly perpendicular to beam, slight forward drift
          const npx = -Math.sin(ang);
          const npy = Math.cos(ang);
          const perp = (Math.random() - 0.5) * 1.6; // spread
          const forward = 0.35 + Math.random() * 0.45;
          const spd = 1.2 + Math.random() * 1.6;
          const vx = (npx * perp + Math.cos(ang) * forward) * spd;
          const vy = (npy * perp + Math.sin(ang) * forward) * spd;
          const life = 22 + (Math.random() * 16) | 0;
          const size = 0.8 + Math.random() * 0.8;
          this.laserEmbers.push({ x: sx, y: sy, vx, vy, life, maxLife: life, size });
        }
      }
    }

    // Update and cull embers
    if (this.laserEmbers.length) {
      const { canvas } = this.deps;
      const pad = 24;
      for (let i = this.laserEmbers.length - 1; i >= 0; i--) {
        const e = this.laserEmbers[i];
        e.x += e.vx;
        e.y += e.vy;
        e.life--;
        // Gentle outward acceleration for airy feel
        e.vx *= 0.99; e.vy *= 0.99;
        // Culling
        if (
          e.life <= 0 ||
          !canvas || e.x < -pad || e.y < -pad || e.x > (canvas.width + pad) || e.y > (canvas.height + pad)
        ) {
          this.laserEmbers.splice(i, 1);
        }
      }
      // Soft cap to avoid runaway
      if (this.laserEmbers.length > 400) this.laserEmbers.length = 400;
    }

    // Emit small red core embers from center (always), larger when shell is destroyed
    {
      const exposed = (this.shellHits <= 0);
      const emitCount = exposed ? 2 : (Math.random() < 0.6 ? 1 : 0);
      for (let i = 0; i < emitCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (0.8 + Math.random() * 1.2) * (exposed ? 1.35 : 1.0);
        const vx = Math.cos(ang) * spd;
        const vy = Math.sin(ang) * spd;
        const life = 20 + (Math.random() * 16) | 0;
        const scale = (0.45 + Math.random() * 0.5) * (exposed ? 1.5 : 1.0);
        const alpha = 0.9;
        this.coreEmbers.push({ x: this.x, y: this.y, vx, vy, life, alpha, scale });
      }
    }
    // Update core embers and cull
    if (this.coreEmbers.length) {
      const { canvas } = this.deps;
      for (let i = this.coreEmbers.length - 1; i >= 0; i--) {
        const em = this.coreEmbers[i];
        em.x += em.vx; em.y += em.vy;
        em.vx *= 0.98; em.vy *= 0.98;
        em.life--; em.alpha *= 0.96;
        if (!canvas || em.life <= 0 || em.alpha <= 0.03 || em.x < -24 || em.y < -24 || em.x > canvas.width + 24 || em.y > canvas.height + 24) {
          this.coreEmbers.splice(i, 1);
        }
      }
      // Soft cap
      if (this.coreEmbers.length > 240) this.coreEmbers.length = 240;
    }

    // Core shard-burst attack when core is vulnerable (shell destroyed): 15 red shards every 3s
    if (this.shellHits <= 0) {
      if (!this.coreVulnerable) {
        // Just became vulnerable: immediate burst
        this.coreVulnerable = true;
        this.coreShardCooldown = 0;
      }
      if (this.coreShardCooldown > 0) this.coreShardCooldown--;
      if (this.coreHealth > 0 && this.coreShardCooldown === 0) {
        this.spawnCoreShardBurst();
        this.coreShardCooldown = 180; // 3 seconds at 60 FPS
      }
    } else {
      // Reset if shell restored (safety)
      this.coreVulnerable = false;
      this.coreShardCooldown = 0;
    }

    // Adjust slam ring distance as batteries are destroyed (each -50% alive => +50% distance)
    {
      const alive = this.batteries ? this.batteries.filter(b => b.hits > 0).length : 0;
      if (this._prevAliveBatteries == null) this._prevAliveBatteries = alive;
      if (alive < this._prevAliveBatteries) {
        const delta = this._prevAliveBatteries - alive;
        for (let i = 0; i < delta; i++) this.slamDistanceScale *= 1.5; // +50% per battery
        this._prevAliveBatteries = alive;
      }
    }

    // Rotating slam: telegraph then strike (similar to Colossus)
    if (this.slamActiveTimer > 0) {
      this.slamActiveTimer--;
      // Damage if player in arc band
      const { player, onPlayerHit } = this.deps;
      if (player && typeof onPlayerHit === 'function') {
        const dx = player.x - this.x, dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx);
        const delta = Math.atan2(Math.sin(ang - this.slamAngle), Math.cos(ang - this.slamAngle));
        const r = this.getSlamRadius();
        const inArc = Math.abs(delta) < this.slamArc * 0.5;
        const band = Math.abs(dist - r) < this.slamBandHalfWidth; // width of the slam band
        if (inArc && band) {
          const okInvuln = (player.invulnerable === 0 || player.invulnerable === undefined);
          const okShield = (player.shielded === 0 || player.shielded === undefined);
          const okInvis = (player.invisible === 0 || player.invisible === undefined);
          if (okInvuln && okShield && okInvis) onPlayerHit();
        }
      }
    } else if (this.slamWarningTimer > 0) {
      this.slamWarningTimer--;
      if (this.slamWarningTimer === 0) {
        // Activate slam for a short burst
        this.slamActiveTimer = 24;
        if (this.deps.setShake) this.deps.setShake(10, 4);
      }
    } else {
      // Cooldown
      if (this.slamCooldown > 0) this.slamCooldown--;
      if (this.slamCooldown === 0) {
        // Choose new arc angle and telegraph
        this.slamAngle = Math.random() * Math.PI * 2;
        this.slamWarningTimer = 36; // wind-up
        this.slamCooldown = 240; // reset
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

    // Periodic AttackDrone spawner (every ~3s), cap 5 alive, spawn from core location
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
    // Collect active beams to render after boss body so they appear on top
    const activeBeams = [];

    // Rebuild sprites or reposition if DPR or canvas size changed
    this.refreshIfDisplayChanged();
    const shieldsUp = this.anyBatteriesAlive();

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
      // Red-hot core indicator: always present, doubles during charge to show which battery will fire
      {
        const baseR = Math.max(4, b.radius * 0.18);
        const r = (b.chargeTimer > 0) ? baseR * 2 : baseR;
        const pulse = 0.6 + Math.sin(t * 0.2 + b.pulse) * 0.1; // subtle flicker
        ctx.save();
        ctx.globalAlpha = 0.9 * pulse;
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#f33';
        ctx.fillStyle = '#f44';
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
        // inner white-hot point for intensity
        ctx.globalAlpha = 0.8 * pulse;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#fff';
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(1.5, r * 0.35), 0, Math.PI * 2); ctx.fill();
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
        activeBeams.push({ x1: b.x, y1: b.y, x2, y2 });
      }

      // Energy tether to shell when shields are up (vector glow line)
      if (shieldsUp && b.hits > 0) {
        const dx = b.x - this.x, dy = b.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist, ny = dy / dist;
        const ex = this.x + nx * (this.shellRadius - 2);
        const ey = this.y + ny * (this.shellRadius - 2);
        const charge = b.chargeTimer > 0 ? (1 - b.chargeTimer / 90) : 0;
        const firing = b.fireTimer > 0 ? 1 : 0;
        const base = 0.25;
        const a = Math.min(1, base + charge * 0.6 + firing * 0.4);
        ctx.globalAlpha = a;
        ctx.shadowBlur = 10 + a * 12;
        ctx.shadowColor = '#f55';
        ctx.strokeStyle = '#f55';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
        // Inner white core line for clarity
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Shell body (base disc with seams and bulwark), drawn behind segmented ring overlays
    if (this.shellHits > 0 && this.shellBodySprites) {
      const key = shieldsUp ? 'up' : 'down';
      const base = this.shellBodySprites[key];
      if (!base) this.initSprites();
      if (this.shellBodySprites[key]) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.shellAngle);
        const sprite = this.shellBodySprites[key];
        ctx.drawImage(sprite, -sprite.width / (2 * this.dpr), -sprite.height / (2 * this.dpr), sprite.width / this.dpr, sprite.height / this.dpr);
        ctx.restore();
      }
    }

    // Boss body shell (use pre-rendered sprite for current state and hits)
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
      const coreScale = this.getCoreScale ? this.getCoreScale() : (this.coreRadius / this.baseCoreRadius);
      ctx.globalAlpha = 0.2 + glowPhase * 0.22; ctx.shadowBlur = (24 + glowPhase * 20) * coreScale; ctx.fillStyle = 'rgba(255,80,80,0.65)';
      ctx.beginPath(); ctx.arc(0, 0, (12 + glowPhase * 8) * coreScale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Core embers (red) additive rendering, drawn after core and before beams
    if (this.coreEmbers && this.coreEmbers.length) {
      ctx.save();
      const prevOp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.coreEmbers.length; i++) {
        const em = this.coreEmbers[i];
        const s = (this.coreSparkSprite ? (this.coreSparkSprite.width / this.dpr) : 8) * em.scale * 2 * (this.getCoreScale ? this.getCoreScale() : (this.coreRadius / this.baseCoreRadius));
        ctx.globalAlpha = em.alpha;
        if (this.coreSparkSprite) {
          ctx.drawImage(this.coreSparkSprite, em.x - s * 0.5, em.y - s * 0.5, s, s);
        } else {
          // Fallback simple red glow
          ctx.shadowColor = '#f33';
          ctx.shadowBlur = 10;
          ctx.fillStyle = 'rgba(255,70,70,0.9)';
          ctx.beginPath(); ctx.arc(em.x, em.y, s * 0.35, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevOp;
      ctx.restore();
    }

    // Slam warning/active arc
    if (this.slamWarningTimer > 0 || this.slamActiveTimer > 0) {
      const warn = this.slamWarningTimer > 0;
      const color = warn ? '#ff0' : '#f66';
      const width = (warn ? 8 : 14) * (this.slamBandHalfWidth / 45);
      const r = this.getSlamRadius();
      ctx.save();
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = warn ? 12 : 16;
      ctx.lineWidth = width;
      ctx.beginPath();
      const a0 = this.slamAngle - this.slamArc / 2;
      const a1 = this.slamAngle + this.slamArc / 2;
      ctx.arc(this.x, this.y, r, a0, a1);
      ctx.stroke();
      ctx.restore();
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

    // Draw all active battery beams on top of boss body (core and shell)
    if (activeBeams.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const beam of activeBeams) {
        const flicker = 0.75 + Math.random() * 0.25;
        ctx.globalAlpha = flicker;
        ctx.shadowBlur = 12 * flicker; ctx.shadowColor = '#f09';
        ctx.strokeStyle = 'rgba(255,0,128,1)'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke();
        // inner white-hot core
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Laser embers (pink) additive rendering after beams and pulses
    if (this.laserEmbers && this.laserEmbers.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.laserEmbers) {
        const prog = 1 - (e.life / e.maxLife);
        const alpha = Math.max(0, 0.8 * (1 - prog));
        const scale = (0.9 + e.size * 0.6) * (1 + prog * 0.6);
        ctx.globalAlpha = alpha;
        if (this.laserEmberSprite) {
          const dw = (this.laserEmberSprite.width / this.dpr) * scale * 1.2;
          const dh = (this.laserEmberSprite.height / this.dpr) * scale * 1.2;
          ctx.drawImage(this.laserEmberSprite, e.x - dw / 2, e.y - dh / 2, dw, dh);
        } else {
          ctx.shadowColor = '#ff66cc';
          ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(255,80,170,0.8)';
          ctx.beginPath();
          ctx.arc(e.x, e.y, 6 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Nothing else to restore here
  }

  getSlamRadius() {
    // Place the slam ring outside the outer shell by a base offset, scaled by destroyed batteries.
    return this.shellRadius + (this.slamBaseOffset * this.slamDistanceScale);
  }

  // Current visual scale of the core relative to its base radius
  getCoreScale() {
    return (this.baseCoreRadius > 0) ? (this.coreRadius / this.baseCoreRadius) : 1;
  }

  // Apply a 10% growth when the vulnerable core takes a hit, with a short cooldown to avoid runaway growth from continuous sources
  onCoreHitEvent() {
    if (this.coreScaleCooldown > 0) return;
    // Grow core radius by 10%, clamped to max
    const next = Math.min(this.maxCoreRadius, this.coreRadius * 1.1);
    if (next !== this.coreRadius) {
      this.coreRadius = next;
      // Rebuild core sprite to match new radius
      this.buildCoreSprite();
    }
    // Throttle further growth briefly to handle lasers and explosions ticking across frames
    this.coreScaleCooldown = 8; // ~0.13s at 60 FPS
  }

  // --- Sprite pre-render helpers ---
  initSprites() {
    // Device pixel ratio for crisp sprites
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

    this.shellSprites = { up: {}, down: {} };
    this.shellBodySprites = { up: null, down: null };
    this.batterySprites = {};
    this.coreSprite = null;

    this.buildShellBodySprites();
    this.buildShellSprites();
    this.buildBatterySprites();
    this.buildCoreSprite();
    this.buildLaserEmberSprite();
    this.buildCoreSparkSprite();
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
      // Apply the same +/-150px vertical offsets on resize
      this.batteries[0].x = margin;                this.batteries[0].y = margin + 150;
      this.batteries[1].x = canvas.width - margin; this.batteries[1].y = margin + 150;
      this.batteries[2].x = margin;                this.batteries[2].y = canvas.height - margin - 150;
      this.batteries[3].x = canvas.width - margin; this.batteries[3].y = canvas.height - margin - 150;
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

  buildShellBodySprites() {
    // Base circular shell body with gradient fill, rim light, subtle seams, and a forward bulwark ring
    for (const state of ['up', 'down']) {
      const margin = 28;
      const size = (this.shellRadius * 2) + margin * 2;
      const canvas = this.createOffscreen(size, size);
      if (!canvas) continue;
      const sctx = canvas.getContext('2d');
      sctx.save(); sctx.scale(this.dpr, this.dpr); sctx.translate(size / 2, size / 2);

      const R = this.shellRadius - 3;
      // Radial gradient fill (vector, no texture)
      const grad = sctx.createRadialGradient(0, 0, 0, 0, 0, R);
      if (state === 'up') {
        grad.addColorStop(0.0, '#4a1010');
        grad.addColorStop(0.55, '#2a0b0b');
        grad.addColorStop(1.0, '#180606');
      } else {
        grad.addColorStop(0.0, '#361036');
        grad.addColorStop(0.55, '#210921');
        grad.addColorStop(1.0, '#140514');
      }
      sctx.fillStyle = grad;
      sctx.beginPath(); sctx.arc(0, 0, R, 0, Math.PI * 2); sctx.fill();

      // Rim light
      sctx.lineWidth = 3.5;
      sctx.strokeStyle = state === 'up' ? '#ffb0b0' : '#ffb3ff';
      sctx.globalAlpha = 0.9;
      sctx.beginPath(); sctx.arc(0, 0, R, 0, Math.PI * 2); sctx.stroke();
      sctx.globalAlpha = 1;

      // Bulwark ring slightly inside rim
      sctx.lineWidth = 2;
      sctx.strokeStyle = state === 'up' ? '#f55' : '#f0f';
      sctx.globalAlpha = 0.6;
      sctx.beginPath(); sctx.arc(0, 0, R - 10, 0, Math.PI * 2); sctx.stroke();
      sctx.globalAlpha = 1;

      // Subtle latitudinal seams
      sctx.strokeStyle = state === 'up' ? 'rgba(255,120,120,0.2)' : 'rgba(255,120,255,0.22)';
      sctx.lineWidth = 1;
      for (let k = 1; k <= 3; k++) {
        const rr = R - 20 - k * 14;
        sctx.beginPath(); sctx.arc(0, 0, rr, 0, Math.PI * 2); sctx.stroke();
      }

      // Subtle radial seams (spokes)
      sctx.globalAlpha = 0.25;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        sctx.beginPath();
        sctx.moveTo(Math.cos(a) * (R - 28), Math.sin(a) * (R - 28));
        sctx.lineTo(Math.cos(a) * (R - 6), Math.sin(a) * (R - 6));
        sctx.stroke();
      }
      sctx.globalAlpha = 1;

      sctx.restore();
      this.shellBodySprites[state] = canvas;
    }
  }

  buildBatterySprites() {
    // Build sprites for battery bases as segmented arc batteries (hits=1..5)
    for (let hits = 1; hits <= 5; hits++) {
      const margin = 24;
      const radius = 28;
      const size = (radius * 2) + margin * 2;
      const canvas = this.createOffscreen(size, size);
      if (!canvas) continue;
      const sctx = canvas.getContext('2d');
      sctx.save(); sctx.scale(this.dpr, this.dpr); sctx.translate(size / 2, size / 2);
      const baseColor = '#f66';

      // Outer glow ring
      sctx.globalAlpha = 0.9; sctx.shadowBlur = 10; sctx.shadowColor = baseColor; sctx.strokeStyle = baseColor; sctx.lineWidth = 2.5;
      sctx.beginPath(); sctx.arc(0, 0, radius - 1, 0, Math.PI * 2); sctx.stroke();
      sctx.shadowBlur = 0; sctx.globalAlpha = 1;

      // Segmented battery arcs (5 segments around)
      const segs = 5; const span = (Math.PI * 2) / segs; const r = radius - 8;
      for (let i = 0; i < segs; i++) {
        const a0 = (i * span) - Math.PI / 2; // start at top
        const isLit = i < hits;
        sctx.strokeStyle = isLit ? '#fff' : 'rgba(255,255,255,0.25)';
        sctx.lineWidth = isLit ? 3 : 1.5;
        sctx.globalAlpha = isLit ? 1 : 0.9;
        sctx.beginPath(); sctx.arc(0, 0, r, a0 + span * 0.12, a0 + span * 0.88); sctx.stroke();
      }
      sctx.globalAlpha = 1;

      // Crosshair detail
      sctx.strokeStyle = 'rgba(255,255,255,0.75)'; sctx.lineWidth = 1;
      sctx.beginPath(); sctx.moveTo(-8, 0); sctx.lineTo(8, 0); sctx.stroke();
      sctx.beginPath(); sctx.moveTo(0, -8); sctx.lineTo(0, 8); sctx.stroke();

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

    const R = this.coreRadius * 0.8;
    // Radial gradient core (vector)
    const g = sctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0.0, '#ffffff');
    g.addColorStop(0.18, '#ffd6d6');
    g.addColorStop(0.55, '#ff6666');
    g.addColorStop(0.95, '#8a1616');
    g.addColorStop(1.0, '#3a0a0a');
    sctx.fillStyle = g;
    sctx.shadowColor = '#f55'; sctx.shadowBlur = 18;
    sctx.beginPath(); sctx.arc(0, 0, R, 0, Math.PI * 2); sctx.fill();
    sctx.shadowBlur = 0;

    // Rim highlight
    sctx.lineWidth = 3; sctx.strokeStyle = '#ffb3b3';
    sctx.beginPath(); sctx.arc(0, 0, R * 1.02, 0, Math.PI * 2); sctx.stroke();

    // Subtle internal spokes/glints
    sctx.globalAlpha = 0.25; sctx.strokeStyle = 'rgba(255,255,255,0.8)'; sctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      sctx.beginPath();
      sctx.moveTo(Math.cos(a) * (R * 0.3), Math.sin(a) * (R * 0.3));
      sctx.lineTo(Math.cos(a) * (R * 0.85), Math.sin(a) * (R * 0.85));
      sctx.stroke();
    }
    sctx.globalAlpha = 1;

    // Star glint cross
    sctx.strokeStyle = 'rgba(255,255,255,0.9)'; sctx.lineWidth = 1.5;
    sctx.beginPath(); sctx.moveTo(-R * 0.15, 0); sctx.lineTo(R * 0.15, 0); sctx.stroke();
    sctx.beginPath(); sctx.moveTo(0, -R * 0.15); sctx.lineTo(0, R * 0.15); sctx.stroke();

    sctx.restore(); sctx.globalAlpha = 1; sctx.shadowBlur = 0;
    this.coreSprite = canvas;
  }

  // Build small red/white spark sprite used by core ember particles
  buildCoreSparkSprite() {
    const size = 14;
    const c = this.createOffscreen(size, size);
    if (!c) { this.coreSparkSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(size / 2, size / 2);
    // Outer red glow
    g.shadowBlur = 8; g.shadowColor = '#f33';
    g.fillStyle = 'rgba(255,80,80,0.8)';
    g.beginPath(); g.arc(0, 0, 3.6, 0, Math.PI * 2); g.fill();
    // Inner white hot
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(0, 0, 1.3, 0, Math.PI * 2); g.fill();
    g.restore();
    this.coreSparkSprite = c;
  }

  // Build cached pink ember sprite for additive glow rendering
  buildLaserEmberSprite() {
    const size = 16;
    const c = this.createOffscreen(size, size);
    if (!c) { this.laserEmberSprite = null; return; }
    const sctx = c.getContext('2d');
    sctx.save();
    sctx.scale(this.dpr, this.dpr);
    sctx.translate(size / 2, size / 2);
    // Outer soft glow
    sctx.shadowBlur = 8; sctx.shadowColor = '#ff66cc';
    sctx.fillStyle = 'rgba(255,80,170,0.75)';
    sctx.beginPath(); sctx.arc(0, 0, 4, 0, Math.PI * 2); sctx.fill();
    // Inner hot core
    sctx.shadowBlur = 0;
    sctx.fillStyle = 'rgba(255,255,255,0.95)';
    sctx.beginPath(); sctx.arc(0, 0, 1.4, 0, Math.PI * 2); sctx.fill();
    sctx.restore();
    this.laserEmberSprite = c;
  }

  // --- Core shard-burst helpers (red variant, inspired by Colossus) ---
  makeRedShardBullet(x, y, angle, speed = 2.6) {
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const verts = 6 + Math.floor(Math.random() * 4); // 6-9 vertices
    const angles = [];
    const radii = [];
    for (let i = 0; i < verts; i++) {
      const baseA = (i / verts) * Math.PI * 2;
      angles.push(baseA + (Math.random() - 0.5) * 0.35);
      radii.push(5 + Math.random() * 5); // 5..10 px
    }
    const slim = 0.55 + Math.random() * 0.15; // slim profile
    const spin = (0.012 + Math.random() * 0.02); // positive => clockwise in canvas
    return {
      x, y, vx, vy,
      radius: 6,
      lifetime: 240,
      _angle: angle,
      _spin: spin,
      update(canvas) {
        this.x += this.vx;
        this.y += this.vy;
        this._angle += this._spin;
        this.lifetime--;
        if (this.x < -30 || this.x > canvas.width + 30 || this.y < -30 || this.y > canvas.height + 30) this.lifetime = 0;
      },
      draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this._angle);
        ctx.scale(slim, 1);
        // Red glow
        ctx.globalAlpha = 1;
        ctx.shadowColor = '#f55';
        ctx.shadowBlur = 16;
        // Filled jagged red shard
        ctx.fillStyle = 'rgba(255,90,90,0.95)';
        ctx.beginPath();
        for (let i = 0; i < angles.length; i++) {
          const ax = Math.cos(angles[i]) * radii[i];
          const ay = Math.sin(angles[i]) * radii[i];
          if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }
        ctx.closePath();
        ctx.fill();
        // Edge definition (light red)
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,150,150,0.9)';
        ctx.stroke();
        ctx.restore();
      },
    };
  }

  spawnCoreShardBurst() {
    const { enemyBullets } = this.deps;
    if (!enemyBullets) return;
    const count = 15;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count; // 360 degrees
      enemyBullets.push(this.makeRedShardBullet(this.x, this.y, a, 2.6));
    }
  }

  // Collisions: bullets
  handleBulletCollision(bullet) {
    const { createExplosion, drones, Drone, showHUDMessage, getFrameCount, powerups, Powerup, applyShockwave, setShake } = this.deps;

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
          // Large red explosion and local shockwave on battery destruction
          createExplosion && createExplosion(b.x, b.y, 120, '#f55');
          if (applyShockwave) applyShockwave(b.x, b.y, 260, 6);
          if (setShake) setShake(10, 5);
          // cancel any active charge/fire
          b.chargeTimer = 0; b.fireTimer = 0;
          // spawn a hostile drone
          if (drones && Drone) {
            const d = new Drone(b.x, b.y);
            drones.push(d);
          }
          // Battery power-up drop (Level 15 boss): 30% chance
          if (powerups && Powerup && powerups.length < 4) {
            if (Math.random() < 0.3) {
              const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone'];
              const type = types[(Math.random() * types.length) | 0];
              powerups.push(new Powerup(b.x, b.y, type));
            }
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
        if (this.coreHealth > 0) this.onCoreHitEvent();
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
    const { createExplosion, applyShockwave, setShake } = this.deps;
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
          if (b.hits <= 0) { 
            // Large red explosion and local shockwave on battery destruction
            createExplosion && createExplosion(b.x, b.y, 120, '#f55');
            if (applyShockwave) applyShockwave(b.x, b.y, 260, 6);
            if (setShake) setShake(10, 5);
            b.chargeTimer = 0; b.fireTimer = 0; 
          }
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
          if (this.coreHealth > 0) this.onCoreHitEvent();
          if (this.coreHealth === 0) this.onDefeated();
        }
      }
    }
  }

  // Radial explosion damage (e.g., player bomb). Damages batteries in radius,
  // then shell when shields are down, then core when shell is destroyed.
  hitByExplosion(cx, cy, radius) {
    const { createExplosion, applyShockwave, setShake } = this.deps;
    let any = false;
    // Batteries first
    for (let b of this.batteries) {
      if (b.hits <= 0) continue;
      const dx = b.x - cx, dy = b.y - cy;
      if (Math.hypot(dx, dy) <= radius + b.radius) {
        any = true;
        if (this.spawnInvuln <= 0) {
          b.hits--; b.hitFlash = 8;
          if (b.hits > 0 && createExplosion) {
            createExplosion(b.x, b.y, 3, '#f66', 'micro');
          }
          if (b.hits <= 0) {
            createExplosion && createExplosion(b.x, b.y, 120, '#f55');
            if (applyShockwave) applyShockwave(b.x, b.y, 260, 6);
            if (setShake) setShake(10, 5);
            b.chargeTimer = 0; b.fireTimer = 0;
          }
        }
      }
    }
    // Shell (only when shields are down)
    if (!this.anyBatteriesAlive() && this.shellHits > 0) {
      const dx = this.x - cx, dy = this.y - cy;
      if (Math.hypot(dx, dy) <= radius + this.shellRadius) {
        any = true;
        if (this.spawnInvuln <= 0) {
          this.shellHits = Math.max(0, this.shellHits - 1);
          if (this.shellHits === 0) {
            this.deps.showHUDMessage && this.deps.showHUDMessage('CORE EXPOSED!', 180);
          }
        }
      }
    }
    // Core (only when shell destroyed)
    if (this.shellHits <= 0) {
      const dx = this.x - cx, dy = this.y - cy;
      if (Math.hypot(dx, dy) <= radius + this.coreRadius) {
        any = true;
        if (this.spawnInvuln <= 0) {
          this.coreHealth = Math.max(0, this.coreHealth - 1);
          if (this.coreHealth > 0) this.onCoreHitEvent();
          if (this.coreHealth === 0) this.onDefeated();
        }
      }
    }
    return any;
  }

  // Player laser line damage
  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion, applyShockwave, setShake } = this.deps;
    let any = false;
    for (let b of this.batteries) {
      if (b.hits > 0 && lineCircleCollision(x1, y1, x2, y2, b.x, b.y, b.radius)) {
        any = true;
        if (this.spawnInvuln <= 0) {
          b.hits--; b.hitFlash = 8;
          if (b.hits > 0 && createExplosion) {
            createExplosion(b.x, b.y, 3, '#f66', 'micro');
          }
          if (b.hits <= 0) { 
            // Large red explosion and local shockwave on battery destruction
            createExplosion && createExplosion(b.x, b.y, 120, '#f55');
            if (applyShockwave) applyShockwave(b.x, b.y, 260, 6);
            if (setShake) setShake(10, 5);
            b.chargeTimer = 0; b.fireTimer = 0; 
          }
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
        if (this.coreHealth > 0) this.onCoreHitEvent();
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
    const { createExplosion, powerups, Powerup, enemyBullets, drones, setShake, awardPoints, applyShockwave } = this.deps;
    this.defeated = true;
    createExplosion && createExplosion(this.x, this.y, this.shellRadius * 3, '#ffaaaa');
    setShake && setShake(28, 10);
    awardPoints && awardPoints(1200, this.x, this.y, true);
    // Massive arena shockwave push for dramatic finish
    if (applyShockwave) applyShockwave(this.x, this.y, Math.max(800, this.shellRadius * 6), 12);
    // Ember/shockwave trails: ring of micro-explosions around the boss
    if (createExplosion) {
      const rings = 2;
      for (let rIdx = 0; rIdx < rings; rIdx++) {
        const count = 12 + rIdx * 6;
        const baseR = this.shellRadius * (1.6 + rIdx * 0.5);
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2;
          const jitter = (Math.random() - 0.5) * 24;
          const rr = baseR + jitter;
          const ex = this.x + Math.cos(ang) * rr;
          const ey = this.y + Math.sin(ang) * rr;
          createExplosion(ex, ey, 36 + ((Math.random() * 18) | 0), '#ffaa99', 'micro');
        }
      }
    }
    // Victory HUD message
    if (this.deps.showHUDMessage) this.deps.showHUDMessage('Congratulations you have defeated the asteroids!', 300);
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
    // EXP: Award 900 EXP for defeating Final Asteroid boss
    if (this.deps.addEXP) this.deps.addEXP(900, 'boss-finalasteroid');
    // Persist final clears and unlock rewards
    try {
      // Increment clears
      let clears = 0;
      try { clears = parseInt(localStorage.getItem('asteraidFinalClears') || '0', 10) || 0; } catch (e) { clears = 0; }
      clears++;
      try { localStorage.setItem('asteraidFinalClears', String(clears)); } catch (e) {}

      // Load rewards set (accept JSON array or CSV)
      let rewardsSet = new Set();
      try {
        const raw = localStorage.getItem('asteraidFinalBossRewards');
        if (raw) {
          if (raw[0] === '[') {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) arr.forEach(id => rewardsSet.add(id));
          } else {
            raw.split(',').map(s => s.trim()).filter(Boolean).forEach(id => rewardsSet.add(id));
          }
        }
      } catch (e) {}

      const hadCompanion = rewardsSet.has('companion_unlocked');
      const hadApex = rewardsSet.has('apexRounds');
      // Unlocks
      if (clears >= 1) rewardsSet.add('companion_unlocked');
      if (clears >= 2) rewardsSet.add('apexRounds');

      // Save rewards back as JSON array
      try { localStorage.setItem('asteraidFinalBossRewards', JSON.stringify(Array.from(rewardsSet))); } catch (e) {}

      // Update globals
      if (typeof window !== 'undefined') {
        window.__finalClears = clears;
        window.__apexRoundsEnabled = rewardsSet.has('apexRounds') || (clears >= 2);
        window.__companionEnabled = rewardsSet.has('companion_unlocked') || (clears >= 1);
      }

      // Notify if newly unlocked
      if ((clears >= 3) && this.deps.showHUDMessage) {
        this.deps.showHUDMessage('You beat the asteroids again! - No new unlock', 300);
      }
      if (!hadApex && (clears >= 2) && this.deps.showHUDMessage) {
        this.deps.showHUDMessage('You beat the asteroids again! - Apex Rounds unlocked!', 300);
      }
      if (!hadCompanion && (clears >= 1) && this.deps.showHUDMessage) {
        this.deps.showHUDMessage('You beat the asteroids! - Celestial Companion unlocked.', 300);
      }
    } catch (e) {}
  }
}
