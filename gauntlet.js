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
  } = deps;

  // Internal state
  let tier = 1;
  let heat = 0;
  let frame = 0;
  let nextWaveFrame = 0;
  let nextTrickleFrame = 0;
  let nextUpgradeFrame = 0;

  // Tunables (initial baseline; tune during playtests)
  const TRICKLE_MIN = 140; // frames
  const TRICKLE_MAX = 240;
  const WAVE_MIN = 360;    // frames
  const WAVE_MAX = 600;
  const UPGRADE_EVERY = 1800; // frames (~30s)

  // Utility: random int in [a,b]
  const rint = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));

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
    const D = 1 + (tier - 1) * 0.12 + Math.min(1.5, heat * 0.05);
    let budget = Math.floor(6 * D + rint(0, 3));

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
        // Few armored heavies, maybe one small escort
        const count = Math.max(1, Math.floor(budget / 3));
        for (let i = 0; i < count; i++) spawnAsteroidSafe(4, true, false);
        if (Math.random() < 0.5) spawnAsteroidSafe(1, false, false);
        break;
      }
      case 'elite_mix': {
        const count = Math.max(1, Math.floor(budget / 3));
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

    // Feedback
    if (glRenderer && glRenderer.pulseExplosion) {
      glRenderer.pulseExplosion(180, canvas.width * 0.5, canvas.height * 0.5);
    }
    if (showHUDMessage) showHUDMessage(`Gauntlet Wave — Tier ${tier}`, 120);

    // Progression
    tier += 1;
    heat = Math.min(100, heat + 2 + Math.floor(Math.random() * 3));
  }

  function spawnTrickle() {
    // 1–2 normals, small chance of armored when tier high
    const n = rint(1, 2);
    for (let i = 0; i < n; i++) {
      const arm = (tier >= 5) && Math.random() < 0.15;
      const sz = arm ? 4 : (Math.random() < 0.5 ? 2 : 3);
      spawnAsteroidSafe(sz, arm, false);
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

    frame++;
  }

  function getTier() { return tier; }
  function getHeat() { return heat; }

  return { init, update, getTier, getHeat };
}
