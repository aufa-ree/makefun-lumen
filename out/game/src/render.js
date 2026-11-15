// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The night is a living place now: grass and stones underfoot, fireflies and fog
// drifting, a hooded keeper with a flickering lantern, and shadows with glowing eyes,
// horns and spikes. Flat shapes and canvas gradients throughout — no images, no network.
import { ENEMY, FIELD, FONT, PALETTE, SHARD, WIN_WAVE, xpForLevel } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const CARD = { width: 340, height: 176, gap: 24 };
const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const waveLabel = cachedLabel('Wave ');
  const levelLabel = cachedLabel('Level ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best wave ');
  const bestScoreLabel = cachedLabel('Best score ');
  const t0 = performance.now();
  const clock = () => (performance.now() - t0) / 1000;

  // Seeded scenery: the same field every visit, so screenshots are stable.
  const rng = mulberry32(20261116);
  const grass = [];
  for (let i = 0; i < 80; i += 1) grass.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, h: 5 + rng() * 7, lean: (rng() - 0.5) * 6 });
  const stones = [];
  for (let i = 0; i < 22; i += 1) stones.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, rx: 4 + rng() * 9, ry: 3 + rng() * 5 });
  const fireflies = [];
  for (let i = 0; i < 26; i += 1) fireflies.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, phase: rng() * TAU, speed: 0.6 + rng() * 1.2 });
  const fog = [];
  for (let i = 0; i < 5; i += 1) fog.push({ x: rng() * FIELD.width, y: rng() * FIELD.height, r: 170 + rng() * 110, phase: rng() * TAU, drift: 6 + rng() * 10 });
  const embers = [];
  for (let i = 0; i < 26; i += 1) embers.push({ x: rng() * FIELD.width, off: rng() * FIELD.height, phase: rng() * TAU, speed: 14 + rng() * 22, size: 1.5 + rng() * 2.5 });
  const beamMotes = [];
  for (let i = 0; i < 12; i += 1) beamMotes.push({ t: rng(), off: (rng() - 0.5) * 2, phase: rng() * TAU });

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function circle(x, y, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
  }

  function rr(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  /** Convert a window pixel into field coordinates, for mouse aiming and clicks. */
  function toField(clientX, clientY) {
    return { x: (clientX - view.x) / view.scale, y: (clientY - view.y) / view.scale };
  }

  function drawGround(state) {
    const ground = context.createLinearGradient(0, 0, 0, FIELD.height);
    ground.addColorStop(0, '#141d38');
    ground.addColorStop(0.55, '#101830');
    ground.addColorStop(1, '#0a0f1e');
    context.fillStyle = ground;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Stones.
    for (const stone of stones) {
      context.fillStyle = '#1a2540';
      context.beginPath();
      context.ellipse(stone.x, stone.y, stone.rx, stone.ry, 0, 0, TAU);
      context.fill();
      context.fillStyle = '#25345a';
      context.beginPath();
      context.ellipse(stone.x - stone.rx * 0.2, stone.y - stone.ry * 0.35, stone.rx * 0.55, stone.ry * 0.5, 0, 0, TAU);
      context.fill();
    }
    // Grass tufts, swaying almost imperceptibly.
    context.strokeStyle = '#26355e';
    context.lineWidth = 1.6;
    for (const tuft of grass) {
      const sway = Math.sin(state.elapsed * 0.7 + tuft.x * 0.05) * 1.2;
      context.beginPath();
      context.moveTo(tuft.x - 3, tuft.y);
      context.lineTo(tuft.x - 3 + tuft.lean * 0.4 + sway, tuft.y - tuft.h);
      context.moveTo(tuft.x, tuft.y);
      context.lineTo(tuft.x + sway, tuft.y - tuft.h - 2);
      context.moveTo(tuft.x + 3, tuft.y);
      context.lineTo(tuft.x + 3 - tuft.lean * 0.4 + sway, tuft.y - tuft.h);
      context.stroke();
    }
    // Drifting fog.
    for (const patch of fog) {
      const fx = patch.x + Math.sin(state.elapsed * 0.08 + patch.phase) * patch.drift;
      const fy = patch.y + Math.cos(state.elapsed * 0.06 + patch.phase) * patch.drift * 0.6;
      const g = context.createRadialGradient(fx, fy, 0, fx, fy, patch.r);
      g.addColorStop(0, '#7a86b81f');
      g.addColorStop(1, '#7a86b800');
      context.fillStyle = g;
      context.fillRect(fx - patch.r, fy - patch.r, patch.r * 2, patch.r * 2);
    }
    // Fireflies.
    for (const fly of fireflies) {
      const a = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(state.elapsed * fly.speed + fly.phase));
      const fx = fly.x + Math.sin(state.elapsed * 0.25 + fly.phase) * 10;
      const fy = fly.y + Math.cos(state.elapsed * 0.2 + fly.phase * 2) * 8;
      context.globalAlpha = a;
      circle(fx, fy, 2, '#ffe9a8');
    }
    context.globalAlpha = 1;
  }

  function spikes(x, y, radius, count, len, color, offset) {
    context.fillStyle = color;
    for (let i = 0; i < count; i += 1) {
      const a = offset + (i / count) * TAU;
      const bx = x + Math.cos(a) * radius;
      const by = y + Math.sin(a) * radius;
      const tx = x + Math.cos(a) * (radius + len);
      const ty = y + Math.sin(a) * (radius + len);
      const px = x + Math.cos(a + 0.35) * radius * 0.85;
      const py = y + Math.sin(a + 0.35) * radius * 0.85;
      context.beginPath();
      context.moveTo(bx, by);
      context.lineTo(tx, ty);
      context.lineTo(px, py);
      context.closePath();
      context.fill();
    }
  }

  function glowingEyes(x, y, angle, radius, color, size) {
    const eyeOff = radius * 0.38;
    const ex = Math.cos(angle);
    const ey = Math.sin(angle);
    const px = -ey * eyeOff * 0.62;
    const py = ex * eyeOff * 0.62;
    for (const side of [-1, 1]) {
      const cx = x + ex * eyeOff + px * side;
      const cy = y + ey * eyeOff + py * side;
      context.globalAlpha = 0.4;
      circle(cx, cy, size * 2.1, color);
      context.globalAlpha = 1;
      circle(cx, cy, size, '#fff7d6');
    }
  }

  // Dark body tints per kind, so each shadow reads as a creature, not a ring.
  const ENEMY_DARK = { shade: '#3d3470', wisp: '#6d2a80', brute: '#7a2a24', elite: '#7d6420', boss: '#7a2a1c' };

  function drawEnemy(state, enemy) {
    const def = ENEMY[enemy.kind];
    const player = state.player;
    const body = enemy.flash > 0 ? '#ffffff' : def.color;
    const dark = enemy.flash > 0 ? '#ffffff' : ENEMY_DARK[enemy.kind];
    // Ground shadow.
    context.fillStyle = '#00000055';
    context.beginPath();
    context.ellipse(enemy.x, enemy.y + enemy.radius * 0.62, enemy.radius * 0.95, enemy.radius * 0.38, 0, 0, TAU);
    context.fill();
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    if (enemy.kind === 'wisp') {
      // A wisp flickers and trails a tail away from the keeper.
      context.globalAlpha = 0.75 + 0.25 * Math.sin(state.elapsed * 9 + enemy.x * 0.1);
      context.fillStyle = body;
      context.beginPath();
      context.moveTo(enemy.x - Math.cos(angle) * enemy.radius * 1.9, enemy.y - Math.sin(angle) * enemy.radius * 1.9);
      context.lineTo(enemy.x + Math.cos(angle + 2.4) * enemy.radius * 0.7, enemy.y + Math.sin(angle + 2.4) * enemy.radius * 0.7);
      context.lineTo(enemy.x + Math.cos(angle - 2.4) * enemy.radius * 0.7, enemy.y + Math.sin(angle - 2.4) * enemy.radius * 0.7);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
    }
    if (enemy.kind === 'brute') spikes(enemy.x, enemy.y, enemy.radius * 0.92, 6, 9, dark, 0.3);
    if (enemy.kind === 'elite') {
      // A gold halo and a crown.
      context.globalAlpha = 0.3;
      circle(enemy.x, enemy.y, enemy.radius + 9, def.color);
      context.globalAlpha = 1;
      context.strokeStyle = PALETTE.elite;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(enemy.x, enemy.y, enemy.radius + 4, 0, TAU);
      context.stroke();
      spikes(enemy.x, enemy.y - enemy.radius * 0.4, enemy.radius * 0.6, 3, 10, PALETTE.elite, -Math.PI / 2);
    }
    if (enemy.kind === 'boss') {
      context.globalAlpha = 0.28;
      circle(enemy.x, enemy.y, enemy.radius + 16, def.color);
      context.globalAlpha = 1;
      spikes(enemy.x, enemy.y, enemy.radius * 0.95, 5, 12, dark, 0.5);
      // Horns.
      context.fillStyle = '#ffd9c9';
      for (const side of [-1, 1]) {
        const a = -Math.PI / 2 + side * 0.85;
        context.beginPath();
        context.moveTo(enemy.x + Math.cos(a - 0.3) * enemy.radius * 0.8, enemy.y + Math.sin(a - 0.3) * enemy.radius * 0.8);
        context.lineTo(enemy.x + Math.cos(a) * (enemy.radius + 26), enemy.y + Math.sin(a) * (enemy.radius + 26));
        context.lineTo(enemy.x + Math.cos(a + 0.3) * enemy.radius * 0.8, enemy.y + Math.sin(a + 0.3) * enemy.radius * 0.8);
        context.closePath();
        context.fill();
      }
    }
    // The body: a dark core with a coloured rim, so the shape reads in the dark.
    circle(enemy.x, enemy.y, enemy.radius, dark);
    context.strokeStyle = body;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(enemy.x, enemy.y, enemy.radius - 1.5, 0, TAU);
    context.stroke();
    circle(enemy.x, enemy.y, enemy.radius * 0.55, body);
    // Horns for the shade.
    if (enemy.kind === 'shade') spikes(enemy.x, enemy.y, enemy.radius * 0.9, 2, 8, dark, -Math.PI / 2);
    glowingEyes(enemy.x, enemy.y, angle, enemy.radius, enemy.kind === 'boss' ? '#ff8a5c' : def.color, enemy.kind === 'boss' ? 4 : 2.6);
    if (enemy.kind === 'boss') {
      const width = 120;
      const bx = enemy.x - width / 2;
      const by = enemy.y - enemy.radius - 26;
      context.fillStyle = '#000000aa';
      rr(bx - 2, by - 2, width + 4, 12, 6);
      context.fill();
      const fill = context.createLinearGradient(bx, 0, bx + width, 0);
      fill.addColorStop(0, '#ff5a3c');
      fill.addColorStop(1, '#ffb347');
      context.fillStyle = fill;
      rr(bx, by, Math.max(4, width * (enemy.health / enemy.maxHealth)), 8, 4);
      context.fill();
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    const flick = 0.9 + 0.07 * Math.sin(state.elapsed * 13) + 0.04 * Math.sin(state.elapsed * 29);
    // The warm pool of light under the keeper.
    const pool = context.createRadialGradient(player.x, player.y, 10, player.x, player.y, 120 * flick);
    pool.addColorStop(0, '#ffd27a40');
    pool.addColorStop(1, '#ffd27a00');
    context.fillStyle = pool;
    context.fillRect(player.x - 130, player.y - 130, 260, 260);
    // Ground shadow, then the hooded cloak.
    context.fillStyle = '#00000055';
    context.beginPath();
    context.ellipse(player.x, player.y + player.radius * 0.7, player.radius, player.radius * 0.4, 0, 0, TAU);
    context.fill();
    circle(player.x, player.y, player.radius, '#3d4f7d');
    context.strokeStyle = '#ffd27a';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(player.x, player.y, player.radius - 1, Math.PI * 0.15, Math.PI * 0.85);
    context.stroke();
    // The hood: a darker cap, a shadowed face, two pinpricks of light.
    circle(player.x, player.y - 3, player.radius * 0.62, '#2a3552');
    circle(player.x + Math.cos(player.aim) * 3, player.y - 3 + Math.sin(player.aim) * 3, player.radius * 0.42, '#0a0e1a');
    circle(player.x + Math.cos(player.aim) * 5 - Math.sin(player.aim) * 3, player.y - 3 + Math.sin(player.aim) * 5 + Math.cos(player.aim) * 3, 1.4, '#ffe9a8');
    circle(player.x + Math.cos(player.aim) * 5 + Math.sin(player.aim) * 3, player.y - 3 + Math.sin(player.aim) * 5 - Math.cos(player.aim) * 3, 1.4, '#ffe9a8');
    // The lantern, held toward the aim, flickering.
    const lx = player.x + Math.cos(player.aim) * (player.radius + 4);
    const ly = player.y + Math.sin(player.aim) * (player.radius + 4);
    const glow = context.createRadialGradient(lx, ly, 2, lx, ly, 42 * flick);
    glow.addColorStop(0, '#fff3c4cc');
    glow.addColorStop(0.4, '#ffd27a55');
    glow.addColorStop(1, '#ffd27a00');
    context.fillStyle = glow;
    context.fillRect(lx - 36, ly - 36, 72, 72);
    circle(lx, ly, 5, '#fff3c4');
    context.strokeStyle = '#8a6b2f';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.aim) * player.radius * 0.5, player.y + Math.sin(player.aim) * player.radius * 0.5);
    context.lineTo(lx, ly);
    context.stroke();
    // Hurt flash: a red ring when a shadow lands a hit.
    if (player.hurtLeft > 0) {
      context.globalAlpha = Math.min(0.7, player.hurtLeft * 1.4);
      context.strokeStyle = '#ff5a3c';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 6, 0, TAU);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawShards(state) {
    for (const shard of state.shards) {
      if (!shard.active) continue;
      const pulse = 1 + 0.16 * Math.sin(state.elapsed * 5 + shard.x * 0.05 + shard.y * 0.03);
      const halo = context.createRadialGradient(shard.x, shard.y, 1, shard.x, shard.y, 18 * pulse);
      halo.addColorStop(0, '#ffe9a866');
      halo.addColorStop(1, '#ffe9a800');
      context.fillStyle = halo;
      context.fillRect(shard.x - 20, shard.y - 20, 40, 40);
      context.save();
      context.translate(shard.x, shard.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.shard;
      const r = (SHARD.radius * pulse) / 2;
      context.fillRect(-r, -r, r * 2, r * 2);
      context.restore();
      // Sparkle cross.
      context.strokeStyle = '#ffffffcc';
      context.lineWidth = 1;
      const s = 4 * pulse;
      context.beginPath();
      context.moveTo(shard.x - s, shard.y);
      context.lineTo(shard.x + s, shard.y);
      context.moveTo(shard.x, shard.y - s);
      context.lineTo(shard.x, shard.y + s);
      context.stroke();
    }
  }

  function drawBeam(state) {
    const player = state.player;
    if (!state.beamOn) return;
    const flick = 0.92 + 0.05 * Math.sin(state.elapsed * 37) + 0.03 * Math.sin(state.elapsed * 61);
    const ex = player.x + Math.cos(player.aim) * player.beamRange;
    const ey = player.y + Math.sin(player.aim) * player.beamRange;
    context.save();
    context.globalCompositeOperation = 'lighter';
    // A faint cone wash stays so the damage area still reads.
    for (const layer of [{ a: 0.14, half: 1 }, { a: 0.2, half: 0.72 }]) {
      const g = context.createRadialGradient(player.x, player.y, 10, player.x, player.y, player.beamRange);
      g.addColorStop(0, `rgba(255, 223, 138, ${layer.a * flick})`);
      g.addColorStop(1, 'rgba(255, 223, 138, 0)');
      context.fillStyle = g;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.arc(player.x, player.y, player.beamRange, player.aim - player.beamHalfAngle * layer.half, player.aim + player.beamHalfAngle * layer.half);
      context.closePath();
      context.fill();
    }
    // The laser: layered strokes, hot white heart, glowing amber shell.
    const ray = [
      { w: 16, c: 'rgba(255, 150, 40, 0.22)', a: 0.55 },
      { w: 8, c: PALETTE.beam, a: 0.85 },
      { w: 3.5, c: PALETTE.beamCore, a: 1 },
      { w: 1.5, c: '#ffffff', a: 0.95 },
    ];
    for (const l of ray) {
      context.strokeStyle = l.c;
      context.lineWidth = l.w;
      context.globalAlpha = l.a * flick;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(ex, ey);
      context.stroke();
    }
    // Muzzle flare at the lantern.
    const mg = context.createRadialGradient(player.x, player.y, 0, player.x, player.y, 26);
    mg.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
    mg.addColorStop(0.4, 'rgba(255, 200, 90, 0.55)');
    mg.addColorStop(1, 'rgba(255, 200, 90, 0)');
    context.globalAlpha = flick;
    context.fillStyle = mg;
    context.beginPath();
    context.arc(player.x, player.y, 26, 0, TAU);
    context.fill();
    // Impact burst where the laser ends.
    const ig = context.createRadialGradient(ex, ey, 0, ex, ey, 30);
    ig.addColorStop(0, 'rgba(255, 255, 240, 0.9)');
    ig.addColorStop(0.35, 'rgba(255, 190, 80, 0.5)');
    ig.addColorStop(1, 'rgba(255, 190, 80, 0)');
    context.globalAlpha = 0.9 * flick;
    context.fillStyle = ig;
    context.beginPath();
    context.arc(ex, ey, 30, 0, TAU);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.globalAlpha = 0.8 * flick;
    for (let i = 0; i < 5; i += 1) {
      const a = player.aim + Math.PI + (i - 2) * 0.5 + Math.sin(state.elapsed * 23 + i) * 0.12;
      context.beginPath();
      context.moveTo(ex + Math.cos(a) * 6, ey + Math.sin(a) * 6);
      context.lineTo(ex + Math.cos(a) * 22, ey + Math.sin(a) * 22);
      context.stroke();
    }
    // Sparks racing down the laser.
    for (const mote of beamMotes) {
      const dist = ((state.elapsed * 90 + mote.t * player.beamRange) % player.beamRange) + 20;
      const a = player.aim + mote.off * player.beamHalfAngle * 0.3;
      const mx = player.x + Math.cos(a) * dist;
      const my = player.y + Math.sin(a) * dist;
      context.globalAlpha = 0.6 * (1 - dist / player.beamRange);
      circle(mx, my, 2, '#ffe9a8');
    }
    context.restore();
    context.globalAlpha = 1;
    if (player.twin) {
      const tx = player.x + Math.cos(player.twinAngle) * player.beamRange * 0.8;
      const ty = player.y + Math.sin(player.twinAngle) * player.beamRange * 0.8;
      context.save();
      context.globalCompositeOperation = 'lighter';
      for (const l of [{ w: 10, c: 'rgba(255, 150, 40, 0.2)', a: 0.5 }, { w: 4, c: PALETTE.beam, a: 0.7 }, { w: 1.5, c: '#ffffff', a: 0.8 }]) {
        context.strokeStyle = l.c;
        context.lineWidth = l.w;
        context.globalAlpha = l.a;
        context.beginPath();
        context.moveTo(player.x, player.y);
        context.lineTo(tx, ty);
        context.stroke();
      }
      context.restore();
      context.globalAlpha = 1;
    }
  }

  function drawField(state) {
    // Screen shake, from hits and the pulse.
    if (state.shake > 0.2) {
      const s = state.shake;
      context.translate((Math.random() * 2 - 1) * s * 0.5, (Math.random() * 2 - 1) * s * 0.5);
    }
    drawGround(state);
    for (const enemy of state.enemies) {
      if (enemy.active) drawEnemy(state, enemy);
    }
    drawPlayer(state);
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      circle(particle.x, particle.y, particle.size, particle.color);
    }
    context.globalAlpha = 1;
    // The night itself: a warm pool of light around the keeper, darkness beyond it.
    const player = state.player;
    const light = context.createRadialGradient(player.x, player.y, 150, player.x, player.y, 540);
    light.addColorStop(0, '#070a1300');
    light.addColorStop(1, '#070a1399');
    context.fillStyle = light;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Shards and the beam shine through the dark — they are light.
    drawShards(state);
    drawBeam(state);
    // Floating score texts.
    for (const floater of state.floaters) {
      if (!floater.active) continue;
      context.globalAlpha = Math.max(0, floater.life / floater.maxLife);
      text(floater.text, floater.x, floater.y, floater.size, floater.color, 'center', true);
    }
    context.globalAlpha = 1;
    // The pulse's shockwave ring.
    const pulseAge = state.elapsed - state.pulseAt;
    if (pulseAge >= 0 && pulseAge < 0.6) {
      context.globalAlpha = 1 - pulseAge / 0.6;
      context.strokeStyle = '#ffd27a';
      context.lineWidth = 6 * (1 - pulseAge / 0.6) + 1;
      context.beginPath();
      context.arc(player.x, player.y, 30 + pulseAge * 520, 0, TAU);
      context.stroke();
      context.globalAlpha = 1;
    }
    // The wave banner.
    const bannerAge = state.elapsed - state.waveBannerAt;
    if (state.waveActive && bannerAge >= 0 && bannerAge < 2.2) {
      const a = bannerAge < 0.3 ? bannerAge / 0.3 : 1 - (bannerAge - 0.3) / 1.9;
      context.globalAlpha = Math.max(0, a);
      text(`WAVE ${state.wave}`, FIELD.width / 2, 210 - bannerAge * 12, 64, '#ffe9a8', 'center', true);
      text(state.wave === WIN_WAVE ? 'The last night — hold the light' : 'The shadows gather', FIELD.width / 2, 248 - bannerAge * 12, 20, PALETTE.muted, 'center');
      context.globalAlpha = 1;
    }
    // Vignette: the dark closes in at the corners.
    const vig = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.95);
    vig.addColorStop(0, '#05070d00');
    vig.addColorStop(1, '#05070d66');
    context.fillStyle = vig;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawHud(state) {
    const player = state.player;
    // Health bar.
    context.fillStyle = '#00000088';
    rr(20, 16, 264, 26, 9);
    context.fill();
    context.strokeStyle = '#ffffff2a';
    context.lineWidth = 1.5;
    rr(20, 16, 264, 26, 9);
    context.stroke();
    const hpFrac = Math.max(0, player.health / player.maxHealth);
    const hpFill = context.createLinearGradient(22, 0, 282, 0);
    if (player.health > 30) {
      hpFill.addColorStop(0, '#ff9a3c');
      hpFill.addColorStop(1, '#ffd27a');
    } else {
      hpFill.addColorStop(0, '#e5382a');
      hpFill.addColorStop(1, '#ff7a5c');
    }
    context.save();
    rr(22, 18, 260, 22, 7);
    context.clip();
    context.fillStyle = hpFill;
    context.fillRect(22, 18, 260 * hpFrac, 22);
    context.restore();
    text(`HP ${Math.ceil(player.health)} / ${player.maxHealth}`, 292, 35, 17, PALETTE.text, 'left', true);
    // Wave and score, one pill top centre.
    const pill = `WAVE ${state.wave}  ·  SCORE ${state.score.toLocaleString('en-US')}`;
    context.font = `700 20px ${FONT}`;
    const pillW = context.measureText(pill).width + 36;
    context.fillStyle = '#00000088';
    rr(FIELD.width / 2 - pillW / 2, 16, pillW, 30, 15);
    context.fill();
    context.strokeStyle = '#ffd27a55';
    context.lineWidth = 1.5;
    rr(FIELD.width / 2 - pillW / 2, 16, pillW, 30, 15);
    context.stroke();
    text(pill, FIELD.width / 2, 37, 20, '#ffe9a8', 'center', true);
    // What is left of this wave, top right.
    const remaining = state.spawnQueue.length + state.enemies.reduce((count, enemy) => count + (enemy.active ? 1 : 0), 0);
    context.fillStyle = '#00000088';
    rr(FIELD.width - 190, 16, 170, 30, 15);
    context.fill();
    circle(FIELD.width - 168, 31, 4, '#8a7fd6');
    circle(FIELD.width - 158, 31, 4, '#8a7fd6');
    text(`${remaining} shadows`, FIELD.width - 34, 37, 17, PALETTE.muted, 'right', true);
    // Pulse cooldown, under the health bar.
    if (player.pulseOwned) {
      const ready = player.pulseLeft === 0;
      context.fillStyle = ready ? '#ffd27a22' : '#00000066';
      rr(20, 50, 210, 26, 13);
      context.fill();
      if (ready) {
        context.strokeStyle = '#ffd27a';
        context.lineWidth = 1.5;
        rr(20, 50, 210, 26, 13);
        context.stroke();
      }
      text(ready ? 'E — Lantern Pulse ready' : `Pulse ${Math.ceil(player.pulseLeft)}s`, 125, 68, 15, ready ? '#ffd27a' : PALETTE.muted, 'center', true);
    }
    // Experience bar, bottom.
    const xpNeed = xpForLevel(state.level);
    context.fillStyle = '#00000088';
    rr(20, FIELD.height - 32, FIELD.width - 40, 14, 7);
    context.fill();
    const xpFill = context.createLinearGradient(22, 0, FIELD.width - 22, 0);
    xpFill.addColorStop(0, '#ffe9a8');
    xpFill.addColorStop(1, '#ffb347');
    context.save();
    rr(22, FIELD.height - 30, FIELD.width - 44, 10, 5);
    context.clip();
    context.fillStyle = xpFill;
    context.fillRect(22, FIELD.height - 30, (FIELD.width - 44) * Math.min(1, state.xp / xpNeed), 10);
    context.restore();
    text(levelLabel(state.level), FIELD.width / 2, FIELD.height - 42, 18, PALETTE.text, 'center', true);
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.save();
    context.shadowColor = '#ffd27a66';
    context.shadowBlur = 24;
    const bg = context.createLinearGradient(x, y, x, y + height);
    bg.addColorStop(0, '#1c2438');
    bg.addColorStop(1, '#121828');
    context.fillStyle = bg;
    rr(x, y, PANEL.width, height, 18);
    context.fill();
    context.restore();
    context.strokeStyle = accent || '#ffd27a88';
    context.lineWidth = 2;
    rr(x, y, PANEL.width, height, 18);
    context.stroke();
    const titleGrad = context.createLinearGradient(0, y + 30, 0, y + 90);
    titleGrad.addColorStop(0, '#fff3c4');
    titleGrad.addColorStop(1, '#ffb347');
    text(title, FIELD.width / 2, y + 78, 48, titleGrad, 'center', true);
    context.strokeStyle = '#ffd27a55';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 90, y + 96);
    context.lineTo(FIELD.width / 2 + 90, y + 96);
    context.stroke();
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    context.globalAlpha = 0.65 + 0.35 * Math.sin(clock() * 3);
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.shard, 'center', true);
    context.globalAlpha = 1;
  }

  function choiceRects() {
    const total = 3 * CARD.width + 2 * CARD.gap;
    const startX = (FIELD.width - total) / 2;
    const y = (FIELD.height - CARD.height) / 2 + 20;
    return [0, 1, 2].map((index) => ({ x: startX + index * (CARD.width + CARD.gap), y, width: CARD.width, height: CARD.height }));
  }

  function drawIcon(id, x, y, r) {
    context.save();
    context.translate(x, y);
    context.strokeStyle = '#ffd27a';
    context.fillStyle = '#ffd27a';
    context.lineWidth = 3;
    context.lineCap = 'round';
    if (id === 'wide') {
      for (const a of [-0.5, 0, 0.5]) {
        context.beginPath();
        context.moveTo(0, 8);
        context.lineTo(Math.sin(a) * r, 8 - Math.cos(a) * r);
        context.stroke();
      }
      circle(0, 8, 4, '#ffd27a');
    } else if (id === 'strong') {
      context.beginPath();
      context.moveTo(0, -r);
      context.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.7, r * 0.7, 0, r * 0.8);
      context.bezierCurveTo(-r * 0.7, r * 0.7, -r * 0.9, -r * 0.2, 0, -r);
      context.fill();
    } else if (id === 'swift') {
      for (const off of [-7, 5]) {
        context.beginPath();
        context.moveTo(-r * 0.5, off - 4);
        context.lineTo(r * 0.3, off);
        context.lineTo(-r * 0.5, off + 4);
        context.stroke();
      }
    } else if (id === 'cloak') {
      context.beginPath();
      context.moveTo(0, -r);
      context.lineTo(r * 0.8, -r * 0.5);
      context.lineTo(r * 0.8, r * 0.2);
      context.quadraticCurveTo(r * 0.8, r * 0.8, 0, r);
      context.quadraticCurveTo(-r * 0.8, r * 0.8, -r * 0.8, r * 0.2);
      context.lineTo(-r * 0.8, -r * 0.5);
      context.closePath();
      context.stroke();
    } else if (id === 'magnet') {
      context.beginPath();
      context.arc(0, -2, r * 0.7, Math.PI, 0);
      context.stroke();
      context.beginPath();
      context.moveTo(-r * 0.7, -2);
      context.lineTo(-r * 0.7, r * 0.6);
      context.moveTo(r * 0.7, -2);
      context.lineTo(r * 0.7, r * 0.6);
      context.stroke();
    } else if (id === 'pulse') {
      for (const rad of [r * 0.35, r * 0.7, r]) {
        context.beginPath();
        context.arc(0, 0, rad, 0, TAU);
        context.stroke();
      }
      circle(0, 0, 4, '#ffd27a');
    } else if (id === 'twin') {
      for (const off of [-7, 7]) {
        context.beginPath();
        context.moveTo(off, r);
        context.lineTo(off, -r);
        context.stroke();
      }
    } else if (id === 'oil') {
      context.beginPath();
      context.moveTo(0, -r);
      context.bezierCurveTo(r * 0.8, -r * 0.1, r * 0.7, r * 0.6, 0, r * 0.8);
      context.bezierCurveTo(-r * 0.7, r * 0.6, -r * 0.8, -r * 0.1, 0, -r);
      context.fill();
    }
    context.restore();
  }

  function drawLevelUp(state) {
    context.fillStyle = '#070a13b8';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text(`LEVEL ${state.level} — CHOOSE A BLESSING`, FIELD.width / 2, 150, 36, '#ffe9a8', 'center', true);
    context.strokeStyle = '#ffd27a66';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 150, 168);
    context.lineTo(FIELD.width / 2 + 150, 168);
    context.stroke();
    const rects = choiceRects();
    for (let index = 0; index < state.choices.length; index += 1) {
      const choice = state.choices[index];
      const rect = rects[index];
      const shine = context.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
      shine.addColorStop(0, '#ffffff14');
      shine.addColorStop(0.35, '#ffffff00');
      shine.addColorStop(1, '#00000033');
      context.fillStyle = '#171e30';
      rr(rect.x, rect.y, rect.width, rect.height, 14);
      context.fill();
      context.fillStyle = shine;
      rr(rect.x, rect.y, rect.width, rect.height, 14);
      context.fill();
      context.strokeStyle = '#ffd27a';
      context.lineWidth = 2;
      rr(rect.x, rect.y, rect.width, rect.height, 14);
      context.stroke();
      // Key badge.
      context.fillStyle = '#ffd27a';
      circle(rect.x + 26, rect.y + 26, 14, '#ffd27a');
      text(`${index + 1}`, rect.x + 26, rect.y + 33, 18, '#171e30', 'center', true);
      // Icon in a ring.
      context.strokeStyle = '#ffd27a88';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(rect.x + rect.width / 2, rect.y + 66, 30, 0, TAU);
      context.stroke();
      drawIcon(choice.id, rect.x + rect.width / 2, rect.y + 66, 17);
      text(choice.name, rect.x + rect.width / 2, rect.y + 122, 25, PALETTE.text, 'center', true);
      const words = choice.copy.split(' ');
      let line = '';
      let lineY = rect.y + 148;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > 26 && line) {
          text(line, rect.x + rect.width / 2, lineY, 17, PALETTE.muted, 'center');
          line = word;
          lineY += 22;
        } else {
          line = next;
        }
      }
      if (line) text(line, rect.x + rect.width / 2, lineY, 17, PALETTE.muted, 'center');
    }
    context.globalAlpha = 0.65 + 0.35 * Math.sin(clock() * 3);
    text('Press 1, 2 or 3 — or click a card', FIELD.width / 2, FIELD.height - 110, 22, PALETTE.shard, 'center', true);
    context.globalAlpha = 1;
  }

  function drawTitle(state, best) {
    // A slow beam sweeps the dark behind the title.
    const sweep = state.elapsed * 0.22;
    context.save();
    context.globalCompositeOperation = 'lighter';
    const g = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 10, FIELD.width / 2, FIELD.height / 2, 520);
    g.addColorStop(0, 'rgba(255, 223, 138, 0.10)');
    g.addColorStop(1, 'rgba(255, 223, 138, 0)');
    context.fillStyle = g;
    context.beginPath();
    context.moveTo(FIELD.width / 2, FIELD.height / 2);
    context.arc(FIELD.width / 2, FIELD.height / 2, 520, sweep - 0.3, sweep + 0.3);
    context.closePath();
    context.fill();
    context.restore();
    context.fillStyle = '#070a13a8';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Rising embers, over the dimmed field.
    for (const ember of embers) {
      const y = FIELD.height + 20 - ((state.elapsed * ember.speed + ember.off) % (FIELD.height + 40));
      const x = ember.x + Math.sin(state.elapsed * 0.8 + ember.phase) * 14;
      context.globalAlpha = Math.max(0, Math.min(1, y / 260)) * 0.8;
      circle(x, y, ember.size, '#ffd27a');
    }
    context.globalAlpha = 1;
    // The title itself, glowing gold.
    context.save();
    context.shadowColor = '#ff9a3c';
    context.shadowBlur = 34;
    const titleGrad = context.createLinearGradient(0, 150, 0, 290);
    titleGrad.addColorStop(0, '#fff8dc');
    titleGrad.addColorStop(0.55, '#ffd27a');
    titleGrad.addColorStop(1, '#ff9a3c');
    try {
      context.letterSpacing = '14px';
    } catch {
      // Older engines ignore letter spacing.
    }
    text('LUMEN', FIELD.width / 2, 268, 118, titleGrad, 'center', true);
    try {
      context.letterSpacing = '0px';
    } catch {
      // Ignore.
    }
    context.restore();
    text('K E E P E R   O F   T H E   L A S T   L I G H T', FIELD.width / 2, 316, 22, '#ffd27a', 'center', true);
    context.strokeStyle = '#ffd27a66';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 170, 336);
    context.lineTo(FIELD.width / 2 + 170, 336);
    context.stroke();
    const lines = [
      'The last lighthouse is dying. The shadows are coming.',
      'Move with WASD or the arrow keys. Aim with the mouse.',
      'Hold click or Space to sweep the lantern beam.',
      'Gather light shards. Level up. Survive 10 waves to dawn.',
    ];
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, 392 + index * 32, 21, PALETTE.muted, 'center');
    }
    if (best.wave > 0) {
      text(`${bestLabel(best.wave)} · ${bestScoreLabel(best.score)}`, FIELD.width / 2, 392 + lines.length * 32 + 8, 20, PALETTE.shard, 'center', true);
    } else {
      text('No keeper has survived a night yet.', FIELD.width / 2, 392 + lines.length * 32 + 8, 20, PALETTE.shard, 'center');
    }
    context.globalAlpha = 0.6 + 0.4 * Math.sin(clock() * 3);
    text('PRESS SPACE OR CLICK TO BEGIN', FIELD.width / 2, FIELD.height - 72, 24, '#ffe9a8', 'center', true);
    context.globalAlpha = 1;
  }

  const PAUSED_LINES = ['The shadows wait for no one — except now.'];
  const OVER_LINES = ['', '', ''];
  const WIN_LINES = ['', '', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_LEVELUP) drawLevelUp(state);
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = `Wave ${state.wave} · ${state.kills} shadows banished`;
      OVER_LINES[2] = bestLabel(best.wave);
      drawPanel('The light goes out', OVER_LINES, 'Press Space or click to try again', '#ff5a3c88');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = `All ${WIN_WAVE} waves survived · ${state.kills} shadows banished`;
      WIN_LINES[2] = bestLabel(best.wave);
      drawPanel('Dawn breaks', WIN_LINES, 'Press Space or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField, choiceRects };
}
