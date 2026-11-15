// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, level up, game over
// and dawn (the win). Level-ups pause the action for a choice of three blessings.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|levelup|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_KILL, EVENT_LEVELUP, EVENT_OVER, EVENT_PULSE, EVENT_WAVE, EVENT_WIN } from './world.js';
import { ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3, ACTION_CONFIRM, ACTION_PAUSE, ACTION_PULSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas, renderer.toField);

function readBest() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BEST_KEY) ?? 'null');
    if (parsed && typeof parsed.wave === 'number' && typeof parsed.score === 'number') return parsed;
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
  return { wave: 0, score: 0 };
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(value));
  } catch {
    // Storage can be off: the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1. Hold click or Space to sweep the lantern beam.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.wave > best.wave || (world.state.wave === best.wave && world.state.score > best.score)) {
      best = { wave: world.state.wave, score: world.state.score };
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Dawn breaks. You survived all ten waves. Score ${world.state.score}.`);
    } else {
      audio.over();
      announce(`The light goes out. Wave ${world.state.wave}, score ${world.state.score}. Best wave ${best.wave}.`);
    }
  }

  function chooseUpgrade(index) {
    const choice = world.state.choices[index];
    if (!choice) return;
    world.applyUpgrade(choice.id);
    audio.levelup();
    screen = SCREEN_PLAY;
    announce(`Level ${world.state.level}. ${choice.name}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_LEVELUP) {
      if (actions & ACTION_CHOICE_1) chooseUpgrade(0);
      else if (actions & ACTION_CHOICE_2) chooseUpgrade(1);
      else if (actions & ACTION_CHOICE_3) chooseUpgrade(2);
      else if (click) {
        const rects = renderer.choiceRects();
        for (let index = 0; index < rects.length; index += 1) {
          const rect = rects[index];
          if (click.x >= rect.x && click.x <= rect.x + rect.width && click.y >= rect.y && click.y <= rect.y + rect.height) {
            chooseUpgrade(index);
            break;
          }
        }
      }
    }
    return actions;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      // The title's backdrop: shadows drift in from the dark. If they reach the keeper
      // the backdrop resets, so the title never shows a game over.
      const events = world.step(STEP, { x: 0, y: 0 }, -Math.PI / 2, false, false);
      if (events & EVENT_OVER) world.reset();
      return;
    }
    const player = world.state.player;
    const aim = Math.atan2(input.mouse.y - player.y, input.mouse.x - player.x);
    const firing = input.firing();
    const pulse = Boolean(actions & ACTION_PULSE);
    world.state.beamOn = firing;
    const events = world.step(STEP, input.direction(), aim, firing, pulse);
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_PULSE) audio.pulse();
    if (events & EVENT_WAVE) {
      audio.wave();
      announce(`Wave ${world.state.wave} cleared. Score ${world.state.score}.`);
    }
    if (events & EVENT_LEVELUP) {
      screen = SCREEN_LEVELUP;
      audio.levelup();
      announce(`Level ${world.state.level}. Choose a blessing: 1, 2 or 3.`);
    }
    if (events & EVENT_OVER) endGame(false);
    else if (events & EVENT_WIN) endGame(true);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    const firing = screen === SCREEN_PLAY && input.firing();
    audio.beam(firing);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      world.state.beamOn = false;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting shadows close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen. Press Space or click to begin.');
  requestAnimationFrame(frame);

  // A small read-only handle for play-testing: the screen, the wave, the keeper's
  // health and level, and the living shadows, so a test can watch a run play out.
  window.__lumen = {
    screen: () => screen,
    wave: () => world.state.wave,
    score: () => world.state.score,
    level: () => world.state.level,
    health: () => world.state.player.health,
    kills: () => world.state.kills,
    choices: () => world.state.choices.map((choice) => choice.id),
    enemies: () => world.state.enemies.filter((enemy) => enemy.active).length,
    shards: () => world.state.shards.filter((shard) => shard.active).length,
    playerPos: () => ({ x: Math.round(world.state.player.x), y: Math.round(world.state.player.y) }),
    enemyPos: () => world.state.enemies.filter((enemy) => enemy.active).map((enemy) => ({ x: Math.round(enemy.x), y: Math.round(enemy.y) })),
    shardPos: () => world.state.shards.filter((shard) => shard.active).map((shard) => ({ x: Math.round(shard.x), y: Math.round(shard.y) })),
  };
}

if (shot) runShot(shot);
else runGame();
