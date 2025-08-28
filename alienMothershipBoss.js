// Alien Mothership Boss (Level 12)
// Five red shield nodes (3 HP each) guarding a 5 HP core.
// Slowly patrols vertically on the right side, deploys drone waves, and
// every 3 seconds one surviving node charges for 2 seconds then fires a red
// laser at the player's position captured at charge start.
//
// Deps expected (injected from ast.html):
// {
//   canvas, ctx,
//   player,
//   bullets, enemyBullets, asteroids, powerups, drones, mines,
//   EnemyBullet, Asteroid, Powerup, Drone, AttackDrone, Mine,
//   createExplosion, awardPoints, lineCircleCollision,
//   setShake: (frames, intensity) => void,
//   onPlayerHit: () => void,
//   getFrameCount: () => number,
// }

export class AlienMothershipBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;

    // Position on the right; slow vertical patrol
    this.x = canvas.width - 140;
    this.y = canvas.height / 2;
    this.vy = 0.6;
    this.yMin = 90;
    this.yMax = canvas.height - 90;

    // Core
    this.coreRadius = 54;
    this.coreHealth = 6;
    this.defeated = false;
    this.coreExposed = false; // becomes true when all shield nodes are destroyed
    // Core pulse attack (visual + pushback)
    this.pulseCooldown = 300; // every 5s
    this.pulses = []; // visual expanding rings {age, life, maxRadius}

    // Phase 2 (post-core-break) state
    this.phase2 = false;           // when true, core is mobile and must be killed again
    this.phase2Health = 0;         // HP during phase 2
    this.phase2Invuln = 0;         // invulnerability timer in frames (e.g., 120 = 2s)
    this.vx = 0;                   // horizontal velocity used in phase 2
    // note: this.vy already exists (used in phase 1 vertical patrol), reused in phase 2
    this.trail = [];               // recent positions for red trail rendering
    this.heading = Math.PI;        // facing direction (radians). Default pointing left like before

    // Nodes arranged vertically in front (to the left) of the ship
    this.nodeOffsetX = this.coreRadius + 80; // distance in front of mothership core
    const offsetsY = [-120, -60, 0, 60, 120];
    this.nodes = offsetsY.map(offY => ({
      offY,
      hits: 3,
      radius: 26,
      pulse: Math.random() * Math.PI * 2,
      hitFlash: 0,
      chargeTimer: 0,  // frames remaining while charging
      fireTimer: 0,    // frames remaining while laser is active
      aimX: 0, aimY: 0 // captured player position at charge start
    }));

    // Timers
    this.spawnTime = getFrameCount ? getFrameCount() : 0;
    this.droneCooldown = 160; // periodic drone waves
    this.nodeLaserCooldown = 105; // start a charge ~every 1.75s if none active (30% faster than 150)
    this.attackDroneCooldown = 300; // red AttackDrone every ~5s

    // One-time: spawn 3 mines in front of top/mid/bottom nodes
    this.spawnIntroMines();
  }

  isDefeated() { return this.defeated; }

  nodePositions() {
    // Absolute positions for each node based on current boss position
    return this.nodes.map(n => ({
      x: this.x - this.nodeOffsetX,
      y: this.y + n.offY,
      radius: n.radius,
      ref: n,
    }));
  }

  spawnIntroMines() {
    const { mines, Mine } = this.deps;
    if (!mines || !Mine) return;
    const picks = [0, 2, 4]; // top, middle, bottom indexes
    const pos = this.nodePositions();
    picks.forEach(idx => {
      if (!pos[idx]) return;
      const p = pos[idx];
      const mx = p.x - 50; // a bit further in front of nodes (toward screen center)
      const my = p.y;
      mines.push(new Mine(mx, my));
    });
  }

  update() {
    const { canvas, player, drones, Drone, AttackDrone, lineCircleCollision, onPlayerHit, enemyBullets, applyShockwave } = this.deps;

    // Movement
    if (!this.phase2) {
      // Phase 1: vertical patrol with bounce on the right side
      this.y += this.vy;
      if (this.y < this.yMin) { this.y = this.yMin; this.vy = Math.abs(this.vy); }
      if (this.y > this.yMax) { this.y = this.yMax; this.vy = -Math.abs(this.vy); }
    } else {
      // Phase 2: mobile avoidance of the player across the whole screen
      if (this.phase2Invuln > 0) this.phase2Invuln--;
      const { canvas } = this.deps;
      const dx = (player.x - this.x);
      const dy = (player.y - this.y);
      const dist = Math.hypot(dx, dy) || 1;
      // Accelerate away from the player
      const avoid = 0.12;
      this.vx += (-dx / dist) * avoid;
      this.vy += (-dy / dist) * avoid;
      // Soft avoid screen edges
      const edge = 80;
      if (this.x < edge) this.vx += 0.2;
      if (this.x > canvas.width - edge) this.vx -= 0.2;
      if (this.y < edge) this.vy += 0.2;
      if (this.y > canvas.height - edge) this.vy -= 0.2;
      // Clamp speed
      const maxSpeed = 2.6;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > maxSpeed) { this.vx = (this.vx / sp) * maxSpeed; this.vy = (this.vy / sp) * maxSpeed; }
      // Integrate position
      this.x += this.vx;
      this.y += this.vy;
      // Toroidal wrapping like the player (avoid getting stuck on edges)
      const r = this.coreRadius;
      if (this.x < -r) this.x = canvas.width + r;
      else if (this.x > canvas.width + r) this.x = -r;
      if (this.y < -r) this.y = canvas.height + r;
      else if (this.y > canvas.height + r) this.y = -r;
      // Update heading to face movement direction (smooth)
      const speedNow = Math.hypot(this.vx, this.vy);
      if (speedNow > 0.05) {
        const desired = Math.atan2(this.vy, this.vx);
        let diff = ((desired - this.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
        this.heading += diff * 0.18; // smoothing factor
      }
      // Trail update
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 28) this.trail.shift();
    }

    // Animate nodes
    for (let n of this.nodes) {
      n.pulse += 0.1;
      if (n.hitFlash > 0) n.hitFlash--;
    }

    // Periodic core pushback pulse attack (every 5s)
    if (this.pulseCooldown > 0) this.pulseCooldown--;
    if (this.pulseCooldown === 0) {
      // Trigger gameplay effect
      const radius = 400; // larger than mines
      const strength = 9.5; // slightly stronger than mine shockwave
      if (applyShockwave) applyShockwave(this.x, this.y, radius, strength);
      if (this.deps.createExplosion) this.deps.createExplosion(this.x, this.y, 120, '#ffee88');
      if (this.deps.setShake) this.deps.setShake(12, 5);
      // Visual ring for ~0.6s
      this.pulses.push({ age: 0, life: 36, maxRadius: radius });
      this.pulseCooldown = 300;
    }

    // Maintain a constant drone presence:
    // - Before core exposed: keep 3 active drones
    // - After core exposed: keep 6 active drones (double pressure)
    if (drones && Drone) {
      const active = drones.filter(d => !d.dead).length;
      const target = this.coreExposed ? 6 : 3;
      const need = Math.max(0, target - active);
      for (let i = 0; i < need; i++) {
        const baseAng = Math.atan2(player.y - this.y, player.x - this.x);
        const a = baseAng + (Math.random() - 0.5) * 0.25; // small variation
        const sx = this.x - this.coreRadius - 20 + Math.cos(a) * 12;
        const sy = this.y + Math.sin(a) * 24;
        const d = new Drone(sx, sy);
        d.maxSpeed *= 1.3;
        d.vx = Math.cos(a) * d.maxSpeed;
        d.vy = Math.sin(a) * d.maxSpeed;
        drones.push(d);
      }
    }

    // Periodic AttackDrone spawner (every 5s)
    if (this.attackDroneCooldown > 0) this.attackDroneCooldown--;
    if (this.attackDroneCooldown === 0 && drones && AttackDrone) {
      // Enforce global cap of 5 alive AttackDrones
      const aliveAttack = drones ? drones.filter(d => (d instanceof AttackDrone) && !d.dead).length : 0;
      if (aliveAttack >= 5) {
        this.attackDroneCooldown = 60; // retry sooner when capped
      } else {
      const baseAng = Math.atan2(player.y - this.y, player.x - this.x);
      const a = baseAng + (Math.random() - 0.5) * 0.2;
      const sx = this.x - this.coreRadius - 16 + Math.cos(a) * 10;
      const sy = this.y + Math.sin(a) * 18;
      const ad = new AttackDrone(sx, sy);
      const sp = ad.maxSpeed * 1.25;
      ad.vx = Math.cos(a) * sp;
      ad.vy = Math.sin(a) * sp;
      drones.push(ad);
      this.attackDroneCooldown = 300;
      }
    }

    // Node laser selection and lifecycle
    const anyActiveNodeLaser = this.nodes.some(n => n.chargeTimer > 0 || n.fireTimer > 0);
    if (!anyActiveNodeLaser && this.nodeLaserCooldown > 0) this.nodeLaserCooldown--;
    if (!anyActiveNodeLaser && this.nodeLaserCooldown === 0) {
      // Pick a surviving node to charge
      const candidates = this.nodes.filter(n => n.hits > 0);
      if (candidates.length > 0) {
        const n = candidates[(Math.random() * candidates.length) | 0];
        n.chargeTimer = 120; // 2 seconds charge-up
        n.fireTimer = 0;
        n.aimX = player.x; // capture position at charge start
        n.aimY = player.y;
      }
      this.nodeLaserCooldown = 105; // schedule next node charge ~30% sooner than before
    }

    // Progress node charge/fire and apply damage when firing
    const positions = this.nodePositions();
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const p = positions[i];
      if (n.hits <= 0) continue;
      if (n.chargeTimer > 0) {
        n.chargeTimer--;
        if (n.chargeTimer === 0) {
          n.fireTimer = 36; // ~0.6s beam
        }
      } else if (n.fireTimer > 0) {
        n.fireTimer--;
        // Beam is a straight line from node to the captured position extended outward
        const ang = Math.atan2(n.aimY - p.y, n.aimX - p.x);
        const x2 = p.x + Math.cos(ang) * 2400;
        const y2 = p.y + Math.sin(ang) * 2400;
        // Check player hit
        if (lineCircleCollision(p.x, p.y, x2, y2, player.x, player.y, player.radius)) {
          onPlayerHit && onPlayerHit();
        }
      }
    }

    // Detect transition: all shields destroyed -> core exposed indicator + ramp drones
    const remaining = this.nodes.filter(n => n.hits > 0).length;
    if (remaining === 0 && !this.coreExposed) {
      this.coreExposed = true;
      // Visual cue: brief bright flash at the core and a subtle shake
      if (this.deps.createExplosion) this.deps.createExplosion(this.x, this.y, 110, '#ffea00');
      if (this.deps.setShake) this.deps.setShake(14, 6);
      // HUD announcement for core vulnerability
      if (this.deps.showHUDMessage) this.deps.showHUDMessage('CORE EXPOSED!', 180);
      // Kick off pressure phase immediately
      this.droneCooldown = 0;
    }

    // Update pulse visuals
    if (this.pulses.length) {
      for (let i = this.pulses.length - 1; i >= 0; i--) {
        const p = this.pulses[i];
        p.age++;
        if (p.age >= p.life) this.pulses.splice(i, 1);
      }
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    const t = getFrameCount ? getFrameCount() : 0;

    // Hull/core
    ctx.save();
    // Phase 2 red trail
    if (this.phase2 && this.trail && this.trail.length) {
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        const prog = i / this.trail.length; // older -> smaller alpha
        const alpha = 0.15 + prog * 0.35;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 18 * prog + 6;
        ctx.shadowColor = '#f44';
        ctx.fillStyle = 'rgba(220,0,0,0.7)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(10, this.coreRadius * 0.35 + prog * 6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    // Outer hull glow rings
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = i === 0 ? 1 : 0.4;
      ctx.strokeStyle = '#f66';
      ctx.shadowColor = '#f44';
      ctx.shadowBlur = 18 - i * 4;
      ctx.lineWidth = i === 0 ? 3 : 1.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.coreRadius + 18 + i * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Inner core: player ship silhouette (2.5x), hot red fill + pale red outline with pulsing glow
    const glowPhase = (Math.sin(t * 0.2) * 0.5 + 0.5); // 0..1
    const scale = 2.5;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Rotate so the silhouette points along movement; defaults to left when stationary/phase 1
    ctx.rotate(this.heading);
    ctx.shadowColor = '#f55';
    ctx.shadowBlur = 14 + glowPhase * 18;
    // Fill (hot red)
    ctx.fillStyle = '#d00';
    ctx.beginPath();
    ctx.moveTo(15 * scale, 0);
    ctx.lineTo(-10 * scale, -10 * scale);
    ctx.lineTo(-5 * scale, 0);
    ctx.lineTo(-10 * scale, 10 * scale);
    ctx.closePath();
    ctx.fill();
    // Outline (pale red)
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffb3b3';
    ctx.stroke();
    // Inner hot pulse
    ctx.globalAlpha = 0.18 + glowPhase * 0.22;
    ctx.shadowBlur = 24 + glowPhase * 20;
    ctx.fillStyle = 'rgba(255,80,80,0.65)';
    ctx.beginPath();
    ctx.arc(0, 0, 10 + glowPhase * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.shadowBlur = 0;

    // Core exposed indicator (no health pips on this boss)
    if (this.coreExposed) {
      const spin = t * 0.06;
      ctx.strokeStyle = '#ffea00';
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.9;
      // Draw four rotating arc segments around the core to signal vulnerability
      for (let k = 0; k < 4; k++) {
        const start = spin + k * (Math.PI / 2);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.coreRadius + 24, start, start + Math.PI / 6);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Draw active pulse rings
    if (this.pulses && this.pulses.length) {
      for (const p of this.pulses) {
        const prog = p.age / p.life;
        const r = Math.max(this.coreRadius + 24, prog * p.maxRadius);
        const alpha = Math.max(0, 0.55 * (1 - prog));
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 20 * (1 - prog);
        ctx.shadowColor = '#ffee88';
        ctx.strokeStyle = '#ffdd55';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Nodes and their charge/firing visuals
    const positions = this.nodePositions();
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.hits <= 0) continue; // do not draw destroyed nodes
      const p = positions[i];
      const baseColor = '#f66';
      const flash = n.hitFlash > 0 ? (n.hitFlash / 8) : 0;
      const glow = 14 + Math.sin(n.pulse) * 4 + flash * 8;
      const color = n.hitFlash > 0 ? '#fff' : baseColor;

      // Draw charging ring or idle glow
      for (let k = 2; k >= 0; k--) {
        ctx.globalAlpha = k === 0 ? 1 : Math.min(0.8, 0.45 + flash * 0.3);
        ctx.shadowBlur = Math.max(0, glow - k * 4);
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = k === 0 ? 2.5 : 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, n.radius - k * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Armor rings for remaining hits
      ctx.globalAlpha = 0.95;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      for (let h = 0; h < n.hits; h++) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, n.radius - 8 - h * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Charging indicator
      if (n.chargeTimer > 0) {
        const prog = 1 - (n.chargeTimer / 120);
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff0';
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, n.radius + 10 + Math.sin(prog * Math.PI) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Firing beam
      if (n.fireTimer > 0) {
        const ang = Math.atan2(n.aimY - p.y, n.aimX - p.x);
        const x2 = p.x + Math.cos(ang) * 2400;
        const y2 = p.y + Math.sin(ang) * 2400;
        const flicker = 0.75 + Math.random() * 0.25;
        ctx.globalAlpha = flicker;
        ctx.shadowBlur = 12 * flicker;
        ctx.shadowColor = '#f09';
        ctx.strokeStyle = 'rgba(255,0,128,1)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // inner core
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  handleBulletCollision(bullet) {
    const { createExplosion } = this.deps;
    // Nodes first
    for (let pos of this.nodePositions()) {
      if (pos.ref.hits <= 0) continue; // ignore destroyed nodes
      const dx = bullet.x - pos.x, dy = bullet.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + bullet.radius) {
        // Spawn invulnerability for shield nodes: ignore damage for first 1.5s
        const { getFrameCount } = this.deps;
        if (getFrameCount && (getFrameCount() - this.spawnTime) < 90) return true; // consume bullet, no damage
        pos.ref.hits--; pos.ref.hitFlash = 8;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#f66', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#f88');
          // stop any ongoing charge/fire on destroyed node
          pos.ref.chargeTimer = 0; pos.ref.fireTimer = 0;
          // remove from list handled via hits check
        }
        return true; // bullet consumed
      }
    }
    // Core when nodes are all down
    if (this.nodes.filter(n => n.hits > 0).length === 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + bullet.radius) {
        // Core hit
        if (!this.phase2) {
          this.coreHealth--;
          createExplosion(this.x, this.y, 90, '#faa');
          if (this.coreHealth <= 0) {
            this.startSecondPhase();
          }
          return true;
        } else {
          // Phase 2: respect invulnerability window
          if (this.phase2Invuln > 0) return true;
          this.phase2Health--;
          createExplosion(this.x, this.y, 90, '#faa');
          if (this.phase2Health <= 0) this.onDefeated();
          return true;
        }
      }
    }
    return false;
  }

  handleParticleDamage(particle) {
    const { createExplosion } = this.deps;
    let hit = false;
    for (let pos of this.nodePositions()) {
      if (pos.ref.hits <= 0) continue; // ignore destroyed nodes
      const dx = particle.x - pos.x, dy = particle.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + 12) {
        // Spawn invulnerability for shield nodes: ignore damage for first 1.5s
        const { getFrameCount } = this.deps;
        if (getFrameCount && (getFrameCount() - this.spawnTime) < 90) { hit = true; break; }
        pos.ref.hits--; pos.ref.hitFlash = 8;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#f66', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#f88');
          pos.ref.chargeTimer = 0; pos.ref.fireTimer = 0;
        }
        hit = true; break;
      }
    }
    if (!hit && this.nodes.filter(n => n.hits > 0).length === 0) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + 12) {
        if (!this.phase2) {
          this.coreHealth = Math.max(0, this.coreHealth - 1);
          if (this.coreHealth === 0) this.startSecondPhase();
        } else {
          if (this.phase2Invuln > 0) return; // ignore during invuln
          this.phase2Health = Math.max(0, this.phase2Health - 1);
          if (this.phase2Health === 0) this.onDefeated();
        }
      }
    }
  }

  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion } = this.deps;
    let any = false;
    for (let pos of this.nodePositions()) {
      if (pos.ref.hits > 0 && lineCircleCollision(x1, y1, x2, y2, pos.x, pos.y, pos.radius)) {
        // Spawn invulnerability for shield nodes: ignore damage for first 1.5s
        const { getFrameCount } = this.deps;
        any = true;
        if (getFrameCount && (getFrameCount() - this.spawnTime) < 90) { continue; }
        pos.ref.hits--; pos.ref.hitFlash = 8; any = true;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#f66', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#f88');
          pos.ref.chargeTimer = 0; pos.ref.fireTimer = 0;
        }
      }
    }
    if (this.nodes.filter(n => n.hits > 0).length === 0 &&
        lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      any = true;
      if (!this.phase2) {
        this.coreHealth = Math.max(0, this.coreHealth - 2);
        createExplosion(this.x, this.y, 90, '#faa');
        if (this.coreHealth === 0) this.startSecondPhase();
      } else {
        if (this.phase2Invuln <= 0) {
          this.phase2Health = Math.max(0, this.phase2Health - 2);
          createExplosion(this.x, this.y, 90, '#faa');
          if (this.phase2Health === 0) this.onDefeated();
        }
      }
    }
    return any;
  }

  startSecondPhase() {
    // Transition to mobile core phase (no immediate defeat)
    if (this.phase2) return;
    const { setShake, createExplosion, player, canvas } = this.deps;
    this.phase2 = true;
    this.phase2Health = 5;
    this.phase2Invuln = 120; // 2 seconds
    // Small transformation effect
    createExplosion && createExplosion(this.x, this.y, 120, '#f66');
    setShake && setShake(16, 7);
    // Kick off a velocity away from the player
    const dx = (player.x - this.x);
    const dy = (player.y - this.y);
    const d = Math.hypot(dx, dy) || 1;
    const speed = 2.2;
    this.vx = (-dx / d) * speed + (Math.random() - 0.5) * 0.6;
    this.vy = (-dy / d) * speed + (Math.random() - 0.5) * 0.6;
    // Allow roaming across full canvas now
    this.yMin = 0 + this.coreRadius + 20;
    this.yMax = canvas.height - (this.coreRadius + 20);
    // Ensure continuous drone pressure already handled by coreExposed targeting (6)
  }

  collidesWithCircle(cx, cy, cr) {
    // Check nodes
    for (let pos of this.nodePositions()) {
      if (pos.ref.hits <= 0) continue; // destroyed nodes no longer block
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.hypot(dx, dy) < cr + pos.radius) return true;
    }
    // Check core (always blocks)
    const dx = cx - this.x, dy = cy - this.y;
    if (Math.hypot(dx, dy) < cr + this.coreRadius) return true;
    return false;
  }

  onDefeated() {
    if (this.defeated) return;
    const { createExplosion, powerups, Powerup, enemyBullets, drones, setShake, awardPoints } = this.deps;
    this.defeated = true;
    createExplosion(this.x, this.y, this.coreRadius * 3, '#faa');
    setShake && setShake(26, 9);
    // Fixed award
    awardPoints && awardPoints(600, this.x, this.y, true);
    // Drop 2-3 powerups
    if (powerups && Powerup) {
      const drops = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < drops; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 70;
        const dx = this.x + Math.cos(ang) * dist;
        const dy = this.y + Math.sin(ang) * dist;
        const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone'];
        const type = types[(Math.random() * types.length) | 0];
        if (powerups.length < 4) powerups.push(new Powerup(dx, dy, type));
      }
    }
    if (Math.random() < 0.5 && this.deps.powerups && this.deps.Powerup && this.deps.powerups.length < 4) {
      this.deps.powerups.push(new this.deps.Powerup(this.x, this.y, 'life'));
    }
    // Clear boss projectiles and drones
    if (enemyBullets) enemyBullets.length = 0;
    if (drones) drones.length = 0;
  }
}
