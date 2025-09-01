// Crystal Titan Boss (Level 9): reflective crystal facets + vulnerable core
// Uses dependency injection similar to ColossusBoss
// Deps expected:
// {
//   canvas, ctx,
//   player,
//   bullets, enemyBullets, asteroids, powerups,
//   EnemyBullet, Asteroid, Powerup,
//   createExplosion, awardPoints, lineCircleCollision,
//   setShake: (frames, intensity) => void,
//   onPlayerHit: () => void,
//   getFrameCount: () => number,
// }

export class CrystalTitanBoss {
  constructor(deps) {
    this.deps = deps;
    const { canvas, getFrameCount } = this.deps;
    this.x = canvas.width / 2;
    this.y = canvas.height / 2;
    this.coreRadius = 46;
    this.coreHealth = 12;
    this.orbitRadius = 150;
    this.rotateSpeed = 0.01;
    this.facets = [];
    this.spawnTime = getFrameCount();
    this.defeated = false;

    // Build ring of crystal facets that reflect bullets when hit
    const count = 7; // number of facets
    for (let i = 0; i < count; i++) {
      this.facets.push({
        angle: (Math.PI * 2 * i) / count,
        hits: 5,
        radius: 38,
        pulse: Math.random() * Math.PI * 2,
        hitFlash: 0,
      });
    }
    // (frozen blade drawing happens in draw())

    // Attacks
    this.ringCooldown = 140; // radial shard bursts
    this.snipeCooldown = 90; // aimed prism shots

    // Shard charge/laser cycle
    // Every 6s: 2s charge (glowing lines between shards + particles), then 1s beam from a random shard
    this.chargeActive = false;
    this.chargeStart = 0;
    this.chargeTarget = { x: 0, y: 0 };
    this.chosenFacetRef = null;
    this.chargeParticles = [];
    this.beam = null; // { sx, sy, ex, ey, startFrame, duration }
    this.beamParticles = [];
    this.nextChargeFrame = this.spawnTime + 360; // start first cycle 6s after spawn

    // Display + sprite caching
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    this._lastCanvasW = canvas.width;
    this._lastCanvasH = canvas.height;
    this._lastDpr = this.dpr;
    this.coreGlowSprites = { shielded: null, exposed: null };
    this.coreCrystalSprite = null;
    this.smallCrystalSprites = [];
    this.floaters = [];
    this.facetBaseSprites = {}; // key: hits -> canvas
    this._facetBaseRadius = (this.facets[0] && this.facets[0].radius) || 38;
    // Frozen curved blade attack
    this.blades = [];              // active blades
    this.bladeCooldown = 210;      // every 3.5 seconds @60fps
    this.nextBladeTheta = Math.random() * Math.PI * 2; // preset direction for charge telegraph
    this.bladeLength = 300;        // logical length of blade for collision and sprite
    this.bladeHalfWidth = 18;      // half-thickness used for collision and visuals
    this.bladeSprite = null;       // cached sprite for the blade body + glow
    // Player freeze state (self-contained if no external handler is provided)
    this.playerFrozenTimer = 0;    // frames remaining
    this.playerFrozenPos = { x: 0, y: 0 };
    // CrystalDrone spawn control
    this.droneSpawnCooldown = 180;   // start spawns 3s after boss appears, then every 3s
    this.initSprites();
    this._initFloaters();
  }

  // --- Sprite pre-render helpers ---
  initSprites() {
    this.buildCoreGlowSprites();
    this.buildCoreCrystalSprite();
    this.buildSmallCrystalSprites();
    this.buildFacetBaseSprites();
    this.buildBladeSprite();
  }

  refreshIfDisplayChanged() {
    const { canvas } = this.deps || {};
    const currDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    if (currDpr !== this.dpr) {
      this.dpr = currDpr;
      this._lastDpr = currDpr;
      this.initSprites();
    }
    if (canvas && (canvas.width !== this._lastCanvasW || canvas.height !== this._lastCanvasH)) {
      this._lastCanvasW = canvas.width;
      this._lastCanvasH = canvas.height;
    }
  }

  // Curved blade sprite (DPR-aware). Large canvas to keep it sharp.
  buildBladeSprite() {
    // Build an annular sector (quarter-circle) so curvature matches the core circle
    const halfW = this.bladeHalfWidth;   // thickness/2
    const baseR = (this.coreRadius || 46) + 8; // inner radius aligned to core surface
    this._bladeBaseR = baseR; // store for draw-time scaling
    const innerR = baseR;
    const outerR = baseR + halfW * 2;    // thickness ~ blade width
    const margin = 40;                   // small margin (glow is minimal now)
    const cw = (baseR + outerR) + margin * 2; // center offset + radius span
    const ch = (outerR) + margin * 2;
    const c = this.createOffscreen(cw, ch);
    if (!c) { this.bladeSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(cw / 2, ch / 2);
    g.globalCompositeOperation = 'lighter';
    // Quarter ring sector centered at (-baseR, 0), spanning -90deg..0deg
    const drawSector = () => {
      g.beginPath();
      g.arc(-baseR, 0, outerR, -Math.PI / 2, 0, false);
      g.arc(-baseR, 0, innerR, 0, -Math.PI / 2, true);
      g.closePath();
    };
    // Base fill gradient (icy white/blue) along local x-axis
    const grad = g.createLinearGradient(-outerR, 0, outerR, 0);
    grad.addColorStop(0, 'rgba(200,245,255,0.85)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1.0)');
    grad.addColorStop(1, 'rgba(180,235,255,0.85)');
    // Outer soft glow (further reduced ~80%)
    drawSector();
    g.fillStyle = grad;
    g.shadowColor = '#ffffff';
    g.shadowBlur = 4;
    g.globalAlpha = 0.35;
    g.fill();
    // Inner bright body
    drawSector();
    g.shadowBlur = 1;
    g.globalAlpha = 0.95;
    g.fill();
    // Edge highlight
    g.lineWidth = 2.5;
    g.strokeStyle = '#ffffff';
    g.shadowBlur = 1;
    g.globalAlpha = 0.9;
    drawSector();
    g.stroke();
    g.restore();
    g.globalAlpha = 1; g.shadowBlur = 0; g.globalCompositeOperation = 'source-over';
    this.bladeSprite = c;
  }

  createOffscreen(width, height) {
    const c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = Math.ceil(width * this.dpr);
    c.height = Math.ceil(height * this.dpr);
    return c;
  }

  // Faceted crystal core sprite: diamond-like polygon with internal facet lines and glints
  buildCoreCrystalSprite() {
    const r = this.coreRadius;
    const margin = 22;
    const size = (r + margin) * 2;
    const c = this.createOffscreen(size, size);
    if (!c) { this.coreCrystalSprite = null; return; }
    const g = c.getContext('2d');
    g.save();
    g.scale(this.dpr, this.dpr);
    g.translate(size / 2, size / 2);
    // Define an 8-vertex diamond-like crystal silhouette (clean, low-jitter for crisp facets)
    const V = [
      { x: 0, y: -r * 1.05 },               // top
      { x: r * 0.55, y: -r * 0.35 },         // upper-right
      { x: r * 0.85, y: 0 },                 // right
      { x: r * 0.55, y: r * 0.35 },          // lower-right
      { x: 0, y: r * 1.05 },                 // bottom
      { x: -r * 0.55, y: r * 0.35 },         // lower-left
      { x: -r * 0.85, y: 0 },                // left
      { x: -r * 0.55, y: -r * 0.35 },        // upper-left
    ];
    // Base polygon path
    g.beginPath();
    g.moveTo(V[0].x, V[0].y);
    for (let i = 1; i < V.length; i++) g.lineTo(V[i].x, V[i].y);
    g.closePath();
    // Basalt-like prismatic gradient (cool cyan to warm magenta, bright core)
    const rg = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.12);
    rg.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    rg.addColorStop(0.55, 'rgba(180,240,255,0.90)');
    rg.addColorStop(1.00, 'rgba(250,170,255,0.75)');
    g.fillStyle = rg;
    g.fill();
    // Crisp outline
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.stroke();
    // Internal facet lines with additive highlights
    const lines = [
      [V[0], V[4]],
      [V[1], V[5]],
      [V[3], V[7]],
      [V[2], V[6]],
      [V[0], V[3]],
      [V[0], V[5]],
      [V[4], V[1]],
      [V[4], V[7]],
    ];
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lines.length; i++) {
      const [a, b] = lines[i];
      const lg = g.createLinearGradient(a.x, a.y, b.x, b.y);
      lg.addColorStop(0.0, 'rgba(255,255,255,0.25)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.8)');
      lg.addColorStop(1.0, 'rgba(255,255,255,0.25)');
      g.strokeStyle = lg;
      g.lineWidth = (i % 2 === 0) ? 1.6 : 1.0;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    // Star glints at selective facet crossings
    const drawGlint = (x, y, s) => {
      g.save();
      g.translate(x, y);
      g.globalAlpha = 0.85;
      g.shadowColor = '#ffffff';
      g.shadowBlur = 6;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke();
      g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s); g.stroke();
      g.globalAlpha = 0.55;
      g.beginPath(); g.moveTo(-s * 0.7, -s * 0.7); g.lineTo(s * 0.7, s * 0.7); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.7, s * 0.7); g.lineTo(s * 0.7, -s * 0.7); g.stroke();
      g.restore();
    };
    drawGlint(V[1].x * 0.85, V[1].y * 0.85, 3);
    drawGlint(V[3].x * 0.6, V[3].y * 0.6, 2.4);
    g.restore();
    g.globalAlpha = 1; g.shadowBlur = 0; g.globalCompositeOperation = 'source-over';
    this.coreCrystalSprite = c;
  }

  // Small crystal variants used for floating shards around the titan
  buildSmallCrystalSprites() {
    this.smallCrystalSprites = [];
    const make = (scale) => {
      const r = this.coreRadius * 0.25 * scale;
      const margin = 12;
      const size = (r + margin) * 2;
      const c = this.createOffscreen(size, size);
      if (!c) return null;
      const g = c.getContext('2d');
      g.save();
      g.scale(this.dpr, this.dpr);
      g.translate(size / 2, size / 2);
      const V = [
        { x: 0, y: -r * 1.1 },
        { x: r * 0.6, y: -r * 0.3 },
        { x: r * 0.9, y: 0 },
        { x: r * 0.5, y: r * 0.4 },
        { x: 0, y: r * 1.1 },
        { x: -r * 0.5, y: r * 0.4 },
        { x: -r * 0.9, y: 0 },
        { x: -r * 0.6, y: -r * 0.3 },
      ];
      g.beginPath(); g.moveTo(V[0].x, V[0].y);
      for (let i = 1; i < V.length; i++) g.lineTo(V[i].x, V[i].y);
      g.closePath();
      const grad = g.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0.0, 'rgba(190,245,255,0.95)');
      grad.addColorStop(0.6, 'rgba(255,255,255,1.0)');
      grad.addColorStop(1.0, 'rgba(245,175,255,0.9)');
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 1.6;
      g.strokeStyle = '#ffffff';
      g.stroke();
      // Few facet lines
      g.globalCompositeOperation = 'lighter';
      const L = [ [V[0], V[4]], [V[1], V[5]], [V[3], V[7]] ];
      for (let i = 0; i < L.length; i++) {
        const [a, b] = L[i];
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 1.0;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      g.restore();
      g.globalCompositeOperation = 'source-over';
      return c;
    };
    const variants = [0.9, 1.0, 1.2];
    for (let i = 0; i < variants.length; i++) {
      const sp = make(variants[i]);
      if (sp) this.smallCrystalSprites.push(sp);
    }
  }

  // Initialize floating crystal instances (decorative)
  _initFloaters() {
    this.floaters = [];
    const n = 22; // lots of small crystals around
    for (let i = 0; i < n; i++) {
      this.floaters.push({
        angle: Math.random() * Math.PI * 2,
        angularVel: (Math.random() * 0.008 + 0.003) * (Math.random() < 0.5 ? -1 : 1),
        radius: this.orbitRadius + 30 + Math.random() * 120,
        wobble: 6 + Math.random() * 14,
        scale: 0.75 + Math.random() * 0.8,
        rotOffset: Math.random() * Math.PI * 2,
        spriteIndex: Math.floor(Math.random() * 3),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  buildCoreGlowSprites() {
    const margin = 26;
    const size = (this.coreRadius + 3 * 6) * 2 + margin * 2;
    const make = (key) => {
      const color = key === 'shielded' ? '#8ff' : '#f9f';
      const c = this.createOffscreen(size, size);
      if (!c) return null;
      const g = c.getContext('2d');
      g.save();
      g.scale(this.dpr, this.dpr);
      g.translate(size / 2, size / 2);
      for (let i = 3; i >= 0; i--) {
        g.globalAlpha = i === 0 ? 1 : 0.35;
        g.shadowBlur = 20 - i * 5;
        g.shadowColor = color;
        g.strokeStyle = color;
        g.lineWidth = i === 0 ? 3 : 1.4;
        g.beginPath();
        g.arc(0, 0, this.coreRadius + i * 6, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
      g.globalAlpha = 1; g.shadowBlur = 0;
      return c;
    };
    this.coreGlowSprites.shielded = make('shielded');
    this.coreGlowSprites.exposed = make('exposed');
  }

  buildFacetBaseSprites() {
    this.facetBaseSprites = {};
    const radius = this._facetBaseRadius;
    const margin = 18;
    const size = (radius * 2) + margin * 2;
    for (let hits = 1; hits <= 5; hits++) {
      const c = this.createOffscreen(size, size);
      if (!c) continue;
      const g = c.getContext('2d');
      g.save();
      g.scale(this.dpr, this.dpr);
      g.translate(size / 2, size / 2);
      // Faceted shard polygon (gem-like), dynamic glow drawn at runtime
      const R = radius - 2;
      const DIAMOND_SCALE = 0.6; // reduce inner shard diamond by 40%
      const H = R * 1.05 * DIAMOND_SCALE;
      const W = R * 0.9 * DIAMOND_SCALE;
      const verts = [
        { x: 0, y: -H * 0.95 },
        { x: W * 0.55, y: -H * 0.25 },
        { x: W * 0.85, y: 0 },
        { x: W * 0.5, y: H * 0.35 },
        { x: 0, y: H * 0.95 },
        { x: -W * 0.5, y: H * 0.35 },
        { x: -W * 0.85, y: 0 },
        { x: -W * 0.55, y: -H * 0.25 },
      ];
      g.beginPath(); g.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) g.lineTo(verts[i].x, verts[i].y);
      g.closePath();
      const grad = g.createLinearGradient(0, -H, 0, H);
      grad.addColorStop(0.00, 'rgba(180,240,255,0.95)');
      grad.addColorStop(0.55, 'rgba(255,255,255,1.0)');
      grad.addColorStop(1.00, 'rgba(250,170,255,0.90)');
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#ffffff';
      g.stroke();
      // Micro facet lines (additive highlights)
      g.globalCompositeOperation = 'lighter';
      const lines = [
        [verts[0], verts[4]],
        [verts[1], verts[5]],
        [verts[2], verts[6]],
        [verts[3], verts[7]],
      ];
      for (let i = 0; i < lines.length; i++) {
        const [a, b] = lines[i];
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = (i % 2 === 0) ? 1.4 : 1.0;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      // Armor slashes indicating remaining hits
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      for (let h = 0; h < hits; h++) {
        const t = -0.55 + h * 0.28;
        g.globalAlpha = Math.max(0.3, 1.0 - h * 0.12);
        g.beginPath();
        g.moveTo(-W * 0.42, t * H);
        g.lineTo(W * 0.42, (t + 0.08) * H);
        g.stroke();
      }
      g.globalAlpha = 1;

      // Extra circles: 5 pips showing remaining hits
      const pipCount = 5;
      const pipRowY = -H * 0.28;
      const pipSpan = W * 0.7; // horizontal span for 5 pips
      const pipR = Math.max(1.3, R * 0.06);
      g.lineWidth = 1;
      for (let k = 0; k < pipCount; k++) {
        const t = pipCount === 1 ? 0 : (k / (pipCount - 1)) - 0.5; // -0.5 .. 0.5
        const px = t * pipSpan;
        const py = pipRowY;
        // Base hollow pip
        g.globalAlpha = 0.35;
        g.strokeStyle = '#ffffff';
        g.beginPath();
        g.arc(px, py, pipR, 0, Math.PI * 2);
        g.stroke();
        // Fill for remaining HP
        if (k < hits) {
          g.globalAlpha = 0.95;
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.arc(px, py, pipR * 0.8, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      g.restore();
      g.globalAlpha = 1; g.shadowBlur = 0;
      this.facetBaseSprites[hits] = c;
    }
  }

  isDefeated() { return this.defeated; }

  update() {
    const { player, enemyBullets, EnemyBullet, setShake, getFrameCount, lineCircleCollision, onPlayerHit } = this.deps;
    const frame = getFrameCount();
    // Spin facets
    for (let f of this.facets) {
      f.angle += this.rotateSpeed;
      f.pulse += 0.12;
      if (f.hitFlash > 0) f.hitFlash--;
    }

    // Radial shard bursts
    if (this.ringCooldown > 0) this.ringCooldown--;
    if (this.ringCooldown === 0) {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.1;
        enemyBullets.push(new EnemyBullet(this.x, this.y, a, 6));
      }
      this.ringCooldown = 180;
      setShake(8, 3);
    }

    // Aimed prism shots (slight spread)
    if (this.snipeCooldown > 0) this.snipeCooldown--;
    if (this.snipeCooldown === 0) {
      const base = Math.atan2(player.y - this.y, player.x - this.x);
      const spread = 0.12;
      const speeds = [7, 6.5, 6.8];
      [-spread, 0, spread].forEach((off, idx) => {
        enemyBullets.push(new EnemyBullet(this.x, this.y, base + off, speeds[idx]));
      });
      this.snipeCooldown = 70;
    }

    // Frozen curved blade attack (every 3s), invulnerable and freezes player on contact
    if (!this.defeated) {
      if (this.bladeCooldown > 0) this.bladeCooldown--;
      if (this.bladeCooldown === 0) {
        // Spawn at core edge, move radially outward (no rotation over time)
        const theta = this.nextBladeTheta || (Math.random() * Math.PI * 2);
        const spawnR = this.coreRadius + 6;
        const sx = this.x + Math.cos(theta) * spawnR;
        const sy = this.y + Math.sin(theta) * spawnR;
        const sp = 2.9; // ~50% of prior speed (slower)
        const vx = Math.cos(theta) * sp;
        const vy = Math.sin(theta) * sp;
        this.blades.push({
          x: sx, y: sy,
          vx, vy,
          angle: theta + Math.PI / 2, // fixed orientation, no spin
          trail: [], trailEvery: 9, trailTick: 0, alive: true,
          opacity: 1,
        });
        this.bladeCooldown = 210;
        this.nextBladeTheta = Math.random() * Math.PI * 2; // select next spawn direction
      }
      // Update blades
      const { canvas } = this.deps;
      const margin = 0;
      for (let i = this.blades.length - 1; i >= 0; i--) {
        const b = this.blades[i];
        // Movement: pure radial outward, constant orientation
        b.x += b.vx; b.y += b.vy; b.trailTick++;
        // Fast fade of main blade opacity
        if (b.opacity !== undefined) b.opacity *= 0.9;
        if (b.trailTick % b.trailEvery === 0) {
          b.trail.push({ x: b.x, y: b.y, angle: b.angle, alpha: 1 });
        }
        // Rapidly decay trail alphas and prune to keep trails short and fast-fading
        if (b.trail && b.trail.length) {
          for (let k = 0; k < b.trail.length; k++) {
            b.trail[k].alpha *= 0.2; // strong decay per frame
          }
          // remove old/transparent segments
          while (b.trail.length && b.trail[0].alpha < 0.06) b.trail.shift();
          // enforce very short trail length
          if (b.trail.length > 1) b.trail.splice(0, b.trail.length - 5);
        }
        if (b.x < -margin || b.x > canvas.width + margin || b.y < -margin || b.y > canvas.height + margin) {
          this.blades.splice(i, 1); continue;
        }
        // Freeze collision via capsule aligned to rendered arc center
        const L2 = this.bladeLength * 0.5;
        const txu = Math.cos(b.angle), tyu = Math.sin(b.angle); // tangent unit (blade orientation)
        const radAng = b.angle - Math.PI / 2; // radial direction from core
        const ru = { x: Math.cos(radAng), y: Math.sin(radAng) };
        const dist = Math.hypot(b.x - this.x, b.y - this.y);
        const cx0 = this.x + ru.x * dist; // center of rendered blade arc
        const cy0 = this.y + ru.y * dist;
        const hx = cx0 + txu * L2, hy = cy0 + tyu * L2;
        const tx = cx0 - txu * L2, ty = cy0 - tyu * L2;
        if (lineCircleCollision && lineCircleCollision(hx, hy, tx, ty, player.x, player.y, (this.bladeHalfWidth || 18) + (player.radius || 10))) {
          if (typeof this.deps.freezePlayer === 'function') {
            this.deps.freezePlayer(120);
          } else {
            if (this.playerFrozenTimer <= 0) {
              this.playerFrozenPos.x = player.x;
              this.playerFrozenPos.y = player.y;
            }
            this.playerFrozenTimer = 40;
          }
        }
      }
    }
    // Maintain fallback freeze lock
    if (this.playerFrozenTimer > 0) {
      this.playerFrozenTimer--;
      if (player) {
        this.playerFrozenPos.x = this.playerFrozenPos.x || player.x;
        this.playerFrozenPos.y = this.playerFrozenPos.y || player.y;
        player.x = this.playerFrozenPos.x;
        player.y = this.playerFrozenPos.y;
        if (typeof player.vx === 'number') player.vx = 0;
        if (typeof player.vy === 'number') player.vy = 0;
      }
    }

    // Shard charge/laser ability cycle
    if (!this.defeated && this.facets.length > 0) {
      // Start charge every 6s
      if (!this.chargeActive && !this.beam && frame >= this.nextChargeFrame) {
        this.chargeActive = true;
        this.chargeStart = frame;
        this.chargeTarget = { x: player.x, y: player.y };
        // Pick a random existing facet by reference (in case the array changes)
        this.chosenFacetRef = this.facets[Math.floor(Math.random() * this.facets.length)] || null;
      }

      // During charge: (sparks removed for performance) keep only line connections
      if (this.chargeActive) {
        const positions = this.facetPositions();
        // Connect in ring (i to i+1, and last to first)
        for (let i = 0; i < positions.length; i++) {
          const A = positions[i];
          const B = positions[(i + 1) % positions.length];
          // (particle sparks removed for performance)
        }

        // After 2s of charge, fire the beam
        if (frame - this.chargeStart >= 120) {
          // Resolve firing facet position (fallback to an existing facet if original was shattered)
          let firePos = null;
          if (this.chosenFacetRef) {
            const idx = this.facets.findIndex(ff => ff === this.chosenFacetRef);
            if (idx !== -1) {
              const f = this.facets[idx];
              firePos = {
                x: this.x + Math.cos(f.angle) * this.orbitRadius,
                y: this.y + Math.sin(f.angle) * this.orbitRadius,
              };
            }
          }
          if (!firePos && this.facets.length > 0) {
            const f = this.facets[0];
            firePos = {
              x: this.x + Math.cos(f.angle) * this.orbitRadius,
              y: this.y + Math.sin(f.angle) * this.orbitRadius,
            };
          }
          if (firePos) {
            // Make beam 40% longer by extending end point along the ray
            const dx = this.chargeTarget.x - firePos.x;
            const dy = this.chargeTarget.y - firePos.y;
            const ex = firePos.x + dx * 1.4;
            const ey = firePos.y + dy * 1.4;
            // Keep damage duration the same (60f), but remove visual-only fade to cut on-screen time by 50%
            this.beam = { sx: firePos.x, sy: firePos.y, ex, ey, startFrame: frame, duration: 45, fadeDuration: 30 };
            setShake(10, 4);
          }
          this.chargeActive = false;
          // Next cycle begins 6s after the previous charge start
          this.nextChargeFrame = this.chargeStart + 360;
        }
      }

      // Update charge particles
      if (this.chargeParticles.length) {
        for (let i = this.chargeParticles.length - 1; i >= 0; i--) {
          const p = this.chargeParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.life--;
          if (p.life <= 0) this.chargeParticles.splice(i, 1);
        }
      }

      // Active beam + fade-out: collision and particles only while active; then 1s visual fade with no collision
      if (this.beam) {
        const age = frame - this.beam.startFrame;
        if (age <= this.beam.duration) {
          // Collision with player (continuous while beam is active)
          if (lineCircleCollision && lineCircleCollision(this.beam.sx, this.beam.sy, this.beam.ex, this.beam.ey, player.x, player.y, player.radius)) {
            onPlayerHit && onPlayerHit();
          }
          // Spawn beam particles (reduce by ~60%: avg 1.6 per frame)
          {
            // Always spawn 1, plus 0.6 chance to spawn 1 more
            const spawnOne = () => {
              const tpos = Math.random();
              const x = this.beam.sx + (this.beam.ex - this.beam.sx) * tpos;
              const y = this.beam.sy + (this.beam.ey - this.beam.sy) * tpos;
              const ang = Math.random() * Math.PI * 2;
              const sp = Math.random() * 1.6;
              this.beamParticles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 60, size: 2 + Math.random() * 2 });
            };
            spawnOne();
            if (Math.random() < 0.6) spawnOne();
          }
        } else if (age <= this.beam.duration + (this.beam.fadeDuration || 60)) {
          // Fade period: keep beam for visuals only
        } else {
          this.beam = null;
        }
      }

      // Update beam particles
      if (this.beamParticles.length) {
        for (let i = this.beamParticles.length - 1; i >= 0; i--) {
          const p = this.beamParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.life--;
          if (p.life <= 0) this.beamParticles.splice(i, 1);
        }
      }
    }

    // CrystalDrone spawn logic: begin after 3s, then 1 every 3s; spawn from core center; cap active to 6
    {
      const { drones, CrystalDrone, getFrameCount } = this.deps;
      if (drones && CrystalDrone) {
        if (this.droneSpawnCooldown > 0) this.droneSpawnCooldown--;
        const activeCrystal = drones.reduce((acc, d) => acc + ((d && !d.dead && d.isCrystal) ? 1 : 0), 0);
        const CAP = 6;
        if (activeCrystal < CAP && this.droneSpawnCooldown === 0 && !this.defeated) {
          // Ensure spawns do not begin until 3 seconds after boss spawn
          const frame = getFrameCount ? getFrameCount() : 0;
          const canStart = !this.spawnTime || frame >= (this.spawnTime + 180);
          if (canStart) {
            const toSpawn = Math.min(1, CAP - activeCrystal);
            for (let i = 0; i < toSpawn; i++) {
              const sx = this.x, sy = this.y; // spawn from core center
              drones.push(new CrystalDrone(sx, sy));
            }
            this.droneSpawnCooldown = 180; // 3 seconds between spawns
          }
        }
      }
    }
  }

  // External freeze hook (used by CrystalDrone collisions)
  freezePlayer(frames = 30) {
    const { player } = this.deps;
    if (this.playerFrozenTimer <= 0 && player) {
      this.playerFrozenPos.x = player.x;
      this.playerFrozenPos.y = player.y;
    }
    this.playerFrozenTimer = Math.max(this.playerFrozenTimer, frames | 0);
  }

  isPlayerFrozen() {
    return this.playerFrozenTimer > 0;
  }

  draw() {
    const { ctx, getFrameCount } = this.deps;
    this.refreshIfDisplayChanged();
    ctx.save();
    // Core with prismatic glow (cached), vulnerable when facets are gone
    const coreKey = this.facets.length > 0 ? 'shielded' : 'exposed';
    const coreSprite = this.coreGlowSprites && this.coreGlowSprites[coreKey];
    if (coreSprite) {
      ctx.drawImage(coreSprite, this.x - coreSprite.width / (2 * this.dpr), this.y - coreSprite.height / (2 * this.dpr), coreSprite.width / this.dpr, coreSprite.height / this.dpr);
    }
    // Crystal core sprite (cached) with subtle pulse
    const spr = this.coreCrystalSprite;
    if (spr) {
      const s = 1 + 0.02 * Math.sin(getFrameCount() * 0.15);
      const dw = spr.width / this.dpr;
      const dh = spr.height / this.dpr;
      ctx.save();
      ctx.translate(this.x, this.y);
      // Reduce inner diamond size by 30% while keeping outer glows same
      ctx.scale(s * 0.7, s * 0.7);
      ctx.drawImage(spr, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    // Live prism shimmer accent
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = coreKey === 'shielded' ? '#8ff' : '#f9f';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.coreRadius * 0.9, -0.9, -0.2);
    ctx.stroke();
    ctx.restore();

    // Floating crystal shards
    if (this.smallCrystalSprites && this.smallCrystalSprites.length && this.floaters && this.floaters.length) {
      const fc = getFrameCount();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.floaters) {
        const ang = f.angle + fc * f.angularVel;
        const rr = f.radius + Math.sin(fc * 0.03 + f.phase) * f.wobble;
        const px = this.x + Math.cos(ang) * rr;
        const py = this.y + Math.sin(ang) * rr;
        const s = f.scale * (1 + 0.06 * Math.sin(fc * 0.08 + f.phase));
        const sp = this.smallCrystalSprites[f.spriteIndex % this.smallCrystalSprites.length];
        if (!sp) continue;
        const dw = sp.width / this.dpr;
        const dh = sp.height / this.dpr;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang * 0.5 + f.rotOffset);
        ctx.scale(s, s);
        ctx.globalAlpha = 0.22 + 0.2 * Math.max(0, Math.sin(fc * 0.12 + f.phase));
        ctx.drawImage(sp, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }
      ctx.restore();
    }

    // Ambient prism motes
    {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const n = 14;
      const t = getFrameCount() * 0.02;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t + Math.sin(i * 1.7) * 0.12;
        const r = this.coreRadius + 28 + Math.sin(t * 2 + i) * 6;
        const px = this.x + Math.cos(a) * r;
        const py = this.y + Math.sin(a) * r;
        const size = (i % 3 === 0) ? 1.8 : 1.2;
        ctx.globalAlpha = 0.06 + 0.05 * ((i % 5) / 5);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = (i % 2 === 0) ? '#8ff' : '#f9f';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Core charge telegraph for blade spawn (last 20 frames of cooldown)
    if (this.bladeCooldown !== undefined && this.bladeCooldown <= 20) {
      const t = 1 - (this.bladeCooldown / 20); // 0..1
      const ang = this.nextBladeTheta || 0;  // radial direction of upcoming blade
      const start = ang;                      // start at radial
      const end = ang + Math.PI / 2;         // sweep 90° forward (matches blade orientation)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Outer soft arc
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.globalAlpha = 0.25 + 0.45 * t;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.coreRadius + 10, start, end);
      ctx.stroke();
      // Inner bright arc
      ctx.strokeStyle = '#8ff';
      ctx.shadowColor = '#8ff';
      ctx.shadowBlur = 3;
      ctx.globalAlpha = 0.5 + 0.5 * t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.coreRadius + 6, start, end);
      ctx.stroke();
      ctx.restore();
    }

    // Draw facets using cached base (ring + armor pips), then dynamic glow overlay
    for (let f of this.facets) {
      const fx = this.x + Math.cos(f.angle) * this.orbitRadius;
      const fy = this.y + Math.sin(f.angle) * this.orbitRadius;
      const baseSprite = this.facetBaseSprites[f.hits];
      if (baseSprite) {
        ctx.drawImage(baseSprite, fx - baseSprite.width / (2 * this.dpr), fy - baseSprite.height / (2 * this.dpr), baseSprite.width / this.dpr, baseSprite.height / this.dpr);
      }
      // Dynamic glow overlay (cheaper than full multi-pass redraw)
      const flash = f.hitFlash > 0 ? (f.hitFlash / 8) : 0;
      const glow = 14 + Math.sin(f.pulse) * 4 + flash * 8;
      const color = f.hitFlash > 0 ? '#fff' : '#8ff';
      // Outer soft halo
      ctx.globalAlpha = Math.min(0.85, 0.45 + flash * 0.3);
      ctx.shadowBlur = Math.max(0, glow);
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(fx, fy, f.radius + 0.5, 0, Math.PI * 2);
      ctx.stroke();
      // Inner bright rim
      ctx.globalAlpha = 1;
      ctx.shadowBlur = Math.max(0, glow * 0.5);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(fx, fy, f.radius - 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Frozen blades + trails
    if (this.blades && this.blades.length) {
      for (const b of this.blades) {
        // Trails
        if (b.trail && b.trail.length) {
          ctx.save();
          // draw trails in normal blend with very low alpha to avoid extra glow
          for (let j = 0; j < b.trail.length; j++) {
            const t = b.trail[j];
            const alpha = Math.min(0.05, 0.12 * (t.alpha || 0));
            if (this.bladeSprite) {
              const dw = this.bladeSprite.width / this.dpr;
              const dh = this.bladeSprite.height / this.dpr;
              ctx.save();
              // Scale based on distance from core so arc grows to 2x while keeping curvature center at core
              const dx = t.x - this.x, dy = t.y - this.y;
              const dist = Math.max(1, Math.hypot(dx, dy));
              const baseR = this._bladeBaseR || (this.coreRadius + 8);
              const s = Math.max(1, Math.min(8.5, dist / baseR));
              ctx.translate(this.x, this.y);
              ctx.rotate(t.angle);
              ctx.scale(s, s);
              ctx.globalAlpha = alpha;
              // offset so sprite's curvature center (-baseR,0) aligns to core origin
              ctx.drawImage(this.bladeSprite, -dw / 2 + baseR, -dh / 2, dw, dh);
              ctx.restore();
            }
          }
          ctx.restore();
        }
        // Main blade
        if (this.bladeSprite) {
          const dw = this.bladeSprite.width / this.dpr;
          const dh = this.bladeSprite.height / this.dpr;
          ctx.save();
          // Scale based on distance from core so arc grows to 2x while keeping curvature center at core
          const dx = b.x - this.x, dy = b.y - this.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const baseR = this._bladeBaseR || (this.coreRadius + 8);
          const s = Math.max(1, Math.min(8.5, dist / baseR));
          ctx.translate(this.x, this.y);
          ctx.rotate(b.angle);
          ctx.scale(s, s);
          if (b.opacity !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, b.opacity));
          ctx.drawImage(this.bladeSprite, -dw / 2 + baseR, -dh / 2, dw, dh);
          ctx.restore();
        }
      }
    }
    // Charging visuals: glowing hot white lines between shards (no sparks)
    if (this.chargeActive && this.facets.length > 1) {
      const positions = this.facetPositions();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = pass === 0 ? 6 : 2;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = pass === 0 ? 24 : 12;
        ctx.globalAlpha = pass === 0 ? 0.35 : 0.85;
        ctx.beginPath();
        for (let i = 0; i < positions.length; i++) {
          const A = positions[i];
          const B = positions[(i + 1) % positions.length];
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
        }
        ctx.stroke();
      }
      // (charge-up particle sparks removed for performance)
      ctx.restore();
    }

    // Beam visuals: thick white-hot core with glow (no chromatic aberration), plus trailing sparks
    if (this.beam) {
      const { sx, sy, ex, ey } = this.beam;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Beam stroke helper
      const drawStroke = (dx, dy, color, width, alpha, blur) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(sx + dx, sy + dy);
        ctx.lineTo(ex + dx, ey + dy);
        ctx.stroke();
      };
      // White-hot core (30% thinner) with 1s fade-out after active duration
      const ageDraw = getFrameCount() - this.beam.startFrame;
      let vis = 1;
      if (ageDraw > this.beam.duration) {
        const fd = this.beam.fadeDuration || 60;
        vis = Math.max(0, 1 - (ageDraw - this.beam.duration) / fd);
      }
      const wOuter = 14 * 0.7; // 30% thinner
      const wInner = 6 * 0.7;  // 30% thinner
      drawStroke(0, 0, '#ffffff', wOuter, 0.95 * vis, 28 * vis);
      drawStroke(0, 0, '#ffffff', wInner, 1.0 * vis, 12 * vis);

      // Beam sparks
      for (const p of this.beamParticles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 60));
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    // Frozen visual overlay on player (fallback if no external FX): white frosty glow
    if (this.playerFrozenTimer > 0 && this.deps.player) {
      const p = this.deps.player;
      const prog = this.playerFrozenTimer / 120; // 1..0
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const alpha = [0.35, 0.22, 0.14][k] * (0.7 + 0.3 * prog);
        const blur = [28, 16, 8][k];
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = blur;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.radius || 10) + 6 + k * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  facetPositions() {
    return this.facets.map(f => ({
      x: this.x + Math.cos(f.angle) * this.orbitRadius,
      y: this.y + Math.sin(f.angle) * this.orbitRadius,
      radius: f.radius,
      ref: f,
    }));
  }

  // Reflects bullet on facet hit; consumes bullet only when hitting core (facets destroyed)
  handleBulletCollision(bullet) {
    const { createExplosion, awardPoints, setShake } = this.deps;
    // Check facets (always reflective)
    for (let pos of this.facetPositions()) {
      const dx = bullet.x - pos.x, dy = bullet.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < pos.radius + bullet.radius) {
        // Decrement facet armor but REFLECT the bullet instead of consuming
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#8ff', 'micro');
        }
        if (pos.ref.hits <= 0) {
          // Shatter facet
          createExplosion(pos.x, pos.y, 70, '#8ff');
          // No points for facet (minion) destruction
          this.facets = this.facets.filter(ff => ff !== pos.ref);
          setShake(10, 4);
        }
        // Reflect bullet across surface normal; preserve speed and charge
        const nx = (dx / (dist || 0.0001));
        const ny = (dy / (dist || 0.0001));
        const dot = bullet.vx * nx + bullet.vy * ny;
        bullet.vx = bullet.vx - 2 * dot * nx;
        bullet.vy = bullet.vy - 2 * dot * ny;
        // Reposition just outside to avoid immediate re-collision next frame
        bullet.x = pos.x + nx * (pos.radius + bullet.radius + 2);
        bullet.y = pos.y + ny * (pos.radius + bullet.radius + 2);
        // Keep bullet alive (do not consume)
        return false;
      }
    }
    // If facets cleared, allow core damage (bullet consumed)
    if (this.facets.length === 0) {
      const dx = bullet.x - this.x, dy = bullet.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + bullet.radius) {
        this.coreHealth--;
        createExplosion(this.x, this.y, 90, '#f9f');
        if (this.coreHealth <= 0) this.onDefeated();
        return true; // bullet consumed on core hit
      }
    }
    return false;
  }

  handleParticleDamage(particle) {
    const { createExplosion, awardPoints } = this.deps;
    // Rainbow trail damaging (does not reflect)
    let hit = false;
    for (let pos of this.facetPositions()) {
      const dx = particle.x - pos.x, dy = particle.y - pos.y;
      if (Math.hypot(dx, dy) < pos.radius + 12) {
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#8ff', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#8ff');
          // No points for facet (minion) destruction
          this.facets = this.facets.filter(ff => ff !== pos.ref);
        }
        hit = true;
        break;
      }
    }
    if (!hit && this.facets.length === 0) {
      const dx = particle.x - this.x, dy = particle.y - this.y;
      if (Math.hypot(dx, dy) < this.coreRadius + 12) {
        this.coreHealth = Math.max(0, this.coreHealth - 1);
        if (this.coreHealth === 0) this.onDefeated();
      }
    }
  }

  hitByLaserLine(x1, y1, x2, y2) {
    const { lineCircleCollision, createExplosion } = this.deps;
    let any = false;
    for (let pos of this.facetPositions()) {
      if (lineCircleCollision(x1, y1, x2, y2, pos.x, pos.y, pos.radius)) {
        pos.ref.hits--;
        pos.ref.hitFlash = 8;
        any = true;
        if (pos.ref.hits > 0 && createExplosion) {
          createExplosion(pos.x, pos.y, 3, '#8ff', 'micro');
        }
        if (pos.ref.hits <= 0) {
          createExplosion(pos.x, pos.y, 70, '#8ff');
          // No points for facet (minion) destruction
          this.facets = this.facets.filter(ff => ff !== pos.ref);
        }
      }
    }
    if (this.facets.length === 0 && lineCircleCollision(x1, y1, x2, y2, this.x, this.y, this.coreRadius)) {
      this.coreHealth = Math.max(0, this.coreHealth - 2);
      createExplosion(this.x, this.y, 90, '#f9f');
      any = true;
      if (this.coreHealth === 0) this.onDefeated();
    }
    return any;
  }

  collidesWithCircle(cx, cy, cr) {
    // Player collision with facets or core (when exposed)
    for (let pos of this.facetPositions()) {
      const dx = cx - pos.x, dy = cy - pos.y;
      if (Math.hypot(dx, dy) < cr + pos.radius) return true;
    }
    if (this.facets.length === 0) {
      const dx = cx - this.x, dy = cy - this.y;
      if (Math.hypot(dx, dy) < cr + this.coreRadius) return true;
    }
    return false;
  }

  onDefeated() {
    if (this.defeated) return;
    const { createExplosion, powerups, Powerup, enemyBullets, setShake, awardPoints } = this.deps;
    this.defeated = true;
    createExplosion(this.x, this.y, this.coreRadius * 3, '#f9f');
    setShake && setShake(24, 8);
    // Award fixed points for defeating the boss core
    awardPoints(600, this.x, this.y, true);
    // Drop 2-3 powerups capped at 4 active max
    const drops = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < drops; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 60;
      const dx = this.x + Math.cos(ang) * dist;
      const dy = this.y + Math.sin(ang) * dist;
      const type = this.pickPowerupType();
      if (powerups.length < 4) powerups.push(new Powerup(dx, dy, type));
    }
    if (Math.random() < 0.5 && powerups.length < 4) {
      powerups.push(new Powerup(this.x, this.y, 'life'));
    }
    // Clear boss bullets on defeat
    enemyBullets.length = 0;
    // EXP: Award 200 EXP for defeating Crystal Titan boss
    if (this.deps.addEXP) this.deps.addEXP(200, 'boss-crystaltitan');
  }

  pickPowerupType() {
    const types = ['bomb', 'shield', 'teleport', 'flak', 'rainbow', 'invisible', 'laser', 'clone'];
    const weights = [20, 30, 20, 20, 15, 10, 10, 10];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < types.length; i++) {
      r -= weights[i];
      if (r <= 0) return types[i];
    }
    return 'shield';
  }
}
