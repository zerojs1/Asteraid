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
    // Background structure slow rotation (purely visual)
    this.structureAngle = 0;
    this.structureRotateSpeed = 0.0008;
    // Even larger back structure layer (purely visual)
    this.structureBackAngle = 0;
    this.structureBackRotateSpeed = -0.0005;

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
      postFireGlow: 0,    // frames of white glow after firing
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

    // Cached white glow dot used for connector pips and small glows
    this.whiteDotSprite = null;
    this.buildWhiteDotSprite();

    // Core ember particles (red glow) similar to Colossus core effect
    this.coreEmbers = [];
    this.coreSparkSprite = null;
    this.buildCoreSparkSprite();

    // Battery embers (white/soft) emitted when a battery finishes firing
    this.batteryEmbers = [];

    // Battery chromatic shockwave rings spawned at fire start
    this.batteryShockwaves = []; // elements: {x,y,age,life,maxRadius}
    this._shockwaveBaseRadius = 36; // logical px radius of the prerendered ring
    this.shockwaveSprite = null;

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

    // Special UFOs spawned when core is invulnerable (initial phase)
    this.specialUFOs = []; // array of UFO instances managed by the boss
    this._spawnedUFOsOnInvuln = false;

    // Final full-screen explosion overlay timer
    this._finalBlastTimer = 0; // frames remaining (drawn in draw())

    // Core sweeping laser (unlocked after all 4 shield batteries are destroyed)
    this.sweepLaserWarningTimer = 0; // pre-fire telegraph frames
    this.sweepLaserActiveTimer = 0;  // active sweep frames
    this.sweepLaserAngle = 0;        // current beam angle while sweeping
    this.sweepLaserSweepSpeed = 0.016; // 60% slower than Dreadship (0.04 -> 0.016)
    this.sweepLaserCooldown = 0;     // randomized cooldown between 3–8 seconds (frames)
    this.sweepLaserDir = 1;          // +1 or -1 depending on player side
  }

  // Even larger back structure layer (pure visuals)
  buildStructureBackSprite() {
    const margin = Math.max(120, this.shellRadius * 0.9);
    const size = (this.shellRadius * 3.6) + margin * 2;
    const canvas = this.createOffscreen(size, size);
    if (!canvas) { this.structureBackSprite = null; return; }
    const s = canvas.getContext('2d');
    s.save(); s.scale(this.dpr, this.dpr); s.translate(size / 2, size / 2);

    const Rb0 = this.shellRadius * 1.8;   // huge outer hex ring
    const Rb1 = this.shellRadius * 1.35;  // inner back ring

    // Large back plate underlay to make the far layer more substantial
    // Radial gradient disc: darker center, soft falloff to edges
    {
      const rg = s.createRadialGradient(0, 0, Rb1 * 0.15, 0, 0, Rb0 * 1.18);
      rg.addColorStop(0.0, 'rgba(40,10,10,0.65)');
      rg.addColorStop(0.5, 'rgba(40,10,10,0.45)');
      rg.addColorStop(1.0, 'rgba(40,10,10,0.05)');
      s.fillStyle = rg;
      s.beginPath(); s.arc(0, 0, Rb0 * 1.2, 0, Math.PI * 2); s.fill();
    }

    // Massive hex panel backer
    s.save(); s.globalAlpha = 0.6; s.strokeStyle = '#3a0a0a'; s.lineWidth = 10; s.fillStyle = 'rgba(60,12,12,0.48)';
    s.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * Rb0, y = Math.sin(a) * Rb0;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath(); s.fill(); s.stroke(); s.restore();

    // Solid inner back plate to reduce see-through within the hex
    s.save();
    s.globalAlpha = 0.55;
    s.fillStyle = 'rgba(50,10,10,0.55)';
    s.beginPath(); s.arc(0, 0, Rb1 * 0.92, 0, Math.PI * 2); s.fill();
    s.restore();

    // Secondary larger hex outline for depth
    s.save(); s.globalAlpha = 0.35; s.strokeStyle = 'rgba(255,120,120,0.3)'; s.lineWidth = 6;
    s.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * (Rb0 * 1.12), y = Math.sin(a) * (Rb0 * 1.12);
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath(); s.stroke(); s.restore();

    // Inner ring lattice
    s.save(); s.globalAlpha = 0.3; s.strokeStyle = 'rgba(255,140,140,0.25)'; s.lineWidth = 3;
    const segs = 18; const span = Math.PI * 2 / segs;
    for (let i = 0; i < segs; i++) {
      const a0 = i * span, a1 = (i + 1) * span;
      const x0 = Math.cos(a0) * Rb1, y0 = Math.sin(a0) * Rb1;
      const x1 = Math.cos(a1) * Rb1, y1 = Math.sin(a1) * Rb1;
      s.beginPath(); s.moveTo(x0, y0); s.lineTo(x1, y1); s.stroke();
    }
    s.restore();

    s.restore();
    this.structureBackSprite = canvas;
  }

  isDefeated() { return this.defeated; }

  anyBatteriesAlive() { return this.batteries.some(b => b.hits > 0); }

  update() {
    const { player, lineCircleCollision, onPlayerHit, applyShockwave, createExplosion, drones, Drone, AttackDrone, getFrameCount, bullets, enemyBullets, EnemyBullet, asteroids } = this.deps;
    const frame = getFrameCount ? getFrameCount() : 0;

    // Timers
    if (this.spawnInvuln > 0) this.spawnInvuln--;
    if (this.coreScaleCooldown > 0) this.coreScaleCooldown--;

    // Rotation: shell rotates slowly clockwise while shields up; stop when shell becomes vulnerable
    if (this.anyBatteriesAlive()) {
      this.shellAngle += this.shellRotateSpeed;
    }

    // Update battery embers (white) and cull
    if (this.batteryEmbers.length) {
      const { canvas } = this.deps;
      for (let i = this.batteryEmbers.length - 1; i >= 0; i--) {
        const e = this.batteryEmbers[i];
        e.x += e.vx; e.y += e.vy;
        e.vx *= 0.985; e.vy *= 0.985;
        e.life--;
        if (!canvas || e.life <= 0 || e.x < -24 || e.y < -24 || e.x > canvas.width + 24 || e.y > canvas.height + 24) {
          this.batteryEmbers.splice(i, 1);
        }
      }
      if (this.batteryEmbers.length > 160) this.batteryEmbers.length = 160;
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
      // Visual rings only: halve the explosion radius (gameplay radius unchanged)
      if (createExplosion) createExplosion(this.x, this.y, 45, '#ff8888');
      if (this.deps.setShake) this.deps.setShake(14, 6);
      // Bloom hook on core pulse (optional)
      try {
        const gl = this.deps.glRenderer;
        if (gl && gl.pulseExplosion) gl.pulseExplosion(this.x, this.y, 0.4);
        if (gl && gl.pulseBloom) gl.pulseBloom(this.x, this.y, 0.6, 45);
        // Overlay ring: avoid extra Canvas2D pulse when WebGL ring is spawned
        if (gl && gl.spawnShockwaveRing) {
          try { gl.spawnShockwaveRing(this.x, this.y, 0xff7777, 36, 3, 1.04, 0.94); } catch (e) {}
        }
      } catch (e) {}
      // Only use Canvas2D pulse rings when WebGL overlay is not available
      try {
        const gl = this.deps.glRenderer;
        if (!(gl && gl.spawnShockwaveRing)) {
          this.pulses.push({ age: 0, life: 36, maxRadius: radius, color: '#ff7777' });
        }
      } catch (e) { this.pulses.push({ age: 0, life: 36, maxRadius: radius, color: '#ff7777' }); }
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
        // Reset any leftover post-fire ring on new charge
        b.postFireGlow = 0;
        // Charge start: no longer triggers the white ring; we reserve that for post-fire
        // Bloom hook near battery/structure on charge start (optional)
        try {
          const gl = this.deps.glRenderer;
          if (gl && gl.pulseExplosion) gl.pulseExplosion(b.x, b.y, 0.25);
          if (gl && gl.pulseBloom) gl.pulseBloom(b.x, b.y, 0.8, 45);
        } catch (e) {}
      }
      this.batteryLaserCooldown = 156; // schedule next (35% faster than 240)
    }

    // Progress battery charge/fire and apply damage when firing
    // Simple load heuristic to throttle effects when many particles are active
    const isHeavyLoad = (this.laserEmbers.length + this.coreEmbers.length) > 220;
    for (let b of this.batteries) {
      if (b.hits <= 0) continue;
      if (b.chargeTimer > 0) {
        b.chargeTimer--;
        if (b.chargeTimer === 0) {
          b.fireTimer = 45; // ~0.75s
          // No longer build a full-length beam sprite per shot; draw uses a reusable strip sprite
          // Player-death style chromatic rings using existing explosion system
          // Use 'burst' profile for richer rings; color is desaturated red
          if (createExplosion) createExplosion(b.x, b.y, 80, '#ff8888', 'ringsOnly');
          // Overlay: soft pink glow icon at battery center (hold 40f, fade 30f)
          try {
            if (typeof window !== 'undefined' && window.glRenderer && window.glRenderer.spawnSoftGlow) {
              window.glRenderer.spawnSoftGlow(b.x, b.y, {
                color: 0xff66cc,
                radius: Math.max(48, (b.radius || 24) * 0.7),
                innerScale: 0.45,
                innerAlpha: 0.95,
                outerAlpha: 0.15,
                holdFrames: 40,
                fadeFrames: 30,
                growth: 1.0,
              });
            }
          } catch (e) {}
          // Overlay chromatic rings at fire start (optional, complements ringsOnly explosion)
          try {
            const gl = this.deps.glRenderer;
            if (gl && gl.spawnChromaticRing) {
              gl.spawnChromaticRing(b.x, b.y, 42, 2, 1.03, 0.94, 2);
              gl.spawnChromaticRing(b.x, b.y, 68, 2, 1.02, 0.94, 3);
            }
          } catch (e) {}
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
        const spawnCount = isHeavyLoad ? 1 : 2;
        for (let i = 0; i < spawnCount; i++) {
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
          // WebGL overlay embers when available
          try {
            if (typeof window !== 'undefined' && window.glRenderer && window.glRenderer.spawnAboveDot) {
              const col = 0xff66cc; // pink
              const radius = 1.2 + size; // subtle size variance
              window.glRenderer.spawnAboveDot(sx, sy, col, radius, vx, vy, life, 1.0);
            } else {
              this.laserEmbers.push({ x: sx, y: sy, vx, vy, life, maxLife: life, size });
            }
          } catch (e) {
            this.laserEmbers.push({ x: sx, y: sy, vx, vy, life, maxLife: life, size });
          }
        }
        // End-of-fire: small ember burst
        if (b.fireTimer === 0) {
          const burst = isHeavyLoad ? 8 : 12;
          for (let i = 0; i < burst; i++) {
            const a = (i / burst) * Math.PI * 2 + Math.random() * 0.3;
            const sp = 1.2 + Math.random() * 1.6;
            const vx = Math.cos(a) * sp;
            const vy = Math.sin(a) * sp;
            const life = 36 + (Math.random() * 18) | 0;
            this.batteryEmbers.push({ x: b.x, y: b.y, vx, vy, life, maxLife: life });
          }
        }
      } else {
        // No idle white ring
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
      if (this.laserEmbers.length > 180) this.laserEmbers.length = 180;
    }

    // Emit small red core embers from center (always), larger when shell is destroyed
    {
      const exposed = (this.shellHits <= 0);
      let emitCount = exposed ? 2 : (Math.random() < 0.6 ? 1 : 0);
      // Throttle emission under heavy load to avoid runaway particle counts
      const heavy = this.coreEmbers.length > 220;
      if (heavy) emitCount = Math.max(0, emitCount - 1);
      for (let i = 0; i < emitCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (0.8 + Math.random() * 1.2) * (exposed ? 1.35 : 1.0);
        const vx = Math.cos(ang) * spd;
        const vy = Math.sin(ang) * spd;
        // Increase lifetime by ~50% so embers drift farther from the core
        let life = (50 + (Math.random() * 16)) | 0;
        //life = Math.floor(life * 1.5);
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
        em.life--; em.alpha *= 0.98;
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

    // Core sweeping laser (unlocked after all 4 batteries are destroyed)
    if (!this.anyBatteriesAlive() && this.coreHealth > 0) {
      // Active sweep: rotate beam and apply damage/embers
      if (this.sweepLaserActiveTimer > 0) {
        this.sweepLaserActiveTimer--;
        this.sweepLaserAngle += this.sweepLaserSweepSpeed * (this.sweepLaserDir || 1);
        // Collision against player along an extended ray
        const x2 = this.x + Math.cos(this.sweepLaserAngle) * 2400;
        const y2 = this.y + Math.sin(this.sweepLaserAngle) * 2400;
        if (lineCircleCollision && typeof lineCircleCollision === 'function') {
          if (this.deps && this.deps.player) {
            const pl = this.deps.player;
            const okInv = (pl.invulnerable === 0 || pl.invulnerable === undefined);
            const okShield = (pl.shielded === 0 || pl.shielded === undefined);
            const okInvis = (pl.invisible === 0 || pl.invisible === undefined);
            if (okInv && okShield && okInvis && lineCircleCollision(this.x, this.y, x2, y2, pl.x, pl.y, pl.radius)) {
              this.deps.onPlayerHit && this.deps.onPlayerHit();
            }
          }
        }
        // Red embers flying off beam (WebGL overlay preferred)
        {
          const { canvas } = this.deps || {};
          const dx = x2 - this.x, dy = y2 - this.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const px = -uy, py = ux; // perpendicular
          const spawnCount = 2; // light
          for (let i = 0; i < spawnCount; i++) {
            const t = 0.1 + Math.random() * 0.3;
            const sx = this.x + ux * len * t;
            const sy = this.y + uy * len * t;
            if (canvas) {
              const margin = 50;
              if (sx < -margin || sy < -margin || sx > canvas.width + margin || sy > canvas.height + margin) continue;
            }
            const sign = Math.random() < 0.5 ? -1 : 1;
            const vPerp = (1.0 + Math.random() * 1.8) * sign;
            const vAlong = 0.25 + Math.random() * 0.5;
            const vx = px * vPerp + ux * vAlong;
            const vy = py * vPerp + uy * vAlong;
            const life = 24 + (Math.random() * 18) | 0;
            try {
              if (typeof window !== 'undefined' && window.glRenderer && window.glRenderer.spawnAboveDot) {
                window.glRenderer.spawnAboveDot(sx, sy, 0xff4444, 2.2, vx, vy, life, 1.0);
              } else {
                // Canvas fallback shares battery ember array for simplicity
                this.laserEmbers.push({ x: sx, y: sy, vx, vy, life, maxLife: life, size: 1.2 });
              }
            } catch (e) {
              this.laserEmbers.push({ x: sx, y: sy, vx, vy, life, maxLife: life, size: 1.2 });
            }
          }
        }
        // End -> set next randomized cooldown
        if (this.sweepLaserActiveTimer === 0) {
          // Randomize 3–8 seconds
          this.sweepLaserCooldown = 180 + Math.floor(Math.random() * 301); // 180..480
          // Small shake to punctuate
          if (this.deps.setShake) this.deps.setShake(10, 3);
        }
      } else if (this.sweepLaserWarningTimer > 0) {
        this.sweepLaserWarningTimer--;
        if (this.sweepLaserWarningTimer === 0) {
          // Start sweeping: aim at player, then sweep across
          const pl = this.deps.player;
          const aim = Math.atan2(pl.y - this.y, pl.x - this.x);
          this.sweepLaserAngle = aim - Math.PI * 0.7;
          this.sweepLaserActiveTimer = 360; // 3 seconds at 60 FPS
          // Direction depending on which side of core the player is (left/right)
          this.sweepLaserDir = (pl.x >= this.x) ? 1 : -1;
          // Visual cues: rings-only explosion, overlay chromatic rings, heat ripple
          try {
            if (this.deps.createExplosion) this.deps.createExplosion(this.x, this.y, 120, '#f66', 'ringsOnly');
          } catch (e) {}
          try {
            if (typeof window !== 'undefined' && window.glRenderer && window.glRenderer.spawnChromaticRing) {
              const gl = window.glRenderer;
              gl.spawnChromaticRing(this.x, this.y, 56, 2, 1.03, 0.94, 3);
              gl.spawnChromaticRing(this.x, this.y, 100, 2, 1.02, 0.94, 4);
            }
          } catch (e) {}
          try {
            if (typeof window !== 'undefined' && window.glRenderer && window.glRenderer.pulseDistort) {
              window.glRenderer.pulseDistort(0.5);
            }
          } catch (e) {}
        }
      } else {
        // Cooldown gate to initiate warning
        if (this.sweepLaserCooldown > 0) this.sweepLaserCooldown--;
        if (this.sweepLaserCooldown === 0) {
          this.sweepLaserWarningTimer = 45; // pre-fire telegraph
          // Next cooldown will be set when active ends
        }
      }
    } else {
      // Ensure timers are not ticking before unlock or after defeat
      if (this.anyBatteriesAlive()) {
        this.sweepLaserWarningTimer = 0;
        this.sweepLaserActiveTimer = 0;
      }
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
        this.slamWarningTimer = 60; // longer wind-up for readability
        this.slamWarnTotal = this.slamWarningTimer; // track total for fade-in
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

    // One-time spawn of two special UFOs when the core becomes vulnerable (shell destroyed)
    if (!this._spawnedUFOsOnInvuln && this.shellHits <= 0) {
      this.spawnSpecialUFOs();
      this._spawnedUFOsOnInvuln = true;
    }

    // Update special UFOs and handle player bullet collisions locally (no points/EXP/drops)
    if (this.specialUFOs && this.specialUFOs.length) {
      for (let i = this.specialUFOs.length - 1; i >= 0; i--) {
        const u = this.specialUFOs[i];
        if (u && typeof u.update === 'function') u.update(player, enemyBullets, EnemyBullet, asteroids);
        if (bullets && bullets.length && !u.dead && !u.despawned) {
          for (let b = bullets.length - 1; b >= 0; b--) {
            const bullet = bullets[b];
            const dxu = bullet.x - u.x, dyu = bullet.y - u.y;
            if (Math.hypot(dxu, dyu) < (u.radius + (bullet.radius || 4))) {
              bullets.splice(b, 1);
              if (u.takeHit) u.takeHit(1);
              break;
            }
          }
        }
        if (u.dead || u.despawned) {
          this.specialUFOs.splice(i, 1);
        }
      }
      if (this.specialUFOs.length > 4) this.specialUFOs.length = 4;
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
    // Avoid rebuilding structure sprite every frame; handled via refreshIfDisplayChanged() in draw()
  }

  // Large space-frame scaffold sprite behind the boss (pure visuals)
  buildStructureSprite() {
    const margin = Math.max(80, this.shellRadius * 0.6);
    const size = (this.shellRadius * 2.8) + margin * 2;
    const canvas = this.createOffscreen(size, size);
    if (!canvas) { this.structureSprite = null; return; }
    const s = canvas.getContext('2d');
    s.save(); s.scale(this.dpr, this.dpr); s.translate(size / 2, size / 2);

    const R0 = this.shellRadius * 1.05;     // outermost ring just outside shell
    const R1 = this.shellRadius * 0.82;     // mid ring
    const R2 = this.shellRadius * 0.56;     // inner frame ring
    const RHex = this.shellRadius * 1.45;   // hex frame outside

    // Base soft vignette disc to hint mass (very subtle)
    const g = s.createRadialGradient(0, 0, R2 * 0.3, 0, 0, R0 * 1.4);
    g.addColorStop(0.0, 'rgba(60,12,12,0.22)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    s.fillStyle = g; s.beginPath(); s.arc(0, 0, R0 * 1.4, 0, Math.PI * 2); s.fill();

    // Concentric structural rings
    const ring = (r, w, col, alpha, dash=[]) => {
      s.save(); s.globalAlpha = alpha; s.strokeStyle = col; s.lineWidth = w; s.setLineDash(dash);
      s.beginPath(); s.arc(0, 0, r, 0, Math.PI * 2); s.stroke(); s.restore();
    };
    ring(R0, 6, '#4a1010', 0.6);
    ring(R0 - 14, 2, 'rgba(255,150,150,0.45)', 0.55, [12, 8]);
    ring(R1, 4, '#3a0a0a', 0.65);
    ring(R1 - 10, 2, 'rgba(255,140,140,0.38)', 0.65, [8, 6]);
    ring(R2, 3, '#320909', 0.6);

    // Radial spokes
    s.save();
    s.strokeStyle = 'rgba(255,160,160,0.22)'; s.lineWidth = 2;
    const spokes = 16;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const x0 = Math.cos(a) * (R2 * 0.9);
      const y0 = Math.sin(a) * (R2 * 0.9);
      const x1 = Math.cos(a) * (R0 * 1.02);
      const y1 = Math.sin(a) * (R0 * 1.02);
      s.beginPath(); s.moveTo(x0, y0); s.lineTo(x1, y1); s.stroke();
    }
    s.restore();

    // Outer hexagonal frame
    s.save(); s.globalAlpha = 0.55; s.strokeStyle = '#3a0a0a'; s.lineWidth = 6;
    s.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * RHex, y = Math.sin(a) * RHex;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath(); s.stroke(); s.restore();

    // Cross-bracing between rings (triangulated)
    s.save(); s.globalAlpha = 0.3; s.strokeStyle = 'rgba(255,120,120,0.28)'; s.lineWidth = 2;
    const segs = 24; const span = Math.PI * 2 / segs;
    for (let i = 0; i < segs; i++) {
      const a0 = i * span, a1 = (i + 1) * span;
      const x0 = Math.cos(a0) * R2, y0 = Math.sin(a0) * R2;
      const x1 = Math.cos(a1) * R2, y1 = Math.sin(a1) * R2;
      const x2 = Math.cos(a0 + span * 0.5) * R1, y2 = Math.sin(a0 + span * 0.5) * R1;
      s.beginPath(); s.moveTo(x0, y0); s.lineTo(x2, y2); s.lineTo(x1, y1); s.stroke();
    }
    s.restore();

    // Mount plates around inner frame
    s.save(); s.globalAlpha = 0.5; s.fillStyle = 'rgba(70,20,20,0.6)'; s.strokeStyle = 'rgba(255,200,200,0.18)'; s.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const rr = R2 * 0.92;
      const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr;
      const w = 22, h = 10;
      s.save(); s.translate(cx, cy); s.rotate(a + Math.PI / 2);
      s.beginPath(); s.rect(-w / 2, -h / 2, w, h); s.fill(); s.stroke();
      s.restore();
    }
    s.restore();

    s.restore();
    this.structureSprite = canvas;
    // Generate beacon anchors (polar) for dynamic blinking lights
    this.beaconAnchors = [];
    // Hex vertices
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      this.beaconAnchors.push({ r: RHex, a, phase: Math.random() * Math.PI * 2 });
    }
    // Inner ring beacons
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.beaconAnchors.push({ r: R1, a, phase: Math.random() * Math.PI * 2 });
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    const t = getFrameCount ? getFrameCount() : 0;
    const heavy = ((this.coreEmbers ? this.coreEmbers.length : 0) + (this.laserEmbers ? this.laserEmbers.length : 0)) > 220;
    // Collect active beams to render after boss body so they appear on top
    const activeBeams = [];

    // Rebuild sprites or reposition if DPR or canvas size changed
    this.refreshIfDisplayChanged();
    const shieldsUp = this.anyBatteriesAlive();

    // --- Background structure (behind everything) ---
    // Slow rotation for imposing space-frame silhouette
    // Back layer first
    this.structureBackAngle += this.structureBackRotateSpeed;
    if (this.structureBackSprite) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.structureBackAngle);
      const spr = this.structureBackSprite;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(spr, -spr.width / (2 * this.dpr), -spr.height / (2 * this.dpr), spr.width / this.dpr, spr.height / this.dpr);
      ctx.restore();
    }
    this.structureAngle += this.structureRotateSpeed;
    if (this.structureSprite) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.structureAngle);
      const spr = this.structureSprite;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(spr, -spr.width / (2 * this.dpr), -spr.height / (2 * this.dpr), spr.width / this.dpr, spr.height / this.dpr);
      ctx.restore();
    }
    // Blinking beacons on structure (additive)
    if (this.beaconAnchors && this.beaconAnchors.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Under heavy load, render beacons only on even frames
      if (heavy && (t & 1)) {
        // skip this frame
      } else {
        for (const b of this.beaconAnchors) {
        const a = this.structureAngle + b.a;
        const px = this.x + Math.cos(a) * b.r;
        const py = this.y + Math.sin(a) * b.r;
        const blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((t * 0.15) + b.phase));
        ctx.globalAlpha = 0.25 * blink;
        ctx.shadowColor = '#fff5f5';
        ctx.shadowBlur = 8 * blink + 4;
        ctx.fillStyle = '#ffeaea';
        ctx.beginPath(); ctx.arc(px, py, 2.2 + 0.8 * blink, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    // Soft AO/fog ellipse under shell (rotates subtly with structure)
    {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.structureAngle * 0.6);
      ctx.scale(1, 0.7);
      const rAO = this.shellRadius * 1.15;
      const g = ctx.createRadialGradient(0, 0, rAO * 0.2, 0, 0, rAO);
      g.addColorStop(0.0, 'rgba(60, 12, 12, 0.12)');
      g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, rAO, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Rotating machinery arms around the shell
    {
      const armCount = 6;
      const baseR = this.shellRadius * 0.95;
      const armLen = this.shellRadius * 0.55;
      for (let i = 0; i < armCount; i++) {
        const a = this.structureAngle * 1.2 + (i / armCount) * Math.PI * 2;
        const ax = this.x + Math.cos(a) * baseR;
        const ay = this.y + Math.sin(a) * baseR;
        const th = a + Math.PI / 2;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(th);
        // arm body
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#4a1010';
        ctx.strokeStyle = 'rgba(255,130,130,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(-6, -armLen * 0.1, 12, armLen);
        ctx.fill(); ctx.stroke();
        // joint ring
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = 'rgba(255,120,120,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // Dynamic connector beams from core to batteries (under tethers)
    if (this.batteries && this.batteries.length) {
      for (const bb of this.batteries) {
        if (bb.hits <= 0) continue;
        ctx.save();
        // Base dark beam
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = '#3a0a0a';
        ctx.lineWidth = 18;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
        // Inner light scaffold line
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = 'rgba(255,110,110,0.45)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 12]);
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
        ctx.setLineDash([]);
        // Small perpendicular brackets along the beam
        const steps = 5;
        const dx = bb.x - this.x, dy = bb.y - this.y;
        const ang = Math.atan2(dy, dx);
        const nx = Math.cos(ang), ny = Math.sin(ang);
        for (let i = 1; i < steps; i++) {
          const tpos = i / steps;
          const px = this.x + dx * tpos;
          const py = this.y + dy * tpos;
          const bx = -ny, by = nx; // perpendicular
          ctx.globalAlpha = 0.65;
          ctx.strokeStyle = 'rgba(255,120,120,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px - bx * 10, py - by * 10);
          ctx.lineTo(px + bx * 10, py + by * 10);
          ctx.stroke();
        }
        // Connector pulse traveling from core to battery during CHARGE
        if (bb.chargeTimer > 0) {
          const prog = 1 - (bb.chargeTimer / 90);
          const pulsePos = Math.max(0, Math.min(1, prog));
          const px = this.x + dx * pulsePos;
          const py = this.y + dy * pulsePos;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.75;
          ctx.shadowBlur = 16; ctx.shadowColor = '#ffffff';
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill();
          // short glowing segment behind the pulse
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6;
          const sx = this.x + dx * Math.max(0, pulsePos - 0.12);
          const sy = this.y + dy * Math.max(0, pulsePos - 0.12);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px, py); ctx.stroke();
          // Beacon sequence: cascading pips along the connector
          const seqCount = 6;
          for (let k = 0; k < seqCount; k++) {
            const ph = (t * 0.015 + k * 0.16) % 1;
            if (ph <= pulsePos) {
              const qx = this.x + dx * ph;
              const qy = this.y + dy * ph;
              // Use cached white dot sprite (no per-frame shadowBlur) for pips
              const dot = this.whiteDotSprite;
              const size = 8; // logical px
              if (dot) {
                ctx.globalAlpha = 0.35;
                ctx.drawImage(dot, qx - size * 0.5, qy - size * 0.5, size, size);
              } else {
                ctx.globalAlpha = 0.35;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(qx, qy, 3, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
          ctx.restore();
        }
        ctx.restore();
      }
    }

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
      // White ring only while CHARGING or FIRING (never after)
      if (b.chargeTimer > 0 || b.fireTimer > 0) {
        // Under heavy load, draw every other frame to cut fill/blurs cost
        if (!(heavy && (t & 1))) {
          const phase = b.chargeTimer > 0 ? (1 - b.chargeTimer / 90) : (b.fireTimer / 45);
          const glowR = b.radius + 8 + Math.sin(phase * Math.PI) * 4;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const alpha = (0.16 + 0.16 * phase) * (heavy ? 0.75 : 1);
          ctx.globalAlpha = alpha;
          ctx.shadowBlur = (10 + 10 * phase) * (heavy ? 0.6 : 1);
          ctx.shadowColor = '#ffffff';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = (6 + 4 * phase) * (heavy ? 0.8 : 1); // hollow ring so center stays visible
          ctx.beginPath(); ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
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
        // Soft red outer glow appears ONLY during charge
        ctx.save();
        const glowPhase = 1 - (b.chargeTimer / 90);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (0.65 + 0.25 * glowPhase) * (heavy ? 0.75 : 1);
        ctx.shadowBlur = (14 + 8 * glowPhase) * (heavy ? 0.7 : 1); ctx.shadowColor = '#f55';
        ctx.strokeStyle = '#f66'; ctx.lineWidth = heavy ? 2 : 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius - 1, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        const prog = 1 - (b.chargeTimer / 90);
        if (!(heavy && (t & 1))) {
          ctx.globalAlpha = 0.9 * (heavy ? 0.7 : 1);
          ctx.shadowBlur = 12 * (heavy ? 0.7 : 1); ctx.shadowColor = '#ff0';
          ctx.strokeStyle = '#ff0'; ctx.lineWidth = heavy ? 4 : 6;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.radius + 10 + Math.sin(prog * Math.PI) * 4, 0, Math.PI * 2); ctx.stroke();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
      }
      // Firing beam (kept dynamic)
      if (b.fireTimer > 0) {
        // Rendering handled later using cached sprite (built at fire start)
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
        // Add large white glow overlay along the tether only during CHARGE
        if (b.chargeTimer > 0 && !(heavy && (t & 1))) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.35 * (heavy ? 0.6 : 1); // low-medium alpha
          ctx.shadowBlur = 18 * (heavy ? 0.7 : 1); ctx.shadowColor = '#ffffff';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = (heavy ? 3 : 4); // soft wide glow
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.restore();
        }
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
      const stepCore = (heavy || this.coreEmbers.length > 160) ? 2 : 1;
      for (let i = 0; i < this.coreEmbers.length; i += stepCore) {
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

    // Core sweeping laser beam/warning (sprite-based)
    if (this.sweepLaserWarningTimer > 0 || this.sweepLaserActiveTimer > 0) {
      const ctx = this.deps.ctx;
      const player = this.deps.player;
      const warn = this.sweepLaserWarningTimer > 0;
      const a = warn ? Math.atan2(player.y - this.y, player.x - this.x) : this.sweepLaserAngle;
      const x2 = this.x + Math.cos(a) * 2400;
      const y2 = this.y + Math.sin(a) * 2400;
      const dx = x2 - this.x, dy = y2 - this.y;
      const len = Math.hypot(dx, dy);
      const spr = warn ? this._beamStripWarnCore : this._beamStripActiveCore;
      if (spr) {
        const dh = spr.height / this.dpr;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = warn ? 0.9 : 1.0;
        const sprWpx = spr.width;
        const coreWpx = 128 * this.dpr;
        const padPx = Math.max(0, Math.floor((sprWpx - coreWpx) / 2));
        const srcW = sprWpx - padPx;
        const srcH = spr.height;
        ctx.drawImage(spr, padPx, 0, srcW, srcH, 0, -dh / 2, len, dh);
        ctx.restore();
      } else {
        // Fallback stroked beam
        const color = warn ? '#ff0' : '#f66';
        const width = warn ? 3 : 8;
        ctx.save();
        ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = warn ? 10 : 16; ctx.lineWidth = width; ctx.globalAlpha = warn ? 0.8 : 1;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = warn ? 'rgba(255,255,210,0.9)' : '#ffffff';
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = warn ? 6 : 10; ctx.lineWidth = warn ? 1.2 : 3; ctx.globalAlpha = warn ? 0.9 : 0.95;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
      }
    }

    // Slam telegraph/active arc visuals (rotating arc band outside the shell)
    if (this.slamWarningTimer > 0 || this.slamActiveTimer > 0) {
      const warn = this.slamWarningTimer > 0;
      const r = (typeof this.getSlamRadius === 'function') ? this.getSlamRadius() : (this.shellRadius + (this.slamBaseOffset * this.slamDistanceScale));
      const halfArc = (this.slamArc || (Math.PI / 4)) * 0.5;
      const a0 = this.slamAngle - halfArc;
      const a1 = this.slamAngle + halfArc;
      // Visual thickness ~1/3 of previous (do not alter collision band)
      const band = Math.max(8, Math.floor(((this.slamBandHalfWidth || 60) * 2) / 3));
      const color = warn ? '#ffcc66' : '#f66';
      // Fade in telegraph from 0 -> 0.30 over wind-up
      let alpha;
      if (warn) {
        const total = this.slamWarnTotal || 60;
        const k = Math.max(0, Math.min(1, 1 - (this.slamWarningTimer / total)));
        alpha = 0.30 * k;
      } else {
        alpha = 0.9;
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Outer glow stroke (thicker)
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = warn ? 10 : 14; // slightly reduced blur for perf
      ctx.lineWidth = band;
      ctx.beginPath(); ctx.arc(this.x, this.y, r, a0, a1); ctx.stroke();
      // Inner crisp definition line
      ctx.shadowBlur = warn ? 4 : 8;
      ctx.lineWidth = Math.max(2, Math.floor(band * 0.15));
      ctx.beginPath(); ctx.arc(this.x, this.y, r, a0, a1); ctx.stroke();
      // Optional WebGL overlay: sprinkle a few glow dots along the arc (cheap and pretty)
      try {
        if (typeof window !== 'undefined' && window.glRenderer && window.glRenderer.spawnAboveDot && ((t % 3) === 0)) {
          const steps = warn ? 6 : 8;
          const col = warn ? 0xffcc66 : 0xff6666;
          const rad = warn ? 1.6 : 2.2;
          for (let i = 0; i <= steps; i++) {
            const aa = a0 + (i / steps) * (a1 - a0);
            const px = this.x + Math.cos(aa) * r;
            const py = this.y + Math.sin(aa) * r;
            window.glRenderer.spawnAboveDot(px, py, col, rad, 0, 0, 10, 0.9);
          }
        }
      } catch (e) {}
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

    // Battery chromatic shockwaves (sprite-based, culled)
    if (this.batteryShockwaves && this.batteryShockwaves.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const spr = this.shockwaveSprite;
      const baseR = this._shockwaveBaseRadius || 1;
      const canvas = this.deps && this.deps.canvas;
      for (const s of this.batteryShockwaves) {
        const prog = s.age / s.life; // 0..1
        const r = (0.35 + 0.65 * prog) * s.maxRadius;
        const fade = Math.max(0, 1 - prog);
        if (spr) {
          const scale = Math.max(0.01, r / baseR);
          const dw = (spr.width / this.dpr) * scale;
          const dh = (spr.height / this.dpr) * scale;
          if (canvas) {
            const left = s.x - dw / 2, top = s.y - dh / 2;
            const right = left + dw, bottom = top + dh;
            if (right < -20 || bottom < -20 || left > canvas.width + 20 || top > canvas.height + 20) continue;
          }
          ctx.globalAlpha = 0.6 * fade;
          ctx.drawImage(spr, s.x - dw / 2, s.y - dh / 2, dw, dh);
        } else {
          // Fallback: simple white ring
          ctx.globalAlpha = 0.25 * fade;
          ctx.shadowBlur = 8 * fade; ctx.shadowColor = '#fff';
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(2, r), 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Draw all active battery beams on top of boss body (core and shell) using a reusable strip sprite
    {
      const spr = this._beamStripBattery;
      if (spr) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const dh = spr.height / this.dpr;
        const sprWpx = spr.width;
        const coreWpx = 128 * this.dpr;
        const padPx = Math.max(0, Math.floor((sprWpx - coreWpx) / 2));
        const srcW = sprWpx - padPx;
        const srcH = spr.height;
        for (const b of this.batteries) {
          if (b.fireTimer <= 0) continue;
          const ang = Math.atan2(b.aimY - b.y, b.aimX - b.x);
          const x2 = b.x + Math.cos(ang) * 2400;
          const y2 = b.y + Math.sin(ang) * 2400;
          const dx = x2 - b.x, dy = y2 - b.y;
          const len = Math.hypot(dx, dy);
          const flicker = 0.85 + Math.random() * 0.15;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(ang);
          ctx.globalAlpha = flicker;
          ctx.drawImage(spr, padPx, 0, srcW, srcH, 0, -dh / 2, len, dh);
          ctx.restore();
        }
        ctx.restore();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      } else {
        // Fallback: draw stroked lines if sprite missing
        for (const b of this.batteries) {
          if (b.fireTimer <= 0) continue;
          const ang = Math.atan2(b.aimY - b.y, b.aimX - b.x);
          const x2 = b.x + Math.cos(ang) * 2400;
          const y2 = b.y + Math.sin(ang) * 2400;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = '#ff0080'; ctx.shadowColor = '#f09'; ctx.shadowBlur = 22; ctx.lineWidth = 12;
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Laser embers (pink) additive rendering after beams and pulses
    // Draw Canvas embers only when WebGL overlay embers are not used
    if (!(typeof window !== 'undefined' && window.glRenderer && window.glRenderer.spawnAboveDot) && this.laserEmbers && this.laserEmbers.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const stepLaser = (heavy || this.laserEmbers.length > 140) ? 2 : 1;
      for (let idx = 0; idx < this.laserEmbers.length; idx += stepLaser) {
        const e = this.laserEmbers[idx];
        const prog = 1 - (e.life / e.maxLife);
        const alpha = Math.max(0, 0.8 * (1 - prog));
        const scale = (0.9 + e.size * 0.6) * (1 + prog * 0.6);
        ctx.globalAlpha = alpha;
        if (this.laserEmberSprite) {
          const dw = (this.laserEmberSprite.width / this.dpr) * scale * 1.0;
          const dh = (this.laserEmberSprite.height / this.dpr) * scale * 1.0;
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

    // Battery embers (white) additive rendering after beams
    if (this.batteryEmbers && this.batteryEmbers.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.batteryEmbers) {
        const prog = 1 - (e.life / e.maxLife);
        const alpha = Math.max(0, 0.85 * (1 - prog));
        const size = 1 + prog * 10; // expand slightly
        ctx.globalAlpha = alpha;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12 * (1 - prog) + 6;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(e.x, e.y, size * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Draw special UFOs on top of boss body (they manage their own trails)
    if (this.specialUFOs && this.specialUFOs.length) {
      for (const u of this.specialUFOs) {
        if (u && typeof u.draw === 'function') u.draw(ctx);
      }
    }

    // Full-screen explosion overlay when the boss is defeated
    if (this._finalBlastTimer > 0 && this.deps.canvas) {
      const c = this.deps.canvas;
      const t = this._finalBlastTimer / 90; // 90-frame fade
      // Bright flash center with radial falloff
      ctx.save();
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, Math.max(c.width, c.height));
      grad.addColorStop(0.0, 'rgba(255,255,255,' + (0.85 * t).toFixed(3) + ')');
      grad.addColorStop(0.25, 'rgba(255,220,180,' + (0.6 * t).toFixed(3) + ')');
      grad.addColorStop(1.0, 'rgba(20,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      this._finalBlastTimer--;
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
    this.buildWhiteDotSprite();
    this.buildShockwaveSprite();
    this.buildStructureSprite();
    this.buildStructureBackSprite();
    this.buildCoreBeamStripSprites();
    this.buildBatteryBeamStripSprite();
  }

  // Build DPR-aware beam strip sprites (warning and active) for the core sweep laser
  buildCoreBeamStripSprites() {
    const make = (colorCore, colorGlow, height, outerAlpha = 1, innerAlpha = 0.95) => {
      const pad = 28;
      const w = 128 + pad * 2;
      const h = height + pad * 2;
      const c = this.createOffscreen(w, h);
      if (!c) return null;
      const g = c.getContext('2d');
      g.save();
      g.scale(this.dpr, this.dpr);
      g.translate(pad, h / 2);
      g.globalCompositeOperation = 'lighter';
      // Outer glow bar
      g.shadowColor = colorGlow;
      g.shadowBlur = 28;
      g.globalAlpha = outerAlpha;
      g.fillStyle = colorGlow;
      g.fillRect(0, -height / 2, 128, height);
      // Inner bright core
      g.shadowBlur = 12;
      g.globalAlpha = innerAlpha;
      const innerH = Math.max(2, height * 0.5);
      g.fillStyle = colorCore;
      g.fillRect(0, -innerH / 2, 128, innerH);
      g.restore();
      return c;
    };
    // Match Dreadship look
    this._beamStripWarnCore = make('rgba(255,255,210,0.95)', '#ff0', 12, 0.8, 0.9);
    this._beamStripActiveCore = make('#ffffff', '#f66', 28, 1.0, 0.95);
  }

  // Build DPR-aware beam strip sprite for corner battery beams (pink outer glow + white core)
  buildBatteryBeamStripSprite() {
    const pad = 24;
    const w = 128 + pad * 2; // logical core width 128, padded for glow
    const h = 24 + pad * 2;  // visual thickness similar to previous beam
    const c = this.createOffscreen(w, h);
    if (!c) { this._beamStripBattery = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(pad, h / 2);
    g.globalCompositeOperation = 'lighter';
    // Outer pink glow bar
    g.shadowColor = '#f09';
    g.shadowBlur = 22;
    g.globalAlpha = 0.95;
    g.fillStyle = '#ff0080';
    g.fillRect(0, -24 / 2, 128, 24);
    // Inner bright white core
    g.shadowBlur = 10;
    g.globalAlpha = 1.0;
    g.fillStyle = '#ffffff';
    const innerH = 10;
    g.fillRect(0, -innerH / 2, 128, innerH);
    g.restore();
    this._beamStripBattery = c;
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
    // Rebuild structure sprite on resize to match current radii
    this.buildStructureSprite();
    this.buildStructureBackSprite();
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

      // Base crisp rim (no glow baked-in; red glow now drawn dynamically only while charging)
      sctx.globalAlpha = 1; sctx.shadowBlur = 0; sctx.strokeStyle = baseColor; sctx.lineWidth = 2.2;
      sctx.beginPath(); sctx.arc(0, 0, radius - 1, 0, Math.PI * 2); sctx.stroke();

      // Subtle baked ambient halo (very low alpha, no shadow, cheap to draw)
      // Radial gradient that brightens near the rim and fades inwards; provides uniform presence
      const R = radius - 1.5;
      const grad = sctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R);
      grad.addColorStop(0.0, 'rgba(255, 102, 102, 0.0)');
      grad.addColorStop(0.7, 'rgba(255, 102, 102, 0.08)');
      grad.addColorStop(1.0, 'rgba(255, 102, 102, 0.16)');
      sctx.fillStyle = grad;
      sctx.globalAlpha = 1;
      sctx.beginPath(); sctx.arc(0, 0, R, 0, Math.PI * 2); sctx.fill();

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

  // Cached white glow dot used for connector pips and small additive glows
  buildWhiteDotSprite() {
    const size = 16;
    const c = this.createOffscreen(size, size);
    if (!c) { this.whiteDotSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    const cx = size / 2, cy = size / 2, r = size * 0.35;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.restore();
    this.whiteDotSprite = c;
  }

  // Build cached chromatic shockwave sprite (three subtle concentric rings)
  buildShockwaveSprite() {
    const R = this._shockwaveBaseRadius;
    const pad = 8;
    const size = (R + pad) * 2;
    const c = this.createOffscreen(size, size);
    if (!c) { this.shockwaveSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(size / 2, size / 2);
    g.globalCompositeOperation = 'lighter';
    const specs = [
      { color: '#ff5a5a', w: 3, r: R - 1.0, blur: 8 },
      { color: '#66ffff', w: 3, r: R + 0.0, blur: 8 },
      { color: '#ffffff', w: 2, r: R + 1.0, blur: 6 }
    ];
    for (const sp of specs) {
      g.shadowBlur = sp.blur; g.shadowColor = sp.color;
      g.strokeStyle = sp.color; g.lineWidth = sp.w;
      g.beginPath(); g.arc(0, 0, sp.r, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
    this.shockwaveSprite = c;
  }

  // Build and cache a beam sprite for a battery shot to avoid per-frame long strokes
  _buildBeamSpriteFor(battery, x1, y1, x2, y2) {
    if (!battery) return;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const midx = (x1 + x2) * 0.5;
    const midy = (y1 + y2) * 0.5;
    const coreOuter = 12; // outer glow thickness
    const coreInner = 5;  // inner bright core thickness
    const pad = 24;       // glow padding on all sides
    const w = len + pad * 2;
    const h = coreOuter + pad * 2;
    const c = this.createOffscreen(w, h);
    if (!c) { battery._beamSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(pad, h / 2);
    g.globalCompositeOperation = 'lighter';
    // Outer glow bar (pink)
    g.shadowColor = '#f09';
    g.shadowBlur = 22;
    g.globalAlpha = 0.95;
    g.fillStyle = '#ff0080';
    g.fillRect(0, -coreOuter / 2, len, coreOuter);
    // Inner bright white core
    g.shadowBlur = 10;
    g.globalAlpha = 1.0;
    g.fillStyle = '#ffffff';
    g.fillRect(0, -coreInner / 2, len, coreInner);
    g.restore();
    battery._beamSprite = { canvas: c, angle, midx, midy };
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
    sctx.fillStyle = 'rgba(206, 26, 119, 0.35)';
    sctx.beginPath(); sctx.arc(0, 0, 4, 0, Math.PI * 2); sctx.fill();
    // Inner hot core
    sctx.shadowBlur = 0;
    sctx.fillStyle = 'rgba(255, 117, 237, 0.95)';
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
              const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone', 'durable'];
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
    // Also allow particles to damage special UFOs (rainbow trail, flak, etc.)
    if (this.specialUFOs && this.specialUFOs.length) {
      for (let i = this.specialUFOs.length - 1; i >= 0; i--) {
        const u = this.specialUFOs[i];
        if (u && !u.dead && !u.despawned) {
          const dxu = particle.x - u.x, dyu = particle.y - u.y;
          if (Math.hypot(dxu, dyu) < (u.radius + 12)) {
            if (u.takeHit) u.takeHit(1);
            if (u.dead || u.despawned) this.specialUFOs.splice(i, 1);
          }
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
    // Explosion damage vs special UFOs
    if (this.specialUFOs && this.specialUFOs.length) {
      for (let i = this.specialUFOs.length - 1; i >= 0; i--) {
        const u = this.specialUFOs[i];
        if (!u || u.dead || u.despawned) { this.specialUFOs.splice(i, 1); continue; }
        const dxu = u.x - cx, dyu = u.y - cy;
        if (Math.hypot(dxu, dyu) <= radius + u.radius) {
          if (u.takeHit) u.takeHit(1);
          if (u.dead || u.despawned) this.specialUFOs.splice(i, 1);
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
    // Laser vs special UFOs
    if (this.specialUFOs && this.specialUFOs.length) {
      for (let i = this.specialUFOs.length - 1; i >= 0; i--) {
        const u = this.specialUFOs[i];
        if (!u || u.dead || u.despawned) { this.specialUFOs.splice(i, 1); continue; }
        if (lineCircleCollision(x1, y1, x2, y2, u.x, u.y, u.radius)) {
          if (u.applyLaserTick) u.applyLaserTick(1); else if (u.takeHit) u.takeHit(1);
          if (u.dead || u.despawned) this.specialUFOs.splice(i, 1);
          any = true;
        }
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
    const { createExplosion, powerups, Powerup, enemyBullets, drones, setShake, awardPoints, applyShockwave, glRenderer } = this.deps;
    this.defeated = true;
    // Kick off full-screen blast overlay for ~1.5s
    this._finalBlastTimer = 90;
    // Also trigger central explosion and screen shake
    createExplosion && createExplosion(this.x, this.y, Math.max(220, this.shellRadius * 2.2), '#ffaaaa');
    setShake && setShake(34, 12);
    // Pulse WebGL overlay if available
    try { glRenderer && glRenderer.pulseExplosion && glRenderer.pulseExplosion(this.x, this.y, 1.0); } catch (e) {}
    awardPoints && awardPoints(1200, this.x, this.y, true);
    // Massive arena shockwave push for dramatic finish
    if (applyShockwave) applyShockwave(this.x, this.y, Math.max(800, this.shellRadius * 6), 12);
    // Reduce micro-explosions to keep perf while overlay runs (optional fine ring)
    if (createExplosion) {
      const count = 18;
      const baseR = Math.max(260, this.shellRadius * 1.4);
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const ex = this.x + Math.cos(ang) * baseR;
        const ey = this.y + Math.sin(ang) * baseR;
        createExplosion(ex, ey, 28 + ((Math.random() * 14) | 0), '#ffaa99', 'micro');
      }
    }
    // Victory HUD message
    if (this.deps.showHUDMessage) this.deps.showHUDMessage('Congratulations you have defeated the asteroids!', 300);
    if (enemyBullets) enemyBullets.length = 0;
    if (drones) drones.length = 0;
    // celebratory drops
    if (powerups && Powerup) {
      const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone', 'durable'];
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

  // Spawn two special UFOs from the core center that fly left and right
  spawnSpecialUFOs() {
    const { canvas, getFrameCount, UFO } = this.deps;
    if (!UFO || !canvas) return;
    const makeUfo = (dir) => {
      const u = new UFO({ canvas, getFrameCount });
      u.x = this.x; u.y = this.y;
      u.targetY = this.y;
      const spd = Math.max(1.5, u.speed || 1.2);
      u.vx = dir < 0 ? -spd : spd;
      u.health = Math.max(8, Math.min(15, u.health | 0));
      u._specialBossUFO = true;
      return u;
    };
    this.specialUFOs.push(makeUfo(-1));
    this.specialUFOs.push(makeUfo(1));
  }
}
