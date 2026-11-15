// The game's rules and state, with no drawing and no browser in it: the keeper, the
// lantern beam, the shadows that hunt it, the shards they drop, the waves, the level-up
// choices and the win at dawn. step() advances one fixed step and returns what happened
// as bit flags, so the caller can react without the world knowing about screens or
// sound. Nothing here allocates after createWorld returns.
import { BEAM, ENEMY, FIELD, PLAYER, POOL_SIZE, PULSE, SHARD, UPGRADES, WIN_WAVE, wavePlan, xpForLevel } from './config.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_WAVE = 8;
export const EVENT_OVER = 16;
export const EVENT_WIN = 32;
export const EVENT_PULSE = 64;

const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  return diff;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    radius: PLAYER.radius,
    health: PLAYER.maxHealth,
    maxHealth: PLAYER.maxHealth,
    speed: PLAYER.speed,
    aim: -Math.PI / 2,
    hurtLeft: 0,
    beamDamage: BEAM.damage,
    beamRange: BEAM.range,
    beamHalfAngle: BEAM.halfAngle,
    beamWidth: BEAM.width,
    pickupRadius: PLAYER.pickupRadius,
    shardValue: SHARD.value,
    twin: false,
    twinAngle: 0,
    pulseOwned: false,
    pulseLeft: 0,
  };
  const enemies = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    enemies.push({ active: false, kind: 'shade', x: 0, y: 0, health: 0, maxHealth: 0, speed: 0, damage: 0, radius: 0, shards: 0, score: 0, flash: 0, boss: false, spawnLeft: 0 });
  }
  const shards = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    shards.push({ active: false, x: 0, y: 0, value: 1 });
  }
  const particles = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#ffffff', size: 3 });
  }
  const state = {
    player,
    enemies,
    shards,
    particles,
    wave: 1,
    score: 0,
    kills: 0,
    xp: 0,
    level: 1,
    shardsCollected: 0,
    elapsed: 0,
    spawnQueue: [],
    spawnTimer: 0,
    betweenLeft: 0,
    waveActive: false,
    choices: [],
    boss: null,
  };

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.health = PLAYER.maxHealth;
    player.maxHealth = PLAYER.maxHealth;
    player.speed = PLAYER.speed;
    player.aim = -Math.PI / 2;
    player.hurtLeft = 0;
    player.beamDamage = BEAM.damage;
    player.beamRange = BEAM.range;
    player.beamHalfAngle = BEAM.halfAngle;
    player.beamWidth = BEAM.width;
    player.pickupRadius = PLAYER.pickupRadius;
    player.shardValue = SHARD.value;
    player.twin = false;
    player.twinAngle = 0;
    player.pulseOwned = false;
    player.pulseLeft = 0;
    for (const enemy of enemies) enemy.active = false;
    for (const shard of shards) shard.active = false;
    for (const particle of particles) particle.active = false;
    state.wave = 1;
    state.score = 0;
    state.kills = 0;
    state.xp = 0;
    state.level = 1;
    state.shardsCollected = 0;
    state.elapsed = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.betweenLeft = 0;
    state.waveActive = false;
    state.choices = [];
    state.boss = null;
    startWave();
  }

  function freeEnemy() {
    for (let index = 0; index < enemies.length; index += 1) if (!enemies[index].active) return enemies[index];
    return null;
  }

  function freeShard() {
    for (let index = 0; index < shards.length; index += 1) if (!shards[index].active) return shards[index];
    return null;
  }

  function freeParticle() {
    for (let index = 0; index < particles.length; index += 1) if (!particles[index].active) return particles[index];
    return null;
  }

  function burst(x, y, color, count, speed) {
    for (let index = 0; index < count; index += 1) {
      const particle = freeParticle();
      if (!particle) return;
      const angle = random() * TAU;
      const velocity = speed * (0.4 + random() * 0.6);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = 0.35 + random() * 0.35;
      particle.life = particle.maxLife;
      particle.color = color;
      particle.size = 2 + random() * 3;
    }
  }

  function spawnEdge() {
    const edge = Math.floor(random() * 4);
    const margin = 30;
    if (edge === 0) return { x: random() * FIELD.width, y: -margin };
    if (edge === 1) return { x: FIELD.width + margin, y: random() * FIELD.height };
    if (edge === 2) return { x: random() * FIELD.width, y: FIELD.height + margin };
    return { x: -margin, y: random() * FIELD.height };
  }

  function spawnEnemy(kind) {
    const enemy = freeEnemy();
    if (!enemy) return null;
    const def = ENEMY[kind];
    const at = spawnEdge();
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = at.x;
    enemy.y = at.y;
    enemy.maxHealth = def.health;
    enemy.health = def.health;
    enemy.speed = def.speed;
    enemy.damage = def.damage;
    enemy.radius = def.radius;
    enemy.shards = def.shards;
    enemy.score = def.score;
    enemy.flash = 0;
    enemy.boss = kind === 'boss';
    enemy.spawnLeft = 0;
    if (kind === 'boss') state.boss = enemy;
    return enemy;
  }

  function startWave() {
    const plan = wavePlan(state.wave);
    const queue = [];
    for (let index = 0; index < plan.shades; index += 1) queue.push('shade');
    for (let index = 0; index < plan.wisps; index += 1) queue.push('wisp');
    for (let index = 0; index < plan.brutes; index += 1) queue.push('brute');
    for (let index = 0; index < plan.elites; index += 1) queue.push('elite');
    for (let index = 0; index < plan.boss; index += 1) queue.push('boss');
    // Shuffle the queue so the wave does not arrive in kind order.
    for (let index = queue.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      const temp = queue[index];
      queue[index] = queue[other];
      queue[other] = temp;
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0.5;
    state.waveActive = true;
  }

  function dropShards(enemy) {
    for (let index = 0; index < enemy.shards; index += 1) {
      const shard = freeShard();
      if (!shard) return;
      shard.active = true;
      shard.x = enemy.x + (random() * 2 - 1) * 18;
      shard.y = enemy.y + (random() * 2 - 1) * 18;
      shard.value = player.shardValue;
    }
  }

  function killEnemy(enemy) {
    enemy.active = false;
    state.kills += 1;
    state.score += enemy.score;
    burst(enemy.x, enemy.y, ENEMY[enemy.kind].color, enemy.boss ? 26 : 10, 160);
    dropShards(enemy);
    if (enemy.boss) state.boss = null;
  }

  function beamHits(enemy, angle, halfAngle) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > player.beamRange + enemy.radius) return false;
    const targetAngle = Math.atan2(dy, dx);
    return Math.abs(angleDiff(targetAngle, angle)) < halfAngle + Math.atan2(enemy.radius, Math.max(1, dist));
  }

  function damageEnemy(enemy, amount) {
    enemy.health -= amount;
    enemy.flash = 0.09;
    if (enemy.health <= 0) {
      killEnemy(enemy);
      return true;
    }
    return false;
  }

  function rollChoices() {
    const pool = UPGRADES.slice();
    const choices = [];
    for (let index = 0; index < 3 && pool.length > 0; index += 1) {
      const pick = Math.floor(random() * pool.length);
      choices.push(pool[pick]);
      pool.splice(pick, 1);
    }
    return choices;
  }

  function applyUpgrade(id) {
    if (id === 'wide') player.beamHalfAngle *= 1.35;
    else if (id === 'strong') player.beamDamage *= 1.35;
    else if (id === 'swift') player.speed *= 1.15;
    else if (id === 'cloak') {
      player.maxHealth += 25;
      player.health = Math.min(player.maxHealth, player.health + 25);
    } else if (id === 'magnet') player.pickupRadius *= 2;
    else if (id === 'pulse') {
      player.pulseOwned = true;
      player.pulseLeft = 0;
    } else if (id === 'twin') player.twin = true;
    else if (id === 'oil') player.shardValue = 2;
    state.choices = [];
  }

  function aliveCount() {
    let count = 0;
    for (const enemy of enemies) if (enemy.active) count += 1;
    return count;
  }

  /**
   * One fixed step. `move` is a unit vector (or zero), `aim` is the beam angle in
   * radians, `firing` is whether the beam is on, `pulse` is a one-shot pulse press.
   * Returns the event flags for this step.
   */
  function step(dt, move, aim, firing, pulse) {
    let events = 0;
    state.elapsed += dt;
    player.aim = aim;
    if (player.hurtLeft > 0) player.hurtLeft = Math.max(0, player.hurtLeft - dt);
    if (player.pulseLeft > 0) player.pulseLeft = Math.max(0, player.pulseLeft - dt);

    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + move.x * player.speed * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + move.y * player.speed * dt));

    // The twin beam sweeps the dark behind the keeper.
    if (player.twin) player.twinAngle += dt * 1.6;

    // The lantern pulse: a burst that wounds every shadow nearby.
    if (pulse && player.pulseOwned && player.pulseLeft === 0) {
      player.pulseLeft = PULSE.cooldown;
      events |= EVENT_PULSE;
      burst(player.x, player.y, '#ffd27a', 30, 320);
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < PULSE.radius + enemy.radius) {
          if (damageEnemy(enemy, PULSE.damage)) events |= EVENT_KILL;
        }
      }
    }

    // Spawning: the wave's queue feeds the field from the edges.
    if (state.waveActive && state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const plan = wavePlan(state.wave);
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = plan.interval;
      }
    }

    // The beam: while it is on, everything inside its cone burns.
    if (firing) {
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        if (beamHits(enemy, player.aim, player.beamHalfAngle)) {
          if (damageEnemy(enemy, player.beamDamage * dt)) events |= EVENT_KILL;
        }
        if (player.twin && beamHits(enemy, player.twinAngle, player.beamHalfAngle * 0.8)) {
          if (damageEnemy(enemy, player.beamDamage * 0.6 * dt)) events |= EVENT_KILL;
        }
      }
    }

    // Enemies walk at the keeper, and the boss calls more shadows.
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (enemy.flash > 0) enemy.flash = Math.max(0, enemy.flash - dt);
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      enemy.x += (dx / dist) * enemy.speed * dt;
      enemy.y += (dy / dist) * enemy.speed * dt;
      if (enemy.boss) {
        enemy.spawnLeft -= dt;
        if (enemy.spawnLeft <= 0) {
          enemy.spawnLeft = 6;
          for (let index = 0; index < 2; index += 1) {
            const shade = spawnEnemy('shade');
            if (shade) {
              shade.x = enemy.x + (random() * 2 - 1) * 60;
              shade.y = enemy.y + (random() * 2 - 1) * 60;
            }
          }
        }
      }
      // Touch damage, throttled so a crowd does not end the run in one frame.
      if (dist < enemy.radius + player.radius && player.hurtLeft === 0) {
        player.health -= enemy.damage;
        player.hurtLeft = PLAYER.contactCooldown;
        events |= EVENT_HIT;
        burst(player.x, player.y, '#ff5a3c', 8, 120);
        if (player.health <= 0) {
          player.health = 0;
          events |= EVENT_OVER;
          return events;
        }
      }
    }

    // Keep the shadows from standing inside each other.
    for (let a = 0; a < enemies.length; a += 1) {
      const first = enemies[a];
      if (!first.active) continue;
      for (let b = a + 1; b < enemies.length; b += 1) {
        const second = enemies[b];
        if (!second.active) continue;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const dist = Math.hypot(dx, dy);
        const min = first.radius + second.radius;
        if (dist > 0 && dist < min) {
          const push = (min - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          first.x -= nx * push;
          first.y -= ny * push;
          second.x += nx * push;
          second.y += ny * push;
        }
      }
    }

    // Shards fly to the keeper when close, and level the keeper up when enough gather.
    for (const shard of shards) {
      if (!shard.active) continue;
      const dx = player.x - shard.x;
      const dy = player.y - shard.y;
      const dist = Math.hypot(dx, dy);
      if (dist < player.pickupRadius && dist > 0) {
        const speed = SHARD.magnetSpeed;
        shard.x += (dx / dist) * speed * dt;
        shard.y += (dy / dist) * speed * dt;
      }
      if (dist < player.radius + SHARD.radius) {
        shard.active = false;
        state.xp += shard.value;
        state.shardsCollected += 1;
        state.score += 2;
        if (state.xp >= xpForLevel(state.level)) {
          state.xp -= xpForLevel(state.level);
          state.level += 1;
          state.choices = rollChoices();
          events |= EVENT_LEVELUP;
        }
      }
    }

    // Particles drift and fade.
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
    }

    // The wave ends when its queue is spent and the field is clear.
    if (state.waveActive && state.spawnQueue.length === 0 && aliveCount() === 0) {
      state.waveActive = false;
      state.score += 50 * state.wave;
      events |= EVENT_WAVE;
      if (state.wave >= WIN_WAVE) {
        events |= EVENT_WIN;
        return events;
      }
      state.betweenLeft = 2;
    }
    if (!state.waveActive && !(events & EVENT_WIN) && !(events & EVENT_OVER)) {
      state.betweenLeft -= dt;
      if (state.betweenLeft <= 0) {
        state.wave += 1;
        startWave();
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, applyUpgrade, aliveCount };
}
