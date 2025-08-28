// Game constants extracted from ast.html
export const SHARD_MINION_CAP = 8;

// WebGL rendering scaffold
// Toggle to start integrating WebGL pipeline (PixiJS/regl). Enabled by default.
export const ENABLE_WEBGL = true; // if true, ast.html will initialize a WebGL overlay
// Choose backend when ENABLE_WEBGL is true: 'pixi' or 'regl'
export const WEBGL_BACKEND = 'pixi';
// Render scale for the WebGL overlay. 1.0 = native, 0.5 = half-res (performance).
// Only affects the overlay (Canvas2D gameplay remains native res).
export const WEBGL_RENDER_SCALE = 1.0;

// Post-processing (CRT-style) defaults — tunable at build time
// Scanline/CRT
export const SCANLINE_ENABLED = false;
export const SCANLINE_LINE_WIDTH = 1.0;      // thickness of scanlines (px in filter space)
export const SCANLINE_CONTRAST = 0.06;       // darkness/contrast of lines (0..1)
export const SCANLINE_VERTICAL = false;      // vertical lines instead of horizontal
export const SCANLINE_NOISE = 0.02;          // subtle noise amount (0..1)
export const SCANLINE_CURVATURE = 0.07;      // screen curvature (0..1)

// Bloom
export const BLOOM_ENABLED = true;
export const BLOOM_THRESHOLD = 0.62;         // luminance threshold for bloom
export const BLOOM_SCALE = 0.9;              // intensity/scale of bloom
export const BLOOM_BRIGHTNESS = 1.0;         // post bloom brightness multiplier

// Lens distortion (barrel/curvature overall)
export const LENS_ENABLED = true;
export const LENS_STRENGTH = 0.06;           // ~0..0.3 reasonable
export const LENS_RADIUS = 0.85;             // fraction of min(width,height)/2 (0..1)

// Vignette
export const VIGNETTE_ENABLED = true;
export const VIGNETTE_SIZE = 0.35;           // radius factor (0..1)
export const VIGNETTE_DARKNESS = 0.35;       // intensity (0..1)

// Gravity well tuning (Level 5)
export const GRAVITY_WELL_COUNT = 3;
export const GRAVITY_RADIUS = 220;
export const GRAVITY_STRENGTH = 1400;
export const GRAVITY_SOFTENING = 1500;

// Minefield tuning (Level 6)
export const MINE_COUNT = 7;
export const MINE_RADIUS = 18;
export const MINE_DRIFT_SPEED = 0.7;
export const MINE_TRIGGER_RADIUS = 95; // proximity fuse
export const MINE_SHOCKWAVE_RADIUS = 240; // push radius
export const MINE_PUSH_STRENGTH = 9.0; // impulse strength
export const MINE_BOUNCE_RESTITUTION = 0.9;

// Wormholes (Level 7)
export const WORMHOLE_COUNT = 2;
// Reduced by ~20% (from 28) to shrink the maximum possible size
export const WORMHOLE_RADIUS = 22;
export const WORMHOLE_COOLDOWN = 30; // frames of re-entry immunity after warp

// Combo constants
export const COMBO_WINDOW_FRAMES = 90; // 1.5s @60fps
export const COMBO_START_BONUS = 0.30;
export const COMBO_INCREMENT = 0.05;
export const COMBO_MAX = 0.50;

// Normal asteroid cap
// Reduce the previous implicit max (~8 during fresh spawns) by 40% -> 5
export const NORMAL_ASTEROID_CAP = 5;

// Spatial grid broad-phase (CPU optimization)
// Toggle to enable broad-phase collision pruning using a uniform grid
export const ENABLE_SPATIAL_GRID = true;
// Cell size in pixels; ~radius scale of common objects (64 works well for asteroid radii)
export const GRID_CELL_SIZE = 64;

// Optional performance stats/logging
// Toggle to log frame pacing (EMA FPS and last frame dt) at a fixed interval
export const ENABLE_PERF_STATS = false;
// Log interval in frames when ENABLE_PERF_STATS is true
export const PERF_LOG_INTERVAL_FRAMES = 120;

// Sprite caching (Canvas2D CPU optimization)
// Toggle to enable pre-rendered sprites for bullets, particle dots, and powerup icons
export const ENABLE_SPRITE_CACHE = true;

// Tether-pair asteroid hazard (Level 14)
export const TETHER_PAIR_COUNT = 2;           // how many pairs active on Level 14
export const TETHER_NODE_RADIUS = 30;         // medium-sized nodes
export const TETHER_PULSE_SPEED = 0.08;       // neon pulse speed
export const TETHER_LINE_BASE_WIDTH = 2.6;    // base line width
export const TETHER_SPEED_AFTER_BREAK = 0.6;  // multiply node speed after tether breaks
export const TETHER_POINTS_ON_BREAK = 40;    // award points when breaking a tether
export const TETHER_RESPAWN_FRAMES = 540;     // ~9s @60fps before pair respawns
