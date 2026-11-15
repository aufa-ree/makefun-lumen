// The screenshot scenes behind ?shot=start|play|levelup|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (aim at the nearest shadow, sweep the beam, kite away from the closest one,
// chase the nearest shard), so the frame is what a short game really looks like and the
// same seed always gives the same frame. The end scene stands still and never fires,
// so the shadows catch the keeper, as a hurried player is caught.
import { FIELD, STEP } from './config.js';
import { EVENT_LEVELUP, EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 45;
const LEVELUP_LIMIT_SECONDS = 120;
const END_LIMIT_SECONDS = 180;

/** The autopilot's steering: toward the nearest shard, away from a shadow too close. */
function autopilot(state) {
  const player = state.player;
  let nearestEnemy = null;
  let nearestEnemyDist = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (dist < nearestEnemyDist) {
      nearestEnemyDist = dist;
      nearestEnemy = enemy;
    }
  }
  let nearestShard = null;
  let nearestShardDist = Infinity;
  for (const shard of state.shards) {
    if (!shard.active) continue;
    const dist = Math.hypot(shard.x - player.x, shard.y - player.y);
    if (dist < nearestShardDist) {
      nearestShardDist = dist;
      nearestShard = shard;
    }
  }
  const aim = nearestEnemy ? Math.atan2(nearestEnemy.y - player.y, nearestEnemy.x - player.x) : player.aim;
  let move = { x: 0, y: 0 };
  if (nearestEnemy && nearestEnemyDist < 130) {
    // Kite: run from the closest shadow.
    const dx = player.x - nearestEnemy.x;
    const dy = player.y - nearestEnemy.y;
    const length = Math.hypot(dx, dy) || 1;
    move = { x: dx / length, y: dy / length };
  } else if (nearestShard) {
    const dx = nearestShard.x - player.x;
    const dy = nearestShard.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    move = { x: dx / length, y: dy / length };
  } else {
    // Drift back toward the middle of the field.
    const dx = FIELD.width / 2 - player.x;
    const dy = FIELD.height / 2 - player.y;
    const length = Math.hypot(dx, dy) || 1;
    if (length > 60) move = { x: dx / length, y: dy / length };
  }
  // Keep inside the field.
  if (player.x < 60) move.x = Math.max(0, move.x);
  if (player.x > FIELD.width - 60) move.x = Math.min(0, move.x);
  if (player.y < 60) move.y = Math.max(0, move.y);
  if (player.y > FIELD.height - 60) move.y = Math.min(0, move.y);
  const firing = nearestEnemy !== null && nearestEnemyDist < 340;
  return { move, aim, firing };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. A level-up pauses the autopilot's run at the choice screen.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'levelup' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0 }, -Math.PI / 2, false, false);
    }
    return { screen: SCREEN_TITLE, best: { wave: 0, score: 0 } };
  }
  if (name === 'end') {
    // The keeper fights well for a while, then stands still and never fires again,
    // so the shadows catch them — a real game over, with a score to show for it.
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const fighting = index < 25 / STEP;
      const pilot = fighting ? autopilot(world.state) : { move: { x: 0, y: 0 }, aim: -Math.PI / 2, firing: false };
      const events = world.step(STEP, pilot.move, pilot.aim, pilot.firing, false);
      world.state.beamOn = pilot.firing;
      if (events & EVENT_LEVELUP) world.applyUpgrade(world.state.choices[0].id);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: { wave: world.state.wave, score: world.state.score } };
  }
  const limit = name === 'levelup' ? LEVELUP_LIMIT_SECONDS : PLAY_SECONDS;
  for (let index = 0; index < limit / STEP; index += 1) {
    const pilot = autopilot(world.state);
    const events = world.step(STEP, pilot.move, pilot.aim, pilot.firing, false);
    world.state.beamOn = pilot.firing;
    // The play scene ends mid-combat in wave 2 or later: the beam on, a shadow
    // close enough to burn, and more than one kind of shadow on the field.
    if (name === 'play' && world.state.wave >= 2 && pilot.firing && index > 8 / STEP) {
      let close = false;
      for (const enemy of world.state.enemies) {
        if (!enemy.active) continue;
        if (Math.hypot(enemy.x - world.state.player.x, enemy.y - world.state.player.y) < 220) close = true;
      }
      if (close) break;
    }
    if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: { wave: world.state.wave, score: world.state.score } };
    if (events & EVENT_WIN) return { screen: SCREEN_PLAY, best: { wave: world.state.wave, score: world.state.score } };
    if (events & EVENT_LEVELUP) {
      if (name === 'levelup') return { screen: SCREEN_LEVELUP, best: { wave: world.state.wave, score: world.state.score } };
      world.applyUpgrade(world.state.choices[0].id);
    }
  }
  return { screen: SCREEN_PLAY, best: { wave: world.state.wave, score: world.state.score } };
}
