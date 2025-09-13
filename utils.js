// Utilities extracted from ast.html

// Toggle HUD visibility
export function setHUDVisible(show) {
  const ids = ['score', 'hi', 'combo', 'lives', 'level', 'controls'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) el.classList.remove('hidden'); else el.classList.add('hidden');
  });
}

// Line/segment - circle intersection test
export function lineCircleCollision(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = (fx * fx + fy * fy) - r * r;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
  const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// Apply gravity from wells to any object with vx/vy
export function applyGravityTo(obj, gravityWells, softening, factor = 1) {
  if (!gravityWells || gravityWells.length === 0) return;
  for (const gw of gravityWells) {
    const dx = gw.x - obj.x;
    const dy = gw.y - obj.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 <= gw.radius * gw.radius) {
      const dist = Math.sqrt(dist2) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      // Base inverse-square acceleration with softening
      let accel = gw.strength / (dist2 + softening);
      // Damp suction near the center to avoid trapping the player
      // Within ~45% of the well radius, reduce acceleration significantly
      const innerR = gw.radius * 0.45;
      if (dist < innerR) {
        // Quadratic dampening that bottoms out at ~20% strength at the core
        const t = Math.max(0, dist / innerR); // 0 at center .. 1 at innerR
        const damp = Math.max(0.2, t * t);
        accel *= damp;
      }
      obj.vx += nx * accel * factor;
      obj.vy += ny * accel * factor;
    }
  }
}

// Create an explosion effect by spawning particles and rings
// Dependencies are passed explicitly: Particle class and particles array
export function createExplosion(x, y, radius, color, profile = 'default', ParticleClass, particles) {
  // 'micro' profile: ultra-lightweight pop for hit feedback
  if (profile === 'micro') {
    const count = 8; // slightly richer micro-pop
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 2;
      const p = new ParticleClass(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        18
      );
      p.glow = 12;
      p.radius *= 1.12;
      // Disable wrap for culling when offscreen (moving dots only)
      p.noWrap = true;
      particles.push(p);
    }
    // Single tiny ring (reduced another 50% in size)
    const ring = new ParticleClass(x, y, 0, 0, color, 10);
    ring.shape = 'ring';
    ring.radius = Math.max(1, radius * 0.1);
    ring.growth = Math.max(0.3, radius * 0.02);
    ring.thickness = 1;
    ring.glow = 14;
    particles.push(ring);
    return;
  }

  const count = profile === 'burst' ? 160 : 120; // modestly increase particle density
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 5 + 2) * (profile === 'burst' ? 1.2 : 1);
    const p = new ParticleClass(
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      color,
      40
    );
    // Brighten dots
    p.glow = 22;
    p.radius *= 1.15;
    // Disable wrap so we can cheaply cull offscreen particles
    p.noWrap = true;
    particles.push(p);
  }
  // Shock ring
  const ring = new ParticleClass(x, y, 0, 0, color, 14);
  ring.shape = 'ring';
  ring.radius = Math.max(6, radius * 0.25);
  ring.growth = Math.max(3, radius * 0.06);
  ring.thickness = 3.0;
  ring.glow = 24;
  particles.push(ring);
  // Echo shimmer rings
  const ringEcho1 = new ParticleClass(x, y, 0, 0, color, 12);
  ringEcho1.shape = 'ring';
  ringEcho1.radius = Math.max(4, radius * 0.15);
  ringEcho1.growth = Math.max(2, radius * 0.05);
  ringEcho1.thickness = 1.8;
  ringEcho1.glow = 18;
  particles.push(ringEcho1);

  const ringEcho2 = new ParticleClass(x, y, 0, 0, color, 16);
  ringEcho2.shape = 'ring';
  ringEcho2.radius = Math.max(8, radius * 0.35);
  ringEcho2.growth = Math.max(2, radius * 0.04);
  ringEcho2.thickness = 1.6;
  ringEcho2.glow = 16;
  particles.push(ringEcho2);
  // Bright shards
  const shards = profile === 'burst' ? 14 : 8;
  for (let s = 0; s < shards; s++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 4;
    const sh = new ParticleClass(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, 30);
    sh.shape = 'shard';
    sh.length = 10 + Math.random() * 12;
    sh.glow = 18;
    sh.thickness = 2.2;
    // Disable wrap so shards get culled when offscreen
    sh.noWrap = true;
    particles.push(sh);
  }
}

// Spawn a floating bonus text into a provided array
export function spawnBonusText(floatingTexts, x, y, amount, isMax) {
  floatingTexts.push({
    x,
    y,
    vy: -0.6,
    life: isMax ? 60 : 45,
    maxLife: isMax ? 60 : 45,
    text: `+${amount}`,
    size: isMax ? 36 : 18,
    flashing: !!isMax,
  });
}

// Award points with combo logic and milestone checks
// Mutates scoreMilestones array via deps; returns updated primitive state
export function awardPoints(basePoints, x, y, state, constants, deps) {
  const {
    COMBO_WINDOW_FRAMES,
    COMBO_START_BONUS,
    COMBO_INCREMENT,
    COMBO_MAX,
  } = constants;
  let {
    comboActive,
    lastKillFrame,
    comboBonusPercent,
    currentComboBonusTotal,
    maxComboBonusTotal,
    frameCount,
    score,
    hiScore,
    hiGlowTimer,
  } = state;

  let bonus = 0;
  if (comboActive && lastKillFrame >= 0 && (frameCount - lastKillFrame) <= COMBO_WINDOW_FRAMES) {
    if (comboBonusPercent === 0) comboBonusPercent = COMBO_START_BONUS;
    bonus = Math.round(basePoints * comboBonusPercent);
    const isMax = comboBonusPercent >= COMBO_MAX;
    if (bonus > 0) deps.spawnBonusText(x, y, bonus, isMax);
    currentComboBonusTotal += bonus;
    if (isMax) {
      maxComboBonusTotal = Math.max(maxComboBonusTotal, currentComboBonusTotal);
      // Notify host for special max-combo celebration (HUD + overlay)
      try { if (deps && typeof deps.onMaxCombo === 'function') deps.onMaxCombo(currentComboBonusTotal); } catch (e) {}
      comboActive = false;
      currentComboBonusTotal = 0;
      comboBonusPercent = 0;
      lastKillFrame = frameCount;
    } else {
      comboBonusPercent = Math.min(COMBO_MAX, comboBonusPercent + COMBO_INCREMENT);
      lastKillFrame = frameCount;
    }
  } else {
    if (comboActive && lastKillFrame >= 0 && (frameCount - lastKillFrame) > COMBO_WINDOW_FRAMES) {
      maxComboBonusTotal = Math.max(maxComboBonusTotal, currentComboBonusTotal);
      currentComboBonusTotal = 0;
    }
    comboActive = true;
    comboBonusPercent = 0;
    lastKillFrame = frameCount;
  }

  const oldScore = score;
  score += basePoints + bonus;

  if (oldScore <= hiScore && score > hiScore) {
    hiGlowTimer = 180;
  }

  const oldMilestone = Math.floor(oldScore / 1000);
  const newMilestone = Math.floor(score / 1000);
  if (newMilestone > oldMilestone) {
    deps.scoreMilestones.push(new deps.ScoreMilestone(newMilestone * 1000));
  }

  return {
    score,
    comboActive,
    lastKillFrame,
    comboBonusPercent,
    currentComboBonusTotal,
    maxComboBonusTotal,
    hiGlowTimer,
  };
}

// Check if a point (x, y) is safe from asteroids by a margin
export function isSafeLocation(asteroids, x, y, extraMargin = 50) {
  if (!asteroids || asteroids.length === 0) return true;
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i];
    const dx = a.x - x;
    const dy = a.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < a.radius + extraMargin) return false;
  }
  return true;
}

// Compute a safe respawn position given playfield, boss state, and asteroids
// Returns an object: { x, y }
export function safeRespawn(canvasWidth, canvasHeight, playerRadius, bossActive, boss, asteroids, margin = 60, tries = 80) {
  let rx = canvasWidth / 2;
  let ry = canvasHeight / 2;
  if (bossActive && boss) {
    const minR = (boss.orbitRadius || 160) + 140;
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * 220;
      rx = boss.x + Math.cos(a) * r;
      ry = boss.y + Math.sin(a) * r;
      // Keep within screen bounds with margin
      rx = Math.max(margin, Math.min(canvasWidth - margin, rx));
      ry = Math.max(margin, Math.min(canvasHeight - margin, ry));
      const awayFromBoss = Math.hypot(rx - boss.x, ry - boss.y) > ((boss.orbitRadius || 160) + 100);
      let bossClear = true;
      if (boss && typeof boss.collidesWithCircle === 'function') {
        bossClear = !boss.collidesWithCircle(rx, ry, playerRadius + 20);
      }
      if (awayFromBoss && bossClear && isSafeLocation(asteroids, rx, ry, 50)) break;
    }
  } else {
    for (let i = 0; i < tries; i++) {
      rx = Math.random() * canvasWidth;
      ry = Math.random() * canvasHeight;
      if (isSafeLocation(asteroids, rx, ry, 50)) break;
    }
  }
  return { x: rx, y: ry };
}

// Apply radial shockwave impulse/push from a detonation at (cx, cy)
export function applyShockwave(cx, cy, radius, strength, { player, asteroids, strandedShip }) {
  // Push player
  {
    const dx = player.x - cx;
    const dy = player.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < radius) {
      const nx = dx / dist;
      const ny = dy / dist;
      const falloff = 1 - (dist / radius);
      const impulse = strength * falloff;
      player.vx += nx * impulse;
      player.vy += ny * impulse;
      // Nudge slightly outward to avoid re-triggering
      player.x += nx * 6 * falloff;
      player.y += ny * 6 * falloff;
    }
  }
  // Push asteroids
  asteroids.forEach(ast => {
    const dx = ast.x - cx;
    const dy = ast.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < radius) {
      const nx = dx / dist;
      const ny = dy / dist;
      const falloff = 1 - (dist / radius);
      const impulse = strength * falloff;
      ast.vx += nx * impulse;
      ast.vy += ny * impulse;
      ast.x += nx * 8 * falloff;
      ast.y += ny * 8 * falloff;
    }
  });
  // Push stranded ship (position-only)
  if (strandedShip && strandedShip.active) {
    const dx = strandedShip.x - cx;
    const dy = strandedShip.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < radius) {
      const nx = dx / dist;
      const ny = dy / dist;
      const falloff = 1 - (dist / radius);
      strandedShip.x += nx * 10 * falloff;
      strandedShip.y += ny * 10 * falloff;
    }
  }
}

// SpatialGrid: uniform grid for broad-phase circle queries (insertion by circle bounds)
// Usage:
//   const grid = new SpatialGrid(cellSize);
//   grid.buildFrom(asteroids); // objects with x,y,radius
//   const candidates = grid.queryCircle(x, y, r);
export class SpatialGrid {
  constructor(cellSize = 64) {
    this.s = Math.max(8, Math.floor(cellSize) || 64);
    this.cells = new Map(); // key: "ix,iy" -> Array of objects
  }

  clear() { this.cells.clear(); }

  _key(ix, iy) { return ix + ',' + iy; }

  insert(obj) {
    const r = Math.max(0, obj.radius || 0);
    const s = this.s;
    const minX = Math.floor((obj.x - r) / s);
    const maxX = Math.floor((obj.x + r) / s);
    const minY = Math.floor((obj.y - r) / s);
    const maxY = Math.floor((obj.y + r) / s);
    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const k = this._key(ix, iy);
        let bucket = this.cells.get(k);
        if (!bucket) { bucket = []; this.cells.set(k, bucket); }
        bucket.push(obj);
      }
    }
  }

  buildFrom(objs) {
    this.clear();
    if (!objs || !objs.length) return;
    for (let i = 0; i < objs.length; i++) this.insert(objs[i]);
  }

  queryCircle(x, y, r) {
    const s = this.s;
    const minX = Math.floor((x - r) / s);
    const maxX = Math.floor((x + r) / s);
    const minY = Math.floor((y - r) / s);
    const maxY = Math.floor((y + r) / s);
    const results = [];
    const seen = new WeakSet();
    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const bucket = this.cells.get(this._key(ix, iy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const o = bucket[i];
          if (seen.has(o)) continue;
          seen.add(o);
          results.push(o);
        }
      }
    }
    return results;
  }
}
