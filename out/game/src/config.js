// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Lumen is a night arena: a dark blue field, one warm lantern, and the shadows that crawl
// out of the dark to put it out.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Survive this many waves and the dawn breaks: the run is won. */
export const WIN_WAVE = 10;

export const PLAYER = {
  radius: 16,
  speed: 260,
  maxHealth: 100,
  contactCooldown: 0.6,
  pickupRadius: 70,
};

export const BEAM = {
  damage: 42,
  range: 320,
  halfAngle: 0.26,
  width: 10,
};

export const PULSE = {
  damage: 50,
  radius: 190,
  cooldown: 9,
};

/** Enemy kinds: hit points, speed, touch damage, radius, shards dropped, score. */
export const ENEMY = {
  shade: { health: 30, speed: 56, damage: 8, radius: 15, shards: 1, score: 10, color: '#8a7fd6' },
  wisp: { health: 16, speed: 118, damage: 6, radius: 11, shards: 1, score: 15, color: '#c65df0' },
  brute: { health: 130, speed: 33, damage: 16, radius: 24, shards: 4, score: 30, color: '#e5534b' },
  elite: { health: 220, speed: 46, damage: 14, radius: 20, shards: 8, score: 60, color: '#f2c94c' },
  boss: { health: 950, speed: 27, damage: 24, radius: 40, shards: 20, score: 300, color: '#ff5a3c' },
};

/** What each wave brings: how many of each kind, and how fast they arrive. */
export function wavePlan(wave) {
  const shades = 6 + wave * 3;
  const wisps = wave >= 2 ? 2 + wave : 0;
  const brutes = wave >= 3 ? Math.floor(wave / 2) : 0;
  const elites = wave >= 4 ? Math.floor((wave - 2) / 2) : 0;
  const boss = wave === 5 || wave === WIN_WAVE ? 1 : 0;
  return {
    shades,
    wisps,
    brutes,
    elites,
    boss,
    interval: Math.max(0.45, 1.15 - wave * 0.07),
  };
}

export const SHARD = { radius: 7, value: 1, magnetSpeed: 420 };

/** Experience for the next level: level 1 needs 8 shards, then 5 more each level. */
export function xpForLevel(level) {
  return 8 + (level - 1) * 5;
}

/** Level-up choices: id, name, one line of copy, and what it changes. */
export const UPGRADES = [
  { id: 'wide', name: 'Wide Beam', copy: 'The lantern beam spreads 35% wider.' },
  { id: 'strong', name: 'Bright Beam', copy: 'The beam burns 35% harder.' },
  { id: 'swift', name: 'Swift Boots', copy: 'You move 15% faster.' },
  { id: 'cloak', name: 'Thick Cloak', copy: '+25 max health, and heal 25 now.' },
  { id: 'magnet', name: 'Shard Magnet', copy: 'Light shards fly to you from twice as far.' },
  { id: 'pulse', name: 'Lantern Pulse', copy: 'A burst of light that wounds every shadow nearby. Press E.' },
  { id: 'twin', name: 'Twin Beam', copy: 'A second beam sweeps the dark behind you.' },
  { id: 'oil', name: 'Rich Oil', copy: 'Every light shard is worth 2 experience.' },
];

/** How many enemies, shards and particles can exist at once; the pools are allocated once. */
export const POOL_SIZE = 96;

export const PALETTE = {
  backdrop: '#070a13',
  field: '#0e1424',
  grid: '#182036',
  player: '#ffd27a',
  beam: '#ffcf6e',
  beamCore: '#fff3c4',
  shade: '#8a7fd6',
  wisp: '#c65df0',
  brute: '#e5534b',
  elite: '#f2c94c',
  boss: '#ff5a3c',
  shard: '#ffe9a8',
  panel: '#171e30',
  text: '#eef1f5',
  muted: '#93a0b8',
  danger: '#ff5a3c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best wave and score are kept between visits (this browser only). */
export const BEST_KEY = 'lumen.best';
