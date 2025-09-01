### WebGL Overlay (glRenderer API)

- **Initialization**: The overlay is created in `ast.html` if `ENABLE_WEBGL` and `WEBGL_BACKEND === 'pixi'`. It mirrors the base canvas to a texture and composites with post-processing filters (FXAA, bloom, RGB split, CRT, zoom blur, vignette, noise, bulge/pinch lens) plus an additive glow layer.

- ## EXP & Rewards System (Implemented)

This section documents the implemented player progression system: EXP accumulation across runs, permanent rewards, UI feedback, and persistence. All features listed here are live in `ast.html`.

### Core State
- __Variables__: `playerExp`, `currentPlayerLevel`, `expGainedThisGame`, `unlockedRewards` (`Set`)
- __Functions__: `addEXP(amount, source)`, `awardComboBonusExp()`, `awardStrandedShipBonus()`, `drawEXPDisplay(ctx, x, y)`, `getNextRewardPreview()`, `applyPermanentRewards()`, `saveExpPersistence()`, `loadExpPersistence()`
- __Gating__: All EXP/rewards are disabled when `gameMode === 'gauntlet'`.

### EXP Sources (Classic mode)
- __Asteroids__: EXP is awarded through the `awardPoints` wrapper in `ast.html`, mapping base score awards to EXP. Phased asteroid also awards EXP via its dependency `deps.addEXP(12)` in `phasedAsteroid.js`.
- __Boss defeats__:
  - Colossus (L4): 100 EXP
  - Dreadship (L8): 150 EXP
  - Crystal Titan (L10): 200 EXP
  - Alien Mothership (L12): 250 EXP
  - Final Asteroid Boss (L15): 400 EXP
- __Score milestones__: Every 1000 score threshold crossed grants +20 EXP, capped at 12000 points total.
- __Combo bonus at Game Over__: `awardComboBonusExp()` grants 1 EXP per point of the max combo bonus total achieved this run.
- __Special event__: Saving the stranded ship to evacuation awards +20 EXP (once per event).

### Levels & Thresholds
Level is computed from total EXP using `EXP_LEVELS`:
- L1: 0
- L2: 200
- L3: 400
- L4: 700
- L5: 1100
- L6: 1600
- L7: 2200
- L8: 2900
- L9: 3700
- L10: 4600
- L11: 5600
- L12: 6700
- L13: 7900
- L14: 9200
- L15: 10600
- L16: 12100
- L17: 13700
- L18: 15400
- L19: 17200
- L20: 19100
- L21: 21100
- L22: 23200
- L23: 25400
- L24: 27700
- L25: 30100

### Permanent Rewards (Unlocked by Level)
Applied at classic game initialization via `applyPermanentRewards()`:
- __L2__: `maxArmor+1` — Start with 1 armor; raises max armor by +1.
- __L3__: `speed+5%` — `player.maxSpeed` × 1.05.
- __L4__: `life+1` — Start with 4 lives.
- __L5__: `drop+10%` — Power-up drop rate multiplier × 1.10.
- __L6__: `bulletRange+10%` — Bullet lifetime/range multiplier × 1.10.
- __L7__: `shield+1sec` — +60 frames shield duration bonus.
- __L8__: `laser+1` — +1 laser charge per pickup.
- __L9__: `bomb+1` — +1 bomb charge per pickup.
- __L10__: `eliteKit` — Additional +10% speed, +1 max armor, +10% drop rate (stacks with earlier rewards).
- __L11__: `skin_cobalt` — Cosmetic ship skin; ship outline/glow shifts to cobalt blue.
- __L12__: `trail_neonPurple` — Cosmetic trail; afterimage trail glows neon purple.
- __L13__: `skin_emerald` — Cosmetic ship skin; ship outline/glow shifts to emerald.
- __L14__: `trail_sunset` — Cosmetic trail; afterimage trail glows sunset peach.
- __L15__: `skin_vaporwave` — Cosmetic ship skin; ship outline/glow shifts to vaporwave pink.
- __L16__: `trail_iceBlue` — Pale cyan trail.
- __L17__: `skin_crimson` — Deep red ship.
- __L18__: `trail_stardust` — Pale starlight trail with a subtle pulse.
- __L19__: `skin_gold` — Warm gold ship, slightly stronger glow.
- __L20__: `trail_mint` — Fresh mint-green trail.
- __L21__: `skin_midnight` — Dark blue ship, slightly stronger glow for readability.
- __L22__: `trail_plasma` — Vibrant magenta trail, a bit thicker line.
- __L23__: `skin_arctic` — Frosty white-blue ship.
- __L24__: `trail_ember` — Warm ember orange trail.
- __L25__: `skin_aurora` — Subtle hue-cycling ship color.

#### Cosmetic Visuals & Selection
- __Unlocks__: Cosmetics are visual‑only rewards starting post‑L10.
- __Application__: On game init, `applyPermanentRewards()` sets `window.activeTrailId` and `window.activeSkinId` from `unlockedRewards`.
  - Trail priority: prefers higher tier overall (e.g., L24 `trail_ember` > L22 `trail_plasma` > L20 `trail_mint` > L18 `trail_stardust` > L16 `trail_iceBlue` > L14 `trail_sunset` > L12 `trail_neonPurple`).
  - Skin priority: prefers higher tier overall (e.g., L25 `skin_aurora` > L23 `skin_arctic` > L21 `skin_midnight` > L19 `skin_gold` > L17 `skin_crimson` > L15 `skin_vaporwave` > L13 `skin_emerald` > L11 `skin_cobalt`).
- __Rendering__:
  - Trail colors: `trail_neonPurple` → `#b66bff`, `trail_sunset` → `#ff9a9e`, `trail_iceBlue` → `#9fe3ff`, `trail_stardust` → soft pulsing pale blue-white, `trail_mint` → `#6fffc1`, `trail_plasma` → `#ff4fd6` (slightly thicker), `trail_ember` → `#ff8a2b`.
  - Skin colors: `skin_cobalt` → `#3ea0ff`, `skin_emerald` → `#3ef08a`, `skin_vaporwave` → `#ff71ce`, `skin_crimson` → `#ff3b3b`, `skin_gold` → `#ffcf3e` (+glow), `skin_midnight` → `#1e2a78` (+glow), `skin_arctic` → `#dff6ff`, `skin_aurora` → slow hue cycle.
  - Other states (rainbow, invisibility, invulnerability flashes) continue to overlay/affect visuals as before.

### Sound effects ###
Created https://www.bfxr.net/
exported as .wav


### UI Integration
- __Start screen (`#startScreen`)__:
  - `#playerLevelStart`: shows current player level.
  - `#nextRewardPreviewStart`: shows `getNextRewardPreview()` string.
  - Populated in `initMenuInfo()` and refreshed whenever returning to start.
- __HUD (gameplay)__:
  - `drawEXPDisplay(ctx, 20, 44)` renders "LVL N – EXP: X", a progress bar to next level, and a subtle next‑reward line using `getNextRewardPreview()`.
  - Level-up and EXP event messages are surfaced via `showHUDMessage()` calls in `addEXP()` and award helpers.
- __Game Over__:
  - `awardComboBonusExp()` is invoked, then `saveExpPersistence()`.
  - `#lastGameExp` shows "+N EXP" gained this run.

### Persistence
- __Keys__: `asteraidPlayerExp`, `asteraidPlayerLevel`, `asteraidUnlockedRewards`, `asteraidLastGameExp` (localStorage).
- __Load__: `loadExpPersistence()` at menu init.
- __Save__: `saveExpPersistence()` on classic game over.
- __Application__: `applyPermanentRewards()` during `initGame()` (classic only) resets base stats and applies unlocked rewards.

### Integration Points (Code)
- `ast.html`: EXP state, helpers, persistence, UI wiring, HUD draw call.
- Boss modules (`colossusBoss.js`, `dreadshipBoss.js`, `crystalTitanBoss.js`, `alienMothershipBoss.js`, `finalAsteroidBoss.js`): award EXP on `onDefeated()` via injected `addEXP`.
- `phasedAsteroid.js`: awards fixed EXP on destroy via `deps.addEXP(...)`.
- `awardPoints` in `ast.html`: maps score events to EXP and also triggers milestone EXP.

### Balancing & Tuning Knobs
- Per‑source EXP amounts, milestone amount/cap, reward multipliers, and EXP thresholds are centralized in `ast.html` constants/tables for straightforward tuning.

### Current Behavior Summary
- Classic runs accumulate EXP and unlock rewards; Gauntlet mode is excluded from EXP, UI, and reward application.
- Start screen shows current level and next reward; gameplay HUD shows level, bar, and next reward; Game Over shows EXP gained.
- Rewards affect only starting stats of new classic runs via `applyPermanentRewards()`.

---


---

## Player Benefits
- __Motivation__: Progress continues across runs.
- __Replayability__: Starting bonuses make subsequent runs fresh and rewarding.
- __Arcade spirit retained__: System is simple, legible, and non‑intrusive.

- **Core object**: `window.glRenderer` exposes runtime controls:
  - `update(state)`: Syncs size, refreshes source texture, decays pulses, drives the bulge lens for shield refraction when `state.shielded` is true, composites feedback/source/glow, fades glow items, and renders.
  - `setLaunchBlur(amount)` (0..~1.2): Adjusts zoom blur (or bloom fallback) used in the boot/start launch sequence.
  - `setFeedbackAlpha(alpha)`, `resetFeedbackAlpha()`: Tune the feedback trail opacity during launch.
  - `setBloomScale(scale)`, `setChromaticOffset(x, y)`: Quick knobs for bloom/chromatic aberration.
  - `setPostFX(opts)`: Batch-tune filters.
    - Bloom (Advanced): `bloomThreshold`, `bloomScale`, `bloomBrightness`.
    - Bloom (Simple): `bloomScale` maps to blur.
    - CRT: `scanlineWidth`, `scanlineContrast`, `scanlineVertical`, `curvature`, `noise`.
    - Vignette: `vignetteSize`, `vignetteDarkness`.
    - Noise: `noise`.
  - `getPostFX()`: Returns current filter parameters (bloom/CRT/vignette/noise).
  - Pulses: `pulseExplosion(radius, x, y)`, `pulseLaser(strength)`, `pulseHit(strength)`.
  - Glow sprites: `spawnGlow(x, y, color=0xffffff, size=32, alpha=0.8)` adds an additive glow decal that auto-fades.

- **In-game usage references (ast.html)**:
  - Laser fire: `pulseLaser(1.0)` and a local `spawnGlow` at the muzzle when the laser triggers.
  - Explosions: `createExplosion(...)` invokes `pulseExplosion(radius, x, y)` on detonation.
  - Player hit or shield absorb: `pulseHit(1.0)` when the player takes damage or a shield deflects.
  - Launch animation: `setLaunchBlur(...)` and `set/resetFeedbackAlpha(...)` during the boot/start launch sequence.
  - Score milestones: `pulseExplosion(140)` + `spawnGlow(center)` when crossing milestone thresholds.

- **Shield refraction**: While `state.shielded` is true in `update(state)`, the bulge lens centers on the player, sets `radius ≈ max(60, playerRadius * 3)`, and boosts lens strength for a refractive shield shimmer.

- **Performance note**: The overlay continuously mirrors the base canvas each frame. If targeting low-end devices, toggle `ENABLE_WEBGL` off or reduce bloom/noise intensities via `setPostFX()`.


- **Core mechanics**: wraparound movement, thrust/rotate/shoot, charged shot, 8 power‑ups (Bomb, Shield, Teleport, Flak, Rainbow, Invisible, Laser, Clone), combo scoring, and juicy neon VFX.
- **Level flow**:
  - **L1** Classic waves of asteroids to warm up.
  - **L2** Rescue: protect a stranded ship with visible health and HUD objective.
  - **L3** Armored escalation: tougher asteroids, more pressure.
  - **L4** Boss — Colossus Asteroid: destroy orbiting armored plates, then the core.
  - **L5** Gravity Wells: space bends; bullets curve, slingshots open.
  - **L6** Minefields: proximity shockwaves push everything; no armor spawns; rescue returns.
  - **L7** Wormholes + Elite asteroids: portals warp entities; elites are bigger, tougher, and explode on death.
  - **L8** Boss — Alien Dreadship: rotating turrets, laser sweeps, and homing drones.
  - **L9** Asteroid Belt: dense field of medium asteroids; a brief gauntlet between bosses.
  - **L10** Boss — Crystal Titan: shatter 7 reflective crystal facets (3 hits each) to expose and destroy the core (12 hits).
  - **L11** Stranded-Ship Gauntlet (Redux): continuous trickle of normal asteroids; two wormhole pairs; protect the stranded ship or game over.
  - **L12** Boss — Alien Mothership: shield nodes guard the core; destroy nodes to expose core; HUD calls out “CORE EXPOSED!”.

## Technical Implementation Details
 
### Rendering & Neon Effects
- **Glow layers**: Extensive `shadowBlur` + `shadowColor` stacks for neon lines and UI.
- **Color cycling**: Rainbow uses HSL cycling for smooth hue shifts.
- **Particles**: Custom `Particle` system for explosions, trails, and teleports.
- **Floating bonus text**: Combo bonuses render as neon-glowing floating `+points` above the destruction point; max-bonus flashes and enlarges.
- **Starfield**: Drawn every frame behind all states (start, playing, gameover) for visual continuity. Reinitialized in `initGame()` on start/restart so it never disappears.
- **CRT vibe**: Scanlines, vignette, subtle flicker; menu buttons feature a pulsing neon border.
- **UI pulse glows**: `SCORE` gains a yellow pulse glow while current score exceeds `Hi-Score`. `LEVEL` text pulses briefly after level changes.
- **Bullet streaks (New)**: Player and enemy bullets render thin neon motion streaks plus a core glow for a CRT vector look.

### Game States & UI
- **States**: `start`, `playing`, `paused`, `upgrade`, `gameover`.
- **HUD (during gameplay)**: 
  - `SCORE` (top-left)
  - `Hi-Score` (separate element to the right of `SCORE`)
  - `LEVEL` (top-center)
  - `Combo` (top-center right: shows highest combo bonus achieved this game)
  - `LIVES` (top-right)
  - `STRANDED SHIP` status and `OBJECTIVE` when active
  - `POWER-UP` prompt
  - `CONTROLS` hint (hidden until game starts)
- **Visibility**: HUD elements are hidden on the start screen and shown when the game starts.
- **Start Screen**: Starfield visible. `HI-SCORE` shown top-center; tips shown bottom-center.
- **Hi-Score Persistence**: Stored in `localStorage` under `asteraidHiScore`.

### Pause System (New)
- **Toggle**: Press `P` during gameplay to pause/resume.
- **Behavior**: While paused, game updates and rendering are gated; `frameCount` does not advance. A `PAUSED` overlay is shown.
- **Input gating**: Power-up activation (`Enter`) is disabled while paused.
- **State reset**: Paused state resets (unpauses) on Start, Restart, and Game Over transitions.

### Upgrade System (New)
- **Trigger**: At each 1000-point threshold, gameplay enters an `upgrade` state and pauses all gameplay updates (background and UI still render). Boss phases suppress the prompt until after the fight.
- **Overlay**: An upgrade overlay shows two choices; HUD is hidden during selection and restored after.
- **Choices**:
  - Armor +1 (capped at 6 total armor)
  - Engine +20% to `player.maxSpeed`
  - Bullet range +25% (multiplier)
  - Power-up drop rate +25% (multiplier)
  - Charged shot size +25% (multiplier)
- **Flow**: Selection resumes normal play, advances level, and briefly pulses `LEVEL` text. Internal guard (`pendingLevel`) prevents duplicate prompts.

### Controls
- **Movement**: Arrow keys or WASD
- **Shoot**: Spacebar (hold > 60 frames for charged shot)
- **Use power-up**: Enter
- **Pause**: P

### Scoring
- Base points per asteroid destroyed (by bullet, laser, bomb, rainbow trail, etc.):
  - Large (size 3): 30
  - Medium (size 2): 20
  - Small (size 1): 10
  - Armored (size 4): 50
- Combo scoring (implemented):
  - 1.5s window between kills (frame-based: 90 at 60 FPS).
  - Second kill starts at +30% bonus on base points; each subsequent kill within the window adds +5% up to +50% cap.
  - Bonus points are shown as floating neon `+bonus` text at the destruction point; at max bonus the text doubles in size and flashes.
  - Combo ends when the cap is reached or the window expires.
  - The highest bonus-only total achieved within a single combo chain this game is tracked and shown in HUD as `Combo`.
  - Highest combo value resets when starting a new game.

### Asteroids
- **Sizes**: 1 (small), 2 (medium), 3 (large), 4 (armored large)
- **Splits**:
  - Size 3 → two size 2
  - Size 2 → two size 1
  - Size 4 armored → three size 1 armored (each keeps 3-hit armor)
- **Armored hits**: 3 hits required; armored draw red; normal draw magenta.

### Power-ups
- Dropped by asteroids per rules below; held one-at-a-time until used with Enter.
- Effects and durations:
  - **Bomb**: Instant explosion radius ~150, destroys nearby asteroids.
  - **Shield**: 300 frames. Player invulnerable; asteroids bounce off shield (no asteroid damage); charged-shot while shielded creates a large explosion and ends shield.
  - **Teleport**: Relocate to a safe random location; brief entry/exit particle effects; temporary `teleporting` visual (~45 frames).
  - **Flak**: Fires 12 short-lifetime spread shots; applies recoil to player.
  - **Rainbow**: 270 frames. Leaves a damaging multicolor trail that can destroy asteroids on contact.
  - **Invisible**: 240 frames. Player becomes almost fully transparent and invulnerable while active.
  - **Laser**: Instant piercing beam along facing direction; briefly lingers visually (~0.3s).
  - **Clone**: Grants stock to deploy static friendly turrets. Press Enter while selected to deploy a turret at your current position facing your current angle.
    - Each turret: fires automatically every 30 frames (0.5s), lasts 300 frames (5s), and is capped to 3 simultaneous turrets.
    - Deploy consumes 1 stock; stock cap is 3. Turrets are cleared on player respawn but remaining stock is preserved.

 - Multi-charge behavior and HUD:
   - Bombs and Lasers grant charges; Clone grants stock. When multiple are available, HUD shows `xN` next to the power-up name and the selection remains after use until charges/stock reach 0.
   - Upgrades affect charge gains on pickup: Upgraded Bomb/Laser grant +1 extra shot; Clone Logistics grants +1 extra stock per pickup (cap 3).

### Power-up Drops
- Always drop from armored asteroids of size 4 and armored small (size 1).
- Otherwise 20% chance to drop.
- Selection weights:
  - From armored: equal weights for all 8 types.
  - From normal: Bomb 20, Shield 30, Teleport 20, Flak 20, Rainbow 15, Invisible 10, Laser 10, Clone 10.
 - Field cap: at most 4 power-ups can exist concurrently on the field (`powerups.length < 4`).
 - Level 8 drones: homing drones have a 30% chance to drop a random power-up on impact (respects the 4-cap).

### Levels & Progression
- Level thresholds by score:
  - **Level 1**: 0–999
  - **Level 2**: 1000–1999 — spawns a stranded ship with 5 health; protect it (HUD shows ship status/objective).
  - **Level 3**: 2000–2999 — armored threat increases; two armored spawn immediately on level start, and armored spawns every 500 points are doubled.
  - **Level 4**: 3000–3999 — Boss: Colossus Asteroid (orbiting armored plates + core). Waves are paused during the fight; when the boss is absent, waves in Level 4 have a higher armored chance.
  - **Level 5**: 4000–4999 — Gravity Wells: random wells pull objects; bullets curve slightly; slingshot routes open up.
  - **Level 6**: 5000–5999 — Minefields: drifting mines detonate on proximity or when shot; they cause no damage but emit a shockwave that pushes the player, stranded ship, and asteroids. Mines bounce off asteroids and other mines. Armored asteroids are disabled. A stranded ship objective returns (same rules as Level 2).

- On reaching each 1000-point threshold, the game pauses for an upgrade selection (two options). During bosses, the selection is deferred until after the fight.
- Armor Milestone: also grants +1 armor every 1000 points, capped at 6 total armor.

### Spawning Rules
- **Waves**: When all asteroids are cleared, spawn `min(4 + floor(score/1000), 8)` new asteroids at safe locations.
- **Armored cadence**: Every 500 points, spawn one armored asteroid (disabled during boss fights and during Levels 6–7); on Level 3, spawn two instead.
- **Level 2 entry**: Spawns a `StrandedShip` once at a safe random location; shows an objective message “Protect the stranded ship!” for ~4 seconds.
- **Level 3 entry**: Orders the stranded ship to evacuate (becomes invulnerable while leaving) and immediately spawns two armored asteroids.
- **Level 4 entry**: Spawns the Colossus boss, clears existing asteroids and bullets, shows the boss objective message, and pauses wave/cadence spawns until the boss is defeated. While the boss is active, level progression is clamped to Level 4.
- **Level 4 wave armor**: During wave spawns on Level 4, each asteroid has a 45% chance to be armored.
- **Level 5 entry**: Spawns `GRAVITY_WELL_COUNT` gravity wells in safe, spaced locations.
- **Level 6 armor suppression**: During Level 6, armored asteroid spawns are disabled for both wave spawns and the 500-point cadence. Only normal asteroids spawn.
- **Level 7 entry**: Evacuates any active stranded ship, spawns two `Wormhole` endpoints far apart, and enables Elite asteroid spawns in waves (50.7% chance per spawn). Armored cadence remains disabled.
- **Level 9 entry**: Clears prior entities/hazards (asteroids, bullets, enemy bullets, drones, clone drones, gravity wells, wormholes, mines), nulls `strandedShip`, shows “Danger! Asteroid belt”, and spawns 16 medium (size 2) normal asteroids at safe positions.
- **Level 10 entry**: Spawns the `CrystalTitanBoss`, clears asteroids, bullets, and enemy bullets (and empties `drones`/`cloneDrones` if present), sets the objective “SHATTER THE CRYSTAL TITAN'S FACETS THEN CORE!”, triggers a spawn shockwave pushback, and grants ~90 frames of player invulnerability. Boss phase gates progression until defeat.

### Performance

#### Performance Optimization Guide (60 FPS on Steam Deck)
- Circle-based collision checks.
- Capped counts (bullets/power-ups/particles) to maintain 60 FPS target.
- Frame-based timers for consistent pacing.

- __Dynamic render scale (Canvas)__
  - Add `RENDER_SCALE` in `constants.js` and draw the game at a slightly lower internal resolution (e.g., 0.85–0.95) while CSS-scales `#gameContainer` to fit. This preserves visuals with a large perf win on GPU-bound devices.
  - Implementation: set `canvas.width/height = baseSize * RENDER_SCALE` in `ast.html` init and adjust transform of `#gameContainer` (already present) to scale up.

- __WebGL overlay tuning (`glRenderer`, Pixi)__
  - Lower Pixi resolution: initialize `PIXI.Application({ resolution: 1 })` instead of `devicePixelRatio`. Expose a `WEBGL_RESOLUTION` in `constants.js`.
  - Half-res postFX: render overlay at half the canvas size to RTs, then upscale the `outputSprite` (big boost with minimal quality loss).
  - Frame skipping for overlay: when `frameTime > 16.7ms`, run `glRenderer.update()` every other frame (keep game logic at 60 FPS).
  - Filter trims: reduce `BLOOM_SCALE/BRIGHTNESS`, disable `NoiseFilter` when busy, keep `CRTFilter.curvature` modest, and only enable `BulgePinchFilter` while `state.shielded` is true.

- __Collision cost: add a simple spatial grid__
  - Create a uniform grid (cell ≈ 64 px) in `utils.js` and bucket `asteroids`, `powerups`, `mines`, `bullets`. Then only collide against the current and neighboring cells.
  - Replace O(N×M) scans in hotpaths (e.g., player↔asteroids, bullets↔asteroids, asteroid↔asteroid for mines bounce) with local queries.

- __Use squared distances in hot loops__
  - Replace `Math.sqrt`/`Math.hypot` with squared compares: `dx*dx + dy*dy < r*r` in `lineCircleCollision`, entity `hit` checks, and boss node/plate checks (`alienMothershipBoss.js`, `colossusBoss.js`).

- __Object pooling to reduce GC stutter__
  - Pool `Particle`, `Bullet`, `EnemyBullet`, `Powerup`, and common explosion shards. Provide `acquire()`/`release()` utilities in each module or a shared pool in `utils.js`.
  - Avoid repeated `array.filter` in tight loops; use swap-remove (write last element into removed slot and `pop()`).

- __Batch Canvas2D state changes__
  - Reduce `ctx.save()/restore()` and shadow changes. Group draws by style where possible (e.g., bullets with the same glow), or set glow once per batch.
  - Pre-render glow sprites (offscreen canvas) for bullets/powerups/particles and `drawImage` them instead of large `shadowBlur` on every primitive.

- __Particles: adaptive density__
  - Cap and adapt: when `particles.length` exceeds a threshold, drop spawn rate slightly and shorten lifetimes. Expose `MAX_PARTICLES` in `constants.js` and degrade gracefully.
  - Explosion presets: use a few precomputed angle/velocity sets instead of generating many randoms per explosion.

- __HUD/DOM updates only on change__
  - In `ast.html`, ensure HUD text (`#score`, `#hi`, `#combo`, `#lives`, `#level`, `#stranded`, `#powerup`) updates only when values change to avoid layout/reflow every frame.

- __Starfield and background__
  - You already pre-render background layers to `backgroundCanvas`. Do similar for star layers: prerender star sprites to offscreen bitmaps and translate/blit layers instead of drawing hundreds of arcs with glow each frame.
  - Optionally reduce star counts or twinkle update rate while gameplay is busy.

- __Boss helpers: cache per-frame positions__
  - `colossusBoss.js` uses `platePositions()` and `alienMothershipBoss.js` uses `nodePositions()`. Cache results once per frame to avoid recomputation across bullet/particle/laser passes.

- __Physics and interactions__
  - Mines bounce: for mine↔asteroid and mine↔mine, early-out via grid pruning and squared distances before resolving elastic collisions.
  - Gravity wells (L5): avoid applying gravity to far entities by culling with a quick radius check; consider scaling gravity cost down with a grid.

- __Adaptive quality controller__
  - Track a moving average of frame time. When > 16.7ms: lower `RENDER_SCALE` by small steps (min 0.8), thin particles, skip WebGL overlay frames, relax bloom/noise. Restore when performance recovers.

- __Misc micro-optimizations__
  - Reuse vectors/arrays to avoid allocations in inner loops.
  - Prefer `for (let i=0; i<n; i++)` over `for..of` in hotpaths.
  - Cache trigs when rotating many points at fixed rates (e.g., boss orbits): compute sin/cos once per frame and reuse.

##### Suggested small code changes (low risk)
- Convert collision checks to squared distance forms in bosses and `utils.js`.
- Introduce a minimal `SpatialGrid` in `utils.js` and refactor key collide loops to use it.
- Pool `Particle` and `Bullet` objects; replace array `filter` removals with swap-remove.

###optimization plan
-
Phase 1 — Spatial Grid broad‑phase (CPU win)
Goal: Cut pairwise distance checks using a uniform grid; exact behavior preserved.
Flags:
constants.js
: ENABLE_SPATIAL_GRID = true
Optional: GRID_CELL_SIZE = 64
Files:
utils.js
: add SpatialGrid (build per frame), grid.insert(entity), grid.queryCircle(x, y, r).
ast.html
: build/populate grid each frame, then use in hot loops.
Rollout steps:
Implement grid + unit tests (console tests) in 
utils.js
.
Apply only to bullets ↔ asteroids first. Validate same hit counts and points vs. pre-grid in a 60s scripted run.
Apply to player ↔ asteroids, then mines’ bounce broad‑phase, then boss hit-tests.
Checks:
Sanity: collisions identical for fixed RNG seed; no missed hits at edges (test with cell boundaries).
Perf: frame time reduction under dense fields.
Rollback: Toggle ENABLE_SPATIAL_GRID = false.

Phase 1 completed!

Phase 2 — Pre‑rendered neon sprite cache (GPU win)
Goal: Replace per-frame large shadowBlur with cached offscreen sprites; visuals match.
Flags:
constants.js
: ENABLE_SPRITE_CACHE = true
Files:
effects.js or 
utils.js
: createSpriteCache() to build small atlases at boot:
Bullet core, bullet streak, enemy bullet, common particle puffs, powerup ring(s) at 6–10 sizes.
bullets.js
, 
enemyBullets.js
, particle.js, powerups.js: when flag is on, use drawImage() from cache; otherwise current path.
Rollout steps:
Start with player bullets only: cache one core + one streak sprite; A/B compare single-frame screenshots.
Extend to enemy bullets, then common particles (explosion puffs), then powerup glow rings.
Batch draws by style where possible; minimize ctx.save/restore().
Checks:
Visual parity: screenshot probe on a dark background; ensure halo intensity/size matches.
Perf: GPU time drops during heavy fire and explosions.
Rollback: Disable ENABLE_SPRITE_CACHE.

Phase 3 — Half‑resolution WebGL overlay + filter resolution control (GPU win)
Goal: Render Pixi overlay at lower internal res with preserved look, then upscale.
Flags:
constants.js
: reuse WEBGL_RESOLUTION (exists) and add OVERLAY_INTERNAL_SCALE = 0.5
Files:
ast.html
 in initWebGLIfEnabled():
Keep resolution: devicePixelRatio * WEBGL_RESOLUTION.
Size render textures and set filterResolution = OVERLAY_INTERNAL_SCALE.
Set outputSprite scale to match canvas; ensure filterArea correct.
Ensure BulgePinch active only while state.shielded.
Rollout steps:
Apply 0.75 first; verify parity; then 0.5. Keep a console override, e.g., glRenderer.setPostFX({ filterResolution: … }).
If fringe softness appears, raise only bloom’s internal res to 0.75; keep others at 0.5.
Checks:
Visual parity during launch blur, bloom flashes, shield lens, CRT scanlines.
Perf: overlay GPU time reduction; maintain 60 FPS during bloom-heavy scenes.
Fallbacks:
If still GPU-bound, gate overlay updates to every other frame when avgFrameTime > 16.7ms (last resort, preserves logic at 60 Hz).
Test & Verification
Metrics harness:
Add a simple console overlay: moving average frame time (last 120 frames), count of asteroids/bullets/particles. No code change now; we’ll add during implementation.
Visual checks:
SxS screenshots of: idle, heavy fire, explosions, shield, boss pulses; compare halos and scanline crispness.
Acceptance:
No gameplay differences (hits, points, timers, spawn rates).
No visible quality regressions.
Stable 60 FPS target on lower-end GPUs.
Order of operations
Spatial Grid (biggest CPU win, zero visual risk).
Sprite Cache (big GPU win, exact look preserved).
Half‑res Overlay (big GPU win; post‑FX tolerant to downsampling).



### Visual & Audio
- Font: Google Fonts "Orbitron". No external audio by default.

### Mechanics — Stranded Ship (Levels 2 & 6)
- **Class**: `StrandedShip(x, y)` with `radius=30`, `maxHealth=5`, `health`, `active`, `damageFlash`, `scale=2.2`, `angle` (random), `evacuating`, `invulnerable`, `speed`.
- **Module**: Implemented in `strandedShip.js`. API: `update(canvas, frameCount, spawnParticle)`, `draw(ctx, frameCount)`.
- **Level 2 spawn**: On entering Level 2, spawns once at a safe random location and becomes the primary objective. HUD shows `STRANDED SHIP: health/max` and an `OBJECTIVE` message (“Protect the stranded ship!”) for ~4s.
- **Damage**: In Level 2 (and Level 6), collisions with asteroids deal 1 damage to the ship and destroy the asteroid. On `health <= 0`, a large explosion occurs and `gameOver()` is triggered.
- **Evacuation**: At Level 3 start, the ship sets `evacuating=true`, `invulnerable=true`, increases `speed` (6), flies off-screen, then deactivates. While evacuating, a protective shield glow is drawn.
- **Visuals**: Engine sputter particles, damage flashes, and health pips rendered above the hull.
- **Shockwaves**: Mine shockwaves (Level 6) push the ship’s position only (no damage).

### Mechanics — Armored Escalation (Level 3)
- **Immediate pressure**: Spawns two armored asteroids instantly on Level 3 entry.
- **Cadence doubled**: The 500-point armored cadence spawns two armored asteroids instead of one while in Level 3.
- **Objective transition**: The stranded ship begins evacuation at Level 3 start and is invulnerable while exiting.

### Mechanics — Boss: Colossus Asteroid (Level 4)
- **Entry**: On Level 4, spawns `ColossusBoss` and clears existing asteroids and bullets; shows “Boss: Colossus Asteroid! Destroy the plates!” for ~4s. While the boss is active, the game stays at Level 4 (no Level 5/6 features).
- **Structure**: Central core (`coreRadius=50`, `coreHealth=12`) with 6 orbiting armored plates (`hits=3`, `radius≈40`) rotating around `orbitRadius≈160`.
- **Attacks**:
  - Rotating slam: telegraphed arc (`~36` frame wind-up) then active for `~24` frames along the orbit band; on hit, the player loses a life and is knocked back.
  - Core pulse ring: periodic expanding ring that pushes the player and deflects bullets.
  - Plate bullet sprays: when ≤3 plates remain, periodic radial sprays from plate positions.
- **Damage & interactions**:
  - Player bullets, laser line, and rainbow trail damage plates first; core becomes vulnerable only after plates are destroyed.
  - Power-ups can drop from destroyed plates; boss defeat triggers a large explosion and drops 2–3 power-ups.
  - Player collisions with plates/core cause damage during the fight.
- **Waves during Level 4**: Waves are paused while the boss is active. When the boss is absent (e.g., after defeat), Level 4 waves resume with a 45% armored chance per asteroid.
- **Defeat cleanup (New)**: On defeat, all shard minions and armored asteroids are cleared from the field, and enemy bullets are purged for a clean transition.

### Mechanics — Gravity Wells (Level 5)
- **Class**: `GravityWell` with `x, y, strength, radius, pulse`. Pulses for visual effect; drawn with concentric neon rings and a glowing core.
- **Constants**: `GRAVITY_WELL_COUNT=3`, `GRAVITY_RADIUS=220`, `GRAVITY_STRENGTH=1400`, `GRAVITY_SOFTENING=1500`.
- **Forces**: `applyGravityTo(obj, factor)` applies inverse-square pull with softening to player, asteroids, and bullets; bullets curve subtly.
- **Spawn**: Wells are created on entering Level 5 and persist during the level.

### Mechanics — Minefields (Level 6)
- **Class**: `Mine` with `x, y, vx, vy, radius, triggerRadius, pulse, exploded`.
- **Constants**: `MINE_COUNT=7`, `MINE_RADIUS=18`, `MINE_DRIFT_SPEED=0.7`, `MINE_TRIGGER_RADIUS=95`, `MINE_SHOCKWAVE_RADIUS=240`, `MINE_PUSH_STRENGTH=9.0`, `MINE_BOUNCE_RESTITUTION=0.9`.
- **Movement**: Mines drift with small random velocity and wrap at screen edges; pulsing neon core/rings.
- **Detonation**: Triggered when shot by a bullet or when the player, stranded ship, or any asteroid enters `triggerRadius`. Detonation calls `applyShockwave()`.
- **Shockwave**: `applyShockwave(cx, cy, radius, strength)` pushes entities radially with falloff; no damage is dealt.
- **Bouncing**: Elastic collisions (restitution) between mines and asteroids, and between mines themselves; overlap is resolved and velocities adjusted along collision normals.
- **Stranded ship**: Present during Level 6; rules and HUD identical to Level 2.
- **Armor suppression**: No armored asteroids spawn during Level 6 (waves and cadence both suppressed).

### Collision & Physics Summary (New)
- **Bullet ↔ Mine**: On contact, bullet is removed and the mine detonates.
- **Proximity detonation**: Mines detonate when player, stranded ship, or any asteroid enters `triggerRadius`.
- **Mine ↔ Asteroid**: Non-damaging elastic bounce with restitution and position separation.
- **Shockwave push**: Applies to player, stranded ship, and asteroids; modifies velocity/position without damage.
- **Safe respawn (New)**: On player death, `safeRespawn()` samples safe positions (away from hazards and boss orbits), clamps to playfield margins, and zeroes velocity before granting temporary invulnerability.

---

## Modularization Plan (Final)

- __Goal__: Split the monolithic `ast.html` script into small ES modules for maintainability, testability, and performance.

- __Suggested structure__
  - `src/core/`
    - `constants.js` — all tunables/constants (radii, counts, timers, colors).
    - `state.js` — central game state (arrays, timers, score, lives, level flags).
    - `input.js` — key handlers, pause toggle, mappings.
    - `loop.js` — `gameLoop()`, update/draw orchestration, scene routing.
    - `utils.js` — math helpers, RNG, safe spawn checks, wrappers.
  - `src/entities/`
    - `Player.js`, `Asteroid.js`, `Mine.js`, `Wormhole.js`, `Powerup.js`, `Bullet.js`, `EnemyBullet.js`.
    - `bosses/ColossusBoss.js`, `bosses/DreadshipBoss.js`.
  - `src/systems/`
    - `spawning.js` (waves, cadence, level entries), `collisions.js`, `physics.js` (gravity, shockwaves, bounce), `particles.js`, `rendering.js` (draw order), `powerups.js`, `gravity.js`, `wormholes.js`, `mines.js`, `score.js`.
  - `src/levels/`
    - `level2.js` … `level8.js` (entry behaviors and level-specific tuning).
  - `src/ui/`
    - `hud.js`, `menus.js`, `pause.js`.
  - `src/effects/`
    - `explosion.js`, `trails.js`, `starfield.js`, `vignette.js`, `warpTunnel.js`.
  - `main.js` — bootstraps canvas, state, and starts the loop.

- __Draw order guideline__ (back → front): `starfield` → `warpTunnels` → `gravityWells` → `wormholes` → `mines` → `strandedShip` → `boss` → `asteroids` → `drones` → `bullets` → `enemyBullets` → `player` → `laser` → `particles` → `powerups` → `UI/overlays`.

- __Event decoupling__: Add a tiny event bus (publish/subscribe) for cross-system notifications (e.g., `BOSS_DEFEATED`, `POWERUP_PICKED`, `PLAYER_HIT`). Keep entities dumb and systems reactive.

- __Phased migration__
  1. Extract `constants.js` + `utils.js` and replace inline constants/usages via imports.
  2. Move `Particle`, `Explosion` helpers, and starfield into `effects/` + `particles.js`.
  3. Move `Powerup`, `Bullet`, `EnemyBullet`, `Asteroid`, `Mine`, `Wormhole` into `entities/`.
  4. Extract `spawning.js` and level entry blocks into `levels/` modules.
  5. Extract `collisions.js`, `physics.js`, `powerups.js`, `wormholes.js` from loop into `systems/`.
  6. Create `loop.js` to orchestrate update/draw using imported systems; keep `main.js` minimal.
  7. Adopt ES modules with Vite or plain `<script type="module">`; no framework required.

- __Testing hooks__: Keep the console cheats (jump level, spawn boss) exposed from `main.js` for QA.

- __Persistence__: Keep hi-score in `localStorage` unchanged; wrap access in `score.js`.


- **Level 7 — Wormholes and elite asteroids**
  - Temporary portals teleport asteroids, bullets, and the player between two points; creative routing for combos and escapes. they spawn in random safe locations. During this level only normal asteroids spawn, no armored asteroids spawn. But there is a 30% that a new type of asteroid spawns which is called a Elite asteroid, the elite asteroid looks the same as a normal but is 20% larger than the current large one, and its green in color with a slightly thicker outline and glow is brighter, it takes 2 hits to destroy and doesnt split into smaller ones instead when its killed it explodes causeing damage to player ship but not other asteroids, the damage range is 1.5 the size of the asteroid.

- **Level 8 - Alien Dreadship (Mobile Boss that moves slowly around the screen)**
  - Large saucer ship with glowing core and with rotating turrets (bullet sprays), occasional laser sweep, and small deployable drones that home slowly to hit the player ship.
  - Weak points: 3 turrets (3 hits each) + central core (12 hits) exposed briefly after a laser sweep.
  - Behaviors: telegraphed charge before sweep; shielded while charging; drones can be destroyed for points and drops.
  - Integration: uses existing laser visuals; player power-ups (Shield, Teleport, Rainbow) create different viable strategies.
  - During this level, no other asteroids spawn. Any that are still active when the boss spawns are destroyed.

### Mechanics — Boss: Crystal Titan (Level 10)
- **Entry**: On Level 10, `CrystalTitanBoss` spawns and the field is cleared (asteroids, bullets, enemy bullets; `drones`/`cloneDrones` arrays emptied if present). HUD shows “SHATTER THE CRYSTAL TITAN'S FACETS THEN CORE!”. A spawn shockwave pushes entities back and the player gains brief invulnerability (~90 frames).
- **Structure**:
  - Core: `coreRadius ≈ 46`, `coreHealth = 12`.
  - Facets: 7 crystal facets in a ring (`hits = 3`, `radius ≈ 38`) orbiting at `orbitRadius ≈ 150` with slow rotation. Facets pulse and flash on hits.
- **Attacks**:
  - Radial shard burst: every ~180 frames (first after ~140), emits 10 projectiles from the core at ~6 px/frame; adds brief screen shake.
  - Aimed prism shots: every ~70 frames (first after ~90), fires a 3-shot spread toward the player with slight ±0.12 rad offset at mixed speeds (~7/6.5/6.8).
- **Damage & interactions**:
  - Facets reflect player bullets: each hit reduces a facet’s `hits` and reflects the bullet using surface-normal reflection without consuming it; shattered facets explode and are removed. Rainbow trail and laser line damage facets normally (no reflection).
  - Core is invulnerable until all facets are destroyed. After exposure, bullets that hit the core are consumed and deal 1 damage; the laser line damages the core for 2 per pass.
  - Boss-player collision uses standard collision checks via `collidesWithCircle(...)` (facets or exposed core count for collision).
- **Defeat & rewards**:
  - On core HP reaching 0: large explosion and strong screen shake, award a fixed 500 points (no level multiplier), drop 2–3 power-ups (respects the 4-on-field cap), and a 50% chance to drop an extra life. All enemy bullets are cleared on defeat.
  - Transition: boss phase ends; standard post-boss freeze and upgrade flow apply.

### Mechanics — Level 11: Stranded-Ship Gauntlet (Redux)

- **Overview**: A defense level focused on protecting a stranded ship while managing navigation pressure.
- **Spawns**:
  - Continuous normal asteroid trickle replaces wave clears (no armored cadence; points for asteroids are halved on Level 11 only, before the level multiplier).
  - Two wormhole pairs are active; teleport logic supports multiple endpoint pairs.
- **Objective & HUD**:
  - HUD shows stranded ship status and an objective prompt to protect it.
  - If the ship’s health reaches 0, a large explosion triggers and `gameOver()` is called immediately.
- **Tuning**: Adjust trickle cadence and wormhole spacing in the Level 11 entry block within `ast.html`.

### Mechanics — Boss: Alien Mothership (Level 12)

- **Structure**: Central core protected by multiple shield nodes. While any node remains, the core is invulnerable.
- **Phases**:
  - Destroy all shield nodes to expose the core.
  - On exposure, the game triggers `showHUDMessage('CORE EXPOSED!', 180)` (reusing the objective HUD).
  - **Attacks**: Mothership employs turrets/drones; details governed by `alienMothershipBoss.js`.
  - **Entry & Flow**:
    - Level 12 spawns the boss, pauses wave/cadence systems during the fight, and clamps progression until defeat.
    - On defeat, transition via the standard post-boss flow and cleanup.

## Levels 13–15 — The Rift Offensive (Design + Story)

After crippling the Alien Mothership, long-range scans trace a power signature bleeding into a fractured region of space: the Rift. Within its gravity-sheared corridors, an alien Carrier vanguard rallies the remaining defense fleet around a final power core — the Singularity Engine. You dive in to finish the job.

### Level 13 — The Rift Corridor (Hazard Gauntlet)

- **Score range**: 12000–12999
- **Objective**: Survive the Rift’s shifting currents and breach the inner defenses.
- **Entry behavior (design)**:
  - Clear field on entry (asteroids, bullets, enemy bullets, drones, clone drones, gravity wells, wormholes, mines).
  - Spawn a mixed field that teaches advanced routing and space control:
    - Gravity Wells × 2 (standard Level 5 behavior).
    - Wormhole Pairs × 2 (standard Level 7 behavior; keep endpoints far apart).
    - Mines × 5 (Level 6 behavior; pushback only, no damage).
    - Asteroid trickle: lean medium/large, with a modest armored presence (e.g., ~30–40% on wave spawns). Optional: rare Elite asteroids (≤10%) for pressure spikes.
  - Suppress the 500-point armored cadence during intense hazard clusters if needed to avoid overwhelming the player.
- **Skills emphasized**: precise drift/thrust, gravity slingshots, portal mapping, area-denial management with Bomb/Teleport, and disciplined charged-shot timing without overcommitting.
- **HUD copy**: `OBJECTIVE — NAVIGATE THE RIFT CORRIDOR!`

### Level 14 — Boss: Alien Carrier (Drone Bays + Core)

- **Score range**: 13000–13999
- **Narrative**: The Carrier vanguard — a mobile factory — blocks the approach to the core. Its drone bays must be silenced.
- **Structure (design; see `alienCarrierBoss.js`)**:
  - Four orbiting drone-bay pods (`hits: 3`, `radius ~36`) around a central hull/core (`coreRadius ~48`, `coreHealth ~12`). Slow rotation `~0.01 rad/frame`.
  - Core is invulnerable while any pod remains.
- **Attacks**:
  - Drone pressure: periodic spawns up to a cap (e.g., 6 active); cadence increases once bays are down.
  - Aimed prism shots from the core every ~100–110 frames (3-shot spread with slight ±offset; mixed speeds).
- **Entry & flow**:
  - On entry, clear field and clamp level progression (pause waves/cadence) until defeat.
  - Show boss objective: `DESTROY THE CARRIER'S DRONE BAYS, THEN CORE!`
  - On last pod destroyed, flash HUD: `CORE EXPOSED!` (reuse `showHUDMessage(...)`).
- **Field hazards (Level 14 addition)**:
  - Tether Pairs: pairs of medium asteroid nodes connected by a pulsing neon line that damages the player on contact. The line can be broken by player fire at the segment; on break the nodes slow, the tether disappears, and points are awarded, then the pair respawns after a cooldown.
  - Constants: `TETHER_PAIR_COUNT`, `TETHER_NODE_RADIUS`, `TETHER_PULSE_SPEED`, `TETHER_LINE_BASE_WIDTH`, `TETHER_SPEED_AFTER_BREAK`, `TETHER_POINTS_ON_BREAK`, `TETHER_RESPAWN_FRAMES` (see `constants.js`).
  - Collision: handled via `lineCircleCollision` against the player; break awards floating points at the line midpoint.
- **Defeat & rewards**:
  - Large explosion + screen shake. Award fixed 500 points (no level multiplier). Drop 2–3 power-ups (respect 4-cap), 50% to drop an extra life. Clear enemy bullets/drones.
- **Skills emphasized**: target prioritization (pods vs. drones), firing windows under pressure, Teleport for bailout, Shield to create safe pockets, Laser for pod lining.

### Level 15 — Final Boss: The Singularity Engine

- **Score range**: 14000–14999+
- **Narrative**: A crystalline reactor wrapped in alien tech is stabilizing a micro‑singularity. Shut it down before the Rift collapses.
- **Multi‑phase structure (design)**:
  1) Shield Prisms: six rotating prisms (`hits: 3`, `radius ~38`) orbit a protected core. Prisms reflect normal bullets on hit (like Level 10 facets), but take damage; Laser and Rainbow deal normal damage.
  2) Core Exposed: core (`coreHealth ~16`) becomes vulnerable. Intermittent mechanics combine earlier threats:
     - Gravity pulse rings (Colossus-style) that push the player/bullets.
     - Rotating laser sweeps (telegraphed arcs; safe gaps exist) using boss line-laser logic.
     - Area denial mines (Level 6 push shockwaves) seeded near edges; no direct damage.
     - Brief wormhole pair spawns to scramble positioning (limited to 1 pair at a time).
- **Telegraphs & readability**:
  - Clear wind-up glows on prisms before bursts; pre-attack arcs for laser sweeps; distinct colors for pulse rings vs. lasers.
  - Maintain fair escape routes (no unavoidable overlaps); ensure pulse, sweep, and mine spawns don’t coincide unfairly.
- **Entry & flow**:
  - On entry, clear field and clamp progression; display `FINAL BOSS — DISABLE THE SINGULARITY ENGINE!`
  - On prism phase end, flash HUD: `CORE EXPOSED!` for 3 seconds.
- **Defeat & finale**:
  - Staged death sequence (3–5 beats): component peel‑off, internal chain explosions, final overload flash + shock ring.
  - Award fixed 1000 points (no level multiplier). Guaranteed 3 power-ups for the victory screen flourish.
  - Epilogue text: `THE RIFT STABILIZES. THE FLEET RETREATS. HUMANITY LIVES TO SEE ANOTHER NEON DAWN.`
- **Skills emphasized**: full kit mastery — thrust/rotation precision, portal awareness, pulse timing, mine shockwave surfing, and power‑up routing.

#### Implementation notes (engineering)

- Level thresholds continue the 1000‑point cadence:
  - Level 13: 12000–12999
  - Level 14: 13000–13999
  - Level 15: 14000–14999
- Entry blocks should follow the established pattern (clear arrays in-place; set objective HUD; grant brief invulnerability; clamp progression until boss defeat). See Level 10 and 12 entries in `ast.html` for reference.
- Boss modules:
  - Level 14 can leverage/extend `alienCarrierBoss.js` (pods, drones, aimed spreads, `CORE EXPOSED` HUD hook).
  - Level 15 would be a new module (e.g., `singularityBoss.js`) reusing helpers from Colossus/Titan/Dreadship (plate/prism orbits, pulse rings, line-laser sweeps, mine/wormhole spawns).
- Tether pairs spawn only during Level 14 and are cleared on entry to Levels 13 and 15 (and on boss defeat); maintain in-place array clears to preserve references.
- Keep power‑up cap (4 on field) and reward patterns consistent with earlier bosses.

## Testing & Debugging Shortcuts
  
  Use your browser console on the running page. The game loop reacts on the next frame.


---



## Developer Customization Guide

test local server here: py -m http.server 5500

### Player ship
- **Movement**: in the `player` object
  - `player.thrustPower` (default `0.2`) — forward acceleration.
  - `player.friction` (default `0.98`) — velocity damping each frame.
  - `player.maxSpeed` (default `8`) — soft speed cap (enforced in update logic if present).
  - `player.rotationSpeed` (default `0.087`) — radians per frame (~5 degrees).
  - `player.radius` (default `15`) — collision and draw scale.
- **Controls**: in key handling and player update
  - Rotation: `a`/`ArrowLeft` and `d`/`ArrowRight` checks in player update.
  - Thrust: `w`/`ArrowUp` checks in player update and for flame effect.
  - Shoot: Spacebar handling in `updatePlayer()` around `spaceHoldTime` and bullet firing.
  - Pause: `'p'` in `togglePause()` handler (“keydown” listener). Change the character check to remap.
  - Power-up use: `Enter` in keydown; remove pause gating by editing the `!paused` condition (not recommended).

### Bullets (player)
- **Class**: `class Bullet`
  - Speed: `this.speed = 10` (constructor) — affects `vx/vy`.
  - Radius: `this.radius = charged ? 8 : 4`.
  - Lifetime: `this.lifetime = charged ? 60 : 40` — frames until despawn.
  - Color: `this.color = charged ? '#ff0' : '#0ff'`.
  - Curvature in L5: `applyGravityTo(this, 0.4)` — reduce/increase factor for more/less curve.
- **Fire logic**: inside player shooting code
  - Charged threshold: `const charged = spaceHoldTime > 60` — lower to make charged shots easier.
  - Rate/cap: `if (bullets.length < 4)` — raise for more simultaneous bullets.
- **Visual streak**: in `Bullet.draw()`
  - Length: `const len = this.charged ? 26 : 14`.
  - Thickness: `lineWidth = this.charged ? 4 : 2.5`.
  - Glow: `shadowBlur = this.charged ? 18 : 10` and core glow `22/12`.

### Enemy bullets
- **Class**: `class EnemyBullet`
  - Spawn speed: constructor param `speed = 5` (calls `Math.cos/sin(angle) * speed`).
  - Radius: `this.radius = 4`.
  - Lifetime: `this.lifetime = 150`.
- **Visual streak**: in `EnemyBullet.draw()`
  - Length: `const len = 16`.
  - Thickness: `lineWidth = 3`.
  - Glow: `shadowBlur = 12`.

### Starfield
- **Init**: `initStars()` — 3 layers × 50 stars each. Change layer count or per-layer star count in the nested loops.
- **Drift speeds**: `drawStarfield()` uses `const speeds = [0.05, 0.15, 0.35]` per layer.
- **Twinkle/brightness**: each star has `size`, `brightness`; twinkle formula uses `Math.sin(frameCount * 0.01 + star.x * 0.02)`.
- **Shooting stars**:
  - Spawn chance (normal): base `0.003` per frame; on the start screen it is multiplied by `1.5`.
  - Spawn chance (fast): base `0.0020` per frame; on the start screen it is multiplied by `1.5`.
  - Lifetime: normal `life: 45`; fast `life: 90`. Despawn when off-screen or life <= 0.
  - Velocity: normal `vx: -(3..5)`, `vy: (0.8..1.4)`; fast `vx: -(6..10)`, `vy: (1.6..2.8)`.

#### Background pre-render (initBackgroundForLevel)

- **Function**: `initBackgroundForLevel(lvl)` pre-renders faint background elements to an offscreen `backgroundCanvas` (`bctx`), then draws that to the main canvas each frame.
- **Elements & baselines**:
  - Dust bands: `bandCount = (R()<0.6 ? 1 : (R()<0.2 ? 2 : 0))`; mid-alpha ≈ `0.07`.
  - Constellations: REMOVED by default. The former faint line-cluster block in `initBackgroundForLevel(lvl)` was deleted per request. See `ast.html` comment “Constellations removed per user request”.
  - Nebulae: `nebulaCount = 1 + floor(R()*2)` (1–2).
  - Galaxies: chance `0.5` to add a spiral blob and speckle stars.
  - Planetary limb silhouette: chance `0.5` to draw a huge off-screen circle edge.
  - Planets/moons: if `R()<0.6`, draw up to `floor(R()*3)` bodies near edges. Outline stroke removed; only a soft radial core fill remains.
- **Start screen multipliers** (applied only when `gameState === 'start'`):
  - Counts/chances × `1.5` (capped at `1.0` for probabilities). E.g., constellations `0.7 → min(1, 0.7*1.5)`; bandCount/nebulaCount/planetCount are `ceil(count*1.5)`.
  - Galaxy speckle density × `1.5`.
  - Dust band mid-alpha slightly raised on start (`0.07 → ~0.09`) for readability.

#### Customizing the starfield

- **Where to edit**: `ast.html`
  - `initStars()`: layer count and per-layer star counts.
  - `drawStarfield()`:
    - Parallax speeds: edit `const speeds = [0.05, 0.15, 0.35]`.
    - Shooting stars: adjust base spawn rates `0.003` (normal) and `0.0020` (fast), lifetimes, and velocities.
  - `initBackgroundForLevel(lvl)`:
    - Dust bands: change `bandCount` probabilities and the band thickness/tilt; tweak mid-alpha for visibility.
    - Constellations: Removed by default. To re-enable, recreate the small block that built `clusters`, `pts`, and drew faint lines/nodes; place it near dust bands in `initBackgroundForLevel(lvl)`. A placeholder comment exists in `ast.html` for reference.
    - Nebulae: adjust `nebulaCount` range and per-nebula size/opacity.
    - Galaxies: change appearance chance `0.5` and speckle loop count.
    - Planetary limb: change chance `0.5` and edge thickness.
    - Planets/moons: edit appearance chance `0.6` and count `floor(R()*3)`. The outline stroke/glow ring was removed; tweak only the radial fill stops by default.
    
#### Canvas inner-edge cyan glow (New)

- Drawn at the end of `drawStarfield()` in `ast.html`. Four linear-gradient fills are composited with `globalCompositeOperation = 'lighter'` to create a subtle cyan glow along the inside edges of the playfield.
- Tuning knobs (inside the self-invoking block):
  - `const edge = 24` — thickness in pixels along each edge.
  - Alpha stops: currently `rgba(0,255,255,0.12) → 0`. Raise `0.12` for stronger inner glow.
  - You can adjust only top/bottom/left/right independently by changing the corresponding `fillRect` calls.

#### Small asteroid trails (New)

- Implemented in `asteroid.js` inside `Asteroid.update()`/`Asteroid.draw()` for size-1, non-elite asteroids (both normal and armored).
- Behavior: a very short afterimage trail of the asteroid's shape, rendered behind and quickly fading.
- Key logic (where to tune in `asteroid.js`):
  - Constructor: initializes `this.trailSmall = []` and `this.trailSmallTick = 0` when `size === 1 && !elite`.
  - Emission (in `update()`): every 3 ticks if speed exceeds 1.1 px/frame:
    - `if (this.trailSmallTick % 3 === 0 && Math.hypot(this.vx, this.vy) > 1.1) this.trailSmall.push({ x, y, rot, alpha: 0.22 });`
    - Cap length: `if (this.trailSmall.length > 8) this.trailSmall.shift();`
  - Fade (in `update()`): per frame `alpha -= 0.10`, remove when `alpha <= 0.02`.
  - Draw (in `draw()`): for each trail sample, draw the asteroid polygon at recorded transform with:
    - Color: magenta `#f0f` (normal) or red `#f00` (armored) via `const tColor = this.armored ? '#f00' : '#f0f'`.
    - Style: `globalAlpha = alpha`, `shadowBlur = 6`, `lineWidth = 1`, polygon scaled slightly (`* 0.92`).
- Suggested tuning ranges for subtlety/perf:
  - Emission cadence: change `% 3` (higher = fewer samples).
  - Speed gate: `> 1.1` (raise to only trail at higher speeds).
  - Initial alpha: `0.22` (lower for subtler start).
  - Fade rate: `0.10` (higher fades faster/shorter trails).
  - Max length: `8` (lower if performance becomes a concern).
  - Glow/stroke: `shadowBlur = 6`, `lineWidth = 1` for a faint look.

**Start-only intensity**: guard with `if (gameState === 'start')` to keep gameplay clean. Multipliers (e.g., `1.5`) are easy knobs to raise/lower.
- **Resetting state**: `initGame()` clears `stars`, `shootingStars`, `fastShootingStars`, `backgroundComets`, and `backgroundSatellites` to avoid stale visuals on restart.

### Particles & explosions
- **Class**: `class Particle` supports shapes `'dot'`, `'ring'`, `'shard'` with distinct draw/update branches.
- **Create explosion**: `createExplosion(x, y, radius, color, profile = 'default')`
{{ ... }}
  - Base particles: random angle with speed `2..7` (scaled in burst).
  - Shock ring: `ring.shape = 'ring'`, `ring.radius`, `ring.growth` — tweak size and expansion speed.
  - Shards: `const shards = profile === 'burst' ? 14 : 8`; each has `length = 8..18` and higher speed.
- **Global particle load**: manage performance by limiting `particles.length` or counts above.

### Gravity wells (Level 5)
- **Constants**: near top
  - `GRAVITY_WELL_COUNT = 3` — how many wells spawn.
  - `GRAVITY_RADIUS = 220` — effective pull radius.
  - `GRAVITY_STRENGTH = 1400` — strength numerator.
  - `GRAVITY_SOFTENING = 1500` — denominators’ additive to avoid singularity.
- **Force application**: `applyGravityTo(obj, factor)` — bullets use `0.4`, player/asteroids use default 1 inside their updates.

### Mines (Level 6)
- **Constants**:
  - `MINE_COUNT = 7` — spawns at L6 entry.
  - `MINE_RADIUS = 18`, `MINE_DRIFT_SPEED = 0.7`.
  - `MINE_TRIGGER_RADIUS = 95` — proximity fuse.
  - `MINE_SHOCKWAVE_RADIUS = 240`, `MINE_PUSH_STRENGTH = 9.0` — passed to `applyShockwave()`.
  - `MINE_BOUNCE_RESTITUTION = 0.9` — elasticity on mine↔asteroid/mine collisions.
- **Detonation visuals**: mine calls `createExplosion` and `applyShockwave` in `Mine.detonate()`.

### Wormholes (Level 7)
- **Constants**:
  - `WORMHOLE_COUNT = 2`, `WORMHOLE_RADIUS = 28`.
  - `WORMHOLE_COOLDOWN = 30` — frames of re-entry immunity (applied to player, asteroids, and bullets via `warpCooldown`).
- **Spawn spacing**: placement logic keeps them far apart; adjust constraints in level 7 entry block.

### Power-ups
- **Drop chance**: random checks throughout, commonly `0.2` (20%) in `maybeDropPowerup(...)` or guaranteed for certain events (e.g., boss defeat).
- **Weights**: `pickPowerupType()` uses
  - `const types = ['bomb','shield','teleport','flak','rainbow','invisible','laser','clone']`
  - `const weights = [20, 30, 20, 20, 15, 10, 10, 10]`
  Adjust weights to bias drops; keep arrays aligned.

### Asteroids
- **Wave spawn size**: when cleared, waves use
  - `const numAsteroids = Math.min(4 + Math.floor(score / 1000), 8)` — raise cap or base for harder waves.
- **Armored frequency**: conditional chances per level in wave spawn logic
  - L4: `Math.random() < 0.45` → armored.
  - L5: `Math.random() < 0.30` → armored.
  - L6: armor disabled.
  - L7: 50.7% chance of `elite` asteroids: `Math.random() < 0.507`.
- **Splits**: see `Asteroid.hit()` for split behavior; change loop counts to alter splits.
- **Boss shard minion cap**: `const SHARD_MINION_CAP = 8` — limits spawned shard minions in L8 plate-breaks.

### Level thresholds & messages
- **Thresholds**: computed from `score` inside `gameLoop()` (`targetLevel` mapping). Levels advance every 1000 points (1..8). Modify those ranges to retune progression.
- **Entry behaviors**: each level block sets `levelMessageText` and timers (`levelMessageTimer = 240`). Edit text/timing or disable certain spawns here.

### UI and HUD
- **Glow timings**: `levelGlowTimer = 120` on level changes affects pulsing.
- **Objective message**: shown while `levelMessageTimer > 0` in `updateUI()`.
- **Hi-Score key**: stored in `localStorage` under `asteraidHiScore`.

### Pause behavior
- **Toggle**: `togglePause()` bound to `'p'`; overlay DOM id `pauseOverlay`.
- **Gating**: first lines of `gameLoop()` skip updates/rendering while paused during `playing`. Remove or narrow conditions to change.

### Potential Performance tips
- Reduce particle counts in `createExplosion()` and trail emission cadence.
- Lower star counts or `speeds` array to reduce draw calls.
- Cap arrays (`bullets`, `enemyBullets`, `particles`) defensively if targeting low-end devices.

### Mechanics — Weapons and Projectiles
- Player fires small neon shots, with a charged shot when holding fire for >1s.

- Charged shot has larger radius, yellow color, longer lifetime, and recoil on the player; can pop shield into explosion.
- **Module**: `bullets.js` exports `Bullet`. API: constructor `(x, y, angle, charged=false)`, `update(canvas, level, applyGravityTo)`, `draw(ctx)`.
- Enemy shooters (boss/minions) use `EnemyBullet` (see `enemyBullets.js`).


## Visual Enhancement Recommendations (Neon CRT Asteroids style)

- **Explosion variety and neon debris**
  - Add 2–3 explosion profiles (core flash + shock ring + ember sparks). Spawn a few bright "shard" triangles that tumble and leave short neon trails.
  - Implementation: extend `createExplosion(x,y,scale,color,profile)` with profiles; add debris particles with rotation and trail fade.

- **Screen-space shock rings with refraction shimmer**
  - For bombs, boss kills, and mine detonations, draw a large expanding ring with a faint interior ripple to simulate heat distortion.
  - Implementation: render 2–3 concentric rings with varying alpha; add a sinusoidal opacity mask; optionally offset starfield dots slightly near the ring for a faux refraction.

- **Parallax starfield + occasional shooting stars**
  - Add 2–3 depth layers; slow drift on far layer, faster on near layer. Rare streaking meteors add life.
  - Implementation: maintain layered star arrays in `drawStarfield()` with different speeds and sizes; randomly spawn a brief streak particle crossing the screen.

- **Player thruster glow and speed-based trails**
  - While thrusting, draw a short cone with additive neon glow; extend a faint afterimage trail at higher speeds.
  - Implementation: in player draw, add a thrust flame polygon aligned to velocity; maintain a small afterimage queue of positions with fading alpha.

- **Asteroid hit-feedback and crack glow**
  - On hit, briefly overbrighten outline and flash a colored rim (armored: red). Show subtle crack lines that glow for a few frames.
  - Implementation: add `damageFlash` timer to asteroids; draw extra outline with higher `shadowBlur`; optionally render 2–3 short crack segments with fading alpha.

- **Laser with scanline ripple and chroma fringing**
  - Make the laser beam feel hotter: add a thin white core, colored outer beam, slight chromatic offset, and a brief horizontal scanline ripple crossing the screen.
  - Implementation: draw multiple beam strokes (white core + colored halo); overlay a moving 1–2px alpha sine stripe perpendicular to beam direction.

- **Flak starburst and bullet streaks**
  - Flak explosions render a starburst shape with neon spokes. Regular bullets get thin motion streaks at high velocity. (Bullet streaks implemented)
  - Implementation: draw n-spoke radial lines with additive blending for flak; for bullets, draw a short line segment behind current position scaled by speed.

- **Gravity well lensing and orbiting sparks**
  - Make wells distort space with a subtle lens glow and emit tiny orbiting sparks.
  - Implementation: add a faint elliptical gradient around the well and small particles circling with per-frame angle advance.

- **Wormhole event horizon animation**
  - Animate the rim with a noisy ring and inward-flowing dots to communicate direction.
  - Implementation: draw a torus-like ring with per-frame hue shift; emit small particles that move toward the center and reappear on the exit.

- **Boss telegraphs and plate charge cues**
  - Enforce readability with clear pre-attack arcs (sweep gradient) and pulsing charge glows on plates before bullet sprays.
  - Implementation: add a semi-transparent colored arc along the orbit band during wind-up; increase plate `shadowBlur` and add a rhythmic pulse before firing.

- **Combo climax bloom and CRT flare**
  - When reaching max combo or a big kill chain, briefly bloom the whole screen and add a micro CRT flare in corners.
  - Implementation: overlay a very low-alpha white vignette for 2–3 frames and increase global glow intensities slightly, then ease back.

- **Power-up pickup suction and badge icons**
  - On pickup, draw a quick suction beam (thin spiral) into the player; power-ups have small neon iconography floating above them.
  - Implementation: render a tapered spiral line to the player on pickup; draw minimal icons (shield, bomb, etc.) with color-coded glows.

- **Edge-warp portals for screen wrap**
  - When objects wrap at edges, briefly draw a neon slit/portal line at exit and entry points.
  - Implementation: detect wrap events and draw a short-lived 1–2 frame vertical/horizontal neon line at the boundary.

- **Subtle barrel distortion and noise flicker (global)**
  - Very slight barrel curve and gentle film noise amplify the CRT feel without obscuring gameplay.
  - Implementation: simulate with periodic vignette pulse and per-frame low-amplitude noise overlay; keep intensity minimal.
## Advanced Visual Enhancement Ideas (NEW)


- **Teleport Warp Tunnel Effect**
  - When teleporting, create a brief star-stretching warp tunnel that pulls from origin to destination.
  - Implementation: During teleport animation, draw stretched lines from origin to destination with color gradient; fade in destination with expanding ring.

- **Score Milestone Celebration**
  - When reaching round milestone scores (5000, 10000, etc.), flash the screen with a subtle shockwave and temporarily amplify all neon glows.
  - Implementation: Add check in `updateUI()` for crossing score thresholds; trigger brief (8-10 frame) bloom intensity increase.

- **Vignette Pulse on Damage**
  - When player is hit, pulse a red vignette from screen edges that fades quickly.
  - Implementation: On player hit, draw a red gradient from edge to center with quick fade-out animation over 10-15 frames.

- **Dynamic Laser Beam Instability**
  - Laser beams (player and boss) have internal flickering and thickness variations, like an unstable energy beam.
  - Implementation: Draw laser with randomly varying thickness (±1px) and inner core brightness that flickers slightly during its lifetime.



- **Charged Shot Buildup Particles**
  - Energy particles spiral inward toward gun as charge builds; more dramatic particle convergence near release.
  - Implementation: Enhance existing charge particles to follow spiral paths toward player's front position; increase particle count and speed near max charge.


- **Boss Death Sequence Enhancement**
  - Multi-stage spectacular destruction: component separation, internal explosion chain, final core overload with screen flash.
  - Implementation: Add 3-5 stage death sequence with delayed explosion chain; particles that shoot outward then get sucked back in before final burst.

- **Heat Distortion Around Thrusting Objects**
  - Subtle rippling distortion behind ships/asteroids moving at high speed; enhanced around thrusters.
  - Implementation: Semi-transparent wavy overlay behind fast-moving objects; can distort starfield slightly in that region.

- **Power-up Dimension Shift**
  - Power-ups occasionally "phase" in/out of reality with a brief dimensional shift effect before stabilizing.
  - Implementation: Periodic visual glitch where power-up temporarily splits into RGB components with slight offset, then recombines.

### Gauntlet Game Mode (Endless)

- **Overview**: Endless, procedurally generated survival. No discrete levels; waves flow continuously with rising difficulty. At fixed score/time intervals, present roguelite-style upgrades so the player scales with the challenge.

- **Core Loop**:
  - Spawn a wave using the current difficulty tier.
  - Maintain a light background trickle between waves to avoid downtime.
  - Advance to the next wave on clear or a wave timer (no hard reset of the field).
  - Every N score or M seconds, pause and show 2–3 upgrade choices; resume after selection.

- **Difficulty Scaling**:
  - Global scalar D(t, score) grows with minutes survived and score: D = base + a·minutes + b·(score/1000).
  - Apply D to: spawn counts, armored chance, elite chance, asteroid speed, size bias, split bias, hazard frequency (wells, mines, wormholes).
  - Enforce caps for readability/perf: simultaneous asteroids, hazards, particles.

- **Spawning System**:
  - Track `gauntletTier` (int) and `gauntletHeat` (float). Heat rises with time/kills and decays slowly.
  - Wave budget B = f(tier, heat). Spend B on units chosen from weighted tables per archetype.
  - Safe spawns: reuse `isSafeLocation()` and offscreen bias; keep a min distance from the player.
  - Background trickle: every 120–220 frames spawn 1–2 small/medium normals with low probability, scaled by D.

- **Wave Archetypes** (weighted rotation, all scaled by D):
  - Normal Mix: 60% medium, 30% large, 10% armored; standard speeds; normal splits.
  - Armored Surge: high armored ratio (up to ~45% at high D); fewer units, tankier.
  - Speed Demons: small/medium only, higher velocity, lower split chance.
  - Elite Pressure: 1–3 Elite asteroids (green, +20% size, tougher, no split, on‑death shock damaging player only), with small escorts.
  - Belt Pulse: dense crossing band; lower HP per rock; combo-friendly.
  - Hazard Blend: mines (pushback only) and gravity wells with a standard mix; bullets curve subtly.
  - Wormhole Chaos: one or two wormhole pairs; recycled paths create emergent routes.
  - Mini-Boss Cameo (optional): a simplified mini-threat (e.g., micro-dreadship) that clears on defeat and drops a power-up.

- **Upgrade Intervals**:
  - Trigger: every 1500 score or every 90 seconds (debounced to once per window).
  - Sample picks: Armor +1 (cap 6) | Engine +20% | Bullet range +25% | Power-up drop +25% | Charged shot size +25% | Bullet damage +15% | Fire rate +10% | Magnet pickup +30% | Combo window +10% | Rainbow duration +20%.
  - Flow: enter existing `upgrade` state, pause spawns/updates, on selection resume and `gauntletTier++`.

- **Scoring & Hi-Score**:
  - Keep existing scoring. Add `asteraidHiScoreGauntlet` for this mode.
  - Show "Time Survived" and "Tier Reached" on Game Over.

- **HUD & UI**:
  - Replace level label with `GAUNTLET TIER N`.
  - Optional heat bar under SCORE.
  - Upgrade overlay title: `GAUNTLET UPGRADE`.

- **Integration Notes (`ast.html`)**:
  - Add `gameMode = 'classic' | 'gauntlet'` and route spawners.
  - Init: set `gauntletTier=1`, `gauntletHeat=0`, reset cadence timers.
  - Timers: `nextWaveAtFrame`, `nextTrickleAtFrame`, `nextUpgradeAtScore`, `nextUpgradeAtTime`.
  - Spawners: `spawnGauntletWave(tier, heat)` (returns specs), `spawnTrickle()`.
  - Scaling helpers: `gauntletDifficulty(now, score)` and `applyDifficultyTo(specs, D)`.
  - Persistence: separate gauntlet hi-score key; do not overwrite classic hi-score.

- **Balancing**:
  - Early tiers: slower, readable; 1–2 minutes of onboarding.
  - Mid tiers: add armored/elite and hazards; limit hazards (≤2 wells, ≤6 mines).
  - Late tiers: ramp speed more than HP; raise elite frequency; cap counts for perf.

- **Optional Events**:
  - Score Blitz: 15s period of higher spawn intensity with bonus points.
  - Power Surge: increased power-up drops for 20s, then cooldown.

#### Wave Budget Example (pseudo)

```js
// D grows with time and score; clamp as needed
const D = base + timeMinutes * 0.6 + (score / 2000);
const baseBudget = 6 + Math.floor(D * 2);
const armoredWeight = clamp01(0.1 + D * 0.06);
const eliteWeight = clamp01(0.02 + D * 0.03);

let budget = baseBudget;
while (budget > 0 && asteroids.length < MAX_FIELD_ASTEROIDS) {
  const roll = rng();
  let pick;
  if (roll < eliteWeight) pick = 'elite';
  else if (roll < eliteWeight + armoredWeight) pick = 'armored';
  else pick = rng() < 0.5 ? 'medium' : 'large';

  const spec = makeAsteroidSpec(pick, D);
  spawnAsteroidSpec(spec);
  budget -= spec.cost; // small:1, medium:2, large:3, armored:4, elite:5
}
```

#### Minimal Task List

- Add game mode flag and menu option for Gauntlet start.
- Implement timers and difficulty helpers.
- Implement `spawnGauntletWave()` + `spawnTrickle()` using existing safe spawn utilities.
- Hook upgrade interval into existing upgrade UI; add a separate hi-score key.
- Adjust HUD labels and add optional heat bar.
- Playtest and tune weights, caps, and intervals.

- **Bullet Impact Splash**
  - When bullets hit asteroids, a brief energy splash radiates from the impact point before the asteroid splits.
  - Implementation: 2-4 frame radial line burst at hit point with color matching bullet; scales with asteroid size.

---
