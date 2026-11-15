// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The night is drawn as a warm pool of light around the keeper, the beam as a
// bright cone, and the shadows as dark shapes with eyes. Flat shapes and canvas text for
// the HUD and the panels. Text that holds a number is rebuilt only when the number
// changes, so a frame allocates nothing.
import { ENEMY, FIELD, FONT, PALETTE, SHARD, WIN_WAVE, xpForLevel } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const CARD = { width: 340, height: 150, gap: 24 };
const TAU = Math.PI * 2;

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
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
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

  /** Convert a window pixel into field coordinates, for mouse aiming and clicks. */
  function toField(clientX, clientY) {
    return { x: (clientX - view.x) / view.scale, y: (clientY - view.y) / view.scale };
  }

  function drawField(state) {
    const player = state.player;
    context.fillStyle = PALETTE.field;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // A faint grid, so the dark reads as a place and not a void.
    context.fillStyle = PALETTE.grid;
    for (let x = 40; x < FIELD.width; x += 80) {
      for (let y = 40; y < FIELD.height; y += 80) {
        context.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // Enemies: dark shapes with eyes, flashing white when the beam bites them.
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      const def = ENEMY[enemy.kind];
      const color = enemy.flash > 0 ? '#ffffff' : def.color;
      circle(enemy.x, enemy.y, enemy.radius, color);
      if (enemy.kind === 'elite') {
        context.strokeStyle = PALETTE.elite;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius + 4, 0, TAU);
        context.stroke();
      }
      if (enemy.kind === 'boss') {
        context.strokeStyle = PALETTE.boss;
        context.lineWidth = 4;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.radius + 6, 0, TAU);
        context.stroke();
        // The boss carries its own health bar.
        const width = 90;
        context.fillStyle = '#00000088';
        context.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 22, width, 8);
        context.fillStyle = PALETTE.boss;
        context.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 22, width * (enemy.health / enemy.maxHealth), 8);
      }
      // Eyes, always toward the keeper.
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const eyeOff = enemy.radius * 0.35;
      const eyeX = Math.cos(angle);
      const eyeY = Math.sin(angle);
      circle(enemy.x + eyeX * eyeOff - eyeY * eyeOff * 0.6, enemy.y + eyeY * eyeOff + eyeX * eyeOff * 0.6, 2.5, '#0a0e1a');
      circle(enemy.x + eyeX * eyeOff + eyeY * eyeOff * 0.6, enemy.y + eyeY * eyeOff - eyeX * eyeOff * 0.6, 2.5, '#0a0e1a');
    }

    // The keeper: a warm circle with a lantern dot and a short aim tick.
    circle(player.x, player.y, player.radius, PALETTE.player);
    circle(player.x, player.y, 6, '#fff3c4');
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.aim) * player.radius, player.y + Math.sin(player.aim) * player.radius);
    context.lineTo(player.x + Math.cos(player.aim) * (player.radius + 12), player.y + Math.sin(player.aim) * (player.radius + 12));
    context.stroke();

    // Particles: fading light motes.
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      circle(particle.x, particle.y, particle.size, particle.color);
    }
    context.globalAlpha = 1;

    // The night itself: a warm pool of light around the keeper, darkness beyond it.
    // It dims the field and the far shadows, but the shards and the beam shine through
    // it — they are light, and the dark cannot hold them.
    const light = context.createRadialGradient(player.x, player.y, 150, player.x, player.y, 520);
    light.addColorStop(0, '#070a1300');
    light.addColorStop(1, '#070a13b0');
    context.fillStyle = light;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // Shards: small warm diamonds, glowing in the dark.
    for (const shard of state.shards) {
      if (!shard.active) continue;
      context.save();
      context.translate(shard.x, shard.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.shard;
      context.fillRect(-SHARD.radius / 2, -SHARD.radius / 2, SHARD.radius, SHARD.radius);
      context.restore();
    }

    // The beam: a bright cone from the lantern, drawn additively so it glows.
    if (state.beamOn) {
      context.save();
      context.globalCompositeOperation = 'lighter';
      const gradient = context.createRadialGradient(player.x, player.y, 10, player.x, player.y, player.beamRange);
      gradient.addColorStop(0, '#ffdf8a55');
      gradient.addColorStop(1, '#ffdf8a00');
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.arc(player.x, player.y, player.beamRange, player.aim - player.beamHalfAngle, player.aim + player.beamHalfAngle);
      context.closePath();
      context.fill();
      context.restore();
      // The beam's hot core.
      context.strokeStyle = PALETTE.beamCore;
      context.lineWidth = player.beamWidth;
      context.globalAlpha = 0.9;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.aim) * player.beamRange, player.y + Math.sin(player.aim) * player.beamRange);
      context.stroke();
      context.globalAlpha = 1;
    }
    if (player.twin) {
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.strokeStyle = PALETTE.beam;
      context.lineWidth = player.beamWidth * 0.7;
      context.globalAlpha = 0.5;
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.twinAngle) * player.beamRange * 0.8, player.y + Math.sin(player.twinAngle) * player.beamRange * 0.8);
      context.stroke();
      context.restore();
      context.globalAlpha = 1;
    }
  }

  function drawHud(state) {
    const player = state.player;
    // Health bar, top left.
    context.fillStyle = '#00000088';
    context.fillRect(20, 18, 240, 20);
    context.fillStyle = player.health > 30 ? PALETTE.player : PALETTE.danger;
    context.fillRect(22, 20, 236 * (player.health / player.maxHealth), 16);
    text(`HP ${Math.ceil(player.health)} / ${player.maxHealth}`, 268, 36, 18, PALETTE.text, 'left');
    // Wave and score, top centre.
    text(waveLabel(state.wave), FIELD.width / 2 - 90, 36, 24, PALETTE.text, 'center');
    text(scoreLabel(state.score), FIELD.width / 2 + 90, 36, 24, PALETTE.text, 'center');
    // What is left of this wave, top right.
    const remaining = state.spawnQueue.length + state.enemies.reduce((count, enemy) => count + (enemy.active ? 1 : 0), 0);
    text(`Shadows ${remaining}`, FIELD.width - 20, 36, 20, PALETTE.muted, 'right');
    // Pulse cooldown, under the health bar.
    if (player.pulseOwned) {
      const ready = player.pulseLeft === 0;
      text(ready ? 'E — Lantern Pulse ready' : `Pulse ${Math.ceil(player.pulseLeft)}s`, 20, 62, 16, ready ? PALETTE.player : PALETTE.muted, 'left');
    }
    // Experience bar, bottom.
    const xpNeed = xpForLevel(state.level);
    context.fillStyle = '#00000088';
    context.fillRect(20, FIELD.height - 34, FIELD.width - 40, 14);
    context.fillStyle = PALETTE.shard;
    context.fillRect(22, FIELD.height - 32, (FIELD.width - 44) * Math.min(1, state.xp / xpNeed), 10);
    text(levelLabel(state.level), FIELD.width / 2, FIELD.height - 44, 18, PALETTE.text, 'center');
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 40, 24, PALETTE.shard, 'center');
  }

  function choiceRects() {
    const total = 3 * CARD.width + 2 * CARD.gap;
    const startX = (FIELD.width - total) / 2;
    const y = (FIELD.height - CARD.height) / 2 + 20;
    return [0, 1, 2].map((index) => ({ x: startX + index * (CARD.width + CARD.gap), y, width: CARD.width, height: CARD.height }));
  }

  function drawLevelUp(state) {
    context.fillStyle = '#070a13b8';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text(`Level ${state.level} — choose a blessing`, FIELD.width / 2, 170, 36, PALETTE.text, 'center');
    const rects = choiceRects();
    for (let index = 0; index < state.choices.length; index += 1) {
      const choice = state.choices[index];
      const rect = rects[index];
      context.fillStyle = PALETTE.panel;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.strokeStyle = PALETTE.shard;
      context.lineWidth = 2;
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      text(`${index + 1}`, rect.x + 18, rect.y + 34, 22, PALETTE.shard, 'left');
      text(choice.name, rect.x + rect.width / 2, rect.y + 62, 26, PALETTE.text, 'center');
      // The copy wraps onto two lines at the card's width.
      const words = choice.copy.split(' ');
      let line = '';
      let lineY = rect.y + 100;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > 26 && line) {
          text(line, rect.x + rect.width / 2, lineY, 18, PALETTE.muted, 'center');
          line = word;
          lineY += 24;
        } else {
          line = next;
        }
      }
      if (line) text(line, rect.x + rect.width / 2, lineY, 18, PALETTE.muted, 'center');
    }
    text('Press 1, 2 or 3 — or click a card', FIELD.width / 2, FIELD.height - 120, 22, PALETTE.shard, 'center');
  }

  const TITLE_LINES = ['The last lighthouse is dying. The shadows are coming.', 'Move with WASD or the arrow keys. Aim with the mouse.', 'Hold click or Space to sweep the lantern beam.', 'Gather light shards. Level up. Survive 10 waves to dawn.', ''];
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
      TITLE_LINES[4] = best.wave > 0 ? `${bestLabel(best.wave)} · ${bestScoreLabel(best.score)}` : 'No keeper has survived a night yet.';
      drawPanel('LUMEN', TITLE_LINES, 'Press Space or click to begin');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_LEVELUP) drawLevelUp(state);
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = `Wave ${state.wave} · ${state.kills} shadows banished`;
      OVER_LINES[2] = bestLabel(best.wave);
      drawPanel('The light goes out', OVER_LINES, 'Press Space or click to try again');
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
