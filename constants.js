// Game constants extracted from ast.html
export const SHARD_MINION_CAP = 8;

// WebGL rendering scaffold
// Toggle to start integrating WebGL pipeline (PixiJS/regl). Enabled by default.
export const ENABLE_WEBGL = true; // if true, ast.html will initialize a WebGL overlay
// Choose backend when ENABLE_WEBGL is true: 'pixi' or 'regl'
export const WEBGL_BACKEND = 'pixi';

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
