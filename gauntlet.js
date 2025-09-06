// gauntlet.js — Endless Gauntlet mode core loop (waves, difficulty, upgrades)
// This module is intentionally self-contained and interacts with the host game
// (ast.html) only through injected dependencies.

export function createGauntletMode(deps) {
  const {
    canvas,
    asteroids,
    phasedAsteroids,
    bullets,
    particles,
    powerups,
    drones,
    enemyBullets,
    mines,
    // Classes
    Asteroid,
    // Helpers
    isSafeXY, // (x, y) => boolean using existing safe spawn utility
    showHUDMessage,
    beginUpgradeSelection, // starts upgrade UI without touching classic level state
    createExplosion,
    // Rendering effects (optional)
    glRenderer,
    // Reward unlock hook from host (ast.html)
    unlockReward,
  } = deps;

  // Internal state
  let tier = 1;
  let heat = 0;
  let frame = 0;
  let nextWaveFrame = 0;
  let nextTrickleFrame = 0;
  let nextUpgradeFrame = 0;
  let gauntletTrailUnlocked = false;

  // Tunables (initial baseline; tune during playtests)
  const TRICKLE_MIN = 80;  // frames (denser)
  const TRICKLE_MAX = 140;
  const WAVE_MIN = 300;    // frames (more frequent)
  const WAVE_MAX = 480;
  const UPGRADE_EVERY = 1800; // frames (~30s)
  // Baseline alive-asteroid target for topping up between waves
  const BASE_ACTIVE_ASTEROIDS = 12; // higher starting target
  const ACTIVE_CAP = 64; // slightly higher cap to allow late-game density

  // Utility: random int in [a,b]
  const rint = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));

  // Multipliers based on tier thresholds
  function armoredMul() { return (tier >= 15) ? 1.6 : 1.0; }
  function eliteMul() { return (tier >= 20) ? 1.6 : 1.0; }

  // Target alive asteroid count grows per tier with milestone step-ups
  function desiredActiveAsteroids() {
    const scale = 1 + Math.max(0, (tier - 1)) * 0.12; // +12% per tier beyond 1
    const stepBonus = Math.floor(tier / 5) * 3;       // +3 alive per 5 tiers (5,10,15,...)
    return Math.min(ACTIVE_CAP, Math.floor(BASE_ACTIVE_ASTEROIDS * scale) + stepBonus);
  }

  // Utility: push an asteroid at a safe on-screen location
  function spawnAsteroidSafe(size = 3, armored = false, elite = false) {
    let tries = 0;
    let x = 0, y = 0;
    do {
      x = Math.random() * canvas.width;
      y = Math.random() * canvas.height;
      tries++;
    } while (!isSafeXY(x, y) && tries < 100);
    asteroids.push(new Asteroid(x, y, size, armored, elite));
  }

  // Pick a wave archetype scaled by tier/heat and spawn it
  function spawnWave() {
    // Budget grows with tier; heat gives small extra spice.
    let D = 1 + (tier - 1) * 0.18 + Math.min(1.8, heat * 0.06);
    let budget = Math.floor(6 * D + rint(1, 4));
    // Milestone bonuses to ensure wave density increases noticeably
    if (tier >= 5)  budget += 2;
    if (tier >= 10) budget += 3;
    if (tier >= 15) budget += 4;
    if (tier >= 20) budget += 5;

    // Weighted archetype choice
    const archetypes = [
      'normal_swarm',     // many small/medium normals
      'armored_pair',     // a few armored heavies
      'elite_mix',        // elites that explode on death
      'phased_pulse',     // placeholder (skip if no class)
    ];
    const weights = [6, 3, 2, 1];
    const totalW = weights.reduce((a, b) => a + b, 0);
    let pick = Math.random() * totalW;
    let type = archetypes[0];
    for (let i = 0; i < archetypes.length; i++) {
      pick -= weights[i];
      if (pick <= 0) { type = archetypes[i]; break; }
    }

    switch (type) {
      case 'normal_swarm': {
        // Spend budget on size 2–3 normals
        while (budget > 0) {
          const sz = Math.random() < 0.6 ? 3 : 2;
          spawnAsteroidSafe(sz, false, false);
          budget -= (sz === 3 ? 2 : 1);
        }
        break;
      }
      case 'armored_pair': {
        // Few armored heavies, maybe one small escort. Scale up past tier 15.
        const base = Math.max(1, Math.floor(budget / 3));
        const count = Math.max(1, Math.ceil(base * armoredMul()));
        for (let i = 0; i < count; i++) spawnAsteroidSafe(4, true, false);
        if (Math.random() < 0.5) spawnAsteroidSafe(1, false, false);
        break;
      }
      case 'elite_mix': {
        // Scale elites up past tier 20.
        const base = Math.max(1, Math.floor(budget / 3));
        const count = Math.max(1, Math.ceil(base * eliteMul()));
        for (let i = 0; i < count; i++) spawnAsteroidSafe(3, false, true);
        break;
      }
      case 'phased_pulse': {
        // If phasedAsteroids supported elsewhere, a light placeholder: convert a couple of normals to smalls
        // Keep classic entities untouched; use normal spawns for now.
        for (let i = 0; i < Math.max(1, Math.floor(budget / 4)); i++) spawnAsteroidSafe(2, false, false);
        break;
      }
    }

    // Tier-based bonus spawns for added challenge milestones
    if (tier >= 10) {
      // Two additional armored heavies
      for (let i = 0; i < 2; i++) spawnAsteroidSafe(4, true, false);
    }
    if (tier >= 15) {
      // Two additional elite asteroids
      for (let i = 0; i < 2; i++) spawnAsteroidSafe(3, false, true);
    }
    if (tier >= 20) {
      // Two additional elite asteroids
      for (let i = 0; i < 2; i++) spawnAsteroidSafe(4, false, true);
    }

    // Feedback
    if (glRenderer && glRenderer.pulseExplosion) {
      glRenderer.pulseExplosion(180, canvas.width * 0.5, canvas.height * 0.5);
    }
    if (showHUDMessage) showHUDMessage(`Gauntlet Wave — Tier ${tier}`, 120);

    // Progression
    const prevTier = tier;
    tier += 1;
    heat = Math.min(100, heat + 2 + Math.floor(Math.random() * 3));

    // After a wave, ensure the field is promptly repopulated toward the current target
    // to prevent long lulls where only small trickles appear.
    (function burstTopUp() {
      const want = desiredActiveAsteroids();
      let spawned = 0;
      const cap = Math.min(12, want); // avoid huge spikes in one frame
      while (asteroids.length < want && spawned < cap) {
        const arm = (tier >= 20) ? (Math.random() < 0.25) : ((tier >= 12) && Math.random() < 0.15);
        const elite = (tier >= 25) ? (Math.random() < 0.40) : ((tier >= 20) && Math.random() < 0.30);
        const sz = arm ? 4 : (Math.random() < 0.5 ? 2 : 3);
        spawnAsteroidSafe(sz, arm, elite);
        spawned++;
      }
    })();

    // Unlock Gauntlet cosmetic at Tier 15
    if (!gauntletTrailUnlocked && prevTier < 15 && tier >= 15 && typeof unlockReward === 'function') {
      try {
        const newly = unlockReward('trail_gauntlet', true);
        gauntletTrailUnlocked = true;
      } catch (e) { /* no-op */ }
    }
  }

  function spawnTrickle() {
    // Trickle density scales by tier; includes armored and elites at milestones
    const n = (tier >= 20) ? rint(3, 5) : (tier >= 10 ? rint(2, 4) : rint(1, 2));
    for (let i = 0; i < n; i++) {
      // Increase armored trickle chance more aggressively after tier 15
      const baseArmChance = 0.15;
      const armChance = (tier >= 20) ? 0.30 : (tier >= 15 ? 0.24 : baseArmChance);
      const arm = (tier >= 5) && Math.random() < armChance;
      // Elite chance kicks in at tier 20, grows after 25
      const elite = (tier >= 25) ? (Math.random() < 0.40) : ((tier >= 20) && Math.random() < 0.30);
      const sz = arm ? 4 : (Math.random() < 0.5 ? 2 : 3);
      spawnAsteroidSafe(sz, arm, elite);
    }
  }

  function resetField() {
    asteroids.length = 0;
    phasedAsteroids.length = 0;
    bullets.length = 0;
    particles.length = 0;
    powerups.length = 0;
    drones.length = 0;
    enemyBullets.length = 0;
    if (mines) mines.length = 0;
  }

  function init() {
    frame = 0;
    tier = 1;
    heat = 0;
    resetField();
    if (showHUDMessage) showHUDMessage('Endless Gauntlet — Survive!', 180);
    // First wave and timers
    nextWaveFrame = rint(120, 240); // ~2–4s
    nextTrickleFrame = rint(TRICKLE_MIN, TRICKLE_MAX);
    nextUpgradeFrame = UPGRADE_EVERY;
  }

  function update() {
    // Simple heat decay
    if (heat > 0 && frame % 120 === 0) heat -= 1;

    // Schedule events
    if (frame >= nextWaveFrame) {
        spawnWave();
        nextWaveFrame = frame + rint(WAVE_MIN, WAVE_MAX);
    }
    if (frame >= nextTrickleFrame) {
      spawnTrickle();
      nextTrickleFrame = frame + rint(TRICKLE_MIN, TRICKLE_MAX);
    }
    if (frame >= nextUpgradeFrame) {
      if (typeof beginUpgradeSelection === 'function') beginUpgradeSelection();
      nextUpgradeFrame = frame + UPGRADE_EVERY;
    }

    // Between waves, ensure a minimum active presence that scales by tier
    // Spread top-up over frames to avoid spikes
    const want = desiredActiveAsteroids();
    if (asteroids.length < want) {
      const deficit = want - asteroids.length;
      // Spawn more per frame as tiers rise AND as the deficit grows
      const perFrameCap = Math.min(2 + Math.floor(tier / 5), 6); // 2@t<5, 3@5–9, 4@10–14, 5@15–19, 6@20+
      const deficitBoost = Math.max(2, Math.ceil(deficit * 0.4));
      const spawnNow = Math.min(Math.max(perFrameCap, deficitBoost), 10);
      for (let i = 0; i < spawnNow; i++) {
        const arm = (tier >= 20) ? (Math.random() < 0.25) : ((tier >= 12) && Math.random() < 0.15);
        const elite = (tier >= 25) ? (Math.random() < 0.40) : ((tier >= 20) && Math.random() < 0.30);
        const sz = arm ? 4 : (Math.random() < 0.5 ? 2 : 3);
        spawnAsteroidSafe(sz, arm, elite);
      }
      // When the field is empty, also pull forward the next trickle to avoid dead time
      if (asteroids.length === 0) {
        nextTrickleFrame = frame; // trigger on next frame
        // Also pull next wave earlier to re-engage
        nextWaveFrame = Math.min(nextWaveFrame, frame + 120);
      }
    }

    frame++;
  }

  function getTier() { return tier; }
  function getHeat() { return heat; }

  return { init, update, getTier, getHeat };
}
