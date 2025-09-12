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
    // Invulnerability hit ping (when core is protected or phase2 invuln active)
    this.invulnHitTimer = 0;
    this.invulnHitAngle = 0;

    // Nodes arranged in a forward arc in front (to the left) of the ship
    // Each node has a base polar angle around PI (left), a base radius, small radial/tangential wobble, and hit knockback
    this.nodeOffsetX = this.coreRadius + 80; // legacy (not used for final placement)
    const baseThetas = [-0.85, -0.45, 0, 0.45, 0.85]; // wider vertical spread relative to PI (left-facing)
    this.nodes = baseThetas.map((bt) => ({
      // Armor/state
      hits: 5,
      radius: 26,
      pulse: Math.random() * Math.PI * 2,
      hitFlash: 0,
      chargeTimer: 0,  // frames remaining while charging
      fireTimer: 0,    // frames remaining while laser is active
      aimX: 0, aimY: 0, // captured player position at charge start
      // Arc placement and wobble
      baseTheta: bt,
      offRadius: this.coreRadius + 120 + (Math.random() * 50 - 25),
      radAmp: 12 + Math.random() * 12,
      radFreq: 0.006 + Math.random() * 0.01,
      radPhase: Math.random() * Math.PI * 2,
      tanAmp: 0.08 + Math.random() * 0.08, // stronger angular wobble (radians)
      tanFreq: 0.008 + Math.random() * 0.012,
      tanPhase: Math.random() * Math.PI * 2,
      // Hit knockback state
      kx: 0, ky: 0, kvx: 0, kvy: 0,
    }));

    // Timers
    this.spawnTime = getFrameCount ? getFrameCount() : 0;
    this.droneCooldown = 160; // periodic drone waves
    this.nodeLaserCooldown = 105; // start a charge ~every 1.75s if none active (30% faster than 150)
    this.attackDroneCooldown = 300; // red AttackDrone every ~5s

    // One-time: spawn 3 mines in front of top/mid/bottom nodes
    this.spawnIntroMines();

    // Display + sprite caching (DPR-aware)
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this._lastCanvasW = canvas.width;
    this._lastCanvasH = canvas.height;
    this._lastDpr = this.dpr;
    this.hullBodySprite = null;      // main hull body sprite (elliptical with seams)
    this.hullSprite = null;          // outer hull glow rings sprite
    this.nodeBaseSprites = {};       // key: hits (1..5) -> canvas
    this._nodeBaseRadius = (this.nodes[0] && this.nodes[0].radius) || 26;
    // Laser ember particles (pink) for node beams
    this.laserEmbers = [];
    this.laserEmberSprite = null;
    // Micro-sway state (phase 1 only); adjust x without drift
    this._lastSway = 0;
    this.initSprites();
  }

  // Radial explosion damage (e.g., player bomb). Damages shield nodes in radius
  // and the core if exposed (respects phase 2 invulnerability window).
  hitByExplosion(cx, cy, radius) {
    const { createExplosion } = this.deps || {};
    let any = false;
    // Damage nodes in range
    for (let pos of this.nodePositions()) {
      if (pos.ref.hits <= 0) continue;
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.hypot(dx, dy) <= radius + pos.radius) {
        pos.ref.hits = Math.max(0, pos.ref.hits - 1);
        pos.ref.hitFlash = 8;
        any = true;
        if (pos.ref.hits === 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 70, '#f88');
          pos.ref.chargeTimer = 0; pos.ref.fireTimer = 0;
        } else if (createExplosion) {
          createExplosion(pos.x, pos.y, 6, '#f66', 'micro');
        }
      }
    }
    // Core damage if nodes are all down
    if (this.nodes.filter(n => n.hits > 0).length === 0) {
      const dx = cx - this.x, dy = cy - this.y;
      if (Math.hypot(dx, dy) <= radius + this.coreRadius) {
        any = true;
        if (!this.phase2) {
          this.coreHealth = Math.max(0, this.coreHealth - 1);
          createExplosion && createExplosion(this.x, this.y, 90, '#faa');
          if (this.coreHealth === 0) this.startSecondPhase();
        } else if (this.phase2Invuln <= 0) {
          this.phase2Health = Math.max(0, this.phase2Health - 1);
          createExplosion && createExplosion(this.x, this.y, 90, '#faa');
          if (this.phase2Health === 0) this.onDefeated();
        }
      }
    }
    return any;
  }

  // --- Sprite pre-render helpers ---
  initSprites() {
    this.buildHullBodySprite();
    this.buildHullSprite();
    this.buildNodeBaseSprites();
    this.buildLaserEmberSprite();
  }

  refreshIfDisplayChanged() {
    const { canvas } = this.deps || {};
    const currDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (currDpr !== this.dpr) {
      this.dpr = currDpr;
      this._lastDpr = currDpr;
      // Rebuild cached sprites for new DPR
      this.initSprites();
    }
    if (canvas && (canvas.width !== this._lastCanvasW || canvas.height !== this._lastCanvasH)) {
      this._lastCanvasW = canvas.width;
      this._lastCanvasH = canvas.height;
      // Sprites are resolution-independent from canvas size, but we keep this for future scale variants
    }

    // Decay invulnerability hit ping timer
    if (this.invulnHitTimer > 0) this.invulnHitTimer--;
  }

  buildLaserEmberSprite() {
    // Small pink glowing ember sprite, cached for re-use
    const r = 6;
    const margin = 10;
    const size = (r + margin) * 2;
    const c = this.createOffscreen(size, size);
    if (!c) { this.laserEmberSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(size / 2, size / 2);
    // Outer glow
    g.shadowColor = '#ff66cc';
    g.shadowBlur = 18;
    g.fillStyle = 'rgba(255,80,170,0.8)';
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    // Hot core
    g.shadowBlur = 0;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, Math.max(1.5, r * 0.45), 0, Math.PI * 2);
    g.fill();
    g.restore();
    this.laserEmberSprite = c;
  }

  createOffscreen(width, height) {
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = Math.ceil(width * this.dpr);
    c.height = Math.ceil(height * this.dpr);
    return c;
  }

  buildHullBodySprite() {
    // Main elliptical hull body with subtle seams and a forward bulwark ring
    const rx = this.coreRadius * 2.2; // horizontal radius
    const ry = this.coreRadius * 1.2; // vertical radius
    const margin = 28; // avoid clipping glows
    const sizeW = rx * 2 + margin * 2;
    const sizeH = ry * 2 + margin * 2;
    const c = this.createOffscreen(sizeW, sizeH);
    if (!c) { this.hullBodySprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(sizeW / 2, sizeH / 2);

    // Body fill gradient: darker rear, warmer forward (toward nodes on the left)
    const grad = g.createLinearGradient(-rx, 0, rx, 0);
    grad.addColorStop(0, 'rgba(50,0,0,0.85)');
    grad.addColorStop(0.45, 'rgba(20,0,0,0.7)');
    grad.addColorStop(1, 'rgba(10,0,0,0.85)');
    g.fillStyle = grad;
    g.beginPath();
    if (g.ellipse) {
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    } else {
      g.save(); g.scale(1, ry / rx); g.arc(0, 0, rx, 0, Math.PI * 2); g.restore();
    }
    g.fill();

    // Rim light
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,128,128,0.6)';
    g.shadowColor = '#f44';
    g.shadowBlur = 8;
    g.beginPath();
    if (g.ellipse) g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    else { g.save(); g.scale(1, ry / rx); g.arc(0, 0, rx, 0, Math.PI * 2); g.restore(); }
    g.stroke();
    g.shadowBlur = 0;

    // Hull seams: faint horizontal elliptical bands
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,120,120,0.28)';
    for (let i = -2; i <= 2; i++) {
      const yy = (i / 2) * ry * 0.7;
      g.beginPath();
      if (g.ellipse) {
        g.ellipse(0, yy, rx * (0.88 - Math.abs(i) * 0.06), ry * 0.22, 0, 0, Math.PI * 2);
      } else {
        g.save();
        g.translate(0, yy);
        g.scale(1, (ry * 0.22) / (rx * (0.88 - Math.abs(i) * 0.06)));
        g.arc(0, 0, rx * (0.88 - Math.abs(i) * 0.06), 0, Math.PI * 2);
        g.restore();
      }
      g.stroke();
    }

    // Forward bulwark ring (emphasizes shield battery side)
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,90,90,0.65)';
    g.shadowColor = '#f55';
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(-rx * 0.7, 0, this.coreRadius * 0.65, Math.PI * 0.6, Math.PI * 1.4);
    g.stroke();
    g.shadowBlur = 0;

    // Small rune ticks along rim for alien tech vibe
    g.save();
    const runeCount = 16;
    for (let k = 0; k < runeCount; k++) {
      const a = (k / runeCount) * Math.PI * 2;
      const px = Math.cos(a) * (rx - 12);
      const py = Math.sin(a) * (ry - 12);
      g.globalAlpha = 0.2 + (k % 2 ? 0.08 : 0);
      g.fillStyle = '#ff9a9a';
      g.beginPath();
      g.rect(px - 1.5, py - 3, 3, 6);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;

    g.restore();
    this.hullBodySprite = c;
  }

  buildHullSprite() {
    // Cache outer hull glow rings (4 passes) as a centered sprite
    const outerMaxR = this.coreRadius + 18 + 3 * 6; // i = 3
    const margin = 24; // avoid glow clipping
    const size = outerMaxR * 2 + margin * 2;
    const c = this.createOffscreen(size, size);
    if (!c) { this.hullSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(size / 2, size / 2);
    for (let i = 3; i >= 0; i--) {
      g.globalAlpha = i === 0 ? 1 : 0.4;
      g.strokeStyle = '#f66';
      g.shadowColor = '#f44';
      g.shadowBlur = 18 - i * 4;
      g.lineWidth = i === 0 ? 3 : 1.4;
      g.beginPath();
      g.arc(0, 0, this.coreRadius + 18 + i * 6, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1; g.shadowBlur = 0;
    this.hullSprite = c;
  }

  buildNodeBaseSprites() {
    // Build cached crisp ring + armor rings for hits = 1..5
    this.nodeBaseSprites = {};
    const radius = this._nodeBaseRadius;
    const margin = 16;
    const size = radius * 2 + margin * 2;
    for (let hits = 1; hits <= 5; hits++) {
      const c = this.createOffscreen(size, size);
      if (!c) continue;
      const g = c.getContext('2d');
      g.save();
      g.scale(this.dpr, this.dpr);
      g.translate(size / 2, size / 2);
      // Base crisp rim (no glow)
      g.globalAlpha = 1;
      g.shadowBlur = 0;
      g.strokeStyle = '#f66';
      g.lineWidth = 2.2;
      g.beginPath();
      g.arc(0, 0, radius - 0.5, 0, Math.PI * 2);
      g.stroke();
      // Segmented battery arcs showing remaining hits (bright segments = hits)
      const segCount = 5;
      const innerR = radius - 8;
      const segSweep = (Math.PI * 2) / segCount;
      for (let s = 0; s < segCount; s++) {
        const start = -Math.PI / 2 + s * segSweep + 0.06;
        const end = start + segSweep - 0.12;
        g.lineWidth = 2;
        g.strokeStyle = (s < hits) ? '#fff' : 'rgba(255,255,255,0.18)';
        g.beginPath();
        g.arc(0, 0, innerR, start, end);
        g.stroke();
      }
      // Crosshair detail
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.moveTo(-innerR + 3, 0); g.lineTo(innerR - 3, 0); g.stroke();
      g.beginPath(); g.moveTo(0, -innerR + 3); g.lineTo(0, innerR - 3); g.stroke();
      g.restore();
      g.globalAlpha = 1; g.shadowBlur = 0;
      this.nodeBaseSprites[hits] = c;
    }
  }

  isDefeated() { return this.defeated; }

  nodePositions() {
    // Place nodes in a forward arc (left of the core) with subtle wobble and knockback offset
    const frame = (this.deps && typeof this.deps.getFrameCount === 'function') ? this.deps.getFrameCount() : 0;
    // Visual sway does not affect collision; draw() translates scene for sway
    const cx = this.x;
    const cy = this.y;
    const baseFacing = Math.PI; // leftward
    return this.nodes.map(n => {
      const rWob = (n.offRadius || (this.coreRadius + 90)) + Math.sin(frame * (n.radFreq || 0.008) + (n.radPhase || 0)) * (n.radAmp || 8);
      const aWob = baseFacing + (n.baseTheta || 0) + Math.sin(frame * (n.tanFreq || 0.006) + (n.tanPhase || 0)) * (n.tanAmp || 0.05);
      const px = cx + Math.cos(aWob) * rWob + (n.kx || 0);
      const py = cy + Math.sin(aWob) * rWob + (n.ky || 0);
      return { x: px, y: py, radius: n.radius, ref: n };
    });
  }

  spawnIntroMines() {
    const { mines, Mine } = this.deps;
    if (!mines || !Mine) return;
    const picks = [0,1,2,3,4,5]; // all node indexes
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
      // Subtle core micro-sway on X (visual only via draw translate)
      const frame = (this.deps && typeof this.deps.getFrameCount === 'function') ? this.deps.getFrameCount() : 0;
      this._lastSway = Math.sin(frame * 0.01) * 1.0;
    } else {
      // Phase 2: mobile avoidance with center bias and soft edge repulsion
      if (this.phase2Invuln > 0) this.phase2Invuln--;
      const { canvas } = this.deps;
      const dx = (player.x - this.x);
      const dy = (player.y - this.y);
      const dist = Math.hypot(dx, dy) || 1;
      // Steering accelerations
      let ax = 0, ay = 0;
      // 1) Accelerate away from the player
      const avoid = 0.12;
      ax += (-dx / dist) * avoid;
      ay += (-dy / dist) * avoid;
      // 2) Gentle pull toward screen center to discourage edge hugging
      const cx = canvas.width * 0.5, cy = canvas.height * 0.5;
      const cdx = (cx - this.x), cdy = (cy - this.y);
      const cdist = Math.hypot(cdx, cdy) || 1;
      const centerPull = 0.06; // small, steady pull
      ax += (cdx / cdist) * centerPull;
      ay += (cdy / cdist) * centerPull;
      // 3) Soft edge repulsion within a margin band
      const margin = 140;
      const edgePush = 0.08;
      if (this.x < margin) ax += edgePush;
      else if (this.x > canvas.width - margin) ax -= edgePush;
      if (this.y < margin) ay += edgePush;
      else if (this.y > canvas.height - margin) ay -= edgePush;
      // Apply acceleration and mild damping
      this.vx = this.vx * 0.992 + ax;
      this.vy = this.vy * 0.992 + ay;
      // Clamp speed
      const maxSpeed = 2.6;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > maxSpeed) { this.vx = (this.vx / sp) * maxSpeed; this.vy = (this.vy / sp) * maxSpeed; }
      // Integrate position
      this.x += this.vx;
      this.y += this.vy;
      // Toroidal wrapping like the player
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
      // Integrate knockback + damping
      if (n.kvx || n.kvy || n.kx || n.ky) {
        n.kx += n.kvx; n.ky += n.kvy;
        n.kvx *= 0.88; n.kvy *= 0.88;
        n.kx *= 0.94;  n.ky *= 0.94;
        if (Math.abs(n.kx) < 0.01) n.kx = 0;
        if (Math.abs(n.ky) < 0.01) n.ky = 0;
        if (Math.abs(n.kvx) < 0.01) n.kvx = 0;
        if (Math.abs(n.kvy) < 0.01) n.kvy = 0;
      }
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
        // Spawn pink glowing embers that peel off the beam
        // Keep spawn light for performance
        const spawnCount = 2;
        for (let s = 0; s < spawnCount; s++) {
          const t = 0.18 + Math.random() * 0.55; // sample between 18% and 73% along the beam
          const bx = p.x + (x2 - p.x) * t;
          const by = p.y + (y2 - p.y) * t;
          // Off-screen guard at spawn time
          const { canvas } = this.deps;
          if (bx < -40 || by < -40 || bx > canvas.width + 40 || by > canvas.height + 40) continue;
          // Velocity mostly perpendicular with slight forward drift
          const perp = ang + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          const speed = 1.2 + Math.random() * 2.0;
          const drift = 0.3 + Math.random() * 0.6;
          const vx = Math.cos(perp) * speed + Math.cos(ang) * drift;
          const vy = Math.sin(perp) * speed + Math.sin(ang) * drift;
          const life = 26 + (Math.random() * 18) | 0;
          this.laserEmbers.push({ x: bx, y: by, vx, vy, life, maxLife: life, size: 1 + Math.random() * 0.7 });
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

    // Update laser embers (movement, fade, and off-screen culling)
    if (this.laserEmbers && this.laserEmbers.length) {
      const { canvas } = this.deps;
      for (let i = this.laserEmbers.length - 1; i >= 0; i--) {
        const e = this.laserEmbers[i];
        e.x += e.vx;
        e.y += e.vy;
        // light drag
        e.vx *= 0.985;
        e.vy *= 0.985;
        e.life--;
        const pad = 60;
        if (e.life <= 0 || e.x < -pad || e.y < -pad || e.x > canvas.width + pad || e.y > canvas.height + pad) {
          this.laserEmbers.splice(i, 1);
        }
      }
    }
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    const t = getFrameCount ? getFrameCount() : 0;
    this.refreshIfDisplayChanged();

    // Hull/core (translate for micro-sway during phase 1)
    ctx.save();
    const dxSway = this.phase2 ? 0 : (this._lastSway || 0);
    ctx.translate(dxSway, 0);
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
    // Main hull body (cached)
    // Hide the large oval hull body when the core becomes mobile (phase 2)
    if (!this.phase2 && this.hullBodySprite) {
      const dwb = this.hullBodySprite.width / this.dpr;
      const dhb = this.hullBodySprite.height / this.dpr;
      ctx.drawImage(this.hullBodySprite, this.x - dwb / 2 + dxSway, this.y - dhb / 2, dwb, dhb);
    }
    // Outer hull glow rings (cached sprite)
    if (this.hullSprite) {
      const dw = this.hullSprite.width / this.dpr;
      const dh = this.hullSprite.height / this.dpr;
      ctx.drawImage(this.hullSprite, this.x - dw / 2, this.y - dh / 2, dw, dh);
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

    // Impact arc ping to indicate invulnerable core bounce
    if (this.invulnHitTimer > 0) {
      const a = this.invulnHitAngle;
      const fade = this.invulnHitTimer / 12;
      const r = this.coreRadius + 10;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 + 0.6 * fade;
      ctx.shadowBlur = 16 + 12 * fade;
      ctx.shadowColor = '#faa';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, a - 0.6, a + 0.6);
      ctx.stroke();
      ctx.restore();
    }

    // Precompute node positions for links and drawing
    const positions = this.nodePositions();

    // Energy tethers linking nodes to the core
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.hits <= 0) continue;
      const p = positions[i];
      const tx = this.x - Math.max(12, this.coreRadius * 0.5);
      const ty = this.y + (p.y - this.y) * 0.3;
      const chargeProg = n.chargeTimer > 0 ? (1 - n.chargeTimer / 120) : 0;
      const active = n.fireTimer > 0 ? 1 : chargeProg;
      const baseA = 0.18 + active * 0.5;
      // Outer glow
      ctx.globalAlpha = baseA;
      ctx.shadowBlur = 14 + active * 10;
      ctx.shadowColor = '#f55';
      ctx.strokeStyle = 'rgba(255,80,80,0.9)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // Inner core line
      ctx.globalAlpha = Math.min(1, 0.6 + active * 0.4);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

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
    const positions2 = positions;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.hits <= 0) continue; // do not draw destroyed nodes
      const p = positions2[i];
      const baseColor = '#f66';
      const flash = n.hitFlash > 0 ? (n.hitFlash / 8) : 0;
      const glow = 14 + Math.sin(n.pulse) * 4 + flash * 8;
      const color = n.hitFlash > 0 ? '#fff' : baseColor;

      // Cached base: crisp ring + armor rings for current hits
      const base = this.nodeBaseSprites[n.hits];
      if (base) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.drawImage(base, -base.width / (2 * this.dpr), -base.height / (2 * this.dpr), base.width / this.dpr, base.height / this.dpr);
        ctx.restore();
      }

      // Dynamic glow overlay (single pass)
      ctx.globalAlpha = Math.min(1, 0.9 + flash * 0.2);
      ctx.shadowBlur = glow;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, n.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

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
        // Hot red inner glow to indicate the selected battery will fire
        const innerAlpha = 0.35 + prog * 0.45; // brighten as it nears firing
        ctx.globalAlpha = innerAlpha;
        ctx.shadowBlur = 18 + prog * 18;
        ctx.shadowColor = '#f55';
        ctx.fillStyle = 'rgba(255,60,60,0.7)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(6, n.radius * 0.55 + prog * 3), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
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
        // Glowing pink spiral wrapping around the beam
        {
          const { getFrameCount } = this.deps;
          const tNow = getFrameCount ? getFrameCount() : 0;
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const nx = -uy, ny = ux; // perpendicular unit
          const beamLen = 1400; // draw a visible portion near screen
          const sx2 = p.x + ux * beamLen;
          const sy2 = p.y + uy * beamLen;
          const turns = 5.0; // number of curls over the visible beam
          const phase = tNow * 0.25; // animate the curl along time
          const amp = 12; // spiral radius
          const steps = 44; // segment count for path
          const lifeProg = Math.max(0, n.fireTimer / 36); // 0..1 as beam ends
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          // Outer glow spiral
          ctx.shadowColor = '#ff66cc';
          ctx.shadowBlur = 18;
          ctx.strokeStyle = 'rgba(255,102,204,0.65)';
          ctx.lineWidth = 4;
          ctx.globalAlpha = 0.7 * lifeProg;
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const s = i / steps; // 0..1
            const bx = p.x + ux * (s * beamLen);
            const by = p.y + uy * (s * beamLen);
            const offset = amp * Math.sin((s * turns * Math.PI * 2) + phase);
            const px = bx + nx * offset;
            const py = by + ny * offset;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          // Core spiral
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,170,230,0.95)';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.9 * lifeProg;
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const s = i / steps;
            const bx = p.x + ux * (s * beamLen);
            const by = p.y + uy * (s * beamLen);
            const offset = (amp * 0.55) * Math.sin((s * turns * Math.PI * 2) + phase + Math.PI * 0.5);
            const px = bx + nx * offset;
            const py = by + ny * offset;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    }

    // Render laser embers with additive blending
    if (this.laserEmbers && this.laserEmbers.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.laserEmbers) {
        const prog = 1 - (e.life / e.maxLife);
        const alpha = Math.max(0, 0.8 * (1 - prog));
        const scale = (0.9 + e.size * 0.6) * (1 + prog * 0.6);
        ctx.globalAlpha = alpha;
        if (this.laserEmberSprite) {
          const dw = (this.laserEmberSprite.width / this.dpr) * scale * 0.6;
          const dh = (this.laserEmberSprite.height / this.dpr) * scale * 0.6;
          ctx.drawImage(this.laserEmberSprite, e.x - dw / 2, e.y - dh / 2, dw, dh);
        } else {
          // Fallback: simple pink circle
          ctx.shadowColor = '#ff66cc';
          ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(255,80,170,0.8)';
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.restore();
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
        // Knockback impulse along impact normal (strong)
        {
          const d = Math.hypot(dx, dy) || 0.0001;
          const nx = dx / d, ny = dy / d;
          pos.ref.kvx = (pos.ref.kvx || 0) + nx * 0.85;
          pos.ref.kvy = (pos.ref.kvy || 0) + ny * 0.85;
        }
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
    const anyNodesLeft = this.nodes.filter(n => n.hits > 0).length > 0;
    // Core interaction
    if (!anyNodesLeft) {
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
          if (this.phase2Invuln > 0) {
            // Reflect bullet and ping when invulnerable
            const dist = Math.hypot(dx, dy) || 1;
            const nx = dx / dist, ny = dy / dist;
            const dot = bullet.vx * nx + bullet.vy * ny;
            bullet.vx = bullet.vx - 2 * dot * nx;
            bullet.vy = bullet.vy - 2 * dot * ny;
            const pad = 2;
            bullet.x = this.x + nx * (this.coreRadius + bullet.radius + pad);
            bullet.y = this.y + ny * (this.coreRadius + bullet.radius + pad);
            if (this.deps.getFrameCount) bullet._skipCollisionsFrame = this.deps.getFrameCount();
            this.invulnHitTimer = 12;
            this.invulnHitAngle = Math.atan2(ny, nx);
            createExplosion && createExplosion(bullet.x, bullet.y, 6, '#faa', 'micro');
            try { if (this.deps.audio && this.deps.audio.playSfx) this.deps.audio.playSfx('hit'); } catch (e) {}
            return false;
          }
          this.phase2Health--;
          createExplosion(this.x, this.y, 90, '#faa');
          if (this.phase2Health <= 0) this.onDefeated();
          return true;
        }
      }
    } else {
      // Core protected by nodes: reflect bullets that hit the core
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.coreRadius + bullet.radius) {
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        const dot = bullet.vx * nx + bullet.vy * ny;
        bullet.vx = bullet.vx - 2 * dot * nx;
        bullet.vy = bullet.vy - 2 * dot * ny;
        const pad = 2;
        bullet.x = this.x + nx * (this.coreRadius + bullet.radius + pad);
        bullet.y = this.y + ny * (this.coreRadius + bullet.radius + pad);
        if (this.deps.getFrameCount) bullet._skipCollisionsFrame = this.deps.getFrameCount();
        this.invulnHitTimer = 12;
        this.invulnHitAngle = Math.atan2(ny, nx);
        createExplosion && createExplosion(bullet.x, bullet.y, 6, '#faa', 'micro');
        try { if (this.deps.audio && this.deps.audio.playSfx) this.deps.audio.playSfx('hit'); } catch (e) {}
        return false;
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
        // Knockback impulse (medium)
        {
          const d = Math.hypot(dx, dy) || 0.0001;
          const nx = dx / d, ny = dy / d;
          pos.ref.kvx = (pos.ref.kvx || 0) + nx * 0.55;
          pos.ref.kvy = (pos.ref.kvy || 0) + ny * 0.55;
        }
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
    const anyNodesLeft = this.nodes.filter(n => n.hits > 0).length > 0;
    if (!hit) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (!anyNodesLeft) {
        if (dist < this.coreRadius + 12) {
          if (!this.phase2) {
            this.coreHealth = Math.max(0, this.coreHealth - 1);
            if (this.coreHealth === 0) this.startSecondPhase();
          } else {
            if (this.phase2Invuln > 0) {
              // Reflect particle during invuln
              const nx = dx / (dist || 1), ny = dy / (dist || 1);
              const dot = (particle.vx || 0) * nx + (particle.vy || 0) * ny;
              particle.vx = (particle.vx || 0) - 2 * dot * nx;
              particle.vy = (particle.vy || 0) - 2 * dot * ny;
              particle.x = this.x + nx * (this.coreRadius + 12 + 2);
              particle.y = this.y + ny * (this.coreRadius + 12 + 2);
              this.invulnHitTimer = 12;
              this.invulnHitAngle = Math.atan2(ny, nx);
              createExplosion && createExplosion(particle.x, particle.y, 6, '#faa', 'micro');
              try { if (this.deps.audio && this.deps.audio.playSfx) this.deps.audio.playSfx('hit'); } catch (e) {}
              return;
            }
            this.phase2Health = Math.max(0, this.phase2Health - 1);
            if (this.phase2Health === 0) this.onDefeated();
          }
        }
      } else if (dist < this.coreRadius + 12) {
        // Reflect particle while core protected by nodes
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        const dot = (particle.vx || 0) * nx + (particle.vy || 0) * ny;
        particle.vx = (particle.vx || 0) - 2 * dot * nx;
        particle.vy = (particle.vy || 0) - 2 * dot * ny;
        particle.x = this.x + nx * (this.coreRadius + 12 + 2);
        particle.y = this.y + ny * (this.coreRadius + 12 + 2);
        this.invulnHitTimer = 12;
        this.invulnHitAngle = Math.atan2(ny, nx);
        createExplosion && createExplosion(particle.x, particle.y, 6, '#faa', 'micro');
        try { if (this.deps.audio && this.deps.audio.playSfx) this.deps.audio.playSfx('hit'); } catch (e) {}
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
        // Knockback outward from core (beam push)
        {
          const dx = pos.x - this.x, dy = pos.y - this.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const nx = dx / d, ny = dy / d;
          pos.ref.kvx = (pos.ref.kvx || 0) + nx * 0.7;
          pos.ref.kvy = (pos.ref.kvy || 0) + ny * 0.7;
        }
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
    const { createExplosion, powerups, Powerup, enemyBullets, drones, setShake, awardPoints, unlockReward, applyShockwave } = this.deps;
    this.defeated = true;
    createExplosion(this.x, this.y, this.coreRadius * 3.6, '#faa');
    setShake && setShake(26, 9);
    // Massive shockwave pushback on defeat
    try { if (applyShockwave) applyShockwave(this.x, this.y, 520, 12); } catch (e) {}
    // Fixed award
    awardPoints && awardPoints(700, this.x, this.y, true);
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
        powerups.push(new Powerup(dx, dy, type));
      }
    }
    // Guaranteed +1 life drop regardless of field cap
    try { if (this.deps.powerups && this.deps.Powerup) this.deps.powerups.push(new this.deps.Powerup(this.x, this.y, 'life')); } catch (e) {}
    // Clear boss projectiles and drones
    if (enemyBullets) enemyBullets.length = 0;
    if (drones) drones.length = 0;
    // EXP: Award 250 EXP for defeating Alien Mothership boss
    if (this.deps.addEXP) this.deps.addEXP(250, 'boss-mothership');
    // Unlock boss cosmetic: ship skin
    try {
      if (typeof unlockReward === 'function') {
        unlockReward('skin_alienmothership');
      }
    } catch (e) {}
  }
}
